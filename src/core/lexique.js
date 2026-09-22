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

/**
 * Jeux de termes prêts à l'emploi. La plateforme ne sert pas qu'une école :
 * un club, une unité RP ou une équipe n'emploient pas les mêmes mots, et
 * l'interface doit parler la langue du groupe qui s'en sert.
 */
export const PRESETS = {
  ecole: {
    libelle: "École",
    aide: "Classes, élèves, professeurs — le vocabulaire scolaire classique.",
    termes: {}
  },
  groupe: {
    libelle: "Groupe",
    aide: "Pour un club, une association ou une équipe : groupes et animateurs.",
    termes: {
      classe: "groupe", classes: "groupes", Classe: "Groupe", Classes: "Groupes",
      eleve: "membre", eleves: "membres", Eleve: "Membre", Eleves: "Membres",
      professeur: "animateur", Professeur: "Animateur", professeurs: "animateurs",
      cours: "séance", Cours: "Séance",
      cahier: "carnet", cahiers: "carnets", Cahier: "Carnet", Cahiers: "Carnets",
      session: "rencontre", Session: "Rencontre", sessions: "rencontres"
    }
  },
  unite: {
    libelle: "Unité",
    aide: "Registre militaire ou para-militaire : unités, recrues, instructeurs.",
    termes: {
      classe: "unité", classes: "unités", Classe: "Unité", Classes: "Unités",
      eleve: "recrue", eleves: "recrues", Eleve: "Recrue", Eleves: "Recrues",
      professeur: "instructeur", Professeur: "Instructeur", professeurs: "instructeurs",
      cours: "instruction", Cours: "Instruction",
      cahier: "carnet", cahiers: "carnets", Cahier: "Carnet", Cahiers: "Carnets",
      session: "manœuvre", Session: "Manœuvre", sessions: "manœuvres",
      presence: "appel", Presences: "Appels"
    }
  },
  murs: {
    libelle: "Corps militaire",
    aide: "Brigades, cadets et instructeurs. Pour une académie militaire RP.",
    termes: {
      classe: "brigade", classes: "brigades", Classe: "Brigade", Classes: "Brigades",
      eleve: "cadet", eleves: "cadets", Eleve: "Cadet", Eleves: "Cadets",
      professeur: "instructeur", Professeur: "Instructeur", professeurs: "instructeurs",
      cours: "instruction", Cours: "Instruction",
      cahier: "carnet", cahiers: "carnets", Cahier: "Carnet", Cahiers: "Carnets",
      session: "manœuvre", Session: "Manœuvre", sessions: "manœuvres",
      presence: "appel", Presences: "Appels",
      exercice: "épreuve", exercices: "épreuves", Exercice: "Épreuve", Exercices: "Épreuves",
      tableau: "ardoise", Tableau: "Ardoise",
      document: "ordre", Documents: "Ordres"
    }
  },
  academie: {
    libelle: "Académie",
    aide: "Formation professionnelle ou juridique : promotions et formateurs.",
    termes: {
      classe: "promotion", classes: "promotions", Classe: "Promotion", Classes: "Promotions",
      professeur: "formateur", Professeur: "Formateur", professeurs: "formateurs",
      cours: "formation", Cours: "Formation",
      session: "séance", Session: "Séance", sessions: "séances"
    }
  }
};

const CLE = "ojm.lexique";
const CLE_PRESET = "ojm.lexique.preset";
let surcharge = { ...(config.lexique || {}), ...(local.lire(CLE, {}) || {}) };

/** L("Classe") -> « Salle » si l'établissement a renommé le terme. */
export function L(terme) {
  return surcharge[terme] ?? BASE[terme] ?? terme;
}

export function definirLexique(partiel) {
  surcharge = { ...surcharge, ...partiel };
  local.ecrire(CLE, surcharge);
}

/** Applique un jeu de termes complet, en remplaçant le précédent. */
export function appliquerPreset(cle) {
  const preset = PRESETS[cle];
  if (!preset) return false;
  surcharge = { ...(config.lexique || {}), ...preset.termes };
  local.ecrire(CLE, surcharge);
  local.ecrire(CLE_PRESET, cle);
  return true;
}

export function presetActuel() {
  return local.lire(CLE_PRESET, "ecole");
}

export function lexiqueActuel() {
  return { ...BASE, ...surcharge };
}

export const termesDisponibles = Object.keys(BASE);
