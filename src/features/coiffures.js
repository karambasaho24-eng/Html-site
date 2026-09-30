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

/* --- Le crâne ---------------------------------------------------------------
   La tête (voir classe-3d.js) : un cylindre de rayon 0,62, sommet plat à
   1,22, bords arrondis (rayon 0,2). On la décrit par une abscisse `s` qui
   part du sommet, passe l'arrondi et descend le long du côté. */
const R0 = 0.62, RC = 0.2, YTOP = 1.22, YARC = 1.02, PLAT = R0 - RC;
const SARC = PLAT + (Math.PI / 2) * RC;
const DEVANT = Math.PI;                             // le front regarde vers -z

function pointProfil(s) {
  if (s <= PLAT) return { rho: s, y: YTOP, nr: 0, ny: 1 };
  if (s <= SARC) {
    const a = (s - PLAT) / RC;
    return { rho: PLAT + RC * Math.sin(a), y: YARC + RC * Math.cos(a), nr: Math.sin(a), ny: Math.cos(a) };
  }
  return { rho: R0, y: YARC - (s - SARC), nr: 1, ny: 0 };
}
/** L'abscisse où le profil passe à la hauteur h. */
function sDeHauteur(h) {
  if (h >= YARC) return PLAT + RC * Math.acos(Math.min(1, (h - YARC) / RC));
  return SARC + (YARC - h);
}
const lisse = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Entre des repères [x, y], en douceur (tangentes plates à chaque repère). */
function interpoler(cles, x) {
  if (x <= cles[0][0]) return cles[0][1];
  for (let i = 0; i < cles.length - 1; i++) {
    const [x0, y0] = cles[i], [x1, y1] = cles[i + 1];
    if (x <= x1) return y0 + (y1 - y0) * lisse(x0, x1, x);
  }
  return cles[cles.length - 1][1];
}
/** L'écart au front : 0 au milieu du front, π à la nuque. */
const ecartDuFront = (theta) => Math.abs(((theta - DEVANT + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);

/**
 * Construire une coupe.
 * @param THREE  la bibliothèque (chargée par classe-3d.js)
 * @param {string} style
 * @param {object} mat  la matière des cheveux (partagée)
 * @returns {THREE.Group}
 */
export function construireCoiffure(THREE, style, mat) {
  const g = new THREE.Group();
  const v = new THREE.Vector3();

  /* La chevelure : une masse pleine (dessus, dessous, et la tranche) posée
     sur le crâne. Sa limite — le front, les tempes, les pattes, la nuque —
     est donnée par des repères, d'avant en arrière ; son épaisseur varie :
     du volume sur le dessus, une raie, une mèche relevée, des côtés courts.
       lignes : [[écart au front, hauteur], …] (0 = front, π = nuque)
       e : épaisseur de base ; dessus : dôme ; devant : mèche relevée ;
       cotes : épaisseur des côtés (1 = comme le dessus) ; evase : ce qui
       s'écarte en tombant ; ondule : { k, amp } les pointes arrondies ;
       raie : { x, amp } ; asym : frange balayée d'un côté ; bord : finesse
       de la tranche. */
  const coque = ({
    lignes, e = 0.04, dessus = 0.06, devant = 0, cotes = 1, evase = 0, ondule = null,
    raie = null, asym = 0, bord = 0.55, arriere = 0, colonnes = 128, rangs = 26
  }) => {
    const hauteur = (theta) => {
      const ec = ecartDuFront(theta);
      let h = interpoler(lignes, ec);
      if (asym) h += asym * Math.sin(theta) * (1 - lisse(0.25, 1.05, ec));
      if (ondule) h += ondule.amp * Math.abs(Math.sin(theta * ondule.k / 2)) ** 1.5 * (ondule.devant ? 1 - lisse(0.5, 1.1, ec) : 1);
      return h;
    };
    const epaisseur = (s, sFin, x, y, z) => {
      const haut = 1 - lisse(0, SARC + 0.05, s);          // 1 au sommet, 0 sur le côté
      let t = e + dessus * haut;
      // La mèche relevée : sur le devant du dessus.
      if (devant) t += devant * lisse(-0.05, -0.5, z) * Math.exp(-(((y - 1.18) / 0.22) ** 2));
      // Du volume à l'arrière du crâne (cheveux longs, chignon bas).
      if (arriere) t += arriere * lisse(0.1, 0.55, z) * lisse(0.2, 0.9, y) * (1 - lisse(0.9, 1.25, y));
      // La raie : un sillon, et les cheveux rabattus du côté le plus fourni.
      if (raie) {
        const d = x - raie.x;
        const devantTete = lisse(0.45, -0.1, z);
        t *= 1 - devantTete * 0.65 * (1 - lisse(0, 0.08, Math.abs(d)));
        t += raie.amp * haut * lisse(0, 0.4, -d * (raie.cote || 1));
      }
      // Les côtés courts (dégradé, undercut).
      if (cotes !== 1) t *= cotes + (1 - cotes) * lisse(0.88, 1.12, y);
      // La tranche, un peu plus fine : un bord net, pas une marche.
      return t * (bord + (1 - bord) * lisse(0, 0.14, sFin - s));
    };
    const ext = [], int = [], uvs = [];
    const fins = [];
    for (let c = 0; c <= colonnes; c++) {
      const theta = (c / colonnes) * Math.PI * 2;
      const sFin = sDeHauteur(hauteur(theta));
      fins.push(sFin);
      const sn = Math.sin(theta), cs = Math.cos(theta);
      for (let k = 0; k <= rangs; k++) {
        const s = (k / rangs) * sFin;
        const p = pointProfil(s);
        const x = sn * p.rho, z = cs * p.rho;
        const ecarte = evase * lisse(0.85, -1.4, p.y);
        const t = epaisseur(s, sFin, x, p.y, z);
        const ro = p.rho + p.nr * t + ecarte, yo = p.y + p.ny * t;
        const ri = p.rho + p.nr * 0.008 + ecarte * 0.97, yi = p.y + p.ny * 0.008;
        ext.push(sn * ro, yo, cs * ro);
        int.push(sn * ri, yi, cs * ri);
        uvs.push((c / colonnes) * 6, s / 2.4);
      }
    }
    const grille = (pos, inverse) => {
      const idx = [];
      const n = rangs + 1;
      for (let c = 0; c < colonnes; c++) for (let k = 0; k < rangs; k++) {
        const a = c * n + k, b = (c + 1) * n + k;
        if (inverse) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, mat));
    };
    grille(ext, false);
    grille(int, true);
    // La tranche : du dessus au dessous, tout autour.
    const tranche = [], uvt = [], idx = [];
    const n = rangs + 1;
    for (let c = 0; c <= colonnes; c++) {
      const i = (c * n + rangs) * 3;
      tranche.push(ext[i], ext[i + 1], ext[i + 2], int[i], int[i + 1], int[i + 2]);
      uvt.push((c / colonnes) * 6, 1, (c / colonnes) * 6, 0.98);
    }
    for (let c = 0; c < colonnes; c++) {
      const a = c * 2, b = (c + 1) * 2;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(tranche, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvt, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat));
  };

  /* Une mèche, une queue de cheval : un tube qui suit une courbe, plus ou
     moins épais le long du chemin (r(t), t de 0 à 1), le bout arrondi. */
  const tube = (points, r, { seg = 36, rad = 14, bout = true, aplatir = 1 } = {}) => {
    const courbe = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const geo = new THREE.TubeGeometry(courbe, seg, 1, rad, false);
    const pos = geo.attributes.position;
    const c = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      courbe.getPointAt(i / seg, c);
      const f = r(i / seg);
      for (let j = 0; j <= rad; j++) {
        const k = i * (rad + 1) + j;
        v.fromBufferAttribute(pos, k).sub(c);
        v.x *= aplatir;
        v.multiplyScalar(f).add(c);
        pos.setXYZ(k, v.x, v.y, v.z);
      }
    }
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, mat));
    if (bout) {
      const fin = courbe.getPointAt(1);
      const rf = r(1);
      const b = new THREE.Mesh(new THREE.SphereGeometry(rf, 12, 8), mat);
      b.position.copy(fin);
      g.add(b);
    }
    return courbe;
  };
  const boule = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  const lien = (x, y, z, r, rx) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.32, 8, 20), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
  };

  // Les lignes les plus courantes : front, tempes, pattes, côté, nuque.
  const court = (F = 1.02, S = 0.66, N = 0.4) => [[0, F], [0.5, F - 0.03], [0.8, 0.86], [0.98, S - 0.06], [1.2, S], [2.2, S - 0.04], [2.75, N], [Math.PI, N]];

  switch (style) {
    case "degrade":
      // Courte et nette : un peu de longueur dessus, les côtés et la nuque
      // dégradés au plus court.
      coque({ lignes: court(1.03, 0.68, 0.42), e: 0.022, dessus: 0.08, devant: 0.04, cotes: 0.4,
        ondule: { k: 30, amp: 0.012, devant: true } });
      break;

    case "undercut":
      // Les côtés rasés ; le dessus long, rabattu en arrière, qui déborde un peu.
      coque({ lignes: court(1.03, 0.66, 0.4), e: 0.01, dessus: 0, bord: 1 });
      coque({ lignes: [[0, 1.03], [0.7, 1.02], [1.2, 0.98], [Math.PI, 0.9]], e: 0.075, dessus: 0.1, devant: 0.12, bord: 0.85 });
      break;

    case "meche":
      // Une mèche relevée sur le devant, le reste court et net.
      coque({ lignes: court(1.04, 0.66, 0.42), e: 0.028, dessus: 0.08, devant: 0.2, cotes: 0.55 });
      break;

    case "mi-long":
      // Jusqu'à la mâchoire, raie au milieu, les mèches du devant en rideau.
      coque({
        lignes: [[0, 1.05], [0.45, 0.99], [0.82, 0.66], [1.05, 0.3], [1.4, 0.24], [2.4, 0.22], [Math.PI, 0.24]],
        e: 0.05, dessus: 0.08, evase: 0.07, raie: { x: 0, amp: 0.03 }, ondule: { k: 34, amp: 0.035 }
      });
      break;

    case "carre":
      // Au carré, à hauteur du menton, une frange droite, bien nette.
      coque({
        lignes: [[0, 0.8], [0.55, 0.8], [0.82, 0.3], [1.1, 0.2], [Math.PI, 0.22]],
        e: 0.055, dessus: 0.08, evase: 0.1, ondule: { k: 40, amp: 0.012 }
      });
      break;

    case "long":
      // Longue et lisse, raie au milieu : elle tombe sur les épaules et dans le dos.
      coque({
        lignes: [[0, 1.05], [0.28, 0.95], [0.6, 0.5], [0.9, -0.55], [1.4, -0.9], [2.4, -1.05], [Math.PI, -1.1]],
        e: 0.05, dessus: 0.07, evase: 0.2, arriere: 0.05, raie: { x: 0, amp: 0.03 },
        ondule: { k: 26, amp: 0.05 }
      });
      break;

    case "queue":
      // Tirés en arrière, une queue de cheval qui part haut et tombe dans le dos.
      coque({ lignes: court(1.03, 0.62, 0.44), e: 0.028, dessus: 0.05 });
      lien(0, 1.0, 0.7, 0.13, 1.25);
      tube([[0, 1.02, 0.66], [0, 0.98, 0.88], [0, 0.66, 1.0], [0, 0.22, 0.98], [0, -0.32, 0.9]],
        (t) => (0.13 + 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.6))) * (1 - 0.55 * t * t), { aplatir: 1.15 });
      break;

    case "chignon":
      // Relevés en chignon bas sur la nuque, une frange balayée de côté.
      coque({ lignes: [[0, 0.88], [0.5, 0.84], [0.85, 0.66], [1.2, 0.6], [2.3, 0.56], [Math.PI, 0.5]],
        e: 0.03, dessus: 0.05, asym: 0.12, arriere: 0.03, ondule: { k: 22, amp: 0.02, devant: true } });
      boule(0, 0.62, 0.8, 0.3, 0.26, 0.24);
      lien(0, 0.62, 0.6, 0.2, 0.15);
      tube([[0.56, 0.95, -0.28], [0.64, 0.7, -0.3], [0.62, 0.36, -0.26]], (t) => 0.06 * (1 - 0.5 * t), { seg: 16, rad: 8 });
      break;

    case "rase":
      // Rasée de près : une ombre de cheveux, nette, qui suit le crâne.
      coque({ lignes: court(1.03, 0.66, 0.4), e: 0.012, dessus: 0.005, bord: 1 });
      break;

    case "chignon-haut":
      // Mi-longs, relevés en petit chignon sur l'arrière du crâne ; deux
      // mèches s'échappent devant.
      coque({ lignes: court(1.02, 0.6, 0.44), e: 0.03, dessus: 0.06 });
      boule(0, 1.28, 0.36, 0.22, 0.19, 0.2);
      lien(0, 1.2, 0.36, 0.14, 0.35);
      for (const sx of [-1, 1]) {
        tube([[sx * 0.42, 1.16, -0.5], [sx * 0.6, 0.98, -0.48], [sx * 0.66, 0.76, -0.42]], (t) => 0.075 * (1 - 0.45 * t), { seg: 16, rad: 10 });
      }
      break;

    case "tresse": {
      // Une tresse unique, qui part de la nuque et descend dans le dos.
      coque({ lignes: court(1.02, 0.56, 0.42), e: 0.03, dessus: 0.05, ondule: { k: 22, amp: 0.02, devant: true } });
      const courbe = new THREE.CatmullRomCurve3([[0, 0.72, 0.64], [0, 0.4, 0.84], [0, -0.1, 0.9], [0, -0.8, 0.86]]
        .map((p) => new THREE.Vector3(...p)));
      const nb = 14;
      for (let i = 0; i < nb; i++) {
        const t = i / (nb - 1);
        courbe.getPointAt(t, v);
        const cote = i % 2 ? 1 : -1;
        const r = 0.15 * (1 - 0.45 * t);
        boule(v.x + cote * r * 0.35, v.y, v.z, r * 0.85, r * 1.25, r * 0.8, 0, 0, cote * 0.6);
      }
      courbe.getPointAt(1, v);
      lien(v.x, v.y - 0.08, v.z, 0.06, Math.PI / 2);
      tube([[v.x, v.y - 0.1, v.z], [v.x, v.y - 0.25, v.z + 0.02], [v.x, v.y - 0.36, v.z]], (t) => 0.07 * (1 - 0.6 * t) + 0.02, { seg: 8, rad: 8 });
      break;
    }

    case "epis": {
      // Courte, en bataille : des épis épais, rabattus vers l'arrière, et une
      // frange en pointes.
      coque({ lignes: [[0, 0.92], [0.5, 0.9], [0.8, 0.8], [1.0, 0.58], [2.2, 0.54], [Math.PI, 0.36]],
        e: 0.05, dessus: 0.1, ondule: { k: 16, amp: 0.07 } });
      // Chaque épi part du dessus et se couche vers l'arrière et le côté.
      const epis = [[0, 0.05, 0.62], [0.55, 0.25, 0.55], [-0.55, 0.25, 0.55], [1.25, 0.4, 0.5], [-1.25, 0.4, 0.5],
        [2.1, 0.42, 0.46], [-2.1, 0.42, 0.46], [Math.PI, 0.38, 0.5], [0.2, -0.3, 0.5], [-0.25, -0.28, 0.48]];
      for (const [a, r, h] of epis) {
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        const m = new THREE.Mesh(new THREE.ConeGeometry(0.2, h, 8), mat);
        m.geometry.translate(0, h / 2, 0);
        m.position.set(x, 1.24, z + 0.05);
        // Couché vers l'arrière (+z) et un peu vers l'extérieur.
        m.rotation.set(1.05 + Math.cos(a) * 0.15, 0, -Math.sin(a) * 0.55);
        g.add(m);
      }
      break;
    }

    case "raie":
    default:
      // La coupe classique : raie sur le côté, le dessus peigné et rabattu.
      coque({ lignes: court(1.03, 0.66, 0.42), e: 0.035, dessus: 0.09, devant: 0.05,
        raie: { x: 0.24, amp: 0.07 }, cotes: 0.75, ondule: { k: 26, amp: 0.012, devant: true } });
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

/** Le fil des cheveux : des mèches fines, peu contrastées — du brillant, pas du bois. */
export function toileCheveux() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#b4b4b4"; g.fillRect(0, 0, 256, 256);
  // De larges nappes à peine plus claires ou plus sombres : le volume des mèches.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, l = 8 + Math.random() * 18;
    const d = g.createLinearGradient(x - l, 0, x + l, 0);
    const clair = Math.random() > .5;
    d.addColorStop(0, "rgba(0,0,0,0)");
    d.addColorStop(.5, clair ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.10)");
    d.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = d; g.fillRect(x - l, 0, l * 2, 256);
  }
  // Puis les cheveux eux-mêmes : fins, nombreux, presque droits.
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 256;
    g.strokeStyle = Math.random() > .55 ? `rgba(255,255,255,${.04 + Math.random() * .1})` : `rgba(0,0,0,${.04 + Math.random() * .12})`;
    g.lineWidth = .4 + Math.random() * .6;
    g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + (Math.random() - .5) * 6, 128, x + (Math.random() - .5) * 4, 256); g.stroke();
  }
  return c;
}
