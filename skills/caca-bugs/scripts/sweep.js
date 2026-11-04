// caca-bugs: read-only in-page sweep for single-page web apps.
// Paste this whole file into the browser tool of your agent, in a tab where the app is open and
// signed in. It starts in the background and returns at once; read progress/results with status.js.
//
// SAFETY: while it runs, every fetch / XHR / sendBeacon that is not GET or HEAD is BLOCKED, so the
// sweep can read real data without changing anything. Reports carry only routes, terms, counts,
// HTTP statuses and timings: never page text, user data, cookies or tokens.
//
// Options (set window.__varreduraOpcoes before pasting):
//   rotas:     ['#/orders', '#/stock'] or [{ id, ir: () => router.push('/x') }]  (default: discover
//              same-origin links inside nav/aside/header/[role=navigation])
//   so / pular: only / skip these route ids
//   esperaMax: ms to wait for a page to settle (30000)   quieto: ms of network silence (1500)
//   abas:      click visible tabs on each page (true)    maxAbas: per page (6)
//   continuas: regex of long-lived requests that never finish (SSE, live polling)
//   termos:    extra [id, RegExp, severity] text checks for your app
if (window.__varreduraRodando) { 'já existe uma varredura rodando: ' + window.__varreduraProgresso; } else {
window.__varreduraRodando = true; window.__varredura = null;
window.__varreduraPromessa = (async () => {
  const opts = Object.assign({ esperaMax: 30000, quieto: 1500, abas: true, maxAbas: 6, continuas: /\/events\b|\/live\b|stream|sse/i }, window.__varreduraOpcoes || {});
  // ---------- routes ----------
  function descobre() {
    const vistos = new Set(), lista = [];
    for (const a of document.querySelectorAll('nav a[href], aside a[href], header a[href], [role="navigation"] a[href]')) {
      let u; try { u = new URL(a.getAttribute('href'), location.href); } catch { continue; }
      if (u.origin !== location.origin || /logout|sign-?out|sair|delete|excluir|remove/i.test(u.href)) continue;
      const id = u.hash || u.pathname; if (!id || id === '#' || vistos.has(id)) continue;
      vistos.add(id); lista.push({ id, title: (a.innerText || a.getAttribute('aria-label') || id).trim().slice(0, 60) });
    }
    return lista;
  }
  const bruto = (opts.rotas || descobre()).map(r => typeof r === 'string' ? { id: r, title: r } : r);
  if (!bruto.length) return JSON.stringify({ erro: 'no routes found: pass window.__varreduraOpcoes.rotas' });
  function navega(r) {
    if (typeof r.ir === 'function') return r.ir();
    const link = [...document.querySelectorAll('a[href]')].find(a => a.getAttribute('href') === r.id || a.hash === r.id);
    if (link) return link.click();                       // let the app's router handle it
    if (r.id.startsWith('#')) { location.hash = r.id; return; }
    history.pushState({}, '', r.id); dispatchEvent(new PopStateEvent('popstate'));
  }
  const hashOriginal = location.hash;
  const modelo = document.title.slice(0, 60);
  const largura = innerWidth;
  const paginas = bruto.filter(p => (!opts.so || opts.so.includes(p.id)) && !(opts.pular || []).includes(p.id));

  // ---------- guarda de escrita + coleta de rede/console ----------
  const rede = []; const erros = []; let pendentes = 0; let ultimoMovimento = performance.now();
  const marca = () => { ultimoMovimento = performance.now(); };
  const so = m => String(m || 'GET').toUpperCase();
  const fOrig = window.fetch, xOpen = XMLHttpRequest.prototype.open, xSend = XMLHttpRequest.prototype.send, beacon = navigator.sendBeacon;
  const caminho = u => { try { const x = new URL(String(u), location.href); return x.origin === location.origin ? x.pathname : x.host; } catch { return String(u).slice(0, 80); } };
  window.fetch = function (input, init = {}) {
    const metodo = so(init.method || input?.method); const url = caminho(input?.url || input);
    if (!['GET', 'HEAD'].includes(metodo)) { rede.push({ url, metodo, bloqueado: true }); return Promise.reject(new Error('varredura: escrita bloqueada')); }
    const continua = opts.continuas.test(url); // conexões ao vivo nunca terminam: não seguram a espera
    const t0 = performance.now(); if (!continua) pendentes++; marca();
    return fOrig.apply(this, arguments).then(r => { rede.push({ url, metodo, status: r.status, ms: Math.round(performance.now() - t0), continua }); return r; },
      e => { rede.push({ url, metodo, falha: String(e?.name || e).slice(0, 40), ms: Math.round(performance.now() - t0), continua }); throw e; })
      .finally(() => { if (!continua) pendentes--; marca(); });
  };
  XMLHttpRequest.prototype.open = function (metodo, url) { this.__v = { metodo: so(metodo), url: caminho(url) }; return xOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    const v = this.__v || {}; if (!['GET', 'HEAD'].includes(v.metodo)) { rede.push({ ...v, bloqueado: true }); this.abort(); return; }
    const t0 = performance.now(); pendentes++; marca();
    this.addEventListener('loadend', () => { rede.push({ ...v, status: this.status, ms: Math.round(performance.now() - t0) }); pendentes--; marca(); });
    return xSend.apply(this, arguments);
  };
  navigator.sendBeacon = () => { rede.push({ url: 'sendBeacon', bloqueado: true }); return false; };
  const cErr = console.error;
  console.error = function (...a) { const m = a.map(x => x?.message || String(x)).join(' '); if (!/varredura: escrita bloqueada/.test(m)) erros.push(m.slice(0, 200)); return cErr.apply(console, a); };
  const onErr = e => erros.push(('uncaught: ' + (e.message || '')).slice(0, 200));
  const onRej = e => { const m = String(e.reason?.message || e.reason || ''); if (!/varredura: escrita bloqueada/.test(m)) erros.push(('promise: ' + m).slice(0, 200)); };
  addEventListener('error', onErr); addEventListener('unhandledrejection', onRej);

  const dorme = ms => new Promise(r => setTimeout(r, ms));
  async function assenta() { // espera a rede ficar quieta ou estourar o tempo
    const t0 = performance.now(); await dorme(300);
    while (performance.now() - t0 < opts.esperaMax) {
      if (pendentes === 0 && performance.now() - ultimoMovimento > opts.quieto) return Math.round(performance.now() - t0);
      await dorme(200);
    }
    return -1; // estourou
  }

  // ---------- leitura da tela ----------
  const visivel = el => !!(el && el.offsetParent !== null && el.getClientRects().length);
  function areaAtiva() {
    const cands = [...document.querySelectorAll('main, [role="main"], section[id^="page-"], .page.active')].filter(visivel);
    return cands.sort((a, b) => b.innerText.length - a.innerText.length)[0] || document.body;
  }
  const TERMOS = [...(opts.termos || []),
    ['dados_indisponiveis', /dados indispon[ií]veis|indispon[ií]vel no momento|data unavailable|no data available/i, 'alta'],
    ['erro_na_tela', /\b(erro ao|falha ao|não foi possível carregar|something went wrong|internal server error|failed to load)/i, 'alta'],
    ['valor_quebrado', /\b(undefined|NaN|null|\[object Object\]|Infinity)\b|R\$\s*NaN/, 'alta'],
    ['carregando_preso', /(carregando|aguarde\.\.\.|consultando|loading\.\.\.|please wait)/i, 'media'],
    ['emoji', /(?![↗✓✕⋮›⋯●])\p{Extended_Pictographic}/u, 'baixa'],
    ['simbolo_texto', /[✓●⋮›↗⋯✕]/, 'baixa'],
  ];
  function inspeciona(p) {
    const area = areaAtiva(); const texto = area.innerText || '';
    const achados = [];
    for (const [id, re, sev] of TERMOS) { const m = texto.match(re); if (m) achados.push({ tipo: id, severidade: sev, termo: m[0].slice(0, 40) }); }
    const imgs = [...area.querySelectorAll('img')].filter(i => visivel(i) && i.complete && i.naturalWidth === 0).length;
    if (imgs) achados.push({ tipo: 'imagem_quebrada', severidade: 'baixa', termo: imgs + ' imagem(ns)' });
    if (document.documentElement.scrollWidth > innerWidth + 2) achados.push({ tipo: 'rolagem_horizontal', severidade: largura < 768 ? 'media' : 'baixa', termo: document.documentElement.scrollWidth + 'px > ' + innerWidth + 'px' });
    if (texto.trim().length < 40) achados.push({ tipo: 'pagina_vazia', severidade: 'alta', termo: texto.trim().slice(0, 40) });
    const semRotulo = [...area.querySelectorAll('button, a[href], [role="button"]')].filter(b => visivel(b) && !(b.innerText || b.getAttribute('aria-label') || b.title || '').trim()).length;
    if (semRotulo) achados.push({ tipo: 'botao_sem_rotulo', severidade: 'baixa', termo: semRotulo + ' controle(s)' });
    return { achados, tamanhoTexto: texto.length, titulo: (area.querySelector('h1,h2')?.innerText || p.title || '').slice(0, 60) };
  }
  async function clicaAbas() {
    if (!opts.abas) return [];
    const area = areaAtiva();
    const abas = [...area.querySelectorAll('[role="tab"], [data-tab], .tab, .tabs button')].filter(visivel).slice(0, opts.maxAbas);
    const res = [];
    for (const a of abas) {
      const nome = (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 30); const antes = erros.length;
      try { a.click(); } catch { continue; }
      const ms = await assenta(); const r = inspeciona({ title: nome });
      res.push({ aba: nome, ms, achados: r.achados, errosConsole: erros.slice(antes) });
    }
    return res;
  }

  // ---------- percurso ----------
  const resultado = { quando: new Date().toISOString(), modelo, largura, paginas: [] };
  let n = 0;
  try {
  for (const p of paginas) {
    window.__varreduraProgresso = `${++n}/${paginas.length} ${p.id}`;
    const iRede = rede.length, iErr = erros.length; const t0 = performance.now();
    try { navega(p); } catch (e) { resultado.paginas.push({ id: p.id, erroNavegar: String(e.message).slice(0, 120) }); continue; }
    const ms = await assenta();
    const tela = inspeciona(p);
    const abas = await clicaAbas();
    const req = rede.slice(iRede);
    resultado.paginas.push({
      id: p.id, titulo: tela.titulo, hash: (location.hash || location.pathname).slice(0, 80),
      msAteAssentar: ms, estourou: ms === -1, msTotal: Math.round(performance.now() - t0),
      achados: tela.achados, abas,
      errosConsole: erros.slice(iErr),
      // AbortError = o próprio painel cancelou ao trocar de tela: não é defeito
      redeFalhas: req.filter(r => (r.falha && r.falha !== 'AbortError') || r.status >= 400).map(r => `${r.metodo} ${r.url} ${r.status || r.falha} ${r.ms}ms`),
      redeLentas: req.filter(r => r.ms > 5000 && !r.continua && !r.falha && !(r.status >= 400)).map(r => `${r.metodo} ${r.url} ${r.ms}ms`),
      escritasBloqueadas: req.filter(r => r.bloqueado).map(r => `${r.metodo} ${r.url}`),
      requisicoes: req.length,
    });
  }
  } finally { // ---------- restaura SEMPRE, mesmo se algo falhar no meio ----------
    window.fetch = fOrig; XMLHttpRequest.prototype.open = xOpen; XMLHttpRequest.prototype.send = xSend; navigator.sendBeacon = beacon;
    console.error = cErr; removeEventListener('error', onErr); removeEventListener('unhandledrejection', onRej);
    try { location.hash = hashOriginal; } catch {}
  }

  const comProblema = resultado.paginas.filter(p => p.estourou || p.achados?.length || p.errosConsole?.length || p.redeFalhas?.length || p.redeLentas?.length || p.abas?.some(a => a.achados.length || a.errosConsole.length));
  resultado.resumo = { paginas: resultado.paginas.length, comProblema: comProblema.length, estouraram: resultado.paginas.filter(p => p.estourou).length };
  window.__varredura = resultado; window.__varreduraRodando = false; window.__varreduraProgresso = 'pronta';
  return JSON.stringify({ resumo: resultado.resumo, modelo, largura, problemas: comProblema.map(p => ({ id: p.id, ms: p.msAteAssentar, achados: (p.achados || []).map(a => a.tipo + ':' + a.termo), console: (p.errosConsole || []).slice(0, 3), rede: (p.redeFalhas || []).slice(0, 3), lentas: (p.redeLentas || []).slice(0, 2), abas: (p.abas || []).filter(a => a.achados.length || a.errosConsole.length).map(a => a.aba + '=' + a.achados.map(x => x.tipo).join('/')) })) });
})().catch(e => { window.__varreduraRodando = false; window.__varreduraProgresso = 'falhou: ' + e.message; });
'varredura iniciada em segundo plano';
}
