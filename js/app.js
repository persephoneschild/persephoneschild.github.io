/* ============================================================
   SETTINGS: edit these if you like
   ============================================================ */
const COLLECTION_CSV = "collection.csv";
const WANTS_CSV = "wants.csv";

// Video pages, split by the first letter of the show title.
// Titles starting with a number or symbol go in the first group.
const VIDEO_GROUPS = [
  { id: "#-b", label: "Videos #-B", from: "A", to: "B" },
  { id: "c-g", label: "Videos C–G", from: "C", to: "G" },
  { id: "h-j", label: "Videos H–J", from: "H", to: "J" },
  { id: "k-m", label: "Videos K–M", from: "K", to: "M" },
  { id: "n-p", label: "Videos N–P", from: "N", to: "P" },
  { id: "q-s", label: "Videos Q–S", from: "Q", to: "S" },
  { id: "t-z", label: "Videos T–Z", from: "T", to: "Z" },
];
const AUDIO_GROUP = { id: "audio", label: "Audio" };

const SHOW_PAGES = [
  { id: "hadestown", label: "Hadestown", show: "Hadestown" },
];

// Leading words ignored when sorting
const IGNORED_LEADING_WORDS = ["the", "A", "An"];
/* ============================================================ */

const page = document.body.dataset.page;
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

/* ---------- nav highlight ---------- */
document.querySelectorAll(".main-nav a").forEach(a => {
  if (a.dataset.page === page) { a.classList.add("active"); a.setAttribute("aria-current", "page"); }
});

/* ---------- CSV ---------- */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = ""; rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = (rows.shift() || []).map(h => h.trim());
  return rows.filter(r => r.some(v => v.trim() !== "")).map(r => {
    const o = {}; header.forEach((h, i) => (o[h] = (r[i] || "").trim())); return o;
  });
}

async function loadCSV(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url} could not be loaded (HTTP ${res.status}).`);
  return parseCSV(await res.text());
}

/* ---------- helpers ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isTrue = v => String(v || "").trim().toUpperCase() === "TRUE";
const isVideo = r => (r["Audio / Video"] || "").toLowerCase() === "video";
const isAudio = r => (r["Audio / Video"] || "").toLowerCase() === "audio";

function sortTitle(show) {
  let t = (show || "").trim().toLowerCase().replace(/^[^a-z0-9]+/, "");
  for (const w of IGNORED_LEADING_WORDS) if (t.startsWith(w + " ")) { t = t.slice(w.length + 1); break; }
  return t;
}
function firstLetter(show) {
  const ch = sortTitle(show).charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "";
}
function dateKey(d) {
  const s = (d || "").toLowerCase();
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return +iso[1] * 10000 + +iso[2] * 100 + +iso[3];
  const y = s.match(/\d{4}/); if (!y) return 0;
  const mi = MONTHS.findIndex(m => s.includes(m));
  return +y[0] * 10000 + (mi + 1) * 100;
}
function sortRecords(rows) {
  return rows.slice().sort((a, b) =>
    sortTitle(a.Show).localeCompare(sortTitle(b.Show)) || dateKey(a.Date) - dateKey(b.Date));
}
function inGroup(row, g) {
  const L = firstLetter(row.Show);
  if (!L) return g.from === VIDEO_GROUPS[0].from;
  return L >= g.from && L <= g.to;
}

// NFT = "not for trade": forever, or until a date that hasn't passed yet.
function nftStatus(r) {
  if (isTrue(r["NFT Forever"])) return "NFT forever";
  const d = r["NFT Date"];
  if (d) {
    const today = new Date().toISOString().slice(0, 10);
    if (d >= today) return `NFT until ${d}`;
  }
  return "";
}
function mergedNotes(r) {
  return [r["Master Notes"], r["Trading Notes"]].filter(Boolean).join("\n");
}

/* ---------- rendering ---------- */
function row(label, value) {
  return value ? `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>` : "";
}
function renderEntry(r, mode) {
  const nft = nftStatus(r);
  const kind = isVideo(r) ? "Video" : isAudio(r) ? "Audio" : "";
  const rows = [
    row("Tour", r.Tour),
    row("Date", r.Date),
    row("Master", r.Master),
    row("Cast", r.Cast),
    row("Notes", mergedNotes(r)),
    mode !== "wants" ? row("Trader format", r["Trader Format"]) : "",
    row("NFT", nft),
  ].join("");
  const badge = mode !== "collection" && kind ? `<span class="badge">${kind}</span>` : "";
  return `<article class="entry${nft ? " nft" : ""}">
    <div class="entry-head"><h3>${esc(r.Show || "Untitled")}</h3>${badge}</div>
    <dl>${rows}</dl></article>`;
}

function showList(rows, mode) {
  const list = document.getElementById("list");
  const search = document.getElementById("search");
  const count = document.getElementById("count");
  const html = rows.map(r => ({ r, html: renderEntry(r, mode), text: Object.values(r).join(" ").toLowerCase() }));
  function draw() {
    const q = search.value.trim().toLowerCase();
    const shown = q ? html.filter(h => h.text.includes(q)) : html;
    count.textContent = `${shown.length} ${shown.length === 1 ? "recording" : "recordings"}`;
    list.innerHTML = shown.length ? shown.map(h => h.html).join("") : '<p class="status">Nothing to show here.</p>';
  }
  search.oninput = draw;
  draw();
}

function showError(err) {
  document.getElementById("list").innerHTML =
    `<p class="status">${esc(err.message)} If you opened this file straight from your computer, run <code>python3 -m http.server</code> in the site folder and visit <code>http://localhost:8000</code> instead.</p>`;
}

/* ---------- pages ---------- */
async function initCollection() {
  const nav = document.getElementById("subnav");
  const sections = [...VIDEO_GROUPS, AUDIO_GROUP, ...SHOW_PAGES];
  const current = sections.find(s => s.id === new URLSearchParams(location.search).get("g")) || sections[0];
  nav.innerHTML = sections.map(s =>
    `<a href="collection.html?g=${s.id}" class="${s.id === current.id ? "active" : ""}"${s.id === current.id ? ' aria-current="page"' : ""}>${esc(s.label)}</a>`).join("");
  document.title = `${current.label} – Collection`;
  try {
    const all = await loadCSV(COLLECTION_CSV);
let rows;
if (current.show) {
rows = all.filter(r => isVideo(r) && (r.Show || "").trim().toLowerCase() === current.show.toLowerCase());} else if (current.id === "audio") {
  rows = all.filter(isAudio);
} else {
  rows = all.filter(isVideo)
  .filter(r => inGroup(r, current))
  .filter(r => !SHOW_PAGES.some(p => p.show.toLowerCase() === (r.Show || "").trim().toLowerCase()));
}
    showList(sortRecords(rows), "collection");
  } catch (e) { showError(e); }
}

async function initWants() {
  const nav = document.getElementById("subnav");
  const filters = [{ id: "all", label: "All" }, { id: "video", label: "Video" }, { id: "audio", label: "Audio" }];
  let active = "all", rows = [];
  nav.innerHTML = filters.map(f => `<button type="button" data-f="${f.id}" class="${f.id === active ? "active" : ""}">${f.label}</button>`).join("");
  const apply = () => showList(rows.filter(r => active === "all" || (active === "video" ? isVideo(r) : isAudio(r))), "wants");
  nav.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    active = b.dataset.f;
    nav.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
    apply();
  });
  try { rows = sortRecords(await loadCSV(WANTS_CSV)); apply(); } catch (e) { showError(e); }
}
async function initMasters() {
  const clean = s => (s || "").toLowerCase().replace(/[’‘`]/g, "'").trim();
  try {
    const all = await loadCSV(COLLECTION_CSV);
    const rows = all.filter(r => clean(r.Master) === "persephoneschild");
    showList(sortRecords(rows), "masters");
  } catch (e) { showError(e); }
}
if (page === "collection") initCollection();
if (page === "wants") initWants();
if (page === "masters") initMasters();
