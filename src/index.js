const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { compilePlugin, errorModule } = require("./transpile");

const app = express();
const PORT = process.env.PORT || 4000;

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

// Nomes vêm da URL/formulário e viram caminhos em disco: só aceitamos nomes simples.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_FILE = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9]+)*$/;

function pluginPath(pluginId, ...rest) {
  if (!SAFE_ID.test(pluginId)) return null;
  for (const part of rest) if (!SAFE_FILE.test(part)) return null;
  return path.join(pluginsDir, pluginId, ...rest);
}

function readManifest(pluginId) {
  const file = pluginPath(pluginId, "plugin.json");
  if (!file || !fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (error) {
    console.error(`plugin.json inválido em "${pluginId}":`, error.message);
    return {};
  }
}

function sendCompiled(res, filePath) {
  res.setHeader("Content-Type", "application/javascript");
  try {
    res.status(200).send(compilePlugin(fs.readFileSync(filePath, "utf-8"), filePath));
  } catch (error) {
    console.error(`Erro ao compilar ${path.relative(pluginsDir, filePath)}:`, error.message);
    // 200 de propósito: um import() que recebe 500 vira um erro genérico no navegador;
    // assim a mensagem real chega ao ErrorBoundary do host.
    res.setHeader("X-Plugin-Compile-Error", "1");
    res.status(200).send(errorModule(error.message));
  }
}

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

      if (!SAFE_ID.test(pluginName)) {
        return res.status(400).send({
          error: "Nome do plugin inválido: use apenas letras, números, '-' e '_'.",
        });
      }

      const invalid = componentFiles.find((c) => !SAFE_FILE.test(c.originalname));
      if (invalid) {
        return res.status(400).send({ error: `Nome de arquivo inválido: "${invalid.originalname}".` });
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

// Listar plugins disponíveis (id + metadados do plugin.json, quando houver)
app.get("/api/plugins", (req, res) => {
  try {
    const plugins = fs
      .readdirSync(pluginsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && SAFE_ID.test(d.name))
      .filter((d) => fs.existsSync(path.join(pluginsDir, d.name, `${d.name}.tsx`)))
      .map((d) => ({ ...readManifest(d.name), id: d.name }))
      .sort((a, b) => (a.order ?? 1000) - (b.order ?? 1000) || a.id.localeCompare(b.id));
    res.status(200).send(plugins);
  } catch (error) {
    console.error("Erro ao listar plugins:", error);
    res.status(500).send({ error: "Erro ao listar plugins." });
  }
});

// Retornar o arquivo principal do plugin como um módulo JS
app.get("/plugins/:pluginId/main.js", (req, res) => {
  const { pluginId } = req.params;
  const pluginFilePath = pluginPath(pluginId, `${pluginId}.tsx`);

  if (!pluginFilePath || !fs.existsSync(pluginFilePath)) {
    return res
      .status(404)
      .send({ error: "Arquivo principal do plugin não encontrado." });
  }
  sendCompiled(res, pluginFilePath);
});

// Componentes auxiliares: './components/X' ou './components/X.js' -> X.tsx ou X.ts
app.get("/plugins/:pluginId/components/:fileName", (req, res) => {
  const { pluginId, fileName } = req.params;
  const baseName = fileName.replace(/\.(js|tsx?)$/, "");

  const candidates = [`${baseName}.tsx`, `${baseName}.ts`]
    .map((f) => pluginPath(pluginId, "components", f))
    .filter(Boolean);
  const filePath = candidates.find((f) => fs.existsSync(f));

  if (!filePath) {
    return res.status(404).send("Componente não encontrado.");
  }
  sendCompiled(res, filePath);
});

// Arquivos estáticos (imagens, json...) da pasta do plugin
app.use("/plugins", express.static(pluginsDir));

//start na api-plugin
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
