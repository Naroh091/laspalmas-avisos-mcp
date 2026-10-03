/**
 * Utilidades de foto para create_aviso_from_photo:
 * carga (base64 o ruta local), extracción de GPS EXIF (JPEG),
 * guardado en tmp para su uso posterior con attach_photo,
 * y token de preview para la confirmación humana en dos fases.
 */
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import exifParser from "exif-parser";
import jpeg from "jpeg-js";

export interface PhotoGps {
  lat: number;
  lng: number;
  alt?: number;
}

export interface PhotoInfo {
  width?: number;
  height?: number;
  make?: string;
  model?: string;
  /** ISO 8601 de la toma, si el EXIF la trae. */
  taken_at?: string;
  /** null si la foto no trae GPS (hay que pasar lat/lng a mano). */
  gps: PhotoGps | null;
  bytes: number;
  /** Aviso no fatal (p.ej. PNG/HEIC sin EXIF legible). */
  exif_warning?: string;
}

/** Carga la foto desde base64, ruta local o file_id (subida previa vía PUT /upload). */
export async function loadPhotoBuffer(
  image_base64?: string,
  image_path?: string,
  file_id?: string,
): Promise<Buffer> {
  const given = [image_base64, image_path, file_id].filter(Boolean).length;
  if (given > 1) throw new Error("Pasa solo una vía: image_base64, image_path o file_id.");
  if (image_base64) {
    const clean = image_base64.replace(/^data:image\/[\w+.-]+;base64,/, "").trim();
    const buf = Buffer.from(clean, "base64");
    if (!buf.length) throw new Error("image_base64 vacío o inválido.");
    return buf;
  }
  if (image_path) return readFile(image_path);
  if (file_id) return readFile(resolveUpload(file_id));
  throw new Error("Falta la foto: pasa image_base64, image_path (local) o file_id (PUT /upload).");
}

function isJpeg(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

/** Pasa DMS [g,m,s] + ref a decimal con signo. Si ya es número, exif-parser lo da en decimal con signo. */
function toDecimal(val: unknown, ref: unknown, negativeRef: string): number | null {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (Array.isArray(val) && val.length >= 2) {
    const [d = 0, m = 0, s = 0] = val.map(Number);
    if ([d, m, s].some((n) => !Number.isFinite(n))) return null;
    let dec = Math.abs(d) + Math.abs(m) / 60 + Math.abs(s) / 3600;
    if (String(ref ?? "").toUpperCase() === negativeRef) dec = -dec;
    return dec;
  }
  return null;
}

function inRange(n: number | null, min: number, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}

/** Extrae metadatos + GPS EXIF. Nunca lanza por EXIF ilegible: devuelve gps null y warning. */
export function parsePhoto(buf: Buffer): PhotoInfo {
  const info: PhotoInfo = { gps: null, bytes: buf.length };
  if (!isJpeg(buf)) {
    info.exif_warning = "No es JPEG (EXIF solo soportado en JPEG): sin GPS automático; pasa lat/lng a mano.";
    return info;
  }
  let tags: Record<string, unknown>;
  let imageSize: { height: number; width: number } | undefined;
  try {
    const r = exifParser.create(buf).parse();
    tags = r.tags as Record<string, unknown>;
    imageSize = r.imageSize;
  } catch {
    info.exif_warning = "EXIF ilegible: sin GPS automático; pasa lat/lng a mano.";
    return info;
  }
  if (imageSize) {
    info.width = imageSize.width;
    info.height = imageSize.height;
  }
  if (typeof tags["Make"] === "string") info.make = tags["Make"];
  if (typeof tags["Model"] === "string") info.model = tags["Model"];
  const ts = tags["DateTimeOriginal"] ?? tags["CreateDate"];
  if (typeof ts === "number" && Number.isFinite(ts)) info.taken_at = new Date(ts * 1000).toISOString();

  const lat = toDecimal(tags["GPSLatitude"], tags["GPSLatitudeRef"], "S");
  const lng = toDecimal(tags["GPSLongitude"], tags["GPSLongitudeRef"], "W");
  if (inRange(lat, -90, 90) && inRange(lng, -180, 180)) {
    const gps: PhotoGps = { lat, lng };
    if (typeof tags["GPSAltitude"] === "number" && Number.isFinite(tags["GPSAltitude"])) {
      gps.alt = tags["GPSAltitude"];
    }
    info.gps = gps;
  } else if (tags["GPSLatitude"] !== undefined || tags["GPSLongitude"] !== undefined) {
    info.exif_warning = "El EXIF trae GPS pero fuera de rango; pasa lat/lng a mano.";
  }
  return info;
}

function extFor(buf: Buffer): string {
  if (isJpeg(buf)) return ".jpg";
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return ".png";
  return ".bin";
}

/**
 * Guarda la foto subida en el tmp del servidor para poder referenciarla
 * después con attach_photo (que trabaja con rutas locales).
 */
export async function saveUpload(buf: Buffer): Promise<string> {
  const dir = join(tmpdir(), "laspalmas-avisos-uploads");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${randomUUID()}${extFor(buf)}`);
  await writeFile(path, buf);
  return path;
}

/** JSON canónico (claves ordenadas) para que el hash del preview sea estable entre procesos. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

/** Token que liga una confirmación con el preview exacto que vio el humano. */
export function previewToken(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

// ---------------------------------------------------------------------------
// Registro de subidas (PUT /upload): file_id -> ruta. En memoria; se invalida
// al reiniciar el servidor.
// ---------------------------------------------------------------------------
const uploadRegistry = new Map<string, string>();

export function registerUpload(absPath: string): string {
  const id = randomUUID();
  uploadRegistry.set(id, absPath);
  return id;
}

export function resolveUpload(fileId: string): string {
  if (!/^[0-9a-f-]{36}$/.test(fileId)) throw new Error("file_id inválido.");
  const p = uploadRegistry.get(fileId);
  if (!p)
    throw new Error(
      "file_id desconocido o caducado: el servidor HTTP se reinició (repite PUT /upload) o estás en stdio (usa image_path con la ruta local).",
    );
  return p;
}

// ---------------------------------------------------------------------------
// Reducción en TS (sin Pillow): el servidor reduce, el modelo solo ve la copia.
// ---------------------------------------------------------------------------
export interface Downscaled {
  buffer: Buffer;
  width: number;
  height: number;
  resized: boolean;
}

/** Dimensiones JPEG leyendo cabeceras SOF (sin decodificar). null si no es JPEG. */
function probeJpegDims(buf: Buffer): { width: number; height: number } | null {
  try {
    const tags = exifParser.create(buf).parse();
    if (tags.imageSize) return { width: tags.imageSize.width, height: tags.imageSize.height };
  } catch {
    /* no EXIF legible: se intentará decodificar igualmente */
  }
  return null;
}

/**
 * Copia los segmentos APP1 (EXIF, incluye GPS) del original al re-codificado.
 * Las dimensiones EXIF quedan obsoletas tras reducir; el GPS no se toca.
 */
function spliceExif(original: Buffer, resized: Buffer): Buffer {
  if (resized[0] !== 0xff || resized[1] !== 0xd8) return resized;
  const app1s: Buffer[] = [];
  let pos = 2;
  while (pos + 4 <= original.length) {
    if (original[pos] !== 0xff) break;
    const marker = original[pos + 1];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      pos += 2;
      continue;
    }
    const len = original.readUInt16BE(pos + 2);
    if (len < 2 || pos + 2 + len > original.length) break;
    if (marker === 0xe1) app1s.push(original.subarray(pos, pos + 2 + len));
    if (marker === 0xda) break; // SOS: empiezan los datos
    pos += 2 + len;
  }
  if (!app1s.length) return resized;
  return Buffer.concat([resized.subarray(0, 2), ...app1s, resized.subarray(2)]);
}

/**
 * Reduce la foto a lado mayor maxSide (media por cajas). Solo JPEG; el resto
 * se devuelve tal cual. El GPS se conserva copiando el APP1 original.
 */
export function downscaleForVision(buf: Buffer, maxSide = 2048, quality = 80): Downscaled {
  const dims = isJpeg(buf) ? probeJpegDims(buf) : null;
  if (!isJpeg(buf) || !dims) {
    // No JPEG o sin dimensiones legibles: se intenta decodificar; si falla, tal cual.
    try {
      const raw = jpeg.decode(buf, { maxMemoryUsageInMB: 1024 });
      if (Math.max(raw.width, raw.height) <= maxSide) {
        return { buffer: buf, width: raw.width, height: raw.height, resized: false };
      }
      return downscaleRaw(raw, maxSide, quality, buf);
    } catch {
      return { buffer: buf, width: 0, height: 0, resized: false };
    }
  }
  if (Math.max(dims.width, dims.height) <= maxSide) {
    return { buffer: buf, width: dims.width, height: dims.height, resized: false };
  }
  const raw = jpeg.decode(buf, { maxMemoryUsageInMB: 1024 });
  return downscaleRaw(raw, maxSide, quality, buf);
}

function downscaleRaw(
  raw: { data: Buffer; width: number; height: number },
  maxSide: number,
  quality: number,
  original: Buffer,
): Downscaled {
  const scale = maxSide / Math.max(raw.width, raw.height);
  const W = Math.max(1, Math.round(raw.width * scale));
  const H = Math.max(1, Math.round(raw.height * scale));
  const sx = raw.width / W;
  const sy = raw.height / H;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.min(Math.ceil((y + 1) * sy), raw.height);
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.min(Math.ceil((x + 1) * sx), raw.width);
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * raw.width + xx) * 4;
          r += raw.data[i];
          g += raw.data[i + 1];
          b += raw.data[i + 2];
          a += raw.data[i + 3];
          n++;
        }
      }
      const o = (y * W + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  const enc = jpeg.encode({ data: out, width: W, height: H }, quality);
  return { buffer: spliceExif(original, enc.data), width: W, height: H, resized: true };
}
