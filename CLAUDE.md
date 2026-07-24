# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What PIALAX is

A family flight dashboard: a **trip watchlist / group-trip coordination layer** that sits above Google Flights (live search/booking — hand off via deep links) and Flighty (day-of tracking — stay out of that lane). It owns the pre-booking "considering trips" phase: group meetup economics (total family cost to gather at a hub), cheapest-week finder, RSVP/coordination, trip binder, shareable plan. Every new feature must answer "what can't Google Flights or Flighty do here?" — see `PIALAX_HQ.md` §10 and `SPRINT_PROPOSAL_2026-07-21.md`.

## Architecture

No build system, no framework, no package.json, no tests. Three deployable files served by GitHub Pages (`https://shwinster101.github.io/PIALAX/`):

- `index.html` — device-detect redirect shim (desktop vs mobile), preserves query string + hash.
- `pialax.html` (~5,000 lines) — desktop dashboard. Single-file vanilla HTML/CSS/JS, IIFE + strict mode. d3 v7 + topojson from cdnjs with **SRI integrity hashes** (primary tamper guard) and a strict CSP meta tag.
- `pialax-mobile.html` (~5,100 lines) — mobile dashboard. **Largely duplicated logic** from `pialax.html`; every behavior change must be mirrored in both files (mobile parity is a standing requirement). A shared `pialax-core.js` extraction is a deferred backlog item (PIA-008), not reality.
- `worker.js` + `wrangler.toml` — Cloudflare Worker proxy for SerpAPI (Google Flights engine only). Injects the `SERPAPI_KEY` secret, adds CORS for the Pages origin, and edge-caches responses 24h keyed without the api_key. Deploy with `wrangler deploy`.

Inside the HTML files, state lives in a single `S` object plus localStorage (flight-price cache, quota counter `pialax_serpapi_quota`, proxy URL override, watchlist). URL query/hash carry shareable state (`syncURL`/`restoreFromURL`). Key domain logic to preserve on any edit:

- **FAMILY array is date-aware**: sister's airport is JAX before 2026-09-01, JFK after (`familyForDate`, per-member effective dates). Family composition is 4 people total — PIA=2 (Mom & Dad), LAX=1 (Ashwin), JAX/JFK=1 (Sister) — not 1 per airport.
- **Quota-safe fetching**: SerpAPI calls are strictly button-gated (never auto-fetch), capped per refresh/session, locked near quota exhaustion; mock/"Sample" data is the fallback and is labeled as estimates. `PROXY_URL` empty → mock-only mode.
- Meetup math: `computeRanking`, `computeBestMeetupWeekends`, ORD drive-to pivot for Peoria.

## Commands

There is no build or test runner. Verification is `bash scripts/preflight.sh` (exit 0 = GO): file presence, no `console.log` in shipping HTML, secret scan, `<script>` tag balance, SRI hash freshness (`scripts/verify-sri.sh`), `bash -n` on all scripts, optional shellcheck (`STRICT=1` to make it blocking).

Shipping is envelope-based (see `PIALAX_HQ.md` §2.4): write `scripts/messages/<PIA-id>.msg` (conventional-commit message) and `<PIA-id>.files` (path manifest, must include both envelope files), then `bash scripts/ship.sh <PIA-id>` runs preflight, stages exactly the manifest, commits, and pushes.

## Process conventions (from PIALAX_HQ.md — the operating playbook)

- Work is ticketed as `PIA-NNN` with intent-level (not implementation-level) acceptance criteria; one ticket = one commit. Backlog lives in `backlog.md`; closed items in `MITIGATED.md` (auditors must not re-flag them).
- Code edits belong in `pialax.html` + `pialax-mobile.html` (+ `worker.js`/`index.html` when in scope); the `.md`/`.txt` files are ops docs. `PIALAX_HQ.md` is the multi-team playbook (Requirements / Coder / Test / Deploy / Auditor roles and their prompts) — read it before nontrivial work.
- SRI hashes: if cdnjs republishes a pinned file, loads break by design — re-copy the hash from cdnjs and update **both** HTML files.
