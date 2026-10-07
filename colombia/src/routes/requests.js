const express = require("express");
const { Request } = require("../db/models");
const { requireAdmin, wrap, writeLimiter } = require("../auth/middleware");
const { id, enumOf, str } = require("../utils/validate");
const { audit } = require("../utils/audit");
const { emitToUser, emitToArea } = require("../sockets");

const router = express.Router();

/* ============ GET /api/requests - كل الطلبات (أدمن) ============ */
router.get(
  "/",
  requireAdmin,
  wrap(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = enumOf(String(req.query.status), ["pending", "approved", "rejected"], "status");
    if (req.query.type) filter.type = enumOf(String(req.query.type), ["leave", "promotion", "complaint"], "type");
    const list = await Request.find(filter).sort("-createdAt").limit(300).lean();
    res.json({ requests: list });
  })
);

/* ============ PATCH /api/requests/:id - قبول/رفض + إشعار صاحب الطلب ============ */
router.patch(
  "/:id",
  requireAdmin,
  writeLimiter,
  wrap(async (req, res) => {
    const doc = await Request.findById(id(req.params.id, "request"));
    if (!doc) return res.status(404).json({ error: "not_found" });
    const status = enumOf(req.body.status, ["approved", "rejected"], "status");
    const response = str(req.body.response || "", { required: false, max: 500, name: "response" });

    const before = { status: doc.status, response: doc.response };
    doc.status = status;
    doc.response = response;
    doc.decidedBy = req.user._id;
    doc.decidedByName = req.user.globalName || req.user.username;
    doc.decidedAt = new Date();
    await doc.save();

    await audit(req.user, "request.decide", "Request", doc._id, before, { status, response });
    // إشعار فوري لصاحب الطلب عبر الغرفة الخاصة به
    emitToUser(doc.requester, "notify", { type: "request_decided", status, requestType: doc.type });
    emitToUser(doc.requester, "request:updated", { id: String(doc._id), status });
    emitToArea("admin", "notify", { type: "request_decided", id: String(doc._id) });
    res.json({ ok: true, status });
  })
);

module.exports = router;
