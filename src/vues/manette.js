/* ---------------------------------------------------------------------------
 * La manette : ce que l'on voit en mode flottant, à côté du jeu.
 * Quelques gros boutons, un geste chacun. On choisit, c'est fait.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import { local, normaliserCode } from "../core/util.js";
import { classes as depotClasses, sessions } from "../data/index.js";
import { formulaire, menu } from "../ui/modal.js";
import { erreur, succes, toast, messageErreur } from "../ui/toast.js";
import { rafraichirClasses } from "../core/session.js";
import { etat } from "../core/store.js";
import { transferts, papiers } from "../data/index.js";
import { choisirEtDonner, panneauRemises } from "../features/transferts.js";

function bouton(libelle, aide, nomIcone, action) {
  return el("button.manette__bouton", { type: "button", onclick: action },
    icone(nomIcone, 30), el("span.manette__mot", libelle), el("span.manette__aide", aide));
}

export default async function vueManette() {
  function ouvrirCahier() {
    const dernier = local.lire("ojm.dernierCahier", null);
    aller(dernier ? `/cahier/${dernier}` : "/");
  }

  async function rejoindre() {
    const sortie = await formulaire({
      titre: `Rejoindre une ${L("classe")}`,
      note: `Le ${L("professeur")} annonce un code au début du cours.`,
      champs: [{ cle: "code", label: "Code de classe", placeholder: "K7F-29A", requis: true }],
      libelle: "Rejoindre"
    });
    if (!sortie) return;
    try {
      const resultat = await depotClasses.rejoindre(normaliserCode(sortie.code));
      await rafraichirClasses();
      if (resultat.member_status === "pending") succes("Demande envoyée", "Votre inscription doit être validée.");
      else { succes("Classe rejointe", resultat.class_name); aller(`/classe/${resultat.class_id}`); }
    } catch (err) {
      erreur("Impossible de rejoindre", messageErreur(err));
    }
  }

  async function suivre(e) {
    const ancre = e.currentTarget;
    const liste = (await rafraichirClasses()).filter((c) => !c.archived);
    const enDirect = (await Promise.all(liste.map(async (classe) =>
      ({ classe, session: await sessions.enCours(classe.id).catch(() => null) }))))
      .filter((x) => x.session);
    if (!enDirect.length) {
      toast("Rien en ce moment", { corps: `Aucun cours ni réunion n'a commencé dans vos ${L("classes")}.` });
      return;
    }
    if (enDirect.length === 1) { aller(`/classe/${enDirect[0].classe.id}/salle`); return; }
    menu(ancre, [
      { titre: "En ce moment" },
      ...enDirect.map(({ classe, session }) => ({
        libelle: `${classe.name} — ${session.title || "en cours"}`,
        action: () => aller(`/classe/${classe.id}/salle`)
      }))
    ]);
  }

  const compteur = el("span.manette__compteur", { hidden: true, "aria-label": "objets en attente" });
  const remises = panneauRemises({ surCompte: (n) => { compteur.hidden = !n; compteur.textContent = String(n); } });

  async function nouveauPapier() {
    try {
      const p = await papiers.creer({ author_id: etat.utilisateur.id, title: "Nouveau papier", body: "" });
      aller(`/papier/${p.id}`);
    } catch (err) { erreur("Création impossible", messageErreur(err)); }
  }

  async function recevoir() {
    const { recus } = await transferts.enAttente(etat.utilisateur.id).catch(() => ({ recus: [] }));
    await remises.peindre();
    if (!recus.length) toast("Rien à recevoir", { corps: "Personne ne vous tend de cahier ni de papier." });
    else remises.scrollIntoView({ block: "nearest" });
  }

  const noeud = el("div.manette-page", remises, el("div.manette",
    bouton("Cahier", "Reprendre mon dernier cahier", "cahier", ouvrirCahier),
    bouton("Mes affaires", "Cahiers et papiers, en prendre un nouveau", "cahiers", () => aller("/")),
    bouton("Papier", "Écrire un nouveau papier", "papier", nouveauPapier),
    bouton("Donner", "Un cahier ou un papier, à quelqu'un", "echange", async () => { await choisirEtDonner(); remises.peindre(); }),
    (() => { const b = bouton("Recevoir", "Ce qu'on vous tend", "main", recevoir); b.append(compteur); return b; })(),
    bouton("Suivre", "Un cours ou une réunion en cours", "tableau", suivre),
    bouton("Rejoindre", `Une ${L("classe")}, avec son code`, "entree", rejoindre)
  ));
  return { noeud, titre: "Manette", nettoyer: () => remises.fermer() };
}
