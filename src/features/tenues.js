/* ---------------------------------------------------------------------------
 * Les tenues : des vêtements Roblox, au format Roblox.
 *
 * Un vêtement classique de Roblox est une image de 585 × 559 : le torse
 * déplié en croix en haut, les deux bras (ou les deux jambes) en bas. On la
 * plaque sur les blocs du personnage exactement comme le jeu le fait. Une
 * tenue faite pour le jeu s'affiche donc à l'identique dans la salle en 3D —
 * il suffit de déposer ses deux images (chemise et pantalon) dans
 * assets/tenues/ et de les déclarer dans TENUES_IMAGES.
 *
 * Les autres sont DESSINÉES ici, dans ce même gabarit, au double de la
 * résolution : le drap et son modelé, les revers crantés, les poches à
 * rabat, la cravate et son nœud, les plis des manches, les coutures. Et des
 * uniformes d'école militaire — veste courte, harnais de cuir, bottes —, avec
 * des insignes dessinés pour ce jeu. Les vestes des régiments viennent de
 * gabarits du jeu (assets/tenues/), l'insigne cousu par-dessus.
 * ------------------------------------------------------------------------- */

export const GABARIT = { l: 585, h: 559 };
const ECHELLE = 2;                         // on dessine au double, pour la netteté

/* Les faces, [x, y, largeur, hauteur], telles que Roblox les attend. */
export const FACES = {
  torse: { F: [231, 74, 128, 128], R: [165, 74, 64, 128], L: [361, 74, 64, 128], B: [427, 74, 128, 128],
           U: [231, 8, 128, 64], D: [231, 204, 128, 64] },
  // Le bras droit (la jambe droite) : le bloc en bas à gauche. Sa face L
  // touche le torse.
  droit: { U: [217, 289, 64, 64], D: [217, 485, 64, 64],
           L: [19, 355, 64, 128], B: [85, 355, 64, 128], R: [151, 355, 64, 128], F: [217, 355, 64, 128] },
  // Le bras gauche (la jambe gauche) : le bloc en bas à droite. Sa face R
  // touche le torse.
  gauche: { U: [308, 289, 64, 64], D: [308, 485, 64, 64],
            F: [308, 355, 64, 128], L: [374, 355, 64, 128], B: [440, 355, 64, 128], R: [506, 355, 64, 128] }
};

/* Des tenues fournies en images, au gabarit du jeu : la veste courte et le
   pantalon à harnais des régiments. Même vêtement pour tous (comme dans la
   série) ; ce qui les distingue, c'est l'insigne cousu sur la poche de
   poitrine, les deux épaules et le dos — et la cape.
   images : les deux gabarits ; veste, chemise, pantalon : les teintes du
   nuancier ; insigne : le blason ; cape : sa couleur, s'il y en a une.
   Une image d'aperçu portant un filigrane ne va pas ici : il se verrait. */
const REGIMENT = { chemise: "assets/tenues/veste-brune.png", pantalon: "assets/tenues/pantalon-harnais.png" };
export const TENUES_IMAGES = {
  exploration: {
    libelle: "Bataillon d'exploration", famille: "uniforme", images: REGIMENT, insigne: "exploration",
    veste: "#b8743f", chemise: "#e6dfb0", pantalon: "#efece6", cape: "#2d4a33"
  },
  garnison: {
    libelle: "Garnison", famille: "uniforme", images: REGIMENT, insigne: "garnison",
    veste: "#b8743f", chemise: "#e6dfb0", pantalon: "#efece6"
  },
  brigade: {
    libelle: "Brigade spéciale", famille: "uniforme", images: REGIMENT, insigne: "brigade",
    veste: "#b8743f", chemise: "#e6dfb0", pantalon: "#efece6"
  },
  cadet: {
    libelle: "Brigade d'entraînement", famille: "uniforme", images: REGIMENT, insigne: "entrainement",
    veste: "#b8743f", chemise: "#e6dfb0", pantalon: "#efece6"
  },
  gouvernement: {
    libelle: "Gouvernement", famille: "uniforme", insigne: "gouvernement",
    images: { chemise: "assets/tenues/veste-verte.png", pantalon: "assets/tenues/pantalon-harnais.png" },
    veste: "#1d3a2a", chemise: "#e6dfb0", pantalon: "#efece6"
  }
};
/* Où l'insigne est cousu, sur ces gabarits : [x, y, taille]. */
const INSIGNES_VESTE = [
  [338, 116, 0.8],          // la poche de poitrine, côté cœur
  [183, 388, 0.95],         // l'épaule droite, à l'extérieur
  [406, 388, 0.95],         // l'épaule gauche, à l'extérieur
  [491, 112, 1.3]           // le dos
];

/* --- Les tenues dessinées ---------------------------------------------------
   famille : « costume » (civil) ou « uniforme » (école militaire). */
export const TENUES = {
  "croise-noir": {
    libelle: "Costume croisé noir", famille: "costume",
    veste: "#25262c", chemise: "#f3f2ee", cravate: "#8e1b22", largeurCravate: 10,
    croise: true, rayure: .045, pochette: "#f3f2ee",
    pantalon: "#222328", chaussures: "#101011"
  },
  "bordeaux-gilet": {
    libelle: "Veste bordeaux et gilet", famille: "costume",
    veste: "#4a1c21", gilet: "#141417", chemise: "#f2efe8", cravate: "#cdbb95", largeurCravate: 8,
    rayure: .07, pochette: "#cdbb95",
    pantalon: "#1c1c21", chaussures: "#3a2418"
  },
  "noir-fin": {
    libelle: "Costume noir, cravate fine", famille: "costume",
    veste: "#1f2025", chemise: "#f5f5f3", cravate: "#0c0c0e", largeurCravate: 5,
    pantalon: "#1f2025", chaussures: "#0b0b0c"
  },
  "gris-bleu": {
    libelle: "Veste grise sur gilet bleu", famille: "costume",
    veste: "#b3b6ba", gilet: "#2e4878", chemise: "#e8edf3", ouverte: true,
    pantalon: "#d4d5d8", chaussures: "#3a3a3c", poignets: "#2e4878"
  },
  "trois-pieces": {
    libelle: "Trois-pièces anthracite", famille: "costume",
    veste: "#34373d", gilet: "#4b4f57", chemise: "#eef0f3", cravate: "#9aa3ad", largeurCravate: 9,
    rayure: .06, pochette: "#c9ced5", chaine: true,
    pantalon: "#303339", chaussures: "#141416"
  },
  camel: {
    libelle: "Costume camel", famille: "costume",
    veste: "#a57a4c", chemise: "#f4f1ea", cravate: "#4a2a18", largeurCravate: 9,
    pochette: "#e9dcc3",
    pantalon: "#9a7248", chaussures: "#3b2416"
  },
  "blazer-ecole": {
    libelle: "Blazer d'école", famille: "costume",
    veste: "#1d2a4a", chemise: "#f4f4f2", cravate: "#6d1b24", rayuresCravate: "#caa24a", largeurCravate: 9,
    ecusson: "ecole", passepoil: "#caa24a",
    pantalon: "#5a5d63", chaussures: "#141416"
  },
  bretelles: {
    libelle: "Chemise et bretelles", famille: "costume",
    veste: null, chemise: "#f1efe9", noeud: "#1c1c20", bretelles: "#1c1c20",
    pantalon: "#2b2d33", chaussures: "#2a1a10"
  },
  "pull-college": {
    libelle: "Pull sans manches", famille: "costume",
    veste: null, pull: "#d8ccb0", chemise: "#f4f3ef", cravate: "#233a5c", rayuresCravate: "#b8c4d4", largeurCravate: 9,
    pantalon: "#5b4634", chaussures: "#2a1a10"
  },
  "prof-tweed": {
    libelle: "Veste tweed, col roulé", famille: "costume",
    veste: "#6b5842", chevron: .055, coudieres: "#3a2a1c", ouverte: true,
    chemise: "#23252a", colRoule: true,
    pantalon: "#3b3a36", chaussures: "#2a1a10"
  },
  "manteau-long": {
    libelle: "Manteau long, col roulé", famille: "costume",
    veste: "#34373b", ouverte: true, manteau: true, chemise: "#141416", colRoule: true,
    pantalon: "#1b1c1f", chaussures: "#0e0e0f"
  },
  ceremonie: {
    libelle: "Tenue de cérémonie", famille: "uniforme",
    veste: "#1a2336", chemise: "#f3f2ee", cravate: "#0f1320", largeurCravate: 7,
    passepoil: "#c9a24a", epaulettes: "#c9a24a", aiguillette: "#d8b35a", ecusson: "brigade",
    pantalon: "#1a2336", bande: "#c9a24a", chaussures: "#0c0c0d"
  },
  instructeur: {
    libelle: "Manteau d'instructeur", famille: "uniforme",
    veste: "#4a3b2e", croise: true, manteau: true, chemise: "#e9e4d8", cravate: "#2a1a10", largeurCravate: 7,
    ecusson: "entrainement",
    pantalon: "#e7e1d2", harnais: "#3b2618", bottes: "#2b1a10", jupe: "#3a2618"
  },
  repos: {
    libelle: "Tenue de repos", famille: "uniforme",
    veste: null, chemise: "#ece6d8", bretelles: "#3b2618",
    pantalon: "#e7e1d2", harnais: "#3b2618", bottes: "#2b1a10", jupe: "#3a2618"
  }
};
export const NOMS_TENUES = [...Object.keys(TENUES_IMAGES), ...Object.keys(TENUES)];
export const libelleTenue = (nom) => TENUES_IMAGES[nom]?.libelle || TENUES[nom]?.libelle || nom;
export const ficheTenue = (nom) => TENUES_IMAGES[nom] || TENUES[nom] || null;

/* ===========================================================================
   Le pinceau
   ========================================================================= */
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function teinte(hex, k) {
  const [r, g, b] = rgb(hex);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}
const alpha = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };

/** Le drap : sa couleur, un modelé doux, l'ombre des bords, un grain, les rayures. */
function drap(g, [x, y, l, h], couleur, { rayure = 0, ombreBas = 0.12, bords = true, chevron = 0 } = {}) {
  const d = g.createLinearGradient(0, y, 0, y + h);
  d.addColorStop(0, teinte(couleur, 1.07));
  d.addColorStop(.55, couleur);
  d.addColorStop(1, teinte(couleur, 1 - ombreBas));
  g.fillStyle = d;
  g.fillRect(x, y, l, h);
  if (bords) {
    // Ce qui tourne vers l'arête s'assombrit : c'est ce qui donne le volume.
    for (const [x0, x1] of [[x, x + 7], [x + l, x + l - 7]]) {
      const b = g.createLinearGradient(x0, 0, x1, 0);
      b.addColorStop(0, "rgba(0,0,0,.22)"); b.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = b; g.fillRect(Math.min(x0, x1), y, 7, h);
    }
  }
  // Le grain du tissu.
  for (let i = 0; i < l * h / 5; i++) {
    g.fillStyle = `rgba(${Math.random() > .5 ? "255,255,255" : "0,0,0"},${Math.random() * .045})`;
    g.fillRect(x + Math.random() * l, y + Math.random() * h, .6, .6);
  }
  if (rayure) {
    // Une rayure tennis discrète : serrée, elle ferait un code-barres de loin.
    g.fillStyle = `rgba(255,255,255,${rayure * 0.55})`;
    for (let i = x + 4; i < x + l; i += 9) g.fillRect(i, y, .5, h);
  }
  if (chevron) {
    // Le tweed : des chevrons serrés, une colonne sur deux dans l'autre sens.
    g.save();
    g.beginPath(); g.rect(x, y, l, h); g.clip();
    g.lineWidth = .7;
    for (let i = 0, cx = x; cx < x + l; cx += 3, i++) for (let cy = y; cy < y + h; cy += 3) {
      g.strokeStyle = (i + cy) % 2 ? `rgba(255,255,255,${chevron})` : `rgba(0,0,0,${chevron})`;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 3, cy + (i % 2 ? 3 : -3) / 2 + 1.5); g.stroke();
    }
    g.restore();
  }
}
function trait(g, points, couleur, largeur = 1, pointille = null) {
  g.save();
  g.strokeStyle = couleur; g.lineWidth = largeur; g.lineCap = "round"; g.lineJoin = "round";
  if (pointille) g.setLineDash(pointille);
  g.beginPath(); g.moveTo(...points[0]);
  for (const p of points.slice(1)) g.lineTo(...p);
  g.stroke();
  g.restore();
}
function forme(g, points, remplissage) {
  g.fillStyle = remplissage;
  g.beginPath(); g.moveTo(...points[0]);
  for (const p of points.slice(1)) g.lineTo(...p);
  g.closePath(); g.fill();
}
function bouton(g, x, y, couleur, r = 2.6) {
  const d = g.createRadialGradient(x - r / 3, y - r / 3, .2, x, y, r);
  d.addColorStop(0, teinte(couleur, 1.6)); d.addColorStop(1, teinte(couleur, .5));
  g.fillStyle = d;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = "rgba(0,0,0,.35)";
  g.fillRect(x - .7, y - .7, .5, .5); g.fillRect(x + .3, y + .2, .5, .5);
}
/** Un pli de tissu : une ombre et, juste à côté, un reflet. */
function pli(g, points, force = 1) {
  trait(g, points, `rgba(0,0,0,${.2 * force})`, 1.4);
  trait(g, points.map(([a, b]) => [a + 1.2, b]), `rgba(255,255,255,${.07 * force})`, .8);
}
/** Une couture, piquée. */
const couture = (g, points, couleur = "rgba(0,0,0,.35)") => trait(g, points, couleur, .7, [1.5, 1.2]);
/** Une ombre (ou une lumière) fondue, tenue dans sa face du gabarit — le
 *  calque « produit » des faiseurs de vêtements Roblox. Légère : trop
 *  d'ombre salit le tissu. */
function modele(g, zone, points, a = .16, flou = 5, clair = false) {
  g.save();
  g.beginPath(); g.rect(...zone); g.clip();
  if (flou) g.filter = `blur(${flou}px)`;
  forme(g, points, clair ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  g.restore();
}

/* --- Les insignes : dessinés pour ce jeu -------------------------------- */
function ecu(g, cx, cy, l, h) {
  g.beginPath();
  g.moveTo(cx - l / 2, cy - h / 2);
  g.lineTo(cx + l / 2, cy - h / 2);
  g.lineTo(cx + l / 2, cy);
  g.quadraticCurveTo(cx + l / 2, cy + h * .35, cx, cy + h / 2);
  g.quadraticCurveTo(cx - l / 2, cy + h * .35, cx - l / 2, cy);
  g.closePath();
}
export function dessinerInsigne(g, type, cx, cy, s = 1) {
  if (type === "ecole") return dessinerEcusson(g, cx, cy, s);
  // Les blasons des régiments : l'écu d'acier, partagé en quatre par une
  // croix, et le symbole du corps par-dessus. Dessinés dans une boîte de
  // 100 × 120, ramenée à la taille voulue.
  const k = (26 * s) / 100;
  g.save();
  g.translate(cx - 50 * k, cy - 60 * k);
  g.scale(k, k);
  blasonEcu(g);
  if (type === "exploration") symboleAiles(g);
  else if (type === "garnison") symboleRoses(g);
  else if (type === "brigade") symboleCheval(g);
  else if (type === "entrainement") symboleEpees(g);
  else if (type === "gouvernement") symboleCouronne(g);
  g.restore();
}

/* --- L'écu d'acier ------------------------------------------------------ */
function contourEcu(g, m = 0) {
  g.beginPath();
  g.moveTo(4 + m, 4 + m); g.lineTo(96 - m, 4 + m); g.lineTo(96 - m, 84 - m * 0.4);
  g.lineTo(50, 116 - m * 1.2); g.lineTo(4 + m, 84 - m * 0.4); g.closePath();
}
function blasonEcu(g) {
  // Le cadre : un acier clair, poli, qui prend la lumière en haut.
  contourEcu(g);
  const acier = g.createLinearGradient(0, 4, 100, 116);
  acier.addColorStop(0, "#f2f3f4"); acier.addColorStop(0.45, "#bfc2c6"); acier.addColorStop(1, "#8a8e93");
  g.fillStyle = acier; g.fill();
  g.lineWidth = 2.6; g.strokeStyle = "#2b2c2f"; g.stroke();
  // Les quatre quartiers, plus sombres, en creux.
  const quartier = (points) => {
    g.beginPath(); g.moveTo(...points[0]); for (const p of points.slice(1)) g.lineTo(...p); g.closePath();
    const d = g.createLinearGradient(0, points[0][1], 0, points[2][1]);
    d.addColorStop(0, "#a9adb2"); d.addColorStop(1, "#7a7f85");
    g.fillStyle = d; g.fill();
    g.lineWidth = 1.4; g.strokeStyle = "#3a3c40"; g.stroke();
    // l'arête éclairée du creux
    g.beginPath(); g.moveTo(...points[points.length - 1]); g.lineTo(...points[0]); g.lineTo(...points[1]);
    g.lineWidth = 1; g.strokeStyle = "rgba(255,255,255,.35)"; g.stroke();
  };
  quartier([[13, 13], [45, 13], [45, 44], [13, 44]]);
  quartier([[55, 13], [87, 13], [87, 44], [55, 44]]);
  quartier([[13, 53], [45, 53], [45, 100], [13, 80]]);
  quartier([[55, 53], [87, 53], [87, 80], [55, 100]]);
}

/* --- Les symboles, dessinés pour ce jeu --------------------------------- */
// Deux ailes qui s'élèvent et se croisent au pied de l'écu : la gauche bleue,
// la droite blanche, chacune de six plumes arrondies.
function symboleAiles(g) {
  const aile = (sens, clair, fonce) => {
    for (let i = 5; i >= 0; i--) {
      const t = i / 5;
      const x = 50 + sens * (8 + t * 26), y = 100 - t * 76;
      g.save();
      g.translate(x, y);
      g.rotate(sens * (-0.95 + t * 0.35));
      const d = g.createLinearGradient(-18, 0, 18, 0);
      d.addColorStop(0, clair); d.addColorStop(1, fonce);
      g.beginPath(); g.ellipse(0, 0, 19 - t * 4, 5.2, 0, 0, Math.PI * 2);
      g.fillStyle = d; g.fill();
      g.lineWidth = 1; g.strokeStyle = "rgba(20,25,45,.55)"; g.stroke();
      g.restore();
    }
    // la penne qui porte l'aile
    g.beginPath(); g.moveTo(50 - sens * 10, 112); g.quadraticCurveTo(50 + sens * 22, 70, 50 + sens * 34, 20);
    g.lineWidth = 2.2; g.strokeStyle = fonce; g.stroke();
  };
  aile(-1, "#6f8fe0", "#1f3c8f");
  aile(1, "#ffffff", "#b9c0cc");
}
// Deux roses rouges côte à côte, leurs tiges croisées vers le bas.
function symboleRoses(g) {
  g.lineCap = "round";
  for (const [x0, x1] of [[34, 64], [66, 36]]) {
    g.beginPath(); g.moveTo(x0, 44); g.quadraticCurveTo(50, 70, x1, 104);
    g.lineWidth = 2.6; g.strokeStyle = "#2f3a2c"; g.stroke();
    // une feuille et une épine
    g.beginPath(); g.ellipse((x0 + x1) / 2 + (x1 > x0 ? -4 : 4), 80, 6, 3, x1 > x0 ? 0.7 : -0.7, 0, Math.PI * 2);
    g.fillStyle = "#3e5a36"; g.fill();
  }
  const rose = (x, y, r) => {
    const d = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    d.addColorStop(0, "#c2414a"); d.addColorStop(1, "#5e1016");
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 - Math.PI / 2;
      g.beginPath(); g.arc(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.58, 0, Math.PI * 2);
      g.fillStyle = d; g.fill();
      g.lineWidth = 0.9; g.strokeStyle = "rgba(40,5,8,.6)"; g.stroke();
    }
    // le cœur en spirale
    g.beginPath();
    for (let t = 0; t < 12; t += 0.2) g.lineTo(x + Math.cos(t) * t * r * 0.045, y + Math.sin(t) * t * r * 0.045);
    g.lineWidth = 1.1; g.strokeStyle = "rgba(40,5,8,.75)"; g.stroke();
  };
  rose(33, 36, 14);
  rose(67, 36, 14);
}
// Une tête de cheval verte, de profil, crinière d'argent, une corne en lame.
function symboleCheval(g) {
  // la crinière, derrière
  g.beginPath();
  g.moveTo(62, 12); g.quadraticCurveTo(92, 22, 94, 54); g.quadraticCurveTo(96, 84, 82, 104);
  g.lineTo(74, 98); g.quadraticCurveTo(86, 70, 78, 40); g.closePath();
  const argent = g.createLinearGradient(60, 10, 96, 104);
  argent.addColorStop(0, "#ffffff"); argent.addColorStop(1, "#aeb3b9");
  g.fillStyle = argent; g.fill(); g.lineWidth = 1.2; g.strokeStyle = "#3a3c40"; g.stroke();
  // la corne-lame
  g.beginPath(); g.moveTo(38, 30); g.lineTo(18, 4); g.lineTo(44, 25); g.closePath();
  g.fillStyle = "#e9ebee"; g.fill(); g.strokeStyle = "#3a3c40"; g.lineWidth = 1; g.stroke();
  // la tête
  g.beginPath();
  g.moveTo(60, 14); g.lineTo(66, 6); g.lineTo(67, 20);
  g.quadraticCurveTo(80, 36, 78, 60); g.quadraticCurveTo(76, 84, 64, 102);
  g.lineTo(50, 100); g.quadraticCurveTo(54, 84, 46, 74);
  g.quadraticCurveTo(34, 70, 22, 66); g.quadraticCurveTo(12, 62, 14, 52);
  g.quadraticCurveTo(18, 42, 30, 34); g.quadraticCurveTo(44, 22, 60, 14); g.closePath();
  const vert = g.createLinearGradient(20, 20, 80, 100);
  vert.addColorStop(0, "#3f9a68"); vert.addColorStop(1, "#15452c");
  g.fillStyle = vert; g.fill(); g.lineWidth = 1.4; g.strokeStyle = "#0d2a1b"; g.stroke();
  // l'œil, le naseau
  g.fillStyle = "#0b1f14";
  g.beginPath(); g.ellipse(46, 40, 3, 2, -0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(19, 56, 1.8, 1.3, 0, 0, Math.PI * 2); g.fill();
}
// Deux épées croisées, lames d'acier, poignées de cuir.
function symboleEpees(g) {
  for (const sens of [-1, 1]) {
    g.save();
    g.translate(50, 60); g.rotate(sens * 0.62);
    const lame = g.createLinearGradient(-4, 0, 4, 0);
    lame.addColorStop(0, "#ffffff"); lame.addColorStop(1, "#b8bcc2");
    g.beginPath(); g.moveTo(-3.4, 40); g.lineTo(-3.4, -52); g.lineTo(0, -60); g.lineTo(3.4, -52); g.lineTo(3.4, 40); g.closePath();
    g.fillStyle = lame; g.fill(); g.lineWidth = 1; g.strokeStyle = "#3a3c40"; g.stroke();
    g.fillStyle = "#4a2e1c";
    g.fillRect(-11, 40, 22, 5);           // la garde
    g.fillRect(-3.4, 45, 6.8, 14);        // la poignée
    g.restore();
  }
}
// La couronne d'or au-dessus des trois enceintes : le pouvoir des Murs.
function symboleCouronne(g) {
  const or = g.createLinearGradient(0, 10, 0, 100);
  or.addColorStop(0, "#f6dc7a"); or.addColorStop(1, "#a9801f");
  g.strokeStyle = or; g.lineWidth = 3.6;
  for (const r of [27, 19, 11]) { g.beginPath(); g.arc(50, 72, r, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = or; g.beginPath(); g.arc(50, 72, 3.5, 0, Math.PI * 2); g.fill();
  g.beginPath();
  g.moveTo(32, 38); g.lineTo(30, 18); g.lineTo(40, 28); g.lineTo(50, 12); g.lineTo(60, 28); g.lineTo(70, 18); g.lineTo(68, 38);
  g.closePath(); g.fill();
  g.lineWidth = 1.2; g.strokeStyle = "#5b4410"; g.stroke();
  for (const [x, y] of [[30, 17], [50, 11], [70, 17]]) { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
}

/* --- L'écusson du collège (le blazer) ----------------------------------- */
function dessinerEcusson(g, cx, cy, s) {
  const l = 26 * s, h = 30 * s;
  g.save();
  ecu(g, cx, cy, l, h);
  const d = g.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  d.addColorStop(0, teinte("#1d2a4a", 1.25)); d.addColorStop(1, "#1d2a4a");
  g.fillStyle = d; g.fill();
  g.lineWidth = 1.6 * s; g.strokeStyle = "#c9a24a"; g.stroke();
  g.clip();
  const or = "#d9b45a";
  // Un livre ouvert sous une plume.
  g.fillStyle = "#efe6d0";
  g.beginPath(); g.moveTo(cx, cy + 6 * s); g.quadraticCurveTo(cx - 5 * s, cy + 3 * s, cx - 10 * s, cy + 5 * s);
  g.lineTo(cx - 10 * s, cy - 2 * s); g.quadraticCurveTo(cx - 5 * s, cy - 4 * s, cx, cy - 1 * s); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(cx, cy + 6 * s); g.quadraticCurveTo(cx + 5 * s, cy + 3 * s, cx + 10 * s, cy + 5 * s);
  g.lineTo(cx + 10 * s, cy - 2 * s); g.quadraticCurveTo(cx + 5 * s, cy - 4 * s, cx, cy - 1 * s); g.closePath(); g.fill();
  g.strokeStyle = or; g.lineWidth = 1.2 * s;
  g.beginPath(); g.moveTo(cx - 3 * s, cy - 3 * s); g.quadraticCurveTo(cx + 2 * s, cy - 9 * s, cx + 6 * s, cy - 12 * s); g.stroke();
  g.restore();
}

/* ===========================================================================
   Le haut : veste (ou uniforme), gilet, chemise, cravate — le torse et les bras
   ========================================================================= */
function dessinerHaut(g, t) {
  const T = FACES.torse;
  const [fx, fy] = T.F;
  const c = fx + 64;                                   // le milieu du devant
  const matiere = t.veste || t.pull || t.chemise;       // ce qui habille le torse

  /* --- Le torse, de tous côtés ------------------------------------------- */
  for (const k of ["R", "L", "B", "U", "D", "F"]) drap(g, T[k], matiere, { rayure: t.veste ? t.rayure : 0, chevron: t.veste ? t.chevron : 0 });

  // Le dessus : les épaules, l'encolure.
  const [ux, uy, ul, uh] = T.U;
  g.fillStyle = teinte(t.chemise, .92);
  g.beginPath(); g.ellipse(ux + ul / 2, uy + uh / 2 + 6, 22, 14, 0, 0, Math.PI * 2); g.fill();
  couture(g, [[ux + 10, uy + uh / 2], [ux + 40, uy + uh / 2]]);
  couture(g, [[ux + ul - 40, uy + uh / 2], [ux + ul - 10, uy + uh / 2]]);

  // Les côtés : la couture, un pli sous le bras.
  for (const k of ["R", "L"]) {
    const [x, y, l, h] = T[k];
    couture(g, [[x + l / 2, y + 4], [x + l / 2, y + h]]);
    pli(g, [[x + l / 2 - 8, y + 16], [x + l / 2 - 4, y + 34]], .8);
  }

  // Le dos : la couture médiane, la fente, les omoplates.
  const [bx, by, bl, bh] = T.B;
  couture(g, [[bx + bl / 2, by + 2], [bx + bl / 2, by + bh]]);
  pli(g, [[bx + 24, by + 18], [bx + 34, by + 40]], .7);
  pli(g, [[bx + bl - 24, by + 18], [bx + bl - 34, by + 40]], .7);
  if (t.veste && !t.militaire) trait(g, [[bx + bl / 2, by + bh - 26], [bx + bl / 2, by + bh]], "rgba(0,0,0,.55)", 1.6);
  const cou = g.createLinearGradient(0, by, 0, by + 14);
  cou.addColorStop(0, "rgba(0,0,0,.3)"); cou.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = cou; g.fillRect(bx, by, bl, 14);

  // Le dessous du torse : la ceinture.
  const [dx, dy, dl, dh] = T.D;
  g.fillStyle = t.harnais || "#141414"; g.fillRect(dx, dy + dh / 2 - 5, dl, 10);

  dessinerCostumeTorse(g, t, c);

  /* --- Le modelé : ombres en V sous les bras, ombre du col, lumière sur la
         poitrine ; les omoplates dans le dos ------------------------------ */
  const F = T.F;
  for (const s of [0, 1]) {
    const x0 = fx + s * 128, dir = s ? -1 : 1;
    modele(g, F, [[x0, fy + 2], [x0 + dir * 22, fy + 26], [x0 + dir * 12, fy + 72], [x0, fy + 84]], .17);
    modele(g, F, [[x0 + dir * 16, fy + 16], [x0 + dir * 46, fy + 20], [x0 + dir * 42, fy + 46], [x0 + dir * 18, fy + 40]], .06, 8, true);
    const xb = bx + s * bl;
    modele(g, T.B, [[xb, by + 4], [xb + dir * 16, by + 28], [xb + dir * 8, by + 70], [xb, by + 80]], .14);
  }
  modele(g, F, [[fx + 28, fy - 2], [fx + 100, fy - 2], [fx + 92, fy + 7], [fx + 36, fy + 7]], .16, 3);
  modele(g, F, [[fx, fy + 120], [fx + 128, fy + 120], [fx + 128, fy + 130], [fx, fy + 130]], .1, 4);

  // La tenue de cérémonie : les épaulettes d'or, l'aiguillette tressée.
  if (t.epaulettes) {
    const [ux, uy, ul, uh] = T.U;
    for (const x0 of [ux + 2, ux + ul - 30]) {
      drap(g, [x0, uy + 12, 28, uh - 24], t.epaulettes, { bords: false, ombreBas: .3 });
      for (let yy = uy + 14; yy < uy + uh - 12; yy += 2.5) trait(g, [[x0 + 21, yy], [x0 + 27, yy]], "rgba(0,0,0,.25)", .6);
      bouton(g, x0 + 8, uy + uh / 2, t.epaulettes, 2.4);
    }
  }
  if (t.aiguillette) {
    for (const [dy, larg] of [[0, 2.4], [7, 2]]) {
      g.save();
      g.strokeStyle = t.aiguillette; g.lineWidth = larg; g.lineCap = "round";
      g.beginPath(); g.moveTo(fx + 2, fy + 3); g.quadraticCurveTo(fx + 8 + dy, fy + 40 + dy * 2, fx + 38, fy + 36 + dy); g.stroke();
      g.strokeStyle = "rgba(0,0,0,.3)"; g.lineWidth = .6; g.setLineDash([1.2, 1.6]); g.stroke();
      g.restore();
    }
    bouton(g, fx + 38, fy + 36, t.aiguillette, 2.2);
  }

  /* --- Les manches -------------------------------------------------------- */
  for (const cote of ["droit", "gauche"]) {
    const B = FACES[cote];
    const manche = t.veste || t.chemise;                // sous un pull, on voit la chemise
    for (const k of ["U", "L", "B", "R", "F"]) drap(g, B[k], manche, { rayure: t.veste ? t.rayure : 0, chevron: t.veste ? t.chevron : 0 });
    // Le côté extérieur porte l'insigne d'épaule (uniformes).
    const exterieur = cote === "droit" ? "R" : "L";
    const interieur = cote === "droit" ? "L" : "R";
    for (const k of ["L", "B", "R", "F"]) {
      const [x, y, l, h] = B[k];
      // L'épaule prend la lumière, sous sa couture ; le côté du corps est
      // dans l'ombre ; le creux du coude se marque. Puis les plis.
      const ep = g.createLinearGradient(0, y, 0, y + 14);
      ep.addColorStop(0, "rgba(255,255,255,.13)"); ep.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = ep; g.fillRect(x, y, l, 14);
      trait(g, [[x, y + .6], [x + l, y + .6]], "rgba(0,0,0,.32)", 1.2);
      if (k === interieur) { g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(x, y, l, h); }
      if (k === "F") modele(g, B[k], [[x + 10, y + 60], [x + l - 10, y + 60], [x + l - 16, y + 74], [x + 16, y + 74]], .07, 7);
      pli(g, [[x + 10, y + 62], [x + 26, y + 70], [x + 40, y + 66]], .9);
      pli(g, [[x + 22, y + 76], [x + 44, y + 82]], .6);
      if (t.veste) {
        // Le poignet de chemise qui dépasse, la couture de manche.
        g.fillStyle = t.poignets || t.chemise;
        g.fillRect(x, y + h - 10, l, 10);
        g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, y + h - 10, l, 1.2);
        trait(g, [[x, y + h - 12], [x + l, y + h - 12]], "rgba(0,0,0,.4)", 1);
        if (k === "F" && !t.militaire) for (const yy of [h - 20, h - 26, h - 32]) bouton(g, x + l - 11, y + yy, teinte(t.veste, .6), 1.8);
      } else {
        // Manches de chemise retroussées au coude.
        g.fillStyle = teinte(t.chemise, .92); g.fillRect(x, y + 70, l, 12);
        trait(g, [[x, y + 70], [x + l, y + 70]], "rgba(0,0,0,.2)", 1);
        trait(g, [[x, y + 82], [x + l, y + 82]], "rgba(0,0,0,.25)", 1);
        g.clearRect(x, y + 83, l, h - 83);                                  // l'avant-bras nu : la peau
      }
      if (t.epaulettes && k === exterieur) for (let xx = x + 3; xx < x + l - 2; xx += 3) trait(g, [[xx, y + 1], [xx, y + 10]], t.epaulettes, 1.6);
      if (t.coudieres && k === "B") {
        // Les coudières de daim, cousues au dos de la manche.
        g.fillStyle = t.coudieres;
        g.beginPath(); g.ellipse(x + l / 2, y + 66, 13, 17, 0, 0, Math.PI * 2); g.fill();
        g.setLineDash([1.5, 1.2]); g.strokeStyle = "rgba(255,255,255,.28)"; g.lineWidth = .7;
        g.beginPath(); g.ellipse(x + l / 2, y + 66, 11, 15, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
      if (t.passepoil && k === exterieur) trait(g, [[x, y + h - 14], [x + l, y + h - 14]], t.passepoil, 1.2);
    }
    // La main reste transparente : c'est la peau du personnage qu'on voit.
    g.clearRect(...B.D);
  }
}

/* --- Le devant d'un costume -------------------------------------------- */
function dessinerCostumeTorse(g, t, c) {
  const [fx, fy] = FACES.torse.F;
  const bas = fy + 128;
  const ouverte = Boolean(t.ouverte);
  const creux = !t.veste ? 0 : ouverte ? 128 : t.gilet ? 88 : t.croise ? 62 : 72;

  // La chemise, sous tout le reste.
  if (!t.veste && !t.pull) drap(g, FACES.torse.F, t.chemise, { ombreBas: .1 });
  forme(g, [[c - 24, fy], [c + 24, fy], [c + (t.veste ? 0 : 24), fy + (creux || 128)], [c - (t.veste ? 0 : 24), fy + (creux || 128)]], t.chemise);
  if (!t.veste && !t.pull) {
    // Chemise seule : la patte de boutonnage, les boutons, la poche.
    trait(g, [[c, fy + 10], [c, bas]], "rgba(0,0,0,.18)", 1);
    for (let yy = 26; yy < 128; yy += 18) bouton(g, c + 3, fy + yy, "#e8e6e0", 1.6);
    trait(g, [[fx + 84, fy + 38], [fx + 104, fy + 38], [fx + 104, fy + 58], [fx + 84, fy + 58], [fx + 84, fy + 38]], "rgba(0,0,0,.18)", 1);
    pli(g, [[fx + 30, fy + 70], [fx + 38, fy + 110]], .5);
    pli(g, [[fx + 98, fy + 72], [fx + 90, fy + 112]], .5);
  }

  // Le gilet (ou le pull), en V profond.
  if (t.gilet || t.pull) {
    const m = t.gilet || t.pull;
    forme(g, [[c - 36, fy], [c - 20, fy], [c, fy + 54], [c + 20, fy], [c + 36, fy], [c + 34, bas], [c - 34, bas]], m);
    drap(g, [c - 34, fy + 54, 68, 74], m, { bords: false, ombreBas: .2 });
    forme(g, [[c - 20, fy], [c, fy + 54], [c - 3, fy + 56], [c - 23, fy + 2]], teinte(m, .75));
    forme(g, [[c + 20, fy], [c, fy + 54], [c + 3, fy + 56], [c + 23, fy + 2]], teinte(m, .75));
    if (t.pull) {
      // Les torsades du pull, le bord-côte.
      for (const xx of [c - 22, c + 22]) for (let yy = fy + 60; yy < bas - 12; yy += 7) {
        trait(g, [[xx - 3, yy], [xx + 3, yy + 5]], "rgba(0,0,0,.18)", 1.2);
        trait(g, [[xx + 3, yy], [xx - 3, yy + 5]], "rgba(255,255,255,.15)", 1.2);
      }
      g.fillStyle = teinte(m, .85); g.fillRect(c - 34, bas - 10, 68, 10);
      for (let x = c - 34; x < c + 34; x += 2.5) trait(g, [[x, bas - 10], [x, bas]], "rgba(0,0,0,.15)", .6);
    } else {
      for (const yy of [64, 80, 96, 112]) bouton(g, c, fy + yy, teinte(t.gilet, 1.5), 2);
      if (t.chaine) {
        g.strokeStyle = "#cfb46a"; g.lineWidth = 1;
        g.beginPath(); g.moveTo(c, fy + 88); g.quadraticCurveTo(c + 14, fy + 100, c + 26, fy + 90); g.stroke();
      }
    }
  }

  if (t.colRoule) {
    // Le col roulé : un bord-côte épais qui monte au cou.
    drap(g, [c - 24, fy, 48, 12], teinte(t.chemise, 1.12), { bords: false, ombreBas: .3 });
    for (let x = c - 23; x < c + 24; x += 2.4) trait(g, [[x, fy], [x, fy + 11]], "rgba(0,0,0,.22)", .6);
    trait(g, [[c - 24, fy + 12], [c + 24, fy + 12]], "rgba(0,0,0,.3)", 1);
    for (let yy = fy + 30; yy < bas; yy += 3) trait(g, [[c - 22, yy], [c + 22, yy]], "rgba(255,255,255,.035)", .6);
  } else {
  // Le col de chemise : deux pointes et leur ombre.
  forme(g, [[c - 24, fy], [c - 3, fy + 5], [c - 13, fy + 20]], teinte(t.chemise, .93));
  forme(g, [[c + 24, fy], [c + 3, fy + 5], [c + 13, fy + 20]], teinte(t.chemise, .93));
  trait(g, [[c - 13, fy + 20], [c - 3, fy + 5]], "rgba(0,0,0,.18)", .8);
  trait(g, [[c + 13, fy + 20], [c + 3, fy + 5]], "rgba(0,0,0,.18)", .8);
  }

  // La cravate (ou le nœud papillon).
  if (t.cravate) {
    const w = t.largeurCravate || 8;
    forme(g, [[c - w / 2, fy + 5], [c + w / 2, fy + 5], [c + w / 2 - 1.5, fy + 13], [c - w / 2 + 1.5, fy + 13]], teinte(t.cravate, .78));
    g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(c - w / 2 + 1.5, fy + 6, 2, 5);
    forme(g, [[c - w / 2 + 1.5, fy + 13], [c + w / 2 - 1.5, fy + 13], [c + w / 2 + 1, fy + 52], [c, fy + 60], [c - w / 2 - 1, fy + 52]], t.cravate);
    if (t.rayuresCravate) {
      g.save();
      g.beginPath(); g.moveTo(c - w / 2 + 1.5, fy + 13); g.lineTo(c + w / 2 - 1.5, fy + 13); g.lineTo(c + w / 2 + 1, fy + 52);
      g.lineTo(c, fy + 60); g.lineTo(c - w / 2 - 1, fy + 52); g.closePath(); g.clip();
      g.strokeStyle = t.rayuresCravate; g.lineWidth = 1.4;
      for (let i = -10; i < 60; i += 6) { g.beginPath(); g.moveTo(c - 10, fy + 12 + i); g.lineTo(c + 10, fy + i); g.stroke(); }
      g.restore();
    }
    trait(g, [[c, fy + 15], [c, fy + 57]], "rgba(0,0,0,.14)", .8);
    g.fillStyle = "rgba(0,0,0,.2)"; g.fillRect(c + w / 2 - 1, fy + 14, 1.5, 36);
  }
  if (t.noeud) {
    forme(g, [[c, fy + 9], [c - 11, fy + 4], [c - 11, fy + 15]], t.noeud);
    forme(g, [[c, fy + 9], [c + 11, fy + 4], [c + 11, fy + 15]], t.noeud);
    g.fillStyle = teinte(t.noeud, .6); g.fillRect(c - 2.5, fy + 6, 5, 6);
  }
  if (t.bretelles) {
    for (const xx of [c - 30, c + 30]) {
      g.fillStyle = t.bretelles; g.fillRect(xx - 3, fy, 6, 128);
      g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(xx - 3, fy, 1.2, 128);
      g.fillStyle = "#c9a24a"; g.fillRect(xx - 4, fy + 110, 8, 6);
    }
    // Et dans le dos, le croisement en Y.
    const [bx, by, bl] = FACES.torse.B;
    trait(g, [[bx + 34, by], [bx + bl / 2, by + 60], [bx + bl - 34, by]], t.bretelles, 6);
    trait(g, [[bx + bl / 2, by + 60], [bx + bl / 2, by + 128]], t.bretelles, 6);
  }

  if (!t.veste) return;
  // La veste : deux pans, et leurs revers crantés.
  const pan = ouverte ? 30 : t.croise ? -6 : 0;
  const x1 = c - 2 - pan, x2 = c + 2 + pan;
  forme(g, [[fx, fy], [c - 24, fy], [x1, fy + creux], [x1, bas], [fx, bas]], t.veste);
  forme(g, [[fx + 128, fy], [c + 24, fy], [x2, fy + creux], [x2, bas], [fx + 128, bas]], t.veste);
  drap(g, [fx, fy + creux - 2, x1 - fx, bas - fy - creux + 2], t.veste, { rayure: t.rayure, bords: false, chevron: t.chevron });
  drap(g, [x2, fy + creux - 2, fx + 128 - x2, bas - fy - creux + 2], t.veste, { rayure: t.rayure, bords: false, chevron: t.chevron });
  const revers = teinte(t.veste, ouverte ? .78 : 1.22);
  const ombreRevers = teinte(t.veste, .62);
  for (const s of [-1, 1]) {
    const xp = s < 0 ? x1 : x2;
    // Le revers, du col au premier bouton, avec son cran.
    forme(g, [[c + s * 24, fy], [c + s * 36, fy + 6], [c + s * 32, fy + 22], [c + s * 26, fy + 24], [c + s * 20, fy + 38], [xp, fy + creux]], revers);
    trait(g, [[c + s * 24, fy], [c + s * 36, fy + 6], [c + s * 32, fy + 22], [c + s * 26, fy + 24], [c + s * 20, fy + 38], [xp, fy + creux]], ombreRevers, 1.2);
    // L'ombre portée du revers sur la chemise.
    trait(g, [[c + s * 23, fy + 1], [xp + s * 1.5, fy + creux]], "rgba(0,0,0,.35)", 2);
  }
  // Le bord des pans, jusqu'en bas ; l'échancrure du bas si la veste est fermée.
  trait(g, [[x1, fy + creux], [x1, bas]], "rgba(0,0,0,.5)", 1.4);
  trait(g, [[x2, fy + creux], [x2, bas]], "rgba(0,0,0,.5)", 1.4);
  if (!ouverte && !t.croise) {
    forme(g, [[c - 2, bas - 16], [c + 2, bas - 16], [c + 14, bas], [c - 14, bas]], t.pantalon);
    trait(g, [[c - 2, bas - 16], [c - 14, bas]], "rgba(0,0,0,.4)", 1);
    trait(g, [[c + 2, bas - 16], [c + 14, bas]], "rgba(0,0,0,.4)", 1);
  }
  // Les boutons.
  if (!ouverte) {
    const cols = t.croise ? [c - 11, c + 11] : [c + 6];
    const lignes = t.croise ? [74, 92, 110] : [84, 104];
    for (const xx of cols) for (const yy of lignes) bouton(g, xx, fy + yy, teinte(t.veste, .9));
  }
  // La poche de poitrine et sa pochette ; les poches à rabat.
  const px = fx + 88;
  trait(g, [[px, fy + 44], [px + 20, fy + 42]], teinte(t.veste, .5), 1.8);
  if (t.pochette) {
    forme(g, [[px + 3, fy + 43], [px + 7, fy + 36], [px + 10, fy + 40], [px + 14, fy + 35], [px + 17, fy + 42]], t.pochette);
  }
  if (t.ecusson) dessinerInsigne(g, t.ecusson, px + 10, fy + 30, .75);
  for (const x0 of [fx + 8, fx + 92]) {
    forme(g, [[x0, fy + 98], [x0 + 28, fy + 98], [x0 + 28, fy + 104], [x0, fy + 104]], teinte(t.veste, .92));
    trait(g, [[x0, fy + 104], [x0 + 28, fy + 104]], "rgba(0,0,0,.45)", 1);
    trait(g, [[x0, fy + 98], [x0 + 28, fy + 98]], "rgba(255,255,255,.08)", .8);
  }
  // Les plis de la taille.
  pli(g, [[fx + 22, fy + 60], [fx + 28, fy + 90]], .6);
  pli(g, [[fx + 106, fy + 60], [fx + 100, fy + 90]], .6);
  if (t.passepoil) {
    trait(g, [[c - 24, fy], [c - 36, fy + 6], [c - 32, fy + 22], [c - 26, fy + 24], [c - 20, fy + 38], [x1, fy + creux]], t.passepoil, .9);
    trait(g, [[c + 24, fy], [c + 36, fy + 6], [c + 32, fy + 22], [c + 26, fy + 24], [c + 20, fy + 38], [x2, fy + creux]], t.passepoil, .9);
  }
}

/* ===========================================================================
   Le bas : pantalon, ou culotte d'uniforme et bottes, harnais des cuisses
   ========================================================================= */
function dessinerBas(g, t) {
  const T = FACES.torse;
  for (const k of Object.keys(T)) drap(g, T[k], t.pantalon);
  const [dx, dy, dl, dh] = T.D;
  g.fillStyle = t.harnais || "#141414"; g.fillRect(dx, dy + dh / 2 - 5, dl, 10);

  for (const cote of ["droit", "gauche"]) {
    const J = FACES[cote];
    const exterieur = cote === "droit" ? "R" : "L";
    const interieur = cote === "droit" ? "L" : "R";
    for (const k of ["U", "L", "B", "R", "F"]) drap(g, J[k], t.pantalon, { ombreBas: .18 });
    for (const k of ["L", "B", "R", "F"]) {
      const [x, y, l, h] = J[k];
      // Le modelé : l'intérieur de la jambe dans l'ombre, l'entrejambe.
      if (k === interieur) { g.fillStyle = "rgba(0,0,0,.1)"; g.fillRect(x, y, l, h); }
      if (k === "F" || k === "B") modele(g, J[k], [[x, y], [x + l, y], [x + l, y + 10], [x, y + 16]], .12, 5);
      if (t.bottes) {
        // La jupe de cuir sur la hanche : sur les côtés et derrière.
        if (k !== "F") {
          const fin = y + (k === "B" ? 30 : 24);
          const d = g.createLinearGradient(0, y, 0, fin);
          d.addColorStop(0, teinte(t.jupe, 1.1)); d.addColorStop(1, teinte(t.jupe, .78));
          forme(g, [[x, y], [x + l, y], [x + l, fin - 3], [x + l / 2, fin], [x, fin - 3]], d);
          couture(g, [[x + 3, fin - 7], [x + l / 2, fin - 4], [x + l - 3, fin - 7]], "rgba(255,255,255,.2)");
          modele(g, J[k], [[x, fin - 2], [x + l, fin - 2], [x + l, fin + 5], [x, fin + 5]], .2, 3);
        }
        // Les sangles : l'une tourne en biais autour de la cuisse, l'autre
        // serre au-dessus du genou ; une lanière descend sur l'extérieur.
        const sangle = (pts, larg = 3.4) => {
          trait(g, pts, t.harnais, larg);
          trait(g, pts.map(([a, b]) => [a, b - larg / 3]), "rgba(255,255,255,.1)", .7);
        };
        // Elle monte de l'extérieur (bas) vers l'intérieur (haut), en miroir
        // d'une jambe à l'autre ; les faces se raccordent bord à bord.
        const ext = y + 32, int = y + 14;
        const gaucheExt = (k === "F") === (cote === "droit");   // le bord gauche de la face touche-t-il l'extérieur ?
        if (k === "F" || k === "B") sangle([[x, gaucheExt ? ext : int], [x + l, gaucheExt ? int : ext]]);
        else sangle([[x, k === exterieur ? ext : int], [x + l, k === exterieur ? ext : int]]);
        sangle([[x, y + 50], [x + l, y + 50]], 3);
        if (k === exterieur) {
          sangle([[x + l / 2, y + 20], [x + l / 2, y + 50]], 4);
          g.strokeStyle = "#b7a06a"; g.lineWidth = 1; g.strokeRect(x + l / 2 - 4, y + 28, 8, 8);
        }
        pli(g, [[x + 16, y + 42], [x + 30, y + 46]], .5);
        // La botte de cuir, haute, jusque sous le genou.
        const haut = y + 58;
        const d = g.createLinearGradient(0, haut, 0, y + h);
        d.addColorStop(0, teinte(t.bottes, 1.35)); d.addColorStop(.35, t.bottes); d.addColorStop(1, teinte(t.bottes, .7));
        g.fillStyle = d; g.fillRect(x, haut, l, y + h - haut);
        g.fillStyle = teinte(t.bottes, 1.5); g.fillRect(x, haut, l, 4);                // le revers de la botte
        g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(x + 8, haut + 8, 3, h - 80);   // le reflet du cuir
        g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(x, y + h - 5, l, 5);                 // la semelle
      } else {
        // Le pli repassé, les cassures au bas, l'ourlet, la chaussure.
        if (k === "F" || k === "B") {
          trait(g, [[x + l / 2, y + 4], [x + l / 2, y + h - 24]], "rgba(255,255,255,.11)", 1.3);
          trait(g, [[x + l / 2 + 1.2, y + 4], [x + l / 2 + 1.2, y + h - 24]], "rgba(0,0,0,.14)", 1);
        }
        if (k === "F") modele(g, J[k], [[x + 12, y + 56], [x + l - 12, y + 56], [x + l - 16, y + 66], [x + 16, y + 66]], .08, 4);
        pli(g, [[x + 14, y + 90], [x + 32, y + 96], [x + 48, y + 92]], .5);
        g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(x, y + h - 24, l, 3);
        const d = g.createLinearGradient(0, y + h - 21, 0, y + h);
        d.addColorStop(0, teinte(t.chaussures, 1.4)); d.addColorStop(1, teinte(t.chaussures, .75));
        g.fillStyle = d; g.fillRect(x, y + h - 21, l, 21);
        g.fillStyle = "rgba(255,255,255,.14)"; g.fillRect(x + 10, y + h - 17, l - 20, 2);
        g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(x, y + h - 4, l, 4);
        if (k === "F") trait(g, [[x + 22, y + h - 14], [x + 42, y + h - 14]], "rgba(0,0,0,.35)", 1);
      }
      if (k === exterieur && !t.bottes && !t.bande) couture(g, [[x + l / 2, y + 4], [x + l / 2, y + h - 24]]);
      // La bande d'or, sur la couture extérieure (cérémonie).
      if (t.bande && k === exterieur) {
        g.fillStyle = t.bande; g.fillRect(x + l / 2 - 2.5, y + 2, 5, h - 26);
        g.fillStyle = "rgba(255,255,255,.2)"; g.fillRect(x + l / 2 - 2.5, y + 2, 1, h - 26);
      }
      // Les pans du manteau long, qui tombent jusqu'aux genoux.
      if (t.manteau) {
        const interieurADroite = (k === "F") === (cote === "droit");   // le bord droit de la face est-il côté entrejambe ?
        const ouvert = k === "F" && t.ouverte;
        const x0 = ouvert && !interieurADroite ? x + l * .58 : x;
        const l0 = ouvert ? l * .42 : l;
        const fin = y + 74;
        drap(g, [x0, y, l0, fin - y], t.veste, { ombreBas: .22, bords: false, chevron: t.chevron });
        g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(x0, fin - 2, l0, 2);
        modele(g, J[k], [[x0, fin], [x0 + l0, fin], [x0 + l0, fin + 6], [x0, fin + 6]], .22, 3);
        if (k === "F" || k === "B") {
          const bord = ouvert ? (interieurADroite ? x0 + l0 : x0) : (interieurADroite ? x + l - 1 : x + 1);
          trait(g, [[bord, y], [bord, fin]], "rgba(0,0,0,.45)", 1.3);
        }
        pli(g, [[x0 + l0 * .4, y + 20], [x0 + l0 * .45, fin - 4]], .6);
      }
    }
    const [x, y, l, h] = J.D;
    g.fillStyle = "#0b0b0b"; g.fillRect(x, y, l, h);
  }
}

/**
 * Les deux images d'une tenue, prêtes à être plaquées : des toiles au
 * gabarit de Roblox (au double de la résolution).
 * @returns {{ chemise: HTMLCanvasElement, pantalon: HTMLCanvasElement }}
 */
const cache = new Map();
export function toilesTenue(nom) {
  if (cache.has(nom)) return cache.get(nom);
  if (TENUES_IMAGES[nom]) {
    const x = toilesImage(TENUES_IMAGES[nom]);
    cache.set(nom, x);
    return x;
  }
  const t = TENUES[nom] || TENUES["croise-noir"];
  const toile = (dessin) => {
    const c = document.createElement("canvas");
    c.width = GABARIT.l * ECHELLE; c.height = GABARIT.h * ECHELLE;
    const g = c.getContext("2d");
    g.scale(ECHELLE, ECHELLE);
    dessin(g, t);
    return c;
  };
  const x = { chemise: toile(dessinerHaut), pantalon: toile(dessinerBas) };
  cache.set(nom, x);
  return x;
}

/* Une tenue fournie en images : les gabarits, recopiés au double, puis
   l'insigne cousu à sa place. Les toiles existent tout de suite (vides) ;
   « pret » dit quand elles sont peintes. */
function chargerImage(chemin) {
  const nom = chemin.split("/").pop().replace(/\.png$/, "");
  const source = globalThis.__OJM_OBJETS__?.["tenue:" + nom] || chemin;
  return new Promise((ok, ko) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ko(new Error(`tenue introuvable : ${chemin}`));
    img.src = source;
  });
}
function toilesImage(t) {
  const toile = () => {
    const c = document.createElement("canvas");
    c.width = GABARIT.l * ECHELLE; c.height = GABARIT.h * ECHELLE;
    return c;
  };
  const chemise = toile(), pantalon = toile();
  const peindre = async (c, chemin, insignes) => {
    const img = await chargerImage(chemin);
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, c.width, c.height);
    if (!insignes) return;
    g.save(); g.scale(ECHELLE, ECHELLE);
    for (const [x, y, taille] of INSIGNES_VESTE) dessinerInsigne(g, t.insigne, x, y, taille);
    g.restore();
  };
  const pret = Promise.all([
    peindre(chemise, t.images.chemise, Boolean(t.insigne)),
    peindre(pantalon, t.images.pantalon, false)
  ]).catch((err) => console.warn("[tenues]", err.message));
  return { chemise, pantalon, pret };
}

/** La cape, dessinée : le drap et l'insigne dans le dos. */
export function toileCape(nom) {
  const t = ficheTenue(nom);
  if (!t?.cape) return null;
  const c = document.createElement("canvas");
  c.width = 256; c.height = 320;
  const g = c.getContext("2d");
  drap(g, [0, 0, 256, 320], t.cape, { ombreBas: .25 });
  for (let x = 20; x < 256; x += 36) pli(g, [[x, 40], [x + 6, 320]], 1.2);
  g.fillStyle = teinte(t.cape, .75); g.fillRect(0, 0, 256, 26);                   // la capuche roulée
  dessinerInsigne(g, t.insigne, 128, 120, 3.6);
  return c;
}
