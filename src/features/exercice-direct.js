/* ---------------------------------------------------------------------------
 * Exercice en direct.
 *
 * Deux faces : l'élève répond, le professeur suit l'avancement en temps réel.
 * Les réponses sont enregistrées au fil de l'eau — une coupure ne fait pas
 * perdre le travail déjà saisi.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { exercices, temps, journal, notes as depotNotes } from "../data/index.js";
import { debounce, duree, initiales, pluriel, heure } from "../core/util.js";
import { toast, succes, erreur, messageErreur } from "../ui/toast.js";
import { confirmer } from "../ui/modal.js";
import { blocVide, jauge } from "../ui/fragments.js";

export const TYPES_QUESTION = [
  { cle: "free",      libelle: "Question libre",        aide: "L'élève rédige sa réponse." },
  { cle: "single",    libelle: "Choix unique",          aide: "Une seule bonne réponse." },
  { cle: "qcm",       libelle: "QCM",                   aide: "Une bonne réponse parmi plusieurs." },
  { cle: "multiple",  libelle: "Choix multiples",       aide: "Plusieurs bonnes réponses." },
  { cle: "truefalse", libelle: "Vrai / Faux",           aide: "Affirmation à trancher." },
  { cle: "fill",      libelle: "Texte à trous",         aide: "Utilisez ___ pour marquer un trou." },
  { cle: "ordering",  libelle: "Classement",            aide: "L'élève remet les éléments dans l'ordre." },
  { cle: "matching",  libelle: "Association",           aide: "Relier deux colonnes." },
  { cle: "case",      libelle: "Cas pratique",          aide: "Énoncé long, réponse rédigée." },
  { cle: "situation", libelle: "Mise en situation RP",  aide: "Scénario : l'élève agit comme dans le RP." }
];

/**
 * rendreExerciceEnLigne({ exercice, classe, session, staff, surFermeture })
 */
export async function rendreExerciceEnLigne({ exercice, classe, session, staff, surFermeture }) {
  const questions = await exercices.questions(exercice.id);
  return staff
    ? vueSuiviProfesseur({ exercice, questions, surFermeture })
    : vueReponseEleve({ exercice, questions, classe, session });
}

/* ===========================================================================
   Côté élève
   ========================================================================= */
export async function vueReponseEleve({ exercice, questions, classe, session }) {
  const racine = el("div.feuillet__zone", { style: { display: "block" } });
  const conteneur = el("div.exo");
  render(racine, conteneur);

  if (exercice.status === "draft") {
    render(conteneur, blocVide("Exercice non lancé", "Le professeur ne l'a pas encore ouvert."));
    return racine;
  }

  let tentative;
  try {
    tentative = await exercices.commencer(exercice.id, etat.utilisateur.id);
  } catch (err) {
    render(conteneur, blocVide("Impossible de commencer", messageErreur(err)));
    return racine;
  }

  const reponsesExistantes = await exercices.reponses(tentative.id);
  const reponses = new Map(reponsesExistantes.map((r) => [r.question_id, r.response]));
  const verrouille = tentative.status !== "started" || exercice.status === "closed";

  journal.ecrire({
    class_id: classe?.id, session_id: session?.id, user_id: etat.utilisateur.id,
    action: "exercise.start", meta: { exercice: exercice.id }
  });

  const enregistrer = debounce(async (questionId) => {
    try {
      await exercices.enregistrerReponse(tentative.id, questionId, reponses.get(questionId) ?? null);
      etiquette.textContent = `Enregistré à ${heure(Date.now())}`;
    } catch (err) {
      etiquette.textContent = "Non enregistré — nouvelle tentative au prochain changement";
      console.warn("[exercice] réponse", err);
    }
  }, 700);

  const etiquette = el("span.petit.faible");

  function definirReponse(questionId, valeur) {
    reponses.set(questionId, valeur);
    enregistrer(questionId);
  }

  async function rendre() {
    const fini = tentative.status !== "started";
    render(conteneur,
      el("div.exo__entete",
        el("div.ligne-flex.ligne-flex--entre.enrouler",
          el("div",
            el("h2", exercice.title),
            el("span.petit.faible",
              `${pluriel(questions.length, "question")}${exercice.exam_mode ? " · mode examen" : ""}`)
          ),
          el("div.ligne-flex",
            fini ? el("span.etiq.etiq--ok", icone("coche", 12), "Rendu") : etiquette
          )
        )
      ),
      exercice.instructions ? el("div.exo__consigne", exercice.instructions) : null,

      questions.map((question, index) => el("div.exo__question",
        el("span.exo__points", `${question.points} pt${question.points > 1 ? "s" : ""}`),
        el("div.exo__numero", `Question ${index + 1} — ${libelleType(question.kind)}`),
        el("div.exo__enonce", question.prompt),
        question.helper ? el("p.petit.faible", question.helper) : null,
        champReponse(question, reponses.get(question.id), definirReponse, fini || verrouille)
      )),

      fini
        ? el("div.carte.centre",
            el("p", "Votre travail a été transmis au professeur."),
            tentative.score != null
              ? el("div",
                  el("div.stat__valeur", `${tentative.score} / ${tentative.max_score}`),
                  tentative.feedback ? el("p.doux", tentative.feedback) : null
                )
              : el("p.petit.faible", "En attente de correction."))
        : el("div.ligne-flex.ligne-flex--fin", { style: { marginTop: "var(--e-5)" } },
            el("button.btn.btn--primaire.btn--grand", { onclick: rendreCopie },
              icone("televerser", 15), "Rendre ma copie"))
    );
  }

  async function rendreCopie() {
    const manquantes = questions.filter((q) => {
      const r = reponses.get(q.id);
      return r == null || r === "" || (Array.isArray(r) && !r.length);
    });
    const ok = await confirmer({
      titre: "Rendre la copie",
      message: manquantes.length
        ? `${pluriel(manquantes.length, "question")} sans réponse. Rendre malgré tout ?`
        : "Vous ne pourrez plus modifier vos réponses.",
      libelle: "Rendre"
    });
    if (!ok) return;

    enregistrer.annuler();
    for (const [questionId, valeur] of reponses) {
      try { await exercices.enregistrerReponse(tentative.id, questionId, valeur); }
      catch (err) { console.warn("[exercice] réponse finale", err); }
    }
    try {
      tentative = await exercices.soumettre(tentative.id);
      journal.ecrire({
        class_id: classe?.id, session_id: session?.id, user_id: etat.utilisateur.id,
        action: "exercise.submit", meta: { exercice: exercice.id }
      });
      succes("Copie rendue", "Le professeur en est informé.");
      await rendre();
    } catch (err) {
      erreur("Envoi impossible", messageErreur(err));
    }
  }

  await rendre();
  return racine;
}

/* --- Champs par type de question -------------------------------------------- */
function champReponse(question, valeur, surChangement, verrouille) {
  const options = Array.isArray(question.options) ? question.options : [];

  switch (question.kind) {
    case "truefalse":
    case "single":
    case "qcm": {
      const liste = question.kind === "truefalse" ? ["Vrai", "Faux"] : options;
      return el("div", liste.map((option, i) => el("label.choix", {
        dataset: { selection: valeur === i ? "1" : "0" }
      },
        el("input", {
          type: "radio", name: `q-${question.id}`, checked: valeur === i, disabled: verrouille,
          onchange: (e) => {
            surChangement(question.id, i);
            const parent = e.target.closest(".exo__question");
            parent.querySelectorAll(".choix").forEach((c, index) =>
              c.dataset.selection = index === i ? "1" : "0");
          }
        }),
        el("span", option)
      )));
    }

    case "multiple": {
      const selection = new Set(Array.isArray(valeur) ? valeur : []);
      return el("div", options.map((option, i) => el("label.choix", {
        dataset: { selection: selection.has(i) ? "1" : "0" }
      },
        el("input", {
          type: "checkbox", checked: selection.has(i), disabled: verrouille,
          onchange: (e) => {
            if (e.target.checked) selection.add(i); else selection.delete(i);
            e.target.closest(".choix").dataset.selection = e.target.checked ? "1" : "0";
            surChangement(question.id, [...selection].sort((a, b) => a - b));
          }
        }),
        el("span", option)
      )));
    }

    case "fill": {
      const morceaux = String(question.prompt || "").split("___");
      const actuelles = Array.isArray(valeur) ? [...valeur] : [];
      const noeud = el("p", { style: { fontFamily: "var(--f-titre)", fontSize: "var(--t-lg)" } });
      morceaux.forEach((morceau, i) => {
        noeud.appendChild(document.createTextNode(morceau));
        if (i < morceaux.length - 1) {
          noeud.appendChild(el("input.trou", {
            value: actuelles[i] || "", disabled: verrouille,
            "aria-label": `Trou ${i + 1}`,
            oninput: (e) => { actuelles[i] = e.target.value; surChangement(question.id, actuelles); }
          }));
        }
      });
      return noeud;
    }

    case "ordering": {
      const ordre = Array.isArray(valeur) && valeur.length === options.length
        ? valeur : options.map((_, i) => i);
      const liste = el("div");
      const peindre = () => render(liste, ordre.map((indexOption, position) =>
        el("div.classable", {
          draggable: !verrouille, dataset: { position },
          ondragstart: (e) => { e.dataTransfer.setData("text/plain", String(position)); e.currentTarget.classList.add("glisse"); },
          ondragend: (e) => e.currentTarget.classList.remove("glisse"),
          ondragover: (e) => e.preventDefault(),
          ondrop: (e) => {
            e.preventDefault();
            const depart = Number(e.dataTransfer.getData("text/plain"));
            const [deplace] = ordre.splice(depart, 1);
            ordre.splice(position, 0, deplace);
            surChangement(question.id, [...ordre]);
            peindre();
          }
        },
          el("span.classable__poignee", `${position + 1}.`),
          el("span", options[indexOption])
        )));
      peindre();
      return liste;
    }

    case "matching": {
      const droite = question.solution?.droite || options.map((o) => o.droite ?? o);
      const gauche = options.map((o) => o.gauche ?? o);
      const actuelles = Array.isArray(valeur) ? [...valeur] : gauche.map(() => null);
      return el("div.association",
        gauche.flatMap((terme, i) => [
          el("span", terme),
          icone("chevronD", 14),
          el("select.saisie", {
            disabled: verrouille,
            "aria-label": `Correspondance pour ${terme}`,
            onchange: (e) => {
              actuelles[i] = e.target.value === "" ? null : Number(e.target.value);
              surChangement(question.id, actuelles);
            }
          },
            el("option", { value: "" }, "— choisir —"),
            droite.map((d, j) => el("option", { value: j, selected: actuelles[i] === j }, d))
          )
        ])
      );
    }

    default:
      return el("textarea.zone", {
        value: valeur || "", disabled: verrouille, rows: question.kind === "case" ? 10 : 5,
        placeholder: "Votre réponse…", "aria-label": "Réponse",
        oninput: (e) => surChangement(question.id, e.target.value)
      });
  }
}

export function libelleType(cle) {
  return TYPES_QUESTION.find((t) => t.cle === cle)?.libelle || cle;
}

/* ===========================================================================
   Côté professeur : suivi en direct
   ========================================================================= */
export function vueSuiviProfesseur({ exercice, questions, surFermeture }) {
  const racine = el("div.feuillet__zone", { style: { display: "block" } });
  const conteneur = el("div.exo");
  render(racine, conteneur);

  let abonnement = null;

  async function peindre() {
    const tentatives = await exercices.tentatives(exercice.id);
    const commencees = tentatives.filter((t) => t.status === "started").length;
    const rendues = tentatives.filter((t) => ["submitted", "graded"].includes(t.status)).length;

    render(conteneur,
      el("div.exo__entete",
        el("div.ligne-flex.ligne-flex--entre.enrouler",
          el("div",
            el("h2", exercice.title),
            el("span.petit.faible", `${pluriel(questions.length, "question")} · ${libelleStatut(exercice.status)}`)
          ),
          el("div.ligne-flex",
            exercice.status === "live"
              ? el("button.btn.btn--danger", { onclick: async () => { await surFermeture?.(); await peindre(); } },
                  icone("stop", 15), "Fermer l'exercice")
              : null,
            el("a.btn", { href: `#/exercice/${exercice.id}` }, icone("crayon", 15), "Corriger")
          )
        )
      ),

      el("div.stats", { style: { marginBottom: "var(--e-5)" } },
        el("div.stat", el("div.stat__valeur", String(tentatives.length)), el("div.stat__label", "ont ouvert")),
        el("div.stat", el("div.stat__valeur", String(commencees)), el("div.stat__label", "en cours")),
        el("div.stat", el("div.stat__valeur", String(rendues)), el("div.stat__label", "ont rendu"))
      ),

      jauge(rendues, Math.max(tentatives.length, 1), { ok: rendues === tentatives.length && rendues > 0 }),

      el("div", { style: { marginTop: "var(--e-5)" } },
        el("h3", { style: { marginBottom: "var(--e-3)" } }, "Suivi des copies"),
        tentatives.length
          ? el("div.suivi-exo", tentatives.map((t) => el("div.suivi-exo__eleve", { dataset: { etat: t.status } },
              el("div.ligne-flex",
                el("span.avatar", initiales(t.profil?.display_name)),
                el("div", { style: { minWidth: "0" } },
                  el("div.tronque", t.profil?.display_name || "Élève"),
                  el("span.petit.faible", libelleTentative(t))
                )
              )
            )))
          : el("p.petit.faible", "Aucun élève n'a encore ouvert l'exercice.")
      )
    );
  }

  abonnement = temps.sabonner({
    cle: `exercice:${exercice.id}`,
    tables: [
      { table: "exercise_attempts", filtre: `exercise_id=eq.${exercice.id}` }
    ],
    surChangement: () => peindre()
  });

  racine.addEventListener("ojm:detruire", () => abonnement?.fermer());
  peindre();
  return racine;
}

function libelleStatut(statut) {
  return { draft: "brouillon", live: "en cours", closed: "fermé", graded: "corrigé" }[statut] || statut;
}

function libelleTentative(tentative) {
  if (tentative.status === "graded") return `${tentative.score ?? "—"} / ${tentative.max_score ?? "—"}`;
  if (tentative.status === "submitted") return `rendu à ${heure(tentative.submitted_at)}`;
  return "en cours de rédaction";
}
