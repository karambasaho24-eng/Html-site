/* ---------------------------------------------------------------------------
 * Les tenues : des vêtements Roblox, au format Roblox.
 *
 * Un vêtement classique de Roblox est une image de 585 × 559 : le torse
 * déplié en croix en haut, les deux bras (ou les deux jambes) en bas. On la
 * plaque sur les blocs du personnage exactement comme le jeu le fait. Une
 * tenue faite pour le jeu s'affiche donc à l'identique dans la salle en 3D —
 * il suffit de déposer ses deux images (chemise et pantalon) dans
 * assets/tenues/ et de les déclarer ci-dessous.
 *
 * En attendant, les tenues sont DESSINÉES ici, dans ce même gabarit : un
 * costume noir croisé, une veste bordeaux sur gilet, un costume noir à
 * cravate fine, une veste grise ouverte sur un gilet bleu.
 * ------------------------------------------------------------------------- */

export const GABARIT = { l: 585, h: 559 };

/* Les faces, [x, y, largeur, hauteur], telles que Roblox les attend. */
export const FACES = {
  torse: { F: [231, 74, 128, 128], R: [165, 74, 64, 128], L: [361, 74, 64, 128], B: [427, 74, 128, 128],
           U: [231, 8, 128, 64], D: [231, 204, 128, 64] },
  // Le bras droit (la jambe droite) : le bloc en bas à gauche.
  droit: { U: [217, 289, 64, 64], D: [217, 485, 64, 64],
           L: [19, 355, 64, 128], B: [85, 355, 64, 128], R: [151, 355, 64, 128], F: [217, 355, 64, 128] },
  // Le bras gauche (la jambe gauche) : le bloc en bas à droite.
  gauche: { U: [308, 289, 64, 64], D: [308, 485, 64, 64],
            F: [308, 355, 64, 128], L: [374, 355, 64, 128], B: [440, 355, 64, 128], R: [506, 355, 64, 128] }
};

/* Des tenues fournies en images : { nom: { chemise: "assets/tenues/x-chemise.png", pantalon: "…" } }.
   Les images d'aperçu portant un filigrane ne vont pas ici : il se verrait. */
export const TENUES_IMAGES = {};

/* Les tenues dessinées. */
export const TENUES = {
  "croise-noir": {
    libelle: "Costume noir croisé",
    veste: "#1d1d21", chemise: "#f2f1ec", cravate: "#8e1b22", largeurCravate: 9,
    croise: true, rayure: .05, poignets: "#f2f1ec",
    pantalon: "#1b1b1f", chaussures: "#111112"
  },
  bordeaux: {
    libelle: "Veste bordeaux et gilet",
    veste: "#4b1d22", gilet: "#161619", chemise: "#f2efe8", cravate: "#cdbb95", largeurCravate: 8,
    rayure: .08, pantalon: "#2a2a2f", chaussures: "#d9d0bb"
  },
  "noir-fin": {
    libelle: "Costume noir, cravate fine",
    veste: "#17171b", chemise: "#f4f4f2", cravate: "#0d0d0f", largeurCravate: 5,
    pantalon: "#17171b", chaussures: "#0c0c0d", poignets: "#f4f4f2"
  },
  "gris-bleu": {
    libelle: "Veste grise sur gilet bleu",
    veste: "#b8bbbe", gilet: "#2f4a7a", chemise: "#e7ecf2", cravate: null, ouverte: true,
    pantalon: "#d7d8da", chaussures: "#3a3a3c", poignets: "#2f4a7a"
  }
};
export const NOMS_TENUES = [...Object.keys(TENUES_IMAGES), ...Object.keys(TENUES)];

/* --- Le pinceau ------------------------------------------------------------ */
function teinte(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/** Un tissu : la couleur, un léger modelé, un grain, et des rayures s'il en faut. */
function tissu(g, [x, y, l, h], couleur, { rayure = 0, ombreBas = 0.12 } = {}) {
  const d = g.createLinearGradient(0, y, 0, y + h);
  d.addColorStop(0, teinte(couleur, 1.08));
  d.addColorStop(1, teinte(couleur, 1 - ombreBas));
  g.fillStyle = d;
  g.fillRect(x, y, l, h);
  for (let i = 0; i < l * h / 7; i++) {
    g.fillStyle = `rgba(${Math.random() > .5 ? "255,255,255" : "0,0,0"},${Math.random() * .05})`;
    g.fillRect(x + Math.random() * l, y + Math.random() * h, 1, 1);
  }
  if (rayure) {
    g.fillStyle = `rgba(255,255,255,${rayure})`;
    for (let i = x + 3; i < x + l; i += 6) g.fillRect(i, y, 1, h);
  }
}
function trait(g, points, couleur, largeur = 1) {
  g.strokeStyle = couleur; g.lineWidth = largeur;
  g.beginPath(); g.moveTo(...points[0]);
  for (const p of points.slice(1)) g.lineTo(...p);
  g.stroke();
}
function forme(g, points, couleur) {
  g.fillStyle = couleur;
  g.beginPath(); g.moveTo(...points[0]);
  for (const p of points.slice(1)) g.lineTo(...p);
  g.closePath(); g.fill();
}
function bouton(g, x, y, couleur) {
  g.fillStyle = teinte(couleur, .55);
  g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(255,255,255,.18)";
  g.beginPath(); g.arc(x - 1, y - 1, 1.2, 0, Math.PI * 2); g.fill();
}

/* --- La chemise : veste, gilet, chemise, cravate, revers, boutons --------- */
function dessinerChemise(g, t) {
  const T = FACES.torse;
  for (const k of ["R", "L", "B", "U", "D"]) tissu(g, T[k], t.veste, { rayure: t.rayure });
  tissu(g, T.F, t.veste, { rayure: t.rayure });

  // Le dos : une couture au milieu, le pli sous les épaules, la fente.
  const [bx, by, bl, bh] = T.B;
  trait(g, [[bx + bl / 2, by], [bx + bl / 2, by + bh]], "rgba(0,0,0,.35)", 1.5);
  g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(bx, by, bl, 10);
  trait(g, [[bx + bl / 2, by + bh - 22], [bx + bl / 2, by + bh]], "rgba(0,0,0,.5)", 2);
  // Les côtés : la couture.
  for (const k of ["R", "L"]) {
    const [x, y, l, h] = T[k];
    trait(g, [[x + l / 2, y], [x + l / 2, y + h]], "rgba(0,0,0,.25)", 1);
  }
  // Le dessous : la ceinture.
  const [dx, dy, dl, dh] = T.D;
  g.fillStyle = "#141414"; g.fillRect(dx, dy + dh / 2 - 4, dl, 8);

  // Le devant.
  const [x, y] = T.F;
  const c = x + 64;                                  // le milieu du torse
  const creux = t.ouverte ? 118 : t.gilet ? 92 : 70; // jusqu'où descend l'encolure
  if (t.gilet) {
    forme(g, [[c - 34, y], [c + 34, y], [c + 30, y + 128], [c - 30, y + 128]], t.gilet);
    tissu(g, [c - 30, y + 20, 60, 108], t.gilet, { ombreBas: .2 });
    for (const yy of [60, 78, 96, 114]) bouton(g, c, y + yy, t.gilet);
  }
  // La chemise, en V.
  forme(g, [[c - 22, y], [c + 22, y], [c, y + (t.gilet ? 56 : creux)]], t.chemise);
  // Le col : deux pointes.
  forme(g, [[c - 22, y], [c - 3, y + 4], [c - 12, y + 18]], teinte(t.chemise, .9));
  forme(g, [[c + 22, y], [c + 3, y + 4], [c + 12, y + 18]], teinte(t.chemise, .9));
  // La cravate.
  if (t.cravate) {
    const w = t.largeurCravate || 8;
    forme(g, [[c - w / 2 + 1, y + 5], [c + w / 2 - 1, y + 5], [c + w / 2 - 2, y + 12], [c - w / 2 + 2, y + 12]], teinte(t.cravate, .85));
    forme(g, [[c - w / 2 + 2, y + 12], [c + w / 2 - 2, y + 12], [c + w / 2 + 1, y + 50], [c, y + 58], [c - w / 2 - 1, y + 50]], t.cravate);
    trait(g, [[c, y + 14], [c, y + 55]], "rgba(0,0,0,.15)", 1);
  }
  // La veste : deux pans et leurs revers.
  const pan = t.ouverte ? 30 : 0;
  forme(g, [[x, y], [c - 22, y], [c - 2 - pan, y + creux], [c - 2 - pan, y + 128], [x, y + 128]], t.veste);
  forme(g, [[x + 128, y], [c + 22, y], [c + 2 + pan, y + creux], [c + 2 + pan, y + 128], [x + 128, y + 128]], t.veste);
  tissu(g, [x, y + creux, c - 2 - pan - x, 128 - creux], t.veste, { rayure: t.rayure });
  tissu(g, [c + 2 + pan, y + creux, x + 128 - c - 2 - pan, 128 - creux], t.veste, { rayure: t.rayure });
  const revers = teinte(t.veste, t.ouverte ? .8 : 1.25);
  forme(g, [[c - 22, y], [c - 32, y + 14], [c - 14, y + 30], [c - 2 - pan, y + creux]], revers);
  forme(g, [[c + 22, y], [c + 32, y + 14], [c + 14, y + 30], [c + 2 + pan, y + creux]], revers);
  trait(g, [[c - 22, y], [c - 2 - pan, y + creux], [c - 2 - pan, y + 128]], "rgba(0,0,0,.45)", 1.5);
  trait(g, [[c + 22, y], [c + 2 + pan, y + creux], [c + 2 + pan, y + 128]], "rgba(0,0,0,.45)", 1.5);
  // Les boutons, les poches, la pochette.
  if (!t.ouverte) {
    const cols = t.croise ? [c - 10, c + 10] : [c + 5];
    for (const bx2 of cols) for (const yy of t.croise ? [82, 102] : [84, 104]) bouton(g, bx2, y + yy, t.veste);
  }
  trait(g, [[x + 86, y + 40], [x + 104, y + 38]], teinte(t.veste, .55), 2);           // poche de poitrine
  g.fillStyle = "#f2f1ec"; g.fillRect(x + 90, y + 34, 9, 4);                           // pochette
  trait(g, [[x + 10, y + 100], [x + 34, y + 100]], teinte(t.veste, .55), 2);           // poches basses
  trait(g, [[x + 94, y + 100], [x + 118, y + 100]], teinte(t.veste, .55), 2);
  // Les manches.
  for (const cote of ["droit", "gauche"]) {
    const B = FACES[cote];
    for (const k of ["U", "D", "L", "B", "R", "F"]) tissu(g, B[k], t.veste, { rayure: t.rayure });
    for (const k of ["L", "B", "R", "F"]) {
      const [mx, my, ml, mh] = B[k];
      g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(mx, my, ml, 6);                      // l'épaule
      g.fillStyle = t.poignets || teinte(t.veste, .7);
      g.fillRect(mx, my + mh - 9, ml, 9);                                               // le poignet
      trait(g, [[mx, my + mh - 16], [mx + ml, my + mh - 16]], "rgba(0,0,0,.35)", 1);
      if (k === "F") for (const yy of [mh - 24, mh - 30]) bouton(g, mx + ml - 12, my + yy, t.veste);
    }
    const [hx, hy, hl, hh] = B.D;
    g.fillStyle = "#e8c9a6"; g.fillRect(hx, hy, hl, hh);                                // la main
  }
}

/* --- Le pantalon : le pli, l'ourlet, les chaussures ----------------------- */
function dessinerPantalon(g, t) {
  const T = FACES.torse;
  for (const k of Object.keys(T)) tissu(g, T[k], t.pantalon);
  for (const cote of ["droit", "gauche"]) {
    const J = FACES[cote];
    for (const k of ["U", "L", "B", "R", "F"]) tissu(g, J[k], t.pantalon, { ombreBas: .18 });
    for (const k of ["L", "B", "R", "F"]) {
      const [x, y, l, h] = J[k];
      if (k === "F" || k === "B") trait(g, [[x + l / 2, y + 4], [x + l / 2, y + h - 22]], "rgba(255,255,255,.12)", 1.5);
      g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(x, y + h - 24, l, 3);                // l'ourlet
      const d = g.createLinearGradient(0, y + h - 20, 0, y + h);
      d.addColorStop(0, teinte(t.chaussures, 1.15)); d.addColorStop(1, teinte(t.chaussures, .8));
      g.fillStyle = d; g.fillRect(x, y + h - 20, l, 20);                                // la chaussure
      g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(x, y + h - 4, l, 4);                  // la semelle
      if (k === "F") { g.fillStyle = "rgba(255,255,255,.15)"; g.fillRect(x + 8, y + h - 17, l - 16, 2); }
    }
    const [x, y, l, h] = J.D;
    g.fillStyle = "#0b0b0b"; g.fillRect(x, y, l, h);
  }
}

/**
 * Les deux images d'une tenue, prêtes à être plaquées : des toiles de
 * 585 × 559, dans le gabarit de Roblox.
 * @returns {{ chemise: HTMLCanvasElement, pantalon: HTMLCanvasElement }}
 */
const cache = new Map();
export function toilesTenue(nom) {
  if (cache.has(nom)) return cache.get(nom);
  const t = TENUES[nom] || TENUES["croise-noir"];
  const toile = (dessin) => {
    const c = document.createElement("canvas");
    c.width = GABARIT.l; c.height = GABARIT.h;
    dessin(c.getContext("2d"), t);
    return c;
  };
  const x = { chemise: toile(dessinerChemise), pantalon: toile(dessinerPantalon) };
  cache.set(nom, x);
  return x;
}
