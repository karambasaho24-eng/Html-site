/* ---------------------------------------------------------------------------
 * Réglages d'affichage : thème et raccourcis.
 * ------------------------------------------------------------------------- */
import { etat } from "./store.js";
import { emettre } from "./bus.js";
import { local } from "./util.js";
import { stockageLocal } from "./stockage.js";

/** Un seul thème : le verre de Whitelist Hub. Sa couleur se règle dans Administration › Apparence. */
export function restaurerInterface() {
  document.documentElement.dataset.theme = "nuit";
}

/* ===========================================================================
   Raccourcis clavier — configurables
   ========================================================================= */
export const RACCOURCIS_DEFAUT = {
  "cahier.ouvrir":     "g c",
  "cahiers.liste":     "g b",
  "classes.liste":     "g k",
  "tableau.ouvrir":    "g t",
  "recherche.ouvrir":  "/",
  "fenetre.flottante": "mod+shift+f",
  "page.suivante":     "alt+ArrowRight",
  "page.precedente":   "alt+ArrowLeft",
  "page.nouvelle":     "mod+Enter",
  "aide.raccourcis":   "?"
};

const CLE = "ojm.raccourcis";
let table = { ...RACCOURCIS_DEFAUT, ...(local.lire(CLE, {}) || {}) };
const actions = new Map();
let tampon = [];
let expiration = null;

export function raccourcis() { return { ...table }; }

export function definirRaccourci(action, combinaison) {
  table = { ...table, [action]: combinaison };
  local.ecrire(CLE, table);
}

export function reinitialiserRaccourcis() {
  table = { ...RACCOURCIS_DEFAUT };
  local.retirer(CLE);
}

export function enregistrerAction(nom, rappel) {
  actions.set(nom, rappel);
  return () => actions.delete(nom);
}

function decrire(evenement) {
  const parties = [];
  if (evenement.ctrlKey || evenement.metaKey) parties.push("mod");
  if (evenement.altKey) parties.push("alt");
  if (evenement.shiftKey && evenement.key.length > 1) parties.push("shift");
  parties.push(evenement.key);
  return parties.join("+");
}

function saisieEnCours(cible) {
  if (!cible) return false;
  if (cible.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName);
}

export function activerRaccourcis() {
  window.addEventListener("keydown", (evenement) => {
    if (etat.modeExamen && !evenement.key.startsWith("Arrow")) return;

    const combinaison = decrire(evenement);
    const dansUnChamp = saisieEnCours(evenement.target);

    // Les combinaisons avec modificateur restent actives dans les champs
    if (dansUnChamp && !evenement.ctrlKey && !evenement.metaKey && !evenement.altKey) return;

    // Séquences façon « g c »
    if (!evenement.ctrlKey && !evenement.metaKey && !evenement.altKey && evenement.key.length === 1) {
      tampon.push(evenement.key);
      clearTimeout(expiration);
      expiration = setTimeout(() => { tampon = []; }, 900);
      const sequence = tampon.join(" ");
      const trouvee = Object.entries(table).find(([, c]) => c === sequence);
      if (trouvee) {
        evenement.preventDefault();
        tampon = [];
        actions.get(trouvee[0])?.();
        return;
      }
      if (tampon.length > 2) tampon = [];
    }

    const directe = Object.entries(table).find(([, c]) => c === combinaison);
    if (directe && actions.has(directe[0])) {
      evenement.preventDefault();
      actions.get(directe[0])();
    }
  });
}

export function libelleCombinaison(combinaison) {
  const mac = navigator.platform?.toLowerCase().includes("mac");
  return String(combinaison)
    .replace("mod", mac ? "⌘" : "Ctrl")
    .replace("alt", mac ? "⌥" : "Alt")
    .replace("shift", "Maj")
    .replace("ArrowRight", "→")
    .replace("ArrowLeft", "←")
    .replace("Enter", "Entrée");
}
