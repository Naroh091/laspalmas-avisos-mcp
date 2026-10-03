/**
 * Núcleo: funciones de alto nivel sobre LPGC Avisa.
 * Reutilizadas por el servidor MCP y por el CLI.
 */
import { apiGet, apiPost, authParams } from "./client.js";
import { loadIdentity, saveIdentity, validateIdentity, type CitizenIdentity } from "./identity.js";
import type { CreateAvisoFromPhotoInput, CreateAvisoInput, CreatePayload } from "./types.js";
import {
  downscaleForVision,
  loadPhotoBuffer,
  parsePhoto,
  previewToken,
  resolveUpload,
  saveUpload,
  type PhotoInfo,
} from "./photo.js";

// ---------------------------------------------------------------------------
// Identidad
// ---------------------------------------------------------------------------

export async function getIdentity(): Promise<CitizenIdentity | null> {
  return loadIdentity();
}

export async function setIdentity(identity: { userEmail: string; userPhone?: string }): Promise<CitizenIdentity> {
  return saveIdentity({ userEmail: identity.userEmail, userPhone: identity.userPhone, lang: "es" });
}

export async function resolveIdentity(override?: { userEmail?: string; userPhone?: string }): Promise<CitizenIdentity> {
  const stored = await loadIdentity();
  if (!stored) {
    if (!override?.userEmail) {
      throw new Error("Sin identidad: pide email (y teléfono opcional) al humano y guárdalos con set_identity.");
    }
    return saveIdentity({ userEmail: override.userEmail, userPhone: override.userPhone, lang: "es" });
  }
  const merged: CitizenIdentity = {
    ...stored,
    userEmail: override?.userEmail ?? stored.userEmail,
    userPhone: override?.userPhone ?? stored.userPhone,
  };
  const errors = validateIdentity(merged);
  if (errors.length) throw new Error(`Identidad inválida: ${errors.join(" ")}`);
  return merged;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export interface Service {
  id: number;
  title: string;
}
export interface Category {
  id: number;
  title: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function listServices(): Promise<Service[]> {
  const data = (await apiGet<any[]>("services")) as any[];
  return data.map((s) => ({ id: Number(s.id), title: String(s.title ?? "") }));
}

export async function listCategories(serviceId: number): Promise<Category[]> {
  const data = (await apiGet<any[]>("categories", { service_id: serviceId })) as any[];
  return data.map((c) => ({ id: Number(c.id), title: String(c.title ?? "") }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const HINT_STOPWORDS = new Set(
  "el la los las un una unos unas en de del al y o con por para que se hay son es esta este esto eso esa ese aqui hay muy mas".split(" "),
);

export interface CategorySuggestion {
  service_id: number;
  category_id: number;
  visible_name: string;
  score: number;
}

export async function suggestCategories(hint?: string, limit = 5): Promise<CategorySuggestion[]> {
  const services = await listServices();
  const all: CategorySuggestion[] = [];
  for (const s of services.slice(0, 11)) {
    try {
      const cats = await listCategories(s.id);
      for (const c of cats) all.push({ service_id: s.id, category_id: c.id, visible_name: `${s.title} — ${c.title}`, score: 0 });
    } catch {
      all.push({ service_id: s.id, category_id: 0, visible_name: s.title, score: 0 });
    }
  }
  if (!hint?.trim()) return all.slice(0, limit);
  const words = hint.toLowerCase().split(/[^a-záéíóúñü0-9]+/u).filter((w) => w.length > 2 && !HINT_STOPWORDS.has(w));
  for (const c of all) {
    const name = c.visible_name.toLowerCase();
    for (const w of words) if (name.includes(w)) c.score += 3;
  }
  all.sort((a, b) => b.score - a.score);
  return all.slice(0, limit);
}

/** Avisos del email guardado (o el indicado). */
export async function myAvisos(email?: string, skip?: number, take?: number): Promise<unknown> {
  const idn = email ? { userEmail: email } : await resolveIdentity();
  const mail = email ?? (idn as CitizenIdentity).userEmail;
  return apiGet("paginated_entries", { email: mail, skip: skip ?? 0, take: take ?? 10 });
}

// ---------------------------------------------------------------------------
// Creación
// ---------------------------------------------------------------------------

export interface CreateResult {
  dry_run: boolean;
  payload: CreatePayload;
  response?: unknown;
}

async function photoBase64(image_path?: string, image_base64?: string, file_id?: string): Promise<string> {
  const buf = await loadPhotoBuffer(image_base64, image_path, file_id);
  return buf.toString("base64");
}

export async function createAviso(input: CreateAvisoInput): Promise<CreateResult> {
  const idn = await resolveIdentity(input.identity);
  const cats = await listCategories(input.service_id);
  if (!cats.some((c) => c.id === input.category_id)) {
    throw new Error(`category_id ${input.category_id} no es del servicio ${input.service_id}. Mira list_categories.`);
  }
  const photos: string[] = [];
  for (const p of input.image_paths ?? []) photos.push(await photoBase64(p));
  const payload: CreatePayload = {
    ...authParams(),
    email: idn.userEmail.trim(),
    uuid: idn.uuid,
    platform: "mcp",
    model: "laspalmas-avisos-mcp",
    version: "0.1.0",
    phone: (idn.userPhone ?? "").trim(),
    latitude: input.lat,
    longitude: input.lon,
    service_id: input.service_id,
    category_id: input.category_id,
    address: input.address,
    description: input.description,
    supervised: 1,
    photos,
  };
  if (!input.confirm) {
    return { dry_run: true, payload: { ...payload, photos: photos.map((p) => `(base64, ${p.length} chars)`) } };
  }
  const response = await apiPost("entries", payload as unknown as Record<string, unknown>);
  return { dry_run: false, payload: { ...payload, photos: photos.map((p) => `(base64, ${p.length} chars)`) }, response };
}

// ---------------------------------------------------------------------------
// Aviso desde foto
// ---------------------------------------------------------------------------

export type FromPhotoResult =
  | {
      phase: "need_category";
      photo: PhotoInfo;
      gps: { lat: number; lon: number; from: "exif" | "manual" } | null;
      saved_image_path: string;
      suggestions: CategorySuggestion[];
      next: string;
    }
  | {
      phase: "preview";
      preview_token: string;
      photo: PhotoInfo;
      gps: { lat: number; lon: number; from: "exif" | "manual" } | null;
      saved_image_path: string;
      service_id: number;
      category_id: number;
      category_name: string;
      payload: CreatePayload;
      description_drafted: boolean;
      image_resized: boolean;
      preview_image_base64: string;
      how_to_confirm: string;
    }
  | {
      phase: "sent";
      payload: CreatePayload;
      response: unknown;
      saved_image_path: string;
      next: string;
    };

export async function createAvisoFromPhoto(input: CreateAvisoFromPhotoInput): Promise<FromPhotoResult> {
  const buf = await loadPhotoBuffer(input.image_base64, input.image_path, input.file_id);
  const small = downscaleForVision(buf);
  const photo = parsePhoto(small.resized ? small.buffer : buf);
  const saved_image_path = input.image_path ?? (input.file_id ? resolveUpload(input.file_id) : await saveUpload(buf));
  const preview_image_base64 = `data:image/jpeg;base64,${small.buffer.toString("base64")}`;

  const lat = input.lat ?? photo.gps?.lat;
  const lon = input.lon ?? photo.gps?.lng;
  const gps =
    lat !== undefined && lon !== undefined
      ? { lat, lon, from: (input.lat !== undefined ? "manual" : "exif") as "manual" | "exif" }
      : null;

  const idn = await resolveIdentity(input.identity);
  if (input.service_id === undefined || input.category_id === undefined) {
    const suggestions = await suggestCategories(input.category_hint ?? input.description);
    return {
      phase: "need_category",
      photo,
      gps,
      saved_image_path,
      suggestions,
      next: "Elige service_id + category_id de suggestions y repite. Nada se ha enviado.",
    };
  }
  const cats = await listCategories(input.service_id);
  const cat = cats.find((c) => c.id === input.category_id);
  if (!cat) throw new Error(`category_id ${input.category_id} no es del servicio ${input.service_id}.`);

  if (!input.address || gps === null) {
    throw new Error(
      "Falta ubicación: pasa address (calle y número) + lat/lon" +
        (photo.exif_warning ? ` (nota foto: ${photo.exif_warning})` : "") +
        ".",
    );
  }

  let description_drafted = false;
  let description = input.description?.trim();
  if (!description) {
    description_drafted = true;
    const when = photo.taken_at ? ` (foto del ${photo.taken_at})` : "";
    const what = input.category_hint?.trim() ? ` ${input.category_hint.trim()}` : "";
    description = `Incidencia reportada con foto${when}.${what} Revisar descripción antes de enviar.`.trim();
  }

  const b64 = buf.toString("base64");
  const payload: CreatePayload = {
    ...authParams(),
    email: idn.userEmail.trim(),
    uuid: idn.uuid,
    platform: "mcp",
    model: "laspalmas-avisos-mcp",
    version: "0.1.0",
    phone: (idn.userPhone ?? "").trim(),
    latitude: gps.lat,
    longitude: gps.lon,
    service_id: input.service_id,
    category_id: input.category_id,
    address: input.address,
    description,
    supervised: 1,
    photos: [b64],
  };
  const token = previewToken({ ...payload, photos: [b64.length] });

  if (!input.confirm) {
    return {
      phase: "preview",
      preview_token: token,
      photo,
      gps,
      saved_image_path,
      service_id: input.service_id,
      category_id: input.category_id,
      category_name: cat.title,
      payload: { ...payload, photos: [`(base64, ${b64.length} chars)`] },
      description_drafted,
      image_resized: small.resized,
      preview_image_base64,
      how_to_confirm:
        "MUESTRA este preview al humano y espera su 'sí'. Solo entonces repite la llamada con los MISMOS campos + confirm:true + human_confirmed:true + este preview_token. Si cambias cualquier campo, pide un preview nuevo.",
    };
  }
  if (input.human_confirmed !== true) {
    throw new Error("Envío bloqueado: falta la confirmación humana. Muestra el preview y repite con human_confirmed:true + preview_token.");
  }
  if (input.preview_token !== token) {
    throw new Error("preview_token inválido o desactualizado (algún campo cambió). Repite el preview. Nada se ha enviado.");
  }
  const sent = await createAviso({
    service_id: input.service_id,
    category_id: input.category_id,
    description,
    address: input.address,
    lat: gps.lat,
    lon: gps.lon,
    image_paths: [saved_image_path],
    identity: input.identity,
    confirm: true,
  });
  return { phase: "sent", payload: sent.payload, response: sent.response, saved_image_path, next: "Aviso creado. Compruébalo con my_avisos." };
}
