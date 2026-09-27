/* ---------------------------------------------------------------------------
 * Les affaires.
 *
 * Un objet n'est pas une ligne dans une base : c'est quelque chose qu'on
 * possède, qu'on range, qu'on emporte, qu'on tend, qu'on oublie. Ce module
 * tient le catalogue — ce qui existe dans cet univers et à quoi cela sert —
 * et les petits calculs qui en découlent : où est un objet, l'ai-je sur moi,
 * ai-je de quoi écrire.
 *
 * Le catalogue vit ICI et non en base. Ajouter un objet ne doit pas demander
 * une migration : il faut un nom, une catégorie, un dessin, et c'est tout.
 *
 * Deux limites tenues volontairement :
 *   — pas de poids, pas de cases d'inventaire, pas de rareté, pas de monnaie.
 *     Ce n'est pas un jeu de rôle informatique, c'est une salle de classe.
 *   — un seul consommable qui se vide tout seul : l'encre. C'est celui qui
 *     donne une raison de préparer ses affaires. Les autres se gèrent à la
 *     main, comme dans la vie.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";

/* ===========================================================================
   Les catégories — elles servent à retrouver, pas à classer savamment
   ========================================================================= */
export const CATEGORIES = [
  { cle: "contenant",     libelle: "Contenants" },
  { cle: "ecriture",      libelle: "Écriture" },
  { cle: "papier",        libelle: "Papier" },
  { cle: "mathematiques", libelle: "Mathématiques" },
  { cle: "geometrie",     libelle: "Géométrie" },
  { cle: "administratif", libelle: "Administratif" },
  { cle: "mission",       libelle: "Mission" },
  { cle: "personnel",     libelle: "Personnel" },
  { cle: "autre",         libelle: "Autre" }
];

/* ===========================================================================
   Le catalogue

   `contenant` : on peut ranger des choses dedans.
   `ecrit`     : cela trace. Sans un de ces objets, on ne prend pas de notes.
   `encre`     : cela a besoin d'encre pour tracer.
   `consomme`  : cela se vide, et le niveau se voit.
   `nombre`    : cela se compte (une pile de feuilles, des craies).
   ========================================================================= */
export const CATALOGUE = {
  /* --- Ce qui porte le reste --------------------------------------------- */
  cartable:  { libelle: "Cartable",  categorie: "contenant", contenant: true,
               aide: "Cuir fauve, deux sangles, poignée rigide." },
  sacoche:   { libelle: "Sacoche",   categorie: "contenant", contenant: true,
               aide: "En bandoulière, pour les papiers." },
  musette:   { libelle: "Musette",   categorie: "contenant", contenant: true,
               aide: "Toile réglementaire, large ouverture." },
  mallette:  { libelle: "Mallette",  categorie: "contenant", contenant: true,
               aide: "Rigide, fermoirs en laiton. Pour se présenter." },
  trousse:   { libelle: "Trousse",   categorie: "contenant", contenant: true,
               aide: "Toile huilée olive. Elle se met dans le cartable." },
  etui:      { libelle: "Étui",      categorie: "contenant", contenant: true,
               aide: "Long et étroit, pour les instruments." },
  boite:     { libelle: "Boîte",     categorie: "contenant", contenant: true,
               aide: "Se garde chez soi plus qu'on ne l'emporte." },

  /* --- Écrire ------------------------------------------------------------- */
  plume:     { libelle: "Plume",     categorie: "ecriture", ecrit: true, encre: true,
               aide: "Bec d'acier, manche de bois. Sans encre, elle gratte." },
  "stylo-plume": { libelle: "Stylo plume", categorie: "ecriture", ecrit: true, encre: true,
               aide: "Corps laqué, agrafe de laiton. Il boit à l'encrier comme la plume." },
  crayon:    { libelle: "Crayon",    categorie: "ecriture", ecrit: true,
               aide: "Mine de graphite. Il écrit toujours." },
  encrier:   { libelle: "Encrier",   categorie: "ecriture", consomme: true,
               aide: "C'est lui qui se vide quand on écrit à la plume." },
  encre:     { libelle: "Flacon d'encre", categorie: "ecriture", consomme: true,
               aide: "De quoi remplir l'encrier plusieurs fois." },
  craie:     { libelle: "Craie",     categorie: "ecriture", ecrit: true, nombre: true,
               aide: "Pour le tableau. Elle s'use." },
  gomme:     { libelle: "Gomme",     categorie: "ecriture",
               aide: "Caoutchouc gris. Elle laisse des miettes." },
  buvard:    { libelle: "Buvard",    categorie: "ecriture",
               aide: "On le pose sur l'encre fraîche avant de tourner la page." },

  /* --- Papier ------------------------------------------------------------- */
  feuilles:  { libelle: "Feuilles",  categorie: "papier", nombre: true,
               aide: "Une pile de feuilles vierges." },
  pochette:  { libelle: "Pochette de documents", categorie: "papier", contenant: true,
               aide: "Toile olive, rabat de cuir. On y glisse ses feuilles." },
  chemise:   { libelle: "Chemise",   categorie: "papier", contenant: true,
               aide: "Carton souple à rabats, pour tenir des papiers ensemble." },

  /* --- Calculer ----------------------------------------------------------- */
  "regle-a-calcul": { libelle: "Règle à calcul", categorie: "mathematiques",
               aide: "Réglette coulissante et curseur. Aucune pile, aucun écran." },
  boulier:   { libelle: "Boulier",   categorie: "mathematiques",
               aide: "Cadre de bois, tringles d'acier, boules d'os." },

  /* --- Tracer ------------------------------------------------------------- */
  regle:     { libelle: "Règle",     categorie: "geometrie",
               aide: "Buis gradué, arête de laiton." },
  equerre:   { libelle: "Équerre",   categorie: "geometrie", aide: "Bois clair, angle droit." },
  compas:    { libelle: "Compas",    categorie: "geometrie", aide: "Laiton et acier, vis de serrage." },
  rapporteur:{ libelle: "Rapporteur",categorie: "geometrie", aide: "Demi-disque de corne graduée." },

  /* --- Administrer -------------------------------------------------------- */
  registre:  { libelle: "Registre",  categorie: "administratif",
               aide: "Grand format relié. On y consigne, on n'y rature pas." },
  cachet:    { libelle: "Cachet",    categorie: "administratif",
               aide: "Tampon de laiton à manche de bois." },

  /* --- Servir ------------------------------------------------------------- */
  carte:     { libelle: "Carte",     categorie: "mission", aide: "Pliée en huit, usée aux plis." },
  boussole:  { libelle: "Boussole",  categorie: "mission", aide: "Boîtier de cuivre, couvercle à charnière." },
  lorgnette: { libelle: "Lorgnette", categorie: "mission", aide: "Laiton et cuir, trois éléments." },
  lanterne:  { libelle: "Lanterne",  categorie: "mission", consomme: true,
               aide: "À huile. Elle éclaire tant qu'il en reste." },

  /* --- À soi -------------------------------------------------------------- */
  montre:    { libelle: "Montre",    categorie: "personnel", aide: "À gousset, chaîne de laiton." },
  gourde:    { libelle: "Gourde",    categorie: "personnel", consomme: true,
               aide: "Fer-blanc gainé de feutre." }
};

/** Les supports d'écriture sont des cahiers, pas des affaires : ils ont des
 *  pages, une marge, un contenu. Ils apparaissent quand même sur l'étagère du
 *  cartable, et leur dessin vient de la même série. */
export const SUPPORTS_DESSINES = ["cahier", "carnet", "feuille", "dossier"];

export const TYPES = Object.keys(CATALOGUE);

export const fiche = (kind) => CATALOGUE[kind] || null;

export function nomType(kind) {
  return CATALOGUE[kind]?.libelle
    || String(kind || "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** L'intitulé qu'on lui a donné, sinon celui de son type. */
export function nomObjet(objet) {
  return String(objet?.label || "").trim() || nomType(objet?.kind);
}

export function categorieDe(kind) {
  return CATALOGUE[kind]?.categorie || "autre";
}

/**
 * Le dessin d'un objet. « Règle à calcul » → `regle-a-calcul.svg`.
 *
 * Les images sont livrées avec le dépôt : aucune n'est à télécharger. Si l'une
 * manquait, le navigateur échoue en silence sur l'url et la silhouette
 * dessinée en CSS reste dessous — un objet sans image reste donc un objet.
 */
export function imageObjet(kind) {
  const cle = String(kind || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "autre";

  // La page autonome n'a pas de fichiers a cote : elle transporte les images
  // avec elle, en data-uri. Ailleurs, on va les chercher normalement.
  const embarques = globalThis.__OJM_OBJETS__;
  if (embarques && embarques[cle]) return embarques[cle];

  // Une photographie quand elle existe, le dessin sinon. Les photographies
  // sont les objets eux-memes ; les dessins restent en repli, pour qu'un type
  // ajoute au catalogue ne s'affiche jamais comme une case vide.
  if (PHOTOS.has(cle)) return `assets/objets/photos/${cle}.jpg`;
  return `assets/objets/${cle}.svg`;
}

/**
 * Les objets photographies. Tous sortent de la meme seance : meme fond
 * (#0d1013), meme lumiere venue du haut-gauche, memes matieres. La liste est
 * tenue a la main : un fichier absent ferait une case vide, et un navigateur
 * ne dit pas qu'une image manque — il n'affiche rien.
 */
export const PHOTOS = new Set([
  "boulier", "buvard", "cahier", "cahier-ouvert", "carnet", "cartable",
  "cartable-ouvert", "compas", "craie", "crayon", "dossier", "encre",
  "encrier", "equerre", "feuille", "feuilles", "gomme", "musette", "plume",
  "pochette", "rapporteur", "regle", "regle-a-calcul", "sacoche",
  "stylo-plume", "trousse", "trousse-ouverte"
]);

/* ===========================================================================
   La dotation de départ

   Personne ne commence les mains vides : on arrive à l'école avec son
   cartable. Sans cela, la première visite montre une étagère vide et une
   consigne qu'on ne peut pas satisfaire.
   ========================================================================= */
export const DOTATION = [
  { kind: "cartable", carried: true },
  { kind: "trousse",  carried: true, dans: "cartable" },
  { kind: "plume",   dans: "trousse" },
  { kind: "encrier", dans: "trousse", level: 100 },
  { kind: "crayon",  dans: "trousse" },
  { kind: "gomme",   dans: "trousse" },
  { kind: "regle",   dans: "trousse" },
  { kind: "buvard",  dans: "cartable" },
  { kind: "feuilles", dans: "cartable", quantity: 20 }
];

/* ===========================================================================
   Les kits — un raccourci, jamais une obligation
   ========================================================================= */
export const KITS_SUGGERES = [
  { nom: "Écrire",        objets: ["plume", "encrier", "buvard", "feuilles"] },
  { nom: "Mathématiques", objets: ["plume", "encrier", "regle", "equerre", "compas", "regle-a-calcul"] },
  { nom: "Réunion",       objets: ["plume", "encrier", "chemise", "montre"] },
  { nom: "Mission",       objets: ["crayon", "carte", "boussole", "lorgnette", "gourde"] },
  { nom: "Bureau",        objets: ["plume", "encrier", "registre", "cachet", "buvard"] }
];

/* ===========================================================================
   Où sont les choses
   ========================================================================= */

/** Index id → objet, pour remonter une chaîne de contenants. */
export function indexer(objets) {
  return new Map(objets.map((o) => [String(o.id), o]));
}

/**
 * Cet objet est-il sur moi ?
 *
 * On remonte la chaîne des contenants : la plume est dans la trousse, la
 * trousse est dans le cartable, le cartable est porté — donc la plume est sur
 * moi. Un contenant porté l'est pour lui-même.
 */
export function surMoi(objet, index, profondeurMax = 6) {
  let courant = objet;
  for (let i = 0; i < profondeurMax && courant; i++) {
    if (courant.carried) return true;
    if (!courant.container_id) return false;
    courant = index.get(String(courant.container_id));
  }
  return false;
}

/** Ce qui est directement dans ce contenant. */
export function contenu(objets, contenantId) {
  return objets.filter((o) => String(o.container_id || "") === String(contenantId));
}

/** Un objet dont je ne dispose pas en ce moment. */
export function indisponible(objet, moiId) {
  if (!objet) return true;
  if (objet.state === "lost" || objet.state === "confiscated") return true;
  // Prêté à quelqu'un d'autre : il n'est plus dans mon sac, même s'il est à moi.
  if (objet.state === "lent" && String(objet.holder_id || "") !== String(moiId)) return true;
  return false;
}

/** Ce dont je dispose réellement : à moi et présent, ou emprunté et en main. */
export function disponibles(objets, moiId) {
  return objets.filter((o) => !indisponible(o, moiId));
}

/* ===========================================================================
   De quoi écrire
   ========================================================================= */

/**
 * Peut-on prendre des notes avec ce qu'on a sur soi ?
 *
 * Il faut un objet qui trace, et de l'encre s'il en réclame. Un crayon suffit
 * donc toujours — c'est voulu : la privation doit se justifier d'un mot
 * (« tu n'as rien pour écrire »), sinon elle passe pour de l'arbitraire.
 */
export function deQuoiEcrire(objets, moiId) {
  const index = indexer(objets);
  const surSoi = objets.filter((o) => !indisponible(o, moiId) && surMoi(o, index));

  const autonomes = surSoi.filter((o) => fiche(o.kind)?.ecrit && !fiche(o.kind)?.encre);
  if (autonomes.length) return { peut: true, avec: autonomes[0] };

  const aEncre = surSoi.filter((o) => fiche(o.kind)?.ecrit && fiche(o.kind)?.encre);
  if (!aEncre.length) return { peut: false, raison: "rien qui trace" };

  const encriers = surSoi.filter((o) => o.kind === "encrier" && (o.level ?? 0) > 0);
  if (!encriers.length) return { peut: false, raison: "plus d'encre", avec: aEncre[0] };

  return { peut: true, avec: aEncre[0], encrier: encriers[0] };
}

/** L'encrier qui sert, s'il y en a un sur soi. */
export function encrierEnService(objets, moiId) {
  const index = indexer(objets);
  return objets.find((o) => o.kind === "encrier" && !indisponible(o, moiId) && surMoi(o, index)) || null;
}

/* ===========================================================================
   Affichage
   ========================================================================= */

const ETATS = {
  owned:       { libelle: "",            etiq: "" },
  lent:        { libelle: "Prêté",       etiq: "etiq--attn" },
  borrowed:    { libelle: "Emprunté",    etiq: "etiq--info" },
  lost:        { libelle: "Perdu",       etiq: "etiq--alerte" },
  confiscated: { libelle: "Confisqué",   etiq: "etiq--alerte" }
};

/** L'état d'un objet, vu par quelqu'un. Dit « À rendre » plutôt que « Prêté »
 *  quand c'est nous qui l'avons entre les mains : ce n'est pas la même dette. */
export function etatObjet(objet, moiId) {
  if (!objet) return null;
  if (objet.state === "lent") {
    return String(objet.holder_id || "") === String(moiId)
      ? { libelle: "À rendre", etiq: "etiq--info" }
      : ETATS.lent;
  }
  const lu = ETATS[objet.state] || ETATS.owned;
  return lu.libelle ? lu : null;
}

/** Le niveau d'un consommable, en mot. */
export function niveauEnMots(niveau) {
  const n = Number(niveau);
  if (!Number.isFinite(n)) return "";
  if (n <= 0) return "vide";
  if (n <= 15) return "presque vide";
  if (n <= 40) return "entamé";
  if (n <= 80) return "à moitié";
  return "plein";
}

/**
 * La figure d'un objet : son dessin, et rien d'autre. Sert partout — étagère,
 * sac, aperçu, console flottante — pour que le même objet ait la même tête
 * d'un écran à l'autre.
 */
export function figureObjet(kind, { taille = null } = {}) {
  return el("span.objet__figure", {
    dataset: { objet: kind },
    "aria-hidden": "true",
    style: {
      backgroundImage: `url("${imageObjet(kind)}")`,
      ...(taille ? { width: `${taille}px`, height: `${taille}px` } : {})
    }
  });
}

/**
 * L'objet détouré : sa photographie sans le fond. C'est lui qu'on pose DANS un
 * contenant — une vignette carrée noire collée sur la toile d'une trousse ne
 * ferait pas illusion une seconde.
 */
export function imageDetouree(kind) {
  const cle = String(kind || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "autre";
  const embarques = globalThis.__OJM_OBJETS__;
  if (embarques && embarques[`detoure:${cle}`]) return embarques[`detoure:${cle}`];
  if (PHOTOS.has(cle)) return `assets/objets/detoures/${cle}.webp`;
  if (embarques && embarques[`sans-fond:${cle}`]) return embarques[`sans-fond:${cle}`];
  return `assets/objets/sans-fond/${cle}.svg`;
}

/* ===========================================================================
   La vitrine : un contenant et ce qu'il contient VRAIMENT

   Une trousse vide reste une trousse fermée, rien ne dépasse. Une trousse
   garnie laisse voir ce qu'on y a mis — ces objets-là, pas ceux qu'il y avait
   le jour de la photo. Le cartable s'ouvre, et ce qu'il contient se tient dans
   ses compartiments, caché à mi-hauteur par le rabat avant.

   Deux mises en scène, selon ce que la photographie permet :
     · « fente »   — le contenant est ouvert ; les objets sont posés par-dessus
                     puis découpés le long du bord avant, si bien qu'ils
                     semblent plonger dedans ;
     · « derrière » — le contenant est fermé ; les objets sont glissés
                     derrière lui et dépassent par le haut, comme des crayons
                     qui sortent d'une trousse trop pleine.
   ========================================================================= */
const SCENES = {
  cartable: {
    ouvert: "cartable-ouvert", mode: "fente",
    // Le bord avant du cartable ouvert : ce qui passe sous cette ligne est
    // dans le sac. Relevé en pourcentage de l'image.
    fente: "polygon(15% 0, 85% 0, 85% 57%, 71.7% 55%, 17.5% 42.5%)",
    de: 22, a: 76, bord: (x) => 42.5 + (x - 17.5) * (12.5 / 54.2), hauteur: 44
  },
  // « bord » : la hauteur (en %) du haut du contenant fermé. Ce qui dépasse
  // au-dessus se voit ; le reste est caché derrière lui.
  trousse:  { mode: "derriere", de: 20, a: 80, bord: () => 44, hauteur: 52 },
  musette:  { mode: "derriere", de: 26, a: 74, bord: () => 36, hauteur: 46 },
  sacoche:  { mode: "derriere", de: 30, a: 70, bord: () => 40, hauteur: 44 },
  pochette: { mode: "derriere", de: 24, a: 76, bord: () => 26, hauteur: 42 },
  mallette: { mode: "derriere", de: 24, a: 76, bord: () => 36, hauteur: 42 },
  etui:     { mode: "derriere", de: 20, a: 80, bord: () => 44, hauteur: 40 },
  boite:    { mode: "derriere", de: 26, a: 74, bord: () => 38, hauteur: 42 },
  chemise:  { mode: "derriere", de: 24, a: 76, bord: () => 28, hauteur: 38 }
};

/** Les objets longs se tiennent debout ; on les fait pencher un peu, chacun
 *  différemment, parce qu'un sac rempli à la règle n'a jamais existé. */
const INCLINAISONS = [-9, 6, -3, 11, -13, 4, -6, 9];

export function vitrine(contenant, dedans = [], { taille = 120, titre = true } = {}) {
  const scene = SCENES[contenant.kind];
  const plein = dedans.length > 0;
  const racine = el("div.vitrine", {
    class: plein ? "vitrine--pleine" : "vitrine--vide",
    style: { width: `${taille}px`, height: `${taille}px` },
    title: titre
      ? (plein
          ? `${nomObjet(contenant)} : ${dedans.map(nomObjet).join(", ")}`
          : `${nomObjet(contenant)} — vide`)
      : null
  });

  // Vide, ou sans mise en scène connue : l'objet tel quel, fermé.
  if (!plein || !scene) {
    racine.appendChild(el("span.vitrine__fond", {
      style: { backgroundImage: `url("${imageObjet(contenant.kind)}")` } }));
    if (plein) racine.appendChild(el("span.vitrine__compte", String(dedans.length)));
    return racine;
  }

  // Sept objets au plus : au-delà on ne voit plus rien, on compte.
  const montres = dedans.slice(0, 7);
  const pas = montres.length > 1 ? (scene.a - scene.de) / (montres.length - 1) : 0;
  const objets = el("span.vitrine__objets", {
    style: scene.mode === "fente" ? { clipPath: scene.fente } : null
  });
  montres.forEach((o, i) => {
    const x = montres.length > 1 ? scene.de + i * pas : (scene.de + scene.a) / 2;
    const bord = scene.bord(x);
    // Le pied de l'objet descend sous le bord : c'est ce qui le met DEDANS.
    // Derrière un contenant fermé, on en laisse voir davantage — sinon rien ne
    // dépasserait d'une trousse plate.
    const haut = bord - scene.hauteur * (scene.mode === "fente" ? 0.62 : 0.72);
    objets.appendChild(el("img.vitrine__objet", {
      src: imageDetouree(o.kind), alt: "", draggable: false, loading: "lazy",
      style: {
        left: `${x}%`, top: `${haut}%`, height: `${scene.hauteur}%`,
        transform: `translateX(-50%) rotate(${INCLINAISONS[i % INCLINAISONS.length]}deg)`
      }
    }));
  });

  // En « fente », la photographie entière sert de décor : les objets passent
  // devant. En « derrière », il faut le contenant SANS son fond, sinon le
  // carré sombre de la photo recouvrirait ce qui est censé dépasser.
  const fond = el("span.vitrine__fond", {
    style: { backgroundImage: `url("${scene.mode === "fente"
      ? imageObjet(scene.ouvert)
      : imageDetouree(contenant.kind)}")` } });

  if (scene.mode === "fente") racine.append(fond, objets);
  else racine.append(objets, fond);          // derrière : le contenant cache le pied
  if (dedans.length > montres.length) {
    racine.appendChild(el("span.vitrine__compte", `+${dedans.length - montres.length}`));
  }
  return racine;
}

/**
 * La vignette d'un objet tel qu'on le voit dans une liste : son dessin, son
 * nom, et ce qu'il faut savoir d'un coup d'œil — le niveau d'encre, la
 * quantité, l'état.
 */
export function vignetteObjet(objet, { moiId = null, compacte = false, figure = true } = {}) {
  const f = fiche(objet.kind) || {};
  const etat = etatObjet(objet, moiId);
  const niveau = f.consomme && objet.level != null ? Number(objet.level) : null;

  return el("div.objet-vignette", { class: compacte ? "objet-vignette--compacte" : "" },
    figure ? figureObjet(objet.kind) : null,
    el("div.objet-vignette__dit",
      el("span.objet-vignette__nom", nomObjet(objet)),
      el("span.objet-vignette__sous",
        f.nombre && objet.quantity != null ? `${objet.quantity} ` : "",
        niveau != null ? niveauEnMots(niveau) : (compacte ? "" : (f.aide || nomType(objet.kind)))
      )
    ),
    niveau != null
      ? el("span.jauge", { title: `${niveau} %` },
          el("span.jauge__remplissage", { style: { width: `${Math.max(2, niveau)}%` } }))
      : null,
    etat ? el("span.etiq", { class: etat.etiq }, etat.libelle) : null
  );
}

/** Une pastille d'alerte, pour dire ce qui manque sans faire un tableau. */
export function ligneManque(manque) {
  if (!manque.length) {
    return el("span.etiq.etiq--ok", icone("coche", 12), "Rien n'a été oublié");
  }
  const bloquants = manque.filter((m) => m.niveau === "obligatoire");
  return el("span.etiq", { class: bloquants.length ? "etiq--attn" : "etiq--info",
    title: manque.map((m) => m.label).join(", ") },
    icone("alerte", 12),
    `${manque.length} manquant${manque.length > 1 ? "s" : ""}`);
}
