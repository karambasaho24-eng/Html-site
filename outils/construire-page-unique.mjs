/* ---------------------------------------------------------------------------
 * Assemble l'application en une page HTML autonome.
 *
 * Utile partout où l'on ne peut pas servir une arborescence de modules : une
 * page publiée sur claude.ai, une clé USB, un partage par courriel, un intranet
 * sans serveur. Le site normal, lui, continue de se déployer en multi-fichiers.
 *
 *   npx esbuild src/app.js --bundle --format=esm --target=es2020 \
 *     --outfile=.tmp/app.bundle.js
 *   node outils/construire-page-unique.mjs .tmp/app.bundle.js page-unique.html
 * ------------------------------------------------------------------------- */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [bundlePath, sortiePath = "page-unique.html", configPath] = process.argv.slice(2);

if (!bundlePath) {
  console.error("Usage : node outils/construire-page-unique.mjs <bundle.js> [sortie.html] [config.js]");
  console.error("  config.js : configuration à embarquer. Par défaut celle du dépôt —");
  console.error("  passez-en une autre pour publier une démonstration sans serveur.");
  process.exit(1);
}

const ORDRE_CSS = ["tokens", "base", "layout", "components", "notebook", "board", "live", "responsive"];
const css = ORDRE_CSS
  .map((n) => `/* ---- ${n}.css ---- */\n` + readFileSync(resolve(RACINE, "styles", `${n}.css`), "utf8"))
  .join("\n");

const source = readFileSync(resolve(RACINE, "index.html"), "utf8");

/** Une chaîne contenant </script> refermerait la balise qui l'englobe. */
const neutraliser = (js) => js.replace(/<\/script/gi, "<\\/script");

const bundle = neutraliser(readFileSync(resolve(bundlePath), "utf8"));
const config = neutraliser(readFileSync(resolve(configPath || resolve(RACINE, "config.js")), "utf8"));

/** Récupère le garde-fou de démarrage déjà écrit dans index.html. */
function extraireVeille() {
  const debut = source.indexOf("<script>\n    // Garde-fou");
  const fin = source.indexOf("</script>", debut);
  return debut < 0 ? "" : source.slice(debut, fin + 9);
}

const page = `<title>Classe Parallèle</title>

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />

<style>
${css}

/* Page autonome : on s'aligne sur la hauteur réellement disponible, le cadre
   d'accueil réservant déjà les marges de sécurité de l'appareil. */
html, body { height: 100%; }
body { margin: 0; font-family: var(--f-ui); }
.chassis { height: 100%; }
@media (pointer: coarse) {
  .btn { min-height: 38px; }
  .onglet, .rail__lien { padding-top: 10px; padding-bottom: 10px; }
}
</style>

<script>
  (function () {
    var r = document.documentElement;
    try {
      r.dataset.theme = JSON.parse(localStorage.getItem("ojm.theme") || '"nuit"');
      r.dataset.density = JSON.parse(localStorage.getItem("ojm.densite") || '"grand"');
    } catch (e) {
      r.dataset.theme = "nuit";
      r.dataset.density = "grand";
    }
  })();
</script>

<a class="skip-link" href="#vue">Aller au contenu</a>

<div id="ecran-chargement" class="boot">
  <div class="boot__mark" aria-hidden="true">CP</div>
  <p class="boot__label">Ouverture de la classe…</p>
</div>

<div id="application" hidden></div>

<div id="calque-modales" class="calque-modales"></div>
<div id="calque-toasts" class="calque-toasts" role="status" aria-live="polite"></div>

${extraireVeille()}

<script>
${config}
</script>

<script type="module">
${bundle}
</script>
`;

writeFileSync(resolve(sortiePath), page);
console.log(`${sortiePath} — ${Math.round(page.length / 1024)} Ko`);
