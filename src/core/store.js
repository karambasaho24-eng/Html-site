/* ---------------------------------------------------------------------------
 * État applicatif. Un objet unique, des abonnements par clé. Suffisant pour
 * une application de cette taille et bien plus facile à suivre qu'un framework.
 * ------------------------------------------------------------------------- */
import { emettre } from "./bus.js";


export const etat = {
  // Session utilisateur
  utilisateur: null,       // { id, email }
  profil: null,            // ligne profiles
  permissions: new Set(),

  // Contexte courant
  classeActive: null,
  sessionActive: null,
  membreActif: null,       // ligne class_members pour la classe active

  // Données en cache
  classes: [],
  cahiers: [],
  notifications: [],
  // Encre, droits de cahiers : { exempte, encre, cahiers, regles, commandes_ouvertes, pages_max } (lu auprès de la base)
  commerce: null,

  // Interface
  route: { nom: "accueil", params: {} },
  reseau: "ok",            // ok | rompu | reprise | local
  modeExamen: false,
  suitProfesseur: false,
  flottant: false,
  flottantMode: "cahier",   // cahier | tableau : ce que la petite fenêtre montre (et donc sa taille)
  pret: false
};

const observateurs = new Map();

/** Abonnement à une ou plusieurs clés de l'état. */
export function observer(cles, rappel) {
  const liste = Array.isArray(cles) ? cles : [cles];
  for (const cle of liste) {
    if (!observateurs.has(cle)) observateurs.set(cle, new Set());
    observateurs.get(cle).add(rappel);
  }
  return () => {
    for (const cle of liste) observateurs.get(cle)?.delete(rappel);
  };
}

/** Écrit dans l'état et prévient les observateurs des clés modifiées. */
export function definir(partiel) {
  const changees = [];
  for (const [cle, valeur] of Object.entries(partiel)) {
    if (etat[cle] === valeur) continue;
    etat[cle] = valeur;
    changees.push(cle);
  }
  for (const cle of changees) {
    for (const rappel of observateurs.get(cle) || []) {
      try { rappel(etat[cle], cle); }
      catch (err) { console.error(`[store] ${cle}`, err); }
    }
  }
  if (changees.length) emettre("etat:change", changees);
  return changees;
}

/** Force la notification d'une clé dont le contenu a muté sur place. */
export function toucher(cle) {
  for (const rappel of observateurs.get(cle) || []) {
    try { rappel(etat[cle], cle); }
    catch (err) { console.error(`[store] ${cle}`, err); }
  }
  emettre("etat:change", [cle]);
}

export function estConnecte() {
  return Boolean(etat.utilisateur);
}
