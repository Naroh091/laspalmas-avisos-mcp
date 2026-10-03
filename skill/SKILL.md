---
name: laspalmas-avisos
description: "Crea avisos al Ayto. de Las Palmas de Gran Canaria desde una foto"
version: 0.1.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [laspalmas, avisos, ayuntamiento, incidencias, mcp]
    category: civic
---

# Avisos Las Palmas — incidencias desde una foto

Servidor MCP `laspalmas-avisos` (8 tools, prefijo `mcp__laspalmas_avisos__`).
La clave de app va integrada
(es la de la propia app, pública en el APK). Todo aviso que crees es REAL.
**Solo incidencias genuinas. Nada de pruebas.**

## When to Use

Foto de incidencia en Las Palmas de Gran Canaria + petición de avisar al
Ayuntamiento. Usa SOLO imagen + tools `mcp__laspalmas_avisos__*`. NO explores
la máquina.

## Setup (una sola vez)

Pide UNA vez y guarda con `set_identity`:

- `userEmail`: identifica tus avisos (obligatorio).
- `userPhone`: teléfono español (opcional pero recomendado; la app lo manda).

El servidor genera un uuid estable de dispositivo y lo reutiliza. Comprueba con
`get_identity`; si es `null`, pregunta antes de seguir. No hay login social que
configurar en el servidor (la app lo pide solo como puerta local).

## Procedure

### 0. Foto

NO abras la original con visión: usa `preview_image_base64`. En stdio local
`image_path`; en remoto `PUT /upload` + `file_id`; `image_base64` solo para
fotos pequeñas visibles. Sin GPS EXIF no adivines: pide dirección + `lat`/`lon`
(la dirección es texto libre; no hay callejero propio, usa tu geocodificación).

### 1. Categoría

`create_aviso_from_photo` con la foto + `category_hint`. `need_category` →
enseña `suggestions` (`service_id` + `category_id`, p.ej. servicio 7 Papeleras
y contenedores) y repite. Lista en `list_services` + `list_categories`.

### 2. Preview (NUNCA envía nada)

Con servicio + categoría + `address` + `lat`/`lon` responde `preview`.
Enséñalo al humano (categoría, dirección, coords, descripción, email) y guarda
el `preview_token`: cualquier cambio exige preview nuevo. Descripción
pre-rellenada (`description_drafted: true`) la revisa el humano. Mira
`my_avisos` por si ya existe el mismo hecho.

### 3. Envío (solo con el "sí" explícito)

MISMOS campos + `confirm: true` + `human_confirmed: true` + `preview_token`.
Sin las tres, bloquea. Solo `phase: "sent"` acredita el envío. Las fotos viajan
en el mismo POST (base64).

## Pitfalls

- Sin identidad (`get_identity` → null) las tools fallan: `set_identity` primero.
- `category_id` debe ser del `service_id` elegido (la tool lo valida).
- `my_avisos`: el servidor a veces responde 404 para emails sin avisos y
  200-vacío para otros; propaga lo que diga, no lo maquilles.
- El POST de creación aún no se ha estrenado: avisa antes del primer envío.

## Verification

- `list_services` → 11 servicios; `list_categories` por servicio.
- `my_avisos` con un email cualquiera devuelve `{"total":0,"entries":[]}` o 404.
