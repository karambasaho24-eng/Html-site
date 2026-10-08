/* ---------------------------------------------------------------------------
 * Vue cahier — le cahier occupe toute la hauteur disponible.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { cahiers, affaires, remisesCahier } from "../data/index.js";
import { dotationComplete } from "../features/cartable.js";
import { contexte, peutFaire, supportAPortee, lieuEnMots } from "../features/portee.js";
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

  const partage = cahier.kind === "shared";
  const moiId = etat.utilisateur?.id;
  const mien = !partage && String(cahier.owner_id) === String(moiId);

  // Un cahier personnel est un objet : on ne l'ouvre que si on l'a devant
  // soi. Oublié dans une salle, prêté, resté au fond du sac pendant une
  // séance : la page ne s'ouvre pas, elle dit où il est.
  let objets = [];
  let ecriture = { ok: true };
  let ctxOutils = contexte();
  if (mien) {
    const ctx = contexte({ session: etat.sessionActive, classe: etat.classeActive });
    objets = await affaires.toutes(moiId).catch(() => []);
    // Chacun reçoit une fois ses fournitures : on ne prive pas d'écriture
    // quelqu'un qui n'a jamais ouvert son sac.
    if (!objets.length) {
      objets = await affaires.assurerDotation(moiId, dotationComplete()).catch(() => []);
    }
    let pretes = new Set();
    try {
      pretes = new Set((await remisesCahier.pretes(moiId)).map((r) => String(r.notebook_id)));
    } catch { /* hors ligne : on ne suppose pas de prêt */ }
    const ou = supportAPortee(cahier, { moiId, ctx, objets, pretesParMoi: pretes });
    if (!ou.ok && ou.lieu !== "sac") {
      const raison = {
        salle: `Vous l'avez laissé : ${ou.ou}. Il faut y retourner pour le reprendre — la salle doit être ouverte.`,
        prete: "Vous l'avez prêté. Il vous reviendra quand on vous le rendra.",
        maison: "Il n'est pas dans votre sac : il est resté chez vous.",
        perdu: "Il est perdu."
      }[ou.lieu] || lieuEnMots(ou);
      return {
        noeud: el("div.page", blocVide(
          `${cahier.title} n'est pas entre vos mains`,
          raison,
          { libelle: "Voir mes affaires", action: () => aller("/affaires") }
        )),
        titre: cahier.title
      };
    }
    ctxOutils = ou.lieu === "sac" ? contexte() : ctx;
    ecriture = peutFaire("ecrire", objets, { moiId, ctx: ctxOutils });
  }

  const peutEcrire = peutEcrireCahier(cahier) && ecriture.ok;

  const editeur = creerEditeurCahier({
    cahier,
    peutEcrire,
    manqueEcriture: peutEcrireCahier(cahier) && !ecriture.ok ? ecriture : null,
    garde: mien
      ? (action) => peutFaire(action, objets, { moiId, ctx: ctxOutils })
      : null,
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
