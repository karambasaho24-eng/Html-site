import { el } from "../ui/dom.js";
import { aller } from "../core/router.js";
import { blocVide } from "../ui/fragments.js";

export default async function vueIntrouvable() {
  return {
    noeud: el("div.page", blocVide(
      "Page introuvable",
      "Le lien est peut-être périmé, ou la ressource a été supprimée.",
      { libelle: "Retour à l'accueil", action: () => aller("/") }
    )),
    titre: "Page introuvable"
  };
}
