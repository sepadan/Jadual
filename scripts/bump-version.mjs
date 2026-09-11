#!/usr/bin/env node
/**
 * Rewrites the release version in every place it is duplicated: module imports, HTML links,
 * the service-worker cache list and the Apps Script health payload.
 *
 *   npm run release 3.1.0
 *
 * The version must match everywhere or a phone keeps serving the previous bundle from the
 * service-worker cache, so this is a script rather than a manual edit.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const next = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(next || "")) {
  console.error("Usage: npm run release <major.minor.patch>");
  process.exit(1);
}

const files = [
  "data.js",
  "sw.js",
  "index.html",
  "app.js",
  "admin-api.js",
  "builder.js",
  "builder-relief.js",
  "pdf-import.js",
  "pdf-builder.js",
  "public-ui.css",
  "relief-engine.js",
  "relief-pdf.js",
  "relief-print.js",
  "teacher-transfer.js",
  "teacher-coverage.js",
  "jadual-app.html",
  "apps-script/Code.gs",
];

const current = readFileSync(join(root, "data.js"), "utf8").match(/APP_VERSION = "([^"]+)"/);
if (!current) throw new Error("APP_VERSION not found in data.js");
const previous = current[1];
if (previous === next) {
  console.log(`Already at ${next}.`);
  process.exit(0);
}

let touched = 0;
for (const file of files) {
  const path = join(root, file);
  const before = readFileSync(path, "utf8");
  const after = before
    .replaceAll(`?v=${previous}`, `?v=${next}`)
    .replaceAll(`APP_VERSION = "${previous}"`, `APP_VERSION = "${next}"`)
    .replaceAll(`const VERSION = "${previous}"`, `const VERSION = "${next}"`)
    .replaceAll(`version: "${previous}"`, `version: "${next}"`);
  if (after !== before) {
    writeFileSync(path, after);
    touched += 1;
    console.log(`updated ${file}`);
  }
}

const leftovers = files.filter((file) => readFileSync(join(root, file), "utf8").includes(previous));
if (leftovers.length) {
  console.error(`Version ${previous} still present in: ${leftovers.join(", ")}`);
  process.exit(1);
}
console.log(`${previous} -> ${next} across ${touched} files. Run npm test.`);
