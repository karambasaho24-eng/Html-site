/* ---------------------------------------------------------------------------
 * Vocabulaire RP. Chaque terme peut être renommé par l'établissement afin que
 * l'interface colle à l'univers du serveur (« salle », « promotion », « unité »…).
 * ------------------------------------------------------------------------- */
import { config } from "./config.js";
import { local } from "./util.js";

const BASE = {
  classe: "classe",
  classes: "classes",
  Classe: "Classe",
  Classes: "Classes",
  session: "session",
  Session: "Session",
  sessions: "sessions",
  professeur: "professeur",
  Professeur: "Professeur",
  professeurs: "professeurs",
  eleve: "élève",
  Eleve: "Élève",
  eleves: "élèves",
  Eleves: "Élèves",
  cours: "cours",
  Cours: "Cours",
  cahier: "cahier",
  Cahier: "Cahier",
  cahiers: "cahiers",
  Cahiers: "Cahiers",
  tableau: "tableau",
  Tableau: "Tableau",
  exercice: "exercice",
  Exercice: "Exercice",
  exercices: "exercices",
  Exercices: "Exercices",
  document: "document",
  Documents: "Documents",
  presence: "présence",
  Presences: "Présences"
};

const CLE = "ojm.lexique";
let surcharge = { ...(config.lexique || {}), ...(local.lire(CLE, {}) || {}) };

/** L("Classe") -> « Salle » si l'établissement a renommé le terme. */
export function L(terme) {
  return surcharge[terme] ?? BASE[terme] ?? terme;
}

export function definirLexique(partiel) {
  surcharge = { ...surcharge, ...partiel };
  local.ecrire(CLE, surcharge);
}

export function lexiqueActuel() {
  return { ...BASE, ...surcharge };
}

export const termesDisponibles = Object.keys(BASE);
