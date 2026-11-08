/* ---------------------------------------------------------------------------
 * Les trois départements.
 *
 * Tout le site tient en trois portes, toujours au même endroit :
 *
 *   · Classe          — les espaces, les séances, les réunions, les exercices ;
 *   · Mes affaires    — le bureau, le sac, la trousse, les cahiers, et tous
 *                       les documents qu'on possède ;
 *   · Administration  — recevoir, écrire, signer et donner des documents ;
 *                       le cahier y reste à portée.
 *
 * Chaque écran appartient à un département. Celui-ci s'allume dans la barre,
 * et l'on sait toujours où l'on est et comment revenir au début.
 * ------------------------------------------------------------------------- */
export const DEPARTEMENTS = [
  {
    cle: "classe", mot: "Classe", court: "Classe", accueil: "/classe", image: "tableau", icone: "classe",
    aide: "Espaces, séances, réunions",
    routes: ["classe-accueil", "classes", "classe", "salle", "exercices", "exercice",
      "archives", "archive", "professeur", "bibliotheque", "modeles"]
  },
  {
    cle: "affaires", mot: "Mes affaires", court: "Affaires", accueil: "/", image: "cartable", icone: "sac",
    aide: "Bureau, sac, cahiers, documents",
    routes: ["accueil", "affaires", "cahiers", "cahier", "documents", "papiers"]
  },
  {
    cle: "administration", mot: "Administration", court: "Admin", accueil: "/administration", image: "cachet", icone: "cachet",
    aide: "Recevoir, écrire, signer, donner",
    routes: ["administration"]
  }
];

/** Le département d'un écran ; aucun pour les réglages, le profil, la modération. */
export function departementDe(nomRoute) {
  return DEPARTEMENTS.find((d) => d.routes.includes(nomRoute)) || null;
}
