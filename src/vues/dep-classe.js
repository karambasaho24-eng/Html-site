/* ---------------------------------------------------------------------------
 * Département « Classe ».
 *
 * Une seule question : où dois-je être ? D'abord ce qui se passe maintenant
 * (une séance, une réunion ouverte), puis comment rejoindre une classe avec
 * le code donné en jeu, puis mes classes. Les outils (exercices, archives,
 * encadrement) viennent en dernier : on s'en sert moins souvent.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat, observer } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import { sessions, classes as depotClasses } from "../data/index.js";
import { normaliserCode } from "../core/util.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";
import { rafraichirClasses } from "../core/session.js";
import { peut, P, encadreUneClasse } from "../core/permissions.js";
import { DEPARTEMENTS } from "../core/departements.js";
import { enteteDepartement, grandeAction, sectionDep, astuceFlottant } from "../ui/departement.js";

const DEP = DEPARTEMENTS.find((d) => d.cle === "classe");
const MODES = { cours: "Cours", reunion: "Réunion", distribution: "Distribution" };

export default async function vueDepClasse() {
  const zoneDirect = el("div.dep__liste");
  const zoneClasses = el("div.dep__grille");

  const noeud = el("div.page.dep", { dataset: { departement: "classe" } },
    enteteDepartement(DEP, "Vos classes, vos séances et vos réunions. Commencez par ce qui est en cours."),
    astuceFlottant(),
    sectionDep("En ce moment", zoneDirect),
    sectionDep("Rejoindre une classe", rejoindre()),
    sectionDep(`Mes ${L("classes")}`, zoneClasses, {
      action: el("a.btn.btn--fantome.btn--petit", { href: "#/classes" }, "Tout gérer")
    }),
    sectionDep("Outils", el("div.dep__grille",
      grandeAction({ icone: "exercices", titre: L("Exercices"), aide: "Ceux à faire, et ceux déjà rendus", href: "#/exercices" }),
      grandeAction({ icone: "archives", titre: "Archives", aide: "Relire une séance passée", href: "#/archives" }),
      encadreUneClasse()
        ? grandeAction({ icone: "grille", titre: "Encadrement", aide: "Vue d'ensemble de vos classes", href: "#/professeur" }) : null,
      peut(P.CREER_CLASSE)
        ? grandeAction({ icone: "plus", titre: `Créer une ${L("classe")}`, aide: "Ouvrir un nouvel espace", href: "#/classes" }) : null))
  );

  async function charger() {
    const ouvertes = etat.classes.filter((c) => !c.archived);
    const direct = [];
    await Promise.all(ouvertes.map(async (classe) => {
      const session = await sessions.enCours(classe.id).catch(() => null);
      if (session) direct.push({ classe, session });
    }));

    render(zoneDirect, direct.length
      ? direct.map(({ classe, session }) => grandeAction({
          primaire: true, icone: session.mode === "reunion" ? "reunion" : "direct",
          titre: `${MODES[session.mode] || "Séance"} en cours · ${classe.name}`,
          aide: session.title ? `« ${session.title} » — entrez dans la salle` : "Entrez dans la salle",
          action: () => aller(`/classe/${classe.id}/salle`)
        }))
      : el("p.dep__calme", "Aucune séance ouverte pour l'instant. Quand votre responsable en ouvre une, elle apparaît ici."));

    render(zoneClasses, ouvertes.length
      ? ouvertes.map((c) => grandeAction({
          icone: "classe", titre: c.name,
          aide: [c.subject, c.level].filter(Boolean).join(" · ") || "Ouvrir l'espace",
          href: `#/classe/${c.id}`
        }))
      : el("p.dep__calme", "Vous n'êtes inscrit dans aucune classe. Demandez le code en jeu et tapez-le juste au-dessus."));
  }

  const lacher = observer("classes", charger);
  await charger();
  return { noeud, titre: "Classe", nettoyer: lacher };
}

/** Le code qu'on vous donne en jeu, et c'est tout. */
function rejoindre() {
  let champ, bouton;

  async function valider() {
    const code = normaliserCode(champ.value);
    if (code.length < 7) {
      erreur("Code incomplet", "Un code ressemble à K7F-29A.");
      champ.focus();
      return;
    }
    bouton.disabled = true;
    try {
      const sortie = await depotClasses.rejoindre(code);
      await rafraichirClasses();
      if (sortie.member_status === "pending") {
        succes("Demande envoyée", `Le ${L("professeur")} doit valider votre arrivée dans « ${sortie.class_name} ».`);
      } else {
        succes("Vous avez rejoint la classe", sortie.class_name);
        aller(`/classe/${sortie.class_id}`);
      }
      champ.value = "";
    } catch (err) {
      erreur("Impossible de rejoindre", messageErreur(err));
    } finally {
      bouton.disabled = false;
    }
  }

  return el("div.dep__rejoindre",
    champ = el("input.saisie.saisie--code", {
      placeholder: "K7F-29A", maxlength: 7, "aria-label": "Code de la classe",
      oninput: (e) => { e.target.value = normaliserCode(e.target.value); },
      onkeydown: (e) => { if (e.key === "Enter") valider(); }
    }),
    bouton = el("button.btn.btn--primaire", { type: "button", onclick: valider }, icone("entree", 15), "Rejoindre"),
    el("span.dep__aide", "Le code est annoncé en jeu par votre responsable."));
}
