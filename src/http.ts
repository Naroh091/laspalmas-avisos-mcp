#!/usr/bin/env node
/**
 * Entrada HTTP del servidor MCP (transporte Streamable HTTP).
 * Escucha SOLO en 127.0.0.1; endpoint /mcp (LASPALMAS_AVISOS_HTTP_PATH).
 * LASPALMAS_AVISOS_MCP_SECRET opcional (x-mcp-secret o Bearer).
 */
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildServer } from "./mcp.js";
import { registerUpload } from "./photo.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PKG_VERSION: string = (require("../package.json") as { version?: string }).version ?? "0.0.0";

const PORT = Number(process.env.LASPALMAS_AVISOS_HTTP_PORT ?? 3003);
const HOST = process.env.LASPALMAS_AVISOS_HTTP_HOST ?? "127.0.0.1";
const PATH = process.env.LASPALMAS_AVISOS_HTTP_PATH ?? "/mcp";
const SECRET = process.env.LASPALMAS_AVISOS_MCP_SECRET ?? "";
const ALLOWED_HOSTS = (process.env.LASPALMAS_AVISOS_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(express.json({ limit: "32mb" }));

app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "laspalmas-avisos-mcp", version: PKG_VERSION }),
);

app.use((req: Request, res: Response, next) => {
  if (SECRET) {
    const auth = req.headers["authorization"];
    const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (req.headers["x-mcp-secret"] !== SECRET && bearer !== SECRET) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
      return;
    }
  }
  next();
});

app.put("/upload", express.raw({ type: "*/*", limit: "64mb" }), async (req: Request, res: Response) => {
  try {
    const buf = req.body as Buffer;
    if (!buf?.length) {
      res.status(400).json({ error: "cuerpo vacío: manda la foto con --data-binary @foto.jpg" });
      return;
    }
    const filename = String(req.query.filename ?? "upload.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
    const dir = join(tmpdir(), "laspalmas-avisos-uploads");
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${randomUUID()}-${filename}`);
    await writeFile(path, buf);
    res.json({ file_id: registerUpload(path), bytes: buf.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post(PATH, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport = sessionId ? transports[sessionId] : undefined;

  if (!transport && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: ALLOWED_HOSTS.length > 0,
      allowedHosts: ALLOWED_HOSTS.length > 0 ? ALLOWED_HOSTS : undefined,
      onsessioninitialized: (sid: string) => {
        transports[sid] = transport!;
      },
    });
    transport.onclose = () => {
      if (transport!.sessionId) delete transports[transport!.sessionId];
    };
    const server = buildServer();
    await server.connect(transport);
  } else if (!transport) {
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: falta o no existe la sesión (mcp-session-id)" },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

async function sessionRequest(req: Request, res: Response) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  const transport = sessionId ? transports[sessionId] : undefined;
  if (!transport) {
    res.status(400).send("Sesión inválida o ausente (mcp-session-id)");
    return;
  }
  await transport.handleRequest(req, res);
}
app.get(PATH, sessionRequest);
app.delete(PATH, sessionRequest);

app.listen(PORT, HOST, () => {
  console.error(`[laspalmas-avisos] MCP HTTP escuchando en http://${HOST}:${PORT}${PATH}`);
  if (!SECRET) console.error("[laspalmas-avisos] Aviso: sin LASPALMAS_AVISOS_MCP_SECRET (acceso controlado solo por Tailscale).");
});
