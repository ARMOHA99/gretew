const express = require("express");
const {
  User,
  DutyLog,
  Announcement,
  Note,
  Request,
  Operation,
  TreasuryEntry,
} = require("../db/models");
const env = require("../../config/env");
const { requireMember, requireOps, requireAccess, wrap, writeLimiter } = require("../auth/middleware");
const { str, int, enumOf, dateMs } = require("../utils/validate");
const { getTargetState } = require("../utils/target");
const { getSettings } = require("../utils/settings");
const { weekBounds } = require("../utils/time");
const { audit } = require("../utils/audit");
const { emitToArea } = require("../sockets");

const router = express.Router();

function avatarUrl(user) {
  if (!user || !user.avatar) return "";
  return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png?size=128`;
}

function slimUser(u) {
  return {
    id: String(u._id),
    name: u.globalName || u.username || "",
    username: u.username || "",
    avatarUrl: avatarUrl(u),
  };
}

/* ================= GET /api/members/home ================= */
router.get(
  "/members/home",
  requireMember,
  wrap(async (req, res) => {
    const settings = await getSettings();
    const bounds = weekBounds(env.TZ, settings.weekStartDay, settings.weekStartTime);
    const [target, memberCount, dutyOpen, balanceAgg, latestOps, announcements, myDuty, myNotes] =
      await Promise.all([
        getTargetState(),
        User.countDocuments({
          discordRoles: { $in: [env.ROLE_MEMBER_ID, env.ROLE_OPS_ID, env.ROLE_ADMIN_ID].filter(Boolean) },
        }),
        DutyLog.countDocuments({ open: true }),
        TreasuryEntry.aggregate([
          {
            $group: {
              _id: "$kind",
              total: { $sum: "$amount" },
            },
          },
        ]),
        Operation.find({}).populate("type", "name").sort("-date").limit(5).lean(),
        Announcement.find({}).sort("-pinned -createdAt").limit(5).lean(),
        DutyLog.findOne({ user: req.user._id, open: true }).lean(),
        Note.countDocuments({ user: req.user._id }),
      ]);

    let income = 0;
    let expense = 0;
    for (const row of balanceAgg) {
      if (row._id === "income") income = row.total;
      if (row._id === "expense") expense = row.total;
    }

    res.json({
      stats: {
        members: memberCount,
        onDuty: dutyOpen,
        balance: income - expense,
        weekProgress: target.achieved,
        weekTarget: target.targetAmount,
        weekPct: target.pct,
        myNotes,
      },
      target: {
        targetAmount: target.targetAmount,
        achieved: target.achieved,
        pct: target.pct,
        reached: target.reached,
        weekStart: target.weekStart,
        weekEnd: target.weekEnd,
      },
      latestOps: latestOps.map((o) => ({
        id: String(o._id),
        typeName: o.typeName || (o.type && o.type.name) || "",
        date: o.date,
        result: o.result,
        amount: o.amount,
        participants: (o.participants || []).length,
      })),
      announcements: announcements.map((a) => ({
        id: String(a._id),
        title: a.title,
        body: a.body,
        pinned: a.pinned,
        author: a.authorName,
        at: a.createdAt,
      })),
      onDutyNow: !!myDuty,
      weekStart: bounds.start,
    });
  })
);

/* ================= Duty (الدوام) ================= */
router.post(
  "/duty/in",
  requireMember,
  writeLimiter,
  wrap(async (req, res) => {
    const open = await DutyLog.findOne({ user: req.user._id, open: true });
    if (open) return res.status(400).json({ error: "already_on_duty" });
    const log = await DutyLog.create({ user: req.user._id, start: new Date(), open: true });
    await User.updateOne({ _id: req.user._id }, { $inc: { dutyCount: 1 } });
    res.status(201).json({ log });
  })
);

router.post(
  "/duty/out",
  requireMember,
  writeLimiter,
  wrap(async (req, res) => {
    const open = await DutyLog.findOne({ user: req.user._id, open: true });
    if (!open) return res.status(400).json({ error: "not_on_duty" });
    open.end = new Date();
    open.durationMs = Math.max(0, open.end - open.start);
    open.open = false;
    await open.save();
    res.json({ log: open });
  })
);

router.get(
  "/duty/logs",
  requireMember,
  wrap(async (req, res) => {
    const mine = String(req.query.mine || "1") !== "0";
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50) || 50));
    const filter = mine ? { user: req.user._id } : {};
    const logs = await DutyLog.find(filter).populate("user", "username globalName avatar discordId").sort("-start").limit(limit).lean();
    res.json({ logs: logs.map((l) => ({ ...l, user: l.user ? slimUser(l.user) : null })) });
  })
);

/* ================= قائمة الأعضاء (للفلاتر وقوائم المشاركة) ================= */
router.get(
  "/members/list",
  requireMember,
  wrap(async (req, res) => {
    const ids = [env.ROLE_MEMBER_ID, env.ROLE_OPS_ID, env.ROLE_ADMIN_ID].filter(Boolean);
    const users = await User.find({ discordRoles: { $in: ids } })
      .select("username globalName avatar discordId rank")
      .populate("rank", "name level")
      .sort("globalName username")
      .limit(500)
      .lean();
    res.json({
      users: users.map((u) => ({
        id: String(u._id),
        name: u.globalName || u.username || "",
        avatarUrl: u.avatar
          ? `https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png?size=64`
          : "",
        rank: u.rank ? u.rank.name : "",
      })),
    });
  })
);

/* ================= Leaderboard ================= */
router.get(
  "/leaderboard",
  requireMember,
  wrap(async (req, res) => {
    const target = await getTargetState();
    res.json({
      leaderboard: target.leaderboard.slice(0, 50).map((row, i) => ({
        rank: i + 1,
        user: slimUser(row.user),
        amount: row.amount,
        ops: row.ops,
      })),
      targetAmount: target.targetAmount,
      achieved: target.achieved,
    });
  })
);

/* ================= Member card ================= */
router.get(
  "/card",
  requireMember,
  wrap(async (req, res) => {
    const user = await User.findById(req.user._id).populate("rank").lean();
    const settings = await getSettings();
    const bounds = weekBounds(env.TZ, settings.weekStartDay, settings.weekStartTime);
    const [dutyCount, harvests, opCount, wins] = await Promise.all([
      DutyLog.countDocuments({ user: user._id }),
      require("../db/models").HarvestLog.countDocuments({ by: user._id }),
      Operation.countDocuments({ participants: user._id }),
      Operation.countDocuments({ participants: user._id, result: "win" }),
    ]);
    res.json({
      card: {
        user: {
          ...slimUser(user),
          discordId: user.discordId,
          joinedAt: user.joinedAt,
          balance: user.balance,
        },
        rank: user.rank ? { name: user.rank.name, level: user.rank.level } : null,
        stats: {
          dutyCount,
          harvests,
          operations: opCount,
          wins,
          balance: user.balance,
        },
        weekStart: bounds.start,
      },
    });
  })
);

/* ================= Announcements ================= */
router.get(
  "/announcements",
  requireMember,
  wrap(async (req, res) => {
    const list = await Announcement.find({}).sort("-pinned -createdAt").limit(50).lean();
    res.json({ announcements: list });
  })
);

/* ================= Notes (ملاحظاتي) ================= */
router.get(
  "/notes/mine",
  requireMember,
  wrap(async (req, res) => {
    const notes = await Note.find({ user: req.user._id }).sort("-createdAt").limit(100).lean();
    res.json({ notes });
  })
);

/* ================= Requests (طلباتي) ================= */
router.post(
  "/requests",
  requireMember,
  writeLimiter,
  wrap(async (req, res) => {
    const type = enumOf(req.body.type, ["leave", "promotion", "complaint"], "type");
    const message = str(req.body.message, { min: 3, max: 1000, name: "message" });
    const doc = await Request.create({
      requester: req.user._id,
      requesterName: req.user.globalName || req.user.username,
      type,
      message,
      status: "pending",
    });
    emitToArea("admin", "notify", { type: "request", id: String(doc._id) });
    res.status(201).json({ request: doc });
  })
);

router.get(
  "/requests/mine",
  requireMember,
  wrap(async (req, res) => {
    const list = await Request.find({ requester: req.user._id }).sort("-createdAt").limit(100).lean();
    res.json({ requests: list });
  })
);

module.exports = router;
