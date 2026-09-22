/* ---------------------------------------------------------------------------
 * Les trois modes d'une séance.
 *
 * On n'anime pas une réunion comme on fait cours, et une distribution de
 * papiers n'est ni l'un ni l'autre. Le mode ne verrouille rien par sécurité —
 * c'est une mise en scène : il change les outils proposés et les mots
 * employés, pour que personne n'ait à deviner ce qui se joue.
 * ------------------------------------------------------------------------- */

export const MODES = {
  cours: {
    libelle: "Cours",
    resume: "Un enseigne, les autres prennent des notes.",
    icone: "cours",
    // La parole se demande au maître, qui l'accorde.
    parole: { demander: "Lever la main", annuler: "Baisser la main", file: "Mains levées" },
    outils: {
      tableau: true, cahierCommun: true, documents: true, exercices: true,
      sondage: true, minuterie: true, papiers: true, cartable: true
    }
  },
  reunion: {
    libelle: "Réunion",
    resume: "Une conférence à l'écrit : chacun parle à son tour.",
    icone: "reunion",
    // En réunion, la file est publique : on voit qui attend, et depuis quand.
    parole: { demander: "Demander la parole", annuler: "Me retirer du tour", file: "Tour de parole" },
    outils: {
      tableau: true, cahierCommun: true, documents: true, exercices: false,
      sondage: true, minuterie: true, papiers: true, cartable: false
    },
    // Un vote en réunion n'est pas un sondage de cours.
    motSondage: "Mise aux voix"
  },
  distribution: {
    libelle: "Distribution",
    resume: "On se présente, on reçoit son papier, on s'en va.",
    icone: "papier",
    parole: { demander: "Me signaler", annuler: "Me retirer", file: "File d'attente" },
    outils: {
      tableau: false, cahierCommun: false, documents: true, exercices: false,
      sondage: false, minuterie: false, papiers: true, cartable: false
    }
  }
};

export const LISTE_MODES = Object.entries(MODES).map(([cle, m]) => ({ cle, ...m }));

export function mode(session) {
  return MODES[session?.mode] || MODES.cours;
}

/** L'outil est-il de mise dans ce mode ? */
export function offre(session, outil) {
  return mode(session).outils[outil] !== false;
}
