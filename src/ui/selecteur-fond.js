/* ---------------------------------------------------------------------------
 * Le panneau « fond d'écran » : choisir une image, la retirer, régler
 * l'assombrissement. Le même panneau sert à l'administration (fond du site,
 * pour tout le monde) et aux Réglages (fond de ce poste seulement).
 *
 *   lire()   → { fond, voile }       l'état courant
 *   ecrire() ← { fond?, voile? }     enregistre (peut renvoyer false si impossible)
 * Les classes (.panel, .btn, .fld, .swt…) viennent de waitlist.css.
 * ------------------------------------------------------------------------- */
import { el, render } from "./dom.js";
import { fondValide, lireImage } from "../features/apparence.js";
import { succes, erreur } from "./toast.js";

export function panneauFond({ titre, aide, lire, ecrire, octetsMax, lien = false, voile: avecVoile = true }) {
  const corps = el("div.pile");
  const noeud = el("div.panel.own", el("h2", { style: { margin: 0 } }, titre), corps);

  async function choisir(fichier) {
    try {
      const image = await lireImage(fichier, { octetsMax });
      if (await ecrire({ fond: image }) === false) throw new Error("Ce navigateur n'a plus assez de place pour garder l'image.");
      succes("Fond d'écran changé");
      peindre();
    } catch (err) { erreur("Fond d'écran", err.message || String(err)); }
  }

  function peindre() {
    const { fond, voile } = lire();
    const entree = el("input", { type: "file", accept: "image/*", hidden: true, onchange: (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) choisir(f); } });
    const champLien = lien ? el("input", {
      type: "url", placeholder: "https://… (lien direct vers une image)", "aria-label": "Lien d'une image",
      value: /^https:/.test(fond) ? fond : ""
    }) : null;

    render(corps,
      aide ? el("p.tx", aide) : null,
      fond ? el("div.fond-apercu", { style: { backgroundImage: `url("${fond}")` }, role: "img", "aria-label": "Fond actuel" }) : el("p.tx", "Aucune image : fond sombre uni."),
      el("div.chips",
        el("button.btn", { type: "button", onclick: () => entree.click() }, fond ? "Changer l'image…" : "Choisir une image…"),
        fond ? el("button.btn.ghost", { type: "button", onclick: async () => { await ecrire({ fond: "" }); peindre(); } }, "Retirer l'image") : null,
        entree),
      champLien ? el("div.add",
        champLien,
        el("button.btn.txt", { type: "button", onclick: async () => {
          const v = champLien.value.trim();
          if (!fondValide(v)) { erreur("Lien refusé", "Il faut un lien https:// qui mène directement à une image."); return; }
          await ecrire({ fond: v }); peindre();
        } }, "Utiliser ce lien")) : null,
      avecVoile ? el("div.fld",
        el("span.lbl", el("label", { for: "fond-voile" }, "Assombrissement")),
        el("input", { id: "fond-voile", type: "range", min: "0", max: "90", step: "1", value: String(voile),
          oninput: (e) => ecrire({ voile: Number(e.target.value) }) })) : null);
  }
  peindre();
  return noeud;
}
