// Token Launch Radar dashboard: renders the board RADAR_DATA carries, with
// sorting, filters and a per-protocol detail view. No network, no libraries.

const D = window.RADAR_DATA;
const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt$ = (n) => {
  if (n === null || n === undefined) return "—";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n;
};
const fmtPct = (x) => (x === null || x === undefined ? "—" : (x > 0 ? "+" : "") + x.toFixed(1) + "%");
const fmtX = (x) => "×" + Number(x).toFixed(3).replace(/0+$/, "").replace(/\.$/, ".0");

let sortKey = "rank";
let sortDir = 1;
const filters = { q: "", category: "", chain: "", kind: "", watch: false };

function readHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  const params = new URLSearchParams(qs || "");
  return { path, params };
}

function applyHashFilters(params) {
  filters.q = params.get("q") || "";
  filters.category = params.get("category") || "";
  filters.chain = params.get("chain") || "";
  filters.kind = params.get("kind") || "";
  filters.watch = params.get("watch") === "1";
  $("f-search").value = filters.q;
  $("f-category").value = filters.category;
  $("f-chain").value = filters.chain;
  $("f-kind").value = filters.kind;
  $("f-watch").checked = filters.watch;
}

function visibleRows() {
  let rows = D.rows.filter((r) => {
    if (filters.q) {
      const q = filters.q.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.slug.toLowerCase().includes(q)) return false;
    }
    if (filters.category && (r.category || "") !== filters.category) return false;
    if (filters.chain && !r.chains.includes(filters.chain)) return false;
    if (filters.kind && r.klass !== filters.kind) return false;
    if (filters.watch && !r.watchlist) return false;
    return true;
  });
  const k = sortKey;
  rows.sort((a, b) => {
    let x = a[k], y = b[k];
    if (x === null || x === undefined) x = -Infinity;
    if (y === null || y === undefined) y = -Infinity;
    if (typeof x === "string") return sortDir * x.localeCompare(y);
    return sortDir * (x - y);
  });
  return rows;
}

function renderBoard() {
  const rows = visibleRows();
  $("showing").textContent = `Showing ${rows.length} of ${D.rows.length} pre-token protocols`;
  $("board-body").innerHTML = rows
    .map(
      (r) => `<tr data-slug="${esc(r.slug)}">
        <td class="num">${r.rank}</td>
        <td class="name">${esc(r.name)} <span class="sub">${esc(r.slug)}${r.watchlist ? ' · <span class="badge badge-watch">watchlist</span>' : ""}</span></td>
        <td>${esc(r.category || "—")}</td>
        <td>${esc(r.chains.slice(0, 3).join(", "))}${r.chains.length > 3 ? " +" + (r.chains.length - 3) : ""}</td>
        <td class="num">${fmt$(r.tvl_usd)}</td>
        <td class="num ${r.change_7d === null ? "" : r.change_7d >= 0 ? "pos" : "neg"}">${fmtPct(r.change_7d)}</td>
        <td class="num">${fmt$(r.implied_value_usd)}</td>
        <td><span class="badge ${r.klass === "native" ? "badge-native" : "badge-wrapped"}">${r.klass}</span></td>
      </tr>`,
    )
    .join("");
  for (const tr of document.querySelectorAll("#board-body tr")) {
    tr.addEventListener("click", () => (location.hash = "#/p/" + tr.dataset.slug));
  }
}

function renderLaunched() {
  $("launched-body").innerHTML = D.launched
    .map(
      (r) => `<tr>
        <td class="name">${esc(r.name)}</td>
        <td>${esc(r.symbol || "—")}</td>
        <td>${esc(r.category || "—")}</td>
        <td class="num">${fmt$(r.tvl_usd)}</td>
        <td class="num">${fmt$(r.mcap_usd)}</td>
        <td class="num">${r.ratio === null ? "—" : r.ratio.toFixed(3)}</td>
      </tr>`,
    )
    .join("");
}

function yearsRunning(r) {
  if (!r.listed_at) return "not reported";
  const days = Math.max(0, Math.round((Date.parse(D.as_of) - Date.parse(r.listed_at)) / 86400000));
  return (days / 365.25).toFixed(1) + " years (since " + r.listed_at + ")";
}

function renderDetail(slug) {
  const r = D.rows.find((x) => x.slug === slug);
  if (!r) {
    $("detail").innerHTML = "<h2>Not on the board</h2><p>That protocol records a token already, or is not in the snapshot.</p>";
    return;
  }
  const factorRow = (label, value, note) => `<tr><td>${esc(label)}</td><td>${esc(value)}</td><td>${esc(note)}</td></tr>`;
  $("detail").innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${esc(r.name)}</h2>
        <p class="tagline">${esc(r.category || "Uncategorised")} · ${esc(r.chains.join(", "))} ·
          <span class="badge ${r.klass === "native" ? "badge-native" : "badge-wrapped"}">${r.klass}</span>
          ${r.watchlist ? '<span class="badge badge-watch">watchlist</span>' : ""}</p>
      </div>
      <div class="detail-value">
        <div class="big">${fmt$(r.implied_value_usd)}</div>
        <div class="cap">implied launch value · board rank #${r.rank}</div>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="k">TVL</div><div class="v">${fmt$(r.tvl_usd)}</div></div>
      <div class="stat"><div class="k">TVL change, 7d</div><div class="v">${fmtPct(r.change_7d)}</div></div>
      <div class="stat"><div class="k">Running with no token</div><div class="v">${esc(yearsRunning(r))}</div></div>
      <div class="stat"><div class="k">Token in the record</div><div class="v">none recorded</div></div>
    </div>
    <h2>Why this value</h2>
    <table class="factors">
      <tbody>
        ${factorRow("TVL", fmt$(r.tvl_usd), "the protocol's own total value locked in the snapshot")}
        ${factorRow("Peer multiple", fmtX(r.multiple), "median market cap / TVL of " + r.multiple_basis)}
        ${factorRow("Momentum", fmtX(r.growth_factor), "from its seven-day TVL change of " + fmtPct(r.change_7d))}
        ${factorRow("Track record", fmtX(r.age_factor), "running " + yearsRunning(r) + " with no token")}
        ${factorRow("Product factor", fmtX(r.class_factor), r.klass === "native" ? "a native protocol with a launch of its own to price" : "a wrapped, staked, bridged or exchange product: a claim on an asset that already trades")}
        ${factorRow("Implied value", fmt$(r.implied_value_usd), "TVL × the four factors above, rounded to whole dollars")}
      </tbody>
    </table>
    <h2>How to farm it</h2>
    <ol class="farm">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;
}

function route() {
  const { path, params } = readHash();
  if (path.startsWith("p/")) {
    $("board-view").hidden = true;
    $("model-panel").hidden = true;
    $("detail-view").hidden = false;
    renderDetail(path.slice(2));
    window.scrollTo(0, 0);
  } else {
    $("detail-view").hidden = true;
    $("model-panel").hidden = false;
    $("board-view").hidden = false;
    applyHashFilters(params);
    renderBoard();
  }
}

function init() {
  if (!D) {
    $("snapshot-note").textContent = "No data: run main.ts first.";
    return;
  }
  $("snapshot-note").innerHTML =
    `Snapshot as of ${esc(D.as_of)} · ${D.protocol_count} protocols<br>${D.rows.length} record no token · ${D.watchlist_count} on the watchlist`;
  $("model-foot").textContent =
    `On this snapshot: ${D.launched_peer_count} launched protocols carry both a market cap and a TVL; their median market-cap-to-TVL ratio is ${D.global_median_ratio.toFixed(3)}. Category and family medians are computed from the same set at build time.`;

  const cats = [...new Set(D.rows.map((r) => r.category).filter(Boolean))].sort();
  $("f-category").innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join("");
  const chains = [...new Set(D.rows.flatMap((r) => r.chains))].sort();
  $("f-chain").innerHTML = '<option value="">All chains</option>' + chains.map((c) => `<option>${esc(c)}</option>`).join("");

  const bind = (id, key, isCheck) => {
    $(id).addEventListener("input", (e) => {
      filters[key] = isCheck ? e.target.checked : e.target.value;
      renderBoard();
    });
  };
  bind("f-search", "q", false);
  bind("f-category", "category", false);
  bind("f-chain", "chain", false);
  bind("f-kind", "kind", false);
  bind("f-watch", "watch", true);

  for (const th of document.querySelectorAll("#board th[data-sort]")) {
    th.addEventListener("click", () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortDir = -sortDir;
      else {
        sortKey = k;
        sortDir = k === "name" || k === "category" ? 1 : -1;
        if (k === "rank") sortDir = 1;
      }
      renderBoard();
    });
  }

  renderLaunched();
  window.addEventListener("hashchange", route);
  route();
}

init();
