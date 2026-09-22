/* ---------------------------------------------------------------------------
 * Espace professeur : vue d'ensemble et commandes rapides.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import { sessions, membres, exercices } from "../data/index.js";
import { entete, blocVide, statistique } from "../ui/fragments.js";
import { encadreUneClasse, mesClassesEncadrees } from "../core/permissions.js";
import { formulaire } from "../ui/modal.js";
import { erreur, toast, messageErreur } from "../ui/toast.js";
import { copier, depuis, pluriel } from "../core/util.js";
import { LISTE_MODES } from "../features/modes.js";

export default async function vueProfesseur() {
  if (!encadreUneClasse()) {
    return {
      noeud: el("div.page", blocVide(
        `Vous n'animez aucune ${L("classe")}`,
        `Cet espace s'ouvre dès que vous créez une ${L("classe")} ou qu'un ${L("professeur")} vous nomme assistant.`,
        { libelle: `Créer une ${L("classe")}`, action: () => aller("/classes") })),
      titre: `Espace ${L("professeur")}`
    };
  }

  const mesClasses = mesClassesEncadrees();

  const resume = [];
  for (const classe of mesClasses) {
    const [equipe, session, listeExos] = await Promise.all([
      membres.liste(classe.id).catch(() => []),
      sessions.enCours(classe.id).catch(() => null),
      exercices.liste({ class_id: classe.id }, 100).catch(() => [])
    ]);
    resume.push({
      classe,
      eleves: equipe.filter((m) => m.role === "student" && m.status === "active").length,
      attente: equipe.filter((m) => m.status === "pending").length,
      session,
      aCorriger: listeExos.filter((e) => e.status === "closed").length,
      exercices: listeExos.length
    });
  }

  const totalEleves = resume.reduce((s, r) => s + r.eleves, 0);
  const totalAttente = resume.reduce((s, r) => s + r.attente, 0);
  const totalCorriger = resume.reduce((s, r) => s + r.aCorriger, 0);
  const enDirect = resume.filter((r) => r.session);

  const noeud = el("div.page.page--large",
    entete(`Espace ${L("professeur")}`, "Tableau de bord",
      `${pluriel(mesClasses.length, L("classe"), L("classes"))} · ${pluriel(totalEleves, L("eleve"), L("eleves"))}`,
      [
        el("button.btn.btn--primaire", { onclick: () => aller("/classes") },
          icone("plus", 15), `Nouvelle ${L("classe")}`),
        el("button.btn", { onclick: () => aller("/modeles") }, icone("cours", 15), "Préparer un cours")
      ]),

    el("div.stats", { style: { marginBottom: "var(--e-5)" } },
      statistique(mesClasses.length, L("classes")),
      statistique(totalEleves, L("eleves")),
      statistique(enDirect.length, "sessions en direct"),
      statistique(totalAttente, "demandes en attente"),
      statistique(totalCorriger, "exercices à corriger")
    ),

    enDirect.length ? el("div.pile", { style: { marginBottom: "var(--e-5)" } },
      enDirect.map(({ classe, session, eleves }) => el("div.carte.carte--classe", {
        dataset: { teinte: classe.color }
      },
        el("div.ligne-flex.ligne-flex--entre.enrouler",
          el("div",
            el("div.ligne-flex", el("span.etiq.etiq--direct", "En direct"), el("b", classe.name)),
            el("span.petit.faible", `${session.title} · ouverte ${depuis(session.started_at)} · ${pluriel(eleves, L("eleve"), L("eleves"))} inscrits`)
          ),
          el("div.ligne-flex",
            el("span.code-classe", classe.code),
            el("button.btn.btn--primaire", { onclick: () => aller(`/classe/${classe.id}/salle`) },
              icone("entree", 15), "Reprendre")
          )
        )
      ))
    ) : null,

    mesClasses.length
      ? el("div.grille.grille--2", resume.map(({ classe, eleves, attente, aCorriger, session }) =>
          el("div.carte.carte--classe", { dataset: { teinte: classe.color } },
            el("div.carte__entete",
              el("div", { style: { flex: "1", minWidth: "0" } },
                el("a.carte__titre", { href: `#/classe/${classe.id}` }, classe.name),
                el("div.carte__meta", [classe.subject, classe.level].filter(Boolean).join(" · ") || "—")
              ),
              el("span.code-classe.petit", classe.code)
            ),
            el("div.ligne-flex.enrouler", { style: { marginTop: "var(--e-2)" } },
              el("span.etiq", `${eleves} ${L("eleves")}`),
              attente ? el("span.etiq.etiq--attn", `${attente} en attente`) : null,
              aCorriger ? el("span.etiq.etiq--info", `${aCorriger} à corriger`) : null,
              session ? el("span.etiq.etiq--direct", "session ouverte") : null
            ),
            el("div.carte__pied",
              session
                ? el("button.btn.btn--primaire.petit", { onclick: () => aller(`/classe/${classe.id}/salle`) }, "Reprendre")
                : el("button.btn.petit", { onclick: () => demarrer(classe) }, icone("lecture", 13), "Démarrer"),
              el("button.btn.btn--fantome.petit", {
                onclick: async () => { await copier(classe.code); toast("Code copié"); }
              }, icone("copier", 13), "Code"),
              el("a.btn.btn--fantome.petit.pousse", { href: `#/classe/${classe.id}?onglet=membres` }, L("Eleves"))
            )
          ))
        )
      : blocVide(`Aucune ${L("classe")}`,
          `Créez votre première ${L("classe")} : un code sera généré pour vos ${L("eleves")}.`,
          { libelle: `Créer une ${L("classe")}`, action: () => aller("/classes") })
  );

  async function demarrer(classe) {
    const sortie = await formulaire({
      titre: `Ouvrir une séance — ${classe.name}`,
      champs: [
        { cle: "mode", label: "Ce qui va se jouer", type: "choix", valeur: "cours",
          options: LISTE_MODES.map((m) => ({ valeur: m.cle, libelle: m.libelle, aide: m.resume })) },
        { cle: "title", label: "Intitulé de la séance", valeur: "",
          placeholder: "Session 01 — Fondements du droit",
          aide: "Laissez vide pour une numérotation automatique." }
      ],
      libelle: "Ouvrir"
    });
    if (!sortie) return;
    try {
      await sessions.demarrer(classe.id, sortie.title || null, sortie.mode || "cours");
      aller(`/classe/${classe.id}/salle`);
    } catch (err) {
      erreur("Démarrage impossible", messageErreur(err));
    }
  }

  return { noeud, titre: "Espace professeur" };
}
