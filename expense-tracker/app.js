import { createStore } from "./store.js";
import { CURRENCIES, convert, money, refreshRates, ratesUpdated } from "./rates.js";

const DEFAULT_CATEGORIES = [
  ["groceries", "Groceries", "🛒"],
  ["eating-out", "Eating out", "🍽️"],
  ["food-home", "Food at home", "🍳"],
  ["clothes", "Clothes", "👕"],
  ["travel", "Travel", "✈️"],
  ["transport", "Transport & fuel", "🚗"],
  ["rent", "Rent & housing", "🏠"],
  ["bills", "Bills & utilities", "💡"],
  ["health", "Health", "💊"],
  ["entertainment", "Entertainment", "🎬"],
  ["shopping", "Shopping", "🛍️"],
  ["other", "Other", "📦"],
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const $app = document.getElementById("app");
const $sheet = document.getElementById("sheet");
const $toast = document.getElementById("toast");

const now = new Date();
const state = {
  user: null,
  loading: true,
  authMode: "login",
  tab: "overview",
  period: "month", // "month" | "year"
  year: now.getFullYear(),
  month: now.getMonth(),
  filterCat: null,
  expenses: [],
  categories: [],
  settings: { defaultCurrency: "USD", viewCurrency: "USD" },
};
let store;
let signupCurrency = null;

// ------------------------------------------------------------------ helpers
const h = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const today = () => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const cat = (id) => state.categories.find((c) => c.id === id) || { id, name: "Other", emoji: "📦" };
const view = () => state.settings.viewCurrency;
const inView = (e) => convert(e.amount, e.currency, view());
const currencyOptions = (selected) =>
  Object.entries(CURRENCIES)
    .map(([code, name]) => `<option value="${code}" ${code === selected ? "selected" : ""}>${code} · ${h(name)}</option>`)
    .join("");

function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => $toast.classList.remove("show"), 2800);
}
async function run(fn) {
  try {
    await fn();
  } catch (e) {
    console.error(e);
    toast(e.message || "Something went wrong.");
  }
}
function prettyDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
const periodPrefix = () => (state.period === "month" ? `${state.year}-${pad(state.month + 1)}` : `${state.year}`);
const periodLabel = () => (state.period === "month" ? `${MONTHS[state.month]} ${state.year}` : `${state.year}`);
const periodExpenses = () => state.expenses.filter((e) => e.date.startsWith(periodPrefix()));

// ------------------------------------------------------------------- render
function render() {
  if (state.loading) return ($app.innerHTML = `<div class="center muted">Loading…</div>`);
  if (!state.user) return ($app.innerHTML = authView());
  const body = { overview: overviewView, categories: categoriesView, settings: settingsView }[state.tab]();
  $app.innerHTML = `
    <header class="top">
      <h1>${{ overview: "Expenses", categories: "Categories", settings: "Settings" }[state.tab]}</h1>
      <label class="viewcur">View in
        <select data-change="view-currency" aria-label="Display currency">${currencyOptions(view())}</select>
      </label>
    </header>
    <main>${body}</main>
    <button class="fab" data-action="add-expense" aria-label="Add expense">+</button>
    <nav class="tabs">
      ${[["overview", "📊", "Overview"], ["categories", "🏷️", "Categories"], ["settings", "⚙️", "Settings"]]
        .map(([id, icon, label]) => `<button data-action="tab" data-tab="${id}" class="${state.tab === id ? "on" : ""}"><span>${icon}</span>${label}</button>`)
        .join("")}
    </nav>`;
}

function authView() {
  const login = state.authMode === "login";
  return `
  <div class="auth">
    <div class="logo">💰</div>
    <h1>Expense Tracker</h1>
    <p class="muted">See where your money goes, month by month.</p>
    <div class="seg">
      <button data-action="auth-mode" data-mode="login" class="${login ? "on" : ""}">Log in</button>
      <button data-action="auth-mode" data-mode="signup" class="${login ? "" : "on"}">Sign up</button>
    </div>
    <form data-submit="auth" class="card form">
      <label>Email<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
      <label>Password<input name="password" type="password" minlength="6" required
        autocomplete="${login ? "current-password" : "new-password"}" placeholder="At least 6 characters"></label>
      ${login ? "" : `<label>Your main currency<select name="currency">${currencyOptions(guessCurrency())}</select></label>`}
      <button class="primary" type="submit">${login ? "Log in" : "Create account"}</button>
      ${login ? `<button class="link" type="button" data-action="forgot">Forgot password?</button>` : ""}
    </form>
    ${store.mode === "local" ? `<p class="note">Demo mode: accounts and data are saved on this device only. Connect Firebase (see README) to sync by email across devices.</p>` : ""}
  </div>`;
}
function guessCurrency() {
  const region = (navigator.language || "").split("-")[1];
  const map = { IN: "INR", AE: "AED", GB: "GBP", SA: "SAR", QA: "QAR", OM: "OMR", KW: "KWD", BH: "BHD", SG: "SGD", AU: "AUD", CA: "CAD", JP: "JPY", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", IE: "EUR" };
  return map[region] || "USD";
}

function overviewView() {
  const list = periodExpenses();
  const total = list.reduce((s, e) => s + inView(e), 0);

  // totals per category, largest first
  const byCat = new Map();
  for (const e of list) byCat.set(e.categoryId, (byCat.get(e.categoryId) || 0) + inView(e));
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 0;

  const shown = (state.filterCat ? list.filter((e) => e.categoryId === state.filterCat) : list)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));

  let rows = "";
  let lastDate = "";
  for (const e of shown) {
    if (e.date !== lastDate) rows += `<div class="day">${h(prettyDate(e.date))}</div>`;
    lastDate = e.date;
    const c = cat(e.categoryId);
    rows += `
      <button class="row" data-action="open-expense" data-id="${h(e.id)}">
        <span class="emoji">${h(c.emoji)}</span>
        <span class="grow">
          <b>${h(e.where || e.what || c.name)}</b>
          <small>${h([e.where && e.what, c.name].filter(Boolean).join(" · "))}</small>
        </span>
        <span class="amt">
          <b>${h(money(inView(e), view()))}</b>
          ${e.currency !== view() ? `<small>${h(money(e.amount, e.currency))}</small>` : ""}
        </span>
      </button>`;
  }

  return `
    <div class="seg">
      <button data-action="period" data-period="month" class="${state.period === "month" ? "on" : ""}">Monthly</button>
      <button data-action="period" data-period="year" class="${state.period === "year" ? "on" : ""}">Yearly</button>
    </div>
    <div class="card hero">
      <div class="stepper">
        <button data-action="step" data-dir="-1" aria-label="Previous">‹</button>
        <span>${periodLabel()}</span>
        <button data-action="step" data-dir="1" aria-label="Next">›</button>
      </div>
      <div class="total">${h(money(total, view()))}</div>
      <div class="muted">${list.length} expense${list.length === 1 ? "" : "s"}${
        state.period === "year" && list.length ? ` · avg ${h(money(total / 12, view()))} / month` : ""
      }</div>
    </div>
    ${state.period === "year" ? yearChart() : ""}
    <h2>By category</h2>
    ${
      cats.length
        ? `<div class="card">${cats
            .map(([id, amt]) => {
              const c = cat(id);
              const on = state.filterCat === id;
              return `
              <button class="catrow ${on ? "on" : ""}" data-action="filter-cat" data-id="${h(id)}" aria-pressed="${on}">
                <span class="line"><span>${h(c.emoji)} ${h(c.name)}</span>
                  <span><b>${h(money(amt, view()))}</b> <small>${total ? Math.round((amt / total) * 100) : 0}%</small></span></span>
                <span class="track"><span class="bar" style="width:${max ? Math.max(1.5, (amt / max) * 100) : 0}%"></span></span>
              </button>`;
            })
            .join("")}</div>`
        : `<div class="card empty">No spending recorded for ${periodLabel()}.<br>Tap <b>+</b> to add an expense.</div>`
    }
    ${
      list.length
        ? `<h2>${state.filterCat ? `${h(cat(state.filterCat).name)} <button class="chip" data-action="filter-cat" data-id="${h(state.filterCat)}">Show all ✕</button>` : "All spending"}</h2>
           <div class="card list">${rows}</div>`
        : ""
    }`;
}

function yearChart() {
  const totals = Array(12).fill(0);
  for (const e of state.expenses)
    if (e.date.startsWith(`${state.year}-`)) totals[Number(e.date.slice(5, 7)) - 1] += inView(e);
  const max = Math.max(...totals);
  if (!max) return "";
  const W = 336, H = 150, base = 122, top = 18, col = W / 12, bw = 16;
  const peak = totals.indexOf(max);
  const bars = totals
    .map((t, i) => {
      const bh = (t / max) * (base - top);
      const x = i * col + (col - bw) / 2;
      const r = Math.min(4, bh);
      const shape = t
        ? `<path class="vbar" d="M${x},${base} v${-(bh - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${bh - r} z"/>`
        : "";
      const label = i === peak ? `<text class="val" x="${x + bw / 2}" y="${base - bh - 5}" text-anchor="middle">${h(money(t, view()))}</text>` : "";
      return `<g data-action="goto-month" data-month="${i}" role="button" tabindex="0" aria-label="${MONTHS[i]} ${state.year}: ${h(money(t, view()))}">
        <title>${MONTHS[i]} ${state.year}: ${h(money(t, view()))}</title>
        <rect x="${i * col}" y="0" width="${col}" height="${H}" fill="transparent"/>
        ${shape}${label}
        <text class="tick" x="${x + bw / 2}" y="${base + 16}" text-anchor="middle">${MONTHS[i][0]}</text>
      </g>`;
    })
    .join("");
  return `
    <h2>Month by month</h2>
    <div class="card chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Spending per month in ${state.year}">
        <line class="axis" x1="0" x2="${W}" y1="${base}" y2="${base}"/>${bars}
      </svg>
      <div class="muted small">Tap a month to open it.</div>
    </div>`;
}

function categoriesView() {
  const counts = {};
  for (const e of state.expenses) counts[e.categoryId] = (counts[e.categoryId] || 0) + 1;
  return `
    <form class="card form inline" data-submit="add-category">
      <input name="emoji" class="emoji-in" maxlength="4" value="🏷️" aria-label="Icon (emoji)">
      <input name="name" required maxlength="30" placeholder="New category name" aria-label="Category name">
      <button class="primary" type="submit">Add</button>
    </form>
    <div class="card list">
      ${state.categories
        .map(
          (c) => `
        <div class="row static">
          <span class="emoji">${h(c.emoji)}</span>
          <span class="grow"><b>${h(c.name)}</b><small>${counts[c.id] || 0} expense${counts[c.id] === 1 ? "" : "s"}</small></span>
          ${c.id === "other" ? "" : `<button class="ghost danger" data-action="delete-category" data-id="${h(c.id)}" aria-label="Delete ${h(c.name)}">Delete</button>`}
        </div>`
        )
        .join("")}
    </div>`;
}

function settingsView() {
  const updated = ratesUpdated();
  return `
    <div class="card form">
      <div class="kv"><span>Signed in as</span><b>${h(state.user.email)}</b></div>
      <div class="kv"><span>Data storage</span><b>${store.mode === "firebase" ? "Cloud (your account)" : "This device only (demo)"}</b></div>
      <label>Default currency for new expenses
        <select data-change="default-currency">${currencyOptions(state.settings.defaultCurrency)}</select></label>
      <label>Show totals in
        <select data-change="view-currency">${currencyOptions(view())}</select></label>
    </div>
    <div class="card form">
      <div class="kv"><span>Exchange rates</span><b>${updated ? "Updated " + new Date(updated).toLocaleString() : "Built-in estimates"}</b></div>
      <p class="muted small">Amounts in other currencies are converted with the latest rates, so converted totals are approximate.</p>
      <button class="secondary" data-action="refresh-rates">Update rates now</button>
    </div>
    <button class="secondary wide" data-action="sign-out">Log out</button>`;
}

// ------------------------------------------------------------------- sheets
function openSheet(html) {
  $sheet.innerHTML = `<div class="backdrop" data-action="close-sheet"></div><div class="panel" role="dialog" aria-modal="true">${html}</div>`;
  $sheet.classList.add("open");
}
function closeSheet() {
  $sheet.classList.remove("open");
  $sheet.innerHTML = "";
}

function expenseDetail(e) {
  const c = cat(e.categoryId);
  const row = (k, v) => (v ? `<div class="kv"><span>${k}</span><b>${h(v)}</b></div>` : "");
  openSheet(`
    <div class="detail-head">
      <span class="emoji big">${h(c.emoji)}</span>
      <div class="total">${h(money(e.amount, e.currency))}</div>
      ${e.currency !== view() ? `<div class="muted">≈ ${h(money(inView(e), view()))}</div>` : ""}
    </div>
    ${row("Where", e.where)}
    ${row("What", e.what)}
    ${row("Category", c.name)}
    ${row("Date", prettyDate(e.date))}
    ${row("Note", e.note)}
    <div class="actions">
      <button class="ghost danger" data-action="delete-expense" data-id="${h(e.id)}">Delete</button>
      <button class="secondary" data-action="edit-expense" data-id="${h(e.id)}">Edit</button>
      <button class="primary" data-action="close-sheet">Done</button>
    </div>`);
}

function expenseForm(e) {
  const v = e || { amount: "", currency: state.settings.defaultCurrency, categoryId: state.categories[0]?.id, date: today() };
  openSheet(`
    <h2>${e ? "Edit expense" : "New expense"}</h2>
    <form class="form" data-submit="save-expense" data-id="${h(e?.id || "")}">
      <div class="two">
        <label>Amount<input name="amount" inputmode="decimal" required placeholder="0.00" value="${h(v.amount)}"></label>
        <label>Currency<select name="currency">${currencyOptions(v.currency)}</select></label>
      </div>
      <label>Category<select name="categoryId">
        ${state.categories.map((c) => `<option value="${h(c.id)}" ${c.id === v.categoryId ? "selected" : ""}>${h(c.emoji)} ${h(c.name)}</option>`).join("")}
      </select></label>
      <label>Where did you spend?<input name="where" maxlength="60" placeholder="Shop, restaurant, website…" value="${h(v.where)}"></label>
      <label>What did you buy?<input name="what" maxlength="100" placeholder="Vegetables, shirt, flight ticket…" value="${h(v.what)}"></label>
      <label>Date<input name="date" type="date" required value="${h(v.date)}"></label>
      <label>Note (optional)<input name="note" maxlength="200" value="${h(v.note)}"></label>
      <div class="actions">
        <button class="secondary" type="button" data-action="close-sheet">Cancel</button>
        <button class="primary" type="submit">Save</button>
      </div>
    </form>`);
  if (!e) $sheet.querySelector("[name=amount]").focus();
}

// ------------------------------------------------------------------ actions
const actions = {
  "auth-mode": (el) => { state.authMode = el.dataset.mode; render(); },
  forgot: () =>
    run(async () => {
      const email = $app.querySelector("[name=email]").value.trim();
      if (!email) return toast("Type your email first, then tap Forgot password.");
      await store.resetPassword(email);
      toast("Password reset email sent.");
    }),
  tab: (el) => { state.tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  period: (el) => { state.period = el.dataset.period; state.filterCat = null; render(); },
  step: (el) => {
    const dir = Number(el.dataset.dir);
    if (state.period === "year") state.year += dir;
    else {
      const d = new Date(state.year, state.month + dir, 1);
      state.year = d.getFullYear();
      state.month = d.getMonth();
    }
    state.filterCat = null;
    render();
  },
  "goto-month": (el) => { state.month = Number(el.dataset.month); state.period = "month"; state.filterCat = null; render(); },
  "filter-cat": (el) => { state.filterCat = state.filterCat === el.dataset.id ? null : el.dataset.id; render(); },
  "add-expense": () => expenseForm(null),
  "open-expense": (el) => expenseDetail(state.expenses.find((e) => e.id === el.dataset.id)),
  "edit-expense": (el) => expenseForm(state.expenses.find((e) => e.id === el.dataset.id)),
  "close-sheet": closeSheet,
  "delete-expense": (el) =>
    run(async () => {
      if (!confirm("Delete this expense?")) return;
      await store.deleteExpense(el.dataset.id);
      state.expenses = state.expenses.filter((e) => e.id !== el.dataset.id);
      closeSheet();
      render();
    }),
  "delete-category": (el) =>
    run(async () => {
      const id = el.dataset.id;
      const used = state.expenses.filter((e) => e.categoryId === id);
      const msg = used.length
        ? `Delete "${cat(id).name}"? Its ${used.length} expense(s) will move to Other.`
        : `Delete "${cat(id).name}"?`;
      if (!confirm(msg)) return;
      for (const e of used) {
        e.categoryId = "other";
        await store.saveExpense(e);
      }
      await store.deleteCategory(id);
      state.categories = state.categories.filter((c) => c.id !== id);
      render();
    }),
  "refresh-rates": () =>
    run(async () => {
      await refreshRates(true);
      toast("Exchange rates updated.");
      render();
    }),
  "sign-out": () => run(() => store.signOut()),
};

const submits = {
  auth: (form) =>
    run(async () => {
      const f = new FormData(form);
      const email = f.get("email").trim();
      if (state.authMode === "signup") {
        signupCurrency = f.get("currency");
        await store.signUp(email, f.get("password"));
      } else await store.signIn(email, f.get("password"));
    }),
  "save-expense": (form) =>
    run(async () => {
      const f = new FormData(form);
      const amount = Number(String(f.get("amount")).replace(/,/g, ".").replace(/\s/g, ""));
      if (!(amount > 0)) return toast("Enter an amount greater than zero.");
      const old = state.expenses.find((e) => e.id === form.dataset.id);
      const e = {
        id: old?.id || crypto.randomUUID(),
        createdAt: old?.createdAt || Date.now(),
        amount,
        currency: f.get("currency"),
        categoryId: f.get("categoryId"),
        where: f.get("where").trim(),
        what: f.get("what").trim(),
        date: f.get("date"),
        note: f.get("note").trim(),
      };
      await store.saveExpense(e);
      state.expenses = state.expenses.filter((x) => x.id !== e.id).concat(e);
      // jump to the period containing the saved expense so it is visible
      state.year = Number(e.date.slice(0, 4));
      if (state.period === "month") state.month = Number(e.date.slice(5, 7)) - 1;
      state.filterCat = null;
      state.tab = "overview";
      closeSheet();
      render();
    }),
  "add-category": (form) =>
    run(async () => {
      const f = new FormData(form);
      const name = f.get("name").trim();
      if (!name) return;
      if (state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase()))
        return toast("You already have that category.");
      const c = { id: crypto.randomUUID(), name, emoji: f.get("emoji").trim() || "🏷️", order: Date.now() };
      await store.saveCategory(c);
      state.categories.push(c);
      render();
      toast(`Added "${name}".`);
    }),
};

const changes = {
  "view-currency": (el) => saveSettings({ viewCurrency: el.value }),
  "default-currency": (el) => saveSettings({ defaultCurrency: el.value }),
};
function saveSettings(patch) {
  Object.assign(state.settings, patch);
  render();
  run(() => store.saveSettings(state.settings));
}

document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-action]");
  if (el) actions[el.dataset.action]?.(el);
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") closeSheet();
  if (ev.key === "Enter" && ev.target.matches?.("g[data-action]")) actions[ev.target.dataset.action](ev.target);
});
document.addEventListener("submit", (ev) => {
  ev.preventDefault();
  submits[ev.target.dataset.submit]?.(ev.target);
});
document.addEventListener("change", (ev) => {
  const key = ev.target.dataset?.change;
  if (key) changes[key](ev.target);
});

// --------------------------------------------------------------------- boot
async function onUser(user) {
  state.user = user;
  if (!user) {
    state.loading = false;
    state.authMode = "login";
    closeSheet();
    return render();
  }
  state.loading = true;
  render();
  try {
    const data = await store.load();
    state.expenses = data.expenses;
    state.categories = data.categories.sort((a, b) => (a.order || 0) - (b.order || 0));
    if (!state.categories.length) {
      state.categories = DEFAULT_CATEGORIES.map(([id, name, emoji], order) => ({ id, name, emoji, order }));
      await Promise.all(state.categories.map((c) => store.saveCategory(c)));
    }
    if (data.settings) state.settings = data.settings;
    else {
      const cur = signupCurrency || guessCurrency();
      state.settings = { defaultCurrency: cur, viewCurrency: cur };
      await store.saveSettings(state.settings);
    }
    state.tab = "overview";
  } catch (e) {
    console.error(e);
    toast("Could not load your data. Check your connection and reopen the app.");
  }
  state.loading = false;
  render();
}

(async () => {
  render();
  try {
    store = await createStore();
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<div class="center muted">Could not reach the sign-in service.<br>Check your internet connection and reopen the app.</div>`;
    return;
  }
  store.onAuth(onUser);
  refreshRates().then((fresh) => fresh && state.user && render()).catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
})();
