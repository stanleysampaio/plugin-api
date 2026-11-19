// E2E do TerraTripper rodando de verdade dentro do TerraPlanner (Vite :5173 + plugin-api :4000).
// Requer: plugin-api em :4000 e TerraPlanner (vite) em :5173.
const path = require('path');
const TERRAPLANNER = process.env.TERRAPLANNER_DIR || path.resolve(__dirname, '../../../terraplanner');
const { chromium } = require(path.join(TERRAPLANNER, 'node_modules/playwright'));
const OUT = process.env.E2E_OUT || path.join(__dirname, 'screenshots');
require('fs').mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH; // opcional: binário do Chromium se o do Playwright não estiver instalado

const LZ = require('fs').readFileSync(path.join(TERRAPLANNER, 'node_modules/lz-string/libs/lz-string.min.js'), 'utf8');
const lerStorage = (page, key) => page.evaluate((k) => {
  const raw = localStorage.getItem(k);
  return raw ? JSON.parse(window.LZString.decompressFromUTF16(raw)) : [];
}, key);
const brl = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
let failures = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`);
  if (!cond) failures++;
};
const step = (s) => console.log(`\n== ${s}`);

// Pontos reais (geocodificados pelo ORS através do PluginMapInput do host)
const PONTOS = [
  { rotulo: 'Origem',   busca: 'Praça Tiradentes, Ouro Preto', custo: 200 },
  { rotulo: 'Parada 1', busca: 'Museu da Inconfidência',       custo: 40,  categoria: 'cultura' },
  { rotulo: 'Parada 2', busca: 'Cachoeira das Andorinhas Ouro Preto', custo: 0,   categoria: 'natureza' },
  { rotulo: 'Parada 3', busca: 'Mina da Passagem',             custo: 100, categoria: 'aventura' },
  { rotulo: 'Parada 4', busca: 'Lavras Novas',                 custo: 120, categoria: 'gastronomia' },
  { rotulo: 'Destino',  busca: 'Mariana, MG',                  custo: 150 },
];

let browser;
(async () => {
  browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  setTimeout(() => { console.error('TIMEOUT GLOBAL'); browser.close(); process.exit(3); }, 8 * 60 * 1000).unref();
  const page = await browser.newPage({ viewport: { width: 1700, height: 1050 }, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
  const pageErrors = [];
  const pluginErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || /TerraTripper|Falha|Erro/.test(t)) pluginErrors.push(`[${m.type()}] ${t}`);
  });
  page.on('response', (r) => {
    if (r.url().includes(':4000/') && r.status() >= 400) pluginErrors.push(`[plugin-api ${r.status()}] ${r.url()}`);
  });

  step('Abrir TerraPlanner e carregar o plugin');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => { localStorage.removeItem('@terraplanner:directions'); localStorage.removeItem('@terraplanner:isochrones'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.addScriptTag({ content: LZ });
  await page.getByTestId('button-controlhud').click();
  await page.getByTestId('TerraTripper').locator('button').click();
  await page.getByText('Planejador de Roteiro de Viagem').waitFor({ timeout: 30000 });
  check('plugin carregado via React.lazy (main.js transpilado)', true);

  step('Preencher formulário');
  const dates = page.locator('form input[type="date"]');
  await dates.nth(0).fill('2026-02-05');
  await dates.nth(1).fill('2026-02-07');
  await page.getByPlaceholder('Interesses (ex: natureza, cultura, gastronomia)').fill('cultura, natureza');
  await page.getByPlaceholder('Orçamento total (R$) — opcional').fill('150');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+ Adicionar parada' }).click();

  for (const p of PONTOS) {
    const card = page.locator('form div.border.p-2.rounded').filter({ has: page.locator(`span:text-is("${p.rotulo}")`) });
    const input = card.locator('input[id^="input-field-point-"]');
    const resp = page.waitForResponse((r) => r.url().includes('/search') && r.status() === 200, { timeout: 30000 });
    await input.fill(p.busca);
    await resp;
    await card.getByTestId('suggestions-test').first().waitFor({ timeout: 10000 });
    const mg = card.getByTestId('suggestions-test').filter({ hasText: ', MG' });
    await ((await mg.count()) ? mg.first() : card.getByTestId('suggestions-test').first()).click();
    const custo = card.locator('input[placeholder="Diária (R$)"], input[placeholder="Ingresso (R$)"]');
    await custo.fill(String(p.custo));
    if (p.categoria) await card.locator('select').nth(1).selectOption(p.categoria);
    p.label = await input.inputValue();
    console.log(`   ${p.rotulo}: "${p.label}" custo=${p.custo}${p.categoria ? ' cat=' + p.categoria : ''}`);
  }
  await page.screenshot({ path: `${OUT}/02-form.png` });

  step('Gerar roteiro');
  await page.getByRole('button', { name: 'Gerar Roteiro' }).click();
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('div')].find((d) => d.textContent?.startsWith('Total de rotas geradas:'));
    return el && Number(el.querySelector('strong')?.textContent) > 0 && Array.isArray(window.TT_VIAGENS) && window.TT_VIAGENS.length > 0;
  }, null, { timeout: 120000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const totalRotas = await page.locator('div:text-matches("^Total de rotas geradas") strong').innerText();
  check('rotas calculadas pela API de rotas do host', Number(totalRotas) > 0, totalRotas);
  await page.screenshot({ path: `${OUT}/03-roteiro.png` });
  const linha = async (rotulo) => page.locator(`span:text-is("${rotulo}") + span`).innerText();
  check('resumo: data de ida 05/02/2026 (sem desvio de fuso)', (await linha('Data de ida:')) === '05/02/2026', await linha('Data de ida:'));
  check('resumo: data de volta 07/02/2026', (await linha('Data de volta:')) === '07/02/2026', await linha('Data de volta:'));
  check('resumo: duração 3 dia(s) pelas datas', (await linha('Duração planejada:')) === '3 dia(s)', await linha('Duração planejada:'));
  const lavrasItem = page.locator('li', { hasText: 'Lavras Novas' });
  check('itinerário: Lavras Novas marcada "fora do roteiro"', (await lavrasItem.innerText()).includes('fora do roteiro'));
  check('itinerário: Museu não marcado', !(await page.locator('li', { hasText: 'Museu da Inconfidência' }).innerText()).includes('fora do roteiro'));

  step('Quadro de planejamento');
  await page.getByRole('button', { name: 'Abrir Quadro de Planejamento' }).click();
  await page.getByText('Dica:').waitFor();
  // o quadro usa "name, city, uf"; o input omite o name quando name === city
  const custoPorLabel = {};
  for (const p of PONTOS) {
    const label = p.label.replace(/undefined, /g, ''); // MapInput exibe "undefined" quando falta a cidade
    custoPorLabel[label] = p.custo;
    const partes = label.split(', ');
    if (partes.length === 2) custoPorLabel[`${partes[0]}, ${partes[0]}, ${partes[1]}`] = p.custo;
  }
  // valor esperado lido do que o quadro EXIBE: ingressos dos cards 📍 + base do 🏁 Término de cada noite
  const esperadoDoQuadro = async () => {
    const cols = await page.$$eval('div.rounded-lg.border.border-gray-300', (els) => els.map((c) => ({
      pois: [...c.querySelectorAll('span')].map((s) => s.textContent).filter((t) => t.startsWith('📍 ')).map((t) => t.slice(3)),
      termino: ([...c.querySelectorAll('span')].map((s) => s.textContent).find((t) => t.startsWith('🏁 Término — ')) || '').slice('🏁 Término — '.length),
    })));
    const ingressos = cols.flatMap((c) => c.pois).reduce((a, l) => a + (custoPorLabel[l] ?? NaN), 0);
    const noites = cols.slice(0, -1).reduce((a, c) => a + (custoPorLabel[c.termino] ?? NaN), 0);
    return { total: ingressos + noites, ingressos, noites, terminos: cols.map((c) => c.termino) };
  };
  const esp1 = await esperadoDoQuadro();
  const custoTxt = await page.locator('span:text-is("Custo estimado:") + span').innerText();
  check(`resumo: custo = ingressos ${esp1.ingressos} + diárias ${esp1.noites} (noites em ${esp1.terminos.slice(0, -1).join(' / ')})`,
    !Number.isNaN(esp1.total) && custoTxt.includes(brl(esp1.total)) && custoTxt.includes('150,00'), custoTxt);
  check('resumo: alerta de orçamento excedido pelas diárias', await page.getByText('Orçamento excedido pelas diárias').isVisible());
  const cardsPoi = await page.locator('span', { hasText: /^📍 / }).allInnerTexts();
  console.log('   POIs no quadro:', cardsPoi);
  const tem = (s) => cardsPoi.some((t) => t.includes(s));
  check('quadro contém Museu, Cachoeira e Mina', tem('Museu') && tem('Cachoeira') && tem('Passagem'));
  check('Lavras Novas (gastronomia, R$120) ficou de fora pelo orçamento', !tem('Lavras'));
  const dias = await page.evaluate(() => window.TT_VIAGENS.map((v) => ({ day: v.day, legs: v.legs.length, km: v.total_km })));
  check('3 colunas de dia com trechos coloridos', dias.length === 3, dias);
  await page.screenshot({ path: `${OUT}/04-quadro.png` });

  step('Interação: remover a Mina do dia => recálculo de rotas e custo');
  const sigAntes = await page.evaluate(() => JSON.stringify(window.TT_VIAGENS.map((v) => v.legs.map((l) => l.to))));
  const minaCard = page.locator('div.rounded-lg.shadow').filter({ has: page.locator('span', { hasText: 'Passagem' }) });
  await minaCard.locator('button[title="Remover do dia"]').click();
  await page.waitForFunction((s) => JSON.stringify(window.TT_VIAGENS.map((v) => v.legs.map((l) => l.to))) !== s, sigAntes, { timeout: 60000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  check('rotas recalculadas após remover o card', true);
  check('Mina voltou para "Pontos de interesse" na lateral', await page.locator('aside div', { hasText: /^📍 .*Passagem/ }).count() > 0);
  const custo2 = await page.locator('span:text-is("Custo estimado:") + span').innerText();
  const esp2 = await esperadoDoQuadro();
  check(`custo após edição = ${brl(esp2.total)} (antes ${brl(esp1.total)}, sem os R$100 da Mina)`,
    custo2.includes(brl(esp2.total)) && esp1.total - esp2.total === 100, custo2);

  step('Alcances, raios e salvar em Rotas');
  await page.getByRole('button', { name: 'Desenhar alcances das bases' }).click();
  await page.getByRole('button', { name: 'Desenhar alcances das bases' }).waitFor({ timeout: 120000 });
  await page.waitForLoadState('networkidle');
  const isos = (await lerStorage(page, '@terraplanner:isochrones')).length;
  check('alcances (useRange): 1 por hotel distinto (2), sem duplicar por dia', isos === 2, isos);
  check('sem erro de alcance', !(await page.getByText('Falha ao gerar isócronas').isVisible()));

  await page.getByRole('button', { name: 'Desenhar raios das bases' }).click();
  await page.getByRole('button', { name: 'Desenhar raios das bases' }).waitFor({ timeout: 30000 });
  check('sem erro de raio (useRadius)', !(await page.getByText('Falha ao desenhar raios').isVisible()));
  // antes a chamada não passava `radius`/`quantity` e não desenhava nada, sem erro: agora o
  // adaptador valida a entrada, então esta mensagem só aparece se os círculos foram criados
  check('raios desenhados nas 2 bases distintas', await page.getByText('Raio de 10 km desenhado em 2 base(s).').isVisible());
  const circulos = await page.evaluate(() => window.TerraPlannerMap.getAllLayers()
    .flatMap((l) => l.getSource?.()?.getFeatures?.() ?? [])
    .filter((f) => String(f.getId()).startsWith('radius-tt-')).length);
  check('mapa tem exatamente 2 círculos do TerraTripper (contagem real no OpenLayers)', circulos === 2, circulos);

  await page.getByRole('button', { name: 'Salvar itinerário em Rotas' }).click();
  await page.getByText('Itinerário salvo em "Rotas" com sucesso.').waitFor({ timeout: 60000 });
  const salvasArr = await lerStorage(page, '@terraplanner:directions');
  const salvas = salvasArr.length;

  check('itinerário salvo em @terraplanner:directions', salvas > 0, salvas);
  await page.screenshot({ path: `${OUT}/05-alcances-salvo.png` });

  step('Tela Rotas do host mostra o itinerário salvo');
  await page.getByRole('button', { name: 'Fechar Quadro' }).click();
  await page.locator('main button').first().click(); // GoBackButton do plugin
  await page.getByTestId('button-menu-routes').locator('button').click();
  await page.getByText('Pilha de rotas').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/06-rotas.png` });
  const rotasTxt = await page.locator('aside.w-96').innerText();
  const props = (d) => (d?.props ?? d?.geojson ?? d)?.properties;
  const nomes = salvasArr.map((d) => props(d)?.query?.destination?.name).filter(Boolean);
  console.log('   destinos salvos:', nomes);
  const visiveis = nomes.filter((n) => rotasTxt.includes(n));
  check('pilha de Rotas lista os trechos salvos pelo plugin', visiveis.length > 0, { salvos: nomes.length, visiveis: visiveis.length });

  step('Erros');
  console.log('   pageerrors:', pageErrors);
  console.log('   console/plugin-api:', pluginErrors.filter((e) => !e.includes('403') && !e.includes('404')).slice(0, 15));
  check('nenhuma exceção não tratada na página', pageErrors.filter((e) => e !== 'AxiosError').length === 0, pageErrors);

  console.log(failures ? `\n${failures} falha(s)` : '\nE2E: todos os passos passaram');
  await browser.close();
  process.exitCode = failures ? 1 : 0;
})().catch(async (e) => { console.error('ABORTOU:', e.message); process.exitCode = 2; await browser?.close(); });
