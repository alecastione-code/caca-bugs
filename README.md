# caca-bugs

**A skill that hunts bugs in your live app and fixes them, without being able to break anything
while it looks.**

Created by [@alecastione-code](https://github.com/alecastione-code) with Claude (Anthropic),
from running a real multi-store e-commerce panel in production.

## What it does

1. **Sweeps the live app, signed in and read-only.** It runs inside your agent's browser tab, on
   every page and tab. While it runs, any request that is not GET or HEAD is blocked, so it reads
   real data and cannot change it.
2. **Reads the server too.** It cross-checks the screen with the host logs: webhooks answering 500,
   stuck queues, reads that time out for one tenant only. Screen-only QA never sees these.
3. **Scores and ranks.** It gives a health score per run, with severity from critical to low and
   duplicates removed by root cause. A baseline lets the next run show what got fixed and what is
   new.
4. **Fixes the safe way.** For each bug: reproduce, diagnose to the line, write a failing
   regression test, make the minimal fix, open a PR, pass CI, then verify on the live app. Brakes
   stop the loop when fixes start causing harm.
5. **Leaks nothing.** Reports carry routes, terms, counts, statuses and timings. They never carry
   customer data, cookies or tokens.

## Install

With the [skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add alecastione-code/caca-bugs
```

Or copy `skills/caca-bugs` to `~/.claude/skills/` (Claude Code) or `~/.agents/skills/` (Codex and
other agents).

Then ask your agent: "caça bugs", "find bugs in the app", or `/caca-bugs`.

## Requirements

- An agent with a browser tool that can run JavaScript in a page. Examples are Claude Code's
  browser, Claude in Chrome or Playwright MCP.
- A single-page web app. Hash routes and `pushState` routers both work. Routes are discovered from
  the app's navigation, or you can pass your own.
- Read access to your host's logs for the server sweep (Railway, Render, Fly, Vercel…).

## Credits

The method adapts ideas from the `/qa` skill of [gstack](https://github.com/garrytan/gstack) by
Garry Tan (MIT): the severity taxonomy, the health-score rubric, regression-test-before-fix and the
loop brakes. caca-bugs contains no gstack code. See [NOTICE](NOTICE).

## Português

**Uma skill que caça bugs no seu app em produção e conserta, sem conseguir quebrar nada enquanto
olha.**

- **Varre o app logado e só lendo.** Ela roda na aba do navegador do agente e bloqueia qualquer
  envio de dados durante a varredura.
- **Cruza a tela com os registros do servidor.** Assim acha erros que não aparecem na tela.
- **Dá nota de saúde.** Também separa os bugs por gravidade e compara cada rodada com a anterior.
- **Conserta pelo caminho seguro.** Para cada bug: teste que falha primeiro, menor correção, PR,
  CI e conferência no ar.

Criada por [@alecastione-code](https://github.com/alecastione-code) com o Claude (Anthropic).
Licença MIT.
