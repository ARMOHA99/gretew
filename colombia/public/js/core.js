/* ============================================================
   CORE - الحالة، الـ API، التنقل، الإشعارات، الرسوم، السوكيت
   ============================================================ */

const State = {
  me: null,
  config: null,
  csrf: "",
  cart: [],
  route: "",
  buildId: "",
};

let onForceLogoutCb = null;
let onUnauthorizedCb = null;
function setForceLogoutHandler(fn) { onForceLogoutCb = fn; }
function setUnauthorizedHandler(fn) { onUnauthorizedCb = fn; }

/* ------------------------------ أدوات ------------------------------ */
function esc(v) {
  return String(v === null || v === undefined ? "" : v).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function t(key, vars) {
  let s = S[key];
  if (s === undefined || typeof s !== "string") s = key;
  if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(vars[k]);
  return s;
}

function tz() { return (State.config && State.config.tz) || "Africa/Algiers"; }
function currency() { return (State.config && State.config.currency) || "$"; }

function fmtMoney(n) {
  const v = Number(n || 0);
  return v.toLocaleString("en-US") + " " + currency();
}
function fmtNum(n) { return Number(n || 0).toLocaleString("en-US"); }

function fmtDate(d) {
  try {
    return new Intl.DateTimeFormat("ar-DZ", { timeZone: tz(), dateStyle: "medium" }).format(new Date(d));
  } catch (e) { return new Date(d).toLocaleDateString(); }
}
function fmtDateTime(d) {
  try {
    return new Intl.DateTimeFormat("ar-DZ", { timeZone: tz(), dateStyle: "short", timeStyle: "short" }).format(new Date(d));
  } catch (e) { return new Date(d).toLocaleString(); }
}
function fmtTime(d) {
  try {
    return new Intl.DateTimeFormat("ar-DZ", { timeZone: tz(), timeStyle: "short" }).format(new Date(d));
  } catch (e) { return new Date(d).toLocaleTimeString(); }
}
function fmtDay(d) {
  try {
    return new Intl.DateTimeFormat("ar-DZ", { timeZone: tz(), weekday: "short", day: "numeric" }).format(new Date(d));
  } catch (e) { return new Date(d).toDateString(); }
}

function fmtDuration(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return mm + " " + t("common_minutes");
  return h + " " + t("common_hour") + " " + mm + " " + t("common_minutes");
}

function countUp(el, to, dur) {
  if (!el) return;
  const target = Number(to || 0);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || target === 0) { el.textContent = fmtNum(target); return; }
  const start = performance.now();
  const D = dur || 900;
  function step(now) {
    const p = Math.min(1, (now - start) / D);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmtNum(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function skeleton(n) {
  let out = '<div class="grid cols-2">';
  for (let i = 0; i < (n || 3); i++) out += '<div class="card"><div class="skeleton" style="width:40%"></div><div class="skeleton h90"></div></div>';
  return out + "</div>";
}
function skeletonList() {
  let out = "";
  for (let i = 0; i < 5; i++) out += '<div class="skeleton" style="height:52px"></div>';
  return out;
}

function emptyBox(icon, msg) {
  return '<div class="empty"><span class="e-ic">' + esc(icon) + "</span>" + esc(msg) + "</div>";
}

function avatarHTML(u, cls) {
  const url = u && (u.avatarUrl || (u.avatar && u.avatarUrl));
  if (url) return '<img class="' + (cls || "avatar") + '" src="' + esc(url) + '" alt="" loading="lazy" />';
  return '<div class="' + (cls || "avatar") + '" style="display:flex;align-items:center;justify-content:center;background:#222;color:var(--gold);font-weight:900">' +
    esc(((u && (u.name || u.displayName || u.username)) || "?").charAt(0)) + "</div>";
}

/* ------------------------------ API ------------------------------ */
async function api(method, url, body) {
  const opts = {
    method,
    credentials: "same-origin",
    headers: { "x-csrf-token": State.csrf || "" },
  };
  if (body !== undefined && body !== null) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    throw { code: "network_error" };
  }
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }

  if (res.status === 401) {
    State.me = null;
    if (onUnauthorizedCb) onUnauthorizedCb();
    throw { code: "auth_required", status: 401 };
  }
  if (!res.ok) {
    const code = (data && data.error) || "server_error";
    throw { code, status: res.status };
  }
  return data;
}

function errMsg(err) {
  if (!err) return t("err_server_error");
  if (err.code === "network_error") return t("err_server_error");
  const key = "err_" + err.code;
  return S[key] ? t(key) : err.code;
}

/* ------------------------------ TOASTS ------------------------------ */
function toast(msg, type, ms) {
  const root = document.getElementById("toasts");
  if (!root) return;
  const el = document.createElement("div");
  el.className = "toast " + (type || "");
  el.textContent = msg;
  el.onclick = () => dismiss(el);
  root.appendChild(el);
  const timer = setTimeout(() => dismiss(el), ms || 4200);
  function dismiss(node) {
    clearTimeout(timer);
    if (!node.parentNode) return;
    node.classList.add("out");
    setTimeout(() => node.remove(), 300);
  }
}

/* ------------------------------ MODAL ------------------------------ */
function openModal(html, onMount, wide) {
  const root = document.getElementById("modal-root");
  root.innerHTML =
    '<div class="overlay" data-overlay><div class="modal' + (wide ? " wide" : "") + '">' + html + "</div></div>";
  const overlay = root.querySelector("[data-overlay]");
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeModal(); });
  root.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", closeModal));
  if (onMount) onMount(root);
}
function closeModal() {
  const root = document.getElementById("modal-root");
  if (root) root.innerHTML = "";
}

/* ------------------------------ الرسوم البيانية ------------------------------ */
function barChartSVG(days, opts) {
  opts = opts || {};
  const w = 620, h = 190, padX = 26, padTop = 14, padBottom = 30;
  const max = Math.max(1, ...days.map((d) => Math.max(d.income, d.expense)));
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;
  const slot = innerW / Math.max(1, days.length);
  const bw = Math.max(4, slot * 0.32);
  let bars = "";
  let labels = "";
  let grid = "";
  for (let g = 0; g <= 3; g++) {
    const y = padTop + (innerH / 3) * g;
    grid += '<line x1="' + padX + '" y1="' + y + '" x2="' + (w - padX) + '" y2="' + y + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
  }
  days.forEach((d, i) => {
    const cx = padX + slot * i + slot / 2;
    const hIn = (d.income / max) * innerH;
    const hEx = (d.expense / max) * innerH;
    bars +=
      '<rect x="' + (cx - bw - 2) + '" y="' + (padTop + innerH - hIn) + '" width="' + bw + '" height="' + Math.max(1, hIn) + '" rx="3" fill="#2ecc71" opacity="0.9"><title>' + esc(fmtMoney(d.income)) + "</title></rect>" +
      '<rect x="' + (cx + 2) + '" y="' + (padTop + innerH - hEx) + '" width="' + bw + '" height="' + Math.max(1, hEx) + '" rx="3" fill="#e74c3c" opacity="0.9"><title>' + esc(fmtMoney(d.expense)) + "</title></rect>";
    if (i % 2 === 0 || days.length <= 7) {
      labels += '<text x="' + cx + '" y="' + (h - 8) + '" text-anchor="middle" font-size="10" fill="#6d675d">' + esc(fmtDay(d.date)) + "</text>";
    }
  });
  return (
    '<div class="chart"><svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="xMidYMid meet">' +
    grid + bars + labels +
    "</svg></div>" +
    '<div class="chart-legend"><span><i style="background:#2ecc71"></i>' + t("treasury_income") + "</span>" +
    '<span><i style="background:#e74c3c"></i>' + t("treasury_expense") + "</span></div>"
  );
}

/* ------------------------------ السلة ------------------------------ */
function loadCart() {
  try { State.cart = JSON.parse(localStorage.getItem("colombia_cart") || "[]"); }
  catch (e) { State.cart = []; }
  if (!Array.isArray(State.cart)) State.cart = [];
}
function saveCart() {
  localStorage.setItem("colombia_cart", JSON.stringify(State.cart));
  updateCartBadge();
}
function cartCount() { return State.cart.reduce((s, i) => s + i.qty, 0); }
function addToCart(product, qty) {
  const found = State.cart.find((i) => i.productId === String(product._id));
  if (found) found.qty = Math.min(99, found.qty + (qty || 1));
  else
    State.cart.push({
      productId: String(product._id),
      name: product.name,
      price: product.price,
      stock: product.stock,
      qty: qty || 1,
      image: product.image || "",
    });
  saveCart();
  toast(t("shop_add_cart") + " ✓", "success");
}
function clearCart() { State.cart = []; saveCart(); }
function updateCartBadge() {
  const n = cartCount();
  document.querySelectorAll("[data-cart-badge]").forEach((el) => {
    el.textContent = n > 0 ? String(n) : "";
    el.style.display = n > 0 ? "" : "none";
  });
}

/* ------------------------------ السوكيت ------------------------------ */
let socket = null;
function connectSocket() {
  if (typeof io === "undefined") return;
  if (socket) { socket.connect(); return; }
  socket = io({ withCredentials: true, transports: ["websocket", "polling"] });
  const forward = (name) => (data) => window.dispatchEvent(new CustomEvent("so", { detail: { name, data: data || {} } }));

  socket.on("connect", () => {});
  socket.on("force-logout", (p) => {
    const reason = (p && p.reason) || "role_removed";
    const msg =
      reason === "banned" ? t("ev_force_logout_banned") :
      reason === "left_server" ? t("ev_force_logout_left") :
      reason === "admin_kick" ? t("ev_force_logout_kick") :
      reason === "resync" || reason === "reconcile" ? t("ev_force_logout_role") :
      t("ev_force_logout");
    forceLogout(msg);
  });
  ["permissions-updated", "order:changed", "operation:changed", "target:changed",
   "farm:ready", "farm:changed", "treasury:changed", "announcement:new",
   "notify", "request:updated"].forEach((ev) => socket.on(ev, forward(ev)));
}

async function forceLogout(message) {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-csrf-token": State.csrf || "" },
    });
  } catch (e) {}
  State.me = null;
  if (onForceLogoutCb) onForceLogoutCb(message || t("ev_force_logout"));
}

/* ------------------------------ BUILD_ID ------------------------------ */
function showUpdateBar() {
  if (document.getElementById("update-bar")) return;
  const bar = document.createElement("div");
  bar.id = "update-bar";
  bar.className = "update-bar";
  bar.textContent = t("ev_update_available");
  bar.onclick = () => location.reload();
  document.body.appendChild(bar);
}
async function checkBuild(force) {
  try {
    const r = await fetch("/api/build-id", { cache: "no-store" });
    const d = await r.json();
    if (State.buildId && d.buildId && d.buildId !== State.buildId) showUpdateBar();
    else if (!State.buildId && d.buildId) State.buildId = d.buildId;
  } catch (e) {}
}
function startBuildWatch() {
  setInterval(checkBuild, 25000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkBuild(); });
}

/* ------------------------------ مساعدات عرض ------------------------------ */
function orderBadge(status) {
  const map = {
    new: "badge-blue",
    preparing: "badge-gold",
    delivered: "badge-green",
    cancelled: "badge-red",
  };
  return '<span class="badge ' + (map[status] || "badge-mute") + '">' + t("shop_status_" + status) + "</span>";
}
function resultBadge(result) {
  return result === "win"
    ? '<span class="badge badge-green">' + t("ops_win") + "</span>"
    : '<span class="badge badge-red">' + t("ops_loss") + "</span>";
}
function statusReqBadge(status) {
  const map = { pending: "badge-gold", approved: "badge-green", rejected: "badge-red" };
  return '<span class="badge ' + (map[status] || "badge-mute") + '">' + t("requests_status_" + status) + "</span>";
}
function noteBadge(type) {
  const map = { note: "badge-blue", warning: "badge-gold", fine: "badge-red" };
  return '<span class="badge ' + (map[type] || "badge-mute") + '">' + t("notes_type_" + type) + "</span>";
}
function roleBadges(flags) {
  if (!flags) return '<span class="badge badge-mute">' + t("common_role_none") + "</span>";
  let out = "";
  if (flags.admin) out += '<span class="badge badge-red">' + t("common_role_admin") + "</span>";
  if (flags.ops) out += '<span class="badge badge-gold">' + t("common_role_ops") + "</span>";
  if (flags.member) out += '<span class="badge badge-green">' + t("common_role_member") + "</span>";
  if (flags.shop) out += '<span class="badge badge-blue">' + t("common_role_shop") + "</span>";
  return out || '<span class="badge badge-mute">' + t("common_role_none") + "</span>";
}
function pageHead(titleKey, subKey, extraHTML) {
  return (
    '<div class="page-head"><h1 class="page-title"><span class="accent">' + esc(t(titleKey)) + "</span></h1>" +
    '<div class="spacer"></div>' + (extraHTML || "") +
    (subKey ? '<div class="page-sub">' + esc(t(subKey)) + "</div>" : "") +
    "</div>"
  );
}
function qsHash() {
  const h = location.hash || "";
  const i = h.indexOf("?");
  const params = {};
  if (i > -1) {
    new URLSearchParams(h.slice(i + 1)).forEach((v, k) => (params[k] = v));
  }
  return { path: i > -1 ? h.slice(0, i) : h, params };
}
function fv(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}
function tzOffsetMs(tzName, date) {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tzName, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p = {};
    for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
    const asUTC = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour) % 24, Number(p.minute), Number(p.second)
    );
    return asUTC - Math.floor(date.getTime() / 1000) * 1000;
  } catch (e) { return 0; }
}

/* تاريخ + وقت يكتبه المستخدم كتوقيت المنطقة الزمنية -> ISO بالـ UTC */
function zonedToISO(dateStr, timeStr) {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  const hm = (timeStr || "00:00").split(":").map(Number);
  const guess = Date.UTC(parts[0], parts[1] - 1, parts[2], hm[0] || 0, hm[1] || 0);
  const off = tzOffsetMs(tz(), new Date(guess));
  return new Date(guess - off).toISOString();
}

/* ISO -> حقول input-local في المنطقة الزمنية */
function isoToInputParts(iso) {
  try {
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz(), hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
    const p = {};
    for (const part of dtf.formatToParts(new Date(iso))) p[part.type] = part.value;
    return {
      date: p.year + "-" + p.month + "-" + p.day,
      time: (Number(p.hour) % 24) + ":" + p.minute,
    };
  } catch (e) {
    const d = new Date(iso);
    const p2 = (n) => String(n).padStart(2, "0");
    return {
      date: d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()),
      time: p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()),
    };
  }
}
function localDateInput(d) {
  const dt = d ? new Date(d) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return dt.getUTCFullYear() + "-" + p(dt.getUTCMonth() + 1) + "-" + p(dt.getUTCDate());
}
