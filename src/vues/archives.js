/* ---------------------------------------------------------------------------
 * Archives : toutes les séances terminées, classe par classe.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { sessions } from "../data/index.js";
import { entete, blocVide } from "../ui/fragments.js";
import { dateLongue, dureeLongue, pluriel } from "../core/util.js";
import { messageErreur } from "../ui/toast.js";

export default async function vueArchives({ requete }) {
  let classeFiltre = requete?.classe || "toutes";
  const zone = el("div");

  const noeud = el("div.page",
    entete("Archives", "Séances passées",
      "Chaque session terminée conserve son tableau, ses documents, ses exercices et sa feuille de présence."),
    el("div.onglets", { ref: peindreFiltres }),
    zone
  );

  function peindreFiltres(hote) {
    const items = [{ cle: "toutes", libelle: "Toutes" },
      ...etat.classes.map((c) => ({ cle: c.id, libelle: c.name }))];
    render(hote, items.map((item) => el("button.onglet", {
      role: "tab", "aria-selected": String(item.cle === classeFiltre),
      onclick: () => { classeFiltre = item.cle; peindreFiltres(hote); peindre(); }
    }, item.libelle)));
  }

  async function peindre() {
    render(zone, el("p.petit.faible", "Chargement…"));
    const classes = classeFiltre === "toutes"
      ? etat.classes
      : etat.classes.filter((c) => c.id === classeFiltre);

    if (!classes.length) {
      render(zone, blocVide("Aucune classe", "Rejoignez une classe pour consulter ses archives."));
      return;
    }

    const blocs = [];
    for (const classe of classes) {
      let liste = [];
      try { liste = await sessions.archivees(classe.id); }
      catch (err) { console.warn("[archives]", messageErreur(err)); }
      if (!liste.length) continue;

      blocs.push(el("div.panneau",
        el("div.panneau__entete",
          el("span.panneau__titre", classe.name),
          el("span.petit.faible", pluriel(liste.length, "séance"))
        ),
        el("div.panneau__corps.panneau__corps--serre",
          el("div.liste", liste.map((s) => el("a.liste__item", { href: `#/archive/${s.id}` },
            icone("archives", 16),
            el("div.liste__principal",
              el("div.liste__nom", s.title),
              el("div.liste__detail",
                [dateLongue(s.started_at),
                 s.ended_at && s.started_at
                   ? dureeLongue((new Date(s.ended_at) - new Date(s.started_at)) / 1000) : null,
                 s.summary?.participants != null ? pluriel(s.summary.participants, "participant") : null
                ].filter(Boolean).join(" · "))
            ),
            el("div.liste__fin", icone("chevronD", 14))
          )))
        )
      ));
    }

    render(zone, blocs.length ? blocs : blocVide("Aucune archive", "Les séances terminées apparaîtront ici."));
  }

  await peindre();
  return { noeud, titre: "Archives" };
}
