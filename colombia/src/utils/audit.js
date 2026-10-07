const { AuditLog } = require("../db/models");

/**
 * تسجيل إجراء في سجل التدقيق (كل إجراء حساس من الإدارة/العمليات).
 */
async function audit(actor, action, targetType, targetId, before, after) {
  try {
    await AuditLog.create({
      actor: actor ? actor._id : null,
      actorName: actor ? actor.username || actor.globalName || "" : "system",
      action,
      targetType: targetType || "",
      targetId: targetId ? String(targetId) : "",
      before: before === undefined ? null : before,
      after: after === undefined ? null : after,
      at: new Date(),
    });
  } catch (err) {
    console.error("[audit] failed:", err.message);
  }
}

module.exports = { audit };
