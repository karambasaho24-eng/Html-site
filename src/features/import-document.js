/* ---------------------------------------------------------------------------
 * Conversion d'un document en pages de cahier.
 *
 * PDF   : rendu page par page via pdf.js (chargé à la demande, jamais au
 *         démarrage) puis inséré comme image dans une page de cahier.
 * Image : une page, une image.
 * Texte : découpage en pages sur les titres ou les sauts de page.
 *
 * Aucun service payant, aucune IA obligatoire : tout se fait dans le navigateur.
 * ------------------------------------------------------------------------- */
import { pages as depotPages } from "../data/index.js";
import { etat } from "../core/store.js";

// pdf.js est livré avec le site (vendor/). Il n'est chargé qu'au moment d'une
// conversion, jamais au démarrage : c'est le plus gros fichier du projet.
const PDFJS_LOCAL   = new URL("../../vendor/pdf.min.mjs", import.meta.url).href;
const WORKER_LOCAL  = new URL("../../vendor/pdf.worker.min.mjs", import.meta.url).href;
const PDFJS_CDN     = "https://esm.sh/pdfjs-dist@4.6.82/build/pdf.min.mjs";
const WORKER_CDN    = "https://esm.sh/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs";

let pdfjs = null;

async function chargerPdfjs() {
  if (pdfjs) return pdfjs;
  try {
    pdfjs = await import(/* @vite-ignore */ PDFJS_LOCAL);
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_LOCAL;
  } catch (err) {
    console.warn("[pdf] copie locale indisponible, repli sur le CDN", err);
    pdfjs = await import(/* @vite-ignore */ PDFJS_CDN);
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_CDN;
  }
  return pdfjs;
}

/** Nombre de pages d'un PDF, sans le convertir. */
export async function compterPagesPdf(fichier) {
  const lib = await chargerPdfjs();
  const donnees = new Uint8Array(await fichier.arrayBuffer());
  const doc = await lib.getDocument({ data: donnees }).promise;
  const total = doc.numPages;
  doc.destroy();
  return total;
}

/**
 * Convertit un PDF en images (une par page).
 * @returns {Promise<string[]>} data URLs
 */
export async function pdfEnImages(fichier, { pagesVoulues = null, echelle = 1.5, surProgression = null } = {}) {
  const lib = await chargerPdfjs();
  const donnees = new Uint8Array(await fichier.arrayBuffer());
  const doc = await lib.getDocument({ data: donnees }).promise;

  const indices = pagesVoulues && pagesVoulues.length
    ? pagesVoulues
    : Array.from({ length: doc.numPages }, (_, i) => i + 1);

  const images = [];
  for (let i = 0; i < indices.length; i++) {
    const page = await doc.getPage(indices[i]);
    const vue = page.getViewport({ scale: echelle });
    const toile = document.createElement("canvas");
    toile.width = Math.round(vue.width);
    toile.height = Math.round(vue.height);
    await page.render({ canvasContext: toile.getContext("2d"), viewport: vue }).promise;
    images.push(toile.toDataURL("image/jpeg", 0.78));
    page.cleanup();
    surProgression?.(i + 1, indices.length);
  }
  doc.destroy();
  return images;
}

/** Découpe un texte brut en pages exploitables. */
export function texteEnPages(texte, { parPage = 2400 } = {}) {
  const brut = String(texte || "").replace(/\r\n/g, "\n");

  // Découpage prioritaire sur les sauts de page explicites
  let morceaux = brut.split(/\f|\n-{3,}\n/g).map((m) => m.trim()).filter(Boolean);

  if (morceaux.length <= 1) {
    // Sinon, sur les titres en majuscules ou numérotés
    morceaux = brut.split(/\n(?=(?:[IVXLC]+\.|\d+\.|[A-ZÀ-Ý][A-ZÀ-Ý\s]{6,})\s*\n)/g)
      .map((m) => m.trim()).filter(Boolean);
  }
  if (morceaux.length <= 1) {
    // En dernier recours, découpage par volume
    morceaux = [];
    const paragraphes = brut.split(/\n{2,}/);
    let courante = "";
    for (const paragraphe of paragraphes) {
      if (courante.length + paragraphe.length > parPage && courante) {
        morceaux.push(courante.trim());
        courante = "";
      }
      courante += `${paragraphe}\n\n`;
    }
    if (courante.trim()) morceaux.push(courante.trim());
  }

  return morceaux.map((morceau, index) => {
    const lignes = morceau.split("\n");
    const titre = lignes[0].length <= 80 ? lignes[0].trim() : `Page ${index + 1}`;
    return { titre, corps: morceau };
  });
}

function echapper(texte) {
  return String(texte).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

/**
 * Verse un document converti dans un cahier.
 * @param {object} options { cahierId, document, fichier, pagesVoulues, surProgression }
 */
export async function verserDansCahier({ cahierId, document: doc, fichier, pagesVoulues, surProgression }) {
  const creees = [];

  if (doc.kind === "pdf" || fichier?.type === "application/pdf") {
    const images = await pdfEnImages(fichier, { pagesVoulues, surProgression });
    for (let i = 0; i < images.length; i++) {
      creees.push(await depotPages.creer(cahierId, {
        title: `${doc.title} — page ${pagesVoulues?.[i] || i + 1}`,
        body: "",
        drawing: { image: images[i], legende: doc.title },
        origin: "document", origin_ref: doc.id,
        created_by: etat.utilisateur?.id
      }));
    }
    return creees;
  }

  if (doc.kind === "image") {
    const source = await lireCommeDataUrl(fichier);
    creees.push(await depotPages.creer(cahierId, {
      title: doc.title,
      body: "",
      drawing: { image: source, legende: doc.title },
      origin: "document", origin_ref: doc.id,
      created_by: etat.utilisateur?.id
    }));
    return creees;
  }

  const texte = await fichier.text();
  const morceaux = texteEnPages(texte);
  for (const morceau of morceaux) {
    creees.push(await depotPages.creer(cahierId, {
      title: morceau.titre,
      body: morceau.corps.split("\n").map((l) => `<p>${echapper(l)}</p>`).join(""),
      origin: "document", origin_ref: doc.id,
      created_by: etat.utilisateur?.id
    }));
    surProgression?.(creees.length, morceaux.length);
  }
  return creees;
}

function lireCommeDataUrl(fichier) {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resoudre(lecteur.result);
    lecteur.onerror = () => rejeter(new Error("Lecture du fichier impossible"));
    lecteur.readAsDataURL(fichier);
  });
}
