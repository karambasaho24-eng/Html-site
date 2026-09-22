/* ---------------------------------------------------------------------------
 * Vue cahier — le cahier occupe toute la hauteur disponible.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { cahiers } from "../data/index.js";
import { etat } from "../core/store.js";
import { reglagesRP } from "../core/rp.js";
import { creerEditeurCahier } from "../features/editeur-cahier.js";
import { modePleineVue } from "../ui/chassis.js";
import { peutEcrireCahier } from "../core/permissions.js";
import { aller } from "../core/router.js";
import { activerClasse } from "../core/session.js";
import { blocVide } from "../ui/fragments.js";
import { enregistrerAction } from "../core/interface.js";

export default async function vueCahier({ params }) {
  const cahier = await cahiers.lire(params.id);

  if (!cahier) {
    return {
      noeud: el("div.page", blocVide(
        "Cahier introuvable",
        "Il a peut-être été supprimé, ou vous n'y avez pas accès.",
        { libelle: "Revenir à mes cahiers", action: () => aller("/cahiers") }
      )),
      titre: "Cahier introuvable"
    };
  }

  if (cahier.class_id && etat.classeActive?.id !== cahier.class_id) {
    await activerClasse(cahier.class_id);
  }

  const peutEcrire = peutEcrireCahier(cahier);
  const partage = cahier.kind === "shared";

  const editeur = creerEditeurCahier({
    cahier,
    peutEcrire,
    rp: reglagesRP(etat.classeActive),
    pageInitiale: new URLSearchParams(location.hash.split("?")[1] || "").get("page"),
    tempsReel: partage,
    actionsSupplementaires: () => partage
      ? el("span.etiq.etiq--laiton", icone("eleves", 12),
          cahier.collaborative ? "Collaboratif" : "Cahier commun")
      : null
  });

  const liberer = enregistrerAction("page.nouvelle", () => {
    if (peutEcrire) editeur.noeud.querySelector(".tranche__pied .btn")?.click();
  });
  const libererSuivante = enregistrerAction("page.suivante", () => naviguerPage(1));
  const libererPrecedente = enregistrerAction("page.precedente", () => naviguerPage(-1));

  function naviguerPage(delta) {
    const liste = editeur.pages();
    const courante = editeur.pageCourante();
    const index = liste.findIndex((p) => p.id === courante?.id);
    const cible = liste[index + delta];
    if (cible) editeur.allerPage(cible.id);
  }

  modePleineVue(true);

  return {
    noeud: editeur.noeud,
    titre: cahier.title,
    nettoyer: () => {
      editeur.detruire();
      modePleineVue(false);
      liberer(); libererSuivante(); libererPrecedente();
    }
  };
}
