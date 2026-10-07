const mongoose = require("mongoose");
const { Schema } = mongoose;

/* ============================== Category ============================== */
const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* ============================== Product ============================== */
const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    image: { type: String, default: "" },
    active: { type: Boolean, default: true, index: true },
    soldCount: { type: Number, default: 0 },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* ============================== Order ============================== */
const orderSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: [
      {
        product: { type: Schema.Types.ObjectId, ref: "Product" },
        name: { type: String, default: "" },
        price: { type: Number, default: 0 },
        qty: { type: Number, default: 1, min: 1 },
      },
    ],
    total: { type: Number, default: 0 },
    ingameId: { type: String, default: "" },
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["new", "preparing", "delivered", "cancelled"],
      default: "new",
      index: true,
    },
    statusHistory: [
      {
        status: { type: String },
        at: { type: Date, default: Date.now },
        by: { type: String, default: "" },
      },
    ],
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

/* ============================== InternalShopItem ============================== */
const internalItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, default: "" },
    active: { type: Boolean, default: true },
    stock: { type: Number, default: -1 },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/* ============================== Purchase ============================== */
const purchaseSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    item: { type: Schema.Types.ObjectId, ref: "InternalShopItem", required: true },
    name: { type: String, default: "" },
    qty: { type: Number, default: 1, min: 1 },
    total: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = {
  Category: mongoose.model("Category", categorySchema),
  Product: mongoose.model("Product", productSchema),
  Order: mongoose.model("Order", orderSchema),
  InternalShopItem: mongoose.model("InternalShopItem", internalItemSchema),
  Purchase: mongoose.model("Purchase", purchaseSchema),
};
