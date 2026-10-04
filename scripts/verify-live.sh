#!/usr/bin/env bash
# verify-live.sh — PIA-117: the trust gate, run against the DEPLOYED Worker.
#
# The in-process suite (test-trust.sh) proves the code; this proves the deploy:
# that the secret is set, the IdeaRoom migration applied, and the fare cache
# persists on the real host. PIA-114..116 close only when this passes.
#
#   A1  unauthenticated calls to every paid route get 401/400/404, and the
#       SerpAPI account's this_month_usage is unchanged after the barrage.
#   A2  a throwaway "PIALAX smoke test" trip gets 3 simultaneous answers plus a
#       simultaneous "booked"; all survive and the Worker reports
#       serialized:true. The trip is then dropped.
#   A3  the same fresh search twice: MISS then HIT, the same X-Fetched-At, and
#       this_month_usage up by exactly 1 (the run's only paid search).
#   B3  /account's Worker-side spend meter is exact (SpendMeter DO) and moved
#       by exactly 1 for that search (PIA-118).
#
# Usage:   PIALAX_TOKEN=… bash scripts/verify-live.sh [worker-url]
# The token is read from the environment only — never pass it as an argument
# (shell history) and never write it to a file. Needs curl and node.
# Not part of preflight (needs network and spends 1 SerpAPI search).

set -uo pipefail
BASE="${1:-https://pialax-proxy.ashwinyedavalli.workers.dev}"
BASE="${BASE%/}"
ORIGIN='https://shwinster101.github.io'
pass=0; fail=0
ok()  { printf "  OK  %s\n" "$1"; pass=$((pass+1)); }
bad() { printf "  XX  %s\n" "$1"; fail=$((fail+1)); }
step() { printf "\n▶ %s\n" "$1"; }

if [ -z "${PIALAX_TOKEN:-}" ]; then echo "PIALAX_TOKEN is not set — export it for this shell only, then re-run." >&2; exit 2; fi
command -v curl >/dev/null && command -v node >/dev/null || { echo "needs curl and node" >&2; exit 2; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# js <file> <expr>: evaluate an expression against the parsed JSON body ("" on error).
js() { node -e 'let j=null;try{j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))}catch(e){};try{const v=(new Function("j","return ("+process.argv[2]+")"))(j);process.stdout.write(v===undefined||v===null?"":String(v))}catch(e){}' "$1" "$2"; }
# status <curl args…>: HTTP status only, body discarded.
status() { curl -sS -o /dev/null -w '%{http_code}' -H "Origin: $ORIGIN" "$@"; }
usage() { curl -sS -H "Origin: $ORIGIN" -H "X-Pialax-Token: $PIALAX_TOKEN" "$BASE/account" -o "$TMP/acct.json" -w '%{http_code}' >"$TMP/acct.code"; js "$TMP/acct.json" 'j && j.this_month_usage'; }

printf "PIALAX verify-live · %s\n" "$BASE"

# Fail safe: an ungated (pre-PIA-114) Worker forwards unauthenticated calls to
# SerpAPI, so the barrage below would spend real searches. Probe with a request
# that costs nothing on either version (no token, no search params) and stop
# unless the Worker answers 401.
pre="$(status "$BASE/account")"
if [ "$pre" != 401 ]; then
  printf "  XX  /account without a token → %s, not 401: this Worker is not gated yet.\n      Deploy first (wrangler secret put PROXY_TOKEN; wrangler deploy). Nothing else was sent.\n" "$pre"
  printf "\nVERIFY-LIVE: FAIL — Worker not gated\n"; exit 1
fi

step "A1 unauthorized requests spend nothing"
U0="$(usage)"
if [ "$(cat "$TMP/acct.code")" = 200 ] && [ -n "$U0" ]; then ok "token accepted by /account (this_month_usage=$U0)"; else bad "token rejected or no usage from /account (HTTP $(cat "$TMP/acct.code")) — is PROXY_TOKEN set and deployed?"; fi
Q='engine=google_flights&departure_id=LAX&arrival_id=PIA&outbound_date=2026-12-15&type=2&currency=USD&hl=en'
WRONG="$(printf '%s' "$PIALAX_TOKEN" | sed 's/.$/0/')"; [ "$WRONG" = "$PIALAX_TOKEN" ] && WRONG="$(printf '%s' "$PIALAX_TOKEN" | sed 's/.$/1/')"
J='Content-Type: application/json'
check() { # label expected-codes actual
  case " $2 " in *" $3 "*) ok "$1 → $3";; *) bad "$1 → $3 (expected $2)";; esac
}
check "GET /search, no token"               "401"     "$(status "$BASE/search?$Q")"
check "GET /search, wrong token"            "401"     "$(status -H "X-Pialax-Token: $WRONG" "$BASE/search?$Q")"
check "GET /search, spoofed Origin"         "401"     "$(status -H 'Origin: https://evil.example' "$BASE/search?$Q")"
check "GET / legacy root, no token"         "401"     "$(status "$BASE/?$Q")"
check "GET /?action=account, no token"      "401"     "$(status "$BASE/?action=account")"
check "GET /account, no token"              "401"     "$(status "$BASE/account")"
check "GET /search + cache-buster, no token" "401 400" "$(status "$BASE/search?$Q&x=$RANDOM&no_cache=true")"
check "GET unknown path"                    "404 401" "$(status "$BASE/serp?$Q")"
check "POST /extract, no token"             "401"     "$(status -X POST -H "$J" --data '{"today":"2026-10-04","context_event":{"id":"v","raw_text":"LAX to PIA"}}' "$BASE/extract")"
check "POST /alert, no token"               "401"     "$(status -X POST -H "$J" --data '{"to":"a@b.co","event":{"id":"v","trip_id":"t","type":"test","subject":"s","body_text":"b"}}' "$BASE/alert")"
check "POST /alerts/sync, no token"         "401"     "$(status -X POST -H "$J" --data '{"email":"a@b.co","watches":[]}' "$BASE/alerts/sync")"
check "GET /search + no_cache, WITH token"  "400"     "$(status -H "X-Pialax-Token: $PIALAX_TOKEN" "$BASE/search?$Q&no_cache=true")"
sleep 3
U1="$(usage)"
if [ -n "$U0" ] && [ "$U1" = "$U0" ]; then ok "SerpAPI this_month_usage unchanged after the barrage ($U0 → $U1)"; else bad "SerpAPI usage moved during the unauthorized barrage ($U0 → $U1)"; fi

step "A2 simultaneous answers all survive"
IDEA='{"idea":{"title":"PIALAX smoke test","destination":{"city":"Peoria","airport":"PIA"},"dates":{"departure":"2026-11-20","return":"2026-11-29"},"members":[{"code":"PIA","label":"A","airport":"PIA","headcount":1},{"code":"LAX","label":"B","airport":"LAX","headcount":1},{"code":"LGA","label":"C","airport":"LGA","headcount":1},{"code":"JFK","label":"D","airport":"JFK","headcount":1}]}}'
curl -sS -X POST -H "Origin: $ORIGIN" -H "$J" --data "$IDEA" "$BASE/idea" -o "$TMP/made.json"
ID="$(js "$TMP/made.json" 'j && j.id')"; KEY="$(js "$TMP/made.json" 'j && j.edit_key')"
if [ -n "$ID" ] && [ -n "$KEY" ]; then
  [ "$(js "$TMP/made.json" 'j.serialized')" = "true" ] && ok "create reports serialized:true (IdeaRoom deployed)" || bad "create reports serialized=$(js "$TMP/made.json" 'j.serialized') — Durable Object binding missing?"
  curl -sS -o /dev/null -X POST -H "Origin: $ORIGIN" -H "$J" --data '{"member":"LAX","status":"in","available_from":"2026-11-20","available_to":"2026-11-29"}' "$BASE/idea/respond?id=$ID"
  R() { curl -sS -o "$TMP/r$1.json" -w '%{http_code}' -X POST -H "Origin: $ORIGIN" -H "$J" --data "$3" "$BASE/idea/$2?id=$ID" >"$TMP/r$1.code"; }
  R 1 respond '{"member":"PIA","status":"in","available_from":"2026-11-20","available_to":"2026-11-29"}' &
  R 2 respond '{"member":"LGA","status":"maybe","available_from":"2026-11-25","available_to":"2026-11-29"}' &
  R 3 respond '{"member":"JFK","status":"out"}' &
  R 4 booked  '{"member":"LAX","booked":true}' &
  wait
  codes="$(cat "$TMP/r1.code") $(cat "$TMP/r2.code") $(cat "$TMP/r3.code") $(cat "$TMP/r4.code")"
  [ "$codes" = "200 200 200 200" ] && ok "4 parallel writes accepted" || bad "parallel writes returned: $codes"
  curl -sS -H "Origin: $ORIGIN" -H "X-Idea-Key: $KEY" "$BASE/idea?id=$ID" -o "$TMP/view.json"
  got="$(js "$TMP/view.json" '[j.doc.responses.PIA&&j.doc.responses.PIA.status, j.doc.responses.LGA&&j.doc.responses.LGA.status, j.doc.responses.JFK&&j.doc.responses.JFK.status, j.doc.responses.LAX&&j.doc.responses.LAX.status, j.doc.responses.LAX&&j.doc.responses.LAX.booked, j.serialized].join(",")')"
  [ "$got" = "in,maybe,out,in,true,true" ] && ok "all 3 answers + the booked flag survived, read served serialized" || bad "after the race: $got (want in,maybe,out,in,true,true)"
  dc="$(curl -sS -o /dev/null -w '%{http_code}' -X POST -H "Origin: $ORIGIN" -H "$J" --data "{\"edit_key\":\"$KEY\",\"decision\":{\"stage\":\"dropped\"}}" "$BASE/idea/update?id=$ID")"
  [ "$dc" = 200 ] && ok "smoke-test trip dropped" || bad "could not drop the smoke-test trip $ID (HTTP $dc)"
else
  bad "could not create the smoke-test trip: $(head -c 200 "$TMP/made.json")"
fi

step "A3 a cache hit keeps its age and spends nothing"
# A date nobody has searched, so the first call is a real MISS (one SerpAPI search).
D="$(node -e 'const d=new Date(Date.now()+(60+Math.floor(Math.random()*120))*864e5);process.stdout.write(d.toISOString().slice(0,10))')"
Q3="engine=google_flights&departure_id=LAX&arrival_id=ORD&outbound_date=$D&type=2&currency=USD&hl=en"
U2="$(usage)"
S2="$(js "$TMP/acct.json" 'j && j.spend && j.spend.serp && j.spend.serp.used')"
fetchq() { curl -sS -D "$TMP/h$1" -o "$TMP/b$1" -w '%{http_code}' -H "Origin: $ORIGIN" -H "X-Pialax-Token: $PIALAX_TOKEN" "$BASE/search?$2"; }
hdr() { grep -i "^$2:" "$TMP/h$1" | head -1 | cut -d' ' -f2- | tr -d '\r'; }
s1="$(fetchq 1 "$Q3")"; sleep 2
s2="$(fetchq 2 "$(printf '%s' "$Q3" | tr '&' '\n' | sort -r | paste -sd'&' -)")"   # same search, params reordered
c1="$(hdr 1 X-Proxy-Cache)"; c2="$(hdr 2 X-Proxy-Cache)"; a1="$(hdr 1 X-Fetched-At)"; a2="$(hdr 2 X-Fetched-At)"
[ "$c1" = MISS ] && [ "$c2" = HIT ] && ok "first search MISS, second HIT ($D)" || bad "cache states: '$c1' then '$c2' (HTTP $s1, $s2)"
[ -n "$a1" ] && [ "$a1" = "$a2" ] && ok "HIT keeps the original X-Fetched-At ($a1)" || bad "X-Fetched-At changed: '$a1' → '$a2'"
sleep 3
U3="$(usage)"
if [ -n "$U2" ] && [ -n "$U3" ] && [ $((U3 - U2)) -eq 1 ]; then ok "SerpAPI usage +1 for two searches ($U2 → $U3)"; else bad "SerpAPI usage moved $U2 → $U3 (want +1)"; fi
S3="$(js "$TMP/acct.json" 'j && j.spend && j.spend.serp && j.spend.serp.used')"
EX="$(js "$TMP/acct.json" 'j && j.spend && j.spend.exact')"
# PIA-118: the Worker's own meter agrees, and it is the exact (Durable Object) one.
if [ "$EX" = true ] && [ -n "$S2" ] && [ -n "$S3" ] && [ $((S3 - S2)) -eq 1 ]; then ok "Worker spend meter +1 and exact ($S2 → $S3 of cap $(js "$TMP/acct.json" 'j.spend.serp.cap'))"; else bad "Worker spend meter: exact=$EX, $S2 → $S3 (want exact=true, +1) — SpendMeter deployed?"; fi

printf "\n"
if [ "$fail" -eq 0 ]; then printf "VERIFY-LIVE: PASS — all %d checks\n" "$pass"; exit 0; fi
printf "VERIFY-LIVE: FAIL — %d failing, %d passing\n" "$fail" "$pass"; exit 1
