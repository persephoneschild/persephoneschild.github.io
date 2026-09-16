# PersephonesChild Collection

A static, GitHub Pages-ready collection with CSV-powered collection and wants lists.

## Run locally

Because browsers block local CSV requests when opening `index.html` directly, serve this folder with a local server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Files in this repo

| File | What it's for |
| --- | --- |
| `index.html` | The whole site — every page is a `<section>` in here, shown or hidden by `app.js`. |
| `app.js` | Loads the CSVs, renders the pages, and handles search, sort, cart, and routing. |
| `styles.css` | Base styling. `index.html` has its own `<style>` block that overrides parts of it — see the comments in both files for what beats what. |
| `collection.csv` | Every recording you own. |
| `wants.csv` | Everything you're looking for. |

## Customize

- **Recordings and wants** — edit `collection.csv` / `wants.csv` directly. Keep the column names exactly as they are (see below); the code matches columns by name, not position, so a renamed or misspelled header makes that column show up empty.
- **Contact details** — there's no config variable for this anymore. Search `index.html` for `misiatrade@gmail.com` (it appears twice: once in the Contact block on the home page, once in the footer) and replace both with your own address, plus the Discord handle above it if relevant.
- **Trading rules text** — also on the home page in `index.html`, inside the `intro-band` div. It's plain `<li>` bullets, safe to rewrite freely.
- **Colors** — `styles.css` defines the base palette as CSS variables at the top (`--ink`, `--muted`, `--paper`, `--line`, `--accent`, `--rust`, `--white`). `index.html`'s `<style>` block redefines the same variables with the dark blue values actually in use — change them there, not in `styles.css`, or your edit will be silently overridden.
- **Adding a collection page** — see [Adding a page](#adding-a-page) below.

## CSV columns

The code reads columns by name, so both files need to keep these headers. `collection.csv` has a few extra columns (`Trader Format`, `Collected`, etc.) that `wants.csv` doesn't, since you don't need trade or collection details for something you don't have yet.

Used by both:
`Audio / Video`, `Show`, `Tour`, `Date`, `Matinée / Evening`, `Master`, `Cast`, `Master Notes`, `Trading Notes`, `NFT Date`, `NFT Forever`, `Not For Sale`, `Type`, `Release Format`, `Amount Recorded`, `Venue`, `City`, `Link`

`collection.csv` only:
`Gifting Status`, `Limited Trade Status`, `Trader Format`, `My Notes`, `Collected`

A few of these drive site behavior directly, so changing their *values* (not the column names) has visible effects:
- `Audio / Video` must be exactly `Audio` or `Video` — it's what puts a recording on the Audios or Videos page.
- `Show` is the title used for sorting, searching, and the Hadestown page filter (`recordingTitle()` in `app.js` reads this column).
- `Date` is parsed for the date-sort options; formats like `June, 2024` or `September 13, 2026` work, anything unparseable just sorts to the end.

## Publish

Create a GitHub repository, push these files to its default branch, then enable GitHub Pages from **Settings > Pages**, choosing the branch root as the source.

The checkout uses the visitor's default email app through `mailto:`. A real server-side automated email requires a form/email service or backend; the static site intentionally stores no visitor information.

## Adding a page

Here's the full pattern. There are four places to edit, and it's the same four every time.

Each collection page is one entry in `COLLECTION_ROUTES` at the top of `app.js`. A route is just three things: a key (the bit after the `#` in the URL), some heading text, and a `filter` — a test that runs against every row of `collection.csv`. Rows that pass appear on that page. Everything else (search, sorting, the checkboxes, the cart) works automatically.

### Step 1 — a helper for the first letter

Splitting by letter needs one small helper. Put it next to `sortableTitle` in `app.js`, since it builds on it:

```js
// The first character of a title as it's used for sorting, so "The Wiz" counts
// as W and "[Workshop] Hadestown" counts as W too.
function firstLetter(recording) {
  return sortableTitle(recordingTitle(recording)).charAt(0).toLowerCase();
}
```

Using `sortableTitle` rather than the raw title matters: it means the letter a recording files under is the same letter it sorts under, so nothing lands on the page you wouldn't expect.

### Step 2 — the routes

Replace the existing `videos` entry with these two:

```js
'videos-a-h': {
  title: 'Videos A–H',
  eyebrow: '01 / Videos A–H',
  filter: (recording) =>
    recording['Audio / Video'] === 'Video' &&
    recordingTitle(recording).toLowerCase() !== 'hadestown' &&
    firstLetter(recording) < 'i',
},
'videos-i-z': {
  title: 'Videos I–Z',
  eyebrow: '02 / Videos I–Z',
  filter: (recording) =>
    recording['Audio / Video'] === 'Video' &&
    recordingTitle(recording).toLowerCase() !== 'hadestown' &&
    firstLetter(recording) >= 'i',
},
```

Note the split is `< 'i'` and `>= 'i'` rather than "a to h" and "i to z". That way every video lands on exactly one page with no gap — a title starting with a number or a symbol goes to the first page instead of vanishing. If you'd rather numbers sat on the I–Z page, swap the two comparisons.

The keys have hyphens, so they need quote marks; keys without hyphens (like `audios`) don't.

### Step 3 — register the route names

In `showRoute()`, near the bottom of `app.js`, there are two lists. Both need the new names. The first decides which hashes are real pages:

```js
const validRoute = ['home', 'videos-a-h', 'videos-i-z', 'hadestown', 'audios', 'wants', 'cart'].includes(route) ? route : 'home';
```

The second decides which pages share the collection section and keep the Collection menu highlighted:

```js
const isCollectionRoute = ['audios', 'hadestown', 'videos-a-h', 'videos-i-z'].includes(validRoute);
```

Forgetting the first list sends you to the home page; forgetting the second shows a blank page. If a new page misbehaves, this is almost always why.

### Step 4 — the menu link

In `index.html`, inside the `collection-dropdown` div:

```html
<a href="#videos-a-h" data-route="videos-a-h">Videos A–H</a>
<a href="#videos-i-z" data-route="videos-i-z">Videos I–Z</a>
```

The `href` and the `data-route` must match the route key exactly — the first navigates, the second is what `app.js` compares against to add the highlight.

### One loose end

`#videos` no longer exists, so search `index.html` for `href="#videos"` and point it at one of the new pages. Same applies any time you retire a route.

### The recipe for next time

1. Add the route to `COLLECTION_ROUTES`.
2. Add its key to both lists in `showRoute()`.
3. Add the dropdown link in `index.html`.

Write the filter to return true for exactly the rows you want, and check it doesn't overlap another page, or recordings will show up twice. Any column in `collection.csv` is fair game: `recording.Tour === 'West End'`, `recording.City.includes('London')`, `recording.Master === 'StarCuffedJeans'`.

## Troubleshooting

**"Collection unavailable" instead of the recording list** — `app.js` couldn't fetch `collection.csv` or `wants.csv`. Almost always one of:
- You opened `index.html` directly from disk (`file://...`) instead of through a local server — see [Run locally](#run-locally) above.
- The CSV files aren't sitting next to `index.html` in the same folder.
- A CSV filename or column header was changed and no longer matches what `app.js` expects.

The error message on the page includes the failed request's status code, which usually points at which of the two files is the problem.
