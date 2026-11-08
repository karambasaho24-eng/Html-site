/* ---------------------------------------------------------------------------
 * Vue cahier — le cahier occupe toute la hauteur disponible.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { cahiers, transferts } from "../data/index.js";
import { chargerCommerce } from "../features/encre.js";
import { etat } from "../core/store.js";
import { local } from "../core/util.js";
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
        { libelle: "Revenir à mes cahiers", action: () => aller("/") }
      )),
      titre: "Cahier introuvable"
    };
  }

  if (cahier.class_id && etat.classeActive?.id !== cahier.class_id) {
    await activerClasse(cahier.class_id);
  }

  const partage = cahier.kind === "shared";

  // Les limites en vigueur (encre, pages) : le PDG peut les avoir changées depuis le dernier chargement.
  await chargerCommerce();

  // Le dernier cahier ouvert : c'est lui que le mode flottant rouvre.
  local.ecrire("ojm.dernierCahier", cahier.id);

  // Tendu à quelqu'un : verrouillé jusqu'à sa réponse (la base refuse aussi, 0048).
  const tendu = (await transferts.enAttente(etat.utilisateur.id).catch(() => ({ tendus: [] })))
    .tendus.some((r) => r.type === "cahier" && r.objetId === cahier.id);
  const peutEcrire = peutEcrireCahier(cahier) && !tendu;

  const editeur = creerEditeurCahier({
    cahier,
    peutEcrire,
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
