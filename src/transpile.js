const babel = require("@babel/core");

const SDK_MODULE = "@terraplanner/sdk";

// Nomes que plugins antigos usam sem declarar (antes eram injetados por regex).
// Agora só são injetados quando o arquivo os referencia sem declará-los.
const LEGACY_GLOBALS = [
  "React",
  "GoBackButton",
  "SimpleButton",
  "useMenu",
  "useDirections",
  "useLayer",
  "usePin",
  "FullCalendar",
  "fcTimeGrid",
  "fcInteraction",
  "fcScrollGrid",
  "FullCalendarDraggable",
  "fcLocalePtBr",
];

const PD = "window.PluginDependencies";
const ICON_IMPORT = /^react-icons\/([a-z0-9]+)$/;
// Pacotes do react-icons 5.x (mesma lista de src/plugins/sdk/icons.ts no host)
const ICON_PACKS = new Set("ai bi bs cg ci di fa fa6 fc fi gi go gr hi hi2 im io io5 lia lu md pi ri rx si sl tb tfi ti vsc wi".split(" "));

/**
 * Plugin Babel que liga o código do plugin às dependências expostas pelo host:
 * - import ... from "@terraplanner/sdk" -> const { ... } = window.PluginDependencies
 * - import React, { useState } from "react" -> React do host
 * - imports relativos (./components/X) seguem como import dinâmico do navegador
 * - qualquer outro pacote é recusado: o plugin só acessa o que o host expõe.
 */
function pluginDependenciesPlugin({ types: t, template }) {
  const pdMember = (name) =>
    t.memberExpression(template.expression.ast(PD), t.identifier(name));

  // await window.PluginDependencies.<fn>(<arg>) — top-level await: o módulo do plugin
  // só termina de carregar quando os pacotes de ícones pedidos estiverem prontos.
  const awaitPd = (fn, arg) => t.awaitExpression(t.callExpression(pdMember(fn), [arg]));

  function declarationsFor(path) {
    const { node } = path;
    const source = node.source.value;
    const out = [];
    const named = [];

    const icon = ICON_IMPORT.exec(source);
    if (icon) {
      const pack = icon[1];
      for (const spec of node.specifiers) {
        if (spec.importKind === "type") continue;
        if (t.isImportSpecifier(spec)) {
          const imported = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value;
          named.push(t.objectProperty(t.identifier(imported), t.identifier(spec.local.name), false, imported === spec.local.name));
        } else {
          out.push(t.variableDeclaration("const", [t.variableDeclarator(t.identifier(spec.local.name), awaitPd("loadIcons", t.stringLiteral(pack)))]));
        }
      }
      if (named.length) {
        out.push(t.variableDeclaration("const", [t.variableDeclarator(t.objectPattern(named), awaitPd("loadIcons", t.stringLiteral(pack)))]));
      }
      return out;
    }

    for (const spec of node.specifiers) {
      if (spec.importKind === "type" || spec.importKind === "typeof") continue;
      if (t.isImportSpecifier(spec)) {
        const imported = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value;
        named.push(t.objectProperty(t.identifier(imported), t.identifier(spec.local.name), false, imported === spec.local.name));
      } else {
        // default ou namespace
        const value = source === "react" ? pdMember("React") : template.expression.ast(PD);
        out.push(t.variableDeclaration("const", [t.variableDeclarator(t.identifier(spec.local.name), value)]));
      }
    }

    if (named.length) {
      const from = source === "react" ? pdMember("React") : template.expression.ast(PD);
      out.push(t.variableDeclaration("const", [t.variableDeclarator(t.objectPattern(named), from)]));
    }
    return out;
  }

  return {
    visitor: {
      Program: {
        enter(program) {
          let hasJsx = false;
          program.traverse({
            JSXElement() { hasJsx = true; },
            JSXFragment() { hasJsx = true; },
            ImportDeclaration(path) {
              const source = path.node.source.value;
              if (source.startsWith(".") || source.startsWith("/")) return;
              if (path.node.importKind === "type" || path.node.importKind === "typeof") {
                path.remove();
                return;
              }
              if (source !== "react" && source !== SDK_MODULE && !ICON_IMPORT.test(source)) {
                throw path.buildCodeFrameError(
                  `Dependência "${source}" não é exposta pelo TerraPlanner. ` +
                    `Importe do "${SDK_MODULE}" (ex: import { usePin } from "${SDK_MODULE}") ` +
                    `ou peça para o host expor essa biblioteca.`
                );
              }
              path.replaceWithMultiple(declarationsFor(path));
            },
          });

          program.scope.crawl();
          const missing = LEGACY_GLOBALS.filter((name) => {
            if (program.scope.hasBinding(name)) return false;
            return name === "React" ? hasJsx || program.scope.globals[name] : program.scope.globals[name];
          });

          // Forma legada documentada: const { BiSmile } = ReactIcons.Bi
          // (com ou sem `const { ReactIcons } = window.PluginDependencies` no arquivo)
          const packs = new Set();
          program.traverse({
            MemberExpression(p) {
              const { object, property, computed } = p.node;
              if (computed || !t.isIdentifier(object, { name: "ReactIcons" }) || !t.isIdentifier(property)) return;
              const binding = p.scope.getBinding("ReactIcons");
              if (binding && binding.scope !== program.scope) return; // ReactIcons local de outra coisa
              const pack = property.name.toLowerCase();
              if (ICON_PACKS.has(pack)) packs.add(pack);
            },
          });
          const legacyIcons = [];
          if (packs.size) {
            legacyIcons.push(
              t.expressionStatement(awaitPd("loadIconPacks", t.arrayExpression([...packs].map((p) => t.stringLiteral(p)))))
            );
          }
          if (!program.scope.hasBinding("ReactIcons") && program.scope.globals.ReactIcons) {
            legacyIcons.push(
              t.variableDeclaration("const", [t.variableDeclarator(t.identifier("ReactIcons"), pdMember("ReactIcons"))])
            );
          }
          if (legacyIcons.length) program.unshiftContainer("body", legacyIcons);

          if (missing.length) {
            program.unshiftContainer(
              "body",
              t.variableDeclaration("const", [
                t.variableDeclarator(
                  t.objectPattern(missing.map((n) => t.objectProperty(t.identifier(n), t.identifier(n), false, true))),
                  template.expression.ast(PD)
                ),
              ])
            );
          }
        },
      },
    },
  };
}

/** Compila um arquivo .ts/.tsx de plugin para um módulo JS executável no navegador. */
function compilePlugin(code, filename) {
  const result = babel.transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [pluginDependenciesPlugin],
    presets: [
      ["@babel/preset-react", { runtime: "classic" }],
      ["@babel/preset-typescript", { isTSX: filename.endsWith(".tsx"), allExtensions: true, onlyRemoveTypeImports: false }],
    ],
  });

  let out = result.code;
  if (!/\bexport\s+default\b/.test(out) && /\.tsx$/.test(filename) && !/[\\/]components[\\/]/.test(filename)) {
    out += `\nexport default function DefaultPlugin() { return ${PD}.React.createElement("div", null, "Plugin sem exportação default"); }`;
  }
  return out;
}

/** Módulo que falha ao ser importado, levando a mensagem de compilação até a tela do host. */
function errorModule(message) {
  return `throw new Error(${JSON.stringify(`[plugin-api] ${message}`)});\n`;
}

module.exports = { compilePlugin, errorModule, SDK_MODULE, LEGACY_GLOBALS };
