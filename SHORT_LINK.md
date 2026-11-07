# Short link: pialax.pages.dev (PIA-163)

> **Status: live since 2026-11-07.** Pages project `pialax`, Git-connected to
> `shwinster101/PIALAX` (production branch `main`, no build command, output
> `short`), created through the Cloudflare API; the first deploy built
> `8c9415d`. Every merge to `main` redeploys it. Since PIA-164 the app's shared
> links (guest, list, invitation) start with it. Least privilege: in GitHub,
> Settings → Applications → Cloudflare Workers and Pages → Configure →
> Repository access, keep only `PIALAX` (plus any repo another Cloudflare
> project builds from).

**What it is:** a tiny free Cloudflare site that instantly forwards to the real
app, `https://shwinster101.github.io/PIALAX/app.html`. It keeps everything
after the address: trip, list and organizer links, and `#` hints.

**Why it only forwards:**
- Every phone keeps its trips, organizer keys, token and "who am I" saved under
  `shwinster101.github.io`.
- The Worker only accepts that address.
- Forwarding keeps all of that.
- After the hop, Safari's address bar still shows `shwinster101.github.io`.
  That's expected.

**What gets published:** only the `short/` folder (3 files: `index.html`,
`_headers`, `_redirects`). Never the app itself.

## Before you start

- [ ] The PIA-163 pull request is **merged into `main`**. Cloudflare builds
      from `main`, and `short/` must exist there.
- [ ] You can log in to **dash.cloudflare.com** with the account that owns the
      Worker (`pialax-proxy.ashwinyedavalli.workers.dev`).
- Cost: **$0** on the free plan.

## Option A: click through it yourself (about 5 minutes, recommended)

This connects Cloudflare to the GitHub repo, so every later merge to `main`
updates the short site by itself.

1. Open **dash.cloudflare.com** and log in.
2. In the left menu open **Workers & Pages**.
3. Click **Create application** (or **Create**).
4. Choose the **Pages** option. If you only see Workers, look for the link
   "Looking to deploy Pages? Get started".
5. Choose **Connect to Git** (also called **Import an existing Git repository**).
6. Pick **GitHub**, sign in if asked, and allow access to **only**
   `shwinster101/PIALAX`. Click **Install & Authorize**, then **Begin setup**.
7. Fill in the form exactly like this:

   | Field | Type this |
   |---|---|
   | Project name | `pialax` |
   | Production branch | `main` |
   | Framework preset | **None** |
   | Build command | *(leave empty)* |
   | Build output directory | `short` |
   | Root directory | *(leave empty)* |
   | Environment variables | *(none)* |

8. Click **Save and Deploy** and wait for **Success** (about a minute).
9. Write down the address Cloudflare shows. It should be **pialax.pages.dev**.
   If that name was taken, Cloudflare adds letters, like `pialax-3xy.pages.dev`.
   Use whatever it gives.
10. Optional tidy-up: **Settings → Builds & deployments → Preview branches →
    None**, so other branches don't get preview sites.

## Option B: have an agent do it (token + two commands)

This uploads the folder directly. Later changes need the deploy command run
again.

1. **A human makes a token** (agents can't do this part):
   - dash.cloudflare.com → profile icon → **My Profile → API Tokens →
     Create Token → Create Custom Token**.
   - Permissions: **Account · Cloudflare Pages · Edit**. Nothing else.
   - Account Resources: **Include → your account**.
   - **Continue → Create Token**, then copy it. It's shown only once.
   - Also copy the **Account ID**. It's on the right side of the Workers &
     Pages overview, and it's the long code in the dashboard address.
2. **Give the token to the agent safely.** Never paste it in a chat or commit
   it.
   - Claude Code on the web: tell it "request a credential for
     api.cloudflare.com". A secure form opens, and the agent never sees the
     token.
   - A terminal: set it as an environment variable, as below.
3. **The agent runs**, from a checkout of `main` after PIA-163 is merged:

   ```bash
   export CLOUDFLARE_API_TOKEN=...     # the token from step 1 (or a dummy if a proxy injects it)
   export CLOUDFLARE_ACCOUNT_ID=...    # the Account ID from step 1
   npx wrangler pages project create pialax --production-branch main
   npx wrangler pages deploy short --project-name pialax --branch main
   ```

   The last command prints the address, e.g. `https://pialax.pages.dev`.

## Check that it worked

- **On a phone:** open the short address. It should flip to the app with your
  trips, and **ⓘ → ⚙** should show `#163` or later.
- **For an agent, from a terminal in the repo** (use the real address if it
  differs):

  ```bash
  curl -sS https://pialax.pages.dev/ | diff - short/index.html && echo SAME   # identical page
  curl -sI https://pialax.pages.dev/ | grep -iE 'content-security|referrer-policy|x-robots'
  curl -sI https://pialax.pages.dev/i/AAAAAAAAAAAAAAAAAAAAAA | grep -i '^location'   # → the Worker's /i/ link
  ```

- Then tell Claude: **"the short link is live at <address>"**. The next step
  (PIA-164) makes the app's copied links start with that address.

## If something goes wrong

- **Build failed: "output directory not found":** PIA-163 isn't on `main` yet.
  Merge it, then use **Retry deployment**.
- **The page loads but doesn't forward:** JavaScript is off. The page shows an
  **Open** link to the app.
- **To undo it:** Workers & Pages → `pialax` → **Settings → Delete project**.
  Nothing in the app depends on it yet.
