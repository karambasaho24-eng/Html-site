/* ---------------------------------------------------------------------------
 * La scène : ce que le personnage a devant lui.
 *
 * Pas un inventaire. Un bureau vu depuis sa chaise : le tableau et l'estrade
 * au fond, le pupitre en perspective, les affaires posées dessus avec leur
 * ombre, le sac par terre à côté. On ne clique pas sur « Stylo → Utiliser » :
 * on prend le stylo. On ouvre le sac, on en sort le cahier, il vient se poser
 * sur le bureau. On le repousse vers le sac, il y retourne.
 *
 * Le module ne décide de rien : ce qui est sur le bureau, dans le sac ou en
 * main vient de `bureau` (features/bureau.js), qui s'appuie sur la base. La
 * scène ne fait que le montrer et transmettre les gestes.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { local } from "../core/util.js";
import { etat } from "../core/store.js";
import { toast } from "../ui/toast.js";
import { fiche, nomObjet, imageDetouree } from "./affaires.js";
import { OUTILS_REQUIS } from "./portee.js";
import { L } from "../core/lexique.js";
import { creerClasse3D, webglDisponible } from "./classe-3d.js";
import { monAvatar, ouvrirApparence } from "./apparence.js";
import { ecouter } from "../core/bus.js";

/* --- L'échelle des choses --------------------------------------------------
   Largeur de chaque objet, en fraction de la largeur du pupitre. Un crayon
   est plus long qu'une gomme ; un cahier plus large qu'un encrier. Sans cela
   tout aurait la taille d'une vignette, et rien ne semblerait posé. */
const LARGEUR = {
  cahier: .17, carnet: .12, feuille: .14, feuilles: .16, dossier: .17, chemise: .17, pochette: .16,
  crayon: .19, plume: .19, "stylo-plume": .18, gomme: .08, regle: .25, equerre: .15, compas: .085,
  rapporteur: .16, "regle-a-calcul": .26, boulier: .12, encrier: .08, encre: .055, craie: .065,
  buvard: .17, trousse: .2, "trousse-ouverte": .2, registre: .17, cachet: .06, carte: .18,
  boussole: .08, lorgnette: .15, lanterne: .1, montre: .07, gourde: .09
};

/* Où chaque chose se pose d'elle-même la première fois : le cahier devant
   soi, l'écriture à droite, la règle au-dessus, le calcul à gauche. Chacun
   peut ensuite tout déplacer : la place est retenue. */
const PLACES = [
  { kinds: ["cahier", "carnet", "feuille"], x: .47, y: .56, dx: .07, dy: -.03 },
  { kinds: ["crayon", "plume", "stylo-plume"], x: .7, y: .6, dx: .015, dy: .08 },
  { kinds: ["gomme", "buvard"], x: .83, y: .78, dx: -.06, dy: -.02 },
  { kinds: ["regle", "equerre", "rapporteur", "compas"], x: .45, y: .17, dx: .15, dy: .02 },
  { kinds: ["regle-a-calcul", "boulier"], x: .2, y: .72, dx: .04, dy: -.12 },
  { kinds: ["dossier", "chemise", "pochette", "registre"], x: .19, y: .33, dx: .05, dy: .04 },
  { kinds: ["feuilles"], x: .72, y: .27, dx: .03, dy: .03 },
  { kinds: ["encrier", "encre", "craie", "cachet"], x: .88, y: .35, dx: -.02, dy: .14 }
];

/** Une rotation stable par objet : le même stylo reste de biais pareil. */
function biais(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 1600) / 100) - 8;
}

const clePose = (id) => `ojm.pose.${id}`;

/** Une personne : une tête (portrait ou initiales) et des épaules. */
export function silhouetteDe(p, nom = "", grand = false) {
  const profil = p?.profil || p || {};
  const texte = nom || profil.display_name || "";
  const initiales = texte.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase();
  return el("span.silhouette", { class: grand ? "silhouette--grand" : "" },
    el("span.silhouette__tete",
      profil.avatar_url ? el("img", { src: profil.avatar_url, alt: "" }) : initiales),
    el("span.silhouette__buste", { "aria-hidden": "true" }));
}

export function creerScene({
  bureau, classe, session, staff = false,
  participants = () => [], nomDe = () => "",
  surTableau = null, surCahier = null, surDossier = null, surNote = null,
  surPersonne = null, surEstrade = null,
  // Chez soi, pas de tableau ni d'estrade : le mur porte autre chose.
  avant = null,
  // Qui mène : professeur, président de séance, chef de mission…
  meneur = null,
  // La mise en scène : « cours » (des rangées) ou « reunion » (une table ronde).
  mode = () => "cours",
  // Qui a la main levée, en ce moment.
  mains = () => new Set(),
  // Le tableau vivant, même quand il n'est pas à l'écran (cahier ouvert,
  // petite fenêtre) : la classe en 3D continue de le montrer.
  toile = null,
  // Le plan de classe fixé par le professeur : { user_id : numéro de place }.
  plan = () => ({}),
  // On clique une place dans la salle en 3D : (numéro, qui l'occupe).
  surPlace = null,
  // On clique le cahier posé sur la table de quelqu'un.
  surCahierDe = null
}) {
  let etatScene = "bureau";           // bureau | sac | cahier | document | compact
  let sacOuvert = false;
  let estrade = session.estrade || {};

  /* --- Les emplacements que la salle remplit ------------------------------ */
  const ecranTableau = el("div.scene__ecran");        // le tableau, en petit, vivant
  const livre = el("div.scene__livre-page");           // le cahier ouvert
  const grand = el("div.scene__grand-page");           // le document, en grand

  const zoneEstrade = el("div.scene__estrade");
  const vue3d = el("div.scene__classe3d");
  const legendeTableau = el("span.scene__legende");
  const objetsPupitre = el("div.pupitre__objets");
  const banc = el("div.scene__banc", { "aria-label": "À la table" });
  const oublis = el("div.scene__oublis", { hidden: true });
  const zoneSac = el("div.scene__sac-zone");
  const rail = el("div.scene__rail", { "aria-label": "À portée de main" });
  const bulle = el("div.scene__bulle", { hidden: true });

  const noeud = el("div.scene", { dataset: { etat: etatScene } },
    el("div.scene__mur", { "aria-hidden": "true" }),
    avant ? el("div.scene__avant.scene__avant--mur", avant, vue3d) : el("div.scene__avant",
      el("button.scene__tableau", {
        type: "button", title: "Regarder le tableau",
        onclick: () => surTableau?.()
      },
        el("span.scene__tableau-cadre", ecranTableau),
        el("span.scene__rebord", { "aria-hidden": "true" },
          el("span.scene__baton"), el("span.scene__brosse")),
        legendeTableau),
      zoneEstrade,
      vue3d),
    el("div.scene__pupitre",
      el("div.pupitre__surface", { "aria-hidden": "true" }),
      avant ? null : banc,
      objetsPupitre,
      oublis),
    zoneSac,
    el("div.scene__premier-plan",
      el("div.scene__livre",
        el("button.scene__fermer", {
          type: "button", title: "Fermer le cahier",
          onclick: () => definirEtat("bureau")
        }, el("span.scene__marque-page", { "aria-hidden": "true" }), "Fermer"),
        livre),
      el("div.scene__grand",
        el("button.scene__fermer", {
          type: "button", title: "Revenir au bureau",
          onclick: () => definirEtat("bureau")
        }, icone("croix", 13), "Revenir au bureau"),
        grand),
      rail,
      bulle)
  );

  /* ======================================================================
     Le pupitre
     ==================================================================== */

  function kindDe(genre, chose) {
    return genre === "cahier" ? (chose.support || "cahier") : chose.kind;
  }

  function placeDe(genre, chose, rang) {
    const garde = local.lire(clePose(chose.id), null);
    if (garde && Number.isFinite(garde.x) && Number.isFinite(garde.y)) return garde;
    const kind = kindDe(genre, chose);
    const place = PLACES.find((p) => p.kinds.includes(kind)) || { x: .32 + (rang % 4) * .12, y: .5, dx: 0, dy: .1 };
    const n = rang;
    return {
      x: Math.min(.93, Math.max(.07, place.x + place.dx * n)),
      y: Math.min(.9, Math.max(.1, place.y + place.dy * n))
    };
  }

  function peindrePupitre() {
    const tenu = bureau.enMain();
    const devant = [
      ...bureau.cahiersSurLeBureau().map((c) => ["cahier", c]),
      ...bureau.surLeBureau().map((o) => ["objet", o])
    ];
    const rangs = new Map();
    render(objetsPupitre, devant.length
      ? devant.map(([genre, chose]) => {
          const kind = kindDe(genre, chose);
          const groupe = PLACES.find((p) => p.kinds.includes(kind))?.kinds.join() || kind;
          const rang = rangs.get(groupe) || 0;
          rangs.set(groupe, rang + 1);
          return poseSurPupitre(genre, chose, placeDe(genre, chose, rang), tenu);
        })
      : guide());
    noeud.classList.toggle("scene--vide", !devant.length);
  }

  /** Bureau vide : trois gestes, dans l'ordre, pour pouvoir écrire. */
  function guide() {
    const etape = (n, texte, fait = false) => el("li.guide__etape", { class: fait ? "guide__etape--fait" : "" },
      el("span.guide__num", n), el("span", texte));
    return el("div.pupitre__vide",
      el("p.guide__titre", "Votre bureau est vide"),
      el("ol.guide",
        etape("1", "Ouvrez votre sac", sacOuvert),
        etape("2", "Sortez votre cahier et un crayon"),
        etape("3", "Prenez le crayon pour écrire")));
  }

  /* --- À la table : qui est assis, en ce moment ------------------------ */
  function peindreBanc() {
    if (avant) return;
    const moiId = etat.utilisateur?.id;
    const assis = participants().filter((p) => p.role !== "teacher");
    const places = Math.max(assis.length, 4);
    const initiales = (texte) => String(texte || "?").split(/\s+/).filter(Boolean).slice(0, 2)
      .map((m) => m[0]).join("").toUpperCase();
    render(banc,
      Array.from({ length: places }, (_, i) => {
        const p = assis[i];
        if (!p) return el("span.siege.siege--libre", { "aria-hidden": "true" });
        const nom = nomDe(p) || "Participant";
        const moi = String(p.user_id) === String(moiId);
        return el("button.siege", {
          type: "button", class: moi ? "siege--moi" : "",
          dataset: { id: String(p.user_id) },
          title: moi ? "Vous" : nom,
          onclick: (e) => (moi ? null : surPersonne?.(e.currentTarget, p))
        },
          el("span.siege__tete", p.profil?.avatar_url ? el("img", { src: p.profil.avatar_url, alt: "" }) : initiales(nom)),
          el("span.siege__nom", moi ? "Vous" : nom.split(/\s+/)[0]));
      }));
    // Qui vient de s'asseoir : un fondu, pas un saut.
    const avant_ = new Set(banc.dataset.vus ? banc.dataset.vus.split(",") : []);
    for (const b of banc.querySelectorAll(".siege[data-id]")) {
      if (!avant_.has(b.dataset.id)) b.classList.add("siege--arrive");
    }
    banc.dataset.vus = assis.map((p) => String(p.user_id)).join(",");
  }

  /* --- Ce que j'avais laissé ici ---------------------------------------- */
  function peindreOublis() {
    const restes = bureau.laissesIci?.() || [];
    oublis.hidden = !restes.length;
    if (!restes.length) { render(oublis); return; }
    render(oublis,
      el("div.oublis__objets", restes.slice(0, 5).map(([genre, c]) =>
        el("img", { src: imageDetouree(kindDe(genre, c)), alt: "", draggable: false }))),
      el("span.oublis__texte",
        el("b", restes.length === 1 ? "Vous aviez laissé ceci ici" : `Vous aviez laissé ${restes.length} affaires ici`),
        el("span", restes.map(([g, c]) => (g === "cahier" ? c.title || "Cahier" : nomObjet(c))).join(", "))),
      el("button.btn.btn--primaire.btn--petit", {
        type: "button",
        onclick: async (e) => {
          e.currentTarget.disabled = true;
          const n = await bureau.reprendre(restes);
          if (n) toast(n === 1 ? "Repris : il est sur votre bureau" : `${n} affaires reprises`, { type: "ok", duree: 2400 });
          peindre();
        }
      }, "Reprendre"));
  }

  function poseSurPupitre(genre, chose, { x, y }, tenu) {
    const kind = kindDe(genre, chose);
    const nom = genre === "cahier" ? (chose.title || "Cahier") : nomObjet(chose);
    const r = biais(chose.id);
    const enMain = genre === "objet" && tenu?.id === chose.id;
    const aEtiquette = ["cahier", "carnet", "dossier", "chemise"].includes(kind);

    const noeudPose = el("button.pose", {
      type: "button",
      class: [enMain ? "pose--en-main" : "", `pose--${kind}`].join(" "),
      dataset: { id: String(chose.id), genre, kind },
      style: {
        left: `${x * 100}%`, top: `${y * 100}%`,
        width: `${(LARGEUR[kind] || .11) * 100}%`,
        "--r": `${r}deg`, zIndex: String(Math.round(y * 100) + (enMain ? 200 : 0))
      },
      title: actionEnMots(genre, chose, enMain),
      "aria-label": `${nom} — ${actionEnMots(genre, chose, enMain)}`
    },
      el("img.pose__image", { src: imageDetouree(kind), alt: "", draggable: false }),
      aEtiquette ? el("span.pose__etiquette", nom) : null,
      el("span.pose__nom", nom),
      el("span.pose__ranger", {
        role: "button", title: "Remettre dans le sac", "aria-label": `Remettre ${nom} dans le sac`,
        onpointerdown: (e) => e.stopPropagation(),
        onclick: (e) => { e.stopPropagation(); remettre(genre, chose, noeudPose); }
      }, icone("sac", 11))
    );
    brancherGlisser(noeudPose, genre, chose);
    return noeudPose;
  }

  function actionEnMots(genre, chose, enMain) {
    if (genre === "cahier") return "Ouvrir";
    const f = fiche(chose.kind) || {};
    if (f.papiers) return "Ouvrir le dossier";
    if (chose.kind === "feuilles" || chose.kind === "feuille") return "Écrire une note";
    if (f.contenant && bureau.porter) return "Prendre ce sac";
    return enMain ? "Reposer" : "Prendre en main";
  }

  /** Le geste principal sur un objet posé. */
  function geste(genre, chose) {
    if (genre === "cahier") { surCahier?.(chose); return; }
    const f = fiche(chose.kind) || {};
    if (f.papiers) { surDossier?.(chose); return; }
    if (chose.kind === "feuilles" || chose.kind === "feuille") { surNote?.(); return; }
    if (f.contenant && bureau.porter) { bureau.porter(chose); return; }
    bureau.prendre(bureau.enMain()?.id === chose.id ? null : chose);
  }

  /* --- Glisser : déplacer sur le bureau, ou vers le sac ------------------ */
  function brancherGlisser(noeudPose, genre, chose) {
    let depart = null;
    let glisse = false;
    noeudPose.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      depart = { x: e.clientX, y: e.clientY };
      glisse = false;
      noeudPose.setPointerCapture(e.pointerId);
    });
    noeudPose.addEventListener("pointermove", (e) => {
      if (!depart) return;
      if (!glisse && Math.hypot(e.clientX - depart.x, e.clientY - depart.y) < 6) return;
      glisse = true;
      noeudPose.classList.add("pose--souleve");
      const cadre = objetsPupitre.getBoundingClientRect();
      const x = Math.min(.96, Math.max(.04, (e.clientX - cadre.left) / cadre.width));
      const y = Math.min(.96, Math.max(.04, (e.clientY - cadre.top) / cadre.height));
      noeudPose.style.left = `${x * 100}%`;
      noeudPose.style.top = `${y * 100}%`;
      zoneSac.classList.toggle("scene__sac-zone--cible", surLeSac(e));
    });
    const finir = (e) => {
      if (!depart) return;
      const avaitGlisse = glisse;
      depart = null;
      glisse = false;
      noeudPose.classList.remove("pose--souleve");
      zoneSac.classList.remove("scene__sac-zone--cible");
      if (!avaitGlisse) { geste(genre, chose); return; }
      if (surLeSac(e)) { remettre(genre, chose, noeudPose); return; }
      const cadre = objetsPupitre.getBoundingClientRect();
      local.ecrire(clePose(chose.id), {
        x: Math.min(.96, Math.max(.04, (e.clientX - cadre.left) / cadre.width)),
        y: Math.min(.96, Math.max(.04, (e.clientY - cadre.top) / cadre.height))
      });
      peindrePupitre();
    };
    noeudPose.addEventListener("pointerup", finir);
    noeudPose.addEventListener("pointercancel", () => { depart = null; glisse = false; peindrePupitre(); });
  }

  function surLeSac(e) {
    const r = zoneSac.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  /* --- Le voyage d'un objet --------------------------------------------- */
  /** Fait voler une image d'un rectangle à un autre, puis s'efface. */
  function voler(image, de, vers, { finit = 1 } = {}) {
    if (!de || !vers || matchMedia("(prefers-reduced-motion: reduce)").matches) return Promise.resolve();
    const fantome = el("img.pose__vol", { src: image, alt: "" });
    Object.assign(fantome.style, {
      left: `${de.left}px`, top: `${de.top}px`, width: `${de.width}px`, height: `${de.height}px`
    });
    document.body.appendChild(fantome);
    const dx = vers.left + vers.width / 2 - (de.left + de.width / 2);
    const dy = vers.top + vers.height / 2 - (de.top + de.height / 2);
    const k = vers.width / Math.max(1, de.width);
    const anim = fantome.animate([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${k * finit})`, opacity: finit < 1 ? 0 : 1 }
    ], { duration: 380, easing: "cubic-bezier(.2,.7,.2,1)" });
    return anim.finished.catch(() => {}).then(() => fantome.remove());
  }

  async function sortirDuSac(genre, chose, depuis) {
    const de = depuis?.getBoundingClientRect();
    depuis?.classList.add("pose--parti");
    const ok = await bureau.sortir(chose, genre);
    if (!ok) { depuis?.classList.remove("pose--parti"); return; }
    peindre();
    const arrive = objetsPupitre.querySelector(`.pose[data-id="${CSS.escape(String(chose.id))}"]`);
    if (arrive) {
      arrive.style.visibility = "hidden";
      await voler(imageDetouree(kindDe(genre, chose)), de, arrive.getBoundingClientRect());
      arrive.style.visibility = "";
      arrive.classList.add("pose--arrive");
    }
  }

  async function remettre(genre, chose, depuis) {
    const de = depuis?.getBoundingClientRect();
    const sac = zoneSac.querySelector(".scene__sac-image")?.getBoundingClientRect();
    if (depuis) depuis.style.visibility = "hidden";
    const vol = voler(imageDetouree(kindDe(genre, chose)), de, sac, { finit: .35 });
    const ok = await bureau.ranger(chose, genre);
    await vol;
    if (!ok && depuis) depuis.style.visibility = "";
    local.ecrire(clePose(chose.id), null);
    peindre();
  }

  /* ======================================================================
     Le sac, par terre à côté du bureau
     ==================================================================== */
  function peindreSac() {
    const sac = bureau.sacsPortes()[0];
    zoneSac.classList.toggle("scene__sac-zone--ouvert", sacOuvert);
    if (!sac) {
      render(zoneSac, el("div.scene__sans-sac",
        el("span.scene__sans-sac-trace", { "aria-hidden": "true" }),
        el("span.petit", "Vous n'avez pas pris de sac.")));
      return;
    }
    const ouvertImage = sac.kind === "cartable" ? "cartable-ouvert" : sac.kind;
    const contenu = [
      ...bureau.cahiersDansMonSac().map((c) => ["cahier", c]),
      ...bureau.dansMonSac().map((o) => ["objet", o])
    ];

    // L'intérieur du sac, vu d'en haut : le fond de cuir, et une poche par
    // contenant — la trousse garde ses crayons, le cartable ses cahiers.
    const poches = new Map();
    for (const [genre, chose] of contenu) {
      const cle = String(chose.container_id || sac.id);
      if (!poches.has(cle)) poches.set(cle, []);
      poches.get(cle).push([genre, chose]);
    }
    const nomPoche = (cle) => {
      const c = bureau.objets().find((o) => String(o.id) === cle);
      return c ? nomObjet(c) : "Sac";
    };
    const ordre = [...poches.keys()].sort((a, b) => (a === String(sac.id) ? -1 : b === String(sac.id) ? 1 : 0));

    render(zoneSac,
      sacOuvert ? el("div.sac__contenu", { role: "list", "aria-label": "Dans mon sac" },
        contenu.length
          ? ordre.map((cle) => el("div.sac__poche",
              el("span.sac__poche-nom", nomPoche(cle)),
              el("div.sac__poche-objets", poches.get(cle).map(([genre, chose], i) => {
                const kind = kindDe(genre, chose);
                const nom = genre === "cahier" ? (chose.title || "Cahier") : nomObjet(chose);
                return el("button.sac__chose", {
                  type: "button", role: "listitem",
                  title: `Sortir ${nom}`, "aria-label": `Sortir ${nom}`,
                  style: { "--a": `${biais(chose.id) / 2}deg`, "--i": String(i) },
                  onclick: (e) => sortirDuSac(genre, chose, e.currentTarget)
                },
                  el("img", { src: imageDetouree(kind), alt: "", draggable: false }),
                  el("span.sac__nom", nom));
              }))))
          : el("p.sac__vide", "Votre sac est vide.")) : null,
      el("button.scene__sac", {
        type: "button",
        class: !sacOuvert && !bureau.surLeBureau().length && !bureau.cahiersSurLeBureau().length ? "scene__sac--appel" : "",
        title: sacOuvert ? "Refermer le sac" : "Ouvrir le sac",
        "aria-expanded": String(sacOuvert),
        onclick: () => { sacOuvert = !sacOuvert; if (etatScene === "sac" && !sacOuvert) definirEtat("bureau"); else peindre(); }
      },
        el("img.scene__sac-image", { src: imageDetouree(sacOuvert ? ouvertImage : sac.kind), alt: "", draggable: false }),
        el("span.scene__sac-mot", sacOuvert ? "Refermer le sac" : "Ouvrir le sac"))
    );
  }

  /* ======================================================================
     L'avant de la classe : l'estrade
     ==================================================================== */
  function peindreEstrade() {
    const present = Boolean(estrade?.present);
    const qui = (typeof meneur === "function" ? meneur() : meneur) || L("Professeur");
    if (staff) {
      // Le responsable dit d'un geste s'il se tient devant la classe.
      render(zoneEstrade,
        el("span.estrade__lumiere", { "aria-hidden": "true", style: { opacity: present ? "1" : "0" } }),
        el("button.presence.estrade__bascule", {
          type: "button", class: present ? "presence--oui estrade__bascule--present" : "",
          title: present ? "Je quitte l'avant de la classe" : "Je me place devant la classe",
          onclick: () => surEstrade?.(!present)
        }, present ? "Devant la classe" : "Pas devant la classe"));
      return;
    }
    // Absent, la ligne du haut le dit déjà : l'avant de la classe reste vide.
    render(zoneEstrade, present
      ? el("div.estrade__prof.estrade__prof--present",
          silhouetteDe({ display_name: estrade.nom || qui }, estrade.nom || qui),
          el("span.presence.presence--oui", `${estrade.nom || qui} · devant la classe`))
      : null);
  }

  const silhouette = (p, grand = false) => silhouetteDe(p, nomDe(p), grand);

  /* ======================================================================
     Le rail : ce qu'on a sous la main quand le cahier est ouvert
     ==================================================================== */
  function peindreRail() {
    if (etatScene !== "cahier") { render(rail); return; }
    const tenu = bureau.enMain();
    const outils = bureau.surLeBureau().filter((o) => {
      const f = fiche(o.kind) || {};
      return !f.contenant && !f.papiers && !["feuilles", "feuille"].includes(o.kind);
    });
    render(rail, outils.length
      ? outils.map((o) => el("button.rail__outil", {
          type: "button",
          class: tenu?.id === o.id ? "rail__outil--en-main" : "",
          dataset: { id: String(o.id) },
          title: tenu?.id === o.id ? `Reposer ${nomObjet(o).toLowerCase()}` : `Prendre ${nomObjet(o).toLowerCase()}`,
          onclick: () => bureau.prendre(tenu?.id === o.id ? null : o)
        }, el("img", { src: imageDetouree(o.kind), alt: "", draggable: false }),
           el("span.rail__nom", tenu?.id === o.id ? "En main" : nomObjet(o))))
      : el("p.rail__vide", "Rien sur le bureau. Ouvrez votre sac."));

    // Un conseil posé à côté de l'outil qu'il faut prendre, pas une alerte.
    const verdict = bureau.peutFaire("ecrire");
    if (!verdict.ok && verdict.prendre) {
      bulle.hidden = false;
      render(bulle, el("span", "Prenez ", el("b", nomObjet(verdict.prendre).toLowerCase()), " pour écrire"));
      rail.querySelector(`[data-id="${CSS.escape(String(verdict.prendre.id))}"]`)?.classList.add("rail__outil--appel");
    } else {
      bulle.hidden = true;
    }
  }

  /* ======================================================================
     Les états
     ==================================================================== */
  function definirEtat(nouvel) {
    etatScene = nouvel;
    if (nouvel === "sac") sacOuvert = true;
    noeud.dataset.etat = nouvel;
    peindre();
    surChangementEtat?.(nouvel);
  }
  let surChangementEtat = null;

  function peindre() {
    noeud.dataset.etat = etatScene;
    peindrePupitre();
    peindreBanc();
    peindreOublis();
    peindreSac();
    if (!avant) peindreEstrade();
    maj3d();
    peindreRail();
  }

  /* ======================================================================
     La classe en 3D : le tableau au fond, le professeur, les autres de dos
     ==================================================================== */
  let classe3d = null;
  let lacherAvatar = null;
  function maj3d() {
    if (!classe3d) return;
    if (avant) {
      // Chez soi : on est seul à son bureau, avec ce qu'on y a posé.
      const tenu = bureau.enMain();
      classe3d.maj({
        mode: "maison",
        eleves: [{
          id: String(etat.utilisateur?.id || "moi"), nom: "", brut: null, avatar: monAvatar(),
          bureau: [
            ...bureau.cahiersSurLeBureau().map((c) => ({ k: c.support || "cahier" })),
            ...bureau.surLeBureau().filter((o) => !fiche(o.kind)?.contenant)
              .map((o) => ({ k: o.kind, ...(tenu?.id === o.id ? { m: 1 } : {}) }))
          ].slice(0, 12)
        }]
      });
      return;
    }
    const moiId = String(etat.utilisateur?.id || "");
    const levees = mains();
    const tous = participants();
    const responsable = tous.find((p) => String(p.user_id) === String(estrade?.user_id || ""))
      || tous.find((p) => p.role === "teacher");
    const m = typeof mode === "function" ? mode() : mode;
    const fixe = plan?.() || {};
    const tenu = bureau.enMain();
    const monBureau = [
      ...bureau.cahiersSurLeBureau().map((c) => ({ k: c.support || "cahier" })),
      ...bureau.surLeBureau().filter((o) => !fiche(o.kind)?.contenant)
        .map((o) => ({ k: o.kind, ...(tenu?.id === o.id ? { m: 1 } : {}) }))
    ].slice(0, 14);
    classe3d.maj({
      mode: ["reunion", "entretien"].includes(m) ? "reunion" : "classe",
      // Le professeur regarde sa classe ; l'élève se voit, assis, de dos.
      vue: staff ? "prof" : "eleve",
      eleves: tous
        .filter((p) => !["teacher", "observer"].includes(p.role))
        .map((p) => {
          const id = String(p.user_id);
          const moi = id === moiId;
          const placee = Number.isInteger(fixe[id]) ? fixe[id] : null;
          return {
            id, moi,
            nom: moi ? "Vous" : (nomDe(p) || "Participant").split(/\s+/)[0],
            brut: p,
            // La tenue de rigueur de la classe, s'il y en a une ; la coupe et le teint restent les siens.
            avatar: classe?.settings?.tenue ? { ...(p.avatar || {}), tenue: classe.settings.tenue } : p.avatar || null,
            bureau: moi ? monBureau : Array.isArray(p.bureau) ? p.bureau : [],
            main: levees.has(id),
            // Sa place : celle du plan du professeur, sinon celle qu'il a choisie.
            place: placee ?? (Number.isInteger(p.place) ? p.place : null),
            depuis: placee != null ? 0 : p.placeDepuis || Date.now(),
            ecrit: Boolean(p.ecrit)
          };
        }),
      prof: {
        present: Boolean(estrade?.present),
        nom: estrade?.nom || (typeof meneur === "function" ? meneur() : meneur) || L("Professeur"),
        bureau: Array.isArray(responsable?.bureau) ? responsable.bureau : [],
        avatar: responsable?.avatar || null
      }
    });
  }
  let detruite = false;
  if (webglDisponible()) {
    creerClasse3D({
      hote: vue3d,
      toile: () => toile?.() || noeud.querySelector(".scene__ecran canvas.tableau__toile"),
      surTableau: () => surTableau?.(),
      surPersonne: (ancre, p) => surPersonne?.(ancre, p),
      surPlace: avant ? null : (i, qui) => surPlace?.(i, qui),
      surCahier: avant ? null : (ancre, p) => surCahierDe?.(ancre, p)
    }).then((c) => {
      // La scène a été fermée pendant qu'on préparait la 3D : on la défait
      // aussitôt, sinon elle tournerait pour rien, hors de la page.
      if (detruite) { c.detruire(); return; }
      classe3d = c;
      noeud.classList.add("scene--3d");
      maj3d();
      // Chez soi, on s'habille : le bouton est posé sur la vue.
      if (avant) {
        vue3d.appendChild(el("button.classe3d__habiller", { type: "button", onclick: () => ouvrirApparence() },
          icone("profil", 14), "Mon personnage"));
      }
      lacherAvatar = ecouter("avatar:change", maj3d);
    }).catch((err) => console.warn("[scene] vue 3D indisponible, on reste à plat", err));
  }

  return {
    noeud, ecranTableau, livre, grand,
    /** Le professeur écrit au tableau : on le voit se tourner. */
    signalerEcriture: () => classe3d?.ecrit(),
    /** La classe en 3D, déplacée dans un autre conteneur (la console), ou remise en place. */
    classeDans: (conteneur) => { if (classe3d) { classe3d.deplacer(conteneur || vue3d); return true; } return false; },
    a3d: () => Boolean(classe3d),
    /** Qui est où, qui écrit : on redonne l'état à la classe en 3D. */
    majClasse: () => maj3d(),
    detruire: () => { detruite = true; lacherAvatar?.(); classe3d?.detruire(); classe3d = null; },
    peindre, definirEtat,
    etat: () => etatScene,
    surChangementEtat: (fn) => { surChangementEtat = fn; },
    ouvrirSac: () => { sacOuvert = true; peindre(); },
    majEstrade(nouvelle) { estrade = nouvelle || {}; peindreEstrade(); maj3d(); },
    majLegende(texte) { legendeTableau.textContent = texte || ""; },
    signaler(message) { toast(message, { type: "attn" }); }
  };
}
