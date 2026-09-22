/* ---------------------------------------------------------------------------
 * Un exercice : atelier de rédaction et correction (professeur),
 * copie à remplir (élève).
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { exercices, notes as depotNotes, notifications } from "../data/index.js";
import { activerClasse } from "../core/session.js";
import { encadre } from "../core/permissions.js";
import { entete, blocVide, avatar, statistique } from "../ui/fragments.js";
import { formulaire, confirmer, menu } from "../ui/modal.js";
import { erreur, succes, toast, messageErreur } from "../ui/toast.js";
import { TYPES_QUESTION, libelleType, vueReponseEleve, vueSuiviProfesseur } from "../features/exercice-direct.js";
import { heure, pluriel } from "../core/util.js";

export default async function vueExercice({ params }) {
  const exercice = await exercices.lire(params.id);
  if (!exercice) {
    return {
      noeud: el("div.page", blocVide("Exercice introuvable", "",
        { libelle: "Retour", action: () => aller("/exercices") })),
      titre: "Exercice introuvable"
    };
  }

  const classe = await activerClasse(exercice.class_id);
  const staff = encadre();
  let questions = await exercices.questions(exercice.id);
  let ongletActif = staff ? "questions" : "copie";

  const contenu = el("div");
  const barre = el("div.onglets", { role: "tablist" });

  const noeud = el("div.page",
    entete(classe?.name || "Exercice", exercice.title,
      exercice.instructions || null,
      staff ? [
        exercice.status === "draft"
          ? el("button.btn.btn--primaire", { onclick: lancer }, icone("lecture", 15), "Lancer l'exercice")
          : exercice.status === "live"
            ? el("button.btn.btn--danger", { onclick: fermer }, icone("stop", 15), "Fermer")
            : null,
        el("button.btn", { onclick: (e) => menuExercice(e.currentTarget) }, icone("points", 15), "Gérer")
      ] : null
    ),
    staff ? barre : null,
    contenu
  );

  function peindreBarre() {
    const items = [
      { cle: "questions", libelle: `Questions (${questions.length})` },
      { cle: "suivi", libelle: "Suivi en direct" },
      { cle: "copies", libelle: "Copies & correction" }
    ];
    render(barre, items.map((i) => el("button.onglet", {
      role: "tab", "aria-selected": String(i.cle === ongletActif),
      onclick: () => { ongletActif = i.cle; peindreBarre(); peindre(); }
    }, i.libelle)));
  }

  async function peindre() {
    if (!staff) {
      render(contenu, await vueReponseEleve({ exercice, questions, classe, session: null }));
      return;
    }
    if (ongletActif === "questions") return render(contenu, atelierQuestions());
    if (ongletActif === "suivi") return render(contenu, vueSuiviProfesseur({
      exercice, questions, surFermeture: fermer
    }));
    return render(contenu, await panneauCopies());
  }

  /* --- Atelier de questions ------------------------------------------------- */
  function atelierQuestions() {
    return el("div.pile",
      questions.length
        ? questions.map((question, index) => el("div.exo__question",
            el("div.ligne-flex.ligne-flex--entre",
              el("div.exo__numero", `Question ${index + 1} — ${libelleType(question.kind)}`),
              el("div.ligne-flex",
                el("span.petit.faible", `${question.points} pt${question.points > 1 ? "s" : ""}`),
                el("button.btn.btn--fantome.btn--icone", {
                  "aria-label": "Modifier", onclick: () => modifierQuestion(question)
                }, icone("crayon", 14)),
                el("button.btn.btn--fantome.btn--icone", {
                  "aria-label": "Supprimer",
                  onclick: async () => {
                    if (!await confirmer({ titre: "Supprimer la question", message: question.prompt, libelle: "Supprimer", danger: true })) return;
                    await exercices.supprimerQuestion(question.id);
                    questions = await exercices.questions(exercice.id);
                    peindreBarre(); await peindre();
                  }
                }, icone("corbeille", 14))
              )
            ),
            el("div.exo__enonce", question.prompt || el("span.faible", "(énoncé vide)")),
            (question.options || []).length
              ? el("ul.petit.doux", (question.options).map((o, i) =>
                  el("li", typeof o === "string" ? o : `${o.gauche} → ${o.droite}`,
                    estSolution(question, i) ? el("span.etiq.etiq--ok", { style: { marginLeft: "6px" } }, "correct") : null))
                )
              : null
          ))
        : blocVide("Aucune question", "Ajoutez la première question de cet exercice."),

      el("button.btn.btn--primaire", { onclick: ajouterQuestion },
        icone("plus", 15), "Ajouter une question")
    );
  }

  function estSolution(question, index) {
    const s = question.solution;
    if (s == null) return false;
    if (Array.isArray(s)) return s.includes(index);
    return s === index;
  }

  async function ajouterQuestion() {
    const type = await formulaire({
      titre: "Type de question",
      champs: [{
        cle: "kind", label: "Nature de la question", type: "select", valeur: "free",
        options: TYPES_QUESTION.map((t) => ({ valeur: t.cle, libelle: t.libelle })),
        aide: "Le type détermine la façon dont l'élève répond et la correction automatique."
      }],
      libelle: "Continuer"
    });
    if (!type) return;
    await editerQuestion({ kind: type.kind, prompt: "", options: [], solution: null, points: 1 });
  }

  async function modifierQuestion(question) {
    await editerQuestion(question, question.id);
  }

  async function editerQuestion(modele, id = null) {
    const aOptions = ["single", "qcm", "multiple", "ordering", "matching"].includes(modele.kind);
    const aVraiFaux = modele.kind === "truefalse";

    const champs = [
      { cle: "prompt", label: "Énoncé", type: "textarea", valeur: modele.prompt || "", requis: true,
        aide: modele.kind === "fill" ? "Marquez chaque trou par ___ (trois soulignés)." : null },
      { cle: "helper", label: "Indication (facultatif)", valeur: modele.helper || "" },
      { cle: "points", label: "Points", type: "number", valeur: modele.points ?? 1, min: 0, max: 20, step: 0.5 }
    ];

    if (aOptions) {
      champs.push({
        cle: "options", label: modele.kind === "matching" ? "Paires (gauche | droite, une par ligne)" : "Propositions (une par ligne)",
        type: "textarea", lignes: 5,
        valeur: (modele.options || []).map((o) => typeof o === "string" ? o : `${o.gauche} | ${o.droite}`).join("\n"),
        requis: true
      });
    }
    if (["single", "qcm"].includes(modele.kind)) {
      champs.push({ cle: "solution", label: "Numéro de la bonne réponse (1, 2, 3…)", type: "number",
        valeur: modele.solution != null ? modele.solution + 1 : "", min: 1 });
    }
    if (modele.kind === "multiple") {
      champs.push({ cle: "solution", label: "Bonnes réponses (numéros séparés par des virgules)",
        valeur: Array.isArray(modele.solution) ? modele.solution.map((i) => i + 1).join(",") : "" });
    }
    if (aVraiFaux) {
      champs.push({ cle: "solution", label: "Réponse attendue", type: "select",
        valeur: modele.solution === 0 ? "0" : "1",
        options: [{ valeur: "0", libelle: "Vrai" }, { valeur: "1", libelle: "Faux" }] });
    }
    if (modele.kind === "fill") {
      champs.push({ cle: "solution", label: "Réponses attendues (une par ligne, dans l'ordre)",
        type: "textarea", lignes: 3,
        valeur: Array.isArray(modele.solution) ? modele.solution.join("\n") : "" });
    }

    const sortie = await formulaire({
      titre: id ? "Modifier la question" : `Nouvelle question — ${libelleType(modele.kind)}`,
      champs, libelle: "Enregistrer", large: true
    });
    if (!sortie) return;

    const donnees = {
      kind: modele.kind,
      prompt: sortie.prompt,
      helper: sortie.helper || null,
      points: Number(sortie.points) || 1,
      options: [],
      solution: null
    };

    if (aOptions) {
      const lignes = sortie.options.split("\n").map((l) => l.trim()).filter(Boolean);
      donnees.options = modele.kind === "matching"
        ? lignes.map((l) => {
            const [gauche, droite] = l.split("|").map((p) => p.trim());
            return { gauche, droite: droite || "" };
          })
        : lignes;
    }

    if (["single", "qcm"].includes(modele.kind) && sortie.solution) {
      donnees.solution = Number(sortie.solution) - 1;
    } else if (modele.kind === "multiple" && sortie.solution) {
      donnees.solution = String(sortie.solution).split(",")
        .map((n) => Number(n.trim()) - 1).filter((n) => n >= 0).sort((a, b) => a - b);
    } else if (aVraiFaux) {
      donnees.solution = Number(sortie.solution);
    } else if (modele.kind === "fill" && sortie.solution) {
      donnees.solution = sortie.solution.split("\n").map((l) => l.trim());
    } else if (modele.kind === "ordering") {
      donnees.solution = donnees.options.map((_, i) => i);
    }

    try {
      if (id) await exercices.majorerQuestion(id, donnees);
      else await exercices.ajouterQuestion(exercice.id, donnees);
      questions = await exercices.questions(exercice.id);
      peindreBarre();
      await peindre();
    } catch (err) {
      erreur("Enregistrement impossible", messageErreur(err));
    }
  }

  /* --- Copies et correction ------------------------------------------------- */
  async function panneauCopies() {
    const tentatives = await exercices.tentatives(exercice.id);
    const rendues = tentatives.filter((t) => ["submitted", "graded"].includes(t.status));
    if (!tentatives.length) return blocVide("Aucune copie", "Personne n'a encore répondu.");

    return el("div.pile",
      el("div.stats",
        statistique(tentatives.length, "copies ouvertes"),
        statistique(rendues.length, "rendues"),
        statistique(tentatives.filter((t) => t.status === "graded").length, "corrigées")
      ),
      el("div.panneau", el("div.panneau__corps.panneau__corps--serre",
        el("div.liste", tentatives.map((t) => el("div.liste__item.liste__item--cliquable", {
          onclick: () => corriger(t)
        },
          avatar(t.profil),
          el("div.liste__principal",
            el("div.liste__nom", t.profil?.display_name || "Élève"),
            el("div.liste__detail", t.submitted_at ? `rendu à ${heure(t.submitted_at)}` : "en cours")
          ),
          el("div.liste__fin",
            t.status === "graded"
              ? el("span.etiq.etiq--ok", `${t.score ?? "—"} / ${t.max_score ?? "—"}`)
              : t.status === "submitted" ? el("span.etiq.etiq--attn", "À corriger")
              : el("span.etiq", "En cours")
          )
        )))
      ))
    );
  }

  async function corriger(tentative) {
    const reponses = await exercices.reponses(tentative.id);
    const parQuestion = new Map(reponses.map((r) => [r.question_id, r]));

    const champs = questions.map((q, index) => ({
      cle: q.id,
      label: `Q${index + 1} (${q.points} pt) — ${apercuReponse(parQuestion.get(q.id), q)}`,
      type: "number",
      valeur: parQuestion.get(q.id)?.score ?? "",
      min: 0, max: q.points, step: 0.5
    }));
    champs.push({ cle: "__feedback", label: "Appréciation générale", type: "textarea",
      valeur: tentative.feedback || "", lignes: 3 });

    const sortie = await formulaire({
      titre: `Copie de ${tentative.profil?.display_name || "l'élève"}`,
      large: true,
      note: "Laissez un champ vide pour ne pas attribuer de point à la question.",
      champs, libelle: "Enregistrer la note"
    });
    if (!sortie) return;

    let total = 0, max = 0;
    for (const q of questions) {
      max += Number(q.points || 0);
      const valeur = sortie[q.id];
      if (valeur == null || valeur === "") continue;
      total += Number(valeur);
      const reponse = parQuestion.get(q.id);
      if (reponse) {
        await exercices.noterReponse(reponse.id, {
          score: Number(valeur), correct: Number(valeur) >= Number(q.points)
        });
      }
    }

    await exercices.majorerTentative(tentative.id, {
      score: total, max_score: max, status: "graded",
      feedback: sortie.__feedback || null,
      graded_by: etat.utilisateur.id, graded_at: new Date().toISOString()
    });
    await depotNotes.creer({
      class_id: exercice.class_id, user_id: tentative.user_id,
      source_kind: "exercise", source_id: exercice.id, label: exercice.title,
      score: total, max_score: max, comment: sortie.__feedback || null,
      graded_by: etat.utilisateur.id
    }).catch(() => {});

    succes("Copie corrigée", `${total} / ${max}`);
    await peindre();
  }

  function apercuReponse(reponse, question) {
    if (!reponse || reponse.response == null) return "sans réponse";
    const r = reponse.response;
    if (typeof r === "string") return r.slice(0, 60) || "sans réponse";
    if (typeof r === "number") return (question.options?.[r] ?? `choix ${r + 1}`);
    if (Array.isArray(r)) {
      return r.map((v) => typeof v === "number" ? (question.options?.[v] ?? v + 1) : v).join(", ");
    }
    return JSON.stringify(r).slice(0, 60);
  }

  /* --- Actions ---------------------------------------------------------------- */
  async function lancer() {
    if (!questions.length) { erreur("Exercice vide", "Ajoutez au moins une question."); return; }
    try {
      Object.assign(exercice, await exercices.lancer(exercice.id));
      notifications.diffuser(exercice.class_id, {
        kind: "exercice", titre: `Exercice lancé — ${exercice.title}`,
        lien: `/exercice/${exercice.id}`
      }).catch(() => {});
      succes("Exercice lancé", "Les élèves connectés le reçoivent immédiatement.");
      ongletActif = "suivi";
      peindreBarre(); await peindre();
    } catch (err) {
      erreur("Lancement impossible", messageErreur(err));
    }
  }

  async function fermer() {
    Object.assign(exercice, await exercices.fermer(exercice.id));
    toast("Exercice fermé");
    await peindre();
  }

  function menuExercice(ancre) {
    menu(ancre, [
      { titre: exercice.title },
      { libelle: "Modifier l'intitulé", icone: "crayon", action: async () => {
        const sortie = await formulaire({
          titre: "Modifier l'exercice",
          champs: [
            { cle: "title", label: "Titre", valeur: exercice.title, requis: true },
            { cle: "instructions", label: "Consigne", type: "textarea", valeur: exercice.instructions || "" },
            { cle: "exam_mode", label: "Mode examen", type: "checkbox", valeur: exercice.exam_mode }
          ]
        });
        if (!sortie) return;
        Object.assign(exercice, await exercices.majorer(exercice.id, sortie));
        aller(`/exercice/${exercice.id}`);
      } },
      { libelle: "Correction automatique de toutes les copies", icone: "coche", action: async () => {
        const tentatives = await exercices.tentatives(exercice.id);
        const rendues = tentatives.filter((t) => t.status === "submitted");
        if (!rendues.length) { toast("Aucune copie à corriger"); return; }
        let n = 0;
        for (const t of rendues) {
          try { await exercices.corrigerAuto(t.id); n++; }
          catch (err) { console.warn("[exercice] correction auto", err); }
        }
        succes("Correction automatique", `${pluriel(n, "copie")} traitée${n > 1 ? "s" : ""}.`);
        await peindre();
      } },
      { separateur: true },
      { libelle: "Supprimer l'exercice", icone: "corbeille", danger: true, action: async () => {
        if (!await confirmer({ titre: "Supprimer l'exercice", message: `« ${exercice.title} » et toutes les copies seront perdus.`, libelle: "Supprimer", danger: true })) return;
        await exercices.supprimer(exercice.id);
        succes("Exercice supprimé");
        aller("/exercices");
      } }
    ]);
  }

  peindreBarre();
  await peindre();
  return { noeud, titre: exercice.title };
}
