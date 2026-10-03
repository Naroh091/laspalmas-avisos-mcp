# laspalmas-avisos-mcp

Servidor **MCP** (y CLI de apoyo) para el sistema de avisos del Ayuntamiento de Las
Palmas de Gran Canaria (LPGC Tu Ciudad / LPGC Avisa). Permite a un agente listar
servicios y categorías, consultar avisos y crear avisos con inteligencia
artificial — incluso desde una foto. La clave de app va integrada (es la de la
propia app, pública en el APK).

La finalidad de este proyecto es hacer más fácil que los ciudadanos puedan reportar
problemas al Ayuntamiento. Saca una foto de la incidencia (una papelera llena, una
acera rota, una farola apagada…), pásasela al agente pidiéndole que genere un aviso
para que describa el problema, seleccione servicio y categoría, añada la ubicación
y lance el aviso al Ayuntamiento.

- [Inicio rápido](#inicio-rápido)
- [Fotos demasiado grandes para el modelo](#fotos-demasiado-grandes-para-el-modelo)
- [¿Eres un agente IA? Lee esto primero](#eres-un-agente-ia-lee-esto-primero)
- [Añadir el MCP vía npx](#añadir-el-mcp-vía-npx)
- [Herramientas MCP](#herramientas-mcp)
- [Configuración](#configuración)
- [Uso como CLI](#uso-como-cli)
- [Servidor HTTP (opcional, avanzado)](#servidor-http-opcional-avanzado)
- [Arquitectura](#arquitectura)

## Inicio rápido

Las Palmas no usa cuentas: el API acepta la clave fija de la app y cada aviso
lleva el email y teléfono del comunicante.

1. Añade el servidor a tu cliente MCP ([ejemplos](#añadir-el-mcp-vía-npx)) o
   configúralo a mano:

```json
{
  "mcpServers": {
    "laspalmas-avisos": {
      "command": "npx",
      "args": ["-y", "laspalmas-avisos-mcp"]
    }
  }
}
```

2. Verifica: `list_services` debe devolver los 11 servicios.
3. Pregunta al humano UNA vez su email (y teléfono) y guárdalos con la tool
   `set_identity`. Se reutilizan en todos los avisos.
4. Flujo del agente: `create_aviso_from_photo` (foto → categoría → preview) →
   enseña el preview al humano → `confirm: true` + `human_confirmed: true` +
   `preview_token` solo con su "sí".

Todo corre en tu máquina; los avisos se crean con la identidad guardada.

## Fotos demasiado grandes para el modelo

Algunos modelos rechazan fotos muy grandes (`image decode limit exceeded`). El servidor
reduce en TypeScript (sin dependencias) conservando el GPS, así que el modelo nunca
necesita procesar la original:

* **Remoto (HTTP)**: sube la foto con curl y usa el `file_id` (los bytes no pasan por el
  modelo). Requiere el secreto del servidor:
  ```bash
  curl -X PUT --data-binary @foto.jpg \
    -H "Authorization: Bearer ***" \
    'http://127.0.0.1:3003/upload?filename=foto.jpg'
  # → {"file_id":"…","bytes":…}
  ```
  El preview devuelve `preview_image_base64` (copia reducida) para visión y el envío
  usa siempre la original en base64.
* **Local (stdio/CLI)**: pasa `image_path`; el servidor lee y reduce sin que el modelo
  abra el fichero. O reduce tú con `node dist/cli.js prep-photo foto.jpg [foto-ligera.jpg]`.

## ¿Eres un agente IA? Lee esto primero

La skill (`skill/SKILL.md`) no se autoinstala: cópiala al directorio de tu cliente
y abre sesión nueva.

```bash
cp -r skill ~/.hermes/skills/laspalmas-avisos        # Hermes
cp -r skill ~/.claude/skills/laspalmas-avisos        # Claude Code
# o descárgala: https://github.com/Naroh091/laspalmas-avisos-mcp/blob/main/skill/SKILL.md
```

Instálalo así (requiere Node 18+):

1. **Sin credenciales**: este MCP no necesita tokens ni cuentas. Solo el email y
   teléfono del humano (paso 3 del [inicio rápido](#inicio-rápido)).
2. **Instalación** según tu cliente ([comandos exactos](#añadir-el-mcp-vía-npx)):
   Claude Code (`claude mcp add … -- npx -y laspalmas-avisos-mcp`), Hermes
   (`hermes mcp add … --command npx … --args -y laspalmas-avisos-mcp`) u OpenClaw
   (`openclaw mcp add … --command npx --arg -y --arg laspalmas-avisos-mcp`).
3. **Identidad**: pregunta email y teléfono UNA vez y guárdalos con `set_identity`
   (verifica con `get_identity`).
4. **Verifica** (`mcp list` / `test` / `doctor --probe` según cliente): debes ver 8 tools.
5. **Uso**: hay skill completa en [`skill/SKILL.md`](skill/SKILL.md).
   Lo esencial: solo incidencias genuinas; `create_aviso_from_photo` en fases
   (categoría → preview → envío solo con "sí" humano + `confirm` +
   `human_confirmed` + `preview_token`); foto por `file_id`; la dirección es texto
   libre y las coordenadas van en el aviso.

## Añadir el MCP vía npx

Requiere Node 18+.

### Claude Code

```bash
claude mcp add laspalmas-avisos -- npx -y laspalmas-avisos-mcp
claude mcp list   # verificar
```

### Hermes

```bash
hermes mcp add laspalmas-avisos --command npx --args -y laspalmas-avisos-mcp
hermes mcp test laspalmas-avisos   # verificar (lista las 8 tools)
```

### OpenClaw

```bash
openclaw mcp add laspalmas-avisos \
  --command npx \
  --arg -y \
  --arg laspalmas-avisos-mcp
openclaw mcp doctor laspalmas-avisos --probe   # verificar
```

### Desde código

```bash
npm install
npm run build
npx -y -p laspalmas-avisos-mcp laspalmas-avisos-mcp-http   # HTTP en 127.0.0.1:3003/mcp
```

## Herramientas MCP

| Tool | Qué hace |
|---|---|
| `get_identity` | Identidad guardada (email, teléfono, uuid) o null. |
| `set_identity` | Guarda email y teléfono (se preguntan una vez). |
| `list_services` | Servicios de LPGC Avisa (id + título). |
| `list_categories` | Categorías de un servicio (id + título). |
| `suggest_categories` | Sugiere servicio + categoría por palabras. |
| `my_avisos` | Avisos del email guardado (o el indicado). |
| `create_aviso` | Crea un aviso. **Dry-run por defecto**; `confirm: true` para enviar. |
| `create_aviso_from_photo` | Aviso desde foto en fases: categoría → preview (GPS EXIF) y envío solo con `confirm: true` + `human_confirmed: true` + `preview_token`. Acepta `image_base64`, `image_path` o `file_id`. |

### Seguridad de envío

`create_aviso` es **dry-run por defecto**: devuelve el payload **sin crear nada**. Solo con
`confirm: true` hace el POST real — un aviso real que revisa personal municipal.
Envía únicamente incidencias reales.

`create_aviso_from_photo` exige confirmación humana en fases:

1. **Categoría** (sin `service_id`/`category_id`): sugiere y no envía nada.
2. **Preview** (`confirm` ausente/false): GPS EXIF (o `lat`/`lon` manuales),
   dirección en texto libre, payload + `preview_token`. No envía nada.
3. **Envío**: el agente muestra el preview al humano y espera su "sí"; solo entonces
   repite la llamada con los MISMOS campos + `confirm: true` + `human_confirmed: true` +
   `preview_token`. Si cambió cualquier campo, hay que repetir el preview.

## Uso como CLI

```bash
node dist/cli.js services
node dist/cli.js categories 7
node dist/cli.js identity-set nombre@example.com 612345678
node dist/cli.js my-avisos
node dist/cli.js create 7 33 28.1235 -15.4363 "Calle Triana 1" -- "Papelera llena"          # dry-run
node dist/cli.js create 7 33 28.1235 -15.4363 "Calle Triana 1" -- "Papelera llena" --send   # ENVÍA de verdad
node dist/cli.js from-photo foto.jpg 7 33 "Papelera llena"      # preview desde foto
node dist/cli.js prep-photo foto.jpg [foto-ligera.jpg]   # reduce para el modelo, conserva EXIF/GPS
```

## Servidor HTTP (opcional)

Por stdio cada uno corre su copia. La entrada **HTTP** sirve para exponer el servidor
que corre en TU máquina para que un agente en OTRA máquina lo use.

```bash
export LASPALMAS_AVISOS_MCP_SECRET=<un-secreto-largo>            # exige x-mcp-secret o Bearer
export LASPALMAS_AVISOS_ALLOWED_HOSTS=tu-host.tu-tailnet.ts.net  # anti DNS-rebinding
npm run start:http     # 127.0.0.1:3003/mcp
```

Variables: `LASPALMAS_AVISOS_HTTP_PORT` (3003), `LASPALMAS_AVISOS_HTTP_HOST` (127.0.0.1),
`LASPALMAS_AVISOS_HTTP_PATH` (/mcp). Expón solo en red privada (p.ej. `tailscale serve`,
nunca `funnel`). Para persistencia, `launchd`/`pm2`/`tmux` o similar.

## Arquitectura

- `src/client.ts` — REST con clave+admin en query; POST JSON a `entries`.
- `src/identity.ts` — email/teléfono/uuid en JSON local (0600).
- `src/avisos.ts` — **núcleo** (servicios, categorías, mis avisos por email,
  creación con `service_id/category_id/address/description/lat/lon/photos`).
- `src/photo.ts` — foto: EXIF/GPS, subida a tmp, token de preview.
- `src/types.ts` — esquemas zod de entrada + payload de creación.
- `src/mcp.ts` — `buildServer()`: registra las 8 tools (compartido por stdio y HTTP).
- `src/server.ts` — entrada stdio · `src/http.ts` — entrada HTTP (`/mcp` + `PUT /upload`) · `src/cli.ts` — CLI.

## Notas

- Ingeniería inversa del APK `com.inventiaplus.laspalmas` v3.1.0 + verificación en
  vivo de lecturas y dry-runs (sin crear avisos reales).
