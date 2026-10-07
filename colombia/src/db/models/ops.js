const mongoose = require("mongoose");
const { Schema } = mongoose;

/* ============================== OperationType ============================== */
const operationTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* ============================== Operation ============================== */
const operationSchema = new Schema(
  {
    type: { type: Schema.Types.ObjectId, ref: "OperationType", required: true, index: true },
    typeName: { type: String, default: "" },
    date: { type: Date, required: true, index: true },
    participants: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    result: { type: String, enum: ["win", "loss"], required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    notes: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    createdByName: { type: String, default: "" },
  },
  { timestamps: true }
);
operationSchema.index({ date: -1 });

/* ============================== WeeklyTarget ============================== */
const weeklyTargetSchema = new Schema(
  {
    key: { type: String, default: "main", unique: true },
    targetAmount: { type: Number, default: 0, min: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedAt: { type: Date, default: Date.now },
    archive: [
      {
        weekStart: { type: Date, required: true },
        weekEnd: { type: Date, required: true },
        target: { type: Number, default: 0 },
        achieved: { type: Number, default: 0 },
        archivedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

/* ============================== Announcement ============================== */
const announcementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "" },
    pinned: { type: Boolean, default: false },
    author: { type: Schema.Types.ObjectId, ref: "User", default: null },
    authorName: { type: String, default: "" },
  },
  { timestamps: true }
);

/* ============================== Request ============================== */
const requestSchema = new Schema(
  {
    requester: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requesterName: { type: String, default: "" },
    type: { type: String, enum: ["leave", "promotion", "complaint"], required: true, index: true },
    message: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    response: { type: String, default: "" },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    decidedByName: { type: String, default: "" },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/* ============================== Note / Warning / Fine ============================== */
const noteSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["note", "warning", "fine"], default: "note", index: true },
    content: { type: String, required: true },
    amount: { type: Number, default: 0, min: 0 },
    deducted: { type: Boolean, default: false },
    author: { type: Schema.Types.ObjectId, ref: "User", default: null },
    authorName: { type: String, default: "" },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);
noteSchema.index({ createdAt: -1 });

/* ============================== DutyLog ============================== */
const dutyLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    start: { type: Date, default: Date.now, index: true },
    end: { type: Date, default: null },
    durationMs: { type: Number, default: 0 },
    open: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

/* ============================== TreasuryEntry ============================== */
const treasurySchema = new Schema(
  {
    kind: { type: String, enum: ["income", "expense"], required: true, index: true },
    category: { type: String, default: "أخرى" },
    amount: { type: Number, required: true, min: 1 },
    note: { type: String, default: "" },
    author: { type: Schema.Types.ObjectId, ref: "User", default: null },
    authorName: { type: String, default: "" },
    date: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);
treasurySchema.index({ date: -1 });

module.exports = {
  OperationType: mongoose.model("OperationType", operationTypeSchema),
  Operation: mongoose.model("Operation", operationSchema),
  WeeklyTarget: mongoose.model("WeeklyTarget", weeklyTargetSchema),
  Announcement: mongoose.model("Announcement", announcementSchema),
  Request: mongoose.model("Request", requestSchema),
  Note: mongoose.model("Note", noteSchema),
  DutyLog: mongoose.model("DutyLog", dutyLogSchema),
  TreasuryEntry: mongoose.model("TreasuryEntry", treasurySchema),
};
