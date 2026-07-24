/* ═══════════════════════════════════════════════════════════════════
   PIALAX UI DESIGN TOKENS — PIA-031 (A2, Phase 1)
   Canonical token layer for BOTH pialax.html and pialax-mobile.html.
   Paste this block at the TOP of each file's <style> element, replacing
   the existing :root block. Spec: UI_DESIGN_SYSTEM.md.
   Pure CSS custom properties + shared utility classes.
   No markup, no JS, no @import, no external url().
   ═══════════════════════════════════════════════════════════════════ */

:root{
  /* ── Color · surfaces (dark-first) ─────────────────────────────── */
  --bg:#07101e;                 /* page background */
  --surface:#0f1d2e;            /* sidebar / cards level 1 */
  --surface-2:#162233;          /* nested cards, inputs, chips */
  --surface-3:#1e3550;          /* pressed / tertiary fills (e.g. secondary btn) */
  --backdrop:rgba(0,0,0,.55);   /* modal / sheet backdrop */
  --tooltip-bg:rgba(8,14,26,.96);
  --overlay-bg:rgba(7,16,30,.9);/* map legend / floating panels */

  /* ── Color · ink (text) ────────────────────────────────────────── */
  --ink:#e8f0f8;                /* primary text — was undefined; now canonical */
  --ink-muted:#7a99b8;          /* secondary text (canonical: mobile side wins) */
  --ink-faint:#5b7a99;          /* tertiary text, disabled labels */
  --ink-ghost:#253548;          /* near-invisible footer text */
  --ink-on-accent:#ffffff;      /* text on accent/success/danger fills */
  --ink-on-warn:#07101e;        /* text on amber fills (contrast) */

  /* ── Color · lines (borders/dividers) ──────────────────────────── */
  --line:#1c2f45;               /* default border — was undefined; now canonical */
  --line-strong:#243b55;        /* emphasized border (inputs, chips) */

  /* ── Color · brand accent ──────────────────────────────────────── */
  --accent:#2e7cf6;             /* PIALAX blue */
  --accent-dim:rgba(46,124,246,.12);   /* selected-state tint */
  --accent-soft:rgba(46,124,246,.07);  /* row hover tint */

  /* ── Color · status ────────────────────────────────────────────── */
  --success:#10b981;            /* canonical green (desktop wins; replaces mobile #00c853) */
  --success-dim:rgba(16,185,129,.1);
  --warn:#f59e0b;
  --warn-dim:rgba(245,158,11,.12);
  --danger:#ef4444;
  --danger-dim:rgba(239,68,68,.1);
  --info:#38bdf8;               /* informational highlight (JFK banner, watching stage) */

  /* ── Color · data-freshness (pill system) ──────────────────────── */
  --live:var(--success);        /* 🟢 LIVE ≤24h */
  --cached:var(--warn);         /* 🟡 CACHED 24h–7d */
  --sample:#94a3b8;             /* ⚪ SAMPLE / estimates */
  --booked:#3b82f6;             /* 🔒 BOOKED */

  /* ── Color · quota states ──────────────────────────────────────── */
  --quota-ok:var(--success);
  --quota-amber:var(--warn);    /* ≥800 used */
  --quota-red:var(--danger);    /* ≥950 used */
  --quota-locked:var(--danger); /* ⛔ safety cutoff */

  /* ── Color · watchlist lifecycle stages ────────────────────────── */
  --stage-watching:#38bdf8;     /* 👀 */
  --stage-planning:#f59e0b;     /* 📝 */
  --stage-booked:#10b981;       /* ✅ */
  --stage-completed:#94a3b8;    /* 🏁 */

  /* ── Color · trip-mode chips ───────────────────────────────────── */
  --mode-family:#a855f7;
  --mode-solo:#2e7cf6;

  /* ── Color · airport / d3 series (DC palette + arcs/markers) ───── */
  --co-lax:#2e7cf6; --co-jax:#f59e0b; --co-pia:#a855f7; --co-ord:#06b6d4;
  --co-mia:#14b8a6; --co-jfk:#ec4899; --co-lhr:#e11d48; --co-cuz:#22c55e;
  --co-lim:#eab308; --co-fallback:#888;

  /* ── Color · map internals (SVG) ───────────────────────────────── */
  --map-bg:#060e1a;
  --map-land:#132134;
  --map-land-hover:#1a2f48;
  --map-outline:var(--accent);
  --map-label:#a0c4e8;          /* hub / emphasized labels */
  --map-label-dim:#4a6a88;      /* other-airport labels */
  --map-label-home:#6ee7b7;     /* ⌂ HOME label */
  --map-hub-dot:#ffffff;
  --map-home-dot:var(--success);

  /* ── Color · calendar fare tiers ───────────────────────────────── */
  --tier-cheap:#10b981;
  --tier-mid:#f59e0b;
  --tier-pricey:#ef4444;

  /* ── Color · trip-binder segment types (TB_COL) ────────────────── */
  --tb-flight:var(--accent);
  --tb-trek:var(--success);
  --tb-lodging:var(--warn);
  --tb-tour:#a855f7;
  --tb-transfer:#06b6d4;
  --tb-other:#94a3b8;

  /* ── Color · warm accent (home-airport selector block) ─────────── */
  --warm:#f59e0b;
  --warm-hover:#fbbf24;
  --warm-border:#d97706;
  --warm-deep:#b45309;
  --warm-label:#b8852b;
  --warm-ink:#1a1a1a;
  --warm-option-bg:#1f2937;

  /* ── Type ──────────────────────────────────────────────────────── */
  --font:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',system-ui,sans-serif;
  --font-mono:ui-monospace,SFMono-Regular,Menlo,monospace;
  --fs-base:15px;               /* CANONICAL base — mobile wins; desktop moves 14→15px */
  --fs-micro:.55rem;            /* badges, est-tags, sub-metadata */
  --fs-tiny:.6rem;              /* labels, notes, hints */
  --fs-caption:.66rem;          /* pills, chips, legend, stats */
  --fs-body-s:.73rem;           /* buttons, banner body, toast */
  --fs-body:.82rem;             /* card headlines, date values */
  --fs-title:.95rem;            /* route price, section titles */
  --fs-price:1.1rem;            /* finder / hero prices */
  --fs-display:1.5rem;          /* app h1 */
  --lh-tight:1.2;
  --lh-normal:1.4;
  --lh-loose:1.65;

  /* ── Spacing (4px-ish scale) ───────────────────────────────────── */
  --sp-1:4px; --sp-2:6px; --sp-3:10px; --sp-4:14px; --sp-5:16px;
  --sp-6:24px; --sp-7:32px;

  /* ── Radius ────────────────────────────────────────────────────── */
  --rad-xs:4px;                 /* micro inputs, src badges */
  --rad-sm:6px;                 /* calendar cells, small buttons, textareas */
  --rad-md:10px;                /* default control/card radius */
  --rad-lg:14px;                /* popovers, calendar panel */
  --rad-xl:20px;                /* mobile hero cards */
  --rad-sheet:18px;             /* bottom-sheet top corners */
  --rad-pill:999px;             /* pills, chips, progress */

  /* ── Elevation ─────────────────────────────────────────────────── */
  --shadow-1:0 4px 20px rgba(0,0,0,.4);      /* card focus/hover */
  --shadow-2:0 6px 24px rgba(0,0,0,.6);      /* tooltip / popover */
  --shadow-3:0 24px 64px rgba(0,0,0,.75);    /* modal / calendar */
  --shadow-sheet:0 -8px 40px rgba(0,0,0,.7); /* bottom sheet */
  --focus-ring:0 0 0 2px rgba(46,124,246,.4);

  /* ── Motion ────────────────────────────────────────────────────── */
  --ease:cubic-bezier(.4,0,.2,1);
  --fast:cubic-bezier(.25,.1,.25,1);
  --t-fast:.12s;                /* micro feedback (hover, toggle) */
  --t-quick:.15s;               /* default control transitions */
  --t-med:.18s;                 /* card border/shadow */
  --t-slow:.28s;                /* toast slide */
  --dur-pop:.16s;               /* calendar/sheet entrance */
  --dur-spin:.6s;
  --dur-arc:1.8s;               /* map route dash */
  --dur-blink:2.4s;             /* live-pill dot */
  --dur-pulse:2.6s;             /* home-hub pulse */
  --dur-strip:2.8s;             /* meetup-strip shimmer */

  /* ═══ Backward-compat aliases (both files' existing names) ══════ */
  --surface2:var(--surface-2);
  --border:var(--line);
  --border2:var(--line-strong);
  --text:var(--ink);
  --muted:var(--ink-muted);
  --a-dim:var(--accent-dim);
  --green:var(--success);       /* closes the #00c853 vs #10b981 drift */
  --amber:var(--warn);
  --red:var(--danger);
  --lax:var(--co-lax); --jax:var(--co-jax); --pia:var(--co-pia); --ord:var(--co-ord);
  --cheap:var(--tier-cheap); --mid:var(--tier-mid); --pricey:var(--tier-pricey);
  --r:var(--rad-md);
  /* mobile-file legacy names */
  --text-main:var(--ink);
  --text-muted:var(--ink-muted);
  --card:var(--surface);
  --primary:var(--accent);
  --space-xs:var(--sp-2);
  --space-sm:var(--sp-3);
  --space-md:var(--sp-5);
  --space-lg:var(--sp-6);
  --radius-md:var(--rad-lg);    /* mobile cards stay 14px */
  --radius-lg:var(--rad-xl);    /* mobile hero cards stay 20px */
}

/* ═══ Light mode — same custom properties, overridden ═════════════ */
@media (prefers-color-scheme:light){
  :root{
    --bg:#f2f5f9;
    --surface:#ffffff;
    --surface-2:#e9eef5;
    --surface-3:#dde5ee;
    --backdrop:rgba(15,29,46,.35);
    --tooltip-bg:rgba(255,255,255,.97);
    --overlay-bg:rgba(255,255,255,.92);

    --ink:#0f1d2e;
    --ink-muted:#4a6480;
    --ink-faint:#7a92ab;
    --ink-ghost:#c3cfdc;
    --ink-on-accent:#ffffff;
    --ink-on-warn:#3a2500;

    --line:#d7e0ea;
    --line-strong:#c2cfdd;

    --accent:#1f66d6;
    --accent-dim:rgba(31,102,214,.1);
    --accent-soft:rgba(31,102,214,.06);

    --success:#0b9668;
    --success-dim:rgba(11,150,104,.1);
    --warn:#b45309;
    --warn-dim:rgba(180,83,9,.1);
    --danger:#dc2626;
    --danger-dim:rgba(220,38,38,.08);
    --info:#0284c7;

    --sample:#64748b;
    --booked:#2563eb;

    --stage-watching:#0284c7;
    --stage-planning:#b45309;
    --stage-booked:#0b9668;
    --stage-completed:#64748b;

    --mode-family:#9333ea;
    --mode-solo:#1f66d6;

    --map-bg:#e4ebf3;
    --map-land:#ffffff;
    --map-land-hover:#dde8f2;
    --map-label:#33506e;
    --map-label-dim:#8aa0b8;
    --map-label-home:#0b9668;
    --map-hub-dot:#0f1d2e;

    --tier-cheap:#0b9668;
    --tier-mid:#b45309;
    --tier-pricey:#dc2626;

    --tb-tour:#9333ea; --tb-transfer:#0e7490; --tb-other:#64748b;

    --warm:#f59e0b;
    --warm-hover:#fbbf24;
    --warm-border:#d97706;
    --warm-deep:#b45309;
    --warm-label:#92610a;
    --warm-ink:#1a1a1a;
    --warm-option-bg:#ffffff;

    --shadow-1:0 4px 20px rgba(15,29,46,.12);
    --shadow-2:0 6px 24px rgba(15,29,46,.16);
    --shadow-3:0 24px 64px rgba(15,29,46,.22);
    --shadow-sheet:0 -8px 40px rgba(15,29,46,.2);
    --focus-ring:0 0 0 2px rgba(31,102,214,.35);
  }
}

/* ═══ Reduced motion — kill ambient/decorative animation ══════════ */
@media (prefers-reduced-motion:reduce){
  :root{
    --t-fast:0s; --t-quick:0s; --t-med:0s; --t-slow:0s; --dur-pop:0s;
    --dur-arc:0s; --dur-blink:0s; --dur-pulse:0s; --dur-strip:0s;
  }
  *,*::before,*::after{
    animation-duration:.01ms!important;
    animation-iteration-count:1!important;
    transition-duration:.01ms!important;
  }
}

/* ═══ Shared utility classes (component-recipe primitives) ════════ */

/* Card — level-1 container */
.u-card{background:var(--surface-2);border:1px solid var(--line-strong);
  border-radius:var(--rad-md);padding:var(--sp-3) var(--sp-4);}
.u-card--raised{background:var(--surface);box-shadow:var(--shadow-1);}

/* Pill — rounded status/label lozenge */
.u-pill{display:inline-flex;align-items:center;gap:4px;
  padding:3px 9px;border-radius:var(--rad-pill);font-size:var(--fs-caption);
  font-weight:700;color:var(--ink-muted);background:var(--surface-2);
  border:1px solid var(--line);white-space:nowrap;}
.u-pill--success{color:var(--ink-on-accent);background:var(--success);border-color:var(--success);}
.u-pill--warn{color:var(--ink-on-warn);background:var(--warn);border-color:var(--warn);}
.u-pill--accent{color:var(--accent);background:var(--accent-dim);border-color:var(--accent);}

/* Chip — selectable filter/toggle */
.u-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;
  font-size:var(--fs-caption);font-weight:700;color:var(--ink-muted);
  background:var(--surface-2);border:1px solid var(--line-strong);
  border-radius:var(--rad-pill);cursor:pointer;white-space:nowrap;
  transition:all var(--t-quick) var(--ease);font-family:inherit;}
.u-chip:hover{border-color:var(--accent);color:var(--accent);}
.u-chip.on,.u-chip.active{background:var(--accent-dim);border-color:var(--accent);color:var(--accent);}
.u-chip:disabled{opacity:.45;cursor:default;border-style:dashed;}

/* Buttons */
.u-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:7px 12px;border-radius:var(--rad-md);font-size:var(--fs-body-s);
  font-weight:800;font-family:inherit;cursor:pointer;border:1px solid transparent;
  transition:opacity var(--t-quick),transform var(--t-fast),border-color var(--t-quick),color var(--t-quick);}
.u-btn:active{transform:scale(.98);}
.u-btn:focus-visible{outline:none;box-shadow:var(--focus-ring);}
.u-btn--primary{background:var(--accent);color:var(--ink-on-accent);}
.u-btn--primary:hover{opacity:.88;}
.u-btn--secondary{background:var(--surface-3);color:var(--ink-muted);border-color:var(--line-strong);}
.u-btn--secondary:hover{color:var(--ink);border-color:var(--accent);}
.u-btn--danger{background:var(--danger);color:var(--ink-on-accent);}
.u-btn--danger:hover{opacity:.88;}
.u-btn--ghost{background:transparent;color:var(--ink-muted);border-color:var(--line-strong);}
.u-btn--ghost:hover{color:var(--accent);border-color:var(--accent);}
.u-btn:disabled{opacity:.4;cursor:default;transform:none;}

/* Banner — full-width message strip */
.u-banner{padding:var(--sp-2) var(--sp-3);border-radius:var(--rad-md);
  border:1.5px solid var(--line-strong);background:var(--surface-2);
  font-size:var(--fs-tiny);line-height:var(--lh-normal);color:var(--ink);}
.u-banner--warn{background:var(--warn-dim);border-color:var(--warn);}
.u-banner--danger{background:var(--danger-dim);border-color:var(--danger);}
.u-banner--success{background:var(--success-dim);border-color:var(--success);}
.u-banner--info{background:var(--accent-dim);border-color:var(--info);}

/* Sheet / modal panel */
.u-sheet{background:var(--surface);border:1px solid var(--line-strong);
  border-radius:var(--rad-lg);box-shadow:var(--shadow-3);
  animation:u-pop var(--dur-pop) var(--fast);}
.u-sheet--bottom{border-radius:var(--rad-sheet) var(--rad-sheet) 0 0;
  box-shadow:var(--shadow-sheet);}
.u-backdrop{position:fixed;inset:0;background:var(--backdrop);}
@keyframes u-pop{from{opacity:0;transform:translateY(-7px) scale(.98)}to{opacity:1;transform:none}}

/* Table / ledger row */
.u-row{display:flex;align-items:center;justify-content:space-between;
  gap:var(--sp-2);padding:var(--sp-2) var(--sp-2);border-top:1px solid var(--line);
  font-size:var(--fs-caption);color:var(--ink);transition:background var(--t-fast);}
.u-row:hover{background:var(--accent-soft);}
.u-row--muted{color:var(--ink-muted);}

/* Toast */
.u-toast{position:fixed;bottom:24px;left:50%;
  transform:translateX(-50%) translateY(50px);
  background:var(--success);color:var(--ink-on-accent);
  font-size:var(--fs-body-s);font-weight:800;padding:8px 20px;
  border-radius:var(--rad-pill);opacity:0;z-index:2000;pointer-events:none;
  white-space:nowrap;transition:all var(--t-slow) var(--ease);}
.u-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}

/* Progress bar (quota) */
.u-progress{height:5px;background:var(--surface-3);border-radius:var(--rad-pill);overflow:hidden;}
.u-progress__fill{height:100%;border-radius:var(--rad-pill);
  background:var(--quota-ok);transition:width var(--t-slow) var(--ease);}
.u-progress__fill--amber{background:var(--quota-amber);}
.u-progress__fill--red{background:var(--quota-red);}

/* Stat tile */
.u-stat{display:flex;flex-direction:column;gap:2px;}
.u-stat__label{font-size:var(--fs-micro);font-weight:700;color:var(--ink-muted);
  text-transform:uppercase;letter-spacing:.08em;}
.u-stat__value{font-size:var(--fs-body);font-weight:900;color:var(--ink);line-height:var(--lh-tight);}

/* Micro label (form/section captions) */
.u-lbl{font-size:var(--fs-tiny);font-weight:700;color:var(--ink-muted);
  text-transform:uppercase;letter-spacing:.09em;}
