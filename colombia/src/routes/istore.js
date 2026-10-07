const express = require("express");
const { InternalShopItem, Purchase, User } = require("../db/models");
const { requireMember, wrap, writeLimiter } = require("../auth/middleware");
const { id, int } = require("../utils/validate");
const { audit } = require("../utils/audit");
const { emitToUser } = require("../sockets");

const router = express.Router();

/* ============ GET /api/istore/items ============ */
router.get(
  "/items",
  requireMember,
  wrap(async (req, res) => {
    const items = await InternalShopItem.find({ active: true }).sort("sort name").lean();
    res.json({
      items,
      balance: req.user.balance,
    });
  })
);

/* ============ GET /api/istore/purchases - مشترياتي ============ */
router.get(
  "/purchases",
  requireMember,
  wrap(async (req, res) => {
    const purchases = await Purchase.find({ user: req.user._id }).sort("-createdAt").limit(100).lean();
    res.json({ purchases });
  })
);

/* ============ POST /api/istore/purchase - شراء من رصيدي ============ */
router.post(
  "/purchase",
  requireMember,
  writeLimiter,
  wrap(async (req, res) => {
    const itemId = id(String(req.body.itemId), "item");
    const qty = int(req.body.qty, { min: 1, max: 50, name: "qty", required: false }) || 1;

    const item = await InternalShopItem.findOne({ _id: itemId, active: true });
    if (!item) return res.status(404).json({ error: "not_found" });
    const total = item.price * qty;
    if (total <= 0) return res.status(400).json({ error: "invalid_price" });

    // خصم الرصيد ذرياً (يفشل إذا لم يكفِ الرصيد)
    const user = await User.findOneAndUpdate(
      { _id: req.user._id, balance: { $gte: total } },
      { $inc: { balance: -total } },
      { new: true }
    );
    if (!user) return res.status(400).json({ error: "insufficient_balance" });

    // المخزون (-1 = غير محدود)
    if (item.stock >= 0) {
      const updated = await InternalShopItem.findOneAndUpdate(
        { _id: item._id, stock: { $gte: qty } },
        { $inc: { stock: -qty } },
        { new: true }
      );
      if (!updated) {
        await User.updateOne({ _id: user._id }, { $inc: { balance: total } });
        return res.status(400).json({ error: "out_of_stock" });
      }
    }

    const purchase = await Purchase.create({
      user: req.user._id,
      item: item._id,
      name: item.name,
      qty,
      total,
    });
    await audit(req.user, "istore.purchase", "Purchase", purchase._id, null, {
      name: item.name,
      qty,
      total,
      balanceAfter: user.balance,
    });
    emitToUser(req.user._id, "notify", { type: "purchase", total, balance: user.balance });
    res.status(201).json({ purchase, balance: user.balance });
  })
);

module.exports = router;
