/**
 * Configuración de LPGC Avisa (LPGC Tu Ciudad, com.inventiaplus.laspalmas v3.1.0).
 *
 * Valores extraídos del JS de la app (assets/www/build/*.js) y verificados
 * en vivo. La clave es fija y pública en el APK; el envío no lleva token de
 * sesión (la app pide login social solo como puerta local).
 */
import { homedir } from "node:os";
import { join } from "node:path";

/** Base del API (la app la llama backend_url). */
export const API_BASE =
  process.env.LASPALMAS_AVISOS_API_BASE ?? "https://backlpgctuciudad.laspalmasgc.es/api/app/";

/** Clave fija de la app (backend_api_key en el código). */
export const APP_KEY = process.env.LASPALMAS_AVISOS_APP_KEY ?? "1234567890";

/** Admin fijo de la app (backend_admin en el código). */
export const ADMIN = process.env.LASPALMAS_AVISOS_ADMIN ?? "laspalmas@inventiaplus.com";

/**
 * Perfil del comunicante (email, teléfono, idioma, uuid de dispositivo).
 * Se pregunta UNA vez y se reutiliza. Modo 0600.
 */
export const IDENTITY_STORE =
  process.env.LASPALMAS_AVISOS_IDENTITY_STORE ??
  join(homedir(), ".config", "laspalmas-avisos", "identity.json");
