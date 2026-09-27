/* ---------------------------------------------------------------------------
 * L'établi : préparer ses affaires.
 *
 * Deux plateaux et un geste. À gauche ce qui reste chez soi, à droite ce qu'on
 * emporte — et l'objet traverse en le voyant voler, parce qu'un inventaire où
 * les choses se téléportent n'est pas un sac, c'est un formulaire à cases.
 *
 * Ce qu'on emporte n'est pas une liste plate : c'est un contenant qui en
 * contient d'autres. La plume est dans la trousse, la trousse est dans le
 * cartable, le cartable est sur l'épaule. On clique un contenant pour l'ouvrir,
 * puis un objet pour l'y mettre — comme on le ferait sur une table.
 *
 * Le cartable sert aussi de frontière : ce qui est resté chez soi ne peut être
 * ni inspecté ni confisqué (voir inspect_notebook et confiscate_belonging). Ce
 * n'est donc pas un décor, c'est la limite de ce qui est atteignable.
 *
 * `session` change la nature du geste. Sans elle, on range tranquillement : le
 * chargement est permanent, il reste d'une fois sur l'autre. Avec elle, on
 * s'équipe POUR CETTE SÉANCE — le sac garde son contenu, mais il faut reposer
 * la main dessus. C'est la différence entre posséder une plume et l'avoir sur
 * soi ce matin.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { cahiers, cartable as depotCartable, affaires as depotAffaires } from "../data/index.js";
import { ouvrirModale, menu } from "../ui/modal.js";
import { succes, erreur, toast, messageErreur } from "../ui/toast.js";
import {
  CATALOGUE, DOTATION, KITS_SUGGERES, fiche, nomObjet, nomType,
  imageObjet, indexer, surMoi, indisponible, niveauEnMots, etatObjet
} from "./affaires.js";
import { materielAttendu, ecart } from "./materiel.js";

export { materielAttendu };
export { imageObjet };

/** Ce qu'on met dans une trousse quand personne n'a rien demandé de précis. */
export const TROUSSE_DEFAUT = ["Plume", "Encre", "Crayon", "Gomme", "Règle", "Buvard"];

const NOMS_SUPPORT = { feuille: "Feuille", cahier: "Cahier", carnet: "Carnet", dossier: "Dossier" };

/**
 * « Je prépare mes affaires. »
 *
 * @returns {Promise<boolean>} Le sac a-t-il été bouclé.
 */
export async function preparerAffaires({ classe, session = null, surEnregistrement = null }) {
  const moi = etat.utilisateur.id;
  const attendu = materielAttendu(classe, session);

  let [mesSupports, sac, objets] = await Promise.all([
    cahiers.mesCahiers(moi).catch(() => []),
    depotCartable.pour(classe.id, moi).catch(() => null),
    depotAffaires.toutes(moi).catch(() => [])
  ]);

  // Une étagère vide n'est pas un choix de jeu, c'est une impasse : on ne peut
  // satisfaire aucune consigne. La dotation se pose une seule fois.
  if (!objets.length) {
    objets = await depotAffaires.assurerDotation(moi, dotationComplete()).catch(() => []);
  }

  /* --- L'état de travail ---------------------------------------------------
     On ne touche à rien avant la validation : préparer son sac, c'est arranger
     des choses puis refermer le rabat. Annuler doit vraiment tout annuler. */
  const place = new Map();    // objetId -> { container, carried }
  for (const o of objets) place.set(String(o.id), { container: o.container_id || null, carried: Boolean(o.carried) });

  const emportes = new Map(Object.entries(normaliserCarte(sac?.notebooks)));
  const index = () => {
    const carte = new Map();
    for (const o of objets) {
      const p = place.get(String(o.id));
      carte.set(String(o.id), { ...o, container_id: p.container, carried: p.carried });
    }
    return carte;
  };

  const utilisables = objets.filter((o) => !indisponible(o, moi));
  const contenants = () => utilisables.filter((o) => fiche(o.kind)?.contenant);

  /** Le contenant ouvert : celui qui reçoit le prochain objet cliqué. */
  let cible = premierContenantPorte();

  function premierContenantPorte() {
    const carte = index();
    const porte = contenants().find((o) => carte.get(String(o.id))?.carried);
    if (!porte) return null;
    // On ouvre la trousse plutôt que le cartable : c'est là que va une plume.
    const dedans = contenants().find((o) =>
      String(carte.get(String(o.id))?.container) === String(porte.id));
    return String((dedans || porte).id);
  }

  function estSurMoi(objetId) {
    return surMoi(index().get(String(objetId)), index());
  }

  /* --- Les nœuds, une fois pour toutes -----------------------------------
     Chaque objet est un nœud unique qu'on DÉPLACE. Le recréer à chaque clic
     casserait l'animation : on ne fait pas voler un élément qui vient de
     naître. */
  const noeuds = new Map();
  for (const o of utilisables) noeuds.set(`o:${o.id}`, noeudObjet(o));
  for (const c of mesSupports) noeuds.set(`s:${c.id}`, noeudSupport(c));

  const etagere   = el("div.plateau__objets");
  const dansLeSac = el("div.plateau__sac");
  const zoneRabat = el("div.cartable__rabat");
  const zoneKits  = el("div.cartable__kits");

  const enregistre = await ouvrirModale({
    titre: session ? "Équiper mes affaires" : "Préparer mes affaires",
    large: true,
    corps: () => {
      const noeud = el("div.cartable",
        el("p.petit.faible",
          session
            ? "Ce que vous emportez en séance. Le sac garde son contenu d'une fois "
              + "sur l'autre — il faut seulement reposer la main dessus avant d'entrer."
            : "Ce que vous mettez dans votre sac est ce dont vous disposerez en séance — "
              + "et c'est aussi la seule chose que l'encadrement pourra vous demander d'ouvrir."),

        attendu.vide() ? null : el("div.cartable__consigne",
          el("span.etiq.etiq--attn", icone("alerte", 12), "Demandé pour cette séance"),
          el("p.petit", attendu.enUneLigne() || "—")),

        zoneKits,

        el("div.etabli",
          el("section.plateau.plateau--etagere",
            el("h3.plateau__titre", icone("grille", 13), " Chez moi"),
            etagere,
            el("p.plateau__vide.petit.faible", "Tout est dans le sac.")),

          el("section.plateau.plateau--sac",
            el("h3.plateau__titre", icone("sac", 13), " Sur moi"),
            dansLeSac,
            el("p.plateau__vide.petit.faible", "Vous n'emportez rien. Cliquez un objet pour le prendre."))
        ),

        zoneRabat
      );
      peindreKits();
      replacer();
      return noeud;
    },
    actions: [
      { libelle: "Annuler", valeur: null },
      {
        libelle: session ? "Je les ai sur moi" : "Boucler le sac", variante: "primaire",
        action: enregistrer
      }
    ]
  });

  if (enregistre) {
    succes(session ? "Affaires équipées" : "Sac bouclé");
    surEnregistrement?.({ notebooks: Object.fromEntries(emportes), supplies: declaration() });
  }
  return enregistre === true;

  /* ======================================================================= */

  /** Ce qu'on déclare emporter : la carte { identifiant: {kind,label} }. */
  function declaration() {
    const sortie = {};
    for (const o of utilisables) {
      if (!estSurMoi(o.id)) continue;
      sortie[String(o.id)] = { kind: o.kind, label: nomObjet(o) };
    }
    return sortie;
  }

  async function enregistrer() {
    try {
      // On n'écrit que ce qui a bougé : une préparation qui ne change rien ne
      // doit pas toucher vingt lignes.
      for (const o of objets) {
        const p = place.get(String(o.id));
        const bouge = String(p.container || "") !== String(o.container_id || "")
          || p.carried !== Boolean(o.carried);
        if (!bouge) continue;
        await depotAffaires.majorer(o.id, { container_id: p.container, carried: p.carried });
        o.container_id = p.container;
        o.carried = p.carried;
      }
      await depotCartable.enregistrer(classe.id, moi, {
        notebooks: Object.fromEntries(emportes),
        supplies: declaration(),
        session: session?.id || null
      });
      return true;
    } catch (err) {
      erreur("Sac non enregistré", messageErreur(err));
      return false;
    }
  }

  /* --- Les plateaux ------------------------------------------------------- */

  /**
   * Repose tous les nœuds à leur place. Appelé une fois à l'ouverture, puis
   * après chaque geste qui change la HIÉRARCHIE (porter un contenant, ouvrir
   * une trousse) — jamais après un simple déplacement, qui doit rester animé.
   */
  function replacer() {
    const carte = index();
    render(etagere, []);
    render(dansLeSac, []);

    for (const c of mesSupports) {
      (emportes.has(String(c.id)) ? dansLeSac : etagere).appendChild(noeuds.get(`s:${c.id}`));
    }

    // Les contenants portés forment des casiers ; le reste tombe en vrac.
    const portes = contenants().filter((o) => carte.get(String(o.id))?.carried);
    for (const contenantPorte of portes) dansLeSac.appendChild(casier(contenantPorte, carte));

    const enVrac = utilisables.filter((o) =>
      !fiche(o.kind)?.contenant && estSurMoi(o.id) && !carte.get(String(o.id))?.container);
    if (enVrac.length) {
      dansLeSac.appendChild(el("div.casier.casier--vrac",
        el("div.casier__entete", el("span.casier__nom", icone("main", 12), " En main"))));
      const vrac = dansLeSac.lastChild;
      const objetsVrac = el("div.casier__objets");
      vrac.appendChild(objetsVrac);
      for (const o of enVrac) objetsVrac.appendChild(noeuds.get(`o:${o.id}`));
    }

    for (const o of utilisables) {
      if (estSurMoi(o.id)) continue;
      etagere.appendChild(noeuds.get(`o:${o.id}`));
    }

    majPlateaux();
  }

  /** Un contenant ouvert sur la table : son nom, ce qu'il tient, et son rabat. */
  function casier(contenantPorte, carte) {
    const dedans = utilisables.filter((o) =>
      String(carte.get(String(o.id))?.container || "") === String(contenantPorte.id));
    const ouvert = String(cible) === String(contenantPorte.id);
    const objetsDedans = el("div.casier__objets");

    const noeud = el("div.casier", { class: ouvert ? "casier--ouvert" : "",
      dataset: { contenant: contenantPorte.kind } },
      el("button.casier__entete", {
        type: "button",
        title: ouvert ? "Ce contenant reçoit ce que vous cliquez"
                      : `Ouvrir ${nomObjet(contenantPorte).toLowerCase()}`,
        onclick: () => { cible = String(contenantPorte.id); replacer(); }
      },
        el("span.casier__figure", { "aria-hidden": "true",
          style: { backgroundImage: `url("${imageObjet(ouvert ? ouvertDe(contenantPorte.kind) : contenantPorte.kind)}")` } }),
        el("span.casier__nom", nomObjet(contenantPorte)),
        el("span.casier__compte", dedans.length ? `${dedans.length}` : "vide"),
        el("span.casier__etat", ouvert ? "ouvert" : "")),
      objetsDedans,
      el("button.casier__laisser", {
        type: "button", title: "Laisser ce contenant chez moi",
        onclick: () => { poserContenant(contenantPorte, false); }
      }, icone("croix", 12))
    );

    for (const o of dedans) {
      if (fiche(o.kind)?.contenant) objetsDedans.appendChild(casier(o, carte));
      else objetsDedans.appendChild(noeuds.get(`o:${o.id}`));
    }
    if (!dedans.length) {
      objetsDedans.appendChild(el("p.casier__vide.petit.faible",
        ouvert ? "Cliquez un objet à gauche pour l'y mettre." : "Rien dedans."));
    }
    return noeud;
  }

  const ouvertDe = (kind) =>
    ["cartable", "trousse"].includes(kind) ? `${kind}-ouverte`.replace("cartable-ouverte", "cartable-ouvert") : kind;

  /* --- Le geste ----------------------------------------------------------- */

  /**
   * L'objet vole d'un plateau à l'autre.
   *
   * Technique FLIP : on relève sa position AVANT de le déplacer, on le déplace
   * dans le DOM, on relève sa position APRÈS, puis on le renvoie optiquement à
   * son point de départ avant de relâcher. Le navigateur interpole le reste.
   * Rien n'est simulé : c'est bien le même objet qui traverse, pas une copie
   * qui s'allume ailleurs.
   */
  function animer(noeud, action) {
    const avant = noeud.getBoundingClientRect();
    const versLeSac = action();
    const apres = noeud.getBoundingClientRect();
    const dx = avant.left - apres.left;
    const dy = avant.top - apres.top;
    if (!dx && !dy) return;

    // Un léger sursaut d'échelle : l'objet qu'on saisit se soulève avant de se
    // poser. Sans cela le trajet est juste, mais mou.
    noeud.style.transition = "none";
    noeud.style.transform = `translate(${dx}px, ${dy}px) scale(${versLeSac ? 1.14 : 0.9})`;
    noeud.style.zIndex = "5";
    requestAnimationFrame(() => {
      noeud.style.transition = "transform 320ms cubic-bezier(.34,1.3,.5,1)";
      noeud.style.transform = "";
      setTimeout(() => { noeud.style.zIndex = ""; noeud.style.transition = ""; }, 340);
    });
  }

  function basculerObjet(objet) {
    const noeud = noeuds.get(`o:${objet.id}`);
    const dedans = estSurMoi(objet.id);

    if (fiche(objet.kind)?.contenant && !dedans) { poserContenant(objet, true); return; }
    if (fiche(objet.kind)?.contenant && dedans)  { poserContenant(objet, false); return; }

    if (!dedans && !cible) {
      toast("Prenez d'abord un contenant", {
        corps: "Un cartable, une musette, une sacoche : il faut bien porter tout cela.",
        type: "attn"
      });
      return;
    }

    animer(noeud, () => {
      place.set(String(objet.id), dedans
        ? { container: null, carried: false }
        : { container: cible, carried: false });
      replacer();
      return !dedans;
    });
  }

  /**
   * Prendre ou laisser un contenant. Ce qu'il tient part avec lui : on ne vide
   * pas sa trousse pour la poser sur l'étagère.
   */
  function poserContenant(contenantPorte, prendre) {
    const p = place.get(String(contenantPorte.id));
    if (prendre) {
      // Une trousse se met dans le cartable si on en porte un ; sinon on la
      // porte à la main, ce qui est permis et se voit.
      const carte = index();
      const hote = contenants().find((o) =>
        carte.get(String(o.id))?.carried && !carte.get(String(o.id))?.container
        && String(o.id) !== String(contenantPorte.id)
        && o.kind !== contenantPorte.kind);
      place.set(String(contenantPorte.id), { container: hote ? String(hote.id) : null, carried: true });
      cible = String(contenantPorte.id);
    } else {
      place.set(String(contenantPorte.id), { container: null, carried: false });
      if (String(cible) === String(contenantPorte.id)) cible = premierContenantPorte();
    }
    replacer();
  }

  function basculerSupport(c) {
    const noeud = noeuds.get(`s:${c.id}`);
    const dedans = emportes.has(String(c.id));
    animer(noeud, () => {
      if (dedans) emportes.delete(String(c.id));
      else emportes.set(String(c.id), c.title || "");
      replacer();
      return !dedans;
    });
  }

  /* --- Les nœuds ---------------------------------------------------------- */

  function noeudObjet(o) {
    const f = fiche(o.kind) || {};
    const demande = (attendu.requis || []).some((r) => r.kind === o.kind);
    const niveau = f.consomme && o.level != null ? Number(o.level) : null;
    const etatLu = etatObjet(o, moi);

    return el("button.objet", {
      type: "button",
      dataset: { kind: o.kind },
      class: [demande ? "objet--demande" : "", f.contenant ? "objet--contenant" : ""].join(" ").trim(),
      title: f.aide || nomType(o.kind),
      onclick: () => basculerObjet(o),
      oncontextmenu: (e) => { e.preventDefault(); menuObjet(e.currentTarget, o); }
    },
      el("span.objet__figure", { dataset: { objet: o.kind }, "aria-hidden": "true",
        style: { backgroundImage: `url("${imageObjet(o.kind)}")` } }),
      el("span.objet__nom", nomObjet(o)),
      el("span.objet__type",
        f.nombre && o.quantity != null ? `${o.quantity} unités`
          : niveau != null ? niveauEnMots(niveau)
          : nomType(o.kind)),
      niveau != null
        ? el("span.jauge.jauge--objet", el("span.jauge__remplissage", { style: { width: `${Math.max(3, niveau)}%` } }))
        : null,
      etatLu ? el("span.objet__etat", etatLu.libelle) : null,
      demande ? el("span.objet__demande", "demandé") : null
    );
  }

  function noeudSupport(c) {
    const demande = (attendu.supports || []).some((s) =>
      String(s.id) === String(c.id)
      || String(s.title || "").trim().toLowerCase() === String(c.title || "").trim().toLowerCase());

    return el("button.objet.objet--support", {
      type: "button",
      dataset: { support: c.support || "cahier" },
      class: demande ? "objet--demande" : "",
      onclick: () => basculerSupport(c)
    },
      el("span.objet__figure", { dataset: { objet: c.support || "cahier" }, "aria-hidden": "true",
        style: { backgroundImage: `url("${imageObjet(c.support || "cahier")}")` } }),
      el("span.objet__nom", c.title),
      el("span.objet__type", NOMS_SUPPORT[c.support] || "Cahier"),
      demande ? el("span.objet__demande", "demandé") : null
    );
  }

  function menuObjet(ancre, o) {
    const f = fiche(o.kind) || {};
    menu(ancre, [
      { titre: nomObjet(o) },
      f.consomme
        ? { libelle: `Niveau : ${niveauEnMots(o.level)}`, }
        : null,
      o.kind === "encrier"
        ? { libelle: "Remplir au flacon", icone: "goutte", action: () => remplirEncrier(o) }
        : null,
      { libelle: o.state === "lost" ? "Je l'ai retrouvé" : "Je l'ai perdu",
        icone: o.state === "lost" ? "coche" : "alerte",
        action: async () => {
          try {
            const maj = o.state === "lost"
              ? await depotAffaires.retrouver(o.id)
              : await depotAffaires.perdre(o.id);
            Object.assign(o, maj);
            place.set(String(o.id), { container: maj.container_id || null, carried: Boolean(maj.carried) });
            toast(o.state === "lost" ? "Perdu" : "Retrouvé");
            replacer();
          } catch (err) { erreur("Impossible", messageErreur(err)); }
        } }
    ].filter(Boolean));
  }

  async function remplirEncrier(encrier) {
    const flacon = utilisables.find((o) => o.kind === "encre" && Number(o.level || 0) > 0);
    if (!flacon) {
      toast("Aucun flacon d'encre", { corps: "Il vous faut un flacon pour remplir l'encrier.", type: "attn" });
      return;
    }
    try {
      const { verse } = await depotAffaires.remplir(encrier, flacon);
      if (!verse) { toast("L'encrier est déjà plein."); return; }
      encrier.level = Number(encrier.level || 0) + verse;
      flacon.level = Number(flacon.level || 0) - verse;
      succes(`Encrier rempli (${verse} %)`);
      // Le niveau se voit sur la figure : on refait ce nœud-là, pas le reste.
      noeuds.set(`o:${encrier.id}`, noeudObjet(encrier));
      noeuds.set(`o:${flacon.id}`, noeudObjet(flacon));
      replacer();
    } catch (err) { erreur("Impossible", messageErreur(err)); }
  }

  /* --- Les kits ----------------------------------------------------------- */

  /** Un kit est un raccourci, pas une obligation : il ajoute, il ne vide pas. */
  function peindreKits() {
    const utiles = KITS_SUGGERES.filter((k) =>
      k.objets.some((kind) => utilisables.some((o) => o.kind === kind)));
    if (!utiles.length) { render(zoneKits, []); return; }

    render(zoneKits,
      el("span.petit.faible", "Kits : "),
      utiles.map((k) => el("button.btn.btn--fantome.btn--petit", {
        type: "button", title: `Prendre : ${k.objets.map(nomType).join(", ")}`,
        onclick: () => appliquerKit(k)
      }, k.nom)),
      el("button.btn.btn--fantome.btn--petit", {
        type: "button", title: "Prendre ce qui a été demandé",
        onclick: () => appliquerKit({ nom: "Consigne", objets: (attendu.requis || []).map((r) => r.kind).filter(Boolean) }),
        disabled: attendu.vide()
      }, icone("alerte", 12), " La consigne")
    );
  }

  function appliquerKit(kit) {
    if (!cible) {
      const cartablePossede = contenants()[0];
      if (!cartablePossede) { toast("Il vous faut un contenant."); return; }
      poserContenant(cartablePossede, true);
    }
    let pris = 0;
    for (const kind of kit.objets) {
      const o = utilisables.find((x) => x.kind === kind && !estSurMoi(x.id));
      if (!o) continue;
      if (fiche(kind)?.contenant) poserContenant(o, true);
      else place.set(String(o.id), { container: cible, carried: false });
      pris++;
    }
    // Les supports demandés partent avec : « prends la consigne » veut dire
    // tout ce qui a été demandé, cahier compris.
    if (kit.nom === "Consigne") {
      for (const s of attendu.supports || []) {
        const c = mesSupports.find((x) =>
          String(x.id) === String(s.id)
          || String(x.title || "").trim().toLowerCase() === String(s.title || "").trim().toLowerCase());
        if (c && !emportes.has(String(c.id))) { emportes.set(String(c.id), c.title || ""); pris++; }
      }
    }
    replacer();
    toast(pris ? `${pris} objet${pris > 1 ? "s" : ""} pris` : "Vous les avez déjà tous.");
  }

  /** Le rabat annonce ce qu'on emporte et ce qui manque encore. */
  function majPlateaux() {
    etagere.parentElement?.classList.toggle("plateau--nu", !etagere.children.length);
    dansLeSac.parentElement?.classList.toggle("plateau--nu", !dansLeSac.children.length);

    const manque = ecart(
      { notebooks: Object.fromEntries(emportes), supplies: declaration() }, attendu);
    const total = Object.keys(declaration()).length + emportes.size;

    render(zoneRabat,
      el("span.cartable__compte",
        total ? `${total} objet${total > 1 ? "s" : ""} sur moi` : "Les mains vides"),
      manque.total
        ? el("span.cartable__manque", icone("alerte", 12), " Il manque : ", manque.noms.join(", "))
        : el("span.cartable__complet", icone("coche", 12), " Rien n'a été oublié")
    );
  }
}

/** La dotation, enrichie de ce que le catalogue sait de chaque objet. */
export function dotationComplete() {
  return DOTATION.map((item) => {
    const f = CATALOGUE[item.kind] || {};
    return {
      ...item,
      label: f.libelle || item.kind,
      category: f.categorie || "autre",
      contenant: Boolean(f.contenant)
    };
  });
}

function normaliserCarte(valeur) {
  if (!valeur) return {};
  if (Array.isArray(valeur)) return Object.fromEntries(valeur.map((id) => [String(id), ""]));
  return valeur;
}

/**
 * Le contrôle du matériel, vu de l'estrade : qui a quoi, qui a oublié quoi.
 * On ne liste pas le contenu du sac dans le détail — seulement l'écart avec ce
 * qui a été demandé, parce que c'est cela qui se joue.
 */
export function ligneMateriel(sac, attendu, options = {}) {
  if (!sac) {
    return el("span.etiq.etiq--attn", icone("alerte", 12),
      options.court ? "Sac non préparé" : "N'a pas préparé son sac");
  }
  // Un sac préparé un autre jour n'est pas un sac qu'on a sur soi. Le dire à
  // part : « il a oublié sa plume » et « il n'a pas repris ses affaires » ne
  // se jouent pas de la même manière.
  if (options.session && String(sac.last_session) !== String(options.session)) {
    return el("span.etiq.etiq--attn", icone("alerte", 12),
      options.court ? "Pas équipé" : "N'a pas repris ses affaires");
  }
  const manque = ecart(sac, attendu);
  if (!manque.total) {
    return el("span.etiq.etiq--ok", icone("coche", 12),
      options.court ? "En ordre" : "Matériel complet");
  }
  const dur = manque.bloquants.length || manque.supports.length;
  return el("span.etiq", { class: dur ? "etiq--attn" : "etiq--info", title: `Manque : ${manque.noms.join(", ")}` },
    icone("alerte", 12),
    options.court ? `${manque.total} oubli${manque.total > 1 ? "s" : ""}` : `Oublié : ${manque.noms.join(", ")}`);
}
