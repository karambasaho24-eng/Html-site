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
import { etat, observer } from "../core/store.js";
import { toast } from "../ui/toast.js";
import { fiche, nomObjet, imageDetouree } from "./affaires.js";
import { OUTILS_REQUIS } from "./portee.js";
import { L } from "../core/lexique.js";
import { creerClasse3D, webglDisponible } from "./classe-3d.js";
import { monAvatar } from "./apparence.js";
import { ecouter } from "../core/bus.js";

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
  surCahierDe = null,
  // Je clique MON cahier, en 3D : il vient dans l'interface, pour écrire.
  surMonCahier = null,
  // J'ouvre ou je referme mon sac (les autres le voient).
  surSac = null
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
      oublis,
      objetsPupitre),
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

  function peindrePupitre() {
    const tenu = bureau.enMain();
    const devant = [
      ...bureau.cahiersSurLeBureau().map((c) => ["cahier", c]),
      ...bureau.surLeBureau().map((o) => ["objet", o])
    ];
    // Une table rangée : chaque chose sur sa carte, dans l'ordre (cahiers,
    // de quoi écrire, le reste), deux gestes nets par chose — et « Tout
    // ranger » pour débarrasser d'un coup. Rien ne déborde de la table.
    const ordre = (g, c) => (g === "cahier" ? 0 : OUTILS_REQUIS.ecrire.includes(c.kind) ? 1 : 2);
    devant.sort((a, b) => ordre(...a) - ordre(...b));
    const rangeables = devant.filter(([g, c]) => g === "cahier" || !fiche(c.kind)?.contenant);
    render(objetsPupitre, devant.length
      ? [
          el("div.plateau__entete",
            el("span.plateau__titre", "Sur la table"),
            el("span.plateau__compte", String(devant.length)),
            tenu ? el("span.plateau__main", el("img", { src: imageDetouree(tenu.kind), alt: "" }), `${nomObjet(tenu)} en main`) : null,
            rangeables.length > 1
              ? el("button.btn.btn--petit.plateau__tout", { type: "button", onclick: toutRanger }, icone("sac", 13), "Tout ranger")
              : null),
          el("div.plateau__cartes", devant.map(([genre, chose]) => poseSurPupitre(genre, chose, null, tenu)))
        ]
      : guide());
    noeud.classList.toggle("scene--vide", !devant.length);
  }

  /** Débarrasser la table : tout retourne dans le sac, une chose après l'autre. */
  async function toutRanger(e) {
    const bouton = e?.currentTarget;
    if (bouton) bouton.disabled = true;
    const aRanger = [
      ...bureau.cahiersSurLeBureau().map((c) => ["cahier", c]),
      ...bureau.surLeBureau().filter((o) => !fiche(o.kind)?.contenant).map((o) => ["objet", o])
    ];
    if (bureau.enMain()) bureau.prendre(null);
    let n = 0;
    for (const [genre, chose] of aRanger) if (await bureau.ranger(chose, genre)) n++;
    peindre();
    if (n) toast(n === 1 ? "Rangé dans le sac" : `${n} affaires rangées dans le sac`, { type: "ok", duree: 2200 });
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

  function poseSurPupitre(genre, chose, _place, tenu) {
    const kind = kindDe(genre, chose);
    const nom = genre === "cahier" ? (chose.title || "Cahier") : nomObjet(chose);
    const enMain = genre === "objet" && tenu?.id === chose.id;
    const action = actionEnMots(genre, chose, enMain);
    // Sur le bouton, le mot court ; la phrase entière reste en info-bulle.
    const court = { "Prendre en main": "Prendre", "Écrire une note": "Écrire", "Ouvrir le dossier": "Ouvrir", "Prendre ce sac": "Porter" }[action] || action;
    const contenant = genre === "objet" && fiche(chose.kind)?.contenant;

    const noeudPose = el("div.pose", {
      class: [enMain ? "pose--en-main" : "", `pose--${kind}`].join(" "),
      dataset: { id: String(chose.id), genre, kind }
    },
      el("button.pose__corps", {
        type: "button", title: action, "aria-label": `${nom} — ${action}`,
        onclick: () => geste(genre, chose)
      },
        el("span.pose__vignette", el("img.pose__image", { src: imageDetouree(kind), alt: "", draggable: false })),
        el("span.pose__nom", nom),
        enMain ? el("span.pose__etat", "En main") : null),
      el("div.pose__actions",
        el("button.pose__action.pose__action--principale", { type: "button", title: action, onclick: () => geste(genre, chose) }, court),
        contenant ? null : el("button.pose__action", {
          type: "button", title: `Remettre ${nom} dans le sac`, "aria-label": `Remettre ${nom} dans le sac`,
          onclick: () => remettre(genre, chose, noeudPose)
        }, icone("sac", 12), "Ranger"))
    );
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
  /* Le sac en 3D : ce qu'il contient, tel qu'on le voit dedans. */
  function contenuSac3d() {
    return [
      ...bureau.cahiersDansMonSac().map((c) => ({ genre: "cahier", chose: c, kind: c.support || "cahier", titre: c.title, cover: c.cover })),
      ...bureau.dansMonSac().map((o) => ({ genre: "objet", chose: o, kind: o.kind, titre: nomObjet(o) }))
    ];
  }
  function ouvrirSac3d() {
    if (!classe3d || !bureau.sacsPortes()[0]) return false;
    sacOuvert = true;
    classe3d.ouvrirSac({
      contenu: contenuSac3d(),
      surSortir: async (c) => {
        await sortirDuSac(c.genre, c.chose, null);
        // Le temps de la voir monter hors du sac.
        setTimeout(() => classe3d?.majSac(contenuSac3d()), 400);
      },
      surFermer: () => {
        sacOuvert = false;
        if (etatScene === "sac") definirEtat("bureau"); else peindre();
        surSac?.(false);
      }
    });
    peindre();
    surSac?.(true);
    return true;
  }

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
      // En 3D, on fouille le vrai sac ; la liste reste là pour le clavier et
      // les lecteurs d'écran, sans se voir.
      sacOuvert ? el("div.sac__contenu", { role: "list", "aria-label": "Dans mon sac", class: classe3d ? "sac__contenu--3d" : "" },
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
                  onclick: async (e) => {
                    await sortirDuSac(genre, chose, e.currentTarget);
                    classe3d?.majSac(contenuSac3d());
                  }
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
        onclick: () => {
          // En 3D, on prend le vrai sac, à côté de sa chaise.
          if (classe3d) { if (sacOuvert) classe3d.fermerSac(); else ouvrirSac3d(); return; }
          sacOuvert = !sacOuvert; if (etatScene === "sac" && !sacOuvert) definirEtat("bureau"); else peindre();
        }
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
    if (nouvel === "sac" && !sacOuvert && !ouvrirSac3d()) sacOuvert = true;
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
          id: String(etat.utilisateur?.id || "moi"), nom: "", brut: null, avatar: monAvatar(), moi: true,
          bureau: [
            ...bureau.cahiersSurLeBureau().map((c) => ({ k: c.support || "cahier", ...(c.cover ? { c: c.cover } : {}) })),
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
      ...bureau.cahiersSurLeBureau().map((c) => ({ k: c.support || "cahier", ...(c.cover ? { c: c.cover } : {}) })),
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
            ecrit: Boolean(p.ecrit),
            sacOuvert: Boolean(p.sacOuvert)
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
  // Où montrer la classe en 3D : à sa place dans la scène, ou dans la console
  // (petite fenêtre). Demandé avant qu'elle soit prête, on l'y posera.
  let cible3d = null;
  let montage = null;
  const peut3d = () => webglDisponible() && etat.animations !== false;
  function monter3d() {
    if (!peut3d() || classe3d || montage || detruite) return;
    montage = creerClasse3D({
      hote: vue3d,
      toile: () => toile?.() || noeud.querySelector(".scene__ecran canvas.tableau__toile"),
      surTableau: () => surTableau?.(),
      surPersonne: (ancre, p) => surPersonne?.(ancre, p),
      surPlace: avant ? null : (i, qui) => surPlace?.(i, qui),
      surCahier: avant ? null : (ancre, p) => surCahierDe?.(ancre, p),
      surMonCahier: () => {
        if (surMonCahier) { surMonCahier(); return; }
        const c = bureau.cahiersSurLeBureau()[0];
        if (c) surCahier?.(c);
      }
    }).then((c) => {
      // La scène a été fermée pendant qu'on préparait la 3D : on la défait
      // aussitôt, sinon elle tournerait pour rien, hors de la page.
      montage = null;
      if (detruite || !peut3d()) { c.detruire(); return; }
      classe3d = c;
      noeud.classList.add("scene--3d");
      if (cible3d) c.deplacer(cible3d);
      maj3d();
      lacherAvatar?.();
      lacherAvatar = ecouter("avatar:change", maj3d);
    }).catch((err) => { montage = null; console.warn("[scene] vue 3D indisponible, on reste à plat", err); });
  }
  /** Animations éteintes : plus de 3D, la scène redevient plate. */
  function demonter3d() {
    classe3d?.detruire();
    classe3d = null;
    noeud.classList.remove("scene--3d");
  }
  monter3d();
  const lacherAnimations = observer("animations", (v) => (v ? monter3d() : demonter3d()));

  return {
    noeud, ecranTableau, livre, grand,
    /** Le professeur écrit au tableau : on le voit se tourner. */
    signalerEcriture: () => classe3d?.ecrit(),
    /** La classe en 3D, déplacée dans un autre conteneur (la console), ou remise en place. */
    classeDans: (conteneur) => {
      cible3d = conteneur || null;
      if (classe3d) classe3d.deplacer(conteneur || vue3d);
      return peut3d();
    },
    a3d: () => Boolean(classe3d),
    /** Qui est où, qui écrit : on redonne l'état à la classe en 3D. */
    majClasse: () => maj3d(),
    detruire: () => { detruite = true; lacherAvatar?.(); lacherAnimations(); classe3d?.detruire(); classe3d = null; },
    peindre, definirEtat,
    etat: () => etatScene,
    surChangementEtat: (fn) => { surChangementEtat = fn; },
    ouvrirSac: () => { if (sacOuvert) return; if (!ouvrirSac3d()) { sacOuvert = true; peindre(); } },
    sacOuvert: () => sacOuvert,
    majEstrade(nouvelle) { estrade = nouvelle || {}; peindreEstrade(); maj3d(); },
    majLegende(texte) { legendeTableau.textContent = texte || ""; },
    signaler(message) { toast(message, { type: "attn" }); }
  };
}
