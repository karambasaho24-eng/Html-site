/* ---------------------------------------------------------------------------
 * Configuration. Trois sources, par ordre de priorité :
 *   1. les réglages saisis dans l'application (localStorage)
 *   2. window.OJM_CONFIG (config.js, versionné)
 *   3. les valeurs par défaut
 * ------------------------------------------------------------------------- */
import { local } from "./util.js";

const CLE = "ojm.config";
const DEFAUTS = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  academyName: "Classe Parallèle",
  academyMotto: "L'école qui tourne à côté du jeu",
  lexique: {}
};

const fichier = globalThis.OJM_CONFIG || {};
const surcharge = local.lire(CLE, {}) || {};

export const config = { ...DEFAUTS, ...fichier, ...surcharge };

/** Vrai si un projet Supabase est renseigné. */
export function estRelie() {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}

/** Enregistre une surcharge locale (écran Réglages). */
export function definirConfig(partiel) {
  const fusion = { ...(local.lire(CLE, {}) || {}), ...partiel };
  local.ecrire(CLE, fusion);
  Object.assign(config, partiel);
}

export function reinitialiserConfig() {
  local.retirer(CLE);
}
