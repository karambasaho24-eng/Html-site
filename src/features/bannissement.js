/* ---------------------------------------------------------------------------
 * Le message de fin.
 *
 * Quand la modération bannit un personnage (0032), le joueur garde son
 * compte mais perd son personnage. À sa prochaine visite — ou tout de suite
 * s'il est en ligne —, un message lui dit pourquoi, et l'invite à
 * recommencer un nouveau personnage.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { etat, definir, observer } from "../core/store.js";
import { profils } from "../data/index.js";
import { ouvrirModale } from "../ui/modal.js";
import { icone } from "../ui/icons.js";

let enCours = false;

export function surveillerBannissement() {
  observer(["profil"], () => verifier());
  // Une notification « bannissement » arrive : on relit le profil.
  observer(["notifications"], async (liste) => {
    if (!etat.utilisateur || enCours) return;
    if ((liste || []).some((n) => n.kind === "bannissement" && !n.read_at)) {
      const frais = await profils.lire(etat.utilisateur.id).catch(() => null);
      if (frais) definir({ profil: frais });
    }
  });
  verifier();
}

async function verifier() {
  const ban = etat.profil?.preferences?.bannissement;
  if (!etat.utilisateur || !ban || ban.lu || enCours) return;
  enCours = true;
  try {
    const mort = ban.genre === "mort";
    await ouvrirModale({
      titre: mort ? "Votre personnage est mort" : "Votre personnage a été banni",
      corps: () => el("div.bannissement",
        el("div.bannissement__sceau", icone(mort ? "croix" : "bouclier", 28)),
        el("p.bannissement__texte", mort
          ? "Votre personnage a trouvé la mort. Votre compte, lui, reste ouvert."
          : "La modération a mis fin à votre personnage. Votre compte, lui, reste ouvert."),
        el("div.bannissement__raison",
          el("span.bannissement__etiquette", mort ? "Circonstances" : "Raison"),
          el("p", ban.raison || "—")),
        el("p.bannissement__suite", el("strong", "Vous devez recommencer un nouveau personnage."),
          " Son apparence, son nom et sa fiche sont à refaire.")),
      actions: [{ libelle: "Créer un nouveau personnage", variante: "primaire", valeur: true }]
    });
    const prefs = { ...(etat.profil?.preferences || {}), bannissement: { ...ban, lu: true } };
    const maj = await profils.majorer(etat.utilisateur.id, { preferences: prefs }).catch(() => null);
    if (maj) definir({ profil: maj });
    const { ouvrirApparence } = await import("./apparence.js");
    await ouvrirApparence({ bienvenue: true });
  } finally {
    enCours = false;
  }
}
