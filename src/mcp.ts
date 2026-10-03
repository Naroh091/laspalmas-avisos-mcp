/**
 * Construcción del servidor MCP y registro de tools.
 * Compartido por la entrada stdio (server.ts) y la HTTP (http.ts).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRequire } from "node:module";
import { z } from "zod";
import { LasPalmasApiError } from "./client.js";
import {
  createAviso,
  createAvisoFromPhoto,
  getIdentity,
  listCategories,
  listServices,
  myAvisos,
  setIdentity,
  suggestCategories,
} from "./avisos.js";
import { CreateAvisoFromPhotoInput, CreateAvisoInput, IdentityOverride } from "./types.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function fail(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}
async function run<T>(fn: () => Promise<T>) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof LasPalmasApiError) return fail(`Error ${e.status}: ${JSON.stringify(e.body)}`);
    return fail(String(e));
  }
}

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PKG_VERSION: string = (require("../package.json") as { version?: string }).version ?? "0.0.0";

export function buildServer(): McpServer {
  const server = new McpServer({ name: "laspalmas-avisos", version: PKG_VERSION });

  server.tool(
    "get_identity",
    "Devuelve la identidad guardada (email, teléfono, uuid) o null si aún no se preguntó.",
    {},
    () => run(() => getIdentity()),
  );

  server.tool(
    "set_identity",
    "Guarda email y teléfono del comunicante (se preguntan UNA vez y se reutilizan; el uuid se genera solo).",
    {
      userEmail: z.string().describe("email (identifica tus avisos)"),
      userPhone: z.string().optional().describe("teléfono español"),
    },
    (input) => run(() => setIdentity(input)),
  );

  server.tool("list_services", "Servicios de LPGC Avisa (id + título).", {}, () => run(() => listServices()));

  server.tool(
    "list_categories",
    "Categorías de un servicio (id + título).",
    { service_id: z.number() },
    ({ service_id }) => run(() => listCategories(service_id)),
  );

  server.tool(
    "suggest_categories",
    "Sugiere service_id + category_id por palabras (p.ej. 'contenedor desbordado').",
    { hint: z.string().optional() },
    ({ hint }) => run(() => suggestCategories(hint)),
  );

  server.tool(
    "my_avisos",
    "Avisos del email guardado (o el indicado).",
    { email: z.string().optional(), skip: z.number().optional(), take: z.number().optional() },
    ({ email, skip, take }) => run(() => myAvisos(email, skip, take)),
  );

  server.tool(
    "create_aviso",
    "Crea un aviso. IMPORTANTE: por defecto es DRY-RUN (confirm=false) y solo devuelve el payload que se enviaría, SIN crear nada. Para crear de verdad hay que pasar confirm=true. Usa la identidad guardada salvo 'identity'.",
    CreateAvisoInput.shape,
    (input) => run(() => createAviso(input as CreateAvisoInput)),
  );

  server.tool(
    "create_aviso_from_photo",
    "Aviso desde una FOTO en fases. VÍA PREFERIDA: sube la foto con PUT /upload (curl) y pasa file_id; por stdio usa image_path local. Sin service_id/category_id → sugiere (need_category). Con todo → preview + preview_token SIN enviar. Envío: MISMOS campos + confirm:true + human_confirmed:true + preview_token (tras 'sí' humano). Sin las tres NO se envía. La foto viaja en el envío (base64).",
    CreateAvisoFromPhotoInput.shape,
    (input) => run(() => createAvisoFromPhoto(input as CreateAvisoFromPhotoInput)),
  );

  return server;
}

export { IdentityOverride };
