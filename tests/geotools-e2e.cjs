// E2E das ferramentas de geometria migradas para plugins (radius, linear-distance, draw-polygon).
// Requer: plugin-api em :4000 e TerraPlanner (vite) em :5173.
const path = require("path");
const TERRAPLANNER = process.env.TERRAPLANNER_DIR || path.resolve(__dirname, "../../terraplanner");
const { chromium } = require(path.join(TERRAPLANNER, "node_modules/playwright"));
const CHROME = process.env.CHROME_PATH;

let failures = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra !== undefined ? "  -> " + JSON.stringify(extra) : ""}`);
  if (!cond) failures++;
};

// Conta features reais nas camadas do OpenLayers (window.TerraPlannerMap)
const contarFeatures = (page) =>
  page.evaluate(() => {
    const out = { radius: 0, lines: 0, polygons: 0 };
    for (const layer of window.TerraPlannerMap.getAllLayers()) {
      const source = layer.getSource?.();
      if (!source?.getFeatures) continue;
      for (const f of source.getFeatures()) {
        const id = String(f.getId());
        const type = f.getGeometry()?.getType();
        if (id.startsWith("radius-")) out.radius++;
        else if (type === "LineString" && id.includes("-")) out.lines++;
        if (type === "Polygon" && f.getId() === undefined) out.polygons++;
      }
    }
    return out;
  });

async function escolherLocal(page, inputId, busca) {
  const input = page.locator(`#input-field-${inputId}`);
  const resp = page.waitForResponse((r) => r.url().includes("/search") && r.status() === 200, { timeout: 30000 });
  await input.fill(busca);
  await resp;
  const sugestoes = page.getByTestId("suggestions-test");
  await sugestoes.first().waitFor({ timeout: 10000 });
  const mg = sugestoes.filter({ hasText: ", MG" });
  await ((await mg.count()) ? mg.first() : sugestoes.first()).click();
}

async function abrirFerramenta(page, id) {
  const item = page.getByTestId(`button-${id}-geotool`);
  // o popover alterna a cada clique e continua aberto depois de escolher uma ferramenta
  if (!(await item.isVisible())) await page.getByTestId("button-menu-geotools").click();
  await item.click();
}

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    const falhas = [];
    page.on("response", (r) => { if (r.status() >= 400) falhas.push(`${r.status()} ${r.url().replace(/(api_key|key)=[^&]+/g, "$1=***").slice(0, 110)}`); });

    await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    const errosCarga = pageErrors.length; // AxiosError do próprio host (WMS 404)
    const falhasCarga = falhas.length;
    await page.getByTestId("button-controlhud").click();
    await page.getByTestId("TerraTripper").waitFor();
    for (const id of ["radius", "linear-distance", "draw-polygon"]) {
      check(`"${id}" não aparece na lista do menu (showInMenu: false)`, (await page.getByTestId(id).count()) === 0);
    }

    // regressão: o botão ficava dentro do <aside> com overflow e o clique caía no mapa
    const trig = await page.getByTestId("button-menu-geotools").boundingBox();
    const acerto = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-testid]")?.getAttribute("data-testid"), { x: trig.x + trig.width / 2, y: trig.y + trig.height / 2 });
    check("clique no centro do botão de ferramentas acerta o botão (não o mapa)", acerto === "button-menu-geotools", acerto);

    // ---------- Raio ----------
    await abrirFerramenta(page, "radius");
    await page.getByText("Calcular raios").waitFor({ timeout: 20000 });
    check("plugin radius carregado pelo botão flutuante", true);
    const antes = await contarFeatures(page);
    await escolherLocal(page, "radius", "Ouro Preto");
    await page.waitForTimeout(500);
    const um = await contarFeatures(page);
    check("selecionar local desenha 1 círculo", um.radius - antes.radius === 1, um);
    const thumbQtd = page.getByRole("slider").nth(1);
    await thumbQtd.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    const tres = await contarFeatures(page);
    check("slider 'Quantidade de raios' = 3 redesenha 3 círculos (sem acumular)", tres.radius - antes.radius === 3, tres);
    await page.locator("button", { hasText: "Calcular raios" }).click();

    // ---------- Distância linear ----------
    await abrirFerramenta(page, "linear-distance");
    await page.getByText("Distância Linear").waitFor({ timeout: 20000 });
    await escolherLocal(page, "origin", "Ouro Preto");
    await escolherLocal(page, "destination", "Mariana, MG");
    await page.waitForTimeout(500);
    const dist = await page.getByTestId("linear-distance-value").innerText();
    const km = Number(dist.replace(/[^\d.]/g, ""));
    check("distância linear Ouro Preto → Mariana entre 8 e 15 km", km > 8 && km < 15, dist);
    check("linha desenhada no mapa", (await contarFeatures(page)).lines >= 1);
    await page.locator("main button").first().click();

    // ---------- Polígono ----------
    await abrirFerramenta(page, "draw-polygon");
    await page.getByText("Desenhar Polígonos").waitFor({ timeout: 20000 });
    const base = (await contarFeatures(page)).polygons;
    await page.getByText("Adicionar novo desenho").click();
    const canvas = page.locator(".ol-viewport canvas").first();
    const box = await canvas.boundingBox();
    const px = (dx, dy) => ({ x: box.x + box.width * dx, y: box.y + box.height * dy });
    for (const [dx, dy] of [[0.6, 0.3], [0.8, 0.35], [0.75, 0.6]]) {
      const p = px(dx, dy);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(150);
    }
    const fim = px(0.75, 0.6);
    await page.mouse.dblclick(fim.x, fim.y);
    await page.waitForTimeout(400);
    check("polígono desenhado com o mouse (Draw do host via plugin)", (await contarFeatures(page)).polygons === base + 1);
    await page.getByText("Remover desenho").click();
    await page.waitForTimeout(300);
    check("removeDraw apaga o polígono", (await contarFeatures(page)).polygons === base);
    await page.locator("div > button").filter({ hasText: "Desenhar Polígonos" }).click();

    const falhasUso = falhas.slice(falhasCarga);
    console.log("   requisições com erro durante o uso:", falhasUso);
    // O único erro conhecido é o WMS do servidor-de-dados-geograficos.terraplanner.org (404),
    // pedido de novo pelo OpenLayers a cada movimento do mapa; não tem relação com os plugins.
    const WMS_CONHECIDO = /servidor-de-dados-geograficos\.terraplanner\.org\/draw/;
    const errosInesperados = pageErrors.slice(errosCarga).filter((e) => e !== "AxiosError");
    const falhasInesperadas = falhasUso.filter((f) => !WMS_CONHECIDO.test(f));
    check("nenhuma exceção/requisição com erro além do WMS 404 conhecido do host", !errosInesperados.length && !falhasInesperadas.length, { errosInesperados, falhasInesperadas });

    // ---------- Plugin API fora do ar: sem botões mortos ----------
    const page2 = await browser.newPage();
    await page2.route("**/api/plugins", (r) => r.fulfill({ status: 503, body: "fora do ar" }));
    await page2.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    await page2.getByTestId("button-controlhud").click();
    await page2.getByTestId("button-menu-routes").waitFor();
    check("sem Plugin API, o botão de ferramentas some (em vez de abrir o menu por engano)", (await page2.getByTestId("button-menu-geotools").count()) === 0);
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} falha(s)` : "\nFerramentas de geometria: todos os testes passaram");
  process.exitCode = failures ? 1 : 0;
})().catch((e) => {
  console.error("ABORTOU:", e.message);
  process.exitCode = 2;
});
