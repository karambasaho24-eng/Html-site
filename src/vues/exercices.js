/* ---------------------------------------------------------------------------
 * Exercices — liste côté élève, atelier côté professeur.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import { exercices } from "../data/index.js";
import { entete, blocVide, onglets } from "../ui/fragments.js";
import { formulaire } from "../ui/modal.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";
import { mesClassesEncadrees } from "../core/permissions.js";
import { depuis } from "../core/util.js";

export default async function vueExercices({ requete }) {
  const classesEncadrees = mesClassesEncadrees();
  const peutCreer = classesEncadrees.length > 0;

  let filtre = requete?.classe || "toutes";
  const liste = el("div.pile");

  const noeud = el("div.page",
    entete(L("Exercices"), L("Exercices"),
      "Questions libres, QCM, textes à trous, cas pratiques et mises en situation RP.",
      peutCreer ? [el("button.btn.btn--primaire", { onclick: creer }, icone("plus", 15), "Nouvel exercice")] : null),
    el("div.onglets", { ref: (n) => peindreFiltres(n) }),
    liste
  );

  function peindreFiltres(hote) {
    const items = [{ cle: "toutes", libelle: "Toutes mes classes" },
      ...etat.classes.filter((c) => !c.archived).map((c) => ({ cle: c.id, libelle: c.name }))];
    render(hote, items.map((item) => el("button.onglet", {
      role: "tab", "aria-selected": String(item.cle === filtre),
      onclick: () => { filtre = item.cle; peindreFiltres(hote); peindre(); }
    }, item.libelle)));
  }

  async function peindre() {
    render(liste, el("p.petit.faible", "Chargement…"));
    const ids = filtre === "toutes"
      ? etat.classes.map((c) => c.id)
      : [filtre];
    if (!ids.length) {
      render(liste, blocVide("Aucune classe", "Rejoignez une classe pour voir ses exercices."));
      return;
    }

    let tous = [];
    try { tous = await exercices.liste({ class_id: ids }, 100); }
    catch (err) { render(liste, blocVide("Chargement impossible", messageErreur(err))); return; }

    const visibles = tous.filter((ex) => {
      const classe = etat.classes.find((c) => c.id === ex.class_id);
      const staff = ["teacher", "assistant"].includes(classe?.membre?.role)
        || classe?.owner_id === etat.utilisateur.id;
      return staff || ex.status !== "draft";
    });

    if (!visibles.length) {
      render(liste, blocVide("Aucun exercice",
        peutCreer ? "Créez-en un, puis lancez-le pendant une session." : "Rien à faire pour l'instant.",
        peutCreer ? { libelle: "Créer un exercice", action: creer } : null));
      return;
    }

    const parStatut = { live: [], closed: [], graded: [], draft: [] };
    for (const ex of visibles) (parStatut[ex.status] ||= []).push(ex);

    render(liste,
      section("En cours", parStatut.live),
      section("À corriger", parStatut.closed),
      section("Corrigés", parStatut.graded),
      section("Brouillons", parStatut.draft)
    );
  }

  function section(titre, items) {
    if (!items?.length) return null;
    return el("div.panneau",
      el("div.panneau__entete",
        el("span.panneau__titre", titre),
        el("span.petit.faible", String(items.length))
      ),
      el("div.panneau__corps.panneau__corps--serre",
        el("div.liste", items.map((ex) => {
          const classe = etat.classes.find((c) => c.id === ex.class_id);
          return el("a.liste__item", { href: `#/exercice/${ex.id}` },
            icone(ex.exam_mode ? "bouclier" : "exercices", 16),
            el("div.liste__principal",
              el("div.liste__nom", ex.title),
              el("div.liste__detail",
                `${classe?.name || "—"} · créé ${depuis(ex.created_at)}`)
            ),
            el("div.liste__fin",
              ex.exam_mode ? el("span.etiq.etiq--alerte", "Examen") : null,
              ex.status === "live" ? el("span.etiq.etiq--direct", "En cours") : null
            )
          );
        }))
      )
    );
  }

  async function creer() {
    const sortie = await formulaire({
      titre: "Nouvel exercice",
      champs: [
        { cle: "title", label: "Titre", placeholder: "Procédure — désertion", requis: true },
        { cle: "class_id", label: "Classe", type: "select",
          valeur: classesEncadrees[0]?.id,
          options: classesEncadrees.map((c) => ({ valeur: c.id, libelle: c.name })) },
        { cle: "instructions", label: "Consigne", type: "textarea",
          placeholder: "Vous êtes avocat. Votre client est accusé de désertion…" },
        { cle: "exam_mode", label: "Mode examen (temps limité, réponses verrouillées)", type: "checkbox" },
        { cle: "minutes", label: "Durée en minutes (0 = libre)", type: "number", valeur: 0, min: 0, max: 240 }
      ],
      libelle: "Créer"
    });
    if (!sortie) return;
    try {
      const exercice = await exercices.creer({
        class_id: sortie.class_id, author_id: etat.utilisateur.id,
        title: sortie.title, instructions: sortie.instructions || null,
        status: "draft", exam_mode: Boolean(sortie.exam_mode),
        duration_sec: sortie.minutes ? sortie.minutes * 60 : null, settings: {}
      });
      succes("Exercice créé", "Ajoutez maintenant vos questions.");
      aller(`/exercice/${exercice.id}`);
    } catch (err) {
      erreur("Création impossible", messageErreur(err));
    }
  }

  await peindre();
  return { noeud, titre: L("Exercices") };
}
