/* ---------------------------------------------------------------------------
 * Moteur du tableau interactif.
 *
 * Toile à résolution logique fixe (1600 × 900) mise à l'échelle par CSS : le
 * même tracé s'affiche à l'identique sur tous les écrans, ce qui est
 * indispensable pour un tableau partagé.
 *
 * Chaque tracé terminé devient une ligne de `board_elements`. Pendant le geste,
 * des fragments sont diffusés en direct pour que la classe voie l'écriture se
 * former sans attendre l'enregistrement.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { uid, throttle, clamp } from "../core/util.js";

export const LARGEUR = 1600;
export const HAUTEUR = 900;

export const OUTILS = [
  { cle: "crayon",     libelle: "Crayon",      icone: "crayon" },
  { cle: "stylo",      libelle: "Stylo",       icone: "stylo" },
  { cle: "surligneur", libelle: "Surligneur",  icone: "surligneur" },
  { cle: "ligne",      libelle: "Ligne",       icone: "ligne" },
  { cle: "fleche",     libelle: "Flèche",      icone: "fleche" },
  { cle: "rect",       libelle: "Rectangle",   icone: "forme" },
  { cle: "ellipse",    libelle: "Ellipse",     icone: "cercle" },
  { cle: "texte",      libelle: "Texte",       icone: "texte" },
  { cle: "gomme",      libelle: "Gomme",       icone: "gomme" }
];

export const TEINTES = ["#f3ead9", "#c9a227", "#8fb8d8", "#9ecf8f", "#e08b84", "#c4a3e0", "#1b2430"];
export const EPAISSEURS = [2, 4, 8, 16];

/**
 * creerTableau({ hote, lectureSeule, surElementTermine, surFragment, surCurseur })
 */
export function creerTableau(options = {}) {
  const {
    lectureSeule = false,
    surElementTermine = null,
    surFragment = null,
    surCurseur = null,
    fond = "ardoise"
  } = options;

  const toile = el("canvas.tableau__toile", {
    width: LARGEUR, height: HAUTEUR,
    dataset: { lecture: lectureSeule ? "1" : "0" },
    role: "img", "aria-label": "Tableau de la classe"
  });
  const curseurs = el("div.curseurs");
  const surface = el("div.tableau__surface", { dataset: { fond } }, toile, curseurs);

  const ctx = toile.getContext("2d", { alpha: false });
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let elements = [];                 // éléments confirmés (base)
  const provisoires = new Map();     // éléments en cours, locaux ou distants
  const curseursDistants = new Map();

  let outil = "crayon";
  let couleur = TEINTES[0];
  let epaisseur = 4;
  let ecriture = !lectureSeule;

  let enCours = null;
  const pileAnnulation = [];
  const pileRefaire = [];

  /* --- Rendu ---------------------------------------------------------------- */
  function fondDeToile() {
    const couleurs = { ardoise: "#17231f", craie: "#1b2430", papier: "#f3ead9", quadrille: "#1b2430" };
    return couleurs[surface.dataset.fond] || "#17231f";
  }

  function peindre() {
    ctx.save();
    ctx.fillStyle = fondDeToile();
    ctx.fillRect(0, 0, LARGEUR, HAUTEUR);

    if (surface.dataset.fond === "quadrille") {
      ctx.strokeStyle = "rgba(255,255,255,.055)";
      ctx.lineWidth = 1;
      for (let x = 32; x < LARGEUR; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HAUTEUR); ctx.stroke();
      }
      for (let y = 32; y < HAUTEUR; y += 32) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(LARGEUR, y); ctx.stroke();
      }
    }
    ctx.restore();

    const tous = [...elements, ...provisoires.values()];
    tous.sort((a, b) => (a.z || 0) - (b.z || 0));
    for (const element of tous) dessiner(element);
  }

  function dessiner(element) {
    const d = element.data || {};
    ctx.save();
    ctx.globalAlpha = d.opacite ?? 1;
    ctx.strokeStyle = d.couleur || "#fff";
    ctx.fillStyle = d.couleur || "#fff";
    ctx.lineWidth = d.epaisseur || 4;

    switch (element.kind) {
      case "trait": {
        const points = d.points || [];
        if (points.length < 2) {
          if (points.length === 1) {
            ctx.beginPath();
            ctx.arc(points[0][0], points[0][1], ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length - 1; i++) {
          const milieuX = (points[i][0] + points[i + 1][0]) / 2;
          const milieuY = (points[i][1] + points[i + 1][1]) / 2;
          ctx.quadraticCurveTo(points[i][0], points[i][1], milieuX, milieuY);
        }
        ctx.lineTo(points.at(-1)[0], points.at(-1)[1]);
        ctx.stroke();
        break;
      }
      case "ligne":
        ctx.beginPath();
        ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
        break;
      case "fleche": {
        ctx.beginPath();
        ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
        const angle = Math.atan2(d.y2 - d.y1, d.x2 - d.x1);
        const taille = Math.max(12, ctx.lineWidth * 3);
        ctx.beginPath();
        ctx.moveTo(d.x2, d.y2);
        ctx.lineTo(d.x2 - taille * Math.cos(angle - Math.PI / 7), d.y2 - taille * Math.sin(angle - Math.PI / 7));
        ctx.lineTo(d.x2 - taille * Math.cos(angle + Math.PI / 7), d.y2 - taille * Math.sin(angle + Math.PI / 7));
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "rect":
        ctx.beginPath();
        ctx.rect(Math.min(d.x1, d.x2), Math.min(d.y1, d.y2), Math.abs(d.x2 - d.x1), Math.abs(d.y2 - d.y1));
        if (d.plein) ctx.fill(); else ctx.stroke();
        break;
      case "ellipse":
        ctx.beginPath();
        ctx.ellipse((d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2,
          Math.abs(d.x2 - d.x1) / 2, Math.abs(d.y2 - d.y1) / 2, 0, 0, Math.PI * 2);
        if (d.plein) ctx.fill(); else ctx.stroke();
        break;
      case "texte":
        ctx.font = `${d.taille || 34}px "Spectral", Georgia, serif`;
        ctx.textBaseline = "top";
        (d.texte || "").split("\n").forEach((ligne, i) => {
          ctx.fillText(ligne, d.x, d.y + i * (d.taille || 34) * 1.25);
        });
        break;
      case "image":
        if (d.image) {
          const img = cacheImages.get(d.image) || chargerImage(d.image);
          if (img?.complete) ctx.drawImage(img, d.x, d.y, d.largeur, d.hauteur);
        }
        break;
    }
    ctx.restore();
  }

  const cacheImages = new Map();
  function chargerImage(source) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = peindre;
    img.src = source;
    cacheImages.set(source, img);
    return img;
  }

  /* --- Coordonnées ----------------------------------------------------------- */
  function coordonnees(evenement) {
    const rect = toile.getBoundingClientRect();
    return [
      clamp(((evenement.clientX - rect.left) / rect.width) * LARGEUR, 0, LARGEUR),
      clamp(((evenement.clientY - rect.top) / rect.height) * HAUTEUR, 0, HAUTEUR)
    ];
  }

  /* --- Interaction ------------------------------------------------------------ */
  const diffuserFragment = throttle((element) => {
    surFragment?.({ id: element.id, kind: element.kind, data: element.data, z: element.z });
  }, 70);

  const diffuserCurseur = throttle((x, y) => surCurseur?.(x / LARGEUR, y / HAUTEUR), 90);

  toile.addEventListener("pointerdown", (evenement) => {
    if (!ecriture) return;
    if (evenement.button !== 0 && evenement.pointerType === "mouse") return;
    toile.setPointerCapture(evenement.pointerId);
    const [x, y] = coordonnees(evenement);

    if (outil === "gomme") { effacerA(x, y); return; }
    if (outil === "texte") { ouvrirSaisieTexte(x, y); return; }

    const base = {
      id: uid(),
      z: (elements.at(-1)?.z || 0) + 1,
      data: { couleur, epaisseur }
    };

    if (outil === "crayon" || outil === "stylo" || outil === "surligneur") {
      enCours = {
        ...base, kind: "trait",
        data: {
          couleur: outil === "surligneur" ? couleur : couleur,
          epaisseur: outil === "surligneur" ? epaisseur * 4 : outil === "stylo" ? epaisseur : epaisseur,
          opacite: outil === "surligneur" ? 0.35 : 1,
          points: [[x, y]]
        }
      };
    } else {
      enCours = { ...base, kind: outil, data: { ...base.data, x1: x, y1: y, x2: x, y2: y } };
    }
    provisoires.set(enCours.id, enCours);
    peindre();
  });

  toile.addEventListener("pointermove", (evenement) => {
    const [x, y] = coordonnees(evenement);
    if (ecriture) diffuserCurseur(x, y);

    if (!enCours) {
      if (ecriture && outil === "gomme" && evenement.buttons === 1) effacerA(x, y);
      return;
    }
    if (enCours.kind === "trait") {
      const points = enCours.data.points;
      const dernier = points.at(-1);
      if (Math.hypot(x - dernier[0], y - dernier[1]) < 2) return;
      points.push([x, y]);
    } else {
      enCours.data.x2 = x;
      enCours.data.y2 = y;
    }
    diffuserFragment(enCours);
    peindre();
  });

  function terminer() {
    if (!enCours) return;
    const element = enCours;
    enCours = null;
    provisoires.delete(element.id);

    if (element.kind === "trait" && element.data.points.length < 2) {
      element.data.points.push([element.data.points[0][0] + 0.5, element.data.points[0][1] + 0.5]);
    }
    ajouter(element, true);
    surElementTermine?.(element);
  }

  toile.addEventListener("pointerup", terminer);
  toile.addEventListener("pointercancel", terminer);
  toile.addEventListener("pointerleave", () => { if (enCours) terminer(); });

  /* --- Texte ------------------------------------------------------------------ */
  function ouvrirSaisieTexte(x, y) {
    const rect = toile.getBoundingClientRect();
    const champ = el("div.saisie-tableau", {
      contenteditable: "true", role: "textbox",
      style: {
        left: `${(x / LARGEUR) * rect.width}px`,
        top: `${(y / HAUTEUR) * rect.height}px`,
        color: couleur,
        fontSize: `${(34 / HAUTEUR) * rect.height}px`
      },
      onkeydown: (e) => {
        if (e.key === "Escape") { champ.remove(); }
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); valider(); }
      },
      onblur: valider
    });

    function valider() {
      const texte = champ.textContent.trim();
      champ.remove();
      if (!texte) return;
      const element = {
        id: uid(), kind: "texte",
        z: (elements.at(-1)?.z || 0) + 1,
        data: { x, y, texte, couleur, taille: 34 }
      };
      ajouter(element, true);
      surElementTermine?.(element);
    }

    surface.appendChild(champ);
    setTimeout(() => champ.focus(), 10);
  }

  /* --- Gomme ------------------------------------------------------------------- */
  function effacerA(x, y) {
    const rayon = epaisseur * 4;
    for (let i = elements.length - 1; i >= 0; i--) {
      if (!touche(elements[i], x, y, rayon)) continue;
      const [retire] = elements.splice(i, 1);
      pileAnnulation.push({ type: "retrait", element: retire });
      pileRefaire.length = 0;
      options.surElementRetire?.(retire);
      peindre();
      return;
    }
  }

  function touche(element, x, y, rayon) {
    const d = element.data || {};
    if (element.kind === "trait") {
      return (d.points || []).some(([px, py]) => Math.hypot(px - x, py - y) <= rayon + (d.epaisseur || 4) / 2);
    }
    if (element.kind === "texte") {
      const hauteurTexte = (d.taille || 34) * 1.3;
      const largeurTexte = (d.texte || "").length * (d.taille || 34) * 0.5;
      return x >= d.x && x <= d.x + largeurTexte && y >= d.y && y <= d.y + hauteurTexte;
    }
    if (d.x1 != null) {
      const minX = Math.min(d.x1, d.x2) - rayon, maxX = Math.max(d.x1, d.x2) + rayon;
      const minY = Math.min(d.y1, d.y2) - rayon, maxY = Math.max(d.y1, d.y2) + rayon;
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    return false;
  }

  /* --- Manipulation des éléments ----------------------------------------------- */
  function ajouter(element, local = false) {
    elements.push(element);
    if (local) {
      pileAnnulation.push({ type: "ajout", element });
      pileRefaire.length = 0;
    }
    peindre();
  }

  /* --- API publique -------------------------------------------------------------- */
  return {
    noeud: surface,
    toile,

    definirElements(liste) {
      elements = (liste || []).map((l) => ({
        id: l.id, kind: l.kind, data: l.data, z: l.z || 0, author_id: l.author_id
      }));
      peindre();
    },
    ajouterElement(element) {
      if (elements.some((e) => e.id === element.id)) return;
      provisoires.delete(element.id);
      elements.push({ ...element, z: element.z || elements.length });
      peindre();
    },
    retirerElement(id) {
      elements = elements.filter((e) => e.id !== id);
      provisoires.delete(id);
      peindre();
    },
    fragmentDistant(element) {
      if (elements.some((e) => e.id === element.id)) return;
      provisoires.set(element.id, element);
      peindre();
    },
    vider() {
      elements = [];
      provisoires.clear();
      pileAnnulation.length = 0;
      pileRefaire.length = 0;
      peindre();
    },

    annuler() {
      const action = pileAnnulation.pop();
      if (!action) return null;
      pileRefaire.push(action);
      if (action.type === "ajout") {
        elements = elements.filter((e) => e.id !== action.element.id);
        peindre();
        return { type: "retrait", element: action.element };
      }
      elements.push(action.element);
      peindre();
      return { type: "ajout", element: action.element };
    },
    refaire() {
      const action = pileRefaire.pop();
      if (!action) return null;
      pileAnnulation.push(action);
      if (action.type === "ajout") {
        elements.push(action.element);
        peindre();
        return { type: "ajout", element: action.element };
      }
      elements = elements.filter((e) => e.id !== action.element.id);
      peindre();
      return { type: "retrait", element: action.element };
    },

    definirOutil(nouveau) { outil = nouveau; },
    outil: () => outil,
    definirCouleur(nouvelle) { couleur = nouvelle; },
    couleur: () => couleur,
    definirEpaisseur(valeur) { epaisseur = valeur; },
    epaisseur: () => epaisseur,
    definirEcriture(actif) {
      ecriture = actif;
      toile.dataset.lecture = actif ? "0" : "1";
    },
    ecriture: () => ecriture,
    definirFond(nouveau) { surface.dataset.fond = nouveau; peindre(); },

    /** Position d'un curseur distant, en coordonnées relatives. */
    curseurDistant(id, x, y, nom, teinte) {
      if (x == null) {
        curseursDistants.get(id)?.remove();
        curseursDistants.delete(id);
        return;
      }
      let noeud = curseursDistants.get(id);
      if (!noeud) {
        noeud = el("div.curseur-distant",
          el("div.curseur-distant__pointe", { style: { background: teinte || "#c9a227" } }),
          el("div.curseur-distant__nom", nom || "")
        );
        curseurs.appendChild(noeud);
        curseursDistants.set(id, noeud);
      }
      noeud.style.left = `${x * 100}%`;
      noeud.style.top = `${y * 100}%`;
    },
    nettoyerCurseurs() {
      for (const noeud of curseursDistants.values()) noeud.remove();
      curseursDistants.clear();
    },

    /** Image PNG de l'état courant (capture vers le cahier). */
    instantane(qualite = 0.82) {
      const reduit = document.createElement("canvas");
      reduit.width = Math.round(LARGEUR * 0.75);
      reduit.height = Math.round(HAUTEUR * 0.75);
      reduit.getContext("2d").drawImage(toile, 0, 0, reduit.width, reduit.height);
      return reduit.toDataURL("image/jpeg", qualite);
    },

    elements: () => elements,
    peindre
  };
}
