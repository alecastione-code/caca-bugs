---
name: caca-bugs
description: >
  Hunts and fixes bugs on its own. Sweeps a live web app signed in and read-only (every page and
  tab, console, network, broken values, stuck loaders, slowness), cross-checks the server logs
  (5xx, 499, slow endpoints, repeated errors), scores health per page, ranks the bugs and fixes
  each one with a regression test, a PR, the CI gate and a live re-check. Use for "qa", "find
  bugs", "sweep the app", "what is broken", "caça bugs", "procura bugs", "testa o painel",
  /caca-bugs, and after every big deploy.
---

# caca-bugs (bug hunter)

A test-fix-verify loop for apps already in production. The method is inspired by gstack's `/qa`
(MIT, see NOTICE): severity taxonomy, health score, regression test before the fix, and loop
brakes. It is built to be safer and to see more:

1. **Real data, read-only.** The sweep runs inside the signed-in browser tab. While it runs,
   every request that is not GET or HEAD is blocked, so it sees real data without being able to
   change anything. No credentials are handled and no cookies or tokens are exported.
2. **Server and screen together.** Many bugs never show on screen. Examples are a webhook
   answering 500, a queue stuck for hours, or a read that takes 30 s for one tenant and 0.1 s for
   another. The sweep cross-checks the screen with the host's request and error logs.
3. **Fixes go the safe way.** One PR per bug or small batch goes through the CI gate and the
   normal deploy. Nothing is pushed straight to the main branch. After deploy, the same probe runs
   again on the live app.
4. **No customer data in reports.** Reports carry routes, terms, counts, HTTP statuses and
   timings. They never carry names, orders, e-mails, cookies or tokens.

## Lesson learned: a sweep can take production down

In the first real run, re-checking one heavy page took the production server down for several
minutes until the sweep was stopped. The page fired eight 30 s+ reads in parallel. Since then:

- the sweep checks the health endpoint every 4 s WHILE each page loads, and stops everything at
  once if it gets slow;
- the culprit page is reported as critical (`derruba_servidor`), because a normal user can freeze
  the server the same way;
- the pause between pages is 1.5 s;
- full sweeps run off-peak. During business hours, sweep only a few pages (`so`) and watch the
  health endpoint.

## Non-negotiable rules

- In production, read-only. Never write to the database or third-party APIs to "see what
  happens". The sweep's write block is a safety net, not a permission.
- Do not change the signed-in user's saved settings (theme, store, layout) to test. Sweep what
  is on screen and ask the owner for anything else.
- Never print tokens, cookies, localStorage or customer data.
- Code changes: smallest fix that solves it; diagnose before editing; test first. Pair with
  skills such as `ponytail`, `diagnosing-bugs` and `tdd` if you have them.

## Step 1: Screen sweep (agent's browser, app tab signed in)

1. Open the app in a tab and confirm it is signed in.
2. Optionally set `window.__varreduraOpcoes`. Examples: `{ rotas: ['#/orders','#/stock'] }`,
   `{ so: [...] }`, `{ pular: [...] }`, `{ esperaMax: 20000, maxAbas: 4 }`, or
   `{ termos: [['my_error', /oops/i, 'alta']] }`. Without `rotas`, it discovers same-origin links
   in nav, aside and header. For apps with a router API, pass
   `rotas: [{ id, ir: () => router.push('/x') }]`.
3. Paste `scripts/sweep.js` into the browser tool. It starts in the background and answers at
   once, because many browser tools time out at around 45 s.
4. Paste `scripts/status.js` to read progress. A full sweep of a 70-page app takes 20-35 min, so
   wait in the background between checks. At the end it returns the summary, problems per
   page and the pages that passed.
5. **Mobile:** set a 390 px viewport, reload, and sweep the main routes again.

It checks, per page and per clicked tab:

| Signal | Type |
|---|---|
| Page never settled within `esperaMax` | stuck (`estourou`) |
| "data unavailable", "failed to load", "erro ao", "falha ao" | dados_indisponiveis / erro_na_tela |
| undefined, NaN, null, [object Object] | valor_quebrado |
| "Loading…" or "Carregando…" still visible after settling | carregando_preso |
| Emoji or text glyph used as an icon | emoji / simbolo_texto |
| Horizontal scroll, broken image, unlabeled button, empty page | visual / a11y |
| Console error, unhandled rejection | console |
| 4xx/5xx/failed request (AbortError on navigation ignored) | rede |
| Request over 5 s | lenta |
| Blocked write attempts | logged, not a bug |

**Self-brake:** set `saude: '/health'` (any cheap endpoint). Before each page the sweep measures
it. If it is slower than `lentoMs` (3 s), the sweep waits 10 s and retries. After 3 slow tries it
stops and marks the run as `freada`. It also waits `pausaEntre` (0.4 s) between pages, and pages
that never settled get no tab clicks. A full sweep of heavy pages can slow a small production
server on its own.

## Step 2: Server sweep (host logs)

Using your host's log tool (Railway, Render, Fly, Vercel, CloudWatch…), over the last 6-24 h:

- Count HTTP 5xx and 499 by path. A 499 is the client giving up, which almost always means a slow
  read. Note the requests that took more than 5 s.
- **Drop deploy windows:** list the deploys and discard 502/503 within about 5 min after each one.
  In the first real run, 95% of the 5xx were restarts.
- **Big log answers:** group with `jq` (status + path with numbers replaced by `#`, then count)
  instead of reading raw lines.
- **Deliberate 500/503:** webhooks that answer 500/503 on purpose so the platform retries are
  still a bug signal. The usual cause is a write lock or a slow queue.
- Group application errors by message, with numbers and ids replaced by `#`.
- For "slow for one tenant only", measure the same read for two tenants in a read-only mode.
  Queueing behind a heavy tenant looks exactly like a slow query.

## Step 3: Triage and score

Dedupe by root cause: the same slow endpoint seen on 5 pages is 1 bug.

| Severity | When |
|---|---|
| critical | wrong money/stock/order data, data leaking between tenants, main page unusable for someone, anything that could cause a wrong write |
| high | page or tab that does not load or hides data it should show; recurring 5xx; webhook rejected repeatedly |
| medium | slow (more than 5 s) with a loader, broken only on mobile, console error with no visible effect, occasional 499 |
| low | emoji or glyph icons, unlabeled control, copy or alignment |

The health score follows gstack's rubric, adapted:

- Each category starts at 100.
- Deduct per finding: critical −25, high −15, medium −8, low −3.
- Console: 0 errors scores 100, 1 to 3 scores 70, 4 to 10 scores 40, 11 or more scores 10.
- Weights: functional 25%, data 20%, server 15%, console 15%, performance 10%, visual 10%,
  content 5%.
- Untested categories are left out and the score is marked partial.

**Automatic report:** put server findings in
`window.__servidor = [{id, tipo, rota, severidade, n}]` and paste `scripts/report.js`. It dedupes by
root cause, computes the score and returns the markdown and the baseline.

Write `qa/YYYYMMDD-HHMM/report.md` with the score, the top 3, the bug table and what was not
covered. Also write `qa/YYYYMMDD-HHMM/baseline.json`, so the next run reports what was fixed,
what is new and the change in score.

## Step 4: Fix loop

Order: critical, then high, then medium. Low bugs go in one batch at the end.

1. **Reproduce** with the same probe. If it does not reproduce, mark it "intermittent" and do not
   fix it.
2. **Diagnose** to file and line in the code. Never guess from the screen.
3. **Regression test first.** Write a test that fails because of the bug, next to the existing
   tests. First answer: why didn't the current tests catch it?
4. **Make the minimal fix**, with no refactors on the side.
5. **Test** the new test, its neighbours and the touched suite.
6. **Open a PR** from a `qa/<short-id>` branch with the bug, the evidence and the root cause.
7. **Ship** through the normal gate. Rerun a flaky failure once; do not override a real one.
8. **Verify live.** After deploy, do a real reload, not just a hash change. Rerun the same probe
   and, on the server, the same log query. Only then is the bug "fixed".

**Brakes:** stop and assess every 5 fixes. Stop at once after 2 reverted fixes, or if a fix needs
a file unrelated to the bug. The cap is 15 fixes per run. If only low bugs remain, stop and
report.

## Step 5: Report to the owner

A few lines in plain language:

- the score before and after;
- how many bugs were found, fixed and verified live;
- how many were deferred, and why;
- what was not covered.
