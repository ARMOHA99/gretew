/**
 * سكربت الزرع: الإعدادات الافتراضية + أنواع العمليات + منتجات نموذجية + رتب + فئات.
 * التشغيل:  npm run seed
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const site = require("../config/site");
const env = require("../config/env");
const {
  Settings,
  WeeklyTarget,
  OperationType,
  Category,
  Product,
  InternalShopItem,
  Rank,
} = require("../src/db/models");

const SAMPLE_CATEGORIES = [
  { name: "أسلحة", order: 1 },
  { name: "ذخيرة", order: 2 },
  { name: "متفجرات", order: 3 },
  { name: "معدات", order: 4 },
  { name: "مخدرات", order: 5 },
];

const SAMPLE_PRODUCTS = [
  { name: "بندقية AK-47", description: "سلاح رشاش ثقيل عالي الأذى", price: 2500, stock: 12, cat: "أسلحة" },
  { name: "مسدس Desert Eagle", description: "مسدس قوي للاشتباكات القريبة", price: 900, stock: 20, cat: "أسلحة" },
  { name: "قنبلة يدوية x5", description: "علبة خمس قنابل يدوية", price: 1200, stock: 8, cat: "متفجرات" },
  { name: "ذخيرة 5.56 (120 طلقة)", description: "علبة ذخيرة كبيرة", price: 450, stock: 40, cat: "ذخيرة" },
  { name: "سترة واقية", description: "سترة واقية من الرصاص", price: 1500, stock: 6, cat: "معدات" },
  { name: "جهاز لاسلكي", description: "للتنسيق بين الفرق", price: 350, stock: 25, cat: "معدات" },
  { name: "حزمة كوكايين", description: "حزمة تجارية عالية النقاء", price: 3000, stock: 0, cat: "مخدرات" },
  { name: "سيارة نقل معدات", description: "مركبة لنقل المعدات ثقيلة", price: 5000, stock: 3, cat: "معدات" },
];

const SAMPLE_ISTORE = [
  { name: "أوفر وقود", description: "خصم على وقود المركبات", price: 500, stock: -1 },
  { name: "تجميل مجاني", description: "تغيير كامل للمظهر", price: 750, stock: -1 },
  { name: "رتق رتبتك", description: "ترقية فورية لرتبة أعلى (يتطلب موافقة)", price: 5000, stock: -1 },
];

const SAMPLE_OPTYPES = [
  { name: "مداهمة", order: 1 },
  { name: "حراسة", order: 2 },
  { name: "تاجر متجول", order: 3 },
  { name: "نقل شحنات", order: 4 },
  { name: "حلال مشاكل", order: 5 },
];

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  console.log("[seed] connected");

  // الإعدادات
  await Settings.updateOne(
    { key: "main" },
    {
      $setOnInsert: {
        key: "main",
        lockoutEnabled: false,
        lockoutStart: "22:00",
        lockoutEnd: "04:00",
        weekStartDay: 0,
        weekStartTime: "00:00",
        growMinutes: 60,
        countHarvestInTarget: false,
        harvestUnitValue: 100,
      },
    },
    { upsert: true }
  );
  console.log("[seed] settings");

  // الهدف الأسبوعي
  await WeeklyTarget.updateOne(
    { key: "main" },
    { $setOnInsert: { key: "main", targetAmount: 100000, archive: [] } },
    { upsert: true }
  );
  console.log("[seed] weekly target");

  // رتب المنظمة
  for (const r of site.defaultRanks) {
    await Rank.updateOne({ name: r.name }, { $setOnInsert: { name: r.name, level: r.level } }, { upsert: true });
  }
  console.log(`[seed] ${site.defaultRanks.length} ranks`);

  // أنواع العمليات
  for (const t of SAMPLE_OPTYPES) {
    await OperationType.updateOne({ name: t.name }, { $setOnInsert: { name: t.name, order: t.order, active: true } }, { upsert: true });
  }
  console.log("[seed] operation types");

  // فئات + منتجات
  const catIds = {};
  for (const c of SAMPLE_CATEGORIES) {
    let doc = await Category.findOne({ name: c.name });
    if (!doc) doc = await Category.create(c);
    catIds[c.name] = doc._id;
  }
  for (const p of SAMPLE_PRODUCTS) {
    const exists = await Product.findOne({ name: p.name });
    if (!exists) {
      await Product.create({
        name: p.name,
        description: p.description,
        price: p.price,
        stock: p.stock,
        category: catIds[p.cat] || null,
        active: true,
      });
    }
  }
  console.log(`[seed] ${SAMPLE_PRODUCTS.length} products`);

  // عناصر متجر الأعضاء
  for (const it of SAMPLE_ISTORE) {
    const exists = await InternalShopItem.findOne({ name: it.name });
    if (!exists) await InternalShopItem.create(it);
  }
  console.log("[seed] internal shop items");

  console.log("[seed] done ✔");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("[seed] failed:", e);
  process.exit(1);
});
