// Conformidade dos contratos: chama cada hook exposto em window.PluginDependencies dentro do
// host real e compara os métodos que ele devolve com os declarados em __meta.methods.
// Também imprime a superfície real (base da Referência Técnica de APIs).
// Requer: plugin-api em :4000 e TerraPlanner (vite) em :5173.
const fs = require("fs");
const path = require("path");
const TERRAPLANNER = process.env.TERRAPLANNER_DIR || path.resolve(__dirname, "../../terraplanner");
const { chromium } = require(path.join(TERRAPLANNER, "node_modules/playwright"));
const CHROME = process.env.CHROME_PATH;
const DIR = path.resolve(__dirname, "../added-plugins/zz-contratos");

// Não conformidades já conhecidas e documentadas (docs/plugins/referencia-api.md).
// Continuam aparecendo no relatório, mas não quebram a suíte.
const CONHECIDOS = {
  useInfluenceArea:
    "contrato 1.0.0 descreve métodos que o hook não tem; será refeito na migração da tela Áreas de Influência para plugin",
};

const PLUGIN = `
const PD = window.PluginDependencies;
const tipo = (v) => (typeof v === "function" ? "função" : Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
function Sonda({ nome }) {
  const hook = PD[nome];
  let resultado;
  try { resultado = nome === "useLayer" ? hook("tools") : hook(); } catch (e) { resultado = { __erro: String(e.message || e) }; }
  const chaves = resultado && typeof resultado === "object"
    ? Object.fromEntries(Object.keys(resultado).sort().map((k) => [k, tipo(resultado[k])]))
    : { __retorno: tipo(resultado) };
  window.__CONTRATOS = window.__CONTRATOS || {};
  window.__CONTRATOS[nome] = {
    versao: typeof hook.version === "function" ? hook.version() : null,
    declarados: hook.__meta?.methods ?? null,
    reais: chaves,
  };
  return null;
}
export default function Contratos() {
  const hooks = Object.keys(PD).filter((k) => /^use[A-Z]/.test(k) && typeof PD[k] === "function").sort();
  const servicos = {};
  for (const k of Object.keys(PD).filter((k) => /(Service|Controller)$/.test(k)).sort()) {
    const v = PD[k];
    const proto = v && typeof v === "object" ? Object.getPrototypeOf(v) : null;
    servicos[k] = [...new Set([...Object.keys(v || {}), ...(proto ? Object.getOwnPropertyNames(proto) : [])])]
      .filter((m) => m !== "constructor" && !(m in Object.prototype) && typeof v[m] === "function").sort();
  }
  window.__SERVICOS = servicos;
  window.__TODAS = Object.keys(PD).sort();
  return <div data-testid="contratos">{hooks.map((h) => <Sonda key={h} nome={h} />)}{hooks.length} hooks</div>;
}`;

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, "zz-contratos.tsx"), PLUGIN);
  let failures = 0;
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  try {
    const page = await browser.newPage();
    const avisosDuplicados = [];
    page.on("console", (m) => { if (m.text().includes("já existia, será sobrescrito")) avisosDuplicados.push(m.text()); });
    await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    await page.getByTestId("button-controlhud").click();
    await page.getByTestId("zz-contratos").locator("button").click();
    await page.getByTestId("contratos").waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    const { contratos, servicos, todas } = await page.evaluate(() => ({
      contratos: window.__CONTRATOS, servicos: window.__SERVICOS, todas: window.__TODAS,
    }));

    for (const [nome, c] of Object.entries(contratos)) {
      const reais = Object.keys(c.reais).filter((k) => c.reais[k] === "função");
      if (c.reais.__erro) {
        console.log(`FAIL  ${nome}: lançou ao ser chamado -> ${c.reais.__erro}`);
        failures++;
        continue;
      }
      if (!c.declarados) {
        console.log(`INFO  ${nome} (sem __meta, não é adaptador versionado): ${reais.join(", ") || JSON.stringify(c.reais)}`);
        continue;
      }
      const declarados = c.declarados.map((m) => m.replace(/\(.*$/, "")); // "addRange(range)" -> "addRange"
      const faltando = declarados.filter((m) => !reais.includes(m));
      const naoDeclarados = reais.filter((m) => !declarados.includes(m));
      const ok = faltando.length === 0;
      const status = ok ? "PASS" : CONHECIDOS[nome] ? "KNOWN" : "FAIL";
      if (status === "FAIL") failures++;
      if (status === "KNOWN") console.log(`      (conhecido: ${CONHECIDOS[nome]})`);
      console.log(`${status.padEnd(5)} ${nome}@${c.versao}: declarados ${ok ? "todos existem" : "AUSENTES: " + faltando.join(", ")}` +
        (naoDeclarados.length ? `  | expostos sem declarar: ${naoDeclarados.join(", ")}` : ""));
    }

    // Módulos expostos para as telas que ainda serão migradas
    const extras = await page.evaluate(async () => {
      const PD = window.PluginDependencies;
      const rejeita = async (fn) => { try { await fn(); return "não rejeitou"; } catch (e) { return `${e.name}: ${e.message}`; } };
      const tif = new File(["x"], "a.tif");
      return {
        presentes: ["addDataLayerController", "addAddressController", "addRangeController", "Range", "formatDistance", "formatDuration", "mapColors"]
          .filter((k) => !(k in PD)),
        formatDistance: PD.formatDistance(1500),
        formatDuration: PD.formatDuration(3725),
        mapColors: PD.mapColors.length,
        rangeCreate: typeof PD.Range.create,
        camadaTipo: await rejeita(() => PD.addDataLayerController.execute({ type: "kml", files: [] })),
        camadaFaltaArquivo: await rejeita(() => PD.addDataLayerController.execute({ type: "vector", files: [tif] })),
        camadaExtensao: await rejeita(() => PD.addDataLayerController.execute({ type: "vector", files: [tif, tif, tif] })),
        enderecoSemArquivo: await rejeita(() => PD.addAddressController.execute("x.csv", {})),
        alcanceVazio: await rejeita(() => PD.addRangeController.execute({})),
        interfaces: ["useMenu", "addDataLayerController", "addAddressController", "addRangeController"].filter((k) => !window.PluginInterfaces[k]),
      };
    });
    const ext = (nome, cond, info) => { console.log(`${cond ? "PASS" : "FAIL"}  ${nome}${info ? "  -> " + info : ""}`); if (!cond) failures++; };
    ext("novos módulos expostos (controllers do servidor, Range, formatadores, mapColors)", extras.presentes.length === 0, extras.presentes.join(", "));
    ext("formatDistance/formatDuration", extras.formatDistance === "1.50km" && extras.formatDuration === "1h 2min 5s", `${extras.formatDistance} | ${extras.formatDuration}`);
    ext("mapColors (10 cores) e Range.create", extras.mapColors === 10 && extras.rangeCreate === "function");
    for (const k of ["camadaTipo", "camadaFaltaArquivo", "camadaExtensao", "enderecoSemArquivo", "alcanceVazio"]) {
      ext(`validação recusa entrada inválida: ${k}`, extras[k].startsWith("PluginContractError"), extras[k]);
    }
    ext("window.PluginInterfaces inclui useMenu e os novos controllers", extras.interfaces.length === 0, extras.interfaces.join(", "));
    ext("nenhuma dependência injetada duas vezes", avisosDuplicados.length === 0, avisosDuplicados.join(" | "));

    const out = process.env.CONTRACTS_JSON;
    if (out) fs.writeFileSync(out, JSON.stringify({ contratos, servicos, todas }, null, 2));
    console.log("\nServiços/controllers:", JSON.stringify(servicos));
  } finally {
    await browser.close();
    fs.rmSync(DIR, { recursive: true, force: true });
  }
  console.log(failures ? `\n${failures} contrato(s) não conforme(s)` : "\nContratos: todos conformes");
  process.exitCode = failures ? 1 : 0;
})().catch((e) => {
  console.error("ABORTOU:", e.message);
  fs.rmSync(DIR, { recursive: true, force: true });
  process.exitCode = 2;
});
