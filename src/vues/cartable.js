/* ---------------------------------------------------------------------------
 * Mon cartable.
 *
 * Cette page manquait, et son absence rendait tout le reste invisible : le sac
 * ne s'ouvrait que depuis une séance en cours, derrière un bouton. Hors séance,
 * on ne pouvait pas le préparer du tout — alors que préparer ses affaires est
 * justement ce qu'on fait AVANT d'entrer.
 *
 * Une classe par ligne : ce qu'on y a demandé, ce qu'on emporte, ce qui manque.
 * On boucle son sac quand on veut, et il sera la le jour venu.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import { cartable as depotCartable, cahiers as depotCahiers } from "../data/index.js";
import { entete, blocVide } from "../ui/fragments.js";
import { preparerAffaires, materielAttendu, imageObjet, TROUSSE_DEFAUT } from "../features/cartable.js";
import { messageErreur } from "../ui/toast.js";

export default async function vueCartable() {
  const conteneur = el("div");
  const noeud = el("div.page",
    entete("Mon cartable", "Ce que j'emporte",
      el("p.doux.petit",
        "Préparez vos affaires avant d'entrer en séance. Ce que vous mettez ici "
        + "est ce dont vous disposerez en cours — et la seule chose que "
        + `l'encadrement pourra vous demander d'ouvrir.`)),
    conteneur
  );

  await peindre();
  return { noeud, titre: "Mon cartable" };

  async function peindre() {
    render(conteneur, el("p.faible.petit", "Chargement..."));

    const classes = etat.classes.filter((c) => !c.archived);
    if (!classes.length) {
      render(conteneur, blocVide(
        `Aucune ${L("classe")}`,
        `Rejoignez une ${L("classe")} avec son code : c'est elle qui dit ce qu'il faut apporter.`,
        { libelle: `Mes ${L("classes")}`, action: () => aller("/classes") }
      ));
      return;
    }

    let mesSupports = [];
    try { mesSupports = await depotCahiers.mesCahiers(etat.utilisateur.id); } catch { mesSupports = []; }

    const sacs = new Map();
    for (const c of classes) {
      try { sacs.set(c.id, await depotCartable.pour(c.id, etat.utilisateur.id)); }
      catch { sacs.set(c.id, null); }
    }

    render(conteneur,
      el("div.grille.grille--2", classes.map((c) => carteClasse(c, sacs.get(c.id), mesSupports)))
    );
  }

  function carteClasse(classe, sac, mesSupports) {
    const attendu = materielAttendu(classe);
    const manque = depotCartable.manquants(sac, attendu);
    const nbManque = manque.supports.length + manque.fournitures.length;
    const emportes = Object.entries(
      Array.isArray(sac?.notebooks)
        ? Object.fromEntries((sac.notebooks || []).map((id) => [String(id), ""]))
        : (sac?.notebooks || {}));
    const trousse = (sac?.supplies || []).map(String);

    const demande = attendu.supports.length || attendu.fournitures.length;

    return el("article.carte.carte--cartable",
      el("header.carte__entete",
        el("h3.carte__titre", classe.name),
        sac
          ? (nbManque
              ? el("span.etiq.etiq--attn", icone("alerte", 12), `${nbManque} oubli${nbManque > 1 ? "s" : ""}`)
              : el("span.etiq.etiq--ok", icone("coche", 12), "En ordre"))
          : el("span.etiq.etiq--attn", icone("alerte", 12), "Sac vide")),

      demande
        ? el("p.petit.faible",
            icone("sac", 11), " Demandé : ",
            [...attendu.supports.map((s) => s.title), ...attendu.fournitures].join(" · "))
        : el("p.petit.faible", "Rien n'a été demandé pour cette " + L("classe") + "."),

      el("div.cartable__apercu",
        emportes.length || trousse.length
          ? [
              ...emportes.map(([id, titre]) => vignette(
                mesSupports.find((s) => String(s.id) === id)?.support || "cahier",
                titre || mesSupports.find((s) => String(s.id) === id)?.title || "Support")),
              ...trousse.map((f) => vignette(f, f))
            ]
          : el("p.petit.faible", "Vous n'emportez rien pour l'instant.")),

      el("div.carte__pied",
        el("button.btn.btn--primaire", {
          onclick: async () => {
            await preparerAffaires({ classe });
            await peindre();
          }
        }, icone("sac", 15), sac ? "Revoir mon sac" : "Préparer mon sac"),
        el("button.btn.btn--fantome", {
          onclick: () => aller(`/classe/${classe.id}`)
        }, "La " + L("classe")))
    );
  }

  function vignette(objet, titre) {
    return el("span.cartable__vignette", { title: titre },
      el("span.objet__figure", {
        dataset: { objet: TROUSSE_DEFAUT.includes(titre) ? "fourniture" : objet },
        "aria-hidden": "true",
        style: { backgroundImage: `url("${imageObjet(objet)}")` }
      }),
      el("span.cartable__vignette-nom", titre));
  }
}
