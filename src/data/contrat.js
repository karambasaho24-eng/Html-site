/* ---------------------------------------------------------------------------
 * Contrat de la couche de données.
 *
 * Deux implémentations respectent cette interface :
 *   · supabase.js — Postgres + RLS + Realtime + Storage (mode normal)
 *   · local.js    — navigateur seul, synchronisation inter-onglets (démonstration)
 *
 * Toutes les méthodes sont asynchrones et lèvent une Error lisible en cas
 * d'échec. Aucune vue n'importe directement un pilote : elles passent par
 * `db` (src/data/index.js).
 *
 * Dépôt générique — chaque table expose :
 *   liste(filtre, options) · lire(id) · creer(objet) · majorer(id, patch)
 *   · supprimer(id) · compter(filtre)
 *
 * options : { select, ordre, sens: "asc"|"desc", limite, depuis }
 *
 * Temps réel :
 *   temps.sabonner({ cle, tables, surChangement, diffusion, presence })
 *     -> { fermer(), envoyer(evenement, charge), majPresence(meta) }
 *
 * Fichiers :
 *   fichiers.televerser(fichier, chemin) -> { chemin }
 *   fichiers.url(chemin)                 -> URL consultable (signée si besoin)
 *   fichiers.supprimer(chemin)
 * ------------------------------------------------------------------------- */

export const TABLES = [
  "profiles", "classes", "class_members", "class_sessions", "attendance",
  "notebooks", "notebook_pages", "boards", "board_pages", "board_elements",
  "folders", "documents", "courses", "course_items",
  "exercises", "exercise_questions", "exercise_attempts", "exercise_answers",
  "grades", "announcements", "session_questions", "hands", "polls", "poll_votes",
  "timers", "notifications", "favorites", "activity_logs", "roles",
  "permissions", "role_permissions", "rp_profiles", "service_records"
];

/** Erreur métier normalisée. */
export class ErreurDonnees extends Error {
  constructor(message, code = null, cause = null) {
    super(message);
    this.name = "ErreurDonnees";
    this.code = code;
    this.cause = cause;
  }
}
