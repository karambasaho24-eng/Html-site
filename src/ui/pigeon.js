/* ---------------------------------------------------------------------------
 * Le pigeon voyageur : le logo des missives de commande.
 * Dessin vectoriel, aux couleurs du thème (le trait suit la couleur du texte,
 * la missive prend le laiton).
 * ------------------------------------------------------------------------- */
const NS = "http://www.w3.org/2000/svg";

export function logoPigeon(taille = 48) {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("width", String(taille));
  svg.setAttribute("height", String(taille));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "logo-pigeon");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Pigeon voyageur");
  svg.innerHTML =
    '<path d="M9 40c5-9 15-13 24-12 3-5 9-7 14-5 2 1 3 3 3 5l6 2-6 2c-1 7-7 13-16 15-9 2-19 0-25-7z"/>'
    + '<path d="M24 31c-4-11 2-21 17-24-3 7-3 14 1 22"/>'
    + '<path d="M29 29c-1-8 2-14 8-18"/>'
    + '<path d="M10 40L3 37M10 42L2 44M12 44L6 50"/>'
    + '<circle cx="45.5" cy="26.5" r="1.4" fill="currentColor" stroke="none"/>'
    + '<path d="M56 31v5"/>'
    + '<rect x="49" y="36" width="14" height="10" rx="1.5" class="logo-pigeon__missive"/>'
    + '<path d="M49.5 37l6.5 5 6.5-5" class="logo-pigeon__rabat"/>';
  return svg;
}
