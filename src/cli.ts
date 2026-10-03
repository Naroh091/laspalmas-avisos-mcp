#!/usr/bin/env node
/**
 * CLI fino sobre el mismo núcleo, para pruebas manuales.
 * Uso: laspalmas-avisos <comando> [args]
 *   identity | identity-set <email> [teléfono]
 *   services | categories <service_id> | my-avisos [email]
 *   create <service_id> <category_id> <lat> <lon> <dirección...> -- <descripción...>  (dry-run; --send envía)
 *   from-photo <image_path> [service_id] [category_id] [descripción]  (preview; --send --token <tok> --yes envía)
 *   prep-photo <in.jpg> [out.jpg]
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import {
  createAviso,
  createAvisoFromPhoto,
  getIdentity,
  listCategories,
  listServices,
  myAvisos,
  setIdentity,
} from "./avisos.js";

import { downscaleForVision, parsePhoto } from "./photo.js";

function out(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const send = args.includes("--send");
  const rest = args.filter((a) => a !== "--send");

  switch (cmd) {
    case "identity":
      return out((await getIdentity()) ?? { saved: false });
    case "identity-set":
      return out(await setIdentity({ userEmail: rest[0] ?? "", userPhone: rest[1] }));
    case "services":
      return out(await listServices());
    case "categories":
      return out(await listCategories(Number(rest[0])));
    case "my-avisos":
      return out(await myAvisos(rest[0]));
    case "create": {
      const sep = rest.indexOf("--");
      const head = sep >= 0 ? rest.slice(0, sep) : rest;
      const desc = sep >= 0 ? rest.slice(sep + 1).join(" ") : "";
      const [service_id, category_id, lat, lon, ...addr] = head;
      return out(
        await createAviso({
          service_id: Number(service_id),
          category_id: Number(category_id),
          lat: Number(lat),
          lon: Number(lon),
          address: addr.join(" "),
          description: desc,
          confirm: send,
        }),
      );
    }
    case "from-photo": {
      const tokIdx = rest.indexOf("--token");
      const token = tokIdx >= 0 ? rest[tokIdx + 1] : undefined;
      const yes = rest.includes("--yes");
      const positional = rest.filter((a, i) => {
        if (a === "--send" || a === "--yes" || a === "--token") return false;
        if (tokIdx >= 0 && i === tokIdx + 1) return false;
        return true;
      });
      return out(
        await createAvisoFromPhoto({
          image_path: positional[0],
          service_id: positional[1] ? Number(positional[1]) : undefined,
          category_id: positional[2] ? Number(positional[2]) : undefined,
          description: positional[3],
          confirm: send,
          preview_token: token,
          human_confirmed: yes,
        }),
      );
    }
    case "prep-photo": {
      const [input, output] = rest;
      if (!input) {
        console.error("Uso: prep-photo <in.jpg> [out.jpg]");
        process.exit(1);
      }
      const buf = await readFile(input);
      const before = parsePhoto(buf);
      const small = downscaleForVision(buf);
      const dst = output ?? input.replace(/(\.[a-zA-Z0-9]+)?$/, "-ligera$1");
      if (small.resized || dst !== input) await writeFile(dst, small.buffer);
      const stIn = await stat(input);
      const stOut = await stat(dst);
      return out({ ok: true, bytes_in: stIn.size, bytes_out: stOut.size, resized: small.resized, gps: before.gps });
    }
    default:
      console.error(
        "Comandos: identity | identity-set <email> [tlf] | services | categories <sid> | my-avisos [email] | create <sid> <cid> <lat> <lon> <dir> -- <desc> [--send] | from-photo <path> [sid] [cid] [desc] [--send --token <tok> --yes] | prep-photo <in> [out]",
      );
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
