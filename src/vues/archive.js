/* ---------------------------------------------------------------------------
 * Consultation d'une séance archivée.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { aller } from "../core/router.js";
import { sessions, presence, tableaux, exercices, questions as depotQuestions, journal, cahiers } from "../data/index.js";
import { activerClasse } from "../core/session.js";
import { encadre } from "../core/permissions.js";
import { entete, blocVide, statistique, avatar, pastillePresence } from "../ui/fragments.js";
import { dateLongue, dureeLongue, heure, duree } from "../core/util.js";

export default async function vueArchive({ params }) {
  const session = await sessions.lire(params.id);
  if (!session) {
    return {
      noeud: el("div.page", blocVide("Séance introuvable", "",
        { libelle: "Retour aux archives", action: () => aller("/archives") })),
      titre: "Archive"
    };
  }

  const classe = await activerClasse(session.class_id);
  const staff = encadre();

  const [listePresence, tableau, listeExercices, listeQuestions, entrees, cahierCommun] = await Promise.all([
    presence.liste(session.id).catch(() => []),
    tableaux.pourSession(session.id, null).catch(() => null),
    exercices.liste({ session_id: session.id }).catch(() => []),
    depotQuestions.liste(session.id).catch(() => []),
    journal.liste({ session_id: session.id }, 200).catch(() => []),
    cahiers.commun(session.class_id).catch(() => null)
  ]);

  const pagesTableau = tableau ? await tableaux.pages(tableau.id).catch(() => []) : [];
  const dureeTotale = session.started_at && session.ended_at
    ? (new Date(session.ended_at) - new Date(session.started_at)) / 1000 : 0;

  const noeud = el("div.page",
    entete(classe?.name || "Archive", session.title,
      `${dateLongue(session.started_at)} · ${dureeLongue(dureeTotale)}`,
      [
        cahierCommun ? el("a.btn", { href: `#/cahier/${cahierCommun.id}` },
          icone("cahier", 15), "Cahier commun") : null,
        staff ? el("button.btn", { onclick: reprendre }, icone("rejouer", 15), "Reprendre cette séance") : null
      ]),

    el("div.stats", { style: { marginBottom: "var(--e-5)" } },
      statistique(listePresence.length, "participants"),
      statistique(pagesTableau.length, "pages de tableau"),
      statistique(listeExercices.length, "exercices"),
      statistique(listeQuestions.length, "questions")
    ),

    el("div.colonnes",
      el("div.pile",
        el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Feuille de présence")),
          el("div.panneau__corps.panneau__corps--serre",
            listePresence.length
              ? el("div.liste", listePresence.map((p) => el("div.liste__item",
                  pastillePresence(p.status),
                  avatar(p.profil),
                  el("div.liste__principal",
                    el("div.liste__nom", p.profil?.display_name || "—"),
                    el("div.liste__detail",
                      `arrivée ${heure(p.arrived_at)}${p.left_at ? ` · départ ${heure(p.left_at)}` : ""}`)
                  ),
                  el("div.liste__fin", el("span.mono.petit", duree(p.seconds)))
                )))
              : el("p.petit.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Aucune présence relevée.")
          )
        ),

        listeExercices.length ? el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Exercices de la séance")),
          el("div.panneau__corps.panneau__corps--serre",
            el("div.liste", listeExercices.map((ex) => el("a.liste__item", { href: `#/exercice/${ex.id}` },
              icone("exercices", 16),
              el("div.liste__principal",
                el("div.liste__nom", ex.title),
                el("div.liste__detail", ex.exam_mode ? "Examen" : "Exercice")
              )
            )))
          )
        ) : null,

        listeQuestions.length ? el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Questions posées")),
          el("div.panneau__corps",
            listeQuestions.map((q) => el("div.question", { dataset: { statut: q.status } },
              el("div.question__entete",
                el("b.petit", q.profil?.display_name || "Élève"),
                el("span.petit.faible", heure(q.created_at))
              ),
              el("div.question__corps", q.body),
              q.answer ? el("div.question__reponse", q.answer) : null
            ))
          )
        ) : null
      ),

      el("div.pile",
        el("div.panneau",
          el("div.panneau__entete", el("span.panneau__titre", "Déroulé")),
          el("div.panneau__corps.panneau__corps--serre",
            el("div.journal", entrees.length
              ? [...entrees].reverse().map((e) => el("div.journal__ligne",
                  el("span.journal__heure", heure(e.created_at)),
                  el("span", LIBELLES[e.action] || e.action)
                ))
              : el("p.petit.faible", { style: { padding: "var(--e-4)" } }, "Journal vide.")
            )
          )
        )
      )
    )
  );

  async function reprendre() {
    const { sessions: depot } = await import("../data/index.js");
    try {
      await depot.demarrer(session.class_id, `${session.title} (reprise)`);
      aller(`/classe/${session.class_id}/salle`);
    } catch (err) {
      const { erreur, messageErreur } = await import("../ui/toast.js");
      erreur("Reprise impossible", messageErreur(err));
    }
  }

  return { noeud, titre: session.title };
}

const LIBELLES = {
  "session.start": "Session ouverte",
  "session.check_in": "Entrée d'un participant",
  "session.end": "Session terminée",
  "board.capture": "Tableau capturé dans le cahier",
  "exercise.launch": "Exercice lancé",
  "exercise.close": "Exercice fermé",
  "exercise.start": "Un élève commence l'exercice",
  "exercise.submit": "Copie rendue",
  "document.share": "Document distribué",
  "document.open": "Document consulté",
  "poll.open": "Sondage lancé",
  "announcement": "Annonce publiée",
  "class.join": "Inscription à la classe"
};
