/* ---------------------------------------------------------------------------
 * Recherche globale : cahiers, pages, classes, documents, exercices, annonces.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { cahiers, pages, documents, exercices, annonces } from "../data/index.js";
import { entete, blocVide } from "../ui/fragments.js";
import { texteBrut } from "../core/assainir.js";
import { aplatir, debounce, tronquer, depuis } from "../core/util.js";

export default async function vueRecherche({ requete }) {
  const resultats = el("div.pile");
  let champ;

  const noeud = el("div.page",
    entete("Recherche", "Recherche globale",
      "Cahiers, pages, classes, documents, exercices et annonces."),
    el("div.panneau", el("div.panneau__corps",
      champ = el("input.saisie", {
        type: "search", placeholder: "Un mot, un titre, une notion…",
        value: requete?.q || "", autofocus: true,
        "aria-label": "Recherche",
        oninput: (e) => lancer(e.target.value)
      })
    )),
    resultats
  );

  const lancer = debounce(async (terme) => {
    const requis = aplatir(terme).trim();
    if (requis.length < 2) {
      render(resultats, blocVide("Tapez au moins deux caractères", ""));
      return;
    }
    render(resultats, el("p.petit.faible", "Recherche…"));

    const groupes = [];

    // Classes
    const classesTrouvees = etat.classes.filter((c) =>
      aplatir(`${c.name} ${c.subject || ""} ${c.level || ""} ${c.code}`).includes(requis));
    if (classesTrouvees.length) {
      groupes.push(groupe("Classes", classesTrouvees.map((c) => ({
        titre: c.name, detail: [c.subject, c.level].filter(Boolean).join(" · ") || c.code,
        lien: `/classe/${c.id}`, icone: "classe"
      }))));
    }

    // Cahiers et pages
    try {
      const mesCahiers = await cahiers.mesCahiers(etat.utilisateur.id);
      const communs = [];
      for (const classe of etat.classes) {
        const commun = await cahiers.commun(classe.id).catch(() => null);
        if (commun) communs.push(commun);
      }
      const tous = [...mesCahiers, ...communs];

      const cahiersTrouves = tous.filter((c) => aplatir(c.title).includes(requis));
      if (cahiersTrouves.length) {
        groupes.push(groupe("Cahiers", cahiersTrouves.map((c) => ({
          titre: c.title, detail: c.kind === "shared" ? "Cahier commun" : "Cahier personnel",
          lien: `/cahier/${c.id}`, icone: "cahier"
        }))));
      }

      const pagesTrouvees = [];
      for (const cahier of tous) {
        const liste = await pages.liste(cahier.id).catch(() => []);
        for (const page of liste) {
          const contenu = `${page.title} ${texteBrut(page.body)}`;
          if (aplatir(contenu).includes(requis)) {
            pagesTrouvees.push({
              titre: page.title, detail: `${cahier.title} · ${tronquer(texteBrut(page.body), 90)}`,
              lien: `/cahier/${cahier.id}?page=${page.id}`, icone: "cahiers"
            });
          }
          if (pagesTrouvees.length >= 30) break;
        }
      }
      if (pagesTrouvees.length) groupes.push(groupe("Pages", pagesTrouvees));
    } catch (err) {
      console.warn("[recherche] cahiers", err);
    }

    const ids = etat.classes.map((c) => c.id);
    if (ids.length) {
      const [docs, exos, annos] = await Promise.all([
        documents.liste({ class_id: ids }).catch(() => []),
        exercices.liste({ class_id: ids }, 200).catch(() => []),
        annonces.liste({ class_id: ids }, 100).catch(() => [])
      ]);

      const docsTrouves = docs.filter((d) => aplatir(d.title).includes(requis));
      if (docsTrouves.length) {
        groupes.push(groupe("Documents", docsTrouves.map((d) => ({
          titre: d.title, detail: nomClasse(d.class_id),
          lien: `/documents?classe=${d.class_id}`, icone: "documents"
        }))));
      }

      const exosTrouves = exos.filter((e) =>
        aplatir(`${e.title} ${e.instructions || ""}`).includes(requis));
      if (exosTrouves.length) {
        groupes.push(groupe("Exercices", exosTrouves.map((e) => ({
          titre: e.title, detail: nomClasse(e.class_id),
          lien: `/exercice/${e.id}`, icone: "exercices"
        }))));
      }

      const annosTrouvees = annos.filter((a) =>
        aplatir(`${a.title} ${a.body || ""}`).includes(requis));
      if (annosTrouvees.length) {
        groupes.push(groupe("Annonces", annosTrouvees.map((a) => ({
          titre: a.title, detail: `${nomClasse(a.class_id)} · ${depuis(a.created_at)}`,
          lien: `/classe/${a.class_id}?onglet=annonces`, icone: "megaphone"
        }))));
      }
    }

    render(resultats, groupes.length
      ? groupes
      : blocVide("Aucun résultat", `Rien ne correspond à « ${terme} ».`));
  }, 280);

  function nomClasse(id) {
    return etat.classes.find((c) => c.id === id)?.name || "—";
  }

  function groupe(titre, items) {
    return el("div.panneau",
      el("div.panneau__entete",
        el("span.panneau__titre", titre),
        el("span.petit.faible", String(items.length))
      ),
      el("div.panneau__corps.panneau__corps--serre",
        el("div.liste", items.slice(0, 25).map((item) => el("a.liste__item", { href: `#${item.lien}` },
          icone(item.icone, 16),
          el("div.liste__principal",
            el("div.liste__nom", item.titre),
            el("div.liste__detail", item.detail)
          )
        )))
      )
    );
  }

  if (requete?.q) lancer(requete.q);
  else render(resultats, blocVide("Que cherchez-vous ?", "La recherche parcourt vos cahiers, vos classes et leurs contenus."));

  return { noeud, titre: "Recherche" };
}
