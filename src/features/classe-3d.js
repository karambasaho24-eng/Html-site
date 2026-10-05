/* ---------------------------------------------------------------------------
 * La salle, en trois dimensions.
 *
 * Ce que l'on voit depuis sa place. Deux mises en scène :
 *
 *   · la CLASSE — le tableau au fond, le professeur à côté, des rangées de
 *     pupitres. Il y a autant de pupitres qu'il en faut : une rangée de plus
 *     quand la salle se remplit, une colonne de plus quand elle déborde ;
 *   · la RÉUNION — une table ronde. Chacun y a sa chaise, face aux autres ;
 *     le président à la tête, soi-même au bord le plus proche. La table
 *     s'agrandit avec le nombre de convives.
 *
 * Les personnages ont la silhouette classique de Roblox — tête ronde sans
 * visage, torse carré, bras et jambes d’un bloc, un costume, des cheveux —
 * et ce que chacun a SORTI de son sac est posé devant lui : son cahier, sa
 * plume, son encrier, photographiés.
 * Le crayon qu'il tient est dans sa main. Une main levée se voit.
 *
 * Le tableau est VIVANT : sa texture est la toile même du tableau de la
 * séance, recopiée quelques fois par seconde.
 *
 * Le module ne sait rien de la base : on lui dit qui est là, ce qu'il a
 * devant lui, et où trouver la toile du tableau. three.js est livré avec le
 * site (vendor/) et chargé à la demande ; sans lui, ou sans WebGL, la salle
 * garde sa vue à plat.
 * ------------------------------------------------------------------------- */
import { imageDetouree } from "./affaires.js";
import { GABARIT, FACES, NOMS_TENUES, ficheTenue, toilesTenue, toileCape } from "./tenues.js";
import { COIFFURES, COULEURS_CHEVEUX, TEINTS, construireCoiffure, toileCheveux } from "./coiffures.js";
import { creerAtelier } from "./objets-3d.js";
import { ficheTitre } from "./titres.js";

const THREE_LOCAL = new URL("../../vendor/three.module.min.js", import.meta.url).href;
const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

let promesseThree = null;
function chargerThree() {
  promesseThree ??= import(/* @vite-ignore */ THREE_LOCAL)
    .catch(() => import(/* @vite-ignore */ THREE_CDN));
  return promesseThree;
}

export function webglDisponible() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

/* --- Une graine stable par personne : même coiffure, même pose ------------- */
function graine(texte) {
  let h = 2166136261;
  for (const c of String(texte)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}
const choisir = (alea, liste) => liste[Math.floor(alea() * liste.length) % liste.length];

const PEAUX = ["#f2cfae", "#e6b48c", "#c98d62", "#a06a47", "#6f4731", "#f5cd30"];
const CHEVEUX = ["#17120f", "#2e2018", "#5a3a22", "#8a5a2b", "#c9a15a", "#7a2c1a", "#3b3b3b"];

const OUTILS_MAIN = ["crayon", "plume", "stylo-plume", "craie"];

/* --- Ce qui se pose sur un pupitre, et où ------------------------------------
   Coordonnées du plateau vu par celui qui est assis : x vers sa droite, z vers
   lui. Largeurs en unités de la scène (un pupitre fait 2,6). */
const POSE = [
  { kinds: ["cahier", "carnet", "feuille", "cahier-ouvert"], x: -0.15, z: 0.12, r: 0.06, dx: 0.5, dz: -0.05 },
  { kinds: ["crayon", "plume", "stylo-plume"], x: 0.8, z: 0.12, r: -0.55, dx: 0.06, dz: -0.14 },
  { kinds: ["gomme", "buvard"], x: 0.85, z: -0.32, r: 0.3, dx: -0.3, dz: 0 },
  { kinds: ["regle", "equerre", "rapporteur", "compas"], x: 0.05, z: -0.45, r: 0.04, dx: 0.35, dz: 0.05 },
  { kinds: ["regle-a-calcul", "boulier"], x: -0.85, z: -0.3, r: -0.1, dx: 0, dz: 0.3 },
  { kinds: ["dossier", "chemise", "pochette", "registre"], x: -0.85, z: 0.2, r: 0.12, dx: 0.12, dz: -0.1 },
  { kinds: ["feuilles"], x: 0.3, z: -0.25, r: -0.08, dx: 0.1, dz: 0.05 },
  { kinds: ["encrier", "encre", "craie", "cachet"], x: 1.0, z: 0.32, r: 0, dx: -0.22, dz: 0 }
];
const LARGEUR = {
  cahier: .56, "cahier-ouvert": .95, carnet: .4, feuille: .46, feuilles: .52, dossier: .58, chemise: .58,
  pochette: .52, crayon: .62, plume: .62, "stylo-plume": .58, gomme: .26, regle: .82, equerre: .48,
  compas: .28, rapporteur: .52, "regle-a-calcul": .84, boulier: .42, encrier: .26, encre: .18,
  craie: .2, buvard: .56, registre: .58, cachet: .2
};

export async function creerClasse3D({ hote, toile = () => null, surTableau = null, surPersonne = null, surPlace = null, surCahier = null, surMonCahier = null }) {
  const THREE = await chargerThree();

  /* --- Le rendu ------------------------------------------------------------ */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "classe3d__toile";

  const etiquettes = document.createElement("div");
  etiquettes.className = "classe3d__etiquettes";
  hote.append(canvas, etiquettes);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#171a1d");

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 120);
  const regard = new THREE.Vector3(0, 3.2, -7);

  /* --- La lumière : le jour par les fenêtres, un plafonnier chaud ---------- */
  const ciel = new THREE.HemisphereLight("#fff4e4", "#3a2c22", 1.1);
  scene.add(ciel);
  const soleil = new THREE.DirectionalLight("#ffe9cc", 2.4);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(2048, 2048);
  soleil.shadow.bias = -0.0003;
  soleil.shadow.normalBias = 0.02;
  scene.add(soleil, soleil.target);
  // Une lumière de contour, venue de derrière : elle détache les silhouettes
  // du décor, comme sur un plateau de tournage.
  const contour = new THREE.DirectionalLight("#cfe0ff", 0.55);
  contour.position.set(4, 9, -14);
  scene.add(contour);
  const plafonnier = new THREE.PointLight("#ffe7c7", 18, 30, 2);
  plafonnier.position.set(0, 9.5, -2);
  scene.add(plafonnier);

  /* --- Les reflets ---------------------------------------------------------
     Un environnement doux, calculé une fois : une pièce chaude, une fenêtre
     claire, une lampe. Le bois verni, le métal, le marbre y prennent des
     reflets — ce qui distingue une matière d'un aplat. */
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    const basique = (c, k = 1, side = THREE.FrontSide) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side });
    es.add(new THREE.Mesh(new THREE.BoxGeometry(24, 14, 24), basique("#8a735c", 1, THREE.BackSide)));
    const fen = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), basique("#dfe9ff", 5));
    fen.position.set(-11.9, 2, 0); fen.rotation.y = Math.PI / 2;
    const lampe = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), basique("#ffe8c8", 3.5));
    lampe.position.y = 6.9; lampe.rotation.x = Math.PI / 2;
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), basique("#4a3424"));
    sol.position.y = -6.9; sol.rotation.x = -Math.PI / 2;
    es.add(fen, lampe, sol);
    scene.environment = pm.fromScene(es, 0.04).texture;
    scene.environmentIntensity = 0.38;
    pm.dispose();
  }

  /* --- Matières ----------------------------------------------------------- */
  const cacheMat = new Map();
  const matDe = (c, extra = {}) => {
    const cle = c + JSON.stringify(extra);
    if (!cacheMat.has(cle)) cacheMat.set(cle, new THREE.MeshStandardMaterial({ color: c, roughness: .8, metalness: 0, ...extra }));
    return cacheMat.get(cle);
  };

  /** Une texture peinte dans une toile, puis répétée. */
  function texturePeinte(l, h, peindre, repete = [1, 1]) {
    const c = document.createElement("canvas");
    c.width = l; c.height = h;
    peindre(c.getContext("2d"), l, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repete);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  // Le fil du bois : des veines longues, irrégulières, quelques nœuds.
  const veines = (g, l, h, teinte, clarte) => {
    g.fillStyle = `hsl(${teinte}, 38%, ${clarte}%)`;
    g.fillRect(0, 0, l, h);
    for (let i = 0; i < 180; i++) {
      const y = Math.random() * h;
      const a = Math.random() * 0.12;
      g.strokeStyle = Math.random() > .5 ? `rgba(30,15,5,${a})` : `rgba(255,225,190,${a * .7})`;
      g.lineWidth = 0.5 + Math.random() * 2.2;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= l; x += 32) g.lineTo(x, y + Math.sin(x / 90 + i) * 3 + (Math.random() - .5) * 1.5);
      g.stroke();
    }
    for (let k = 0; k < 3; k++) {
      const x = Math.random() * l, y = Math.random() * h;
      const d = g.createRadialGradient(x, y, 1, x, y, 14);
      d.addColorStop(0, "rgba(40,20,8,.45)"); d.addColorStop(1, "rgba(40,20,8,0)");
      g.fillStyle = d; g.beginPath(); g.ellipse(x, y, 22, 7, 0, 0, 7); g.fill();
    }
  };
  const TEX = {
    plancher: texturePeinte(1024, 1024, (g, l, h) => {
      const lames = 8;
      for (let i = 0; i < lames; i++) {
        const y0 = i * h / lames;
        const c = document.createElement("canvas"); c.width = l; c.height = h / lames;
        veines(c.getContext("2d"), l, h / lames, 26 + (i * 7) % 8, 30 + (i * 37) % 9);
        const decal = (i * 389) % l;
        g.drawImage(c, decal, y0); g.drawImage(c, decal - l, y0);
        g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, y0, l, 2);
        g.fillRect((i * 211) % l, y0, 2, h / lames);
      }
    }, [5, 5]),
    pupitre: texturePeinte(512, 256, (g, l, h) => veines(g, l, h, 28, 34)),
    table: texturePeinte(1024, 1024, (g, l, h) => veines(g, l, h, 24, 27)),
    mur: texturePeinte(512, 512, (g, l, h) => {
      g.fillStyle = "#bdb5a8"; g.fillRect(0, 0, l, h);
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = `rgba(${Math.random() > .5 ? "255,255,255" : "60,50,40"},${Math.random() * .05})`;
        g.fillRect(Math.random() * l, Math.random() * h, 2, 2);
      }
    }, [6, 3]),
    papierPeint: texturePeinte(512, 512, (g, l, h) => {
      // Un papier peint discret : des rayures crème et vert sauge, un motif.
      g.fillStyle = "#c9c3ad"; g.fillRect(0, 0, l, h);
      for (let x = 0; x < l; x += 64) { g.fillStyle = "rgba(92,112,86,.22)"; g.fillRect(x, 0, 22, h); }
      g.fillStyle = "rgba(92,112,86,.28)";
      for (let y = 16; y < h; y += 64) for (let x = 43; x < l; x += 64) {
        g.beginPath(); g.ellipse(x, y, 3, 6, 0, 0, 7); g.fill();
      }
      for (let i = 0; i < 6000; i++) {
        g.fillStyle = `rgba(${Math.random() > .5 ? "255,255,255" : "60,50,40"},${Math.random() * .04})`;
        g.fillRect(Math.random() * l, Math.random() * h, 2, 2);
      }
    }, [5, 2]),
    lambris: texturePeinte(512, 128, (g, l, h) => {
      veines(g, l, h, 25, 26);
      g.fillStyle = "rgba(0,0,0,.28)";
      for (let x = 0; x < l; x += 64) g.fillRect(x, 0, 2, h);
      g.fillRect(0, 0, l, 5);
    }, [10, 1])
  };
  const matBois = new THREE.MeshStandardMaterial({ map: TEX.pupitre, roughness: .62 });
  const matTable = new THREE.MeshStandardMaterial({ map: TEX.table, roughness: .5 });
  const matMetal = matDe("#2d3033", { metalness: .6, roughness: .45 });

  /* --- Géométries arrondies ------------------------------------------------ */
  function boiteRonde(l, h, p, r = 0.12) {
    const forme = new THREE.Shape();
    const x = -l / 2 + r, y = -h / 2 + r, L = l - 2 * r, H = h - 2 * r;
    forme.moveTo(x, y);
    forme.lineTo(x + L, y); forme.quadraticCurveTo(x + L + r, y, x + L + r, y + r);
    forme.lineTo(x + L + r, y + H); forme.quadraticCurveTo(x + L + r, y + H + r, x + L, y + H + r);
    forme.lineTo(x, y + H + r); forme.quadraticCurveTo(x - r, y + H + r, x - r, y + H);
    forme.lineTo(x - r, y + r); forme.quadraticCurveTo(x - r, y, x, y);
    const g = new THREE.ExtrudeGeometry(forme, {
      depth: Math.max(0.01, p - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: 0,
      bevelSegments: 3, curveSegments: 6
    });
    g.translate(0, 0, -(p - 2 * r) / 2);
    g.computeVertexNormals();
    return g;
  }
  const profilTete = [];
  {
    const R = 0.62, H = 1.2, r = 0.2;
    profilTete.push(new THREE.Vector2(0, -H / 2));
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
      profilTete.push(new THREE.Vector2(R - r + Math.cos(a) * r, -H / 2 + r + Math.sin(a) * r));
    }
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * (Math.PI / 2);
      profilTete.push(new THREE.Vector2(R - r + Math.cos(a) * r, H / 2 - r + Math.sin(a) * r));
    }
    profilTete.push(new THREE.Vector2(0, H / 2));
  }
  const atelier = creerAtelier(THREE);     // les affaires, en volume
  const GEO = {
    tete: new THREE.LatheGeometry(profilTete, 28),
    bras: new THREE.CapsuleGeometry(0.34, 0.6, 6, 12),
    main: new THREE.SphereGeometry(0.3, 14, 10),
    cuisse: new THREE.CapsuleGeometry(0.4, 0.55, 6, 12),
    tibia: new THREE.CapsuleGeometry(0.38, 0.55, 6, 12),
    chaussure: boiteRonde(0.72, 0.36, 1.0, 0.14),
    cou: new THREE.CylinderGeometry(0.3, 0.34, 0.25, 14),
    col: new THREE.CylinderGeometry(0.46, 0.5, 0.22, 20, 1, true),
    oeil: new THREE.SphereGeometry(0.075, 10, 8),
    sourire: new THREE.TorusGeometry(0.2, 0.035, 6, 16, Math.PI),

    cheveuxCourts: new THREE.SphereGeometry(0.7, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.64),
    cheveuxLongs: new THREE.SphereGeometry(1, 20, 14),
    chignon: new THREE.SphereGeometry(0.32, 14, 10),
    plan: new THREE.PlaneGeometry(1, 1),
    cape: new THREE.PlaneGeometry(2.2, 2.7),
    manteau: new THREE.PlaneGeometry(3.3, 3.9),
    pied: new THREE.CylinderGeometry(0.06, 0.06, 1, 8)
  };
  const PARTAGEES = new Set(Object.values(GEO));
  const ombrer = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  /* --- Un personnage ------------------------------------------------------ */
  /* --- Les tenues : des blocs dont chaque face montre la bonne part du
     gabarit Roblox (585 × 559). Même découpage que le jeu : une chemise ou
     un pantalon fait pour Roblox s'y plaque à l'identique. */
  function blocHabille(l, h, p, faces) {
    const g = new THREE.BoxGeometry(l, h, p);
    const uv = g.attributes.uv;
    // Ordre des faces de three.js : +x, -x, +y, -y, +z, -z. Le personnage
    // regarde vers -z : -z est le devant, +z le dos, +x son côté droit.
    ["R", "L", "U", "D", "B", "F"].forEach((cle, f) => {
      const [x0, y0, lf, hf] = faces[cle];
      for (let i = f * 4; i < f * 4 + 4; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        uv.setXY(i, (x0 + u * lf) / GABARIT.l, 1 - (y0 + (1 - v) * hf) / GABARIT.h);
      }
    });
    uv.needsUpdate = true;
    return g;
  }
  const GEO_TENUE = {
    torse: blocHabille(2, 2, 1, FACES.torse),
    droit: blocHabille(1, 2, 1, FACES.droit),
    gauche: blocHabille(1, 2, 1, FACES.gauche)
  };
  for (const g of Object.values(GEO_TENUE)) PARTAGEES.add(g);
  const cacheTenues = new Map();
  function matieresTenue(nom) {
    if (cacheTenues.has(nom)) return cacheTenues.get(nom);
    // Une tenue fournie en images (le vrai vêtement du jeu) se peint dès
    // que ses gabarits sont chargés ; les autres sont dessinées d'emblée.
    const toiles = toilesTenue(nom);
    const texture = (c) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      toiles.pret?.then(() => { t.needsUpdate = true; });
      return t;
    };
    const m = {
      // Comme dans le jeu : là où le vêtement est transparent (mains,
      // avant-bras nus), c'est la peau du personnage qu'on voit.
      chemise: new THREE.MeshStandardMaterial({ map: texture(toiles.chemise), roughness: .82, alphaTest: .5 }),
      pantalon: new THREE.MeshStandardMaterial({ map: texture(toiles.pantalon), roughness: .85, alphaTest: .5 })
    };
    cacheTenues.set(nom, m);
    return m;
  }

  /* --- L'apparence : ce que le joueur a choisi, ou ce que son nom tire au sort */
  const DEFAUTS = {
    // Par défaut, un costume — veste comprise (pas de chemise seule, qui de
    // loin fait un bloc blanc). L'uniforme, on le choisit.
    tenue: NOMS_TENUES.filter((n) => ficheTenue(n)?.famille === "costume" && ficheTenue(n)?.veste),
    coiffure: COIFFURES.map((c) => c.cle),
    cheveux: COULEURS_CHEVEUX.map((c) => c.cle).slice(0, 7),
    peau: TEINTS.map((t) => t.cle).slice(0, 6)
  };
  function avatarComplet(cle, avatar = {}) {
    const alea = graine(`apparence:${cle}`);
    return {
      tenue: NOMS_TENUES.includes(avatar?.tenue) ? avatar.tenue : choisir(alea, DEFAUTS.tenue),
      coiffure: COIFFURES.some((c) => c.cle === avatar?.coiffure) ? avatar.coiffure : choisir(alea, DEFAUTS.coiffure),
      cheveux: /^#[0-9a-f]{6}$/i.test(avatar?.cheveux || "") ? avatar.cheveux : choisir(alea, DEFAUTS.cheveux),
      peau: /^#[0-9a-f]{6}$/i.test(avatar?.peau || "") ? avatar.peau : choisir(alea, DEFAUTS.peau)
    };
  }
  let texCheveux = null;
  const cacheCheveux = new Map();
  function matiereCheveux(couleur) {
    if (!cacheCheveux.has(couleur)) {
      texCheveux ??= Object.assign(new THREE.CanvasTexture(toileCheveux()), { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
      texCheveux.repeat?.set(3, 1);
      cacheCheveux.set(couleur, new THREE.MeshStandardMaterial({
        color: couleur, map: texCheveux, roughness: .42, metalness: .05, side: THREE.DoubleSide
      }));
    }
    return cacheCheveux.get(couleur);
  }
  const cacheCapes = new Map();
  function matiereCape(tenue) {
    if (!cacheCapes.has(tenue)) {
      const toile = toileCape(tenue);
      cacheCapes.set(tenue, toile ? new THREE.MeshStandardMaterial({
        map: Object.assign(new THREE.CanvasTexture(toile), { colorSpace: THREE.SRGBColorSpace }),
        roughness: .9, side: THREE.DoubleSide
      }) : null);
    }
    return cacheCapes.get(tenue);
  }

  /* --- Ce que portent les titres ------------------------------------------- */
  let royal = null;
  function matieresRoyales() {
    if (royal) return royal;
    const velours = texturePeinte(256, 512, (g, l, h) => {
      // Un velours cramoisi : plus sombre dans les plis, quelques reflets.
      g.fillStyle = "#7d0f1c"; g.fillRect(0, 0, l, h);
      for (let x = 0; x < l; x += 2) {
        const v = Math.sin(x / 19) * 0.5 + Math.sin(x / 7.3) * 0.2;
        g.fillStyle = v > 0 ? `rgba(255,120,120,${v * 0.12})` : `rgba(20,0,4,${-v * 0.35})`;
        g.fillRect(x, 0, 2, h);
      }
      g.strokeStyle = "#c9a24e"; g.lineWidth = 10; g.strokeRect(5, 5, l - 10, h - 10);
    });
    const hermine = texturePeinte(256, 128, (g, l, h) => {
      // L'hermine : blanc cassé, mouchetée de petites queues noires.
      g.fillStyle = "#f4f0e6"; g.fillRect(0, 0, l, h);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(150,140,120,${Math.random() * .08})`;
        g.fillRect(Math.random() * l, Math.random() * h, 2, 2);
      }
      g.fillStyle = "#151313";
      for (let y = 18; y < h; y += 42) for (let x = (y / 42) % 2 ? 10 : 34; x < l; x += 48) {
        g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 5, y + 7); g.lineTo(x - 5, y + 7); g.fill();
      }
    }, [2, 1]);
    royal = {
      velours: new THREE.MeshStandardMaterial({ map: velours, roughness: .78, side: THREE.DoubleSide }),
      hermine: new THREE.MeshStandardMaterial({ map: hermine, roughness: .95 }),
      or: matDe("#d4a93a", { metalness: .85, roughness: .26 }),
      rubis: matDe("#b3142a", { metalness: .2, roughness: .15 }),
      saphir: matDe("#1f4fb3", { metalness: .2, roughness: .15 })
    };
    return royal;
  }
  /** Une couronne d'or (cinq fleurons, des pierres) ou un simple diadème. */
  function couronne(genre) {
    const m = matieresRoyales();
    const g = new THREE.Group();
    const diademe = genre === "diademe";
    const bande = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.68, diademe ? 0.14 : 0.34, 32, 1, true), m.or);
    bande.material.side = THREE.DoubleSide;
    g.add(bande);
    if (!diademe) {
      const coiffe = new THREE.Mesh(new THREE.SphereGeometry(0.64, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.velours);
      coiffe.position.y = 0.05;
      g.add(coiffe);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const fleuron = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 4), m.or);
        fleuron.position.set(Math.sin(a) * 0.69, 0.32, -Math.cos(a) * 0.69);
        const perle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), m.or);
        perle.position.set(Math.sin(a) * 0.69, 0.52, -Math.cos(a) * 0.69);
        const pierre = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), i % 2 ? m.saphir : m.rubis);
        pierre.position.set(Math.sin(a + 0.63) * 0.71, 0, -Math.cos(a + 0.63) * 0.71);
        g.add(fleuron, perle, pierre);
      }
      const croix = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), m.or);
      croix.position.y = 0.72;
      g.add(croix);
    } else {
      const pierre = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), m.saphir);
      pierre.position.set(0, 0.04, -0.72);
      g.add(pierre);
    }
    g.position.y = 1.18;
    ombrer(g);
    return g;
  }

  /* --- Ce qu'on lit, tenu à deux mains ------------------------------------ */
  let texPage = null;
  function pageEcrite() {
    texPage ??= texturePeinte(256, 340, (g, l, h) => {
      g.fillStyle = "#f3ecd9"; g.fillRect(0, 0, l, h);
      g.fillStyle = "rgba(120,90,50,.08)";
      for (let i = 0; i < 1800; i++) g.fillRect(Math.random() * l, Math.random() * h, 2, 2);
      g.fillStyle = "#2a2622"; g.fillRect(40, 34, 120, 7);
      for (let y = 66; y < h - 30; y += 17) {
        g.fillStyle = "rgba(40,36,32,.72)";
        g.fillRect(26, y, l - 52 - (y * 37 % 60), 3);
      }
      g.strokeStyle = "rgba(140,30,30,.6)"; g.lineWidth = 3;
      g.beginPath(); g.arc(l - 56, h - 46, 20, 0, 7); g.stroke();
    });
    return texPage;
  }
  /**
   * Un papier, un cahier ouvert, un livre ouvert. Le groupe regarde vers +z
   * (vers celui qui lit) ; on le penche vers son visage.
   */
  function objetLecture(kind) {
    const g = new THREE.Group();
    const page = new THREE.MeshStandardMaterial({ map: pageEcrite(), roughness: .9, side: THREE.DoubleSide });
    if (kind === "papier") {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.5), page);
      g.add(f);
    } else {
      const livre = kind === "livre";
      const couv = matDe(livre ? "#5a2418" : "#2f4a3a", { roughness: .7 });
      for (const sens of [-1, 1]) {
        const feuille = new THREE.Group();
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 1.15), page);
        f.position.x = sens * 0.41;
        const dos = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.2, livre ? 0.12 : 0.03), couv);
        dos.position.set(sens * 0.43, 0, -(livre ? 0.07 : 0.025));
        feuille.add(f, dos);
        feuille.rotation.y = sens * 0.28;           // ouvert en V, comme on le tient
        g.add(feuille);
      }
    }
    g.rotation.x = -0.63;
    ombrer(g);
    return g;
  }

  /* --- Un personnage : la silhouette classique de Roblox -------------------
     Une tête cylindrique aux bords adoucis, un torse carré, deux bras et deux
     jambes d'un seul bloc. Pas de visage : ni yeux, ni sourire. Un costume
     ouvert sur la chemise et la cravate, et des cheveux pour qu'on ne voie
     pas des crânes nus depuis le fond de la salle. */
  function personnage(cle, avatar = {}) {
    const alea = graine(cle);
    // Ce que le joueur a choisi ; à défaut, une apparence tirée de son nom.
    // Un roi, une reine : l'habit royal, quoi qu'il ait choisi.
    const a = avatarComplet(cle, ficheTitre(avatar?.titre)?.manteau ? { ...avatar, tenue: "royale" } : avatar);
    const peau = matDe(a.peau);
    const habit = matieresTenue(a.tenue);
    const cheveux = matiereCheveux(a.cheveux);

    const racine = new THREE.Group();
    const bassin = new THREE.Group();          // le bas du torse, où naissent les jambes
    racine.add(bassin);

    // Le torse porte la chemise ; tout le dessin (col, cravate, revers,
    // boutons) est dans l'image, comme dans le jeu.
    const torse = new THREE.Mesh(GEO_TENUE.torse, habit.chemise);
    torse.position.y = 1;
    bassin.add(torse);
    const chairTorse = new THREE.Mesh(GEO_TENUE.torse, peau);
    chairTorse.scale.setScalar(.99);
    torse.add(chairTorse);

    const tete = new THREE.Group();
    tete.position.y = 2;
    bassin.add(tete);
    const crane = new THREE.Mesh(GEO.tete, peau);
    crane.position.y = 0.62;
    tete.add(crane);
    tete.add(construireCoiffure(THREE, a.coiffure, cheveux));
    // L'éclaireur porte la cape, dans le dos.
    const cape = matiereCape(a.tenue);
    if (cape) {
      const m = new THREE.Mesh(GEO.cape, cape);
      m.position.set(0, 0.75, 0.56);
      m.rotation.x = 0.06;
      bassin.add(m);
    }
    // Le titre se porte : la couronne, le manteau de velours bordé d'hermine.
    const titre = ficheTitre(avatar?.titre);
    let manteau = null;
    if (titre?.manteau) {
      manteau = new THREE.Group();
      const velours = new THREE.Mesh(GEO.manteau, matieresRoyales().velours);
      velours.position.set(0, -1.95, 0);
      const bord = new THREE.Mesh(new THREE.BoxGeometry(3.32, 0.3, 0.16), matieresRoyales().hermine);
      bord.position.set(0, -3.9, 0.02);
      manteau.add(velours, bord);
      manteau.position.set(0, 2.05, 0.6);
      bassin.add(manteau);
      // Le col d'hermine, sur les épaules.
      const col = new THREE.Mesh(boiteRonde(3.3, 0.42, 1.35, 0.16), matieresRoyales().hermine);
      col.position.set(0, 2.06, 0.02);
      bassin.add(col);
    }
    if (titre?.couronne) tete.add(couronne(titre.couronne));

    /* Un membre d'un seul bloc, pendu à son articulation. Le « bout » est un
       repère au bas du bloc : c'est là que la main tient le crayon. */
    const membre = (x, y, geo, mat) => {
      const epaule = new THREE.Group();
      epaule.position.set(x, y, 0);
      const bloc = new THREE.Mesh(geo, mat);
      bloc.position.y = -0.9;
      const chair = new THREE.Mesh(geo, peau);   // la peau, sous le vêtement
      chair.scale.setScalar(.99);
      bloc.add(chair);
      const coude = new THREE.Group();          // gardé pour les gestes, invisible
      coude.position.y = -1.85;
      const bout = new THREE.Group();
      coude.add(bout);
      epaule.add(bloc, coude);
      return { epaule, coude, bout };
    };
    const brasG = membre(-1.5, 1.9, GEO_TENUE.gauche, habit.chemise);
    const brasD = membre(1.5, 1.9, GEO_TENUE.droit, habit.chemise);
    const jambeG = membre(-0.5, 0.1, GEO_TENUE.gauche, habit.pantalon);
    const jambeD = membre(0.5, 0.1, GEO_TENUE.droit, habit.pantalon);
    for (const m of [brasG, brasD, jambeG, jambeD]) bassin.add(m.epaule);
    ombrer(racine);

    const p = { racine, bassin, tete, brasG, brasD, jambeG, jambeD, torse, alea, phase: alea() * 10, outil: null, manteau, lecture: null };

    p.poser = (pose) => {
      p.pose = pose;
      // Debout, le manteau tombe jusqu'aux talons ; assis, il s'étale derrière soi.
      if (manteau) {
        manteau.scale.y = pose === "debout" ? 1 : 0.6;
        manteau.rotation.x = pose === "debout" ? 0.04 : -0.12;
      }
      for (const m of [brasG, brasD, jambeG, jambeD]) {
        m.epaule.rotation.set(0, 0, 0); m.coude.rotation.set(0, 0, 0);
        m.epaule.rotation.order = "XYZ";
      }
      tete.rotation.set(0, 0, 0);
      if (pose === "debout") { bassin.position.y = 1.9; return; }
      bassin.position.y = 0;
      if (pose === "tailleur") {
        // En tailleur : les jambes en avant, croisées l'une sur l'autre.
        jambeG.epaule.rotation.order = jambeD.epaule.rotation.order = "YXZ";
        jambeG.epaule.rotation.set(Math.PI / 2, -0.55, 0);
        jambeD.epaule.rotation.set(Math.PI / 2 - 0.12, 0.55, 0);
      } else {
        // Assis : les jambes droites devant soi, comme dans le jeu.
        jambeG.epaule.rotation.x = Math.PI / 2;
        jambeD.epaule.rotation.x = Math.PI / 2;
      }
      // Assis comme dans le jeu : les bras le long du corps, un peu en avant.
      brasG.epaule.rotation.set(0.32, 0, -0.05);
      brasD.epaule.rotation.set(0.32, 0, 0.05);
    };

    /** Ce qu'il tient dans la main droite : un crayon, une plume, la craie. */
    p.tenir = (kind) => {
      if ((p.outil?.userData.kind || null) === (kind || null)) return;
      if (p.outil) { brasD.bout.remove(p.outil); p.outil = null; }
      if (!kind) return;
      const g = new THREE.Group();
      g.userData.kind = kind;
      const corps = kind === "crayon" ? "#d9a24a" : kind === "craie" ? "#f1eee4" : "#1c1c1f";
      const long = kind === "craie" ? 0.5 : 1.15;
      const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, long, 10), matDe(corps, { roughness: .5 }));
      const pointe = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 10),
        matDe(kind === "crayon" ? "#e8c89a" : kind === "craie" ? "#f1eee4" : "#b8963a",
          { metalness: kind === "crayon" || kind === "craie" ? 0 : .6, roughness: .4 }));
      pointe.position.y = -(long / 2 + 0.11);
      pointe.rotation.x = Math.PI;
      g.add(tige, pointe);
      // Tenu entre les doigts, la pointe vers la feuille.
      g.rotation.set(0.9, 0, 0.3);
      g.position.set(0, 0.05, -0.35);
      ombrer(g);
      brasD.bout.add(g);
      p.outil = g;
    };
    return p;
  }

  /* --- Les objets posés : leur photographie, à plat, avec son ombre -------- */
  const chargeur = new THREE.TextureLoader();
  const textures = new Map();          // kind → { tex, ratio, attente }
  function textureObjet(kind) {
    if (textures.has(kind)) return textures.get(kind);
    const x = { tex: null, ratio: 1, attente: [] };
    textures.set(kind, x);
    chargeur.load(imageDetouree(kind), (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      x.tex = t;
      x.ratio = t.image.height / Math.max(1, t.image.width);
      for (const f of x.attente.splice(0)) f(x);
    }, undefined, () => {});
    return x;
  }
  function poserObjet(groupe, kind, { x, z, r, couverture = null }) {
    // En volume, si l'on sait le modeler ; sinon, sa photographie posée à plat.
    const vrai = atelier.modele(kind, { couverture });
    if (vrai) {
      vrai.position.set(x, 0.004, z);
      vrai.rotation.y = r;
      groupe.add(vrai);
      return;
    }
    const info = textureObjet(kind);
    const jeton = groupe.userData.jeton;
    const monter = ({ tex, ratio }) => {
      if (groupe.userData.jeton !== jeton) return;       // la table a changé entre-temps
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: .65 });
      const m = new THREE.Mesh(GEO.plan, mat);
      // Un peu plus grands que nature, comme tout dans ce monde : on doit les
      // reconnaître depuis le fond de la salle.
      const l = (LARGEUR[kind] || 0.4) * 1.35;
      m.scale.set(l, l * ratio, 1);
      m.rotation.set(-Math.PI / 2, 0, r);
      m.position.set(x, 0.012 + groupe.children.length * 0.004, z);
      m.receiveShadow = true;
      m.castShadow = true;
      // L'ombre suit la silhouette de l'objet, pas le carré de l'image.
      m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.35 });
      m.userData.objet = kind;           // on le reconnaît au clic
      groupe.add(m);
    };
    if (info.tex) monter(info); else info.attente.push(monter);
  }
  /** Tout ce qu'une personne a devant elle. `liste` : [{ k, m }] (m : en main). */
  function garnir(groupe, liste = []) {
    groupe.userData.jeton = (groupe.userData.jeton || 0) + 1;
    groupe.userData.table = true;
    for (const enfant of [...groupe.children]) {
      groupe.remove(enfant);
      enfant.material?.dispose?.();
      enfant.customDepthMaterial?.dispose?.();
    }
    const enMain = liste.find((o) => o.m && OUTILS_MAIN.includes(o.k));
    const rangs = new Map();
    for (const o of liste) {
      if (o === enMain) continue;
      // Qui a la plume en main écrit : son cahier est ouvert.
      const kind = o.k === "cahier" && enMain ? "cahier-ouvert" : o.k;
      const place = POSE.find((p) => p.kinds.includes(kind)) || { x: -0.4, z: -0.2, r: 0, dx: 0.3, dz: 0 };
      const n = rangs.get(place) || 0;
      rangs.set(place, n + 1);
      if (n > 3) continue;
      poserObjet(groupe, kind, { x: place.x + place.dx * n, z: place.z + place.dz * n, r: place.r + n * 0.08, couverture: o.c || null });
    }
    return enMain?.k || null;
  }
  const enMainDe = (liste = []) => liste.find((o) => o.m && OUTILS_MAIN.includes(o.k))?.k || null;

  /* --- Les gestes : on voit l'autre prendre ses affaires --------------------
     Quand ce qu'il a devant lui change, l'objet n'apparaît pas d'un coup :
     il se penche vers son sac, l'attrape — on le voit dans sa main —, le
     monte et le pose sur la table. Pour ranger, l'inverse. Une chose à la
     fois, dans l'ordre ; au-delà de quatre, c'est un grand rangement, et on
     ne mime pas tout. */
  const DUREE_GESTE = 1800;
  // [épaule en avant, épaule en dehors, penché, tête baissée]
  const POSES_GESTE = {
    repos:    [0.32, 0.05, 0, 0],
    sac:      [-0.3, 0.62, -0.22, 0.42],    // le sac par terre, à droite de la chaise
    sacTable: [0.92, 0.42, 0, 0.32],        // le sac ouvert sur la table
    haut:     [1.32, 0.12, 0, 0.12],
    table:    [1.02, 0.08, 0, 0.3]
  };
  const CLES_SORTIR = [[0, "repos"], [0.3, "sac"], [0.4, "sac"], [0.72, "haut"], [0.86, "table"], [1, "repos"]];
  const CLES_RANGER = [[0, "repos"], [0.14, "table"], [0.26, "haut"], [0.55, "sac"], [0.65, "sac"], [1, "repos"]];

  function difference(avant, apres) {
    const compte = (l) => { const m = new Map(); for (const o of l) m.set(o.k, (m.get(o.k) || 0) + 1); return m; };
    const a = compte(avant), b = compte(apres);
    const sortis = [], ranges = [];
    for (const [k, n] of b) for (let i = a.get(k) || 0; i < n; i++) sortis.push(k);
    for (const [k, n] of a) for (let i = b.get(k) || 0; i < n; i++) ranges.push(k);
    return { sortis, ranges };
  }

  /** Mettre en file les gestes qui mènent de `avant` à `apres`. Faux : rien à mimer. */
  function preparerGestes(x, avant, apres) {
    const { sortis, ranges } = difference(avant, apres);
    const n = sortis.length + ranges.length;
    x.gestes = x.gestes || [];
    const occupe = Boolean(x.geste || x.gestes.length);
    if (!n) {
      if (!occupe) return false;
      // Rien de plus à montrer : la dernière étape aboutira à ce nouvel état.
      (x.gestes[x.gestes.length - 1] || x.geste).fin = apres;
      return true;
    }
    if (n > 4) return false;
    let courant = avant.slice();
    for (const k of ranges) {
      const i = courant.findIndex((o) => o.k === k);
      const sans = courant.filter((_, j) => j !== i);
      x.gestes.push({ type: "ranger", k, debut: courant, fin: sans });
      courant = sans;
    }
    for (const k of sortis) {
      const avec = [...courant, apres.find((o) => o.k === k) || { k }];
      x.gestes.push({ type: "sortir", k, debut: courant, fin: avec });
      courant = avec;
    }
    x.gestes[x.gestes.length - 1].fin = apres;
    return true;
  }

  /** L'objet dans la main : sa photographie, comme sur la table. */
  function objetEnMain(kind, x) {
    const g = new THREE.Group();
    const vrai = atelier.modele(kind);
    if (vrai) {
      // Tenu dans la main, à plat contre la paume.
      vrai.scale.setScalar(1 / (x.p.racine.scale.x || 1));
      vrai.rotation.x = Math.PI / 2;
      vrai.position.set(0, -0.2, 0.1);
      g.add(vrai);
      return g;
    }
    const info = textureObjet(kind);
    const echelle = 1 / (x.p.racine.scale.x || 1);
    const monter = ({ tex, ratio }) => {
      const m = new THREE.Mesh(GEO.plan, new THREE.MeshStandardMaterial({
        map: tex, transparent: true, alphaTest: 0.35, roughness: .65, side: THREE.DoubleSide
      }));
      const l = (LARGEUR[kind] || 0.4) * 1.35 * echelle;
      m.scale.set(l, l * ratio, 1);
      m.position.set(0, -l * ratio * 0.35, 0.12);
      m.castShadow = true;
      g.add(m);
    };
    if (info.tex) monter(info); else info.attente.push(monter);
    return g;
  }
  function lacher(x, g) {
    if (!g.main) return;
    x.p.brasD.bout.remove(g.main);
    g.main.traverse((m) => m.material?.dispose?.());
    g.main = null;
  }
  function poseGeste(p, cles, t, cible) {
    let i = 0;
    while (i < cles.length - 2 && t > cles[i + 1][0]) i++;
    const [t0, a] = cles[i], [t1, b] = cles[i + 1];
    let u = Math.max(0, Math.min(1, (t - t0) / Math.max(0.001, t1 - t0)));
    u = u * u * (3 - 2 * u);
    const A = POSES_GESTE[a === "sac" ? cible : a], B = POSES_GESTE[b === "sac" ? cible : b];
    const v = (j) => A[j] + (B[j] - A[j]) * u;
    p.brasD.epaule.rotation.x = v(0);
    p.brasD.epaule.rotation.z = v(1);
    p.bassin.rotation.z = v(2);
    p.tete.rotation.x = v(3);
  }
  /** Un pas du geste en cours. Vrai tant qu'il occupe le bras droit. */
  function animerGeste(x, maintenant) {
    if (!x.geste) {
      if (!x.gestes?.length || !x.siege || x.trajet) return false;
      x.geste = x.gestes.shift();
      x.geste.t0 = maintenant;
      x.geste.cible = x.sacOuvert ? "sacTable" : "sac";
      x.p.tenir(null);
    }
    const g = x.geste;
    const t = Math.min(1, (maintenant - g.t0) / DUREE_GESTE);
    poseGeste(x.p, g.type === "sortir" ? CLES_SORTIR : CLES_RANGER, t, g.cible);
    if (g.type === "sortir") {
      if (t >= 0.33 && !g.main && !g.pris) { g.pris = true; g.main = objetEnMain(g.k, x); x.p.brasD.bout.add(g.main); }
      if (t >= 0.86 && !g.pose) { g.pose = true; lacher(x, g); garnir(x.siege.objets, g.fin); }
    } else {
      if (t >= 0.14 && !g.pris) { g.pris = true; g.main = objetEnMain(g.k, x); x.p.brasD.bout.add(g.main); garnir(x.siege.objets, g.fin); }
      if (t >= 0.6 && !g.pose) { g.pose = true; lacher(x, g); }
    }
    if (t >= 1) {
      x.geste = null;
      x.p.bassin.rotation.z = 0;
      x.p.poser(x.p.pose);
      if (!x.gestes.length) { garnir(x.siege.objets, g.fin); x.p.tenir(enMainDe(g.fin)); }
    }
    return true;
  }
  /* --- Lire : on prend la chose à deux mains, on la lève, on lit ----------
     kind : "papier", "cahier", "livre" — ou rien, et on la repose. Vrai tant
     que les bras sont occupés à lire (ou à reposer). */
  const DUREE_LECTURE = 650;
  function gererLecture(p, kind, t) {
    const l = p.lecture;
    if (kind && l && l.kind !== kind) { retirerLecture(p); }
    if (kind && !p.lecture) {
      const g = objetLecture(kind);
      p.bassin.add(g);
      p.lecture = { kind, g, t0: t, u0: 0, sens: 1, outil: p.outil?.userData.kind || null };
      p.tenir(null);
    } else if (kind && p.lecture.sens < 0) {
      Object.assign(p.lecture, { u0: p.lecture.u, t0: t, sens: 1 });
    } else if (!kind && p.lecture && p.lecture.sens > 0) {
      Object.assign(p.lecture, { u0: p.lecture.u, t0: t, sens: -1 });
    }
    const L = p.lecture;
    if (!L) return false;
    L.u = Math.max(0, Math.min(1, L.u0 + L.sens * (t - L.t0) / DUREE_LECTURE));
    const e = L.u * L.u * (3 - 2 * L.u);
    poseLecture(p, e);
    // On la prend plus bas, devant soi, et on la monte à hauteur des yeux.
    L.g.scale.setScalar(0.35 + 0.65 * e);
    L.g.position.set(0, 0.55 + 0.9 * e, -0.95 - 0.67 * e);
    if (L.sens < 0 && L.u <= 0) {
      const outil = L.outil;
      retirerLecture(p);
      p.poser(p.pose);
      p.tenir(outil);
      return false;
    }
    return true;
  }
  function poseLecture(p, e) {
    const assis = p.pose !== "debout";
    const bx = assis ? 0.32 : 0, bz = assis ? 0.05 : 0;
    p.brasG.epaule.rotation.set(bx + (1.25 - bx) * e, 0, -bz + (0.42 + bz) * e);
    p.brasD.epaule.rotation.set(bx + (1.25 - bx) * e, 0, bz + (-0.42 - bz) * e);
    p.tete.rotation.x = 0.3 * e;
  }
  function retirerLecture(p) {
    if (!p.lecture) return;
    p.bassin.remove(p.lecture.g);
    p.lecture.g.traverse((m) => { if (m.isMesh) m.geometry.dispose(); });
    p.lecture = null;
  }

  /** Couper court : on change de place, ou trop de choses ont bougé d'un coup. */
  function interrompreGeste(x) {
    if (x.geste) { lacher(x, x.geste); x.p.bassin.rotation.z = 0; x.p.poser(x.p.pose); }
    x.geste = null;
    x.gestes = [];
  }


  /* --- Le sac : un cartable de cuir, posé par terre à côté de la chaise -----
     On le prend, on le pose sur la table, le rabat s'ouvre ; on se penche
     dessus et l'on voit ce qu'il y a dedans : les cahiers debout au fond,
     la trousse et le reste devant. Un clic, et la chose sort. */
  const TEX_CUIR = texturePeinte(512, 512, (g, l, h) => {
    // Un cuir tanné : brun profond, grain serré, patine plus claire aux usures.
    g.fillStyle = "#5a3018"; g.fillRect(0, 0, l, h);
    for (let i = 0; i < 14000; i++) {
      g.fillStyle = `rgba(${Math.random() > .5 ? "255,205,150" : "18,6,2"},${Math.random() * .08})`;
      g.fillRect(Math.random() * l, Math.random() * h, 1.6, 1.6);
    }
    for (let k = 0; k < 7; k++) {
      const x = Math.random() * l, y = Math.random() * h;
      const d = g.createRadialGradient(x, y, 2, x, y, 90 + Math.random() * 80);
      d.addColorStop(0, "rgba(180,110,60,.22)"); d.addColorStop(1, "rgba(180,110,60,0)");
      g.fillStyle = d; g.fillRect(0, 0, l, h);
    }
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * l, y = Math.random() * h;
      g.strokeStyle = `rgba(25,8,2,${.1 + Math.random() * .18})`; g.lineWidth = .6;
      g.beginPath(); g.moveTo(x, y);
      g.bezierCurveTo(x + 18, y + 6, x + 36, y - 5, x + 50 + Math.random() * 50, y + Math.random() * 8); g.stroke();
    }
  });
  const matCuir = new THREE.MeshStandardMaterial({ map: TEX_CUIR, roughness: .38, metalness: .06 });
  const matCuirFonce = new THREE.MeshStandardMaterial({ map: TEX_CUIR, color: "#7a6456", roughness: .45 });
  const matPassepoil = matDe("#3a1d0e", { roughness: .5 });
  const matDoublure = matDe("#2e2119", { roughness: .95, side: THREE.DoubleSide });
  const matLaiton = matDe("#c9a24e", { metalness: .85, roughness: .28 });
  const SAC = { L: 1.5, H: 0.78, P: 0.55, e: 0.045 };

  // Un rectangle aux coins arrondis, dans le plan (x, y).
  function rectRond(l, p, r, trou = false) {
    const f = trou ? new THREE.Path() : new THREE.Shape();
    const x = -l / 2, y = -p / 2;
    f.moveTo(x + r, y);
    f.lineTo(x + l - r, y); f.quadraticCurveTo(x + l, y, x + l, y + r);
    f.lineTo(x + l, y + p - r); f.quadraticCurveTo(x + l, y + p, x + l - r, y + p);
    f.lineTo(x + r, y + p); f.quadraticCurveTo(x, y + p, x, y + p - r);
    f.lineTo(x, y + r); f.quadraticCurveTo(x, y, x + r, y);
    return f;
  }
  // Une paroi en anneau (le tour du sac), extrudée vers le haut.
  function paroiRonde(l, p, r, e, h, mat) {
    const f = rectRond(l, p, r);
    f.holes.push(rectRond(l - 2 * e, p - 2 * e, Math.max(0.02, r - e), true));
    const geo = new THREE.ExtrudeGeometry(f, { depth: h, bevelEnabled: false, curveSegments: 10 });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.userData.jetable = true;
    return m;
  }
  function plaque(l, p, r, h, mat) {
    const geo = new THREE.ExtrudeGeometry(rectRond(l, p, r), { depth: h, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 });
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat);
    m.userData.jetable = true;
    return m;
  }

  function modeleSac() {
    const { L, H, P, e } = SAC;
    const sac = new THREE.Group();
    // Le corps : un tour de cuir aux angles arrondis, son fond, sa doublure,
    // un passepoil sombre au bord.
    sac.add(paroiRonde(L, P, 0.16, e, H, matCuir));
    const fond = plaque(L, P, 0.16, e, matCuir);
    sac.add(fond);
    const doublure = paroiRonde(L - 2 * e - 0.006, P - 2 * e - 0.006, 0.12, 0.012, H - 0.03, matDoublure);
    doublure.position.y = 0.02;
    sac.add(doublure);
    const bord = paroiRonde(L + 0.012, P + 0.012, 0.165, e + 0.012, 0.035, matPassepoil);
    bord.position.y = H - 0.035;
    sac.add(bord);
    // Le soufflet qui sépare le fond (les cahiers) du devant (le reste).
    const soufflet = plaque(L - 2 * e - 0.04, 0.02, 0.01, H * 0.72, matCuirFonce);
    soufflet.position.set(0, 0.04, 0.04);
    sac.add(soufflet);
    // La poignée, sur le dessus, côté dos.
    const poignee = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.038, 10, 20, Math.PI), matCuirFonce);
    poignee.position.set(0, H + 0.01, -P / 2 + 0.08);
    poignee.userData.jetable = true;
    sac.add(poignee);
    // Le rabat, articulé au dos : il couvre le dessus et retombe devant,
    // arrondi au bas, avec ses deux courroies et leurs boucles de laiton.
    const rabat = new THREE.Group();
    rabat.position.set(0, H + 0.02, -P / 2);
    const dessus = plaque(L + 0.05, P + 0.04, 0.16, 0.03, matCuir);
    dessus.position.set(0, 0, P / 2 + 0.01);
    rabat.add(dessus);
    const devant = plaque(L + 0.05, H * 0.62, 0.2, 0.03, matCuir);
    devant.geometry.rotateX(Math.PI / 2);
    devant.position.set(0, -H * 0.31 + 0.03, P + 0.03);
    rabat.add(devant);
    for (const sx of [-0.42, 0.42]) {
      const courroie = plaque(0.13, H * 0.52, 0.03, 0.018, matCuirFonce);
      courroie.geometry.rotateX(Math.PI / 2);
      courroie.position.set(sx, -H * 0.36, P + 0.06);
      const boucle = plaque(0.18, 0.13, 0.03, 0.025, matLaiton);
      boucle.geometry.rotateX(Math.PI / 2);
      boucle.position.set(sx, -H * 0.5, P + 0.075);
      rabat.add(courroie, boucle);
    }
    sac.add(rabat);
    const contenu = new THREE.Group();          // ce qu'on voit dedans (le sien seulement)
    sac.add(contenu);
    sac.userData = { rabat, contenu };
    ombrer(sac);
    return sac;
  }

  // La couverture d'un cahier, peinte : sa teinte, l'étiquette, son titre.
  const COUVERTURES = {
    parchment: ["#e8dcc4", "#c7b28a"], cuir: ["#5a4030", "#2c1f16"], ardoise: ["#44606c", "#22303a"],
    olive: ["#76844f", "#3f4a2b"], oxblood: ["#843e3e", "#4a2020"], encre: ["#323c46", "#14181d"]
  };
  const cacheCouv = new Map();
  function matieresCahier(chose) {
    const cle = `${chose.cover || "parchment"}|${chose.titre || ""}|${chose.kind}`;
    if (cacheCouv.has(cle)) return cacheCouv.get(cle);
    const [c1, c2] = COUVERTURES[chose.cover] || COUVERTURES[chose.kind === "carnet" ? "cuir" : "oxblood"];
    const couv = texturePeinte(256, 340, (g, l, h) => {
      const d = g.createLinearGradient(0, 0, l, h);
      d.addColorStop(0, c1); d.addColorStop(1, c2);
      g.fillStyle = d; g.fillRect(0, 0, l, h);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = `rgba(${Math.random() > .5 ? "255,255,255" : "0,0,0"},${Math.random() * .06})`;
        g.fillRect(Math.random() * l, Math.random() * h, 1.5, 1.5);
      }
      g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, 0, 18, h);            // le dos
      g.fillStyle = "#efe6cf"; g.fillRect(52, 70, 170, 92);                 // l'étiquette
      g.strokeStyle = "rgba(60,40,20,.55)"; g.lineWidth = 2; g.strokeRect(58, 76, 158, 80);
      g.fillStyle = "#2a1d12"; g.font = "600 24px Georgia, serif"; g.textAlign = "center";
      const mots = String(chose.titre || "Cahier").split(/\s+/);
      const lignes = [];
      for (const m of mots) {
        const der = lignes[lignes.length - 1];
        if (der && g.measureText(`${der} ${m}`).width < 146) lignes[lignes.length - 1] = `${der} ${m}`;
        else lignes.push(m);
      }
      lignes.slice(0, 2).forEach((t, i) => g.fillText(t, 137, 112 + i * 28 - (lignes.length > 1 ? 12 : 0), 150));
    });
    couv.wrapS = couv.wrapT = THREE.ClampToEdgeWrapping; couv.repeat.set(1, 1);
    const tranche = matDe(c2, { roughness: .8 });
    const pages = matDe("#efe8d6", { roughness: .95 });
    const face = new THREE.MeshStandardMaterial({ map: couv, roughness: .75 });
    // +x, -x, +y, -y, +z (la couverture, vers nous), -z
    const m = [pages, tranche, pages, tranche, face, tranche];
    cacheCouv.set(cle, m);
    return m;
  }

  /* Remplir le sac ouvert : les cahiers debout au fond, penchés vers nous ;
     le reste dans la poche de devant. Chaque chose se reconnaît au clic. */
  function remplirSac(sac, liste) {
    const { contenu } = sac.userData;
    const jeton = contenu.userData.jeton = (contenu.userData.jeton || 0) + 1;
    for (const c of [...contenu.children]) {
      contenu.remove(c);
      if (c.userData.jetable) c.geometry.dispose();
    }
    const { L, H, e } = SAC;
    // Au fond, debout : les cahiers et tout ce qui est plat (feuilles, buvard,
    // règle, trousse…). Devant, dans la poche : ce qui est fin (plume, crayon,
    // encrier). Un peu plus grands que nature, pour qu'on les reconnaisse.
    const PLATS = /feuille|buvard|gomme|regle|dossier|pochette|trousse|rapporteur|equerre|boulier|carnet|cahier|livre/;
    const fond = liste.filter((c) => c.genre === "cahier" || PLATS.test(c.kind)).slice(0, 9);
    const devant = liste.filter((c) => !fond.includes(c)).slice(0, 6);
    const planche = (c, { x, y, z, rx, rz, haut, largeMax }) => {
      const info = textureObjet(c.kind);
      const poser = ({ tex, ratio }) => {
        if (contenu.userData.jeton !== jeton) return;        // le sac a changé entre-temps
        const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: .65, side: THREE.DoubleSide });
        const m = new THREE.Mesh(GEO.plan, mat);
        const large = Math.min(largeMax, haut / ratio);
        m.scale.set(large, large * ratio, 1);
        m.position.set(x, y, z);
        m.rotation.set(rx, 0, rz);
        m.userData = { contenu: c };
        contenu.add(m);
      };
      if (info.tex) poser(info); else info.attente.push(poser);
    };
    const pasF = (L - 0.3) / Math.max(1, fond.length);
    fond.forEach((c, i) => {
      const x = -((fond.length - 1) * pasF) / 2 + i * pasF;
      const rz = (i % 3 - 1) * 0.04;
      if (c.genre === "cahier") {
        const haut = c.kind === "carnet" ? 0.8 : 1.02, large = Math.min(pasF * 1.6, c.kind === "carnet" ? 0.5 : 0.68);
        const livre = new THREE.Mesh(new THREE.BoxGeometry(large, haut, 0.06), matieresCahier(c));
        livre.position.set(x, e + haut / 2 + 0.04, -0.13 + (i % 2) * 0.012);
        livre.rotation.set(-0.18, (i % 2 ? 1 : -1) * 0.04, rz);
        livre.userData = { contenu: c, jetable: true };
        livre.castShadow = true;
        contenu.add(livre);
      } else {
        planche(c, { x, y: H - 0.02, z: -0.12 + (i % 2) * 0.02, rx: -0.2, rz, haut: 0.62, largeMax: Math.min(0.78, pasF * 1.7) });
      }
    });
    const pasD = (L - 0.5) / Math.max(1, devant.length);
    devant.forEach((c, i) => {
      planche(c, {
        x: -((devant.length - 1) * pasD) / 2 + i * pasD, y: H + 0.02 + (i % 2) * 0.05, z: 0.15,
        rx: -0.34, rz: (i % 2 ? 1 : -1) * 0.1, haut: 0.62, largeMax: Math.min(0.5, pasD * 1.4)
      });
    });
  }

  /* Où est le sac : par terre, à droite de la chaise ; ou sur la table. */
  function posesSac(siege) {
    const a = siege.angle || 0;
    const tourne = (dx, dz) => [siege.x + dx * Math.cos(a) + dz * Math.sin(a), siege.z - dx * Math.sin(a) + dz * Math.cos(a)];
    const [xs, zs] = tourne(1.25, 0.35);
    const [xt, zt] = tourne(0.62, -1.05);
    return {
      sol: { x: xs, y: 0, z: zs, r: a - 1.35 },
      table: { x: xt, y: 2.24, z: zt, r: a }
    };
  }

  /* Un pas de l'animation du sac : on le prend, on le pose, il s'ouvre. */
  function animerSac(x, maintenant) {
    const sac = x.sac;
    if (!sac || !x.siege) return;
    const dt = Math.min(400, maintenant - (x.sacDernier || maintenant));
    x.sacDernier = maintenant;
    const cible = x.sacOuvert ? 1 : 0;
    const avant = x.sacP || 0;
    // Arrivé au bout (tout ouvert, ou tout fermé), on n'y touche plus : sinon
    // le rabat repart d'un cheveu à chaque image, et il tremble.
    x.sacP = cible === avant ? avant
      : cible > avant ? Math.min(1, avant + dt / 1300) : Math.max(0, avant - dt / 900);
    const t = x.sacP;
    const { sol, table } = posesSac(x.siege);
    // 0 → 0,3 : il se penche et attrape le sac ; 0,3 → 0,75 : il le monte
    // sur la table ; 0,75 → 1 : le rabat s'ouvre.
    const monte = Math.max(0, Math.min(1, (t - 0.3) / 0.45));
    const m = monte * monte * (3 - 2 * monte);
    sac.position.set(sol.x + (table.x - sol.x) * m, sol.y + (table.y - sol.y) * m + Math.sin(Math.PI * m) * 0.9, sol.z + (table.z - sol.z) * m);
    sac.rotation.y = sol.r + (table.r - sol.r) * m;
    const ouvre = Math.max(0, Math.min(1, (t - 0.75) / 0.25));
    sac.userData.rabat.rotation.x = -2.95 * ouvre * ouvre * (3 - 2 * ouvre);
    sac.userData.contenu.visible = ouvre > 0.3;
    // Le geste : le bras qui descend chercher le sac, la tête qui suit.
    const geste = t > 0 && t < 0.8 ? Math.sin(Math.PI * Math.min(1, t / 0.8)) : 0;
    if (geste > 0) {
      x.p.brasD.epaule.rotation.x = 0.55 * geste;
      x.p.brasD.epaule.rotation.z = -0.55 * geste;
      x.p.tete.rotation.x = 0.35 * geste;
      x.p.tete.rotation.y = -0.4 * geste;
    }
    // Sac ouvert : on regarde dedans.
    if (ouvre > 0.5 && !x.p.outil) x.p.tete.rotation.x = Math.max(x.p.tete.rotation.x, 0.3);
  }

  /* --- La salle : murs, sol, tableau. Refaite quand elle change de taille -- */
  const decor = new THREE.Group();
  scene.add(decor);

  const ardoiseMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .92 });
  const ardoiseVide = matDe("#22332c", { roughness: .95 });
  let ardoise = null;
  let texture = null, toileSuivie = null;
  function suivreToile() {
    const t = toile();
    if (t !== toileSuivie) {
      texture?.dispose();
      texture = null;
      toileSuivie = t;
      if (t) {
        texture = new THREE.CanvasTexture(t);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        ardoiseMat.map = texture;
        ardoiseMat.needsUpdate = true;
      }
    }
    if (ardoise) ardoise.material = texture ? ardoiseMat : ardoiseVide;
    if (texture) texture.needsUpdate = true;
  }

  const LT = 9.6, HT = LT * 9 / 16;
  let objetsProf = null;              // le plateau du bureau du professeur

  /* --- Dehors : ce qu'on voit par les fenêtres ------------------------------
     Un grand paysage peint, posé loin derrière le mur : le ciel, le Mur à
     l'horizon, les toits de la ville, des arbres. En se déplaçant, on le voit
     glisser derrière les carreaux, comme un vrai dehors. La nuit : étoiles,
     lune, et quelques fenêtres allumées en ville. */
  const cacheDehors = new Map();
  // Le paysage : loin, grand, l'horizon à hauteur d'yeux (un peu au-dessus).
  const HORIZON_DEHORS = 0.42, HAUT_DEHORS = 60, LOIN_DEHORS = 30, Y_HORIZON = 3.2;
  const Y_DEHORS = Y_HORIZON - HAUT_DEHORS / 2 + HORIZON_DEHORS * HAUT_DEHORS;
  function dehors(nuit) {
    if (cacheDehors.has(nuit)) return cacheDehors.get(nuit);
    const c = document.createElement("canvas");
    c.width = 2048; c.height = 1024;
    const g = c.getContext("2d");
    let graine_ = 7;
    const hasard = () => ((graine_ = (graine_ * 16807) % 2147483647) / 2147483647);
    const H = 1024, W = 2048, horizon = H * HORIZON_DEHORS;
    // Le ciel.
    const ciel = g.createLinearGradient(0, 0, 0, horizon);
    ciel.addColorStop(0, nuit ? "#070d19" : "#5d8fc9");
    ciel.addColorStop(.7, nuit ? "#122039" : "#a9c6e2");
    ciel.addColorStop(1, nuit ? "#223350" : "#e3ecf1");
    g.fillStyle = ciel; g.fillRect(0, 0, W, horizon + 4);
    if (nuit) {
      for (let i = 0; i < 420; i++) {
        g.fillStyle = `rgba(230,236,250,${.25 + hasard() * .7})`;
        const r = hasard() * 1.6 + .3;
        g.beginPath(); g.arc(hasard() * W, hasard() * horizon * .9, r, 0, Math.PI * 2); g.fill();
      }
      const lx = W * .68, ly = H * .16;
      const halo = g.createRadialGradient(lx, ly, 10, lx, ly, 140);
      halo.addColorStop(0, "rgba(240,232,205,.35)"); halo.addColorStop(1, "rgba(240,232,205,0)");
      g.fillStyle = halo; g.fillRect(lx - 140, ly - 140, 280, 280);
      g.fillStyle = "#efe7cf"; g.beginPath(); g.arc(lx, ly, 34, 0, Math.PI * 2); g.fill();
    } else {
      // Des nuages doux, étirés.
      for (let i = 0; i < 26; i++) {
        const x = hasard() * W, y = 60 + hasard() * horizon * .55, l = 120 + hasard() * 260;
        for (let k = 0; k < 7; k++) {
          const cx = x + (hasard() - .5) * l, cy = y + (hasard() - .5) * 26, r = 30 + hasard() * 50;
          const d = g.createRadialGradient(cx, cy, 0, cx, cy, r);
          d.addColorStop(0, "rgba(255,255,255,.55)"); d.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = d; g.fillRect(cx - r, cy - r, r * 2, r * 2);
        }
      }
    }
    // Les collines, au loin, bleuies par l'air.
    g.fillStyle = nuit ? "#1b2638" : "#9fb2c2";
    g.beginPath(); g.moveTo(0, horizon);
    for (let x = 0; x <= W; x += 32) g.lineTo(x, horizon - 30 - Math.sin(x / 190) * 18 - Math.sin(x / 71) * 7);
    g.lineTo(W, horizon + 10); g.lineTo(0, horizon + 10); g.fill();
    // Le Mur : une longue muraille de pierre claire, à l'horizon.
    const hautMur = horizon - 96, basMur = horizon + 6;
    const pierre = g.createLinearGradient(0, hautMur, 0, basMur);
    pierre.addColorStop(0, nuit ? "#3a4252" : "#b9ae97"); pierre.addColorStop(1, nuit ? "#2a303c" : "#8f846f");
    g.fillStyle = pierre; g.fillRect(0, hautMur, W, basMur - hautMur);
    g.fillStyle = nuit ? "rgba(0,0,0,.25)" : "rgba(80,70,55,.18)";
    for (let x = 0; x < W; x += 46) g.fillRect(x, hautMur, 2, basMur - hautMur);
    for (let y = hautMur + 14; y < basMur; y += 16) g.fillRect(0, y, W, 1.5);
    g.fillStyle = nuit ? "#454e60" : "#ddd5c4"; g.fillRect(0, hautMur - 6, W, 7);
    // La ville : des rangs de maisons, plus grandes à mesure qu'elles
    // approchent, de plus en plus nettes ; au loin, l'air les bleuit. Des
    // bouquets d'arbres, un clocher de temps en temps.
    const brume = nuit ? [16, 24, 38] : [186, 204, 220];
    const melange = (hex, k) => {
      const n = parseInt(hex.slice(1), 16);
      const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v + (brume[i] - v) * k));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    };
    const toits = nuit ? ["#1c1f28", "#23252e", "#191c24"] : ["#8e3f28", "#7a3a26", "#5d5552", "#a24f31", "#6a4231", "#874a2e"];
    const murs = nuit ? ["#262b36", "#2d3240", "#22262f"] : ["#e2d3b1", "#cdb894", "#c2ae8c", "#e8dcc0", "#b49f80", "#d9c7a2"];
    const feuillage = nuit ? ["#0d1512", "#101a15"] : ["#3f5a2f", "#4d6b36", "#35502a", "#5a7d40", "#2f4726"];
    const RANGS = 6;
    for (let rang = 0; rang < RANGS; rang++) {
      const k = rang / (RANGS - 1);
      const air = (1 - k) * 0.62;                       // la part de brume
      const echelle = 0.3 + k * k * 1.15;
      const base = horizon + 18 + (H * 0.84 - horizon - 18) * k ** 1.45;
      for (let x = -40; x < W + 40; ) {
        // Un bouquet d'arbres, parfois, à la place d'une maison.
        if (hasard() < 0.18) {
          const l = (60 + hasard() * 90) * echelle;
          for (let i = 0; i < 6; i++) {
            const r = (16 + hasard() * 18) * echelle;
            g.fillStyle = melange(feuillage[Math.floor(hasard() * feuillage.length)], air);
            g.beginPath(); g.arc(x + hasard() * l, base - r * (0.6 + hasard() * 0.8), r, 0, Math.PI * 2); g.fill();
          }
          x += l;
          continue;
        }
        const l = (54 + hasard() * 70) * echelle, h = (32 + hasard() * 40) * echelle, pointe = (18 + hasard() * 22) * echelle;
        g.fillStyle = melange(murs[Math.floor(hasard() * murs.length)], air);
        g.fillRect(x, base - h, l, h + 40 * echelle);
        // Le pignon à l'ombre, les colombages.
        g.fillStyle = nuit ? "rgba(0,0,0,.25)" : `rgba(60,40,20,${0.24 * (1 - air)})`;
        g.fillRect(x + l * .64, base - h, l * .36, h + 40 * echelle);
        if (!nuit && hasard() < .55 && echelle > .5) {
          g.strokeStyle = `rgba(70,45,28,${.6 * (1 - air)})`; g.lineWidth = Math.max(1, 2.2 * echelle);
          g.strokeRect(x + 2, base - h + 2, l - 4, h * .48);
          g.beginPath(); g.moveTo(x + 2, base - h + 2); g.lineTo(x + l * .5, base - h * .52); g.lineTo(x + l - 2, base - h + 2); g.stroke();
        }
        // Quelques fenêtres, avec leur volet : allumées la nuit, sombres le jour.
        const nbF = Math.max(1, Math.round(l / (34 * echelle)));
        for (let fy = base - h + 12 * echelle; fy < base - 14 * echelle; fy += 26 * echelle) {
          for (let i = 0; i < nbF; i++) {
            if (hasard() < (nuit ? .3 : .75)) {
              const fx = x + (i + .5) * l / nbF - 4 * echelle;
              g.fillStyle = nuit ? (hasard() < .6 ? "#f2b85a" : "#caa066") : melange("#2e3440", air);
              g.fillRect(fx, fy, 8 * echelle, 11 * echelle);
              if (!nuit && echelle > .6) { g.fillStyle = melange("#4b5d3e", air); g.fillRect(fx - 4 * echelle, fy, 3 * echelle, 11 * echelle); }
            }
          }
        }
        // Le toit, ses rangs de tuiles, son versant à l'ombre.
        const toit = toits[Math.floor(hasard() * toits.length)];
        g.fillStyle = melange(toit, air);
        g.beginPath(); g.moveTo(x - 6 * echelle, base - h); g.lineTo(x + l / 2, base - h - pointe); g.lineTo(x + l + 6 * echelle, base - h); g.fill();
        if (echelle > .55) {
          g.strokeStyle = `rgba(40,20,10,${.25 * (1 - air)})`; g.lineWidth = 1;
          for (let ty = base - h - pointe + 5 * echelle; ty < base - h; ty += 5 * echelle) {
            const f = (ty - (base - h - pointe)) / pointe;
            g.beginPath(); g.moveTo(x + l / 2 - (l / 2 + 6 * echelle) * f, ty); g.lineTo(x + l / 2 + (l / 2 + 6 * echelle) * f, ty); g.stroke();
          }
        }
        g.fillStyle = "rgba(0,0,0,.2)";
        g.beginPath(); g.moveTo(x + l / 2, base - h - pointe); g.lineTo(x + l + 6 * echelle, base - h); g.lineTo(x + l / 2, base - h); g.fill();
        if (hasard() < .35) {   // une cheminée
          g.fillStyle = melange(nuit ? "#15171d" : "#6b4a3a", air);
          g.fillRect(x + l * .7, base - h - pointe * .85, 8 * echelle, pointe * .6);
        }
        if (hasard() < .05 && rang > 0) {   // un clocher
          const cl = 26 * echelle, ch = 110 * echelle;
          g.fillStyle = melange(murs[0], air); g.fillRect(x + l * .3, base - h - ch, cl, ch);
          g.fillStyle = melange("#4a4f5a", air);
          g.beginPath(); g.moveTo(x + l * .3 - 4 * echelle, base - h - ch); g.lineTo(x + l * .3 + cl / 2, base - h - ch - 60 * echelle); g.lineTo(x + l * .3 + cl + 4 * echelle, base - h - ch); g.fill();
        }
        x += l + (hasard() * 12 - 2) * echelle;
      }
    }
    // Au premier plan, la cime des arbres de la cour, avec leur lumière.
    for (let i = 0; i < 80; i++) {
      const x = hasard() * W, y = H * .9 + hasard() * H * .1, r = 30 + hasard() * 55;
      g.fillStyle = nuit ? `rgba(10,16,14,${.8 + hasard() * .2})` : feuillage[Math.floor(hasard() * feuillage.length)];
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      if (!nuit) {
        g.fillStyle = "rgba(200,220,120,.12)";
        g.beginPath(); g.arc(x - r * .3, y - r * .35, r * .55, 0, Math.PI * 2); g.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    cacheDehors.set(nuit, t);
    return t;
  }
  /** Une couche de nuages qui glisse lentement (vitesse : tours de texture par seconde). */
  let texNuages = null;
  function coucheNuages(l, h, vitesse) {
    if (!texNuages) {
      const c = document.createElement("canvas"); c.width = 2048; c.height = 512;
      const g = c.getContext("2d");
      let gr = 11;
      const hasard = () => ((gr = (gr * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 22; i++) {
        const x = hasard() * 2048, y = 90 + hasard() * 300, l2 = 160 + hasard() * 320;
        for (let k = 0; k < 16; k++) {
          const cx = x + (hasard() - .5) * l2, cy = y + (hasard() - .5) * 40 - Math.abs(hasard() - .5) * 40, r = 34 + hasard() * 60;
          for (const dx of [-2048, 0, 2048]) {
            const d = g.createRadialGradient(cx + dx, cy, 0, cx + dx, cy, r);
            d.addColorStop(0, "rgba(255,255,255,.62)"); d.addColorStop(.6, "rgba(250,250,252,.28)"); d.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = d; g.fillRect(cx + dx - r, cy - r, r * 2, r * 2);
          }
          // Le dessous, un peu gris : du volume.
          const d2 = g.createRadialGradient(cx, cy + r * .5, 0, cx, cy + r * .5, r * .8);
          d2.addColorStop(0, "rgba(150,160,180,.12)"); d2.addColorStop(1, "rgba(150,160,180,0)");
          g.fillStyle = d2; g.fillRect(cx - r, cy - r * .3, r * 2, r * 1.6);
        }
      }
      texNuages = new THREE.CanvasTexture(c);
      texNuages.colorSpace = THREE.SRGBColorSpace;
      texNuages.wrapS = THREE.RepeatWrapping;
    }
    const t = texNuages.clone();
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    m.raycast = () => {};
    animes.push((s) => { t.offset.x = (s * vitesse) % 1; });
    return m;
  }
  /** Le verre : presque rien, un voile bleuté et deux reflets qui accrochent la lumière. */
  let texVitre = null;
  function matVitre() {
    if (!texVitre) {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const g = c.getContext("2d");
      g.fillStyle = "rgba(205,225,240,.07)"; g.fillRect(0, 0, 256, 256);
      for (const [x, l, a] of [[40, 70, .16], [150, 26, .12]]) {
        g.save(); g.translate(x, 0); g.rotate(0.35);
        const d = g.createLinearGradient(0, 0, l, 0);
        d.addColorStop(0, "rgba(255,255,255,0)"); d.addColorStop(.5, `rgba(255,255,255,${a})`); d.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = d; g.fillRect(0, -60, l, 420);
        g.restore();
      }
      texVitre = new THREE.CanvasTexture(c);
    }
    return new THREE.MeshBasicMaterial({ map: texVitre, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  }
  /* Une fenêtre ouverte dans le mur : l'embrasure (l'épaisseur du mur), le
     dormant, les petits bois, les carreaux. Le groupe regarde vers +z (la
     pièce) ; le dehors est derrière, vers -z. */
  function baie(l, h, { appui = true } = {}) {
    const g = new THREE.Group();
    const bois = matDe("#3a2d22", { roughness: .6 });
    const plate = matDe("#e9e2d2", { roughness: .9 });
    const P = 0.55;                                        // l'épaisseur du mur
    for (const [x, y, sx, sy] of [[-l / 2 - 0.04, 0, 0.08, h], [l / 2 + 0.04, 0, 0.08, h], [0, h / 2 + 0.04, l + 0.16, 0.08], [0, -h / 2 - 0.04, l + 0.16, 0.08]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, P), plate);
      e.position.set(x, y, -P / 2);
      e.receiveShadow = true;
      g.add(e);
    }
    const cadre = 0.13;
    for (const [x, y, sx, sy] of [[-l / 2 + cadre / 2, 0, cadre, h], [l / 2 - cadre / 2, 0, cadre, h], [0, h / 2 - cadre / 2, l, cadre], [0, -h / 2 + cadre / 2, l, cadre],
      [0, 0, 0.07, h], [0, h * 0.18, l, 0.07]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, 0.1), bois);
      m.position.set(x, y, -0.22);
      m.castShadow = true;
      g.add(m);
    }
    const verre = new THREE.Mesh(new THREE.PlaneGeometry(l - 0.1, h - 0.1), matVitre());
    verre.position.z = -0.25;
    verre.renderOrder = 2;
    g.add(verre);
    if (appui) {
      const tablette = new THREE.Mesh(boiteRonde(l + 0.5, 0.12, 0.42, 0.03), plate);
      tablette.position.set(0, -h / 2 - 0.06, 0.12);
      tablette.receiveShadow = true;
      g.add(tablette);
    }
    ombrer(g);
    return g;
  }

  /* --- Ce qui fait une vraie pièce ------------------------------------------
     Un plafond à poutres, une corniche, le quatrième mur et sa porte, des
     suspensions allumées, la carte des Murs ; le jour, des rayons de soleil
     où danse la poussière. On peut tourner la vue : il n'y a plus de vide. */
  const TEX_PIECE = {};
  function texPiece() {
    if (TEX_PIECE.plafond) return TEX_PIECE;
    TEX_PIECE.plafond = texturePeinte(512, 512, (g, l, h) => {
      g.fillStyle = "#e4dccb"; g.fillRect(0, 0, l, h);
      for (let i = 0; i < 7000; i++) {
        g.fillStyle = `rgba(${Math.random() > .5 ? "255,255,255" : "90,75,55"},${Math.random() * .045})`;
        g.fillRect(Math.random() * l, Math.random() * h, 2, 2);
      }
    }, [4, 4]);
    TEX_PIECE.porte = texturePeinte(256, 512, (g, l, h) => {
      veines(g, l, h, 22, 22);
      // Les panneaux moulurés : deux en haut, un grand en bas.
      for (const [x, y, w, hh] of [[24, 24, 208, 170], [24, 224, 208, 264]]) {
        g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, y, w, hh);
        g.strokeStyle = "rgba(255,220,180,.18)"; g.lineWidth = 3; g.strokeRect(x + 4, y + 4, w - 8, hh - 8);
        g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 2; g.strokeRect(x, y, w, hh);
      }
    });
    TEX_PIECE.carte = texturePeinte(1024, 768, (g, l, h) => {
      // Un parchemin : les trois Murs, Maria, Rose, Sina, et leurs districts.
      const fondP = g.createRadialGradient(l / 2, h / 2, 100, l / 2, h / 2, l * .7);
      fondP.addColorStop(0, "#e9dcb8"); fondP.addColorStop(1, "#bfa676");
      g.fillStyle = fondP; g.fillRect(0, 0, l, h);
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = `rgba(90,60,30,${Math.random() * .06})`;
        g.fillRect(Math.random() * l, Math.random() * h, 3, 3);
      }
      const cx = l / 2, cy = h / 2 + 10;
      g.strokeStyle = "#5a3d22"; g.fillStyle = "rgba(120,140,80,.18)";
      for (const [r, nom] of [[330, "MUR MARIA"], [220, "MUR ROSE"], [115, "MUR SINA"]]) {
        g.lineWidth = 7;
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.stroke();
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(cx, cy, r - 9, 0, Math.PI * 2); g.stroke();
        // Les districts : quatre saillies, aux points cardinaux.
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2;
          g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 26, a + Math.PI / 2, a - Math.PI / 2 + Math.PI * 2); g.lineWidth = 5; g.stroke();
        }
        g.fillStyle = "#4a3018"; g.font = "bold 22px Georgia, serif"; g.textAlign = "center";
        g.fillText(nom, cx, cy - r + 34);
        g.fillStyle = "rgba(120,140,80,.18)";
      }
      g.fillStyle = "#4a3018"; g.font = "italic 30px Georgia, serif"; g.textAlign = "center";
      g.fillText("Les Murs de l'humanité", cx, 46);
      // Les rivières.
      g.strokeStyle = "rgba(60,95,130,.55)"; g.lineWidth = 4;
      g.beginPath(); g.moveTo(40, 200); g.bezierCurveTo(260, 260, 380, 330, cx, cy); g.bezierCurveTo(640, 420, 820, 520, 990, 600); g.stroke();
      g.strokeStyle = "rgba(60,40,20,.6)"; g.lineWidth = 10; g.strokeRect(8, 8, l - 16, h - 16);
    });
    TEX_PIECE.rayon = (() => {
      const c = document.createElement("canvas"); c.width = 8; c.height = 256;
      const g = c.getContext("2d");
      const d = g.createLinearGradient(0, 0, 0, 256);
      d.addColorStop(0, "rgba(255,236,200,.55)"); d.addColorStop(.6, "rgba(255,230,190,.22)"); d.addColorStop(1, "rgba(255,230,190,0)");
      g.fillStyle = d; g.fillRect(0, 0, 8, 256);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    return TEX_PIECE;
  }

  /** Une suspension : la tige, l'abat-jour émaillé, l'ampoule qui brille. */
  function suspension(x, y, z, haut) {
    const g = new THREE.Group();
    const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, haut, 6), matDe("#1e1c1a", { metalness: .5, roughness: .4 }));
    tige.position.y = haut / 2;
    const abat = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.55, 28, 1, true), matDe("#2f4a3c", { metalness: .3, roughness: .35, side: THREE.DoubleSide }));
    abat.position.y = -0.2;
    const dedans = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.52, 28, 1, true), new THREE.MeshBasicMaterial({ color: "#fff1d6", side: THREE.BackSide }));
    dedans.position.y = -0.21;
    const ampoule = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshBasicMaterial({ color: "#fff6e2" }));
    ampoule.position.y = -0.48;
    if (!halo) bougie(new THREE.Group(), 0, 0, 0);       // prépare la texture du halo
    const lueur = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .55 }));
    lueur.scale.set(2.2, 2.2, 1);
    lueur.position.y = -0.5;
    g.add(tige, abat, dedans, ampoule, lueur);
    g.position.set(x, y, z);
    return g;
  }

  /** Un tapis rond : bordeaux, une bordure claire, un médaillon. */
  let texTapis = null;
  function tapisRond(r) {
    if (!texTapis) {
      texTapis = texturePeinte(1024, 1024, (g, l) => {
        const c = l / 2;
        const anneaux = [[512, "#5e1f1c"], [490, "#c9a86a"], [470, "#3f1514"], [430, "#7a2a24"], [200, "#c9a86a"], [184, "#4a1917"], [90, "#c9a86a"], [74, "#7a2a24"]];
        for (const [rr, col] of anneaux) { g.fillStyle = col; g.beginPath(); g.arc(c, c, rr, 0, Math.PI * 2); g.fill(); }
        // Les rinceaux : des pétales tout autour du médaillon.
        g.fillStyle = "rgba(201,168,106,.55)";
        for (let i = 0; i < 24; i++) {
          const a = i * Math.PI / 12;
          g.beginPath(); g.ellipse(c + Math.cos(a) * 300, c + Math.sin(a) * 300, 46, 14, a, 0, Math.PI * 2); g.fill();
        }
        for (let i = 0; i < 48; i++) {
          const a = i * Math.PI / 24;
          g.beginPath(); g.arc(c + Math.cos(a) * 450, c + Math.sin(a) * 450, 7, 0, Math.PI * 2); g.fill();
        }
        // La laine : un grain fin.
        for (let i = 0; i < 30000; i++) {
          g.fillStyle = `rgba(${Math.random() > .5 ? "255,230,200" : "0,0,0"},${Math.random() * .06})`;
          g.fillRect(Math.random() * l, Math.random() * l, 2, 2);
        }
      });
      texTapis.wrapS = texTapis.wrapT = THREE.ClampToEdgeWrapping;
    }
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 72), new THREE.MeshStandardMaterial({ map: texTapis, roughness: 1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.025;
    m.receiveShadow = true;
    return m;
  }

  /** Un lustre de fer forgé : une couronne, une chaîne, des bougies allumées. */
  function lustre(x, y, z, r) {
    const g = new THREE.Group();
    const fer = matDe("#24201c", { metalness: .7, roughness: .45 });
    const couronne = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 48), fer);
    couronne.rotation.x = Math.PI / 2;
    const petite = new THREE.Mesh(new THREE.TorusGeometry(r * 0.45, 0.04, 8, 32), fer);
    petite.rotation.x = Math.PI / 2; petite.position.y = 0.5;
    const chaine = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 13 - y, 6), fer);
    chaine.position.y = (13 - y) / 2;
    g.add(couronne, petite, chaine);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, Math.hypot(r * 0.55, 0.5), 5), fer);
      tige.position.set(Math.cos(a) * r * 0.72, 0.25, Math.sin(a) * r * 0.72);
      tige.lookAt(Math.cos(a) * r * 0.45, 0.5, Math.sin(a) * r * 0.45);
      tige.rotateX(Math.PI / 2);
      const bobeche = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.06, 12), fer);
      bobeche.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r);
      const support = new THREE.Group();
      support.position.set(Math.cos(a) * r, 0.06, Math.sin(a) * r);
      bougie(support, 0, 0, 0.4 + (i % 3) * 0.05);
      g.add(tige, bobeche, support);
    }
    const lumiere = new THREE.PointLight("#ffbf73", 9, 18, 2);
    lumiere.position.y = 0.3;
    g.add(lumiere);
    bougies.push({ lumiere, base: 9, phase: 2.1 });
    g.position.set(x, y, z);
    g.traverse((m) => { m.raycast = () => {}; });
    return g;
  }

  /** De lourds rideaux, de part et d'autre de chaque fenêtre du mur de gauche. */
  function rideaux(xMur, fond, avant) {
    const mat = new THREE.MeshStandardMaterial({ color: "#5a1d1b", roughness: .9, side: THREE.DoubleSide });
    // Des plis : un plan ondulé.
    const geo = new THREE.PlaneGeometry(1.4, 7.2, 14, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 11) * 0.09);
    geo.computeVertexNormals();
    const tringle = matDe("#9c7a3c", { metalness: .75, roughness: .3 });
    for (let z = fond + 5; z < avant - 1; z += 7) {
      for (const dz of [-2.75, 2.75]) {
        const r = new THREE.Mesh(geo, mat);
        r.position.set(xMur + 0.35, 4.75, z + dz);
        r.rotation.y = Math.PI / 2;
        r.castShadow = true;
        decor.add(r);
      }
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 7.4, 8), tringle);
      t.rotation.x = Math.PI / 2;
      t.position.set(xMur + 0.4, 8.4, z);
      decor.add(t);
    }
  }

  function habillerPiece({ largeur, fond, avant, profondeur, milieu, fenetres, mur, carte }) {
    const T = texPiece();
    const HAUT = 13;
    // Le plafond et ses poutres.
    const plafond = new THREE.Mesh(new THREE.PlaneGeometry(largeur + 2, profondeur), new THREE.MeshStandardMaterial({ map: T.plafond, roughness: 1 }));
    plafond.rotation.x = Math.PI / 2;
    plafond.position.set(0, HAUT, milieu);
    decor.add(plafond);
    const matPoutre = new THREE.MeshStandardMaterial({ map: TEX.lambris, roughness: .75, color: "#a58a6c" });
    for (let z = fond + 3; z < avant; z += 5) {
      const poutre = new THREE.Mesh(new THREE.BoxGeometry(largeur, 0.7, 0.6), matPoutre);
      poutre.position.set(0, HAUT - 0.35, z);
      decor.add(poutre);
    }
    // La corniche, tout autour.
    const matCorniche = matDe("#efe8d9", { roughness: .8 });
    for (const [l, x, z, ry] of [[largeur + 2, 0, fond + 0.15, 0], [largeur + 2, 0, avant - 0.15, 0], [profondeur, -largeur / 2 + 0.15, milieu, Math.PI / 2], [profondeur, largeur / 2 - 0.15, milieu, Math.PI / 2]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(l, 0.35, 0.3), matCorniche);
      c.position.set(x, HAUT - 0.18, z); c.rotation.y = ry;
      decor.add(c);
    }
    // Le quatrième mur, derrière soi, avec sa porte à deux battants.
    mur(largeur + 2, 0, avant, Math.PI);
    const porte = new THREE.Group();
    const matPorte = new THREE.MeshStandardMaterial({ map: T.porte, roughness: .55 });
    for (const cote of [-1, 1]) {
      const battant = new THREE.Mesh(new THREE.BoxGeometry(1.6, 6.4, 0.14), matPorte);
      battant.position.set(cote * 0.81, 3.2, 0);
      const poignee = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), matDe("#b8933f", { metalness: .8, roughness: .3 }));
      poignee.position.set(cote * 0.2, 3.1, -0.12);
      porte.add(battant, poignee);
    }
    const matChambranle = matDe("#3a2a1e", { roughness: .6 });
    for (const [x, y, l, h] of [[-1.75, 3.3, 0.28, 6.8], [1.75, 3.3, 0.28, 6.8], [0, 6.75, 3.78, 0.32]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(l, h, 0.3), matChambranle);
      c.position.set(x, y, 0);
      porte.add(c);
    }
    porte.position.set(largeur / 2 - 4, 0, avant - 0.08);
    ombrer(porte);
    decor.add(porte);
    // La carte des Murs, au mur de droite.
    if (carte) {
      const cadreC = new THREE.Mesh(boiteRonde(6.3, 4.8, 0.16, 0.04), matChambranle);
      const toile = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.5), new THREE.MeshStandardMaterial({ map: T.carte, roughness: .9 }));
      toile.position.z = 0.09;
      const c = new THREE.Group();
      c.add(cadreC, toile);
      c.position.set(largeur / 2 - 0.1, 6.2, milieu - 1);
      c.rotation.y = -Math.PI / 2;
      decor.add(c);
    }
    // Les suspensions, au-dessus de l'allée centrale.
    for (let z = fond + 5.5; z < avant - 3; z += 7.5) {
      for (const x of largeur > 22 ? [-largeur / 4, largeur / 4] : [0]) decor.add(suspension(x, 10.9, z, HAUT - 10.9));
    }
    // Le soleil entre par les fenêtres : un voile de lumière jusqu'au sol, et
    // la poussière qui y flotte.
    if (!nuitDehors && fenetres.length) rayonsDeSoleil(largeur, fenetres);
  }

  function rayonsDeSoleil(largeur, fenetres) {
    const T = texPiece();
    const dir = new THREE.Vector3(0.62, -0.62, -0.18).normalize();   // vers l'intérieur, vers le bas
    const mat = new THREE.MeshBasicMaterial({ map: T.rayon, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: .3, toneMapped: false });
    const poussiere = [];
    for (const zf of fenetres) {
      const x0 = -largeur / 2 + 0.1;
      // Le haut et le bas de l'ouverture, projetés jusqu'au sol.
      const coins = [[5.6 + 2.2, zf - 1.9], [5.6 + 2.2, zf + 1.9], [5.6 - 2.2, zf + 1.9], [5.6 - 2.2, zf - 1.9]];
      const pos = [], uv = [];
      for (const [y, z] of coins) {
        const k = y / -dir.y;
        pos.push(x0, y, z, x0 + dir.x * k, 0.02, z + dir.z * k);
      }
      // Quatre faces : chaque bord de la fenêtre balaie jusqu'au sol.
      const idx = [];
      for (let i = 0; i < 4; i++) {
        const a = i * 2, b = ((i + 1) % 4) * 2;
        idx.push(a, a + 1, b + 1, a, b + 1, b);
      }
      for (let i = 0; i < 4; i++) uv.push(0, 0, 0, 1);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const r = new THREE.Mesh(geo, mat);
      r.raycast = () => {};
      r.renderOrder = 3;
      decor.add(r);
      for (let i = 0; i < 60; i++) {
        const y = 0.6 + Math.random() * 6.8, k = y / -dir.y;
        const yHaut = 5.6 + (Math.random() - .5) * 4.2;
        const kk = (yHaut - y) / -dir.y;
        poussiere.push(x0 + dir.x * kk + (Math.random() - .5) * 0.6, y, zf + (Math.random() - .5) * 3.6 + dir.z * kk);
        void k;
      }
    }
    const geo = new THREE.BufferGeometry();
    const depart = new Float32Array(poussiere);
    geo.setAttribute("position", new THREE.Float32BufferAttribute(poussiere, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#fff3da", size: 0.05, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending }));
    points.raycast = () => {};
    decor.add(points);
    animes.push((s) => {
      const a = geo.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) {
        const ph = i * 0.37;
        a[i] = depart[i] + Math.sin(s * 0.21 + ph) * 0.25;
        a[i + 1] = depart[i + 1] + Math.sin(s * 0.13 + ph * 1.7) * 0.35;
        a[i + 2] = depart[i + 2] + Math.cos(s * 0.17 + ph) * 0.25;
      }
      geo.attributes.position.needsUpdate = true;
    });
  }

  function piece({ largeur, fond, avant, papier = TEX.mur, horloge: avecHorloge = true, fenetresFond = [], carte = true }) {
    const profondeur = avant - fond + 4;
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(largeur + 2, profondeur),
      new THREE.MeshStandardMaterial({ map: TEX.plancher, roughness: .78 }));
    sol.rotation.x = -Math.PI / 2;
    sol.position.set(0, 0, (fond + avant) / 2);
    sol.receiveShadow = true;
    decor.add(sol);

    const matMur = new THREE.MeshStandardMaterial({ map: papier, roughness: .95 });
    const matLambris = new THREE.MeshStandardMaterial({ map: TEX.lambris, roughness: .7 });
    // Un mur, percé de ses fenêtres. trous : [[x local, y, largeur, hauteur]].
    const mur = (l, x, z, ry, trous = []) => {
      let geo;
      if (trous.length) {
        const forme = new THREE.Shape();
        forme.moveTo(-l / 2, -6.5); forme.lineTo(l / 2, -6.5); forme.lineTo(l / 2, 6.5); forme.lineTo(-l / 2, 6.5); forme.lineTo(-l / 2, -6.5);
        for (const [cx, cy, tl, th] of trous) {
          const t = new THREE.Path();
          const y = cy - 6.5;
          t.moveTo(cx - tl / 2, y - th / 2); t.lineTo(cx - tl / 2, y + th / 2); t.lineTo(cx + tl / 2, y + th / 2); t.lineTo(cx + tl / 2, y - th / 2); t.lineTo(cx - tl / 2, y - th / 2);
          forme.holes.push(t);
        }
        geo = new THREE.ShapeGeometry(forme);
        // Les coordonnées de texture, comme sur un plan entier.
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + l / 2) / l, (pos.getY(i) + 6.5) / 13);
      } else geo = new THREE.PlaneGeometry(l, 13);
      const m = new THREE.Mesh(geo, matMur);
      m.position.set(x, 6.5, z); m.rotation.y = ry; m.receiveShadow = true;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(l, 1.8), matLambris);
      b.position.set(x, 0.9, z); b.rotation.y = ry; b.translateZ(0.02);
      const moulure = new THREE.Mesh(new THREE.BoxGeometry(l, 0.12, 0.08), matDe("#3a2a1e"));
      moulure.position.set(x, 1.82, z); moulure.rotation.y = ry; moulure.translateZ(0.04);
      decor.add(m, b, moulure);
    };
    // Les fenêtres, à gauche : de vraies ouvertures, et le dehors derrière.
    const milieu = (fond + avant) / 2;
    const fenetres = [];
    for (let z = fond + 5; z < avant - 1; z += 7) fenetres.push(z);
    mur(largeur + 2, 0, fond, 0, fenetresFond.map((f) => [f.x, f.y, f.l, f.h]));
    // Mur de gauche, tourné d'un quart : son x local va vers -z.
    mur(profondeur, -largeur / 2, milieu, Math.PI / 2, fenetres.map((z) => [-(z - milieu), 5.6, 4, 4.6]));
    mur(profondeur, largeur / 2, milieu, -Math.PI / 2);
    for (const z of fenetres) {
      const b = baie(4, 4.6);
      b.position.set(-largeur / 2, 5.6, z);
      b.rotation.y = Math.PI / 2;
      decor.add(b);
    }
    for (const f of fenetresFond) {
      const b = baie(f.l, f.h);
      b.position.set(f.x, f.y, fond);
      decor.add(b);
    }
    // Le paysage, loin derrière les murs percés ; devant lui, les nuages passent.
    if (fenetres.length) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(profondeur + 130, HAUT_DEHORS), new THREE.MeshBasicMaterial({ map: dehors(nuitDehors), toneMapped: false }));
      d.position.set(-largeur / 2 - LOIN_DEHORS, Y_DEHORS, milieu);
      d.rotation.y = Math.PI / 2;
      decor.add(d);
      if (!nuitDehors) {
        const n = coucheNuages(profondeur + 120, 26, 0.004);
        n.position.set(-largeur / 2 - LOIN_DEHORS + 3, Y_HORIZON + 15, milieu);
        n.rotation.y = Math.PI / 2;
        decor.add(n);
      }
    }
    if (fenetresFond.length) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(largeur + 130, HAUT_DEHORS), new THREE.MeshBasicMaterial({ map: dehors(nuitDehors), toneMapped: false }));
      d.position.set(0, Y_DEHORS, fond - LOIN_DEHORS);
      decor.add(d);
    }
    bornes = { x: largeur / 2 - 0.8, zMin: fond + 0.8, zMax: avant - 0.8, y: 12.2 };
    habillerPiece({ largeur, fond, avant, profondeur, milieu, fenetres, mur, carte });
    soleil.position.set(-largeur / 2 - 6, 16, (fond + avant) / 2 + 3);
    soleil.target.position.set(0, 0, (fond + avant) / 2 - 2);
    const demi = Math.max(largeur, profondeur) / 2 + 4;
    Object.assign(soleil.shadow.camera, { left: -demi, right: demi, top: demi, bottom: -demi, near: 1, far: 80 });
    soleil.shadow.camera.updateProjectionMatrix();

    if (!avecHorloge) return;
    // Une horloge, au-dessus du tableau.
    const horloge = new THREE.Group();
    const cadran = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 32), matDe("#f3efe4"));
    cadran.rotation.x = Math.PI / 2;
    const tour = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.06, 8, 32), matDe("#3a2d22"));
    const grande = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.02), matDe("#141416"));
    grande.position.set(0, 0.15, 0.06);
    const petite = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.02), matDe("#141416"));
    petite.rotation.z = -1.1; petite.position.set(0.12, 0.05, 0.06);
    horloge.add(cadran, tour, grande, petite);
    horloge.position.set(0, 8.7, fond + 0.1);
    decor.add(horloge);
  }

  function tableauAuMur(fond) {
    const cadre = new THREE.Mesh(boiteRonde(LT + 0.5, HT + 0.5, 0.2, 0.06), matBois);
    cadre.position.set(0, 4.9, fond + 0.15);
    cadre.castShadow = true;
    ardoise = new THREE.Mesh(new THREE.PlaneGeometry(LT, HT), texture ? ardoiseMat : ardoiseVide);
    ardoise.position.set(0, 4.9, fond + 0.28);
    ardoise.userData.tableau = true;
    const rebord = new THREE.Mesh(boiteRonde(LT + 0.3, 0.14, 0.4, 0.05), matBois);
    rebord.position.set(0, 4.9 - HT / 2 - 0.25, fond + 0.4);
    const craie = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), matDe("#f3f0e6"));
    craie.rotation.z = Math.PI / 2;
    craie.position.set(-2.8, rebord.position.y + 0.12, fond + 0.45);
    const brosse = new THREE.Mesh(boiteRonde(0.8, 0.22, 0.32, 0.05), matDe("#5b3f2a"));
    brosse.position.set(3, rebord.position.y + 0.16, fond + 0.45);
    decor.add(cadre, ardoise, rebord, craie, brosse);
  }

  /* --- Les places ----------------------------------------------------------
     Une place : où l'on s'assoit (x, z), vers où l'on regarde (angle), où
     l'on pose ses affaires (un repère tourné vers soi). */
  let dispo = { cle: "", sieges: [], reunion: false };

  function pupitre(x, z) {
    const g = new THREE.Group();
    const plateau = new THREE.Mesh(boiteRonde(2.6, 0.16, 1.5, 0.05), matBois);
    plateau.position.set(0, 2.15, -1.15);
    g.add(plateau);
    for (const [dx, dz] of [[-1.15, -1.75], [1.15, -1.75], [-1.15, -0.55], [1.15, -0.55]]) {
      const pied = new THREE.Mesh(GEO.pied, matMetal);
      pied.scale.y = 2.1; pied.position.set(dx, 1.05, dz);
      g.add(pied);
    }
    const assise = new THREE.Mesh(boiteRonde(1.5, 0.14, 1.3, 0.05), matBois);
    assise.position.set(0, 0.95, 0.35);
    g.add(assise);
    for (const [dx, dz] of [[-0.6, -0.2], [0.6, -0.2], [-0.6, 0.9], [0.6, 0.9]]) {
      const pied = new THREE.Mesh(GEO.pied, matMetal);
      pied.scale.y = 0.95; pied.position.set(dx, 0.47, dz);
      g.add(pied);
    }
    g.position.set(x, 0, z);
    ombrer(g);
    decor.add(g);
    const objets = new THREE.Group();
    objets.position.set(x, 2.24, z - 1.05);
    decor.add(objets);
    return { objets, groupe: g };
  }

  function chaise(x, z, angle) {
    const g = new THREE.Group();
    const assise = new THREE.Mesh(boiteRonde(1.5, 0.14, 1.4, 0.06), matBois);
    assise.position.y = 0.95;
    const dossier = new THREE.Mesh(boiteRonde(1.5, 1.3, 0.14, 0.06), matBois);
    dossier.position.set(0, 1.9, 0.68);
    dossier.rotation.x = -0.08;
    g.add(assise, dossier);
    for (const [dx, dz] of [[-0.6, -0.55], [0.6, -0.55], [-0.6, 0.6], [0.6, 0.6]]) {
      const pied = new THREE.Mesh(GEO.pied, matBois);
      pied.scale.y = 0.95; pied.position.set(dx, 0.47, dz);
      g.add(pied);
    }
    g.position.set(x, 0, z);
    g.rotation.y = angle;
    ombrer(g);
    decor.add(g);
  }

  const colonnesPour = (n) => (n <= 16 ? 4 : n <= 25 ? 5 : 6);

  function construireClasse(n) {
    const cols = colonnesPour(n);
    const rangs = Math.max(2, Math.ceil(n / cols));
    const pasX = 3.6, pasZ = 3.3, fond = -10;
    const largeur = Math.max(19, cols * pasX + 5);
    const dernier = -4.6 + (rangs - 1) * pasZ;
    piece({ largeur, fond, avant: dernier + 14 });
    tableauAuMur(fond);

    const estrade = new THREE.Mesh(boiteRonde(Math.min(largeur - 3, 15), 0.4, 3.2, 0.06),
      new THREE.MeshStandardMaterial({ map: TEX.plancher, roughness: .8 }));
    estrade.position.set(0, 0.2, fond + 1.7);
    estrade.receiveShadow = true;
    decor.add(estrade);
    const bp = new THREE.Group();
    const plateauProf = new THREE.Mesh(boiteRonde(4, 0.2, 1.8, 0.05), matBois);
    plateauProf.position.y = 2.6;
    const caisson = new THREE.Mesh(boiteRonde(3.8, 2.2, 0.15, 0.03), matBois);
    caisson.position.set(0, 1.5, 0.8);
    bp.add(plateauProf, caisson);
    bp.position.set(-4.6, 0.4, fond + 2.4);
    bp.rotation.y = 0.12;
    ombrer(bp);
    decor.add(bp);
    objetsProf = new THREE.Group();
    objetsProf.position.set(-4.6, 3.12, fond + 2.4);
    objetsProf.rotation.y = Math.PI + 0.12;     // tourné vers celui qui s'y tient
    decor.add(objetsProf);

    const sieges = [];
    for (let r = 0; r < rangs; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * pasX, z = -4.6 + r * pasZ;
        sieges.push({ x, z: z + 0.35, angle: 0, ...pupitre(x, z) });
      }
    }
    // Les premiers rangs d'abord, le milieu avant les bords.
    sieges.sort((a, b) => (a.z - b.z) || (Math.abs(a.x) - Math.abs(b.x)));
    return { sieges, rangs, cols, dernier, fond, prof: { x: 6.4, z: fond + 1.9 } };
  }

  /* --- Le portrait : on se regarde, debout, qui tourne lentement ---------- */
  function construirePortrait() {
    const sol = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshStandardMaterial({ map: TEX.plancher, roughness: .8 }));
    sol.rotation.x = -Math.PI / 2;
    sol.receiveShadow = true;
    const fond = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshStandardMaterial({ color: "#2a2d31", roughness: 1 }));
    fond.position.set(0, 6, -6);
    decor.add(sol, fond);
    soleil.position.set(-5, 10, 8);
    soleil.target.position.set(0, 1.5, 0);
    Object.assign(soleil.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
    soleil.shadow.camera.updateProjectionMatrix();
    return { sieges: [{ x: 0, z: 0, angle: Math.PI, objets: new THREE.Group() }], fond: -6 };
  }

  /* --- Chez soi : une chambre avec son bureau ------------------------------
     Le bureau contre le mur, sous la fenêtre ; des bougies, une bibliothèque,
     le lit, un tapis, la carte des Murs épinglée. On y est assis, de dos. */
  /* Une bougie de cire, sa mèche, sa flamme et son halo, posée dans `groupe`. */
  let bougies = [];
  let halo = null;
  // Ce qui bouge dans le décor (poussière, nuages, fumées) : une fonction par chose.
  let animes = [];
  // Chez soi seulement : la nuit tombe dehors (la classe, elle, a cours de jour).
  let nuitDehors = false;
  function bougie(groupe, x, y, haut) {
    const cire = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, haut, 16), matDe("#efe4cc", { roughness: .55 }));
    cire.position.set(x, y + haut / 2, 0);
    // Une coulure de cire sur le côté.
    const coulure = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.12, 4, 8), matDe("#f3ead6", { roughness: .5 }));
    coulure.position.set(x + 0.07, y + haut - 0.1, 0.02);
    const meche = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 5), matDe("#1c1714"));
    meche.position.set(x, y + haut + 0.03, 0);
    const flamme = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10),
      new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, opacity: .95 }));
    flamme.scale.set(1, 2.3, 1);
    flamme.position.set(x, y + haut + 0.11, 0);
    const coeur = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: "#fffbef" }));
    coeur.scale.set(1, 1.8, 1);
    coeur.position.set(x, y + haut + 0.085, 0);
    if (!halo) {
      const t = document.createElement("canvas"); t.width = t.height = 64;
      const g = t.getContext("2d");
      const d = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      d.addColorStop(0, "rgba(255,210,130,.9)"); d.addColorStop(.35, "rgba(255,170,70,.35)"); d.addColorStop(1, "rgba(255,140,40,0)");
      g.fillStyle = d; g.fillRect(0, 0, 64, 64);
      halo = new THREE.CanvasTexture(t);
      halo.colorSpace = THREE.SRGBColorSpace;
    }
    const lueurH = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    lueurH.scale.set(0.55, 0.7, 1);
    lueurH.position.set(x, y + haut + 0.12, 0);
    groupe.add(cire, coulure, meche, flamme, coeur, lueurH);
    bougies.push({ flamme, coeur, lueurH, phase: Math.random() * 6 });
  }

  function construireMaison() {
    const fond = -8, largeur = 17;
    const h = new Date().getHours();
    nuitDehors = h < 7 || h >= 19;
    piece({ largeur, fond, avant: 7, papier: TEX.papierPeint, horloge: false,
      fenetresFond: [{ x: 0, y: 6.1, l: 5.2, h: 4 }] });

    // La fenêtre au-dessus du bureau : le jour, ou la nuit, à l'heure qu'il est.
    // La nuit, ce sont les bougies qui éclairent.
    const nuit = nuitDehors;
    soleil.intensity = nuit ? 0.35 : 2.4;
    ciel.intensity = nuit ? 0.55 : 1.1;
    plafonnier.intensity = nuit ? 4 : 18;
    // (La fenêtre elle-même est percée par piece() : on y voit dehors.)

    // Le bureau : un plateau épais, deux caissons, un tiroir.
    const bureau = new THREE.Group();
    const plateau = new THREE.Mesh(boiteRonde(5.2, 0.2, 2.4, 0.05), matBois);
    plateau.position.y = 2.15;
    bureau.add(plateau);
    for (const x of [-2.1, 2.1]) {
      const caisson = new THREE.Mesh(boiteRonde(0.9, 2.05, 2.2, 0.04), matBois);
      caisson.position.set(x, 1.03, 0);
      bureau.add(caisson);
      for (const y of [0.5, 1.2, 1.8]) {
        const poignee = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), matDe("#b8963a", { metalness: .7, roughness: .35 }));
        poignee.position.set(x, y, 1.12);
        bureau.add(poignee);
      }
    }
    bureau.position.set(0, 0, fond + 1.35);
    ombrer(bureau);
    decor.add(bureau);

    // Des bougies, pas de lampe : un chandelier de laiton à trois branches à
    // gauche, une bougie seule dans sa coupelle à droite. Les flammes vacillent.
    const laiton = matDe("#9c7a3c", { metalness: .75, roughness: .3 });
    const chandelier = new THREE.Group();
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.1, 24), laiton);
    const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.95, 12), laiton);
    tige.position.y = 0.52;
    const noeudT = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), laiton);
    noeudT.position.y = 0.55;
    chandelier.add(pied, tige, noeudT);
    const brasC = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 24, Math.PI), laiton);
    brasC.rotation.z = Math.PI;
    brasC.position.y = 1.02;
    chandelier.add(brasC);
    const branches = [[-0.42, 1.0, 0.55], [0, 1.0, 0.72], [0.42, 1.0, 0.5]];
    for (const [x, , haut] of branches) {
      const coupe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.08, 16), laiton);
      coupe.position.set(x, x === 0 ? 1.0 : 1.02, 0);
      chandelier.add(coupe);
      bougie(chandelier, x, (x === 0 ? 1.04 : 1.06), haut);
    }
    chandelier.position.set(-1.75, 2.25, fond + 0.95);
    ombrer(chandelier);
    const seule = new THREE.Group();
    const coupelle = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.05, 20), laiton);
    const anse = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), laiton);
    anse.position.set(0.3, 0.03, 0); anse.rotation.x = Math.PI / 2;
    seule.add(coupelle, anse);
    bougie(seule, 0, 0.03, 0.38);
    seule.position.set(1.95, 2.25, fond + 1.0);
    ombrer(seule);
    decor.add(chandelier, seule);
    // Leur lumière, chaude et basse : elle bouge avec les flammes.
    const lueur = new THREE.PointLight("#ffb866", 7, 9, 2);
    lueur.position.set(-1.7, 3.6, fond + 1.3);
    const lueur2 = new THREE.PointLight("#ffb866", 2.6, 6, 2);
    lueur2.position.set(1.95, 3.0, fond + 1.3);
    decor.add(lueur, lueur2);
    bougies.push({ lumiere: lueur, base: 7, phase: 0.3 }, { lumiere: lueur2, base: 2.6, phase: 2.1 });

    // La chaise, dossier vers nous.
    chaise(0, fond + 3.15, 0);

    // La bibliothèque, contre le mur de droite.
    const biblio = new THREE.Group();
    const montant = (x) => { const m = new THREE.Mesh(boiteRonde(0.16, 7, 1.6, 0.03), matBois); m.position.set(x, 3.5, 0); return m; };
    biblio.add(montant(-1.7), montant(1.7));
    const teintes = ["#6b1f24", "#1f2f55", "#2c3b2a", "#8a6a2a", "#3a2a4a", "#5a3a22", "#2b2b30", "#7a5a3a"];
    for (const y of [0.3, 1.9, 3.5, 5.1, 6.9]) {
      const e = new THREE.Mesh(boiteRonde(3.5, 0.14, 1.6, 0.03), matBois);
      e.position.set(0, y, 0);
      biblio.add(e);
      if (y > 6) continue;
      let x = -1.5;
      while (x < 1.4) {
        const l = 0.14 + Math.random() * 0.12, h = 1.05 + Math.random() * 0.35;
        const livre = new THREE.Mesh(new THREE.BoxGeometry(l, h, 1.1), matDe(teintes[Math.floor(Math.random() * teintes.length)], { roughness: .7 }));
        livre.position.set(x + l / 2, y + 0.07 + h / 2, 0.1);
        if (Math.random() > .88) { livre.rotation.z = 0.25; livre.position.y -= 0.05; }
        biblio.add(livre);
        x += l + 0.02;
      }
    }
    biblio.position.set(6.2, 0, fond + 0.95);
    ombrer(biblio);
    decor.add(biblio);

    // Le lit, à gauche : un cadre, un matelas, une couverture, un oreiller.
    const lit = new THREE.Group();
    const cadreLit = new THREE.Mesh(boiteRonde(3.4, 0.9, 6.4, 0.06), matBois);
    cadreLit.position.y = 0.65;
    const matelas = new THREE.Mesh(boiteRonde(3.2, 0.5, 6.2, 0.2), matDe("#e9e4d8", { roughness: .95 }));
    matelas.position.y = 1.3;
    const couverture = new THREE.Mesh(boiteRonde(3.36, 0.3, 4.2, 0.12), matDe("#4d5f7a", { roughness: .95 }));
    couverture.position.set(0, 1.5, 0.95);
    const oreiller = new THREE.Mesh(boiteRonde(2.4, 0.4, 1.1, 0.2), matDe("#f2efe6", { roughness: .95 }));
    oreiller.position.set(0, 1.72, -2.3);
    const tete = new THREE.Mesh(boiteRonde(3.4, 2.4, 0.2, 0.06), matBois);
    tete.position.set(0, 1.6, -3.2);
    lit.add(cadreLit, matelas, couverture, oreiller, tete);
    lit.position.set(-largeur / 2 + 2.2, 0, fond + 4.3);
    ombrer(lit);
    decor.add(lit);

    // Le tapis sous le bureau.
    const tapis = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), new THREE.MeshStandardMaterial({
      map: texturePeinte(256, 192, (g, l, h) => {
        g.fillStyle = "#6e2a26"; g.fillRect(0, 0, l, h);
        g.strokeStyle = "#d8b98a"; g.lineWidth = 6; g.strokeRect(12, 12, l - 24, h - 24);
        g.strokeStyle = "rgba(216,185,138,.6)"; g.lineWidth = 2; g.strokeRect(24, 24, l - 48, h - 48);
        g.fillStyle = "rgba(216,185,138,.45)";
        for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(l / 2, h / 2, 60 - i * 11, 36 - i * 7, 0, 0, 7); g.fill(); }
      }), roughness: 1 }));
    tapis.rotation.x = -Math.PI / 2;
    tapis.position.set(0, 0.02, fond + 3.3);
    tapis.receiveShadow = true;
    decor.add(tapis);

    // La carte des Murs, épinglée à droite de la fenêtre.
    const carte = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshStandardMaterial({
      map: texturePeinte(320, 240, (g, l, h) => {
        g.fillStyle = "#e8dcc0"; g.fillRect(0, 0, l, h);
        for (const [r, c] of [[100, "#8a6a3a"], [66, "#5f7a4a"], [34, "#8a3a2a"]]) {
          g.strokeStyle = c; g.lineWidth = 4; g.beginPath(); g.arc(l / 2, h / 2 + 6, r, 0, 7); g.stroke();
        }
        g.fillStyle = "#3a2a1a"; g.font = "bold 18px Georgia"; g.fillText("PARADIS", 12, 24);
      }), roughness: .9 }));
    carte.position.set(-4.3, 6.0, fond + 0.05);
    const punaise = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), matDe("#a82a2a"));
    punaise.position.set(-4.3, 6.8, fond + 0.1);
    decor.add(carte, punaise);

    // Une plante, dans le coin.
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.9, 20), matDe("#8a4a2a"));
    pot.position.set(3.3, 0.45, fond + 1.0);
    decor.add(pot);
    for (let i = 0; i < 9; i++) {
      const feuille = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), matDe(i % 2 ? "#3f6b3a" : "#4f7d45"));
      feuille.scale.set(0.5, 1.4, 0.2);
      const a = (i / 9) * Math.PI * 2;
      feuille.position.set(3.3 + Math.cos(a) * 0.3, 1.35 + (i % 3) * 0.2, fond + 1.0 + Math.sin(a) * 0.3);
      feuille.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
      decor.add(feuille);
    }
    // Ses affaires : sur le bureau, devant la chaise.
    const objets = new THREE.Group();
    objets.position.set(0, 2.27, fond + 1.75);
    decor.add(objets);
    return { sieges: [{ x: 0, z: fond + 3.0, angle: 0, objets }], fond };
  }

  function construireReunion(total) {
    const R = Math.max(2.8, total * 2.5 / (2 * Math.PI));
    const fond = -R - 7;
    piece({ largeur: Math.max(20, 2 * R + 12), fond, avant: R + 9 });
    tableauAuMur(fond);

    // La table ronde : un plateau épais, un fût, un socle.
    const table = new THREE.Group();
    const plateau = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.18, 96), matTable);
    plateau.position.y = 2.15;
    const chant = new THREE.Mesh(new THREE.TorusGeometry(R, 0.09, 8, 96), matTable);
    chant.rotation.x = Math.PI / 2;
    chant.position.y = 2.15;
    const fut = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 2.05, 24), matTable);
    fut.position.y = 1.05;
    const socle = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.16, 32), matTable);
    socle.position.y = 0.08;
    table.add(plateau, chant, fut, socle);
    ombrer(table);
    decor.add(table);
    // Au centre : un chandelier de laiton allumé, une pile de dossiers, un encrier.
    const laitonT = matDe("#9c7a3c", { metalness: .75, roughness: .3 });
    const centre = new THREE.Group();
    const piedC = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.08, 24), laitonT);
    const tigeC = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.75, 12), laitonT);
    tigeC.position.y = 0.42;
    const brasC = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 8, 24, Math.PI), laitonT);
    brasC.rotation.z = Math.PI; brasC.position.y = 0.82;
    centre.add(piedC, tigeC, brasC);
    for (const [x, h] of [[-0.36, 0.42], [0, 0.55], [0.36, 0.4]]) {
      const coupe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.06, 14), laitonT);
      coupe.position.set(x, 0.82, 0);
      centre.add(coupe);
      bougie(centre, x, 0.85, h);
    }
    centre.position.set(0, 2.24, 0);
    const dossiers = new THREE.Group();
    ["#6b4a2a", "#2f4a3a", "#7a2a22"].forEach((c, i) => {
      const d = new THREE.Mesh(boiteRonde(1.0, 0.07, 1.3, 0.02), matDe(c, { roughness: .8 }));
      d.position.set(0, i * 0.075, 0); d.rotation.y = (i - 1) * 0.18;
      dossiers.add(d);
    });
    dossiers.position.set(-0.95, 2.28, 0.55);
    ombrer(centre); ombrer(dossiers);
    decor.add(centre, dossiers);
    const lueurT = new THREE.PointLight("#ffb866", 5, 10, 2);
    lueurT.position.set(0, 3.8, 0);
    decor.add(lueurT);
    bougies.push({ lumiere: lueurT, base: 5, phase: 1.3 });

    // Sous la table, un grand tapis ; au-dessus, un lustre de fer aux bougies allumées.
    decor.add(tapisRond(R + 3.4));
    decor.add(lustre(0, 10.6, 0, Math.min(2.2, R * 0.55)));
    // Des rideaux lourds de part et d'autre des fenêtres.
    rideaux(-Math.max(20, 2 * R + 12) / 2, fond, R + 9);

    const sieges = [];
    for (let i = 0; i < total; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / total;
      const d = R + 1.15;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const angle = Math.PI / 2 - a;          // tourné vers le centre
      // Pas de chaise à sa propre place : on y est assis, c'est la caméra.
      if (i !== 0) chaise(x, z, angle);
      const objets = new THREE.Group();
      objets.position.set(Math.cos(a) * (R - 0.85), 2.25, Math.sin(a) * (R - 0.85));
      objets.rotation.y = angle;
      decor.add(objets);
      sieges.push({ x, z, angle, objets, i });
    }
    const tete = sieges[Math.floor(total / 2)];
    // Les autres : d'abord en face (on voit leur visage), puis sur les côtés.
    const autres = sieges.filter((s) => s.i !== 0 && s !== tete).sort((a, b) => a.z - b.z);
    return { sieges: autres, tete, R, fond };
  }

  /* --- Les lumières par défaut : chaque décor règle les siennes ------------ */
  function lumieresParDefaut() {
    scene.background = new THREE.Color("#171a1d");
    scene.fog = null;
    ciel.color.set("#fff4e4"); ciel.groundColor.set("#3a2c22"); ciel.intensity = 1.1;
    soleil.color.set("#ffe9cc"); soleil.intensity = 2.4;
    plafonnier.intensity = 18;
    scene.environmentIntensity = 0.38;
  }

  /* --- Le palais : la salle du trône ---------------------------------------
     Un sol de marbre, des colonnes, des bannières, un tapis rouge qui mène à
     l'estrade. Le souverain siège au fond, sur son trône. Sa cour se tient
     debout devant lui, en arc de cercle ; ceux qui ne tiennent plus dans
     l'arc s'assoient sur les bancs, de part et d'autre. */
  const TEX_PALAIS = {};
  function texPalais() {
    if (TEX_PALAIS.marbre) return TEX_PALAIS;
    TEX_PALAIS.marbre = texturePeinte(512, 512, (g, l, h) => {
      const c = l / 4;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        g.fillStyle = (i + j) % 2 ? "#d9d2c3" : "#5a5550";
        g.fillRect(i * c, j * c, c, c);
        for (let k = 0; k < 7; k++) {
          g.strokeStyle = (i + j) % 2 ? "rgba(120,110,95,.18)" : "rgba(230,225,215,.12)";
          g.lineWidth = 1 + Math.random() * 1.5;
          g.beginPath();
          let x = i * c + Math.random() * c, y = j * c;
          g.moveTo(x, y);
          for (let n = 0; n < 6; n++) { x += (Math.random() - .5) * 30; y += c / 6; g.lineTo(x, y); }
          g.stroke();
        }
      }
      g.fillStyle = "rgba(0,0,0,.25)";
      for (let i = 0; i <= 4; i++) { g.fillRect(i * c - 1, 0, 2, h); g.fillRect(0, i * c - 1, l, 2); }
    }, [7, 8]);
    TEX_PALAIS.pierre = texturePeinte(512, 512, (g, l, h) => {
      g.fillStyle = "#a59c8c"; g.fillRect(0, 0, l, h);
      const rangs = 8;
      for (let r = 0; r < rangs; r++) {
        const y = r * h / rangs, decal = r % 2 ? 64 : 0;
        for (let x = -decal; x < l; x += 128) {
          const v = 150 + Math.floor(Math.random() * 30);
          g.fillStyle = `rgb(${v},${v - 8},${v - 22})`;
          g.fillRect(x + 2, y + 2, 124, h / rangs - 4);
        }
      }
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = `rgba(${Math.random() > .5 ? "255,255,255" : "40,35,30"},${Math.random() * .06})`;
        g.fillRect(Math.random() * l, Math.random() * h, 2, 2);
      }
    }, [5, 3]);
    TEX_PALAIS.banniere = texturePeinte(256, 640, (g, l, h) => {
      g.fillStyle = "#7d0f1c"; g.fillRect(0, 0, l, h);
      g.strokeStyle = "#d4a93a"; g.lineWidth = 10; g.strokeRect(14, 14, l - 28, h - 80);
      // La pointe, en bas.
      g.clearRect(0, h - 60, l, 60);
      g.fillStyle = "#7d0f1c";
      g.beginPath(); g.moveTo(0, h - 60); g.lineTo(l / 2, h); g.lineTo(l, h - 60); g.fill();
      // Les armes du royaume : un écu, une couronne, deux épées croisées.
      const cx = l / 2, cy = h * 0.42;
      g.strokeStyle = "#d4a93a"; g.lineWidth = 8;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx - 70 * s, cy + 90); g.lineTo(cx + 70 * s, cy - 90); g.stroke(); }
      g.fillStyle = "#d4a93a";
      g.beginPath(); g.moveTo(cx - 52, cy - 50); g.lineTo(cx + 52, cy - 50); g.lineTo(cx + 52, cy + 20);
      g.quadraticCurveTo(cx, cy + 90, cx - 52, cy + 20); g.fill();
      g.fillStyle = "#7d0f1c";
      g.beginPath(); g.moveTo(cx - 32, cy - 30); g.lineTo(cx + 32, cy - 30); g.lineTo(cx + 32, cy + 12);
      g.quadraticCurveTo(cx, cy + 58, cx - 32, cy + 12); g.fill();
      g.fillStyle = "#d4a93a";
      g.beginPath(); g.moveTo(cx - 40, cy - 96); g.lineTo(cx - 40, cy - 62); g.lineTo(cx + 40, cy - 62); g.lineTo(cx + 40, cy - 96);
      g.lineTo(cx + 20, cy - 78); g.lineTo(cx, cy - 104); g.lineTo(cx - 20, cy - 78); g.fill();
    });
    TEX_PALAIS.tapis = texturePeinte(128, 512, (g, l, h) => {
      g.fillStyle = "#8f1322"; g.fillRect(0, 0, l, h);
      g.fillStyle = "#d4a93a"; g.fillRect(0, 0, 10, h); g.fillRect(l - 10, 0, 10, h);
      g.fillStyle = "rgba(0,0,0,.12)";
      for (let i = 0; i < 2600; i++) g.fillRect(Math.random() * l, Math.random() * h, 1.5, 1.5);
    }, [1, 6]);
    return TEX_PALAIS;
  }

  function construireTrone(total) {
    lumieresParDefaut();
    const T = texPalais();
    const fond = -16, avant = 16, largeur = 26;
    scene.background = new THREE.Color("#120d0b");
    scene.fog = new THREE.Fog("#1a120c", 30, 70);
    ciel.color.set("#f2dcc0"); ciel.groundColor.set("#2a1a12"); ciel.intensity = 0.75;
    soleil.intensity = 1.3;
    plafonnier.intensity = 0;
    soleil.position.set(-largeur / 2 + 2, 22, 4);
    soleil.target.position.set(0, 0, -4);
    Object.assign(soleil.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 70 });
    soleil.shadow.camera.updateProjectionMatrix();

    const sol = new THREE.Mesh(new THREE.PlaneGeometry(largeur, avant - fond),
      new THREE.MeshStandardMaterial({ map: T.marbre, roughness: .35, metalness: .05 }));
    sol.rotation.x = -Math.PI / 2;
    sol.position.set(0, 0, (fond + avant) / 2);
    sol.receiveShadow = true;
    decor.add(sol);
    const matPierre = new THREE.MeshStandardMaterial({ map: T.pierre, roughness: .92 });
    const H = 17;
    const mur = (l, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(l, H), matPierre);
      m.position.set(x, H / 2, z); m.rotation.y = ry; m.receiveShadow = true;
      decor.add(m);
    };
    mur(largeur, 0, fond, 0);
    mur(avant - fond, -largeur / 2, (fond + avant) / 2, Math.PI / 2);
    mur(avant - fond, largeur / 2, (fond + avant) / 2, -Math.PI / 2);
    bornes = { x: largeur / 2 - 1, zMin: fond + 1, zMax: avant - 0.8, y: H - 1 };
    // Le mur d'entrée et ses grandes portes ; un plafond à caissons ; deux lustres.
    mur(largeur, 0, avant, Math.PI);
    const portes = new THREE.Group();
    const matPorteP = new THREE.MeshStandardMaterial({ map: texPiece().porte, roughness: .5, color: "#c9a27a" });
    for (const cote of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, 9, 0.2), matPorteP);
      b.position.set(cote * 1.22, 4.5, 0);
      portes.add(b);
    }
    const arc = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.3, 10, 32, Math.PI), matieresRoyales().or);
    arc.position.set(0, 9, 0.1);
    const montantG = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.5), matieresRoyales().or);
    montantG.position.set(-2.6, 4.5, 0.1);
    const montantD = montantG.clone(); montantD.position.x = 2.6;
    portes.add(arc, montantG, montantD);
    portes.position.set(0, 0, avant - 0.1);
    portes.rotation.y = Math.PI;
    ombrer(portes);
    decor.add(portes);
    const plafondP = new THREE.Mesh(new THREE.PlaneGeometry(largeur, avant - fond), new THREE.MeshStandardMaterial({ map: T.pierre, roughness: .9, color: "#b8a890" }));
    plafondP.rotation.x = Math.PI / 2;
    plafondP.position.set(0, H, (fond + avant) / 2);
    decor.add(plafondP);
    for (let z = fond + 2; z < avant; z += 4) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(largeur, 0.8, 0.5), matDe("#3a2a1e", { roughness: .7 }));
      p.position.set(0, H - 0.4, z);
      decor.add(p);
    }
    decor.add(lustre(0, 12.5, 2, 2.2), lustre(0, 12.5, 10, 2.2));

    // Les colonnes, leurs chapiteaux, et une bannière entre chacune.
    const matColonne = matDe("#d8d0c0", { roughness: .5 });
    const or = matieresRoyales().or;
    const matBanniere = new THREE.MeshStandardMaterial({ map: T.banniere, roughness: .85, side: THREE.DoubleSide, transparent: true, alphaTest: .5 });
    for (const cote of [-1, 1]) {
      for (let z = fond + 4; z < avant - 2; z += 6) {
        const x = cote * (largeur / 2 - 2);
        const fut = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 13, 20), matColonne);
        fut.position.set(x, 6.5, z);
        const base = new THREE.Mesh(boiteRonde(1.7, 0.6, 1.7, 0.08), matColonne);
        base.position.set(x, 0.3, z);
        const chap = new THREE.Mesh(boiteRonde(1.8, 0.7, 1.8, 0.1), matColonne);
        chap.position.set(x, 13.2, z);
        decor.add(fut, base, chap);
        if (z + 3 < avant - 2) {
          const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 6), matBanniere);
          b.position.set(cote * (largeur / 2 - 0.12), 8.5, z + 3);
          b.rotation.y = -cote * Math.PI / 2;
          decor.add(b);
        }
      }
    }
    // La grande bannière, derrière le trône.
    const grande = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 10.5), matBanniere);
    grande.position.set(0, 9.2, fond + 0.1);
    decor.add(grande);

    // L'estrade : trois marches, la dernière bordée d'or.
    const zTrone = fond + 3.4;
    const marbreClair = new THREE.MeshStandardMaterial({ map: T.marbre, roughness: .3 });
    const marches = [[11, 6.6], [8.6, 5.2], [6.4, 3.8]];
    marches.forEach(([l, p], i) => {
      const m = new THREE.Mesh(boiteRonde(l, 0.36, p, 0.04), marbreClair);
      m.position.set(0, 0.18 + i * 0.36, zTrone - 0.2 + (marches.length - 1 - i) * 0.0);
      m.receiveShadow = m.castShadow = true;
      decor.add(m);
    });
    const yEstrade = marches.length * 0.36;
    const tapisEstrade = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.2), new THREE.MeshStandardMaterial({ map: T.tapis, roughness: 1 }));
    tapisEstrade.rotation.x = -Math.PI / 2;
    tapisEstrade.position.set(0, yEstrade + 0.01, zTrone - 0.1);
    decor.add(tapisEstrade);
    // Le tapis rouge, de l'entrée au pied de l'estrade.
    const tapis = new THREE.Mesh(new THREE.PlaneGeometry(3.4, avant - zTrone - 3.2),
      new THREE.MeshStandardMaterial({ map: T.tapis, roughness: 1 }));
    tapis.rotation.x = -Math.PI / 2;
    tapis.position.set(0, 0.012, (zTrone + 3.2 + avant) / 2);
    tapis.receiveShadow = true;
    decor.add(tapis);

    // Le trône : un siège de velours rouge, un haut dossier doré, des accoudoirs.
    const trone = new THREE.Group();
    const velours = matieresRoyales().velours;
    const boisFonce = matDe("#3b2414", { roughness: .45 });
    const socle = new THREE.Mesh(boiteRonde(2.5, 0.85, 2.1, 0.08), boisFonce);
    socle.position.set(0, 0.43, 0);
    const coussin = new THREE.Mesh(boiteRonde(2.1, 0.22, 1.9, 0.1), velours);
    coussin.position.set(0, 0.96, 0.05);
    const dossier = new THREE.Mesh(boiteRonde(2.6, 4.8, 0.4, 0.1), or);
    dossier.position.set(0, 2.9, -1.05);
    const panneau = new THREE.Mesh(boiteRonde(2.0, 3.9, 0.1, 0.05), velours);
    panneau.position.set(0, 2.75, -0.82);
    trone.add(socle, coussin, dossier, panneau);
    for (const x of [-1.2, 1.2]) {
      const acc = new THREE.Mesh(boiteRonde(0.3, 0.22, 1.9, 0.08), or);
      acc.position.set(x, 1.62, 0);
      const montantA = new THREE.Mesh(boiteRonde(0.26, 0.75, 0.26, 0.06), or);
      montantA.position.set(x, 1.2, 0.8);
      const pomme = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), or);
      pomme.position.set(x, 1.78, 0.9);
      const fleuron = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), or);
      fleuron.position.set(x * 1.08, 5.45, -1.05);
      trone.add(acc, montantA, pomme, fleuron);
    }
    const cimier = couronne("couronne");
    cimier.scale.setScalar(1.25);
    cimier.position.set(0, 5.55, -1.05);
    trone.add(cimier);
    trone.position.set(0, yEstrade, zTrone);
    ombrer(trone);
    decor.add(trone);

    // Une petite table près du trône : ce que le souverain a sorti y est posé.
    const gueridon = new THREE.Group();
    const plateau = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 24), boisFonce);
    plateau.position.y = 1.95;
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.9, 12), or);
    pied.position.y = 0.95;
    gueridon.add(plateau, pied);
    gueridon.position.set(2.35, yEstrade, zTrone + 0.6);
    ombrer(gueridon);
    decor.add(gueridon);
    const objetsTrone = new THREE.Group();
    objetsTrone.position.set(2.35, yEstrade + 2.02, zTrone + 0.6);
    objetsTrone.rotation.y = Math.PI;
    decor.add(objetsTrone);

    // Des candélabres de part et d'autre, et leur lumière chaude.
    const laiton = matDe("#9c7a3c", { metalness: .75, roughness: .3 });
    for (const x of [-3.6, 3.6]) {
      const c = new THREE.Group();
      const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 3.4, 12), laiton);
      tige.position.y = 1.7;
      const piedC = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.15, 20), laiton);
      const coupe = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.14, 20), laiton);
      coupe.position.y = 3.45;
      c.add(tige, piedC, coupe);
      for (const dx of [-0.25, 0, 0.25]) bougie(c, dx, 3.5, dx ? 0.5 : 0.65);
      c.position.set(x, yEstrade, zTrone + 0.4);
      ombrer(c);
      decor.add(c);
      const lueur = new THREE.PointLight("#ffb866", 16, 16, 2);
      lueur.position.set(x, yEstrade + 4.4, zTrone + 0.6);
      decor.add(lueur);
      bougies.push({ lumiere: lueur, base: 16, phase: x });
    }
    // Des torches sur les colonnes, le long de la salle.
    for (const cote of [-1, 1]) {
      for (let z = fond + 10; z < avant - 2; z += 12) {
        const l = new THREE.PointLight("#ffa850", 10, 14, 2);
        l.position.set(cote * (largeur / 2 - 3), 6, z);
        decor.add(l);
        bougies.push({ lumiere: l, base: 10, phase: z * 0.7 + cote });
      }
    }

    // La cour : debout en arc de cercle devant l'estrade, puis assise sur les bancs.
    const sieges = [];
    const R = 6.6;
    const nArc = Math.min(Math.max(5, total), 9);
    for (let i = 0; i < nArc; i++) {
      const a = nArc === 1 ? 0 : -0.95 + (1.9 * i) / (nArc - 1);
      const objets = new THREE.Group();
      objets.visible = false;
      sieges.push({ x: Math.sin(a) * R, z: zTrone + Math.cos(a) * R, angle: a, objets, debout: true });
    }
    const bancs = Math.max(0, total - nArc);
    const parBanc = 4, pas = 2.1;
    for (const cote of [-1, 1]) {
      const n = Math.max(1, Math.ceil(bancs / 2 / parBanc));
      for (let b = 0; b < n; b++) {
        const z0 = zTrone + 6.5 + b * (parBanc * pas + 1.5);
        const banc = new THREE.Mesh(boiteRonde(1.4, 0.18, parBanc * pas, 0.05), boisFonce);
        banc.position.set(cote * 8.6, 0.95, z0 + (parBanc - 1) * pas / 2);
        const dosBanc = new THREE.Mesh(boiteRonde(0.16, 1.3, parBanc * pas, 0.05), boisFonce);
        dosBanc.position.set(cote * 9.3, 1.8, z0 + (parBanc - 1) * pas / 2);
        for (const dz of [-1, 1]) {
          const pieds = new THREE.Mesh(boiteRonde(1.3, 0.9, 0.16, 0.04), boisFonce);
          pieds.position.set(cote * 8.6, 0.45, z0 + (parBanc - 1) * pas / 2 + dz * (parBanc * pas / 2 - 0.3));
          decor.add(pieds);
        }
        ombrer(banc); ombrer(dosBanc);
        decor.add(banc, dosBanc);
        for (let k = 0; k < parBanc; k++) {
          const objets = new THREE.Group();
          objets.visible = false;
          sieges.push({ x: cote * 8.55, z: z0 + k * pas, angle: cote * Math.PI / 2, objets });
        }
      }
    }
    return { sieges, tete: { x: 0, z: zTrone + 0.05, y: yEstrade, angle: Math.PI, objets: objetsTrone }, fond, zTrone };
  }

  /* --- Dehors : une place de district ---------------------------------------
     Des pavés, des maisons à colombages, un puits, des lanternes ; et au loin,
     barrant l'horizon, le Mur. On s'y tient debout, en cercle. */
  const TEX_RUE = {};
  function texRue() {
    if (TEX_RUE.paves) return TEX_RUE;
    TEX_RUE.paves = texturePeinte(512, 512, (g, l, h) => {
      g.fillStyle = "#6d655b"; g.fillRect(0, 0, l, h);
      const c = 42;
      for (let y = 0; y < h + c; y += c * 0.8) {
        for (let x = ((y / (c * 0.8)) % 2) * c / 2 - c; x < l + c; x += c) {
          const v = 120 + Math.floor(Math.random() * 45);
          g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
          g.beginPath(); g.ellipse(x + c / 2, y + c * 0.4, c * 0.46, c * 0.36, Math.random() * 0.3, 0, 7); g.fill();
          g.fillStyle = "rgba(255,255,255,.06)";
          g.beginPath(); g.ellipse(x + c / 2 - 4, y + c * 0.32, c * 0.2, c * 0.12, 0, 0, 7); g.fill();
        }
      }
    }, [14, 14]);
    TEX_RUE.facade = texturePeinte(256, 256, (g, l, h) => {
      g.fillStyle = "#d9c9a8"; g.fillRect(0, 0, l, h);
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = `rgba(${Math.random() > .5 ? "255,255,255" : "90,70,45"},${Math.random() * .06})`;
        g.fillRect(Math.random() * l, Math.random() * h, 2, 2);
      }
      g.fillStyle = "#4a3222";
      for (const x of [0, l / 2 - 6, l - 12]) g.fillRect(x, 0, 12, h);
      g.fillRect(0, 0, l, 12); g.fillRect(0, h / 2 - 6, l, 12); g.fillRect(0, h - 12, l, 12);
      g.save(); g.lineWidth = 9; g.strokeStyle = "#4a3222";
      g.beginPath(); g.moveTo(12, h / 2); g.lineTo(l / 2 - 6, h - 12); g.moveTo(l - 12, h / 2); g.lineTo(l / 2 + 6, h - 12); g.stroke();
      g.restore();
    }, [2, 1]);
    TEX_RUE.toit = texturePeinte(256, 256, (g, l, h) => {
      g.fillStyle = "#7c3520"; g.fillRect(0, 0, l, h);
      for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 0 : 12; x < l; x += 24) {
        g.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.15})`; g.fillRect(x, y + 12, 22, 4);
        g.fillStyle = `rgba(255,170,120,${Math.random() * .1})`; g.fillRect(x, y, 22, 10);
      }
    }, [3, 2]);
    TEX_RUE.mur = texturePeinte(1024, 256, (g, l, h) => {
      g.fillStyle = "#b5ab97"; g.fillRect(0, 0, l, h);
      g.fillStyle = "rgba(70,60,45,.22)";
      for (let x = 0; x < l; x += 64) g.fillRect(x, 0, 3, h);
      for (let y = 0; y < h; y += 22) g.fillRect(0, y, l, 2);
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = `rgba(${Math.random() > .5 ? "255,255,255" : "50,45,35"},${Math.random() * .07})`;
        g.fillRect(Math.random() * l, Math.random() * h, 3, 3);
      }
      g.fillStyle = "#e3dccd"; g.fillRect(0, 0, l, 10);
    }, [6, 1]);
    return TEX_RUE;
  }

  function maison(x, z, l, h, angle) {
    const T = texRue();
    const g = new THREE.Group();
    const corps = new THREE.Mesh(new THREE.BoxGeometry(l, h, 6), new THREE.MeshStandardMaterial({ map: T.facade, roughness: .95 }));
    corps.position.y = h / 2;
    const forme = new THREE.Shape();
    forme.moveTo(-l / 2 - 0.4, 0); forme.lineTo(0, 3.2); forme.lineTo(l / 2 + 0.4, 0); forme.lineTo(-l / 2 - 0.4, 0);
    const toit = new THREE.Mesh(new THREE.ExtrudeGeometry(forme, { depth: 6.8, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ map: T.toit, roughness: .85 }));
    toit.position.set(0, h, -3.4);
    g.add(corps, toit);
    const sombre = matDe("#2b2622", { roughness: .4 });
    const volet = matDe(["#3f5a46", "#6b3a2a", "#3a4a66"][Math.abs(Math.round(x)) % 3], { roughness: .8 });
    for (const fx of [-l / 4, l / 4]) {
      for (const fy of [h * 0.35, h * 0.75]) {
        if (fy < h * 0.5 && Math.abs(fx) < 0.1) continue;
        const f = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), sombre);
        f.position.set(fx, fy, 3.01);
        const v1 = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.5), volet);
        v1.position.set(fx - 0.85, fy, 3.02);
        const v2 = v1.clone(); v2.position.x = fx + 0.85;
        g.add(f, v1, v2);
      }
    }
    const porte = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), matDe("#4a2c1a", { roughness: .7 }));
    porte.position.set(0, 1.3, 3.02);
    g.add(porte);
    // Une cheminée sur le toit ; une maison sur deux fait du feu.
    const chem = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.4, 0.8), matDe("#7a5a48", { roughness: .9 }));
    chem.position.set(l * 0.22, h + 2.2, -1.2);
    g.add(chem);
    g.position.set(x, 0, z);
    g.rotation.y = angle;
    ombrer(g);
    decor.add(g);
    if ((Math.round(x * 7 + z * 3) & 1) === 0) {
      g.updateMatrixWorld(true);
      fumee(chem.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.3, 0)));
    }
  }

  /** La fumée d'une cheminée : des bouffées qui montent, gonflent et se dissipent. */
  let texFumee = null;
  function fumee(o) {
    if (!texFumee) {
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const g = c.getContext("2d");
      const d = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      d.addColorStop(0, "rgba(235,235,235,.75)"); d.addColorStop(.5, "rgba(220,220,225,.35)"); d.addColorStop(1, "rgba(220,220,225,0)");
      g.fillStyle = d; g.fillRect(0, 0, 64, 64);
      texFumee = new THREE.CanvasTexture(c);
    }
    const bouffees = [];
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: texFumee, transparent: true, depthWrite: false }));
      b.raycast = () => {};
      decor.add(b);
      bouffees.push(b);
    }
    const phase = Math.random() * 10;
    animes.push((s) => {
      bouffees.forEach((b, i) => {
        const a = ((s * 0.16 + phase + i / bouffees.length) % 1);
        b.position.set(o.x + a * 2.2 + Math.sin(s + i) * 0.2, o.y + a * 6, o.z + a * 0.8);
        b.scale.setScalar(0.8 + a * 3.2);
        b.material.opacity = Math.min(1, a * 6) * (1 - a) * 0.8;
      });
    });
  }

  /** Des oiseaux qui tournent haut au-dessus de la place, ailes battantes. */
  function oiseaux(n, cx, cz, y) {
    const mat = matDe("#2a2622", { side: THREE.DoubleSide });
    const vol = [];
    for (let i = 0; i < n; i++) {
      const o = new THREE.Group();
      const ailes = [-1, 1].map((cote) => {
        const aile = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), mat);
        aile.geometry.translate(cote * 0.45, 0, 0);
        o.add(aile);
        return aile;
      });
      const corps = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.35, 3, 6), mat);
      corps.rotation.x = Math.PI / 2;
      o.add(corps);
      o.traverse((m) => { m.raycast = () => {}; });
      decor.add(o);
      vol.push({ o, ailes, r: 10 + Math.random() * 14, v: 0.12 + Math.random() * 0.1, ph: Math.random() * 6, h: y + Math.random() * 8 });
    }
    animes.push((s) => {
      for (const b of vol) {
        const a = s * b.v + b.ph;
        b.o.position.set(cx + Math.cos(a) * b.r, b.h + Math.sin(s * 0.7 + b.ph) * 0.8, cz + Math.sin(a) * b.r);
        b.o.rotation.y = -a;
        const battement = Math.sin(s * 9 + b.ph * 3) * 0.6;
        b.ailes[0].rotation.z = -battement; b.ailes[1].rotation.z = battement;
      }
    });
  }

  /** Le ciel, de jour : un dégradé, et des nuages qui passent au-dessus des toits. */
  let texCiel = null;
  function cielDeJour() {
    if (!texCiel) {
      const c = document.createElement("canvas"); c.width = 4; c.height = 256;
      const g = c.getContext("2d");
      const d = g.createLinearGradient(0, 0, 0, 256);
      d.addColorStop(0, "#4f86c6"); d.addColorStop(.55, "#8fb6dd"); d.addColorStop(1, "#dfe9f0");
      g.fillStyle = d; g.fillRect(0, 0, 4, 256);
      texCiel = new THREE.CanvasTexture(c);
      texCiel.colorSpace = THREE.SRGBColorSpace;
    }
    scene.background = texCiel;
    const n = coucheNuages(900, 900, 0.0035);
    n.material.map.repeat.set(3, 4);
    n.material.map.wrapT = THREE.RepeatWrapping;
    n.material.map.needsUpdate = true;
    n.rotation.x = Math.PI / 2;
    n.position.y = 70;
    n.material.side = THREE.DoubleSide;
    decor.add(n);
  }

  function construireRue(total, { petit = false } = {}) {
    lumieresParDefaut();
    const T = texRue();
    cielDeJour();
    scene.fog = new THREE.Fog("#c7d6e2", 45, 190);
    scene.environmentIntensity = 0.55;
    ciel.color.set("#dfeeff"); ciel.groundColor.set("#6b5a45"); ciel.intensity = 1.25;
    soleil.intensity = 2.9;
    plafonnier.intensity = 0;
    soleil.position.set(-14, 26, 12);
    soleil.target.position.set(0, 0, -2);
    Object.assign(soleil.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
    soleil.shadow.camera.updateProjectionMatrix();

    bornes = { x: 13.5, zMin: -11.5, zMax: 22, y: 30 };
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ map: T.paves, roughness: .95 }));
    sol.rotation.x = -Math.PI / 2;
    sol.receiveShadow = true;
    decor.add(sol);
    // Les maisons : au fond, et de part et d'autre de la place.
    for (let i = -4; i <= 4; i++) maison(i * 8.4, -16, 7.6, 6 + ((i * 7 + 9) % 3), 0);
    for (const cote of [-1, 1]) {
      for (let i = 0; i < 4; i++) maison(cote * 19, -9 + i * 8.4, 7.6, 6 + ((i * 5 + 4) % 3), -cote * Math.PI / 2);
    }
    // Et derrière soi : la place est fermée de tous côtés.
    for (let i = -4; i <= 4; i++) maison(i * 8.4, 28, 7.6, 6 + ((i * 5 + 7) % 3), Math.PI);
    oiseaux(petit ? 4 : 7, 0, -6, 22);
    // Le Mur, au loin.
    const leMur = new THREE.Mesh(new THREE.BoxGeometry(600, 50, 6), new THREE.MeshStandardMaterial({ map: T.mur, roughness: 1 }));
    leMur.position.set(0, 25, -150);
    decor.add(leMur);
    // Le puits, au milieu de la place.
    const pierre = new THREE.MeshStandardMaterial({ map: texPalais().pierre, roughness: .95 });
    const puits = new THREE.Group();
    const margelle = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 1.2, 24, 1, true), pierre);
    margelle.material.side = THREE.DoubleSide;
    margelle.position.y = 0.6;
    const eau = new THREE.Mesh(new THREE.CircleGeometry(1.25, 24), matDe("#2a3a44", { roughness: .1, metalness: .3 }));
    eau.rotation.x = -Math.PI / 2; eau.position.y = 0.7;
    const bois = matDe("#4a3222", { roughness: .7 });
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 0.2), bois);
      m.position.set(sx * 1.2, 1.9, 0);
      puits.add(m);
    }
    const traverse = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 8), bois);
    traverse.rotation.z = Math.PI / 2; traverse.position.y = 3.0;
    const abri = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.0, 4), new THREE.MeshStandardMaterial({ map: T.toit, roughness: .85 }));
    abri.position.y = 3.6; abri.rotation.y = Math.PI / 4;
    puits.add(margelle, eau, traverse, abri);
    puits.position.set(petit ? 2.5 : 0, 0, petit ? -7 : -8.5);
    ombrer(puits);
    decor.add(puits);
    // Des lanternes, des tonneaux, des caisses.
    for (const [x, z] of [[-9, -10], [9, -10], [-9, 6], [9, 6]]) {
      const lanterne = new THREE.Group();
      const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 8), matMetal);
      mat.position.y = 2.5;
      const cage = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), matDe("#f5d48a", { emissive: "#f0b050", emissiveIntensity: .35 }));
      cage.position.y = 5.2;
      lanterne.add(mat, cage);
      lanterne.position.set(x, 0, z);
      ombrer(lanterne);
      decor.add(lanterne);
    }
    for (const [x, z, k] of [[-12, -12, 0], [-11, -12.6, 1], [12.5, -11.5, 0], [13.2, 2, 1], [-13, 4, 0]]) {
      const o = k
        ? new THREE.Mesh(boiteRonde(1.2, 1.2, 1.2, 0.05), matDe("#8a6a42", { roughness: .8 }))
        : new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 1.3, 16), matDe("#5a3a22", { roughness: .7 }));
      o.position.set(x, 0.62, z);
      o.castShadow = o.receiveShadow = true;
      decor.add(o);
    }

    // Les places : debout, en cercle autour du centre de la place.
    const R = Math.max(3.2, total * 2.1 / (2 * Math.PI));
    const sieges = [];
    for (let i = 0; i < total; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / total;
      const x = Math.cos(a) * R, z = Math.sin(a) * R + (petit ? 0 : 1.6);
      const objets = new THREE.Group();
      objets.visible = false;
      sieges.push({ x, z, angle: Math.PI / 2 - a, objets, i, debout: true });
    }
    const tete = sieges[Math.floor(total / 2)];
    const autres = sieges.filter((s) => s.i !== 0 && s !== tete).sort((a, b) => a.z - b.z);
    return { sieges: autres, tete, R, fond: -16 };
  }

  /* --- La remise, dans la rue : l'un s'approche et tend, l'autre prend ---- */
  let acteurs = null;                  // { de, a, etiquettes, phase, t0, papier }
  function construireRemise() {
    construireRue(2, { petit: true });
    return { sieges: [], fond: -16 };
  }
  function oublierActeurs() {
    if (!acteurs) return;
    for (const q of [acteurs.de, acteurs.a]) { retirerLecture(q); retirer(q.racine); }
    for (const e of acteurs.etiquettes) e.remove();
    acteurs = null;
  }
  /** Le papier tenu à bout de bras : une feuille debout, qui prolonge la main. */
  function papierEnMain() {
    const g = new THREE.Group();
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.0),
      new THREE.MeshStandardMaterial({ map: pageEcrite(), roughness: .9, side: THREE.DoubleSide }));
    f.rotation.y = Math.PI / 2;
    f.position.set(0, -0.45, -0.1);
    f.castShadow = true;
    g.add(f);
    return g;
  }
  function monterActeurs(r) {
    const sig = JSON.stringify([r.de, r.a, r.objet]);
    if (acteurs?.sig === sig) return;
    oublierActeurs();
    const de = personnage(`remise:de:${r.de?.nom || ""}`, r.de?.avatar || {});
    const a = personnage(`remise:a:${r.a?.nom || ""}`, r.a?.avatar || {});
    for (const q of [de, a]) { q.poser("debout"); q.racine.scale.setScalar(0.72); scene.add(q.racine); }
    // Face à face : celui qui tend à gauche, celui qui reçoit à droite.
    de.racine.position.set(-1.35, 0.05, 0); de.racine.rotation.y = -Math.PI / 2;
    a.racine.position.set(1.35, 0.05, 0); a.racine.rotation.y = Math.PI / 2;
    acteurs = {
      sig, de, a, objet: r.objet || "papier", phase: "pose", t0: performance.now(), papier: null,
      etiquettes: [
        etiquette(r.de?.nom || "", r.de?.moi ? "classe3d__nom--moi" : "classe3d__nom--prof"),
        etiquette(r.a?.nom || "", r.a?.moi ? "classe3d__nom--moi" : "")
      ]
    };
  }
  /** Un pas de la scène de remise. */
  function animerRemise(t) {
    const A = acteurs;
    if (!A) return;
    const { de, a } = A;
    const dt = t - A.t0;
    const doux = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
    const marcher = (q, u) => {
      const b = u > 0 && u < 1 ? Math.sin(t / 95) * 0.55 : 0;
      q.jambeG.epaule.rotation.x = b; q.jambeD.epaule.rotation.x = -b;
      q.brasG.epaule.rotation.x = -b * 0.7;
      if (!A.papier || A.papier.parent !== q.brasD.bout) q.brasD.epaule.rotation.x = b * 0.7;
    };
    const tenirPapier = (bras) => {
      if (!A.papier) A.papier = papierEnMain();
      if (A.papier.parent !== bras.bout) { A.papier.parent?.remove(A.papier); bras.bout.add(A.papier); }
    };
    const lacherPapier = () => { A.papier?.parent?.remove(A.papier); };
    for (const q of [de, a]) {
      q.torse.scale.y = 1 + Math.sin(t / 620 + (q === a ? 1 : 0)) * 0.012;
      if (!q.lecture) {
        q.bassin.rotation.z = Math.sin(t / 900 + (q === a ? 2 : 0)) * 0.016;
        q.brasG.epaule.rotation.x = q.brasG.epaule.rotation.x || Math.sin(t / 700) * 0.04;
      }
    }
    a.tete.rotation.y = Math.sin(t / 2100) * 0.12;
    if (A.phase === "prend" && dt < 900) a.tete.rotation.x = Math.sin(Math.min(1, dt / 500) * Math.PI) * 0.18;

    if (A.phase === "approche") {
      // Il arrive de loin, et s'arrête à portée de main.
      const u = Math.min(1, dt / 2300);
      de.racine.position.x = -6.5 + (6.5 - 1.35) * doux(u);
      marcher(de, u);
      if (u >= 1) { A.phase = "pose"; }
    } else if (A.phase === "tend") {
      de.racine.position.x = -1.35;
      tenirPapier(de.brasD);
      const u = doux(dt / 700);
      de.brasD.epaule.rotation.set(1.4 * u, 0, -0.18 * u);
      de.tete.rotation.x = 0.1 * u;
    } else if (A.phase === "prend") {
      de.racine.position.x = -1.35;
      // L'autre tend la main gauche, saisit le papier, puis le lève pour le lire.
      const u = doux(dt / 520);
      if (dt < 640) {
        tenirPapier(de.brasD);
        de.brasD.epaule.rotation.set(1.4, 0, -0.18);
        a.brasG.epaule.rotation.set(1.4 * u, 0, 0.18 * u);
      } else {
        if (A.papier?.parent === de.brasD.bout) tenirPapier(a.brasG);
        const v = doux((dt - 640) / 600);
        de.brasD.epaule.rotation.set(1.4 * (1 - v), 0, -0.18 * (1 - v));
        if (dt > 900) {
          lacherPapier();
          gererLecture(a, A.objet === "cahier" ? "cahier" : A.objet === "livre" ? "livre" : "papier", t);
        } else {
          a.brasG.epaule.rotation.set(1.4, 0, 0.18);
        }
      }
    } else if (A.phase === "refuse") {
      const u = doux(dt / 700);
      de.brasD.epaule.rotation.set(1.4 * (1 - u), 0, -0.18 * (1 - u));
      if (u >= 1) lacherPapier();
      a.tete.rotation.y = Math.sin(dt / 160) * 0.35 * (1 - doux(dt / 1400));
    } else if (A.phase === "lit") {
      gererLecture(a, A.objet === "cahier" ? "cahier" : A.objet === "livre" ? "livre" : "papier", t);
    }
  }

  /* --- Les gens ------------------------------------------------------------ */
  const gens = new Map();              // id → { p, siege, etiquette, personne, sig }
  let prof = null;
  let etat = { mode: "classe", eleves: [], prof: { present: false } };
  let sacMoi = null;                   // mon sac ouvert : { contenu, surSortir, surFermer }
  let ecritJusqua = 0;

  function etiquette(texte, classe = "") {
    const e = document.createElement("button");
    e.type = "button";
    e.className = `classe3d__nom ${classe}`.trim();
    e.textContent = texte;
    etiquettes.appendChild(e);
    return e;
  }

  function asseoir(x, siege) {
    const { p } = x;
    if (dispo.portrait) {
      p.poser("debout");
      p.racine.position.set(0, 0.05, 0);
      p.racine.rotation.y = Math.PI;
      p.racine.scale.setScalar(0.72);
      x.siege = siege; x.sig = null; x.arrive = 0;
      return;
    }
    if (siege.debout) {
      // Dehors, au palais : on se tient debout, tourné vers les autres.
      p.poser("debout");
      p.racine.position.set(siege.x, 0.05, siege.z);
      p.racine.rotation.y = siege.angle;
      p.racine.scale.setScalar(0.72);
      x.siege = siege;
      x.sig = null;
      return;
    }
    const pose = dispo.reunion || dispo.trone ? "assis"
      : choisir(graine(`pose:${x.personne.id}`), ["assis", "assis", "tailleur", "assis"]);
    p.poser(pose);
    p.racine.position.set(siege.x, 1.31 + (pose === "tailleur" ? 0.05 : 0), siege.z);
    p.racine.rotation.y = siege.angle;
    p.racine.scale.setScalar(0.72);
    x.siege = siege;
    x.sig = null;                        // ses affaires seront reposées devant lui
  }

  function reconstruire() {
    const reunion = etat.mode === "reunion";
    const n = etat.eleves.length;
    const total = Math.max(6, n + (etat.prof.present ? 1 : 0) + 1);
    // Quelques places libres de plus : on choisit où l'on s'assoit.
    const places = n + 4;
    const cols = colonnesPour(places);
    const maison = etat.mode === "maison";
    const portrait = etat.mode === "portrait";
    const trone = etat.mode === "trone", rue = etat.mode === "rue", remise = etat.mode === "remise";
    const cle = portrait ? "portrait" : maison ? "maison" : remise ? "remise"
      : trone ? `trone:${n}` : rue ? `rue:${total}`
      : reunion ? `reunion:${total}` : `classe:${cols}x${Math.max(2, Math.ceil(places / cols))}`;
    if (cle === dispo.cle) return;
    for (const o of [...decor.children]) {
      decor.remove(o);
      o.traverse((m) => { if (m.isMesh && !PARTAGEES.has(m.geometry)) m.geometry.dispose(); });
    }
    ardoise = null;
    objetsProf = null;
    bougies = [];
    animes = [];
    bornes = null;
    boites = null;
    nuitDehors = false;
    lumieresParDefaut();
    if (!remise) oublierActeurs();
    dispo = portrait ? { cle, reunion: false, portrait: true, ...construirePortrait() }
      : maison ? { cle, reunion: false, maison: true, ...construireMaison() }
      : remise ? { cle, reunion: false, remise: true, ...construireRemise() }
      : trone ? { cle, reunion: false, trone: true, ...construireTrone(n) }
      : rue ? { cle, reunion: false, rue: true, ...construireRue(total) }
      : reunion ? { cle, reunion: true, ...construireReunion(total) }
      : { cle, reunion: false, ...construireClasse(places) };
    // Chaque place a son numéro, que l'on retrouve au clic.
    dispo.sieges.forEach((siege, i) => {
      siege.index = i;
      siege.groupe?.traverse((m) => { m.userData.siege = i; });
    });
    // Chacun reprendra sa place dans la nouvelle salle (majGens).
    for (const x of gens.values()) { x.siege = null; x.trajet = null; }
    if (prof) placerProf();
    // Un autre lieu : la vue revient à sa place, et l'on y entre.
    const genre = cle.split(":")[0];
    if (genre !== sceneJouee) {
      sceneJouee = genre;
      recentrer();
      jouerEntree(genre);
    }
    boutonVue.hidden = !vueLibreModifiee() || Boolean(dispo.portrait);
    aideVue.hidden = Boolean(dispo.portrait || dispo.remise);
    cadrer();
  }
  let sceneJouee = "";

  function placerProf() {
    const p = prof.p;
    if (dispo.trone) {
      // Le souverain, assis sur son trône, face à sa cour.
      p.poser("assis");
      p.racine.position.set(dispo.tete.x, dispo.tete.y + 1.31, dispo.tete.z);
      p.racine.rotation.y = Math.PI;
      p.racine.scale.setScalar(0.76);
    } else if (dispo.rue) {
      p.poser("debout");
      p.racine.position.set(dispo.tete.x, 0.05, dispo.tete.z);
      p.racine.rotation.y = dispo.tete.angle;
      p.racine.scale.setScalar(0.72);
    } else if (dispo.remise) {
      p.racine.visible = false;
    } else if (dispo.reunion) {
      // Le président est à la tête de la table, assis comme les autres.
      p.poser("assis");
      p.racine.position.set(dispo.tete.x, 1.31, dispo.tete.z);
      p.racine.rotation.y = dispo.tete.angle;
      p.racine.scale.setScalar(0.72);
    } else {
      p.poser("debout");
      p.racine.rotation.y = Math.PI;
      p.racine.position.set(dispo.prof.x, 0.4, dispo.prof.z);
      p.racine.scale.setScalar(0.85);
    }
    prof.sig = null;
  }

  /** Retirer un personnage de la scène, et défaire ce qui n'était qu'à lui. */
  function retirer(racine) {
    scene.remove(racine);
    racine.traverse((m) => { if (m.isMesh && m.userData.jetable) m.geometry.dispose(); });
  }

  function majGens() {
    const ids = new Set(etat.eleves.map((x) => String(x.id)));
    for (const [id, x] of [...gens]) {
      if (ids.has(id)) continue;
      retirer(x.p.racine);
      if (x.sac) retirer(x.sac);
      x.etiquette.remove();
      if (x.siege) garnir(x.siege.objets, []);
      gens.delete(id);
    }
    // Qui s'assoit où. D'abord ceux qui ont choisi leur place (ou que le
    // professeur a placés), dans l'ordre où ils l'ont fait : une place prise
    // l'est pour de bon. Puis les autres gardent la leur, ou prennent la
    // première libre.
    const cible = new Map();
    const prises = new Set();
    const voulus = etat.eleves
      .filter((e) => Number.isInteger(e.place) && dispo.sieges[e.place])
      .sort((a, b) => (a.depuis || 0) - (b.depuis || 0));
    for (const e of voulus) {
      const siege = dispo.sieges[e.place];
      if (prises.has(siege)) continue;
      prises.add(siege);
      cible.set(String(e.id), siege);
    }
    for (const e of etat.eleves) {
      const id = String(e.id);
      if (cible.has(id)) continue;
      const actuel = gens.get(id)?.siege;
      const siege = actuel && !prises.has(actuel) ? actuel : dispo.sieges.find((t) => !prises.has(t));
      if (!siege) continue;
      prises.add(siege);
      cible.set(id, siege);
    }

    for (const e of etat.eleves) {
      const id = String(e.id);
      const siege = cible.get(id);
      if (!siege) continue;
      let x = gens.get(id);
      if (!x) {
        const p = personnage(id, e.avatar);
        scene.add(p.racine);
        x = { p, personne: e, etiquette: etiquette(e.nom, e.moi ? "classe3d__nom--moi" : ""), sig: null,
              arrive: performance.now(), avSig: JSON.stringify(e.avatar || {}), siege: null };
        x.etiquette.onclick = () => { if (!x.personne.moi) surPersonne?.(x.etiquette, x.personne.brut); };
        p.racine.traverse((o) => { o.userData.personne = id; });
        if (!dispo.portrait) { x.sac = modeleSac(); scene.add(x.sac); }
        gens.set(id, x);
      }
      x.personne = e;
      // Son sac : ouvert sur la table, ou fermé par terre. Le mien montre ce qu'il contient.
      x.sacOuvert = e.moi ? Boolean(sacMoi) : Boolean(e.sacOuvert);
      // Il a changé d'apparence : on le rhabille, à la même place.
      const avSig = JSON.stringify(e.avatar || {});
      if (avSig !== x.avSig) {
        retirer(x.p.racine);
        x.p = personnage(id, e.avatar);
        x.p.racine.traverse((o) => { o.userData.personne = id; });
        scene.add(x.p.racine);
        x.avSig = avSig;
        if (x.siege && !x.trajet) asseoir(x, x.siege);
      }
      // Sa place : il s'y assoit tout de suite (en arrivant), ou il se lève
      // et y va à pied (il en change).
      if (!x.siege) asseoir(x, siege);
      else if (x.siege !== siege) marcher(x, siege);
      x.etiquette.textContent = e.nom;
      x.etiquette.classList.toggle("classe3d__nom--main", Boolean(e.main));
      // Ce qu'il a devant lui : on ne repose que si cela a changé.
      if (x.trajet) continue;
      const sig = JSON.stringify(e.bureau || []);
      if (sig !== x.sig) {
        x.sig = sig;
        const liste = (e.bureau || []).map((o) => ({ ...o }));
        // On voit la chose passer du sac à la table (ou l'inverse), s'il était déjà là.
        if (!x.vise || x.siege.debout || !preparerGestes(x, x.vise, liste)) {
          interrompreGeste(x);
          x.p.tenir(garnir(x.siege.objets, liste));
        }
        x.vise = liste;
      }
    }
    cadrer();
  }

  /* Changer de place : on se lève, on passe par les allées (jamais à
     travers les tables), on s'assoit. Les affaires suivent. */
  function marcher(x, siege) {
    interrompreGeste(x);
    const ancien = x.siege;
    if (ancien) garnir(ancien.objets, []);
    x.p.tenir(null);
    const pts = chemin(x.p.racine.position.clone(), ancien, siege);
    const cumul = [0];
    for (let i = 1; i < pts.length; i++) cumul.push(cumul[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const total = cumul[cumul.length - 1];
    x.trajet = { pts, cumul, total, de: pts[0], siege, t0: performance.now(), duree: 900 + total * 300 };
    x.p.poser("debout");
    x.siege = siege;
    x.sig = null;
  }

  /** Le point où l'on se tient pour s'asseoir à une place : derrière sa chaise. */
  function derriereDe(siege) {
    if (siege.debout) return new THREE.Vector3(siege.x, 0.05, siege.z);
    const a = siege.angle || 0;
    return new THREE.Vector3(siege.x + Math.sin(a) * 1.7, 0.05, siege.z + Math.cos(a) * 1.7);
  }

  /* Le chemin d'une place à l'autre. En classe : on rejoint l'allée la plus
     proche, on passe par l'avant ou le fond de la salle (le plus court), on
     redescend l'allée de sa nouvelle place. En réunion : on fait le tour de
     la table, à distance des chaises. Ailleurs (debout), tout droit. */
  function chemin(de, ancien, siege) {
    const arrivee = derriereDe(siege);
    const pts = [de];
    const depart = ancien && !ancien.debout ? derriereDe(ancien) : null;
    if (depart) pts.push(depart);
    const d0 = depart || de;
    if (dispo.reunion && dispo.R) {
      const ext = dispo.R + 3.1;               // derrière les dossiers des chaises
      const a0 = Math.atan2(d0.z, d0.x), a1 = Math.atan2(arrivee.z, arrivee.x);
      let da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const n = Math.max(1, Math.ceil(Math.abs(da) / 0.22));
      for (let i = 0; i <= n; i++) {
        const a = a0 + (da * i) / n;
        pts.push(new THREE.Vector3(Math.cos(a) * ext, 0.05, Math.sin(a) * ext));
      }
    } else if (dispo.cols && !siege.debout) {
      const pasX = 3.6;
      const allees = Array.from({ length: dispo.cols + 1 }, (_, c) => (c - dispo.cols / 2) * pasX);
      const proche = (xx, vers) => allees.reduce((m, a) => (Math.abs(a - xx) + Math.abs(a - vers) * 0.02 < Math.abs(m - xx) + Math.abs(m - vers) * 0.02 ? a : m));
      const aA = proche(d0.x, arrivee.x), aB = proche(arrivee.x, d0.x);
      pts.push(new THREE.Vector3(aA, 0.05, d0.z));
      if (Math.abs(aA - aB) > 0.1) {
        const zAvant = -6.1, zFond = (dispo.dernier ?? 0) + 3.6;
        const viaAvant = Math.abs(d0.z - zAvant) + Math.abs(arrivee.z - zAvant);
        const viaFond = Math.abs(d0.z - zFond) + Math.abs(arrivee.z - zFond);
        const zc = viaAvant < viaFond ? zAvant : zFond;
        pts.push(new THREE.Vector3(aA, 0.05, zc), new THREE.Vector3(aB, 0.05, zc));
      }
      pts.push(new THREE.Vector3(aB, 0.05, arrivee.z));
    }
    pts.push(arrivee);
    // Pas de points en double (on est parfois déjà dans l'allée).
    return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.05);
  }

  /** Où l'on en est sur le chemin, à une distance donnée depuis le départ. */
  function surChemin(t, d, sortie) {
    let i = 1;
    while (i < t.cumul.length - 1 && t.cumul[i] < d) i++;
    const a = t.pts[i - 1], b = t.pts[i];
    const l = t.cumul[i] - t.cumul[i - 1] || 1;
    const f = Math.max(0, Math.min(1, (d - t.cumul[i - 1]) / l));
    sortie.set(a.x + (b.x - a.x) * f, 0, a.z + (b.z - a.z) * f);
    return Math.atan2(-(b.x - a.x), -(b.z - a.z));
  }
  const surLeChemin = new THREE.Vector3();

  /* Un pas de la marche. Renvoie vrai tant qu'il marche. */
  function pas(x, maintenant) {
    const t = x.trajet;
    if (!t) return false;
    const p = x.p;
    const a = Math.min(1, (maintenant - t.t0) / t.duree);
    // Se lever (les premiers instants), marcher, puis s'asseoir.
    const lever = Math.min(1, a / 0.1);
    const marche = Math.max(0, Math.min(1, (a - 0.1) / 0.84));
    // On accélère en partant, on ralentit en arrivant ; entre les deux, le pas est régulier.
    const doux = marche < 0.12 ? marche * marche / 0.24 : marche > 0.88 ? 1 - (1 - marche) * (1 - marche) / 0.24 : (marche - 0.06) / 0.88;
    const cap = surChemin(t, doux * t.total, surLeChemin);
    p.racine.position.set(surLeChemin.x, t.de.y + (0.05 - t.de.y) * lever, surLeChemin.z);
    if (marche > 0 && marche < 1 && t.total > 0.01) {
      let ecartCap = cap - p.racine.rotation.y;
      while (ecartCap > Math.PI) ecartCap -= 2 * Math.PI;
      while (ecartCap < -Math.PI) ecartCap += 2 * Math.PI;
      p.racine.rotation.y += ecartCap * 0.22;
    }
    const enMarche = marche > 0 && marche < 1;
    const balan = enMarche ? Math.sin(maintenant / 95) * 0.55 : 0;
    p.jambeG.epaule.rotation.x = balan; p.jambeD.epaule.rotation.x = -balan;
    p.brasG.epaule.rotation.x = -balan * 0.7; p.brasD.epaule.rotation.x = balan * 0.7;
    // Le corps monte et descend un peu, à chaque pas.
    p.bassin.position.y = 1.9 + (enMarche ? Math.abs(Math.sin(maintenant / 95)) * 0.06 : 0);
    if (a >= 1) {
      x.trajet = null;
      asseoir(x, t.siege);
      x.arrive = maintenant;
      x.sig = JSON.stringify(x.personne.bureau || []);
      x.vise = (x.personne.bureau || []).map((o) => ({ ...o }));
      p.tenir(garnir(t.siege.objets, x.personne.bureau || []));
    }
    return true;
  }

  function majProf() {
    const p = etat.prof;
    if (!p.present || dispo.remise) {
      if (prof) { retirer(prof.p.racine); prof.etiquette.remove(); prof = null; }
      if (objetsProf) garnir(objetsProf, []);
      if (dispo.tete) garnir(dispo.tete.objets, []);
      return;
    }
    const avSig = JSON.stringify(p.avatar || {});
    if (prof && prof.avSig !== avSig) { retirer(prof.p.racine); prof.etiquette.remove(); prof = null; }
    if (!prof) {
      const q = personnage(`prof:${p.nom}`, p.avatar || { tenue: "gris-bleu" });
      scene.add(q.racine);
      prof = { p: q, etiquette: etiquette(p.nom, "classe3d__nom--prof"), sig: null, avSig };
      placerProf();
    }
    prof.etiquette.textContent = p.nom;
    const sig = JSON.stringify(p.bureau || []);
    if (sig !== prof.sig) {
      prof.sig = sig;
      const cible = dispo.reunion || dispo.trone || dispo.rue ? dispo.tete.objets : objetsProf;
      const tenu = cible ? garnir(cible, p.bureau || []) : null;
      // Debout au tableau, le professeur tient sa craie ; assis, sa plume.
      if (!prof.p.lecture) prof.p.tenir(dispo.reunion || dispo.trone ? tenu : (tenu === "craie" ? "craie" : null));
    }
  }

  /* --- Le cadrage ----------------------------------------------------------
     La caméra est à SA place : au fond de la classe, ou à son bord de la
     table. Le tableau et les autres doivent tenir dans l'image, quelle que
     soit la forme de la fenêtre. */
  let viseSoi = false;
  function cadrer() {
    const avaitSoi = surSoi;
    viseSoi = false;
    surSoi = false;
    const l = hote.clientWidth || 1, h = hote.clientHeight || 1;
    renderer.setSize(l, h, false);
    camera.aspect = l / h;
    const k = Math.min(1, Math.max(0, (camera.aspect - 1.2) / 1.6));
    // Mon sac est ouvert : on se penche dessus, quel que soit le lieu.
    const moiSac = [...gens.values()].find((x) => x.personne.moi && x.sacOuvert && x.siege);
    if (moiSac) {
      // On se penche au-dessus de l'ouverture, un peu de son côté : l'intérieur
      // du sac remplit la vue (plus de recul si la fenêtre est étroite).
      const { table } = posesSac(moiSac.siege);
      const a = moiSac.siege.angle || 0;
      camera.fov = 40;
      // Le sac entier dans l'image, avec un peu de table autour — jamais un
      // gros plan illisible, même dans une fenêtre très large ou très basse.
      const t = 2 * Math.tan((camera.fov / 2) * Math.PI / 180);
      const d = Math.max(2.1 / t, 2.8 / (t * Math.max(0.3, camera.aspect)));
      const inc = 0.42;                                     // l'inclinaison, depuis la verticale
      const dz = Math.sin(inc) * d, dy = Math.cos(inc) * d;
      posCible.set(table.x + Math.sin(a) * dz, table.y + SAC.H + dy, table.z + Math.cos(a) * dz);
      regardCible.set(table.x, table.y + SAC.H * 0.45, table.z);
      suivre = true;
      cameraPosee = true;
      camera.updateProjectionMatrix();
      return;
    }
    if (dispo.remise) {
      // De trois quarts, du côté de celui qui reçoit (par-dessus son épaule) :
      // on voit l'autre venir, tendre, et ce qu'on prend en main.
      camera.fov = 40;
      const t = 2 * Math.tan((camera.fov / 2) * Math.PI / 180);
      const d = Math.max(1, 6.2 / (t * Math.max(0.45, camera.aspect)) / 7);
      if (etat.remise?.vue === "de") {
        base.set(-5.4 * d, 4.6 * d, 6.4 * d);
        regard.set(0.6, 2.2, 0);
      } else {
        base.set(5.6 * d, 4.4 * d, 5.0 * d);
        regard.set(-0.9, 2.3, 0);
      }
      suivre = false; cameraPosee = false;
      poserCamera();
      camera.updateProjectionMatrix();
      return;
    }
    if (dispo.trone) {
      const t = 2 * Math.tan(((52 - k * 16) / 2) * Math.PI / 180);
      camera.fov = 52 - k * 16;
      const moi = [...gens.values()].find((x) => x.personne.moi);
      if (etat.prof?.moi) {
        // Le souverain voit sa cour : depuis l'estrade, à côté du trône.
        base.set(5.2, dispo.tete.y + 6.2, dispo.zTrone + 0.6);
        regard.set(-0.8, 1.6, dispo.zTrone + 8.5);
        void moi;
      } else {
        // Depuis l'entrée de la salle : le tapis rouge mène au trône.
        const d = Math.max(17, 13 / (t * Math.max(0.5, camera.aspect)));
        base.set(0, 7.6, dispo.zTrone + d);
        regard.set(0, 3.2, dispo.zTrone + 1);
      }
      suivre = false; cameraPosee = false;
      poserCamera();
      camera.updateProjectionMatrix();
      return;
    }
    if (dispo.portrait) {
      // Qu'il tienne en entier, de la tête aux pieds, bras compris — même
      // dans un aperçu étroit.
      camera.fov = 30;
      const t = 2 * Math.tan((camera.fov / 2) * Math.PI / 180);
      const d = Math.max(4.5 / t, 3.6 / (t * camera.aspect));
      base.set(0, 2.4, d);
      regard.set(0, 1.95, 0);
      suivre = false; cameraPosee = false;
    } else if (dispo.maison) {
      // Chez soi : on se voit de trois quarts dos, assis à son bureau.
      // Fenêtre très large : on recule et on resserre, sans déformer la pièce.
      // Le sac refermé, la caméra y revient en glissant.
      camera.fov = 46 - k * 16;
      posCible.set(2.8 - k * 1.2, 6.9 - k * 0.5, dispo.fond + 9.6 + k * 2);
      regardCible.set(-0.2, 2.7, dispo.fond + 1.4);
      if (!cameraPosee) { base.copy(posCible); regard.copy(regardCible); }
      suivre = true; cameraPosee = true;
    } else if (dispo.reunion || dispo.rue) {
      const R = dispo.R;
      camera.fov = 58 - k * 20;
      base.set(0, 5.4 + R * 0.55 - k * 0.6, R + 3.4 + (1 - k) * 2.2);
      regard.set(0, 2.9 + k * 0.6, -R * 0.55);
      suivre = false; cameraPosee = false;
    } else {
      const moi = [...gens.values()].find((x) => x.personne.moi);
      if (etat.vue === "prof") {
        // Le professeur, devant le tableau, regarde sa classe.
        camera.fov = 58 - k * 18;
        posCible.set(0, 8.2 - k * 0.8, dispo.fond + 0.9);
        regardCible.set(0, 1.6, (dispo.dernier ?? 2) - 1);
        suivre = true;
      } else if (moi?.siege) {
        // L'élève se voit de dos, assis à sa place, les autres autour.
        camera.fov = 54 - k * 14;
        viserDerriere(moi.trajet ? moi.p.racine.position : moi.siege);
        suivre = true;
      } else {
        const plus = Math.max(0, (dispo.rangs || 3) - 3);
        camera.fov = 56 - k * 24 + ((dispo.cols || 4) - 4) * 4;
        base.set(0.4, 10.2 - k * 2.4 + plus * 0.8, (dispo.dernier ?? 2) + 12.8 - k * 4);
        regard.set(0, 3.2 + k * 0.5, -7);
        suivre = false;
      }
      if (suivre && !cameraPosee) {
        base.copy(posCible); regard.copy(regardCible); pivot.copy(pivotCible);
      }
      cameraPosee = suivre;
    }
    if (viseSoi && !avaitSoi) pivot.copy(pivotCible);
    surSoi = viseSoi;
    poserCamera();
    camera.updateProjectionMatrix();
  }
  const sortants = new Set();
  const boutonSac = document.createElement("button");
  boutonSac.type = "button";
  boutonSac.className = "classe3d__refermer";
  boutonSac.textContent = "Refermer le sac";
  boutonSac.hidden = true;
  boutonSac.addEventListener("click", () => api.fermerSac());
  hote.appendChild(boutonSac);
  /* La caméra à la troisième personne : derrière soi, un peu au-dessus. */
  const posCible = new THREE.Vector3(), regardCible = new THREE.Vector3();
  let suivre = false, cameraPosee = false, derniereCam = 0;

  /* --- La vue libre ---------------------------------------------------------
     La caméra a sa place (ci-dessus) ; on peut en partir : glisser pour
     tourner autour de ce qu'on regarde, molette (ou deux doigts) pour
     approcher, clic droit ou Maj pour se déplacer. « Recentrer » y revient.
     Elle reste dans la pièce : ni à travers les murs, ni sous le plancher. */
  const base = new THREE.Vector3();
  // Le point autour duquel on tourne : ce qu'on regarde, ou soi-même (l'élève
  // à sa place tourne autour de son personnage, comme dans le jeu).
  const pivot = new THREE.Vector3(), pivotCible = new THREE.Vector3();
  let surSoi = false;
  const visee = new THREE.Vector3(), ecart = new THREE.Vector3(), cible = new THREE.Vector3();
  const spherique = new THREE.Spherical();
  const libre = { lacet: 0, tangage: 0, zoom: 1, dx: 0, dz: 0 };
  let bornes = null;          // { x, zMin, zMax, y } : l'intérieur de la pièce
  let entree = null;          // le mouvement d'arrivée dans une scène
  const animationsPermises = () => hote.dataset.fige !== "1"
    && !fenetreDe().matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const vueBloquee = () => dispo.portrait || Boolean(sacMoi);
  const vueLibreModifiee = () => Math.abs(libre.lacet) > 0.01 || Math.abs(libre.tangage) > 0.01
    || Math.abs(libre.zoom - 1) > 0.01 || Math.abs(libre.dx) + Math.abs(libre.dz) > 0.05;
  function poserCamera(t = performance.now()) {
    if (vueBloquee()) {
      camera.position.copy(base);
      camera.lookAt(regard);
      return;
    }
    let la = libre.lacet, ta = libre.tangage, zo = libre.zoom;
    if (entree) {
      const a = Math.min(1, (t - entree.t0) / entree.duree);
      const r = Math.pow(1 - a, 3);                         // part qui reste à parcourir
      la += entree.lacet * r; ta += entree.tangage * r; zo *= 1 + (entree.zoom - 1) * r;
      if (a >= 1) entree = null;
    }
    const centre = surSoi ? pivot : regard;
    visee.set(centre.x + libre.dx, centre.y, centre.z + libre.dz);
    if (bornes) {
      // On ne se déplace pas hors de la pièce.
      visee.x = Math.max(-bornes.x, Math.min(bornes.x, visee.x));
      visee.z = Math.max(Math.min(bornes.zMin, centre.z), Math.min(Math.max(bornes.zMax, centre.z), visee.z));
    }
    ecart.subVectors(base, centre);
    spherique.setFromVector3(ecart);
    spherique.theta += la;
    spherique.phi = Math.min(1.5, Math.max(0.12, spherique.phi - ta));
    spherique.radius = Math.min(48, Math.max(1.6, spherique.radius * zo));
    camera.position.setFromSpherical(spherique).add(visee);
    // Ce qu'on regarde tourne avec : autour de soi, on voit ce qu'il y a de l'autre côté.
    if (surSoi) {
      cible.subVectors(regard, centre).applyAxisAngle(HAUT_Y, la);
      cible.add(visee);
    } else cible.copy(visee);
    const b = bornes;
    if (b) {
      // Hors de la pièce : on se rapproche de ce qu'on regarde jusqu'à y rentrer
      // (on garde la direction : on ne se retrouve pas dans un meuble par côté).
      const lx = Math.max(b.x, Math.abs(base.x)), z0 = Math.min(b.zMin, base.z), z1 = Math.max(b.zMax, base.z), y1 = Math.max(b.y, base.y);
      ecart.subVectors(camera.position, visee);
      let t = 1;
      const borne = (v, o, lo, hi) => {
        if (v + o * t > hi && o > 0) t = Math.min(t, (hi - v) / o);
        if (v + o * t < lo && o < 0) t = Math.min(t, (lo - v) / o);
      };
      borne(visee.x, ecart.x, -lx, lx);
      borne(visee.z, ecart.z, z0, z1);
      borne(visee.y, ecart.y, -Infinity, y1);
      t = Math.max(0, t);
      camera.position.copy(visee).addScaledVector(ecart, t);
    }
    camera.position.y = Math.max(0.7, camera.position.y);
    // Un meuble, un mur, un lampadaire entre la caméra et ce qu'elle regarde :
    // elle passe devant (comme dans le jeu), plutôt que de s'y enfoncer.
    if (entree || vueLibreModifiee()) {
      ecart.subVectors(camera.position, visee);
      const loin = ecart.length();
      if (loin > 1.7) {
        ecart.multiplyScalar(1 / loin);
        // Cinq rayons : l'axe, et quatre autour (la caméra a une épaisseur).
        cote.crossVectors(ecart, HAUT_Y).normalize();
        dessus.crossVectors(cote, ecart).normalize();
        let d = loin;
        for (const [a, b] of [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.55], [0, -0.55]]) {
          origine.copy(visee).addScaledVector(cote, a).addScaledVector(dessus, b);
          occlusion.set(origine, ecart);
          occlusion.far = d + 0.6;
          const choc = occlusion.intersectObject(decor, true).find((h) => h.object.visible && !h.object.material?.transparent);
          if (choc) d = Math.min(d, choc.distance - 0.6);
        }
        if (d < loin) camera.position.copy(visee).addScaledVector(ecart, Math.max(1.5, d));
        // Et pas collée à un objet sur le côté : on recule vers la cible
        // jusqu'à être à distance de tout.
        const boites = boitesDecor();
        const libreIci = (pt) => !boites.some((bx) => bx.containsPoint(pt));
        let t = camera.position.distanceTo(visee);
        for (let i = 0; i < 12 && t > 1.5 && !libreIci(camera.position); i++) {
          t = Math.max(1.5, t - 0.45);
          camera.position.copy(visee).addScaledVector(ecart, t);
        }
      }
    }
    camera.lookAt(cible);
  }
  const occlusion = new THREE.Raycaster();
  /** Les volumes du décor (un peu élargis), calculés une fois par lieu. */
  let boites = null;
  function boitesDecor() {
    if (boites) return boites;
    boites = [];
    decor.updateMatrixWorld(true);
    decor.traverse((m) => {
      if (!m.isMesh || m.material?.transparent || !m.geometry) return;
      const b = new THREE.Box3().setFromObject(m);
      const t = b.getSize(new THREE.Vector3());
      // Les murs, les sols, les plafonds : c'est le rôle des bornes.
      if (Math.min(t.x, t.y, t.z) < 0.05 && Math.max(t.x, t.y, t.z) > 6) return;
      if (t.x > 30 || t.z > 30) return;
      boites.push(b.expandByScalar(0.45));
    });
    return boites;
  }
  const cote = new THREE.Vector3(), dessus = new THREE.Vector3(), origine = new THREE.Vector3();
  const HAUT_Y = new THREE.Vector3(0, 1, 0);
  /** On arrive dans une scène : la caméra y entre, chaque lieu à sa façon. */
  function jouerEntree(genre) {
    const E = {
      classe: { lacet: -0.75, tangage: 0.38, zoom: 1.55, duree: 2600 },
      reunion: { lacet: 2.1, tangage: 0.3, zoom: 1.35, duree: 3400 },
      rue: { lacet: -0.6, tangage: 0.75, zoom: 2.3, duree: 3200 },
      trone: { lacet: 0, tangage: 0.12, zoom: 1.9, duree: 3000 },
      maison: { lacet: 0.5, tangage: 0.2, zoom: 1.3, duree: 2200 }
    }[genre];
    entree = E && animationsPermises() ? { ...E, t0: performance.now() } : null;
  }
  function recentrer() {
    Object.assign(libre, { lacet: 0, tangage: 0, zoom: 1, dx: 0, dz: 0 });
    boutonVue.hidden = true;
  }
  const boutonVue = document.createElement("button");
  boutonVue.type = "button";
  boutonVue.className = "classe3d__recentrer";
  boutonVue.textContent = "Recentrer la vue";
  boutonVue.hidden = true;
  boutonVue.addEventListener("click", recentrer);
  const aideVue = document.createElement("div");
  aideVue.className = "classe3d__aide";
  aideVue.textContent = (hote.ownerDocument?.defaultView || window).matchMedia?.("(pointer: coarse)").matches
    ? "Glissez pour regarder autour · pincez pour approcher"
    : "Glissez pour regarder autour · molette pour approcher · clic droit pour vous déplacer";
  hote.append(boutonVue, aideVue);
  setTimeout(() => aideVue.classList.add("classe3d__aide--partie"), 6000);
  function viserDerriere(o) {
    // Fenêtre haute et étroite (flottante, au-dessus du jeu) : on recule et
    // on monte, pour se voir en entier à sa table, et le tableau au fond.
    const recul = Math.max(0, Math.min(1.2, 1.25 - camera.aspect)) * 4.2;
    // Plus près de sa table, un peu plus au-dessus : on voit ses affaires, et
    // le tableau au fond.
    // Par-dessus l'épaule droite : la tête ne cache plus la table.
    posCible.set(o.x + 2.3, 6.1 + recul * 0.55, o.z + 2.2 + recul);
    pivotCible.set(o.x, 3.0, o.z);
    viseSoi = true;
    regardCible.set(o.x * 0.8 - 0.3, 2.0 - recul * 0.12, o.z - 3.4);
  }
  // La fenêtre qui montre la vue : la page, ou la fenêtre flottante posée
  // au-dessus du jeu. On suit SA taille et SON horloge : la page d'origine,
  // cachée derrière Roblox, ne donne plus d'images.
  const fenetreDe = () => hote.ownerDocument?.defaultView || window;
  let observateur = null, fenetreObservee = null;
  function observerTaille() {
    const f = fenetreDe();
    if (f === fenetreObservee && observateur) return;
    observateur?.disconnect();
    fenetreObservee = f;
    observateur = new (f.ResizeObserver || ResizeObserver)(() => cadrer());
    observateur.observe(hote);
  }
  observerTaille();

  /* --- Les gestes : cliquer le tableau, montrer quelqu'un ------------------ */
  const rayon = new THREE.Raycaster();
  const pointeur = new THREE.Vector2();
  function viser(e) {
    const r = canvas.getBoundingClientRect();
    pointeur.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    rayon.setFromCamera(pointeur, camera);
    return rayon.intersectObjects(scene.children, true)[0]?.object || null;
  }
  let survol = null;
  // L'anneau qui montre, au sol, la place libre que l'on vise.
  const anneau = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40),
    new THREE.MeshBasicMaterial({ color: "#e8c896", transparent: true, opacity: 0.85, depthWrite: false }));
  anneau.rotation.x = -Math.PI / 2;
  anneau.visible = false;
  anneau.raycast = () => {};              // on vise à travers
  scene.add(anneau);
  const occupant = (i) => [...gens.entries()].find(([, x]) => x.siege?.index === i)?.[0] || null;
  canvas.addEventListener("pointermove", (e) => {
    const o = viser(e);
    const place = surPlace && !dispo.portrait && !dispo.maison && Number.isInteger(o?.userData.siege) ? o.userData.siege : null;
    const libre = place != null && !occupant(place);
    anneau.visible = libre;
    if (libre) {
      const sg = dispo.sieges[place];
      anneau.position.set(sg.x, 0.03, sg.z);
    }
    const cahier = ((surCahier || surMonCahier) && /cahier|carnet|livre/.test(o?.userData.objet || "")) || (sacMoi && o?.userData.contenu) ? "cahier" : null;
    const cible = o?.userData.tableau ? "tableau" : o?.userData.personne || null;
    canvas.style.cursor = cible || libre || cahier ? "pointer" : place != null ? "not-allowed" : "";
    if (cible !== survol) {
      for (const [id, x] of gens) x.etiquette.classList.toggle("classe3d__nom--survol", id === cible);
      survol = cible;
    }
  });
  // Dans le portrait, on fait tourner le personnage en le glissant. Ailleurs,
  // glisser fait tourner la vue (au-delà de quelques pixels : un clic reste un clic).
  let tourPortrait = 0, glisse = null, aBouge = false;
  const fige = hote.dataset.fige === "1";
  const doigts = new Map();
  const devant = new THREE.Vector3();
  const signalerVue = () => {
    boutonVue.hidden = !vueLibreModifiee();
    aideVue.classList.add("classe3d__aide--partie");
  };
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    aBouge = false;
    if (dispo.portrait) {
      glisse = { portrait: true, x: e.clientX, depart: tourPortrait };
    } else if (!vueBloquee()) {
      glisse = { x: e.clientX, y: e.clientY, deplacer: e.button === 2 || e.shiftKey, bouge: false };
    } else return;
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const avant = doigts.get(e.pointerId);
    if (avant) doigts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!glisse) return;
    if (glisse.portrait) { tourPortrait = glisse.depart + (e.clientX - glisse.x) / 80; return; }
    // Deux doigts : on pince pour approcher, on écarte pour reculer.
    if (doigts.size === 2 && avant) {
      const [a, b] = [...doigts.values()];
      const autre = a === doigts.get(e.pointerId) ? b : a;
      const dAvant = Math.hypot(avant.x - autre.x, avant.y - autre.y);
      const dApres = Math.hypot(e.clientX - autre.x, e.clientY - autre.y);
      if (dAvant > 10 && dApres > 10) libre.zoom = Math.min(2.4, Math.max(0.3, libre.zoom * dAvant / dApres));
      glisse.bouge = aBouge = true; entree = null;
      signalerVue();
      return;
    }
    const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
    if (!glisse.bouge && Math.hypot(dx, dy) < 6) return;
    glisse.bouge = aBouge = true;
    entree = null;
    if (glisse.deplacer || e.shiftKey) {
      // Se déplacer : la scène suit la main, à plat sur le sol.
      camera.getWorldDirection(devant);
      devant.y = 0; devant.normalize();
      const k = camera.position.distanceTo(visee) * 0.0016;
      libre.dx = Math.max(-12, Math.min(12, libre.dx - (-devant.z * dx - devant.x * dy) * k));
      libre.dz = Math.max(-12, Math.min(12, libre.dz - (devant.x * dx - devant.z * dy) * k));
    } else {
      libre.lacet -= dx * 0.0065;
      libre.tangage = Math.max(-0.9, Math.min(1.15, libre.tangage + dy * 0.0045));
    }
    glisse.x = e.clientX; glisse.y = e.clientY;
    signalerVue();
  });
  const lacherVue = (e) => { doigts.delete(e.pointerId); if (!doigts.size) glisse = null; };
  canvas.addEventListener("pointerup", lacherVue);
  canvas.addEventListener("pointercancel", lacherVue);
  canvas.addEventListener("wheel", (e) => {
    if (vueBloquee()) return;
    e.preventDefault();
    entree = null;
    libre.zoom = Math.min(2.4, Math.max(0.3, libre.zoom * Math.exp(e.deltaY * 0.0011)));
    signalerVue();
  }, { passive: false });
  canvas.addEventListener("click", (e) => {
    // On vient de faire tourner la vue : ce n'était pas un clic.
    if (aBouge) { aBouge = false; return; }
    const o = viser(e);
    if (o?.userData.contenu && sacMoi) {
      o.userData.sort = performance.now();
      o.userData.y0 = o.position.y;
      sortants.add(o);
      sacMoi.surSortir?.(o.userData.contenu);
      return;
    }
    if (surPlace && Number.isInteger(o?.userData.siege) && !dispo.portrait && !dispo.maison) {
      surPlace(o.userData.siege, occupant(o.userData.siege));
      anneau.visible = false;
      return;
    }
    // Un cahier posé sur la table de quelqu'un : on peut le lui demander, le vérifier.
    if (o?.userData.objet && /cahier|carnet|livre/.test(o.userData.objet)) {
      // L'objet est un assemblage : on remonte jusqu'à la table qui le porte.
      let porteur = o.parent;
      while (porteur && !porteur.userData?.table) porteur = porteur.parent;
      const [, x] = [...gens.entries()].find(([, g]) => g.siege?.objets === porteur) || [];
      if (x && !x.personne.moi && surCahier) { surCahier(x.etiquette, x.personne.brut); return; }
      // Le mien : je le prends, il vient dans l'interface pour que j'écrive.
      if (x?.personne.moi && surMonCahier) { surMonCahier(); return; }
    }
    if (o?.userData.tableau) surTableau?.();
    else if (o?.userData.personne) {
      const x = gens.get(o.userData.personne);
      if (x) surPersonne?.(x.etiquette, x.personne.brut);
    }
  });

  /* --- La boucle : moins d'images en petit, aucune quand on ne voit rien --- */
  const vecteur = new THREE.Vector3();
  let dernier = 0, dernierTableau = 0, anime = 0, vivant = true, visible = true, verifie = 0;
  let leger = null, horloge = null, dernierAppel = 0;
  /** L'image suivante, demandée à la fenêtre qui montre la vue. */
  function demanderImage() {
    horloge = fenetreDe();
    anime = horloge.requestAnimationFrame(image);
  }
  // La vue a changé de fenêtre (on passe en flottant, on en revient) : la
  // boucle, accrochée à l'ancienne, peut s'être arrêtée. On la relance.
  const veille = setInterval(() => {
    if (!vivant) return;
    if (fenetreDe() !== horloge || performance.now() - dernierAppel > 1500) {
      horloge?.cancelAnimationFrame?.(anime);
      observerTaille();
      demanderImage();
    }
  }, 700);

  /** Au-dessus du jeu, on laisse la carte graphique à Roblox. */
  function qualite() {
    const petit = hote.clientWidth < 720 || Boolean(hote.ownerDocument?.body?.classList.contains("est-flottant"));
    if (petit === leger) return;
    leger = petit;
    renderer.setPixelRatio(leger ? 1 : Math.min(fenetreDe().devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = !leger;
    scene.traverse((m) => { if (m.material) m.material.needsUpdate = true; });
    cadrer();
  }

  function placerEtiquette(el, objet, hauteur) {
    vecteur.setFromMatrixPosition(objet.matrixWorld);
    vecteur.y += hauteur;
    vecteur.project(camera);
    el.hidden = vecteur.z > 1;
    el.style.transform = `translate(-50%, -100%) translate(${(vecteur.x * 0.5 + 0.5) * hote.clientWidth}px, ${(-vecteur.y * 0.5 + 0.5) * hote.clientHeight}px)`;
  }

  function image() {
    if (!vivant) return;
    demanderImage();
    // Une seule horloge, quelle que soit la fenêtre : celle de la page.
    const t = performance.now();
    dernierAppel = t;
    // Visible ? On regarde soi-même, de temps en temps : dans une fenêtre
    // flottante, les observateurs de la page ne voient rien.
    if (t - verifie > 400) {
      verifie = t;
      const r = hote.getBoundingClientRect();
      visible = hote.isConnected && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < fenetreDe().innerHeight;
    }
    if (!visible || !hote.isConnected || hote.ownerDocument?.hidden || t - dernier < (leger ? 50 : 33)) return;
    dernier = t;
    const s = t / 1000;
    if (t - dernierTableau > (leger ? 500 : 300)) { suivreToile(); dernierTableau = t; qualite(); }

    if (dispo.portrait) {
      for (const x of gens.values()) {
        // Il se balance doucement de trois quarts en trois quarts ; on peut
        // aussi le faire tourner en le glissant.
        x.p.racine.rotation.y = Math.PI + tourPortrait + (glisse || fige ? 0 : Math.sin(s * 0.6) * 0.7);
        x.p.torse.scale.y = 1 + Math.sin(s * 1.6) * 0.01;
      }
      renderer.render(scene, camera);
      return;
    }
    const maintenant = performance.now();
    // Les flammes vacillent ; leur lumière avec.
    for (const b of bougies) {
      const v = Math.sin(s * 11 + b.phase) * 0.5 + Math.sin(s * 23.7 + b.phase * 3) * 0.3 + Math.sin(s * 4.3 + b.phase) * 0.2;
      if (b.flamme) {
        b.flamme.scale.set(1 - v * 0.08, 2.3 + v * 0.35, 1 - v * 0.08);
        b.flamme.rotation.z = Math.sin(s * 3.1 + b.phase) * 0.12;
        b.lueurH.material.opacity = 0.8 + v * 0.18;
      }
      if (b.lumiere) b.lumiere.intensity = b.base * (0.88 + v * 0.12);
    }
    for (const f of animes) f(s);
    if (dispo.remise) {
      animerRemise(maintenant);
      poserCamera(maintenant);
      renderer.render(scene, camera);
      if (acteurs) {
        placerEtiquette(acteurs.etiquettes[0], acteurs.de.tete, 1.3 * 0.72);
        placerEtiquette(acteurs.etiquettes[1], acteurs.a.tete, 1.3 * 0.72);
      }
      return;
    }
    for (const x of gens.values()) {
      const p = x.p;
      if (pas(x, maintenant)) {
        if (x.personne.moi) viserDerriere(p.racine.position);
        if (x.sac) x.sac.visible = false;
        continue;
      }
      // Debout (au palais, dehors), on garde son sac à l'épaule : pas de sac par terre.
      if (x.sac) x.sac.visible = !x.siege?.debout;
      const k = s + p.phase;
      p.torse.scale.y = 1 + Math.sin(k * 1.6) * 0.012;
      // Qui arrive s'assoit : il descend doucement sur sa chaise.
      if (x.arrive) {
        const a = Math.min(1, (performance.now() - x.arrive) / 700);
        // Debout, on ne s'assoit pas : on arrive, simplement.
        p.bassin.position.y = (p.pose === "debout" ? 1.9 : 0) + (p.pose === "debout" ? 0 : (1 - a) * (1 - a) * 0.8);
        if (a >= 1) x.arrive = 0;
      }
      // Il prend ou range quelque chose : le bras droit est à ce geste-là.
      if (animerGeste(x, maintenant)) { animerSac(x, maintenant); continue; }
      // Il lit : à deux mains, la chose levée devant les yeux.
      if (gererLecture(p, x.personne.lit || null, maintenant)) {
        p.tete.rotation.y = Math.sin(k * 0.6) * 0.05;
        continue;
      }
      if (x.personne.main) {
        p.brasD.epaule.rotation.x += (2.95 - p.brasD.epaule.rotation.x) * 0.15;
        p.brasD.coude.rotation.x += (0.15 - p.brasD.coude.rotation.x) * 0.15;
      } else if (p.brasD.epaule.rotation.x > 2) {
        p.poser(p.pose);
      } else if (p.outil && x.personne.ecrit) {
        // Il écrit, en ce moment même : la main va et vient sur la page.
        p.brasD.epaule.rotation.x = 1.02 + Math.sin(k * 9) * 0.035;
        p.brasD.epaule.rotation.z = 0.12 + Math.sin(k * 3.7) * 0.07;
      } else if (p.outil) {
        // La plume en main, il n'écrit pas : la main posée, immobile.
        p.brasD.epaule.rotation.x += (1.0 - p.brasD.epaule.rotation.x) * 0.2;
        p.brasD.epaule.rotation.z += (0.1 - p.brasD.epaule.rotation.z) * 0.2;
      }
      // En réunion on regarde les uns, puis les autres ; en classe, le
      // tableau, avec un coup d'œil de temps en temps. Qui écrit baisse la tête.
      p.tete.rotation.y = Math.sin(k * 0.35) * (dispo.reunion ? 0.45 : 0.18) + (Math.sin(k * 0.11) > 0.93 ? 0.5 : 0);
      p.tete.rotation.x = Math.sin(k * 0.5) * 0.04 + (p.outil && x.personne.ecrit && !x.personne.main ? 0.28 : 0);
      if (p.pose === "debout" && !x.personne.main) {
        // Debout : le poids passe d'une jambe à l'autre, les bras bougent à peine.
        p.bassin.rotation.z = Math.sin(k * 0.6) * 0.018;
        p.bassin.position.x = Math.sin(k * 0.6) * 0.04;
        p.brasG.epaule.rotation.x = Math.sin(k * 0.8) * 0.05;
        if (!p.outil) p.brasD.epaule.rotation.x = -Math.sin(k * 0.8 + 1) * 0.05;
        // Au palais, on regarde le souverain ; on ne détourne les yeux qu'un instant.
        if (dispo.trone && x.siege) {
          const vers = Math.atan2(-(dispo.tete.x - x.siege.x), -(dispo.tete.z - x.siege.z)) - p.racine.rotation.y;
          p.tete.rotation.y = Math.max(-0.7, Math.min(0.7, vers)) + Math.sin(k * 0.3) * 0.08;
          p.tete.rotation.x = -0.12;
        }
      }
      animerSac(x, maintenant);
    }
    // Ce qu'on sort du sac monte un instant avant de partir sur la table.
    for (const m of sortants) {
      const a = Math.min(1, (maintenant - m.userData.sort) / 380);
      m.position.y = m.userData.y0 + a * 0.9;
      m.scale.setScalar(1 - a * 0.3);
      if (a >= 1) sortants.delete(m);
    }
    // La caméra rejoint doucement sa cible (on change de place, on se lève).
    if (suivre) {
      // Au temps, pas à l'image : le même glissé, que l'ordinateur soit rapide ou non.
      const f = 1 - Math.exp(-(maintenant - (derniereCam || maintenant)) / 220);
      base.lerp(posCible, f);
      regard.lerp(regardCible, f);
      pivot.lerp(pivotCible, f);
    }
    poserCamera(maintenant);
    derniereCam = maintenant;
    if (prof) {
      const p = prof.p;
      const lit = gererLecture(p, etat.prof.lit || null, maintenant);
      if (lit) {
        // Il lit : rien d'autre ne bouge.
      } else if (dispo.trone || dispo.rue) {
        // Le souverain regarde sa cour, lentement, de l'un à l'autre.
        p.tete.rotation.y = Math.sin(s * 0.22) * 0.38;
        p.tete.rotation.x = 0.06;
      } else if (!dispo.reunion) {
        const ecrit = Date.now() < ecritJusqua;
        const cibleY = ecrit ? 0.1 : Math.PI - 0.35 + Math.sin(s * 0.4) * 0.25;
        p.racine.rotation.y += (cibleY - p.racine.rotation.y) * 0.08;
        const bras = ecrit ? 2.3 + Math.sin(s * 6) * 0.12 : Math.sin(s * 0.9) * 0.08;
        p.brasD.epaule.rotation.x += (bras - p.brasD.epaule.rotation.x) * 0.12;
        p.racine.position.x += ((ecrit ? 4.2 : dispo.prof.x) - p.racine.position.x) * 0.03;
      } else {
        p.tete.rotation.y = Math.sin(s * 0.3) * 0.5;
      }
      p.torse.scale.y = 1 + Math.sin(s * 1.4) * 0.012;
    }
    renderer.render(scene, camera);
    if (prof) placerEtiquette(prof.etiquette, prof.p.tete, 1.3 * prof.p.racine.scale.x);
    for (const x of gens.values()) placerEtiquette(x.etiquette, x.p.tete, 1.3 * 0.72);
  }

  reconstruire();
  qualite();
  demanderImage();

  const api = {
    /**
     * Qui est là, et ce que chacun a devant lui.
     * @param {object} o
     * @param {"classe"|"reunion"} o.mode
     * @param {Array} o.eleves  [{ id, nom, brut, bureau: [{ k, m }], main }]
     * @param {object} o.prof   { present, nom, bureau }
     */
    maj({ mode = "classe", eleves = [], prof: p = { present: false }, vue = "eleve", remise = null } = {}) {
      etat = { mode, eleves, prof: p, vue, remise };
      reconstruire();
      if (dispo.remise && remise) monterActeurs(remise);
      majGens();
      majProf();
    },
    /**
     * La scène de remise : « approche » (il arrive et s'arrête devant
     * l'autre), « tend » (il tend le papier), « prend » (l'autre le prend et
     * le lit), « refuse » (il baisse le bras), « lit ».
     */
    jouer(phase) {
      if (!acteurs) return;
      acteurs.phase = phase;
      acteurs.t0 = performance.now();
      if (phase === "approche") {
        retirerLecture(acteurs.a); acteurs.a.poser("debout");
        acteurs.de.poser("debout");
        acteurs.papier?.parent?.remove(acteurs.papier);
      }
    },
    /**
     * Ouvrir mon sac : on le prend, on le pose sur la table, on regarde dedans.
     * contenu : [{ genre, kind, titre, cover, … }] ; surSortir(chose) au clic ;
     * surFermer() quand on le referme.
     */
    ouvrirSac({ contenu = [], surSortir = null, surFermer = null } = {}) {
      sacMoi = { contenu, surSortir, surFermer };
      const moi = [...gens.values()].find((x) => x.personne.moi);
      if (moi?.sac) { remplirSac(moi.sac, contenu); moi.sacOuvert = true; }
      boutonSac.hidden = false;
      cadrer();
    },
    /** Ce qu'il y a dedans a changé (on vient d'en sortir quelque chose). */
    majSac(contenu = []) {
      if (!sacMoi) return;
      sacMoi.contenu = contenu;
      const moi = [...gens.values()].find((x) => x.personne.moi);
      if (moi?.sac) remplirSac(moi.sac, contenu);
    },
    fermerSac() {
      if (!sacMoi) return;
      const fin = sacMoi.surFermer;
      sacMoi = null;
      const moi = [...gens.values()].find((x) => x.personne.moi);
      if (moi) moi.sacOuvert = false;
      boutonSac.hidden = true;
      cadrer();
      fin?.();
    },
    sacOuvert: () => Boolean(sacMoi),
    /** Pour les essais : où en est la vue. */
    rejouerEntree: () => jouerEntree(sceneJouee),
    /** Tourner la vue (comme en glissant) : { lacet, tangage, zoom, dx, dz }. */
    regarder(o = {}) { entree = null; Object.assign(libre, o); boutonVue.hidden = !vueLibreModifiee(); },
    etatVue: () => ({ entree: entree && { ...entree }, libre: { ...libre }, scene: sceneJouee, camera: camera.position.toArray(),
      trajets: [...gens.entries()].filter(([, x]) => x.trajet).map(([id, x]) => ({ id, pts: x.trajet.pts.map((v) => [+v.x.toFixed(2), +v.z.toFixed(2)]) })),
      sieges: dispo.sieges.map((t) => [+t.x.toFixed(2), +t.z.toFixed(2)]) }),
    /** Le professeur écrit : on le voit se tourner vers le tableau. */
    ecrit() { ecritJusqua = Date.now() + 2500; },
    /** Replacer le rendu ailleurs — dans la console, en petite fenêtre. */
    deplacer(nouvelHote) {
      if (hote === nouvelHote) return;
      nouvelHote.append(canvas, etiquettes, boutonSac, boutonVue, aideVue);
      hote = nouvelHote;
      fenetreObservee = null;
      observerTaille();
      verifie = 0;
      leger = null;
      qualite();
      cadrer();
    },
    detruire() {
      vivant = false;
      clearInterval(veille);
      horloge?.cancelAnimationFrame?.(anime);
      for (const x of gens.values()) { retirer(x.p.racine); if (x.sac) retirer(x.sac); }
      if (prof) retirer(prof.p.racine);
      oublierActeurs();
      observateur?.disconnect();
      texture?.dispose();
      for (const x of textures.values()) x.tex?.dispose();
      renderer.dispose();
      canvas.remove();
      etiquettes.remove();
      boutonSac.remove();
      boutonVue.remove();
      aideVue.remove();
    }
  };
  return api;
}
