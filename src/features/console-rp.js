/* ---------------------------------------------------------------------------
 * La console d'à-côté.
 *
 * La fenêtre flottante déplaçait le site entier dans une vignette posée sur
 * Roblox. C'était juste, et inutilisable : pour tendre un mot il fallait
 * traverser trois écrans, dans une fenêtre haute de trois cents pixels, entre
 * deux répliques.
 *
 * Ici, cinq entrées et rien d'autre : ce qu'on fait vingt fois par séance.
 * Chacune ouvre une liste courte de gestes réels — aucun ne renvoie vers « la
 * page où c'est ». On reste dans le jeu.
 *
 * La barre n'apparaît que dans la fenêtre d'à-côté, ou quand on la demande.
 * Ailleurs elle ferait doublon avec le rail, et deux façons d'aller au même
 * endroit valent moins qu'une seule qui se trouve.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import { menu } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import {
  cahiers as depotCahiers, papiers as depotPapiers, cartable as depotCartable,
  affaires as depotAffaires, remisesObjet, remisesCahier, membres as depotMembres,
  personnages, sessions as depotSessions, profils as depotProfils
} from "../data/index.js";
import { preparerAffaires } from "./cartable.js";
import { materielAttendu, ecart } from "./materiel.js";
import { nomObjet, nomType } from "./affaires.js";
import { composerPapier, tendrePapier, recevoirPapier } from "./papier.js";
import { tendreSonCahier } from "./tendre-cahier.js";
import { tendreObjet, demanderObjet, repondreRemise, rendreRemise } from "./transfert.js";

/** L'espace où l'on se tient : celui qu'on regarde, sinon le premier. */
function espaceCourant() {
  const ouverts = etat.classes.filter((c) => !c.archived);
  return ouverts.find((c) => c.id === etat.classeActive?.id) || ouverts[0] || null;
}

/** Ceux qu'on croise, sans quoi aucun geste de remise n'a de destinataire. */
async function voisins(classe) {
  if (!classe) return { candidats: [], fiches: new Map() };
  const equipe = await depotMembres.liste(classe.id).catch(() => []);
  const fiches = await personnages.index(classe.id).catch(() => new Map());
  return {
    candidats: equipe
      .filter((m) => m.status === "active" && m.user_id !== etat.utilisateur.id)
      .map((m) => ({ user_id: m.user_id, profil: m.profil, nom: m.profil?.display_name })),
    fiches
  };
}

export function barreConsole() {
  const noeud = el("nav.console", { "aria-label": "Console d'à-côté" });
  const pastilles = { actions: el("span.console__compteur") };

  render(noeud,
    bouton("cahier", "Cahier", "cahier", menuCahier),
    bouton("note", "Note", "crayon", menuNote),
    bouton("papiers", "Papiers", "papier", menuPapiers),
    bouton("sac", "Sac", "sac", menuSac),
    bouton("actions", "Gestes", "main", menuActions, pastilles.actions)
  );

  compterEnAttente();
  return noeud;

  function bouton(cle, libelle, nomIcone, action, extra = null) {
    return el("button.console__bouton", {
      type: "button", dataset: { cle }, title: libelle,
      onclick: (e) => action(e.currentTarget)
    }, icone(nomIcone, 17), el("span.console__mot", libelle), extra);
  }

  /** Ce qui attend une réponse se voit sans qu'on ouvre le menu. */
  async function compterEnAttente() {
    try {
      const [objets, cahiers, papiers] = await Promise.all([
        remisesObjet.enAttente(etat.utilisateur.id).catch(() => []),
        remisesCahier.enAttente(etat.utilisateur.id).catch(() => []),
        depotPapiers.recus(etat.utilisateur.id).catch(() => [])
      ]);
      const n = objets.length + cahiers.length
        + papiers.filter((r) => r.state === "offered").length;
      pastilles.actions.textContent = n ? String(n) : "";
      pastilles.actions.hidden = !n;
      noeud.dataset.attente = n ? "1" : "0";
    } catch { pastilles.actions.hidden = true; }
  }

  /* --- Cahier ------------------------------------------------------------- */
  async function menuCahier(ancre) {
    const classe = espaceCourant();
    const sac = classe ? await depotCartable.pour(classe.id, etat.utilisateur.id).catch(() => null) : null;
    const apportes = new Set(depotCartable.apportes(sac));
    const mes = await depotCahiers.mesCahiers(etat.utilisateur.id).catch(() => []);

    // Ce qu'on a dans son sac d'abord : c'est ce qu'on peut vraiment ouvrir
    // pendant la scène. Le reste suit, parce qu'on écrit aussi entre deux cours.
    const dansLeSac = mes.filter((c) => apportes.has(String(c.id)));
    const ailleurs = mes.filter((c) => !apportes.has(String(c.id)));

    menu(ancre, [
      { titre: dansLeSac.length ? "Dans mon sac" : `Mes ${L("cahiers")}` },
      ...(dansLeSac.length ? dansLeSac : ailleurs).slice(0, 6).map((c) => ({
        libelle: c.title, icone: "cahier", action: () => aller(`/cahier/${c.id}`)
      })),
      ...(dansLeSac.length && ailleurs.length
        ? [{ separateur: true }, { titre: "Restés chez moi" },
           ...ailleurs.slice(0, 4).map((c) => ({
             libelle: c.title, icone: "cahier", action: () => aller(`/cahier/${c.id}`) }))]
        : []),
      { separateur: true },
      { libelle: "Le tendre à quelqu'un", icone: "main", action: () => tendreUnCahier() },
      { libelle: `Tous mes ${L("cahiers")}`, icone: "cahiers", action: () => aller("/cahiers") }
    ]);
  }

  async function tendreUnCahier() {
    const classe = espaceCourant();
    const { candidats, fiches } = await voisins(classe);
    if (!candidats.length) { toast("Personne à qui le tendre pour l'instant."); return; }
    await tendreSonCahier({ classe, session: etat.sessionActive, candidats, fiches });
    compterEnAttente();
  }

  /* --- Note --------------------------------------------------------------- */
  /**
   * Écrire un mot et le tendre dans la foulée : c'est un seul geste dans la
   * scène, cela doit en être un ici. Séparer la rédaction de la remise
   * obligeait à retrouver son propre papier dans une liste.
   */
  async function menuNote(ancre) {
    menu(ancre, [
      { titre: "Écrire" },
      { libelle: "Un mot, et le tendre", icone: "crayon", action: () => ecrireEtTendre("note") },
      { libelle: "Un ordre de mission", icone: "cachet", action: () => ecrireEtTendre("ordre") },
      { libelle: "Une convocation", icone: "calendrier", action: () => ecrireEtTendre("convocation") },
      { separateur: true },
      { libelle: "Ma sacoche", icone: "papier", action: () => aller("/papiers") }
    ]);
  }

  async function ecrireEtTendre(modele) {
    const classe = espaceCourant();
    const papier = await composerPapier({ classe, modele });
    if (!papier) return;
    const { candidats, fiches } = await voisins(classe);
    if (!candidats.length) {
      toast("Papier rédigé", { corps: "Il attend dans votre sacoche : personne à qui le tendre ici." });
      return;
    }
    await tendrePapier({ papier, classe, session: etat.sessionActive, candidats, fiches });
    compterEnAttente();
  }

  /* --- Papiers ------------------------------------------------------------ */
  async function menuPapiers(ancre) {
    const mes = await depotPapiers.mesPapiers(etat.utilisateur.id).catch(() => []);
    if (!mes.length) {
      menu(ancre, [
        { titre: "Ma sacoche" },
        { libelle: "Elle est vide", action: () => aller("/papiers") },
        { libelle: "Rédiger un mot", icone: "crayon", action: () => ecrireEtTendre("note") }
      ]);
      return;
    }
    menu(ancre, [
      { titre: "Tendre un papier" },
      ...mes.slice(0, 7).map((p) => ({
        libelle: p.title, icone: "papier", action: () => tendreCePapier(p)
      })),
      { separateur: true },
      { libelle: "Ma sacoche", icone: "papier", action: () => aller("/papiers") }
    ]);
  }

  async function tendreCePapier(papier) {
    const classe = espaceCourant();
    const { candidats, fiches } = await voisins(classe);
    if (!candidats.length) { toast("Personne à qui le tendre pour l'instant."); return; }
    await tendrePapier({ papier, classe, session: etat.sessionActive, candidats, fiches });
    compterEnAttente();
  }

  /* --- Sac ---------------------------------------------------------------- */
  async function menuSac(ancre) {
    const classe = espaceCourant();
    if (!classe) {
      menu(ancre, [{ titre: "Mon sac" },
        { libelle: `Rejoignez une ${L("classe")}`, action: () => aller("/classes") }]);
      return;
    }
    const session = await depotSessions.enCours(classe.id).catch(() => null);
    const sac = await depotCartable.pour(classe.id, etat.utilisateur.id).catch(() => null);
    const attendu = materielAttendu(classe, session);
    const manque = ecart(sac, attendu);

    menu(ancre, [
      { titre: classe.name },
      attendu.vide()
        ? { libelle: "Rien n'a été demandé" }
        : { libelle: `Demandé : ${attendu.enUneLigne()}` },
      manque.total
        ? { libelle: `Il manque : ${manque.noms.join(", ")}`, icone: "alerte" }
        : { libelle: "Rien n'a été oublié", icone: "coche" },
      { separateur: true },
      { libelle: session ? "Équiper mes affaires" : "Préparer mon sac", icone: "sac",
        action: async () => { await preparerAffaires({ classe, session }); compterEnAttente(); } },
      { libelle: "Toutes mes affaires", icone: "grille", action: () => aller("/affaires") }
    ]);
  }

  /* --- Gestes ------------------------------------------------------------- */
  async function menuActions(ancre) {
    const classe = espaceCourant();
    const [objets, cahiersTendus, papiersRecus, aRendre, mesObjets] = await Promise.all([
      remisesObjet.enAttente(etat.utilisateur.id).catch(() => []),
      remisesCahier.enAttente(etat.utilisateur.id).catch(() => []),
      depotPapiers.recus(etat.utilisateur.id).catch(() => []),
      remisesObjet.aRendre(etat.utilisateur.id).catch(() => []),
      depotAffaires.toutes(etat.utilisateur.id).catch(() => [])
    ]);
    const enAttentePapiers = papiersRecus.filter((r) => r.state === "offered");

    const entrees = [{ titre: "Ce qui attend" }];

    for (const r of objets.slice(0, 4)) {
      entrees.push({
        libelle: r.direction === "request"
          ? `On vous demande ${nomType(r.asked_kind)}`
          : `On vous tend ${nomObjet(mesObjets.find((o) => String(o.id) === String(r.belonging_id)) || { kind: r.asked_kind })}`,
        icone: "sac",
        action: async () => {
          const gens = new Map((await depotProfils.parIds([r.from_user]).catch(() => [])).map((p) => [p.id, p]));
          await repondreRemise(r, { objets: mesObjets, profils: gens });
          compterEnAttente();
        }
      });
    }
    for (const r of cahiersTendus.slice(0, 3)) {
      entrees.push({ libelle: "On vous tend un cahier", icone: "cahier",
        action: () => aller("/affaires") });
    }
    for (const r of enAttentePapiers.slice(0, 3)) {
      entrees.push({
        libelle: `Papier : ${r.papier?.title || "un document"}`, icone: "papier",
        action: async () => { await recevoirPapier(r, { classe }); compterEnAttente(); }
      });
    }
    if (entrees.length === 1) entrees.push({ libelle: "Rien pour l'instant" });

    if (aRendre.length) {
      entrees.push({ separateur: true }, { titre: "À rendre" });
      for (const r of aRendre.slice(0, 4)) {
        const o = mesObjets.find((x) => String(x.id) === String(r.belonging_id));
        entrees.push({
          libelle: `Rendre ${o ? nomObjet(o).toLowerCase() : "l'objet"}`, icone: "entree",
          action: async () => { await rendreRemise(r, { objets: mesObjets }); compterEnAttente(); }
        });
      }
    }

    entrees.push({ separateur: true }, { titre: "Faire" },
      { libelle: "Demander un objet", icone: "main", action: () => demanderUn() },
      { libelle: "Tendre un objet", icone: "sac", action: () => tendreUn(mesObjets) },
      { libelle: "Mes affaires", icone: "grille", action: () => aller("/affaires") });

    menu(ancre, entrees);
  }

  async function demanderUn() {
    const classe = espaceCourant();
    const { candidats, fiches } = await voisins(classe);
    if (!candidats.length) { toast("Personne à qui demander pour l'instant."); return; }
    await demanderObjet({ classe, session: etat.sessionActive, candidats, fiches });
    compterEnAttente();
  }

  async function tendreUn(mesObjets) {
    const classe = espaceCourant();
    const { candidats, fiches } = await voisins(classe);
    if (!candidats.length) { toast("Personne à qui le tendre pour l'instant."); return; }
    const aMoi = mesObjets.filter((o) =>
      String(o.owner_id) === String(etat.utilisateur.id) && o.state !== "confiscated");
    if (!aMoi.length) { toast("Vous n'avez rien à tendre."); return; }

    menu(document.activeElement || noeud, [
      { titre: "Lequel" },
      ...aMoi.slice(0, 10).map((o) => ({
        libelle: nomObjet(o), icone: "sac",
        action: async () => {
          await tendreObjet({ objet: o, classe, session: etat.sessionActive, candidats, fiches });
          compterEnAttente();
        }
      }))
    ]);
  }
}
