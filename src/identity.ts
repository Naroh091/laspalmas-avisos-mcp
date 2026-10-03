/**
 * Perfil del comunicante: email + teléfono (del formulario) y uuid de
 * dispositivo (la app manda device.uuid; aquí se genera uno estable local).
 * Se pregunta UNA vez y se guarda en JSON local (0600).
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { IDENTITY_STORE } from "./config.js";

export type Lang = "es";

export interface CitizenIdentity {
  userEmail: string;
  userPhone?: string;
  lang: Lang;
  /** UUID estable de este cliente (device.uuid en la app). */
  uuid: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^(\+34|0034|34)?[6789][0-9]{8}$/;

export function validateIdentity(i: CitizenIdentity): string[] {
  const errors: string[] = [];
  if (!i.userEmail?.trim() || !EMAIL_RE.test(i.userEmail.trim())) {
    errors.push("userEmail: introduce un email válido (identifica tus avisos).");
  }
  if (i.userPhone?.trim() && !PHONE_RE.test(i.userPhone.trim())) {
    errors.push("userPhone: introduce un teléfono español válido.");
  }
  return errors;
}

export async function loadIdentity(store = IDENTITY_STORE): Promise<CitizenIdentity | null> {
  try {
    const raw = await readFile(store, "utf8");
    return JSON.parse(raw) as CitizenIdentity;
  } catch {
    return null;
  }
}

export async function saveIdentity(
  identity: Omit<CitizenIdentity, "uuid"> & { uuid?: string },
  store = IDENTITY_STORE,
): Promise<CitizenIdentity> {
  const full: CitizenIdentity = { ...identity, lang: "es", uuid: identity.uuid ?? (await loadIdentity(store))?.uuid ?? randomUUID() };
  const errors = validateIdentity(full);
  if (errors.length) throw new Error(`Identidad inválida: ${errors.join(" ")}`);
  await mkdir(dirname(store), { recursive: true });
  await writeFile(store, JSON.stringify(full, null, 2), { mode: 0o600 });
  return full;
}
