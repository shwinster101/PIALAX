# PIALAX Sprint Proposal — "The layer above Google Flights"

_Date: 2026-07-21 · Owner: Ashwin · Theme: sharpen the value proposition vs Google Flights & Flighty · Source: strategy pass after the JAX / Peru trip-planning cycle_

---

## 0. North star

**PIALAX is not a flight search engine and not a flight tracker. It is the group-trip planning & coordination layer that sits _above_ them.** It answers the questions Google Flights and Flighty structurally cannot, then **hands off** to Google Flights for the live price and the booking, and stays out of Flighty's lane (day-of tracking) entirely.

Every enhancement below must pass one test: **"What can't Google Flights or Flighty do here?"** If the answer is "nothing," we don't build it.

---

## 1. Competitive map — who owns what

| Capability | Google Flights | Flighty | **PIALAX (our lane)** |
|---|---|---|---|
| Live fares / cheapest-search for **one** traveler | ✅ owns it | — | ❌ don't compete — **hand off** (we already deep-link) |
| Day-of tracking, delays, gate, "where's my plane" | — | ✅ owns it | ❌ don't compete — stay out |
| **Total cost for a distributed group to gather** | ❌ | ❌ | ✅ **only us** |
| **Cheapest hub + cheapest week for everyone at once** | ❌ | ❌ | ✅ **only us** |
| **Who's going / tentative / hosting (RSVP)** | ❌ | ❌ | ✅ **only us** |
| **Whole trip = flights + trek/lodging/transfers in one view** | ❌ | ❌ (flights only) | ✅ **only us** |
| **Itinerary gap/conflict detection** (flight leaves before trek ends) | ❌ | ❌ | ✅ **only us** |
| **One shareable link of the whole group plan** | partial (1 itinerary) | partial (1 flight) | ✅ **the whole plan** |
| Open-jaw / multi-city modeling with ground legs | partial | ❌ | ✅ + hands off to GF to book |

**Takeaway:** our moat is **group economics + whole-trip binder + coordination**. The Peru work already hinted at it (trek card, open-jaw compare, acclimatization nesting) — this sprint makes it the product.

---

## 2. Anti-goals (protect the value prop)

- **Do not** try to beat Google Flights on live price freshness or search breadth — we hand off. (This is also why the cache-only + "Get Live Fares" button design is correct: we're a planner, not a live meter.)
- **Do not** build day-of flight tracking / notifications — that's Flighty's moat.
- **Do not** add features that only help a **single** traveler with a **single** flight. If GF does it better, link to GF.

---

## 3. Sprint tickets

IDs continue from PIA-018 (PIA-019 reserved). Leverage = (differentiation × group-value) ÷ effort.

| Ticket | User story (compressed) | Why GF/Flighty can't | Tag | Files |
|---|---|---|---|---|
| **PIA-020 — Best Meetup Window** | Rank the next N weekends by **total family cost + date overlap** and headline the single cheapest week for everyone to gather ("Cheapest gather: Aug 7–9 in JAX · $1,126 total"). One-tap apply. | GF optimizes one itinerary; neither sums a distributed group's cost or finds a shared-cheap week. | minor | both HTML |
| **PIA-021 — Trip Binder** ⭐ | Each trip holds **non-flight bookings** (lodging, tours, treks, transfers) on a day-by-day timeline that flags **gaps/conflicts** vs the flights (buffer OK / "flight leaves before trek ends"). The confirmed trek is entry #1. | GF holds no ground bookings; Flighty tracks flights only. Neither validates a mixed itinerary. **The big bet / durable moat.** | major | both HTML |
| **PIA-022 — Cost Split + Host Fairness** | Show each member's share of the total, and a ledger that nudges **host rotation** so the cost burden spreads across the year. | No group ledger, no fairness concept anywhere else. | minor | both HTML |
| **PIA-023 — Coordination Board (RSVP)** | Promote focus/tentative into real per-member status — **hosting / booked / tentative / out** — with a headline "3 of 4 in." Status drives which legs count toward the total. | Single-user tools have no group RSVP. Builds directly on the focus/tentative work already shipped. | minor | both HTML |
| **PIA-024 — Shareable Family-Plan link** | One read-only link opens a clean summary of the whole plan — who's going, dates, total cost, the binder — so the family sees the same picture. Copy-link + copy-summary-text. | GF shares one itinerary; Flighty shares one flight. Nobody shares the **whole group plan**. Leverages existing `syncURL`. | patch | both HTML |
| **PIA-025 — Group Price-Watch (quota-safe)** | Remember the last-checked **total family cost** per trip; on the next manual *Get Live Fares*, show the delta ("↓ $40 since Jul 14") + a tiny sparkline. Never auto-fetches. | GF alerts on single fares; neither watches a **group total** over time. Respects the button-gated quota model. | patch | both HTML |
| **PIA-026 — "Handoff, don't reimplement" principle** | Codify in `PIALAX_HQ.md`: we hand off to GF for live search/booking, stay out of Flighty's tracking lane, and every new ticket must answer "what can't GF/Flighty do here?" | Keeps the roadmap honest and the value prop from drifting into a moat we can't win. | chore | `PIALAX_HQ.md` |

---

## 4. Prioritization & sequencing

Ranked by leverage (do top-down):

1. **PIA-026 (chore, ~10 min)** — set the guardrail first; it's free and it gates everything after it.
2. **PIA-020 (minor)** — the core promise, and mostly a re-skin of the existing `computeBestMeetupWeekends`. Highest value-per-effort. **Start here.**
3. **PIA-023 (minor)** — cheap, extends shipped focus/tentative, unlocks the "group" framing every other ticket leans on.
4. **PIA-024 (patch)** — cheap, leverages existing URL state; turns single-user planning into a family artifact.
5. **PIA-022 (minor)** — medium effort, strong differentiation.
6. **PIA-025 (patch)** — cheap, and it's the honest version of "price alerts" that respects our no-auto-fetch rule.
7. **PIA-021 (major)** — the big bet. Schedule as its own cycle; it's the feature that makes PIALAX the **single source of truth** for a group trip and the hardest for GF/Flighty to copy.

**The one bet if we only ship one thing:** PIA-020. It's the literal promise in the project definition ("cheapest collaborative hub and travel windows") and today it's buried in a raw overlap calendar instead of stated as a recommendation.

---

## 4a. AMENDMENT (2026-07-21) — the Watchlist reframe ⭐ (Ashwin)

**Insight (Ashwin):** Google Flights tracks *one trip's price at a time*. Flighty shows trips *already booked or completed*. **Nobody owns the _pre-booking_ stage — a watchlist of trips you're still deciding on, all in one place.** That's the gap, and it's exactly where PIALAX already lives (London=done, JAX=watching, Peru=trek booked + flights watching).

**Reframe:** PIALAX is a **trip watchlist / portfolio** — like a stock watchlist, but for trips — spanning **both solo and family** trips. Each trip is a card with a lifecycle **stage** and its own **notes + reminders**:

> 👀 **Watching** → 📝 **Planning** → ✅ **Booked** → 🏁 **Completed**

This isn't a 7th ticket bolted on — it's the **home screen** that the others become features of:
- PIA-021 (Trip Binder) → the **detail view** of a watchlist item.
- PIA-023 (RSVP) → a **field** on a family-trip card.
- PIA-025 (price-watch) → the **priceHistory** shown on a card.

### PIA-027 — Trip Watchlist (new north-star, major)

| Field | Spec |
|---|---|
| **User story** | As someone juggling several possible trips (JAX, Peru, next reunion) I want them all as cards on one watchlist — solo and family — each with a stage, dates, an estimate, notes, and reminders, so I keep the whole pipeline in one place instead of re-searching Google Flights every time. |
| **Data model** | `WATCHLIST = [{ id, mode:'solo'|'family', origin, dests[], stage, dep, ret, notes[], reminders[], priceHistory[] }]`. London / JAX / Peru seed it as the first three items. |
| **Default dates** | New watched trip defaults to **Thursday-night out → Sunday-night return** unless a date range is specified (formalizes the existing Thu–Sun weekend logic). |
| **View** | A watchlist tab/home: portfolio header ("👀 2 watching · ✅ 1 booked · 🏁 1 done"), cards grouped by stage, each card opens into the existing solo/family detail view. |
| **Notes & reminders** | Free-text notes + structured reminders per card (passport expiry, booking #, briefing, "check price again") — generalizes the Peru trek card. |
| **Persistence / share** | localStorage + URL, read-tolerant. |
| **Why GF/Flighty can't** | GF = single-trip price tracker (no cross-trip list, no notes, no group). Flighty = post-booking only. PIALAX owns the **pre-booking, multi-trip, noted, group-aware** stage. |
| **Tag** | **major** — becomes the product's home screen. |

**Revised sequencing:** PIA-020 ✅ shipped → **PIA-027 (Watchlist shell + stages + Thu→Sun default + seed the 3 trips)** is now the top priority (it reframes the app), with PIA-021/023/025 folding in as watchlist-card features, and PIA-022/024 after.

---

## 5. Success signal

A user who has Google Flights **and** Flighty on their phone still opens PIALAX because it's the only place that tells them **"here's the cheapest week for all four of us to be in the same city, here's who's in, here's the whole trip including the trek, and here's the link to send the family."** None of that exists in the other two apps. If a proposed feature doesn't move toward that sentence, it's out of scope.
