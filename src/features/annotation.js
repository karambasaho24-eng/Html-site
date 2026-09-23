/* ---------------------------------------------------------------------------
 * La marge.
 *
 * « Le professeur peut écrire sur le cahier d'un élève. Il écrit dessus,
 * rien de plus. » Toute la conception tient dans cette phrase : la copie du
 * cadet reste mot pour mot ce qu'il a écrit, et la correction se tient à
 * côté, d'une autre encre, signée.
 *
 * C'est aussi pourquoi l'annotation n'est pas un droit d'écriture sur la
 * page : si le maître pouvait récrire le texte, on ne saurait plus jamais ce
 * que le cadet avait vraiment rendu — et une copie qu'on peut réécrire après
 * coup ne vaut rien, ni comme preuve, ni comme scène.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { annotations } from "../data/index.js";
import { erreur, messageErreur } from "../ui/toast.js";

export const ENCRES = [
  { cle: "rouge", libelle: "Rouge — la correction" },
  { cle: "verte", libelle: "Verte — l'encouragement" },
  { cle: "bleue", libelle: "Bleue — la remarque" }
];

/**
 * Le volet de marge, qui suit la page ouverte.
 *
 * `peutAnnoter` sépare les deux usages du même volet : le maître y écrit,
 * le propriétaire du cahier ne fait qu'y lire ce qu'on lui a mis.
 */
export function creerMarge({ peutAnnoter, auteurId, nomAuteur = "Vous", noms = new Map() }) {
  const liste = el("div.marge__liste");
  const zoneSaisie = el("div");
  const racine = el("aside.marge",
    el("span.controle-materiel__titre", icone("crayon", 12), " Dans la marge"),
    liste, zoneSaisie);

  let pageId = null;

  async function suivre(page) {
    pageId = page?.id || null;
    await recharger();
    peindreSaisie();
  }

  async function recharger() {
    if (!pageId) { render(liste, el("p.marge__vide", "Aucune page ouverte.")); return; }
    let lignes = [];
    try { lignes = await annotations.dePage(pageId); } catch { lignes = []; }
    render(liste, lignes.length
      ? lignes.map((a) => el("div.annotation", { dataset: { encre: a.ink || "rouge" } },
          el("span.annotation__main",
            a.author_id === auteurId ? nomAuteur : (noms.get(a.author_id) || "L'encadrement")),
          a.body))
      : el("p.marge__vide", peutAnnoter
          ? "Rien dans la marge. Ce que vous écrirez ici ne touchera pas sa copie."
          : "Rien dans la marge de cette page."));
  }

  function peindreSaisie() {
    if (!peutAnnoter || !pageId) { render(zoneSaisie); return; }
    let texte, encre;
    render(zoneSaisie, el("form.marge__saisie", {
      onsubmit: async (e) => {
        e.preventDefault();
        const corps = texte.value.trim();
        if (!corps) return;
        try {
          await annotations.ecrire({
            page_id: pageId, author_id: auteurId, body: corps, ink: encre.value
          });
          texte.value = "";
          await recharger();
        } catch (err) {
          erreur("Annotation non portée", messageErreur(err));
        }
      }
    },
      texte = el("textarea.saisie", {
        rows: 2, placeholder: "« Revoyez la deuxième ligne. »", required: true
      }),
      el("div.marge__pied",
        encre = el("select.saisie", ENCRES.map((i) =>
          el("option", { value: i.cle }, i.libelle))),
        el("button.btn.btn--primaire", { type: "submit" }, icone("crayon", 14), "Écrire"))
    ));
  }

  render(liste, el("p.marge__vide", "Aucune page ouverte."));
  return { noeud: racine, suivre };
}
