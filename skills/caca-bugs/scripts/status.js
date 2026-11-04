// caca-bugs: read sweep progress/results (paste into the browser tool).
(() => {
  const v = window.__varredura;
  if (!v) return 'andamento: ' + (window.__varreduraProgresso || 'nenhuma varredura iniciada');
  const enx = p => ({ id: p.id, ms: p.msAteAssentar, achados: (p.achados || []).map(a => a.severidade[0] + ':' + a.tipo + ':' + a.termo),
    console: (p.errosConsole || []).slice(0, 2), rede: (p.redeFalhas || []).slice(0, 3), lentas: (p.redeLentas || []).slice(0, 2),
    abas: (p.abas || []).filter(a => a.achados.length || a.errosConsole.length || a.ms === -1).map(a => a.aba + '=' + (a.ms === -1 ? 'estourou' : a.achados.map(x => x.tipo).join('/'))),
    bloqueadas: (p.escritasBloqueadas || []).length });
  const ruins = v.paginas.filter(p => p.estourou || p.achados?.length || p.errosConsole?.length || p.redeFalhas?.length || p.redeLentas?.length || p.abas?.some(a => a.achados.length || a.errosConsole.length || a.ms === -1));
  return JSON.stringify({ quando: v.quando, modelo: v.modelo, largura: v.largura, resumo: v.resumo, problemas: ruins.map(enx), ok: v.paginas.filter(p => !ruins.includes(p)).map(p => p.id + ':' + p.msAteAssentar) });
})()
