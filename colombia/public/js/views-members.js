/* ============================================================
   VIEWS - منطقة الأعضاء
   ============================================================ */
const ViewsMembers = {};
let viewTimer = null;
function clearViewTimer() {
  if (viewTimer) clearInterval(viewTimer);
  viewTimer = null;
}
function canWriteOpsUI() {
  const f = flags();
  return !!(f.ops || f.admin);
}
function isAdminUI() {
  return !!flags().admin;
}

/* ============================ الرئيسية ============================ */
ViewsMembers.home = async function (el) {
  clearViewTimer();
  const u = me().user;
  el.innerHTML =
    pageHead("home_welcome", null,
      isMemberArea(flags()) && (flags().shop || flags().admin)
        ? '<button class="switch-shop" onclick="navigate(\'#/shop\')">🛍 ' + esc(t("switch_to_shop")) + "</button>"
        : "") +
    '<div class="small muted" style="margin:-10px 0 18px;font-size:16px">' +
    '<b class="gold-text">' + esc(u.displayName) + "</b></div>" +
    '<div class="grid cols-4" id="home-stats">' +
    statBox("home_stats_members", 0) +
    statBox("home_stats_duty", 0) +
    statBox("home_stats_balance", 0, "money") +
    statBox("home_stats_week", 0, "money") +
    "</div>" +
    '<div class="grid cols-2" style="margin-top:16px">' +
    '<div class="card"><div class="card-title">🎯 ' + esc(t("home_week_target")) + '</div><div id="home-week"></div></div>' +
    '<div class="card"><div class="card-title">📣 ' + esc(t("home_announcements")) + '</div><div id="home-ann">' + skeletonList() + "</div></div>" +
    "</div>" +
    '<div class="card" style="margin-top:16px"><div class="card-title">⚔ ' + esc(t("home_latest_ops")) +
    ' <a href="#/ops" style="margin-right:auto;font-size:13px">' + esc(t("home_view_all")) + " →</a></div>" +
    '<div id="home-ops">' + skeletonList() + "</div></div>";

  const data = await api("GET", "/api/members/home");
  const s = data.stats;

  const statsBox = document.getElementById("home-stats");
  statsBox.innerHTML =
    statBox("home_stats_members", s.members) +
    statBox("home_stats_duty", s.onDuty, "", s.onDutyNow ? t("home_on_duty") : t("home_off_duty")) +
    statBox("home_stats_balance", s.balance, "money") +
    statBox("home_stats_week", s.weekProgress, "money", t("home_week_target") + ": " + fmtMoney(s.weekTarget));
  statsBox.querySelectorAll("[data-count]").forEach((n) => countUp(n, n.getAttribute("data-count")));

  const tgt = data.target;
  document.getElementById("home-week").innerHTML = progressHTML(tgt.pct, tgt.achieved, tgt.targetAmount, tgt.reached);
  animateBars();

  const ann = document.getElementById("home-ann");
  ann.innerHTML = data.announcements.length
    ? data.announcements.map(announcementHTML).join("")
    : emptyBox("📣", t("home_no_announcements"));

  const opsBox = document.getElementById("home-ops");
  opsBox.innerHTML = data.latestOps.length
    ? data.latestOps.map(opRowHTML).join("")
    : emptyBox("⚔", t("home_no_ops"));
};

function statBox(label, value, cls, sub) {
  return (
    '<div class="stat ' + (cls || "") + '"><div class="k">' + esc(t(label)) + "</div>" +
    '<div class="v"><span data-count="' + value + '">0</span></div>' +
    (sub ? '<div class="s">' + esc(sub) + "</div>" : "") +
    "</div>"
  );
}

function progressHTML(pct, achieved, target, reached) {
  const glow = pct >= 90 && !reached ? " glow" : "";
  const done = reached ? " done" : "";
  return (
    '<div class="progress-row"><span>' + esc(t("target_achieved")) + ": " + esc(fmtMoney(achieved)) + "</span>" +
    '<span class="gold-text">' + esc(fmtMoney(target)) + " · " + pct + "%</span></div>" +
    '<div class="progress' + glow + done + '"><div class="bar" data-w="' + Math.min(100, pct) + '" style="width:0%"></div></div>' +
    (reached ? '<div style="text-align:center;margin-top:8px" class="badge badge-green">' + esc(t("target_reached")) + "</div>" : "")
  );
}
function animateBars() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".bar[data-w]").forEach((b) => {
      b.style.width = b.getAttribute("data-w") + "%";
    });
  });
}

function announcementHTML(a) {
  return (
    '<div class="feed-item">' +
    '<div class="fi-head">' + (a.pinned ? '<span class="badge badge-gold">📌</span>' : "") +
    '<span class="fi-title">' + esc(a.title) + "</span>" +
    '<span class="pill">' + esc(a.author || "") + " · " + esc(fmtDateTime(a.at)) + "</span></div>" +
    (a.body ? '<div class="fi-body">' + esc(a.body) + "</div>" : "") +
    "</div>"
  );
}

function opRowHTML(o) {
  const parts = (o.participants || []).slice(0, 4).map((p) => esc(p.name)).join("، ");
  return (
    '<div class="feed-item"><div class="fi-head">' +
    '<span class="badge ' + (o.result === "win" ? "badge-green" : "badge-red") + '">' +
    esc(o.result === "win" ? t("ops_win") : t("ops_loss")) + "</span>" +
    '<span class="fi-title">' + esc(o.typeName || "") + "</span>" +
    '<span class="gold-text mono" style="font-weight:900">' + esc(fmtMoney(o.amount)) + "</span>" +
    '<span class="pill">' + esc(fmtDateTime(o.date)) + "</span></div>" +
    '<div class="fi-body small">' + esc(parts) +
    (o.participants && o.participants.length > 4 ? " +" + (o.participants.length - 4) : "") + "</div></div>"
  );
}

/* ============================ الدوام ============================ */
ViewsMembers.duty = async function (el) {
  clearViewTimer();
  el.innerHTML =
    pageHead("duty_title", "duty_sub") +
    '<div class="grid cols-2">' +
    '<div class="card" id="duty-status"><div class="card-title">⏱ ' + esc(t("duty_current")) + '</div>' + skeletonList() + "</div>" +
    '<div class="card"><div class="card-title">📋 ' + esc(t("duty_log")) + '</div><div id="duty-logs">' + skeletonList() + "</div></div>" +
    "</div>";

  async function load() {
    const [logsData] = await Promise.all([api("GET", "/api/duty/logs?limit=40")]);
    const logs = logsData.logs || [];
    const open = logs.find((l) => l.open);

    const box = document.getElementById("duty-status");
    if (open) {
      box.innerHTML =
        '<div class="card-title">⏱ ' + esc(t("duty_current")) + "</div>" +
        '<div class="badge badge-green" style="margin-bottom:10px">' + esc(t("duty_open")) + " ●</div>" +
        '<div class="kv"><span class="k">' + esc(t("duty_start")) + '</span><span class="v">' + esc(fmtDateTime(open.start)) + "</span></div>" +
        '<div class="kv"><span class="k">' + esc(t("duty_duration")) + '</span><span class="v gold-text" id="duty-live">-</span></div>' +
        '<button class="btn btn-red btn-block" id="duty-out" style="margin-top:14px">⏻ ' + esc(t("duty_out")) + "</button>";
      viewTimer = setInterval(() => {
        const n = document.getElementById("duty-live");
        if (n) n.textContent = fmtDuration(Date.now() - new Date(open.start).getTime());
      }, 1000);
    } else {
      box.innerHTML =
        '<div class="card-title">⏱ ' + esc(t("duty_title")) + "</div>" +
        '<p class="muted">' + esc(t("home_off_duty")) + "</p>" +
        '<button class="btn btn-gold btn-block" id="duty-in" style="margin-top:10px">▶ ' + esc(t("duty_in")) + "</button>";
    }

    const inBtn = document.getElementById("duty-in");
    if (inBtn)
      inBtn.onclick = async () => {
        try {
          await api("POST", "/api/duty/in");
          toast(t("duty_started"), "success");
          clearViewTimer();
          load();
        } catch (e) { toast(errMsg(e), "error"); }
      };
    const outBtn = document.getElementById("duty-out");
    if (outBtn)
      outBtn.onclick = async () => {
        try {
          await api("POST", "/api/duty/out");
          toast(t("duty_ended"), "success");
          clearViewTimer();
          load();
        } catch (e) { toast(errMsg(e), "error"); }
      };

    const logsBox = document.getElementById("duty-logs");
    if (!logs.length) logsBox.innerHTML = emptyBox("⏱", t("duty_log_empty"));
    else
      logsBox.innerHTML = logs
        .map(
          (l) =>
            '<div class="kv"><span class="k">' + esc(fmtDateTime(l.start)) +
            (l.end ? " → " + esc(fmtTime(l.end)) : "") + "</span>" +
            '<span class="v ' + (l.open ? "gold-text" : "") + '">' +
            (l.open ? esc(t("duty_open")) : esc(fmtDuration(l.durationMs))) + "</span></div>"
        )
        .join("");
  }
  await load();
};

/* ============================ العمليات ============================ */
let opFilters = { type: "", result: "", participant: "", from: "", to: "" };

ViewsMembers.ops = async function (el) {
  clearViewTimer();
  const canWrite = canWriteOpsUI();
  el.innerHTML =
    pageHead("ops_title", "ops_sub",
      canWrite ? '<button class="btn btn-gold" id="op-new">＋ ' + esc(t("ops_create")) + "</button>" : '<span class="badge badge-mute">' + esc(t("ops_readonly")) + "</span>") +
    '<div class="card" style="margin-bottom:16px"><div class="row">' +
    '<div class="field"><label class="label">' + esc(t("ops_filter_type")) + '</label><select class="input" id="f-type"><option value="">' + esc(t("common_all")) + "</option></select></div>" +
    '<div class="field"><label class="label">' + esc(t("ops_filter_result")) + '</label><select class="input" id="f-result">' +
    '<option value="">' + esc(t("common_all")) + '</option><option value="win">' + esc(t("ops_win")) + '</option><option value="loss">' + esc(t("ops_loss")) + "</option></select></div>" +
    '<div class="field"><label class="label">' + esc(t("ops_filter_participant")) + '</label><select class="input" id="f-part"><option value="">' + esc(t("common_all")) + "</option></select></div>" +
    '<div class="field"><label class="label">' + esc(t("ops_filter_date_from")) + '</label><input type="date" class="input" id="f-from"></div>' +
    '<div class="field"><label class="label">' + esc(t("ops_filter_date_to")) + '</label><input type="date" class="input" id="f-to"></div>' +
    '<div class="field"><label class="label">&nbsp;</label><button class="btn btn-block" id="f-apply">' + esc(t("common_apply")) + "</button></div>" +
    "</div></div>" +
    '<div id="ops-list">' + skeletonList() + "</div>";

  const [types, members] = await Promise.all([
    api("GET", "/api/operation-types"),
    api("GET", "/api/members/list"),
  ]);
  const fType = document.getElementById("f-type");
  const fPart = document.getElementById("f-part");
  types.types.forEach((tp) => {
    fType.insertAdjacentHTML("beforeend", '<option value="' + esc(tp._id) + '">' + esc(tp.name) + "</option>");
  });
  members.users.forEach((m) => {
    fPart.insertAdjacentHTML("beforeend", '<option value="' + esc(m.id) + '">' + esc(m.name) + "</option>");
  });
  if (opFilters.type) fType.value = opFilters.type;
  if (opFilters.result) document.getElementById("f-result").value = opFilters.result;
  if (opFilters.participant) fPart.value = opFilters.participant;
  if (opFilters.from) document.getElementById("f-from").value = opFilters.from;
  if (opFilters.to) document.getElementById("f-to").value = opFilters.to;

  async function load() {
    const box = document.getElementById("ops-list");
    const q = new URLSearchParams();
    opFilters = {
      type: fType.value,
      result: document.getElementById("f-result").value,
      participant: fPart.value,
      from: document.getElementById("f-from").value,
      to: document.getElementById("f-to").value,
    };
    if (opFilters.type) q.set("type", opFilters.type);
    if (opFilters.result) q.set("result", opFilters.result);
    if (opFilters.participant) q.set("participant", opFilters.participant);
    if (opFilters.from) q.set("from", opFilters.from + "T00:00:00");
    if (opFilters.to) q.set("to", opFilters.to + "T23:59:59");
    try {
      const data = await api("GET", "/api/operations" + (q.toString() ? "?" + q.toString() : ""));
      const ops = data.operations || [];
      if (!ops.length) {
        box.innerHTML = emptyBox("⚔", t("ops_empty"));
        return;
      }
      box.innerHTML = ops
        .map((o) => {
          const parts = (o.participants || []).map((p) => esc(p.name)).join("، ");
          return (
            '<div class="card hoverable" style="margin-bottom:12px">' +
            '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
            resultBadge(o.result) +
            '<b class="gold-text">' + esc(o.typeName) + "</b>" +
            '<span class="mono" style="font-weight:900;font-size:17px">' + esc(fmtMoney(o.amount)) + "</span>" +
            '<span class="pill">📅 ' + esc(fmtDateTime(o.date)) + "</span>" +
            '<span class="pill">' + esc(t("ops_made_by")) + ": " + esc(o.createdBy || "-") + "</span>" +
            '<div class="spacer"></div>' +
            (o.canEdit
              ? '<button class="btn btn-sm" data-edit="' + esc(o.id) + '">' + esc(t("common_edit")) + "</button>" +
                '<button class="btn btn-sm btn-red" data-del="' + esc(o.id) + '">' + esc(t("common_delete")) + "</button>"
              : "") +
            "</div>" +
            '<div class="small muted" style="margin-top:8px">👥 ' + esc(parts) + "</div>" +
            (o.notes ? '<div class="small" style="margin-top:6px">' + esc(o.notes) + "</div>" : "") +
            "</div>"
          );
        })
        .join("");

      if (canWrite) {
        box.querySelectorAll("[data-edit]").forEach((b) => {
          b.onclick = () => openOpModal(ops.find((o) => o.id === b.getAttribute("data-edit")), types.types, members.users, load);
        });
        box.querySelectorAll("[data-del]").forEach((b) => {
          b.onclick = async () => {
            if (!confirm(t("ops_delete_confirm"))) return;
            try {
              await api("DELETE", "/api/operations/" + b.getAttribute("data-del"));
              toast(t("ops_deleted"), "success");
              load();
            } catch (e) { toast(errMsg(e), "error"); }
          };
        });
      }
    } catch (e) {
      box.innerHTML = '<div class="card">' + esc(errMsg(e)) + "</div>";
    }
  }

  document.getElementById("f-apply").onclick = load;
  if (canWrite) document.getElementById("op-new").onclick = () => openOpModal(null, types.types, members.users, load);
  await load();
};

function openOpModal(op, types, members, reload) {
  const editing = !!op;
  const now = op ? isoToInputParts(op.date) : isoToInputParts(new Date().toISOString());
  const selected = new Set((op ? op.participants : []).map((p) => String(p.id)));
  const memberRows = members
    .map(
      (m) =>
        '<label style="display:flex;gap:8px;align-items:center;padding:6px 4px;cursor:pointer">' +
        '<input type="checkbox" value="' + esc(m.id) + '" ' + (selected.has(String(m.id)) ? "checked" : "") + ">" +
        "<span>" + esc(m.name) + (m.rank ? ' <span class="badge badge-gold">' + esc(m.rank) + "</span>" : "") + "</span></label>"
    )
    .join("");

  openModal(
    '<div class="modal-head"><h3>' + esc(editing ? t("ops_edit") : t("ops_create")) +
    '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
    '<div class="row">' +
    '<div class="field"><label class="label">' + esc(t("ops_type")) + '</label><select class="input" id="op-type">' +
    types.map((tp) => '<option value="' + esc(tp._id) + '" ' + (op && op.typeId === String(tp._id) ? "selected" : "") + ">" + esc(tp.name) + "</option>").join("") +
    "</select></div>" +
    '<div class="field"><label class="label">' + esc(t("ops_filter_result")) + '</label><select class="input" id="op-result">' +
    '<option value="win" ' + (op && op.result === "win" ? "selected" : "") + ">" + esc(t("ops_win")) + "</option>" +
    '<option value="loss" ' + (op && op.result === "loss" ? "selected" : "") + ">" + esc(t("ops_loss")) + "</option>" +
    "</select></div></div>" +
    '<div class="row">' +
    '<div class="field"><label class="label">' + esc(t("common_date")) + '</label><input type="date" class="input" id="op-date" value="' + esc(now.date) + '"></div>' +
    '<div class="field"><label class="label">' + esc(t("common_time")) + '</label><input type="time" class="input" id="op-time" value="' + esc(now.time) + '"></div>' +
    '<div class="field"><label class="label">' + esc(t("ops_amount")) + '</label><input type="number" min="0" step="1" class="input" id="op-amount" value="' + (op ? op.amount : "") + '"></div>' +
    "</div>" +
    '<div class="field"><label class="label">' + esc(t("common_participants")) + "</label>" +
    '<div style="max-height:190px;overflow-y:auto;border:1px solid var(--line);border-radius:12px;padding:6px">' +
    memberRows + "</div></div>" +
    '<div class="field"><label class="label">' + esc(t("common_notes")) + ' (' + esc(t("common_optional")) + ')</label>' +
    '<textarea class="input" id="op-notes" maxlength="1000">' + esc(op ? op.notes || "" : "") + "</textarea></div>" +
    '<div class="small muted">' + esc(t("ops_target_hint")) + "</div>" +
    '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
    '</button><button class="btn btn-gold" id="op-save">' + esc(t("common_save")) + "</button></div>",
    (root) => {
      root.querySelector("#op-save").onclick = async () => {
        const participants = [...root.querySelectorAll('input[type="checkbox"]:checked')].map((c) => c.value);
        if (!participants.length) return toast(t("err_invalid_participants"), "error");
        const amount = Number(fv("op-amount"));
        if (!Number.isInteger(amount) || amount < 0) return toast(t("err_invalid_input"), "error");
        const payload = {
          typeId: fv("op-type"),
          result: fv("op-result"),
          date: zonedToISO(fv("op-date"), fv("op-time")),
          amount,
          participants,
          notes: fv("op-notes"),
        };
        try {
          if (editing) await api("PATCH", "/api/operations/" + op.id, payload);
          else await api("POST", "/api/operations", payload);
          closeModal();
          toast(t("ops_saved"), "success");
          reload();
        } catch (e) {
          toast(errMsg(e), "error");
        }
      };
    },
    true
  );
}

/* ============================ الهدف الأسبوعي ============================ */
ViewsMembers.target = async function (el) {
  clearViewTimer();
  el.innerHTML = pageHead("target_title", "target_sub",
    isAdminUI() ? '<button class="btn btn-gold" id="tg-set">🎯 ' + esc(t("target_set")) + "</button>" : "") +
    '<div id="tg-main">' + skeleton(2) + "</div>";

  async function load() {
    const [data, hist] = await Promise.all([
      api("GET", "/api/target"),
      api("GET", "/api/target/history"),
    ]);
    const tg = data.target;
    const lb = tg.leaderboard || [];
    document.getElementById("tg-main").innerHTML =
      '<div class="card" style="text-align:center;padding:28px 20px">' +
      '<div class="page-title gold-text" style="font-size:clamp(34px,8vw,54px)">' +
      '<span data-count="' + tg.achieved + '">0</span> <span style="font-size:0.5em">/ ' + esc(fmtMoney(tg.targetAmount)) + "</span></div>" +
      '<div class="small muted" style="margin-bottom:14px">' +
      esc(t("target_win")) + ": " + esc(fmtMoney(tg.win)) + " · " +
      esc(t("target_loss")) + ": " + esc(fmtMoney(tg.loss)) + " · " +
      esc(fmtDate(tg.weekStart)) + " → " + esc(fmtDate(tg.weekEnd)) + "</div>" +
      progressHTML(tg.pct, tg.achieved, tg.targetAmount, tg.reached) +
      '<div class="small muted" style="margin-top:12px">' + esc(t("target_reset_hint")) + "</div>" +
      "</div>" +
      '<div class="grid cols-2" style="margin-top:16px">' +
      '<div class="card"><div class="card-title">🏅 ' + esc(t("target_leaderboard")) + "</div><div>" +
      (lb.length
        ? lb.slice(0, 10).map((r) => lbRowHTML(r.rank, r.user, r.amount, r.ops)).join("")
        : emptyBox("🏅", t("leaderboard_empty"))) +
      "</div></div>" +
      '<div class="card"><div class="card-title">🗂 ' + esc(t("target_history")) + "</div><div>" +
      ((hist.archive || []).length
        ? hist.archive.slice(0, 12).map(historyRowHTML).join("")
        : emptyBox("🗂", t("target_history_empty"))) +
      "</div></div></div>";
    animateBars();
    document.querySelectorAll("[data-count]").forEach((n) => countUp(n, n.getAttribute("data-count")));

    const setBtn = document.getElementById("tg-set");
    if (setBtn)
      setBtn.onclick = () => {
        openModal(
          '<div class="modal-head"><h3>' + esc(t("target_set")) + '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
          '<div class="field"><label class="label">' + esc(t("target_amount")) + '</label>' +
          '<input type="number" min="0" step="1" class="input" id="tg-amount" value="' + tg.targetAmount + '"></div>' +
          '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
          '</button><button class="btn btn-gold" id="tg-save">' + esc(t("common_save")) + "</button></div>",
          (root) => {
            root.querySelector("#tg-save").onclick = async () => {
              const v = Number(fv("tg-amount"));
              if (!Number.isInteger(v) || v < 0) return toast(t("err_invalid_input"), "error");
              try {
                await api("PATCH", "/api/target", { targetAmount: v });
                closeModal();
                toast(t("target_saved"), "success");
                load();
              } catch (e) { toast(errMsg(e), "error"); }
            };
          }
        );
      };
  }
  await load();
};

function lbRowHTML(rank, user, amount, ops) {
  const cls = rank === 1 ? "m1" : rank === 2 ? "m2" : rank === 3 ? "m3" : "mn";
  return (
    '<div class="lb-row ' + (rank <= 3 ? "top" : "") + '">' +
    '<div class="medal ' + cls + '">' + rank + "</div>" +
    avatarHTML(user) +
    "<div><b>" + esc(user.name || "") + '</b><div class="small muted">' + (ops !== undefined ? ops + " " + esc(t("leaderboard_ops")) : "") + "</div></div>" +
    '<div class="lb-amount">' + esc(fmtMoney(amount)) + "</div></div>"
  );
}
function historyRowHTML(a) {
  return (
    '<div class="kv"><span class="k">' + esc(fmtDate(a.weekStart)) + " → " + esc(fmtDate(a.weekEnd)) + "</span>" +
    '<span class="v ' + (a.target > 0 && a.achieved >= a.target ? "amt-in" : "gold-text") + '">' +
    esc(fmtMoney(a.achieved)) + " / " + esc(fmtMoney(a.target)) + " · " + a.pct + "%</span></div>"
  );
}

/* ============================ المزرعة ============================ */
ViewsMembers.farm = async function (el) {
  clearViewTimer();
  const admin = isAdminUI();
  el.innerHTML =
    pageHead("farm_title", "farm_sub",
      admin ? '<button class="btn btn-gold" id="fm-add">＋ ' + esc(t("farm_admin_add")) + "</button>" : "") +
    '<div id="fm-grid" class="farm-grid">' + skeleton(4) + "</div>" +
    '<div class="card" style="margin-top:16px"><div class="card-title">🌾 ' + esc(t("farm_recent_harvests")) +
    '</div><div id="fm-logs">' + skeletonList() + "</div></div>";

  const [farmData, products, members] = await Promise.all([
    api("GET", "/api/farm"),
    admin ? api("GET", "/api/shop/products") : Promise.resolve({ products: [] }),
    admin ? api("GET", "/api/members/list") : Promise.resolve({ users: [] }),
  ]);

  async function load() {
    const data = await api("GET", "/api/farm");
    const grid = document.getElementById("fm-grid");
    if (!data.plots.length) grid.innerHTML = emptyBox("🌿", t("common_none"));
    else
      grid.innerHTML = data.plots
        .map((p) => {
          const stateCls = "state-" + p.status;
          const statusBadge =
            p.status === "empty" ? "badge-mute" : p.status === "planted" ? "badge-gold" : "badge-green";
          return (
            '<div class="plot ' + stateCls + '" data-plot="' + esc(p.id) + '">' +
            '<div class="p-head"><span class="p-title">' + esc(p.name) + "</span>" +
            '<div class="spacer"></div><span class="badge ' + statusBadge + '">' +
            esc(t("farm_status_" + p.status)) + "</span></div>" +
            '<div class="p-loc">📍 ' + esc(p.location || "-") + "</div>" +
            '<div class="p-meta">' +
            (p.assignedTo ? '<span class="badge badge-blue">👤 ' + esc(p.assignedTo.name) + "</span>" : "") +
            (p.product ? '<span class="badge badge-gold">📦 ' + esc(p.product.name) + "</span>" : "") +
            (p.status === "planted" && p.readyAt
              ? '<span class="badge badge-mute" data-countdown="' + esc(p.readyAt) + '">' + esc(t("farm_remaining")) + "</span>"
              : "") +
            (p.status === "ready" && p.readyAt ? '<span class="badge badge-green">✅ ' + esc(fmtDateTime(p.readyAt)) + "</span>" : "") +
            "</div>" +
            '<div class="p-actions">' +
            (p.canPlant ? '<button class="btn btn-gold btn-sm" data-plant="' + esc(p.id) + '">🌱 ' + esc(t("farm_plant")) + "</button>" : "") +
            (p.canHarvest ? '<button class="btn btn-green btn-sm" data-harvest="' + esc(p.id) + '">✂ ' + esc(t("farm_harvest")) + "</button>" : "") +
            (admin
              ? '<button class="btn btn-sm btn-ghost" data-edit="' + esc(p.id) + '">⚙</button>' +
                '<button class="btn btn-sm btn-red" data-del="' + esc(p.id) + '">✕</button>'
              : "") +
            "</div></div>"
          );
        })
        .join("");

    grid.querySelectorAll("[data-plant]").forEach((b) => {
      b.onclick = async () => {
        try {
          await api("POST", "/api/farm/" + b.getAttribute("data-plant") + "/plant");
          toast(t("farm_planted_ok"), "success");
          load();
        } catch (e) { toast(errMsg(e), "error"); }
      };
    });
    grid.querySelectorAll("[data-harvest]").forEach((b) => {
      b.onclick = () => openHarvestModal(b.getAttribute("data-harvest"), load);
    });
    if (admin) {
      grid.querySelectorAll("[data-edit]").forEach((b) => {
        b.onclick = () =>
          openPlotModal(data.plots.find((p) => p.id === b.getAttribute("data-edit")), products.products, members.users, load);
      });
      grid.querySelectorAll("[data-del]").forEach((b) => {
        b.onclick = async () => {
          if (!confirm(t("farm_delete_confirm"))) return;
          try {
            await api("DELETE", "/api/farm/" + b.getAttribute("data-del"));
            load();
          } catch (e) { toast(errMsg(e), "error"); }
        };
      });
    }

    const logs = document.getElementById("fm-logs");
    logs.innerHTML = data.recentHarvests.length
      ? data.recentHarvests
          .map(
            (h) =>
              '<div class="kv"><span class="k">🌿 ' + esc(h.plotName) + " · " + esc(h.by) +
              ' <span class="pill">' + esc(fmtDateTime(h.at)) + '</span></span><span class="v amt-in">+' + h.qty + "</span></div>"
          )
          .join("")
      : emptyBox("🌾", t("farm_harvest_empty"));

    // عدّاد تنازلي حي
    if (viewTimer) clearInterval(viewTimer);
    viewTimer = setInterval(() => {
      document.querySelectorAll("[data-countdown]").forEach((n) => {
        const end = new Date(n.getAttribute("data-countdown")).getTime();
        const left = end - Date.now();
        n.textContent = left > 0 ? "⏳ " + fmtDuration(left) : t("farm_status_ready");
      });
    }, 1000);
  }

  const addBtn = document.getElementById("fm-add");
  if (addBtn) addBtn.onclick = () => openPlotModal(null, products.products, members.users, load);
  await load();
};

function openHarvestModal(plotId, reload) {
  openModal(
    '<div class="modal-head"><h3>' + esc(t("farm_harvest")) + '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
    '<div class="field"><label class="label">' + esc(t("farm_harvest_qty")) + '</label>' +
    '<input type="number" class="input" id="hv-qty" min="1" max="100000" value="1"></div>' +
    '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
    '</button><button class="btn btn-green" id="hv-go">' + esc(t("farm_harvest")) + "</button></div>",
    (root) => {
      root.querySelector("#hv-go").onclick = async () => {
        const qty = Number(fv("hv-qty"));
        if (!Number.isInteger(qty) || qty < 1) return toast(t("err_invalid_input"), "error");
        try {
          await api("POST", "/api/farm/" + plotId + "/harvest", { qty });
          closeModal();
          toast(t("farm_harvest_ok"), "success");
          reload();
        } catch (e) { toast(errMsg(e), "error"); }
      };
    }
  );
}

function openPlotModal(plot, products, members, reload) {
  const editing = !!plot;
  openModal(
    '<div class="modal-head"><h3>' + esc(editing ? t("farm_admin_edit") : t("farm_admin_add")) +
    '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
    '<div class="row">' +
    '<div class="field"><label class="label">' + esc(t("common_name")) + '</label><input class="input" id="pl-name" value="' + esc(editing ? plot.name : "") + '"></div>' +
    '<div class="field"><label class="label">' + esc(t("farm_location")) + '</label><input class="input" id="pl-loc" value="' + esc(editing ? plot.location : "") + '"></div></div>' +
    '<div class="row">' +
    '<div class="field"><label class="label">' + esc(t("farm_assign")) + '</label><select class="input" id="pl-assign"><option value="">' + esc(t("common_none")) + "</option>" +
    members.map((m) => '<option value="' + esc(m.id) + '" ' + (plot && plot.assignedTo && plot.assignedTo.id === m.id ? "selected" : "") + ">" + esc(m.name) + "</option>").join("") +
    "</select></div>" +
    '<div class="field"><label class="label">' + esc(t("farm_product_link")) + '</label><select class="input" id="pl-product"><option value="">' + esc(t("common_none")) + "</option>" +
    products.map((p) => '<option value="' + esc(p._id) + '" ' + (plot && plot.product && plot.product.id === String(p._id) ? "selected" : "") + ">" + esc(p.name) + "</option>").join("") +
    "</select></div></div>" +
    '<div class="field"><label class="label">' + esc(t("farm_grow_minutes")) + '</label>' +
    '<input type="number" min="1" max="10080" class="input" id="pl-grow" value="' + (editing && plot.growMinutes ? plot.growMinutes : (State.config && State.config.growMinutes) || 60) + '"></div>' +
    (editing ? '<label class="switch"><input type="checkbox" id="pl-reset"><span class="track"></span>' + esc(t("farm_reset")) + "</label>" : "") +
    '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
    '</button><button class="btn btn-gold" id="pl-save">' + esc(t("common_save")) + "</button></div>",
    (root) => {
      root.querySelector("#pl-save").onclick = async () => {
        const payload = {
          name: fv("pl-name"),
          location: fv("pl-loc"),
          assignedTo: fv("pl-assign") || null,
          productId: fv("pl-product") || null,
          growMinutes: Number(fv("pl-grow")) || undefined,
        };
        const resetEl = root.querySelector("#pl-reset");
        if (resetEl && resetEl.checked) payload.reset = true;
        try {
          if (editing) await api("PATCH", "/api/farm/" + plot.id, payload);
          else await api("POST", "/api/farm", payload);
          closeModal();
          toast(t("common_save") + " ✓", "success");
          reload();
        } catch (e) { toast(errMsg(e), "error"); }
      };
    },
    true
  );
}

/* ============================ الخزينة ============================ */
ViewsMembers.treasury = async function (el) {
  clearViewTimer();
  const canWrite = canWriteOpsUI();
  el.innerHTML =
    pageHead("treasury_title", "treasury_sub",
      canWrite ? '<button class="btn btn-gold" id="tr-add">＋ ' + esc(t("treasury_add")) + "</button>" : "") +
    '<div class="grid cols-3" id="tr-stats">' + statBox("treasury_balance", 0, "money") +
    statBox("treasury_income", 0, "money") + statBox("treasury_expense", 0, "money") + "</div>" +
    '<div class="card" style="margin-top:16px"><div class="card-title">📈 ' + esc(t("treasury_series")) +
    '</div><div id="tr-chart"></div></div>' +
    '<div class="card" style="margin-top:16px"><div class="card-title">🧾 ' + esc(t("treasury_entries")) +
    '</div><div id="tr-list">' + skeletonList() + "</div></div>";

  const data = await api("GET", "/api/treasury");
  const stats = document.getElementById("tr-stats");
  stats.innerHTML =
    statBox("treasury_balance", data.balance, "money") +
    statBox("treasury_income", data.income, "money") +
    statBox("treasury_expense", data.expense, "money");
  stats.querySelectorAll("[data-count]").forEach((n) => countUp(n, n.getAttribute("data-count")));
  document.getElementById("tr-chart").innerHTML = barChartSVG(data.series || []);

  function renderList(entries) {
    const box = document.getElementById("tr-list");
    if (!entries.length) {
      box.innerHTML = emptyBox("🧾", t("treasury_empty"));
      return;
    }
    box.innerHTML =
      '<div class="table-wrap"><table class="table"><thead><tr><th>' + esc(t("common_date")) +
      "</th><th>" + esc(t("treasury_kind")) + "</th><th>" + esc(t("treasury_category")) +
      "</th><th>" + esc(t("common_amount")) + "</th><th>" + esc(t("treasury_author")) + "</th><th></th></tr></thead><tbody>" +
      entries
        .map(
          (e) =>
            "<tr><td>" + esc(fmtDateTime(e.date)) + "</td>" +
            "<td>" + (e.kind === "income" ? '<span class="badge badge-green">' + esc(t("treasury_income_k")) + '</span>' : '<span class="badge badge-red">' + esc(t("treasury_expense_k")) + "</span>") + "</td>" +
            "<td>" + esc(e.category) + "</td>" +
            '<td class="' + (e.kind === "income" ? "amt-in" : "amt-out") + '">' + (e.kind === "income" ? "+" : "−") + esc(fmtMoney(e.amount)) + "</td>" +
            "<td class=\"small muted\">" + esc(e.author || "-") + "</td>" +
            "<td>" + (isAdminUI() ? '<button class="btn btn-sm btn-red" data-del="' + esc(e.id) + '">✕</button>' : "") + "</td></tr>"
        )
        .join("") +
      "</tbody></table></div>";
    box.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm(t("treasury_delete_confirm"))) return;
        try {
          await api("DELETE", "/api/treasury/" + b.getAttribute("data-del"));
          toast(t("treasury_deleted"), "success");
          ViewsMembers.treasury(el);
        } catch (e) { toast(errMsg(e), "error"); }
      };
    });
  }
  renderList(data.entries);

  const addBtn = document.getElementById("tr-add");
  if (addBtn)
    addBtn.onclick = () => {
      openModal(
        '<div class="modal-head"><h3>' + esc(t("treasury_add")) + '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
        '<div class="row">' +
        '<div class="field"><label class="label">' + esc(t("treasury_kind")) + '</label><select class="input" id="tr-kind">' +
        '<option value="income">' + esc(t("treasury_income_k")) + '</option><option value="expense">' + esc(t("treasury_expense_k")) + "</option></select></div>" +
        '<div class="field"><label class="label">' + esc(t("treasury_category")) + '</label><select class="input" id="tr-cat">' +
        (data.categories || []).map((c) => "<option>" + esc(c) + "</option>").join("") + "</select></div></div>" +
        '<div class="field"><label class="label">' + esc(t("common_amount")) + '</label><input type="number" min="1" step="1" class="input" id="tr-amount"></div>' +
        '<div class="field"><label class="label">' + esc(t("treasury_note_ph")) + '</label><input class="input" id="tr-note" maxlength="500"></div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
        '</button><button class="btn btn-gold" id="tr-save">' + esc(t("common_submit")) + "</button></div>",
        (root) => {
          root.querySelector("#tr-save").onclick = async () => {
            const amount = Number(fv("tr-amount"));
            if (!Number.isInteger(amount) || amount < 1) return toast(t("err_invalid_input"), "error");
            try {
              await api("POST", "/api/treasury", {
                kind: fv("tr-kind"),
                category: fv("tr-cat"),
                amount,
                note: fv("tr-note"),
              });
              closeModal();
              toast(t("treasury_added"), "success");
              ViewsMembers.treasury(el);
            } catch (e) { toast(errMsg(e), "error"); }
          };
        }
      );
    };
};

/* ============================ الملاحظات ============================ */
ViewsMembers.notes = async function (el) {
  clearViewTimer();
  el.innerHTML = pageHead("notes_title", "notes_sub") + '<div id="nt-list">' + skeletonList() + "</div>";
  const data = await api("GET", "/api/notes/mine");
  const box = document.getElementById("nt-list");
  if (!data.notes.length) {
    box.innerHTML = emptyBox("📜", t("notes_empty"));
    return;
  }
  box.innerHTML = data.notes
    .map(
      (n) =>
        '<div class="card hoverable" style="margin-bottom:12px;border-right:4px solid ' +
        (n.type === "fine" ? "var(--red)" : n.type === "warning" ? "var(--gold)" : "var(--blue)") + '">' +
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px">' +
        noteBadge(n.type) +
        (n.type === "fine" ? '<b class="amt-out">' + esc(fmtMoney(n.amount)) + "</b>" +
          (n.deducted ? '<span class="badge badge-red">' + esc(t("notes_deducted")) + "</span>" : "") : "") +
        '<span class="pill">' + esc(fmtDateTime(n.createdAt)) + "</span>" +
        '<div class="spacer"></div><span class="small muted">' + esc(t("notes_from")) + ": " + esc(n.authorName || "-") + "</span></div>" +
        '<div>' + esc(n.content) + "</div></div>"
    )
    .join("");
};

/* ============================ طلباتي ============================ */
ViewsMembers.requests = async function (el) {
  clearViewTimer();
  el.innerHTML =
    pageHead("requests_title", "requests_sub",
      '<button class="btn btn-gold" id="rq-new">＋ ' + esc(t("requests_new")) + "</button>") +
    '<div id="rq-list">' + skeletonList() + "</div>";

  async function load() {
    const data = await api("GET", "/api/requests/mine");
    const box = document.getElementById("rq-list");
    if (!data.requests.length) {
      box.innerHTML = emptyBox("📨", t("requests_empty"));
      return;
    }
    box.innerHTML = data.requests
      .map(
        (r) =>
          '<div class="card hoverable" style="margin-bottom:12px">' +
          '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
          '<span class="badge badge-blue">' + esc(t("requests_type_" + r.type)) + "</span>" +
          statusReqBadge(r.status) +
          '<span class="pill">' + esc(fmtDateTime(r.createdAt)) + "</span></div>" +
          '<div style="margin-top:8px">' + esc(r.message) + "</div>" +
          (r.status !== "pending"
            ? '<div class="divider"></div><div class="small"><b>' + esc(t("requests_response")) + ":</b> " +
              esc(r.response || "-") + ' <span class="pill">(' + esc(t("requests_decided_by")) + " " + esc(r.decidedByName || "-") + ")</span></div>"
            : "") +
          "</div>"
      )
      .join("");
  }

  document.getElementById("rq-new").onclick = () => {
    openModal(
      '<div class="modal-head"><h3>' + esc(t("requests_new")) + '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
      '<div class="field"><label class="label">' + esc(t("requests_type")) + '</label><select class="input" id="rq-type">' +
      ["leave", "promotion", "complaint"].map((k) => '<option value="' + k + '">' + esc(t("requests_type_" + k)) + "</option>").join("") +
      "</select></div>" +
      '<div class="field"><label class="label">' + esc(t("requests_message")) + '</label><textarea class="input" id="rq-msg" maxlength="1000" placeholder="' +
      esc(t("requests_message_ph")) + '"></textarea></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
      '</button><button class="btn btn-gold" id="rq-save">' + esc(t("common_submit")) + "</button></div>",
      (root) => {
        root.querySelector("#rq-save").onclick = async () => {
          try {
            await api("POST", "/api/requests", { type: fv("rq-type"), message: fv("rq-msg") });
            closeModal();
            toast(t("requests_sent"), "success");
            load();
          } catch (e) { toast(errMsg(e), "error"); }
        };
      }
    );
  };
  await load();
};

/* ============================ متجر الأعضاء ============================ */
ViewsMembers.istore = async function (el) {
  clearViewTimer();
  el.innerHTML =
    pageHead("istore_title", "istore_sub") +
    '<div class="grid cols-3" id="is-top"></div>' +
    '<div class="product-grid" id="is-grid" style="margin-top:16px">' + skeleton(4) + "</div>" +
    '<div class="card" style="margin-top:16px"><div class="card-title">🛍 ' + esc(t("istore_my_purchases")) +
    '</div><div id="is-hist">' + skeletonList() + "</div></div>";

  const [itemsData, histData] = await Promise.all([
    api("GET", "/api/istore/items"),
    api("GET", "/api/istore/purchases"),
  ]);

  document.getElementById("is-top").innerHTML =
    '<div class="stat"><div class="k">' + esc(t("istore_balance")) + '</div><div class="v"><span data-count="' +
    itemsData.balance + '">0</span></div></div>';
  document.getElementById("is-top").querySelectorAll("[data-count]").forEach((n) => countUp(n, n.getAttribute("data-count")));

  const grid = document.getElementById("is-grid");
  if (!itemsData.items.length) grid.innerHTML = emptyBox("🛍", t("istore_empty"));
  else
    grid.innerHTML = itemsData.items
      .map(
        (it) =>
          '<div class="product"><div class="p-img">' + (it.image ? '<img src="' + esc(it.image) + '" alt="">' : "🎁") +
          (it.stock === 0 ? '<span class="p-stock"><span class="badge badge-red">' + esc(t("shop_out")) + "</span></span>" : "") +
          "</div>" +
          '<div class="p-body"><div class="p-name">' + esc(it.name) + "</div>" +
          '<div class="p-desc">' + esc(it.description || "") + "</div>" +
          '<div class="p-price">' + esc(fmtMoney(it.price)) + "</div>" +
          '<button class="btn ' + (it.stock === 0 ? "btn-ghost" : "btn-gold") + '" data-buy="' + esc(it._id) + '"' +
          (it.stock === 0 ? " disabled" : "") + ">" + esc(it.stock === 0 ? t("shop_out") : t("istore_buy")) + "</button>" +
          "</div></div>"
      )
      .join("");

  grid.querySelectorAll("[data-buy]").forEach((b) => {
    b.onclick = () => {
      const item = itemsData.items.find((x) => String(x._id) === b.getAttribute("data-buy"));
      if (!item) return;
      openModal(
        '<div class="modal-head"><h3>' + esc(t("istore_buy")) + '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
        "<p>" + esc(t("istore_qty_confirm", { name: item.name, price: fmtMoney(item.price) })) + "</p>" +
        '<div class="field"><label class="label">' + esc(t("common_qty")) + '</label><input type="number" class="input" id="is-qty" min="1" max="50" value="1"></div>' +
        '<div class="kv"><span class="k">' + esc(t("istore_balance")) + '</span><span class="v gold-text">' + esc(fmtMoney(itemsData.balance)) + "</span></div>" +
        '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
        '</button><button class="btn btn-gold" id="is-go">' + esc(t("common_confirm")) + "</button></div>",
        (root) => {
          root.querySelector("#is-go").onclick = async () => {
            const qty = Number(fv("is-qty"));
            if (!Number.isInteger(qty) || qty < 1) return toast(t("err_invalid_input"), "error");
            try {
              const r = await api("POST", "/api/istore/purchase", { itemId: item._id, qty });
              closeModal();
              toast(t("istore_bought") + " · " + t("common_balance") + ": " + fmtMoney(r.balance), "success");
              ViewsMembers.istore(el);
            } catch (e) { toast(errMsg(e), "error"); }
          };
        }
      );
    };
  });

  const hist = document.getElementById("is-hist");
  if (!histData.purchases.length) hist.innerHTML = emptyBox("🛍", t("istore_no_purchases"));
  else
    hist.innerHTML = histData.purchases
      .map(
        (p) =>
          '<div class="kv"><span class="k">' + esc(p.name) + " × " + p.qty +
          ' <span class="pill">' + esc(fmtDateTime(p.createdAt)) + '</span></span><span class="v amt-out">−' + esc(fmtMoney(p.total)) + "</span></div>"
      )
      .join("");
};

/* ============================ لوحة الصدارة ============================ */
ViewsMembers.leaderboard = async function (el) {
  clearViewTimer();
  el.innerHTML = pageHead("leaderboard_title", "leaderboard_sub") + '<div id="lb-list">' + skeletonList() + "</div>";
  const data = await api("GET", "/api/leaderboard");
  const box = document.getElementById("lb-list");
  if (!data.leaderboard.length) {
    box.innerHTML = emptyBox("🏅", t("leaderboard_empty"));
    return;
  }
  box.innerHTML = data.leaderboard.map((r) => lbRowHTML(r.rank, r.user, r.amount, r.ops)).join("");
};

/* ============================ البطاقة ============================ */
ViewsMembers.card = async function (el) {
  clearViewTimer();
  el.innerHTML = pageHead("card_title", "card_sub") + '<div id="cd-box">' + skeleton(2) + "</div>";
  const data = await api("GET", "/api/card");
  const c = data.card;
  document.getElementById("cd-box").innerHTML =
    '<div class="idcard">' +
    '<div class="ic-top">' +
    avatarHTML(c.user, "ic-ava") +
    "<div><div class=\"ic-name\">" + esc(c.user.name) + "</div>" +
    '<div class="ic-rank">♛ ' + esc(c.rank ? c.rank.name : t("card_no_rank")) + "</div>" +
    '<div class="small muted">' + esc((State.config && State.config.name) || "") + "</div></div></div>" +
    '<div class="ic-grid">' +
    icCell(t("card_join"), fmtDate(c.user.joinedAt)) +
    icCell(t("card_duty"), fmtNum(c.stats.dutyCount)) +
    icCell(t("card_ops"), fmtNum(c.stats.operations)) +
    icCell(t("card_wins"), fmtNum(c.stats.wins)) +
    icCell(t("card_harvests"), fmtNum(c.stats.harvests)) +
    icCell(t("card_balance"), fmtMoney(c.stats.balance)) +
    "</div>" +
    '<div class="ic-foot"><span>' + esc(t("card_id")) + ': <b class="mono">' + esc(c.user.discordId) + "</b></span>" +
    '<button class="btn btn-sm btn-ghost" id="cd-copy">' + esc(t("card_copy")) + "</button></div>" +
    "</div>";
  document.getElementById("cd-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(c.user.discordId);
      toast(t("card_copied"), "success");
    } catch (e) {
      toast(c.user.discordId);
    }
  };
};
function icCell(k, v) {
  return '<div class="ic-cell"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + "</div></div>";
}
