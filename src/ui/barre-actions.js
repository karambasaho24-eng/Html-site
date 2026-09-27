/* ---------------------------------------------------------------------------
 * La barre d'actions.
 *
 * Six gestes, toujours au même endroit, dans le même ordre : Bureau, Sac,
 * Cahier, Note, Documents, Personnes. Ce sont des objets — un sac, un cahier,
 * une feuille —, pas des rubriques. Ce que fait chacun dépend du contexte
 * (features/gestes.js) ; la barre, elle, ne bouge pas.
 * ------------------------------------------------------------------------- */
import { el, render } from "./dom.js";
import { etat, observer } from "../core/store.js";
import { ecouter } from "../core/bus.js";
import { docHote } from "../core/hote.js";
import { papiers as depotPapiers } from "../data/index.js";
import { imageDetouree } from "../features/affaires.js";
import { faireGeste } from "../features/gestes.js";
import { pictogramme } from "../features/personnes.js";

const NS = "http://www.w3.org/2000/svg";

/** Un pupitre vu de face : plateau, chant, deux pieds. */
export function pictoBureau() {
  const doc = docHote();
  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 32 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("picto-bureau");
  const d = [
    "M3 8 L29 8 L31 12 L1 12 Z",      // plateau en perspective
    "M4 12 L4 22 M28 12 L28 22",       // pieds
    "M6 12 L6 16 L26 16 L26 12"        // tiroir
  ];
  for (const trace of d) {
    const p = doc.createElementNS(NS, "path");
    p.setAttribute("d", trace);
    svg.appendChild(p);
  }
  return svg;
}

export const GESTES = [
  { cle: "bureau",    mot: "Bureau",    figure: () => pictoBureau() },
  { cle: "sac",       mot: "Sac",       image: "cartable" },
  { cle: "cahier",    mot: "Cahier",    image: "cahier" },
  { cle: "note",      mot: "Note",      image: "feuille" },
  { cle: "documents", mot: "Documents", image: "feuilles" },
  { cle: "personnes", mot: "Personnes", figure: () => pictogramme() }
];

export function construireBarreActions() {
  const noeud = el("nav.actions", { "aria-label": "Gestes" });
  let aLire = 0;

  function peindre() {
    render(noeud, GESTES.map((g) => el("button.actions__geste", {
      type: "button", dataset: { geste: g.cle },
      title: g.mot, "aria-label": g.mot,
      onclick: (e) => faireGeste(g.cle, e.currentTarget)
    },
      el("span.actions__objet",
        g.image ? el("img", { src: imageDetouree(g.image), alt: "", draggable: false }) : g.figure()),
      el("span.actions__mot", g.mot),
      g.cle === "documents" && aLire ? el("span.actions__pastille", String(aLire)) : null)));
  }

  async function compter() {
    if (!etat.utilisateur) return;
    const recus = await depotPapiers.recus(etat.utilisateur.id).catch(() => []);
    const n = recus.filter((r) => r.state === "offered").length;
    if (n !== aLire) { aLire = n; peindre(); }
  }

  peindre();
  compter();
  observer(["route"], () => { peindre(); compter(); });
  ecouter("papiers:change", compter);
  setInterval(() => { if (docHote().visibilityState !== "hidden") compter(); }, 45_000);
  return noeud;
}
