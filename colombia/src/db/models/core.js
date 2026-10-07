const mongoose = require("mongoose");
const { Schema } = mongoose;

/* ============================== User ============================== */
const userSchema = new Schema(
  {
    discordId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: "" },
    globalName: { type: String, default: "" },
    avatar: { type: String, default: "" },
    discordRoles: { type: [String], default: [] },
    inGuild: { type: Boolean, default: false },
    rank: { type: Schema.Types.ObjectId, ref: "Rank", default: null },
    balance: { type: Number, default: 0 },
    joinedAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now },
    totalOperations: { type: Number, default: 0 },
    totalWins: { type: Number, default: 0 },
    totalHarvests: { type: Number, default: 0 },
    dutyCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);
userSchema.index({ username: 1 });
userSchema.index({ "discordRoles": 1 });

/* ============================== Rank ============================== */
const rankSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    level: { type: Number, required: true, default: 10 },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* ============================== Session ============================== */
const sessionSchema = new Schema(
  {
    sid: { type: String, required: true, unique: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    csrf: { type: String, required: true },
    flags: {
      shop: { type: Boolean, default: false },
      member: { type: Boolean, default: false },
      ops: { type: Boolean, default: false },
      admin: { type: Boolean, default: false },
    },
    ip: { type: String, default: "" },
    ua: { type: String, default: "" },
    revoked: { type: Boolean, default: false, index: true },
    revokedReason: { type: String, default: "" },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/* ============================== Settings ============================== */
const settingsSchema = new Schema(
  {
    key: { type: String, default: "main", unique: true },
    lockoutEnabled: { type: Boolean, default: false },
    lockoutStart: { type: String, default: "22:00" },
    lockoutEnd: { type: String, default: "04:00" },
    weekStartDay: { type: Number, default: 0, min: 0, max: 6 },
    weekStartTime: { type: String, default: "00:00" },
    growMinutes: { type: Number, default: 60, min: 1 },
    countHarvestInTarget: { type: Boolean, default: false },
    harvestUnitValue: { type: Number, default: 100, min: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

/* ============================== AuditLog ============================== */
const auditSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", index: true },
    actorName: { type: String, default: "" },
    action: { type: String, required: true, index: true },
    targetType: { type: String, default: "" },
    targetId: { type: String, default: "" },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);
auditSchema.index({ at: -1 });

module.exports = {
  User: mongoose.model("User", userSchema),
  Rank: mongoose.model("Rank", rankSchema),
  Session: mongoose.model("Session", sessionSchema),
  Settings: mongoose.model("Settings", settingsSchema),
  AuditLog: mongoose.model("AuditLog", auditSchema),
};
