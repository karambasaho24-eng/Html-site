/* ---------------------------------------------------------------------------
 * Construction Netlify : regroupe et compresse le JS et le CSS.
 *
 * En local rien ne change : index.html charge src/app.js et styles/*.css tels
 * quels. Au déploiement, ce script produit build/js/ (modules regroupés, un
 * morceau par écran chargé à la demande) et build/app.css, puis réécrit
 * index.html pour les charger. build/js/ est à deux niveaux de la racine,
 * comme src/data/ : les chemins `new URL("../../vendor/…", import.meta.url)`
 * restent justes. Si esbuild échoue, index.html n'est pas touché et le site
 * part non regroupé, comme avant.
 * ------------------------------------------------------------------------- */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = resolve(RACINE, "index.html");
const html = readFileSync(INDEX, "utf8");
const feuilles = [...html.matchAll(/<link rel="stylesheet" href="(styles\/[^"]+)" \/>\n/g)];

try {
  rmSync(resolve(RACINE, "build"), { recursive: true, force: true });
  const esbuild = (args) => execFileSync("npx", ["--yes", "esbuild@0.24.0", ...args, "--log-level=warning"],
    { cwd: RACINE, stdio: "inherit", shell: process.platform === "win32" });
  esbuild(["src/app.js", "--bundle", "--splitting", "--format=esm", "--minify", "--target=es2020",
    "--outdir=build/js", "--entry-names=[name]-[hash]", "--chunk-names=c-[hash]"]);
  writeFileSync(resolve(RACINE, "build/tout.css"), feuilles.map((m) => `@import "../${m[1]}";`).join("\n"));
  esbuild(["build/tout.css", "--bundle", "--minify", "--outfile=build/app.css", "--external:*.svg", "--external:*.png", "--external:*.jpg", "--external:*.woff2"]);

  const entree = readdirSync(resolve(RACINE, "build/js")).find((f) => f.startsWith("app-") && f.endsWith(".js"));
  if (!entree) throw new Error("module d'entrée introuvable");
  let sortie = html.replace('<script type="module" src="src/app.js"></script>', `<script type="module" src="build/js/${entree}"></script>`);
  feuilles.forEach((m, i) => { sortie = sortie.replace(m[0], i === 0 ? '<link rel="stylesheet" href="build/app.css" />\n' : ""); });
  if (!sortie.includes(`build/js/${entree}`) || !sortie.includes("build/app.css")) throw new Error("index.html inattendu");
  writeFileSync(INDEX, sortie);
  rmSync(resolve(RACINE, "build/tout.css"));
  console.log(`[regrouper] build/js/${entree} + build/app.css`);
} catch (err) {
  console.warn("[regrouper] échec, le site part non regroupé :", err.message);
  process.exit(0);
}
