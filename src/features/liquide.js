/* ---------------------------------------------------------------------------
 * Le « liquid glass » : sa couleur est un réglage du site, choisi par
 * l'administration et diffusé en temps réel à tous les écrans ouverts.
 *
 *  · au démarrage : la dernière couleur connue (aucun flash), puis la vraie ;
 *  · ensuite : un abonnement temps réel à la ligne « apparence » ;
 *  · côté administration : enregistrerApparence() change l'écran aussitôt
 *    et envoie le réglage (légèrement différé quand on fait glisser).
 * ------------------------------------------------------------------------- */
import { temps, pilote } from "../data/index.js";
import { etat } from "../core/store.js";

const CLE_LOCALE = "ojm:liquide";
// Mêmes valeurs par défaut que le site Whitelist Hub : verre blanc, transparence 70, flou 16.
const DEFAUT = { couleur: "#ffffff", verre: 70, flou: 16, fond: "", voile: 18 };

const CLE_PERSO = "ojm:fond-perso";

let courant = { ...DEFAUT };
let derniereModifLocale = 0;
let envoi = null;

const hexValide = (c) => /^#[0-9a-f]{6}$/i.test(String(c || ""));

const borner = (v, min, max, repli) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : repli;
};

/** Une image de fond n'est acceptée que sous deux formes sûres : lien https, ou image en base64. */
export const fondValide = (f) => typeof f === "string" && f.length <= 2_500_000 && (
  /^https:\/\/[^\s"'()\\<>]{4,1000}$/.test(f)
  || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(f)
);

function normaliser(v) {
  // Un ancien réglage (sans « verre ») gardait une couleur vive : on repart du verre blanc.
  const ancien = v && v.verre === undefined;
  return {
    couleur: !ancien && hexValide(v?.couleur) ? v.couleur.toLowerCase() : DEFAUT.couleur,
    verre: borner(v?.verre, 0, 100, DEFAUT.verre),
    flou: borner(v?.flou, 0, 24, DEFAUT.flou),
    fond: fondValide(v?.fond) ? v.fond : "",
    voile: borner(v?.voile, 0, 90, DEFAUT.voile)
  };
}

/** Pose le verre sur la page, tout de suite (même calcul que le site Whitelist Hub). */
export function appliquerLiquide(valeur) {
  courant = normaliser(valeur);
  const n = parseInt(courant.couleur.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const g = courant.verre;
  const t = 1 - g / 100;
  const racine = document.documentElement.style;
  racine.setProperty("--liquide-couleur", courant.couleur);
  // UNE couleur → tout le verre : --tint (verre), --tl (reflets, bords = version claire), --deep (ombres = version sombre)
  racine.setProperty("--tint", c.join(","));
  racine.setProperty("--tl", c.map((x) => Math.round(x + (255 - x) * 0.6)).join(","));
  racine.setProperty("--deep", c.map((x) => Math.round(x * 0.22)).join(","));
  racine.setProperty("--fill", (0.05 + t * 0.3).toFixed(3));
  racine.setProperty("--ts", (0.28 + g * 0.0042).toFixed(3));
  racine.setProperty("--flou", `${courant.flou}px`);
  racine.setProperty("--bf", courant.flou > 0 ? `blur(${courant.flou}px) saturate(1.8) brightness(1.05)` : "none");
  try { localStorage.setItem(CLE_LOCALE, JSON.stringify(courant)); } catch { /* stockage indisponible */ }
  poserFond();
}

/* ---------------------------------------------------------------------------
 * Le fond d'écran. Deux sources : celui du site (choisi par l'administration,
 * dans « apparence ») et celui de ce poste (Réglages), qui passe devant.
 * Sans image : un noir neutre, jamais de couleur.
 * ------------------------------------------------------------------------- */
export function fondPerso() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_PERSO) || "null");
    return { fond: fondValide(v?.fond) ? v.fond : "", voile: borner(v?.voile, 0, 90, DEFAUT.voile) };
  } catch { return { fond: "", voile: DEFAUT.voile }; }
}

/** Retourne false si le navigateur n'a plus la place de garder l'image. */
export function definirFondPerso(valeur) {
  const v = { fond: fondValide(valeur?.fond) ? valeur.fond : "", voile: borner(valeur?.voile, 0, 90, DEFAUT.voile) };
  try {
    if (!v.fond && v.voile === DEFAUT.voile) localStorage.removeItem(CLE_PERSO);
    else localStorage.setItem(CLE_PERSO, JSON.stringify(v));
  } catch { return false; }
  poserFond();
  return true;
}

function poserFond() {
  const perso = fondPerso();
  const image = perso.fond || courant.fond;
  const voile = perso.fond ? perso.voile : courant.voile;
  const racine = document.documentElement.style;
  racine.setProperty("--lq-fond-image", image ? `url("${image}")` : "none");
  racine.setProperty("--lq-voile", String(voile / 100));
}

/**
 * Lit une image choisie par l'utilisateur et la réduit (côté le plus long,
 * qualité) jusqu'à tenir dans `octetsMax`. Renvoie une image en base64.
 */
export async function lireImage(fichier, { octetsMax = 350_000, cote = 1920 } = {}) {
  if (!fichier || !/^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(fichier.type)) {
    throw new Error("Ce fichier n'est pas une image (JPEG, PNG ou WebP).");
  }
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Image illisible."));
      i.src = url;
    });
    for (let c = cote; c >= 480; c = Math.round(c * 0.8)) {
      const echelle = Math.min(1, c / Math.max(img.naturalWidth, img.naturalHeight));
      const toile = document.createElement("canvas");
      toile.width = Math.max(1, Math.round(img.naturalWidth * echelle));
      toile.height = Math.max(1, Math.round(img.naturalHeight * echelle));
      toile.getContext("2d").drawImage(img, 0, 0, toile.width, toile.height);
      for (const q of [0.85, 0.72, 0.6, 0.48]) {
        const data = toile.toDataURL("image/jpeg", q);
        if (data.length <= octetsMax) return data;
      }
    }
    throw new Error("Image trop lourde, même réduite : choisissez-en une plus simple.");
  } finally { URL.revokeObjectURL(url); }
}

export const apparenceActuelle = () => ({ ...courant });

export async function demarrerLiquide() {
  let memorise = null;
  try { memorise = JSON.parse(localStorage.getItem(CLE_LOCALE) || "null"); } catch { /* ignoré */ }
  appliquerLiquide(memorise || DEFAUT);

  try {
    const ligne = await pilote.table("site_settings").lire("apparence");
    if (ligne?.valeur) appliquerLiquide(ligne.valeur);
  } catch (err) {
    console.warn("[liquide] lecture de l'apparence impossible (migration 0036 appliquée ?)", err);
  }

  try {
    temps.sabonner({
      cle: "site:apparence",
      tables: [{ table: "site_settings", filtre: "id=eq.apparence" }],
      surChangement: ({ nouveau }) => {
        if (!nouveau?.valeur) return;
        // L'écho de ce qu'on vient d'envoyer ne doit pas faire revenir en arrière le curseur.
        const moi = nouveau.maj_par && nouveau.maj_par === etat.utilisateur?.id;
        if (moi && Date.now() - derniereModifLocale < 1500) return;
        appliquerLiquide(nouveau.valeur);
      }
    });
  } catch (err) {
    console.warn("[liquide] temps réel indisponible", err);
  }
}

/** Administration : change l'écran aussitôt, puis l'envoie à tous. */
export function enregistrerApparence(valeur, { surErreur } = {}) {
  appliquerLiquide(valeur);
  derniereModifLocale = Date.now();
  clearTimeout(envoi);
  envoi = setTimeout(async () => {
    try {
      const table = pilote.table("site_settings");
      const patch = { valeur: courant, maj: new Date().toISOString(), maj_par: etat.utilisateur?.id || null };
      const ligne = await table.lire("apparence");
      if (ligne) await table.majorer("apparence", patch);
      else await table.creer({ id: "apparence", ...patch });
    } catch (err) { surErreur?.(err); }
  }, 180);
}
