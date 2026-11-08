/* ---------------------------------------------------------------------------
 * Le nom RP : chacun choisit celui de son personnage, une seule fois.
 *
 * Il remplace alors le pseudo Discord partout sur le site. L'administration
 * peut le modifier à tout moment ; si le personnage meurt, elle le déclare et
 * la personne peut en choisir un nouveau (voir 0043 et 0044).
 * ------------------------------------------------------------------------- */
import { etat, definir } from "../core/store.js";
import { profils } from "../data/index.js";
import { formulaire, confirmer } from "../ui/modal.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";

/** La personne a encore un choix de nom RP à faire. */
export const nomRPLibre = () => Boolean(etat.profil) && etat.profil.nom_rp_libre !== false;

/** Ouvre le choix. Rend true si le nom a été enregistré. */
export async function choisirNomRP() {
  const sortie = await formulaire({
    titre: "Le nom de votre personnage",
    note: "Ce nom s'affichera partout sur le site à la place de votre pseudo Discord. "
      + "Vous ne pouvez le choisir qu'une fois : il ne changera que si votre personnage meurt, "
      + "ou si l'administration le modifie.",
    champs: [{ cle: "nom", label: "Nom RP (prénom et nom)", valeur: "", requis: true }],
    libelle: "Choisir"
  });
  if (!sortie) return false;
  const nom = String(sortie.nom || "").replace(/\s+/g, " ").trim();
  const ok = await confirmer({
    titre: "Confirmer ce nom",
    message: `Votre personnage s'appellera « ${nom} ». Vous ne pourrez plus le changer vous-même.`,
    libelle: "C'est bien lui"
  });
  if (!ok) return false;
  try {
    await profils.choisirNomRP(nom);
    const maj = await profils.lire(etat.profil.id);
    if (maj) definir({ profil: maj });
    succes("Nom enregistré", maj?.display_name || nom);
    return true;
  } catch (err) {
    erreur("Choix impossible", messageErreur(err));
    return false;
  }
}
