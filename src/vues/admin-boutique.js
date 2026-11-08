/* ---------------------------------------------------------------------------
 * Administration de la boutique.
 *
 * Tout ce qui se règle ici se règle SANS toucher au code : commandes à livrer,
 * prix et quantités des articles, mise en vente ou retrait, réglages de
 * l'encre, des cahiers et des pages, et le suivi des comptes.
 *
 * LE PAIEMENT SE FAIT EN JEU. Une commande arrive ici sous forme de missive ;
 * le PDG la livre quand il a été payé en jeu et que l'élève est à proximité.
 * « Livrer » est LE geste qui crédite l'encre ou le cahier — rien d'autre ne
 * le fait, et il n'est pas annulable : vérifiez le paiement avant de cliquer.
 *
 * Cet écran est un confort, pas la sécurité : la base refuse toute écriture qui
 * ne vient pas d'une fonction réservée à la permission MANAGE_SHOP. Un
 * changement de prix ne touche jamais une commande déjà passée.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { logoPigeon } from "../ui/pigeon.js";
import { etat } from "../core/store.js";
import { formaterPrix, montantEnTexte, lireMontant, monnaieReelle } from "../core/prix.js";
import { boutique } from "../data/index.js";
import { formulaire, confirmer, demander } from "../ui/modal.js";
import { succes, erreur, messageErreur } from "../ui/toast.js";
import { onglets as fOnglets } from "../ui/fragments.js";

const STATUTS = { pending: "En attente", paid: "Livrée", failed: "Échouée", canceled: "Refusée / retirée", refunded: "Remboursée" };
const nombre = (n) => Number(n).toLocaleString("fr-FR");
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

export async function sectionBoutique() {
  let partie = "commandes";
  let recherche = "";
  let devise = "";
  let enAttente = 0;
  const corps = el("div.pile");
  const barre = el("div");
  const racine = el("div.pile", barre, corps);

  const parties = () => [
    { cle: "commandes", libelle: "Commandes", compteur: enAttente || null },
    { cle: "produits", libelle: "Articles" },
    { cle: "reglages", libelle: "Réglages" },
    { cle: "comptes", libelle: "Comptes" },
    { cle: "historique", libelle: "Historique des prix" }
  ];
  const peindreBarre = () => render(barre, fOnglets(parties(), partie, (cle) => { partie = cle; peindreBarre(); peindre(); }));

  async function peindre() {
    render(corps, el("p.petit.faible", "Chargement…"));
    try {
      const r = await boutique.reglages();
      devise = typeof r.currency === "string" ? r.currency : "";
      const toutes = await boutique.commandes(300);
      enAttente = toutes.filter((c) => c.status === "pending").length;
      peindreBarre();
      const rendu = { commandes, produits, reglages, comptes, historique }[partie];
      render(corps, await rendu(r, toutes));
    } catch (err) {
      render(corps, el("p.faible", `Chargement impossible : ${messageErreur(err)}`));
    }
  }

  /* ---- Commandes : les missives à livrer ---------------------------------- */
  async function commandes(_r, toutes) {
    const noms = new Map((await boutique.apercu(null, 1000).catch(() => [])).map((c) => [c.o_user_id, c.o_nom]));
    const attente = toutes.filter((c) => c.status === "pending").reverse();
    const passees = toutes.filter((c) => c.status !== "pending").slice(0, 40);
    const ligne = (c, actions) => el("div.liste__item",
      el("div.liste__principal",
        el("div.liste__nom", c.product_label, " ", el("span.etiq", formaterPrix(c.unit_price_cents, c.currency))),
        el("div.liste__detail", `${noms.get(c.user_id) || "compte supprimé"} · ${quand(c.created_at)}`),
        c.message ? el("div.liste__detail", { style: { fontStyle: "italic" } }, `« ${c.message} »`) : null,
        c.decision_note && c.status !== "pending" ? el("div.liste__detail", c.decision_note) : null),
      el("div.liste__fin", ...(actions || [el("span.etiq", STATUTS[c.status] || c.status)])));

    return el("div.pile",
      el("div.ligne-flex", logoPigeon(40),
        el("p.petit.faible", { style: { margin: 0 } },
          "Chaque missive est une commande d'un élève. Livrez-la en jeu, une fois payé et si l'élève est à proximité, "
          + "puis cliquez « Livrer » : c'est ce geste qui crédite l'encre ou le cahier.")),
      el("div.panneau", el("div.panneau__entete", el("span.panneau__titre", `À livrer (${attente.length})`)),
        el("div.panneau__corps.panneau__corps--serre",
          attente.length ? el("div.liste", attente.map((c) => ligne(c, [
            el("button.btn.btn--primaire", { onclick: () => livrer(c, noms.get(c.user_id)) }, "Livrer — payé en jeu"),
            el("button.btn.btn--fantome", { onclick: () => refuser(c) }, "Refuser")
          ])))
          : el("p.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Aucune missive en attente."))),
      passees.length ? el("div.panneau", el("div.panneau__entete", el("span.panneau__titre", "Déjà traitées")),
        el("div.panneau__corps.panneau__corps--serre", el("div.liste", passees.map((c) => ligne(c))))) : null
    );
  }

  async function livrer(c, nom) {
    const ok = await confirmer({
      titre: "Livrer la commande",
      message: `${nom || "L'élève"} commande « ${c.product_label} » (${formaterPrix(c.unit_price_cents, c.currency)}). `
        + "Confirmez seulement si vous avez été payé en jeu : l'encre ou le cahier est crédité tout de suite, et ce geste ne s'annule pas.",
      libelle: "Livrer"
    });
    if (!ok) return;
    try { await boutique.livrerCommande(c.id); succes("Commande livrée", "Le compte de l'élève est crédité."); await peindre(); }
    catch (err) { erreur("Livraison impossible", messageErreur(err)); }
  }

  async function refuser(c) {
    const motif = await demander({
      titre: "Refuser la commande", label: "Motif (l'élève le verra)", libelle: "Refuser",
      aide: "Facultatif. Ex. : « paiement non reçu »."
    });
    if (motif === null || motif === undefined) return;
    try { await boutique.refuserCommande(c.id, motif || null); succes("Commande refusée"); await peindre(); }
    catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  /* ---- Articles ----------------------------------------------------------- */
  async function produits(r) {
    const liste = await boutique.tousLesProduits();
    const ouvertes = r.orders_open !== false;
    return el("div.pile",
      el("div.ligne-flex.ligne-flex--entre",
        el("p.petit.faible", ouvertes
          ? "Les commandes sont OUVERTES : les articles en vente peuvent être commandés."
          : "Les commandes sont FERMÉES : aucune missive ne peut être envoyée (voir Réglages)."),
        el("button.btn.btn--primaire", { onclick: () => editer(null) }, icone("plus", 15), "Nouvel article")),
      liste.length
        ? el("div.panneau", el("div.panneau__corps.panneau__corps--serre", el("div.liste", liste.map((p) => el("div.liste__item",
            el("div.liste__principal",
              el("div.liste__nom", p.label, " ", el("span.etiq", p.kind === "ink_cartridge" ? "Cartouche" : "Cahier")),
              el("div.liste__detail", [
                formaterPrix(p.price_cents, p.currency),
                p.kind === "ink_cartridge" ? `${nombre(p.ink_units)} caractères d'encre` : `${p.notebook_credits} cahier(s)`,
                `identifiant : ${p.sku}`
              ].join(" · "))),
            el("div.liste__fin",
              el("span.etiq", { class: p.active ? "etiq--ok" : "" }, p.active ? "En vente" : "Retiré"),
              el("button.btn.btn--fantome", { onclick: () => basculer(p) }, p.active ? "Retirer" : "Mettre en vente"),
              el("button.btn.btn--fantome.btn--icone", { "aria-label": "Modifier", onclick: () => editer(p) }, icone("crayon", 15))))))))
        : el("p.faible", "Aucun article. Créez une cartouche d'encre et un cahier supplémentaire.")
    );
  }

  async function basculer(p) {
    try {
      await boutique.enregistrerProduit({ id: p.id, active: !p.active });
      succes(p.active ? "Article retiré de la vente" : "Article mis en vente");
      await peindre();
    } catch (err) { erreur("Modification impossible", messageErreur(err)); }
  }

  async function editer(p) {
    const neuf = !p;
    const monnaie = p?.currency || devise;
    const champs = [
      ...(neuf ? [
        { cle: "kind", label: "Genre", type: "select", valeur: "ink_cartridge",
          options: [{ valeur: "ink_cartridge", libelle: "Cartouche d'encre" }, { valeur: "notebook", libelle: "Cahier supplémentaire" }] },
        { cle: "sku", label: "Identifiant (minuscules, chiffres, tirets)", valeur: "", requis: true, placeholder: "cartouche-moyenne" }
      ] : []),
      { cle: "label", label: "Nom affiché", valeur: p?.label || "", requis: true },
      { cle: "description", label: "Description (facultatif)", valeur: p?.description || "" },
      { cle: "prix", label: `Prix${monnaie ? ` (en ${monnaie}` : " ("}${monnaieReelle(monnaie) ? ", ex. 2,50" : (monnaie ? ", nombre entier" : "nombre entier")})`,
        valeur: p ? montantEnTexte(p.price_cents, monnaie) : "", requis: true },
      { cle: "quantite", label: p?.kind === "notebook" ? "Cahiers accordés" : "Encre accordée (caractères) — pour un cahier : nombre de cahiers",
        valeur: p ? String(p.kind === "notebook" ? p.notebook_credits : p.ink_units) : "", requis: true },
      { cle: "actif", label: "En vente", type: "checkbox", valeur: p?.active || false }
    ];
    const sortie = await formulaire({
      titre: neuf ? "Nouvel article" : `Modifier — ${p.label}`, champs, libelle: "Enregistrer",
      note: "Le nouveau prix ne s'applique qu'aux commandes futures ; les missives déjà envoyées gardent leur prix."
    });
    if (!sortie) return;

    const montant = lireMontant(sortie.prix, monnaie);
    const quantite = parseInt(String(sortie.quantite).replace(/\s/g, ""), 10);
    if (!montant) { erreur("Prix invalide", "Le prix doit être un nombre supérieur à zéro."); return; }
    if (!Number.isInteger(quantite) || quantite <= 0) { erreur("Quantité invalide", "La quantité doit être supérieure à zéro."); return; }

    const genre = neuf ? sortie.kind : p.kind;
    const donnees = {
      label: sortie.label, description: sortie.description || "", price_cents: montant, active: Boolean(sortie.actif),
      ...(genre === "notebook" ? { notebook_credits: quantite, ink_units: 0 } : { ink_units: quantite, notebook_credits: 0 })
    };
    if (neuf) Object.assign(donnees, { sku: sortie.sku, kind: sortie.kind, currency: devise });
    else donnees.id = p.id;

    try { await boutique.enregistrerProduit(donnees); succes("Article enregistré"); await peindre(); }
    catch (err) { erreur("Enregistrement impossible", messageErreur(err)); }
  }

  /* ---- Réglages : tout ce que vous pouvez ajuster ------------------------- */
  async function reglages(r) {
    const entier = (cle, libelle, aide) => ligneReglage(libelle, aide, String(r[cle] ?? ""), async (texte) => {
      const v = parseInt(String(texte).replace(/\s/g, ""), 10);
      if (!Number.isInteger(v) || v < 0) throw new Error("Entier positif ou nul attendu.");
      await boutique.regler(cle, v);
    });
    const ouvertes = r.orders_open !== false;
    return el("div.pile",
      el("div.panneau", el("div.panneau__entete", el("span.panneau__titre", "Limites (encre et pages)")),
        el("div.panneau__corps.panneau__corps--serre", el("div.liste",
          entier("starter_ink", "Encre offerte à l'inscription", "Caractères donnés à chaque nouveau compte. Gardez-le petit : au-delà, l'élève vous commande de l'encre."),
          entier("max_pages", "Pages par cahier", "Un cahier personnel est plein à ce nombre de pages. 0 = pas de limite."),
          entier("free_notebooks", "Cahiers personnels offerts", "Au-delà, chaque nouveau cahier se commande. Supprimer un cahier n'en rend aucun.")))),
      el("div.panneau", el("div.panneau__entete", el("span.panneau__titre", "Coût de l'encre")),
        el("div.panneau__corps.panneau__corps--serre", el("div.liste",
          entier("char_cost", "Encre par caractère écrit", "1 = un caractère consomme une unité d'encre."),
          entier("stroke_cost", "Encre par tracé au tableau", "Coût d'un trait, d'une forme ou d'une flèche."),
          entier("attachment_cost", "Encre par image ou pièce jointe", "Coût d'une image insérée dans une page.")))),
      el("div.panneau", el("div.panneau__entete", el("span.panneau__titre", "Monnaie et rôles")),
        el("div.panneau__corps.panneau__corps--serre", el("div.liste",
          ligneTexte("Monnaie du jeu", "Unité affichée avec les prix (au choix, 20 caractères au plus ; vide = aucune unité).", String(r.currency || ""),
            async (texte) => { await boutique.regler("currency", String(texte).trim()); }),
          el("div.liste__item",
            el("div.liste__principal", el("div.liste__nom", "Rôles dispensés d'encre, de quota et de pages"),
              el("div.liste__detail", (r.exempt_roles || []).join(", ") || "aucun")),
            el("div.liste__fin", el("button.btn", { onclick: modifierExemptions }, "Modifier")))))),
      el("div.panneau", el("div.panneau__entete", el("span.panneau__titre", "Commandes")),
        el("div.panneau__corps",
          el("p", ouvertes ? "Les commandes sont ouvertes." : "Les commandes sont fermées."),
          el("p.petit.faible", "Fermées, plus aucune missive ne peut être envoyée. Les missives déjà envoyées restent à traiter."),
          el("button.btn", { class: ouvertes ? "" : "btn--primaire", onclick: () => basculerCommandes(!ouvertes) },
            ouvertes ? "Fermer les commandes" : "Ouvrir les commandes")))
    );
  }

  function ligneReglage(titre, aide, valeur, enregistrer) {
    const champ = el("input.saisie", { value: valeur, inputmode: "numeric", style: { maxWidth: "9rem" } });
    return el("div.liste__item",
      el("div.liste__principal", el("div.liste__nom", titre), el("div.liste__detail", aide)),
      el("div.liste__fin", champ,
        el("button.btn", {
          onclick: async () => {
            try { await enregistrer(champ.value); succes("Réglage enregistré"); }
            catch (err) { erreur("Réglage refusé", messageErreur(err)); }
          }
        }, "Enregistrer")));
  }
  const ligneTexte = (titre, aide, valeur, enregistrer) => {
    const l = ligneReglage(titre, aide, valeur, enregistrer);
    l.querySelector("input").removeAttribute("inputmode");
    return l;
  };

  async function modifierExemptions() {
    const saisie = await demander({
      titre: "Rôles dispensés", label: "Clés de rôle séparées par des virgules",
      valeur: ((await boutique.reglages()).exempt_roles || []).join(", "),
      aide: "Ex. pdg, super_admin, admin, director, teacher, instructor"
    });
    if (saisie == null) return;
    const liste = saisie.split(",").map((x) => x.trim()).filter(Boolean);
    try { await boutique.regler("exempt_roles", liste); succes("Liste enregistrée"); await peindre(); }
    catch (err) { erreur("Liste refusée", messageErreur(err)); }
  }

  async function basculerCommandes(ouvrir) {
    try { await boutique.regler("orders_open", ouvrir); await peindre(); }
    catch (err) { erreur("Changement refusé", messageErreur(err)); }
  }

  /* ---- Comptes : soldes d'encre et cahiers --------------------------------- */
  async function comptes() {
    const lignes = await boutique.apercu(recherche || null, 300);
    return el("div.pile",
      el("input.saisie", {
        type: "search", placeholder: "Rechercher un compte…", value: recherche,
        oninput: (e) => { recherche = e.target.value; clearTimeout(e.target._t); e.target._t = setTimeout(peindre, 300); }
      }),
      el("div.panneau", el("div.panneau__corps.panneau__corps--serre",
        lignes.length ? el("div.liste", lignes.map((c) => el("div.liste__item",
          el("div.liste__principal",
            el("div.liste__nom", c.o_nom, " ", el("span.etiq", c.o_role)),
            el("div.liste__detail", [
              `encre : ${nombre(c.o_solde)} (reçue ${nombre(c.o_recu)}, consommée ${nombre(c.o_consomme)})`,
              `cahiers : ${c.o_cahiers_possedes} possédé(s), ${c.o_cahiers_crees} créé(s) sur ${c.o_cahiers_autorises} autorisé(s)`,
              c.o_achats ? `${c.o_achats} commande(s) livrée(s)` : null
            ].filter(Boolean).join(" · "))),
          el("div.liste__fin",
            el("button.btn.btn--fantome", { onclick: () => donnerEncre(c) }, "Encre…"),
            el("button.btn.btn--fantome", { onclick: () => donnerCahiers(c) }, "Cahiers…")))))
          : el("p.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Aucun compte.")
      ))
    );
  }

  async function donnerEncre(c) {
    const sortie = await formulaire({
      titre: `Encre — ${c.o_nom}`, libelle: "Appliquer",
      note: `Solde actuel : ${nombre(c.o_solde)}. Un nombre négatif retire de l'encre (jamais sous ce qui est déjà consommé). Le geste est inscrit au journal.`,
      champs: [
        { cle: "montant", label: "Montant (+ ou −)", valeur: "", requis: true },
        { cle: "note", label: "Motif (facultatif)", valeur: "" }
      ]
    });
    if (!sortie) return;
    const montant = parseInt(String(sortie.montant).replace(/\s/g, ""), 10);
    if (!Number.isInteger(montant) || montant === 0) { erreur("Montant invalide", "Entier non nul attendu."); return; }
    try { await boutique.donnerEncre(c.o_user_id, montant, sortie.note || null); succes("Encre ajustée"); await peindre(); }
    catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  async function donnerCahiers(c) {
    const sortie = await formulaire({
      titre: `Cahiers — ${c.o_nom}`, libelle: "Appliquer",
      note: "Offre (ou retire) des droits de création de cahiers. Ne supprime jamais un cahier existant.",
      champs: [
        { cle: "nombre", label: "Nombre (+ ou −)", valeur: "1", requis: true },
        { cle: "note", label: "Motif (facultatif)", valeur: "" }
      ]
    });
    if (!sortie) return;
    const n = parseInt(sortie.nombre, 10);
    if (!Number.isInteger(n) || n === 0) { erreur("Nombre invalide", "Entier non nul attendu."); return; }
    try { await boutique.donnerCahiers(c.o_user_id, n, sortie.note || null); succes("Droits ajustés"); await peindre(); }
    catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  /* ---- Historique des prix -------------------------------------------------- */
  async function historique() {
    const lignes = await boutique.historiquePrix(200);
    const noms = new Map((await boutique.apercu(null, 1000).catch(() => [])).map((c) => [c.o_user_id, c.o_nom]));
    const delta = (avant, apres, f) => (avant == null ? f(apres) : avant === apres ? null : `${f(avant)} → ${f(apres)}`);
    return el("div.panneau", el("div.panneau__corps.panneau__corps--serre",
      lignes.length ? el("div.liste", lignes.map((h) => {
        const prixDelta = delta(h.old_price_cents, h.new_price_cents, (v) => formaterPrix(v, devise));
        const encreDelta = Number(h.new_ink_units) > 0 ? delta(h.old_ink_units, h.new_ink_units, nombre) : null;
        const cahiersDelta = Number(h.new_notebook_credits) > 0 ? delta(h.old_notebook_credits, h.new_notebook_credits, nombre) : null;
        return el("div.liste__item",
          el("div.liste__principal",
            el("div.liste__nom", h.product_sku, " ", el("span.etiq", h.operation === "create" ? "Création" : "Modification")),
            el("div.liste__detail", [
              prixDelta && `prix : ${prixDelta}`,
              encreDelta && `encre : ${encreDelta}`,
              cahiersDelta && `cahiers : ${cahiersDelta}`,
              h.old_active !== h.new_active ? `vente : ${h.old_active == null ? "" : h.old_active ? "oui → " : "non → "}${h.new_active ? "oui" : "non"}` : null
            ].filter(Boolean).join(" · ") || "—")),
          el("div.liste__fin", el("span.petit.faible", `${quand(h.changed_at)} · ${noms.get(h.changed_by) || (h.changed_by === etat.utilisateur?.id ? "vous" : "administrateur")}`)));
      }))
        : el("p.faible", { style: { padding: "var(--e-4)", margin: 0 } }, "Aucun changement enregistré.")));
  }

  peindreBarre();
  await peindre();
  return racine;
}
