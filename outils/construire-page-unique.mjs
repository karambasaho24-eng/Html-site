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
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
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

const ORDRE_CSS = ["tokens", "base", "layout", "components", "notebook", "objets", "board", "live", "scene", "monde", "responsive"];
const css = ORDRE_CSS
  .map((n) => `/* ---- ${n}.css ---- */\n` + readFileSync(resolve(RACINE, "styles", `${n}.css`), "utf8"))
  .join("\n");

const source = readFileSync(resolve(RACINE, "index.html"), "utf8");

/**
 * Les dessins des objets, embarqués.
 *
 * La page autonome n'a pas de fichiers à côté : `assets/objets/plume.svg`
 * n'existe pas, et le cartable se serait ouvert sur des cases vides. On les
 * transporte donc dans la page, en data-uri, et `imageObjet()` les y trouve.
 * Ce sont des vecteurs : les trente-sept pèsent moins qu'une photographie.
 */
function embarquerObjets() {
  const dossier = resolve(RACINE, "assets", "objets");
  const carte = {};
  for (const fichier of readdirSync(dossier)) {
    if (!fichier.endsWith(".svg")) continue;
    const svg = readFileSync(resolve(dossier, fichier), "utf8")
      .replace(/\n\s*/g, " ").trim();
    carte[fichier.replace(/\.svg$/, "")] =
      "data:image/svg+xml," + encodeURIComponent(svg);
  }
  // Les photographies ensuite : elles prennent le pas sur le dessin du meme
  // nom, exactement comme dans imageObjet().
  const photos = resolve(dossier, "photos");
  try {
    for (const fichier of readdirSync(photos)) {
      if (!fichier.endsWith(".jpg")) continue;
      carte[fichier.replace(/\.jpg$/, "")] =
        "data:image/jpeg;base64," + readFileSync(resolve(photos, fichier)).toString("base64");
    }
  } catch { /* pas de photographies : les dessins suffisent */ }
  // Et les objets détourés, qu'on pose dans les contenants.
  try {
    const detoures = resolve(dossier, "detoures");
    for (const fichier of readdirSync(detoures)) {
      if (!fichier.endsWith(".webp")) continue;
      carte["detoure:" + fichier.replace(/\.webp$/, "")] =
        "data:image/webp;base64," + readFileSync(resolve(detoures, fichier)).toString("base64");
    }
  } catch { /* pas d'objets détourés */ }
  try {
    const sansFond = resolve(dossier, "sans-fond");
    for (const fichier of readdirSync(sansFond)) {
      if (!fichier.endsWith(".svg")) continue;
      const svg = readFileSync(resolve(sansFond, fichier), "utf8").replace(/\n\s*/g, " ").trim();
      carte["sans-fond:" + fichier.replace(/\.svg$/, "")] = "data:image/svg+xml," + encodeURIComponent(svg);
    }
  } catch { /* pas de dessins sans fond */ }
  // Les gabarits des tenues fournies en images (vestes, pantalons).
  try {
    const tenues = resolve(RACINE, "assets", "tenues");
    for (const fichier of readdirSync(tenues)) {
      if (!fichier.endsWith(".png")) continue;
      carte["tenue:" + fichier.replace(/\.png$/, "")] =
        "data:image/png;base64," + readFileSync(resolve(tenues, fichier)).toString("base64");
    }
  } catch { /* pas de tenues en images */ }
  return carte;
}

/** Une chaîne contenant </script> refermerait la balise qui l'englobe. */
const neutraliser = (js) => js.replace(/<\/script/gi, "<\\/script");

const bundle = neutraliser(readFileSync(resolve(bundlePath), "utf8"));
const config = neutraliser(readFileSync(resolve(configPath || resolve(RACINE, "config.js")), "utf8"));

/**
 * Le garde-fou de démarrage. Il vit dans son propre fichier — la politique de
 * sécurité du site refuse les scripts écrits dans la page — mais la page
 * autonome, elle, n'a pas de fichiers à côté : on le remet en ligne ici.
 */
function extraireVeille() {
  try {
    return `<script>\n${neutraliser(readFileSync(resolve(RACINE, "boot.js"), "utf8"))}\n<\/script>`;
  } catch {
    return "";
  }
}

/* Sans cette ligne, le navigateur lit la page en latin-1 : les accents
   passent encore, mais pas les caractères combinants d'une expression
   régulière — et la recherche insensible aux accents plantait au démarrage.
   Elle doit rester la toute première chose du document. */
const page = `<meta charset="utf-8" />
<title>Classe Parallèle</title>

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Caveat:wght@500;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />

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

<script>
window.__OJM_OBJETS__ = ${neutraliser(JSON.stringify(embarquerObjets()))};
</script>

<script type="module">
${bundle}
</script>
`;

writeFileSync(resolve(sortiePath), page);
console.log(`${sortiePath} — ${Math.round(page.length / 1024)} Ko`);
