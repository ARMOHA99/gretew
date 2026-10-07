const express = require("express");
const { Note, User } = require("../db/models");
const { requireMember, requireOps, requireAdmin, wrap, writeLimiter } = require("../auth/middleware");
const { str, int, id, enumOf } = require("../utils/validate");
const { audit } = require("../utils/audit");
const { emitToUser } = require("../sockets");

const router = express.Router();

/* ============ POST /api/notes - إضافة ملاحظة/تحذير/غرامة (أوبيرويشن/أدمن) ============ */
router.post(
  "/",
  requireOps,
  writeLimiter,
  wrap(async (req, res) => {
    const userId = id(String(req.body.userId), "user");
    const type = enumOf(req.body.type, ["note", "warning", "fine"], "type");
    const content = str(req.body.content, { min: 2, max: 1000, name: "content" });
    const amount = type === "fine" ? int(req.body.amount || 0, { min: 0, max: 1000000000, name: "amount", required: false }) || 0 : 0;
    const deduct = type === "fine" && amount > 0 && req.body.deduct === true;

    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ error: "not_found" });

    const doc = await Note.create({
      user: userId,
      type,
      content,
      amount,
      deducted: deduct,
      author: req.user._id,
      authorName: req.user.globalName || req.user.username,
    });

    if (deduct) await User.updateOne({ _id: userId }, { $inc: { balance: -amount } });

    await audit(req.user, "note.create", "Note", doc._id, null, {
      type,
      content,
      amount,
      deducted: deduct,
      target: target.globalName || target.username,
    });
    emitToUser(userId, "notify", { type: "note", noteType: type });
    res.status(201).json({ id: String(doc._id) });
  })
);

/* ============ GET /api/notes - لمحة (أدمن يرى الجميع، أوبيرويشن لعضو محدد) ============ */
router.get(
  "/",
  requireOps,
  wrap(async (req, res) => {
    const filter = {};
    if (req.query.user) filter.user = id(String(req.query.user), "user");
    else if (!req.flags.admin) return res.status(403).json({ error: "forbidden" });
    const notes = await Note.find(filter)
      .populate("user", "username globalName avatar discordId")
      .populate("author", "username globalName")
      .sort("-createdAt")
      .limit(300)
      .lean();
    res.json({ notes });
  })
);

/* ============ DELETE /api/notes/:id (أدمن) ============ */
router.delete(
  "/:id",
  requireAdmin,
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await Note.findById(id(req.params.id, "note"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    const before = { type: doc.type, content: doc.content, amount: doc.amount, deducted: doc.deducted };
    if (doc.deducted && doc.amount > 0) {
      await User.updateOne({ _id: doc.user }, { $inc: { balance: doc.amount } });
    }
    await doc.deleteOne();
    await audit(req.user, "note.delete", "Note", req.params.id, before, { restored: doc.deducted });
    res.json({ ok: true });
  })
);

/* ============ GET /api/notes/unread-count (للأعضاء) ============ */
router.get(
  "/unread-count",
  requireMember,
  wrap(async (req, res) => {
    const count = await Note.countDocuments({ user: req.user._id });
    res.json({ count });
  })
);

module.exports = router;
