require("dotenv").config();

const REQUIRED = [
  "BASE_URL",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_BOT_TOKEN",
  "DISCORD_REDIRECT_URI",
  "GUILD_ID",
  "ROLE_SHOP_ID",
  "ROLE_MEMBER_ID",
  "ROLE_OPS_ID",
  "ROLE_ADMIN_ID",
  "MONGODB_URI",
  "SESSION_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

const missing = REQUIRED.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");
if (missing.length) {
  console.error(
    "\n[config/env] متغيرات بيئة ناقصة:\n  " + missing.join("\n  ") + "\n"
  );
  process.exit(1);
}

const isProd = process.env.NODE_ENV === "production" || String(process.env.BASE_URL).startsWith("https://");

module.exports = {
  NODE_ENV: process.env.NODE_ENV || (isProd ? "production" : "development"),
  isProd,
  PORT: parseInt(process.env.PORT || "3000", 10),
  BASE_URL: String(process.env.BASE_URL).replace(/\/+$/, ""),
  TZ: process.env.TZ || "Africa/Algiers",

  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  DISCORD_REDIRECT_URI: process.env.DISCORD_REDIRECT_URI,
  GUILD_ID: process.env.GUILD_ID,

  ROLE_SHOP_ID: process.env.ROLE_SHOP_ID,
  ROLE_MEMBER_ID: process.env.ROLE_MEMBER_ID,
  ROLE_OPS_ID: process.env.ROLE_OPS_ID,
  ROLE_ADMIN_ID: process.env.ROLE_ADMIN_ID,

  MONGODB_URI: process.env.MONGODB_URI,
  SESSION_SECRET: process.env.SESSION_SECRET,

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,

  BUILD_ID:
    process.env.BUILD_ID ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
};
