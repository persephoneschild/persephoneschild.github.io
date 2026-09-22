// app.js — loads collection.csv/wants.csv, renders the pages, handles search/sort/cart/routing.

/* ---------------- 1. Configuration ---------------- */

// DATE_SORT_OPTIONS is for single-show pages (e.g. Hadestown), where every row has the same title so A–Z is useless.
const TITLE_SORT_OPTIONS = [{ value: 'title', label: 'A–Z by title' }];
const DATE_SORT_OPTIONS = [
  { value: 'date-ascending', label: 'Date: oldest first' },
  { value: 'date-descending', label: 'Date: newest first' },
];

// The collection pages, keyed by URL hash. filter selects rows from collection.csv; sortOptions defaults to TITLE_SORT_OPTIONS.
const COLLECTION_ROUTES = {
  audios: {
    title: 'Audios',
    filter: (recording) => recording['Audio / Video'] === 'Audio',
    sortOptions: TITLE_SORT_OPTIONS,
  },
  hadestown: {
    title: 'Hadestown',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() === 'hadestown',
    sortOptions: DATE_SORT_OPTIONS,
  },
  'New-In': {
    title: 'New In',
    filter: (recording) => {
      const collectedDate = new Date(recording.Collected);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return collectedDate >= sevenDaysAgo;
    },
    // Groups by collected day instead of Show — see groupByCollectedDate().
    groupBy: 'collected',
  },
  'videos-#-b': {
    title: 'Videos #–B',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() !== 'hadestown' &&
      firstLetter(recording) < 'c',
    sortOptions: TITLE_SORT_OPTIONS,
  },
  'videos-c-e': {
    title: 'Videos C–E',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() !== 'hadestown' &&
      firstLetter(recording) >= 'c' &&
      firstLetter(recording) < 'f',
    sortOptions: TITLE_SORT_OPTIONS,
  },
  'videos-f-i': {
    title: 'Videos F–I',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() !== 'hadestown' &&
      firstLetter(recording) >= 'f' &&
      firstLetter(recording) < 'j',
    sortOptions: TITLE_SORT_OPTIONS,
  },
  'videos-j-m': {
    title: 'Videos J–M',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() !== 'hadestown' &&
      firstLetter(recording) >= 'j' &&
      firstLetter(recording) < 'n',
    sortOptions: TITLE_SORT_OPTIONS,
  },
  'videos-n-r': {
    title: 'Videos N–R',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() !== 'hadestown' &&
      firstLetter(recording) >= 'n' &&
      firstLetter(recording) < 'r',
    sortOptions: TITLE_SORT_OPTIONS,
  },
  'videos-s-z': {
    title: 'Videos S–Z',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() !== 'hadestown' &&
      firstLetter(recording) >= 's',
    sortOptions: TITLE_SORT_OPTIONS,
  },
};

// Cards shown on the Videos index page (#videos), in order. Every key must exist in COLLECTION_ROUTES.
const VIDEO_INDEX_ROUTES = ['New-In', 'videos-#-b', 'videos-c-e', 'videos-f-i', 'videos-j-m', 'videos-n-r', 'videos-s-z', 'hadestown'];

// openGroups is keyed "recordings:Show" / "wants:Show" so the two lists' open/closed state doesn't mix.
const state = { recordings: [], wants: [], cart: [], openGroups: new Set() };


/* ---------------- 2. CSV parsing ---------------- */

// Parses CSV char-by-char (not split(',')) since quoted cells can contain commas and newlines.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    }
    else if (character === '"' && cell === '') quoted = true;
    else if (character === ',') { row.push(cell.trim()); cell = ''; }
    else if (character === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else if (character !== '\r') cell += character;
  }

  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }

  const headers = rows.shift().map((header) => header.trim());

  // Every recording gets a unique internal id (recording-1, recording-2, ...) so the cart can track it.
  return rows.filter((row) => row.length).map((row, index) => Object.assign(
    Object.fromEntries(headers.map((header, headerIndex) => [header, (row[headerIndex] || '').trim()])),
    { _id: `recording-${index + 1}` },
  ));
}


/* ---------------- 3. Small helpers ---------------- */

function recordingTitle(recording) {
  return recording.Show || recording.title || 'Untitled recording';
}

// Lowercases, unwraps a leading "[Something]", and drops a leading "the/a/an" so "The Who's Tommy" files under T-o-m-m-y.
function sortableTitle(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/^\[([^\]]+)\]\s*/i, '$1 ')
    .replace(/^(the|a|an)(?=\s)/i, '')
    .trim();
}

function firstLetter(recording) {
  return sortableTitle(recordingTitle(recording)).charAt(0).toLowerCase();
}

// Strips a trailing "(note)" before parsing. Unparseable dates sort last (+Infinity).
function recordingDateValue(recording) {
  const date = String(recording.Date || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const timestamp = Date.parse(date);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

// Unknown dates always sort last regardless of direction (a plain descending subtraction would otherwise put them first). Ties fall back to title.
function compareByDate(a, b, direction) {
  const dateA = recordingDateValue(a);
  const dateB = recordingDateValue(b);
  const unknownA = dateA === Number.POSITIVE_INFINITY;
  const unknownB = dateB === Number.POSITIVE_INFINITY;
  const byTitle = () => sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b)));

  if (unknownA && unknownB) return byTitle();
  if (unknownA || unknownB) return unknownA ? 1 : -1;
  return (direction === 'ascending' ? dateA - dateB : dateB - dateA) || byTitle();
}

// Restricted while "NFT Forever" is set, or "NFT Date" hasn't passed yet.
function isNftRestricted(recording) {
  if (recording['NFT Forever']) return true;
  const nftDate = Date.parse(recording['NFT Date']);
  return !Number.isNaN(nftDate) && nftDate > Date.now();
}

function formatCount(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2026-09-16" -> "September 16, 2026". Split rather than Date.parse, so a visitor west of UTC doesn't see the date shift back a day.
// slice(0, 10) also handles a full timestamp like collected_at ("2026-09-16T23:59:49.000000Z").
function formatIsoDate(isoDate) {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

// "NFT Forever" outranks any date. Non-ISO values are shown as entered.
function formatNftValue(recording) {
  if (recording['NFT Forever']) return 'NFT Forever';
  const raw = recording['NFT Date'] || '';
  if (!raw) return 'Not listed';
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? formatIsoDate(raw) : raw;
}

function recordingField(recording, label, fallback = 'Not listed') {
  return recording[label] || fallback;
}

// Non-ISO dates (e.g. hand-typed "June, 2024") are shown as entered.
function formatRecordingDate(recording) {
  const raw = recording.Date || '';
  if (!raw) return 'Not listed';
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? formatIsoDate(raw) : raw;
}

// Builds the details grid under a recording's title (Tour, Date, Master, Cast, Notes, NFT date, Trader Format).
// includeTraderFormat: collection pages only. includeMediaType: Wants only (audio/video mixed together there).
function recordingDetails(recording, includeTraderFormat = true, includeMediaType = false) {
  const notes = [
    recording['Master Notes'] && `Master: ${recording['Master Notes']}`,
    recording['Trading Notes'] && `Trader: ${recording['Trading Notes']}`,
  ].filter(Boolean).join(' | ') || 'Not listed';

  const nft = formatNftValue(recording);

  const mediaType = includeMediaType
    ? `<div class="recording-field"><span>Audio / Video</span><b>${recordingField(recording, 'Audio / Video')}</b></div>`
    : '';
  const traderFormat = includeTraderFormat
    ? `<div class="recording-field"><span>Trader Format</span><b>${recordingField(recording, 'Trader Format')}</b></div>`
    : '';

  return `<div class="recording-fields">${mediaType}<div class="recording-field"><span>Tour</span><b>${recordingField(recording, 'Tour')}</b></div><div class="recording-field"><span>Date</span><b>${formatRecordingDate(recording)}</b></div><div class="recording-field"><span>Master</span><b>${recordingField(recording, 'Master')}</b></div><div class="recording-field recording-field-cast"><span>Cast</span><b>${recordingField(recording, 'Cast')}</b></div><div class="recording-field recording-field-wide"><span>Notes</span><b>${notes}</b></div><div class="recording-field"><span>NFT date</span><b>${nft}</b></div>${traderFormat}</div>`;
}


/* ---------------- 4. Loading the data ---------------- */

// Fetches both CSVs in parallel (relative to index.html, works locally and on Pages), parses, sorts A–Z, renders.
async function loadData() {
  const collectionUrl = new URL('collection.csv', document.baseURI);
  const wantsUrl = new URL('wants.csv', document.baseURI);

  const [recordingsResponse, wantsResponse] = await Promise.all([fetch(collectionUrl), fetch(wantsUrl)]);

  if (!recordingsResponse.ok) throw new Error(`collection.csv returned ${recordingsResponse.status}`);
  if (!wantsResponse.ok) throw new Error(`wants.csv returned ${wantsResponse.status}`);

  state.recordings = parseCSV(await recordingsResponse.text());
  state.wants = parseCSV(await wantsResponse.text());

  state.recordings.sort((a, b) => sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b))));

  renderAll();
}


/* ---------------- 5. Rendering ---------------- */

// Redraws everything and refreshes the home page counters + "Last Updated" (latest Collected date).
function renderAll() {
  renderRecordings();
  renderVideoIndex();
  renderWants();
  renderCart();
  document.querySelector('#home-recording-count').textContent = String(state.recordings.length).padStart(2, '0');
  document.querySelector('#home-want-count').textContent = String(state.wants.length).padStart(2, '0');

  // Collected dates are "YYYY-MM-DD", so plain string comparison sorts chronologically.
  const latestCollected = state.recordings.reduce((latest, recording) => (recording.Collected > latest ? recording.Collected : latest), '');
  document.querySelector('#last-updated').textContent = latestCollected ? `Last Updated: ${formatIsoDate(latestCollected)}` : 'Last Updated: —';
}

// One card per VIDEO_INDEX_ROUTES entry; each count is computed live from the route's own filter so it can't drift.
function renderVideoIndex() {
  const list = document.querySelector('#video-index-list');
  if (!list) return;

  list.innerHTML = VIDEO_INDEX_ROUTES.map((key) => {
    const route = COLLECTION_ROUTES[key];
    if (!route) return '';
    const count = state.recordings.filter(route.filter).length;
    return `<a class="index-card" href="#${key}"><h3>${route.title}</h3><p>${formatCount(count, 'recording')}</p></a>`;
  }).join('');
}

// Groups items by Show, preserving first-seen order. Returns [{ title, items }, ...].
function groupByShow(items) {
  const groups = [];
  const indexByTitle = new Map();
  items.forEach((item) => {
    const title = recordingTitle(item);
    if (!indexByTitle.has(title)) {
      indexByTitle.set(title, groups.length);
      groups.push({ title, items: [item] });
    } else {
      groups[indexByTitle.get(title)].items.push(item);
    }
  });
  return groups;
}

// Groups by the day Collected (YYYY-MM-DD), newest day first; unknown dates land in a trailing "Date unknown" group.
function groupByCollectedDate(items) {
  const groups = [];
  const indexByDate = new Map();

  items.forEach((item) => {
    const isoDate = String(item.Collected || '').slice(0, 10);
    const key = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : '';
    if (!indexByDate.has(key)) {
      indexByDate.set(key, groups.length);
      groups.push({ key, title: key ? formatIsoDate(key) : 'Date unknown', items: [item] });
    } else {
      groups[indexByDate.get(key)].items.push(item);
    }
  });

  // '' (unknown) sorts last since it's "smaller" than any real date string.
  groups.sort((a, b) => b.key.localeCompare(a.key));

  return groups;
}

// An explicit groupBy (e.g. New In's "collected") always wins. Otherwise grouping by Show is skipped ("none")
// when the results are all one Show (e.g. Hadestown), since a single fold would just hide everything pointlessly.
function chooseGroupBy(items, explicitGroupBy) {
  if (explicitGroupBy) return explicitGroupBy;
  const distinctShows = new Set(items.map(recordingTitle));
  return distinctShows.size === 1 ? 'none' : 'show';
}

// Renders recordings/wants as collapsible <details> per Show (closed by default; state persists via state.openGroups),
// or as a flat list when groupBy is 'none'. scope keeps recordings/wants open-state separate.
function renderShowGroups(items, { scope, addable, includeTraderFormat, includeMediaType, groupBy = 'show' }) {
  if (groupBy === 'none') {
    return items.map((recording, index) => {
      const restricted = isNftRestricted(recording);
      const titleClass = restricted ? ' is-nft' : '';
      const subtitle = `${recordingField(recording, 'Tour')} — ${formatRecordingDate(recording)} — ${recordingField(recording, 'Master')}`;
      const addControl = addable && !restricted
        ? (() => {
          const selected = state.cart.some((item) => item._id === recording._id);
          return `<label class="check-control"><input class="recording-check" data-recording-id="${recording._id}" type="checkbox" ${selected ? 'checked' : ''}><span>Add</span></label>`;
        })()
        : '';
      return `<div class="recording-row"><div class="recording-row-top"><span class="recording-index">${String(index + 1).padStart(2, '0')}</span><strong class="recording-title${titleClass}">${subtitle}</strong>${addControl}</div>${recordingDetails(recording, includeTraderFormat, includeMediaType)}</div>`;
    }).join('');
  }

  const groupedByCollectedDate = groupBy === 'collected';
  const groups = groupedByCollectedDate ? groupByCollectedDate(items) : groupByShow(items);

  // Within a fold: oldest-to-newest by Date for Show groups, A–Z by title for Collected-date groups.
  groups.forEach((group) => {
    group.items.sort(groupedByCollectedDate
      ? (a, b) => sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b)))
      : (a, b) => recordingDateValue(a) - recordingDateValue(b));
  });

  return groups.map((group, groupIndex) => {
    const recordingsHtml = group.items.map((recording) => {
      const restricted = isNftRestricted(recording);
      const titleClass = restricted ? ' is-nft' : '';
      // Collected-date groups prepend the Show name since the fold heading is a date, not a Show.
      const subtitle = groupedByCollectedDate
        ? `${recordingTitle(recording)} — ${recordingField(recording, 'Tour')} — ${formatRecordingDate(recording)} — ${recordingField(recording, 'Master')}`
        : `${recordingField(recording, 'Tour')} — ${formatRecordingDate(recording)} — ${recordingField(recording, 'Master')}`;
      const addControl = addable && !restricted
        ? (() => {
          const selected = state.cart.some((item) => item._id === recording._id);
          return `<label class="check-control"><input class="recording-check" data-recording-id="${recording._id}" type="checkbox" ${selected ? 'checked' : ''}><span>Add</span></label>`;
        })()
        : '';
      return `<div class="recording-subrow"><div class="recording-row-top"><span class="recording-index">&ndash;</span><strong class="recording-title${titleClass}">${subtitle}</strong>${addControl}</div>${recordingDetails(recording, includeTraderFormat, includeMediaType)}</div>`;
    }).join('');

    const openAttribute = state.openGroups.has(`${scope}:${group.title}`) ? ' open' : '';

    return `<details class="recording-row show-group"${openAttribute}><summary class="recording-row-top show-group-summary"><span class="recording-index">${String(groupIndex + 1).padStart(2, '0')}</span><strong class="recording-title">${group.title}</strong><span class="show-group-meta">${formatCount(group.items.length, 'recording')}</span></summary><div class="show-group-body">${recordingsHtml}</div></details>`;
  }).join('');
}

// Remembers each .show-group's open/closed state in state.openGroups, keyed by scope; re-attached on every render.
function trackOpenGroups(list, scope) {
  list.querySelectorAll('.show-group').forEach((details) => {
    const title = details.querySelector('.show-group-summary .recording-title').textContent;
    const key = `${scope}:${title}`;
    details.addEventListener('toggle', () => {
      if (details.open) state.openGroups.add(key);
      else state.openGroups.delete(key);
    });
  });
}

// Rebuilds #collection-sort to match the route's sortOptions, keeping the current value if still valid.
// Only touches the DOM when the option set actually changed, since this runs on every search keystroke.
function populateSortOptions(route) {
  const select = document.querySelector('#collection-sort');
  const options = route.sortOptions || TITLE_SORT_OPTIONS;
  const key = options.map((option) => option.value).join(',');
  if (select.dataset.optionsKey === key) return;

  select.innerHTML = options.map((option) => `<option value="${option.value}">${option.label}</option>`).join('');
  select.dataset.optionsKey = key;
  select.value = options[0].value;
}

// Draws the collection list for the current route, applying search + sort. Re-run on every search keystroke.
function renderRecordings() {
  const list = document.querySelector('#recording-list');

  const route = COLLECTION_ROUTES[location.hash.replace('#', '')] || COLLECTION_ROUTES.audios;
  const query = document.querySelector('#collection-search').value.toLowerCase().trim();

  populateSortOptions(route);
  const sort = document.querySelector('#collection-sort').value;

  document.querySelector('#collection-title').textContent = route.title;

  // Search checks every column (venue, cast, master, notes, etc.).
  let recordings = state.recordings.filter((recording) =>
    route.filter(recording) && Object.values(recording).some((value) => value.toLowerCase().includes(query)));

  recordings = [...recordings].sort((a, b) => sort === 'date-ascending'
    ? compareByDate(a, b, 'ascending')
    : sort === 'date-descending'
      ? compareByDate(a, b, 'descending')
      : sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b))));

  document.querySelector('#collection-result-count').textContent = formatCount(recordings.length, 'recording');

  list.innerHTML = recordings.length
    ? renderShowGroups(recordings, { scope: 'recordings', addable: true, includeTraderFormat: true, includeMediaType: false, groupBy: chooseGroupBy(recordings, route.groupBy) })
    : '<div class="empty-state"><h3>No recordings found.</h3><p>Try another title, place, or keyword.</p></div>';

  list.querySelectorAll('.recording-check').forEach((checkbox) =>
    checkbox.addEventListener('change', () => toggleCart(checkbox.dataset.recordingId)));
  trackOpenGroups(list, 'recordings');
}

// Same shape as renderRecordings: filtered by search + Audio/Video, always sorted A–Z.
function renderWants() {
  const mediaFilter = document.querySelector('#wants-media-filter').value;
  const query = document.querySelector('#wants-search').value.toLowerCase().trim();

  const wants = state.wants
    .filter((want) => (mediaFilter === 'all' || want['Audio / Video'] === mediaFilter)
      && Object.values(want).some((value) => value.toLowerCase().includes(query)))
    .sort((a, b) => sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b))));

  document.querySelector('#wants-result-count').textContent = formatCount(wants.length, 'want');

  const wantsList = document.querySelector('#wants-list');
  wantsList.innerHTML = wants.length
    ? renderShowGroups(wants, { scope: 'wants', addable: false, includeTraderFormat: false, includeMediaType: true, groupBy: chooseGroupBy(wants) })
    : '<div class="empty-state"><h3>No wants found.</h3><p>Try another title, format, or keyword.</p></div>';
  trackOpenGroups(wantsList, 'wants');
}


/* ---------------- 6. The cart ---------------- */

function toggleCart(id) {
  const recording = state.recordings.find((item) => item._id === id);
  const existingIndex = state.cart.findIndex((item) => item._id === id);
  if (existingIndex >= 0) state.cart.splice(existingIndex, 1);
  else state.cart.push(recording);
  renderAll();
}

// Format promised on the cart page: Show - Tour - Date - Master - Encora Link.
function requestLine(recording) {
  return `${recordingTitle(recording)} - ${recordingField(recording, 'Tour')} - ${formatRecordingDate(recording)} - ${recordingField(recording, 'Master')} ${recordingField(recording, 'Link')}`;
}

function renderCart() {
  document.querySelector('#cart-count').textContent = state.cart.length;

  const items = document.querySelector('#cart-items');
  const empty = document.querySelector('#cart-empty');

  empty.style.display = state.cart.length ? 'none' : 'block';

  items.innerHTML = state.cart.map((recording) =>
    `<div class="cart-item"><div><h3>${recordingTitle(recording)}</h3><p>${recordingField(recording, 'Tour')} / ${formatRecordingDate(recording)} / ${recordingField(recording, 'Master')}</p></div><button class="remove-item" data-remove-id="${recording._id}" type="button">Remove</button></div>`).join('');

  document.querySelector('#request-preview').textContent = state.cart.map(requestLine).join('\n');

  items.querySelectorAll('[data-remove-id]').forEach((button) =>
    button.addEventListener('click', () => toggleCart(button.dataset.removeId)));
}


/* ---------------- 7. Routing ---------------- */

function showRoute() {
  const route = location.hash.replace('#', '') || 'home';

  const validRoute = ['home', 'videos', 'audios', 'hadestown', 'New-In', 'videos-#-b', 'videos-c-e', 'videos-f-i', 'videos-j-m', 'videos-n-r', 'videos-s-z', 'wants', 'cart'].includes(route) ? route : 'home';

  // Videos, Hadestown and Audios all share one <section>.
  const isCollectionRoute = ['audios', 'hadestown', 'New-In', 'videos-#-b', 'videos-c-e', 'videos-f-i', 'videos-j-m', 'videos-n-r', 'videos-s-z'].includes(validRoute);

  document.querySelectorAll('.view').forEach((view) =>
    view.classList.toggle('active', view.dataset.view === validRoute || (view.dataset.view === 'collection' && isCollectionRoute)));

  // The Videos index has its own section but stays under the Collection menu highlight.
  const isCollectionMenuRoute = isCollectionRoute || validRoute === 'videos';

  document.querySelectorAll('[data-route]').forEach((link) =>
    link.classList.toggle('active', link.dataset.route === validRoute || (link.dataset.route === 'collection' && isCollectionMenuRoute)));

  // Redraw since Videos/Hadestown/Audios reuse the same section; length check avoids running before CSVs load.
  if (isCollectionRoute && state.recordings.length) renderRecordings();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Falls back to selecting the textarea + execCommand on older/non-https browsers where clipboard API is unavailable.
async function copyRequest() {
  if (!state.cart.length) { location.hash = 'audios'; return; }

  const request = state.cart.map(requestLine).join('\n');
  try {
    await navigator.clipboard.writeText(request);
    document.querySelector('#copy-status').textContent = 'Request copied';
  } catch (error) {
    const preview = document.querySelector('#request-preview');
    preview.select?.();
    document.execCommand('copy');
    document.querySelector('#copy-status').textContent = 'Request copied';
  }
}


/* ---------------- 8. Wiring up controls and startup ---------------- */

document.querySelector('#collection-search').addEventListener('input', renderRecordings);
document.querySelector('#collection-sort').addEventListener('change', renderRecordings);

document.querySelector('#wants-search').addEventListener('input', renderWants);
document.querySelector('#wants-media-filter').addEventListener('change', renderWants);
document.querySelector('#wants-sort').addEventListener('change', renderWants);

document.querySelector('#copy-request-button').addEventListener('click', copyRequest);

document.querySelectorAll('.collection-dropdown a').forEach((link) =>
  link.addEventListener('click', () => { link.closest('details').open = false; }));

window.addEventListener('hashchange', showRoute);

// "/" jumps to the collection and focuses search; ignored while typing in a field.
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    event.preventDefault();
    location.hash = 'audios';
    document.querySelector('#collection-search').focus();
  }
});

showRoute();

loadData().catch((error) => {
  document.querySelector('#recording-list').innerHTML = `<div class="empty-state"><h3>Collection unavailable.</h3><p>${error.message}. Confirm collection.csv and wants.csv are in the same repository folder as index.html.</p></div>`;
  document.querySelector('#home-recording-count').textContent = '--';
  document.querySelector('#home-want-count').textContent = '--';
  document.querySelector('#last-updated').textContent = 'Last Updated: unavailable';
});
