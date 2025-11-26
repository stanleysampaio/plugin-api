const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const babel = require("@babel/core");

const app = express();
const PORT = 4000;

// Middleware para CORS e Content Security Policy (CSP)
app.use(cors());
app.use((req, res, next) => {
  res.removeHeader("Content-Security-Policy");
  next();
});

// Configuração do multer para upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const pluginsDir = path.resolve(__dirname, "../added-plugins");

// Endpoint para criar um plugin
app.post(
  "/api/plugins",
  upload.fields([{ name: "pluginFile", maxCount: 1 }, { name: "components" }]),
  (req, res) => {
    try {
      const { pluginName } = req.body;
      const pluginFile = req.files["pluginFile"]?.[0];
      const componentFiles = req.files["components"] || [];

      if (!pluginName || !pluginFile) {
        return res.status(400).send({
          error: "Nome do plugin e arquivo principal são obrigatórios.",
        });
      }

      const pluginDir = path.join(pluginsDir, pluginName);

      if (fs.existsSync(pluginDir)) {
        return res
          .status(400)
          .send({ error: `O plugin "${pluginName}" já existe.` });
      }

      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, `${pluginName}.tsx`),
        pluginFile.buffer
      );

      if (componentFiles.length > 0) {
        const componentsDir = path.join(pluginDir, "components");
        fs.mkdirSync(componentsDir, { recursive: true });

        componentFiles.forEach((component) => {
          fs.writeFileSync(
            path.join(componentsDir, component.originalname),
            component.buffer
          );
        });
      }

      res
        .status(200)
        .send({ message: `Plugin "${pluginName}" criado com sucesso.` });
    } catch (error) {
      console.error("Erro ao criar plugin:", error);
      res.status(500).send({ error: "Erro ao criar o plugin." });
    }
  }
);

// Listar plugins disponíveis
app.get("/api/plugins", (req, res) => {
  try {
    const pluginFolders = fs.readdirSync(pluginsDir);
    const plugins = pluginFolders.map((folder) => ({ id: folder }));
    res.status(200).send(plugins);
  } catch (error) {
    console.error("Erro ao listar plugins:", error);
    res.status(500).send({ error: "Erro ao listar plugins." });
  }
});

// Servir arquivos estáticos da pasta de plugins
app.use("/plugins", express.static(pluginsDir));

// Retornar o conteúdo do arquivo principal do plugin como um módulo JS
app.get("/plugins/:pluginId/main.js", (req, res) => {
  const pluginId = req.params.pluginId;
  const pluginDir = path.join(pluginsDir, pluginId);
  const pluginFilePath = path.join(pluginDir, `${pluginId}.tsx`);

  if (!fs.existsSync(pluginFilePath)) {
    return res
      .status(404)
      .send({ error: "Arquivo principal do plugin não encontrado." });
  }

  try {
    let tsxContent = fs.readFileSync(pluginFilePath, "utf-8");

    // 🔹 Remove imports padrão (React, etc)
    tsxContent = tsxContent.replace(
      /^import\s.+from\s+['"](@|react|[^.\/]).+['"];/gm,
      ""
    );

    // 🔹 Evita redefinições de variáveis injetadas
    const dependencyKeys = [
      "React",
      "ReactIcons",
      "GoBackButton",
      "SimpleButton",
      "useMenu",
    ];

    dependencyKeys.forEach((dep) => {
      const regex = new RegExp(
        `const\\s+\\{[^}]*\\b${dep}\\b[^}]*}\\s*=\\s*window\\.PluginDependencies\\s*;?`,
        "g"
      );
      tsxContent = tsxContent.replace(regex, "");
    });

    // 🔹 Injeta dependências globais
    const injectDependencies = `
      const {
        React,
        ReactIcons,
        GoBackButton,
        SimpleButton,
        useMenu,
        useDirections,
        useLayer,
        usePin,
        FullCalendar,
        fcTimeGrid,
        fcInteraction,
        fcScrollGrid,
        FullCalendarDraggable,
        fcLocalePtBr,
      } = window.PluginDependencies;
    `;

    // 🔹 Garante exportação default
    const hasExportDefault = tsxContent.includes("export default");
    if (!hasExportDefault) {
      tsxContent += `\nexport default function DefaultPlugin() { return <div>Plugin sem exportação</div>; }`;
    }

    const wrappedCode = `${injectDependencies.trim()}\n${tsxContent.trim()}`;

    // 🔹 Transpila via Babel com suporte a JSX/TSX e import relativo
    const result = babel.transformSync(wrappedCode, {
      presets: ["@babel/preset-react", "@babel/preset-typescript"],
      filename: pluginFilePath, // 🔸 necessário para resolver paths relativos
      cwd: pluginDir, // 🔸 garante base correta para import "./components"
    });

    res.setHeader("Content-Type", "application/javascript");
    res.status(200).send(result.code);
  } catch (error) {
    console.error("Erro ao compilar plugin:", error);
    res.status(500).send({ error: "Erro ao compilar o plugin." });
  }
});

app.get("/plugins/:pluginId/components/:fileName", (req, res) => {
  const { pluginId, fileName } = req.params;

  // Permitir importações do tipo './components/BlocoResumo.js' mesmo que o arquivo seja .tsx
  const baseName = fileName.replace(/\.js$/, "");
  const tsxFilePath = path.join(
    pluginsDir,
    pluginId,
    "components",
    `${baseName}.tsx`
  );

  if (!fs.existsSync(tsxFilePath)) {
    return res.status(404).send("Componente não encontrado.");
  }

  try {
    let code = fs.readFileSync(tsxFilePath, "utf-8");

    // Remove imports padrão (React etc.)
    code = code.replace(/^import\s.+from\s+['"](@|react|[^.\/]).+['"];/gm, "");

    // Remove possíveis redefinições de variáveis globais
    const dependencyKeys = [
      "React",
      "ReactIcons",
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
    dependencyKeys.forEach((dep) => {
      const regex = new RegExp(
        `const\\s+\\{[^}]*\\b${dep}\\b[^}]*}\\s*=\\s*window\\.PluginDependencies\\s*;?`,
        "g"
      );
      code = code.replace(regex, "");
    });

    // Injeta dependências globais
    const inject = `
      const {
        React,
        ReactIcons,
        GoBackButton,
        SimpleButton,
        useMenu,
        useDirections,
        useLayer,
        usePin,
        FullCalendar,
        fcTimeGrid,
        fcInteraction,
        fcScrollGrid,
        FullCalendarDraggable,
        fcLocalePtBr,
      } = window.PluginDependencies;
    `;

    const wrapped = `${inject}\n${code}`;

    const compiled = babel.transformSync(wrapped, {
      presets: ["@babel/preset-react", "@babel/preset-typescript"],
      filename: `${baseName}.tsx`,
    });

    res.setHeader("Content-Type", "application/javascript");
    res.send(compiled.code);
  } catch (err) {
    console.error("Erro ao compilar componente:", err);
    res.status(500).send("Erro ao compilar componente.");
  }
});

//start na api-plugin
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
