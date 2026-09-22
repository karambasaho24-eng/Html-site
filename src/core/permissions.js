/* ---------------------------------------------------------------------------
 * RBAC côté interface.
 *
 * ATTENTION : ces vérifications servent uniquement à masquer ce qui n'a pas
 * lieu d'être affiché. L'autorité reste la base de données (RLS + fonctions
 * SECURITY DEFINER). Ne jamais considérer une vérification d'ici comme une
 * garantie de sécurité.
 * ------------------------------------------------------------------------- */
import { etat } from "./store.js";
import { L } from "./lexique.js";

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

/**
 * Rôle global déclaré sur le profil. Sert à la présentation et à
 * l'administration, pas à décider qui peut ouvrir une classe : sur cette
 * plateforme, n'importe quel inscrit peut créer la sienne.
 */
export function estEnseignant() {
  return ROLES_ENSEIGNANTS.has(etat.profil?.role_key);
}

/**
 * Encadre-t-on au moins un espace ? C'est ce qui ouvre l'espace professeur —
 * on ne l'est pas « par nature », on le devient en créant ou en co-animant
 * une classe.
 */
export function encadreUneClasse() {
  if (estAdmin()) return true;
  return etat.classes.some((c) =>
    c.owner_id === etat.utilisateur?.id
    || ["teacher", "assistant"].includes(c.membre?.role));
}

/** Les classes que l'on encadre, dans l'ordre d'affichage habituel. */
export function mesClassesEncadrees() {
  return etat.classes.filter((c) =>
    !c.archived
    && (c.owner_id === etat.utilisateur?.id
        || ["teacher", "assistant"].includes(c.membre?.role)));
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
  student: "Membre",
  observer: "Observateur"
};

export const LIBELLES_ROLES_CLASSE = {
  teacher: "Professeur",
  assistant: "Assistant",
  student: "Élève",
  observer: "Observateur"
};

/**
 * Libellé d'un rôle dans la langue de l'établissement : « Professeur » devient
 * « Instructeur » dans un corps militaire, « Élève » devient « Cadet ».
 */
export function libelleRoleClasse(role) {
  if (role === "teacher") return L("Professeur");
  if (role === "student") return L("Eleve");
  return LIBELLES_ROLES_CLASSE[role] || role;
}
