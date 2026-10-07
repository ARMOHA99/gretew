const env = require("../../config/env");

/**
 * تحويل رولات المستخدم في السيرفر إلى صلاحيات.
 * لا يُفترض وجود رول: كل رول يُقرأ من متغيرات البيئة.
 */
function flagsFromRoles(roles) {
  const arr = Array.isArray(roles) ? roles : [];
  const has = (id) => !!id && arr.includes(id);
  return {
    shop: has(env.ROLE_SHOP_ID),
    member: has(env.ROLE_MEMBER_ID),
    ops: has(env.ROLE_OPS_ID),
    admin: has(env.ROLE_ADMIN_ID),
  };
}

function hasAnyAccess(flags) {
  if (!flags) return false;
  return !!(flags.shop || flags.member || flags.ops || flags.admin);
}

/** منطقة الهبوط بعد تسجيل الدخول */
function areaFor(flags) {
  if (!hasAnyAccess(flags)) return "noaccess";
  if (flags.admin || flags.ops || flags.member) return "members";
  return "shop";
}

/** هل يمكنه دخول منطقة الأعضاء؟ */
function isMemberArea(flags) {
  return !!(flags && (flags.member || flags.ops || flags.admin));
}

/** هل يمكنه تعديل العمليات؟ */
function canWriteOps(flags) {
  return !!(flags && (flags.ops || flags.admin));
}

module.exports = {
  flagsFromRoles,
  hasAnyAccess,
  areaFor,
  isMemberArea,
  canWriteOps,
};
