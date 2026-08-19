import { access, readdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const releaseRoot = join(root, "release", "financial-api");

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(full)));
    else output.push(full);
  }
  return output;
}

if (!(await exists(releaseRoot))) {
  throw new Error(`Release não existe: ${releaseRoot}. Rode npm run package:api.`);
}

for (const required of [
  "dist/server.js",
  "dist/app.js",
  "package.json",
  "package-lock.json",
  ".env.example",
  "README.md",
]) {
  if (!(await exists(join(releaseRoot, required)))) {
    throw new Error(`Release incompleto: faltando ${required}`);
  }
}

const forbiddenNames = [
  "src/",
  "tests/",
  "docs/",
  "reports/",
  "coverage/",
  "node_modules/",
  "scripts/",
  "tsconfig.json",
  "tsconfig.build.json",
];
const forbiddenDistFragments = [
  "dist/routes/ai.routes.js",
  "dist/routes/finance.routes.js",
  "dist/fixtures/",
  "dist/evaluation/",
  "dist/scripts/",
  "dist/repositories/synthetic-transaction.repository.js",
  "dist/services/financial-insight.service.js",
  "dist/services/structured-financial-insight.service.js",
];

const files = await walk(releaseRoot);
const relFiles = files.map((file) => relative(releaseRoot, file).replaceAll("\\", "/"));

for (const file of relFiles) {
  if (forbiddenNames.some((name) => file === name.replace(/\/$/, "") || file.startsWith(name))) {
    throw new Error(`Arquivo de desenvolvimento vazou para o release: ${file}`);
  }
  if (forbiddenDistFragments.some((fragment) => file === fragment || file.startsWith(fragment))) {
    throw new Error(`Módulo legado vazou para dist/: ${file}`);
  }
}

const releasePackage = JSON.parse(await readFile(join(releaseRoot, "package.json"), "utf8"));
if (releasePackage.name !== "financial-api") {
  throw new Error(`Nome inesperado no release: ${releasePackage.name}`);
}
if (releasePackage.version !== packageJson.version) {
  throw new Error(`Versão divergente no release: ${releasePackage.version} != ${packageJson.version}`);
}
if (releasePackage.devDependencies) {
  throw new Error("Release package.json não deve conter devDependencies.");
}

console.log(`[verify:release] OK — ${relFiles.length} arquivos, versão ${releasePackage.version}.`);
console.log(`[verify:release] ${releaseRoot}`);
