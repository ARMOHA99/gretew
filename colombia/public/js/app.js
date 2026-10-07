/* ============================================================
   APP - تسجيل الدخول، الهيكل، الموجّه، الأحداث الحيّة
   ============================================================ */

const ROUTES = {
  "#/home": { area: "members", render: (el, p) => ViewsMembers.home(el, p) },
  "#/duty": { area: "members", render: (el, p) => ViewsMembers.duty(el, p) },
  "#/ops": { area: "members", render: (el, p) => ViewsMembers.ops(el, p) },
  "#/target": { area: "members", render: (el, p) => ViewsMembers.target(el, p) },
  "#/farm": { area: "members", render: (el, p) => ViewsMembers.farm(el, p) },
  "#/treasury": { area: "members", render: (el, p) => ViewsMembers.treasury(el, p) },
  "#/notes": { area: "members", render: (el, p) => ViewsMembers.notes(el, p) },
  "#/requests": { area: "members", render: (el, p) => ViewsMembers.requests(el, p) },
  "#/istore": { area: "members", render: (el, p) => ViewsMembers.istore(el, p) },
  "#/leaderboard": { area: "members", render: (el, p) => ViewsMembers.leaderboard(el, p) },
  "#/card": { area: "members", render: (el, p) => ViewsMembers.card(el, p) },
  "#/shop": { area: "shop", render: (el, p) => ViewsShop.store(el, p) },
  "#/orders": { area: "shop", render: (el, p) => ViewsShop.orders(el, p) },
  "#/admin": { area: "admin", render: (el, p) => ViewsAdmin.dashboard(el, p) },
};

function me() { return State.me; }
function flags() { return (State.me && State.me.flags) || {}; }
function isMemberArea(f) { f = f || flags(); return !!(f.member || f.ops || f.admin); }

function areaForFlags(f) {
  if (!f.shop && !f.member && !f.ops && !f.admin) return "noaccess";
  if (f.admin || f.ops || f.member) return "members";
  return "shop";
}
function defaultRouteFor() {
  const f = flags();
  const area = areaForFlags(f);
  if (area === "noaccess") return "#/noaccess";
  if (area === "shop") return "#/shop";
  if (f.admin) return "#/home";
  return "#/home";
}
function navigate(hash) {
  if (location.hash === hash) renderRoute();
  else location.hash = hash;
}

/* ============================ شاشة تسجيل الدخول ============================ */
function showLogin(message, errorCode) {
  stopParticles();
  const cfg = State.config || {};
  const app = document.getElementById("app");
  let errHTML = "";
  if (errorCode === "state" || errorCode === "token" || errorCode === "profile") {
    errHTML = '<div class="login-error">' + esc(t("login_error_" + errorCode)) + "</div>";
  } else if (message) {
    errHTML = '<div class="login-error">' + esc(message) + "</div>";
  }
  app.className = "";
  app.innerHTML =
    '<div class="login">' +
    '<div class="smoke s2"></div><div class="smoke s1"></div><div class="smoke s3"></div>' +
    '<div class="login-card">' +
    '<div class="login-mark">' + esc(cfg.mark || "C") + "</div>" +
    '<h1 class="login-title">' + esc(cfg.name || "Colombia") + "</h1>" +
    '<div class="login-tagline">' + esc(cfg.tagline || "") + "</div>" +
    errHTML +
    '<button class="btn-discord" id="btn-login">' +
    '<svg width="26" height="26" viewBox="0 0 71 55" fill="none"><path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.4a.2.2 0 0 0-.2.1c-.6 1.1-1.3 2.6-1.8 3.7a54 54 0 0 0-16.2 0A37 37 0 0 0 25.5.5a.2.2 0 0 0-.2-.1c-5 .9-9.9 2.4-14.5 4.5a.2.2 0 0 0-.1.1C1.6 18.7-1 32.2.3 45.5v.2c6 4.4 11.8 7.1 17.5 8.8a.2.2 0 0 0 .3-.1c1.4-1.9 2.6-3.9 3.7-6a.2.2 0 0 0-.1-.3 38.8 38.8 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.9a.2.2 0 0 1 .2 0 41.6 41.6 0 0 0 35.3 0 .2.2 0 0 1 .2 0l1.1.9a.2.2 0 0 1 0 .4 36.4 36.4 0 0 1-5.5 2.6.2.2 0 0 0-.1.3c1.1 2.1 2.3 4.1 3.7 6a.2.2 0 0 0 .3.1c5.7-1.7 11.5-4.4 17.5-8.8a.2.2 0 0 0 .1-.2c1.5-15.3-2.6-28.7-11-40.6a.2.2 0 0 0-.1-.1ZM23.7 37.2c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Zm23.7 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.3 6.4 7.2 0 4-2.8 7.2-6.4 7.2Z" fill="#0b0b0d"/></svg>' +
    esc(t("login_signin")) +
    "</button>" +
    '<div class="login-foot">' + esc(t("login_foot")) + "</div>" +
    "</div></div>";
  document.title = (cfg.name || "Colombia");
  document.getElementById("btn-login").onclick = () => {
    window.location.href = "/api/auth/discord";
  };
  startParticles();
}

/* ============================ جزيئات ذهبية ============================ */
let particleRaf = null;
function startParticles() {
  const canvas = document.getElementById("fx-canvas");
  if (!canvas) return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ctx = canvas.getContext("2d");
  canvas.classList.add("on");
  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
  }
  resize();
  window.onresize = resize;
  if (reduce) return;
  const N = Math.min(80, Math.round(window.innerWidth / 14));
  const parts = [];
  for (let i = 0; i < N; i++) parts.push(newPart(true));
  function newPart(anywhere) {
    return {
      x: Math.random() * canvas.width,
      y: anywhere ? Math.random() * canvas.height : canvas.height + 20,
      r: (Math.random() * 2.2 + 0.7) * devicePixelRatio,
      v: (Math.random() * 0.5 + 0.18) * devicePixelRatio,
      a: Math.random() * 0.55 + 0.15,
      ph: Math.random() * Math.PI * 2,
    };
  }
  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.y -= p.v;
      p.ph += 0.015;
      const x = p.x + Math.sin(p.ph) * 14 * devicePixelRatio;
      const grd = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 3.5);
      grd.addColorStop(0, "rgba(245,224,163," + p.a + ")");
      grd.addColorStop(1, "rgba(245,224,163,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(x, p.y, p.r * 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (p.y < -20) Object.assign(p, newPart(false));
    }
    particleRaf = requestAnimationFrame(loop);
  }
  stopParticles(false);
  loop();
}
function stopParticles(clear) {
  if (particleRaf) cancelAnimationFrame(particleRaf);
  particleRaf = null;
  if (clear !== false) {
    const canvas = document.getElementById("fx-canvas");
    if (canvas) {
      canvas.classList.remove("on");
      const ctx = canvas.getContext("2d");
      ctx && ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

/* ============================ صفحة بدون صلاحية ============================ */
function showNoAccess() {
  stopParticles();
  const cfg = State.config || {};
  const app = document.getElementById("app");
  app.innerHTML =
    '<div class="center-screen"><div class="access-card">' +
    '<div class="big">🚫</div>' +
    "<h2>" + esc(t("noaccess_title")) + "</h2>" +
    "<p>" + esc(t("noaccess_body")) + "</p>" +
    '<div class="divider"></div>' +
    '<div class="small muted">' + esc(t("noaccess_hint")) + ": " + esc(cfg.noAccessHint || "") + "</div>" +
    '<div style="margin-top:20px;display:flex;gap:10px;justify-content:center">' +
    '<button class="btn btn-red" id="btn-na-logout">' + esc(t("noaccess_logout")) + "</button>" +
    "</div></div></div>";
  document.getElementById("btn-na-logout").onclick = doLogout;
}

/* ============================ الإغلاق الليلي ============================ */
function showLockedScreen() {
  const app = document.getElementById("app");
  app.innerHTML =
    '<div class="center-screen"><div class="access-card">' +
    '<div class="big">🔒</div>' +
    "<h2>" + esc(t("locked_title")) + "</h2>" +
    "<p>" + esc(t("locked_body")) + "</p>" +
    '<div class="small muted" style="margin-top:10px">' +
    esc((State.config && State.config.lockoutStart) + " - " + (State.config && State.config.lockoutEnd)) +
    "</div>" +
    '<div style="margin-top:20px;display:flex;gap:10px;justify-content:center">' +
    '<button class="btn btn-ghost" id="btn-lk-logout">' + esc(t("noaccess_logout")) + "</button>" +
    "</div></div></div>";
  document.getElementById("btn-lk-logout").onclick = doLogout;
}

function inLockoutNow() {
  const c = State.config;
  if (!c || !c.lockoutEnabled || !c.lockoutActive) return false;
  const f = flags();
  if (f.admin || f.ops) return false;
  return true;
}

/* ============================ تسجيل الخروج ============================ */
async function doLogout() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-csrf-token": State.csrf || "" },
    });
  } catch (e) {}
  State.me = null;
  showLogin();
}

/* ============================ الهيكل ============================ */
function navModel() {
  const f = flags();
  const items = [];
  const push = (route, icon, key) => items.push({ route, icon, key });

  if (isMemberArea(f)) {
    push("#/home", "⌂", "nav_home");
    push("#/duty", "⏱", "nav_duty");
    push("#/ops", "⚔", "nav_ops");
    push("#/target", "🎯", "nav_target");
    push("#/farm", "🌿", "nav_farm");
    push("#/treasury", "💰", "nav_treasury");
    push("#/istore", "🛍", "nav_istore");
    push("#/notes", "📜", "nav_notes");
    push("#/requests", "📨", "nav_requests");
    push("#/leaderboard", "🏅", "nav_leaderboard");
    push("#/card", "🪪", "nav_card");
  }
  if (f.shop || f.admin) {
    push("#/shop", "🛒", "nav_shop");
    push("#/orders", "📦", "nav_orders");
  }
  if (f.admin) push("#/admin", "⚙", "nav_admin");
  return items;
}

function renderShell() {
  stopParticles();
  const cfg = State.config || {};
  const u = (State.me && State.me.user) || {};
  const items = navModel();
  const navHTML = items
    .map(
      (i) =>
        '<div class="nav-item" data-route="' + i.route + '" onclick="navigate(\'' + i.route + "')\">" +
        '<span class="ic">' + i.icon + "</span><span>" + esc(t(i.key)) + "</span>" +
        (i.route === "#/orders" ? '<span class="dot" data-cart-badge style="display:none"></span>' : "") +
        "</div>"
    )
    .join("");
  const bottomHTML = items
    .map(
      (i) =>
        '<button class="bn-item" data-route="' + i.route + '" onclick="navigate(\'' + i.route + "')\">" +
        '<span class="ic">' + i.icon + "</span><span>" + esc(t(i.key)) + "</span>" +
        (i.route === "#/orders" ? '<span class="cart-badge" data-cart-badge style="display:none"></span>' : "") +
        "</button>"
    )
    .join("");

  const showSwitch = isMemberArea(flags()) && (flags().shop || flags().admin);

  document.getElementById("app").className = "";
  document.getElementById("app").innerHTML =
    '<aside class="sidebar">' +
    '<div class="side-head">' +
    '<div class="side-mark">' + esc(cfg.mark || "C") + "</div>" +
    '<div class="side-name">' + esc(cfg.name || "Colombia") + "</div>" +
    '<div class="side-tag">' + esc(cfg.tagline || "") + "</div>" +
    (showSwitch
      ? '<div style="margin-top:10px"><span class="switch-shop" onclick="navigate(\'#/shop\')">🛍 ' +
        esc(t("switch_to_shop")) + "</span></div>"
      : "") +
    "</div>" +
    '<div class="side-nav">' + navHTML + "</div>" +
    '<div class="side-foot"><div class="user-chip">' +
    avatarHTML(u) +
    '<div style="min-width:0"><div class="u-name">' + esc(u.displayName || "") + "</div>" +
    '<div class="u-rank">' + esc((u.rank && u.rank.name) || t("card_no_rank")) + "</div></div>" +
    '<button class="icon-btn" title="' + esc(t("nav_logout")) + '" onclick="doLogout()">⎋</button>' +
    "</div></div></aside>" +
    '<div class="main">' +
    '<div class="mobile-top">' +
    '<div class="side-mark" style="width:36px;height:36px;font-size:19px;border-radius:10px">' + esc(cfg.mark || "C") + "</div>" +
    '<b style="font-family:var(--font-display);background:var(--grad-gold);-webkit-background-clip:text;background-clip:text;color:transparent">' +
    esc(cfg.name || "Colombia") + "</b>" +
    '<div class="spacer"></div>' +
    (showSwitch
      ? '<span class="switch-shop" onclick="navigate(\'#/shop\')">🛍</span>'
      : isMemberArea(flags()) && flags().shop
      ? '<span class="switch-shop" onclick="navigate(\'#/home\')">🏠</span>'
      : "") +
    '<button class="icon-btn" onclick="doLogout()">⎋</button>' +
    "</div>" +
    '<div id="view" class="view"></div>' +
    "</div>" +
    '<nav class="bottom-nav">' + bottomHTML + "</nav>";

  document.title = cfg.name || "Colombia";
  updateCartBadge();
}

function setActiveNav(route) {
  document.querySelectorAll("[data-route]").forEach((el) => {
    el.classList.toggle("active", el.getAttribute("data-route") === route);
  });
}

/* ============================ الموجّه ============================ */
async function renderRoute() {
  if (!State.me) return;
  const f = flags();
  if (areaForFlags(f) === "noaccess") return showNoAccess();

  const { path } = qsHash();
  const key = path || defaultRouteFor();
  const route = ROUTES[key];

  if (!route) return navigate(defaultRouteFor());
  const allowed =
    route.area === "admin" ? !!f.admin :
    route.area === "shop" ? !!(f.shop || f.admin) :
    isMemberArea(f);
  if (!allowed) {
    toast(t("err_forbidden"), "error");
    return navigate(defaultRouteFor());
  }
  if (route.area === "members" && inLockoutNow()) return showLockedScreen();

  State.route = key;
  setActiveNav(key);

  let view = document.getElementById("view");
  if (!view) { renderShell(); view = document.getElementById("view"); }
  view.classList.remove("view");
  void view.offsetWidth;
  view.classList.add("view");
  view.innerHTML = skeleton(3);
  try {
    await route.render(view, qsHash().params);
  } catch (e) {
    if (e && e.status === 423) return showLockedScreen();
    view.innerHTML = '<div class="card">' + esc(errMsg(e)) + "</div>";
  }
}

function rerender() {
  const view = document.getElementById("view");
  if (view && State.route && ROUTES[State.route]) {
    Promise.resolve(ROUTES[State.route].render(view, qsHash().params)).catch((e) => {
      view.innerHTML = '<div class="card">' + esc(errMsg(e)) + "</div>";
    });
  }
}

async function refreshMe() {
  try {
    const meData = await api("GET", "/api/me");
    State.me = meData;
    State.csrf = meData.csrf;
    State.config = meData.config;
    State.buildId = meData.buildId || State.buildId;
    return meData;
  } catch (e) {
    return null;
  }
}

/* ============================ أحداث السوكيت ============================ */
function handleNotify(data) {
  if (!data) return;
  if (data.type === "purchase") toast(t("ev_purchase", { amount: fmtMoney(data.total) }), "success");
  else if (data.type === "note") toast(t("ev_note"), "error");
  else if (data.type === "request_decided")
    toast(t("ev_request_decided") + ": " + t("requests_status_" + (data.status || "pending")), data.status === "approved" ? "success" : "error", 6000);
  else if (data.type === "balance") toast(t("admin_balance_saved") + " " + (data.delta > 0 ? "+" : "") + fmtMoney(data.delta));
  else if (data.type === "order") toast(t("ev_new_order"), "success");
}

window.addEventListener("so", async (e) => {
  const { name, data } = e.detail;
  const cur = State.route;
  const refreshRoutes = (list) => list.includes(cur);

  switch (name) {
    case "permissions-updated": {
      await refreshMe();
      if (!State.me) return;
      if (areaForFlags(flags()) === "noaccess") return showNoAccess();
      renderShell();
      renderRoute();
      toast(t("ev_permissions"), "success");
      break;
    }
    case "order:changed":
      if (refreshRoutes(["#/orders", "#/shop", "#/admin"])) rerender();
      toast(t("ev_order_update"));
      break;
    case "operation:changed":
      if (refreshRoutes(["#/ops", "#/home", "#/target", "#/leaderboard"])) rerender();
      toast(t("ev_ops_update"), "", 3000);
      break;
    case "target:changed":
      if (refreshRoutes(["#/target", "#/home", "#/leaderboard"])) rerender();
      break;
    case "farm:ready":
      toast(t("farm_ready_toast", { name: data.plotName || "" }), "success", 8000);
      if (cur === "#/farm") rerender();
      break;
    case "farm:changed":
      if (cur === "#/farm") rerender();
      break;
    case "treasury:changed":
      if (cur === "#/treasury") rerender();
      else toast(t("ev_treasury"));
      break;
    case "announcement:new":
      toast(t("ev_announcement") + ": " + (data.title || ""), "", 6000);
      if (cur === "#/home") rerender();
      break;
    case "notify":
      handleNotify(data);
      if (cur === "#/requests" && data.type === "request_decided") rerender();
      break;
    case "request:updated":
      if (cur === "#/requests") rerender();
      break;
    default:
      break;
  }
});

/* ============================ الإقلاع ============================ */
async function boot() {
  loadCart();
  try {
    State.config = await api("GET", "/api/config");
    State.buildId = State.config.buildId || "";
  } catch (e) {
    State.config = { name: "Colombia", mark: "C", tagline: "", currency: "$", tz: "Africa/Algiers" };
  }
  document.title = State.config.name || "Colombia";

  setUnauthorizedHandler(() => showLogin());
  setForceLogoutHandler((msg) => showLogin(msg));
  startBuildWatch();

  const hash = qsHash().path;
  if (hash === "#/noaccess" || hash === "#/login") {
    // تُحسم بعد فحص الجلسة
  }

  let meData = null;
  try {
    meData = await api("GET", "/api/me");
  } catch (e) {
    if (e && e.status === 401) {
      const params = qsHash().params;
      return showLogin(null, params.error || null);
    }
    return showLogin(errMsg(e));
  }

  State.me = meData;
  State.csrf = meData.csrf;
  State.config = meData.config;
  State.buildId = meData.buildId || State.buildId;
  connectSocket();

  if (meData.area === "noaccess") return showNoAccess();

  if (!location.hash || location.hash === "#/login" || location.hash === "#/noaccess") {
    location.hash = defaultRouteFor();
  }
  renderShell();
  renderRoute();
}

window.addEventListener("hashchange", () => renderRoute());

let booted = false;
async function bootOnce() {
  if (booted) return;
  booted = true;
  await boot();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootOnce);
} else {
  bootOnce();
}
