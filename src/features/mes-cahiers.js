/* ---------------------------------------------------------------------------
 * Mes cahiers : les voir d'un coup d'œil, choisir leur couverture, en
 * prendre un neuf.
 *
 * À la première visite on y passe juste après s'être habillé : on n'arrive
 * pas en classe les mains vides. Un cahier neuf est posé sur le bureau de la
 * chambre ; on le met dans son sac pour l'emporter.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { emettre } from "../core/bus.js";
import { cahiers, pages } from "../data/index.js";
import { ouvrirModale } from "../ui/modal.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";
import { CAPACITE_SUPPORT } from "./editeur-cahier.js";

export const COUVERTURES = [
  { cle: "cuir",      libelle: "Cuir",      fond: "linear-gradient(160deg, #4a3527, #2c1f16)" },
  { cle: "parchment", libelle: "Parchemin", fond: "linear-gradient(160deg, #e8dcc4, #cbb994)" },
  { cle: "ardoise",   libelle: "Ardoise",   fond: "linear-gradient(160deg, #3d525c, #22303a)" },
  { cle: "olive",     libelle: "Olive",     fond: "linear-gradient(160deg, #6f7d4d, #3f4a2b)" },
  { cle: "oxblood",   libelle: "Bordeaux",  fond: "linear-gradient(160deg, #7c3a3a, #4a2020)" },
  { cle: "encre",     libelle: "Encre",     fond: "linear-gradient(160deg, #2a323a, #14181d)" }
];
const fondDe = (cle) => (COUVERTURES.find((c) => c.cle === cle) || COUVERTURES[1]).fond;

const SUPPORTS = [
  { cle: "cahier",  libelle: "Cahier",  aide: "10 pages" },
  { cle: "carnet",  libelle: "Carnet",  aide: "20 pages, de poche" },
  { cle: "dossier", libelle: "Dossier", aide: "30 pages classées" },
  { cle: "feuille", libelle: "Feuille", aide: "Une page, à donner" }
];

export async function ouvrirMesCahiers({ bienvenue = false } = {}) {
  const moi = etat.utilisateur?.id;
  if (!moi) return false;
  let liste = await cahiers.mesCahiers(moi).catch(() => []);
  const neuf = { support: "cahier", cover: "cuir", titre: "" };
  let change = false;
  const zone = el("div.mes-cahiers");

  const nuancier = (courante, choisir) => el("div.mes-cahiers__nuancier",
    COUVERTURES.map((c) => el("button.mes-cahiers__teinte", {
      type: "button", title: c.libelle, "aria-label": c.libelle, "aria-pressed": String(courante === c.cle),
      style: { background: c.fond }, onclick: () => choisir(c.cle)
    })));

  function peindre() {
    render(zone,
      liste.length ? el("section.mes-cahiers__groupe",
        el("h3.apparence__titre", "Ceux que j'ai"),
        el("div.mes-cahiers__liste", liste.map((c) => el("div.mes-cahiers__cahier",
          el("span.mes-cahiers__couv", { style: { background: fondDe(c.cover) } },
            el("span.mes-cahiers__etiquette", c.title)),
          el("div.mes-cahiers__infos",
            el("b", c.title),
            el("span.petit.faible", SUPPORTS.find((s) => s.cle === (c.support || "cahier"))?.libelle || "Cahier"),
            nuancier(c.cover, async (cle) => {
              try {
                await cahiers.majorer(c.id, { cover: cle });
                c.cover = cle; change = true; peindre();
              } catch (err) { erreur("Impossible", messageErreur(err)); }
            })))))) : null,

      el("section.mes-cahiers__groupe.mes-cahiers__groupe--neuf",
        el("h3.apparence__titre", liste.length ? "En prendre un neuf" : "Votre premier cahier"),
        el("div.mes-cahiers__neuf",
          el("span.mes-cahiers__couv.mes-cahiers__couv--grand", { style: { background: fondDe(neuf.cover) } },
            el("span.mes-cahiers__etiquette", neuf.titre || "Cahier")),
          el("div.mes-cahiers__formulaire",
            el("div.mes-cahiers__supports", SUPPORTS.map((s) => el("button.apparence__coupe", {
              type: "button", "aria-pressed": String(neuf.support === s.cle), title: s.aide,
              onclick: () => { neuf.support = s.cle; peindre(); }
            }, s.libelle))),
            el("input.saisie", {
              name: "titre-cahier", maxlength: 40, value: neuf.titre,
              placeholder: "Titre — « Droit pénal », « Stratégie »…",
              oninput: (e) => {
                neuf.titre = e.target.value;
                zone.querySelector(".mes-cahiers__couv--grand .mes-cahiers__etiquette").textContent = neuf.titre || "Cahier";
              }
            }),
            nuancier(neuf.cover, (cle) => { neuf.cover = cle; peindre(); }),
            el("button.btn.btn--primaire", { type: "button", onclick: prendre }, icone("plus", 14), "Le prendre")))));
  }

  async function prendre() {
    const support = neuf.support;
    const titre = neuf.titre.trim() || SUPPORTS.find((s) => s.cle === support).libelle;
    try {
      const c = await cahiers.creer({
        owner_id: moi, kind: "personal", class_id: null,
        title: titre, subtitle: null, cover: neuf.cover,
        color: "olive", icon: "book", collaborative: false,
        support, max_pages: CAPACITE_SUPPORT[support] || 10
      });
      await pages.creer(c.id, { title: support === "feuille" ? "Feuille" : "Page 1", created_by: moi }).catch(() => {});
      liste = [c, ...liste];
      neuf.titre = "";
      change = true;
      succes(`${titre} : posé sur votre bureau`, "Mettez-le dans votre sac pour l'emporter en classe.");
      peindre();
    } catch (err) {
      erreur("Impossible", messageErreur(err));
    }
  }

  peindre();
  await ouvrirModale({
    titre: bienvenue ? "Et vos cahiers ?" : "Mes cahiers",
    large: true,
    corps: () => el("div",
      bienvenue ? el("p.petit.faible", "Choisissez-en un ou deux pour commencer. Vous en reprendrez quand vous voudrez, depuis « Mes cahiers ».") : null,
      zone),
    actions: [{ libelle: bienvenue ? "C'est bon" : "Fermer", variante: "primaire", valeur: true }]
  });
  if (change) emettre("cahiers:change");
  return change;
}
