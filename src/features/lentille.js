/* ---------------------------------------------------------------------------
 * La lentille du liquid glass.
 *
 * Un verre qui ne fait que flouter ressemble à du plastique dépoli. Le vrai
 * liquid glass est une lentille : au centre on voit net, et près des bords le
 * fond se courbe, comme à travers l'épaisseur d'un verre arrondi.
 *
 * Pour chaque élément de verre clair, on calcule une carte de déplacement à
 * sa forme exacte (largeur, hauteur, rayon des coins) et on l'enferme dans un
 * filtre SVG. L'élément la reçoit par sa variable --lentille, que la feuille
 * liquide.css glisse dans son backdrop-filter. Les éléments de même taille
 * partagent le même filtre.
 *
 * Seuls Chrome et Edge savent appliquer un filtre SVG au fond d'un élément :
 * ailleurs on ne pose rien, et le verre reste un simple dépoli. On ne pose
 * rien non plus au-dessus de Roblox (fenêtre flottante) : le jeu passe avant.
 *
 * Le reflet, lui, marche partout : il suit le pointeur (--lx, --ly).
 * ------------------------------------------------------------------------- */
const VERRES = ".departements, .contexte__flottant, .actions, .dep-action, .btn, .puce, .onglet, .menu, .toast, .console__barre";
const NS = "http://www.w3.org/2000/svg";
const BORD = 22;          // largeur de la zone courbée, en pixels
const FORCE = 30;         // amplitude du déplacement
const TAILLE_MAX = 1400;  // au-delà, la carte coûterait trop : flou seul

let defs = null;
const filtres = new Map();           // "l×h×r" → id
let compteur = 0;

// Chrome et Edge (tous deux Chromium) ; ni Firefox ni Safari.
const chromium = () =>
  Boolean(navigator.userAgentData?.brands?.some((b) => /Chromium/i.test(b.brand))) || /Chrome\//.test(navigator.userAgent);

/** La carte : neutre (128) au centre, poussée vers l'extérieur près des bords. */
function carte(l, h, rayon) {
  const c = document.createElement("canvas");
  c.width = l; c.height = h;
  const g = c.getContext("2d");
  const img = g.createImageData(l, h);
  const bord = Math.min(BORD, h / 2, l / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      // Distance au bord le plus proche, coins arrondis compris.
      const dx = Math.max(rayon - x, 0, x - (l - rayon));
      const dy = Math.max(rayon - y, 0, y - (h - rayon));
      const d = dx > 0 && dy > 0 ? rayon - Math.hypot(dx, dy) : Math.min(x, y, l - x, h - y);
      const k = Math.max(0, 1 - d / bord);
      const f = k * k * k;
      const ax = Math.min(1, Math.abs(x - l / 2) / (l / 2));
      const ay = Math.min(1, Math.abs(y - h / 2) / (h / 2));
      const i = (y * l + x) * 4;
      img.data[i] = 128 - (x < l / 2 ? -1 : 1) * f * ax * 127;
      img.data[i + 1] = 128 - (y < h / 2 ? -1 : 1) * f * ay * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

function filtrePour(l, h, r) {
  const cle = `${l}x${h}x${r}`;
  if (filtres.has(cle)) return filtres.get(cle);
  const id = `lentille-${++compteur}`;
  const filtre = document.createElementNS(NS, "filter");
  filtre.setAttribute("id", id);
  for (const [a, v] of [["x", "0"], ["y", "0"], ["width", "100%"], ["height", "100%"], ["color-interpolation-filters", "sRGB"]]) filtre.setAttribute(a, v);
  const image = document.createElementNS(NS, "feImage");
  image.setAttribute("href", carte(l, h, r));
  image.setAttribute("preserveAspectRatio", "none");
  image.setAttribute("result", "carte");
  const courbe = document.createElementNS(NS, "feDisplacementMap");
  courbe.setAttribute("in", "SourceGraphic");
  courbe.setAttribute("in2", "carte");
  courbe.setAttribute("scale", String(FORCE));
  courbe.setAttribute("xChannelSelector", "R");
  courbe.setAttribute("yChannelSelector", "G");
  filtre.append(image, courbe);
  defs.appendChild(filtre);
  filtres.set(cle, id);
  return id;
}

/** Taille la lentille d'un élément à sa forme du moment. */
function tailler(el) {
  if (document.body.classList.contains("est-flottant")) { el.style.removeProperty("--lentille"); return; }
  const l = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (l < 8 || h < 8 || l > TAILLE_MAX || h > TAILLE_MAX) { el.style.removeProperty("--lentille"); return; }
  const r = Math.min(h / 2, l / 2, parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
  el.style.setProperty("--lentille", `url(#${filtrePour(l, h, Math.round(r))})`);
}

export function demarrerLentille() {
  // Le reflet suit le pointeur, sur le verre qu'on survole.
  document.addEventListener("pointermove", (e) => {
    const v = e.target?.closest?.(`${VERRES}, .panneau, .carte, .modale, .circuit`);
    if (!v) return;
    const b = v.getBoundingClientRect();
    v.style.setProperty("--lx", `${((e.clientX - b.left) / b.width) * 100}%`);
    v.style.setProperty("--ly", `${((e.clientY - b.top) / b.height) * 100}%`);
  }, { passive: true });

  if (!chromium() || matchMedia("(prefers-reduced-transparency: reduce)").matches) return;

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  defs = document.createElementNS(NS, "defs");
  svg.appendChild(defs);
  document.body.appendChild(svg);

  const suivis = new WeakSet();
  const taille = new ResizeObserver((entrees) => { for (const e of entrees) tailler(e.target); });
  const suivre = (racine) => {
    const liste = racine.matches?.(VERRES) ? [racine] : [];
    liste.push(...(racine.querySelectorAll?.(VERRES) || []));
    for (const el of liste) {
      if (suivis.has(el)) continue;
      suivis.add(el);
      taille.observe(el);
    }
  };
  suivre(document.body);
  new MutationObserver((mutations) => {
    for (const m of mutations) for (const n of m.addedNodes) if (n.nodeType === 1) suivre(n);
  }).observe(document.body, { childList: true, subtree: true });
}
