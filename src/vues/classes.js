/* ---------------------------------------------------------------------------
 * Mes classes — rejoindre, créer, parcourir.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import { classes as depotClasses, membres, sessions } from "../data/index.js";
import { entete, carteClasse, blocVide } from "../ui/fragments.js";
import { formulaire } from "../ui/modal.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";
import { rafraichirClasses } from "../core/session.js";
import { peut, P } from "../core/permissions.js";
import { normaliserCode } from "../core/util.js";

const TEINTES = [
  { valeur: "olive", libelle: "Olive" }, { valeur: "laiton", libelle: "Laiton" },
  { valeur: "ardoise", libelle: "Ardoise" }, { valeur: "oxblood", libelle: "Bordeaux" },
  { valeur: "pourpre", libelle: "Pourpre" }, { valeur: "encre", libelle: "Encre" }
];

export default async function vueClasses() {
  const grille = el("div.grille.grille--2");
  const archivees = el("div.grille.grille--2");
  const sectionArchives = el("div", { style: { marginTop: "var(--e-6)" } },
    el("h3", { style: { marginBottom: "var(--e-3)" } }, "Archivées"),
    archivees
  );

  const noeud = el("div.page",
    entete(L("Classes"), `Mes ${L("classes")}`,
      `Les ${L("classes")} auxquelles vous participez, comme ${L("eleve")} ou comme ${L("professeur")}.`,
      [
        el("button.btn", { onclick: rejoindre }, icone("entree", 15), "Rejoindre avec un code"),
        peut(P.CREER_CLASSE)
          ? el("button.btn.btn--primaire", { onclick: creer }, icone("plus", 15), `Créer une ${L("classe")}`)
          : null
      ]
    ),
    grille,
    sectionArchives
  );

  async function peindre() {
    const liste = await rafraichirClasses();
    const actives = liste.filter((c) => !c.archived);
    const anciennes = liste.filter((c) => c.archived);

    const infos = new Map();
    await Promise.all(actives.map(async (classe) => {
      const [equipe, session] = await Promise.all([
        membres.liste(classe.id).catch(() => []),
        sessions.enCours(classe.id).catch(() => null)
      ]);
      infos.set(classe.id, {
        membres: equipe.filter((m) => m.status === "active" && m.role === "student").length,
        enDirect: Boolean(session)
      });
    }));

    render(grille, actives.length
      ? actives.map((c) => carteClasse(c, infos.get(c.id) || {}))
      : blocVide(
          `Aucune ${L("classe")}`,
          `Demandez son code au ${L("professeur")} pour rejoindre votre première ${L("classe")}.`,
          { libelle: "Rejoindre avec un code", action: rejoindre }
        ));

    sectionArchives.hidden = !anciennes.length;
    render(archivees, anciennes.map((c) => carteClasse(c, { code: false })));
  }

  async function rejoindre() {
    const sortie = await formulaire({
      titre: `Rejoindre une ${L("classe")}`,
      note: `Le ${L("professeur")} annonce un code au début du cours.`,
      champs: [{ cle: "code", label: "Code de classe", placeholder: "K7F-29A", requis: true }],
      libelle: "Rejoindre"
    });
    if (!sortie) return;
    try {
      const resultat = await depotClasses.rejoindre(normaliserCode(sortie.code));
      await peindre();
      if (resultat.member_status === "pending") {
        succes("Demande envoyée", "Votre inscription doit être validée.");
      } else {
        succes("Classe rejointe", resultat.class_name);
        aller(`/classe/${resultat.class_id}`);
      }
    } catch (err) {
      erreur("Impossible de rejoindre", messageErreur(err));
    }
  }

  async function creer() {
    const sortie = await formulaire({
      titre: `Créer une ${L("classe")}`,
      champs: [
        { cle: "name", label: "Nom", placeholder: "Certification juridique I", requis: true },
        { cle: "description", label: "Description", type: "textarea", placeholder: "Objet et déroulé de la formation." },
        { cle: "subject", label: "Matière", placeholder: "Droit pénal" },
        { cle: "level", label: "Niveau", placeholder: "Élèves avocats" },
        { cle: "color", label: "Couleur", type: "select", valeur: "olive", options: TEINTES },
        { cle: "require_approval", label: "Valider manuellement chaque inscription", type: "checkbox" }
      ],
      libelle: "Créer"
    });
    if (!sortie) return;
    try {
      const classe = await depotClasses.creerAvecCahier({
        name: sortie.name, description: sortie.description || null,
        subject: sortie.subject || null, level: sortie.level || null,
        color: sortie.color, icon: "balance", owner_id: etat.utilisateur.id,
        locked: false, join_open: true, require_approval: Boolean(sortie.require_approval),
        archived: false, settings: {}
      }, etat.utilisateur.id);
      await peindre();
      succes("Classe créée", `Code : ${classe.code}`);
      aller(`/classe/${classe.id}`);
    } catch (err) {
      erreur("Création impossible", messageErreur(err));
    }
  }

  await peindre();
  return { noeud, titre: `Mes ${L("classes")}` };
}
