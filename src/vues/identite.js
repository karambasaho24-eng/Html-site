/* ---------------------------------------------------------------------------
 * Première étape, obligatoire : le nom du personnage RP.
 * Le routeur y ramène tant que le nom n'est pas choisi (nouveau compte, compte
 * existant sans nom RP, personnage déclaré mort). Jamais le pseudo Discord.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { aller } from "../core/router.js";
import { enregistrerNomRP } from "../features/nom-rp.js";

export default async function vueIdentite() {
  const champ = el("input.identite__champ", {
    name: "nom_rp", required: true, minLength: 2, maxLength: 60, autocomplete: "off",
    placeholder: "ex. Arthur Valmont", "aria-label": "Nom de votre personnage"
  });
  const bouton = el("button.btn.btn--primaire.btn--grand", { type: "submit" }, icone("coche", 16), "C'est mon personnage");

  const noeud = el("div.identite",
    el("form.identite__carte.panneau", {
      onsubmit: async (e) => {
        e.preventDefault();
        bouton.disabled = true;
        if (await enregistrerNomRP(champ.value)) aller("/", true);
        bouton.disabled = false;
      }
    },
      el("span.identite__sceau", icone("profil", 28)),
      el("h1.identite__titre", "Choisissez le nom de votre personnage RP"),
      el("p.doux", "C'est ce nom que les autres joueurs verront partout : classes, remises, signatures. "
        + "Votre pseudo Discord ne sert qu'à vous connecter."),
      champ,
      el("p.petit.faible", "Prénom et nom, 2 à 60 caractères. Vous pourrez le changer plus tard dans votre profil."),
      bouton));
  setTimeout(() => champ.focus(), 50);
  return { noeud, titre: "Votre personnage" };
}
