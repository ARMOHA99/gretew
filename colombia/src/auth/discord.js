const crypto = require("crypto");
const express = require("express");
const env = require("../../config/env");
const { User } = require("../db/models");
const { flagsFromRoles, hasAnyAccess, areaFor } = require("../utils/roles");
const { createSession, setSessionCookie, clearSessionCookie, revokeSession, COOKIE_NAME } = require("./session");
const { authLimiter, wrap } = require("./middleware");
const site = require("../../config/site");

const router = express.Router();
const STATE_COOKIE = "oauth_state";
const SCOPES = "identify guilds.members.read";

function avatarUrl(id, hash) {
  if (!hash) return "";
  return `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128`;
}

/* ---------------------- GET /api/auth/discord ---------------------- */
router.get("/discord", authLimiter, (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60 * 1000,
  });
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: env.DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    state,
    prompt: "none",
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
});

/* ---------------------- GET /api/auth/callback ---------------------- */
router.get(
  "/callback",
  authLimiter,
  wrap(async (req, res) => {
    const { code, state } = req.query;
    const savedState = req.cookies ? req.cookies[STATE_COOKIE] : null;
    clearOauthCookies(res);
    if (!code || !state || !savedState || state !== savedState) {
      return res.redirect(`${env.BASE_URL}/#/login?error=state`);
    }

    // 1) تبادل الكود بتوكن
    const body = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: env.DISCORD_REDIRECT_URI,
    });
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) return res.redirect(`${env.BASE_URL}/#/login?error=token`);
    const token = await tokenRes.json();
    const authHeader = { Authorization: `Bearer ${token.access_token}` };

    // 2) بيانات المستخدم
    const meRes = await fetch("https://discord.com/api/users/@me", { headers: authHeader });
    if (!meRes.ok) return res.redirect(`${env.BASE_URL}/#/login?error=profile`);
    const me = await meRes.json();

    // 3) رولات المستخدم في سيرفرنا (تحتاج scope guilds.members.read)
    let roles = [];
    let inGuild = false;
    const memberRes = await fetch(
      `https://discord.com/api/users/@me/guilds/${env.GUILD_ID}/member`,
      { headers: authHeader }
    );
    if (memberRes.ok) {
      const member = await memberRes.json();
      roles = Array.isArray(member.roles) ? member.roles : [];
      inGuild = true;
    }

    // 4) إنشاء/تحديث المستخدم
    const flags = flagsFromRoles(roles);
    let user = await User.findOne({ discordId: me.id });
    if (!user) {
      user = new User({ discordId: me.id, joinedAt: new Date() });
    }
    user.username = me.username || user.username || "";
    user.globalName = me.global_name || "";
    user.avatar = me.avatar || "";
    user.discordRoles = roles;
    user.inGuild = inGuild;
    user.lastLogin = new Date();
    await user.save();

    // 5) جلسة (حتى بدون صلاحيات لعرض صفحة "لا تملك صلاحية")
    const { sid, csrf } = await createSession(user, flags, req);
    setSessionCookie(res, sid);

    const area = areaFor(flags);
    const target = area === "noaccess" ? "/#/noaccess" : area === "shop" ? "/#/shop" : "/#/home";
    res.redirect(`${env.BASE_URL}${target}?csrf=${encodeURIComponent(csrf)}`);
  })
);

/* ---------------------- POST /api/auth/logout ---------------------- */
router.post(
  "/logout",
  wrap(async (req, res) => {
    const sid = req.cookies ? req.cookies[COOKIE_NAME] : null;
    if (sid) await revokeSession(sid, "logout");
    clearSessionCookie(res);
    res.json({ ok: true });
  })
);

function clearOauthCookies(res) {
  res.clearCookie(STATE_COOKIE, { path: "/" });
}

router.siteInfo = { name: site.orgName };

module.exports = router;
