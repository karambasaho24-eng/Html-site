/* ---------------------------------------------------------------------------
 * Accueil — « Mon espace ». Point d'entrée quotidien : rejoindre un cours,
 * reprendre un cahier, voir ce qui se passe dans ses classes.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat, definir } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import { cahiers, sessions, annonces, journal, classes as depotClasses } from "../data/index.js";
import { estEnseignant, peut, P } from "../core/permissions.js";
import { normaliserCode, depuis, heure, dateLongue, initiales } from "../core/util.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";
import { rafraichirClasses } from "../core/session.js";
import { carteClasse, vignetteCahier, blocVide } from "../ui/fragments.js";

export default async function vueAccueil() {
  const utilisateur = etat.utilisateur;

  const [mesCahiers, sessionsEnCours] = await Promise.all([
    cahiers.mesCahiers(utilisateur.id).catch(() => []),
    sessionsEnDirect()
  ]);
  definir({ cahiers: mesCahiers });

  const annoncesRecentes = await annoncesDesClasses();
  const historique = await journal.liste({ user_id: utilisateur.id }, 12).catch(() => []);

  const noeud = el("div.page",
    el("div.page__entete",
      el("div.page__titre",
        el("span.page__surtitre", dateLongue(Date.now())),
        el("h1", `Bonjour, ${etat.profil?.display_name || "élève"}`),
        el("span.page__sous", messageAccueil(sessionsEnCours.length))
      ),
      el("div.page__actions",
        estEnseignant() && peut(P.CREER_CLASSE)
          ? el("button.btn", { onclick: () => aller("/professeur") },
              icone("grille", 15), `Espace ${L("professeur")}`)
          : null,
        el("button.btn.btn--primaire", { onclick: () => aller("/cahiers") },
          icone("cahier", 15), `Ouvrir mes ${L("cahiers")}`)
      )
    ),

    sessionsEnCours.length ? blocSessionsEnDirect(sessionsEnCours) : null,

    el("div.colonnes",
      el("div.pile",
        blocRejoindre(),
        blocCahiers(mesCahiers),
        blocClasses()
      ),
      el("div.pile",
        blocAnnonces(annoncesRecentes),
        blocHistorique(historique)
      )
    )
  );

  return { noeud, titre: "Mon espace" };
}

/* --- Fragments -------------------------------------------------------------- */

function messageAccueil(enDirect) {
  if (enDirect === 1) return "Une session est en cours dans l'une de vos classes.";
  if (enDirect > 1) return `${enDirect} sessions sont en cours.`;
  return "Aucune session en direct pour le moment.";
}

async function sessionsEnDirect() {
  const sorties = [];
  for (const classe of etat.classes) {
    if (classe.archived) continue;
    try {
      const session = await sessions.enCours(classe.id);
      if (session) sorties.push({ classe, session });
    } catch { /* classe inaccessible */ }
  }
  return sorties;
}

async function annoncesDesClasses() {
  const ids = etat.classes.map((c) => c.id);
  if (!ids.length) return [];
  try {
    const liste = await annonces.liste({ class_id: ids }, 6);
    return liste.map((a) => ({ ...a, classe: etat.classes.find((c) => c.id === a.class_id) }));
  } catch { return []; }
}

function blocSessionsEnDirect(liste) {
  return el("div.pile", { style: { marginBottom: "var(--e-5)" } },
    liste.map(({ classe, session }) =>
      el("div.carte.carte--classe", { dataset: { teinte: classe.color } },
        el("div.ligne-flex.ligne-flex--entre.enrouler",
          el("div",
            el("div.ligne-flex", { style: { marginBottom: "2px" } },
              el("span.etiq.etiq--direct", "En direct"),
              el("span.carte__titre", classe.name)
            ),
            el("span.carte__meta",
              `${session.title} · commencée ${depuis(session.started_at)}`)
          ),
          el("button.btn.btn--primaire", {
            onclick: () => aller(`/classe/${classe.id}/salle`)
          }, icone("entree", 15), "Rejoindre la session")
        )
      )
    )
  );
}

function blocRejoindre() {
  let champ, bouton;

  async function rejoindre() {
    const code = normaliserCode(champ.value);
    if (code.length < 7) {
      erreur("Code incomplet", "Un code de classe ressemble à K7F-29A.");
      champ.focus();
      return;
    }
    bouton.disabled = true;
    try {
      const sortie = await depotClasses.rejoindre(code);
      await rafraichirClasses();
      if (sortie.member_status === "pending") {
        succes("Demande envoyée", `Le ${L("professeur")} doit valider votre inscription à « ${sortie.class_name} ».`);
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

  return el("div.panneau",
    el("div.panneau__entete",
      el("span.panneau__titre", `Rejoindre une ${L("classe")}`),
      icone("entree", 15)
    ),
    el("div.panneau__corps",
      el("p.petit.doux", { style: { marginBottom: "var(--e-3)" } },
        `Le ${L("professeur")} annonce un code en début de cours. Saisissez-le pour entrer dans la session.`),
      el("div.ligne-flex",
        champ = el("input.saisie.saisie--code", {
          placeholder: "K7F-29A", maxlength: 7, "aria-label": "Code de classe",
          oninput: (e) => { e.target.value = normaliserCode(e.target.value); },
          onkeydown: (e) => { if (e.key === "Enter") rejoindre(); }
        }),
        bouton = el("button.btn.btn--primaire.btn--grand", { onclick: rejoindre }, "Rejoindre")
      )
    )
  );
}

function blocCahiers(liste) {
  return el("div.panneau",
    el("div.panneau__entete",
      el("span.panneau__titre", `Mes ${L("cahiers")}`),
      el("a.petit", { href: "#/cahiers" }, "Tout voir")
    ),
    el("div.panneau__corps",
      liste.length
        ? el("div.grille.grille--2", liste.slice(0, 4).map(vignetteCahier))
        : blocVide("Aucun cahier", `Créez votre premier ${L("cahier")} pour prendre des notes pendant les cours.`,
            { libelle: "Créer un cahier", action: () => aller("/cahiers") })
    )
  );
}

function blocClasses() {
  const liste = etat.classes.filter((c) => !c.archived).slice(0, 4);
  return el("div.panneau",
    el("div.panneau__entete",
      el("span.panneau__titre", `Mes ${L("classes")}`),
      el("a.petit", { href: "#/classes" }, "Tout voir")
    ),
    el("div.panneau__corps",
      liste.length
        ? el("div.grille.grille--2", liste.map((c) => carteClasse(c)))
        : blocVide(`Aucune ${L("classe")}`, "Saisissez un code de classe pour rejoindre votre première session.")
    )
  );
}

function blocAnnonces(liste) {
  return el("div.panneau",
    el("div.panneau__entete", el("span.panneau__titre", "Annonces"), icone("megaphone", 15)),
    el("div.panneau__corps",
      liste.length
        ? liste.map((a) => el("div.annonce", { dataset: { niveau: a.level } },
            el("div.annonce__titre", a.classe?.name || "Académie"),
            el("div.annonce__corps", a.title),
            a.body ? el("p.petit.doux", { style: { margin: "var(--e-2) 0 0" } }, a.body) : null,
            el("span.petit.faible", depuis(a.created_at))
          ))
        : el("p.petit.faible", { style: { margin: 0 } }, "Aucune annonce récente.")
    )
  );
}

function blocHistorique(liste) {
  const LIBELLES = {
    "class.join": "Inscription à une classe",
    "session.start": "Session ouverte",
    "session.check_in": "Entrée en session",
    "session.end": "Session terminée",
    "notebook.page": "Page de cahier créée",
    "board.capture": "Tableau capturé",
    "exercise.submit": "Exercice rendu",
    "exercise.start": "Exercice commencé",
    "document.open": "Document consulté"
  };
  return el("div.panneau",
    el("div.panneau__entete", el("span.panneau__titre", "Mon historique"), icone("horloge", 15)),
    el("div.panneau__corps.panneau__corps--serre",
      liste.length
        ? el("div.journal", liste.map((e) => el("div.journal__ligne",
            el("span.journal__heure", heure(e.created_at)),
            el("span", LIBELLES[e.action] || e.action)
          )))
        : el("p.petit.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Rien à afficher pour l'instant.")
    )
  );
}
