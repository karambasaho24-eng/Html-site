/* ---------------------------------------------------------------------------
 * Où cela se passe.
 *
 * Une remise de papier dit où elle a eu lieu : celui qui tend le dit, celui
 * qui reçoit le dit aussi. Deux lieux qui ne concordent pas, c'est ce que la
 * modération regarde en premier.
 *
 * On propose les lieux du monde — les districts des trois murs, les
 * quartiers généraux, les lieux qu'on fréquente — sans rien imposer : un
 * lieu se tape aussi librement. Les derniers lieux employés reviennent en
 * tête, parce qu'on joue souvent au même endroit.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { local } from "../core/util.js";

export const LIEUX = [
  { groupe: "Mur Sina", lieux: [
    "Mitras — capitale royale", "Palais royal de Mitras", "Ville souterraine de Mitras",
    "Tribunal militaire de Mitras", "Stohess — district", "QG des Brigades spéciales (Stohess)",
    "Ehrmich — district", "Yarckel — district", "Orvud — district"
  ] },
  { groupe: "Mur Rose", lieux: [
    "Trost — district", "Porte de Trost", "Marché de Trost", "QG de la Garnison (Trost)",
    "Karanes — district", "Krolva — district", "Château d'Utgard",
    "Camp d'entraînement de la 104e brigade", "QG du Bataillon d'exploration",
    "Ancien QG du Bataillon d'exploration"
  ] },
  { groupe: "Mur Maria", lieux: [
    "Shiganshina — district", "Porte de Shiganshina", "Quinta — district", "Forêt des arbres géants"
  ] },
  { groupe: "Partout", lieux: [
    "Église du Culte des Murs", "Taverne", "Caserne", "Infirmerie", "Remparts", "Place du marché",
    "Ruelle", "Écuries", "Salle de classe", "Salle de réunion"
  ] }
];

const TOUS = LIEUX.flatMap((g) => g.lieux);
const CLE_RECENTS = "ojm.lieux.recents";

export function lieuxRecents() {
  try { return (local.lire(CLE_RECENTS) || []).filter((l) => typeof l === "string").slice(0, 6); }
  catch { return []; }
}

export function retenirLieu(lieu) {
  const propre = String(lieu || "").trim();
  if (!propre) return;
  try { local.ecrire(CLE_RECENTS, [propre, ...lieuxRecents().filter((l) => l !== propre)].slice(0, 6)); }
  catch { /* entrepôt indisponible : on s'en passe */ }
}

let compteur = 0;

/**
 * Un champ « Où êtes-vous ? » : une saisie libre, des suggestions du monde,
 * et les derniers lieux en un clic.
 */
export function champLieu({ libelle = "Où êtes-vous ?", valeur = "", requis = false, aide = null, surChange = () => {} } = {}) {
  const id = `lieux-${++compteur}`;
  const recents = lieuxRecents();
  let saisie;
  const choisir = (l) => { saisie.value = l; surChange(l); saisie.closest(".champ")?.classList.remove("champ--erreur"); };
  const noeud = el("label.champ.champ-lieu",
    el("span.champ__label", libelle, requis ? el("span.champ__requis", " *") : null),
    saisie = el("input.saisie", {
      type: "text", value: valeur, maxlength: "120", list: id, autocomplete: "off",
      placeholder: "Trost, QG du Bataillon d'exploration…",
      oninput: (e) => surChange(e.currentTarget.value)
    }),
    el("datalist", { id },
      [...new Set([...recents, ...TOUS])].map((l) => el("option", { value: l }))),
    recents.length
      ? el("span.champ-lieu__recents",
          recents.slice(0, 4).map((l) => el("button.puce", {
            type: "button", onclick: (e) => { e.preventDefault(); choisir(l); }
          }, l)))
      : null,
    aide ? el("span.champ__aide", aide) : null
  );
  if (valeur) surChange(valeur);
  return { noeud, saisie, valeur: () => saisie.value.trim() };
}
