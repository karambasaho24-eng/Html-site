/* ---------------------------------------------------------------------------
 * Les prix. Le paiement se fait en jeu : la monnaie est celle du jeu (une unité
 * libre, définie par le PDG ; vide tant qu'il n'en a pas choisi), un entier sans
 * centimes. Les monnaies réelles, si l'on en choisit une, se comptent en
 * centimes.
 * ------------------------------------------------------------------------- */
const MONNAIES_REELLES = new Set(["EUR", "USD", "GBP", "CAD", "CHF"]);

export const monnaieReelle = (devise) => MONNAIES_REELLES.has(devise);

/** « 50 galons », « 50 » (sans unité) ou « 2,99 € ». */
export function formaterPrix(montant, devise = "") {
  if (monnaieReelle(devise)) {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: devise }).format(montant / 100);
  }
  return `${Number(montant).toLocaleString("fr-FR")} ${devise || ""}`.trim();
}

/** Ce qu'on met dans un champ de saisie pour un montant donné. */
export function montantEnTexte(montant, devise = "") {
  return monnaieReelle(devise) ? String(montant / 100).replace(".", ",") : String(montant);
}

/** Lit un champ de saisie : renvoie le montant entier (unités ou centimes), ou null s'il est invalide. */
export function lireMontant(texte, devise = "") {
  const brut = String(texte).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(brut)) return null;
  const nombre = parseFloat(brut);
  const montant = monnaieReelle(devise) ? Math.round(nombre * 100) : Math.round(nombre);
  return Number.isInteger(montant) && montant > 0 ? montant : null;
}
