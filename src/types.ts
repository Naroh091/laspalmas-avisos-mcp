/**
 * Esquemas (zod) de entrada. service_id = id de list_services,
 * category_id = id de list_categories.
 */
import { z } from "zod";

export const IdentityOverride = z
  .object({
    userEmail: z.string().optional(),
    userPhone: z.string().optional(),
  })
  .describe("Sobrescribe la identidad guardada solo para esta llamada");

export const CreateAvisoInput = z.object({
  service_id: z.number().describe("id de list_services (p.ej. 7 = Papeleras y contenedores)"),
  category_id: z.number().describe("id de list_categories para ese servicio"),
  description: z.string().describe("descripción del problema (texto que se publicará)"),
  address: z.string().describe("dirección en texto libre"),
  lat: z.number().describe("latitud WGS84"),
  lon: z.number().describe("longitud WGS84"),
  image_paths: z.array(z.string()).optional().describe("rutas locales a fotos (se mandan en base64)"),
  identity: IdentityOverride.optional(),
  confirm: z.boolean().optional().describe("DEBE ser true para ENVIAR de verdad. Por defecto false = dry-run."),
});
export type CreateAvisoInput = z.infer<typeof CreateAvisoInput>;

export const CreateAvisoFromPhotoInput = z.object({
  image_base64: z.string().optional(),
  image_path: z.string().optional().describe("ruta local. Solo stdio/CLI en la máquina del servidor"),
  file_id: z.string().optional().describe("VÍA PREFERIDA en remoto: id de PUT /upload"),
  service_id: z.number().optional(),
  category_id: z.number().optional(),
  category_hint: z.string().optional(),
  description: z.string().optional().describe("si falta, se pre-rellena y se marca para revisión"),
  address: z.string().optional(),
  lat: z.number().optional().describe("sobrescribe el GPS EXIF de la foto"),
  lon: z.number().optional().describe("sobrescribe el GPS EXIF de la foto"),
  identity: IdentityOverride.optional(),
  confirm: z.boolean().optional().describe("true = ENVIAR de verdad (requiere preview_token + human_confirmed)"),
  preview_token: z.string().optional(),
  human_confirmed: z.boolean().optional().describe("el humano vio el preview y dijo 'sí'"),
});
export type CreateAvisoFromPhotoInput = z.infer<typeof CreateAvisoFromPhotoInput>;

/** Cuerpo del POST entries (nombres de sendIncident). */
export interface CreatePayload {
  api_key: string;
  admin: string;
  email: string;
  uuid: string;
  platform: string;
  model: string;
  version: string;
  phone: string;
  latitude: number;
  longitude: number;
  service_id: number;
  category_id: number;
  address: string;
  description: string;
  supervised: number;
  photos: string[];
}
