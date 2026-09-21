/* ---------------------------------------------------------------------------
 * Bus d'événements applicatif. Sert de colonne vertébrale entre la couche
 * temps réel, les vues et les notifications.
 * ------------------------------------------------------------------------- */

const abonnes = new Map();

export function ecouter(evenement, rappel) {
  if (!abonnes.has(evenement)) abonnes.set(evenement, new Set());
  abonnes.get(evenement).add(rappel);
  return () => abonnes.get(evenement)?.delete(rappel);
}

export function emettre(evenement, charge) {
  for (const rappel of abonnes.get(evenement) || []) {
    try { rappel(charge); }
    catch (err) { console.error(`[bus] ${evenement}`, err); }
  }
  for (const rappel of abonnes.get("*") || []) {
    try { rappel({ evenement, charge }); }
    catch (err) { console.error("[bus] *", err); }
  }
}

export function oublier(evenement) {
  abonnes.delete(evenement);
}
