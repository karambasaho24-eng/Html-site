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
import { stockageLocal, stockageSession, cles as clesDe } from "../core/stockage.js";

const PREFIXE = "ojm.local.";
const CANAL = "ojm.local.temps";

/* --- Accès aux collections ------------------------------------------------ */
function charger(table) {
  try {
    const brut = stockageLocal.getItem(PREFIXE + table);
    return brut ? JSON.parse(brut) : [];
  } catch { return []; }
}

function sauver(table, lignes) {
  try {
    stockageLocal.setItem(PREFIXE + table, JSON.stringify(lignes));
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

/* --- Le garde du lieu -----------------------------------------------------
   L'équivalent de app_garde_du_lieu (0019). Sans lui, le mode démonstration
   laisserait ranger un boulier dans une trousse pleine, ou récupérer depuis
   chez soi un stylo resté en salle — et on croirait avoir écrit du code qui
   tient, alors qu'il ne tiendrait qu'ici. */
let recuperationEnCours = false;

function tailleDuContenu(contenantId, sauf) {
  let total = 0;
  for (const t of ["belongings", "notebooks"]) {
    for (const l of charger(t)) {
      if (String(l.container_id || "") === String(contenantId) && l.id !== sauf) total += Number(l.size || 1);
    }
  }
  return total;
}

function dansLeSac(contenantId) {
  const objets = charger("belongings");
  let courant = contenantId;
  for (let i = 0; i < 8 && courant; i++) {
    const b = objets.find((o) => o.id === courant);
    if (!b) return false;
    if (b.carried && (b.place || "range") === "range") return true;
    courant = b.container_id;
  }
  return false;
}

function gardeDuLieu(ancien, nouveau) {
  const lieu = (o) => o?.place || "range";
  if (ancien && lieu(ancien) === "salle" && !recuperationEnCours) {
    if (lieu(nouveau) !== "salle" || (nouveau.container_id || null) !== (ancien.container_id || null)) {
      throw new ErreurDonnees("Cet objet est resté en salle : il faut aller le récupérer.", "42501");
    }
  }
  if (nouveau.container_id) {
    if (nouveau.container_id === nouveau.id) {
      throw new ErreurDonnees("Un contenant ne se range pas dans lui-même", "22023");
    }
    const hote = charger("belongings").find((o) => o.id === nouveau.container_id);
    if (!hote || !hote.is_container) throw new ErreurDonnees("Cet objet n'est pas un contenant", "22023");
    if (hote.owner_id !== nouveau.owner_id) {
      throw new ErreurDonnees("On ne range pas ses affaires chez quelqu'un d'autre", "42501");
    }
    const change = !ancien || ancien.container_id !== nouveau.container_id
      || Number(nouveau.size || 1) > Number(ancien.size || 1);
    if (hote.capacity != null && change
        && tailleDuContenu(nouveau.container_id, nouveau.id) + Number(nouveau.size || 1) > hote.capacity) {
      throw new ErreurDonnees(`Il n'y a plus de place dans ${hote.label || hote.kind}`, "22023");
    }
    Object.assign(nouveau, { place: "range", place_session: null, place_class: null,
                             place_label: null, place_at: null });
  }
  if (lieu(nouveau) === "bureau" && lieu(ancien) !== "bureau") {
    if (ancien && lieu(ancien) === "range" && !recuperationEnCours
        && (!ancien.container_id || !dansLeSac(ancien.container_id))) {
      throw new ErreurDonnees("On ne sort que ce qu'on a dans son sac.", "42501");
    }
    if (!nouveau.place_session) {
      throw new ErreurDonnees("Sortir un objet suppose une activité en cours", "22023");
    }
    nouveau.place_at = new Date().toISOString();
  }
  if (lieu(nouveau) === "salle" && lieu(ancien) !== "salle") {
    if (!nouveau.place_class) throw new ErreurDonnees("Un objet laissé en salle doit dire laquelle", "22023");
    nouveau.place_at = new Date().toISOString();
  }
  return nouveau;
}

const GARDES = { belongings: gardeDuLieu, notebooks: gardeDuLieu };

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
      if (GARDES[nom]) GARDES[nom](null, ligne);

      // Équivalent du déclencheur classes_set_code côté SQL.
      if (nom === "classes" && !ligne.code) {
        do { ligne.code = genererCode(); }
        while (lignes.some((l) => l.code === ligne.code));
      }

      // Équivalent du déclencheur apply_promotion : une promotion inscrite au
      // livret change le grade porté sur la fiche. Sans cela, les deux
      // divergent dès la première montée en grade.
      if (nom === "service_records" && ligne.kind === "promotion"
          && String(ligne.rank_to || "").trim()) {
        const fiches = charger("rp_profiles");
        let touchee = false;
        for (const f of fiches) {
          if (f.class_id === ligne.class_id && f.user_id === ligne.user_id) {
            f.rank = ligne.rank_to;
            f.updated_at = new Date().toISOString();
            touchee = true;
          }
        }
        if (touchee) {
          sauver("rp_profiles", fiches);
          for (const f of fiches) {
            if (f.class_id === ligne.class_id && f.user_id === ligne.user_id) {
              signaler("rp_profiles", "UPDATE", f, null);
            }
          }
        }
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
      const fusion = { ...lignes[i], ...patch, updated_at: new Date().toISOString() };
      lignes[i] = GARDES[nom] ? GARDES[nom](ancien, fusion) : fusion;
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
  try { return JSON.parse(stockageLocal.getItem(CLE_COMPTES) || "[]"); }
  catch { return []; }
}

function sauverComptes(liste) {
  try { stockageLocal.setItem(CLE_COMPTES, JSON.stringify(liste)); }
  catch (err) {
    throw new ErreurDonnees("Impossible d'enregistrer le compte sur cet appareil.", "QUOTA", err);
  }
}

/* --- Pilote ---------------------------------------------------------------- */
export async function creerPiloteLocal() {
  const tables = {};
  const t = (nom) => (tables[nom] ||= depot(nom));
  const ecouteursAuth = new Set();

  for (const nom of TABLES) {
    if (!stockageLocal.getItem(PREFIXE + nom)) sauver(nom, []);
  }
  await amorcerRbac(t);

  // La session vit dans sessionStorage : chaque onglet peut ainsi ouvrir un
  // compte différent tout en partageant les mêmes données. C'est ce qui permet
  // de tester le duo professeur / élève sur un seul poste.
  function sessionCourante() {
    try { return JSON.parse(stockageSession.getItem(CLE_SESSION) || "null"); }
    catch { return null; }
  }

  function definirSession(session) {
    try {
      if (session) stockageSession.setItem(CLE_SESSION, JSON.stringify(session));
      else stockageSession.removeItem(CLE_SESSION);
    } catch { /* entrepôt indisponible */ }
    for (const l of ecouteursAuth) l(session ? "SIGNED_IN" : "SIGNED_OUT", session);
  }

  const monId = () => sessionCourante()?.user?.id || null;

  /* --- Procédures métier (équivalents des fonctions SQL) ----------------- */
  const procedures = {
    /**
     * Accepter un cahier qu'on nous tend. En base, seule une fonction
     * SECURITY DEFINER peut changer un propriétaire ; ici il n'y a personne
     * à convaincre, mais la même règle doit valoir pour que les deux pilotes
     * se comportent pareil.
     */
    async accept_notebook_handoff({ handoff }) {
      const ligne = await t("notebook_handoffs").lire(handoff);
      if (!ligne) throw new ErreurDonnees("Remise introuvable", "P0002");
      if (ligne.to_user !== monId()) {
        throw new ErreurDonnees("Ce cahier ne vous est pas tendu", "42501");
      }
      if (ligne.state !== "offered") {
        throw new ErreurDonnees("Cette remise est déjà tranchée", "42501");
      }
      if (ligne.kind === "give") {
        await t("notebooks").majorer(ligne.notebook_id, { owner_id: ligne.to_user });
      }
      return t("notebook_handoffs").majorer(handoff, {
        state: "accepted", settled_at: new Date().toISOString()
      });
    },

    /**
     * Accepter un objet qu'on nous tend, ou la demande qu'on nous a faite.
     * En base, seule une fonction SECURITY DEFINER peut déplacer un objet ;
     * ici il n'y a personne à convaincre, mais la même règle doit valoir —
     * sinon le mode démonstration autoriserait des gestes que le mode normal
     * refuse, et on croirait avoir écrit du code qui marche.
     */
    async accept_belonging_handoff({ handoff, chosen = null }) {
      const ligne = await t("belonging_handoffs").lire(handoff);
      if (!ligne) throw new ErreurDonnees("Remise introuvable", "P0002");
      if (ligne.state !== "offered") {
        throw new ErreurDonnees("Cette remise est déjà tranchée", "42501");
      }
      if (ligne.to_user !== monId()) {
        throw new ErreurDonnees(ligne.direction === "request"
          ? "Cette demande ne vous est pas adressée"
          : "Cet objet ne vous est pas tendu", "42501");
      }
      const cible  = ligne.direction === "offer" ? ligne.to_user   : ligne.from_user;
      const source = ligne.direction === "offer" ? ligne.from_user : ligne.to_user;

      const objet = await t("belongings").lire(chosen || ligne.belonging_id);
      if (!objet) throw new ErreurDonnees("Objet introuvable", "P0002");
      if (objet.owner_id !== source) {
        throw new ErreurDonnees("Cet objet n'est pas à celui qui s'en sépare", "42501");
      }
      if (objet.state === "confiscated") {
        throw new ErreurDonnees("Cet objet est confisqué", "42501");
      }

      // Il quitte le sac de celui qui s'en sépare : un objet prêté ne reste
      // pas rangé dans la trousse de son propriétaire.
      if (objet.place === "salle") {
        throw new ErreurDonnees("Cet objet est resté en salle : on ne tend pas ce qu'on n'a pas.", "42501");
      }
      // En séance, ce qu'on reçoit arrive sur le bureau : on peut s'en servir.
      const lieu = await procedures._lieu_de_remise(ligne);
      recuperationEnCours = true;
      try {
        await t("belongings").majorer(objet.id, {
          ...(ligne.kind === "give"
            ? { owner_id: cible, former_owner: source, holder_id: null, state: "owned" }
            : { holder_id: cible, state: "lent" }),
          container_id: null, carried: false, ...lieu
        });
      } finally { recuperationEnCours = false; }

      const maj = await t("belonging_handoffs").majorer(handoff, {
        state: "accepted", settled_at: new Date().toISOString(), belonging_id: objet.id
      });
      await t("notifications").creer({
        user_id: source, class_id: ligne.class_id || null, kind: "affaires",
        title: ligne.kind === "give" ? "Votre objet a été accepté" : "Votre prêt a été accepté",
        body: objet.label || objet.kind, link: "/affaires", read_at: null
      });
      return maj;
    },

    async return_belonging_handoff({ handoff }) {
      const ligne = await t("belonging_handoffs").lire(handoff);
      if (!ligne) throw new ErreurDonnees("Remise introuvable", "P0002");
      if (ligne.from_user !== monId() && ligne.to_user !== monId()) {
        throw new ErreurDonnees("Cette remise ne vous concerne pas", "42501");
      }
      if (ligne.state !== "accepted") throw new ErreurDonnees("Il n'y a rien à rendre", "42501");
      if (ligne.kind !== "lend") {
        throw new ErreurDonnees("Un objet donné ne se reprend pas : il faut le redemander", "42501");
      }
      const objet = await t("belongings").lire(ligne.belonging_id);
      if (objet?.place === "salle") {
        throw new ErreurDonnees("Cet objet est resté en salle : il faut d'abord aller le chercher.", "42501");
      }
      const lieu = await procedures._lieu_de_remise(ligne);
      recuperationEnCours = true;
      try {
        await t("belongings").majorer(ligne.belonging_id, {
          holder_id: null, state: "owned", container_id: null, carried: false, ...lieu
        });
      } finally { recuperationEnCours = false; }
      const maj = await t("belonging_handoffs").majorer(handoff, {
        state: "returned", settled_at: new Date().toISOString()
      });
      await t("notifications").creer({
        user_id: monId() === objet?.owner_id ? ligne.to_user : objet?.owner_id,
        class_id: ligne.class_id || null, kind: "affaires", title: "Prêt rendu",
        body: objet?.label || objet?.kind || "", link: "/affaires", read_at: null
      });
      return maj;
    },

    /** Équivalent de confiscate_belonging : on ne prend que ce qui a été apporté. */
    async confiscate_belonging({ target, target_class, motif }) {
      const objet = await t("belongings").lire(target);
      if (!objet) throw new ErreurDonnees("Objet introuvable", "P0002");

      const sacs = await t("class_bags").liste({ class_id: target_class, user_id: objet.owner_id });
      const declare = sacs[0]?.supplies || {};
      const ids = Array.isArray(declare) ? [] : Object.keys(declare);
      if (!ids.includes(String(target))) {
        throw new ErreurDonnees(
          "Cet objet n'a pas été apporté : il reste hors de portée.", "42501");
      }
      const maj = await t("belongings").majorer(target, {
        state: "confiscated", holder_id: monId(),
        note: motif || objet.note || null, container_id: null, carried: false
      });
      await t("activity_logs").creer({
        class_id: target_class, user_id: monId(), action: "affaires.confiscation",
        meta: { objet: target, proprietaire: objet.owner_id, motif: motif || null }
      });
      await t("notifications").creer({
        user_id: objet.owner_id, class_id: target_class, kind: "affaires",
        title: "Un objet vous a été confisqué",
        body: (objet.label || objet.kind) + (motif ? ` — ${motif}` : ""),
        link: "/affaires", read_at: null
      });
      return maj;
    },

    async release_belonging({ target }) {
      const objet = await t("belongings").lire(target);
      if (!objet) throw new ErreurDonnees("Objet introuvable", "P0002");
      if (objet.state !== "confiscated" || objet.holder_id !== monId()) {
        throw new ErreurDonnees("Vous ne détenez pas cet objet", "42501");
      }
      const maj = await t("belongings").majorer(target, { state: "owned", holder_id: null });
      await t("notifications").creer({
        user_id: objet.owner_id, kind: "affaires", title: "On vous rend votre objet",
        body: objet.label || objet.kind, link: "/affaires", read_at: null
      });
      return maj;
    },

    /** Équivalent de app_lieu_de_remise. */
    async _lieu_de_remise(ligne) {
      const s = ligne.session_id ? await t("class_sessions").lire(ligne.session_id) : null;
      return s?.status === "live"
        ? { place: "bureau", place_session: ligne.session_id, place_class: ligne.class_id || s.class_id,
            place_label: null }
        : { place: "range", place_session: null, place_class: null, place_label: null };
    },

    /** Équivalent de app_salle_ouverte. */
    async _salle_ouverte(classeId, pour) {
      const live = await t("class_sessions").liste({ class_id: classeId, status: "live" });
      if (live.length) return true;
      const c = await t("classes").lire(classeId);
      const r = c?.settings || {};
      const maintenant = Date.now();
      if (r.salle_ouverte_jusqua && new Date(r.salle_ouverte_jusqua).getTime() > maintenant) return true;
      const passe = r.passes?.[pour];
      return Boolean(passe && new Date(passe).getTime() > maintenant);
    },

    async _sac_avec_place(proprietaire, besoin) {
      const sacs = (await t("belongings").liste({ owner_id: proprietaire }))
        .filter((b) => b.is_container && b.carried && (b.place || "range") === "range"
          && ["owned", "borrowed"].includes(b.state || "owned"))
        .sort((a, b) => (b.capacity || 0) - (a.capacity || 0));
      return sacs.find((b) => (b.capacity || 0) - tailleDuContenu(b.id) >= besoin)?.id || null;
    },

    async _recuperer(table, id, message) {
      const ligne = await t(table).lire(id);
      if (!ligne) throw new ErreurDonnees("Introuvable", "P0002");
      if (ligne.owner_id !== monId() && ligne.holder_id !== monId()) {
        throw new ErreurDonnees("Ce n'est pas à vous", "42501");
      }
      if ((ligne.place || "range") === "range") return ligne;
      if (!ligne.place_class || !(await procedures._salle_ouverte(ligne.place_class, monId()))) {
        throw new ErreurDonnees(message, "42501");
      }
      recuperationEnCours = true;
      try {
        return await t(table).majorer(id, {
          place: "range", place_session: null, place_class: null, place_label: null, place_at: null,
          container_id: await procedures._sac_avec_place(ligne.owner_id, Number(ligne.size || 1))
        });
      } finally { recuperationEnCours = false; }
    },

    /** Équivalent de reprendre_a_ma_place (0022) : revenu à sa place, on
     *  retrouve devant soi ce qu'on avait laissé dans CETTE salle. */
    async reprendre_a_ma_place({ genre, target, seance }) {
      const s = await t("class_sessions").lire(seance);
      if (!s || s.status !== "live") throw new ErreurDonnees("Aucune séance en cours ici : la salle est fermée.", "42501");
      const table = genre === "cahier" ? "notebooks" : "belongings";
      const ligne = await t(table).lire(target);
      if (!ligne) throw new ErreurDonnees("Introuvable", "P0002");
      if (ligne.owner_id !== monId() && ligne.holder_id !== monId()) throw new ErreurDonnees("Ce n'est pas à vous", "42501");
      const lieu = ligne.place || "range";
      if (lieu === "range" || (lieu === "bureau" && ligne.place_session === seance)) return true;
      if (ligne.place_class !== s.class_id) throw new ErreurDonnees("Cet objet a été laissé dans une autre salle.", "42501");
      recuperationEnCours = true;
      try {
        await t(table).majorer(target, { place: "bureau", place_session: seance, place_class: s.class_id, container_id: null });
      } finally { recuperationEnCours = false; }
      return true;
    },

    recover_belonging: ({ target }) =>
      procedures._recuperer("belongings", target, "La salle est fermée : l'objet y reste."),
    recover_notebook: ({ target }) =>
      procedures._recuperer("notebooks", target, "La salle est fermée : le cahier y reste."),

    async forgotten_in_class({ target_class }) {
      const objets = (await t("belongings").liste({ place_class: target_class }))
        .filter((o) => ["salle", "bureau"].includes(o.place))
        .map((o) => ({ genre: "objet", id: o.id, owner_id: o.owner_id, kind: o.kind,
                       label: o.label, place: o.place, place_at: o.place_at }));
      const supports = (await t("notebooks").liste({ place_class: target_class }))
        .filter((o) => ["salle", "bureau"].includes(o.place))
        .map((o) => ({ genre: "cahier", id: o.id, owner_id: o.owner_id, kind: o.support || "cahier",
                       label: o.title, place: o.place, place_at: o.place_at }));
      return [...objets, ...supports].sort((a, b) => String(b.place_at).localeCompare(String(a.place_at)));
    },

    async restitute_forgotten({ genre, target }) {
      const table = genre === "cahier" ? "notebooks" : "belongings";
      const ligne = await t(table).lire(target);
      if (!ligne?.place_class) throw new ErreurDonnees("Rien à rendre", "P0002");
      const classe = ligne.place_class;
      recuperationEnCours = true;
      try {
        await t(table).majorer(target, {
          place: "range", place_session: null, place_class: null, place_label: null, place_at: null,
          container_id: await procedures._sac_avec_place(ligne.owner_id, Number(ligne.size || 1))
        });
      } finally { recuperationEnCours = false; }
      await t("notifications").creer({
        user_id: ligne.owner_id, class_id: classe, kind: "affaires",
        title: "On vous a rendu ce que vous aviez oublié",
        body: ligne.title || ligne.label || ligne.kind, link: "/affaires", read_at: null
      });
      return true;
    },

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

    /** Équivalent de inspect_notebook : on n'ouvre que ce qui a été apporté. */
    async inspect_notebook({ target_notebook, target_class }) {
      const cahier = await t("notebooks").lire(target_notebook);
      if (!cahier) throw new ErreurDonnees("Support introuvable", "P0002");

      const sacs = await t("class_bags").liste({ class_id: target_class, user_id: cahier.owner_id });
      const contenu = sacs[0]?.notebooks || {};
      const apportes = Array.isArray(contenu) ? contenu.map(String) : Object.keys(contenu);
      if (!apportes.includes(String(target_notebook))) {
        throw new ErreurDonnees(
          "Ce support n'a pas été apporté : il reste hors de portée.", "42501");
      }

      await t("activity_logs").creer({
        class_id: target_class, user_id: monId(), action: "cahier.inspection",
        meta: { cahier: target_notebook, proprietaire: cahier.owner_id }
      });
      await t("notifications").creer({
        user_id: cahier.owner_id, class_id: target_class, kind: "inspection",
        title: `Votre ${cahier.support || "cahier"} a été consulté`,
        body: `L'encadrement a ouvert « ${cahier.title} ».`,
        link: `/classe/${target_class}`, read_at: null
      });
      return cahier;
    },

    /** Équivalent de eject_member : on sort de la séance, pas de la classe. */
    async eject_member({ target_session, target_user, motif, proche }) {
      const seance = await t("class_sessions").lire(target_session);
      if (!seance) throw new ErreurDonnees("Séance introuvable", "P0002");
      if (target_user === monId()) {
        throw new ErreurDonnees("On ne se renvoie pas soi-même", "22023");
      }

      const existants = await t("session_ejections").liste({
        session_id: target_session, user_id: target_user
      });
      const donnees = {
        session_id: target_session, class_id: seance.class_id, user_id: target_user,
        by_user: monId(), reason: motif || null, attested: Boolean(proche)
      };
      const ligne = existants[0]
        ? await t("session_ejections").majorer(existants[0].id,
            { ...donnees, created_at: new Date().toISOString() })
        : await t("session_ejections").creer(donnees);

      const presences = await t("attendance").liste({
        session_id: target_session, user_id: target_user
      });
      for (const p of presences) {
        if (!p.left_at) {
          await t("attendance").majorer(p.id, {
            left_at: new Date().toISOString(), status: "offline"
          });
        }
      }

      await t("activity_logs").creer({
        class_id: seance.class_id, session_id: target_session, user_id: monId(),
        action: "seance.renvoi",
        meta: { seance: target_session, membre: target_user, motif: motif || null }
      });
      await t("notifications").creer({
        user_id: target_user, class_id: seance.class_id, kind: "renvoi",
        title: "Vous avez été prié de quitter la séance",
        body: (motif || "").trim() || "Aucun motif n'a été porté.",
        link: `/classe/${seance.class_id}`, read_at: null
      });
      return ligne;
    },

    /** Équivalent de la fonction SQL class_standings. */
    async class_standings({ target_class }) {
      const entrees = await t("service_records").liste({ class_id: target_class });
      const parMembre = new Map();

      for (const e of entrees) {
        if (e.kind !== "aptitude" || e.score == null || !e.max_score) continue;
        if (!parMembre.has(e.user_id)) {
          parMembre.set(e.user_id, { total: 0, max: 0, nombre: 0, derniere: null });
        }
        const agr = parMembre.get(e.user_id);
        agr.total += Number(e.score);
        agr.max += Number(e.max_score);
        agr.nombre += 1;
        if (!agr.derniere || e.created_at > agr.derniere) agr.derniere = e.created_at;
      }

      return [...parMembre.entries()].map(([user_id, a]) => ({
        user_id,
        evaluations: a.nombre,
        taux: a.max ? Math.round((a.total / a.max) * 1000) / 10 : 0,
        total: Math.round(a.total * 100) / 100,
        derniere: a.derniere
      }));
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

      async inscrire({ pseudo, motDePasse }) {
        const liste = comptes();
        const propre = String(pseudo || "").trim().replace(/\s+/g, " ");
        const normalise = propre.toLowerCase();
        if (propre.length < 3 || propre.length > 24) {
          throw new ErreurDonnees("Le pseudo doit faire entre 3 et 24 caractères.", "22023");
        }
        if (liste.some((c) => c.email === normalise)) {
          throw new ErreurDonnees("Ce pseudo est déjà pris.", "23505");
        }
        const compte = {
          id: uid(), email: normalise,
          empreinte: await empreinte(motDePasse),
          nom: propre
        };
        liste.push(compte);
        sauverComptes(liste);

        await t("profiles").creer({
          id: compte.id, display_name: compte.nom, role_key: "student",
          preferences: {}, avatar_url: null, roblox_name: null, bio: null
        });

        const session = { user: { id: compte.id, email: compte.email }, mode: "local" };
        definirSession(session);
        return { user: session.user, session };
      },

      async connecter({ pseudo, motDePasse }) {
        const normalise = String(pseudo || "").trim().replace(/\s+/g, " ").toLowerCase();
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
    ["instructor", "Formateur", 50], ["student", "Membre", 20], ["observer", "Observateur", 10]
  ];
  for (const [key, label, rank] of roles) await t("roles").creer({ id: key, key, label, rank });

  const permsProf = [
    "CREATE_CLASS", "MANAGE_CLASS", "VIEW_STUDENTS", "MANAGE_MEMBERS", "CREATE_COURSE",
    "RUN_SESSION", "EDIT_SHARED_NOTEBOOK", "READ_SHARED_NOTEBOOK", "USE_NOTEBOOK",
    "USE_BOARD", "VIEW_BOARD", "CREATE_EXERCISE", "GRADE_EXERCISE", "UPLOAD_DOCUMENT",
    "VIEW_DOCUMENT", "TAKE_ATTENDANCE", "PUBLISH_ANNOUNCEMENT", "RUN_POLL",
    "VIEW_ARCHIVES", "VIEW_LOGS"
  ];
  // Le rôle de base peut aussi ouvrir ses propres espaces : c'est ce qui rend
  // la plateforme utilisable par n'importe qui, pas seulement par un
  // établissement. Voir la migration 0007.
  const permsEleve = [
    "USE_NOTEBOOK", "READ_SHARED_NOTEBOOK", "VIEW_BOARD", "ANSWER_EXERCISE",
    "VIEW_DOCUMENT", "ASK_QUESTION", "RAISE_HAND", "VIEW_ARCHIVES",
    "CREATE_CLASS", "MANAGE_CLASS", "MANAGE_MEMBERS", "VIEW_STUDENTS",
    "CREATE_COURSE", "RUN_SESSION", "EDIT_SHARED_NOTEBOOK", "USE_BOARD",
    "CREATE_EXERCISE", "GRADE_EXERCISE", "UPLOAD_DOCUMENT",
    "TAKE_ATTENDANCE", "PUBLISH_ANNOUNCEMENT", "RUN_POLL"
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
