# PersephonesChild Collection

A static, GitHub Pages-ready collection with CSV-powered collection and wants lists.

## Run locally

Because browsers block local CSV requests when opening `index.html` directly, serve this folder with a local server, for example:

```bash
py -m http.server 8000
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
- `Show` is the title used for sorting, searching, grouping, and the Hadestown page filter (`recordingTitle()` in `app.js` reads this column). Recordings and wants with the same `Show` are grouped together under one collapsible row, closed by default — click the show name to unfold it.
- `Date` is parsed for the date-sort options; formats like `June, 2024` or `September 13, 2026` work, anything unparseable just sorts to the end.

## NFT-restricted recordings

`isNftRestricted()` in `app.js` treats a recording as restricted when `NFT Forever` has a value, or when `NFT Date` is a date that hasn't passed yet. Restricted recordings show their title in red (`--nft`) and get **no Add checkbox**, so they can't be put in the cart. Once an `NFT Date` is in the past the restriction lifts on its own — no editing needed.

## Adding a page

Each collection page is one entry in `COLLECTION_ROUTES` at the top of `app.js`. A route is just three things: a key, some heading text, and a `filter` — a test that runs against every row of `collection.csv`. Rows that pass appear on that page. Everything else (search, sorting, the checkboxes, the cart) works automatically.

1. Add the route to `COLLECTION_ROUTES`.
2. Add its key to both lists in `showRoute()`.
3. Add its key to `VIDEO_INDEX_ROUTES` (video pages only).
4. Add the dropdown link in `index.html`.

Write the filter to return true for exactly the rows you want, and check it doesn't overlap another page, or recordings will show up twice. Any column in `collection.csv` is fair game: `recording.Tour === 'West End'`, `recording.City.includes('London')`, `recording.Master === 'StarCuffedJeans'`.

## Troubleshooting

**"Collection unavailable" instead of the recording list** — `app.js` couldn't fetch `collection.csv` or `wants.csv`. Almost always one of:
- You opened `index.html` directly from disk (`file://...`) instead of through a local server — see [Run locally](#run-locally) above.
- The CSV files aren't sitting next to `index.html` in the same folder.
- A CSV filename or column header was changed and no longer matches what `app.js` expects.

The error message on the page includes the failed request's status code, which usually points at which of the two files is the problem.
