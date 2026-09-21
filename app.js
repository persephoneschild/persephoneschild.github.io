/* ============================================================================
   PersephonesChild Collection — app.js

   What this file does, top to bottom:
     1. Sets up configuration (the three collection pages).
     2. Holds all site data in one `state` object.
     3. Reads collection.csv / wants.csv and turns them into JavaScript objects.
     4. Draws the recording lists, the wants list, and the cart onto the page.
     5. Handles routing (#home, #videos, #hadestown, #audios, #wants, #cart).

   ============================================================================ */

/* ---------------------------------------------------------------------------
   1. CONFIGURATION
   --------------------------------------------------------------------------- */

// The three collection pages. The key is the URL hash (e.g. "#audios"), and
// each entry says what heading to show and which recordings belong on it.
// `filter` is a test run against every row of collection.csv: rows that return
// true appear on that page.
const COLLECTION_ROUTES = {
  // Everything marked as Audio in the "Audio / Video" column.
  audios: {
    title: 'Audios',
    eyebrow: '07 / Audios',
    filter: (recording) => recording['Audio / Video'] === 'Audio',
  },
  // Videos whose show name is exactly "Hadestown".
  hadestown: {
    title: 'Hadestown',
    eyebrow: '07 / Hadestown',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() === 'hadestown',
  },
  // New in that shows recordings collected in the last 7 days
  'New-In': {
    title: 'New In',
    eyebrow: 'Added in the last 7 days',
    filter: (recording) => {
      const collectedDate = new Date(recording.Collected);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return collectedDate >= sevenDaysAgo;
    },
    // Unlike every other page, New In groups by the day something was
    // collected rather than by Show — see groupByCollectedDate() — so the
    // newest arrivals are always the first thing you see, newest day first.
    groupBy: 'collected',
  },
  // All other videos, split alphabetically into pages 
  'videos-#-b': {
    title: 'Videos #–B',
    eyebrow: '01 / Videos #–B',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() !== 'hadestown' &&
      firstLetter(recording) < 'c',
  },
  'videos-c-e': {
    title: 'Videos C–E',
    eyebrow: '02 / Videos C–E',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() !== 'hadestown' &&
      firstLetter(recording) >= 'c' &&
      firstLetter(recording) < 'f',
  },
  'videos-f-i': {
    title: 'Videos F–I',
    eyebrow: '03 / Videos F–I',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() !== 'hadestown' &&
      firstLetter(recording) >= 'f' &&
      firstLetter(recording) < 'j',
  },
  'videos-j-m': {
    title: 'Videos J–M',
    eyebrow: '04 / Videos J–M',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() !== 'hadestown' &&
      firstLetter(recording) >= 'j' &&
      firstLetter(recording) < 'n',
  },
  'videos-n-r': {
    title: 'Videos N–R',
    eyebrow: '05 / Videos N–R',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() !== 'hadestown' &&
      firstLetter(recording) >= 'n' &&
      firstLetter(recording) < 'r',
  },
  'videos-s-z': {
    title: 'Videos S–Z',
    eyebrow: '06 / Videos S–Z',
    filter: (recording) =>
      recording['Audio / Video'] === 'Video' &&
      recordingTitle(recording).toLowerCase() !== 'hadestown' &&
      firstLetter(recording) >= 's',
  },
  
};

// The pages listed on the Videos index page (#videos), in the order they
// appear there. Every key must exist in COLLECTION_ROUTES above; add a key
// here when you add a video page, and the card appears automatically.
const VIDEO_INDEX_ROUTES = ['New-In', 'videos-#-b', 'videos-c-e', 'videos-f-i', 'videos-j-m', 'videos-n-r', 'videos-s-z', 'hadestown'];

// The single source of truth for the page:
//   recordings — every row from collection.csv
//   wants      — every row from wants.csv
//   cart       — the recordings the visitor has ticked
//   openGroups — which show groups are currently unfolded, keyed by
//                "recordings:Show Name" or "wants:Show Name" so the two
//                lists don't share state. Re-read on every render so a
//                group stays open across re-renders (e.g. ticking Add).
const state = { recordings: [], wants: [], cart: [], openGroups: new Set() };


/* ---------------------------------------------------------------------------
   2. CSV PARSING
   --------------------------------------------------------------------------- */

/**
 * Turns raw CSV text into an array of objects, one per row, keyed by the
 * column headers on the first line. For example the row
 *     Audio,Hadestown,West End,...
 * becomes
 *     { "Audio / Video": "Audio", Show: "Hadestown", Tour: "West End", ... }
 *
 * It reads the text one character at a time because commas and line breaks are
 * allowed *inside* quoted cells (cast lists are full of commas), so a simple
 * text.split(',') would break the data apart in the wrong places.
 */
function parseCSV(text) {
  const rows = [];   // every finished row
  let row = [];      // the row currently being built
  let cell = '';     // the cell currently being built
  let quoted = false; // are we inside a "quoted cell" right now?

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      // Inside quotes, commas and newlines are ordinary text.
      // A doubled quote ("") is the CSV way of writing a literal quote mark.
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false; // closing quote
      else cell += character;
    }
    // An opening quote only counts at the very start of a cell.
    else if (character === '"' && cell === '') quoted = true;
    // A comma outside quotes ends the current cell.
    else if (character === ',') { row.push(cell.trim()); cell = ''; }
    // A newline outside quotes ends the cell *and* the row.
    else if (character === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    // Ignore carriage returns (Windows line endings); keep everything else.
    else if (character !== '\r') cell += character;
  }

  // Files often end without a trailing newline — save whatever is left over.
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }

  // The first row is the header row: it supplies the property names.
  const headers = rows.shift().map((header) => header.trim());

  // Pair each header with the matching cell, and give every recording a unique
  // internal id (recording-1, recording-2, ...) so the cart can track it.
  return rows.filter((row) => row.length).map((row, index) => Object.assign(
    Object.fromEntries(headers.map((header, headerIndex) => [header, (row[headerIndex] || '').trim()])),
    { _id: `recording-${index + 1}` },
  ));
}


/* ---------------------------------------------------------------------------
   3. SMALL HELPERS
   --------------------------------------------------------------------------- */

// The display name of a recording: the "Show" column, with fallbacks.
function recordingTitle(recording) {
  return recording.Show || recording.title || 'Untitled recording';
}

// The name used for alphabetical sorting only. It lowercases the title, turns a
// leading "[Something] Title" into "Something Title", and drops a leading
// "the", "a" or "an" so that "The Who's Tommy" files under T-o-m-m-y... rather
// than under T-h-e.
function sortableTitle(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/^\[([^\]]+)\]\s*/i, '$1 ')
    .replace(/^(the|a|an)(?=\s)/i, '')
    .trim();
}

// The first character of a title as it's used for sorting, so "The Wiz" counts
// as W and "[Workshop] Hadestown" counts as W too. Used to split Videos into
// A-H / I-Z pages.
function firstLetter(recording) {
  return sortableTitle(recordingTitle(recording)).charAt(0).toLowerCase();
}

// Converts the Date column into a number so dates can be sorted.
// It first removes any trailing bracketed note, e.g. "June, 2024 (matinee)".
// Anything unparseable sorts last, because Infinity is larger than any date.
function recordingDateValue(recording) {
  const date = String(recording.Date || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const timestamp = Date.parse(date);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

// True when a recording is still under NFT restriction: marked "NFT Forever",
// or given an "NFT Date" that hasn't passed yet (i.e. it's NFT until then).
// A past NFT Date means the restriction has already expired.
function isNftRestricted(recording) {
  if (recording['NFT Forever']) return true;
  const nftDate = Date.parse(recording['NFT Date']);
  return !Number.isNaN(nftDate) && nftDate > Date.now();
}

// "1 recording" / "12 recordings" — adds the plural s only when needed.
function formatCount(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// Spelled-out month names, used by formatIsoDate below.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Turns an ISO date like "2026-09-16" into "September 16, 2026". Parsed by
// splitting the string rather than with Date.parse/toLocaleDateString, so a
// visitor west of UTC never sees the date shifted back by a day.
//
// The slice(0, 10) takes just the date part, so a full timestamp
// ("2026-09-16T23:59:49.000000Z", which is what the Encora API returns for
// collected_at) works too. Without it the day would come out as
// "16T23:59:49.000000Z" and print as NaN.
function formatIsoDate(isoDate) {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

// The value shown in the "NFT date" field. "NFT Forever" outranks any date,
// since that restriction never lifts. Otherwise the date is formatted the same
// way as the Date column; the Encora API sends it as a full timestamp
// ("2014-11-30T00:00:00.000000Z"), which formatIsoDate trims for us. Anything
// that isn't an ISO date is shown exactly as entered.
function formatNftValue(recording) {
  if (recording['NFT Forever']) return 'NFT Forever';
  const raw = recording['NFT Date'] || '';
  if (!raw) return 'Not listed';
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? formatIsoDate(raw) : raw;
}

// Reads one column from a recording, showing "Not listed" when it is empty.
function recordingField(recording, label, fallback = 'Not listed') {
  return recording[label] || fallback;
}

// Formats the Date column for display. The sync script writes ISO dates
// straight from the Encora API (e.g. "2025-06-01"); this turns those into
// "June 1, 2025" using the same split-based approach as formatIsoDate, so a
// visitor west of UTC never sees the date shift back a day. Anything that
// isn't a plain ISO date (e.g. hand-typed text like "June, 2024") is shown
// exactly as entered, since recordingDateValue's sort already tolerates that.
function formatRecordingDate(recording) {
  const raw = recording.Date || '';
  if (!raw) return 'Not listed';
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? formatIsoDate(raw) : raw;
}

/**
 * Builds the grid of labelled details shown under a recording's title
 * (Tour, Date, Master, Cast, Notes, NFT date, Trader Format).
 *
 * includeTraderFormat — true on the collection pages, false on Wants
 *                       (you don't have a format for something you don't own).
 * includeMediaType    — true on Wants, where audio and video are mixed
 *                       together, false on the collection pages which are
 *                       already split by format.
 */
function recordingDetails(recording, includeTraderFormat = true, includeMediaType = false) {
  // Master Notes and Trading Notes are merged into a single "Notes" field,
  // each prefixed so it's clear which is which, separated by a pipe.
  const notes = [
    recording['Master Notes'] && `Master: ${recording['Master Notes']}`,
    recording['Trading Notes'] && `Trader: ${recording['Trading Notes']}`,
  ].filter(Boolean).join(' | ') || 'Not listed';

  // "NFT Forever", a formatted NFT date, or "Not listed".
  const nft = formatNftValue(recording);

  // These two blocks are included or left empty depending on the flags above.
  const mediaType = includeMediaType
    ? `<div class="recording-field"><span>Audio / Video</span><b>${recordingField(recording, 'Audio / Video')}</b></div>`
    : '';
  const traderFormat = includeTraderFormat
    ? `<div class="recording-field"><span>Trader Format</span><b>${recordingField(recording, 'Trader Format')}</b></div>`
    : '';

  // The finished HTML. "recording-field-cast" and "recording-field-wide" are
  // styled to span two columns, since cast lists and notes are long.
  return `<div class="recording-fields">${mediaType}<div class="recording-field"><span>Tour</span><b>${recordingField(recording, 'Tour')}</b></div><div class="recording-field"><span>Date</span><b>${formatRecordingDate(recording)}</b></div><div class="recording-field"><span>Master</span><b>${recordingField(recording, 'Master')}</b></div><div class="recording-field recording-field-cast"><span>Cast</span><b>${recordingField(recording, 'Cast')}</b></div><div class="recording-field recording-field-wide"><span>Notes</span><b>${notes}</b></div><div class="recording-field"><span>NFT date</span><b>${nft}</b></div>${traderFormat}</div>`;
}


/* ---------------------------------------------------------------------------
   4. LOADING THE DATA
   --------------------------------------------------------------------------- */

/**
 * Fetches both CSV files (relative to index.html, so it works both locally and
 * on GitHub Pages), parses them, sorts the collection A–Z, then draws the page.
 * Both files are requested at the same time via Promise.all rather than one
 * after the other, which is quicker.
 */
async function loadData() {
  const collectionUrl = new URL('collection.csv', document.baseURI);
  const wantsUrl = new URL('wants.csv', document.baseURI);

  const [recordingsResponse, wantsResponse] = await Promise.all([fetch(collectionUrl), fetch(wantsUrl)]);

  // A missing or misnamed file shows up here; the error is caught at the very
  // bottom of this file and turned into a message on the page.
  if (!recordingsResponse.ok) throw new Error(`collection.csv returned ${recordingsResponse.status}`);
  if (!wantsResponse.ok) throw new Error(`wants.csv returned ${wantsResponse.status}`);

  state.recordings = parseCSV(await recordingsResponse.text());
  state.wants = parseCSV(await wantsResponse.text());

  // Default order for the whole collection: alphabetical, ignoring articles.
  state.recordings.sort((a, b) => sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b))));

  renderAll();
}


/* ---------------------------------------------------------------------------
   5. RENDERING
   Each render function reads from `state` and rewrites one part of the page.
   --------------------------------------------------------------------------- */

// Redraws everything, refreshes the two counters on the home page, and sets
// "Last Updated" to the most recent Collected date — no manual editing needed.
// padStart(2, '0') is what turns 7 into the "07" styling.
function renderAll() {
  renderRecordings();
  renderVideoIndex();
  renderWants();
  renderCart();
  document.querySelector('#home-recording-count').textContent = String(state.recordings.length).padStart(2, '0');
  document.querySelector('#home-want-count').textContent = String(state.wants.length).padStart(2, '0');

  // Collected dates are all "YYYY-MM-DD", so plain string comparison sorts
  // them chronologically — no date parsing needed to find the latest one.
  const latestCollected = state.recordings.reduce((latest, recording) => (recording.Collected > latest ? recording.Collected : latest), '');
  document.querySelector('#last-updated').textContent = latestCollected ? `Last Updated: ${formatIsoDate(latestCollected)}` : 'Last Updated: —';
}

/**
 * Draws the Videos index page: one card per entry in VIDEO_INDEX_ROUTES,
 * each linking to that page and showing how many recordings are on it.
 * The count is worked out by running the page's own filter over the
 * collection, so it can never drift out of step with the page itself.
 */
function renderVideoIndex() {
  const list = document.querySelector('#video-index-list');
  if (!list) return;

  list.innerHTML = VIDEO_INDEX_ROUTES.map((key) => {
    const route = COLLECTION_ROUTES[key];
    if (!route) return '';
    const count = state.recordings.filter(route.filter).length;
    return `<a class="index-card" href="#${key}"><p class="eyebrow">${route.eyebrow}</p><h3>${route.title}</h3><p>${formatCount(count, 'recording')}</p></a>`;
  }).join('');
}

/**
 * Groups an already filtered/sorted list of recordings (or wants) by Show
 * title, preserving the order the items already come in — so a group lands
 * wherever its first recording would have sorted. Returns an array of
 * { title, items } groups, one per distinct Show.
 */
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

/**
 * Groups an already filtered list of recordings by the day they were
 * Collected (the "Collected" column is always "YYYY-MM-DD" or a full
 * timestamp, from the Encora sync — only the date part is used). Groups are
 * ordered newest day first, oldest day last, regardless of what order the
 * items were passed in. A recording with no Collected value lands in an
 * "Date unknown" group at the very end. Returns the same shape as
 * groupByShow(): an array of { title, items }.
 */
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

  // Newest collected day first. An empty key (unknown date) always sorts
  // last, since '' is "smaller" than any real "YYYY-MM-DD" string.
  groups.sort((a, b) => b.key.localeCompare(a.key));

  return groups;
}

/**
 * Decides how renderShowGroups() should group a page's results.
 *
 * An explicit `explicitGroupBy` (currently only New In's "collected") always
 * wins, since that's a deliberate choice about how that page works — it
 * shouldn't change based on what happens to be in the results today.
 *
 * Otherwise, grouping by Show only makes sense when there's more than one
 * Show on the page: a single-show page (Hadestown today, but this works for
 * any page that ends up that way, not just that one route) would just put
 * everything under one pointless fold you have to open before seeing
 * anything. So with exactly one distinct Show among the results, this
 * returns "none" instead of "show".
 */
function chooseGroupBy(items, explicitGroupBy) {
  if (explicitGroupBy) return explicitGroupBy;
  const distinctShows = new Set(items.map(recordingTitle));
  return distinctShows.size === 1 ? 'none' : 'show';
}

/**
 * Turns a list of recordings/wants into the grouped, collapsible HTML used by
 * both the collection pages and the Wants page: one <details> per Show, with
 * every recording of that show folded away inside until it's clicked open.
 * Every group starts closed, even a show with just one recording, so the
 * list is consistent and nothing unfolds until you click it. Once opened, a
 * group stays open across re-renders (see state.openGroups / trackOpenGroups).
 *
 * scope     — "recordings" or "wants", so the two lists' open/closed state
 *             (state.openGroups) never bleeds into each other.
 * addable   — true on the collection pages (each recording gets an Add
 *           checkbox); false on Wants (nothing to add to the cart).
 * includeTraderFormat / includeMediaType — passed straight through to
 *           recordingDetails(), same meaning as everywhere else it's used.
 * groupBy   — "show" (default) groups by Show, and folds are ordered
 *           oldest-to-newest by the recording's own Date. "collected" (used
 *           by New In) groups by the day each recording was Collected,
 *           newest day first, folds ordered A–Z by title since everything in
 *           a fold shares one day. "none" (used automatically whenever a
 *           page's results are all the same Show — see chooseGroupBy —
 *           since grouping by Show is pointless when there's only one)
 *           skips grouping/folding entirely: every recording is its own
 *           always-open row, in whatever order `items` already comes in.
 */
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
      // Reuses .recording-row/.recording-row-top (the same classes a show
      // group's summary line uses) rather than .recording-subrow, so a
      // standalone row keeps the normal bold title size instead of the
      // smaller, muted style meant for rows nested inside an opened show.
      return `<div class="recording-row"><div class="recording-row-top"><span class="recording-index">${String(index + 1).padStart(2, '0')}</span><strong class="recording-title${titleClass}">${subtitle}</strong>${addControl}</div>${recordingDetails(recording, includeTraderFormat, includeMediaType)}</div>`;
    }).join('');
  }

  const groupedByCollectedDate = groupBy === 'collected';
  const groups = groupedByCollectedDate ? groupByCollectedDate(items) : groupByShow(items);

  // Inside a fold, recordings are ordered oldest-to-newest by their Date
  // column for Show groups, or A–Z by title for Collected-date groups (their
  // Date column has nothing to do with the group they're in). Either way
  // this only decides order *within* a fold — groupByShow/groupByCollectedDate
  // above already decided what order the folds themselves appear in.
  groups.forEach((group) => {
    group.items.sort(groupedByCollectedDate
      ? (a, b) => sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b)))
      : (a, b) => recordingDateValue(a) - recordingDateValue(b));
  });

  return groups.map((group, groupIndex) => {
    const recordingsHtml = group.items.map((recording) => {
      const restricted = isNftRestricted(recording);
      const titleClass = restricted ? ' is-nft' : '';
      // Inside an opened show, each recording is told apart by Tour, Date and
      // Master rather than repeating the Show name, which is already the
      // heading — except in a Collected-date group, where the heading is a
      // date rather than a Show name, so the Show title is prepended here
      // instead so it's still clear what each row actually is.
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

    // Restores whatever open/closed state this group had before the list was
    // last rebuilt (e.g. by ticking an Add checkbox), so opening a show to
    // browse it doesn't get undone by an unrelated re-render.
    const openAttribute = state.openGroups.has(`${scope}:${group.title}`) ? ' open' : '';

    return `<details class="recording-row show-group"${openAttribute}><summary class="recording-row-top show-group-summary"><span class="recording-index">${String(groupIndex + 1).padStart(2, '0')}</span><strong class="recording-title">${group.title}</strong><span class="show-group-meta">${formatCount(group.items.length, 'recording')}</span></summary><div class="show-group-body">${recordingsHtml}</div></details>`;
  }).join('');
}

// Wires up every .show-group in `list` so opening or closing it is remembered
// in state.openGroups (under the given scope), and re-attaches on every
// re-render since the elements themselves are recreated each time.
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

/**
 * Draws the collection list for whichever page is currently open, applying the
 * search box and the sort dropdown. Called again on every keystroke in search.
 */
function renderRecordings() {
  const list = document.querySelector('#recording-list');

  // Work out which page we're on from the URL hash; fall back to Audios.
  const route = COLLECTION_ROUTES[location.hash.replace('#', '')] || COLLECTION_ROUTES.audios;
  const query = document.querySelector('#collection-search').value.toLowerCase().trim();
  const sort = document.querySelector('#collection-sort').value;

  // Update the page heading to match the route.
  document.querySelector('#collection-eyebrow').textContent = route.eyebrow;
  document.querySelector('#collection-title').textContent = route.title;

  // Keep recordings that belong on this page AND match the search. The search
  // looks at every column, so venue, cast, master and notes are all searchable.
  let recordings = state.recordings.filter((recording) =>
    route.filter(recording) && Object.values(recording).some((value) => value.toLowerCase().includes(query)));

  // Apply the chosen sort. In both date sorts, ties fall back to title order
  // (that's what the `||` after the date comparison does).
  recordings = [...recordings].sort((a, b) => sort === 'date-ascending'
    ? recordingDateValue(a) - recordingDateValue(b) || sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b)))
    : sort === 'date-descending'
      ? recordingDateValue(b) - recordingDateValue(a) || sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b)))
      : sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b))));

  document.querySelector('#collection-result-count').textContent = formatCount(recordings.length, 'recording');

  // Recordings are grouped by Show into collapsible <details> — same show,
  // different Tour/Date, folded together until clicked open — or, on a page
  // where every result is the same Show (see chooseGroupBy), a flat list
  // with nothing to click open. Or an empty state if nothing matched.
  // Checkboxes are pre-ticked if that recording is already in the cart, so
  // the ticks survive switching pages.
  list.innerHTML = recordings.length
    ? renderShowGroups(recordings, { scope: 'recordings', addable: true, includeTraderFormat: true, includeMediaType: false, groupBy: chooseGroupBy(recordings, route.groupBy) })
    : '<div class="empty-state"><h3>No recordings found.</h3><p>Try another title, place, or keyword.</p></div>';

  // The rows were only just created, so their click/toggle handlers are
  // attached now. Each checkbox remembers its recording in a
  // data-recording-id attribute; each show group's open/closed state is
  // remembered in state.openGroups so it survives the next re-render.
  list.querySelectorAll('.recording-check').forEach((checkbox) =>
    checkbox.addEventListener('change', () => toggleCart(checkbox.dataset.recordingId)));
  trackOpenGroups(list, 'recordings');
}

/**
 * Draws the wants list. Same shape as renderRecordings: filters by the search
 * box and the Audio/Video dropdown, always sorted A–Z by title.
 */
function renderWants() {
  const mediaFilter = document.querySelector('#wants-media-filter').value;
  const query = document.querySelector('#wants-search').value.toLowerCase().trim();

  const wants = state.wants
    .filter((want) => (mediaFilter === 'all' || want['Audio / Video'] === mediaFilter)
      && Object.values(want).some((value) => value.toLowerCase().includes(query)))
    .sort((a, b) => sortableTitle(recordingTitle(a)).localeCompare(sortableTitle(recordingTitle(b))));

  document.querySelector('#wants-result-count').textContent = formatCount(wants.length, 'want');

  // Grouped by Show, same as the collection pages (and, same as the
  // collection pages, left ungrouped if a search has narrowed the results
  // down to one Show — see chooseGroupBy). Note the flags passed through to
  // recordingDetails: no Trader Format, but do show whether each want is
  // audio or video. addable: false, since wants have nothing to add to the
  // cart.
  const wantsList = document.querySelector('#wants-list');
  wantsList.innerHTML = wants.length
    ? renderShowGroups(wants, { scope: 'wants', addable: false, includeTraderFormat: false, includeMediaType: true, groupBy: chooseGroupBy(wants) })
    : '<div class="empty-state"><h3>No wants found.</h3><p>Try another title, format, or keyword.</p></div>';
  trackOpenGroups(wantsList, 'wants');
}


/* ---------------------------------------------------------------------------
   6. THE CART
   --------------------------------------------------------------------------- */

// Adds a recording to the cart, or removes it if it is already there.
// Used by both the checkboxes and the Remove buttons. renderAll() afterwards
// keeps the checkboxes, the cart page and the header count in sync.
function toggleCart(id) {
  const recording = state.recordings.find((item) => item._id === id);
  const existingIndex = state.cart.findIndex((item) => item._id === id);
  if (existingIndex >= 0) state.cart.splice(existingIndex, 1);
  else state.cart.push(recording);
  renderAll();
}

// One line of the request that gets copied, in the format promised on the
// cart page: Show - Tour - Date - Master - Encora Link.
function requestLine(recording) {
  return `${recordingTitle(recording)} - ${recordingField(recording, 'Tour')} - ${formatRecordingDate(recording)} - ${recordingField(recording, 'Master')} ${recordingField(recording, 'Link')}`;
}

// Redraws the cart page and the little number badge in the header, and keeps
// the copyable text box up to date.
function renderCart() {
  document.querySelector('#cart-count').textContent = state.cart.length;

  const items = document.querySelector('#cart-items');
  const empty = document.querySelector('#cart-empty');

  // Show the "Your cart is quiet" block only when the cart is empty.
  empty.style.display = state.cart.length ? 'none' : 'block';

  items.innerHTML = state.cart.map((recording) =>
    `<div class="cart-item"><div><h3>${recordingTitle(recording)}</h3><p>${recordingField(recording, 'Tour')} / ${formatRecordingDate(recording)} / ${recordingField(recording, 'Master')}</p></div><button class="remove-item" data-remove-id="${recording._id}" type="button">Remove</button></div>`).join('');

  // The read-only textarea showing exactly what will be copied.
  document.querySelector('#request-preview').textContent = state.cart.map(requestLine).join('\n');

  // Hook up the Remove buttons that were just created.
  items.querySelectorAll('[data-remove-id]').forEach((button) =>
    button.addEventListener('click', () => toggleCart(button.dataset.removeId)));
}


/* ---------------------------------------------------------------------------
   7. ROUTING
   The site is a single HTML page; "navigating" means showing one <section> and
   hiding the rest, based on the part of the URL after the #.
   --------------------------------------------------------------------------- */

function showRoute() {
  const route = location.hash.replace('#', '') || 'home';

  // Ignore anything that isn't a real page (e.g. a hand-typed #whatever).
  const validRoute = ['home', 'videos', 'audios', 'hadestown', 'New-In', 'videos-#-b', 'videos-c-e', 'videos-f-i', 'videos-j-m', 'videos-n-r', 'videos-s-z', 'wants', 'cart'].includes(route) ? route : 'home';

  // Videos, Hadestown and Audios all share the one collection section.
  const isCollectionRoute = ['audios', 'hadestown', 'New-In', 'videos-#-b', 'videos-c-e', 'videos-f-i', 'videos-j-m', 'videos-n-r', 'videos-s-z'].includes(validRoute);

  // Show the matching section, hide the others.
  document.querySelectorAll('.view').forEach((view) =>
    view.classList.toggle('active', view.dataset.view === validRoute || (view.dataset.view === 'collection' && isCollectionRoute)));

  // The Videos index is in the Collection menu but has its own section, so it
  // keeps the menu highlighted without sharing the collection view.
  const isCollectionMenuRoute = isCollectionRoute || validRoute === 'videos';

  // Highlight the matching nav link (the Collection menu stays highlighted for
  // all of its sub-pages).
  document.querySelectorAll('[data-route]').forEach((link) =>
    link.classList.toggle('active', link.dataset.route === validRoute || (link.dataset.route === 'collection' && isCollectionMenuRoute)));

  // Moving between Videos / Hadestown / Audios reuses the same section, so its
  // contents have to be redrawn. The length check avoids running before the
  // CSVs have finished loading.
  if (isCollectionRoute && state.recordings.length) renderRecordings();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Copies the request to the clipboard. With an empty cart it sends the visitor
 * to the collection instead. The try/catch covers older browsers and pages not
 * served over https, where the modern clipboard API is unavailable — it then
 * falls back to selecting the textarea and using the old execCommand method.
 */
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


/* ---------------------------------------------------------------------------
   8. WIRING UP THE CONTROLS AND STARTING THE SITE
   These run once, when the page first loads.
   --------------------------------------------------------------------------- */

// Search box: redraw the list on every keystroke.
document.querySelector('#collection-search').addEventListener('input', renderRecordings);

// Sort dropdown on the collection pages.
document.querySelector('#collection-sort').addEventListener('change', renderRecordings);

// Wants search box and filters. (The wants sort dropdown currently only
// offers A–Z, so this listener redraws an identically-sorted list —
// harmless, and ready for more options later.)
document.querySelector('#wants-search').addEventListener('input', renderWants);
document.querySelector('#wants-media-filter').addEventListener('change', renderWants);
document.querySelector('#wants-sort').addEventListener('change', renderWants);

// The Copy request button on the cart page.
document.querySelector('#copy-request-button').addEventListener('click', copyRequest);

// Close the Collection dropdown menu after one of its links is clicked.
document.querySelectorAll('.collection-dropdown a').forEach((link) =>
  link.addEventListener('click', () => { link.closest('details').open = false; }));

// Browser back/forward buttons and nav links both change the hash.
window.addEventListener('hashchange', showRoute);

// Keyboard shortcut: pressing "/" jumps to the collection and focuses search.
// The check on activeElement stops it firing while typing in a field.
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    event.preventDefault();
    location.hash = 'audios';
    document.querySelector('#collection-search').focus();
  }
});

// Show the correct section straight away...
showRoute();

// ...then load the data. If either CSV can't be read (wrong filename, wrong
// folder, or opening index.html directly instead of through a local server),
// this prints a readable explanation in place of the collection.
loadData().catch((error) => {
  document.querySelector('#recording-list').innerHTML = `<div class="empty-state"><h3>Collection unavailable.</h3><p>${error.message}. Confirm collection.csv and wants.csv are in the same repository folder as index.html.</p></div>`;
  document.querySelector('#home-recording-count').textContent = '--';
  document.querySelector('#home-want-count').textContent = '--';
  document.querySelector('#last-updated').textContent = 'Last Updated: unavailable';
});
