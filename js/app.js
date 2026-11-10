/* ============================================================
   SETTINGS: edit these if you like
   ============================================================ */
const COLLECTION_CSV = "collection.csv";
const WANTS_CSV = "wants.csv";

// Video pages: one per letter (plus "#" for titles starting with a number).
// Letters with no videos are left off the Collection page automatically.
const LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

const AUDIO_GROUP = { id: "audio", label: "Audio" };

// Show-specific pages (videos only). Each gets its own link on the Collection
// page, and those shows are left out of the letter pages.
// id = short name for the address, label = text shown, show = name exactly as in the CSV.
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
  for (const w0 of IGNORED_LEADING_WORDS) { const w = w0.toLowerCase(); if (t.startsWith(w + " ")) { t = t.slice(w.length + 1); break; } }
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
  const day = s.match(/(\d{1,2}),\s*\d{4}/);
  return +y[0] * 10000 + (mi + 1) * 100 + (day ? +day[1] : 0);
}
function sortRecords(rows) {
  return rows.slice().sort((a, b) =>
    sortTitle(a.Show).localeCompare(sortTitle(b.Show)) || dateKey(a.Date) - dateKey(b.Date));
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
  const param = new URLSearchParams(location.search).get("g");
  const titleEl = document.getElementById("title");
  const landing = document.getElementById("landing");
  const results = document.getElementById("results");
  const nav = document.getElementById("subnav");

  const letterPages = LETTERS.map(L => ({ id: L === "#" ? "num" : L.toLowerCase(), label: L, letter: L }));
  const current = [...SHOW_PAGES, AUDIO_GROUP, ...letterPages].find(s => s.id === param);

  let all;
  try { all = await loadCSV(COLLECTION_CSV); }
  catch (e) { results.hidden = false; nav.hidden = true; showError(e); return; }

  const showKey = r => (r.Show || "").trim().toLowerCase();
  const hasOwnPage = r => SHOW_PAGES.some(p => p.show.toLowerCase() === showKey(r));
  const letterOf = r => firstLetter(r.Show) || "#";
  const videos = all.filter(isVideo);
  const audios = all.filter(isAudio);

  const showCounts = SHOW_PAGES.map(p => videos.filter(r => showKey(r) === p.show.toLowerCase()).length);
  const letterCounts = letterPages.map(p => videos.filter(r => !hasOwnPage(r) && letterOf(r) === p.letter).length);
  const link = (id, text, n) => `<li><a href="collection.html?g=${id}">${esc(text)}</a>${n === undefined ? "" : ` <span class="n">(${n})</span>`}</li>`;

  // Landing page: lists of links
  if (!current) {
    document.title = "Collection";
    titleEl.textContent = `Video (${videos.length} recordings)`;
    nav.hidden = true;
    landing.innerHTML =
      (SHOW_PAGES.length ? `<h2>Show-Specific Pages</h2><ul class="link-list">${SHOW_PAGES.map((p, i) => link(p.id, p.label, showCounts[i])).join("")}</ul>` : "") +
      `<h2>Everything else, alphabetically</h2><ul class="link-list letters">${letterPages.map((p, i) => letterCounts[i] ? link(p.id, p.label, letterCounts[i]) : "").join("")}</ul>` +
      `<h2>Audio</h2><ul class="link-list">${link(AUDIO_GROUP.id, "All audio recordings", audios.length)}</ul>`;
    landing.hidden = false;
    return;
  }

  // Sub pages: a list of recordings
  let rows;
  if (current.show) {
    rows = videos.filter(r => showKey(r) === current.show.toLowerCase());
    titleEl.textContent = current.label;
  } else if (current.id === "audio") {
    rows = audios;
    titleEl.textContent = "Audio";
  } else {
    rows = videos.filter(r => !hasOwnPage(r) && letterOf(r) === current.letter);
    titleEl.textContent = `Video: ${current.label}`;
  }
  document.title = `${titleEl.textContent} – Collection`;

  const items = [
    `<a href="collection.html">All video</a>`,
    ...SHOW_PAGES.map(p => `<a href="collection.html?g=${p.id}" class="${p.id === current.id ? "active" : ""}">${esc(p.label)}</a>`),
    `<a href="collection.html?g=audio" class="${current.id === "audio" ? "active" : ""}">Audio</a>`,
    ...letterPages.filter((p, i) => letterCounts[i] || p.id === current.id)
      .map(p => `<a href="collection.html?g=${p.id}" class="${p.id === current.id ? "active" : ""}">${p.label}</a>`),
  ];
  nav.innerHTML = items.join("");
  nav.hidden = false;
  results.hidden = false;
  showList(sortRecords(rows), "collection");
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
