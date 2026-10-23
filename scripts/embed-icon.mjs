// Embeds assets/icon.png into package.json's magpie.icon as a data: URI.
//
// magpie's `magpie.icon` accepts either an https URL or a `data:image/…` URI
// (max 1 MB). It does NOT resolve relative paths inside the package, so the
// icon has to be inlined to stay self-contained.
//
// Usage:  bun scripts/embed-icon.mjs      (or: node scripts/embed-icon.mjs)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ICON = "assets/icon.png";
const MIME = { ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };

const ext = ICON.slice(ICON.lastIndexOf("."));
const mime = MIME[ext];
if (!mime) throw new Error(`unsupported icon type: ${ext}`);

const bytes = await readFile(join(root, ICON));
const uri = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
pkg.magpie ??= {};
pkg.magpie.icon = uri;
await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`${ICON} → package.json magpie.icon (${bytes.length} bytes, ${uri.length} chars)`);
