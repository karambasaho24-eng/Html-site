/* ---------------------------------------------------------------------------
 * État de la connexion. Le temps réel exige une liaison ; l'interface, elle,
 * doit rester utilisable et ne jamais perdre une saisie en cours.
 * ------------------------------------------------------------------------- */
import { definir, etat } from "./store.js";
import { emettre } from "./bus.js";
import { toast } from "../ui/toast.js";

let fermerToast = null;
let etaitRompu = false;

export function surveillerReseau() {
  window.addEventListener("online", () => marquer("ok"));
  window.addEventListener("offline", () => marquer("rompu"));
  if (!navigator.onLine) marquer("rompu");
}

/** etat : "ok" | "rompu" | "reprise" | "local" */
export function marquer(nouvelEtat) {
  if (etat.reseau === nouvelEtat) return;
  definir({ reseau: nouvelEtat });
  emettre("reseau:change", nouvelEtat);

  if (nouvelEtat === "rompu") {
    etaitRompu = true;
    fermerToast?.();
    fermerToast = toast("Connexion interrompue", {
      corps: "Vos modifications sont conservées localement et seront envoyées au retour du réseau.",
      type: "alerte", duree: 0
    });
  } else if (nouvelEtat === "reprise") {
    fermerToast?.();
    fermerToast = toast("Reconnexion…", { type: "attn", duree: 0 });
  } else if (nouvelEtat === "ok") {
    fermerToast?.();
    fermerToast = null;
    if (etaitRompu) {
      etaitRompu = false;
      toast("Connexion rétablie", { type: "ok" });
      emettre("reseau:retabli");
    }
  }
}

/** Relance une opération réseau avec repli exponentiel. */
export async function avecReprise(operation, { tentatives = 4, delai = 600 } = {}) {
  let derniere;
  for (let i = 0; i < tentatives; i++) {
    try {
      const sortie = await operation();
      if (etat.reseau !== "ok" && etat.reseau !== "local") marquer("ok");
      return sortie;
    } catch (err) {
      derniere = err;
      const reseauEnCause = /fetch|network|timeout|Failed to fetch/i.test(err?.message || "");
      if (!reseauEnCause || i === tentatives - 1) throw err;
      marquer("reprise");
      await new Promise((r) => setTimeout(r, delai * 2 ** i));
    }
  }
  throw derniere;
}

/* --- File d'attente des écritures différées -------------------------------- */
const CLE_FILE = "ojm.file";

export function fileEnAttente() {
  try { return JSON.parse(localStorage.getItem(CLE_FILE) || "[]"); }
  catch { return []; }
}

export function mettreEnFile(entree) {
  const file = fileEnAttente();
  file.push({ ...entree, horodatage: Date.now() });
  try { localStorage.setItem(CLE_FILE, JSON.stringify(file.slice(-200))); }
  catch { /* quota */ }
}

export function viderFile() {
  localStorage.removeItem(CLE_FILE);
}

/**
 * Rejoue les écritures mises de côté pendant une coupure.
 * `executeur(entree)` doit renvoyer une promesse ; une entrée qui échoue à
 * nouveau reste en file.
 */
export async function rejouerFile(executeur) {
  const file = fileEnAttente();
  if (!file.length) return 0;
  const restantes = [];
  let rejouees = 0;
  for (const entree of file) {
    try { await executeur(entree); rejouees++; }
    catch { restantes.push(entree); }
  }
  try { localStorage.setItem(CLE_FILE, JSON.stringify(restantes)); }
  catch { /* quota */ }
  return rejouees;
}
