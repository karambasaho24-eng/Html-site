/* ---------------------------------------------------------------------------
 * Utilitaires transverses : identifiants, dates, texte, temporisation.
 * ------------------------------------------------------------------------- */
import { stockageLocal } from "./stockage.js";

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // Repli déterministe pour les contextes non sécurisés
  const h = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    s += (i === 8 || i === 13 || i === 18 || i === 23) ? "-"
       : i === 14 ? "4"
       : h[Math.floor(Math.random() * 16)];
  }
  return s;
}

const ALPHABET_CODE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Code de classe lisible : K7F-29A (sans 0/O ni 1/I). */
export function genererCode() {
  const bloc = () => Array.from({ length: 3 }, () =>
    ALPHABET_CODE[Math.floor(Math.random() * ALPHABET_CODE.length)]).join("");
  return `${bloc()}-${bloc()}`;
}

export function normaliserCode(valeur) {
  const brut = String(valeur || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return brut.length > 3 ? `${brut.slice(0, 3)}-${brut.slice(3, 6)}` : brut;
}

/* --- Dates ---------------------------------------------------------------- */
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
              "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function dateLongue(valeur) {
  const d = new Date(valeur);
  if (Number.isNaN(+d)) return "—";
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

export function dateCourte(valeur) {
  const d = new Date(valeur);
  if (Number.isNaN(+d)) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function heure(valeur) {
  const d = new Date(valeur);
  if (Number.isNaN(+d)) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function dateHeure(valeur) {
  return `${dateCourte(valeur)} · ${heure(valeur)}`;
}

/** « il y a 4 min », « à l'instant », « hier » */
export function depuis(valeur) {
  const d = new Date(valeur);
  if (Number.isNaN(+d)) return "—";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "à l'instant";
  if (s < 90) return "il y a 1 min";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 7200) return "il y a 1 h";
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 172800) return "hier";
  if (s < 604800) return `il y a ${Math.floor(s / 86400)} j`;
  return dateCourte(valeur);
}

/** 754 -> « 12:34 » ; 3754 -> « 1:02:34 » */
export function duree(secondes) {
  const s = Math.max(0, Math.floor(secondes || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function dureeLongue(secondes) {
  const s = Math.max(0, Math.floor(secondes || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/* --- Texte ---------------------------------------------------------------- */
export function initiales(nom) {
  return String(nom || "?")
    .split(/[\s-]+/).filter(Boolean).slice(0, 2)
    .map((mot) => mot[0].toUpperCase()).join("") || "?";
}

export function tronquer(texte, max = 80) {
  const t = String(texte ?? "");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function poids(octets) {
  if (!octets) return "—";
  const unites = ["o", "ko", "Mo", "Go"];
  let i = 0, v = octets;
  while (v >= 1024 && i < unites.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${unites[i]}`;
}

export function pluriel(n, singulier, plurielMot) {
  return `${n} ${n > 1 ? (plurielMot || `${singulier}s`) : singulier}`;
}

/** Recherche accent-insensible. */
export function aplatir(texte) {
  return String(texte ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* --- Temporisation -------------------------------------------------------- */
export function debounce(fn, delai = 300) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delai);
  };
  wrapped.annuler = () => clearTimeout(t);
  wrapped.immediat = (...args) => { clearTimeout(t); fn(...args); };
  return wrapped;
}

export function throttle(fn, intervalle = 60) {
  let dernier = 0, timer = null, dernierArgs = null;
  return (...args) => {
    const maintenant = Date.now();
    dernierArgs = args;
    if (maintenant - dernier >= intervalle) {
      dernier = maintenant;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null; dernier = Date.now();
        fn(...dernierArgs);
      }, intervalle - (maintenant - dernier));
    }
  };
}

export const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- Divers --------------------------------------------------------------- */
export function grouper(liste, cle) {
  const sortie = new Map();
  for (const item of liste) {
    const k = typeof cle === "function" ? cle(item) : item[cle];
    if (!sortie.has(k)) sortie.set(k, []);
    sortie.get(k).push(item);
  }
  return sortie;
}

export function trier(liste, cle, sens = 1) {
  const acces = typeof cle === "function" ? cle : (o) => o[cle];
  return [...liste].sort((a, b) => {
    const va = acces(a), vb = acces(b);
    if (va === vb) return 0;
    return (va > vb ? 1 : -1) * sens;
  });
}

export function clamp(valeur, min, max) {
  return Math.min(max, Math.max(min, valeur));
}

/** Copie dans le presse-papier avec repli. */
export async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    const champ = document.createElement("textarea");
    champ.value = texte;
    champ.style.position = "fixed";
    champ.style.opacity = "0";
    document.body.appendChild(champ);
    champ.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    champ.remove();
    return ok;
  }
}

/**
 * Stockage local tolérant. S'appuie sur src/core/stockage.js, qui retombe sur
 * une mémoire volatile quand le navigateur refuse l'accès (navigation privée,
 * cookies bloqués, page en bac à sable).
 */
export const local = {
  lire(cle, defaut = null) {
    try {
      const brut = stockageLocal.getItem(cle);
      return brut == null ? defaut : JSON.parse(brut);
    } catch { return defaut; }
  },
  ecrire(cle, valeur) {
    try { stockageLocal.setItem(cle, JSON.stringify(valeur)); return true; }
    catch { return false; }
  },
  retirer(cle) {
    try { stockageLocal.removeItem(cle); } catch { /* ignoré */ }
  }
};
