# PersephonesChild Collection

A static, GitHub Pages-ready collection with CSV-powered collection and wants lists.

## Customize

- Edit `collection.csv` and `wants.csv` to change the content. Keep the existing column names.
- Change `OWNER_EMAIL` at the top of `app.js` to the email address that should receive requests.
- Replace the image URL in `.hero-image` in `styles.css` with your own image if desired.

## Run locally

Because browsers block local CSV requests when opening `index.html` directly, serve this folder with a local server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish

Create a GitHub repository, push these files to its default branch, then enable GitHub Pages from **Settings > Pages**, choosing the branch root as the source.

The checkout uses the visitor's default email app through `mailto:`. A real server-side automated email requires a form/email service or backend; the static site intentionally stores no visitor information.
