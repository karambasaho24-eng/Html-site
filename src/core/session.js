/* ---------------------------------------------------------------------------
 * Cycle de vie de la session utilisateur : connexion, profil, permissions.
 * ------------------------------------------------------------------------- */
import { auth, profils, rbac, classes, membres, notifications } from "../data/index.js";
import { definir, etat } from "./store.js";
import { emettre } from "./bus.js";
import { local } from "./util.js";

/** Charge (ou recharge) tout ce qui dépend de l'utilisateur connecté. */
export async function chargerSession() {
  const session = await auth.session();
  const utilisateur = session?.user || null;

  if (!utilisateur) {
    definir({
      utilisateur: null, profil: null, permissions: new Set(),
      classes: [], notifications: [], classeActive: null, membreActif: null
    });
    return null;
  }

  const profil = await profils.assurer(utilisateur);
  const permissions = new Set(await rbac.pourRole(profil.role_key));

  definir({ utilisateur, profil, permissions });

  // Préférences d'interface stockées sur le profil
  const prefs = profil.preferences || {};
  if (prefs.densite) definir({ densite: prefs.densite });
  if (prefs.theme) definir({ theme: prefs.theme });

  await rafraichirClasses();
  await rafraichirNotifications();

  emettre("session:prete", { utilisateur, profil });
  return utilisateur;
}

export async function rafraichirClasses() {
  if (!etat.utilisateur) return [];
  const liste = await classes.mesClasses(etat.utilisateur.id);
  definir({ classes: liste });
  return liste;
}

export async function rafraichirNotifications() {
  if (!etat.utilisateur) return [];
  try {
    const liste = await notifications.liste(etat.utilisateur.id);
    definir({ notifications: liste });
    return liste;
  } catch {
    return [];
  }
}

export function notificationsNonLues() {
  return etat.notifications.filter((n) => !n.read_at).length;
}

/** Sélectionne la classe courante et recharge le membre associé. */
export async function activerClasse(classeId) {
  if (!classeId) {
    definir({ classeActive: null, membreActif: null });
    return null;
  }
  const classe = await classes.lire(classeId);
  if (!classe) {
    definir({ classeActive: null, membreActif: null });
    return null;
  }
  const membre = await membres.pour(classeId, etat.utilisateur.id);
  definir({ classeActive: classe, membreActif: membre });
  local.ecrire("ojm.derniereClasse", classeId);
  return classe;
}

export async function deconnecter() {
  await auth.deconnecter();
  definir({
    utilisateur: null, profil: null, permissions: new Set(),
    classes: [], notifications: [], classeActive: null,
    membreActif: null, sessionActive: null, suitProfesseur: false, modeExamen: false
  });
  emettre("session:fermee");
}

/** Enregistre une préférence utilisateur (persistée sur le profil). */
export async function majPreference(cle, valeur) {
  if (!etat.profil) return;
  const prefs = { ...(etat.profil.preferences || {}), [cle]: valeur };
  definir({ profil: { ...etat.profil, preferences: prefs } });
  local.ecrire("ojm.prefs", prefs);
  try { await profils.majorer(etat.profil.id, { preferences: prefs }); }
  catch (err) { console.warn("[session] préférence non enregistrée", err); }
}
