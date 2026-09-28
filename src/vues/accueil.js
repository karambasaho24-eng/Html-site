/* ---------------------------------------------------------------------------
 * Chez moi.
 *
 * On ne se connecte pas à un tableau de bord : on rentre dans sa chambre. Le
 * bureau, le sac posé à côté, les affaires sur la table — et au mur, ce qui
 * se passe en ce moment : une séance ouverte quelque part, un papier qu'on
 * vous a remis, une notification.
 *
 * C'est ici qu'on prépare son sac, en vrai : on prend un objet sur le bureau,
 * on le met dans le sac ; ce qui est dans le sac part avec soi.
 *
 * En petite fenêtre (au-dessus de Roblox), la même chambre devient une
 * console : un panneau à la fois, la barre des gestes en dessous.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat, definir, observer } from "../core/store.js";
import { aller } from "../core/router.js";
import { ecouter } from "../core/bus.js";
import { L } from "../core/lexique.js";
import { sessions, papiers, cahiers, classes as depotClasses } from "../data/index.js";
import { normaliserCode, dateLongue } from "../core/util.js";
import { erreur, succes, toast, messageErreur } from "../ui/toast.js";
import { rafraichirClasses, notificationsNonLues } from "../core/session.js";
import { modePleineVue, panneauNotifications } from "../ui/chassis.js";
import { creerBureauMaison } from "../features/bureau-maison.js";
import { creerScene } from "../features/scene-bureau.js";
import { creerEditeurCahier } from "../features/editeur-cahier.js";
import { ouvrirDossier } from "../features/dossiers.js";
import { recevoirPapier } from "../features/papier.js";
import {
  prendreLesGestes, noteDePartout, personnesDePartout, ouvrirDocuments, gensDeLEspace
} from "../features/gestes.js";
import {
  creerConsole, panneauBureau, panneauSac, panneauCahier, panneauNote,
  panneauDocumentsConsole, panneauPersonnes
} from "../features/console.js";
import { imageDetouree } from "../features/affaires.js";

export default async function vueAccueil() {
  const moi = etat.utilisateur.id;
  let editeur = null;
  let cahierOuvert = null;
  let enDirect = [];
  let aLire = [];
  let gens = { gens: [], nomDe: () => "—", classe: null };

  const bureau = creerBureauMaison({ surChange: () => { decor.peindre(); remonterLivre(); console_.rafraichir(); } });
  await bureau.charger();

  const mur = el("div.mur");

  const decor = creerScene({
    bureau, classe: null, session: {}, staff: false,
    avant: mur,
    surCahier: (c) => ouvrirCahier(c),
    surDossier: (d) => ouvrirDossier(d, { moiId: moi }),
    surNote: () => noteDePartout()
  });
  decor.surChangementEtat((e) => { if (e !== "cahier") fermerLivre(); });

  /* --- La console, pour les petites fenêtres ------------------------------ */
  const enTete = el("div.console__entete");
  const console_ = creerConsole({
    avecBarre: false,
    enTete,
    defaut: "bureau",
    panneaux: [
      { cle: "bureau", mot: "Bureau", rendre: panneauBureau(bureau, {
        surCahier: (c) => { cahierOuvert = c; console_.ouvrir("cahier"); },
        surSac: () => console_.ouvrir("sac"),
        surDossier: (d) => ouvrirDossier(d, { moiId: moi })
      }) },
      { cle: "sac", mot: "Sac", rendre: panneauSac(bureau) },
      { cle: "cahier", mot: "Cahier", rendre: panneauCahier(bureau, {
        surSac: () => console_.ouvrir("sac"),
        choisi: () => cahierOuvert?.id,
        choisir: (c) => { cahierOuvert = c; console_.ouvrir("cahier"); },
        surNouveau: () => cahierNeuf()
      }) },
      { cle: "note", mot: "Note", rendre: panneauNote({ bureau, classe: null, gens: () => gens.gens, nomDe: (p) => gens.nomDe(p) }) },
      { cle: "documents", mot: "Documents", rendre: panneauDocumentsConsole() },
      { cle: "personnes", mot: "Personnes", rendre: panneauPersonnes({
        gens: () => gens.gens, nomDe: (p) => gens.nomDe(p),
        roleDe: (p) => (["teacher", "owner", "assistant"].includes(p.role) ? "responsable" : ""),
        gestes: (p) => [{ libelle: "Lui écrire une note", action: () => noteDePartout(p) }]
      }) }
    ]
  });

  const noeud = el("div.chez-moi", decor.noeud, console_.noeud);

  const petit = () => ["compact", "mini"].includes(etat.taille);

  /* --- Les gestes de la barre : ici, ils agissent sur ce bureau ----------- */
  const rendre = prendreLesGestes({
    bureau: () => (petit() ? console_.ouvrir("bureau") : decor.definirEtat("bureau")),
    sac: () => (petit() ? console_.ouvrir("sac", { basculer: true })
      : decor.definirEtat(decor.etat() === "sac" ? "bureau" : "sac")),
    cahier: () => ouvrirLeCahier(),
    note: () => (petit() ? console_.ouvrir("note", { basculer: true }) : noteDePartout()),
    documents: (ancre) => (petit() ? console_.ouvrir("documents", { basculer: true }) : ouvrirDocuments(ancre)),
    personnes: (ancre) => (petit() ? console_.ouvrir("personnes", { basculer: true }) : personnesDePartout(ancre))
  });

  function ouvrirLeCahier() {
    const pose = bureau.cahiersSurLeBureau()[0];
    if (petit()) { if (pose) cahierOuvert = cahierOuvert || pose; console_.ouvrir("cahier", { basculer: true }); return; }
    if (pose) { ouvrirCahier(cahierOuvert && bureau.cahiersSurLeBureau().some((c) => c.id === cahierOuvert.id) ? cahierOuvert : pose); return; }
    if (!bureau.supports().length) {
      // Pas de cahier du tout : on s'en procure un, il arrive sur le bureau.
      toast("Vous n'avez pas encore de cahier", {
        type: "attn", duree: 8000,
        action: { libelle: "M'en procurer un", action: async () => {
          const c = await cahierNeuf();
          if (c) { decor.peindre(); ouvrirCahier(c); }
        } }
      });
      return;
    }
    toast("Aucun cahier sur votre bureau", { corps: "Sortez-le de votre sac.", type: "attn" });
    decor.definirEtat("sac");
  }

  /** Un cahier neuf, posé sur le bureau de la chambre. */
  async function cahierNeuf() {
    const c = await cahiers.creer({ owner_id: moi, kind: "personal", title: "Cahier" }).catch((err) => {
      erreur("Impossible", messageErreur(err)); return null;
    });
    if (!c) return null;
    await bureau.charger();
    return bureau.cahiersSurLeBureau().find((x) => x.id === c.id) || c;
  }

  /* --- Le cahier ouvert, sur le bureau ------------------------------------ */
  function ouvrirCahier(c) {
    cahierOuvert = c;
    decor.definirEtat("cahier");
    remonterLivre();
  }

  function remonterLivre() {
    if (decor.etat() !== "cahier" || !cahierOuvert) return;
    const verdict = bureau.peutFaire("ecrire");
    const page = editeur?.pageCourante?.()?.id || null;
    editeur?.detruire?.();
    editeur = creerEditeurCahier({
      cahier: cahierOuvert,
      peutEcrire: verdict.ok,
      manqueEcriture: verdict.ok ? null : verdict,
      garde: (action) => bureau.peutFaire(action),
      pageInitiale: page
    });
    render(decor.livre, el("div.salle__scene", el("div.mon-cahier", editeur.noeud)));
  }

  function fermerLivre() {
    editeur?.detruire?.();
    editeur = null;
    render(decor.livre, []);
  }

  /* --- Le mur : ce qui se passe en ce moment ------------------------------ */
  async function charger() {
    const [live, recus, voisins] = await Promise.all([
      sessionsEnDirect(),
      papiers.recus(moi).catch(() => []),
      gensDeLEspace().catch(() => gens)
    ]);
    enDirect = live;
    aLire = recus.filter((r) => r.state === "offered");
    gens = voisins;
    peindreMur();
    peindreEnTete();
  }

  function lignesDuMoment() {
    const nonLues = notificationsNonLues();
    return [
      ...enDirect.map(({ classe, session }) => el("li.mur__ligne.mur__ligne--direct",
        el("span.mur__voyant"),
        el("span.mur__texte", el("b", session.title || "Séance ouverte"), ` · ${classe.name}`),
        el("button.btn.btn--primaire.btn--petit", { onclick: () => aller(`/classe/${classe.id}/salle`) },
          "Entrer dans la salle", icone("chevronD", 13)))),
      aLire.length ? el("li.mur__ligne",
        el("img.mur__objet", { src: imageDetouree("feuille"), alt: "" }),
        el("span.mur__texte", el("b", aLire.length === 1 ? "Un papier vous a été remis" : `${aLire.length} papiers vous ont été remis`)),
        el("button.btn.btn--petit", { onclick: async () => { await recevoirPapier(aLire[0]); charger(); } }, "Lire")) : null,
      nonLues ? el("li.mur__ligne",
        el("span.mur__cloche", icone("cloche", 14)),
        el("span.mur__texte", `${nonLues} notification${nonLues > 1 ? "s" : ""}`),
        el("button.btn.btn--petit.btn--fantome", { onclick: (e) => panneauNotifications(e.currentTarget) }, "Voir")) : null
    ].filter(Boolean);
  }

  function salut() {
    const h = new Date().getHours();
    return h < 5 || h >= 18 ? "Bonsoir" : "Bonjour";
  }

  function peindreMur() {
    const lignes = lignesDuMoment();
    const espaces = etat.classes.filter((c) => !c.archived);
    const prenom = (etat.profil?.display_name || "").split(/\s+/)[0];
    render(mur,
      el("div.mur__entete",
        el("div.mur__bonjour",
          el("span.mur__date", dateLongue(Date.now())),
          el("h1.mur__titre", prenom ? `${salut()}, ${prenom}` : salut())),
        el("div.mur__pied",
          espaces.length ? el("div.mur__espaces", espaces.slice(0, 4).map((c) =>
            el("a.mur__espace", { href: `#/classe/${c.id}` }, c.name))) : null,
          rejoindre())),
      el("ul.mur__lignes", lignes.length ? lignes
        : el("li.mur__ligne.mur__ligne--calme", "Rien ne vous attend. Préparez votre sac pour la prochaine séance.")));
  }

  function peindreEnTete() {
    const direct = enDirect[0];
    render(enTete,
      direct
        ? el("button.console__direct", { type: "button", onclick: () => aller(`/classe/${direct.classe.id}/salle`) },
            el("span.mur__voyant"), el("span", el("b", direct.classe.name), ` · ${direct.session.title || "en séance"}`),
            el("span.console__aller", "Y aller"))
        : el("span.console__calme", aLire.length ? `${aLire.length} papier${aLire.length > 1 ? "s" : ""} à lire` : "Chez moi — rien ne vous attend"));
  }

  /* --- Les demandes venues d'ailleurs (« Sac » depuis une autre page) ----- */
  function servirDemande() {
    const d = etat.demandeBureau;
    if (!d) return;
    definir({ demandeBureau: null });
    if (d === "sac") petit() ? console_.ouvrir("sac") : decor.definirEtat("sac");
    if (d === "cahier") ouvrirLeCahier();
  }

  const lachers = [
    observer("demandeBureau", servirDemande),
    observer("taille", () => { if (petit() && !console_.ouvert()) console_.demarrer(); }),
    observer("notifications", peindreMur),
    ecouter("papiers:change", charger)
  ];

  modePleineVue(true);
  decor.peindre();
  await charger();
  if (petit()) console_.demarrer();
  setTimeout(servirDemande, 0);

  return {
    noeud,
    titre: "Chez moi",
    nettoyer: () => {
      rendre();
      for (const l of lachers) l?.();
      editeur?.detruire?.();
      decor.detruire?.();
      modePleineVue(false);
    }
  };
}

/* --- Fragments -------------------------------------------------------------- */

async function sessionsEnDirect() {
  const sorties = [];
  for (const classe of etat.classes) {
    if (classe.archived) continue;
    try {
      const session = await sessions.enCours(classe.id);
      if (session) sorties.push({ classe, session });
    } catch { /* espace inaccessible */ }
  }
  return sorties;
}

/** Rejoindre un espace : le code qu'on vous donne en jeu. */
function rejoindre() {
  let champ, bouton;

  async function valider() {
    const code = normaliserCode(champ.value);
    if (code.length < 7) {
      erreur("Code incomplet", "Un code ressemble à K7F-29A.");
      champ.focus();
      return;
    }
    bouton.disabled = true;
    try {
      const sortie = await depotClasses.rejoindre(code);
      await rafraichirClasses();
      if (sortie.member_status === "pending") {
        succes("Demande envoyée", `Le ${L("professeur")} doit valider votre arrivée dans « ${sortie.class_name} ».`);
      } else {
        succes("Vous avez rejoint l'espace", sortie.class_name);
        aller(`/classe/${sortie.class_id}`);
      }
      champ.value = "";
    } catch (err) {
      erreur("Impossible de rejoindre", messageErreur(err));
    } finally {
      bouton.disabled = false;
    }
  }

  return el("div.mur__rejoindre",
    champ = el("input.saisie.saisie--code", {
      placeholder: "Code", maxlength: 7, "aria-label": "Code d'un espace",
      oninput: (e) => { e.target.value = normaliserCode(e.target.value); },
      onkeydown: (e) => { if (e.key === "Enter") valider(); }
    }),
    bouton = el("button.btn.btn--petit", { onclick: valider }, "Rejoindre"));
}
