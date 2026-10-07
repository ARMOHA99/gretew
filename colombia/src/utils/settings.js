const { Settings, WeeklyTarget } = require("../db/models");

let cache = null;
let cacheAt = 0;
const TTL = 15000;

async function getSettings() {
  if (cache && Date.now() - cacheAt < TTL) return cache;
  let doc = await Settings.findOne({ key: "main" });
  if (!doc) doc = await Settings.create({ key: "main" });
  cache = doc;
  cacheAt = Date.now();
  return doc;
}

function invalidateSettings() {
  cache = null;
  cacheAt = 0;
}

async function getTargetDoc() {
  let doc = await WeeklyTarget.findOne({ key: "main" });
  if (!doc) doc = await WeeklyTarget.create({ key: "main", targetAmount: 0 });
  return doc;
}

module.exports = { getSettings, invalidateSettings, getTargetDoc };
