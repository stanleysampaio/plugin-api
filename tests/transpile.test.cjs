// Testes do compilador de plugins (node tests/transpile.test.cjs)
const assert = require("assert");
const { compilePlugin } = require("../src/transpile");

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name}\n      ${e.message.split("\n").join("\n      ")}`);
  }
}
const compile = (code, file = "/p/Demo/Demo.tsx") => compilePlugin(code, file);

test("import do SDK vira desestruturação de window.PluginDependencies", () => {
  const out = compile(`import { usePin, useRange as rng } from "@terraplanner/sdk";\nexport default () => { usePin(); rng(); return null; };`);
  assert.match(out, /const \{\s*usePin,\s*useRange: rng\s*\} = window\.PluginDependencies;/);
  assert.doesNotMatch(out, /\bimport\b/);
});

test("import de react usa o React do host (default + nomeados)", () => {
  const out = compile(`import React, { useState } from "react";\nexport default () => { const [a] = useState(1); return <b>{a}</b>; };`);
  assert.match(out, /const React = window\.PluginDependencies\.React;/);
  assert.match(out, /const \{\s*useState\s*\} = window\.PluginDependencies\.React;/);
  assert.match(out, /React\.createElement\("b"/);
});

test("ícones: import de react-icons/<pacote> vira await loadIcons(pacote)", () => {
  const out = compile(`import { MdMap, MdHome as Casa } from "react-icons/md";\nexport default () => <MdMap />;`);
  assert.match(out, /const \{\s*MdMap,\s*MdHome: Casa\s*\} = await window\.PluginDependencies\.loadIcons\("md"\);/);
});

test("ícones legados: ReactIcons.Bi / ReactIcons.Fi carregam só os pacotes usados", () => {
  const out = compile(`const { BiSmile } = ReactIcons.Bi;\nconst { FiX } = ReactIcons.Fi;\nexport default () => <BiSmile />;`);
  assert.match(out, /await window\.PluginDependencies\.loadIconPacks\(\["bi", "fi"\]\);/);
  assert.match(out, /const ReactIcons = window\.PluginDependencies\.ReactIcons;/);
});

test("ícones legados com ReactIcons desestruturado do PluginDependencies (exemplo do Anexo B)", () => {
  const out = compile(
    `const { React, ReactIcons } = window.PluginDependencies;\nconst { BiRocket } = ReactIcons.Bi;\nexport default () => <BiRocket />;`
  );
  const preload = out.indexOf('loadIconPacks(["bi"])');
  assert.ok(preload >= 0, "deveria pré-carregar o pacote bi");
  assert.ok(preload < out.indexOf("ReactIcons.Bi"), "o pré-carregamento precisa vir antes do uso");
});

test("ReactIcons.IconContext (utilitário) não é tratado como pacote", () => {
  const out = compile(`const ctx = ReactIcons.IconContext;\nexport default () => null;`);
  assert.doesNotMatch(out, /loadIconPacks/);
});

test("nomes legados só são injetados quando não declarados (sem regex apagando linhas)", () => {
  const out = compile(
    `const { React, useRange } = window.PluginDependencies;\nexport default function P() { useRange(); usePin(); return <i/>; }`
  );
  // o próprio const do plugin continua lá, com useRange
  assert.match(out, /const \{\s*React,\s*useRange\s*\} = window\.PluginDependencies;/);
  // usePin não foi declarado -> injetado; React já declarado -> não duplica
  assert.match(out, /const \{\s*usePin\s*\} = window\.PluginDependencies;/);
  assert.strictEqual((out.match(/\bReact\b\s*[,}]/g) || []).length >= 1, true);
  assert.doesNotMatch(out, /const \{\s*React\s*\} = window\.PluginDependencies;/);
});

test("JSX sem React declarado injeta React", () => {
  const out = compile(`export default () => <div/>;`);
  assert.match(out, /const \{\s*React\s*\} = window\.PluginDependencies;/);
});

test("imports relativos são preservados para o navegador", () => {
  const out = compile(`import { X } from "./components/X";\nexport default () => <X/>;`);
  assert.match(out, /import \{ X \} from "\.\/components\/X";/);
});

test("import type é removido sem erro", () => {
  const out = compile(`import type { Feature } from "geojson";\nexport default (f: Feature) => null;`);
  assert.doesNotMatch(out, /geojson/);
});

test("pacote não exposto pelo host é recusado com mensagem clara", () => {
  assert.throws(() => compile(`import Map from "ol/Map";\nexport default () => null;`), /Dependência "ol\/Map" não é exposta pelo TerraPlanner/);
});

test("arquivo principal sem export default ganha um default genérico", () => {
  assert.match(compile(`const a = 1;`), /export default function DefaultPlugin/);
});

test("componente auxiliar (.ts) compila sem JSX e sem export default", () => {
  const out = compile(`export const soma = (a: number, b: number): number => a + b;`, "/p/Demo/components/util.ts");
  assert.match(out, /export const soma = \(a, b\) => a \+ b;/);
  assert.doesNotMatch(out, /DefaultPlugin/);
});

console.log(failures ? `\n${failures} falha(s)` : "\nCompilador: todos os testes passaram");
process.exitCode = failures ? 1 : 0;
