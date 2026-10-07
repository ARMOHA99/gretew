/**
 * أدوات الزمن - كل منطق التاريخ يعمل على المنطقة الزمنية المعرفة في البيئة TZ.
 */

function tzOffsetMs(tz, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second)
  );
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

function localParts(tz, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const y = Number(p.year);
  const m = Number(p.month);
  const d = Number(p.day);
  const h = Number(p.hour) % 24;
  const mi = Number(p.minute);
  // يوم الأسبوع داخل المنطقة الزمنية (0=الأحد)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, h, mi, weekday, minutesOfDay: h * 60 + mi };
}

function parseHM(str, fallback = "00:00") {
  const s = String(str || fallback);
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { h: 0, mi: 0 };
  return { h: Math.min(23, Number(m[1])), mi: Math.min(59, Number(m[2])) };
}

/**
 * حدود الأسبوع الحالي (أو أي تاريخ) حسب إعدادات weekStartDay / weekStartTime.
 * يُرجع timestamp بالمللي ثانية UTC.
 */
function weekBounds(tz, weekStartDay, weekStartTime, ref = new Date()) {
  const p = localParts(tz, ref);
  const { h, mi } = parseHM(weekStartTime, "00:00");
  const startDayNum = ((Number(weekStartDay) || 0) % 7 + 7) % 7;
  const delta = (p.weekday - startDayNum + 7) % 7;
  const startLocal = new Date(Date.UTC(p.y, p.m - 1, p.d - delta));
  const wall = Date.UTC(
    startLocal.getUTCFullYear(),
    startLocal.getUTCMonth(),
    startLocal.getUTCDate(),
    h,
    mi,
    0,
    0
  );
  const offset = tzOffsetMs(tz, ref);
  const start = wall - offset;
  return { start, end: start + 7 * 24 * 60 * 60 * 1000 };
}

/** الأسبوع السابق المحدد بالكامل قبل تاريخ مرجعي */
function previousWeekBounds(tz, weekStartDay, weekStartTime, ref = new Date()) {
  const cur = weekBounds(tz, weekStartDay, weekStartTime, ref);
  return { start: cur.start - 7 * 24 * 60 * 60 * 1000, end: cur.start };
}

/**
 * هل نحن داخل فترة الإغلاق الليلي؟ (تدور منتصف الليل مثلاً 22:00 -> 04:00)
 */
function isLockoutActive(tz, lockoutEnabled, lockoutStart, lockoutEnd, ref = new Date()) {
  if (!lockoutEnabled) return false;
  const p = localParts(tz, ref);
  const s = parseHM(lockoutStart, "22:00");
  const e = parseHM(lockoutEnd, "04:00");
  const startMin = s.h * 60 + s.mi;
  const endMin = e.h * 60 + e.mi;
  const nowMin = p.minutesOfDay;
  if (startMin === endMin) return false;
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  return nowMin >= startMin || nowMin < endMin;
}

function inRange(ts, start, end) {
  return ts >= start && ts < end;
}

module.exports = {
  tzOffsetMs,
  localParts,
  parseHM,
  weekBounds,
  previousWeekBounds,
  isLockoutActive,
  inRange,
};
