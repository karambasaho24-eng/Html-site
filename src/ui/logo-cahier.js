/* ---------------------------------------------------------------------------
 * Le cahier : le logo du site, et le grand dessin de l'accueil.
 *
 * Deux dessins vectoriels, sans aucune ressource externe :
 *   · logoCahier(taille)    — un petit cahier fermé (reliure, étiquette, signet),
 *                             posé devant « Classe Parallèle » ;
 *   · illustrationCahier()  — un cahier ouvert, des lignes écrites à la main
 *                             qui se tracent, un crayon.
 * ------------------------------------------------------------------------- */
const NS = "http://www.w3.org/2000/svg";
let compteur = 0;

function svg(viewBox, taille, classe, libelle) {
  const n = document.createElementNS(NS, "svg");
  n.setAttribute("viewBox", viewBox);
  if (taille) { n.setAttribute("width", String(taille)); n.setAttribute("height", String(taille)); }
  n.setAttribute("class", classe);
  n.setAttribute("role", "img");
  n.setAttribute("aria-label", libelle);
  return n;
}

/** Le petit cahier fermé. Mêmes formes que public/favicon.svg. */
export function logoCahier(taille = 30) {
  const id = `lc${++compteur}`;
  const n = svg("0 0 32 32", taille, "logo-cahier", "Classe Parallèle");
  n.innerHTML =
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">`
    + '<stop offset="0" stop-color="#fbf7ec"/><stop offset="1" stop-color="#cdc3a8"/></linearGradient></defs>'
    + `<rect x="7" y="3" width="19" height="26" rx="3" fill="url(#${id})"/>`
    + '<path d="M7 6a3 3 0 0 1 3-3h2v26h-2a3 3 0 0 1-3-3z" fill="#2c3345"/>'
    + '<rect x="14" y="8" width="9" height="6" rx="1.3" fill="#fff" stroke="#bdb293" stroke-width=".8"/>'
    + '<path d="M16 10.5h5M16 12.3h3.5" stroke="#8a7f62" stroke-width=".9" stroke-linecap="round"/>'
    + [7, 12.5, 18, 23.5].map((y) =>
        `<rect x="4.5" y="${y}" width="8" height="2.2" rx="1.1" fill="#e9e3d0" stroke="#8d8566" stroke-width=".6"/>`).join("")
    + '<path d="M21 29v3l1.6-1.2L24.2 32v-3z" fill="#c0463d"/>';
  return n;
}

/** Une ligne d'écriture à la main : une onde, `n` boucles de large. */
const onde = (x, y, n) => `M${x} ${y}q5-6 10 0` + "t10 0".repeat(Math.max(0, n - 1));

/** Le cahier ouvert de l'accueil. */
export function illustrationCahier() {
  const id = `ci${++compteur}`;
  const n = svg("0 0 400 280", null, "cahier-illu", "Un cahier ouvert");

  const lignes = (x1, x2) => [0, 1, 2, 3, 4, 5, 6].map((i) =>
    `<path d="M${x1} ${86 + i * 20}H${x2}" stroke="#aebbd3" stroke-width="1" opacity=".85"/>`).join("");
  const ecriture = (x, pas) => pas.map(([i, boucles], k) =>
    `<path class="cahier-illu__ecriture" pathLength="1" style="--d:${(0.15 + k * 0.28).toFixed(2)}s" d="${onde(x, 82 + i * 20, boucles)}"/>`).join("");

  n.innerHTML =
    '<defs>'
    + `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e6dfcb"/><stop offset=".6" stop-color="#fbf8ee"/><stop offset="1" stop-color="#efe9d6"/></linearGradient>`
    + `<linearGradient id="${id}d" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#e6dfcb"/><stop offset=".6" stop-color="#fbf8ee"/><stop offset="1" stop-color="#efe9d6"/></linearGradient>`
    + `<linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d4560"/><stop offset="1" stop-color="#1b1f2e"/></linearGradient>`
    + `<radialGradient id="${id}o" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`
    + '</defs>'
    + `<ellipse cx="200" cy="254" rx="185" ry="20" fill="url(#${id}o)"/>`
    // la couverture
    + `<path d="M16 52Q108 28 200 56Q292 28 384 52V234Q292 210 200 238Q108 210 16 234Z" fill="url(#${id}c)"/>`
    + '<path d="M16 52Q108 28 200 56Q292 28 384 52" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.5"/>'
    // la tranche des pages
    + '<path d="M30 230Q112 206 196 232M204 232Q288 206 370 230" fill="none" stroke="#d2cab2" stroke-width="2"/>'
    + '<path d="M30 226Q112 202 196 228M204 228Q288 202 370 226" fill="none" stroke="#e6dfcb" stroke-width="2"/>'
    // les deux pages
    + `<path d="M30 46Q112 26 196 52V224Q112 200 30 222Z" fill="url(#${id}g)"/>`
    + `<path d="M204 52Q288 26 370 46V222Q288 200 204 224Z" fill="url(#${id}d)"/>`
    + lignes(44, 184) + lignes(216, 358)
    + '<path d="M66 44V220" stroke="#d65a5a" stroke-width="1.2" opacity=".75"/>'
    // la page de gauche : un titre, quelques lignes
    + '<text x="76" y="80" font-size="17" fill="#25346b" font-family="\'Segoe Script\',\'Bradley Hand\',\'Comic Sans MS\',cursive" font-style="italic">Cours du jour</text>'
    + ecriture(76, [[1, 10], [2, 11], [3, 7], [5, 10], [6, 5]])
    // la page de droite : des notes
    + ecriture(222, [[0, 12], [1, 13], [2, 9], [3, 13], [4, 10], [5, 6]])
    // le signet
    + '<path d="M205 226V266L212 259L219 266V228Z" fill="#b8423b"/>'
    + '<path d="M205 226V266L212 259V227Z" fill="#000" opacity=".12"/>'
    // le crayon
    + '<g transform="translate(284 192) rotate(-32)">'
    + '<rect x="-10" y="-6" width="10" height="12" rx="3" fill="#d96e6e"/><rect x="0" y="-6" width="6" height="12" fill="#b9bfca"/>'
    + '<rect x="6" y="-6" width="72" height="12" fill="#e6b93c"/><rect x="6" y="-6" width="72" height="3.5" fill="#f4d46a"/>'
    + '<path d="M78-6L98 0L78 6Z" fill="#f0d9b1"/><path d="M92-2L98 0L92 2Z" fill="#2b2b33"/></g>';
  return n;
}
