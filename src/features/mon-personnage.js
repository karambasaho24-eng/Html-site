/* ---------------------------------------------------------------------------
 * Mon personnage : choisir sa tenue, sa coupe, la couleur de ses cheveux,
 * son teint — et se voir, en 3D, tourner pendant qu'on choisit.
 *
 * L'apparence est rangée dans les préférences du profil (rien à créer en
 * base) et voyage avec la présence en séance : les autres voient la tenue
 * qu'on a choisie, à sa place, dans la salle.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { emettre } from "../core/bus.js";
import { majPreference, rafraichirClasses } from "../core/session.js";
import { ouvrirModale } from "../ui/modal.js";
import { succes } from "../ui/toast.js";
import { NOMS_TENUES, libelleTenue, ficheTenue } from "./tenues.js";
import { COIFFURES, COULEURS_CHEVEUX, TEINTS } from "./coiffures.js";
import { creerClasse3D, webglDisponible } from "./classe-3d.js";

/** Mon apparence, telle qu'enregistrée (vide : on la tire de mon nom). */
export const monAvatar = () => ({ ...(etat.profil?.preferences?.avatar || {}) });

const auHasard = (liste) => liste[Math.floor(Math.random() * liste.length)];

export async function ouvrirApparence({ bienvenue = false } = {}) {
  // Les tenues de rigueur ont pu changer depuis la connexion.
  await rafraichirClasses().catch(() => {});
  let avatar = monAvatar();
  let apercu = null;
  const scene = el("div.apparence__apercu");
  const choix = el("div.apparence__choix");

  function peindreApercu() {
    apercu?.maj({ mode: "portrait", eleves: [{ id: `apercu:${etat.utilisateur?.id || ""}`, nom: "", avatar }] });
  }

  function groupe(titre, contenu) {
    return el("section.apparence__groupe", el("h3.apparence__titre", titre), contenu);
  }

  function peindreChoix() {
    const tenue = (nom) => {
      const f = ficheTenue(nom) || {};
      const teintes = [f.veste || f.pull || f.chemise, f.gilet || f.chemise, f.pantalon].filter(Boolean);
      return el("button.apparence__tenue", {
        type: "button", "aria-pressed": String(avatar.tenue === nom), title: libelleTenue(nom),
        onclick: () => { avatar.tenue = nom; maj(); }
      },
        el("span.apparence__nuancier", teintes.map((c) => el("span", { style: { background: c } }))),
        el("span", libelleTenue(nom)));
    };
    const costumes = NOMS_TENUES.filter((n) => (ficheTenue(n)?.famille || "costume") === "costume");
    const uniformes = NOMS_TENUES.filter((n) => ficheTenue(n)?.famille === "uniforme");
    const pastille = (liste, cle) => el("div.apparence__pastilles", liste.map((c) => el("button.apparence__pastille", {
      type: "button", title: c.libelle, "aria-label": c.libelle, "aria-pressed": String(avatar[cle] === c.cle),
      style: { background: c.cle }, onclick: () => { avatar[cle] = c.cle; maj(); }
    })));

    // Les classes qui imposent une tenue : on y apparaît dans celle-là.
    const rigueur = (etat.classes || []).filter((c) => c?.settings?.tenue && !c.archived);
    render(choix,
      rigueur.length ? el("p.apparence__rigueur", icone("drapeau", 13),
        el("span", "Tenue de rigueur : ",
          rigueur.map((c, i) => [i ? " · " : "", el("b", c.name), ` : ${libelleTenue(c.settings.tenue)}`]),
          ". Vous y apparaîtrez ainsi, avec votre coupe et votre teint.")) : null,
      groupe("Tenue", el("div",
        el("p.apparence__sous-titre", "Costumes"),
        el("div.apparence__tenues", costumes.map(tenue)),
        el("p.apparence__sous-titre", "Uniformes"),
        el("div.apparence__tenues", uniformes.map(tenue)))),
      groupe("Coupe", el("div.apparence__coupes", COIFFURES.map((c) => el("button.apparence__coupe", {
        type: "button", "aria-pressed": String(avatar.coiffure === c.cle),
        onclick: () => { avatar.coiffure = c.cle; maj(); }
      }, c.libelle)))),
      groupe("Cheveux", pastille(COULEURS_CHEVEUX, "cheveux")),
      groupe("Teint", pastille(TEINTS, "peau")));
  }

  function maj() { peindreChoix(); peindreApercu(); }

  const enregistre = await ouvrirModale({
    titre: bienvenue ? `Bienvenue, ${etat.profil?.display_name || ""} — habillez votre personnage` : "Mon personnage",
    large: true,
    corps: () => {
      peindreChoix();
      // L'aperçu se monte une fois la fenêtre posée : il lui faut sa taille.
      setTimeout(async () => {
        if (!webglDisponible()) { render(scene, el("p.petit.faible", "Aperçu 3D indisponible sur cet appareil.")); return; }
        try { apercu = await creerClasse3D({ hote: scene }); peindreApercu(); }
        catch { render(scene, el("p.petit.faible", "Aperçu 3D indisponible.")); }
      }, 30);
      return el("div.apparence",
        el("div.apparence__gauche", scene,
          el("p.apparence__aide", icone("main", 12), " Glissez pour le faire tourner.")),
        choix);
    },
    surFermeture: () => apercu?.detruire(),
    actions: [
      { libelle: "Au hasard", action: () => {
        avatar = {
          tenue: auHasard(NOMS_TENUES), coiffure: auHasard(COIFFURES).cle,
          cheveux: auHasard(COULEURS_CHEVEUX).cle, peau: auHasard(TEINTS).cle
        };
        maj();
        return false;
      } },
      { libelle: "Annuler", valeur: false },
      { libelle: "Enregistrer", variante: "primaire", action: async () => {
        await majPreference("avatar", avatar);
        emettre("avatar:change", avatar);
        succes("Personnage enregistré", "Les autres le verront ainsi en séance.");
        return true;
      } }
    ]
  });
  return enregistre;
}
