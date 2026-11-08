/* ---------------------------------------------------------------------------
 * L'apparence du site — le script de « Whitelist Hub », repris tel quel.
 *
 * UNE couleur (la couleur du verre) pilote toute l'interface : --tint (le verre),
 * --tl (reflets et bords : sa version claire) et --deep (ombres : sa version
 * sombre) sont calculées ici, puis waitlist.css en tire tout le reste. Les mêmes
 * réglages que sur Whitelist Hub : transparence et flou du verre, fond (vidéo,
 * lien YouTube), zoom et assombrissement du fond, musique, logo, icône d'onglet.
 *
 *  · au démarrage : le dernier réglage connu (aucun flash), puis le vrai ;
 *  · ensuite : un abonnement temps réel à la ligne « apparence » ;
 *  · côté administration : enregistrer() change l'écran aussitôt et envoie le
 *    réglage à la base (légèrement différé quand on fait glisser un curseur).
 *
 * La base est la seule source de vérité : le cache local ne sert qu'à ne pas
 * montrer le décor par défaut pendant le chargement.
 * ------------------------------------------------------------------------- */
import { temps, pilote } from "../data/index.js";
import { etat } from "../core/store.js";
import { emettre } from "../core/bus.js";
import { config } from "../core/config.js";
import { el } from "../ui/dom.js";

const CLE_LOCALE = "ojm:apparence";
const BUCKET = "site-assets";

/* --- Valeurs par défaut : celles de Whitelist Hub (verre blanc, rien de coloré) --- */
export const DEFAUT = {
  nom: "",          // vide = le nom de l'établissement (config.js)
  logo: "",         // image : lien https://… ou fichier envoyé
  icone: "",        // icône de l'onglet du navigateur
  video: "",        // fond : fichier vidéo ou lien YouTube
  fond: "",         // fond : une image (lien https ou image réduite en base64) ; la vidéo passe devant
  audio: "",        // musique de fond (fichier audio), jouée en boucle
  vol: 50,          // volume de la musique (0 à 100)
  dim: 18,          // assombrissement du fond (0 à 90)
  zoom: 100,        // zoom du fond (100 à 180)
  glass: 70,        // transparence du verre (0 à 100)
  blur: 16,         // flou du verre (0 à 24)
  tint: "#ffffff"   // COULEUR DU VERRE : une seule valeur, toute l'interface s'y adapte
};

/** Les réglages qui pointent vers un fichier envoyé dans le stockage (supprimé quand il est remplacé). */
export const CHAMPS_FICHIER = ["logo", "icone", "video", "audio"];
export const estFichierReglage = (cle) => CHAMPS_FICHIER.includes(cle);

/** Pastilles de couleur proposées dans les réglages (les mêmes que sur Whitelist Hub). */
export const NUANCES = [
  { n: "Blanc", c: "#ffffff" }, { n: "Ambre", c: "#ffc27a" }, { n: "Rose", c: "#ff9ec7" },
  { n: "Violet", c: "#c4a4ff" }, { n: "Bleu", c: "#8cc4ff" }, { n: "Menthe", c: "#8cf0cf" }
];

/* --- Validation : toute valeur (cache, saisie, base) est bornée et typée avant usage --- */
const HEX = /^#[0-9a-f]{6}$/i;
const LIEN = /^(https:\/\/[^\s"'<>\\]+|assets\/[A-Za-z0-9_.\/-]+)$/;
const nombre = (v, a, b, repli) => { v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : repli; };
const texte = (v, repli) => (typeof v === "string" ? v.slice(0, 40) : repli);
const couleur = (v, repli) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : repli);
/** Une image de fond n'est acceptée que sous deux formes sûres : lien https, ou image en base64. */
export const fondValide = (f) => typeof f === "string" && f.length <= 2_500_000 && (
  /^https:\/\/[^\s"'()\\<>]{4,1000}$/.test(f)
  || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(f)
);
const lien = (v, repli) => (typeof v === "string" && (v === "" || (v.length <= 300 && LIEN.test(v))) ? v : repli);

export function nettoyer(s) {
  const d = DEFAUT;
  s = s && typeof s === "object" ? s : {};
  // Les anciens réglages (couleur, verre, flou) deviennent ceux d'aujourd'hui.
  const ancien = s.verre !== undefined;
  return {
    nom: texte(s.nom, d.nom), logo: lien(s.logo, d.logo), icone: lien(s.icone, d.icone),
    video: lien(s.video, d.video), fond: fondValide(s.fond) ? s.fond : d.fond, audio: lien(s.audio, d.audio),
    vol: nombre(s.vol, 0, 100, d.vol), dim: nombre(s.dim, 0, 90, d.dim), zoom: nombre(s.zoom, 100, 180, d.zoom),
    glass: nombre(s.glass ?? s.verre, 0, 100, d.glass), blur: nombre(s.blur ?? s.flou, 0, 24, d.blur),
    tint: couleur(s.tint ?? (ancien ? s.couleur : undefined), d.tint)
  };
}

let courant = nettoyer(DEFAUT);
let connu = false;           // vrai dès qu'on a un réglage réel (cache ou base)
let sale = false;            // vrai tant qu'un réglage local n'est pas parti vers la base
let envoi = null;
let enCours = false;
let derniereModifLocale = 0;
const poubelle = [];         // fichiers remplacés, à supprimer du stockage une fois le réglage enregistré

export const apparenceActuelle = () => ({ ...courant });
export const nomDuSite = () => courant.nom || config.academyName || "Classe Parallèle";

/* ===========================================================================
   Poser le verre sur la page (même calcul que Whitelist Hub)
   =========================================================================== */
const rvb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || ""));
  const n = parseInt(m ? m[1] : "ffffff", 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

function appliquer(valeur) {
  courant = nettoyer(valeur);
  const r = document.documentElement.style;
  const g = courant.glass, t = 1 - g / 100, c = rvb(courant.tint), fl = courant.blur;
  // UNE couleur → tout le thème : --tint (verre), --tl (reflets/bords = version claire), --deep (ombres = version sombre)
  r.setProperty("--tint", c.join(","));
  r.setProperty("--tl", c.map((x) => Math.round(x + (255 - x) * 0.6)).join(","));
  r.setProperty("--deep", c.map((x) => Math.round(x * 0.22)).join(","));
  r.setProperty("--fill", (0.05 + t * 0.3).toFixed(3));
  r.setProperty("--ts", (0.28 + g * 0.0042).toFixed(3));
  r.setProperty("--zm", courant.zoom / 100);
  r.setProperty("--bf", fl > 0 ? `blur(${fl}px) saturate(1.8) brightness(1.05)` : "none");
  document.querySelectorAll(".swt[data-v]").forEach((x) => x.classList.toggle("on", x.dataset.v === courant.tint));
  try { localStorage.setItem(CLE_LOCALE, JSON.stringify(courant)); } catch { /* stockage indisponible */ }

  if (!connu) return;
  poserFond();
  poserMusique();
  const icone = document.getElementById("fav");
  if (icone) {
    if (!icone.dataset.d) icone.dataset.d = icone.getAttribute("href");
    const h = courant.icone || icone.dataset.d;
    if (icone.getAttribute("href") !== h) icone.setAttribute("href", h);
  }
  document.title = nomDuSite();
  emettre("apparence", { ...courant });
}

let signatureFond = null;

/* Le fond d'écran de ce poste (Réglages) passe devant celui du site ; sans rien : noir neutre, jamais de couleur. */
const CLE_PERSO = "ojm:fond-perso";
export function fondPerso() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_PERSO) || "null");
    return { fond: fondValide(v?.fond) ? v.fond : "", voile: nombre(v?.voile, 0, 90, DEFAUT.dim) };
  } catch { return { fond: "", voile: DEFAUT.dim }; }
}
/** Retourne false si le navigateur n'a plus la place de garder l'image. */
export function definirFondPerso(valeur) {
  const v = { fond: fondValide(valeur?.fond) ? valeur.fond : "", voile: nombre(valeur?.voile, 0, 90, DEFAUT.dim) };
  try {
    if (!v.fond && v.voile === DEFAUT.dim) localStorage.removeItem(CLE_PERSO);
    else localStorage.setItem(CLE_PERSO, JSON.stringify(v));
  } catch { return false; }
  poserFond();
  return true;
}

function poserFond() {
  if (!connu) return;
  const perso = fondPerso();
  const image = perso.fond || (courant.video ? "" : courant.fond);
  const video = perso.fond ? "" : courant.video;
  const racine = document.documentElement.style;
  racine.setProperty("--dim", (perso.fond ? perso.voile : courant.dim) / 100);
  const signature = `${video}|${image}`;
  if (signature === signatureFond) return;
  signatureFond = signature;
  let bg = document.getElementById("bg");
  if (!bg) { bg = el("div#bg", { "aria-hidden": "true" }); document.body.prepend(bg); }
  bg.replaceChildren();
  bg.classList.toggle("vid", Boolean(video));
  bg.style.backgroundImage = image ? `url("${image}")` : "";
  bg.style.backgroundSize = "cover"; bg.style.backgroundPosition = "center";
  if (!video) return;
  const y = idYoutube(video);
  if (y) {
    bg.append(el("iframe.yt", {
      src: `https://www.youtube-nocookie.com/embed/${y}?autoplay=1&mute=1&loop=1&playlist=${y}&controls=0&modestbranding=1&playsinline=1&rel=0`,
      allow: "autoplay;encrypted-media", title: ""
    }));
  } else {
    const v = el("video", { src: video, autoplay: true, muted: true, loop: true, playsinline: true, preload: "auto" });
    v.muted = true; v.disablePictureInPicture = true;
    bg.append(v);
  }
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

/* --- Le fond : une vidéo (ou un lien YouTube), ou une image, derrière tout ---------- */
const idYoutube = (u) => { const m = String(u).match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/); return m ? m[1] : null; };

/* --- La marque : le logo, ou le nom du site ---------------------------------------- */
export function marque() {
  if (courant.logo) return el("img.logo", { src: courant.logo, alt: nomDuSite() });
  return el("span.brand", el("b", nomDuSite()));
}

/* ===========================================================================
   La musique de fond
   Un seul lecteur, créé en JS (jamais en HTML) ; la source est déjà validée par
   nettoyer(). Les navigateurs refusent le son avant un geste de la personne : la
   lecture démarre alors au premier clic, à la première touche ou au premier toucher.
   Fondu : AUG (0 → 1) multiplie le volume réglé ; basé sur l'horloge, donc
   correct même si l'onglet est ralenti en arrière-plan.
   =========================================================================== */
const AU = new Audio();
AU.loop = true; AU.preload = "auto";
let srcAudio = null, srcCharge = null, minuteurAudio = 0, armee = false, AUG = 1, AUTG = 1, fondu = 0, echange = false;
const DUREE_FONDU = 600;

function volume() {
  const v = Math.min(100, Math.max(0, Number(courant.vol) || 0)) / 100, e = v * AUG;
  if (AU.volume !== e) AU.volume = e;
  return v;
}
function fondre(vers, ms, fini) {
  clearInterval(fondu); fondu = 0; AUTG = vers;
  const depart = AUG, t0 = Date.now();
  if (!ms || depart === vers) { AUG = vers; volume(); fini?.(); return; }
  fondu = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / ms);
    AUG = depart + (vers - depart) * k; volume();
    if (k >= 1) { clearInterval(fondu); fondu = 0; fini?.(); }
  }, 30);
}
function jouer() {
  const v = volume();
  if (echange) return;
  const veut = Boolean(srcAudio) && v > 0 && !document.hidden;
  if (!veut) {
    if (AU.paused) return;
    if (v === 0 || !srcAudio) { AU.pause(); return; }
    if (AUTG !== 0) fondre(0, DUREE_FONDU, () => AU.pause());
    return;
  }
  if (AU.paused) {
    AUG = 0; AUTG = 0; volume();
    const p = AU.play();
    p?.catch?.((e) => { if (e?.name === "NotAllowedError") armer(); });
    fondre(1, DUREE_FONDU);
  } else if (AUTG !== 1) fondre(1, DUREE_FONDU);
}
function armer() {
  if (armee) return;
  armee = true;
  const evts = ["pointerdown", "keydown", "touchend"];
  const fn = () => { evts.forEach((t) => document.removeEventListener(t, fn, true)); armee = false; jouer(); };
  evts.forEach((t) => document.addEventListener(t, fn, true));
}
/** Changer de fichier : léger délai (on tape un lien lettre par lettre), puis fondu sortant, puis fondu entrant. */
function poserMusique() {
  const src = courant.audio || "";
  if (srcAudio === null || src !== srcAudio) {
    const premier = srcAudio === null;
    srcAudio = src; clearTimeout(minuteurAudio);
    const echanger = () => {
      echange = false; AU.pause(); srcCharge = srcAudio;
      if (srcAudio) AU.src = srcAudio; else AU.removeAttribute("src");
      AU.load(); AUG = 0; AUTG = 0; jouer();
    };
    const charger = () => {
      minuteurAudio = 0;
      if (srcCharge === srcAudio) { jouer(); return; }
      if (AU.paused || !AU.src || document.hidden) { echanger(); return; }
      echange = true; fondre(0, DUREE_FONDU, echanger);
    };
    if (premier || !src) charger(); else minuteurAudio = setTimeout(charger, 500);
    return;
  }
  jouer();
}

/* ===========================================================================
   Démarrage, temps réel, enregistrement
   =========================================================================== */
export async function demarrerApparence() {
  try {
    const memorise = JSON.parse(localStorage.getItem(CLE_LOCALE) || "null");
    if (memorise) { connu = true; appliquer(memorise); } else appliquer(DEFAUT);
  } catch { appliquer(DEFAUT); }

  try {
    const ligne = await pilote.table("site_settings").lire("apparence");
    connu = true;
    appliquer(ligne?.valeur || DEFAUT);
  } catch (err) {
    connu = true;
    appliquer(courant);
    console.warn("[apparence] lecture impossible (migration 0042 appliquée ?)", err);
  }

  try {
    temps.sabonner({
      cle: "site:apparence",
      tables: [{ table: "site_settings", filtre: "id=eq.apparence" }],
      surChangement: ({ nouveau }) => {
        if (!nouveau?.valeur || sale) return;
        // L'écho de ce qu'on vient d'envoyer ne doit pas faire revenir en arrière un curseur.
        const moi = nouveau.maj_par && nouveau.maj_par === etat.utilisateur?.id;
        if (moi && Date.now() - derniereModifLocale < 1500) return;
        appliquer(nouveau.valeur);
      }
    });
  } catch (err) { console.warn("[apparence] temps réel indisponible", err); }

  // Onglet caché : on gèle les animations CSS et on suspend la vidéo et la musique (économie CPU/GPU).
  document.addEventListener("visibilitychange", () => {
    document.documentElement.classList.toggle("hid", document.hidden);
    const v = document.querySelector("#bg video");
    if (v) { if (document.hidden) v.pause(); else v.play().catch(() => {}); }
    jouer();
  });
}

/** Administration : change l'écran aussitôt, puis envoie à tous. `jeter` = fichiers remplacés à supprimer. */
export function enregistrer(patch, { surErreur, jeter = [] } = {}) {
  appliquer({ ...courant, ...patch });
  derniereModifLocale = Date.now();
  jeter.forEach((u) => { if (u && !poubelle.includes(u)) poubelle.push(u); });
  sale = true;
  clearTimeout(envoi);
  envoi = setTimeout(() => envoyer(surErreur), 500);
}

async function envoyer(surErreur) {
  if (enCours) { envoi = setTimeout(() => envoyer(surErreur), 300); return; }
  enCours = true;
  const instantane = JSON.stringify(courant);
  let ok = true;
  try {
    const table = pilote.table("site_settings");
    const ligne = { valeur: courant, maj: new Date().toISOString(), maj_par: etat.utilisateur?.id || null };
    if (await table.lire("apparence")) await table.majorer("apparence", ligne);
    else await table.creer({ id: "apparence", ...ligne });
  } catch (err) { ok = false; surErreur?.(err); }
  enCours = false;
  if (ok && JSON.stringify(courant) !== instantane) return envoyer(surErreur);   // modifié pendant l'envoi
  sale = false;
  if (ok) {
    const utilises = CHAMPS_FICHIER.map((k) => courant[k]);
    poubelle.splice(0).forEach((u) => { if (!utilises.includes(u)) supprimerFichier(u); });
  } else {
    poubelle.length = 0;
    try { const l = await pilote.table("site_settings").lire("apparence"); if (l?.valeur) appliquer(l.valeur); } catch { /* ignoré */ }
  }
}

export function reinitialiser(cle) {
  if (!(cle in DEFAUT)) return;
  const ancien = courant[cle];
  enregistrer({ [cle]: DEFAUT[cle] }, { jeter: estFichierReglage(cle) ? [ancien] : [] });
}

export function toutReinitialiser(surErreur) {
  enregistrer({ ...DEFAUT }, { surErreur, jeter: CHAMPS_FICHIER.map((k) => courant[k]) });
}

/* --- Fichiers : logo, icône, fond, musique (stockage public, écriture réservée à l'administration) --- */
const EXTENSIONS = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm",
  "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a"
};

export const importPossible = () => pilote?.mode !== "local";

export async function televerser(fichier, genre) {
  const ext = EXTENSIONS[fichier.type];
  if (!ext) throw new Error("Format non pris en charge");
  const chemin = `site/${genre}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await pilote.fichiers.televerser(fichier, chemin, BUCKET);
  return pilote.fichiers.url(chemin, BUCKET);
}

function supprimerFichier(url) {
  const m = typeof url === "string" && url.split(`/storage/v1/object/public/${BUCKET}/`)[1];
  if (m && /^site\/[\w.-]+$/.test(m)) pilote.fichiers.supprimer(m, BUCKET).catch(() => {});
}
