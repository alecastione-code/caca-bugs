// caca-bugs: turns the finished sweep (window.__varredura) into a report + baseline with a health
// score. Paste into the browser tool after status.js says it is done. Server findings from the
// log sweep can be added first:
//   window.__servidor = [{ id: 'S1', tipo: 'webhook_500', rota: '/api/x', severidade: 'alta', n: 26 }]
// Returns { markdown, baseline } as JSON; save them as report.md and baseline.json.
(() => {
  const v = window.__varredura;
  if (!v) return 'no finished sweep: run sweep.js and wait for status.js to finish';
  const SEV = { alta: 'high', media: 'medium', baixa: 'low', critica: 'critical' };
  const PESO = { critical: 25, high: 15, medium: 8, low: 3 };
  const CAT = { dados_indisponiveis: 'data', valor_quebrado: 'data', erro_na_tela: 'functional', pagina_vazia: 'functional',
    estourou: 'functional', carregando_preso: 'performance', lenta: 'performance', rede: 'server', servidor: 'server',
    emoji: 'visual', simbolo_texto: 'visual', imagem_quebrada: 'visual', rolagem_horizontal: 'visual', botao_sem_rotulo: 'content' };
  const PESOS = { functional: .25, data: .20, server: .15, console: .15, performance: .10, visual: .10, content: .05 };
  const bugs = new Map(); // dedupe by root-cause key
  const add = (chave, b) => { const x = bugs.get(chave); if (x) { x.paginas.add(b.pagina); return; } bugs.set(chave, { ...b, paginas: new Set([b.pagina]) }); };
  const rotaDe = s => (s.match(/\/api\/[^\s?]+/) || [s.split(' ')[1] || s])[0];
  // Lesson from the first real run (155 raw items, mostly repeats): one cause = one bug.
  // - findings on a page and on its tabs are the same bug (key by page, not by tab);
  // - "never settled" and "still loading" on the same page are one bug;
  // - unlabeled controls and text glyphs are one app-wide bug each (count pages);
  // - failed/slow requests are keyed by route across pages.
  const GLOBAL = new Set(['emoji', 'simbolo_texto', 'botao_sem_rotulo', 'imagem_quebrada']);
  const chave = (tipo, pagina) => GLOBAL.has(tipo) ? tipo + ':*' : (tipo === 'carregando_preso' ? 'estourou' : tipo) + ':' + pagina;
  for (const p of v.paginas) {
    const travou = p.estourou || (p.abas || []).some(t => t.ms === -1);
    if (travou) add(chave('estourou', p.id), { tipo: 'estourou', severidade: p.estourou ? 'high' : 'medium', pagina: p.id, evidencia: 'did not settle' + (p.maisChamadas ? ' · ' + p.maisChamadas.join(', ') : '') });
    const achados = [...(p.achados || []), ...(p.abas || []).flatMap(t => t.achados)];
    for (const a of achados) add(chave(a.tipo, p.id), { tipo: a.tipo === 'carregando_preso' ? 'estourou' : a.tipo, severidade: SEV[a.severidade] || 'low', pagina: p.id, evidencia: a.termo });
    for (const r of p.redeFalhas || []) add('rede:' + rotaDe(r), { tipo: 'rede', severidade: / 5\d\d /.test(r) ? 'high' : 'medium', pagina: p.id, evidencia: r });
    for (const r of p.redeLentas || []) add('lenta:' + rotaDe(r), { tipo: 'lenta', severidade: 'medium', pagina: p.id, evidencia: r });
  }
  if ((v.freios || []).length) add('freio', { tipo: 'servidor', severidade: 'medium', pagina: 'health endpoint', evidencia: `slow during the sweep ${v.freios.length}x: findings near it may be load, re-check them` });
  for (const s of window.__servidor || []) add('srv:' + s.id, { tipo: 'servidor', severidade: SEV[s.severidade] || s.severidade || 'medium', pagina: s.rota, evidencia: `${s.tipo} x${s.n || 1}` });
  const consoleUnicos = new Set(v.paginas.flatMap(p => [...(p.errosConsole || []), ...(p.abas || []).flatMap(a => a.errosConsole)]).map(m => m.replace(/\d+/g, '#').slice(0, 120)));
  const lista = [...bugs.values()].map((b, i) => ({ ...b, paginas: [...b.paginas] }))
    .sort((a, b) => PESO[b.severidade] - PESO[a.severidade] || b.paginas.length - a.paginas.length)
    .map((b, i) => ({ id: 'B' + String(i + 1).padStart(2, '0'), ...b }));
  const cat = {};
  for (const k of Object.keys(PESOS)) cat[k] = 100;
  for (const b of lista) { const c = CAT[b.tipo] || 'functional'; cat[c] = Math.max(0, cat[c] - PESO[b.severidade]); }
  const ce = consoleUnicos.size; cat.console = ce === 0 ? 100 : ce <= 3 ? 70 : ce <= 10 ? 40 : 10;
  if (!(window.__servidor || []).length) delete cat.server; // not tested → left out
  const somaPesos = Object.keys(cat).reduce((s, k) => s + PESOS[k], 0);
  const nota = Math.round(Object.entries(cat).reduce((s, [k, n]) => s + n * PESOS[k], 0) / somaPesos);
  const cont = s => lista.filter(b => b.severidade === s).length;
  const md = [
    `# caca-bugs report — ${v.quando.slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `**Health score: ${nota}/100**${cat.server === undefined ? ' (partial: server not swept)' : ''} · ${v.resumo.paginas} of ${v.resumo.de || v.resumo.paginas} pages · width ${v.largura}px${v.resumo.freada ? ' · STOPPED: ' + v.resumo.freada : ''}`,
    '',
    `Bugs: ${cont('critical')} critical, ${cont('high')} high, ${cont('medium')} medium, ${cont('low')} low · unique console errors: ${ce} · writes blocked during the sweep: ${v.resumo.escritasBloqueadas ?? '?'}`,
    '',
    '| Category | Score |', '|---|---|', ...Object.entries(cat).map(([k, n]) => `| ${k} | ${n} |`),
    '',
    '## Top 3', ...lista.slice(0, 3).map(b => `- **${b.id} ${b.severidade}** ${b.tipo} on ${b.paginas.slice(0, 3).join(', ')}${b.paginas.length > 3 ? ` (+${b.paginas.length - 3})` : ''}: ${b.evidencia}`),
    '',
    '## All bugs', '| id | severity | type | pages | evidence |', '|---|---|---|---|---|',
    ...lista.map(b => `| ${b.id} | ${b.severidade} | ${b.tipo} | ${b.paginas.length} | ${String(b.evidencia).replace(/\|/g, '/').slice(0, 90)} |`),
    '',
    '## Not covered', '- Other saved themes/models of the account, other viewports unless swept separately, admin-only pages without access, flows that need writes.',
  ].join('\n');
  const baseline = { quando: v.quando, largura: v.largura, nota, categorias: cat, bugs: lista.map(b => ({ id: b.id, chave: b.tipo + ':' + b.paginas[0], tipo: b.tipo, severidade: b.severidade, paginas: b.paginas.length })) };
  window.__relatorio = { markdown: md, baseline };
  return JSON.stringify({ nota, bugs: lista.length, markdown: md, baseline });
})()
