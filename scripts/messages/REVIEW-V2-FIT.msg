fix(v2): keep the flight glyph inside its card button

Reduce only the Google Flights card glyph to 17px. Wider emoji fonts
overflowed its bordered 48px button by 2px; the tap target stays 48px.

Validation:
- Preflight's Node suites and live CDN integrity checks pass.
- Full browser word suite: 145 passing, one card-fit failure before
  this fix; that same card-fit block passes after the fix (5 checks).
  The full run counted 366 screens and 3,509 popups within budget.
- All v2 viewport checks pass at 360/390/430 in both themes, including
  short date sheets and long names. One unchanged v1 map-label overlap
  remains at 430px; v1 files are byte-identical to main.
- Browser tests used scratch copies with local HTTP page URLs because
  this environment blocks file URLs; assertions were unchanged.

This merges development work only. app.html remains unlinked until
PIA-147. PIA-140's live two-adult fare interpretation and device checks,
and the recorded comprehension checks, remain outstanding.

Refs PIA-135, PIA-138, PIA-139, PIA-140, PIA-141, PIA-142.
