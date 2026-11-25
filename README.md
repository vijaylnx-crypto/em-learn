# EM Learn

An installable, offline-first app for learning engineering management. It's built on
[awesome-engineering-management](https://github.com/engineering-management/awesome-engineering-management),
which is CC0 (public domain).

- **57 topics, 357 resources**, organised the same way as the source list (Models, People Management, Processes, Tools, Learning)
- **Tick resources as read.** Opening a link marks it read automatically.
- **Notes per topic.** Notes are saved as you type.
- **Spaced review.** Rate a topic Again, Hard, Good or Easy, and it comes back in the Review tab when it's due.
- **Topic of the day**, a streak counter and an activity heatmap
- **Search** across all topics and resources
- **Works offline** once it has been opened. Progress is stored on the device; use Export/Import backup to move it.

No framework, no build step, no dependencies: just static files.

## Run locally

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. Service workers need `http://localhost` or HTTPS; opening the file directly won't work.

## Refresh the content

```bash
node scripts/build-content.mjs
```

This fetches the latest README and rewrites `data/content.json`. Progress survives updates, because each link's ID is a hash of its URL.
To regenerate the icons, run `node scripts/make-icons.mjs`.

## Deploy (GitHub Pages)

1. Push this folder to a new GitHub repository on the `main` branch.
2. In the repository, go to **Settings → Pages → Source: GitHub Actions**.
3. `.github/workflows/deploy.yml` publishes on every push and re-syncs the content every Monday.

On Android, open the site in Chrome and tap **Install app**. On iPhone, use Safari → Share → **Add to Home Screen**.

## Next: wrap as a TWA (Android app)

```bash
npm i -g @bubblewrap/cli
```

```bash
bubblewrap init --manifest https://<you>.github.io/<repo>/manifest.json
```

```bash
bubblewrap build
```

Then publish the SHA-256 fingerprint that Bubblewrap prints at `https://<you>.github.io/.well-known/assetlinks.json`.
That file must be at the **domain root**, so either use a custom domain or a `<you>.github.io` user-site repository.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The app: hash routing, views, and state kept in localStorage |
| `sw.js` | Service worker: app files are network-first with an offline fallback; content is served from cache and refreshed in the background |
| `manifest.webmanifest`, `icons/` | Install metadata and icons, including a maskable icon |
| `scripts/build-content.mjs` | Turns the README into `data/content.json` |
| `data/content.json` | Generated content |
