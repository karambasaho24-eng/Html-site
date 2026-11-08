/* ---------------------------------------------------------------------------
 * Le nom RP : l'identité publique du joueur, partout sur le site.
 *
 * Choisi obligatoirement au premier accès (vues/identite.js), puis modifiable
 * par la personne elle-même quand son personnage change (0049). Le compte, ses
 * cahiers et ses droits ne bougent pas ; les signatures déjà apposées gardent
 * le nom d'alors. Le pseudo Discord ne sert qu'à se connecter.
 * ------------------------------------------------------------------------- */
import { etat, definir } from "../core/store.js";
import { profils } from "../data/index.js";
import { formulaire, confirmer } from "../ui/modal.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";

/** Enregistre le nom ; rend true en cas de succès. */
export async function enregistrerNomRP(brut) {
  const nom = String(brut || "").replace(/\s+/g, " ").trim();
  try {
    await profils.choisirNomRP(nom);
    const maj = await profils.lire(etat.profil.id);
    if (maj) definir({ profil: maj });
    succes("Nom RP enregistré", maj?.display_name || nom);
    return true;
  } catch (err) {
    erreur("Nom refusé", messageErreur(err));
    return false;
  }
}

/** Depuis le profil : changer de nom, sans demande à l'administration. */
export async function changerNomRP() {
  const sortie = await formulaire({
    titre: "Modifier mon nom RP",
    note: "Votre compte, vos cahiers et vos papiers restent les mêmes. "
      + "Les documents déjà signés gardent le nom sous lequel ils ont été signés.",
    champs: [{ cle: "nom", label: "Nom du personnage", valeur: etat.profil?.display_name || "", requis: true }],
    libelle: "Continuer"
  });
  if (!sortie) return false;
  const ok = await confirmer({
    titre: "Changer de nom",
    message: `Votre personnage s'appellera désormais « ${String(sortie.nom).trim()} ».`,
    libelle: "Changer"
  });
  return ok ? enregistrerNomRP(sortie.nom) : false;
}
