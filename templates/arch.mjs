import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcDir = path.join(root, "src");
const depcruise = path.join(root, "node_modules/dependency-cruiser");

if (
  fs.existsSync(depcruise) &&
  fs.existsSync(path.join(root, ".dependency-cruiser.cjs"))
) {
  const result = spawnSync(
    "npx",
    ["depcruise", "--config", ".dependency-cruiser.cjs", "src"],
    { cwd: root, stdio: "inherit", shell: true },
  );
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(srcDir)) {
  console.error("arch: src is missing");
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(mjs|cjs|js|ts|tsx|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const importRe = /(?:from\s+|import\s*\(\s*|require\(\s*)["']([^"']+)["']/g;
const forbiddenTargets = new Set(["ui", "app", "pages", "api"]);

function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    ...[".ts", ".tsx", ".js", ".mjs", ".jsx"].map((ext) => base + ext),
    ...["/index.ts", "/index.js", "/index.mjs"].map((ext) => base + ext),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function topFolder(file) {
  return path.relative(srcDir, file).split(path.sep)[0];
}

const files = walk(srcDir);
const graph = new Map(files.map((file) => [file, []]));
const errors = [];

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(importRe)) {
    const resolved = resolveImport(file, match[1]);
    if (!resolved || !graph.has(resolved)) continue;
    graph.get(file).push(resolved);
    if (
      topFolder(file) === "domain" &&
      forbiddenTargets.has(topFolder(resolved))
    ) {
      errors.push(
        `domain-must-not-import-${topFolder(resolved)}: ${path.relative(root, file)} -> ${path.relative(root, resolved)}`,
      );
    }
  }
}

const color = new Map();
function visit(node) {
  color.set(node, 1);
  for (const next of graph.get(node) ?? []) {
    if (color.get(next) === 1) {
      errors.push(
        `no-circular: ${path.relative(root, node)} -> ${path.relative(root, next)}`,
      );
    } else if (!color.has(next)) visit(next);
  }
  color.set(node, 2);
}
for (const file of files) if (!color.has(file)) visit(file);

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  "arch: ok (built-in; install dependency-cruiser to use the config)",
);
