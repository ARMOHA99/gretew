const { Operation, HarvestLog } = require("../db/models");
const { getSettings, getTargetDoc } = require("./settings");
const { weekBounds } = require("./time");
const env = require("../../config/env");

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** مجموع تقدّم الأسبوع الحالي من العمليات (فوز يُضاف، خسارة تُطرح) — لا ينزل تحت صفر */
async function computeProgress(start, end) {
  const settings = await getSettings();
  const agg = await Operation.aggregate([
    { $match: { date: { $gte: new Date(start), $lt: new Date(end) } } },
    { $group: { _id: "$result", total: { $sum: "$amount" } } },
  ]);
  let win = 0;
  let loss = 0;
  for (const row of agg) {
    if (row._id === "win") win = row.total;
    if (row._id === "loss") loss = row.total;
  }
  let extra = 0;
  let harvestQty = 0;
  if (settings.countHarvestInTarget) {
    const h = await HarvestLog.aggregate([
      { $match: { at: { $gte: new Date(start), $lt: new Date(end) } } },
      { $group: { _id: null, total: { $sum: "$qty" } } },
    ]);
    harvestQty = h.length ? h[0].total : 0;
    extra = harvestQty * (settings.harvestUnitValue || 0);
  }
  const progress = Math.max(0, win - loss + extra);
  return { win, loss, extra, harvestQty, progress };
}

/** لوحة المساهمين: توزيع متساوٍ لقيمة كل عملية فوز على المشاركين */
async function computeLeaderboard(start, end) {
  const ops = await Operation.find({
    result: "win",
    date: { $gte: new Date(start), $lt: new Date(end) },
  }).populate("participants", "username globalName avatar discordId");
  const map = new Map();
  for (const op of ops) {
    const parts = op.participants || [];
    if (!parts.length) continue;
    const share = Math.floor(op.amount / parts.length);
    for (const p of parts) {
      if (!p) continue;
      const key = String(p._id);
      const cur = map.get(key) || { user: p, amount: 0, ops: 0 };
      cur.amount += share;
      cur.ops += 1;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** حالة الهدف الأسبوعي كاملة (تُحسب ديناميكياً - لا يوجد عداد مخزّن قد ينحرف) */
async function getTargetState() {
  const [settings, targetDoc] = await Promise.all([getSettings(), getTargetDoc()]);
  const bounds = weekBounds(env.TZ, settings.weekStartDay, settings.weekStartTime);
  const [progressData, leaderboard] = await Promise.all([
    computeProgress(bounds.start, bounds.end),
    computeLeaderboard(bounds.start, bounds.end),
  ]);
  const targetAmount = targetDoc.targetAmount || 0;
  const pct = targetAmount > 0 ? Math.min(100, Math.round((progressData.progress / targetAmount) * 100)) : 0;
  return {
    targetAmount,
    achieved: progressData.progress,
    win: progressData.win,
    loss: progressData.loss,
    extra: progressData.extra,
    pct,
    reached: targetAmount > 0 && progressData.progress >= targetAmount,
    weekStart: new Date(bounds.start),
    weekEnd: new Date(bounds.end),
    leaderboard,
    archive: (targetDoc.archive || []).slice().reverse(),
  };
}

module.exports = { computeProgress, computeLeaderboard, getTargetState, WEEK_MS };
