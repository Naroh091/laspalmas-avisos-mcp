/**
 * Cliente HTTP para LPGC Avisa. Clave+admin fijos en query (como la app).
 * Creación: POST JSON a `entries` (como sendIncident).
 */
import { ADMIN, API_BASE, APP_KEY } from "./config.js";

export class LasPalmasApiError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: unknown,
  ) {
    super(`Las Palmas API ${status} en ${url}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    this.name = "LasPalmasApiError";
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function withAuth(path: string, extra: Record<string, string | number> = {}): string {
  const url = new URL(path, API_BASE);
  url.searchParams.set("api_key", APP_KEY);
  url.searchParams.set("admin", ADMIN);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, String(v));
  return url.toString();
}

export async function apiGet<T = unknown>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = withAuth(path, params);
  const res = await fetch(url);
  const body = await parseBody(res);
  if (!res.ok) throw new LasPalmasApiError(res.status, url, body);
  return body as T;
}

export async function apiPost<T = unknown>(path: string, payload: Record<string, unknown>): Promise<T> {
  const url = new URL(path, API_BASE).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseBody(res);
  if (!res.ok) throw new LasPalmasApiError(res.status, url, body);
  return body as T;
}

export function authParams(): { api_key: string; admin: string } {
  return { api_key: APP_KEY, admin: ADMIN };
}
