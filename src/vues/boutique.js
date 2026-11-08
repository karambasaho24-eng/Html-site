/* ---------------------------------------------------------------------------
 * Encre et cahiers — la boutique de l'élève.
 *
 * LE PAIEMENT SE FAIT EN JEU, pas sur le site. Pour obtenir de l'encre ou un
 * cahier supplémentaire, l'élève envoie une MISSIVE DE COMMANDE (un pigeon
 * voyageur la porte). Il paie ensuite en jeu et se tient à proximité : le PDG
 * lui livre sa commande une fois payé. Seule cette livraison crédite quoi que
 * ce soit — le site ne traite aucun paiement et ne crédite jamais rien de
 * lui-même.
 *
 * Prix et quantités sont lus en base, jamais saisis ici.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { logoPigeon } from "../ui/pigeon.js";
import { etat } from "../core/store.js";
import { formaterPrix } from "../core/prix.js";
import { boutique, temps } from "../data/index.js";
import { entete, blocVide } from "../ui/fragments.js";
import { formulaire, confirmer } from "../ui/modal.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";
import { chargerCommerce, libelleSolde } from "../features/encre.js";

const STATUTS = {
  pending: { mot: "En route", classe: "etiq--attn" },
  paid: { mot: "Livrée", classe: "etiq--ok" },
  canceled: { mot: "Refusée ou retirée", classe: "" },
  failed: { mot: "Échouée", classe: "" },
  refunded: { mot: "Remboursée", classe: "" }
};

const caracteres = (n) => `${Math.round(n).toLocaleString("fr-FR")} caractères d'encre`;

export default async function vueBoutique() {
  const solde = el("section.carte");
  const rayon = el("div.grille.grille--3");
  const missives = el("section.carte");
  let abonnement = null;

  const noeud = el("div.page",
    entete("Boutique", "Encre et cahiers",
      "L'encre sert à écrire dans vos cahiers. Vos notes déjà écrites restent toujours lisibles, même sans encre."),
    el("section.carte.missive-mode",
      el("div.missive-mode__logo", logoPigeon(64)),
      el("div.missive-mode__texte",
        el("h3", "Commander par missive"),
        el("ol.petit",
          el("li", "Choisissez un article et envoyez une ", el("b", "missive de commande"), " : un pigeon voyageur la porte."),
          el("li", "Payez en jeu, et tenez-vous à proximité."),
          el("li", "Une fois payé, le PDG vous livre votre commande en jeu : l'encre ou le cahier arrive alors sur votre compte.")),
        el("p.petit.faible", "Ce site ne prend aucun paiement : rien n'est crédité tant que le PDG n'a pas livré."))),
    solde, rayon, missives
  );

  function enAttentePour(commandes, produit) {
    return commandes.some((c) => c.status === "pending" && c.product_id === produit.id);
  }

  function peindreSolde() {
    const c = etat.commerce;
    if (!c) {
      render(solde, el("p.faible", "La boutique n'est pas disponible (la base n'est pas à jour)."));
      return;
    }
    render(solde,
      el("div.boutique__solde",
        el("div",
          el("span.petit.faible", "Encre restante"),
          el("div.boutique__chiffre", libelleSolde())),
        el("div",
          el("span.petit.faible", "Cahiers"),
          el("div.boutique__chiffre", c.exempte ? "Illimités"
            : c.cahiers.restants > 0 ? `${c.cahiers.restants} à créer` : "Tous créés"),
          el("span.petit.faible", c.exempte ? "" : `${c.cahiers.crees} créé${c.cahiers.crees > 1 ? "s" : ""} au total`)),
        el("div",
          el("span.petit.faible", "Pages par cahier"),
          el("div.boutique__chiffre", c.exempte || !c.pages_max ? "Sans limite" : `${c.pages_max} pages`))),
      c.exempte
        ? el("p.petit.faible", "Votre rôle est dispensé d'encre, de quota de cahiers et de limite de pages.")
        : el("p.petit.faible",
            "Le premier cahier est offert, les suivants se commandent. Supprimer un cahier ne rend ni argent ni cahier gratuit.")
    );
  }

  // Illustrations livrées avec le site (assets/boutique/<sku>.webp).
  const IMAGES_PRODUITS = new Set(["cartouche-petite", "cartouche-moyenne", "cartouche-grande", "cahier", "cahiers-lot-3"]);

  async function peindreRayon(commandes) {
    let produits = [];
    try { produits = await boutique.produits(); }
    catch (err) { render(rayon, el("p.faible", `Produits indisponibles : ${messageErreur(err)}`)); return; }

    if (!produits.length) {
      render(rayon, blocVide("Rien n'est en vente pour le moment",
        "Le PDG n'a pas encore ouvert d'article. Vos cahiers restent accessibles."));
      return;
    }
    const ouvertes = etat.commerce?.commandes_ouvertes !== false;
    render(rayon, produits.map((p) => {
      const deja = enAttentePour(commandes, p);
      const bouton = el("button.btn.btn--primaire", {
        type: "button", disabled: !ouvertes || deja,
        onclick: () => commander(p)
      }, logoPigeon(18), !ouvertes ? "Commandes fermées" : deja ? "Missive en route" : "Envoyer une missive");
      return el("article.carte.produit",
        IMAGES_PRODUITS.has(p.sku)
          ? el("img.produit__image", { src: `assets/boutique/${p.sku}.webp`, alt: "", loading: "lazy" })
          : null,
        el("h3", p.label),
        p.description ? el("p.petit.faible", p.description) : null,
        el("p", p.kind === "ink_cartridge"
          ? caracteres(p.ink_units)
          : `${p.notebook_credits} cahier${p.notebook_credits > 1 ? "s" : ""} supplémentaire${p.notebook_credits > 1 ? "s" : ""}`),
        el("p.produit__prix", formaterPrix(p.price_cents, p.currency)),
        bouton
      );
    }));
  }

  function peindreMissives(commandes) {
    if (!commandes.length) { render(missives, []); missives.hidden = true; return; }
    missives.hidden = false;
    render(missives,
      el("h3", "Mes missives"),
      el("ul.liste-achats", commandes.map((c) => {
        const st = STATUTS[c.status] || { mot: c.status, classe: "" };
        return el("li",
          el("span", c.product_label),
          el("span.petit.faible", new Date(c.created_at).toLocaleDateString("fr-FR")),
          el("span", formaterPrix(c.unit_price_cents, c.currency)),
          el("span.etiq", { class: st.classe }, st.mot),
          c.decision_note && c.status !== "pending" ? el("span.petit.faible", c.decision_note) : null,
          c.status === "pending"
            ? el("button.btn.btn--petit.btn--fantome", { onclick: () => retirer(c) }, "Retirer")
            : null);
      })));
  }

  async function commander(produit) {
    const sortie = await formulaire({
      titre: `Missive de commande — ${produit.label}`,
      libelle: "Envoyer la missive",
      note: `${formaterPrix(produit.price_cents, produit.currency)} à payer en jeu. `
        + "Le PDG livre en jeu, une fois payé, si vous êtes à proximité.",
      champs: [
        { cle: "message", label: "Un mot pour le PDG (facultatif)", valeur: "", type: "textarea", lignes: 3,
          placeholder: "Mon pseudo en jeu, où me trouver…" }
      ]
    });
    if (!sortie) return;
    try {
      await boutique.commander(produit.sku, sortie.message || null);
      succes("Missive envoyée", "Le pigeon est en route. Payez en jeu et restez à proximité.");
      await peindre();
    } catch (err) {
      erreur("Missive non envoyée", messageErreur(err));
    }
  }

  async function retirer(commande) {
    const ok = await confirmer({
      titre: "Retirer la missive", libelle: "Retirer", danger: true,
      message: "La commande en attente sera annulée. Vous ne perdez rien : rien n'est payé sur le site."
    });
    if (!ok) return;
    try { await boutique.annulerCommande(commande.id); await peindre(); }
    catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  async function peindre() {
    let commandes = [];
    try { commandes = await boutique.mesCommandes(etat.utilisateur.id); } catch { commandes = []; }
    await chargerCommerce();
    peindreSolde();
    await peindreRayon(commandes);
    peindreMissives(commandes);
  }

  await peindre();

  // Une livraison se voit tout de suite, sans recharger.
  try {
    abonnement = temps.sabonner({
      cle: `commandes:${etat.utilisateur.id}`,
      tables: [{ table: "purchases", filtre: `user_id=eq.${etat.utilisateur.id}` }],
      surChangement: () => { peindre(); }
    });
  } catch { /* temps réel indisponible : la page se met à jour à l'ouverture */ }

  return { noeud, titre: "Encre et cahiers", nettoyer: () => abonnement?.fermer?.() };
}
