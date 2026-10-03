#!/usr/bin/env node
/**
 * Entrada STDIO del servidor MCP (para Claude Desktop / Claude Code en local).
 * Para exponerlo por red (Tailscale), usa http.ts.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./mcp.js";

async function main() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[laspalmas-avisos] MCP servidor listo (stdio). Clave de app integrada; sin cuentas que configurar.");
}

main().catch((e) => {
  console.error("[laspalmas-avisos] Error fatal:", e);
  process.exit(1);
});
