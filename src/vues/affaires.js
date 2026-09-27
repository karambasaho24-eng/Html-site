/* ---------------------------------------------------------------------------
 * Mes affaires.
 *
 * Trois questions, et l'écran doit y répondre sans qu'on lise un manuel :
 *   · qu'est-ce que je possède, et où est-ce ?
 *   · qu'est-ce qu'on m'a demandé d'apporter, et qu'est-ce qui me manque ?
 *   · qu'est-ce qui circule — ce qu'on me tend, ce que je dois rendre, ce que
 *     j'ai prêté et qui n'est pas revenu ?
 *
 * Cette page manquait, et son absence rendait tout le reste invisible : le sac
 * ne s'ouvrait que depuis une séance en cours, derrière un bouton. Hors séance
 * on ne pouvait pas le préparer du tout — alors que préparer ses affaires est
 * justement ce qu'on fait AVANT d'entrer.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { L } from "../core/lexique.js";
import {
  affaires as depotAffaires, remisesObjet, cartable as depotCartable,
  cahiers as depotCahiers, profils as depotProfils, membres as depotMembres,
  personnages, sessions as depotSessions, classes as depotClasses, temps, salles
} from "../data/index.js";
import { exigerProximite } from "../features/proximite.js";
import { entete, blocVide } from "../ui/fragments.js";
import { menu, confirmer, demander } from "../ui/modal.js";
import { erreur, succes, toast, messageErreur } from "../ui/toast.js";
import { depuis, aplatir } from "../core/util.js";
import { nomAffiche } from "../core/rp.js";
import {
  CATEGORIES, fiche, nomObjet, nomType, niveauEnMots, etatObjet,
  indexer, surMoi, indisponible, figureObjet, vignetteObjet, vitrine
} from "../features/affaires.js";
import { materielAttendu, ecart } from "../features/materiel.js";
import { preparerAffaires, dotationComplete } from "../features/cartable.js";
import {
  tendreObjet, demanderObjet, repondreRemise, rendreRemise, reprendreRemise,
  restituerObjet, acquerirObjet
} from "../features/transfert.js";

export default async function vueAffaires() {
  const moi = etat.utilisateur.id;
  let onglet = "mes";
  let recherche = "";
  let categorie = "toutes";

  let objets = [];
  let supports = [];
  // On relit les espaces plutôt que de faire confiance au cache : on arrive
  // souvent ici juste après avoir rejoint une classe, et une page qui dit
  // « aucune classe » à quelqu'un qui vient d'en rejoindre une a tort.
  let espaces = [];
  let sacs = new Map();          // classeId -> class_bags
  let seances = new Map();       // classeId -> séance en cours
  let aRepondre = [];
  let mesOffres = [];
  let aRendre = [];
  let pretes = [];
  let histoire = [];
  let gens = new Map();          // userId -> profil
  let fiches = new Map();        // userId -> fiche de personnage

  const onglets = el("div.salle__panneau-onglets", { role: "tablist" });
  const zone = el("div");

  const noeud = el("div.page",
    entete("Mes affaires", "Ce que j'ai",
      el("p.doux.petit",
        "Ce que vous possédez, ce que vous emportez, ce qui circule. Ce que vous "
        + "mettez dans votre sac est ce dont vous disposerez en séance — et la "
        + "seule chose que l'encadrement pourra vous demander d'ouvrir."),
      [el("button.btn.btn--fantome", { onclick: procurer },
        icone("plus", 15), "Me procurer un objet")]),
    onglets, zone
  );

  await charger();
  peindre();

  // Un objet qui change de mains doit se voir sans recharger : c'est ce qui
  // fait qu'un prêt est un geste et non un formulaire.
  const abonnement = temps.sabonner({
    cle: `affaires:${moi}`,
    tables: [{ table: "belongings" }, { table: "belonging_handoffs" }, { table: "notebooks" }],
    surChangement: async () => { await charger(); peindre(); }
  });

  return { noeud, titre: "Mes affaires", nettoyer: () => abonnement?.fermer() };

  /* ======================================================================= */

  async function charger() {
    objets = await depotAffaires.toutes(moi).catch(() => []);
    if (!objets.length) {
      objets = await depotAffaires.assurerDotation(moi, dotationComplete()).catch(() => []);
    }
    supports = await depotCahiers.mesCahiers(moi).catch(() => []);

    espaces = (await depotClasses.mesClasses(moi).catch(() => etat.classes))
      .filter((c) => !c.archived);
    const classes = espaces;
    sacs = new Map();
    seances = new Map();
    await Promise.all(classes.map(async (c) => {
      sacs.set(c.id, await depotCartable.pour(c.id, moi).catch(() => null));
      seances.set(c.id, await depotSessions.enCours(c.id).catch(() => null));
    }));

    [aRepondre, mesOffres, aRendre, pretes, histoire] = await Promise.all([
      remisesObjet.enAttente(moi).catch(() => []),
      remisesObjet.mesDemandes(moi).catch(() => []),
      remisesObjet.aRendre(moi).catch(() => []),
      remisesObjet.pretes(moi).catch(() => []),
      remisesObjet.histoire(moi).catch(() => [])
    ]);

    // Les noms : celui du personnage prime sur celui du compte, partout.
    const ids = [...new Set([...aRepondre, ...mesOffres, ...aRendre, ...pretes, ...histoire]
      .flatMap((r) => [r.from_user, r.to_user])
      .concat(objets.map((o) => o.owner_id), objets.map((o) => o.holder_id))
      .filter(Boolean).filter((id) => id !== moi))];
    gens = new Map((await depotProfils.parIds(ids).catch(() => [])).map((p) => [p.id, p]));
    fiches = new Map();
    for (const c of espaces) {
      const index = await personnages.index(c.id).catch(() => new Map());
      for (const [k, v] of index) if (!fiches.has(k)) fiches.set(k, v);
    }
  }

  function nomDe(userId) {
    return nomAffiche(fiches.get(userId), gens.get(userId)) || "Quelqu'un";
  }

  function peindre() {
    const enAttente = aRepondre.length;
    const aRendreN = aRendre.length;
    render(onglets,
      [{ cle: "mes", libelle: "Ce que je possède" },
       { cle: "preparation", libelle: "Préparation", compteur: nbClassesIncompletes() },
       { cle: "echanges", libelle: "Échanges", compteur: enAttente + aRendreN }]
        .map((o) => el("button.onglet", {
          role: "tab", "aria-selected": String(o.cle === onglet),
          onclick: () => { onglet = o.cle; peindre(); }
        }, o.libelle, o.compteur ? el("span.pastille-compteur", String(o.compteur)) : null)));

    render(zone,
      onglet === "mes" ? panneauMes()
        : onglet === "preparation" ? panneauPreparation()
        : panneauEchanges());
  }

  function nbClassesIncompletes() {
    let n = 0;
    for (const c of espaces) {
      const attendu = materielAttendu(c, seances.get(c.id));
      if (attendu.vide()) continue;
      if (ecart(sacs.get(c.id), attendu).total) n++;
    }
    return n;
  }

  /* ===================================================================== */
  /* Ce que je possède                                                      */
  /* ===================================================================== */
  function panneauMes() {
    const index = indexer(objets);
    const filtres = objets.filter((o) => {
      if (categorie !== "toutes" && (fiche(o.kind)?.categorie || "autre") !== categorie) return false;
      if (!recherche) return true;
      return aplatir(nomObjet(o) + " " + nomType(o.kind)).includes(aplatir(recherche));
    });

    // Ce qu'on a laissé dans une salle — ou sur un bureau — n'est ni sur moi
    // ni chez moi. Il n'est pas dans l'inventaire : il est LÀ-BAS.
    const laisse = (x) => (x.place || "range") !== "range";
    const surSoi   = filtres.filter((o) => !indisponible(o, moi) && !laisse(o) && surMoi(o, index));
    const chezMoi  = filtres.filter((o) => !indisponible(o, moi) && !laisse(o) && !surMoi(o, index));
    const ailleurs = filtres.filter((o) => indisponible(o, moi));
    const restes = [
      ...filtres.filter((o) => !indisponible(o, moi) && laisse(o)).map((o) => ({ genre: "objet", o })),
      ...supports.filter(laisse).map((o) => ({ genre: "cahier", o }))
    ];

    return el("div",
      el("div.barre-filtres",
        el("input.saisie.saisie--recherche", {
          type: "search", placeholder: "Chercher un objet…", value: recherche,
          oninput: (e) => { recherche = e.currentTarget.value; peindre(); }
        }),
        el("select.saisie.saisie--etroite", {
          onchange: (e) => { categorie = e.currentTarget.value; peindre(); }
        },
          el("option", { value: "toutes", selected: categorie === "toutes" }, "Toutes catégories"),
          CATEGORIES.filter((c) => objets.some((o) => (fiche(o.kind)?.categorie || "autre") === c.cle))
            .map((c) => el("option", { value: c.cle, selected: categorie === c.cle }, c.libelle)))
      ),

      !objets.length
        ? blocVide("Vous n'avez rien",
            "L'intendance fournit le nécessaire : un cartable, une trousse, de quoi écrire.",
            { libelle: "Me procurer un objet", action: procurer })
        : el("div",
            restes.length ? sectionRestes(restes) : null,
            section("Sur moi", "Ce que j'emporte, rangé comme je l'ai rangé.", surSoi, { hierarchie: true }),
            section("Chez moi", "Posé quelque part, pas dans mon sac.", chezMoi),
            ailleurs.length
              ? section("Ailleurs", "Prêté, perdu ou confisqué : je n'en dispose pas.", ailleurs)
              : null),

      el("div.encart-affaires",
        el("p.petit.faible",
          icone("sac", 12),
          " Un objet n'existe qu'à un endroit. Le prêter le sort de votre sac ; "
          + "le donner en change le propriétaire. C'est ce qui permet de dire, "
          + "plus tard, où il est passé."))
    );
  }

  /* --- Ce qui est resté là-bas ------------------------------------------ */

  function sectionRestes(restes) {
    return el("section.affaires__section.affaires__section--restes",
      el("h3.affaires__titre", "Laissé ailleurs", el("span.affaires__compte", String(restes.length))),
      el("p.petit.faible",
        "Indisponible : ce n'est ni sur vous ni chez vous. Il faut retourner le chercher, "
        + "et la salle doit être ouverte."),
      el("div.affaires__liste", restes.map(({ genre, o }) => {
        const nom = genre === "cahier" ? (o.title || "Cahier") : nomObjet(o);
        const classe = espaces.find((c) => String(c.id) === String(o.place_class));
        const ouverte = Boolean(classe) && salles.ouverte(classe, seances.get(classe.id), moi);
        const surLeBureau = o.place === "bureau" && seances.get(o.place_class)?.id
          && String(seances.get(o.place_class).id) === String(o.place_session);
        return el("div.affaire.affaire--reste",
          el("div.affaire__ligne",
            el("span.affaire__nom", "❌ ", nom, " ", el("span.faible.petit", "indisponible")),
            el("span.affaire__lieu.petit",
              "📍 ", surLeBureau ? "Sur votre bureau — " : "Dernière position : ",
              o.place_label || classe?.name || "une salle",
              o.place_at ? el("span.faible", " · ", depuis(o.place_at)) : null),
            el("span.pousse"),
            el("span.etiq", { class: ouverte ? "etiq--ok" : "etiq--attn" },
              ouverte ? "Salle ouverte" : "Salle fermée"),
            el("button.btn.btn--petit", {
              class: ouverte ? "btn--primaire" : "btn--fantome",
              onclick: () => recuperer(genre, o, nom, classe, ouverte)
            }, "Récupérer")));
      }))
    );
  }

  async function recuperer(genre, o, nom, classe, ouverte) {
    if (!ouverte) {
      toast("La salle est fermée", {
        corps: `${nom} y reste. Attendez qu'elle rouvre, ou qu'un encadrant vous laisse entrer `
          + "ou vous le rende.",
        type: "attn", duree: 7000
      });
      return;
    }
    const proche = await exigerProximite({
      motif: "salle", detail: `${nom} — ${o.place_label || classe?.name || "la salle"}`
    });
    if (!proche) return;
    try {
      if (genre === "cahier") await depotCahiers.recuperer(o.id);
      else await depotAffaires.recuperer(o.id);
      succes(`${nom} récupéré`);
      await charger(); peindre();
    } catch (err) { erreur("Impossible de le reprendre", messageErreur(err)); }
  }

  function section(titre, aide, liste, { hierarchie = false } = {}) {
    if (!liste.length) {
      return el("section.affaires__section",
        el("h3.affaires__titre", titre),
        el("p.petit.faible", "Rien ici."));
    }
    const index = indexer(objets);
    // Sur soi, on montre la hiérarchie : la plume DANS la trousse DANS le
    // cartable. Ailleurs, l'ordre n'a pas de sens, on met tout à plat.
    const racines = hierarchie
      ? liste.filter((o) => !o.container_id || !liste.some((x) => String(x.id) === String(o.container_id)))
      : liste;

    return el("section.affaires__section",
      el("h3.affaires__titre", titre, el("span.affaires__compte", String(liste.length))),
      aide ? el("p.petit.faible", aide) : null,
      el("div.affaires__liste", racines.map((o) => carteObjet(o, liste, hierarchie, index)))
    );
  }

  function carteObjet(o, liste, hierarchie, index) {
    const dedans = hierarchie
      ? liste.filter((x) => String(x.container_id || "") === String(o.id))
      : [];
    const emprunte = String(o.owner_id) !== String(moi);

    const contenant = Boolean(fiche(o.kind)?.contenant);
    // Un contenant se montre avec ce qu'il contient réellement : vide, il
    // reste fermé ; garni, on voit dépasser ses affaires.
    const contenuReel = contenant
      ? objets.filter((x) => String(x.container_id || "") === String(o.id) && !indisponible(x, moi))
      : [];

    return el("div.affaire", { class: contenant ? "affaire--contenant" : "" },
      el("div.affaire__ligne",
        contenant ? vitrine(o, contenuReel, { taille: 64 }) : null,
        vignetteObjet(o, { moiId: moi, figure: !contenant }),
        emprunte ? el("span.petit.faible", "à ", nomDe(o.owner_id)) : null,
        el("span.pousse"),
        el("button.btn.btn--fantome.btn--icone", {
          "aria-label": `Actions sur ${nomObjet(o)}`,
          onclick: (e) => actionsObjet(e.currentTarget, o)
        }, icone("points", 15))),
      dedans.length
        ? el("div.affaire__dedans", dedans.map((x) => carteObjet(x, liste, hierarchie, index)))
        : null
    );
  }

  function actionsObjet(ancre, o) {
    const f = fiche(o.kind) || {};
    const aMoi = String(o.owner_id) === String(moi);
    const confisque = o.state === "confiscated";
    const jeDetiens = String(o.holder_id || "") === String(moi);

    menu(ancre, [
      { titre: nomObjet(o) },
      f.consomme && o.level != null ? { libelle: `Niveau : ${niveauEnMots(o.level)} (${o.level} %)` } : null,
      o.note ? { libelle: o.note } : null,

      aMoi && !confisque ? { libelle: "Le renommer", icone: "crayon", action: () => renommer(o) } : null,

      o.kind === "encrier" ? {
        libelle: "Remplir au flacon", icone: "goutte", action: () => remplir(o)
      } : null,

      f.nombre ? { libelle: "Combien j'en ai", icone: "grille", action: () => compter(o) } : null,

      !confisque && (o.place || "range") !== "salle" ? {
        libelle: "Le tendre à quelqu'un", icone: "main", action: () => tendre(o)
      } : null,

      confisque && jeDetiens ? {
        libelle: "Le rendre à son propriétaire", icone: "entree",
        action: async () => { if (await restituerObjet(o)) { await charger(); peindre(); } }
      } : null,

      aMoi && !confisque ? { separateur: true } : null,
      aMoi && !confisque ? {
        libelle: o.state === "lost" ? "Je l'ai retrouvé" : "Je l'ai perdu",
        icone: o.state === "lost" ? "coche" : "alerte",
        action: async () => {
          try {
            if (o.state === "lost") await depotAffaires.retrouver(o.id);
            else await depotAffaires.perdre(o.id);
            toast(o.state === "lost" ? "Retrouvé" : "Noté comme perdu");
            await charger(); peindre();
          } catch (err) { erreur("Impossible", messageErreur(err)); }
        }
      } : null,
      aMoi && !confisque ? {
        libelle: "M'en débarrasser", icone: "corbeille", danger: true,
        action: async () => {
          const ok = await confirmer({
            titre: "S'en débarrasser",
            message: `${nomObjet(o)} ne sera plus dans vos affaires. `
              + "Ce qui est dedans en sortira.",
            libelle: "Jeter", danger: true
          });
          if (!ok) return;
          try {
            for (const x of objets.filter((y) => String(y.container_id || "") === String(o.id))) {
              await depotAffaires.ranger(x.id, null);
            }
            await depotAffaires.supprimer(o.id);
            succes("Jeté");
            await charger(); peindre();
          } catch (err) { erreur("Impossible", messageErreur(err)); }
        }
      } : null
    ].filter(Boolean));
  }

  async function renommer(o) {
    const nom = await demander({
      titre: "Renommer", label: "Nom", valeur: o.label || "",
      placeholder: nomType(o.kind), aide: "Vide, il reprendra le nom de son type."
    });
    if (nom === null) return;
    try { await depotAffaires.majorer(o.id, { label: nom }); await charger(); peindre(); }
    catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  async function compter(o) {
    const n = await demander({
      titre: `Combien de ${nomType(o.kind).toLowerCase()}`, label: "Quantité",
      valeur: String(o.quantity ?? 1)
    });
    if (n === null) return;
    const valeur = Math.max(0, Math.min(999, Number(n) || 0));
    try { await depotAffaires.majorer(o.id, { quantity: valeur }); await charger(); peindre(); }
    catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  async function remplir(encrier) {
    const flacon = objets.find((o) => o.kind === "encre" && Number(o.level || 0) > 0
      && !indisponible(o, moi));
    if (!flacon) {
      toast("Aucun flacon d'encre", {
        corps: "Procurez-vous un flacon : c'est lui qui remplit l'encrier.", type: "attn"
      });
      return;
    }
    try {
      const { verse } = await depotAffaires.remplir(encrier, flacon);
      if (!verse) { toast("L'encrier est déjà plein."); return; }
      succes(`Encrier rempli (+${verse} %)`);
      await charger(); peindre();
    } catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  async function procurer() {
    const cree = await acquerirObjet({});
    if (!cree) return;
    await charger(); peindre();
  }

  /* ===================================================================== */
  /* Préparation                                                            */
  /* ===================================================================== */
  function panneauPreparation() {
    const classes = espaces;
    if (!classes.length) {
      return blocVide(`Aucune ${L("classe")}`,
        `Rejoignez une ${L("classe")} avec son code : c'est elle qui dit ce qu'il faut apporter.`,
        { libelle: `Mes ${L("classes")}`, action: () => aller("/classes") });
    }
    return el("div.grille.grille--2", classes.map(carteClasse));
  }

  function carteClasse(classe) {
    const session = seances.get(classe.id);
    const attendu = materielAttendu(classe, session);
    const sac = sacs.get(classe.id);
    const manque = ecart(sac, attendu);
    const equipe = depotCartable.equipePour(sac, session?.id);

    return el("article.carte.carte--cartable",
      el("header.carte__entete",
        el("h3.carte__titre", classe.name),
        !sac
          ? el("span.etiq.etiq--attn", icone("alerte", 12), "Sac vide")
          : session && !equipe
            ? el("span.etiq.etiq--attn", icone("alerte", 12), "Pas équipé aujourd'hui")
            : manque.total
              ? el("span.etiq", { class: manque.bloquants.length ? "etiq--attn" : "etiq--info" },
                  icone("alerte", 12), `${manque.total} manquant${manque.total > 1 ? "s" : ""}`)
              : el("span.etiq.etiq--ok", icone("coche", 12), "En ordre")),

      session
        ? el("p.petit", el("span.etiq.etiq--laiton", icone("direct", 11), "Séance en cours"), " ", session.title)
        : null,

      attendu.vide()
        ? el("p.petit.faible", "Rien n'a été demandé pour cette " + L("classe") + ".")
        : el("div.consigne-lue",
            el("span.consigne-lue__titre", icone("sac", 11), " Demandé"),
            el("div.consigne-lue__objets",
              [...attendu.supports.map((s) => ({ kind: "cahier", label: s.title, niveau: "obligatoire" })),
               ...attendu.requis]
                .map((r) => el("span.consigne-lue__item", {
                  class: `consigne-lue__item--${r.niveau}`,
                  title: { obligatoire: "Obligatoire", recommande: "Recommandé", facultatif: "Facultatif" }[r.niveau]
                },
                  figureObjet(r.kind || "autre"),
                  el("span", r.label),
                  manque.noms.includes(r.label)
                    ? el("span.consigne-lue__croix", icone("croix", 10))
                    : el("span.consigne-lue__coche", icone("coche", 10)))))),

      el("div.cartable__apercu", apercuSac(sac)),

      manque.total
        ? el("p.petit.attn", icone("alerte", 12), " Il manque : ", manque.noms.join(", "))
        : null,

      el("div.carte__pied",
        el("button.btn.btn--primaire", {
          onclick: async () => {
            await preparerAffaires({ classe, session });
            await charger(); peindre();
          }
        }, icone("sac", 15), sac ? "Revoir mon sac" : "Préparer mon sac"),
        el("button.btn.btn--fantome", { onclick: () => aller(`/classe/${classe.id}`) },
          "La " + L("classe")))
    );
  }

  /**
   * Ce qu'on porte, tel qu'on le voit d'un coup d'œil : le cartable avec ce
   * qu'il contient vraiment, puis la liste de ce qu'on a déclaré.
   */
  function apercuSac(sac) {
    const portes = objets.filter((o) => fiche(o.kind)?.contenant && o.carried && !o.container_id
      && !indisponible(o, moi));
    const vitrines = portes.map((c) => vitrine(c,
      objets.filter((x) => String(x.container_id || "") === String(c.id) && !indisponible(x, moi)),
      { taille: 112 }));
    const liste = apercuDeclare(sac);
    return vitrines.length ? [...vitrines, ...(Array.isArray(liste) ? liste : [liste])] : liste;
  }

  function apercuDeclare(sac) {
    const contenu = sac?.supplies;
    const objetsDeclares = !contenu ? []
      : Array.isArray(contenu)
        ? contenu.map((v) => ({ kind: null, label: String(v) }))
        : Object.entries(contenu).map(([id, v]) =>
            typeof v === "string" ? { kind: null, label: v } : { kind: v.kind, label: v.label });

    const carte = sac?.notebooks;
    const supportsDeclares = !carte ? []
      : Array.isArray(carte)
        ? carte.map((id) => ({ kind: supports.find((s) => String(s.id) === String(id))?.support || "cahier",
                               label: supports.find((s) => String(s.id) === String(id))?.title || "Support" }))
        : Object.entries(carte).map(([id, titre]) => ({
            kind: supports.find((s) => String(s.id) === String(id))?.support || "cahier",
            label: titre || supports.find((s) => String(s.id) === String(id))?.title || "Support" }));

    const tout = [...supportsDeclares, ...objetsDeclares];
    if (!tout.length) return el("p.petit.faible", "Vous n'emportez rien pour l'instant.");
    return tout.map((x) => el("span.cartable__vignette", { title: x.label },
      figureObjet(x.kind || "autre"),
      el("span.cartable__vignette-nom", x.label)));
  }

  /* ===================================================================== */
  /* Échanges                                                               */
  /* ===================================================================== */
  function panneauEchanges() {
    const rien = !aRepondre.length && !mesOffres.length && !aRendre.length
      && !pretes.length && !histoire.length;
    if (rien) {
      return el("div",
        blocVide("Rien ne circule",
          "Prêter, donner, demander : cela se fait en face à face, en séance ou dans la cour.",
          { libelle: "Demander quelque chose", action: demanderAQuelquun }),
        el("p.petit.faible.centre",
          "Un objet prêté, un document reçu, une plume sans encre : autant de choses à jouer."));
    }

    return el("div",
      el("div.barre-filtres",
        el("button.btn.btn--fantome", { onclick: demanderAQuelquun },
          icone("main", 14), "Demander quelque chose")),

      aRepondre.length
        ? blocRemises("Ça attend votre réponse", aRepondre, (r) => [
            el("button.btn.btn--primaire.btn--petit", {
              onclick: async () => {
                const d = await repondreRemise(r, { objets, fiches, profils: gens });
                if (d) { await charger(); peindre(); }
              }
            }, r.direction === "request" ? "Répondre" : "Voir"),
          ])
        : null,

      aRendre.length
        ? blocRemises("À rendre", aRendre, (r) => [
            el("button.btn.btn--petit", {
              onclick: async () => { if (await rendreRemise(r, { objets })) { await charger(); peindre(); } }
            }, icone("entree", 13), "Rendre")
          ])
        : null,

      pretes.length
        ? blocRemises("Prêté à", pretes, (r) => [
            el("button.btn.btn--fantome.btn--petit", {
              title: "Le reprendre : il vous revient",
              onclick: async () => { if (await rendreRemise(r, { objets })) { await charger(); peindre(); } }
            }, "Le reprendre")
          ])
        : null,

      mesOffres.length
        ? blocRemises("En attente chez l'autre", mesOffres, (r) => [
            el("button.btn.btn--fantome.btn--petit", {
              onclick: async () => { if (await reprendreRemise(r)) { await charger(); peindre(); } }
            }, "Retirer")
          ])
        : null,

      histoire.length
        ? el("section.affaires__section",
            el("h3.affaires__titre", "Ce qui s'est passé"),
            el("p.petit.faible", "Assez pour savoir qui vous a donné quoi, pas plus."),
            el("div.registre", histoire.slice(0, 20).map((r) => el("div.registre__ligne",
              el("span.registre__quand", depuis(r.settled_at || r.created_at)),
              el("span.registre__quoi", texteRemise(r)),
              el("span.etiq", { class: etiqEtat(r.state) }, motEtat(r.state))))))
        : null
    );
  }

  function blocRemises(titre, liste, gestes) {
    return el("section.affaires__section",
      el("h3.affaires__titre", titre, el("span.affaires__compte", String(liste.length))),
      el("div.affaires__liste", liste.map((r) => {
        const o = objets.find((x) => String(x.id) === String(r.belonging_id));
        return el("div.affaire",
          el("div.affaire__ligne",
            o ? vignetteObjet(o, { moiId: moi })
              : el("div.objet-vignette",
                  figureObjet(r.asked_kind || "autre"),
                  el("div.objet-vignette__dit",
                    el("span.objet-vignette__nom", r.asked_label || nomType(r.asked_kind)),
                    el("span.objet-vignette__sous", "demandé"))),
            el("div.affaire__dit",
              el("span.petit", texteRemise(r)),
              r.note ? el("span.petit.faible", "« ", r.note, " »") : null),
            el("span.pousse"),
            ...gestes(r)));
      })));
  }

  function texteRemise(r) {
    const verbe = r.kind === "give" ? "donné" : "prêté";
    if (r.direction === "request") {
      return r.from_user === moi
        ? `Vous avez demandé à ${nomDe(r.to_user)}`
        : `${nomDe(r.from_user)} vous demande`;
    }
    return r.from_user === moi
      ? `Vous l'avez ${verbe} à ${nomDe(r.to_user)}`
      : `${nomDe(r.from_user)} vous l'a ${verbe}`;
  }

  const motEtat = (s) => ({
    offered: "en attente", accepted: "accepté", refused: "refusé",
    returned: "rendu", cancelled: "retiré"
  })[s] || s;

  const etiqEtat = (s) => ({
    offered: "etiq--attn", accepted: "etiq--ok", refused: "etiq--alerte",
    returned: "", cancelled: ""
  })[s] || "";

  /** À qui peut-on demander ? À ceux qu'on croise : les membres de ses espaces. */
  async function demanderAQuelquun() {
    const classes = espaces;
    if (!classes.length) { toast("Rejoignez un espace d'abord."); return; }
    const classe = etat.classeActive && classes.find((c) => c.id === etat.classeActive.id)
      || classes[0];
    const equipe = await depotMembres.liste(classe.id).catch(() => []);
    const index = await personnages.index(classe.id).catch(() => new Map());
    const candidats = equipe.filter((m) => m.status === "active")
      .map((m) => ({ user_id: m.user_id, profil: m.profil, nom: m.profil?.display_name }));

    const fait = await demanderObjet({
      classe, session: seances.get(classe.id), candidats, fiches: index
    });
    if (fait) { await charger(); peindre(); }
  }

  async function tendre(o) {
    const classes = espaces;
    if (!classes.length) { toast("Rejoignez un espace d'abord."); return; }
    const classe = etat.classeActive && classes.find((c) => c.id === etat.classeActive.id)
      || classes[0];
    const equipe = await depotMembres.liste(classe.id).catch(() => []);
    const index = await personnages.index(classe.id).catch(() => new Map());
    const candidats = equipe.filter((m) => m.status === "active")
      .map((m) => ({ user_id: m.user_id, profil: m.profil, nom: m.profil?.display_name }));

    const fait = await tendreObjet({
      objet: o, classe, session: seances.get(classe.id), candidats, fiches: index
    });
    if (fait) { await charger(); peindre(); }
  }
}
