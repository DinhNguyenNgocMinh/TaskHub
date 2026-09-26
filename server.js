// Minimal local server for LIFE TERMINAL. It serves the UI and persists active notes.
const http = require("node:http");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");

const port = process.env.PORT || 3000;
const rootDirectory = __dirname;
const notesPath = path.join(rootDirectory, "notes.json");
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

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function readNotes() {
  try {
    const savedData = JSON.parse(await fs.readFile(notesPath, "utf8"));
    // Preserve the user's one-note sample and migrate it in memory for appending.
    if (Array.isArray(savedData)) return savedData;
    return savedData && typeof savedData === "object" ? [savedData] : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveNote(noteText, deadline) {
  const notes = await readNotes();
  const lastId = notes.reduce((highestId, note) => Math.max(highestId, Number(note.id) || 0), 0);
  const note = {
    id: lastId + 1,
    notes: noteText,
    category: null,
    date_created: new Date().toISOString(),
    date_deadline: deadline || null,
    status: "incomplete",
  };

  notes.push(note);
  await fs.writeFile(notesPath, `${JSON.stringify(notes, null, 2)}\n`, "utf8");
  return note;
}

function parseDeadline(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  return null;
}

function filterNotes(notes, filter) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (filter) {
    case "all":
      return notes;
    case "incomplete":
    case "complete":
      return notes.filter((note) => note.status === filter);
    case "nodeadline":
      return notes.filter((note) => !note.date_deadline);
    case "overdue":
      return notes.filter((note) => {
        const deadline = parseDeadline(note.date_deadline);
        return deadline && deadline < today && note.status !== "complete";
      });
    default:
      return null;
  }
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/notes" && request.method === "GET") {
    const filter = (url.searchParams.get("filter") || "all").toLowerCase();
    const notes = filterNotes(await readNotes(), filter);
    if (!notes) return sendJson(response, 400, { error: "Invalid note filter." });
    return sendJson(response, 200, { filter, notes });
  }

  if (url.pathname === "/api/notes" && request.method === "POST") {
    const body = JSON.parse(await readRequestBody(request));
    const noteText = typeof body.notes === "string" ? body.notes.trim() : "";
    const deadline = typeof body.date_deadline === "string" ? body.date_deadline.trim() : "";

    if (!noteText) return sendJson(response, 400, { error: "Note content is required." });
    return sendJson(response, 201, { note: await saveNote(noteText, deadline) });
  }

  return sendJson(response, 404, { error: "API endpoint not found." });
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
      await handleApi(request, response, url);
    } else {
      await serveStaticFile(response, url.pathname);
    }
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error." });
  }
}).listen(port, () => {
  console.log(`LIFE TERMINAL is running at http://localhost:${port}`);
});
