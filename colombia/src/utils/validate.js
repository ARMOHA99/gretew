/**
 * تحقق صارم من المدخلات + تنظيف النصوص (حماية XSS / NoSQL injection).
 * كل رسالة خطأ ترجع كـ code يترجمها الواجهة من ملف النصوص.
 */

function httpError(code, status = 400) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  return e;
}

function stripTags(v) {
  return String(v).replace(/<[^>]*>/g, "").replace(/[<>]/g, "");
}

function str(v, opts = {}) {
  const { min = 0, max = 5000, required = true, name = "field", trim = true } = opts;
  if (v === undefined || v === null || v === "") {
    if (required) throw httpError("invalid_" + name);
    return "";
  }
  if (typeof v !== "string") throw httpError("invalid_" + name);
  let s = trim ? v.trim() : v;
  s = stripTags(s);
  if (trim) s = s.trim();
  if (s.length < min) throw httpError("invalid_" + name);
  if (s.length > max) throw httpError("too_long_" + name);
  return s;
}

function int(v, opts = {}) {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, required = true, name = "number" } = opts;
  if (v === undefined || v === null || v === "") {
    if (required) throw httpError("invalid_" + name);
    return null;
  }
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw httpError("invalid_" + name);
  if (n < min || n > max) throw httpError("invalid_" + name);
  return n;
}

function num(v, opts = {}) {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, required = true, name = "number" } = opts;
  if (v === undefined || v === null || v === "") {
    if (required) throw httpError("invalid_" + name);
    return null;
  }
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) throw httpError("invalid_" + name);
  if (n < min || n > max) throw httpError("invalid_" + name);
  return n;
}

function bool(v, fallback = false) {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return fallback;
}

const ID_RE = /^[a-fA-F0-9]{24}$/;
function id(v, name = "id") {
  if (typeof v !== "string" || !ID_RE.test(v)) throw httpError("invalid_" + name);
  return v;
}

function enumOf(v, list, name = "value") {
  if (!list.includes(v)) throw httpError("invalid_" + name);
  return v;
}

function idArray(v, opts = {}) {
  const { max = 200, name = "ids" } = opts;
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw httpError("invalid_" + name);
  if (v.length > max) throw httpError("too_long_" + name);
  return v.map((x) => id(x, name));
}

function dateMs(v, name = "date") {
  if (v === undefined || v === null || v === "") throw httpError("invalid_" + name);
  const t = Date.parse(v);
  if (!Number.isFinite(t)) throw httpError("invalid_" + name);
  return t;
}

/** يرفض أي مفتاح يبدأ بـ $ (حماية NoSQL injection) داخل body/query */
function rejectNoSQL(obj, path = "") {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$")) throw httpError("invalid_input", 400);
    if (key === "__proto__") throw httpError("invalid_input", 400);
    rejectNoSQL(obj[key], path + "." + key);
  }
}

module.exports = {
  httpError,
  stripTags,
  str,
  int,
  num,
  bool,
  id,
  enumOf,
  idArray,
  dateMs,
  rejectNoSQL,
};
