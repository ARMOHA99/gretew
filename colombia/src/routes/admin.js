const path = require("path");
const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const env = require("../../config/env");
const {
  User,
  Rank,
  Category,
  Product,
  Order,
  InternalShopItem,
  Announcement,
  OperationType,
  AuditLog,
  Settings,
  Request,
} = require("../db/models");
const { requireAdmin, wrap, writeLimiter } = require("../auth/middleware");
const { str, int, id, enumOf, bool, dateMs } = require("../utils/validate");
const { audit } = require("../utils/audit");
const { getSettings, invalidateSettings } = require("../utils/settings");
const { revokeUserSessions } = require("../auth/session");
const { emitToUser, emitToArea } = require("../sockets");
const { flagsFromRoles } = require("../utils/roles");

const router = express.Router();
router.use(requireAdmin);

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.mimetype);
    cb(ok ? null : new Error("invalid_file_type"), ok);
  },
});

function slimUser(u) {
  return {
    id: String(u._id),
    discordId: u.discordId,
    name: u.globalName || u.username || "",
    username: u.username || "",
    avatarUrl: u.avatar ? `https://cdn.discordapp.com/avatars/${u.discordId}/${u.avatar}.png?size=64` : "",
    rank: u.rank && u.rank._id ? { id: String(u.rank._id), name: u.rank.name, level: u.rank.level } : null,
    balance: u.balance,
    flags: flagsFromRoles(u.discordRoles),
    inGuild: !!u.inGuild,
    lastLogin: u.lastLogin,
    joinedAt: u.joinedAt,
    dutyCount: u.dutyCount,
    totalOperations: u.totalOperations,
    totalHarvests: u.totalHarvests,
  };
}

/* ============================ نظرة عامة ============================ */
router.get(
  "/overview",
  wrap(async (req, res) => {
    const [users, orders, pendingReqs, products, notes, plots] = await Promise.all([
      User.countDocuments({}),
      Order.countDocuments({ status: "new" }),
      Request.countDocuments({ status: "pending" }),
      Product.countDocuments({ active: true }),
      require("../db/models").Note.countDocuments({}),
      require("../db/models").Plot.countDocuments({}),
    ]);
    res.json({ stats: { users, newOrders: orders, pendingRequests: pendingReqs, products, notes, plots } });
  })
);

/* ============================ الأعضاء ============================ */
router.get(
  "/users",
  wrap(async (req, res) => {
    const filter = {};
    if (req.query.q) {
      const q = String(req.query.q).slice(0, 64);
      filter.$or = [{ username: { $regex: q, $options: "i" } }, { globalName: { $regex: q, $options: "i" } }, { discordId: q }];
    }
    const users = await User.find(filter).populate("rank").sort("-lastLogin").limit(200).lean();
    const ranks = await Rank.find({}).sort("-level").lean();
    res.json({ users: users.map(slimUser), ranks });
  })
);

router.patch(
  "/users/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const action = enumOf(
      req.body.action,
      ["setRank", "adjustBalance", "setBalance", "kick"],
      "action"
    );
    const user = await User.findById(id(req.params.id, "user")).populate("rank");
    if (!user) return res.status(404).json({ error: "not_found" });
    const before = {
      rank: user.rank && user.rank._id ? user.rank.name : null,
      balance: user.balance,
    };

    if (action === "setRank") {
      const rankId = req.body.rankId ? id(String(req.body.rankId), "rank") : null;
      if (rankId) {
        const rank = await Rank.findById(rankId);
        if (!rank) return res.status(400).json({ error: "invalid_rank" });
        user.rank = rank._id;
      } else {
        user.rank = null;
      }
      await user.save();
      await audit(req.user, "user.setRank", "User", user._id, before, {
        rank: rankId ? String(rankId) : null,
      });
      emitToUser(user._id, "permissions-updated", { profile: true });
    } else if (action === "adjustBalance") {
      const amount = int(req.body.amount, { min: -1000000000, max: 1000000000, name: "amount" });
      if (amount === 0) return res.status(400).json({ error: "invalid_amount" });
      await User.updateOne({ _id: user._id }, { $inc: { balance: amount } });
      await audit(req.user, "user.adjustBalance", "User", user._id, before, { delta: amount });
      emitToUser(user._id, "notify", { type: "balance", delta: amount });
    } else if (action === "setBalance") {
      const amount = int(req.body.amount, { min: 0, max: 1000000000, name: "amount" });
      user.balance = amount;
      await user.save();
      await audit(req.user, "user.setBalance", "User", user._id, before, { balance: amount });
    } else if (action === "kick") {
      await revokeUserSessions(user._id, "admin_kick");
      await audit(req.user, "user.kick", "User", user._id, before, null);
      emitToUser(user._id, "force-logout", { reason: "admin_kick" });
    }
    res.json({ ok: true });
  })
);

/* ============================ الرتب ============================ */
router.get(
  "/ranks",
  wrap(async (req, res) => {
    const ranks = await Rank.find({}).sort("-level").lean();
    res.json({ ranks });
  })
);

router.post(
  "/ranks",
  writeLimiter,
  wrap(async (req, res) => {
    const name = str(req.body.name, { min: 2, max: 60, name: "name" });
    const level = int(req.body.level, { min: 0, max: 1000, name: "level" });
    const rank = await Rank.create({ name, level });
    await audit(req.user, "rank.create", "Rank", rank._id, null, { name, level });
    res.status(201).json({ id: String(rank._id) });
  })
);

router.patch(
  "/ranks/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const rank = await Rank.findById(id(req.params.id, "rank"));
    if (!rank) return res.status(404).json({ error: "not_found" });
    const before = { name: rank.name, level: rank.level };
    if (req.body.name !== undefined) rank.name = str(req.body.name, { min: 2, max: 60, name: "name" });
    if (req.body.level !== undefined) rank.level = int(req.body.level, { min: 0, max: 1000, name: "level" });
    await rank.save();
    await audit(req.user, "rank.update", "Rank", rank._id, before, { name: rank.name, level: rank.level });
    res.json({ ok: true });
  })
);

router.delete(
  "/ranks/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const rank = await Rank.findById(id(req.params.id, "rank"));
    if (!rank) return res.status(404).json({ error: "not_found" });
    await rank.deleteOne();
    await audit(req.user, "rank.delete", "Rank", req.params.id, { name: rank.name }, null);
    res.json({ ok: true });
  })
);

/* ============================ فئات المتجر ============================ */
router.get(
  "/categories",
  wrap(async (req, res) => {
    const categories = await Category.find({}).sort("order name").lean();
    res.json({ categories });
  })
);

router.post(
  "/categories",
  writeLimiter,
  wrap(async (req, res) => {
    const name = str(req.body.name, { min: 2, max: 60, name: "name" });
    const doc = await Category.create({ name, order: int(req.body.order || 0, { name: "order", required: false }) || 0 });
    await audit(req.user, "category.create", "Category", doc._id, null, { name });
    res.status(201).json({ id: String(doc._id) });
  })
);

router.patch(
  "/categories/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await Category.findById(id(req.params.id, "category"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    const before = { name: doc.name, active: doc.active };
    if (req.body.name !== undefined) doc.name = str(req.body.name, { min: 2, max: 60, name: "name" });
    if (req.body.active !== undefined) doc.active = bool(req.body.active, doc.active);
    if (req.body.order !== undefined) doc.order = int(req.body.order, { name: "order" });
    await doc.save();
    await audit(req.user, "category.update", "Category", doc._id, before, { name: doc.name, active: doc.active });
    res.json({ ok: true });
  })
);

router.delete(
  "/categories/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await Category.findById(id(req.params.id, "category"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    await doc.deleteOne();
    await audit(req.user, "category.delete", "Category", req.params.id, { name: doc.name }, null);
    res.json({ ok: true });
  })
);

/* ============================ المنتجات ============================ */
router.get(
  "/products",
  wrap(async (req, res) => {
    const products = await Product.find({}).populate("category", "name").sort("sort name").lean();
    res.json({ products });
  })
);

router.post(
  "/products",
  writeLimiter,
  wrap(async (req, res) => {
    const name = str(req.body.name, { min: 2, max: 80, name: "name" });
    const price = int(req.body.price, { min: 0, max: 1000000000, name: "price" });
    const stock = int(req.body.stock || 0, { min: 0, max: 100000000, name: "stock", required: false }) || 0;
    const description = str(req.body.description || "", { required: false, max: 1000, name: "description" });
    const image = str(req.body.image || "", { required: false, max: 500, name: "image", trim: false });
    const category = req.body.categoryId ? id(String(req.body.categoryId), "category") : null;
    const doc = await Product.create({ name, price, stock, description, image, category });
    await audit(req.user, "product.create", "Product", doc._id, null, { name, price, stock });
    res.status(201).json({ id: String(doc._id) });
  })
);

router.patch(
  "/products/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await Product.findById(id(req.params.id, "product"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    const before = { name: doc.name, price: doc.price, stock: doc.stock, active: doc.active };
    if (req.body.name !== undefined) doc.name = str(req.body.name, { min: 2, max: 80, name: "name" });
    if (req.body.price !== undefined) doc.price = int(req.body.price, { min: 0, max: 1000000000, name: "price" });
    if (req.body.description !== undefined)
      doc.description = str(req.body.description, { required: false, max: 1000, name: "description" });
    if (req.body.image !== undefined) doc.image = str(req.body.image, { required: false, max: 500, name: "image", trim: false });
    if (req.body.categoryId !== undefined)
      doc.category = req.body.categoryId ? id(String(req.body.categoryId), "category") : null;
    if (req.body.active !== undefined) doc.active = bool(req.body.active, doc.active);
    if (req.body.stock !== undefined) doc.stock = int(req.body.stock, { min: 0, max: 100000000, name: "stock" });
    if (req.body.sort !== undefined) doc.sort = int(req.body.sort, { name: "sort" });
    await doc.save();
    await audit(req.user, "product.update", "Product", doc._id, before, {
      name: doc.name,
      price: doc.price,
      stock: doc.stock,
      active: doc.active,
    });
    res.json({ ok: true });
  })
);

/* تعديل مخزون مباشر (جرد) */
router.post(
  "/products/:id/stock",
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await Product.findById(id(req.params.id, "product"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    const delta = int(req.body.delta, { min: -100000000, max: 100000000, name: "delta" });
    const note = str(req.body.note || "", { required: false, max: 200, name: "note" });
    const newStock = Math.max(0, doc.stock + delta);
    doc.stock = newStock;
    await doc.save();
    await require("../db/models").InventoryItem.create({
      product: doc._id,
      delta,
      reason: "adjust",
      balanceAfter: newStock,
      note,
      by: req.user._id,
      byName: req.user.globalName || req.user.username,
    });
    await audit(req.user, "product.stock", "Product", doc._id, { stock: newStock - delta }, { stock: newStock, delta });
    res.json({ ok: true, stock: newStock });
  })
);

router.delete(
  "/products/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await Product.findById(id(req.params.id, "product"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    const before = { name: doc.name, stock: doc.stock };
    await doc.deleteOne();
    await audit(req.user, "product.delete", "Product", req.params.id, before, null);
    res.json({ ok: true });
  })
);

/* ============================ رفع صورة Cloudinary ============================ */
router.post(
  "/upload",
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ error: "invalid_file" });
      next();
    });
  },
  wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "no_file" });
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "colombia/products", transformation: [{ width: 800, height: 800, crop: "limit" }] },
        (err, out) => (err ? reject(err) : resolve(out))
      );
      stream.end(req.file.buffer);
    });
    res.json({ url: result.secure_url });
  })
);

/* ============================ الطلبات ============================ */
router.get(
  "/orders",
  wrap(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = enumOf(String(req.query.status), ["new", "preparing", "delivered", "cancelled"], "status");
    const orders = await Order.find(filter)
      .populate("user", "username globalName avatar discordId")
      .sort("-createdAt")
      .limit(200)
      .lean();
    res.json({ orders });
  })
);

router.patch(
  "/orders/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const order = await Order.findById(id(req.params.id, "order"));
    if (!order) return res.status(404).json({ error: "not_found" });
    const status = enumOf(req.body.status, ["new", "preparing", "delivered", "cancelled"], "status");
    const before = { status: order.status };
    if (order.status === "cancelled" && status !== "cancelled") {
      // إعادة المخزون عند الإلغاء ثم إعادة التفعيل غير مدعومة عمداً
      return res.status(400).json({ error: "cannot_change_cancelled" });
    }
    if (status === "cancelled" && order.status !== "cancelled") {
      const { Product: P, InventoryItem: I } = require("../db/models");
      for (const it of order.items) {
        await P.updateOne({ _id: it.product }, { $inc: { stock: it.qty, soldCount: -it.qty } });
        await I.create({
          product: it.product,
          delta: it.qty,
          reason: "cancel",
          note: `admin cancel ${String(order._id)}`,
          by: req.user._id,
          byName: req.user.globalName || req.user.username,
        });
      }
    }
    order.status = status;
    order.statusHistory.push({ status, at: new Date(), by: req.user.globalName || req.user.username });
    await order.save();
    await audit(req.user, "order.status", "Order", order._id, before, { status });
    emitToUser(order.user, "order:changed", { orderId: String(order._id), status });
    res.json({ ok: true, status });
  })
);

/* ============================ متجر الأعضاء (عناصر) ============================ */
router.get(
  "/istore-items",
  wrap(async (req, res) => {
    const items = await InternalShopItem.find({}).sort("sort name").lean();
    res.json({ items });
  })
);

router.post(
  "/istore-items",
  writeLimiter,
  wrap(async (req, res) => {
    const name = str(req.body.name, { min: 2, max: 80, name: "name" });
    const price = int(req.body.price, { min: 0, max: 1000000000, name: "price" });
    const description = str(req.body.description || "", { required: false, max: 1000, name: "description" });
    const image = str(req.body.image || "", { required: false, max: 500, name: "image", trim: false });
    const stock = int(req.body.stock === undefined ? -1 : req.body.stock, { min: -1, max: 100000000, name: "stock", required: false });
    const doc = await InternalShopItem.create({ name, price, description, image, stock: stock === null ? -1 : stock });
    await audit(req.user, "istore.create", "InternalShopItem", doc._id, null, { name, price });
    res.status(201).json({ id: String(doc._id) });
  })
);

router.patch(
  "/istore-items/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await InternalShopItem.findById(id(req.params.id, "item"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    const before = { name: doc.name, price: doc.price, active: doc.active, stock: doc.stock };
    if (req.body.name !== undefined) doc.name = str(req.body.name, { min: 2, max: 80, name: "name" });
    if (req.body.price !== undefined) doc.price = int(req.body.price, { min: 0, max: 1000000000, name: "price" });
    if (req.body.description !== undefined)
      doc.description = str(req.body.description, { required: false, max: 1000, name: "description" });
    if (req.body.image !== undefined) doc.image = str(req.body.image, { required: false, max: 500, name: "image", trim: false });
    if (req.body.active !== undefined) doc.active = bool(req.body.active, doc.active);
    if (req.body.stock !== undefined)
      doc.stock = int(req.body.stock, { min: -1, max: 100000000, name: "stock" });
    await doc.save();
    await audit(req.user, "istore.update", "InternalShopItem", doc._id, before, {
      name: doc.name,
      price: doc.price,
      active: doc.active,
    });
    res.json({ ok: true });
  })
);

router.delete(
  "/istore-items/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await InternalShopItem.findById(id(req.params.id, "item"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    await doc.deleteOne();
    await audit(req.user, "istore.delete", "InternalShopItem", req.params.id, { name: doc.name }, null);
    res.json({ ok: true });
  })
);

/* ============================ الإعلانات ============================ */
router.get(
  "/announcements",
  wrap(async (req, res) => {
    const list = await Announcement.find({}).sort("-createdAt").limit(100).lean();
    res.json({ announcements: list });
  })
);

router.post(
  "/announcements",
  writeLimiter,
  wrap(async (req, res) => {
    const title = str(req.body.title, { min: 2, max: 120, name: "title" });
    const body = str(req.body.body || "", { required: false, max: 3000, name: "body" });
    const pinned = bool(req.body.pinned, false);
    const doc = await Announcement.create({
      title,
      body,
      pinned,
      author: req.user._id,
      authorName: req.user.globalName || req.user.username,
    });
    await audit(req.user, "announcement.create", "Announcement", doc._id, null, { title });
    emitToArea("members", "announcement:new", { id: String(doc._id), title });
    res.status(201).json({ id: String(doc._id) });
  })
);

router.patch(
  "/announcements/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await Announcement.findById(id(req.params.id, "announcement"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    const before = { title: doc.title, pinned: doc.pinned };
    if (req.body.title !== undefined) doc.title = str(req.body.title, { min: 2, max: 120, name: "title" });
    if (req.body.body !== undefined) doc.body = str(req.body.body, { required: false, max: 3000, name: "body" });
    if (req.body.pinned !== undefined) doc.pinned = bool(req.body.pinned, doc.pinned);
    await doc.save();
    await audit(req.user, "announcement.update", "Announcement", doc._id, before, { title: doc.title, pinned: doc.pinned });
    res.json({ ok: true });
  })
);

router.delete(
  "/announcements/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await Announcement.findById(id(req.params.id, "announcement"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    await doc.deleteOne();
    await audit(req.user, "announcement.delete", "Announcement", req.params.id, { title: doc.title }, null);
    res.json({ ok: true });
  })
);

/* ============================ أنواع العمليات ============================ */
router.get(
  "/op-types",
  wrap(async (req, res) => {
    const types = await OperationType.find({}).sort("order name").lean();
    res.json({ types });
  })
);

router.post(
  "/op-types",
  writeLimiter,
  wrap(async (req, res) => {
    const name = str(req.body.name, { min: 2, max: 60, name: "name" });
    const doc = await OperationType.create({ name });
    await audit(req.user, "optype.create", "OperationType", doc._id, null, { name });
    res.status(201).json({ id: String(doc._id) });
  })
);

router.patch(
  "/op-types/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await OperationType.findById(id(req.params.id, "type"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    const before = { name: doc.name, active: doc.active };
    if (req.body.name !== undefined) doc.name = str(req.body.name, { min: 2, max: 60, name: "name" });
    if (req.body.active !== undefined) doc.active = bool(req.body.active, doc.active);
    await doc.save();
    await audit(req.user, "optype.update", "OperationType", doc._id, before, { name: doc.name, active: doc.active });
    res.json({ ok: true });
  })
);

router.delete(
  "/op-types/:id",
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await OperationType.findById(id(req.params.id, "type"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    await doc.deleteOne();
    await audit(req.user, "optype.delete", "OperationType", req.params.id, { name: doc.name }, null);
    res.json({ ok: true });
  })
);

/* ============================ سجل التدقيق ============================ */
router.get(
  "/audit",
  wrap(async (req, res) => {
    const page = Math.max(0, Number(req.query.page || 0) || 0);
    const filter = {};
    if (req.query.action) filter.action = { $regex: String(req.query.action).slice(0, 60), $options: "i" };
    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort("-at").skip(page * 50).limit(50).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ items, total, page });
  })
);

/* ============================ إعدادات الموقع ============================ */
router.get(
  "/settings",
  wrap(async (req, res) => {
    const settings = await getSettings();
    res.json({
      settings: {
        lockoutEnabled: settings.lockoutEnabled,
        lockoutStart: settings.lockoutStart,
        lockoutEnd: settings.lockoutEnd,
        weekStartDay: settings.weekStartDay,
        weekStartTime: settings.weekStartTime,
        growMinutes: settings.growMinutes,
        countHarvestInTarget: settings.countHarvestInTarget,
        harvestUnitValue: settings.harvestUnitValue,
        updatedAt: settings.updatedAt,
      },
      roles: {
        ROLE_SHOP_ID: env.ROLE_SHOP_ID,
        ROLE_MEMBER_ID: env.ROLE_MEMBER_ID,
        ROLE_OPS_ID: env.ROLE_OPS_ID,
        ROLE_ADMIN_ID: env.ROLE_ADMIN_ID,
        GUILD_ID: env.GUILD_ID,
      },
      tz: env.TZ,
      baseUrl: env.BASE_URL,
      buildId: env.BUILD_ID,
    });
  })
);

router.patch(
  "/settings",
  writeLimiter,
  wrap(async (req, res) => {
    const settings = await getSettings();
    const before = {
      lockoutEnabled: settings.lockoutEnabled,
      lockoutStart: settings.lockoutStart,
      lockoutEnd: settings.lockoutEnd,
      weekStartDay: settings.weekStartDay,
      weekStartTime: settings.weekStartTime,
      growMinutes: settings.growMinutes,
      countHarvestInTarget: settings.countHarvestInTarget,
      harvestUnitValue: settings.harvestUnitValue,
    };
    const hm = (v, cur) => {
      const s = String(v || "");
      return /^\d{1,2}:\d{2}$/.test(s) ? s : cur;
    };
    if (req.body.lockoutEnabled !== undefined) settings.lockoutEnabled = bool(req.body.lockoutEnabled, settings.lockoutEnabled);
    if (req.body.lockoutStart !== undefined) settings.lockoutStart = hm(req.body.lockoutStart, settings.lockoutStart);
    if (req.body.lockoutEnd !== undefined) settings.lockoutEnd = hm(req.body.lockoutEnd, settings.lockoutEnd);
    if (req.body.weekStartDay !== undefined)
      settings.weekStartDay = int(req.body.weekStartDay, { min: 0, max: 6, name: "weekStartDay" });
    if (req.body.weekStartTime !== undefined) settings.weekStartTime = hm(req.body.weekStartTime, settings.weekStartTime);
    if (req.body.growMinutes !== undefined)
      settings.growMinutes = int(req.body.growMinutes, { min: 1, max: 10080, name: "growMinutes" });
    if (req.body.countHarvestInTarget !== undefined)
      settings.countHarvestInTarget = bool(req.body.countHarvestInTarget, settings.countHarvestInTarget);
    if (req.body.harvestUnitValue !== undefined)
      settings.harvestUnitValue = int(req.body.harvestUnitValue, { min: 0, max: 1000000, name: "harvestUnitValue" });
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    invalidateSettings();
    await audit(req.user, "settings.update", "Settings", settings._id, before, {
      lockoutEnabled: settings.lockoutEnabled,
      weekStartDay: settings.weekStartDay,
      growMinutes: settings.growMinutes,
      countHarvestInTarget: settings.countHarvestInTarget,
    });
    res.json({ ok: true });
  })
);

module.exports = router;
