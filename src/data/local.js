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
        : valeur.operateur === "ilike" ? new RegExp(`^${String(c).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "i").test(String(v ?? ""))
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

/* --- Qui nomme qui, la remise vérifiée, le journal (0029) -----------------
   Les mêmes règles qu'en base, pour que la démonstration ne laisse pas
   passer ce que le serveur refuse. */
let quiSuisJe = () => null;
const roleDe = (id) => charger("profiles").find((p) => p.id === id)?.role_key || null;
const peutNommer = () => ["pdg", "super_admin", "admin"].includes(roleDe(quiSuisJe()));
const estPDG = (id) => roleDe(id) === "pdg";
const exigerBoutique = () => {
  if (!["pdg", "super_admin"].includes(roleDe(quiSuisJe()))) {
    throw new ErreurDonnees("Réservé à l'administration de la boutique.", "42501");
  }
};
const estModerateurLocal = () => ["moderator", "admin", "super_admin", "pdg"].includes(roleDe(quiSuisJe()));
const pareil = (a, b) => (a ?? null) === (b ?? null);

let codeDeRole = null;                 // l'équivalent de app.code_de_role (0030)
function gardeProfil(ancien, nouveau) {
  const moi = quiSuisJe();
  if (!moi) return nouveau;
  if (ancien && codeDeRole === ancien.id) return nouveau;
  if (!ancien) {
    if (!peutNommer()) Object.assign(nouveau, { role_key: "student", titre: null, titre_libelle: null });
    return nouveau;
  }
  if (!pareil(nouveau.role_key, ancien.role_key)) {
    if (!peutNommer()) throw new ErreurDonnees("Seule l'administration change un rôle.", "42501");
    if (ancien.id === moi) throw new ErreurDonnees("On ne change pas son propre rôle.", "42501");
    if ((["pdg", "super_admin"].includes(nouveau.role_key) || ["pdg", "super_admin"].includes(ancien.role_key)) && !estPDG(moi)) {
      throw new ErreurDonnees("Seul le PDG fait ou défait un super administrateur.", "42501");
    }
  }
  if ((!pareil(nouveau.titre, ancien.titre) || !pareil(nouveau.titre_libelle, ancien.titre_libelle)) && !peutNommer()) {
    throw new ErreurDonnees("Un titre est attribué par l'administration.", "42501");
  }
  return nouveau;
}

/** La sanction de compte en vigueur (app_sanction_active, 0033). */
function sanctionActive(cible) {
  if (!cible) return null;
  return charger("sanctions")
    .filter((s) => s.user_id === cible && !s.levee_at
      && (["definitif", "ip"].includes(s.genre) || (s.genre === "temporaire" && new Date(s.jusqua).getTime() > Date.now())))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] || null;
}

/* --- La boutique : miroir des migrations 0039 et 0041 -------------------
   Mêmes règles, mêmes codes d'erreur (IK001 encre épuisée, NB001 cahier à
   acheter, PG001 cahier plein) : sans cela, la démonstration laisserait écrire
   ce que le serveur refuse. ATTENTION : ici rien n'est protégé (tout vit dans le
   navigateur). Le paiement se fait EN JEU : le site n'en traite aucun, et seule
   la livraison d'une commande par le PDG crédite de l'encre ou un cahier. */
const REGLAGES_DEFAUT = {
  free_notebooks: 1, starter_ink: 3000, char_cost: 1, stroke_cost: 20, attachment_cost: 500, max_pages: 10,
  exempt_roles: ["pdg", "super_admin", "admin", "director", "teacher", "instructor"],
  orders_open: true, currency: ""
};
function reglage(cle) {
  const ligne = charger("commerce_settings").find((l) => l.key === cle);
  return ligne ? ligne.value : REGLAGES_DEFAUT[cle];
}
const exempteEncre = (uid) => (reglage("exempt_roles") || []).includes(roleDe(uid));
const mesureTexte = (t) => String(t || "").replace(/<[^>]*>/g, "").replace(/&[a-zA-Z0-9#]{2,8};/g, " ").length;
const nbElements = (j) => (Array.isArray(j) ? j.length : 0);
const nbImages = (t) => (String(t || "").toLowerCase().match(/<img/g) || []).length;

function inscrireEncre(uid, delta, raison, note = null, acteur = null, achat = null) {
  const lignes = charger("ink_ledger");
  lignes.push({ id: uid_(), user_id: uid, delta, reason: raison, purchase_id: achat, note, actor: acteur,
                created_at: new Date().toISOString() });
  sauver("ink_ledger", lignes);
}
const uid_ = () => uid();

/** Un portefeuille et un compteur pour chaque compte ; les cahiers déjà là comptent comme créés ET couverts. */
function assurerCommerce(uid) {
  if (!uid) return;
  const portefeuilles = charger("ink_wallets");
  if (!portefeuilles.some((w) => w.user_id === uid)) {
    const depart = Number(reglage("starter_ink") || 0);
    portefeuilles.push({ id: uid, user_id: uid, granted_total: depart, spent_total: 0,
                         updated_at: new Date().toISOString() });
    sauver("ink_wallets", portefeuilles);
    if (depart > 0) inscrireEncre(uid, depart, "starter", "Réserve offerte à la création du compte");
  }
  const compteurs = charger("notebook_quota");
  if (!compteurs.some((q) => q.user_id === uid)) {
    const existants = charger("notebooks").filter((n) => n.owner_id === uid && n.kind === "personal").length;
    compteurs.push({ id: uid, user_id: uid, created_total: existants, credits_purchased: 0,
                     credits_granted: Math.max(0, existants - Number(reglage("free_notebooks") ?? 1)),
                     updated_at: new Date().toISOString() });
    sauver("notebook_quota", compteurs);
  }
}

function debiterEncre(uid, cout) {
  if (!uid || !(cout > 0) || exempteEncre(uid)) return;
  assurerCommerce(uid);
  const portefeuilles = charger("ink_wallets");
  const w = portefeuilles.find((x) => x.user_id === uid);
  const solde = w.granted_total - w.spent_total;
  if (solde < cout) {
    throw new ErreurDonnees(`Encre épuisée : il reste ${solde} et cette écriture en demande ${cout}.`, "IK001");
  }
  w.spent_total += cout;
  w.updated_at = new Date().toISOString();
  sauver("ink_wallets", portefeuilles);
  signaler("ink_wallets", "UPDATE", { ...w });
}

function gardeEncrePages(ancien, nouveau) {
  const moi = quiSuisJe();
  if (!moi) return nouveau;
  const car = Number(reglage("char_cost") ?? 1), piece = Number(reglage("attachment_cost") ?? 500);
  const cout = !ancien
    ? mesureTexte(nouveau.body) * car + (nbElements(nouveau.attachments) + nbImages(nouveau.body)) * piece
    : Math.max(0, mesureTexte(nouveau.body) - mesureTexte(ancien.body)) * car
      + Math.max(0, (nbElements(nouveau.attachments) + nbImages(nouveau.body))
                  - (nbElements(ancien.attachments) + nbImages(ancien.body))) * piece;
  debiterEncre(moi, cout);
  return nouveau;
}

function gardeEncrePenseBetes(ancien, nouveau) {
  const moi = quiSuisJe();
  if (!moi) return nouveau;
  const car = Number(reglage("char_cost") ?? 1);
  debiterEncre(moi, Math.max(0, mesureTexte(nouveau.body) - (ancien ? mesureTexte(ancien.body) : 0)) * car);
  return nouveau;
}

function gardeEncreTableau(ancien, nouveau) {
  const moi = quiSuisJe();
  if (!moi || ancien) return nouveau;          // seul l'AJOUT d'un élément coûte
  const cout = nouveau.kind === "texte" ? String(nouveau.data?.texte || "").length * Number(reglage("char_cost") ?? 1)
    : nouveau.kind === "image" ? Number(reglage("attachment_cost") ?? 500)
    : Number(reglage("stroke_cost") ?? 20);
  debiterEncre(moi, cout);
  return nouveau;
}

/** Un cahier personnel est plein à max_pages pages (0 = pas de limite). Exemptés : jamais limités. */
function gardeLimitePages(ancien, nouveau) {
  const moi = quiSuisJe();
  if (ancien || !moi) return;
  const maxi = Number(reglage("max_pages") ?? 10);
  if (maxi <= 0 || exempteEncre(moi)) return;
  const cahier = charger("notebooks").find((n) => n.id === nouveau.notebook_id);
  if (!cahier || cahier.kind !== "personal") return;
  if (charger("notebook_pages").filter((p) => p.notebook_id === nouveau.notebook_id).length >= maxi) {
    throw new ErreurDonnees(`Ce cahier est plein : ${maxi} pages au maximum.`, "PG001");
  }
}

function gardeQuotaCahiers(ancien, nouveau) {
  const moi = quiSuisJe();
  if (ancien || !moi || nouveau.kind !== "personal" || !nouveau.owner_id) return nouveau;
  assurerCommerce(nouveau.owner_id);
  const compteurs = charger("notebook_quota");
  const q = compteurs.find((x) => x.user_id === nouveau.owner_id);
  const permis = Number(reglage("free_notebooks") ?? 1) + q.credits_purchased + q.credits_granted;
  if (q.created_total >= permis && !exempteEncre(nouveau.owner_id)) {
    throw new ErreurDonnees(
      `Un cahier supplémentaire s'achète : ${q.created_total} cahier(s) déjà créé(s), ${permis} autorisé(s).`, "NB001");
  }
  q.created_total += 1;                         // jamais décrémenté : supprimer ne rend rien
  q.updated_at = new Date().toISOString();
  sauver("notebook_quota", compteurs);
  return nouveau;
}

const GARDES = {
  profiles: gardeProfil,
  notebooks: gardeQuotaCahiers,
  notebook_pages: (ancien, nouveau) => { gardeLimitePages(ancien, nouveau); return gardeEncrePages(ancien, nouveau); },
  sticky_notes: gardeEncrePenseBetes,
  board_elements: gardeEncreTableau
};

/** Une ligne au journal, comme app_journaliser. */
function journaliser(qui, quoi, meta = {}, classe = null, seance = null) {
  const lignes = charger("activity_logs");
  const ligne = {
    id: uid(), created_at: new Date().toISOString(),
    class_id: classe || null, session_id: seance || null, user_id: qui || null, action: quoi, meta
  };
  lignes.push(ligne);
  sauver("activity_logs", lignes);
  signaler("activity_logs", "INSERT", ligne);
}

/* Ce que les déclencheurs inscrivent d'eux-mêmes. */
const APRES = {
  profiles(type, n, a) {
    if (type === "INSERT") { assurerCommerce(n.id); return; }
    if (type !== "UPDATE") return;
    if (!pareil(n.role_key, a.role_key)) {
      journaliser(quiSuisJe() || n.id, "compte.role", { cible: n.id, nom: n.display_name, avant: a.role_key, apres: n.role_key });
    }
    if (!pareil(n.titre, a.titre) || !pareil(n.titre_libelle, a.titre_libelle)) {
      journaliser(quiSuisJe() || n.id, "compte.titre",
        { cible: n.id, nom: n.display_name, avant: a.titre || null, apres: n.titre || null, libelle: n.titre_libelle || null });
    }
  },
  moderation_notes(type, n) {
    if (type === "INSERT") journaliser(n.author_id, "moderation.note", { cible: n.target_id, genre: n.target_kind, verdict: n.verdict });
  }
};

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

      lignes.push(ligne);
      sauver(nom, lignes);
      signaler(nom, "INSERT", ligne);
      APRES[nom]?.("INSERT", ligne, null);
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
      APRES[nom]?.("UPDATE", lignes[i], ancien);
      return { ...lignes[i] };
    },
    async majorerOu(filtre, patch) {
      const lignes = charger(nom);
      const touchees = [];
      for (let i = 0; i < lignes.length; i++) {
        if (!correspond(lignes[i], filtre)) continue;
        const ancien = { ...lignes[i] };
        const fusion = { ...lignes[i], ...patch, updated_at: new Date().toISOString() };
        lignes[i] = GARDES[nom] ? GARDES[nom](ancien, fusion) : fusion;
        touchees.push({ nouveau: lignes[i], ancien });
      }
      sauver(nom, lignes);
      for (const t of touchees) { signaler(nom, "UPDATE", t.nouveau, t.ancien); APRES[nom]?.("UPDATE", t.nouveau, t.ancien); }
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
      APRES[nom]?.("DELETE", null, lignes[i]);
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
      for (const r of retirees) APRES[nom]?.("DELETE", null, r);
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
  quiSuisJe = monId;

  /* --- Procédures métier (équivalents des fonctions SQL) ----------------- */
  const procedures = {










    /* --- La boutique (miroir de 0039) ------------------------------------ */
    async mon_commerce() {
      const moi = monId();
      if (!moi) throw new ErreurDonnees("Connexion requise.", "42501");
      assurerCommerce(moi);
      const w = charger("ink_wallets").find((x) => x.user_id === moi);
      const q = charger("notebook_quota").find((x) => x.user_id === moi);
      const permis = Number(reglage("free_notebooks") ?? 1) + q.credits_purchased + q.credits_granted;
      return {
        exempte: exempteEncre(moi),
        encre: { solde: w.granted_total - w.spent_total, recu: w.granted_total, consomme: w.spent_total },
        cahiers: { crees: q.created_total, autorises: permis, restants: Math.max(0, permis - q.created_total) },
        regles: {
          cout_caractere: Number(reglage("char_cost") ?? 1),
          cout_trace: Number(reglage("stroke_cost") ?? 20),
          cout_piece: Number(reglage("attachment_cost") ?? 500)
        },
        pages_max: Number(reglage("max_pages") ?? 10),
        commandes_ouvertes: reglage("orders_open") !== false
      };
    },

    /** La missive de commande : rien n'est payé, rien n'est crédité. */
    async passer_commande({ target_sku, note = null }) {
      const moi = monId();
      if (!moi) throw new ErreurDonnees("Connexion requise.", "42501");
      if (reglage("orders_open") === false) throw new ErreurDonnees("Les commandes sont fermées pour le moment.", "PA001");
      const produit = charger("products").find((p) => p.sku === target_sku && p.active);
      if (!produit) throw new ErreurDonnees("Ce produit n'est pas en vente.", "PA002");
      if (note && String(note).length > 300) throw new ErreurDonnees("Votre message est trop long (300 caractères au plus).", "22023");
      const attente = charger("purchases").filter((a) => a.user_id === moi && a.status === "pending");
      if (attente.some((a) => a.product_id === produit.id)) {
        throw new ErreurDonnees("Vous avez déjà une missive en attente pour ce produit.", "PA003");
      }
      if (attente.length >= 3) throw new ErreurDonnees("Trop de missives en attente : attendez qu'elles soient livrées.", "PA003");
      const achat = await t("purchases").creer({
        user_id: moi, product_id: produit.id, product_sku: produit.sku, product_label: produit.label, kind: produit.kind,
        unit_price_cents: produit.price_cents, currency: produit.currency, ink_units: produit.ink_units,
        notebook_credits: produit.notebook_credits, status: "pending", provider: "roblox",
        message: String(note || "").trim() || null, created_at: new Date().toISOString()
      });
      journaliser(moi, "boutique.commande", { commande: achat.id, produit: achat.product_sku, prix: achat.unit_price_cents });
      return achat;
    },

    async annuler_commande({ target }) {
      const achat = charger("purchases").find((a) => a.id === target && a.user_id === monId() && a.status === "pending");
      if (!achat) throw new ErreurDonnees("Cette missive n'existe pas ou n'est plus en attente.", "P0002");
      return await t("purchases").majorer(target, { status: "canceled", decision_note: "Annulée par l'élève" });
    },

    /** Le PDG a été payé en jeu et remet la commande : c'est ce geste, et lui seul, qui crédite. */
    async admin_livrer_commande({ target, note = null }) {
      exigerBoutique();
      const achat = charger("purchases").find((a) => a.id === target);
      if (!achat) throw new ErreurDonnees("Commande introuvable.", "P0002");
      if (achat.status === "paid") return achat;           // idempotent : jamais deux fois
      if (achat.status !== "pending") throw new ErreurDonnees(`Cette commande n'est plus en attente (${achat.status}).`, "22023");
      assurerCommerce(achat.user_id);
      const maj = await t("purchases").majorer(target, {
        status: "paid", provider: "roblox", paid_at: new Date().toISOString(), fulfilled_at: new Date().toISOString(),
        delivered_by: monId(), delivered_at: new Date().toISOString(), decision_note: String(note || "").trim() || null
      });
      if (achat.ink_units > 0) {
        const portefeuilles = charger("ink_wallets");
        const w = portefeuilles.find((x) => x.user_id === achat.user_id);
        w.granted_total += achat.ink_units;
        w.updated_at = new Date().toISOString();
        sauver("ink_wallets", portefeuilles);
        signaler("ink_wallets", "UPDATE", { ...w });
        inscrireEncre(achat.user_id, achat.ink_units, "purchase", achat.product_label, monId(), achat.id);
      }
      if (achat.notebook_credits > 0) {
        const compteurs = charger("notebook_quota");
        const q = compteurs.find((x) => x.user_id === achat.user_id);
        q.credits_purchased += achat.notebook_credits;
        q.updated_at = new Date().toISOString();
        sauver("notebook_quota", compteurs);
      }
      journaliser(monId(), "boutique.livraison", { commande: achat.id, acheteur: achat.user_id, produit: achat.product_sku, prix: achat.unit_price_cents });
      return maj;
    },

    async admin_refuser_commande({ target, note = null }) {
      exigerBoutique();
      const achat = charger("purchases").find((a) => a.id === target && a.status === "pending");
      if (!achat) throw new ErreurDonnees("Cette commande n'est plus en attente.", "P0002");
      journaliser(monId(), "boutique.refus", { commande: achat.id, acheteur: achat.user_id, note });
      return await t("purchases").majorer(target, { status: "canceled", decision_note: String(note || "").trim() || null });
    },

    async admin_save_product({ donnees }) {
      exigerBoutique();
      const moi = monId();
      const prix = Number(donnees.price_cents);
      const encre = Number(donnees.ink_units || 0);
      const credits = Number(donnees.notebook_credits || 0);
      const genre = donnees.kind;
      const verifier = (p) => {
        if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(p.sku)) throw new ErreurDonnees("Identifiant de produit invalide.", "23514");
        if (!Number.isInteger(p.price_cents) || p.price_cents <= 0) throw new ErreurDonnees("Le prix doit être supérieur à zéro.", "23514");
        const ok = (p.kind === "ink_cartridge" && p.ink_units > 0 && p.notebook_credits === 0)
          || (p.kind === "notebook" && p.notebook_credits > 0 && p.ink_units === 0);
        if (!ok) throw new ErreurDonnees("Quantités incohérentes avec le genre du produit.", "23514");
      };
      const trace = (op, avant, apres) => t("product_price_history").creer({
        product_id: apres.id, product_sku: apres.sku, operation: op,
        old_price_cents: avant?.price_cents ?? null, new_price_cents: apres.price_cents,
        old_ink_units: avant?.ink_units ?? null, new_ink_units: apres.ink_units,
        old_notebook_credits: avant?.notebook_credits ?? null, new_notebook_credits: apres.notebook_credits,
        old_active: avant?.active ?? null, new_active: apres.active, changed_by: moi,
        changed_at: new Date().toISOString()
      });
      let produit;
      if (!donnees.id) {
        const sku = String(donnees.sku || "").trim().toLowerCase();
        if (charger("products").some((x) => x.sku === sku)) throw new ErreurDonnees("Cet identifiant existe déjà.", "23505");
        produit = { sku, kind: genre, label: String(donnees.label || "").trim(),
          description: String(donnees.description || "").trim() || null, price_cents: prix,
          currency: donnees.currency ?? reglage("currency") ?? "", ink_units: encre, notebook_credits: credits,
          active: Boolean(donnees.active), sort: Number(donnees.sort || 0), updated_by: moi };
        verifier(produit);
        if (!produit.label) throw new ErreurDonnees("Le produit doit avoir un nom.", "23514");
        produit = await t("products").creer(produit);
        await trace("create", null, produit);
      } else {
        const avant = await t("products").lire(donnees.id);
        if (!avant) throw new ErreurDonnees("Produit introuvable.", "P0002");
        const patch = { updated_by: moi };
        for (const c of ["label", "description", "price_cents", "ink_units", "notebook_credits", "active", "sort"]) {
          if (c in donnees) patch[c] = donnees[c];
        }
        verifier({ ...avant, ...patch, price_cents: Number(patch.price_cents ?? avant.price_cents),
                   ink_units: Number(patch.ink_units ?? avant.ink_units),
                   notebook_credits: Number(patch.notebook_credits ?? avant.notebook_credits) });
        produit = await t("products").majorer(donnees.id, patch);
        const change = ["price_cents", "ink_units", "notebook_credits", "active"].some((c) => avant[c] !== produit[c]);
        if (change) await trace("update", avant, produit);
      }
      journaliser(moi, "boutique.produit", { produit: produit.sku, prix_cents: produit.price_cents, actif: produit.active });
      return produit;
    },

    async admin_set_setting({ cle, valeur }) {
      exigerBoutique();
      const entier = (v) => Number.isInteger(v) && v >= 0 && v < 1e9;
      const ok = ["free_notebooks", "starter_ink", "char_cost", "stroke_cost", "attachment_cost", "max_pages"].includes(cle) ? entier(valeur)
        : cle === "orders_open" ? typeof valeur === "boolean"
        : cle === "currency" ? /^[A-Z]{3}$/.test(String(valeur))
        : cle === "exempt_roles" ? Array.isArray(valeur) && valeur.every((r) => charger("roles").some((x) => x.key === r))
        : false;
      if (!ok) throw new ErreurDonnees(`Réglage « ${cle} » : valeur refusée.`, "22023");
      const existant = charger("commerce_settings").find((l) => l.key === cle);
      if (existant) await t("commerce_settings").majorer(existant.id, { value: valeur, updated_by: monId() });
      else await t("commerce_settings").creer({ id: cle, key: cle, value: valeur, updated_by: monId() });
      journaliser(monId(), "boutique.reglage", { reglage: cle, valeur });
      return valeur;
    },

    async admin_grant_ink({ cible, montant, note = null }) {
      exigerBoutique();
      if (!montant) throw new ErreurDonnees("Montant nul.", "22023");
      if (!charger("profiles").some((p) => p.id === cible)) throw new ErreurDonnees("Compte introuvable.", "P0002");
      assurerCommerce(cible);
      const portefeuilles = charger("ink_wallets");
      const w = portefeuilles.find((x) => x.user_id === cible);
      const solde = w.granted_total - w.spent_total;
      if (solde + montant < 0) throw new ErreurDonnees(`Impossible : il ne reste que ${solde} d'encre à ce compte.`, "22023");
      w.granted_total += montant;
      w.updated_at = new Date().toISOString();
      sauver("ink_wallets", portefeuilles);
      signaler("ink_wallets", "UPDATE", { ...w });
      inscrireEncre(cible, montant, montant > 0 ? "admin_grant" : "admin_adjust", note, monId());
      journaliser(monId(), "boutique.encre", { cible, montant, note });
      return solde + montant;
    },

    async admin_grant_notebooks({ cible, nombre, note = null }) {
      exigerBoutique();
      if (!nombre) throw new ErreurDonnees("Nombre nul.", "22023");
      if (!charger("profiles").some((p) => p.id === cible)) throw new ErreurDonnees("Compte introuvable.", "P0002");
      assurerCommerce(cible);
      const compteurs = charger("notebook_quota");
      const q = compteurs.find((x) => x.user_id === cible);
      if (q.credits_granted + nombre < 0) throw new ErreurDonnees(`Impossible : ce compte n'a que ${q.credits_granted} cahier(s) offert(s).`, "22023");
      q.credits_granted += nombre;
      q.updated_at = new Date().toISOString();
      sauver("notebook_quota", compteurs);
      journaliser(monId(), "boutique.cahiers", { cible, nombre, note });
      return q.credits_granted;
    },

    async admin_commerce_overview({ recherche = null, limite = 200 }) {
      exigerBoutique();
      const mot = String(recherche || "").trim().toLowerCase();
      const achats = charger("purchases");
      return charger("profiles")
        .filter((p) => !mot || p.display_name.toLowerCase().includes(mot))
        .sort((a, b) => a.display_name.localeCompare(b.display_name))
        .slice(0, Math.min(Math.max(limite, 1), 1000))
        .map((p) => {
          assurerCommerce(p.id);
          const w = charger("ink_wallets").find((x) => x.user_id === p.id);
          const q = charger("notebook_quota").find((x) => x.user_id === p.id);
          const payes = achats.filter((a) => a.user_id === p.id && a.status === "paid");
          return {
            o_user_id: p.id, o_nom: p.display_name, o_role: p.role_key,
            o_solde: w.granted_total - w.spent_total, o_recu: w.granted_total, o_consomme: w.spent_total,
            o_cahiers_possedes: charger("notebooks").filter((n) => n.owner_id === p.id && n.kind === "personal").length,
            o_cahiers_crees: q.created_total,
            o_cahiers_autorises: Number(reglage("free_notebooks") ?? 1) + q.credits_purchased + q.credits_granted,
            o_achats: payes.length, o_paye_cents: payes.reduce((n, a) => n + a.unit_price_cents, 0)
          };
        });
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

    /** Une annonce à tous les comptes (annoncer_a_tous, 0029). */
    async annoncer_a_tous({ titre, corps = null }) {
      if (!estModerateurLocal()) throw new ErreurDonnees("Réservé à la modération.", "42501");
      const t0 = String(titre || "").trim();
      if (!t0 || t0.length > 120 || String(corps || "").length > 2000) {
        throw new ErreurDonnees("Titre requis (120 caractères au plus), texte de 2000 caractères au plus.", "22023");
      }
      const tous = await t("profiles").liste();
      for (const p of tous) {
        await t("notifications").creer({ user_id: p.id, kind: "annonce", title: t0, body: String(corps || "").trim() || null, read_at: null });
      }
      journaliser(monId(), "moderation.annonce", { titre: t0, destinataires: tous.length });
      return tous.length;
    },

    async message_de_moderation({ cible, titre, corps = null }) {
      if (!estModerateurLocal()) throw new ErreurDonnees("Réservé à la modération.", "42501");
      const t0 = String(titre || "").trim();
      if (!t0 || t0.length > 120 || String(corps || "").length > 2000) {
        throw new ErreurDonnees("Titre requis (120 caractères au plus), texte de 2000 caractères au plus.", "22023");
      }
      await t("notifications").creer({ user_id: cible, kind: "moderation", title: t0, body: String(corps || "").trim() || null, read_at: null });
      journaliser(monId(), "moderation.message", { cible, titre: t0 });
    },

    /**
     * Démonstration seulement : sans aucun administrateur, le compte ouvert
     * le devient. En ligne, le premier administrateur est nommé depuis la
     * console SQL — il n'y a pas d'équivalent, et c'est voulu.
     */
    async amorcer_admin_demo() {
      const tous = await t("profiles").liste();
      if (tous.some((p) => ["admin", "super_admin", "pdg"].includes(p.role_key))) {
        throw new ErreurDonnees("Il y a déjà une administration.", "42501");
      }
      const moi = monId();
      const lignes = charger("profiles");
      const i = lignes.findIndex((p) => p.id === moi);
      if (i < 0) throw new ErreurDonnees("Compte introuvable", "P0002");
      lignes[i] = { ...lignes[i], role_key: "pdg" };
      sauver("profiles", lignes);
      signaler("profiles", "UPDATE", lignes[i], null);
      return lignes[i];
    },

    /** Un code de rôle à usage unique, valable 24 h (creer_code_role, 0030). */
    async creer_code_role({ role }) {
      if (!["moderator", "admin", "super_admin"].includes(role)) {
        throw new ErreurDonnees("Rôle inconnu : moderator, admin ou super_admin.", "22023");
      }
      if (!peutNommer()) throw new ErreurDonnees("Seule l'administration crée un code.", "42501");
      if (role === "super_admin" && !estPDG(monId())) {
        throw new ErreurDonnees("Seul le PDG crée un code de super administrateur.", "42501");
      }
      const brut = [...crypto.getRandomValues(new Uint8Array(6))].map((o) => o.toString(16).padStart(2, "0")).join("").toUpperCase();
      const code = `${brut.slice(0, 4)}-${brut.slice(4, 8)}-${brut.slice(8, 12)}`;
      await t("role_codes").creer({
        code_hash: await empreinte(code), role_key: role, created_by: monId(),
        expires_at: new Date(Date.now() + 24 * 3600e3).toISOString(), used_by: null, used_at: null
      });
      journaliser(monId(), "compte.code_cree", { role });
      return code;
    },

    async utiliser_code_role({ code }) {
      const moi = monId();
      if (!moi) throw new ErreurDonnees("Connectez-vous d'abord.", "42501");
      const h = await empreinte(String(code || "").trim().toUpperCase());
      const ligne = (await t("role_codes").liste({ code_hash: h }))
        .find((l) => !l.used_at && new Date(l.expires_at).getTime() > Date.now());
      if (!ligne) {
        journaliser(moi, "compte.code_refuse", {});
        throw new ErreurDonnees("Code invalide, déjà utilisé ou expiré.", "42501");
      }
      const rang = async (cle) => (await t("roles").liste({ key: cle }))[0]?.rank || 0;
      const actuel = roleDe(moi);
      await t("role_codes").majorer(ligne.id, { used_by: moi, used_at: new Date().toISOString() });
      if (await rang(actuel) >= await rang(ligne.role_key)) return actuel;
      codeDeRole = moi;
      try { await t("profiles").majorer(moi, { role_key: ligne.role_key }); }
      finally { codeDeRole = null; }
      journaliser(moi, "compte.code_utilise", { role: ligne.role_key, avant: actuel });
      return ligne.role_key;
    },

    /** Sanctionner (sanctionner, 0033). La démonstration n'a pas d'adresse IP : « ip » vaut « definitif ». */
    async sanctionner({ cible, genre, raison, jours = null }) {
      const moi = monId();
      if (!estModerateurLocal()) throw new ErreurDonnees("Réservé à la modération.", "42501");
      if (!["mort", "personnage", "temporaire", "definitif", "ip"].includes(genre)) throw new ErreurDonnees("Sanction inconnue.", "22023");
      if (["definitif", "ip"].includes(genre) && !peutNommer()) {
        throw new ErreurDonnees("Un bannissement définitif ou IP relève de l'administration.", "42501");
      }
      if (cible === moi) throw new ErreurDonnees("On ne se sanctionne pas soi-même.", "42501");
      const texte = String(raison || "").trim();
      if (!texte || texte.length > 600) throw new ErreurDonnees("Donnez une raison (600 caractères au plus).", "22023");
      if (genre === "temporaire" && !(jours >= 1 && jours <= 365)) throw new ErreurDonnees("Une durée de 1 à 365 jours.", "22023");
      const p = await t("profiles").lire(cible);
      if (!p) throw new ErreurDonnees("Compte introuvable.", "P0002");
      if (["moderator", "admin", "director"].includes(p.role_key) && !peutNommer()) {
        throw new ErreurDonnees("Seule l'administration sanctionne un membre de l'encadrement.", "42501");
      }
      if (["super_admin", "pdg"].includes(p.role_key) && !(estPDG(moi) || (p.role_key === "super_admin" && roleDe(moi) === "super_admin"))) {
        throw new ErreurDonnees("Seul un super administrateur sanctionne un super administrateur.", "42501");
      }
      await t("sanctions").creer({
        user_id: cible, nom: p.display_name, genre, raison: texte, par: moi, ip_hashes: [],
        jusqua: genre === "temporaire" ? new Date(Date.now() + jours * 864e5).toISOString() : null,
        levee_at: null, levee_par: null
      });
      if (genre !== "temporaire") {
        const { avatar, ...prefs } = p.preferences || {};
        void avatar;
        const lignes = charger("profiles");
        const i = lignes.findIndex((l) => l.id === cible);
        lignes[i] = { ...lignes[i], titre: null, titre_libelle: null,
          preferences: { ...prefs, bannissement: { genre, raison: texte, le: new Date().toISOString(), lu: false } } };
        sauver("profiles", lignes);
        signaler("profiles", "UPDATE", lignes[i], p);
      }
      const titres = { mort: "Votre personnage est mort", personnage: "Votre personnage a été banni", temporaire: "Votre compte est suspendu" };
      await t("notifications").creer({ user_id: cible, kind: "bannissement", title: titres[genre] || "Votre compte est banni", body: texte, read_at: null });
      journaliser(moi, `sanction.${genre}`, { cible, nom: p.display_name, raison: texte, jours });
      return p.display_name;
    },


    async lever_sanction({ sanction }) {
      const s = await t("sanctions").lire(sanction);
      if (!s) throw new ErreurDonnees("Sanction introuvable.", "P0002");
      if (!estModerateurLocal() || (["definitif", "ip"].includes(s.genre) && !peutNommer())) {
        throw new ErreurDonnees("Vous ne pouvez pas lever cette sanction.", "42501");
      }
      await t("sanctions").majorer(sanction, { levee_at: new Date().toISOString(), levee_par: monId() });
      journaliser(monId(), "sanction.levee", { cible: s.user_id, nom: s.nom, genre: s.genre });
    },

    async mon_acces() {
      const s = sanctionActive(monId());
      return s ? { bloque: true, genre: s.genre, raison: s.raison, jusqua: s.jusqua, ip_vue: false } : { bloque: false, ip_vue: false };
    },

    /** Nom RP à la place du pseudo Discord (definir_nom_rp, 0043). */
    async definir_nom_rp({ cible, nom }) {
      const moi = monId();
      if (!peutNommer()) throw new ErreurDonnees("Seule l'administration change un nom RP.", "42501");
      const p = await t("profiles").lire(cible);
      if (!p) throw new ErreurDonnees("Compte introuvable.", "P0002");
      if (p.role_key === "pdg" && !estPDG(moi)) throw new ErreurDonnees("Seul le PDG renomme le PDG.", "42501");
      if (p.role_key === "super_admin" && !(estPDG(moi) || roleDe(moi) === "super_admin")) {
        throw new ErreurDonnees("Seul un super administrateur renomme un super administrateur.", "42501");
      }
      const propre = String(nom || "").replace(/\s+/g, " ").trim();
      let patch;
      if (!propre) patch = { display_name: p.discord_name || p.display_name, discord_name: null, nom_rp_libre: true };
      else {
        if (propre.length < 2 || propre.length > 60) throw new ErreurDonnees("Le nom RP doit faire entre 2 et 60 caractères.", "22023");
        patch = { display_name: propre, discord_name: p.discord_name || p.display_name, nom_rp_libre: false };
      }
      await t("profiles").majorer(cible, patch);
      journaliser(moi, "compte.nom_rp", { cible, avant: p.display_name, apres: patch.display_name, discord: patch.discord_name || patch.display_name });
      return patch.display_name;
    },

    /** Choisir son nom RP, une fois (choisir_mon_nom_rp, 0044). */
    async choisir_mon_nom_rp({ nom }) {
      const moi = monId();
      const p = moi ? await t("profiles").lire(moi) : null;
      if (!p) throw new ErreurDonnees("Compte introuvable.", "P0002");
      if (p.nom_rp_libre === false) {
        throw new ErreurDonnees("Votre nom RP est déjà choisi. Il ne change que si votre personnage meurt, ou par l'administration.", "42501");
      }
      const propre = String(nom || "").replace(/\s+/g, " ").trim();
      if (propre.length < 2 || propre.length > 60) throw new ErreurDonnees("Le nom RP doit faire entre 2 et 60 caractères.", "22023");
      const pris = charger("profiles").some((o) => o.id !== moi
        && [o.display_name, o.discord_name].some((n) => n && n.toLowerCase() === propre.toLowerCase()));
      if (pris) throw new ErreurDonnees("Ce nom est déjà porté par quelqu'un d'autre.", "23505");
      await t("profiles").majorer(moi, { display_name: propre, discord_name: p.discord_name || p.display_name, nom_rp_libre: false });
      journaliser(moi, "compte.nom_rp_choisi", { cible: moi, avant: p.display_name, apres: propre, discord: p.discord_name || p.display_name });
      return propre;
    },

    /** Personnage mort : un nouveau nom RP est possible (declarer_personnage_mort, 0044). */
    async declarer_personnage_mort({ cible }) {
      const moi = monId();
      if (!peutNommer()) throw new ErreurDonnees("Seule l'administration déclare un personnage mort.", "42501");
      const p = await t("profiles").lire(cible);
      if (!p) throw new ErreurDonnees("Compte introuvable.", "P0002");
      if (p.role_key === "pdg" && !estPDG(moi)) throw new ErreurDonnees("Seul le PDG touche au compte du PDG.", "42501");
      if (p.role_key === "super_admin" && !(estPDG(moi) || roleDe(moi) === "super_admin")) {
        throw new ErreurDonnees("Seul un super administrateur touche à ce compte.", "42501");
      }
      await t("profiles").majorer(cible, { nom_rp_libre: true });
      journaliser(moi, "compte.personnage_mort", { cible, nom: p.display_name });
      return p.display_name;
    },

    /** Supprimer un compte (supprimer_compte, 0031). */
    async supprimer_compte({ cible }) {
      const moi = monId();
      if (!peutNommer()) throw new ErreurDonnees("Seule l'administration supprime un compte.", "42501");
      if (cible === moi) throw new ErreurDonnees("On ne supprime pas son propre compte.", "42501");
      const p = await t("profiles").lire(cible);
      if (!p) throw new ErreurDonnees("Compte introuvable.", "P0002");
      if (["super_admin", "pdg"].includes(p.role_key) && !(estPDG(moi) || (p.role_key === "super_admin" && roleDe(moi) === "super_admin"))) {
        throw new ErreurDonnees("Seul un super administrateur supprime un super administrateur.", "42501");
      }
      journaliser(moi, "compte.supprime", { cible: p.id, nom: p.display_name, role: p.role_key });
      for (const table of ["class_members", "notifications", "notebooks", "ink_wallets", "notebook_quota"]) {
        await t(table).supprimerOu(table === "notebooks" ? { owner_id: cible } : { user_id: cible });
      }
      await t("profiles").supprimer(cible);
      sauverComptes(comptes().filter((c) => c.id !== cible));
      return p.display_name;
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
        let juste, note;
        if (["qcm", "single", "multiple"].includes(q.kind)) {
          const bonnes = [].concat(q.solution), recu = [...new Set([].concat(r.response ?? []))];
          const bons = recu.filter((v) => bonnes.includes(v)).length, faux = recu.length - bons;
          juste = bons === bonnes.length && faux === 0;
          note = juste ? Number(q.points)
            : q.settings?.partiel ? Math.round(Number(q.points) * Math.max(0, bons - faux) / bonnes.length * 100) / 100 : 0;
        } else {
          juste = JSON.stringify(r.response) === JSON.stringify(q.solution);
          note = juste ? Number(q.points) : 0;
        }
        await t("exercise_answers").majorer(r.id, { correct: juste, score: note });
        total += note;
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
          preferences: {}, avatar_url: null, roblox_name: null, bio: null, nom_rp_libre: true
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
        const ban = sanctionActive(compte.id);
        if (ban) {
          throw new ErreurDonnees(ban.genre === "temporaire"
            ? `Compte suspendu jusqu'au ${new Date(ban.jusqua).toLocaleString("fr-FR")}. Raison : ${ban.raison}`
            : `Compte banni définitivement. Raison : ${ban.raison}`, "42501");
        }
        const session = { user: { id: compte.id, email: compte.email }, mode: "local" };
        definirSession(session);
        return { user: session.user, session };
      },

      async changerMotDePasse(nouveau) {
        const liste = comptes();
        const compte = liste.find((c) => c.id === sessionCourante()?.user?.id);
        if (!compte) throw new ErreurDonnees("Compte introuvable sur cet appareil.", "404");
        compte.empreinte = await empreinte(nouveau);
        sauverComptes(liste);
        return true;
      },
      async remettreMotDePasse(cible, nouveau) {
        const liste = comptes();
        const compte = liste.find((c) => c.id === cible);
        if (!compte) throw new ErreurDonnees("Compte introuvable sur cet appareil.", "404");
        compte.empreinte = await empreinte(nouveau);
        sauverComptes(liste);
        return true;
      },

      async discord() {
        throw new ErreurDonnees("La connexion Discord nécessite le projet Supabase (indisponible en démonstration).", "LOCAL");
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
  const existants = await t("roles").liste();
  if (existants.length) {
    // Une démonstration ouverte avant l'arrivée de la modération.
    if (!existants.some((r) => r.key === "moderator")) {
      await t("roles").creer({ id: "moderator", key: "moderator", label: "Modérateur", rank: 70 });
      for (const p of ["MODERATE", "VIEW_LOGS", "MANAGE_PAPERS"]) {
        await t("role_permissions").creer({ role_key: "moderator", permission_key: p });
      }
    }
    return;
  }

  const roles = [
    ["pdg", "PDG", 110], ["super_admin", "Super administrateur", 100], ["admin", "Administrateur", 90],
    ["director", "Directeur", 80], ["moderator", "Modérateur", 70], ["teacher", "Professeur", 60],
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
  const toutes = [...new Set([...permsProf, ...permsEleve, "MANAGE_USERS", "MODERATE", "MANAGE_PAPERS"])];

  for (const key of toutes) await t("permissions").creer({ id: key, key, label: key, category: "general" });

  const attribuer = async (role, liste) => {
    for (const p of liste) await t("role_permissions").creer({ role_key: role, permission_key: p });
  };
  await attribuer("pdg", toutes);
  await attribuer("super_admin", toutes);
  await attribuer("admin", toutes);
  await attribuer("director", toutes.filter((p) => p !== "MANAGE_USERS"));
  await attribuer("moderator", ["MODERATE", "VIEW_LOGS", "MANAGE_PAPERS"]);
  await attribuer("teacher", permsProf);
  await attribuer("instructor", permsProf);
  await attribuer("student", permsEleve);
  await attribuer("observer", permsObs);
}
