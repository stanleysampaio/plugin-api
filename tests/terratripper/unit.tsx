// Harness de teste do TerraTripper (fora do navegador).
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';


let failures = 0;
function check(name: string, cond: boolean, extra?: any) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`);
  if (!cond) failures++;
}

async function main() {
  // Ambiente do host simulado: sem fetchDirectionsController => fallback de agrupamento
  (globalThis as any).window = {
    PluginDependencies: {
      React,
      PluginMapInput: (p: any) => React.createElement('input', { 'data-map-input': p.id }),
      usePin: () => ({ updatePin() {} }),
      pinService: {},
    },
    innerHeight: 800,
  };
  (globalThis as any).React = React;

  const { generateInitialBoard } = await import('../../added-plugins/TerraTripper/components/generateInitialBoard.tsx');
  const { convertToDiaRoteiro } = await import('../../added-plugins/TerraTripper/components/convertToDiaRoteiro.tsx');
  const { RoteiroResumo } = await import('../../added-plugins/TerraTripper/components/RoteiroResumo.tsx');
  const { RoteiroForm } = await import('../../added-plugins/TerraTripper/components/RoteiroForm.tsx');

  const hotelOP = { uid: 'b1', label: 'Hotel Ouro Preto', tipo: 'base', coordinates: [-43.50, -20.38], custo: 200 };
  const hotelMar = { uid: 'b2', label: 'Pousada Mariana', tipo: 'base', coordinates: [-43.41, -20.37], custo: 150 };
  const cachoeira = { uid: 'p1', label: 'Cachoeira das Andorinhas', tipo: 'interesse', tempo: 120, coordinates: [-43.49, -20.36], custo: 0, categoria: 'natureza' };
  const museu = { uid: 'p2', label: 'Museu da Inconfidência', tipo: 'interesse', tempo: 90, coordinates: [-43.50, -20.385], custo: 40, categoria: 'cultura' };
  const restaurante = { uid: 'p3', label: 'Restaurante Chafariz', tipo: 'interesse', tempo: 60, coordinates: [-43.505, -20.383], custo: 120, categoria: 'gastronomia' };
  const mina = { uid: 'p4', label: 'Mina da Passagem', tipo: 'interesse', tempo: 90, coordinates: [-43.44, -20.37], custo: 100, categoria: 'aventura' };

  const base = {
    dataIda: '2026-02-05', dataVolta: '2026-02-07', tempo: 3,
    pontos: [hotelOP, cachoeira, museu, restaurante, mina, hotelMar],
  };

  const poiLabels = (board: any[]) =>
    board.flatMap((d) => d.pontos.filter((p: any) => p.tipo === 'interesse').map((p: any) => p.label));

  // 1) Sem orçamento e sem interesses: comportamento original preservado (todos os POIs)
  {
    const b = convertToDiaRoteiro(await generateInitialBoard({ ...base, interesses: '' }), base.pontos);
    const labels = poiLabels(b);
    check('sem orçamento: todos os 4 POIs entram', labels.length === 4, labels);
    check('3 dias gerados (05 a 07/02)', b.length === 3, b.map((d: any) => d.data));
    check('custo/categoria sobrevivem ao convertToDiaRoteiro',
      b.flatMap((d: any) => d.pontos).some((p: any) => p.categoria === 'cultura' && p.custo === 40));
  }

  // 2) Orçamento 150 + interesse "cultura, natureza": cabem cachoeira(0) + museu(40) = 40;
  //    restaurante(120) estoura (160), mina(100) estoura (140) -> ficam de fora
  {
    const b = convertToDiaRoteiro(
      await generateInitialBoard({ ...base, interesses: 'cultura, natureza', orcamento: 150 }), base.pontos);
    const labels = poiLabels(b).sort();
    // cachoeira(0)+museu(40) priorizados; restaurante estoura (160) e é pulado; mina ainda cabe (140)
    check('orçamento 150 + cultura/natureza: restaurante fica de fora, mina ainda cabe',
      JSON.stringify(labels) === JSON.stringify(['Cachoeira das Andorinhas', 'Mina da Passagem', 'Museu da Inconfidência']), labels);
  }

  // 3) Mesmo orçamento, interesse "gastronomia": restaurante (120) passa à frente do museu
  {
    const b = convertToDiaRoteiro(
      await generateInitialBoard({ ...base, interesses: 'gastronomia', orcamento: 150 }), base.pontos);
    const labels = poiLabels(b).sort();
    check('orçamento 150 + gastronomia: restaurante priorizado (cachoeira grátis também cabe)',
      JSON.stringify(labels) === JSON.stringify(['Cachoeira das Andorinhas', 'Restaurante Chafariz']), labels);
  }

  // 4) Orçamento 0 / inválido é ignorado
  {
    const b = convertToDiaRoteiro(await generateInitialBoard({ ...base, interesses: '', orcamento: 0 }), base.pontos);
    check('orçamento 0 é ignorado (todos os POIs)', poiLabels(b).length === 4);
  }

  // 5) Resumo: custo = ingressos (1x por POI) + 1 diária por noite (base onde o dia termina)
  const custoRenderizado = (roteiro: any, board: any) => {
    const html = renderToStaticMarkup(React.createElement(RoteiroResumo, { roteiro, directions: [], board }));
    const m = html.match(/Custo estimado:<\/span><span[^>]*>([^<]*)/);
    return { txt: m?.[1] ?? '', html };
  };
  const B = (o: any, data: string, sufixo: 'start' | 'end') => ({ ...o, id: `base-${sufixo}-${data}`, tipo: 'base' });
  const P = (o: any) => ({ ...o, id: `point-${o.uid}`, tipo: o.tipo });
  // Formato A (logo após gerar): ids "point-<uid>"
  const boardA = [
    { data: 'd1', pontos: [P(hotelOP), P(museu), P(hotelOP)] },
    { data: 'd2', pontos: [P(hotelOP), P(cachoeira), P(hotelMar)] },
    { data: 'd3', pontos: [P(hotelMar), P(hotelMar)] },
  ];
  // Formato B (após editar o quadro, via syncSleepBases): ids por dia, uid preservado
  const boardB = [
    { data: 'd1', pontos: [B(hotelOP, 'd1', 'start'), P(museu), B(hotelOP, 'd1', 'end')] },
    { data: 'd2', pontos: [B(hotelOP, 'd2', 'start'), P(cachoeira), B(hotelMar, 'd2', 'end')] },
    { data: 'd3', pontos: [B(hotelMar, 'd3', 'start'), B(hotelMar, 'd3', 'end')] },
  ];
  // esperado: ingressos 40 + 0; noites: d1 em OP (200), d2 em Mariana (150); d3 é retorno => 390
  {
    const r = { ...base, interesses: '', orcamento: 1000 };
    check('custo formato A (pós-geração) = R$ 390', custoRenderizado(r, boardA).txt.includes('390,00'), custoRenderizado(r, boardA).txt);
    check('custo formato B (pós-edição do quadro) = R$ 390 [regressão do bug do E2E]', custoRenderizado(r, boardB).txt.includes('390,00'), custoRenderizado(r, boardB).txt);
    check('dentro do orçamento: sem alerta', !custoRenderizado(r, boardB).html.includes('Orçamento excedido'));
  }
  {
    const r = { ...base, interesses: '', orcamento: 150 };
    const { txt, html } = custoRenderizado(r, boardB);
    check('orçamento 150: mostra R$ 390,00 / R$ 150,00 e alerta', txt.includes('390,00') && txt.includes('150,00') && html.includes('Orçamento excedido pelas diárias'), txt);
  }
  {
    // viagem de 1 dia: sem pernoite, só ingressos
    const r = { ...base, interesses: '' };
    const umDia = [{ data: 'd1', pontos: [P(hotelOP), P(museu), P(mina), P(hotelOP)] }];
    check('bate-volta de 1 dia: só ingressos (R$ 140)', custoRenderizado(r, umDia).txt.includes('140,00'), custoRenderizado(r, umDia).txt);
  }
  {
    // board real gerado: confere com cálculo independente (noites pelos rótulos)
    const roteiro = { ...base, interesses: 'cultura, natureza', orcamento: 150 };
    const b = convertToDiaRoteiro(await generateInitialBoard(roteiro), base.pontos);
    const custoPorLabel: Record<string, number> = Object.fromEntries(base.pontos.map((p: any) => [p.label, p.custo]));
    const ingressos = b.flatMap((d: any) => d.pontos).filter((p: any) => p.tipo === 'interesse').reduce((a: number, p: any) => a + custoPorLabel[p.label], 0);
    const noites = b.slice(0, -1).reduce((a: number, d: any) => a + custoPorLabel[[...d.pontos].reverse().find((p: any) => p.tipo === 'base').label], 0);
    const esperado = (ingressos + noites).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    check(`board gerado: custo = ${esperado}`, custoRenderizado(roteiro, b).txt.includes(esperado), custoRenderizado(roteiro, b).txt);
  }

  // 6) Formulário renderiza os campos novos
  {
    const html = renderToStaticMarkup(React.createElement(RoteiroForm, { onSubmit() {} }));
    check('form: campo de orçamento', html.includes('Orçamento total (R$)'));
    check('form: diária nas bases', (html.match(/Diária \(R\$\)/g) || []).length === 2);
    check('form: ingresso + categoria no ponto de interesse', html.includes('Ingresso (R$)') && html.includes('gastronomia'));
  }

  console.log(failures ? `\n${failures} falha(s)` : '\nTodos os testes passaram');
  process.exitCode = failures ? 1 : 0;
}

main();
