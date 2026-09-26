// Minimal local server for LIFE TERMINAL. Web notes are kept in browser memory only.
const http = require("node:http");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const port = process.env.PORT || 3000;
const rootDirectory = __dirname;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function loadLocalEnvironment() {
  const environmentPath = path.join(rootDirectory, ".env");
  if (!fsSync.existsSync(environmentPath)) return;

  for (const line of fsSync.readFileSync(environmentPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const [, name, rawValue] = match;
    process.env[name] = rawValue.replace(/^(["'])(.*)\1$/, "$2");
  }
}

loadLocalEnvironment();

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function serveStaticFile(response, pathname) {
  const requestedFile = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.resolve(rootDirectory, requestedFile);

  if (!filePath.startsWith(`${rootDirectory}${path.sep}`)) {
    response.writeHead(403).end();
    return;
  }

  try {
    const extension = path.extname(filePath).toLowerCase();
    const file = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
    response.end(file);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500).end();
  }
}

http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/chat-config.js") {
      const config = {
        supabaseUrl: process.env.SUPABASE_URL || "",
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
      };
      response.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(`window.LIFE_TERMINAL_CHAT_CONFIG = ${JSON.stringify(config)};\n`);
    } else if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "API endpoint not found." });
    } else {
      await serveStaticFile(response, url.pathname);
    }
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error." });
  }
}).listen(port, () => {
  console.log(`LIFE TERMINAL is running at http://localhost:${port}`);
});
