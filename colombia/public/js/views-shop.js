/* ============================================================
   VIEWS - جانب المتجر (Shop)
   ============================================================ */
const ViewsShop = {};

let shopCategory = null;

ViewsShop.store = async function (el) {
  el.innerHTML =
    pageHead("shop_title", "shop_sub",
      '<button class="btn btn-gold" id="btn-cart">🛍 ' + esc(t("shop_cart")) +
      ' <span class="cart-badge" data-cart-badge style="display:none"></span></button>') +
    '<div class="tabs" id="cat-tabs"><span class="skeleton" style="width:100%;height:36px"></span></div>' +
    '<div class="product-grid" id="grid">' +
    Array.from({ length: 8 }).map(() => '<div class="product"><div class="skeleton h220" style="margin:0;border-radius:0"></div></div>').join("") +
    "</div>";

  document.getElementById("btn-cart").onclick = openCartModal;
  updateCartBadge();

  const [cats, data] = await Promise.all([
    api("GET", "/api/shop/categories"),
    api("GET", "/api/shop/products"),
  ]);
  const products = data.products || [];

  function renderTabs() {
    const tabs = document.getElementById("cat-tabs");
    tabs.innerHTML =
      '<button class="chip ' + (shopCategory === null ? "on" : "") + '" data-cat="">' + esc(t("shop_all")) + "</button>" +
      cats.categories.map((c) =>
        '<button class="chip ' + (shopCategory === String(c._id) ? "on" : "") + '" data-cat="' + esc(c._id) + '">' +
        esc(c.name) + "</button>"
      ).join("");
    tabs.querySelectorAll("[data-cat]").forEach((b) => {
      b.onclick = () => {
        const v = b.getAttribute("data-cat");
        shopCategory = v === "" ? null : v;
        renderTabs();
        renderGrid();
      };
    });
  }

  function renderGrid() {
    const grid = document.getElementById("grid");
    const list = products.filter((p) => !shopCategory || (p.category && String(p.category._id) === shopCategory));
    if (!list.length) {
      grid.innerHTML = emptyBox("🪙", t("common_none"));
      return;
    }
    grid.innerHTML = list
      .map((p) => {
        const out = p.stock <= 0;
        return (
          '<div class="product ' + (out ? "soldout" : "") + '">' +
          '<div class="p-img">' +
          (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy" />' : "🪙") +
          '<span class="p-stock"><span class="badge ' + (out ? "badge-red" : "badge-green") + '">' +
          (out ? esc(t("shop_out")) : esc(t("shop_stock_n", { n: p.stock }))) +
          "</span></span></div>" +
          '<div class="p-body">' +
          '<div class="p-name">' + esc(p.name) + "</div>" +
          '<div class="p-desc">' + esc(p.description || "") + "</div>" +
          '<div class="p-price">' + esc(fmtMoney(p.price)) + "</div>" +
          '<button class="btn ' + (out ? "btn-ghost" : "btn-gold") + '" data-add="' + esc(p._id) + '"' +
          (out ? " disabled" : "") + ">" +
          (out ? esc(t("shop_out")) : esc(t("shop_add_cart"))) +
          "</button></div></div>"
        );
      })
      .join("");
    grid.querySelectorAll("[data-add]").forEach((b) => {
      b.onclick = () => {
        const p = products.find((x) => String(x._id) === b.getAttribute("data-add"));
        if (p) addToCart(p, 1);
      };
    });
  }

  renderTabs();
  renderGrid();
};

function openCartModal() {
  if (!State.cart.length) {
    toast(t("shop_cart_empty"), "error");
    return;
  }
  const total = State.cart.reduce((s, i) => s + i.price * i.qty, 0);
  const rows = State.cart
    .map(
      (i, idx) =>
        '<tr><td>' + esc(i.name) + "</td>" +
        '<td><div style="display:flex;gap:6px;align-items:center">' +
        '<button class="btn btn-sm btn-ghost" data-dec="' + idx + '">−</button>' +
        '<b class="mono">' + i.qty + "</b>" +
        '<button class="btn btn-sm btn-ghost" data-inc="' + idx + '">+</button>' +
        "</div></td>" +
        '<td class="mono">' + esc(fmtMoney(i.price * i.qty)) + "</td>" +
        '<td><button class="btn btn-sm btn-red" data-del="' + idx + '">✕</button></td></tr>'
    )
    .join("");

  openModal(
    '<div class="modal-head"><h3>🛍 ' + esc(t("shop_cart")) + '</h3><button class="btn btn-sm btn-ghost" data-close-modal>✕</button></div>' +
    '<div class="table-wrap"><table class="table"><thead><tr>' +
    "<th>" + esc(t("common_name")) + "</th><th>" + esc(t("common_qty")) + "</th><th>" + esc(t("common_total")) + "</th><th></th>" +
    "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
    '<div class="kv"><span class="k">' + esc(t("shop_cart_total")) + '</span><span class="v gold-text">' + esc(fmtMoney(total)) + "</span></div>" +
    '<div class="field"><label class="label">' + esc(t("shop_ingame_id")) + '</label>' +
    '<input class="input" id="c-ingame" placeholder="' + esc(t("shop_ingame_ph")) + '" maxlength="64" /></div>' +
    '<div class="field"><label class="label">' + esc(t("shop_order_notes")) + ' (' + esc(t("common_optional")) + ')</label>' +
    '<textarea class="input" id="c-notes" maxlength="500"></textarea></div>' +
    '<div class="modal-actions">' +
    '<button class="btn btn-ghost" data-close-modal>' + esc(t("common_cancel")) + "</button>" +
    '<button class="btn btn-gold" id="c-submit">' + esc(t("shop_checkout")) + "</button></div>",
    (root) => {
      root.querySelectorAll("[data-inc]").forEach((b) =>
        b.onclick = () => {
          const i = State.cart[+b.getAttribute("data-inc")];
          const stock = i.stock === undefined ? 99 : i.stock;
          i.qty = Math.min(stock, i.qty + 1);
          saveCart();
          closeModal();
          openCartModal();
        }
      );
      root.querySelectorAll("[data-dec]").forEach((b) =>
        b.onclick = () => {
          const i = State.cart[+b.getAttribute("data-dec")];
          i.qty -= 1;
          if (i.qty <= 0) State.cart.splice(State.cart.indexOf(i), 1);
          saveCart();
          closeModal();
          if (State.cart.length) openCartModal();
        }
      );
      root.querySelectorAll("[data-del]").forEach((b) =>
        b.onclick = () => {
          State.cart.splice(+b.getAttribute("data-del"), 1);
          saveCart();
          closeModal();
          if (State.cart.length) openCartModal();
        }
      );
      root.querySelector("#c-submit").onclick = async () => {
        const ingameId = fv("c-ingame").trim();
        if (ingameId.length < 2) return toast(t("err_invalid_ingame_id"), "error");
        const btn = root.querySelector("#c-submit");
        btn.disabled = true;
        try {
          await api("POST", "/api/shop/orders", {
            items: State.cart.map((i) => ({ productId: i.productId, qty: i.qty })),
            ingameId,
            notes: fv("c-notes"),
          });
          clearCart();
          closeModal();
          toast(t("shop_order_sent"), "success");
          navigate("#/orders");
        } catch (e) {
          btn.disabled = false;
          toast(errMsg(e), "error");
        }
      };
    }
  );
}

ViewsShop.orders = async function (el) {
  el.innerHTML = pageHead("shop_my_orders", "shop_live_updates",
    '<button class="btn btn-ghost" id="o-reload">↻ ' + esc(t("common_refresh")) + "</button>") +
    '<div id="orders-list">' + skeletonList() + "</div>";

  async function load() {
    const box = document.getElementById("orders-list");
    try {
      const data = await api("GET", "/api/shop/orders");
      const orders = data.orders || [];
      if (!orders.length) {
        box.innerHTML = emptyBox("📦", t("shop_orders_empty"));
        return;
      }
      box.innerHTML = orders.map(orderCard).join("");
      box.querySelectorAll("[data-cancel]").forEach((b) => {
        b.onclick = async () => {
          if (!confirm(t("shop_cancel_confirm"))) return;
          try {
            await api("POST", "/api/shop/orders/" + b.getAttribute("data-cancel") + "/cancel");
            toast(t("shop_order_canceled"), "success");
            load();
          } catch (e) {
            toast(errMsg(e), "error");
          }
        };
      });
    } catch (e) {
      box.innerHTML = '<div class="card">' + esc(errMsg(e)) + "</div>";
    }
  }
  document.getElementById("o-reload").onclick = load;
  await load();
};

function orderCard(o) {
  const steps = ["new", "preparing", "delivered"];
  const cancelled = o.status === "cancelled";
  const currentIdx = steps.indexOf(o.status);
  let timeline = "";
  if (cancelled) {
    timeline =
      '<div class="tl-step cancel"><div class="tl-dot">✕</div><div class="tl-body"><b>' +
      esc(t("shop_status_cancelled")) + '</b><span class="muted small">' + esc(fmtDateTime(o.updatedAt || o.createdAt)) + "</span></div></div>";
  } else {
    timeline = steps
      .map((s, i) => {
        const active = i <= currentIdx;
        return (
          '<div class="tl-step ' + (active ? "active" : "") + '"><div class="tl-dot">' + (active ? "✓" : i + 1) + "</div>" +
          '<div class="tl-body"><b>' + esc(t("shop_status_" + s)) + "</b></div></div>"
        );
      })
      .join("");
  }

  const items = (o.items || [])
    .map((it) => '<div class="kv"><span class="k">' + esc(it.name) + ' × ' + it.qty + '</span><span class="v">' + esc(fmtMoney(it.price * it.qty)) + "</span></div>")
    .join("");

  return (
    '<div class="card hoverable" style="margin-bottom:14px">' +
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px">' +
    '<b class="gold-text">' + esc(t("shop_order")) + " #" + esc(String(o._id).slice(-6).toUpperCase()) + "</b>" +
    orderBadge(o.status) +
    '<span class="pill">' + esc(fmtDateTime(o.createdAt)) + "</span>" +
    '<div class="spacer"></div>' +
    (o.status === "new"
      ? '<button class="btn btn-sm btn-red" data-cancel="' + esc(o._id) + '">' + esc(t("shop_cancel")) + "</button>"
      : "") +
    "</div>" +
    '<div class="grid cols-2"><div>' + items +
    '<div class="kv"><span class="k">' + esc(t("common_total")) + '</span><span class="v gold-text">' + esc(fmtMoney(o.total)) + "</span></div>" +
    '<div class="kv"><span class="k">' + esc(t("shop_ingame_id")) + '</span><span class="v mono">' + esc(o.ingameId || "-") + "</span></div>" +
    (o.notes ? '<div class="kv"><span class="k">' + esc(t("common_notes")) + '</span><span class="v small muted">' + esc(o.notes) + "</span></div>" : "") +
    "</div><div>" + timeline + "</div></div></div>"
  );
}
