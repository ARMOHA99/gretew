const express = require("express");
const env = require("../../config/env");
const site = require("../../config/site");
const { User } = require("../db/models");
const { areaFor } = require("../utils/roles");
const { getSettings } = require("../utils/settings");
const { isLockoutActive } = require("../utils/time");
const { wrap, requireAuth } = require("../auth/middleware");

const router = express.Router();

function avatarUrl(user) {
  if (!user || !user.avatar) return "";
  return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png?size=128`;
}

function buildConfig(settings, lockoutActive) {
  return {
    name: site.orgName,
    mark: site.orgMark,
    tagline: site.orgTagline,
    currency: site.currency,
    noAccessHint: site.noAccessHint,
    tz: env.TZ,
    buildId: env.BUILD_ID,
    lockoutEnabled: !!settings.lockoutEnabled,
    lockoutActive,
    lockoutStart: settings.lockoutStart,
    lockoutEnd: settings.lockoutEnd,
    weekStartDay: settings.weekStartDay,
    weekStartTime: settings.weekStartTime,
    growMinutes: settings.growMinutes,
    countHarvestInTarget: !!settings.countHarvestInTarget,
    treasuryCategories: site.treasuryCategories,
  };
}

/* GET /api/me */
router.get(
  "/me",
  wrap(async (req, res) => {
    if (!req.session || !req.user) return res.status(401).json({ error: "auth_required" });
    const user = await User.findById(req.user._id).populate("rank");
    if (!user) return res.status(401).json({ error: "auth_required" });
    const settings = await getSettings();
    const lockoutActive = isLockoutActive(
      env.TZ,
      settings.lockoutEnabled,
      settings.lockoutStart,
      settings.lockoutEnd
    );
    res.json({
      authenticated: true,
      flags: req.flags,
      area: areaFor(req.flags),
      csrf: req.session.csrf,
      buildId: env.BUILD_ID,
      user: {
        id: String(user._id),
        discordId: user.discordId,
        username: user.username,
        globalName: user.globalName,
        displayName: user.globalName || user.username,
        avatarUrl: avatarUrl(user),
        rank: user.rank ? { id: String(user.rank._id), name: user.rank.name, level: user.rank.level } : null,
        balance: user.balance,
        joinedAt: user.joinedAt,
        totalOperations: user.totalOperations,
        totalWins: user.totalWins,
        totalHarvests: user.totalHarvests,
        dutyCount: user.dutyCount,
      },
      config: buildConfig(settings, lockoutActive),
    });
  })
);

/* GET /api/config - إعدادات عامة (حتى لغير المسجلين: اسم المنظمة للشاشة السينمائية) */
router.get(
  "/config",
  wrap(async (req, res) => {
    const settings = await getSettings();
    const lockoutActive = isLockoutActive(
      env.TZ,
      settings.lockoutEnabled,
      settings.lockoutStart,
      settings.lockoutEnd
    );
    res.json(buildConfig(settings, lockoutActive));
  })
);

/* GET /api/build-id - آلية إعادة التحميل بعد النشر */
router.get("/build-id", (req, res) => {
  res.json({ buildId: env.BUILD_ID });
});

/* GET /api/ping - حماية صحة الجلسة الحيّة */
router.get("/ping", requireAuth, (req, res) => {
  res.json({ ok: true, flags: req.flags });
});

module.exports = router;
