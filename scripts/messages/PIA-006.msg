chore(trace): record PIA-006 proxy-regex fix in MITIGATED.md (PIA-006)

Provenance / paper-trail commit. The actual code fix already shipped
inside 283872d alongside the PIA-005 quota work — this commit ONLY
adds the MITIGATED.md entry so the closure is grep-able and the next
A4 retro can cite it.

Background — what shipped silently in 283872d
---------------------------------------------
The proxy URL allowlist regex `^https://[a-z0-9\-]+\.workers\.dev$`
accepted only a single label before `.workers.dev`. Real Cloudflare
Workers URLs are `<worker>.<account>.workers.dev` — two labels.
The project's own default `https://pialax-proxy.ashwinyedavalli.workers.dev`
was rejected by the very regex meant to gate it.

User-visible impact pre-fix:
- Typing the default URL → input border flashed red, badge briefly
  read "Invalid URL", PROXY_URL never set → stuck in Sample mode.
- Every page load `restoreProxyURL()` ran the same regex against the
  saved value; any multi-label URL failed and was silently removed
  via `localStorage.removeItem(PROXY_URL_STORAGE_KEY)`. Re-enter,
  re-fail, invisible loop.

Fix that shipped in 283872d (no code changes in THIS commit):
- Regex relaxed to `^https://[a-z0-9\-]+(\.[a-z0-9\-]+)*\.workers\.dev$`
  on the live-input apply path (`pialax.html:3266`) AND the saved-URL
  restore path (`:3243-3249`). Mirrored verbatim in
  `pialax-mobile.html:3540-3561`.
- Match table (verified offline):
    https://pialax-proxy.ashwinyedavalli.workers.dev → MATCH (default)
    https://myproxy.workers.dev                       → MATCH (1-label)
    https://a.b.c.workers.dev                         → MATCH (n-label)
    https://workers.dev                               → REJECT (no sub)
    http://foo.workers.dev                            → REJECT (no TLS)
    https://foo.workers.dev/path                      → REJECT (path)
    https://evil.com/path.workers.dev                 → REJECT (host)
- Security posture unchanged: still https-only, still pinned to
  *.workers.dev, still rejects paths/query/ports, CSP connect-src
  remains the underlying gate.

Why this commit exists despite the code already being on main
--------------------------------------------------------------
HQ §6 requires single-purpose tickets — one commit per envelope.
The PIA-005 commit bundled PIA-006's regex changes silently because
the `.files` manifest staged whole HTML files rather than validating
the diff against the ticket spec. Two follow-ups:
  1. MITIGATED.md needs the PIA-006 entry so the closure is real
     paper trail, not implicit. → this commit.
  2. Next C1 / D2 prompt should require `git diff --stat HEAD`
     against the ticket spec before declaring the diff ready.
     → A4 retro action item (carry into next LESSONS_LEARNED).

Why not amend 283872d retroactively
-----------------------------------
Amend would require force-push of a SHA already on origin/main and
already cited by the MITIGATED.md PIA-005 entry. Trace-forward via
this commit is cheaper, honest, and leaves the historical record
intact.

Rollback
--------
Revert this single commit. MITIGATED.md drops back to the
PIA-005-only state. Zero code impact (no code was changed by this
commit).

Closes PIA-006.
