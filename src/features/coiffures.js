/* ---------------------------------------------------------------------------
 * Les coiffures.
 *
 * Des coupes, pas des bonnets : une calotte ajustée au crâne, les côtés
 * coupés à la bonne hauteur, une frange, du volume là où il en faut — et un
 * fil de cheveux dessiné dans la matière, pour que la lumière y accroche.
 *
 * La tête (voir classe-3d.js) est un cylindre aux bords adoucis : centre à
 * 0,62, sommet à 1,22, rayon 0,62. Le devant regarde vers -z.
 * ------------------------------------------------------------------------- */

export const COIFFURES = [
  { cle: "raie", libelle: "Raie sur le côté" },
  { cle: "degrade", libelle: "Courte, dégradée" },
  { cle: "undercut", libelle: "Undercut" },
  { cle: "meche", libelle: "Mèche relevée" },
  { cle: "mi-long", libelle: "Mi-longue en bataille" },
  { cle: "carre", libelle: "Carré" },
  { cle: "long", libelle: "Longue" },
  { cle: "queue", libelle: "Queue de cheval" },
  { cle: "chignon", libelle: "Chignon" }
];

export const COULEURS_CHEVEUX = [
  { cle: "#15110f", libelle: "Noir" },
  { cle: "#2f2018", libelle: "Brun foncé" },
  { cle: "#5a3a22", libelle: "Châtain" },
  { cle: "#7a3a1e", libelle: "Auburn" },
  { cle: "#a4481f", libelle: "Roux" },
  { cle: "#b9a27a", libelle: "Blond cendré" },
  { cle: "#d2a85a", libelle: "Blond doré" },
  { cle: "#8d8f93", libelle: "Gris" },
  { cle: "#e6e1d8", libelle: "Blanc" }
];

export const TEINTS = [
  { cle: "#f5d6bd", libelle: "Très clair" },
  { cle: "#eac29f", libelle: "Clair" },
  { cle: "#d9a77c", libelle: "Mat" },
  { cle: "#b77e57", libelle: "Hâlé" },
  { cle: "#8d5a3b", libelle: "Brun" },
  { cle: "#5e3a26", libelle: "Foncé" },
  { cle: "#f5cd30", libelle: "Classique" }
];

/**
 * Construire une coupe.
 * @param THREE  la bibliothèque (chargée par classe-3d.js)
 * @param {string} style
 * @param {object} mat  la matière des cheveux (partagée)
 * @returns {THREE.Group}
 */
export function construireCoiffure(THREE, style, mat) {
  const g = new THREE.Group();
  const DEVANT = Math.PI;                         // l'angle du front, pour les cylindres

  // La calotte : un dôme ajusté, le devant un peu relevé (la ligne du front).
  const calotte = (hauteur = 0.58, rayon = 0.71, releve = 0.1) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(rayon, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    m.scale.set(1, hauteur, 1);
    m.position.y = 0.95;
    m.rotation.x = releve;
    g.add(m);
    return m;
  };
  // Les côtés et la nuque : une coque ouverte sur le visage, qui remonte
  // sous la calotte pour qu'aucun jour ne se voie.
  const tour = (bas, ouverture, { rayonHaut = 0.71, rayonBas = 0.73, haut = 1.12 } = {}) => {
    const h = haut - bas;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rayonHaut, rayonBas, h, 48, 1, true,
      DEVANT + ouverture / 2, Math.PI * 2 - ouverture), mat);
    m.position.y = bas + h / 2;
    g.add(m);
    return m;
  };
  // Une mèche : un pan courbe qui suit la tête et se termine en pointe.
  const meche = (angle, largeur, haut, bas, { rayon = 0.725, pointe = 0.9, evase = 0.04 } = {}) => {
    const h = haut - bas;
    const geo = new THREE.CylinderGeometry(rayon, rayon + evase, h, 6, 2, true, angle - largeur / 2, largeur);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (h / 2 - y) / h;                 // 0 en haut, 1 à la pointe
      if (t <= 0) continue;
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const a = Math.atan2(x, z);
      const ecart = ((angle - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const a2 = a + ecart * pointe * t * t;     // on resserre vers la pointe
      pos.setXYZ(i, Math.sin(a2) * r, y, Math.cos(a2) * r);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.position.y = bas + h / 2;
    g.add(m);
    return m;
  };
  // Une frange : des mèches qui se chevauchent, de longueurs inégales.
  const frange = (bas, largeur, n, { centre = 0, haut = 1.17, varier = 0.07, rayon = 0.725, evase = 0.04 } = {}) => {
    const pas = largeur / n;
    for (let i = 0; i < n; i++) {
      const a = DEVANT + centre - largeur / 2 + pas * (i + 0.5);
      const b = bas + (((i * 37) % 5) / 4 - 0.5) * varier * 2;
      meche(a, pas * 1.55, haut, b, { rayon: rayon + (i % 2) * 0.006, evase });
    }
  };
  // Un volume : une ellipse.
  const volume = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };

  switch (style) {
    case "degrade":
      // Très courte, nette sur les côtés, une petite frange en pointes.
      calotte(0.46, 0.68, 0.08);
      tour(0.8, 2.35, { rayonHaut: 0.68, rayonBas: 0.652, haut: 1.08 });
      frange(1.04, 1.6, 6, { rayon: 0.685, varier: 0.03, evase: 0.01 });
      break;

    case "undercut":
      // Les côtés rasés au plus près, le dessus long, séparé au milieu, qui
      // retombe en rideau de part et d'autre du front.
      tour(0.76, 2.3, { rayonHaut: 0.648, rayonBas: 0.638, haut: 1.06 });
      calotte(0.34, 0.665, 0.05);
      volume(0, 1.25, -0.02, 0.73, 0.27, 0.77, 0.1);
      frange(0.84, 0.95, 3, { centre: -0.52, varier: 0.06 });
      frange(0.84, 0.95, 3, { centre: 0.52, varier: 0.06 });
      break;

    case "meche":
      // Une mèche relevée sur le devant, les côtés courts.
      calotte(0.52, 0.7, 0.14);
      tour(0.76, 2.2, { rayonHaut: 0.7, rayonBas: 0.7 });
      volume(-0.04, 1.32, -0.3, 0.6, 0.3, 0.46, -0.4, 0.15);
      volume(0.2, 1.35, -0.02, 0.44, 0.22, 0.56, -0.1, -0.2);
      break;

    case "mi-long":
      // Jusqu'à la mâchoire, en bataille : des pointes partout.
      calotte(0.62, 0.73, 0.08);
      tour(0.5, 1.9, { rayonHaut: 0.73, rayonBas: 0.75 });
      frange(0.84, 1.95, 7, { varier: 0.09 });
      for (const s of [-1, 1]) for (const [d, b] of [[1.15, 0.24], [1.45, 0.18], [1.8, 0.26], [2.2, 0.3], [2.6, 0.24]]) {
        meche(DEVANT + s * d, 0.42, 1.0, b, { rayon: 0.74, evase: 0.05 });
      }
      break;

    case "carre":
      // Au carré, à hauteur du menton, une frange droite, bien nette.
      calotte(0.6, 0.73, 0.08);
      tour(0.16, 1.72, { rayonHaut: 0.73, rayonBas: 0.8 });
      frange(0.97, 1.74, 9, { varier: 0.012, rayon: 0.735, evase: 0.01 });
      break;

    case "long":
      // Longue, lisse, raie au milieu, qui tombe dans le dos et sur les épaules.
      calotte(0.6, 0.73, 0.08);
      tour(-0.6, 1.8, { rayonHaut: 0.73, rayonBas: 0.85 });
      volume(0, 0.25, 0.68, 0.66, 1.0, 0.22);
      for (const s of [-1, 1]) {
        meche(DEVANT + s * 0.45, 0.62, 1.17, 0.7, { evase: 0.06 });
        meche(DEVANT + s * 0.95, 0.55, 1.1, -0.35, { rayon: 0.74, evase: 0.12 });
      }
      break;

    case "queue":
      // Tirés en arrière, une queue de cheval haute qui tombe dans le dos.
      calotte(0.54, 0.7, 0.06);
      tour(0.62, 2.1, { rayonHaut: 0.7, rayonBas: 0.7 });
      {
        const lien = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 8, 18), mat);
        lien.position.set(0, 1.1, 0.74);
        lien.rotation.x = 1.2;
        g.add(lien);
      }
      volume(0, 0.95, 0.88, 0.21, 0.27, 0.18, 0.3);
      volume(0, 0.6, 0.94, 0.18, 0.27, 0.16, 0.1);
      volume(0, 0.28, 0.92, 0.13, 0.24, 0.12, -0.1);
      frange(0.96, 1.0, 4, { centre: -0.3, varier: 0.06 });
      break;

    case "chignon":
      // Relevés en chignon, deux mèches libres qui encadrent le visage.
      calotte(0.54, 0.7, 0.06);
      tour(0.66, 2.1, { rayonHaut: 0.7, rayonBas: 0.7 });
      volume(0, 1.2, 0.66, 0.33, 0.31, 0.29);
      {
        const tour2 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 8, 20), mat);
        tour2.position.set(0, 1.13, 0.6);
        tour2.rotation.x = 1.3;
        g.add(tour2);
      }
      frange(1.0, 1.2, 5, { varier: 0.05 });
      for (const s of [-1, 1]) meche(DEVANT + s * 0.98, 0.3, 1.05, 0.3, { rayon: 0.71 });
      break;

    case "raie":
    default:
      // La coupe classique : raie sur le côté, le dessus peigné, une mèche
      // balayée vers la tempe.
      calotte(0.56, 0.71, 0.12);
      tour(0.72, 2.1, { rayonHaut: 0.71, rayonBas: 0.71 });
      volume(-0.14, 1.28, -0.2, 0.6, 0.24, 0.58, -0.1, 0.35, 0.08);
      volume(0.3, 1.24, -0.04, 0.44, 0.2, 0.58, 0, -0.2, -0.12);
      frange(1.0, 1.3, 5, { centre: 0.32, varier: 0.05 });
      break;
  }
  return g;
}

/** Le fil des cheveux : des stries fines, qui donnent le brillant. */
export function toileCheveux() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#b8b8b8"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 128;
    g.strokeStyle = Math.random() > .5 ? `rgba(255,255,255,${Math.random() * .5})` : `rgba(0,0,0,${Math.random() * .45})`;
    g.lineWidth = .5 + Math.random();
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 4, 40, x - 4, 90, x + 2, 128); g.stroke();
  }
  return c;
}
