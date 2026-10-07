const mongoose = require("mongoose");
const { Schema } = mongoose;

/* ============================== Plot ============================== */
const plotSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, default: "" },
    status: {
      type: String,
      enum: ["empty", "planted", "ready"],
      default: "empty",
      index: true,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    product: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    plantedAt: { type: Date, default: null },
    readyAt: { type: Date, default: null, index: true },
    growMinutes: { type: Number, default: 0 },
    lastHarvestAt: { type: Date, default: null },
    totalHarvests: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* ============================== HarvestLog ============================== */
const harvestLogSchema = new Schema(
  {
    plot: { type: Schema.Types.ObjectId, ref: "Plot", required: true, index: true },
    plotName: { type: String, default: "" },
    by: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    byName: { type: String, default: "" },
    qty: { type: Number, required: true, min: 1 },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);
harvestLogSchema.index({ at: -1 });

/* ============================== InventoryItem (سجل حركات المخزون) ============================== */
const inventoryItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    delta: { type: Number, required: true },
    reason: {
      type: String,
      enum: ["harvest", "sale", "cancel", "adjust", "seed"],
      default: "adjust",
    },
    balanceAfter: { type: Number, default: 0 },
    note: { type: String, default: "" },
    by: { type: Schema.Types.ObjectId, ref: "User", default: null },
    byName: { type: String, default: "" },
    at: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = {
  Plot: mongoose.model("Plot", plotSchema),
  HarvestLog: mongoose.model("HarvestLog", harvestLogSchema),
  InventoryItem: mongoose.model("InventoryItem", inventoryItemSchema),
};
