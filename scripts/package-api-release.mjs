import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const releaseDir = join(root, "release");
const releaseName = "financial-api";
const releaseRoot = join(releaseDir, releaseName);

// O build é executado pelo script npm `package:api` antes deste arquivo.
// Evitamos chamar npm recursivamente daqui: isso era frágil no Windows
// (spawn de npm.cmd podia encerrar sem criar o artefato).
if (!existsSync(join(dist, "server.js")) || !existsSync(join(dist, "app.js"))) {
  throw new Error(
    "Build incompleto: dist/server.js ou dist/app.js não existe. Rode npm run build antes de empacotar.",
  );
}

await mkdir(releaseDir, { recursive: true });
await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });

await cp(dist, join(releaseRoot, "dist"), { recursive: true });
await cp(join(root, ".env.production.example"), join(releaseRoot, ".env.example"));

const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const releasePackage = {
  name: packageJson.name,
  version: packageJson.version,
  private: true,
  type: "module",
  engines: packageJson.engines,
  scripts: { start: "node dist/server.js" },
  dependencies: packageJson.dependencies,
};
await writeFile(
  join(releaseRoot, "package.json"),
  JSON.stringify(releasePackage, null, 2) + "\n",
);

// Mantemos o lock para instalação reproduzível com `npm ci --omit=dev`,
// mas removemos os metadados de desenvolvimento do pacote raiz do release.
const lock = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
lock.name = releasePackage.name;
lock.version = releasePackage.version;
lock.packages[""] = {
  name: releasePackage.name,
  version: releasePackage.version,
  dependencies: releasePackage.dependencies,
  engines: releasePackage.engines,
};
await writeFile(
  join(releaseRoot, "package-lock.json"),
  JSON.stringify(lock, null, 2) + "\n",
);

await writeFile(
  join(releaseRoot, "README.md"),
  `# Financial API ${releasePackage.version}\n\nArtefato mínimo de produção.\n\n1. Copie \`.env.example\` para \`.env\`.\n2. Execute \`npm ci --omit=dev\`.\n3. Execute \`npm start\`.\n\nEste diretório contém somente o runtime compilado e os manifests necessários para produção.\n`,
);

// O diretório é o artefato canônico. O ZIP é apenas uma conveniência e uma
// eventual falha na ferramenta de compressão não invalida o release.
const zipPath = join(releaseDir, `${releaseName}-v${releasePackage.version}.zip`);
await rm(zipPath, { force: true });
let zipCreated = false;

if (process.platform === "win32") {
  const escapedSource = releaseRoot.replaceAll("'", "''");
  const escapedZip = zipPath.replaceAll("'", "''");
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Compress-Archive -Path '${escapedSource}\\*' -DestinationPath '${escapedZip}' -Force`,
    ],
    { cwd: root, stdio: "inherit" },
  );
  zipCreated = result.status === 0 && existsSync(zipPath);
} else {
  const result = spawnSync("zip", ["-qr", zipPath, "."], {
    cwd: releaseRoot,
    stdio: "ignore",
  });
  zipCreated = result.status === 0 && existsSync(zipPath);
}

await writeFile(
  join(releaseDir, "RELEASE_PATH.txt"),
  `directory=${releaseRoot}\nzip=${zipCreated ? zipPath : "not-created"}\nversion=${releasePackage.version}\n`,
);

console.log("\n[package:api] Artefato criado.");
console.log(`[package:api] Pasta: ${releaseRoot}`);
console.log(`[package:api] ZIP:   ${zipCreated ? zipPath : "não gerado (a pasta está pronta)"}`);
console.log(`[package:api] Próximo: cd "${releaseRoot}"`);
console.log("[package:api] Depois: npm ci --omit=dev && npm start");
