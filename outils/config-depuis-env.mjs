/* ---------------------------------------------------------------------------
 * Écrit config.js à partir des variables d'environnement.
 *
 * Le site est statique : rien ne lit les variables d'un hébergeur à
 * l'exécution. Elles ne valent donc quelque chose que si une étape de
 * construction les dépose dans un fichier que le navigateur ira chercher.
 * C'est tout ce que fait ce script, et il ne fait que ça.
 *
 * Sans variables, il ne touche à rien : le config.js du dépôt reste en place,
 * ce qui garde le dépôt-glisser-déposer et l'ouverture en local fonctionnels.
 *
 * Aucune de ces valeurs n'est secrète. L'URL et la clé « publishable »
 * voyagent dans chaque requête du navigateur ; la sécurité tient aux
 * politiques RLS, jamais au secret de ces deux chaînes. Une clé de service
 * (service_role / sb_secret_…) n'a rien à faire ici : elle contournerait la
 * RLS et donnerait un accès total à n'importe quel visiteur.
 * ------------------------------------------------------------------------- */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CIBLE = resolve(RACINE, "config.js");

const env = process.env;
const url = (env.SUPABASE_URL || "").trim();
const cle = (env.SUPABASE_ANON_KEY || "").trim();

if (!url || !cle) {
  console.log("[config] SUPABASE_URL / SUPABASE_ANON_KEY absentes — "
    + "config.js du dépôt conservé tel quel.");
  process.exit(0);
}

if (/^sb_secret_|^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(cle) && cle.includes("service_role")) {
  console.error("[config] Cette clé ressemble à une clé de service. Refus : "
    + "elle contournerait la RLS. Utilisez la clé « publishable ».");
  process.exit(1);
}

const echapper = (v) => String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

let lexique = {};
if (env.ACADEMY_LEXIQUE) {
  try { lexique = JSON.parse(env.ACADEMY_LEXIQUE); }
  catch { console.warn("[config] ACADEMY_LEXIQUE illisible, ignoré."); }
}

const contenu = `/* ---------------------------------------------------------------------------
 * CLASSE PARALLÈLE — Configuration publique
 *
 * Fichier ENGENDRÉ à la construction par outils/config-depuis-env.mjs, à
 * partir des variables d'environnement de l'hébergeur. Ne pas le modifier
 * ici : la prochaine construction l'écraserait. Changez les variables.
 * ------------------------------------------------------------------------- */
window.OJM_CONFIG = {
  supabaseUrl: "${echapper(url)}",
  supabaseAnonKey: "${echapper(cle)}",
  academyName: "${echapper(env.ACADEMY_NAME || "Classe Parallèle")}",
  academyMotto: "${echapper(env.ACADEMY_MOTTO || "L'école qui tourne à côté du jeu")}",
  lexique: ${JSON.stringify(lexique)}
};
`;

const avant = (() => { try { return readFileSync(CIBLE, "utf8"); } catch { return ""; } })();
writeFileSync(CIBLE, contenu);

console.log(`[config] config.js engendré depuis l'environnement (${url}).`);
if (avant && !avant.includes(url)) {
  console.log("[config] L'URL diffère de celle qui était versionnée.");
}
