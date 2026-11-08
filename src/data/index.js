/* ---------------------------------------------------------------------------
 * Façade de données. Les vues n'utilisent que ce module.
 * Le pilote (Supabase ou local) est choisi au démarrage selon la configuration.
 * ------------------------------------------------------------------------- */
import { config, estRelie } from "../core/config.js";
import { creerPiloteSupabase } from "./supabase.js";
import { creerPiloteLocal } from "./local.js";
import { ErreurDonnees } from "./contrat.js";
import { uid } from "../core/util.js";

export let pilote = null;

export async function initialiserDonnees() {
  if (pilote) return pilote;
  if (estRelie()) {
    try {
      pilote = await creerPiloteSupabase(config);
    } catch (err) {
      console.error("[donnees] Supabase indisponible, repli local", err);
      pilote = await creerPiloteLocal();
      pilote.repli = true;
      pilote.raisonRepli = err.message;
    }
  } else {
    pilote = await creerPiloteLocal();
  }
  return pilote;
}

const T = (nom) => pilote.table(nom);

/* ===========================================================================
   Profils et référentiel
   ========================================================================= */
export const profils = {
  lire: (id) => T("profiles").lire(id),
  parIds: (ids) => ids.length ? T("profiles").liste({ id: ids }) : Promise.resolve([]),
  majorer: (id, patch) => T("profiles").majorer(id, patch),
  /** Tous les joueurs inscrits, par ordre alphabétique (pour choisir à qui donner, sans avoir à connaître le pseudo). */
  tous: (limite = 500) => T("profiles").liste({}, { ordre: "display_name", limite }),
  /** Retrouver quelqu'un par son pseudo : on le croise dans la rue, on ne partage aucun espace. */
  chercher(texte, limite = 8) {
    const propre = String(texte || "").trim().replace(/[%_\\]/g, "");
    if (propre.length < 2) return Promise.resolve([]);
    return T("profiles").liste({ display_name: { operateur: "ilike", valeur: `%${propre}%` } },
      { ordre: "display_name", limite });
  },
  /** Le compte qui porte exactement ce pseudo (majuscules indifférentes). */
  async parPseudo(pseudo) {
    const propre = String(pseudo || "").trim();
    if (!propre) return null;
    const trouves = await T("profiles").liste({ display_name: { operateur: "ilike", valeur: propre.replace(/[%\\]/g, "") } }, { limite: 10 });
    return trouves.find((p) => p.display_name.toLowerCase() === propre.toLowerCase()) || null;
  },
  /** Un code de rôle (0030) : l'administration le crée, la personne le tape. */
  creerCodeRole: (role) => pilote.rpc("creer_code_role", { role }),
  utiliserCodeRole: (code) => pilote.rpc("utiliser_code_role", { code }),
  /** Les administrateurs sont désignés par leur identifiant Discord (0035). Rend le profil à jour. */
  async synchroniserAdmin(profil) {
    if (!profil || pilote.mode === "local") return profil;
    try {
      const role = await pilote.rpc("appliquer_admins_discord", {});
      if (role && role !== profil.role_key) return (await T("profiles").lire(profil.id)) || profil;
    } catch (err) {
      console.warn("[admin] attribution du rôle Discord impossible (migration 0035 appliquée ?)", err);
    }
    return profil;
  },
  /** Supprimer un compte, définitivement (0031) : l'administration seule. */
  supprimerCompte: (id) => pilote.rpc("supprimer_compte", { cible: id }),
  /** Le nom RP d'une personne (vide = retour à son pseudo Discord). Administration seule (0043). */
  nomRP: (id, nom) => pilote.rpc("definir_nom_rp", { cible: id, nom }),
  /** Chacun choisit son nom RP, une fois (0044). */
  choisirNomRP: (nom) => pilote.rpc("choisir_mon_nom_rp", { nom }),
  /** Le personnage est mort : la personne peut choisir un nouveau nom (0044). Administration seule. */
  personnageMort: (id) => pilote.rpc("declarer_personnage_mort", { cible: id }),
  /** L'accès est-il bloqué (compte suspendu, banni, connexion bannie) ? (0033) */
  monAcces: () => pilote.rpc("mon_acces", {}),
  /** Le rôle global : l'administration seule, et jamais le sien (la base y veille). */
  nommer: (id, role) => T("profiles").majorer(id, { role_key: role }),
  /** Le titre du personnage : roi, commandant… Il ne donne aucun droit. */
  titrer: (id, titre, libelle = null) => T("profiles").majorer(id, {
    titre: titre || null, titre_libelle: String(libelle || "").trim() || null
  }),
  async assurer(utilisateur) {
    const existant = await T("profiles").lire(utilisateur.id);
    if (existant) return existant;
    return T("profiles").creer({
      id: utilisateur.id,
      display_name: utilisateur.user_metadata?.custom_claims?.global_name || utilisateur.user_metadata?.full_name
        || utilisateur.user_metadata?.pseudo || utilisateur.user_metadata?.display_name
        || utilisateur.user_metadata?.name || "Nouvel élève",
      avatar_url: utilisateur.user_metadata?.avatar_url || null,
      role_key: "student", preferences: {}
    });
  }
};

export const rbac = {
  roles: () => T("roles").liste({}, { ordre: "rank", sens: "desc" }),
  permissions: () => T("permissions").liste({}, { ordre: "key" }),
  async pourRole(role) {
    const lignes = await T("role_permissions").liste({ role_key: role });
    return lignes.map((l) => l.permission_key);
  }
};

/* ===========================================================================
   Classes et membres
   ========================================================================= */
export const classes = {
  async mesClasses(utilisateurId) {
    const membres = await T("class_members").liste({ user_id: utilisateurId });
    const actifs = membres.filter((m) => m.status !== "banned" && m.status !== "left");
    if (!actifs.length) return [];
    const lignes = await T("classes").liste({ id: actifs.map((m) => m.class_id) },
      { ordre: "created_at", sens: "desc" });
    return lignes.map((c) => ({
      ...c,
      membre: actifs.find((m) => m.class_id === c.id)
    }));
  },
  lire: (id) => T("classes").lire(id),
  creer: (donnees) => T("classes").creer(donnees),
  majorer: (id, patch) => T("classes").majorer(id, patch),
  supprimer: (id) => T("classes").supprimer(id),
  regenererCode: (id) => pilote.rpc("regenerate_class_code", { target_class: id }),

  async rejoindre(code) {
    const sortie = await pilote.rpc("join_class", { join_code: code });
    const ligne = Array.isArray(sortie) ? sortie[0] : sortie;
    if (!ligne) throw new ErreurDonnees("Code de classe introuvable", "P0002");
    return ligne;
  },

  async creerAvecCahier(donnees, proprietaireId) {
    const classe = await T("classes").creer(donnees);
    if (pilote.mode === "local") {
      const deja = await T("class_members").liste({ class_id: classe.id, user_id: proprietaireId });
      if (!deja.length) {
        await T("class_members").creer({
          class_id: classe.id, user_id: proprietaireId, role: "teacher",
          status: "active", muted: false, grants: [], joined_at: new Date().toISOString()
        });
      }
    }
    await cahiers.creer({
      class_id: classe.id, owner_id: proprietaireId, kind: "shared",
      title: `Cahier commun — ${classe.name}`, cover: "cuir",
      color: classe.color, icon: "book", collaborative: false
    });
    return classe;
  }
};

export const membres = {
  async liste(classeId) {
    const lignes = await T("class_members").liste({ class_id: classeId }, { ordre: "joined_at" });
    const profilsLies = await profils.parIds([...new Set(lignes.map((l) => l.user_id))]);
    const index = new Map(profilsLies.map((p) => [p.id, p]));
    return lignes.map((l) => ({ ...l, profil: index.get(l.user_id) || null }));
  },
  pour: async (classeId, utilisateurId) =>
    (await T("class_members").liste({ class_id: classeId, user_id: utilisateurId }))[0] || null,
  majorer: (id, patch) => T("class_members").majorer(id, patch),
  retirer: (id) => T("class_members").supprimer(id),
  creer: (donnees) => T("class_members").creer(donnees)
};

/* ===========================================================================
   Fiches de personnage
   Le compte identifie le joueur ; la fiche identifie le personnage, et c'est
   elle qui signe tout ce qui se passe dans l'espace. Une par membre et par
   classe : on peut être cadet ici et instructeur ailleurs.

/* ===========================================================================
   Livret de service
   Mentions, sanctions, promotions et aptitudes. C'est ce qui donne aux actes
   des conséquences durables, et au classement de promotion sa matière.

/* ===========================================================================
   Sessions, présence, journal
   ========================================================================= */
export const sessions = {
  liste: (classeId, limite = 40) =>
    T("class_sessions").liste({ class_id: classeId }, { ordre: "created_at", sens: "desc", limite }),
  lire: (id) => T("class_sessions").lire(id),
  async enCours(classeId) {
    const lignes = await T("class_sessions").liste({ class_id: classeId, status: "live" },
      { ordre: "started_at", sens: "desc", limite: 1 });
    return lignes[0] || null;
  },
  async demarrer(classeId, titre, mode = "cours") {
    const session = await pilote.rpc("start_session",
      { target_class: classeId, session_title: titre || null });
    const ligne = Array.isArray(session) ? session[0] : session;
    if (ligne && mode && mode !== "cours") {
      return T("class_sessions").majorer(ligne.id, { mode });
    }
    return ligne;
  },
  terminer: (id) => pilote.rpc("end_session", { target_session: id }),
  definirMode: (id, mode) => T("class_sessions").majorer(id, { mode }),
  majorer: (id, patch) => T("class_sessions").majorer(id, patch),
  supprimer: (id) => T("class_sessions").supprimer(id),
  archivees: (classeId) =>
    T("class_sessions").liste({ class_id: classeId, status: "ended" }, { ordre: "ended_at", sens: "desc" })
};

export const presence = {
  pointer: (sessionId) => pilote.rpc("check_in", { target_session: sessionId }),
  async liste(sessionId) {
    const lignes = await T("attendance").liste({ session_id: sessionId }, { ordre: "arrived_at" });
    const profilsLies = await profils.parIds([...new Set(lignes.map((l) => l.user_id))]);
    const index = new Map(profilsLies.map((p) => [p.id, p]));
    return lignes.map((l) => ({ ...l, profil: index.get(l.user_id) || null }));
  },
  majorer: (id, patch) => T("attendance").majorer(id, patch),
  async historique(utilisateurId, limite = 50) {
    return T("attendance").liste({ user_id: utilisateurId }, { ordre: "arrived_at", sens: "desc", limite });
  }
};

/* ===========================================================================
   Renvois de séance
   ========================================================================= */

export const journal = {
  async ecrire(entree) {
    try { return await T("activity_logs").creer(entree); }
    catch { return null; }   // le journal ne doit jamais bloquer une action
  },
  liste: (filtre, limite = 120) =>
    T("activity_logs").liste(filtre, { ordre: "created_at", sens: "desc", limite })
};

/* ===========================================================================
   Cahiers et pages
   ========================================================================= */
export const cahiers = {
  mesCahiers: (utilisateurId) =>
    T("notebooks").liste({ owner_id: utilisateurId, kind: "personal", archived: false },
      { ordre: "updated_at", sens: "desc" }),
  async commun(classeId) {
    const lignes = await T("notebooks").liste({ class_id: classeId, kind: "shared" },
      { ordre: "created_at", limite: 1 });
    return lignes[0] || null;
  },
  deClasse: (classeId) => T("notebooks").liste({ class_id: classeId }, { ordre: "created_at" }),
  lire: (id) => T("notebooks").lire(id),
  /** Créer un cahier personnel est soumis au quota (premier gratuit, suivants achetés) :
   *  c'est la base qui tranche et qui répond NB001 si un achat est nécessaire. */
  creer: (donnees) => T("notebooks").creer({ archived: false, ...donnees }),
  majorer: (id, patch) => T("notebooks").majorer(id, patch),
  supprimer: (id) => T("notebooks").supprimer(id)
};

export const pages = {
  liste: (cahierId) => T("notebook_pages").liste({ notebook_id: cahierId }, { ordre: "position" }),
  lire: (id) => T("notebook_pages").lire(id),
  async creer(cahierId, donnees = {}) {
    const existantes = await T("notebook_pages").liste({ notebook_id: cahierId });
    const position = existantes.reduce((m, p) => Math.max(m, p.position + 1), 0);
    return T("notebook_pages").creer({
      notebook_id: cahierId, position,
      title: donnees.title || `Page ${position + 1}`,
      body: donnees.body || "", drawing: donnees.drawing || null,
      attachments: donnees.attachments || [], origin: donnees.origin || "manual",
      origin_ref: donnees.origin_ref || null, created_by: donnees.created_by || null
    });
  },
  majorer: (id, patch) => T("notebook_pages").majorer(id, patch),
  supprimer: (id) => T("notebook_pages").supprimer(id),
  async reordonner(liste) {
    for (let i = 0; i < liste.length; i++) {
      if (liste[i].position !== i) await T("notebook_pages").majorer(liste[i].id, { position: i });
    }
  },
  capturerTableau: (pageTableauId, cahierId, titre, instantane) =>
    pilote.rpc("capture_board_page", {
      target_board_page: pageTableauId, target_notebook: cahierId,
      page_title: titre, snapshot: instantane
    })
};

/* ===========================================================================
   Pense-bêtes et repères
   ========================================================================= */
export const penseBetes = {
  liste: (pageId) => T("sticky_notes").liste({ page_id: pageId }, { ordre: "created_at" }),
  async pourPages(pageIds) {
    if (!pageIds.length) return new Map();
    const lignes = await T("sticky_notes").liste({ page_id: pageIds });
    const index = new Map();
    for (const l of lignes) {
      if (!index.has(l.page_id)) index.set(l.page_id, []);
      index.get(l.page_id).push(l);
    }
    return index;
  },
  creer: (donnees) => T("sticky_notes").creer({ color: "jaune", x: 0.7, y: 0.12, rotation: 0, ...donnees }),
  majorer: (id, patch) => T("sticky_notes").majorer(id, patch),
  supprimer: (id) => T("sticky_notes").supprimer(id)
};

/* ===========================================================================
   Modération
   La base tranche (0029) : un modérateur lit le journal, les remises, les
   papiers et les fiches ; il note, il annonce, il retire. Il ne change ni un
   rôle ni un titre — c'est l'administration.
   ========================================================================= */
export const moderation = {
  notes: (genre, ids) => ids.length
    ? T("moderation_notes").liste({ target_kind: genre, target_id: ids }, { ordre: "created_at", sens: "desc" })
    : Promise.resolve([]),
  noter: ({ genre, cible, verdict = "note", texte = null, auteur }) => T("moderation_notes").creer({
    target_kind: genre, target_id: cible, verdict,
    body: String(texte || "").trim().slice(0, 1000) || null, author_id: auteur
  }),
  oublierNote: (id) => T("moderation_notes").supprimer(id),
  annoncer: (titre, corps = null) => pilote.rpc("annoncer_a_tous", { titre, corps }),
  ecrire: (cible, titre, corps = null) => pilote.rpc("message_de_moderation", { cible, titre, corps }),
  comptes: (limite = 500) => T("profiles").liste({}, { ordre: "created_at", sens: "desc", limite }),
  fiches: (limite = 500) => T("rp_profiles").liste({}, { ordre: "updated_at", sens: "desc", limite }),
  supprimerFiche: (id) => T("rp_profiles").supprimer(id),
  /**
   * Sanctionner (0033) : mort, personnage, temporaire (jours), definitif, ip.
   * Quand le personnage tombe, ses fiches sont retirées.
   */
  async sanctionner(id, genre, raison, jours = null) {
    const nom = await pilote.rpc("sanctionner", { cible: id, genre, raison, jours });
    if (genre !== "temporaire") {
      const fiches = await T("rp_profiles").liste({ user_id: id }).catch(() => []);
      for (const f of fiches) await T("rp_profiles").supprimer(f.id).catch(() => null);
    }
    return nom;
  },
  sanctions: (filtre = {}, limite = 200) => T("sanctions").liste(filtre, { ordre: "created_at", sens: "desc", limite }),
  leverSanction: (id) => pilote.rpc("lever_sanction", { sanction: id }),
  /**
   * Bannir le personnage (0032) : son titre et son apparence tombent, un
   * message de fin l'attend ; puis ses fiches sont retirées.
   */
  async bannir(id, raison) {
    const nom = await pilote.rpc("bannir_personnage", { cible: id, raison });
    const fiches = await T("rp_profiles").liste({ user_id: id }).catch(() => []);
    for (const f of fiches) await T("rp_profiles").supprimer(f.id).catch(() => null);
    return nom;
  },
  journal: (filtre = {}, limite = 300) =>
    T("activity_logs").liste(filtre, { ordre: "created_at", sens: "desc", limite })
};

/* ===========================================================================
   Tableau
   ========================================================================= */
export const tableaux = {
  async pourSession(sessionId, classeId) {
    const lignes = await T("boards").liste({ session_id: sessionId }, { limite: 1 });
    if (lignes[0]) return lignes[0];
    if (!classeId) return null;
    const tableau = await T("boards").creer({
      class_id: classeId, session_id: sessionId, title: "Tableau",
      mode: "locked", allowed: [], current_page: 0
    });
    await T("board_pages").creer({ board_id: tableau.id, position: 0, title: "Tableau 1", background: "slate" });
    return tableau;
  },
  lire: (id) => T("boards").lire(id),
  majorer: (id, patch) => T("boards").majorer(id, patch),

  pages: (tableauId) => T("board_pages").liste({ board_id: tableauId }, { ordre: "position" }),
  async ajouterPage(tableauId) {
    const existantes = await T("board_pages").liste({ board_id: tableauId });
    const position = existantes.reduce((m, p) => Math.max(m, p.position + 1), 0);
    return T("board_pages").creer({
      board_id: tableauId, position, title: `Tableau ${position + 1}`, background: "slate"
    });
  },
  majorerPage: (id, patch) => T("board_pages").majorer(id, patch),
  supprimerPage: (id) => T("board_pages").supprimer(id),

  elements: (pageId) => T("board_elements").liste({ page_id: pageId, deleted: false }, { ordre: "z" }),
  ajouterElement: (element) => T("board_elements").creer(element),
  majorerElement: (id, patch) => T("board_elements").majorer(id, patch),
  supprimerElement: (id) => T("board_elements").majorer(id, { deleted: true }),
  async viderPage(pageId) {
    await T("board_elements").supprimerOu({ page_id: pageId });
  }
};

/* ===========================================================================
   Documents, dossiers, bibliothèque
   ========================================================================= */
export const documents = {
  liste: (filtre, options = {}) =>
    T("documents").liste(filtre, { ordre: "created_at", sens: "desc", ...options }),
  lire: (id) => T("documents").lire(id),
  majorer: (id, patch) => T("documents").majorer(id, patch),

  async televerser(fichier, { classeId, dossierId, proprietaireId, titre, partage = false, meta = {} }) {
    const extension = (fichier.name.split(".").pop() || "bin").toLowerCase();
    const chemin = `${classeId || proprietaireId}/${uid()}.${extension}`;
    await pilote.fichiers.televerser(fichier, chemin);

    const genre = fichier.type.startsWith("image/") ? "image"
      : fichier.type === "application/pdf" ? "pdf"
      : fichier.type.startsWith("text/") ? "text" : "fichier";

    return T("documents").creer({
      owner_id: proprietaireId, class_id: classeId || null, folder_id: dossierId || null,
      title: titre || fichier.name, kind: genre, storage_path: chemin,
      size_bytes: fichier.size, page_count: null, shared: partage,
      meta: { nom_fichier: fichier.name, type_mime: fichier.type, ...meta }
    });
  },

  url: (document) => document.external_url
    ? Promise.resolve(document.external_url)
    : pilote.fichiers.url(document.storage_path),

  async supprimer(document) {
    if (document.storage_path) {
      try { await pilote.fichiers.supprimer(document.storage_path); }
      catch (err) { console.warn("[documents] fichier déjà absent", err); }
    }
    return T("documents").supprimer(document.id);
  }
};

export const dossiers = {
  liste: (filtre) => T("folders").liste(filtre, { ordre: "name" }),
  creer: (donnees) => T("folders").creer(donnees),
  majorer: (id, patch) => T("folders").majorer(id, patch),
  supprimer: (id) => T("folders").supprimer(id)
};

/* ===========================================================================
   Cours préparés et modèles
   ========================================================================= */
export const cours = {
  liste: (filtre) => T("courses").liste(filtre, { ordre: "created_at", sens: "desc" }),
  lire: (id) => T("courses").lire(id),
  creer: (donnees) => T("courses").creer(donnees),
  majorer: (id, patch) => T("courses").majorer(id, patch),
  supprimer: (id) => T("courses").supprimer(id),

  etapes: (coursId) => T("course_items").liste({ course_id: coursId }, { ordre: "position" }),
  async ajouterEtape(coursId, donnees) {
    const existantes = await T("course_items").liste({ course_id: coursId });
    const position = existantes.reduce((m, e) => Math.max(m, e.position + 1), 0);
    return T("course_items").creer({ course_id: coursId, position, payload: {}, ...donnees });
  },
  majorerEtape: (id, patch) => T("course_items").majorer(id, patch),
  supprimerEtape: (id) => T("course_items").supprimer(id),

  /** Duplique un cours (ou un modèle) vers une nouvelle entrée. */
  async dupliquer(coursId, patch = {}) {
    const source = await T("courses").lire(coursId);
    if (!source) throw new ErreurDonnees("Cours introuvable", "P0002");
    const { id, created_at, ...reste } = source;
    const copie = await T("courses").creer({
      ...reste, is_template: false, title: `${source.title} (copie)`, ...patch
    });
    for (const etape of await this.etapes(coursId)) {
      const { id: _i, course_id: _c, ...resteEtape } = etape;
      await T("course_items").creer({ ...resteEtape, course_id: copie.id });
    }
    return copie;
  }
};

/* ===========================================================================
   Exercices
   ========================================================================= */
export const exercices = {
  liste: (filtre, limite = 50) =>
    T("exercises").liste(filtre, { ordre: "created_at", sens: "desc", limite }),
  lire: (id) => T("exercises").lire(id),
  creer: (donnees) => T("exercises").creer(donnees),
  majorer: (id, patch) => T("exercises").majorer(id, patch),
  supprimer: (id) => T("exercises").supprimer(id),

  questions: (exerciceId) => T("exercise_questions").liste({ exercise_id: exerciceId }, { ordre: "position" }),
  async ajouterQuestion(exerciceId, donnees) {
    const existantes = await T("exercise_questions").liste({ exercise_id: exerciceId });
    const position = existantes.reduce((m, q) => Math.max(m, q.position + 1), 0);
    return T("exercise_questions").creer({
      exercise_id: exerciceId, position, kind: "free", prompt: "", options: [],
      solution: null, points: 1, ...donnees
    });
  },
  majorerQuestion: (id, patch) => T("exercise_questions").majorer(id, patch),
  supprimerQuestion: (id) => T("exercise_questions").supprimer(id),

  async lancer(exerciceId) {
    const ex = await T("exercises").lire(exerciceId);
    const dejaJoue = ["closed", "graded"].includes(ex?.status);
    const settings = { ...(ex?.settings || {}), manche: (Number(ex?.settings?.manche) || 1) + (dejaJoue ? 1 : 0) };
    return T("exercises").majorer(exerciceId, {
      status: "live", opened_at: new Date().toISOString(), closed_at: null, settings
    });
  },
  async fermer(exerciceId) {
    return T("exercises").majorer(exerciceId, { status: "closed", closed_at: new Date().toISOString() });
  },

  /* --- Tentatives --------------------------------------------------------- */
  async maTentative(exerciceId, utilisateurId) {
    const lignes = await T("exercise_attempts").liste({ exercise_id: exerciceId, user_id: utilisateurId });
    return lignes.sort((a, b) => (b.round || 1) - (a.round || 1))[0] || null;
  },
  /** Une tentative par élève ET par manche : relancer l'exercice ouvre une nouvelle manche. */
  async commencer(exerciceId, utilisateurId) {
    const ex = await T("exercises").lire(exerciceId);
    const manche = Number(ex?.settings?.manche) || 1;
    const lignes = await T("exercise_attempts").liste({ exercise_id: exerciceId, user_id: utilisateurId });
    const deja = lignes.find((l) => (l.round || 1) === manche);
    if (deja) return deja;
    return T("exercise_attempts").creer({
      exercise_id: exerciceId, user_id: utilisateurId, status: "started", round: manche,
      started_at: new Date().toISOString()
    });
  },
  /** Copie un exercice (et toutes ses questions) en brouillon, dans la même classe ou une autre. */
  async dupliquer(exerciceId, classeId, auteurId, titre) {
    const ex = await T("exercises").lire(exerciceId);
    const copie = await T("exercises").creer({
      class_id: classeId, author_id: auteurId, title: titre || `${ex.title} (copie)`,
      instructions: ex.instructions, status: "draft", exam_mode: ex.exam_mode,
      duration_sec: ex.duration_sec, settings: { ...(ex.settings || {}), manche: 1 }
    });
    for (const q of await this.questions(exerciceId)) {
      await this.ajouterQuestion(copie.id, {
        kind: q.kind, prompt: q.prompt, helper: q.helper, options: q.options,
        solution: q.solution, points: q.points, settings: q.settings || {}
      });
    }
    return copie;
  },
  async tentatives(exerciceId) {
    const lignes = await T("exercise_attempts").liste({ exercise_id: exerciceId });
    const profilsLies = await profils.parIds([...new Set(lignes.map((l) => l.user_id))]);
    const index = new Map(profilsLies.map((p) => [p.id, p]));
    return lignes.map((l) => ({ ...l, profil: index.get(l.user_id) || null }));
  },
  majorerTentative: (id, patch) => T("exercise_attempts").majorer(id, patch),
  soumettre: (id) => T("exercise_attempts").majorer(id, {
    status: "submitted", submitted_at: new Date().toISOString()
  }),
  corrigerAuto: (tentativeId) => pilote.rpc("autograde_attempt", { target_attempt: tentativeId }),

  reponses: (tentativeId) => T("exercise_answers").liste({ attempt_id: tentativeId }),
  enregistrerReponse: (tentativeId, questionId, reponse) =>
    T("exercise_answers").inserer(
      { attempt_id: tentativeId, question_id: questionId, response: reponse, updated_at: new Date().toISOString() },
      "attempt_id,question_id"
    ),
  noterReponse: (id, patch) => T("exercise_answers").majorer(id, patch)
};

export const notes = {
  liste: (filtre) => T("grades").liste(filtre, { ordre: "created_at", sens: "desc" }),
  creer: (donnees) => T("grades").creer(donnees),
  majorer: (id, patch) => T("grades").majorer(id, patch),
  supprimer: (id) => T("grades").supprimer(id)
};

/* ===========================================================================
   Vie de la session
   ========================================================================= */
export const annonces = {
  liste: (filtre, limite = 30) =>
    T("announcements").liste(filtre, { ordre: "created_at", sens: "desc", limite }),
  creer: (donnees) => T("announcements").creer(donnees),
  supprimer: (id) => T("announcements").supprimer(id)
};

export const questions = {
  async liste(sessionId) {
    const lignes = await T("session_questions").liste({ session_id: sessionId },
      { ordre: "created_at", sens: "desc" });
    const profilsLies = await profils.parIds([...new Set(lignes.map((l) => l.user_id))]);
    const index = new Map(profilsLies.map((p) => [p.id, p]));
    return lignes.map((l) => ({ ...l, profil: index.get(l.user_id) || null }));
  },
  poser: (donnees) => T("session_questions").creer({ status: "open", ...donnees }),
  repondre: (id, reponse, parQui) => T("session_questions").majorer(id, {
    answer: reponse, status: "answered", answered_by: parQui
  }),
  ignorer: (id) => T("session_questions").majorer(id, { status: "dismissed" }),
  supprimer: (id) => T("session_questions").supprimer(id)
};




/* ===========================================================================
   Notifications, favoris
   ========================================================================= */
export const notifications = {
  liste: (utilisateurId, limite = 40) =>
    T("notifications").liste({ user_id: utilisateurId }, { ordre: "created_at", sens: "desc", limite }),
  creer: (donnees) => T("notifications").creer(donnees),
  diffuser: (classeId, options) => pilote.rpc("notify_class", {
    target_class: classeId, notif_kind: options.kind || "info",
    notif_title: options.titre, notif_body: options.corps || null,
    notif_link: options.lien || null, include_self: options.inclureMoi || false
  }),
  lire: (id) => T("notifications").majorer(id, { read_at: new Date().toISOString() }),
  async toutLire(utilisateurId) {
    await T("notifications").majorerOu(
      { user_id: utilisateurId, read_at: null }, { read_at: new Date().toISOString() });
  },
  supprimer: (id) => T("notifications").supprimer(id)
};

export const favoris = {
  liste: (utilisateurId) => T("favorites").liste({ user_id: utilisateurId }, { ordre: "created_at", sens: "desc" }),
  async basculer(utilisateurId, genre, cibleId, libelle) {
    const existants = await T("favorites").liste({
      user_id: utilisateurId, target_kind: genre, target_id: cibleId
    });
    if (existants[0]) { await T("favorites").supprimer(existants[0].id); return false; }
    await T("favorites").creer({
      user_id: utilisateurId, target_kind: genre, target_id: cibleId, label: libelle
    });
    return true;
  }
};

/* ===========================================================================
   Temps réel et fichiers — exposés tels quels
   ========================================================================= */
/* ===========================================================================
   La boutique : encre et cahiers supplémentaires
   Toutes les règles sont appliquées par la base (migration 0039). Ce module ne
   fait que lire l'état et demander : il ne crédite jamais rien lui-même, et il
   ne décide d'aucun prix.
   ========================================================================= */
export const boutique = {
  /** { exempte, encre: { solde, recu, consomme }, cahiers: { crees, autorises, restants }, regles, pages_max, commandes_ouvertes } */
  moi: () => pilote.rpc("mon_commerce", {}),
  /** Les produits en vente (la base ne montre que les actifs aux non-administrateurs). */
  produits: () => T("products").liste({ active: true }, { ordre: "sort" }),
  mesCommandes: (utilisateurId, limite = 50) =>
    T("purchases").liste({ user_id: utilisateurId }, { ordre: "created_at", sens: "desc", limite }),
  /**
   * La missive de commande. Le paiement se fait EN JEU, entre l'élève et le PDG :
   * le site n'en traite aucun. Cette demande ouvre une commande EN ATTENTE au prix
   * de la base ; elle ne crédite rien. Seule la livraison par le PDG le fait.
   */
  commander: (sku, message = null) => pilote.rpc("passer_commande", { target_sku: sku, note: message }),
  annulerCommande: (id) => pilote.rpc("annuler_commande", { target: id }),

  /* --- Administration (la base vérifie la permission MANAGE_SHOP) --- */
  tousLesProduits: () => T("products").liste({}, { ordre: "sort" }),
  async reglages() {
    const lignes = await T("commerce_settings").liste();
    return Object.fromEntries(lignes.map((l) => [l.key, l.value]));
  },
  enregistrerProduit: (donnees) => pilote.rpc("admin_save_product", { donnees }),
  regler: (cle, valeur) => pilote.rpc("admin_set_setting", { cle, valeur }),
  donnerEncre: (cible, montant, note = null) => pilote.rpc("admin_grant_ink", { cible, montant, note }),
  donnerCahiers: (cible, nombre, note = null) => pilote.rpc("admin_grant_notebooks", { cible, nombre, note }),
  apercu: (recherche = null, limite = 200) => pilote.rpc("admin_commerce_overview", { recherche, limite }),
  livrerCommande: (id, note = null) => pilote.rpc("admin_livrer_commande", { target: id, note }),
  refuserCommande: (id, note = null) => pilote.rpc("admin_refuser_commande", { target: id, note }),
  commandes: (limite = 200) => T("purchases").liste({}, { ordre: "created_at", sens: "desc", limite }),
  historiquePrix: (limite = 100) =>
    T("product_price_history").liste({}, { ordre: "changed_at", sens: "desc", limite })
};

export const temps = {
  sabonner: (options) => pilote.temps.sabonner(options)
};

export const fichiers = {
  televerser: (...args) => pilote.fichiers.televerser(...args),
  url: (...args) => pilote.fichiers.url(...args),
  supprimer: (...args) => pilote.fichiers.supprimer(...args)
};

export const auth = {
  session: () => pilote.auth.session(),
  utilisateur: () => pilote.auth.utilisateur(),
  inscrire: (d) => pilote.auth.inscrire(d),
  connecter: (d) => pilote.auth.connecter(d),
  discord: () => pilote.auth.discord(),
  lienMagique: (e) => pilote.auth.lienMagique(e),
  reinitialiser: (e) => pilote.auth.reinitialiser(e),
  changerMotDePasse: (m) => pilote.auth.changerMotDePasse(m),
  remettreMotDePasse: (id, m) => pilote.auth.remettreMotDePasse(id, m),
  deconnecter: () => pilote.auth.deconnecter(),
  surChangement: (cb) => pilote.auth.surChangement(cb)
};

export { ErreurDonnees };
