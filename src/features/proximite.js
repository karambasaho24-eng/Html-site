/* ---------------------------------------------------------------------------
 * La règle de proximité.
 *
 * Sur le serveur, un instructeur ne lit pas le carnet d'un cadet depuis
 * l'autre bout de la caserne, et on ne tend pas un ordre de mission à
 * quelqu'un qu'on ne voit pas. Le site ne peut pas mesurer une distance dans
 * Roblox — et il ne prétend pas le faire : il demande une attestation, il la
 * date, il la garde. Le contrôle reste social, comme dans n'importe quelle
 * table de jeu ; ce qui change, c'est qu'il laisse une trace.
 *
 * Toute action qui suppose une présence physique passe par ici.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { ouvrirModale } from "../ui/modal.js";
import { nomAffiche } from "../core/rp.js";

const FORMULES = {
  cahier: {
    titre: "Rapprochez-vous du joueur",
    geste: "Demander le cahier",
    attestation: "Je me tiens à portée de voix de cette personne, en jeu.",
    note: "La consultation sera inscrite au registre et signalée à l'intéressé."
  },
  papier: {
    titre: "Rapprochez-vous du joueur",
    geste: "Tendre le papier",
    attestation: "Je suis face à cette personne, en jeu, et je lui tends ce document.",
    note: "Le destinataire reste libre de le lire, de le refuser ou de le garder."
  },
  renvoi: {
    titre: "Rapprochez-vous du joueur",
    geste: "Prononcer le renvoi",
    attestation: "J'ai signifié ce renvoi de vive voix avant de le porter ici.",
    note: "Le renvoi est inscrit au registre de la séance."
  }
};

/**
 * Pose la question de la proximité et attend la réponse.
 *
 * @param {object} options
 * @param {"cahier"|"papier"|"renvoi"} options.motif   Ce qu'on s'apprête à faire.
 * @param {object} [options.cible]     Profil visé.
 * @param {object} [options.personnage] Fiche de personnage de la cible.
 * @param {string} [options.detail]    Précision affichée (titre du papier, du cahier…).
 * @returns {Promise<boolean>} L'attestation a-t-elle été donnée.
 */
export function exigerProximite({ motif = "cahier", cible = null, personnage = null, detail = null }) {
  const f = FORMULES[motif] || FORMULES.cahier;
  const nom = cible ? nomAffiche(personnage, cible) : "—";
  const qui = nom === "—" ? "cette personne" : nom;
  let coche;

  return ouvrirModale({
    titre: f.titre,
    corps: () => el("div.proximite",
      el("div.proximite__scene", { "aria-hidden": "true" },
        el("span.proximite__silhouette.proximite__silhouette--soi"),
        el("span.proximite__onde"),
        el("span.proximite__silhouette.proximite__silhouette--autre")
      ),
      el("p.proximite__phrase",
        "Cette action se fait en présence. Approchez votre personnage de ",
        el("strong", qui), " avant de continuer."),
      detail ? el("p.petit.faible", detail) : null,
      el("label.case.proximite__case",
        el("input", {
          type: "checkbox",
          ref: (n) => { coche = n; },
          onchange: (e) => e.currentTarget.closest(".case").classList.remove("case--exigee")
        }),
        el("span", f.attestation)
      ),
      el("p.petit.faible.proximite__note", icone("bouclier", 12), " ", f.note)
    ),
    actions: [
      { libelle: "Annuler", valeur: false },
      {
        libelle: f.geste, variante: "primaire",
        action: () => {
          if (!coche?.checked) {
            coche?.closest(".case")?.classList.add("case--exigee");
            coche?.focus();
            return false;
          }
          return true;
        }
      }
    ]
  }).then((v) => v === true);
}
