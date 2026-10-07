const crypto = require("crypto");
const { Session } = require("../db/models");
const env = require("../../config/env");

const COOKIE_NAME = "sid";
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

async function createSession(user, flags, req) {
  const sid = crypto.randomBytes(32).toString("hex");
  const csrf = crypto.randomBytes(24).toString("hex");
  await Session.create({
    sid,
    user: user._id,
    csrf,
    flags,
    ip: (req.ip || "").slice(0, 64),
    ua: String(req.headers["user-agent"] || "").slice(0, 200),
    expiresAt: new Date(Date.now() + SESSION_TTL),
  });
  return { sid, csrf };
}

function setSessionCookie(res, sid) {
  res.cookie(COOKIE_NAME, sid, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

async function revokeSession(sid, reason) {
  await Session.updateOne({ sid }, { $set: { revoked: true, revokedReason: reason || "logout" } });
}

async function revokeUserSessions(userId, reason) {
  await Session.updateMany(
    { user: userId, revoked: false },
    { $set: { revoked: true, revokedReason: reason || "revoked" } }
  );
}

async function findValidSession(sid) {
  if (!sid) return null;
  return Session.findOne({ sid, revoked: false, expiresAt: { $gt: new Date() } }).populate("user");
}

module.exports = {
  COOKIE_NAME,
  createSession,
  setSessionCookie,
  clearSessionCookie,
  revokeSession,
  revokeUserSessions,
  findValidSession,
};
