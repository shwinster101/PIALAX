# PIALAX — Daily Review & End-to-End Audit

_Date: 2026-07-21 (Tue) · Owner: Ashwin · Scope: `pialax.html` + `pialax-mobile.html` · Reviewer pass: full dashboard walk noting today's date_

---

## 0. TL;DR

- **London trip → committed SUCCESSFUL.** It's now history (returned ~Jul 3; today is Jul 21). Booking locks converted to a green ✅ "trip complete / flew" state; members released from `booked` so the next trip is shoppable; a standing "✅ Last trip: London · complete" marker now shows under the meetup strip.
- **Next focus wired: JAX weekend, Fri Aug 7 – Sun Aug 9, 2026.** New `🏖 JAX Aug 7–9` chip sets hub = JAX (sister hosts before her Sep 1 NYC move). **Ashwin's LAX→JAX leg is the ★ FOCUS** (the active plan); **Mom & Dad's PIA→JAX is kept "in the loop but not really planning on going"** — rendered muted with a 🤔 tentative tag.
- **Date correction flagged & resolved:** you said "Aug 6–8 … Friday through Sunday," but in 2026 **Aug 6 = Thu, 7 = Fri, 8 = Sat**. The true Fri–Sun weekend is **Aug 7–9**. You confirmed Fri–Sun, so the trip is wired to **Aug 7–9**.

---

## 1. Date-driven staleness sweep (as of 2026-07-21)

Walking every date-bearing element in the dashboard against today:

| Item | Old date | Status today | Action taken |
|---|---|---|---|
| London trip (PIA→LHR, LOCKED_TRIPS + FAMILY_INFO) | Jun 24 – Jul 3 | **Past — completed** | Marked `tripCompleted`, locks → ✅ complete, released `booked` |
| `london` holiday chip | "London Jun 25–Jul 3" | Past | Relabeled `✅ London ✓ (done)` (still tappable to review) |
| `jaxjun5` holiday chip | "JAX Jun 5–8" | Past | **Replaced** with `jaxaug` → `🏖 JAX Aug 7–9` |
| JAX solo preset `jax-jun5` | Jun 5–8 (validUntil 6/8) | Greyed/stale | **Replaced** with `jax-aug7` (Aug 7–9) |
| MIA solo presets (`mia-jun18`, `mia-via-jax`) | Jun 12 / Jun 18–21 | Past/stale | **Left as-is** — MIA not in scope this cycle; flagged below |
| Sister JAX→JFK move | 2026-09-01 | **41 days out** — still upcoming | No change needed; Aug 7–9 correctly prices sister at **JAX** (pre-move) |

**Key correctness win:** because Aug 7–9 is *before* the Sep 1 transition, `familyForDate()` keeps the sister on **JAX** — so a JAX meetup is coherent (she still lives there and hosts). This trip is precisely the "see her before she moves" window.

---

## 2. What changed (both desktop + mobile, at parity)

### 2a. London = successful history
- `FAMILY_INFO`: `booked/bookedOutbound → false`; added `tripCompleted:true` + `completedTrip` label. Jun/Jul dates retained as a **historical record**.
- `LOCKED_TRIPS` (PIA→LHR, ORD→LHR): added `completed:true` + `completedNote`. `getMock()` lock path now propagates `completed`/`completedNote` into the price object.
- Locked route card: when `completed`, swaps `🔒 LOCKED`/`🔒 Locked` for green **`✅ FLEW` / `✅ Flew Jun 25 · returned Jul 3 · trip complete`**; copy-text says "(flew · complete)".
- New `completedTripMarker()` renders a standing **"✅ Last trip: London · Jun 25–Jul 3, 2026 · complete"** band under the meetup strip (only once today is past the return date).

### 2b. JAX Aug 7–9 focus
- `HOLIDAYS.jaxaug = Aug 7 2026`; chip `🏖 JAX Aug 7–9`.
- `applyHoliday('jaxaug')`: dep Aug 7 / ret Aug 9, RT, meetup mode, US map, `meetupHubOverride='JAX'`.
- **Focus/tentative model (new):** `S.focusMember` + `S.tentativeMembers`. For this trip `focusMember='LAX'`, `tentativeMembers=['PIA']`. Reset on every preset switch.
  - Focus card (LAX→JAX): green left-accent + **★ FOCUS** tag.
  - Tentative card (PIA→JAX): dashed border, dimmed, **🤔 tentative** tag + italic note "In the loop · not really planning on going."
- Solo `TRIP_PRESETS.JAX`: `jax-aug7` (Aug 7–9 RT).

---

## 3. Remaining findings / standing risks (not changed this cycle)

1. **JFK transition is now the next hard deadline — 41 days out (2026-09-01).** PIA-003 (per-member straddle) governs correctness for any trip that crosses Sep 1. The Aug 7–9 trip does *not* cross it, so it's unaffected, but any September planning must ship PIA-003 first. **Priority: verify before wiring any post-Sep-1 trip.**
2. **MIA solo presets are stale** (June dates). Low blast radius (solo MIA only, greyed by `validUntil`), left untouched to keep this ticket single-purpose. Recommend a follow-up cleanup ticket.
3. **`focusMember`/`tentativeMembers` are not URL-persisted.** Deliberate (they re-derive on chip tap). A raw shared URL with `dep/ret` set won't restore the ★/🤔 emphasis until the chip is re-tapped. Acceptable for a planning tool; noted for future PIA-004-style share-link work.
4. **SRI freshness check (preflight step 5) can't run in the web sandbox** — cdnjs returns 403 (HQ §8 known limit). Unrelated to this diff (CDN `<script>` tags untouched). Re-run `scripts/preflight.sh` from the Mac for a true GO.

---

## 4. Verification

- `node --check` on extracted inline JS: **OK** for both files.
- Mobile parity: 16/16 matched references for the new symbols (`focusMember`, `tentativeMembers`, `isFocus`, `isTentative`, `completedTripMarker`).
- Preflight 1–4, 6: **OK** (file presence, no `console.log`, no secrets, `<script>` balance, shell syntax). Step 5 blocked by sandbox egress only.
- No leftover `jaxjun5` references in either file.
