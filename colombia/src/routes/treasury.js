const express = require("express");
const { TreasuryEntry } = require("../db/models");
const { requireMember, requireOps, requireAdmin, wrap, writeLimiter } = require("../auth/middleware");
const { str, int, enumOf, id, dateMs } = require("../utils/validate");
const site = require("../../config/site");
const { audit } = require("../utils/audit");
const { emitToArea } = require("../sockets");

const router = express.Router();

/* ============ GET /api/treasury - القيود + الرصيد + سلسلة 14 يوماً ============ */
router.get(
  "/",
  requireMember,
  wrap(async (req, res) => {
    const filter = {};
    if (req.query.from) filter.date = { ...filter.date, $gte: new Date(dateMs(req.query.from, "from")) };
    if (req.query.to) filter.date = { ...filter.date, $lte: new Date(dateMs(req.query.to, "to")) };
    if (req.query.kind) filter.kind = enumOf(String(req.query.kind), ["income", "expense"], "kind");

    const [entries, agg] = await Promise.all([
      TreasuryEntry.find(filter).populate("author", "username globalName").sort("-date").limit(300).lean(),
      TreasuryEntry.aggregate([{ $group: { _id: "$kind", total: { $sum: "$amount" } } }]),
    ]);

    let income = 0;
    let expense = 0;
    for (const row of agg) {
      if (row._id === "income") income = row.total;
      if (row._id === "expense") expense = row.total;
    }

    // سلسلة يومية لآخر 14 يوماً (رسم بياني مخصص SVG)
    const days = [];
    const dayMs = 24 * 60 * 60 * 1000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const seriesEntries = await TreasuryEntry.find({
      date: { $gte: new Date(today.getTime() - 13 * dayMs) },
    }).lean();
    for (let i = 13; i >= 0; i--) {
      const d0 = today.getTime() - i * dayMs;
      const d1 = d0 + dayMs;
      let inc = 0;
      let exp = 0;
      for (const e of seriesEntries) {
        const t = +new Date(e.date);
        if (t >= d0 && t < d1) {
          if (e.kind === "income") inc += e.amount;
          else exp += e.amount;
        }
      }
      days.push({ date: d0, income: inc, expense: exp });
    }

    res.json({
      entries: entries.map((e) => ({
        id: String(e._id),
        kind: e.kind,
        category: e.category,
        amount: e.amount,
        note: e.note,
        author: e.author ? e.author.globalName || e.author.username : e.authorName,
        date: e.date,
      })),
      balance: income - expense,
      income,
      expense,
      series: days,
      categories: site.treasuryCategories,
    });
  })
);

/* ============ POST /api/treasury - إضافة قيد (أوبيرويشن/أدمن) ============ */
router.post(
  "/",
  requireOps,
  writeLimiter,
  wrap(async (req, res) => {
    const kind = enumOf(req.body.kind, ["income", "expense"], "kind");
    const amount = int(req.body.amount, { min: 1, max: 1000000000, name: "amount" });
    const category = str(req.body.category, { min: 1, max: 60, name: "category" });
    const note = str(req.body.note || "", { required: false, max: 500, name: "note" });
    const date = req.body.date ? new Date(dateMs(req.body.date, "date")) : new Date();

    const doc = await TreasuryEntry.create({
      kind,
      category,
      amount,
      note,
      date,
      author: req.user._id,
      authorName: req.user.globalName || req.user.username,
    });
    await audit(req.user, "treasury.create", "TreasuryEntry", doc._id, null, {
      kind,
      category,
      amount,
    });
    emitToArea("members", "treasury:changed", {});
    res.status(201).json({ id: String(doc._id) });
  })
);

/* ============ DELETE /api/treasury/:id (أدمن) ============ */
router.delete(
  "/:id",
  requireAdmin,
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await TreasuryEntry.findById(id(req.params.id, "entry"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    const before = { kind: doc.kind, category: doc.category, amount: doc.amount };
    await doc.deleteOne();
    await audit(req.user, "treasury.delete", "TreasuryEntry", req.params.id, before, null);
    emitToArea("members", "treasury:changed", {});
    res.json({ ok: true });
  })
);

module.exports = router;
