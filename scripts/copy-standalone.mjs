/**
 * Copy the static assets into the standalone build output.
 *
 * `next build` with `output: "standalone"` writes a self-contained server into
 * `.next/standalone`, but it deliberately leaves `public/` and `.next/static`
 * behind. `npm start` runs that standalone server, so without this step the
 * app boots and serves the API and HTML, but every stylesheet and client
 * bundle 404s and the dashboard renders unstyled.
 *
 * This is a no-op on platforms that build without standalone output
 * (Netlify and Vercel set NETLIFY / VERCEL, which switches `output` off).
 */

import { cpSync, existsSync, mkdirSync } from "fs";
import path from "path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.log("[copy-standalone] no standalone build found, nothing to do.");
  process.exit(0);
}

const copies = [
  { from: path.join(root, ".next", "static"), to: path.join(standalone, ".next", "static") },
  { from: path.join(root, "public"), to: path.join(standalone, "public") },
];

for (const { from, to } of copies) {
  if (!existsSync(from)) continue;
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[copy-standalone] ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}
