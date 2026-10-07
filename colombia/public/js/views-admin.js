/* ============================================================
   VIEWS - لوحة التحكم (Admin)
   ============================================================ */
const ViewsAdmin = {};
let adminTab = "overview";
let adminUserQuery = "";
let adminAuditPage = 0;

const ADMIN_TABS = [
  ["overview", "admin_tab_overview"],
  ["members", "admin_tab_members"],
  ["ranks", "admin_tab_ranks"],
  ["products", "admin_tab_products"],
  ["categories", "admin_tab_categories"],
  ["orders", "admin_tab_orders"],
  ["istore", "admin_tab_istore"],
  ["announcements", "admin_tab_announcements"],
  ["optypes", "admin_tab_optypes"],
  ["requests", "admin_tab_requests"],
  ["notes", "admin_tab_notes"],
  ["audit", "admin_tab_audit"],
  ["settings", "admin_tab_settings"],
];

ViewsAdmin.dashboard = async function (el) {
  clearViewTimer();
  el.innerHTML =
    pageHead("admin_title", "admin_sub") +
    '<div class="tabs" id="admin-tabs">' +
    ADMIN_TABS.map(
      (k) => '<button class="tab ' + (adminTab === k[0] ? "on" : "") + '" data-tab="' + k[0] + '">' + esc(t(k[1])) + "</button>"
    ).join("") +
    "</div>" +
    '<div id="admin-body">' + skeleton(3) + "</div>";

  const body = document.getElementById("admin-body");
  document.querySelectorAll("#admin-tabs [data-tab]").forEach((b) => {
    b.onclick = () => {
      adminTab = b.getAttribute("data-tab");
      document.querySelectorAll("#admin-tabs .tab").forEach((x) => x.classList.toggle("on", x.getAttribute("data-tab") === adminTab));
      body.innerHTML = skeleton(3);
      renderAdminTab(body);
    };
  });
  await renderAdminTab(body);
};

async function renderAdminTab(body) {
  try {
    switch (adminTab) {
      case "overview": return await adminOverview(body);
      case "members": return await adminMembers(body);
      case "ranks": return await adminRanks(body);
      case "products": return await adminProducts(body);
      case "categories": return await adminCategories(body);
      case "orders": return await adminOrders(body);
      case "istore": return await adminIstore(body);
      case "announcements": return await adminAnnouncements(body);
      case "optypes": return await adminOpTypes(body);
      case "requests": return await adminRequests(body);
      case "notes": return await adminNotes(body);
      case "audit": return await adminAudit(body);
      case "settings": return await adminSettings(body);
      default: return await adminOverview(body);
    }
  } catch (e) {
    body.innerHTML = '<div class="card">' + esc(errMsg(e)) + "</div>";
  }
}

/* --------------------------- نظرة عامة --------------------------- */
async function adminOverview(body) {
  const data = await api("GET", "/api/admin/overview");
  const s = data.stats;
  body.innerHTML =
    '<div class="grid cols-3">' +
    '<div class="stat"><div class="k">' + esc(t("admin_stat_users")) + '</div><div class="v"><span data-count="' + s.users + '">0</span></div></div>' +
    '<div class="stat"><div class="k">' + esc(t("admin_stat_orders")) + '</div><div class="v"><span data-count="' + s.newOrders + '">0</span></div></div>' +
    '<div class="stat"><div class="k">' + esc(t("admin_stat_requests")) + '</div><div class="v"><span data-count="' + s.pendingRequests + '">0</span></div></div>' +
    '<div class="stat"><div class="k">' + esc(t("admin_stat_products")) + '</div><div class="v"><span data-count="' + s.products + '">0</span></div></div>' +
    '<div class="stat"><div class="k">' + esc(t("admin_stat_plots")) + '</div><div class="v"><span data-count="' + s.plots + '">0</span></div></div>' +
    '<div class="stat"><div class="k">' + esc(t("admin_stat_notes")) + '</div><div class="v"><span data-count="' + s.notes + '">0</span></div></div>' +
    "</div>";
  body.querySelectorAll("[data-count]").forEach((n) => countUp(n, n.getAttribute("data-count")));
}

/* --------------------------- الأعضاء والرتب --------------------------- */
async function adminMembers(body) {
  const [data, membersList] = await Promise.all([
    api("GET", "/api/admin/users" + (adminUserQuery ? "?q=" + encodeURIComponent(adminUserQuery) : "")),
    api("GET", "/api/members/list").catch(() => ({ users: [] })),
  ]);
  void membersList;
  const ranksAsc = (data.ranks || []).slice().sort((a, b) => a.level - b.level);

  body.innerHTML =
    '<div class="row" style="margin-bottom:14px">' +
    '<input class="input" id="am-q" placeholder="' + esc(t("admin_search_users")) + '" value="' + esc(adminUserQuery) + '">' +
    '<button class="btn" id="am-search" style="flex:0 0 auto">' + esc(t("common_search")) + "</button></div>" +
    '<div class="table-wrap"><table class="table"><thead><tr><th>' + esc(t("admin_user")) +
    "</th><th>" + esc(t("common_role")) + "</th><th>" + esc(t("common_rank")) +
    "</th><th>" + esc(t("common_balance")) + "</th><th>" + esc(t("admin_last_login")) +
    "</th><th>" + esc(t("common_actions")) + "</th></tr></thead><tbody id=\"am-rows\"></tbody></table></div>";

  const rows = document.getElementById("am-rows");
  if (!data.users.length) rows.innerHTML = '<tr><td colspan="6">' + esc(t("common_none")) + "</td></tr>";
  else
    rows.innerHTML = data.users
      .map((u) => {
        const curIdx = u.rank ? ranksAsc.findIndex((r) => String(r._id) === u.rank.id) : -1;
        return (
          '<tr><td><div style="display:flex;gap:9px;align-items:center">' + avatarHTML(u) +
          "<div><b>" + esc(u.name) + '</b><div class="small muted mono">' + esc(u.discordId) + "</div></div></div></td>" +
          "<td>" + roleBadges(u.flags) + "</td>" +
          "<td>" + (u.rank ? '<span class="badge badge-gold">' + esc(u.rank.name) + "</span>" : '<span class="muted">—</span>') + "</td>" +
          '<td class="gold-text mono">' + esc(fmtMoney(u.balance)) + "</td>" +
          '<td class="small muted">' + esc(u.lastLogin ? fmtDateTime(u.lastLogin) : "-") + "</td>" +
          "<td><div style=\"display:flex;gap:5px;flex-wrap:wrap\">" +
          '<button class="btn btn-sm" data-promote="' + esc(u.id) + '" ' + (curIdx < 0 || curIdx >= ranksAsc.length - 1 ? "disabled" : "") + ">▲</button>" +
          '<button class="btn btn-sm" data-demote="' + esc(u.id) + '" ' + (curIdx <= 0 ? "disabled" : "") + ">▼</button>" +
          '<button class="btn btn-sm btn-ghost" data-rank="' + esc(u.id) + '">♛</button>' +
          '<button class="btn btn-sm btn-ghost" data-bal="' + esc(u.id) + '">💰</button>' +
          '<button class="btn btn-sm btn-red" data-kick="' + esc(u.id) + '">⎋</button>' +
          "</div></td></tr>"
        );
      })
      .join("");

  document.getElementById("am-search").onclick = () => {
    adminUserQuery = document.getElementById("am-q").value.trim();
    adminMembers(body);
  };

  async function patch(userId, payload) {
    try {
      await api("PATCH", "/api/admin/users/" + userId, payload);
      toast("✓", "success");
      adminMembers(body);
    } catch (e) { toast(errMsg(e), "error"); }
  }

  rows.querySelectorAll("[data-promote]").forEach((b) => {
    b.onclick = () => {
      const u = data.users.find((x) => x.id === b.getAttribute("data-promote"));
      const idx = u.rank ? ranksAsc.findIndex((r) => String(r._id) === u.rank.id) : -1;
      const next = ranksAsc[idx + 1];
      if (next) patch(u.id, { action: "setRank", rankId: String(next._id) }).then(() => toast(t("admin_rank_saved"), "success"));
    };
  });
  rows.querySelectorAll("[data-demote]").forEach((b) => {
    b.onclick = () => {
      const u = data.users.find((x) => x.id === b.getAttribute("data-demote"));
      const idx = u.rank ? ranksAsc.findIndex((r) => String(r._id) === u.rank.id) : -1;
      const prev = idx > 0 ? ranksAsc[idx - 1] : null;
      patch(u.id, { action: "setRank", rankId: prev ? String(prev._id) : null }).then(() => toast(t("admin_rank_saved"), "success"));
    };
  });
  rows.querySelectorAll("[data-rank]").forEach((b) => {
    b.onclick = () => {
      const u = data.users.find((x) => x.id === b.getAttribute("data-rank"));
      openModal(
        '<div class="modal-head"><h3>' + esc(t("admin_set_rank")) + '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
        '<div class="field"><label class="label">' + esc(t("common_rank")) + '</label><select class="input" id="mk-rank"><option value="">' +
        esc(t("admin_no_rank")) + "</option>" +
        ranksAsc.map((r) => '<option value="' + esc(r._id) + '" ' + (u.rank && u.rank.id === String(r._id) ? "selected" : "") + ">" + esc(r.name) + "</option>").join("") +
        "</select></div>" +
        '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
        '</button><button class="btn btn-gold" id="mk-save">' + esc(t("common_save")) + "</button></div>",
        (root) => {
          root.querySelector("#mk-save").onclick = async () => {
            const v = fv("mk-rank");
            await patch(u.id, { action: "setRank", rankId: v || null });
            closeModal();
            toast(t("admin_rank_saved"), "success");
          };
        }
      );
    };
  });
  rows.querySelectorAll("[data-bal]").forEach((b) => {
    b.onclick = () => {
      const u = data.users.find((x) => x.id === b.getAttribute("data-bal"));
      openModal(
        '<div class="modal-head"><h3>' + esc(t("admin_adjust_balance")) + " - " + esc(u.name) +
        '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
        '<div class="kv"><span class="k">' + esc(t("common_balance")) + '</span><span class="v gold-text">' + esc(fmtMoney(u.balance)) + "</span></div>" +
        '<div class="field" style="margin-top:12px"><label class="label">' + esc(t("admin_balance_delta")) + '</label>' +
        '<input type="number" step="1" class="input" id="mb-delta" placeholder="+500 / -200"></div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
        '</button><button class="btn btn-gold" id="mb-set">' + esc(t("common_save")) + "</button></div>",
        (root) => {
          root.querySelector("#mb-set").onclick = async () => {
            const v = Number(fv("mb-delta"));
            if (!Number.isInteger(v) || v === 0) return toast(t("err_invalid_amount"), "error");
            await patch(u.id, { action: v > 0 || v < 0 ? "adjustBalance" : "adjustBalance", amount: v });
            closeModal();
            toast(t("admin_balance_saved"), "success");
          };
        }
      );
    };
  });
  rows.querySelectorAll("[data-kick]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm(t("admin_kick_confirm"))) return;
      await patch(b.getAttribute("data-kick"), { action: "kick" });
      toast(t("admin_kicked"), "success");
    };
  });
}

/* --------------------------- الرتب --------------------------- */
async function adminRanks(body) {
  const data = await api("GET", "/api/admin/ranks");
  body.innerHTML =
    '<div style="margin-bottom:14px"><button class="btn btn-gold" id="rk-add">＋ ' + esc(t("admin_rank_add")) + "</button></div>" +
    '<div class="table-wrap"><table class="table"><thead><tr><th>' + esc(t("common_name")) +
    "</th><th>" + esc(t("admin_rank_level")) + "</th><th></th></tr></thead><tbody>" +
    (data.ranks || [])
      .map(
        (r) =>
          "<tr><td><b>" + esc(r.name) + "</b></td><td>" + r.level + "</td>" +
          '<td><div style="display:flex;gap:6px;justify-content:flex-end">' +
          '<button class="btn btn-sm" data-edit="' + esc(r._id) + '">' + esc(t("common_edit")) + "</button>" +
          '<button class="btn btn-sm btn-red" data-del="' + esc(r._id) + '">' + esc(t("common_delete")) + "</button></div></td></tr>"
      )
      .join("") +
    "</tbody></table></div>";

  function rankModal(rank) {
    openModal(
      '<div class="modal-head"><h3>' + esc(rank ? t("common_edit") : t("admin_rank_add")) +
      '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
      '<div class="field"><label class="label">' + esc(t("common_name")) + '</label><input class="input" id="r-n" value="' + esc(rank ? rank.name : "") + '"></div>' +
      '<div class="field"><label class="label">' + esc(t("admin_rank_level")) + '</label><input type="number" class="input" id="r-l" value="' + (rank ? rank.level : 10) + '"></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
      '</button><button class="btn btn-gold" id="r-s">' + esc(t("common_save")) + "</button></div>",
      (root) => {
        root.querySelector("#r-s").onclick = async () => {
          const payload = { name: fv("r-n"), level: Number(fv("r-l")) };
          try {
            if (rank) await api("PATCH", "/api/admin/ranks/" + rank._id, payload);
            else await api("POST", "/api/admin/ranks", payload);
            closeModal();
            toast(t("admin_rank_saved"), "success");
            adminRanks(body);
          } catch (e) { toast(errMsg(e), "error"); }
        };
      }
    );
  }
  document.getElementById("rk-add").onclick = () => rankModal(null);
  body.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => rankModal(data.ranks.find((r) => String(r._id) === b.getAttribute("data-edit")))));
  body.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm(t("admin_rank_delete_confirm"))) return;
      try {
        await api("DELETE", "/api/admin/ranks/" + b.getAttribute("data-del"));
        adminRanks(body);
      } catch (e) { toast(errMsg(e), "error"); }
    };
  });
}

/* --------------------------- المنتجات --------------------------- */
async function adminProducts(body) {
  const [data, cats] = await Promise.all([
    api("GET", "/api/admin/products"),
    api("GET", "/api/admin/categories"),
  ]);

  body.innerHTML =
    '<div style="margin-bottom:14px"><button class="btn btn-gold" id="pd-add">＋ ' + esc(t("admin_product_add")) + "</button></div>" +
    '<div class="table-wrap"><table class="table"><thead><tr><th>' + esc(t("common_name")) +
    "</th><th>" + esc(t("common_category")) + "</th><th>" + esc(t("common_price")) +
    "</th><th>" + esc(t("admin_stock")) + "</th><th>" + esc(t("common_status")) +
    "</th><th></th></tr></thead><tbody>" +
    (data.products || [])
      .map(
        (p) =>
          "<tr><td><b>" + esc(p.name) + "</b></td>" +
          "<td>" + esc(p.category ? p.category.name : "-") + "</td>" +
          '<td class="gold-text mono">' + esc(fmtMoney(p.price)) + "</td>" +
          '<td class="mono ' + (p.stock <= 0 ? "amt-out" : "") + '">' + p.stock + "</td>" +
          "<td>" + (p.active ? '<span class="badge badge-green">' + esc(t("common_active")) + '</span>' : '<span class="badge badge-mute">' + esc(t("common_inactive")) + "</span>") + "</td>" +
          '<td><div style="display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap">' +
          '<button class="btn btn-sm" data-stock="' + esc(p._id) + '">📦</button>' +
          '<button class="btn btn-sm" data-edit="' + esc(p._id) + '">' + esc(t("common_edit")) + "</button>" +
          '<button class="btn btn-sm btn-red" data-del="' + esc(p._id) + '">' + esc(t("common_delete")) + "</button></div></td></tr>"
      )
      .join("") +
    "</tbody></table></div>";

  function productModal(p) {
    const editing = !!p;
    openModal(
      '<div class="modal-head"><h3>' + esc(editing ? t("admin_product_edit") : t("admin_product_add")) +
      '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
      '<div class="row"><div class="field"><label class="label">' + esc(t("common_name")) + '</label><input class="input" id="p-n" value="' + esc(editing ? p.name : "") + '"></div>' +
      '<div class="field"><label class="label">' + esc(t("common_price")) + '</label><input type="number" min="0" step="1" class="input" id="p-pr" value="' + (editing ? p.price : "") + '"></div></div>' +
      '<div class="row"><div class="field"><label class="label">' + esc(t("admin_stock")) + '</label><input type="number" min="0" step="1" class="input" id="p-st" value="' + (editing ? p.stock : 0) + '"></div>' +
      '<div class="field"><label class="label">' + esc(t("common_category")) + '</label><select class="input" id="p-c"><option value="">' + esc(t("common_none")) + "</option>" +
      cats.categories.map((c) => '<option value="' + esc(c._id) + '" ' + (editing && p.category && String(p.category._id) === String(c._id) ? "selected" : "") + ">" + esc(c.name) + "</option>").join("") +
      "</select></div></div>" +
      '<div class="field"><label class="label">' + esc(t("common_description")) + '</label><textarea class="input" id="p-d">' + esc(editing ? p.description || "" : "") + "</textarea></div>" +
      '<div class="field"><label class="label">' + esc(t("common_image")) + '</label><input class="input" id="p-img" value="' + esc(editing ? p.image || "" : "") + '" placeholder="https://...">' +
      '<div style="margin-top:8px;display:flex;gap:8px;align-items:center">' +
      '<input type="file" accept="image/*" id="p-file" class="input" style="padding:7px">' +
      '<button class="btn btn-sm" id="p-up">' + esc(t("admin_upload")) + "</button></div></div>" +
      '<label class="switch"><input type="checkbox" id="p-a" ' + (!editing || p.active ? "checked" : "") + '><span class="track"></span>' + esc(t("common_active")) + "</label>" +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
      '</button><button class="btn btn-gold" id="p-s">' + esc(t("common_save")) + "</button></div>",
      (root) => {
        root.querySelector("#p-up").onclick = async () => {
          const file = root.querySelector("#p-file").files[0];
          if (!file) return;
          const fd = new FormData();
          fd.append("image", file);
          root.querySelector("#p-up").disabled = true;
          try {
            const r = await fetch("/api/admin/upload", {
              method: "POST",
              credentials: "same-origin",
              headers: { "x-csrf-token": State.csrf || "" },
              body: fd,
            });
            const j = await r.json();
            if (!r.ok) throw { code: j.error || "invalid_file" };
            root.querySelector("#p-img").value = j.url;
            toast(t("admin_upload") + " ✓", "success");
          } catch (e) { toast(errMsg(e), "error"); }
          root.querySelector("#p-up").disabled = false;
        };
        root.querySelector("#p-s").onclick = async () => {
          const payload = {
            name: fv("p-n"),
            price: Number(fv("p-pr")),
            stock: Number(fv("p-st")),
            categoryId: fv("p-c") || null,
            description: fv("p-d"),
            image: fv("p-img"),
            active: root.querySelector("#p-a").checked,
          };
          try {
            if (editing) await api("PATCH", "/api/admin/products/" + p._id, payload);
            else await api("POST", "/api/admin/products", payload);
            closeModal();
            toast(t("admin_product_saved"), "success");
            adminProducts(body);
          } catch (e) { toast(errMsg(e), "error"); }
        };
      },
      true
    );
  }

  document.getElementById("pd-add").onclick = () => productModal(null);
  body.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => productModal(data.products.find((x) => String(x._id) === b.getAttribute("data-edit")))));
  body.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm(t("admin_product_delete_confirm"))) return;
      try {
        await api("DELETE", "/api/admin/products/" + b.getAttribute("data-del"));
        adminProducts(body);
      } catch (e) { toast(errMsg(e), "error"); }
    };
  });
  body.querySelectorAll("[data-stock]").forEach((b) => {
    b.onclick = () => {
      const p = data.products.find((x) => String(x._id) === b.getAttribute("data-stock"));
      openModal(
        '<div class="modal-head"><h3>' + esc(t("admin_stock_adjust")) + " - " + esc(p.name) +
        '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
        '<div class="kv"><span class="k">' + esc(t("admin_stock")) + '</span><span class="v mono">' + p.stock + "</span></div>" +
        '<div class="field" style="margin-top:10px"><label class="label">' + esc(t("admin_stock_delta")) + '</label>' +
        '<input type="number" step="1" class="input" id="s-d" placeholder="+10 / -5"></div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
        '</button><button class="btn btn-gold" id="s-s">' + esc(t("common_save")) + "</button></div>",
        (root) => {
          root.querySelector("#s-s").onclick = async () => {
            const v = Number(fv("s-d"));
            if (!Number.isInteger(v) || v === 0) return toast(t("err_invalid_input"), "error");
            try {
              await api("POST", "/api/admin/products/" + p._id + "/stock", { delta: v });
              closeModal();
              toast(t("admin_stock_saved"), "success");
              adminProducts(body);
            } catch (e) { toast(errMsg(e), "error"); }
          };
        }
      );
    };
  });
}

/* --------------------------- الفئات --------------------------- */
async function adminCategories(body) {
  const data = await api("GET", "/api/admin/categories");
  body.innerHTML =
    '<div class="row" style="margin-bottom:14px">' +
    '<input class="input" id="ct-n" placeholder="' + esc(t("admin_category_add")) + '">' +
    '<button class="btn btn-gold" id="ct-add" style="flex:0 0 auto">' + esc(t("common_add")) + "</button></div>" +
    '<div class="table-wrap"><table class="table"><thead><tr><th>' + esc(t("common_name")) + "</th><th></th></tr></thead><tbody>" +
    (data.categories || [])
      .map(
        (c) =>
          "<tr><td><b>" + esc(c.name) + "</b></td>" +
          '<td><div style="display:flex;gap:6px;justify-content:flex-end">' +
          '<button class="btn btn-sm ' + (c.active ? "" : "btn-ghost") + '" data-toggle="' + esc(c._id) + '" data-val="' + (c.active ? "0" : "1") + '">' +
          esc(c.active ? t("common_active") : t("common_inactive")) + "</button>" +
          '<button class="btn btn-sm btn-red" data-del="' + esc(c._id) + '">' + esc(t("common_delete")) + "</button></div></td></tr>"
      )
      .join("") +
    "</tbody></table></div>";

  document.getElementById("ct-add").onclick = async () => {
    try {
      await api("POST", "/api/admin/categories", { name: fv("ct-n") });
      toast(t("admin_category_saved"), "success");
      adminCategories(body);
    } catch (e) { toast(errMsg(e), "error"); }
  };
  body.querySelectorAll("[data-toggle]").forEach((b) => {
    b.onclick = async () => {
      await api("PATCH", "/api/admin/categories/" + b.getAttribute("data-toggle"), { active: b.getAttribute("data-val") === "1" });
      adminCategories(body);
    };
  });
  body.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm(t("admin_category_delete_confirm"))) return;
      await api("DELETE", "/api/admin/categories/" + b.getAttribute("data-del"));
      adminCategories(body);
    };
  });
}

/* --------------------------- طلبات المتجر --------------------------- */
async function adminOrders(body) {
  const data = await api("GET", "/api/admin/orders");
  body.innerHTML =
    '<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>' + esc(t("admin_order_customer")) +
    "</th><th>" + esc(t("admin_order_items")) + "</th><th>" + esc(t("admin_order_total")) +
    "</th><th>" + esc(t("common_status")) + "</th><th>" + esc(t("common_date")) + "</th></tr></thead><tbody>" +
    (data.orders || [])
      .map(
        (o) =>
          "<tr><td class=\"mono\">#" + esc(String(o._id).slice(-6).toUpperCase()) + "</td>" +
          "<td><b>" + esc(o.user ? o.user.globalName || o.user.username : "-") + '</b><div class="small muted mono">' + esc(o.ingameId || "") + "</div></td>" +
          '<td class="small">' + (o.items || []).map((i) => esc(i.name) + " ×" + i.qty).join("<br>") + "</td>" +
          '<td class="gold-text mono">' + esc(fmtMoney(o.total)) + "</td>" +
          '<td><select class="input" style="min-height:36px;padding:5px 8px" data-oid="' + esc(o._id) + '">' +
          ["new", "preparing", "delivered", "cancelled"]
            .map((s) => '<option value="' + s + '" ' + (o.status === s ? "selected" : "") + ">" + esc(t("shop_status_" + s)) + "</option>")
            .join("") +
          "</select></td>" +
          '<td class="small muted">' + esc(fmtDateTime(o.createdAt)) + "</td></tr>"
      )
      .join("") +
    "</tbody></table></div>";

  body.querySelectorAll("[data-oid]").forEach((sel) => {
    sel.onchange = async () => {
      try {
        await api("PATCH", "/api/admin/orders/" + sel.getAttribute("data-oid"), { status: sel.value });
        toast(t("admin_order_saved"), "success");
      } catch (e) {
        toast(errMsg(e), "error");
        adminOrders(body);
      }
    };
  });
}

/* --------------------------- متجر الأعضاء --------------------------- */
async function adminIstore(body) {
  const data = await api("GET", "/api/admin/istore-items");
  body.innerHTML =
    '<div style="margin-bottom:14px"><button class="btn btn-gold" id="is-add">＋ ' + esc(t("admin_istore_add")) + "</button></div>" +
    '<div class="table-wrap"><table class="table"><thead><tr><th>' + esc(t("common_name")) +
    "</th><th>" + esc(t("common_price")) + "</th><th>" + esc(t("admin_istore_stock")) +
    "</th><th>" + esc(t("common_status")) + "</th><th></th></tr></thead><tbody>" +
    (data.items || [])
      .map(
        (it) =>
          "<tr><td><b>" + esc(it.name) + "</b></td>" +
          '<td class="gold-text mono">' + esc(fmtMoney(it.price)) + "</td>" +
          "<td>" + (it.stock < 0 ? esc(t("common_unlimited")) : it.stock) + "</td>" +
          "<td>" + (it.active ? '<span class="badge badge-green">' + esc(t("common_active")) + '</span>' : '<span class="badge badge-mute">' + esc(t("common_inactive")) + "</span>") + "</td>" +
          '<td><div style="display:flex;gap:5px;justify-content:flex-end">' +
          '<button class="btn btn-sm" data-edit="' + esc(it._id) + '">' + esc(t("common_edit")) + "</button>" +
          '<button class="btn btn-sm btn-red" data-del="' + esc(it._id) + '">' + esc(t("common_delete")) + "</button></div></td></tr>"
      )
      .join("") +
    "</tbody></table></div>";

  function itemModal(it) {
    const editing = !!it;
    openModal(
      '<div class="modal-head"><h3>' + esc(editing ? t("common_edit") : t("admin_istore_add")) +
      '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
      '<div class="field"><label class="label">' + esc(t("common_name")) + '</label><input class="input" id="i-n" value="' + esc(editing ? it.name : "") + '"></div>' +
      '<div class="row"><div class="field"><label class="label">' + esc(t("common_price")) + '</label><input type="number" min="0" class="input" id="i-p" value="' + (editing ? it.price : "") + '"></div>' +
      '<div class="field"><label class="label">' + esc(t("admin_istore_stock")) + '</label><input type="number" min="-1" class="input" id="i-s" value="' + (editing ? it.stock : -1) + '"></div></div>' +
      '<div class="field"><label class="label">' + esc(t("common_description")) + '</label><textarea class="input" id="i-d">' + esc(editing ? it.description || "" : "") + "</textarea></div>" +
      '<label class="switch"><input type="checkbox" id="i-a" ' + (!editing || it.active ? "checked" : "") + '><span class="track"></span>' + esc(t("common_active")) + "</label>" +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
      '</button><button class="btn btn-gold" id="i-sv">' + esc(t("common_save")) + "</button></div>",
      (root) => {
        root.querySelector("#i-sv").onclick = async () => {
          const payload = {
            name: fv("i-n"),
            price: Number(fv("i-p")),
            stock: Number(fv("i-s")),
            description: fv("i-d"),
            active: root.querySelector("#i-a").checked,
          };
          try {
            if (editing) await api("PATCH", "/api/admin/istore-items/" + it._id, payload);
            else await api("POST", "/api/admin/istore-items", payload);
            closeModal();
            toast(t("admin_istore_saved"), "success");
            adminIstore(body);
          } catch (e) { toast(errMsg(e), "error"); }
        };
      }
    );
  }
  document.getElementById("is-add").onclick = () => itemModal(null);
  body.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => itemModal(data.items.find((x) => String(x._id) === b.getAttribute("data-edit")))));
  body.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm(t("admin_istore_delete_confirm"))) return;
      await api("DELETE", "/api/admin/istore-items/" + b.getAttribute("data-del"));
      adminIstore(body);
    };
  });
}

/* --------------------------- الإعلانات --------------------------- */
async function adminAnnouncements(body) {
  const data = await api("GET", "/api/admin/announcements");
  body.innerHTML =
    '<div style="margin-bottom:14px"><button class="btn btn-gold" id="an-add">＋ ' + esc(t("admin_announcement_add")) + "</button></div>" +
    '<div id="an-list">' +
    ((data.announcements || []).length
      ? data.announcements.map(announcementHTML).join("")
      : emptyBox("📣", t("home_no_announcements"))) +
    "</div>";

  function annModal(a) {
    const editing = !!a;
    openModal(
      '<div class="modal-head"><h3>' + esc(editing ? t("admin_announcement_edit") : t("admin_announcement_add")) +
      '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
      '<div class="field"><label class="label">' + esc(t("admin_announcement_title")) + '</label><input class="input" id="a-t" value="' + esc(editing ? a.title : "") + '"></div>' +
      '<div class="field"><label class="label">' + esc(t("admin_announcement_body")) + '</label><textarea class="input" id="a-b" style="min-height:130px">' +
      esc(editing ? a.body || "" : "") + "</textarea></div>" +
      '<label class="switch"><input type="checkbox" id="a-p" ' + (editing && a.pinned ? "checked" : "") + '><span class="track"></span>' + esc(t("admin_pin")) + "</label>" +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
      '</button><button class="btn btn-gold" id="a-s">' + esc(t("common_save")) + "</button></div>",
      (root) => {
        root.querySelector("#a-s").onclick = async () => {
          const payload = { title: fv("a-t"), body: fv("a-b"), pinned: root.querySelector("#a-p").checked };
          try {
            if (editing) await api("PATCH", "/api/admin/announcements/" + a._id, payload);
            else await api("POST", "/api/admin/announcements", payload);
            closeModal();
            toast(t("admin_announcement_saved"), "success");
            adminAnnouncements(body);
          } catch (e) { toast(errMsg(e), "error"); }
        };
      }
    );
  }
  document.getElementById("an-add").onclick = () => annModal(null);
  const listEl = document.getElementById("an-list");
  if ((data.announcements || []).length) {
    const ids = data.announcements.map((a) => String(a._id));
    // أزرار التعديل والحذف
    listEl.querySelectorAll(".feed-item").forEach((node, i) => {
      const a = data.announcements[i];
      if (!a) return;
      node.insertAdjacentHTML(
        "beforeend",
        '<div style="display:flex;gap:6px;margin-top:8px">' +
          '<button class="btn btn-sm" data-aedit="' + ids[i] + '">' + esc(t("common_edit")) + "</button>" +
          '<button class="btn btn-sm btn-red" data-adel="' + ids[i] + '">' + esc(t("common_delete")) + "</button></div>"
      );
    });
    listEl.querySelectorAll("[data-aedit]").forEach((b) => (b.onclick = () => annModal(data.announcements.find((x) => String(x._id) === b.getAttribute("data-aedit")))));
    listEl.querySelectorAll("[data-adel]").forEach((b) => {
      b.onclick = async () => {
        if (!confirm(t("admin_announcement_delete_confirm"))) return;
        await api("DELETE", "/api/admin/announcements/" + b.getAttribute("data-adel"));
        adminAnnouncements(body);
      };
    });
  }
}

/* --------------------------- أنواع العمليات --------------------------- */
async function adminOpTypes(body) {
  const data = await api("GET", "/api/admin/op-types");
  body.innerHTML =
    '<div class="row" style="margin-bottom:14px">' +
    '<input class="input" id="ot-n" placeholder="' + esc(t("admin_optype_add")) + '">' +
    '<button class="btn btn-gold" id="ot-add" style="flex:0 0 auto">' + esc(t("common_add")) + "</button></div>" +
    '<div class="table-wrap"><table class="table"><thead><tr><th>' + esc(t("common_name")) +
    "</th><th>" + esc(t("common_status")) + "</th><th></th></tr></thead><tbody>" +
    (data.types || [])
      .map(
        (o) =>
          "<tr><td><b>" + esc(o.name) + "</b></td>" +
          "<td>" + (o.active ? '<span class="badge badge-green">' + esc(t("common_active")) + '</span>' : '<span class="badge badge-mute">' + esc(t("common_inactive")) + "</span>") + "</td>" +
          '<td><div style="display:flex;gap:6px;justify-content:flex-end">' +
          '<button class="btn btn-sm" data-toggle="' + esc(o._id) + '" data-val="' + (o.active ? "0" : "1") + '">' +
          esc(o.active ? t("common_inactive") : t("common_active")) + "</button>" +
          '<button class="btn btn-sm btn-red" data-del="' + esc(o._id) + '">' + esc(t("common_delete")) + "</button></div></td></tr>"
      )
      .join("") +
    "</tbody></table></div>";

  document.getElementById("ot-add").onclick = async () => {
    try {
      await api("POST", "/api/admin/op-types", { name: fv("ot-n") });
      toast(t("admin_optype_saved"), "success");
      adminOpTypes(body);
    } catch (e) { toast(errMsg(e), "error"); }
  };
  body.querySelectorAll("[data-toggle]").forEach((b) => {
    b.onclick = async () => {
      await api("PATCH", "/api/admin/op-types/" + b.getAttribute("data-toggle"), { active: b.getAttribute("data-val") === "1" });
      adminOpTypes(body);
    };
  });
  body.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm(t("admin_optype_delete_confirm"))) return;
      await api("DELETE", "/api/admin/op-types/" + b.getAttribute("data-del"));
      adminOpTypes(body);
    };
  });
}

/* --------------------------- مراجعة الطلبات --------------------------- */
async function adminRequests(body) {
  const data = await api("GET", "/api/requests");
  const reqs = data.requests || [];
  body.innerHTML = reqs.length
    ? reqs
        .map(
          (r) =>
            '<div class="card hoverable" style="margin-bottom:12px" data-req="' + esc(r._id) + '">' +
            '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
            '<span class="badge badge-blue">' + esc(t("requests_type_" + r.type)) + "</span>" +
            statusReqBadge(r.status) +
            "<b>" + esc(r.requesterName) + "</b>" +
            '<span class="pill">' + esc(fmtDateTime(r.createdAt)) + "</span></div>" +
            '<div style="margin-top:8px">' + esc(r.message) + "</div>" +
            (r.status === "pending"
              ? '<div style="display:flex;gap:8px;margin-top:12px">' +
                '<button class="btn btn-green btn-sm" data-ok="' + esc(r._id) + '">✓ ' + esc(t("requests_approve")) + "</button>" +
                '<button class="btn btn-red btn-sm" data-no="' + esc(r._id) + '">✕ ' + esc(t("requests_reject")) + "</button></div>"
              : '<div class="small muted" style="margin-top:8px">' + esc(t("requests_decided_by")) + ": " + esc(r.decidedByName || "-") + "</div>") +
            "</div>"
        )
        .join("")
    : emptyBox("📨", t("common_none"));

  async function decide(id, status) {
    const response = prompt(t("requests_response") + ":", "") || "";
    try {
      await api("PATCH", "/api/requests/" + id, { status, response });
      toast("✓", "success");
      adminRequests(body);
    } catch (e) { toast(errMsg(e), "error"); }
  }
  body.querySelectorAll("[data-ok]").forEach((b) => (b.onclick = () => decide(b.getAttribute("data-ok"), "approved")));
  body.querySelectorAll("[data-no]").forEach((b) => (b.onclick = () => decide(b.getAttribute("data-no"), "rejected")));
}

/* --------------------------- الملاحظات والغرامات --------------------------- */
async function adminNotes(body) {
  const [notesData, usersData] = await Promise.all([
    api("GET", "/api/notes"),
    api("GET", "/api/admin/users"),
  ]);
  body.innerHTML =
    '<div style="margin-bottom:14px"><button class="btn btn-gold" id="nt-add">＋ ' + esc(t("notes_add")) + "</button></div>" +
    '<div class="table-wrap"><table class="table"><thead><tr><th>' + esc(t("common_member")) +
    "</th><th>" + esc(t("common_type")) + "</th><th>" + esc(t("common_notes")) +
    "</th><th>" + esc(t("common_amount")) + "</th><th>" + esc(t("common_date")) + "</th><th></th></tr></thead><tbody>" +
    (notesData.notes || [])
      .map(
        (n) =>
          "<tr><td><b>" + esc(n.user ? n.user.globalName || n.user.username : "-") + "</b></td>" +
          "<td>" + noteBadge(n.type) + "</td>" +
          '<td class="small">' + esc(n.content) + "</td>" +
          '<td class="mono ' + (n.type === "fine" ? "amt-out" : "") + '">' + (n.type === "fine" ? esc(fmtMoney(n.amount)) : "-") + "</td>" +
          '<td class="small muted">' + esc(fmtDateTime(n.createdAt)) + "</td>" +
          '<td><button class="btn btn-sm btn-red" data-del="' + esc(n._id) + '">✕</button></td></tr>'
      )
      .join("") +
    "</tbody></table></div>";

  document.getElementById("nt-add").onclick = () => {
    openModal(
      '<div class="modal-head"><h3>' + esc(t("notes_add")) + '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
      '<div class="field"><label class="label">' + esc(t("common_member")) + '</label><select class="input" id="n-u">' +
      usersData.users.map((u) => '<option value="' + esc(u.id) + '">' + esc(u.name) + "</option>").join("") + "</select></div>" +
      '<div class="row"><div class="field"><label class="label">' + esc(t("common_type")) + '</label><select class="input" id="n-t">' +
      ["note", "warning", "fine"].map((k) => '<option value="' + k + '">' + esc(t("notes_type_" + k)) + "</option>").join("") +
      "</select></div>" +
      '<div class="field"><label class="label">' + esc(t("common_amount")) + '</label><input type="number" min="0" step="1" class="input" id="n-amt" value="0"></div></div>' +
      '<div class="field"><label class="label">' + esc(t("common_notes")) + '</label><textarea class="input" id="n-c"></textarea></div>' +
      '<label class="switch"><input type="checkbox" id="n-d"><span class="track"></span>' + esc(t("notes_deduct")) + "</label>" +
      '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) +
      '</button><button class="btn btn-gold" id="n-s">' + esc(t("common_submit")) + "</button></div>",
      (root) => {
        root.querySelector("#n-s").onclick = async () => {
          try {
            await api("POST", "/api/notes", {
              userId: fv("n-u"),
              type: fv("n-t"),
              content: fv("n-c"),
              amount: Number(fv("n-amt")) || 0,
              deduct: root.querySelector("#n-d").checked,
            });
            closeModal();
            toast(t("notes_added"), "success");
            adminNotes(body);
          } catch (e) { toast(errMsg(e), "error"); }
        };
      }
    );
  };
  body.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm(t("notes_delete_confirm"))) return;
      try {
        await api("DELETE", "/api/notes/" + b.getAttribute("data-del"));
        adminNotes(body);
      } catch (e) { toast(errMsg(e), "error"); }
    };
  });
}

/* --------------------------- سجل التدقيق --------------------------- */
async function adminAudit(body) {
  const data = await api(
    "GET",
    "/api/admin/audit?page=" + adminAuditPage + (adminAuditPageAct ? "&action=" + encodeURIComponent(adminAuditPageAct) : "")
  );
  body.innerHTML =
    '<div class="row" style="margin-bottom:14px">' +
    '<input class="input" id="au-f" placeholder="' + esc(t("admin_audit_filter")) + '" value="' + esc(adminAuditPageAct) + '">' +
    '<button class="btn" id="au-go" style="flex:0 0 auto">' + esc(t("common_apply")) + "</button>" +
    '<div class="spacer"></div>' +
    '<button class="btn btn-ghost" id="au-prev" ' + (adminAuditPage <= 0 ? "disabled" : "") + '>→</button>' +
    '<button class="btn btn-ghost" id="au-next" ' + ((adminAuditPage + 1) * 50 >= data.total ? "disabled" : "") + ">←</button>" +
    "</div>" +
    '<div class="table-wrap"><table class="table"><thead><tr><th>' + esc(t("common_date")) +
    "</th><th>" + esc(t("common_actor")) + "</th><th>" + esc(t("admin_audit_action")) +
    "</th><th>" + esc(t("admin_audit_changes")) + "</th></tr></thead><tbody>" +
    (data.items || [])
      .map(
        (a) =>
          '<tr><td class="small muted">' + esc(fmtDateTime(a.at)) + "</td>" +
          "<td><b>" + esc(a.actorName || "-") + "</b></td>" +
          '<td><span class="badge badge-gold">' + esc(a.action) + "</span></td>" +
          '<td class="small"><details><summary class="muted">' + esc(t("admin_audit_target")) + "</summary>" +
          '<div class="mono" style="white-space:pre-wrap;font-size:11px;max-width:340px;overflow:auto">' +
          esc(JSON.stringify({ before: a.before, after: a.after }, null, 1)) + "</div></details></td></tr>"
      )
      .join("") +
    "</tbody></table></div>";

  document.getElementById("au-go").onclick = () => {
    adminAuditPageAct = document.getElementById("au-f").value.trim();
    adminAuditPage = 0;
    adminAudit(body);
  };
  document.getElementById("au-prev").onclick = () => { adminAuditPage = Math.max(0, adminAuditPage - 1); adminAudit(body); };
  document.getElementById("au-next").onclick = () => { adminAuditPage += 1; adminAudit(body); };
}
let adminAuditPageAct = "";

/* --------------------------- الإعدادات --------------------------- */
async function adminSettings(body) {
  const data = await api("GET", "/api/admin/settings");
  const s = data.settings;
  const days = t("admin_week_days");
  const dayOptions = (Array.isArray(days) ? days : [])
    .map((d, i) => '<option value="' + i + '" ' + (s.weekStartDay === i ? "selected" : "") + ">" + esc(d) + "</option>")
    .join("");

  body.innerHTML =
    '<div class="grid cols-2">' +
    '<div class="card"><div class="card-title">🌙 ' + esc(t("admin_lockout")) + "</div>" +
    '<p class="small muted">' + esc(t("admin_lockout_hint")) + "</p>" +
    '<label class="switch"><input type="checkbox" id="st-lock" ' + (s.lockoutEnabled ? "checked" : "") + '><span class="track"></span>' + esc(t("admin_lockout")) + "</label>" +
    '<div class="row" style="margin-top:12px">' +
    '<div class="field"><label class="label">' + esc(t("admin_lockout_from")) + '</label><input type="time" class="input" id="st-ls" value="' + esc(s.lockoutStart) + '"></div>' +
    '<div class="field"><label class="label">' + esc(t("admin_lockout_to")) + '</label><input type="time" class="input" id="st-le" value="' + esc(s.lockoutEnd) + '"></div></div>' +
    '<div class="divider"></div>' +
    '<div class="row">' +
    '<div class="field"><label class="label">' + esc(t("admin_week_start")) + '</label><select class="input" id="st-wd">' + dayOptions + "</select></div>" +
    '<div class="field"><label class="label">' + esc(t("admin_week_time")) + '</label><input type="time" class="input" id="st-wt" value="' + esc(s.weekStartTime) + '"></div></div>' +
    '<div class="field"><label class="label">' + esc(t("admin_grow")) + '</label><input type="number" min="1" max="10080" class="input" id="st-grow" value="' + s.growMinutes + '"></div>' +
    '<label class="switch"><input type="checkbox" id="st-hv" ' + (s.countHarvestInTarget ? "checked" : "") + '><span class="track"></span>' + esc(t("admin_harvest_target")) + "</label>" +
    '<div class="field" style="margin-top:10px"><label class="label">' + esc(t("admin_harvest_value")) + '</label>' +
    '<input type="number" min="0" step="1" class="input" id="st-hvv" value="' + s.harvestUnitValue + '"></div>' +
    '<button class="btn btn-gold btn-block" id="st-save" style="margin-top:14px">' + esc(t("common_save")) + "</button>" +
    "</div>" +
    '<div class="card"><div class="card-title">🔐 ' + esc(t("admin_roles_display")) + "</div>" +
    '<div class="kv"><span class="k">' + esc(t("admin_guild_id")) + '</span><span class="v mono small">' + esc(data.roles.GUILD_ID) + "</span></div>" +
    '<div class="kv"><span class="k">' + esc(t("common_role_shop")) + '</span><span class="v mono small">' + esc(data.roles.ROLE_SHOP_ID) + "</span></div>" +
    '<div class="kv"><span class="k">' + esc(t("common_role_member")) + '</span><span class="v mono small">' + esc(data.roles.ROLE_MEMBER_ID) + "</span></div>" +
    '<div class="kv"><span class="k">' + esc(t("common_role_ops")) + '</span><span class="v mono small">' + esc(data.roles.ROLE_OPS_ID) + "</span></div>" +
    '<div class="kv"><span class="k">' + esc(t("common_role_admin")) + '</span><span class="v mono small">' + esc(data.roles.ROLE_ADMIN_ID) + "</span></div>" +
    '<div class="kv"><span class="k">' + esc(t("admin_timezone")) + '</span><span class="v mono small">' + esc(data.tz) + "</span></div>" +
    '<div class="kv"><span class="k">' + esc(t("admin_base_url")) + '</span><span class="v mono small">' + esc(data.baseUrl) + "</span></div>" +
    '<div class="kv"><span class="k">' + esc(t("admin_build")) + '</span><span class="v mono small">' + esc(data.buildId) + "</span></div>" +
    '<p class="small muted" style="margin-top:12px">' + esc(t("admin_settings_note")) + "</p>" +
    "</div></div>";

  document.getElementById("st-save").onclick = async () => {
    try {
      await api("PATCH", "/api/admin/settings", {
        lockoutEnabled: document.getElementById("st-lock").checked,
        lockoutStart: fv("st-ls"),
        lockoutEnd: fv("st-le"),
        weekStartDay: Number(fv("st-wd")),
        weekStartTime: fv("st-wt"),
        growMinutes: Number(fv("st-grow")),
        countHarvestInTarget: document.getElementById("st-hv").checked,
        harvestUnitValue: Number(fv("st-hvv")),
      });
      await refreshMe();
      State.config = State.me.config;
      toast(t("admin_settings_saved"), "success");
    } catch (e) { toast(errMsg(e), "error"); }
  };
}
