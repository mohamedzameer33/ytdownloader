# Flash Downloader Free

A responsive YouTube downloader built with HTML, CSS, JavaScript, Bootstrap 5, Bootstrap Icons, and a dependency-free local Node.js server.

## Run locally

1. Install Node.js if it is not already installed.
2. Copy `.env.example` to `.env`.
3. Put your regenerated RapidAPI key in `.env` as `RAPIDAPI_KEY=...`.
4. From this folder, run `npm run dev`.
5. Open `http://localhost:4173`.

The local server calls the RapidAPI `Get Video Details` endpoint once per analyzed link. It returns safe metadata plus short-lived local download tokens; the browser never receives the RapidAPI key.

Only download videos and audio you own or have permission to save.

## Deploy on Vercel

1. Push the project to GitHub without `.env`.
2. Import the repository at `https://vercel.com/new` with Framework Preset **Other**.
3. Leave Build Command and Output Directory blank.
4. Add `RAPIDAPI_KEY` under Project Settings → Environment Variables for Production and Preview.
5. Deploy or redeploy after adding the variable.

The files under `api/` are stateless Vercel Functions. Download tokens are signed using a key derived from `RAPIDAPI_KEY`; no database or second secret is required.

## Security

Never put `X-RapidAPI-Key` in `app.js`, `index.html`, or any browser-delivered file. Regenerate the key that appeared in the shared screenshot before connecting the live API.
