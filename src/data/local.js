/* ---------------------------------------------------------------------------
 * Pilote local — MODE DÉMONSTRATION.
 *
 * Tout vit dans le navigateur : localStorage pour les tables, IndexedDB pour
 * les fichiers, BroadcastChannel pour la synchronisation entre onglets du même
 * poste. C'est ce qui permet de tester le duo professeur / élève sans serveur.
 *
 * Ce pilote n'offre AUCUNE sécurité réelle : il n'y a ni RLS ni vérification
 * côté serveur. Il ne doit jamais servir en production — l'interface le signale
 * en permanence.
 * ------------------------------------------------------------------------- */
import { ErreurDonnees, TABLES } from "./contrat.js";
import { uid, genererCode } from "../core/util.js";

const PREFIXE = "ojm.local.";
const CANAL = "ojm.local.temps";

/* --- Accès aux collections ------------------------------------------------ */
function charger(table) {
  try {
    const brut = localStorage.getItem(PREFIXE + table);
    return brut ? JSON.parse(brut) : [];
  } catch { return []; }
}

function sauver(table, lignes) {
  try {
    localStorage.setItem(PREFIXE + table, JSON.stringify(lignes));
  } catch (err) {
    throw new ErreurDonnees("Espace de stockage local saturé. Libérez de la place.", "QUOTA", err);
  }
}

/* --- Diffusion inter-onglets --------------------------------------------- */
const diffuseur = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CANAL) : null;
const ecouteursLocaux = new Set();

function publier(message) {
  try { diffuseur?.postMessage(message); } catch { /* onglet fermé */ }
  for (const l of ecouteursLocaux) { try { l(message); } catch (e) { console.error(e); } }
}

diffuseur?.addEventListener("message", (e) => {
  for (const l of ecouteursLocaux) { try { l(e.data); } catch (err) { console.error(err); } }
});

function signaler(table, type, nouveau, ancien = null) {
  publier({ genre: "table", table, type, nouveau, ancien, emetteur: ONGLET });
}

const ONGLET = uid();

/* --- Filtres --------------------------------------------------------------- */
function correspond(ligne, filtre) {
  for (const [cle, valeur] of Object.entries(filtre || {})) {
    if (valeur === undefined) continue;
    if (Array.isArray(valeur)) { if (!valeur.includes(ligne[cle])) return false; }
    else if (valeur === null) { if (ligne[cle] != null) return false; }
    else if (typeof valeur === "object" && valeur.operateur) {
      const v = ligne[cle];
      const c = valeur.valeur;
      const ok = valeur.operateur === "gt" ? v > c
        : valeur.operateur === "gte" ? v >= c
        : valeur.operateur === "lt" ? v < c
        : valeur.operateur === "lte" ? v <= c
        : valeur.operateur === "neq" ? v !== c
        : v === c;
      if (!ok) return false;
    }
    else if (ligne[cle] !== valeur) return false;
  }
  return true;
}

/** Analyse un filtre Realtime façon PostgREST : « class_id=eq.<uuid> ». */
function analyserFiltreTemps(expression) {
  if (!expression) return null;
  const m = /^([\w.]+)=(eq|in)\.(.*)$/.exec(expression);
  if (!m) return null;
  const [, colonne, operateur, brut] = m;
  if (operateur === "in") {
    const valeurs = brut.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
    return (ligne) => valeurs.includes(String(ligne?.[colonne]));
  }
  return (ligne) => String(ligne?.[colonne]) === brut;
}

/* --- Dépôt générique ------------------------------------------------------ */
function depot(nom) {
  return {
    nom,
    async liste(filtre = {}, options = {}) {
      let lignes = charger(nom).filter((l) => correspond(l, filtre));
      if (options.ordre) {
        const sens = options.sens === "desc" ? -1 : 1;
        lignes.sort((a, b) => {
          const va = a[options.ordre], vb = b[options.ordre];
          if (va === vb) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          return (va > vb ? 1 : -1) * sens;
        });
      }
      if (options.limite) lignes = lignes.slice(0, options.limite);
      return lignes.map((l) => ({ ...l }));
    },
    async lire(id) {
      const ligne = charger(nom).find((l) => l.id === id);
      return ligne ? { ...ligne } : null;
    },
    async creer(objet) {
      const lignes = charger(nom);
      const ligne = {
        created_at: new Date().toISOString(),
        ...objet,
        id: objet.id || uid()
      };

      // Équivalent du déclencheur classes_set_code côté SQL.
      if (nom === "classes" && !ligne.code) {
        do { ligne.code = genererCode(); }
        while (lignes.some((l) => l.code === ligne.code));
      }
      lignes.push(ligne);
      sauver(nom, lignes);
      signaler(nom, "INSERT", ligne);
      return { ...ligne };
    },
    async creerPlusieurs(objets) {
      const sortie = [];
      for (const o of objets) sortie.push(await this.creer(o));
      return sortie;
    },
    async majorer(id, patch) {
      const lignes = charger(nom);
      const i = lignes.findIndex((l) => l.id === id);
      if (i < 0) throw new ErreurDonnees("Élément introuvable", "P0002");
      const ancien = { ...lignes[i] };
      lignes[i] = { ...lignes[i], ...patch, updated_at: new Date().toISOString() };
      sauver(nom, lignes);
      signaler(nom, "UPDATE", lignes[i], ancien);
      return { ...lignes[i] };
    },
    async majorerOu(filtre, patch) {
      const lignes = charger(nom);
      const touchees = [];
      for (let i = 0; i < lignes.length; i++) {
        if (!correspond(lignes[i], filtre)) continue;
        const ancien = { ...lignes[i] };
        lignes[i] = { ...lignes[i], ...patch, updated_at: new Date().toISOString() };
        touchees.push({ nouveau: lignes[i], ancien });
      }
      sauver(nom, lignes);
      for (const t of touchees) signaler(nom, "UPDATE", t.nouveau, t.ancien);
      return touchees.map((t) => ({ ...t.nouveau }));
    },
    async inserer(objet, conflit) {
      if (conflit) {
        const cles = conflit.split(",").map((c) => c.trim());
        const filtre = Object.fromEntries(cles.map((c) => [c, objet[c]]));
        const existant = charger(nom).find((l) => correspond(l, filtre));
        if (existant) return this.majorer(existant.id, objet);
      } else if (objet.id) {
        const existant = charger(nom).find((l) => l.id === objet.id);
        if (existant) return this.majorer(objet.id, objet);
      }
      return this.creer(objet);
    },
    async supprimer(id) {
      const lignes = charger(nom);
      const i = lignes.findIndex((l) => l.id === id);
      if (i < 0) return true;
      const [ancien] = lignes.splice(i, 1);
      sauver(nom, lignes);
      signaler(nom, "DELETE", null, ancien);
      return true;
    },
    async supprimerOu(filtre) {
      const lignes = charger(nom);
      const restantes = [];
      const retirees = [];
      for (const l of lignes) (correspond(l, filtre) ? retirees : restantes).push(l);
      sauver(nom, restantes);
      for (const r of retirees) signaler(nom, "DELETE", null, r);
      return true;
    },
    async compter(filtre = {}) {
      return charger(nom).filter((l) => correspond(l, filtre)).length;
    }
  };
}

/* --- Fichiers (IndexedDB) -------------------------------------------------- */
const BASE_FICHIERS = "ojm-fichiers";
let basePromesse = null;

function ouvrirBase() {
  if (basePromesse) return basePromesse;
  basePromesse = new Promise((resoudre, rejeter) => {
    const requete = indexedDB.open(BASE_FICHIERS, 1);
    requete.onupgradeneeded = () => {
      if (!requete.result.objectStoreNames.contains("blobs")) {
        requete.result.createObjectStore("blobs");
      }
    };
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(new ErreurDonnees("Stockage de fichiers indisponible", "IDB"));
  });
  return basePromesse;
}

async function transaction(mode, operation) {
  const base = await ouvrirBase();
  return new Promise((resoudre, rejeter) => {
    const tx = base.transaction("blobs", mode);
    const magasin = tx.objectStore("blobs");
    const requete = operation(magasin);
    requete.onsuccess = () => resoudre(requete.result);
    requete.onerror = () => rejeter(new ErreurDonnees("Échec du stockage local", "IDB"));
  });
}

/* --- Authentification locale ---------------------------------------------- */
const CLE_SESSION = "ojm.local.session";
const CLE_COMPTES = "ojm.local.comptes";

async function empreinte(texte) {
  if (!globalThis.crypto?.subtle) return `clair:${texte}`;
  const donnees = new TextEncoder().encode(`ojm::${texte}`);
  const brut = await crypto.subtle.digest("SHA-256", donnees);
  return Array.from(new Uint8Array(brut)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function comptes() {
  try { return JSON.parse(localStorage.getItem(CLE_COMPTES) || "[]"); }
  catch { return []; }
}

function sauverComptes(liste) {
  localStorage.setItem(CLE_COMPTES, JSON.stringify(liste));
}

/* --- Pilote ---------------------------------------------------------------- */
export async function creerPiloteLocal() {
  const tables = {};
  const t = (nom) => (tables[nom] ||= depot(nom));
  const ecouteursAuth = new Set();

  for (const nom of TABLES) {
    if (!localStorage.getItem(PREFIXE + nom)) sauver(nom, []);
  }
  await amorcerRbac(t);

  // La session vit dans sessionStorage : chaque onglet peut ainsi ouvrir un
  // compte différent tout en partageant les mêmes données. C'est ce qui permet
  // de tester le duo professeur / élève sur un seul poste.
  function sessionCourante() {
    try { return JSON.parse(sessionStorage.getItem(CLE_SESSION) || "null"); }
    catch { return null; }
  }

  function definirSession(session) {
    try {
      if (session) sessionStorage.setItem(CLE_SESSION, JSON.stringify(session));
      else sessionStorage.removeItem(CLE_SESSION);
    } catch { /* navigation privée */ }
    for (const l of ecouteursAuth) l(session ? "SIGNED_IN" : "SIGNED_OUT", session);
  }

  const monId = () => sessionCourante()?.user?.id || null;

  /* --- Procédures métier (équivalents des fonctions SQL) ----------------- */
  const procedures = {
    async join_class({ join_code }) {
      const code = String(join_code || "").toUpperCase().trim();
      const classe = (await t("classes").liste({ code })).find((c) => !c.archived);
      if (!classe) throw new ErreurDonnees("Code de classe introuvable", "P0002");

      const moi = monId();
      const existant = (await t("class_members").liste({ class_id: classe.id, user_id: moi }))[0];
      if (existant?.status === "banned") throw new ErreurDonnees("Accès à cette classe révoqué", "42501");
      if (existant?.status === "active") {
        return [{ class_id: classe.id, class_name: classe.name, member_status: "active" }];
      }
      if (classe.locked || !classe.join_open) {
        throw new ErreurDonnees("Les inscriptions sont fermées", "42501");
      }
      const statut = classe.require_approval ? "pending" : "active";
      if (existant) await t("class_members").majorer(existant.id, { status: statut });
      else await t("class_members").creer({
        class_id: classe.id, user_id: moi, role: "student", status: statut,
        muted: false, grants: [], joined_at: new Date().toISOString()
      });
      await t("activity_logs").creer({
        class_id: classe.id, user_id: moi, action: "class.join", meta: { code: classe.code }
      });
      return [{ class_id: classe.id, class_name: classe.name, member_status: statut }];
    },

    async regenerate_class_code({ target_class }) {
      const code = genererCode();
      await t("classes").majorer(target_class, { code });
      return code;
    },

    async start_session({ target_class, session_title }) {
      const encours = await t("class_sessions").liste({ class_id: target_class, status: "live" });
      for (const s of encours) {
        await t("class_sessions").majorer(s.id, { status: "ended", ended_at: new Date().toISOString() });
      }
      const toutes = await t("class_sessions").liste({ class_id: target_class });
      const numero = toutes.reduce((m, s) => Math.max(m, s.number || 0), 0) + 1;

      const session = await t("class_sessions").creer({
        class_id: target_class,
        title: (session_title || "").trim() || `Session ${String(numero).padStart(2, "0")}`,
        number: numero, status: "live", follow_mode: false, focus: {}, summary: {},
        started_at: new Date().toISOString(), created_by: monId()
      });
      const tableau = await t("boards").creer({
        class_id: target_class, session_id: session.id,
        title: "Tableau", mode: "locked", allowed: [], current_page: 0
      });
      await t("board_pages").creer({ board_id: tableau.id, position: 0, title: "Tableau 1", background: "slate" });
      await t("activity_logs").creer({
        class_id: target_class, session_id: session.id, user_id: monId(), action: "session.start", meta: {}
      });
      return session;
    },

    async check_in({ target_session }) {
      const moi = monId();
      const existant = (await t("attendance").liste({ session_id: target_session, user_id: moi }))[0];
      if (existant) {
        return t("attendance").majorer(existant.id, {
          status: existant.manual ? existant.status : "present", left_at: null
        });
      }
      const ligne = await t("attendance").creer({
        session_id: target_session, user_id: moi, status: "present",
        arrived_at: new Date().toISOString(), left_at: null, seconds: 0, manual: false
      });
      const session = await t("class_sessions").lire(target_session);
      await t("activity_logs").creer({
        class_id: session?.class_id, session_id: target_session,
        user_id: moi, action: "session.check_in", meta: {}
      });
      return ligne;
    },

    async end_session({ target_session }) {
      const session = await t("class_sessions").lire(target_session);
      const maintenant = new Date().toISOString();
      const presences = await t("attendance").liste({ session_id: target_session });
      for (const p of presences) {
        if (p.left_at) continue;
        const secondes = Math.max(0, Math.round((Date.now() - new Date(p.arrived_at).getTime()) / 1000));
        await t("attendance").majorer(p.id, { left_at: maintenant, seconds: secondes });
      }
      const tableaux = await t("boards").liste({ session_id: target_session });
      let pagesTableau = 0;
      for (const b of tableaux) pagesTableau += (await t("board_pages").liste({ board_id: b.id })).length;

      const rapport = {
        participants: presences.length,
        exercises: (await t("exercises").liste({ session_id: target_session })).length,
        questions: (await t("session_questions").liste({ session_id: target_session })).length,
        announcements: (await t("announcements").liste({ session_id: target_session })).length,
        board_pages: pagesTableau,
        closed_at: maintenant
      };
      for (const ex of await t("exercises").liste({ session_id: target_session, status: "live" })) {
        await t("exercises").majorer(ex.id, { status: "closed", closed_at: maintenant });
      }
      const maj = await t("class_sessions").majorer(target_session, {
        status: "ended", ended_at: maintenant, follow_mode: false, summary: rapport
      });
      await t("activity_logs").creer({
        class_id: session?.class_id, session_id: target_session,
        user_id: monId(), action: "session.end", meta: rapport
      });
      return maj;
    },

    async notify_class({ target_class, notif_kind, notif_title, notif_body, notif_link, include_self }) {
      const membres = await t("class_members").liste({ class_id: target_class, status: "active" });
      let n = 0;
      for (const m of membres) {
        if (!include_self && m.user_id === monId()) continue;
        await t("notifications").creer({
          user_id: m.user_id, class_id: target_class, kind: notif_kind,
          title: notif_title, body: notif_body || null, link: notif_link || null, read_at: null
        });
        n++;
      }
      return n;
    },

    async capture_board_page({ target_board_page, target_notebook, page_title, snapshot }) {
      const pages = await t("notebook_pages").liste({ notebook_id: target_notebook });
      const position = pages.reduce((m, p) => Math.max(m, p.position + 1), 0);
      return t("notebook_pages").creer({
        notebook_id: target_notebook, position,
        title: page_title || "Tableau du professeur",
        body: "", drawing: snapshot || {}, attachments: [],
        origin: "board", origin_ref: target_board_page, created_by: monId()
      });
    },

    async autograde_attempt({ target_attempt }) {
      const tentative = await t("exercise_attempts").lire(target_attempt);
      if (!tentative) throw new ErreurDonnees("Tentative introuvable", "P0002");
      const questions = await t("exercise_questions").liste({ exercise_id: tentative.exercise_id });
      const reponses = await t("exercise_answers").liste({ attempt_id: target_attempt });
      let total = 0, max = 0;

      for (const q of questions) {
        max += Number(q.points || 0);
        const r = reponses.find((x) => x.question_id === q.id);
        if (!r) continue;
        if (q.solution == null) { total += Number(r.score || 0); continue; }
        const juste = JSON.stringify(r.response) === JSON.stringify(q.solution);
        await t("exercise_answers").majorer(r.id, {
          correct: juste, score: juste ? Number(q.points) : 0
        });
        if (juste) total += Number(q.points);
      }
      return t("exercise_attempts").majorer(target_attempt, {
        score: total, max_score: max, status: "graded",
        graded_by: monId(), graded_at: new Date().toISOString()
      });
    }
  };

  return {
    mode: "local",
    table: t,

    async rpc(nom, params = {}) {
      const fn = procedures[nom];
      if (!fn) throw new ErreurDonnees(`Procédure « ${nom} » indisponible en mode démonstration.`, "RPC");
      return fn(params);
    },

    /* --- Authentification --------------------------------------------- */
    auth: {
      async session() { return sessionCourante(); },
      async utilisateur() { return sessionCourante()?.user || null; },

      async inscrire({ email, motDePasse, nom, role }) {
        const liste = comptes();
        const normalise = String(email).trim().toLowerCase();
        if (liste.some((c) => c.email === normalise)) {
          throw new ErreurDonnees("User already registered", "23505");
        }
        const compte = {
          id: uid(), email: normalise,
          empreinte: await empreinte(motDePasse),
          nom: nom || normalise.split("@")[0]
        };
        liste.push(compte);
        sauverComptes(liste);

        await t("profiles").creer({
          id: compte.id, display_name: compte.nom, role_key: role || "student",
          preferences: {}, avatar_url: null, roblox_name: null, bio: null
        });

        const session = { user: { id: compte.id, email: compte.email }, mode: "local" };
        definirSession(session);
        return { user: session.user, session };
      },

      async connecter({ email, motDePasse }) {
        const normalise = String(email).trim().toLowerCase();
        const compte = comptes().find((c) => c.email === normalise);
        const emp = await empreinte(motDePasse);
        if (!compte || compte.empreinte !== emp) {
          throw new ErreurDonnees("Invalid login credentials", "401");
        }
        const session = { user: { id: compte.id, email: compte.email }, mode: "local" };
        definirSession(session);
        return { user: session.user, session };
      },

      async lienMagique() {
        throw new ErreurDonnees("Le lien par courriel nécessite un projet Supabase.", "LOCAL");
      },
      async reinitialiser() {
        throw new ErreurDonnees("La réinitialisation nécessite un projet Supabase.", "LOCAL");
      },
      async deconnecter() { definirSession(null); },

      surChangement(rappel) {
        ecouteursAuth.add(rappel);
        return () => ecouteursAuth.delete(rappel);
      }
    },

    /* --- Temps réel (inter-onglets) ------------------------------------- */
    temps: {
      sabonner({ cle, tables: abonnements = [], surChangement, diffusion = {}, presence = null }) {
        const predicats = abonnements.map((a) => ({
          table: a.table,
          test: analyserFiltreTemps(a.filtre)
        }));
        const membres = new Map();
        let metaCourante = presence?.meta || null;

        const ecouteur = (message) => {
          if (message.emetteur === ONGLET && message.genre !== "presence") return;

          if (message.genre === "table") {
            for (const p of predicats) {
              if (p.table !== message.table) continue;
              const ligne = message.nouveau || message.ancien;
              if (p.test && !p.test(ligne)) continue;
              surChangement?.({
                table: message.table, type: message.type,
                nouveau: message.nouveau, ancien: message.ancien
              });
              break;
            }
            return;
          }
          if (message.genre === "diffusion" && message.cle === cle) {
            if (message.emetteur === ONGLET) return;
            diffusion[message.evenement]?.(message.charge);
            return;
          }
          if (message.genre === "presence" && message.cle === cle && presence) {
            if (message.action === "part") membres.delete(message.emetteur);
            else {
              membres.set(message.emetteur, message.meta);
              if (message.emetteur !== ONGLET && message.action === "bonjour" && metaCourante) {
                publier({ genre: "presence", cle, action: "maj", emetteur: ONGLET, meta: metaCourante });
              }
            }
            presence.surMaj?.(Array.from(membres.values()));
          }
        };

        ecouteursLocaux.add(ecouteur);

        if (presence) {
          membres.set(ONGLET, metaCourante);
          publier({ genre: "presence", cle, action: "bonjour", emetteur: ONGLET, meta: metaCourante });
          presence.surMaj?.(Array.from(membres.values()));
        }
        setTimeout(() => presence?.surStatut?.("SUBSCRIBED"), 0);

        const partir = () => publier({ genre: "presence", cle, action: "part", emetteur: ONGLET });
        window.addEventListener("pagehide", partir);

        return {
          async envoyer(evenement, charge) {
            publier({ genre: "diffusion", cle, evenement, charge, emetteur: ONGLET });
          },
          async majPresence(meta) {
            metaCourante = meta;
            membres.set(ONGLET, meta);
            publier({ genre: "presence", cle, action: "maj", emetteur: ONGLET, meta });
            presence?.surMaj?.(Array.from(membres.values()));
          },
          fermer() {
            partir();
            window.removeEventListener("pagehide", partir);
            ecouteursLocaux.delete(ecouteur);
          }
        };
      }
    },

    /* --- Fichiers -------------------------------------------------------- */
    fichiers: {
      async televerser(fichier, chemin) {
        await transaction("readwrite", (m) => m.put(fichier, chemin));
        return { chemin, seau: "local" };
      },
      async url(chemin) {
        const blob = await transaction("readonly", (m) => m.get(chemin));
        if (!blob) throw new ErreurDonnees("Fichier introuvable dans le stockage local.", "P0002");
        return URL.createObjectURL(blob);
      },
      async supprimer(chemin) {
        await transaction("readwrite", (m) => m.delete(chemin));
        return true;
      }
    }
  };
}

/* --- Référentiel RBAC minimal en mode démonstration ----------------------- */
async function amorcerRbac(t) {
  if ((await t("roles").liste()).length) return;

  const roles = [
    ["super_admin", "Super administrateur", 100], ["admin", "Administrateur", 90],
    ["director", "Directeur", 80], ["teacher", "Professeur", 60],
    ["instructor", "Formateur", 50], ["student", "Élève", 20], ["observer", "Observateur", 10]
  ];
  for (const [key, label, rank] of roles) await t("roles").creer({ id: key, key, label, rank });

  const permsProf = [
    "CREATE_CLASS", "MANAGE_CLASS", "VIEW_STUDENTS", "MANAGE_MEMBERS", "CREATE_COURSE",
    "RUN_SESSION", "EDIT_SHARED_NOTEBOOK", "READ_SHARED_NOTEBOOK", "USE_NOTEBOOK",
    "USE_BOARD", "VIEW_BOARD", "CREATE_EXERCISE", "GRADE_EXERCISE", "UPLOAD_DOCUMENT",
    "VIEW_DOCUMENT", "TAKE_ATTENDANCE", "PUBLISH_ANNOUNCEMENT", "RUN_POLL",
    "VIEW_ARCHIVES", "VIEW_LOGS"
  ];
  const permsEleve = [
    "USE_NOTEBOOK", "READ_SHARED_NOTEBOOK", "VIEW_BOARD", "ANSWER_EXERCISE",
    "VIEW_DOCUMENT", "ASK_QUESTION", "RAISE_HAND", "VIEW_ARCHIVES"
  ];
  const permsObs = ["READ_SHARED_NOTEBOOK", "VIEW_BOARD", "VIEW_DOCUMENT", "VIEW_ARCHIVES"];
  const toutes = [...new Set([...permsProf, ...permsEleve, "MANAGE_USERS", "MODERATE"])];

  for (const key of toutes) await t("permissions").creer({ id: key, key, label: key, category: "general" });

  const attribuer = async (role, liste) => {
    for (const p of liste) await t("role_permissions").creer({ role_key: role, permission_key: p });
  };
  await attribuer("super_admin", toutes);
  await attribuer("admin", toutes);
  await attribuer("director", toutes.filter((p) => p !== "MANAGE_USERS"));
  await attribuer("teacher", permsProf);
  await attribuer("instructor", permsProf);
  await attribuer("student", permsEleve);
  await attribuer("observer", permsObs);
}
