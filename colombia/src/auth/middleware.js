const rateLimit = require("express-rate-limit");
const { findValidSession } = require("./session");
const { COOKIE_NAME } = require("./session");
const { flagsFromRoles, hasAnyAccess, isMemberArea, canWriteOps } = require("../utils/roles");
const { getSettings } = require("../utils/settings");
const { isLockoutActive } = require("../utils/time");
const env = require("../../config/env");
const { httpError, rejectNoSQL } = require("../utils/validate");

/* ------------------------- Rate limiters ------------------------- */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited" },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 90,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "rate_limited" },
});

/* --------------------- NoSQL injection guard --------------------- */
function noSQLGuard(req, res, next) {
  try {
    if (req.body) rejectNoSQL(req.body);
    if (req.query) rejectNoSQL(req.query);
    next();
  } catch (e) {
    res.status(400).json({ error: "invalid_input" });
  }
}

/* --------------------- Load session (كل طلب) --------------------- */
async function loadSession(req, res, next) {
  req.session = null;
  req.user = null;
  req.flags = null;
  try {
    const sid = req.cookies ? req.cookies[COOKIE_NAME] : null;
    const s = await findValidSession(sid);
    if (!s || !s.user) return next();
    // شبكة أمان 1: الصلاحيات تُحسب من رولات المستخدم الحية في قاعدة البيانات
    const flags = flagsFromRoles(s.user.discordRoles);
    const prev = JSON.stringify(s.flags || {});
    const now = JSON.stringify(flags);
    if (prev !== now) {
      s.flags = flags;
      await s.save();
    }
    req.session = s;
    req.user = s.user;
    req.flags = flags;
    next();
  } catch (e) {
    next();
  }
}

/* --------------------------- Guards --------------------------- */
function requireAuth(req, res, next) {
  if (!req.session || !req.user) return res.status(401).json({ error: "auth_required" });
  next();
}

function requireAccess(req, res, next) {
  if (!req.session || !req.user) return res.status(401).json({ error: "auth_required" });
  if (!hasAnyAccess(req.flags)) return res.status(403).json({ error: "no_access" });
  next();
}

function requireMember(req, res, next) {
  if (!req.session || !req.user) return res.status(401).json({ error: "auth_required" });
  if (!isMemberArea(req.flags)) return res.status(403).json({ error: "forbidden" });
  next();
}

function requireOps(req, res, next) {
  if (!req.session || !req.user) return res.status(401).json({ error: "auth_required" });
  if (!canWriteOps(req.flags)) return res.status(403).json({ error: "forbidden" });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.user) return res.status(401).json({ error: "auth_required" });
  if (!req.flags || !req.flags.admin) return res.status(403).json({ error: "forbidden" });
  next();
}

function requireShop(req, res, next) {
  if (!req.session || !req.user) return res.status(401).json({ error: "auth_required" });
  if (!req.flags || !(req.flags.shop || req.flags.admin)) return res.status(403).json({ error: "forbidden" });
  next();
}

/* --------------------- CSRF (mutating requests) --------------------- */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
async function csrfProtect(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  if (!req.session) return res.status(401).json({ error: "auth_required" });
  const token = req.get("x-csrf-token") || "";
  if (!token || token !== req.session.csrf) return res.status(403).json({ error: "csrf" });
  next();
}

/* --------------------- Nightly lockout --------------------- */
async function lockoutGuard(req, res, next) {
  try {
    const settings = await getSettings();
    const active = isLockoutActive(
      env.TZ,
      settings.lockoutEnabled,
      settings.lockoutStart,
      settings.lockoutEnd
    );
    if (active && req.flags && !req.flags.admin && !req.flags.ops) {
      return res.status(423).json({ error: "locked" });
    }
    next();
  } catch (e) {
    next();
  }
}

/* --------------------- Async route wrapper --------------------- */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* --------------------- Central error handler --------------------- */
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  const code = err.code && typeof err.code === "string" ? err.code : "server_error";
  if (status >= 500) console.error("[error]", err);
  res.status(status).json({ error: code });
}

module.exports = {
  authLimiter,
  writeLimiter,
  noSQLGuard,
  loadSession,
  requireAuth,
  requireAccess,
  requireMember,
  requireOps,
  requireAdmin,
  requireShop,
  csrfProtect,
  lockoutGuard,
  wrap,
  errorHandler,
};
