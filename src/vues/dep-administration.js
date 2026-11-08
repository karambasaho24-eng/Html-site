/* ---------------------------------------------------------------------------
 * Département « Administration ».
 *
 * Tout ce qui circule entre les personnages : on reçoit des documents, on en
 * écrit, on les signe, on les donne. Le cahier reste à portée, puisqu'on y
 * écrit aussi.
 *
 * L'ordre de la page est l'ordre de l'urgence : d'abord ce qu'on vous tend
 * (quelqu'un attend devant vous, en jeu), ensuite ce que vous voulez faire,
 * enfin vos documents.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { ecouter, emettre } from "../core/bus.js";
import { L } from "../core/lexique.js";
import { depuis } from "../core/util.js";
import { papiers } from "../data/index.js";
import { ouvrirModale, confirmer } from "../ui/modal.js";
import { recevoirPapier, rendrePapier, MODELES } from "../features/papier.js";
import { creerCircuit, brouillons, jeterBrouillon } from "../features/circuit-document.js";
import { DEPARTEMENTS } from "../core/departements.js";
import { enteteDepartement, grandeAction, sectionDep, astuceFlottant } from "../ui/departement.js";

const DEP = DEPARTEMENTS.find((d) => d.cle === "administration");
const ETATS = {
  offered: "En attente de réponse", accepted: "Accepté", refused: "Refusé", withdrawn: "Retiré"
};

export default async function vueDepAdministration({ requete = {} } = {}) {
  const moi = etat.utilisateur.id;
  let onglet = "signes";
  let recus = [], miens = [], envoyes = [];

  const zoneRecevoir = el("div");
  const zoneActions = el("div");
  const zoneDocuments = el("div");

  const noeud = el("div.page.dep", { dataset: { departement: "administration" } },
    enteteDepartement(DEP, "Recevoir, écrire, signer et donner des documents. Ce qu'on vous tend passe en premier."),
    astuceFlottant(),
    zoneRecevoir,
    zoneActions,
    zoneDocuments);

  async function charger() {
    [recus, miens, envoyes] = await Promise.all([
      papiers.recus(moi).catch(() => []),
      papiers.mesPapiers(moi).catch(() => []),
      papiers.envoyes(moi).catch(() => [])
    ]);
    peindreRecevoir();
    peindreDocuments();
  }

  /* --- À recevoir --------------------------------------------------------- */
  function peindreRecevoir() {
    const attente = recus.filter((r) => r.state === "offered");
    render(zoneRecevoir, attente.length ? sectionDep("À recevoir", el("div.dep__liste",
      attente.map((r) => grandeAction({
        primaire: true, image: "feuille",
        titre: `${r.auteur?.display_name || "Quelqu'un"} vous tend « ${r.papier?.title || "un document"} »`,
        aide: `${r.lieu ? `${r.lieu} · ` : ""}${depuis(r.created_at)} — touchez pour le recevoir`,
        action: async () => { await recevoirPapier(r); emettre("papiers:change"); charger(); }
      }))), { compte: attente.length }) : []);
  }

  /* --- Que voulez-vous faire ? ------------------------------------------- */
  function peindreActions() {
    render(zoneActions, sectionDep("Que voulez-vous faire ?", el("div.dep__grille",
      grandeAction({
        primaire: true, image: "plume", titre: "Écrire un document",
        aide: "Écrire, signer, puis le donner à quelqu'un", action: () => ouvrirCircuit()
      }),
      grandeAction({
        image: "cahier", titre: `Écrire dans mon ${L("cahier")}`,
        aide: "Ouvrir le cahier posé sur votre bureau", action: () => ouvrirCahier()
      }),
      grandeAction({
        image: "dossier", titre: "Mes documents",
        aide: "Brouillons, documents signés, reçus", action: () => zoneDocuments.scrollIntoView({ behavior: "smooth" })
      }))));
  }

  function ouvrirCircuit(options = {}) {
    const circuit = creerCircuit({
      ...options,
      surFin: () => { peindreActions(); charger(); }
    });
    render(zoneActions, circuit.noeud);
    circuit.noeud.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function ouvrirCahier() {
    const dernier = (etat.cahiers || []).find((c) => c.owner_id === moi) || etat.cahiers?.[0];
    aller(dernier ? `/cahier/${dernier.id}` : "/cahiers");
  }

  /* --- Mes documents ------------------------------------------------------ */
  function peindreDocuments() {
    const brouillonsLocaux = brouillons();
    const gardes = recus.filter((r) => r.state === "accepted" && r.papier);
    const derniereRemise = new Map();
    for (const e of envoyes) if (!derniereRemise.has(e.paper_id)) derniereRemise.set(e.paper_id, e);

    const ONGLETS = [
      { cle: "signes", libelle: "Signés", n: miens.length },
      { cle: "recus", libelle: "Reçus", n: gardes.length },
      { cle: "brouillons", libelle: "Brouillons", n: brouillonsLocaux.length }
    ];

    const ligne = (titre, meta, actions) => el("div.doc-rang",
      el("span.doc-rang__feuille", { "aria-hidden": "true" }),
      el("span.doc-rang__textes", el("span.doc-rang__titre", titre), el("span.doc-rang__meta", meta)),
      el("span.doc-rang__actions", actions));

    let contenu;
    if (onglet === "signes") {
      contenu = miens.length ? miens.map((p) => {
        const remise = derniereRemise.get(p.id);
        return ligne(p.title, [MODELES[p.model]?.libelle, remise ? ETATS[remise.state] : "Pas encore donné", depuis(p.created_at)]
          .filter(Boolean).join(" · "), [
          el("button.btn.btn--petit.btn--fantome", { type: "button", onclick: () => lire(p, etat.profil) }, "Lire"),
          el("button.btn.btn--petit", { type: "button", onclick: () => ouvrirCircuit({ papier: p }) },
            icone("echange", 13), "Donner")
        ]);
      }) : el("p.dep__calme", "Aucun document signé. Écrivez-en un : il apparaîtra ici.");
    } else if (onglet === "recus") {
      contenu = gardes.length ? gardes.map((r) => ligne(r.papier.title,
        `De ${r.auteur?.display_name || "quelqu'un"} · ${depuis(r.settled_at || r.created_at)}`,
        [el("button.btn.btn--petit.btn--fantome", { type: "button", onclick: () => lire(r.papier, r.auteur) }, "Lire")]))
        : el("p.dep__calme", "Aucun document reçu pour l'instant.");
    } else {
      contenu = brouillonsLocaux.length ? brouillonsLocaux.map((b) => ligne(
        b.title || MODELES[b.model]?.titreDefaut || "Brouillon",
        `Brouillon · ${depuis(b.maj)} · seulement sur cet appareil`, [
          el("button.btn.btn--petit.btn--fantome", { type: "button", onclick: async () => {
            if (await confirmer({ titre: "Jeter ce brouillon ?", message: "Il sera perdu.", libelle: "Jeter", danger: true })) {
              jeterBrouillon(b.id); peindreDocuments();
            }
          } }, "Jeter"),
          el("button.btn.btn--petit", { type: "button", onclick: () => ouvrirCircuit({ brouillon: b }) },
            icone("crayon", 13), "Reprendre")
        ])) : el("p.dep__calme", "Aucun brouillon. Ce que vous écrivez sans signer est gardé ici.");
    }

    render(zoneDocuments, sectionDep("Mes documents", el("div",
      el("div.onglets.dep__onglets", { role: "tablist" }, ONGLETS.map((o) => el("button.onglet", {
        type: "button", role: "tab", "aria-selected": String(o.cle === onglet),
        onclick: () => { onglet = o.cle; peindreDocuments(); }
      }, o.libelle, o.n ? el("span.compteur", ` ${o.n}`) : null))),
      el("div.dep__documents", contenu)), {
      action: el("a.btn.btn--fantome.btn--petit", { href: "#/papiers" }, "Classer en dossiers")
    }));
  }

  function lire(p, auteur) {
    ouvrirModale({
      titre: p.title || "Document", large: true,
      corps: () => el("div.reception", el("div.reception__main", rendrePapier(p, { auteur }))),
      actions: [{ libelle: "Refermer", variante: "primaire", valeur: true }]
    });
  }

  const lacher = ecouter("papiers:change", charger);
  peindreActions();
  await charger();
  if (requete.ecrire) ouvrirCircuit();

  return { noeud, titre: "Administration", nettoyer: lacher };
}
