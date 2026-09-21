/* ---------------------------------------------------------------------------
 * RBAC côté interface.
 *
 * ATTENTION : ces vérifications servent uniquement à masquer ce qui n'a pas
 * lieu d'être affiché. L'autorité reste la base de données (RLS + fonctions
 * SECURITY DEFINER). Ne jamais considérer une vérification d'ici comme une
 * garantie de sécurité.
 * ------------------------------------------------------------------------- */
import { etat } from "./store.js";

export const P = {
  CREER_CLASSE:      "CREATE_CLASS",
  GERER_CLASSE:      "MANAGE_CLASS",
  VOIR_ELEVES:       "VIEW_STUDENTS",
  GERER_MEMBRES:     "MANAGE_MEMBERS",
  CREER_COURS:       "CREATE_COURSE",
  ANIMER_SESSION:    "RUN_SESSION",
  ECRIRE_COMMUN:     "EDIT_SHARED_NOTEBOOK",
  LIRE_COMMUN:       "READ_SHARED_NOTEBOOK",
  CAHIER:            "USE_NOTEBOOK",
  TABLEAU_ECRIRE:    "USE_BOARD",
  TABLEAU_VOIR:      "VIEW_BOARD",
  CREER_EXERCICE:    "CREATE_EXERCISE",
  REPONDRE_EXERCICE: "ANSWER_EXERCISE",
  CORRIGER:          "GRADE_EXERCISE",
  IMPORTER_DOC:      "UPLOAD_DOCUMENT",
  VOIR_DOC:          "VIEW_DOCUMENT",
  PRESENCES:         "TAKE_ATTENDANCE",
  ANNONCER:          "PUBLISH_ANNOUNCEMENT",
  QUESTIONNER:       "ASK_QUESTION",
  LEVER_MAIN:        "RAISE_HAND",
  SONDER:            "RUN_POLL",
  ARCHIVES:          "VIEW_ARCHIVES",
  GERER_COMPTES:     "MANAGE_USERS",
  JOURNAUX:          "VIEW_LOGS",
  MODERER:           "MODERATE"
};

const ROLES_ADMIN = new Set(["super_admin", "admin", "director"]);
const ROLES_ENSEIGNANTS = new Set(["super_admin", "admin", "director", "teacher", "instructor"]);

/** Permission globale (issue du rôle du profil). */
export function peut(permission) {
  if (estAdmin()) return true;
  return etat.permissions.has(permission);
}

export function estAdmin() {
  return ROLES_ADMIN.has(etat.profil?.role_key);
}

export function estEnseignant() {
  return ROLES_ENSEIGNANTS.has(etat.profil?.role_key);
}

/* --- Rôle au sein d'une classe -------------------------------------------- */

/** Le membre encadre-t-il la classe (professeur ou assistant) ? */
export function encadre(membre = etat.membreActif, classe = etat.classeActive) {
  if (estAdmin()) return true;
  if (classe && etat.utilisateur && classe.owner_id === etat.utilisateur.id) return true;
  return membre?.role === "teacher" || membre?.role === "assistant";
}

export function estObservateur(membre = etat.membreActif) {
  return membre?.role === "observer";
}

/** Peut contribuer (écrire) dans la classe : ni observateur, ni réduit au silence. */
export function peutContribuer(membre = etat.membreActif) {
  if (encadre(membre)) return true;
  return Boolean(membre) && membre.status === "active" && !membre.muted && membre.role !== "observer";
}

/** Le tableau est-il ouvert à l'écriture pour cet utilisateur ? */
export function peutDessiner(tableau, membre = etat.membreActif, utilisateurId = etat.utilisateur?.id) {
  if (!tableau) return false;
  if (encadre(membre)) return true;
  if (!peutContribuer(membre)) return false;
  if (tableau.mode === "open") return true;
  if (tableau.mode === "participative") {
    const autorises = Array.isArray(tableau.allowed) ? tableau.allowed : [];
    return autorises.includes(utilisateurId);
  }
  return false;
}

/** Peut écrire dans un cahier donné. */
export function peutEcrireCahier(cahier, membre = etat.membreActif) {
  if (!cahier) return false;
  if (cahier.owner_id && cahier.owner_id === etat.utilisateur?.id) return true;
  if (cahier.class_id && encadre(membre)) return true;
  if (cahier.class_id && cahier.collaborative && peutContribuer(membre)) return true;
  return false;
}

export const LIBELLES_ROLES = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  director: "Directeur",
  teacher: "Professeur",
  instructor: "Formateur",
  student: "Élève",
  observer: "Observateur"
};

export const LIBELLES_ROLES_CLASSE = {
  teacher: "Professeur",
  assistant: "Assistant",
  student: "Élève",
  observer: "Observateur"
};
