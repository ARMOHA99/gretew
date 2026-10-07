const express = require("express");
const { Operation, OperationType, User } = require("../db/models");
const {
  requireMember,
  requireOps,
  requireAdmin,
  wrap,
  writeLimiter,
} = require("../auth/middleware");
const { str, int, id, enumOf, idArray, dateMs } = require("../utils/validate");
const { getTargetState, computeProgress } = require("../utils/target");
const { getSettings, getTargetDoc } = require("../utils/settings");
const { weekBounds } = require("../utils/time");
const { audit } = require("../utils/audit");
const { emitToArea } = require("../sockets");
const env = require("../../config/env");

const router = express.Router();

async function bumpUserStats(userId, delta) {
  await User.updateOne({ _id: userId }, { $inc: delta });
}

/* ============ GET /api/operations - قائمة مع فلاتر (للأعضاء للقراءة فقط) ============ */
router.get(
  "/operations",
  requireMember,
  wrap(async (req, res) => {
    const filter = {};
    if (req.query.from) filter.date = { ...filter.date, $gte: new Date(dateMs(req.query.from, "from")) };
    if (req.query.to) filter.date = { ...filter.date, $lte: new Date(dateMs(req.query.to, "to")) };
    if (req.query.type) filter.type = id(String(req.query.type), "type");
    if (req.query.result) filter.result = enumOf(String(req.query.result), ["win", "loss"], "result");
    if (req.query.participant) filter.participants = id(String(req.query.participant), "participant");

    const ops = await Operation.find(filter)
      .populate("type", "name")
      .populate("participants", "username globalName avatar discordId")
      .populate("createdBy", "username globalName")
      .sort("-date")
      .limit(300)
      .lean();

    res.json({
      operations: ops.map((o) => ({
        id: String(o._id),
        typeId: o.type ? String(o.type._id) : null,
        typeName: o.typeName || (o.type && o.type.name) || "",
        date: o.date,
        result: o.result,
        amount: o.amount,
        notes: o.notes,
        participants: (o.participants || []).map((p) => ({
          id: String(p._id),
          name: p.globalName || p.username,
          avatarUrl: p.avatar
            ? `https://cdn.discordapp.com/avatars/${p.discordId}/${p.avatar}.png?size=64`
            : "",
        })),
        createdBy: o.createdBy ? o.createdBy.globalName || o.createdBy.username : o.createdByName,
        canEdit: !!(req.flags.ops || req.flags.admin),
      })),
    });
  })
);

/* ============ POST /api/operations - (أوبيرويشن/أدمن فقط) ============ */
router.post(
  "/operations",
  requireOps,
  writeLimiter,
  wrap(async (req, res) => {
    const type = id(String(req.body.typeId), "type");
    const date = new Date(dateMs(req.body.date, "date"));
    const result = enumOf(req.body.result, ["win", "loss"], "result");
    const amount = int(req.body.amount, { min: 0, max: 1000000000, name: "amount" });
    const notes = str(req.body.notes || "", { required: false, max: 1000, name: "notes" });
    const participants = idArray(req.body.participants, { max: 200, name: "participants" });
    if (!participants.length) return res.status(400).json({ error: "invalid_participants" });

    const typeDoc = await OperationType.findById(type);
    if (!typeDoc) return res.status(400).json({ error: "invalid_type" });

    const op = await Operation.create({
      type: typeDoc._id,
      typeName: typeDoc.name,
      date,
      participants,
      result,
      amount,
      notes,
      createdBy: req.user._id,
      createdByName: req.user.globalName || req.user.username,
    });

    if (result === "win") {
      for (const pid of participants) await bumpUserStats(pid, { $inc: { totalOperations: 1, totalWins: 1 } });
    } else {
      for (const pid of participants) await bumpUserStats(pid, { $inc: { totalOperations: 1 } });
    }

    await audit(req.user, "operation.create", "Operation", op._id, null, {
      typeName: typeDoc.name,
      result,
      amount,
      date,
      participants: participants.length,
    });
    emitToArea("members", "operation:changed", { id: String(op._id) });
    emitToArea("members", "target:changed", {});
    res.status(201).json({ id: String(op._id) });
  })
);

/* ============ PATCH /api/operations/:id ============ */
router.patch(
  "/operations/:id",
  requireOps,
  writeLimiter,
  wrap(async (req, res) => {
    const op = await Operation.findById(id(req.params.id, "operation"));
    if (!op) return res.status(404).json({ error: "not_found" });
    const before = {
      result: op.result,
      amount: op.amount,
      date: op.date,
      participants: op.participants.length,
      typeName: op.typeName,
    };

    if (req.body.typeId !== undefined) {
      const typeDoc = await OperationType.findById(id(String(req.body.typeId), "type"));
      if (!typeDoc) return res.status(400).json({ error: "invalid_type" });
      op.type = typeDoc._id;
      op.typeName = typeDoc.name;
    }
    if (req.body.date !== undefined) op.date = new Date(dateMs(req.body.date, "date"));
    if (req.body.result !== undefined) op.result = enumOf(req.body.result, ["win", "loss"], "result");
    if (req.body.amount !== undefined) op.amount = int(req.body.amount, { min: 0, max: 1000000000, name: "amount" });
    if (req.body.notes !== undefined) op.notes = str(req.body.notes, { required: false, max: 1000, name: "notes" });
    if (req.body.participants !== undefined) {
      const parts = idArray(req.body.participants, { max: 200, name: "participants" });
      if (!parts.length) return res.status(400).json({ error: "invalid_participants" });
      op.participants = parts;
    }

    await op.save();
    await audit(req.user, "operation.update", "Operation", op._id, before, {
      result: op.result,
      amount: op.amount,
      date: op.date,
      participants: op.participants.length,
      typeName: op.typeName,
    });
    emitToArea("members", "operation:changed", { id: String(op._id) });
    emitToArea("members", "target:changed", {});
    res.json({ ok: true });
  })
);

/* ============ DELETE /api/operations/:id ============ */
router.delete(
  "/operations/:id",
  requireOps,
  writeLimiter,
  wrap(async (req, res) => {
    const op = await Operation.findById(id(req.params.id, "operation"));
    if (!op) return res.status(404).json({ error: "not_found" });
    const before = {
      typeName: op.typeName,
      result: op.result,
      amount: op.amount,
      date: op.date,
      participants: op.participants.length,
    };
    await op.deleteOne();
    await audit(req.user, "operation.delete", "Operation", req.params.id, before, null);
    emitToArea("members", "operation:changed", { id: req.params.id });
    emitToArea("members", "target:changed", {});
    res.json({ ok: true });
  })
);

/* ============ GET /api/operation-types ============ */
router.get(
  "/operation-types",
  requireMember,
  wrap(async (req, res) => {
    const filter = req.flags.ops || req.flags.admin ? {} : { active: true };
    const types = await OperationType.find(filter).sort("order name").lean();
    res.json({ types });
  })
);

/* ============ GET /api/target - الهدف الأسبوعي ============ */
router.get(
  "/target",
  requireMember,
  wrap(async (req, res) => {
    const state = await getTargetState();
    res.json({
      target: {
        targetAmount: state.targetAmount,
        achieved: state.achieved,
        win: state.win,
        loss: state.loss,
        pct: state.pct,
        reached: state.reached,
        weekStart: state.weekStart,
        weekEnd: state.weekEnd,
        leaderboard: state.leaderboard.slice(0, 30).map((row, i) => ({
          rank: i + 1,
          user: {
            id: String(row.user._id),
            name: row.user.globalName || row.user.username,
            avatarUrl: row.user.avatar
              ? `https://cdn.discordapp.com/avatars/${row.user.discordId}/${row.user.avatar}.png?size=64`
              : "",
          },
          amount: row.amount,
          ops: row.ops,
        })),
      },
    });
  })
);

/* ============ GET /api/target/history ============ */
router.get(
  "/target/history",
  requireMember,
  wrap(async (req, res) => {
    const doc = await getTargetDoc();
    res.json({
      archive: (doc.archive || [])
        .slice()
        .reverse()
        .map((a) => ({
          weekStart: a.weekStart,
          weekEnd: a.weekEnd,
          target: a.target,
          achieved: a.achieved,
          pct: a.target > 0 ? Math.min(100, Math.round((a.achieved / a.target) * 100)) : 0,
        })),
    });
  })
);

/* ============ PATCH /api/target - ضبط الهدف (أدمن) ============ */
router.patch(
  "/target",
  requireAdmin,
  writeLimiter,
  wrap(async (req, res) => {
    const amount = int(req.body.targetAmount, { min: 0, max: 1000000000, name: "targetAmount" });
    const doc = await getTargetDoc();
    const before = { targetAmount: doc.targetAmount };
    doc.targetAmount = amount;
    doc.updatedBy = req.user._id;
    doc.updatedAt = new Date();
    await doc.save();
    await audit(req.user, "target.set", "WeeklyTarget", doc._id, before, { targetAmount: amount });
    emitToArea("members", "target:changed", {});
    res.json({ ok: true, targetAmount: amount });
  })
);

/* ============ GET /api/target/preview - حساب حي (للتجربة) ============ */
router.get(
  "/target/preview",
  requireOps,
  wrap(async (req, res) => {
    const settings = await getSettings();
    const bounds = weekBounds(env.TZ, settings.weekStartDay, settings.weekStartTime);
    const progress = await computeProgress(bounds.start, bounds.end);
    res.json({ progress });
  })
);

module.exports = router;
