const express = require("express");
const { Category, Product, Order, InventoryItem } = require("../db/models");
const { requireShop, requireAccess, wrap, writeLimiter } = require("../auth/middleware");
const { str, int, id, enumOf, idArray } = require("../utils/validate");
const { emitToUser, emitToArea } = require("../sockets");
const { audit } = require("../utils/audit");

const router = express.Router();

/* GET /api/shop/categories */
router.get(
  "/categories",
  requireAccess,
  wrap(async (req, res) => {
    const cats = await Category.find({ active: true }).sort("order name").lean();
    res.json({ categories: cats });
  })
);

/* GET /api/shop/products?category= */
router.get(
  "/products",
  requireAccess,
  wrap(async (req, res) => {
    const filter = { active: true };
    if (req.query.category) {
      filter.category = id(String(req.query.category), "category");
    }
    const products = await Product.find(filter).populate("category", "name").sort("sort name").lean();
    res.json({ products });
  })
);

/* POST /api/shop/orders - طلب شراء (يتطلب رول المتجر) */
router.post(
  "/orders",
  writeLimiter,
  requireShop,
  wrap(async (req, res) => {
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!rawItems.length) return res.status(400).json({ error: "empty_cart" });
    const ingameId = str(req.body.ingameId, { min: 2, max: 64, name: "ingame_id" });
    const notes = str(req.body.notes || "", { required: false, max: 500, name: "notes" });

    const wanted = new Map();
    for (const it of rawItems) {
      const pid = id(String(it && it.productId), "product");
      const qty = int(it && it.qty, { min: 1, max: 99, name: "qty" });
      wanted.set(pid, (wanted.get(pid) || 0) + qty);
    }

    // خصم المخزون ذرياً (لا يمكن الطلب فوق المتوفر) + ثمن الأسعار من قاعدة البيانات
    const reserved = [];
    let total = 0;
    const items = [];
    try {
      for (const [pid, qty] of wanted) {
        const updated = await Product.findOneAndUpdate(
          { _id: pid, active: true, stock: { $gte: qty } },
          { $inc: { stock: -qty, soldCount: qty } },
          { new: true }
        );
        if (!updated) {
          const p = await Product.findById(pid).lean();
          const err = new Error(p ? "out_of_stock" : "invalid_product");
          err.status = 400;
          err.code = p ? "out_of_stock" : "invalid_product";
          throw err;
        }
        reserved.push({ pid, qty });
        total += updated.price * qty;
        items.push({
          product: updated._id,
          name: updated.name,
          price: updated.price,
          qty,
        });
      }

      const order = await Order.create({
        user: req.user._id,
        items,
        total,
        ingameId,
        notes,
        status: "new",
        statusHistory: [{ status: "new", at: new Date(), by: "customer" }],
      });

      for (const r of reserved) {
        const p = items.find((x) => String(x.product) === String(r.pid));
        await InventoryItem.create({
          product: r.pid,
          delta: -r.qty,
          reason: "sale",
          balanceAfter: null,
          note: `order ${String(order._id)}`,
          by: req.user._id,
          byName: req.user.globalName || req.user.username,
        });
        void p;
      }

      emitToUser(req.user._id, "order:changed", { orderId: String(order._id) });
      emitToArea("ops", "admin:notify", { type: "order", orderId: String(order._id) });
      res.status(201).json({ order });
    } catch (e) {
      // تراجع عن الخصومات التي تمت قبل الخطأ
      for (const r of reserved) {
        await Product.updateOne({ _id: r.pid }, { $inc: { stock: r.qty, soldCount: -r.qty } });
      }
      throw e;
    }
  })
);

/* GET /api/shop/orders - طلباتي */
router.get(
  "/orders",
  requireShop,
  wrap(async (req, res) => {
    const orders = await Order.find({ user: req.user._id }).sort("-createdAt").limit(100).lean();
    res.json({ orders });
  })
);

/* GET /api/shop/orders/:id */
router.get(
  "/orders/:id",
  requireShop,
  wrap(async (req, res) => {
    const order = await Order.findById(id(req.params.id, "order")).lean();
    if (!order) return res.status(404).json({ error: "not_found" });
    if (String(order.user) !== String(req.user._id) && !req.flags.admin)
      return res.status(403).json({ error: "forbidden" });
    res.json({ order });
  })
);

/* POST /api/shop/orders/:id/cancel - إلغاء طلب جديد فقط + إرجاع المخزون */
router.post(
  "/orders/:id/cancel",
  writeLimiter,
  requireShop,
  wrap(async (req, res) => {
    const order = await Order.findById(id(req.params.id, "order"));
    if (!order) return res.status(404).json({ error: "not_found" });
    if (String(order.user) !== String(req.user._id) && !req.flags.admin)
      return res.status(403).json({ error: "forbidden" });
    if (order.status !== "new") return res.status(400).json({ error: "cannot_cancel" });

    for (const it of order.items) {
      await Product.updateOne({ _id: it.product }, { $inc: { stock: it.qty, soldCount: -it.qty } });
      await InventoryItem.create({
        product: it.product,
        delta: it.qty,
        reason: "cancel",
        note: `cancel order ${String(order._id)}`,
        by: req.user._id,
        byName: req.user.globalName || req.user.username,
      });
    }
    order.status = "cancelled";
    order.statusHistory.push({ status: "cancelled", at: new Date(), by: "customer" });
    await order.save();
    await audit(req.user, "order.cancel", "Order", order._id, { status: "new" }, { status: "cancelled" });
    emitToUser(req.user._id, "order:changed", { orderId: String(order._id) });
    res.json({ order });
  })
);

module.exports = router;
