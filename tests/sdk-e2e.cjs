// E2E da infraestrutura de plugins (manifesto, ícones, SDK, isolamento de falhas).
// Requer: plugin-api em :4000 e TerraPlanner (vite) em :5173.
const fs = require("fs");
const path = require("path");
const TERRAPLANNER = process.env.TERRAPLANNER_DIR || path.resolve(__dirname, "../../terraplanner");
const { chromium } = require(path.join(TERRAPLANNER, "node_modules/playwright"));
const CHROME = process.env.CHROME_PATH;
const PLUGINS = path.resolve(__dirname, "../added-plugins");

let failures = 0;
const check = (name, cond, extra) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra !== undefined ? "  -> " + JSON.stringify(extra) : ""}`);
  if (!cond) failures++;
};

// Fixtures temporárias (removidas no final)
const FIXTURES = {
  "zz-guia-rapido": {
    // exemplo do Guia Rápido (Anexo B), que usa a forma legada ReactIcons.Bi
    "zz-guia-rapido.tsx": `
const { React, GoBackButton, useMenu, ReactIcons } = window.PluginDependencies;
const { BiRocket } = ReactIcons.Bi;
export default function MeuPrimeiroPlugin() {
  const { changeMenuOption } = useMenu();
  return (
    <main className="w-full p-4">
      <GoBackButton title="Meu Primeiro Plugin" icon={BiRocket} onGoBack={() => changeMenuOption(undefined)} />
      <h2 data-testid="guia-ok">Plugin Carregado com Sucesso!</h2>
    </main>
  );
}`,
    "plugin.json": JSON.stringify({ title: "Guia Rápido (teste)", icon: "bi:BiRocket", order: 900 }),
  },
  "zz-sdk-moderno": {
    "zz-sdk-moderno.tsx": `
import { useState } from "react";
import { GoBackButton, useMenu, usePin } from "@terraplanner/sdk";
import { TbMapPin } from "react-icons/tb";
import { Contador } from "./components/Contador";
export default function SdkModerno() {
  const { changeMenuOption } = useMenu();
  const { addPin, removePin } = usePin();
  const [n, setN] = useState(0);
  return (
    <main className="p-4">
      <GoBackButton title="SDK moderno" icon={TbMapPin} onGoBack={() => changeMenuOption(undefined)} />
      <Contador valor={n} onMais={() => setN(n + 1)} />
      <button data-testid="add-pin" onClick={() => addPin("zz-pin", { coordinates: [-43.5, -20.38] })}>pin</button>
      <button data-testid="rm-pin" onClick={() => removePin("zz-pin")}>rm</button>
    </main>
  );
}`,
    "components/Contador.tsx": `
import { formatar } from "./formatar";
export function Contador({ valor, onMais }: { valor: number; onMais: () => void }) {
  return <button data-testid="contador" onClick={onMais}>{formatar(valor)}</button>;
}`,
    "components/formatar.ts": `export const formatar = (n: number): string => \`cliques: \${n}\`;`,
    "plugin.json": JSON.stringify({ title: "SDK moderno (teste)", icon: "md:MdOutlineMap", order: 901 }),
  },
  "zz-marcador": {
    // exemplo do Passo 2 de docs/plugins/guia-rapido.md (mesmo código)
    "zz-marcador.tsx": `
import { useEffect } from 'react';
import { usePin, useRadius } from '@terraplanner/sdk';

export default function Marcador() {
  const { addPin, removePin } = usePin();
  const { addRadius, removeRadius } = useRadius();

  useEffect(() => {
    addPin('meu-pin', { coordinates: [-43.5, -20.38], type: 'destination' });
    addRadius({ id: 'meu-raio', center: [-43.5, -20.38], radius: 5000, quantity: 2 });

    // limpe o que o plugin desenhou ao sair
    return () => {
      removePin('meu-pin');
      removeRadius('meu-raio');
    };
  }, [addPin, removePin, addRadius, removeRadius]);

  return <p className="p-4">Um pin e dois círculos (5 km e 10 km) em Ouro Preto.</p>;
}`,
    "plugin.json": JSON.stringify({ title: "Marcador (teste)", order: 903 }),
  },
  "zz-quebrado": {
    "zz-quebrado.tsx": `import Map from "ol/Map";\nexport default () => <div>{String(Map)}</div>;`,
    "plugin.json": JSON.stringify({ title: "Plugin quebrado (teste)", order: 902 }),
  },
};

function writeFixtures() {
  for (const [id, files] of Object.entries(FIXTURES)) {
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(PLUGINS, id, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  }
}
function removeFixtures() {
  for (const id of Object.keys(FIXTURES)) fs.rmSync(path.join(PLUGINS, id), { recursive: true, force: true });
}

async function abrirPlugin(page, id) {
  await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
  await page.getByTestId("button-controlhud").click();
  await page.getByTestId(id).locator("button").click();
}

(async () => {
  writeFixtures();
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    const iconChunks = [];
    page.on("request", (r) => {
      if (/react-icons[/_]tb\b/.test(r.url())) iconChunks.push(r.url());
    });

    await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    check("pacote tb (não usado pelo host) não é baixado na abertura", iconChunks.length === 0, iconChunks.length);

    await page.getByTestId("button-controlhud").click();
    const tt = page.getByTestId("TerraTripper");
    await tt.locator("svg").first().waitFor();
    check('menu usa o título do plugin.json ("TerraTripper", não "TERRATRIPPER")', (await tt.innerText()).trim() === "TerraTripper", await tt.innerText());
    await page.waitForTimeout(500);
    check("menu mostra o ícone do manifesto (md:MdOutlineMap)", (await tt.locator("svg").count()) >= 2);

    // Guia Rápido (Anexo B), forma legada ReactIcons.Bi
    await page.getByTestId("zz-guia-rapido").locator("button").click();
    await page.getByTestId("guia-ok").waitFor({ timeout: 20000 });
    check("exemplo do Guia Rápido (ReactIcons.Bi.BiRocket) renderiza", true);
    check("GoBackButton recebe o ícone BiRocket (svg)", (await page.locator("main svg").count()) > 0);
    await page.locator("main button").first().click();

    // SDK moderno: imports de react, sdk, react-icons e componentes .tsx/.ts encadeados
    check("tb ainda não baixado antes de abrir o plugin que o usa", iconChunks.length === 0, iconChunks.length);
    await page.getByTestId("zz-sdk-moderno").locator("button").click();
    await page.getByTestId("contador").waitFor({ timeout: 20000 });
    await page.getByTestId("contador").click();
    await page.getByTestId("contador").click();
    check("useState do host + componente auxiliar + util .ts", (await page.getByTestId("contador").innerText()) === "cliques: 2");
    check("pacote tb baixado sob demanda ao abrir o plugin", iconChunks.length > 0, iconChunks.length);
    const errosAntes = pageErrors.length; // o host já emite um AxiosError próprio na carga (WMS 404)
    await page.getByTestId("add-pin").click();
    await page.getByTestId("rm-pin").click();
    await page.waitForTimeout(300);
    check("contrato usePin chamado via @terraplanner/sdk sem erro", pageErrors.length === errosAntes, pageErrors.slice(errosAntes));
    await page.locator("main button").first().click();

    // Passo 2 do Guia Rápido: desenha e limpa ao sair
    const contar = () => page.evaluate(() => {
      const fs = window.TerraPlannerMap.getAllLayers().flatMap((l) => l.getSource?.()?.getFeatures?.() ?? []);
      return { pin: fs.filter((f) => f.getId() === "meu-pin").length, raio: fs.filter((f) => String(f.getId()).startsWith("radius-meu-raio-")).length };
    });
    await page.getByTestId("zz-marcador").locator("button").click();
    await page.getByText("Um pin e dois círculos").waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    const dentro = await contar();
    check("Guia Rápido passo 2: 1 pin e 2 círculos no mapa", dentro.pin === 1 && dentro.raio === 2, dentro);
    await page.getByTestId("button-close-control-hud").click();
    await page.waitForTimeout(300);
    const fora = await contar();
    check("Guia Rápido passo 2: cleanup do useEffect remove pin e círculos", fora.pin === 0 && fora.raio === 0, fora);
    // reabrir o painel volta para a última opção escolhida; recarrega para cair na lista do menu
    await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    await page.getByTestId("button-controlhud").click();

    // Plugin quebrado: isolamento
    await page.getByTestId("zz-quebrado").locator("button").click();
    const alerta = page.getByRole("alert");
    await alerta.waitFor({ timeout: 20000 });
    const txt = await alerta.innerText();
    check("falha do plugin fica isolada no painel com a mensagem do compilador", txt.includes('Dependência "ol/Map" não é exposta'), txt.split("\n")[0]);
    await alerta.getByRole("button", { name: "Voltar ao menu" }).click();
    await page.getByTestId("TerraTripper").waitFor();
    check("host continua funcionando após a falha (menu de volta)", true);

    // TerraTripper ainda abre e seu GoBackButton agora tem ícone de verdade
    await page.getByTestId("TerraTripper").locator("button").click();
    await page.getByText("Planejador de Roteiro de Viagem").waitFor({ timeout: 30000 });
    const header = page.locator("main").first();
    check("TerraTripper: ícone MdOutlineMap no lugar do emoji 📍", (await header.locator("svg").count()) > 0 && !(await header.innerText()).startsWith("📍"));
  } finally {
    await browser.close();
    removeFixtures();
  }
  console.log(failures ? `\n${failures} falha(s)` : "\nInfra de plugins: todos os testes passaram");
  process.exitCode = failures ? 1 : 0;
})().catch((e) => {
  console.error("ABORTOU:", e.message);
  removeFixtures();
  process.exitCode = 2;
});
