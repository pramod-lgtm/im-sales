# IM Sales: installable phone app (PWA wrapper)

This is a small static website that shows the Apps Script sales app full-screen and can be installed on phones ("Install app" on Android, "Add to Home Screen" on iPhone). It's free to host on any static HTTPS host. You never need to edit anything except `config.js`, and only if the Apps Script link changes.

| File | Purpose |
|---|---|
| `index.html`, `app.js` | full-screen iframe, splash screen, Install button / iOS hint, login memory bridge |
| `config.js` | Apps Script `/exec` link, credentialless switch |
| `manifest.webmanifest`, `icons/` | app name *Intimissionline Sales* / *IM Sales*, maroon `#7a1f4b`, 192/512 + maskable icons |
| `sw.js` | minimal service worker (caches only the wrapper, never the sales data) |
| `vercel.json`, `.nojekyll` | host settings for Vercel / GitHub Pages |
| `test/sim-and-shots.js` | local checks (dev only, not needed on the host) |

## Before it works
1. In Apps Script, apply `/workspace/sales-tracker-gas/paste/UPDATE-PWA.md` (new `doGet` with `XFrameOptionsMode.ALLOWALL`) and redeploy with **Manage deployments → ✏️ → New version**. Until then Google refuses to be shown inside the wrapper (it sends `X-Frame-Options: SAMEORIGIN`).
2. Host this folder (below) and put its origin (e.g. `https://pramodkarwa.github.io`) in the data Sheet → Settings tab → `app_origins`. Without this, logins aren't remembered between launches.

## Free hosting (pick one)
- **GitHub Pages**: github.com → New repository `im-sales` (Public) → *Add file → Upload files* → drag in everything from `sales-tracker-pwa-site.zip` (unzipped) → Commit. Then *Settings → Pages → Deploy from a branch → main / (root) → Save*. After about a minute the app is at `https://<username>.github.io/im-sales/`, and the origin for `app_origins` is `https://<username>.github.io`. (CLI: `gh repo create im-sales --public --source . --push`, then enable Pages.)
- **Vercel**: vercel.com → Add New → Project → import the GitHub repo above (Framework: *Other*, no build command) → Deploy. The app is at `https://im-sales.vercel.app` (or similar). CLI: `npx vercel deploy --prod` from this folder after `npx vercel login`.
- **Easiest without any git**: Netlify Drop (app.netlify.com/drop) or Cloudflare Pages *Direct upload*. Drag the unzipped folder in and you get a free HTTPS address.

## Install on phones
Open the hosted address in **Chrome** (Android) and tap **Install app** in the banner, or **⋮ → Install app**. On an iPhone, open it in **Safari** → Share → **Add to Home Screen**. Allow Location when asked.

## Why the wrapper fixes "Sorry, unable to open the file" (multiple Google accounts)
That error comes from Chrome sending the phone's Google-account cookies, which makes Google rewrite the link to `/macros/u/N/…`. The wrapper:
1. always uses the plain `/macros/s/…/exec` link (it strips any `/u/N/`), and
2. loads it in a **credentialless** iframe (Chrome/Edge 110+, including Android), so no Google cookies are sent at all. The app opens exactly like it does for an anonymous visitor, which works for "Anyone" deployments.

Because credentialless frames lose their storage on every launch, the app hands its login token to the wrapper (via `postMessage`), which keeps it. The app only does this for origins listed in `app_origins`, and the wrapper only accepts messages from `*-script.googleusercontent.com` frames inside itself. Safari and Firefox ignore `credentialless` and behave like a normal iframe; the multi-account problem is a Chrome/Google issue anyway.

## GPS and camera inside the iframes
Apps Script already nests the app: `script.google.com` page → `sandboxFrame` (`*.googleusercontent.com`) → the app. The live page's sandboxFrame has `allow="… clipboard-write *; geolocation *; web-share * …"` (no `camera`). The wrapper's iframe adds `allow="geolocation *; camera *; clipboard-write *; web-share *"`, so geolocation is delegated through both levels.
- **GPS**: works (verified in a 3-level local simulation using Google's exact allow/sandbox attributes; and without the wrapper's `allow`, GPS is blocked and the app's "Location note" fallback appears). The permission prompt names the wrapper's site.
- **Photo**: `<input type=file capture>` opens the phone camera or gallery and doesn't need the camera permission, so it works. Live `getUserMedia` camera would NOT work (Google's frame doesn't delegate `camera`), but the app doesn't use it.
- **Copy for WhatsApp**: `clipboard-write` is delegated. The "Send on WhatsApp" link works regardless.

## 2026-10-22: Accompanied by (joint market visit)
The Sales call card now has an optional "Saath mein company se kaun? / Accompanied by" field (company people + Other, multiple, None by default), saved in a new `accompanied_by` column on the Calls tab. It shows in My calls, call detail, admin day detail, and the admin Call log (column "With" + filter "Joint visits only / Alone only"), and in the CSV export. The change lives in the Apps Script (paste Code.gs + Index.html); this repo only gets a service worker cache bump.
