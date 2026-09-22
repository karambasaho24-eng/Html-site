/* ---------------------------------------------------------------------------
 * Couche RolePlay.
 *
 * Un outil scolaire branché sur un serveur RP est, sans précaution, une source
 * permanente de HRP — « hors roleplay », tout ce qui vient du joueur et non du
 * personnage. Trois fuites reviennent sans cesse :
 *
 *   · les dates modernes (« 22/09/2026 ») dans un monde qui n'a ni ce
 *     calendrier ni cette ère ;
 *   · le pseudo du joueur affiché là où devrait figurer le nom du personnage ;
 *   · l'absence d'endroit propre pour dire une chose hors-perso, qui finit
 *     donc lâchée en plein cours.
 *
 * Ce module traite les trois. Il ne connaît aucun univers en particulier :
 * tout est réglé par classe, dans `classes.settings.rp`.
 * ------------------------------------------------------------------------- */

import { el } from "../ui/dom.js";

/* ===========================================================================
   Calendrier de l'univers
   ========================================================================= */

const MOIS_ORDINAUX = [
  "premier", "deuxième", "troisième", "quatrième", "cinquième", "sixième",
  "septième", "huitième", "neuvième", "dixième", "onzième", "douzième"
];

export const REGLAGES_RP_DEFAUT = {
  actif: false,
  ereLibelle: "an",        // « an 850 »
  ereDecalage: 0,          // ajouté à l'année réelle
  formatDate: "long",      // long | court
  hrpAutorise: true        // le marquage (( )) est-il proposé ?
};

export function reglagesRP(classe) {
  return { ...REGLAGES_RP_DEFAUT, ...(classe?.settings?.rp || {}) };
}

/**
 * Date telle que le personnage l'écrirait.
 * « an 850 — 22ᵉ jour du neuvième mois », ou « an 850 · 22/09 » en court.
 */
export function dateRP(valeur, reglages = REGLAGES_RP_DEFAUT) {
  const d = new Date(valeur);
  if (Number.isNaN(+d)) return "—";

  const annee = d.getFullYear() + (reglages.ereDecalage || 0);
  const jour = d.getDate();
  const mois = d.getMonth();
  const ere = reglages.ereLibelle || "an";

  if (reglages.formatDate === "court") {
    return `${ere} ${annee} · ${String(jour).padStart(2, "0")}/${String(mois + 1).padStart(2, "0")}`;
  }
  const suffixe = jour === 1 ? "ᵉʳ" : "ᵉ";
  return `${ere} ${annee} — ${jour}${suffixe} jour du ${MOIS_ORDINAUX[mois]} mois`;
}

/** Heure : le personnage n'a pas d'horloge numérique, mais il a des cloches. */
export function heureRP(valeur) {
  const d = new Date(valeur);
  if (Number.isNaN(+d)) return "—";
  const h = d.getHours();
  const m = d.getMinutes();
  const moment = h < 5 ? "avant l'aube"
    : h < 8 ? "à l'aube"
    : h < 12 ? "en matinée"
    : h < 14 ? "à la mi-journée"
    : h < 18 ? "en après-midi"
    : h < 21 ? "au crépuscule"
    : "à la nuit";
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")} — ${moment}`;
}

/* ===========================================================================
   Marquage hors-roleplay
   ========================================================================= */

/**
 * La convention admise dans les communautés RP est la double parenthèse :
 * `((je dois filer, à demain))`. Plutôt que d'interdire le hors-perso — ce
 * qui le pousse ailleurs — on lui donne une forme reconnaissable, que
 * l'interface met visuellement à part.
 */
const MOTIF_HRP = /\(\(([^)]*(?:\)(?!\))[^)]*)*)\)\)/g;

export function contientHRP(texte) {
  MOTIF_HRP.lastIndex = 0;
  return MOTIF_HRP.test(String(texte || ""));
}

/**
 * Transforme un texte brut en fragment où les passages `(( ))` sont détachés.
 * Rend du DOM, jamais du HTML : rien de ce que l'utilisateur tape n'est
 * interprété comme du balisage.
 */
export function baliserHRP(texte) {
  const fragment = document.createDocumentFragment();
  const source = String(texte || "");
  let curseur = 0;

  MOTIF_HRP.lastIndex = 0;
  let trouve;
  while ((trouve = MOTIF_HRP.exec(source)) !== null) {
    if (trouve.index > curseur) {
      fragment.appendChild(document.createTextNode(source.slice(curseur, trouve.index)));
    }
    fragment.appendChild(el("span.hrp", { title: "Hors roleplay" }, trouve[1].trim()));
    curseur = trouve.index + trouve[0].length;
  }
  if (curseur < source.length) {
    fragment.appendChild(document.createTextNode(source.slice(curseur)));
  }
  return fragment;
}

/** Retire les passages hors-RP — pour un résumé ou une recherche. */
export function sansHRP(texte) {
  return String(texte || "").replace(MOTIF_HRP, "").replace(/\s{2,}/g, " ").trim();
}

/* ===========================================================================
   Identité du personnage
   ========================================================================= */

/**
 * Le nom à afficher dans le contexte d'une classe : celui du personnage si
 * une fiche existe, sinon le nom du compte. C'est ce qui évite qu'un
 * « xX_Dark_Xx » vienne signer un rapport militaire.
 */
export function nomAffiche(personnage, profil) {
  return personnage?.name?.trim() || profil?.display_name || "—";
}

/** Ligne d'identité complète : « Cadet Jean Marchand — 104ᵉ brigade ». */
export function identiteComplete(personnage, profil) {
  if (!personnage) return profil?.display_name || "—";
  return [personnage.rank, nomAffiche(personnage, profil)]
    .filter(Boolean).join(" ")
    + (personnage.promotion ? ` — ${personnage.promotion}` : "");
}

export function initialesRP(personnage, profil) {
  const nom = nomAffiche(personnage, profil);
  return nom.split(/[\s-]+/).filter(Boolean).slice(0, 2)
    .map((m) => m[0].toUpperCase()).join("") || "?";
}

/* ===========================================================================
   Univers proposés
   ========================================================================= */

/**
 * Chaque univers apporte son vocabulaire, son calendrier et ses grades.
 * Le but n'est pas de simuler une œuvre précise, mais de donner aux serveurs
 * des points de départ crédibles qu'ils ajustent ensuite mot à mot.
 */
export const UNIVERS = {
  aucun: {
    libelle: "Aucun (usage ordinaire)",
    aide: "Dates réelles, vocabulaire scolaire. Pour un usage hors fiction.",
    rp: { actif: false },
    grades: []
  },
  murs: {
    libelle: "Derrière les murs",
    lexique: "murs",
    aide: "Corps militaires, brigades d'entraînement, cadets et instructeurs. "
        + "Calendrier décalé pour sortir de l'ère moderne.",
    rp: { actif: true, ereLibelle: "an", ereDecalage: -1176, formatDate: "long", hrpAutorise: true },
    grades: [
      "Cadet", "Cadette", "Soldat", "Caporal", "Caporal-chef",
      "Chef d'escouade", "Capitaine", "Commandant", "Major"
    ],
    corps: [
      "Brigade d'entraînement", "Garnison",
      "Bataillon d'exploration", "Brigades spéciales"
    ]
  },
  royaume: {
    libelle: "Royaume",
    lexique: "academie",
    aide: "Ordres, maisons et compagnons. Pour un univers médiéval ou féodal.",
    rp: { actif: true, ereLibelle: "an de grâce", ereDecalage: -700, formatDate: "long", hrpAutorise: true },
    grades: ["Apprenti", "Écuyer", "Compagnon", "Maître", "Doyen", "Grand maître"],
    corps: ["Guilde", "Ordre", "Maison", "Chancellerie"]
  },
  moderne: {
    libelle: "Contemporain",
    aide: "Académie, cabinet, service. Pour un RP se déroulant à notre époque.",
    rp: { actif: true, ereLibelle: "", ereDecalage: 0, formatDate: "court", hrpAutorise: true },
    grades: ["Stagiaire", "Élève", "Agent", "Superviseur", "Directeur"],
    corps: ["Académie", "Service", "Cabinet", "Brigade"]
  }
};

export function universDe(classe) {
  return classe?.settings?.univers || "aucun";
}

export function gradesDisponibles(classe) {
  return UNIVERS[universDe(classe)]?.grades || [];
}

export function corpsDisponibles(classe) {
  return UNIVERS[universDe(classe)]?.corps || [];
}
