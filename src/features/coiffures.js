/* ---------------------------------------------------------------------------
 * Les coiffures.
 *
 * Des coupes, pas des bonnets : une chevelure qui épouse le crâne jusqu'à sa
 * ligne d'implantation (front, tempes, nuque), une frange, du volume là où il en faut — et un
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
  { cle: "chignon", libelle: "Chignon" },
  { cle: "rase", libelle: "Rasée" },
  { cle: "chignon-haut", libelle: "Petit chignon" },
  { cle: "tresse", libelle: "Tresse" },
  { cle: "epis", libelle: "Épis texturés" }
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

  /* La chevelure : une coque qui épouse le crâne (même profil que la tête,
     un peu plus large) et s'arrête sur une ligne d'implantation — le front,
     les tempes, la nuque — propre à chaque coupe. Rien ne perce, rien ne
     flotte, et de dos on voit enfin des cheveux, pas un bonnet.
       F, S, N : hauteur de la ligne au front, sur les côtés, à la nuque
       e : épaisseur ; dessus : volume sur le haut ; evase : ce qui s'écarte
       en descendant (carré, cheveux longs) ; dents : bord effilé */
  const chevelure = ({ F = 0.97, S = 0.6, N = 0.32, e = 0.035, dessus = 0.06, evase = 0, dents = 0.025, tempe = 0.12 } = {}) => {
    const R = 0.62 + e, C = 0.2 + e, HAUT = 1.22 + e, EPAULE = 1.02;
    const colonnes = 96, rangs = [];
    const bonus = (rho) => dessus * Math.max(0, 1 - (rho / R) ** 2);
    // Le profil, du sommet vers le bas : le plat, l'arrondi, puis la chute.
    for (const rho of [0, 0.14, 0.28, 0.42]) rangs.push({ rho, y: HAUT, chute: 0 });
    for (let i = 1; i <= 6; i++) {
      const a = Math.PI / 2 - (i / 6) * (Math.PI / 2);
      rangs.push({ rho: 0.42 + Math.cos(a) * C, y: EPAULE + Math.sin(a) * C, chute: 0 });
    }
    const CHUTE = 8;
    for (let i = 1; i <= CHUTE; i++) rangs.push({ rho: R, y: null, chute: i / CHUTE });
    const ligne = (theta) => {
      const f = Math.cos(theta - DEVANT);                 // 1 au front, -1 à la nuque
      // Aux tempes, la ligne remonte un peu avant de redescendre en pattes.
      const ecart = Math.acos(Math.max(-1, Math.min(1, f)));
      const h = Math.max(0, f) ** 2 * F + Math.max(0, -f) ** 2 * N + (1 - f * f) * S
        + tempe * Math.exp(-(((ecart - 0.8) / 0.28) ** 2));
      const dent = dents * Math.abs(((theta * 16 / Math.PI) % 2) - 1);   // un bord effilé, en pointes
      return Math.min(EPAULE - 0.02, h + dent);
    };
    const pos = [], uv = [], index = [];
    for (let c = 0; c <= colonnes; c++) {
      const theta = (c / colonnes) * Math.PI * 2;
      const bas = ligne(theta);
      rangs.forEach((r, k) => {
        const y = r.y ?? EPAULE + (bas - EPAULE) * r.chute;
        const descente = Math.max(0, EPAULE - y);
        const rho = r.rho + evase * Math.min(1, descente / 1.1) ** 1.2;
        pos.push(Math.sin(theta) * rho, y + bonus(r.rho), Math.cos(theta) * rho);
        uv.push(c / colonnes * 3, 1 - k / (rangs.length - 1));
      });
    }
    const n = rangs.length;
    for (let c = 0; c < colonnes; c++) for (let k = 0; k < n - 1; k++) {
      const a = c * n + k, b = (c + 1) * n + k;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
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
      // Très courte, nette sur les côtés et la nuque, une petite frange en pointes.
      chevelure({ F: 0.99, S: 0.66, N: 0.4, e: 0.025, dessus: 0.05 });
      frange(0.98, 1.5, 6, { rayon: 0.655, varier: 0.03, evase: 0.01, haut: 1.2 });
      break;

    case "undercut":
      // Les côtés rasés au plus près, le dessus long, séparé au milieu, qui
      // retombe en rideau de part et d'autre du front.
      chevelure({ F: 1.0, S: 0.64, N: 0.36, e: 0.012, dessus: 0, dents: 0.01 });
      volume(0, 1.25, -0.02, 0.72, 0.27, 0.76, 0.1);
      frange(0.84, 0.95, 3, { centre: -0.52, varier: 0.06 });
      frange(0.84, 0.95, 3, { centre: 0.52, varier: 0.06 });
      break;

    case "meche":
      // Une mèche relevée sur le devant, les côtés courts.
      chevelure({ F: 0.99, S: 0.62, N: 0.34, e: 0.03, dessus: 0.08 });
      volume(-0.04, 1.32, -0.3, 0.6, 0.3, 0.46, -0.4, 0.15);
      volume(0.2, 1.35, -0.02, 0.44, 0.22, 0.56, -0.1, -0.2);
      break;

    case "mi-long":
      // Jusqu'à la mâchoire, en bataille : des pointes partout.
      chevelure({ F: 0.9, S: 0.3, N: 0.16, e: 0.05, dessus: 0.1, evase: 0.06, dents: 0.09, tempe: 0.04 });
      frange(0.84, 1.95, 7, { varier: 0.09, rayon: 0.68 });
      for (const s of [-1, 1]) for (const [d, b] of [[1.15, 0.24], [1.45, 0.18], [1.8, 0.2], [2.2, 0.16], [2.6, 0.18]]) {
        meche(DEVANT + s * d, 0.42, 1.0, b, { rayon: 0.7, evase: 0.07 });
      }
      break;

    case "carre":
      // Au carré, à hauteur du menton, une frange droite, bien nette.
      chevelure({ F: 0.95, S: 0.2, N: 0.18, e: 0.05, dessus: 0.08, evase: 0.12, dents: 0.008, tempe: 0 });
      frange(0.95, 1.74, 9, { varier: 0.012, rayon: 0.675, evase: 0.01 });
      break;

    case "long":
      // Longue, lisse, raie au milieu : elle tombe dans le dos et sur les épaules.
      chevelure({ F: 0.97, S: 0.02, N: -0.75, e: 0.05, dessus: 0.07, evase: 0.2, dents: 0.03, tempe: 0 });
      for (const s of [-1, 1]) meche(DEVANT + s * 0.45, 0.62, 1.2, 0.72, { rayon: 0.68, evase: 0.06 });
      break;

    case "queue":
      // Tirés en arrière, une queue de cheval haute qui tombe dans le dos.
      chevelure({ F: 0.99, S: 0.62, N: 0.42, e: 0.022, dessus: 0.04, dents: 0.01 });
      {
        const lien = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 8, 18), mat);
        lien.position.set(0, 1.1, 0.7);
        lien.rotation.x = 1.2;
        g.add(lien);
      }
      volume(0, 0.95, 0.84, 0.21, 0.27, 0.18, 0.3);
      volume(0, 0.6, 0.9, 0.18, 0.27, 0.16, 0.1);
      volume(0, 0.28, 0.88, 0.13, 0.24, 0.12, -0.1);
      frange(0.96, 1.0, 4, { centre: -0.3, varier: 0.06, rayon: 0.66 });
      break;

    case "chignon":
      // Relevés en chignon, deux mèches libres qui encadrent le visage.
      chevelure({ F: 0.99, S: 0.64, N: 0.46, e: 0.022, dessus: 0.04, dents: 0.01 });
      volume(0, 1.2, 0.62, 0.33, 0.31, 0.29);
      {
        const tour2 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.07, 8, 20), mat);
        tour2.position.set(0, 1.13, 0.56);
        tour2.rotation.x = 1.3;
        g.add(tour2);
      }
      frange(1.0, 1.2, 5, { varier: 0.05, rayon: 0.66 });
      for (const s of [-1, 1]) meche(DEVANT + s * 0.98, 0.3, 1.05, 0.3, { rayon: 0.665 });
      break;

    case "rase":
      // Rasée de près : une ombre de cheveux, nette, qui suit le crâne.
      chevelure({ F: 1.0, S: 0.66, N: 0.4, e: 0.008, dessus: 0, dents: 0 });
      break;

    case "chignon-haut":
      // Les cheveux mi-longs relevés en petit chignon sur l'arrière du crâne,
      // les côtés dégagés, deux mèches qui s'échappent devant.
      chevelure({ F: 0.97, S: 0.58, N: 0.36, e: 0.03, dessus: 0.05, dents: 0.02 });
      volume(0, 1.3, 0.34, 0.26, 0.22, 0.24);
      {
        const lien = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 18), mat);
        lien.position.set(0, 1.24, 0.34);
        lien.rotation.x = 0.4;
        g.add(lien);
      }
      for (const s of [-1, 1]) meche(DEVANT + s * 0.7, 0.3, 1.12, 0.62, { rayon: 0.665, evase: 0.03 });
      break;

    case "tresse":
      // Une tresse unique, qui part de la nuque et descend dans le dos.
      chevelure({ F: 0.98, S: 0.52, N: 0.4, e: 0.028, dessus: 0.05, dents: 0.01 });
      for (let i = 0; i < 6; i++) {
        const cote = i % 2 ? 1 : -1;
        volume(cote * 0.05, 0.42 - i * 0.2, 0.74 + i * 0.012, 0.15 - i * 0.008, 0.13, 0.12, 0, 0, cote * 0.5);
      }
      frange(0.97, 1.3, 5, { centre: 0.2, varier: 0.04, rayon: 0.66 });
      break;

    case "epis":
      // Courte et texturée, des épis qui partent dans tous les sens.
      chevelure({ F: 0.97, S: 0.6, N: 0.34, e: 0.035, dessus: 0.08, dents: 0.05 });
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2, r = i % 2 ? 0.28 : 0.45;
        const epi = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 6), mat);
        epi.position.set(Math.sin(a) * r, 1.28 + (i % 3) * 0.02, Math.cos(a) * r);
        epi.rotation.set(Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
        g.add(epi);
      }
      frange(0.93, 1.5, 6, { varier: 0.06, rayon: 0.68 });
      break;

    case "raie":
    default:
      // La coupe classique : raie sur le côté, le dessus peigné, une mèche
      // balayée vers la tempe.
      chevelure({ F: 0.97, S: 0.6, N: 0.32, e: 0.035, dessus: 0.08 });
      volume(-0.14, 1.28, -0.2, 0.6, 0.24, 0.58, -0.1, 0.35, 0.08);
      volume(0.3, 1.24, -0.04, 0.44, 0.2, 0.58, 0, -0.2, -0.12);
      frange(1.0, 1.3, 5, { centre: 0.32, varier: 0.05, rayon: 0.665 });
      break;
  }
  return fusionner(THREE, g, mat);
}

/* Toute la coupe en un seul maillage : une trentaine d'élèves, c'est une
   trentaine de dessins pour les cheveux au lieu de plusieurs centaines. */
function fusionner(THREE, g, mat) {
  g.updateMatrixWorld(true);
  const pos = [], nor = [], uv = [], index = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  let base = 0;
  g.traverse((m) => {
    if (!m.isMesh) return;
    const geo = m.geometry;
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    nm.getNormalMatrix(m.matrixWorld);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
      pos.push(v.x, v.y, v.z);
      if (N) { n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(n.x, n.y, n.z); }
      else nor.push(0, 1, 0);
      uv.push(U ? U.getX(i) : 0, U ? U.getY(i) : 0);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) index.push(base + geo.index.getX(i));
    else for (let i = 0; i < P.count; i++) index.push(base + i);
    base += P.count;
    geo.dispose();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  const coupe = new THREE.Mesh(geo, mat);
  coupe.userData.jetable = true;          // à défaire quand le personnage s'en va
  const groupe = new THREE.Group();
  groupe.add(coupe);
  return groupe;
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
