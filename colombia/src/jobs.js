const env = require("../config/env");
const { Plot, Session, User } = require("./db/models");
const { getSettings } = require("./utils/settings");
const { computeProgress, WEEK_MS } = require("./utils/target");
const { weekBounds } = require("./utils/time");
const { emitToArea } = require("./sockets");
const { getTargetDoc } = require("./utils/settings");
const bot = require("./bot/index");

const timers = [];

/* ---------------- زراعة/حصاد: فحص جاهزية المزاريع ---------------- */
async function farmTick() {
  try {
    const now = new Date();
    const ready = await Plot.find({ status: "planted", readyAt: { $lte: now } });
    for (const plot of ready) {
      plot.status = "ready";
      await plot.save();
      emitToArea("members", "farm:ready", {
        plotId: String(plot._id),
        plotName: plot.name,
        message: "ready",
      });
    }
  } catch (e) {
    console.error("[jobs/farm]", e.message);
  }
}

/* ------------- مصالحة كل 5 دقائق: رولات الجلسات النشطة ------------- */
async function reconcileTick() {
  if (!bot.isBotReady()) return;
  try {
    const sessions = await Session.find({ revoked: false }).distinct("user");
    for (const userId of sessions) {
      const user = await User.findById(userId);
      if (!user) continue;
      await bot.refreshUserRoles(user.discordId);
    }
    if (sessions.length) console.log(`[jobs] reconciled ${sessions.length} sessions`);
  } catch (e) {
    console.error("[jobs/reconcile]", e.message);
  }
}

/* ---------- أرشفة الأسابيع المنقضية للهدف الأسبوعي ---------- */
async function archiveTick() {
  try {
    const settings = await getSettings();
    const target = await getTargetDoc();
    const cur = weekBounds(env.TZ, settings.weekStartDay, settings.weekStartTime);
    const archivedStarts = new Set((target.archive || []).map((a) => +new Date(a.weekStart)));
    let dirty = false;

    for (let i = 1; i <= 26; i++) {
      const start = cur.start - i * WEEK_MS;
      const end = start + WEEK_MS;
      if (archivedStarts.has(start)) continue;
      const { progress, win, loss } = await computeProgress(start, end);
      if (progress === 0 && win === 0 && loss === 0) continue;
      target.archive.push({
        weekStart: new Date(start),
        weekEnd: new Date(end),
        target: target.targetAmount || 0,
        achieved: progress,
        archivedAt: new Date(),
      });
      dirty = true;
    }
    if (dirty) {
      target.archive.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
      await target.save();
      emitToArea("members", "target:changed", {});
    }
  } catch (e) {
    console.error("[jobs/archive]", e.message);
  }
}

/* ---------------- إقلاع كل المهام ---------------- */
function startJobs() {
  const every = (fn, ms, name) => {
    const t = setInterval(fn, ms);
    timers.push(t);
    console.log(`[jobs] ${name} every ${Math.round(ms / 1000)}s`);
  };
  every(farmTick, 30 * 1000, "farm");
  every(reconcileTick, 5 * 60 * 1000, "reconcile");
  every(archiveTick, 60 * 60 * 1000, "archive");
  farmTick();
  setTimeout(archiveTick, 5000);
  setTimeout(reconcileTick, 20000);
}

function stopJobs() {
  timers.forEach(clearInterval);
  timers.length = 0;
}

module.exports = { startJobs, stopJobs, farmTick, reconcileTick, archiveTick };
