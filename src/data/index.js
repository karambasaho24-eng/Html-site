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
  async assurer(utilisateur) {
    const existant = await T("profiles").lire(utilisateur.id);
    if (existant) return existant;
    return T("profiles").creer({
      id: utilisateur.id,
      display_name: utilisateur.email?.split("@")[0] || "Nouvel élève",
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
   ========================================================================= */
export const personnages = {
  async pour(classeId, utilisateurId) {
    const lignes = await T("rp_profiles").liste({ class_id: classeId, user_id: utilisateurId });
    return lignes[0] || null;
  },
  async liste(classeId) {
    return T("rp_profiles").liste({ class_id: classeId }, { ordre: "name" });
  },
  /** Index user_id → fiche, pour habiller une liste de membres. */
  async index(classeId) {
    const lignes = await this.liste(classeId).catch(() => []);
    return new Map(lignes.map((l) => [l.user_id, l]));
  },
  creer: (donnees) => T("rp_profiles").creer(donnees),
  majorer: (id, patch) => T("rp_profiles").majorer(id, patch),
  supprimer: (id) => T("rp_profiles").supprimer(id),

  async enregistrer(classeId, utilisateurId, donnees) {
    const existante = await this.pour(classeId, utilisateurId);
    if (existante) return this.majorer(existante.id, donnees);
    return this.creer({ class_id: classeId, user_id: utilisateurId, ...donnees });
  }
};

/* ===========================================================================
   Livret de service
   Mentions, sanctions, promotions et aptitudes. C'est ce qui donne aux actes
   des conséquences durables, et au classement de promotion sa matière.
   ========================================================================= */
export const livret = {
  /** Tout le livret d'un espace, ou celui d'un seul membre. */
  liste: (classeId, utilisateurId = undefined) =>
    T("service_records").liste(
      { class_id: classeId, ...(utilisateurId ? { user_id: utilisateurId } : {}) },
      { ordre: "created_at", sens: "desc" }),

  creer: (donnees) => T("service_records").creer(donnees),
  supprimer: (id) => T("service_records").supprimer(id),

  /**
   * Classement de promotion, du meilleur au dernier.
   *
   * Il passe par une procédure et non par une lecture directe : la RLS ne
   * montre à un membre que ses propres inscriptions, si bien qu'un calcul
   * côté client ne lui donnerait qu'une ligne — la sienne. Le classement,
   * lui, est un tableau d'honneur : il se lit en entier, sans pour autant
   * ouvrir le détail des livrets.
   */
  async classement(classeId) {
    const lignes = await pilote.rpc("class_standings", { target_class: classeId });
    return (lignes || [])
      .map((l) => ({
        user_id: l.user_id,
        evaluations: Number(l.evaluations) || 0,
        taux: l.taux == null ? 0 : Number(l.taux),
        total: l.total == null ? 0 : Number(l.total)
      }))
      .sort((a, b) => b.taux - a.taux || b.evaluations - a.evaluations)
      .map((ligne, i) => ({ ...ligne, rang: i + 1 }));
  }
};

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
export const renvois = {
  liste: (sessionId) => T("session_ejections").liste({ session_id: sessionId },
    { ordre: "created_at", sens: "desc" }),
  renvoyer: (sessionId, utilisateurId, motif, atteste) =>
    pilote.rpc("eject_member", {
      target_session: sessionId, target_user: utilisateurId,
      motif: motif || null, proche: Boolean(atteste)
    }),
  /** Lever un renvoi : la personne peut revenir. */
  lever: (id) => T("session_ejections").supprimer(id)
};

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
  creer: (donnees) => T("notebooks").creer({
    archived: false, support: "cahier", max_pages: 10, place: "range",
    size: VOLUME_SUPPORT[donnees.support || "cahier"] || 4, ...donnees
  }),

  /* Un cahier est un objet comme un autre : il est rangé, sur le bureau, ou
     resté en salle. Oublié, on ne l'a pas — même s'il est à soi. */
  sortir: (cahier, { session, classe }) => T("notebooks").majorer(cahier.id, {
    place: "bureau", place_session: session.id, place_class: classe.id,
    place_label: classe.name || null, container_id: null
  }),
  rangerDans: (cahier, contenantId) => T("notebooks").majorer(cahier.id, {
    container_id: contenantId, place: "range", place_session: null,
    place_class: null, place_label: null
  }),
  laisser: (cahier, { classe }) => T("notebooks").majorer(cahier.id, {
    place: "salle", place_class: classe.id, place_label: classe.name || null,
    place_session: null, container_id: null
  }),
  recuperer: (id) => pilote.rpc("recover_notebook", { target: id }),

  /** Inspection d'un support apporté au cartable, par l'encadrement. */
  inspecter: (cahierId, classeId) =>
    pilote.rpc("inspect_notebook", { target_notebook: cahierId, target_class: classeId }),
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
   Cartable
   Ce qu'on a apporté en séance. Sert aussi de frontière : un support resté
   chez soi ne peut pas être inspecté.
   ========================================================================= */
export const cartable = {
  async pour(classeId, utilisateurId) {
    const lignes = await T("class_bags").liste({ class_id: classeId, user_id: utilisateurId });
    return lignes[0] || null;
  },
  async liste(classeId) {
    const lignes = await T("class_bags").liste({ class_id: classeId });
    return new Map(lignes.map((l) => [l.user_id, l]));
  },

  /**
   * `notebooks` est un objet { identifiant: intitulé }, et non une liste.
   * `supplies` suit la même forme : { identifiant: { kind, label } }. C'est ce
   * qui permet à la base de tester la présence d'un objet avec l'opérateur `?`
   * — donc de confisquer ce qui a été apporté, et seulement cela.
   * L'identifiant sert à l'inspection (les politiques SQL testent la présence
   * de la clé avec l'opérateur `?`), l'intitulé sert au contrôle du matériel :
   * l'encadrement demande « le cahier de manœuvre », et chacun apporte le
   * sien, qui porte un identifiant différent.
   */
  async enregistrer(classeId, utilisateurId, { notebooks, supplies, session = null }) {
    const existant = await this.pour(classeId, utilisateurId);
    const patch = { notebooks: normaliserSac(notebooks), supplies: normaliserTrousse(supplies) };
    // S'équiper pour une séance laisse une trace datée : c'est elle qui
    // distingue « j'ai ces affaires » de « je les ai sur moi aujourd'hui ».
    if (session) {
      patch.last_session = session;
      patch.checked_at = new Date().toISOString();
    }
    if (existant) return T("class_bags").majorer(existant.id, patch);
    return T("class_bags").creer({ class_id: classeId, user_id: utilisateurId, ...patch });
  },

  /** Ses affaires sont-elles équipées pour CETTE séance ? */
  equipePour(sac, sessionId) {
    return Boolean(sac && sessionId && String(sac.last_session) === String(sessionId));
  },

  /** Les identifiants des supports réellement apportés. */
  apportes(sac) {
    return Object.keys(normaliserSac(sac?.notebooks));
  },

  /** Ce qui manque par rapport à ce que l'encadrement a demandé. */
  manquants(sac, attendu = {}) {
    const emportes = normaliserSac(sac?.notebooks);
    const parId = new Set(Object.keys(emportes));
    const parTitre = new Set(Object.values(emportes).map((t) => String(t).trim().toLowerCase()));
    const fournitures = new Set((sac?.supplies || []).map((f) => String(f).toLowerCase()));

    return {
      // On accepte l'intitulé autant que l'identifiant : c'est le nom du
      // support qui a été demandé à voix haute, pas sa clé technique.
      supports: (attendu.supports || []).filter((s) =>
        !parId.has(String(s.id)) && !parTitre.has(String(s.title || "").trim().toLowerCase())),
      fournitures: (attendu.fournitures || []).filter((f) => !fournitures.has(f.toLowerCase()))
    };
  }
};

/* ===========================================================================
   Les affaires

   Ce qu'on possède, et où c'est. Le cartable dit ce qu'on a DÉCLARÉ emporter ;
   ceci dit ce qui existe. Les deux se répondent : on boucle son sac en
   choisissant parmi ses affaires, et la déclaration en garde la trace.
   ========================================================================= */
export const affaires = {
  miennes: (utilisateurId) =>
    T("belongings").liste({ owner_id: utilisateurId }, { ordre: "created_at" }),

  /** Ce que j'ai entre les mains sans que ce soit à moi. */
  enMain: (utilisateurId) => T("belongings").liste({ holder_id: utilisateurId }),

  /** Tout ce dont je dispose, d'où que ça vienne. */
  async toutes(utilisateurId) {
    const [aMoi, pretees] = await Promise.all([
      this.miennes(utilisateurId),
      this.enMain(utilisateurId).catch(() => [])
    ]);
    const vus = new Set(aMoi.map((o) => String(o.id)));
    return [...aMoi, ...pretees.filter((o) => !vus.has(String(o.id)))];
  },

  lire: (id) => T("belongings").lire(id),

  creer: (donnees) => T("belongings").creer({
    state: "owned", quantity: 1, carried: false, is_container: false,
    container_id: null, label: "", meta: {}, place: "range", size: 1, ...donnees
  }),

  /* --- Les lieux ------------------------------------------------------------
     Trois lieux : rangé (dans un contenant, ou chez soi), sur le bureau
     pendant une activité, laissé en salle. La base refuse les passages
     impossibles (voir app_garde_du_lieu, 0019) ; ces fonctions ne font que
     demander. */

  /** Sortir de son sac et poser devant soi, pour cette activité. */
  sortir: (objet, { session, classe }) => T("belongings").majorer(objet.id, {
    place: "bureau", place_session: session.id, place_class: classe.id,
    place_label: classe.name || null, container_id: null,
    // D'où il vient : c'est là qu'on le remettra en rangeant.
    meta: { ...(objet.meta || {}), depuis: objet.container_id || null }
  }),

  /** Remettre dans un contenant — le sac, la trousse, un dossier. */
  rangerDans: (objet, contenantId) => T("belongings").majorer(objet.id, {
    container_id: contenantId, place: "range", place_session: null,
    place_class: null, place_label: null
  }),

  /** Partir en laissant l'objet derrière soi. Il reste dans la salle. */
  laisser: (objet, { classe }) => T("belongings").majorer(objet.id, {
    place: "salle", place_class: classe.id, place_label: classe.name || null,
    place_session: null, container_id: null
  }),

  /** Revenir le chercher. La base vérifie que la salle est ouverte. */
  recuperer: (id) => pilote.rpc("recover_belonging", { target: id }),

  majorer: (id, patch) => T("belongings").majorer(id, patch),
  supprimer: (id) => T("belongings").supprimer(id),

  /** Ranger un objet dans un contenant, ou le sortir (contenant nul). */
  ranger: (id, contenantId) => T("belongings").majorer(id, { container_id: contenantId || null }),

  /** Porter un contenant sur soi, ou le laisser. */
  porter: (id, oui) => T("belongings").majorer(id, { carried: Boolean(oui) }),

  /**
   * Entamer un consommable. Le niveau ne descend jamais sous zéro : un encrier
   * vide est vide, il ne devient pas négatif — et c'est cet état-là qui se joue.
   */
  async consommer(objet, pas = 1) {
    const avant = Number(objet?.level);
    if (!Number.isFinite(avant)) return objet;
    const apres = Math.max(0, Math.min(100, Math.round(avant - pas)));
    if (apres === avant) return objet;
    return T("belongings").majorer(objet.id, { level: apres });
  },

  /**
   * Remplir son encrier au flacon. Ce qui entre dans l'un sort de l'autre :
   * sans cela, l'encre se créerait toute seule et l'objet ne pèserait plus rien.
   */
  async remplir(encrier, flacon) {
    const place = 100 - Number(encrier.level || 0);
    if (place <= 0) return { verse: 0 };
    const dispo = Number(flacon?.level || 0);
    if (dispo <= 0) return { verse: 0 };
    const verse = Math.min(place, dispo);
    await T("belongings").majorer(encrier.id, { level: Number(encrier.level || 0) + verse });
    await T("belongings").majorer(flacon.id, { level: dispo - verse });
    return { verse };
  },

  perdre: (id) => T("belongings").majorer(id, { state: "lost", container_id: null, carried: false }),
  retrouver: (id) => T("belongings").majorer(id, { state: "owned" }),

  /** Confisquer : geste d'autorité, vérifié côté base. */
  confisquer: (id, classeId, motif) =>
    pilote.rpc("confiscate_belonging", { target: id, target_class: classeId, motif: motif || null }),
  restituer: (id) => pilote.rpc("release_belonging", { target: id }),

  /**
   * La dotation de départ. Personne n'arrive à l'école les mains vides : sans
   * cela, la première visite montre une étagère nue et une consigne qu'on ne
   * peut pas satisfaire. On ne la repose jamais deux fois.
   */
  async assurerDotation(utilisateurId, dotation) {
    const deja = await this.miennes(utilisateurId).catch(() => []);
    if (deja.length) return deja;

    const parType = new Map();
    for (const item of dotation) {
      const cree = await this.creer({
        owner_id: utilisateurId,
        kind: item.kind,
        label: item.label || "",
        category: item.category || "autre",
        is_container: Boolean(item.contenant),
        carried: Boolean(item.carried),
        container_id: item.dans ? (parType.get(item.dans)?.id || null) : null,
        level: item.level ?? null,
        quantity: item.quantity ?? 1,
        size: item.size ?? 1,
        capacity: item.capacity ?? null
      });
      parType.set(item.kind, cree);
    }
    return this.miennes(utilisateurId);
  }
};

/** La place que prend un support dans un sac. Même valeurs que 0019. */
export const VOLUME_SUPPORT = { feuille: 1, carnet: 3, cahier: 4, dossier: 5 };

/* ===========================================================================
   La salle : ce qu'on y a laissé, et qui peut y entrer

   Une salle est ouverte quand une séance s'y tient, quand l'encadrement l'a
   ouverte pour un temps, ou pour une personne munie d'un laissez-passer. Hors
   de cela, ce qui y est resté y reste.
   ========================================================================= */
export const salles = {
  /** Ce qui traîne dans la salle — réservé à l'encadrement. */
  async oublies(classeId) {
    const lignes = await pilote.rpc("forgotten_in_class", { target_class: classeId });
    return Array.isArray(lignes) ? lignes : [];
  },

  /** Rendre à son propriétaire ce qu'il a laissé. Geste volontaire. */
  restituer: (genre, id) => pilote.rpc("restitute_forgotten", { genre, target: id }),

  /** La salle est-elle ouverte, pour moi, maintenant ? Lecture seule : la
   *  base refait le même calcul avant toute récupération. */
  ouverte(classe, seanceEnCours, utilisateurId) {
    if (seanceEnCours && seanceEnCours.status === "live") return true;
    const r = classe?.settings || {};
    const maintenant = Date.now();
    if (r.salle_ouverte_jusqua && new Date(r.salle_ouverte_jusqua).getTime() > maintenant) return true;
    const passe = r.passes?.[utilisateurId];
    return Boolean(passe && new Date(passe).getTime() > maintenant);
  },

  /** Ouvrir la salle un moment : chacun peut venir y reprendre ses affaires. */
  async ouvrir(classe, minutes = 30) {
    const jusqua = new Date(Date.now() + minutes * 60000).toISOString();
    const settings = { ...(classe.settings || {}), salle_ouverte_jusqua: jusqua };
    const maj = await T("classes").majorer(classe.id, { settings });
    classe.settings = maj?.settings || settings;
    return jusqua;
  },

  async fermer(classe) {
    const settings = { ...(classe.settings || {}), salle_ouverte_jusqua: null };
    const maj = await T("classes").majorer(classe.id, { settings });
    classe.settings = maj?.settings || settings;
  },

  /** Autoriser une seule personne à entrer, pour un temps. */
  async laissezPasser(classe, utilisateurId, minutes = 20) {
    const jusqua = new Date(Date.now() + minutes * 60000).toISOString();
    const settings = { ...(classe.settings || {}),
      passes: { ...(classe.settings?.passes || {}), [utilisateurId]: jusqua } };
    const maj = await T("classes").majorer(classe.id, { settings });
    classe.settings = maj?.settings || settings;
    return jusqua;
  }
};

/* ===========================================================================
   Les dossiers et ce qu'on y classe

   Un dossier est un objet (belongings, kind « dossier ») ; ce qu'il contient
   est une liste de papiers. On ne déplace pas un papier, on le classe.
   ========================================================================= */
export const classement = {
  contenu: (dossierId) => T("dossier_items").liste({ dossier_id: dossierId }, { ordre: "created_at" }),
  deDossiers: (ids) => ids.length
    ? T("dossier_items").liste({ dossier_id: ids }, { ordre: "created_at" })
    : Promise.resolve([]),
  ranger: (dossierId, paperId, utilisateurId) => T("dossier_items").inserer(
    { dossier_id: dossierId, paper_id: paperId, added_by: utilisateurId }, "dossier_id,paper_id"),
  sortir: (id) => T("dossier_items").supprimer(id)
};

/* ===========================================================================
   Ce qui passe de main en main

   Un seul dépôt pour les deux directions : « tiens, prends ma règle » et
   « tu me prêtes ta règle ? » aboutissent au même transfert.
   ========================================================================= */
export const remisesObjet = {
  /** Ce qu'on me tend, ou ce qu'on me demande, et qui attend ma réponse. */
  enAttente: (utilisateurId) =>
    T("belonging_handoffs").liste({ to_user: utilisateurId, state: "offered" },
      { ordre: "created_at", sens: "desc" }),

  /** Ce que j'ai proposé ou demandé et qui n'a pas été tranché. */
  mesDemandes: (utilisateurId) =>
    T("belonging_handoffs").liste({ from_user: utilisateurId, state: "offered" },
      { ordre: "created_at", sens: "desc" }),

  /** Ce que j'ai emprunté et qui n'est pas rendu. */
  async aRendre(utilisateurId) {
    const lignes = await T("belonging_handoffs").liste({ state: "accepted", kind: "lend" },
      { ordre: "created_at", sens: "desc" });
    return lignes.filter((l) =>
      (l.direction === "offer" && l.to_user === utilisateurId)
      || (l.direction === "request" && l.from_user === utilisateurId));
  },

  /** Ce que j'ai prêté et qui n'est pas revenu. */
  async pretes(utilisateurId) {
    const lignes = await T("belonging_handoffs").liste({ state: "accepted", kind: "lend" },
      { ordre: "created_at", sens: "desc" });
    return lignes.filter((l) =>
      (l.direction === "offer" && l.from_user === utilisateurId)
      || (l.direction === "request" && l.to_user === utilisateurId));
  },

  /** L'historique léger : les transferts tranchés qui me concernent. */
  async histoire(utilisateurId, limite = 40) {
    const lignes = await T("belonging_handoffs").liste({}, { ordre: "created_at", sens: "desc", limite: 200 });
    return lignes
      .filter((l) => l.from_user === utilisateurId || l.to_user === utilisateurId)
      .filter((l) => l.state !== "offered")
      .slice(0, limite);
  },

  tendre: (donnees) => T("belonging_handoffs").creer({
    state: "offered", direction: "offer", kind: "lend", attested: false, ...donnees
  }),

  demander: (donnees) => T("belonging_handoffs").creer({
    state: "offered", direction: "request", kind: "lend", attested: false, ...donnees
  }),

  /** Seule la procédure déplace un objet : voir 0018. */
  accepter: (id, choisi = null) =>
    pilote.rpc("accept_belonging_handoff", { handoff: id, chosen: choisi || null }),

  rendre: (id) => pilote.rpc("return_belonging_handoff", { handoff: id }),

  refuser: (id) => T("belonging_handoffs").majorer(id, {
    state: "refused", settled_at: new Date().toISOString()
  }),
  reprendre: (id) => T("belonging_handoffs").majorer(id, {
    state: "cancelled", settled_at: new Date().toISOString()
  })
};

/* ===========================================================================
   La privation de matériel

   Le cartable constatait l'oubli ; ceci lui donne un prix. Une privation
   court pendant un nombre de minutes fixé par la classe, et le maître seul
   peut l'abréger — c'est lui qui autorise à aller chercher ses affaires.
   ========================================================================= */
export const privations = {
  liste: (sessionId) => T("supply_blocks").liste({ session_id: sessionId },
    { ordre: "started_at", sens: "desc" }),

  async pour(sessionId, utilisateurId) {
    const lignes = await T("supply_blocks").liste({ session_id: sessionId, user_id: utilisateurId });
    return lignes[0] || null;
  },

  /**
   * Ouvre la privation à l'entrée en séance, ou rend celle qui court déjà.
   * On ne la rouvre jamais : revenir dans la salle ne remet pas le compteur
   * à zéro, sans quoi il suffirait de sortir et de rentrer pour l'effacer.
   */
  async ouvrir({ sessionId, classeId, utilisateurId, minutes, manquants }) {
    const existante = await this.pour(sessionId, utilisateurId);
    if (existante) return existante;
    return T("supply_blocks").creer({
      session_id: sessionId, class_id: classeId, user_id: utilisateurId,
      state: "blocked", minutes, missing: manquants,
      // Le pilote local ne connaît pas les valeurs par défaut du schéma :
      // sans cette date posée ici, le décompte partirait d'un NaN et la
      // privation ne commencerait jamais.
      started_at: new Date().toISOString()
    });
  },

  /** « Puis-je aller chercher mes affaires ? » */
  demander: (id) => T("supply_blocks").majorer(id, { state: "asked" }),

  /** La réponse du maître : on y va, ou on reste à sa place. */
  trancher: (id, accorde, decideur) => T("supply_blocks").majorer(id, {
    state: accorde ? "granted" : "denied",
    decided_at: new Date().toISOString(), decided_by: decideur
  }),

  /** Le maître lève la privation sans qu'on ait rien demandé. */
  lever: (id, decideur) => T("supply_blocks").majorer(id, {
    state: "lifted", decided_at: new Date().toISOString(), decided_by: decideur
  }),

  /**
   * Reste-t-il du temps à purger ? La privation tombe d'elle-même à
   * l'échéance : le maître n'a pas à y repenser.
   */
  secondesRestantes(privation) {
    if (!privation) return 0;
    // Lever la main n'affranchit pas : on reste privé tant qu'on n'a pas
    // obtenu le laissez-passer. Seuls « granted » et « lifted » rendent la
    // plume — le refus, lui, laisse le temps courir.
    if (!["blocked", "asked", "denied"].includes(privation.state)) return 0;
    const depart = new Date(privation.started_at || privation.created_at || Date.now()).getTime();
    if (!Number.isFinite(depart)) return 0;
    const fin = depart + (privation.minutes || 15) * 60000;
    return Math.max(0, Math.round((fin - Date.now()) / 1000));
  },

  /** Privé d'écrire, ici et maintenant. */
  prive(privation) {
    return this.secondesRestantes(privation) > 0;
  }
};

/* ===========================================================================
   Tendre son cahier

   Montrer ne passe pas par ici : un regard n'a pas à laisser de trace.
   Prêter et donner, si — il faut savoir chez qui l'objet se trouve.
   ========================================================================= */
export const remisesCahier = {
  /** Ce qu'on me tend et qui attend ma réponse. */
  enAttente: (utilisateurId) =>
    T("notebook_handoffs").liste({ to_user: utilisateurId, state: "offered" },
      { ordre: "created_at", sens: "desc" }),

  /** Ce que j'ai entre les mains sans que ce soit à moi. */
  empruntes: (utilisateurId) =>
    T("notebook_handoffs").liste({ to_user: utilisateurId, state: "accepted" },
      { ordre: "created_at", sens: "desc" }),

  /** Ce que j'ai tendu et qui n'est pas revenu. */
  pretes: (utilisateurId) =>
    T("notebook_handoffs").liste({ from_user: utilisateurId, state: "accepted" },
      { ordre: "created_at", sens: "desc" }),

  tendre: (donnees) => T("notebook_handoffs").creer(donnees),

  /** Seule la procédure peut changer un propriétaire : voir 0016. */
  accepter: (id) => pilote.rpc("accept_notebook_handoff", { handoff: id }),

  refuser: (id) => T("notebook_handoffs").majorer(id, {
    state: "refused", settled_at: new Date().toISOString()
  }),
  rendre: (id) => T("notebook_handoffs").majorer(id, {
    state: "returned", settled_at: new Date().toISOString()
  }),
  reprendre: (id) => T("notebook_handoffs").majorer(id, {
    state: "cancelled", settled_at: new Date().toISOString()
  })
};

/* ===========================================================================
   Les annotations du maître

   Il écrit SUR le cahier, jamais dedans : la copie du cadet reste mot pour
   mot ce qu'il a écrit, et la main qui corrige se distingue toujours.
   ========================================================================= */
export const annotations = {
  dePage: (pageId) => T("page_annotations").liste({ page_id: pageId }, { ordre: "created_at" }),
  dePages: (pageIds) => pageIds.length
    ? T("page_annotations").liste({ page_id: pageIds }, { ordre: "created_at" })
    : Promise.resolve([]),
  ecrire: (donnees) => T("page_annotations").creer(donnees),
  majorer: (id, patch) => T("page_annotations").majorer(id, {
    ...patch, updated_at: new Date().toISOString()
  }),
  effacer: (id) => T("page_annotations").supprimer(id)
};

/** Accepte l'ancienne forme (liste d'identifiants) comme la nouvelle. */
function normaliserSac(valeur) {
  if (!valeur) return {};
  if (Array.isArray(valeur)) return Object.fromEntries(valeur.map((id) => [String(id), ""]));
  return valeur;
}

/**
 * La trousse déclarée. Longtemps une liste de mots (« Plume », « Encre ») ;
 * maintenant une carte d'objets réels. On accepte les deux : une classe
 * configurée l'an dernier ne doit pas perdre sa consigne, et un sac bouclé
 * hier doit rester lisible.
 */
function normaliserTrousse(valeur) {
  if (!valeur) return {};
  if (Array.isArray(valeur)) {
    return Object.fromEntries(valeur.map((v) =>
      typeof v === "string" ? [v, { kind: null, label: v }] : [String(v.id), { kind: v.kind, label: v.label }]));
  }
  return valeur;
}

/* ===========================================================================
   Papiers remis en main propre
   ========================================================================= */
export const papiers = {
  mesPapiers: (auteurId) =>
    T("papers").liste({ author_id: auteurId }, { ordre: "created_at", sens: "desc" }),
  lire: (id) => T("papers").lire(id),
  creer: (donnees) => T("papers").creer(donnees),
  majorer: (id, patch) => T("papers").majorer(id, patch),
  supprimer: (id) => T("papers").supprimer(id),

  /** Duplique un papier pour en tendre plusieurs exemplaires. */
  async dupliquer(paperId, exemplaires = 1) {
    const source = await T("papers").lire(paperId);
    if (!source) throw new ErreurDonnees("Papier introuvable", "P0002");
    const copies = [];
    for (let i = 0; i < exemplaires; i++) {
      const { id, created_at, updated_at, ...reste } = source;
      copies.push(await T("papers").creer(reste));
    }
    return copies;
  },

  /** Tendre un papier. `attested` : l'émetteur déclare être à proximité. */
  tendre: (donnees) => T("paper_handoffs").creer({ state: "offered", ...donnees }),

  async recus(utilisateurId) {
    const remises = await T("paper_handoffs").liste({ to_user: utilisateurId },
      { ordre: "created_at", sens: "desc" });
    if (!remises.length) return [];
    const contenus = await T("papers").liste({ id: [...new Set(remises.map((r) => r.paper_id))] });
    const index = new Map(contenus.map((c) => [c.id, c]));
    const auteurs = await profils.parIds([...new Set(remises.map((r) => r.from_user))]);
    const parAuteur = new Map(auteurs.map((a) => [a.id, a]));
    return remises.map((r) => ({ ...r, papier: index.get(r.paper_id) || null, auteur: parAuteur.get(r.from_user) || null }));
  },

  async envoyes(utilisateurId) {
    return T("paper_handoffs").liste({ from_user: utilisateurId }, { ordre: "created_at", sens: "desc" });
  },

  repondre: (remiseId, etat) => T("paper_handoffs").majorer(remiseId, {
    state: etat, settled_at: new Date().toISOString()
  }),

  /**
   * Ce qui circule, pour la modération. La base filtre : seul un modérateur
   * ou un administrateur reçoit plus que ses propres remises.
   */
  async circulation(limite = 200) {
    const remises = await T("paper_handoffs").liste({},
      { ordre: "created_at", sens: "desc", limite });
    if (!remises.length) return [];

    const contenus = await T("papers").liste({ id: [...new Set(remises.map((r) => r.paper_id))] });
    const parPapier = new Map(contenus.map((c) => [c.id, c]));
    const gens = await profils.parIds([...new Set(
      remises.flatMap((r) => [r.from_user, r.to_user]))]);
    const parId = new Map(gens.map((p) => [p.id, p]));

    return remises.map((r) => ({
      ...r,
      papier: parPapier.get(r.paper_id) || null,
      expediteur: parId.get(r.from_user) || null,
      destinataire: parId.get(r.to_user) || null
    }));
  }
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
    return T("exercises").majorer(exerciceId, {
      status: "live", opened_at: new Date().toISOString(), closed_at: null
    });
  },
  async fermer(exerciceId) {
    return T("exercises").majorer(exerciceId, { status: "closed", closed_at: new Date().toISOString() });
  },

  /* --- Tentatives --------------------------------------------------------- */
  async maTentative(exerciceId, utilisateurId) {
    const lignes = await T("exercise_attempts").liste({ exercise_id: exerciceId, user_id: utilisateurId });
    return lignes[0] || null;
  },
  async commencer(exerciceId, utilisateurId) {
    const deja = await this.maTentative(exerciceId, utilisateurId);
    if (deja) return deja;
    return T("exercise_attempts").creer({
      exercise_id: exerciceId, user_id: utilisateurId, status: "started",
      started_at: new Date().toISOString()
    });
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

export const mains = {
  async liste(sessionId) {
    const lignes = await T("hands").liste({ session_id: sessionId }, { ordre: "raised_at" });
    return lignes.filter((l) => l.status !== "lowered");
  },
  lever: (sessionId, utilisateurId) => T("hands").inserer(
    { session_id: sessionId, user_id: utilisateurId, status: "raised", raised_at: new Date().toISOString() },
    "session_id,user_id"
  ),
  async baisser(sessionId, utilisateurId) {
    const lignes = await T("hands").liste({ session_id: sessionId, user_id: utilisateurId });
    if (lignes[0]) return T("hands").majorer(lignes[0].id, { status: "lowered" });
    return null;
  },
  majorer: (id, patch) => T("hands").majorer(id, patch)
};

export const sondages = {
  liste: (sessionId) => T("polls").liste({ session_id: sessionId }, { ordre: "created_at", sens: "desc" }),
  async actif(sessionId) {
    const lignes = await T("polls").liste({ session_id: sessionId, status: "open" },
      { ordre: "created_at", sens: "desc", limite: 1 });
    return lignes[0] || null;
  },
  creer: (donnees) => T("polls").creer({ status: "open", kind: "poll", ...donnees }),
  fermer: (id) => T("polls").majorer(id, { status: "closed" }),
  supprimer: (id) => T("polls").supprimer(id),
  votes: (sondageId) => T("poll_votes").liste({ poll_id: sondageId }),
  voter: (sondageId, utilisateurId, choix) => T("poll_votes").inserer(
    { poll_id: sondageId, user_id: utilisateurId, choice: choix }, "poll_id,user_id"
  )
};

export const minuteries = {
  async active(sessionId) {
    const lignes = await T("timers").liste({ session_id: sessionId },
      { ordre: "created_at", sens: "desc", limite: 1 });
    const derniere = lignes[0];
    return derniere && derniere.state !== "idle" ? derniere : derniere || null;
  },
  creer: (donnees) => T("timers").creer(donnees),
  majorer: (id, patch) => T("timers").majorer(id, patch),
  supprimer: (id) => T("timers").supprimer(id)
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
  lienMagique: (e) => pilote.auth.lienMagique(e),
  reinitialiser: (e) => pilote.auth.reinitialiser(e),
  deconnecter: () => pilote.auth.deconnecter(),
  surChangement: (cb) => pilote.auth.surChangement(cb)
};

export { ErreurDonnees };
