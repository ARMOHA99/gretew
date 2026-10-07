const express = require("express");
const { Plot, HarvestLog, InventoryItem, Product, User } = require("../db/models");
const { requireMember, requireAdmin, wrap, writeLimiter } = require("../auth/middleware");
const { str, int, id } = require("../utils/validate");
const { getSettings } = require("../utils/settings");
const { audit } = require("../utils/audit");
const { emitToArea } = require("../sockets");

const router = express.Router();

function slim(u) {
  if (!u) return null;
  return {
    id: String(u._id),
    name: u.globalName || u.username || "",
    avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png?size=64` : "",
  };
}

function isAssignedOrAdmin(plot, req) {
  if (req.flags.admin) return true;
  const a = plot.assignedTo;
  const aid = a && a._id ? String(a._id) : a ? String(a) : "";
  return !!aid && aid === String(req.user._id);
}

/* ================= GET /api/farm ================= */
router.get(
  "/",
  requireMember,
  wrap(async (req, res) => {
    const settings = await getSettings();
    const [plots, recentHarvests] = await Promise.all([
      Plot.find({})
        .populate("assignedTo", "username globalName avatar discordId")
        .populate("product", "name price image")
        .sort("name")
        .lean(),
      HarvestLog.find({}).sort("-at").limit(15).lean(),
    ]);
    const now = Date.now();
    res.json({
      plots: plots.map((p) => ({
        id: String(p._id),
        name: p.name,
        location: p.location,
        status: p.status,
        assignedTo: slim(p.assignedTo),
        product: p.product ? { id: String(p.product._id), name: p.product.name } : null,
        plantedAt: p.plantedAt,
        readyAt: p.readyAt,
        growMinutes: p.growMinutes,
        isMine: !!(p.assignedTo && String(p.assignedTo._id || p.assignedTo) === String(req.user._id)),
        canPlant:
          p.status === "empty" && isAssignedOrAdmin({ assignedTo: p.assignedTo }, req),
        canHarvest: p.status === "ready" && isAssignedOrAdmin({ assignedTo: p.assignedTo }, req),
        remainingMs: p.status === "planted" && p.readyAt ? Math.max(0, +p.readyAt - now) : 0,
      })),
      recentHarvests: recentHarvests.map((h) => ({
        id: String(h._id),
        plotName: h.plotName,
        by: h.byName,
        qty: h.qty,
        at: h.at,
      })),
      settings: {
        growMinutes: settings.growMinutes,
        countHarvestInTarget: settings.countHarvestInTarget,
      },
      isAdmin: !!req.flags.admin,
    });
  })
);

/* ================= POST /api/farm/:id/plant ================= */
router.post(
  "/:id/plant",
  requireMember,
  writeLimiter,
  wrap(async (req, res) => {
    const plot = await Plot.findById(id(req.params.id, "plot"));
    if (!plot) return res.status(404).json({ error: "not_found" });
    if (plot.status !== "empty") return res.status(400).json({ error: "plot_not_empty" });
    if (!isAssignedOrAdmin(plot, req)) return res.status(403).json({ error: "forbidden" });

    const settings = await getSettings();
    const grow = plot.growMinutes || settings.growMinutes;
    plot.status = "planted";
    plot.plantedAt = new Date();
    plot.readyAt = new Date(Date.now() + grow * 60 * 1000);
    plot.growMinutes = grow;
    await plot.save();
    await audit(req.user, "farm.plant", "Plot", plot._id, { status: "empty" }, { status: "planted", readyAt: plot.readyAt });
    emitToArea("members", "farm:changed", { plotId: String(plot._id) });
    res.json({ ok: true, readyAt: plot.readyAt });
  })
);

/* ================= POST /api/farm/:id/harvest ================= */
router.post(
  "/:id/harvest",
  requireMember,
  writeLimiter,
  wrap(async (req, res) => {
    const plot = await Plot.findById(id(req.params.id, "plot"));
    if (!plot) return res.status(404).json({ error: "not_found" });
    if (plot.status !== "ready") return res.status(400).json({ error: "plot_not_ready" });
    if (!isAssignedOrAdmin(plot, req)) return res.status(403).json({ error: "forbidden" });
    const qty = int(req.body.qty, { min: 1, max: 100000, name: "qty", required: false }) || 1;

    // زيادة المخزون المرتبط بالمنتج
    let newStock = null;
    if (plot.product) {
      const updated = await Product.findOneAndUpdate(
        { _id: plot.product },
        { $inc: { stock: qty } },
        { new: true }
      );
      newStock = updated ? updated.stock : null;
      await InventoryItem.create({
        product: plot.product,
        delta: qty,
        reason: "harvest",
        balanceAfter: newStock,
        note: plot.name,
        by: req.user._id,
        byName: req.user.globalName || req.user.username,
      });
    }

    await HarvestLog.create({
      plot: plot._id,
      plotName: plot.name,
      by: req.user._id,
      byName: req.user.globalName || req.user.username,
      qty,
      at: new Date(),
    });

    const before = { status: plot.status, totalHarvests: plot.totalHarvests };
    plot.status = "empty";
    plot.plantedAt = null;
    plot.readyAt = null;
    plot.lastHarvestAt = new Date();
    plot.totalHarvests = (plot.totalHarvests || 0) + 1;
    await plot.save();

    await User.updateOne({ _id: req.user._id }, { $inc: { totalHarvests: qty } });
    await audit(req.user, "farm.harvest", "Plot", plot._id, before, {
      status: "empty",
      qty,
      totalHarvests: plot.totalHarvests,
    });

    const settings = await getSettings();
    emitToArea("members", "farm:changed", { plotId: String(plot._id) });
    if (settings.countHarvestInTarget) emitToArea("members", "target:changed", {});
    res.json({ ok: true, qty, newStock });
  })
);

/* ================= POST /api/farm - إنشاء مزرعة (أدمن) ================= */
router.post(
  "/",
  requireAdmin,
  writeLimiter,
  wrap(async (req, res) => {
    const name = str(req.body.name, { min: 2, max: 80, name: "name" });
    const location = str(req.body.location || "", { required: false, max: 120, name: "location" });
    let product = null;
    if (req.body.productId) product = id(String(req.body.productId), "product");
    let assignedTo = null;
    if (req.body.assignedTo) assignedTo = id(String(req.body.assignedTo), "assignedTo");
    const growMinutes = int(req.body.growMinutes, { min: 1, max: 10080, name: "growMinutes", required: false });

    const plot = await Plot.create({
      name,
      location,
      product,
      assignedTo,
      growMinutes: growMinutes || undefined,
      status: "empty",
    });
    await audit(req.user, "farm.plot.create", "Plot", plot._id, null, { name, location });
    emitToArea("members", "farm:changed", { plotId: String(plot._id) });
    res.status(201).json({ id: String(plot._id) });
  })
);

/* ================= PATCH /api/farm/:id - تعديل (أدمن) ================= */
router.patch(
  "/:id",
  requireAdmin,
  writeLimiter,
  wrap(async (req, res) => {
    const plot = await Plot.findById(id(req.params.id, "plot"));
    if (!plot) return res.status(404).json({ error: "not_found" });
    const before = {
      name: plot.name,
      location: plot.location,
      assignedTo: plot.assignedTo ? String(plot.assignedTo) : null,
      status: plot.status,
    };
    if (req.body.name !== undefined) plot.name = str(req.body.name, { min: 2, max: 80, name: "name" });
    if (req.body.location !== undefined)
      plot.location = str(req.body.location, { required: false, max: 120, name: "location" });
    if (req.body.assignedTo !== undefined)
      plot.assignedTo = req.body.assignedTo ? id(String(req.body.assignedTo), "assignedTo") : null;
    if (req.body.productId !== undefined)
      plot.product = req.body.productId ? id(String(req.body.productId), "product") : null;
    if (req.body.growMinutes !== undefined)
      plot.growMinutes = int(req.body.growMinutes, { min: 1, max: 10080, name: "growMinutes" });
    if (req.body.reset === true) {
      plot.status = "empty";
      plot.plantedAt = null;
      plot.readyAt = null;
    }
    await plot.save();
    await audit(req.user, "farm.plot.update", "Plot", plot._id, before, {
      name: plot.name,
      location: plot.location,
      assignedTo: plot.assignedTo ? String(plot.assignedTo) : null,
      status: plot.status,
    });
    emitToArea("members", "farm:changed", { plotId: String(plot._id) });
    res.json({ ok: true });
  })
);

/* ================= DELETE /api/farm/:id ================= */
router.delete(
  "/:id",
  requireAdmin,
  writeLimiter,
  wrap(async (req, res) => {
    const plot = await Plot.findById(id(req.params.id, "plot"));
    if (!plot) return res.status(404).json({ error: "not_found" });
    const before = { name: plot.name, status: plot.status };
    await plot.deleteOne();
    await audit(req.user, "farm.plot.delete", "Plot", req.params.id, before, null);
    emitToArea("members", "farm:changed", { plotId: req.params.id });
    res.json({ ok: true });
  })
);

module.exports = router;
