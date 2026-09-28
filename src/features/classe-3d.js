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
const COSTUMES = ["#2b2f36", "#3a4a66", "#5c6168", "#77736b", "#2f3a2e", "#4a3a2c", "#8a8f96", "#23262c"];

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

export async function creerClasse3D({ hote, toile = () => null, surTableau = null, surPersonne = null }) {
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
  scene.add(new THREE.HemisphereLight("#fff4e4", "#3a2c22", 1.1));
  const soleil = new THREE.DirectionalLight("#ffe9cc", 2.4);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(2048, 2048);
  soleil.shadow.bias = -0.0003;
  soleil.shadow.normalBias = 0.02;
  scene.add(soleil, soleil.target);
  const plafonnier = new THREE.PointLight("#ffe7c7", 18, 30, 2);
  plafonnier.position.set(0, 9.5, -2);
  scene.add(plafonnier);

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
  const GEO = {
    tete: new THREE.LatheGeometry(profilTete, 28),
    torse: boiteRonde(2, 2, 1, 0.06),
    membre: boiteRonde(1, 2, 1, 0.06),
    bras: new THREE.CapsuleGeometry(0.34, 0.6, 6, 12),
    main: new THREE.SphereGeometry(0.3, 14, 10),
    cuisse: new THREE.CapsuleGeometry(0.4, 0.55, 6, 12),
    tibia: new THREE.CapsuleGeometry(0.38, 0.55, 6, 12),
    chaussure: boiteRonde(0.72, 0.36, 1.0, 0.14),
    cou: new THREE.CylinderGeometry(0.3, 0.34, 0.25, 14),
    col: new THREE.CylinderGeometry(0.46, 0.5, 0.22, 20, 1, true),
    oeil: new THREE.SphereGeometry(0.075, 10, 8),
    sourire: new THREE.TorusGeometry(0.2, 0.035, 6, 16, Math.PI),
    plastron: boiteRonde(0.62, 1.1, 0.04, 0.015),
    cravate: boiteRonde(0.2, 0.95, 0.05, 0.02),
    cheveuxCourts: new THREE.SphereGeometry(0.7, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.64),
    cheveuxLongs: new THREE.SphereGeometry(1, 20, 14),
    chignon: new THREE.SphereGeometry(0.32, 14, 10),
    plan: new THREE.PlaneGeometry(1, 1),
    pied: new THREE.CylinderGeometry(0.06, 0.06, 1, 8)
  };
  const PARTAGEES = new Set(Object.values(GEO));
  const ombrer = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  /* --- Un personnage ------------------------------------------------------ */
  /* --- Un personnage : la silhouette classique de Roblox -------------------
     Une tête cylindrique aux bords adoucis, un torse carré, deux bras et deux
     jambes d'un seul bloc. Pas de visage : ni yeux, ni sourire. Un costume
     ouvert sur la chemise et la cravate, et des cheveux pour qu'on ne voie
     pas des crânes nus depuis le fond de la salle. */
  function personnage(cle) {
    const alea = graine(cle);
    const peau = matDe(choisir(alea, PEAUX));
    const costume = matDe(choisir(alea, COSTUMES), { roughness: .9 });
    const pantalon = matDe(choisir(alea, ["#1b1d22", "#23262d", "#2a2d33"]), { roughness: .9 });
    const cheveux = matDe(choisir(alea, CHEVEUX), { roughness: .7 });
    const chemise = matDe(choisir(alea, ["#eef0f2", "#dfe6ee", "#e9e3d6"]));
    const coupe = choisir(alea, ["courts", "courts", "longs", "chignon", "courts"]);

    const racine = new THREE.Group();
    const bassin = new THREE.Group();          // le bas du torse, où naissent les jambes
    racine.add(bassin);

    const torse = new THREE.Mesh(GEO.torse, costume);
    torse.position.y = 1;
    // Le costume ouvert : la chemise en V et la cravate, sur le devant.
    const plastron = new THREE.Mesh(GEO.plastron, chemise);
    plastron.position.set(0, 1.45, -0.51);
    const cravate = new THREE.Mesh(GEO.cravate, matDe(choisir(alea, ["#6b1f24", "#1f2f55", "#2c3b2a", "#3a2a4a"])));
    cravate.position.set(0, 1.4, -0.54);
    bassin.add(torse, plastron, cravate);

    const tete = new THREE.Group();
    tete.position.y = 2;
    bassin.add(tete);
    const crane = new THREE.Mesh(GEO.tete, peau);
    crane.position.y = 0.62;
    tete.add(crane);
    const calotte = new THREE.Mesh(GEO.cheveuxCourts, cheveux);
    calotte.position.y = 0.74;
    calotte.rotation.x = 0.28;
    calotte.scale.set(1.04, 1, 1.04);
    tete.add(calotte);
    if (coupe === "longs") {
      const longs = new THREE.Mesh(GEO.cheveuxLongs, cheveux);
      longs.scale.set(0.5, 0.58, 0.24);
      longs.position.set(0, 0.36, 0.44);
      tete.add(longs);
    } else if (coupe === "chignon") {
      const c = new THREE.Mesh(GEO.chignon, cheveux);
      c.position.set(0, 1.05, 0.55);
      tete.add(c);
    }

    /* Un membre d'un seul bloc, pendu à son articulation. Le « bout » est un
       repère au bas du bloc : c'est là que la main tient le crayon. */
    const membre = (x, y, mat) => {
      const epaule = new THREE.Group();
      epaule.position.set(x, y, 0);
      const bloc = new THREE.Mesh(GEO.membre, mat);
      bloc.position.y = -0.9;
      const coude = new THREE.Group();          // gardé pour les gestes, invisible
      coude.position.y = -1.85;
      const bout = new THREE.Group();
      coude.add(bout);
      epaule.add(bloc, coude);
      return { epaule, coude, bout };
    };
    const brasG = membre(-1.5, 1.9, costume);
    const brasD = membre(1.5, 1.9, costume);
    const jambeG = membre(-0.5, 0.1, pantalon);
    const jambeD = membre(0.5, 0.1, pantalon);
    for (const m of [brasG, brasD, jambeG, jambeD]) bassin.add(m.epaule);
    ombrer(racine);

    const p = { racine, bassin, tete, brasG, brasD, jambeG, jambeD, torse, alea, phase: alea() * 10, outil: null };

    p.poser = (pose) => {
      p.pose = pose;
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
  function poserObjet(groupe, kind, { x, z, r }) {
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
      groupe.add(m);
    };
    if (info.tex) monter(info); else info.attente.push(monter);
  }
  /** Tout ce qu'une personne a devant elle. `liste` : [{ k, m }] (m : en main). */
  function garnir(groupe, liste = []) {
    groupe.userData.jeton = (groupe.userData.jeton || 0) + 1;
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
      poserObjet(groupe, kind, { x: place.x + place.dx * n, z: place.z + place.dz * n, r: place.r + n * 0.08 });
    }
    return enMain?.k || null;
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

  function piece({ largeur, fond, avant }) {
    const profondeur = avant - fond + 4;
    const sol = new THREE.Mesh(new THREE.PlaneGeometry(largeur + 2, profondeur),
      new THREE.MeshStandardMaterial({ map: TEX.plancher, roughness: .78 }));
    sol.rotation.x = -Math.PI / 2;
    sol.position.set(0, 0, (fond + avant) / 2);
    sol.receiveShadow = true;
    decor.add(sol);

    const matMur = new THREE.MeshStandardMaterial({ map: TEX.mur, roughness: .95 });
    const matLambris = new THREE.MeshStandardMaterial({ map: TEX.lambris, roughness: .7 });
    const mur = (l, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(l, 13), matMur);
      m.position.set(x, 6.5, z); m.rotation.y = ry; m.receiveShadow = true;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(l, 1.8), matLambris);
      b.position.set(x, 0.9, z); b.rotation.y = ry; b.translateZ(0.02);
      const moulure = new THREE.Mesh(new THREE.BoxGeometry(l, 0.12, 0.08), matDe("#3a2a1e"));
      moulure.position.set(x, 1.82, z); moulure.rotation.y = ry; moulure.translateZ(0.04);
      decor.add(m, b, moulure);
    };
    mur(largeur + 2, 0, fond, 0);
    mur(profondeur, -largeur / 2, (fond + avant) / 2, Math.PI / 2);
    mur(profondeur, largeur / 2, (fond + avant) / 2, -Math.PI / 2);

    // Les fenêtres, à gauche : le jour y entre.
    for (let z = fond + 5; z < avant - 1; z += 7) {
      // Le carreau devant le cadre : c'est lui qui laisse passer le jour.
      const f = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.6), new THREE.MeshBasicMaterial({ color: "#d6e2e8" }));
      f.position.set(-largeur / 2 + 0.1, 5.6, z);
      f.rotation.y = Math.PI / 2;
      const cadre = new THREE.Mesh(boiteRonde(4.4, 5, 0.12, 0.04), matDe("#3a2d22"));
      cadre.position.set(-largeur / 2 + 0.02, 5.6, z);
      cadre.rotation.y = Math.PI / 2;
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.6, 0.1), matDe("#3a2d22"));
      v.position.set(-largeur / 2 + 0.14, 5.6, z);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 4), matDe("#3a2d22"));
      h.position.set(-largeur / 2 + 0.14, 5.6, z);
      decor.add(cadre, f, v, h);
    }
    soleil.position.set(-largeur / 2 - 6, 16, (fond + avant) / 2 + 3);
    soleil.target.position.set(0, 0, (fond + avant) / 2 - 2);
    const demi = Math.max(largeur, profondeur) / 2 + 4;
    Object.assign(soleil.shadow.camera, { left: -demi, right: demi, top: demi, bottom: -demi, near: 1, far: 80 });
    soleil.shadow.camera.updateProjectionMatrix();

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
    return objets;
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
        sieges.push({ x, z: z + 0.35, angle: 0, objets: pupitre(x, z) });
      }
    }
    // Les premiers rangs d'abord, le milieu avant les bords.
    sieges.sort((a, b) => (a.z - b.z) || (Math.abs(a.x) - Math.abs(b.x)));
    return { sieges, rangs, cols, dernier, fond, prof: { x: 6.4, z: fond + 1.9 } };
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
    // Une carafe et des verres au centre : une vraie table de réunion.
    const verre = new THREE.MeshPhysicalMaterial({ color: "#e6eef2", roughness: .05, transmission: .9, thickness: .2, transparent: true, opacity: .55 });
    const carafe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.8, 20), verre);
    carafe.position.set(0.25, 2.64, -0.15);
    decor.add(carafe);

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

  /* --- Les gens ------------------------------------------------------------ */
  const gens = new Map();              // id → { p, siege, etiquette, personne, sig }
  let prof = null;
  let etat = { mode: "classe", eleves: [], prof: { present: false } };
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
    const pose = dispo.reunion ? "assis"
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
    const cols = colonnesPour(n);
    const cle = reunion ? `reunion:${total}` : `classe:${cols}x${Math.max(2, Math.ceil(n / cols))}`;
    if (cle === dispo.cle) return;
    for (const o of [...decor.children]) {
      decor.remove(o);
      o.traverse((m) => { if (m.isMesh && !PARTAGEES.has(m.geometry)) m.geometry.dispose(); });
    }
    ardoise = null;
    objetsProf = null;
    dispo = reunion
      ? { cle, reunion: true, ...construireReunion(total) }
      : { cle, reunion: false, ...construireClasse(n) };
    // Chacun reprend une place dans la nouvelle salle.
    const libres = [...dispo.sieges];
    for (const x of gens.values()) asseoir(x, libres.shift() || dispo.sieges[0]);
    if (prof) placerProf();
    cadrer();
  }

  function placerProf() {
    const p = prof.p;
    if (dispo.reunion) {
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

  function majGens() {
    const ids = new Set(etat.eleves.map((x) => String(x.id)));
    for (const [id, x] of [...gens]) {
      if (ids.has(id)) continue;
      scene.remove(x.p.racine);
      x.etiquette.remove();
      garnir(x.siege.objets, []);
      gens.delete(id);
    }
    const prises = new Set([...gens.values()].map((x) => x.siege));
    for (const e of etat.eleves) {
      const id = String(e.id);
      let x = gens.get(id);
      if (!x) {
        const siege = dispo.sieges.find((s) => !prises.has(s));
        if (!siege) continue;
        prises.add(siege);
        const p = personnage(id);
        scene.add(p.racine);
        x = { p, personne: e, etiquette: etiquette(e.nom), sig: null, arrive: performance.now() };
        x.etiquette.onclick = () => surPersonne?.(x.etiquette, x.personne.brut);
        p.racine.traverse((o) => { o.userData.personne = id; });
        gens.set(id, x);
        asseoir(x, siege);
      }
      x.personne = e;
      x.etiquette.textContent = e.nom;
      x.etiquette.classList.toggle("classe3d__nom--main", Boolean(e.main));
      // Ce qu'il a devant lui : on ne repose que si cela a changé.
      const sig = JSON.stringify(e.bureau || []);
      if (sig !== x.sig) {
        x.sig = sig;
        x.p.tenir(garnir(x.siege.objets, e.bureau || []));
      }
    }
  }

  function majProf() {
    const p = etat.prof;
    if (!p.present) {
      if (prof) { scene.remove(prof.p.racine); prof.etiquette.remove(); prof = null; }
      if (objetsProf) garnir(objetsProf, []);
      if (dispo.tete) garnir(dispo.tete.objets, []);
      return;
    }
    if (!prof) {
      const q = personnage(`prof:${p.nom}`);
      scene.add(q.racine);
      prof = { p: q, etiquette: etiquette(p.nom, "classe3d__nom--prof"), sig: null };
      placerProf();
    }
    prof.etiquette.textContent = p.nom;
    const sig = JSON.stringify(p.bureau || []);
    if (sig !== prof.sig) {
      prof.sig = sig;
      const cible = dispo.reunion ? dispo.tete.objets : objetsProf;
      const tenu = garnir(cible, p.bureau || []);
      // Debout au tableau, le professeur tient sa craie ; assis, sa plume.
      prof.p.tenir(dispo.reunion ? tenu : (tenu === "craie" ? "craie" : null));
    }
  }

  /* --- Le cadrage ----------------------------------------------------------
     La caméra est à SA place : au fond de la classe, ou à son bord de la
     table. Le tableau et les autres doivent tenir dans l'image, quelle que
     soit la forme de la fenêtre. */
  function cadrer() {
    const l = hote.clientWidth || 1, h = hote.clientHeight || 1;
    renderer.setSize(l, h, false);
    camera.aspect = l / h;
    const k = Math.min(1, Math.max(0, (camera.aspect - 1.2) / 1.6));
    if (dispo.reunion) {
      const R = dispo.R;
      camera.fov = 58 - k * 20;
      camera.position.set(0, 5.4 + R * 0.55 - k * 0.6, R + 3.4 + (1 - k) * 2.2);
      regard.set(0, 2.9 + k * 0.6, -R * 0.55);
    } else {
      const plus = Math.max(0, (dispo.rangs || 3) - 3);
      camera.fov = 56 - k * 24 + ((dispo.cols || 4) - 4) * 4;
      camera.position.set(0.4, 10.2 - k * 2.4 + plus * 0.8, (dispo.dernier ?? 2) + 12.8 - k * 4);
      regard.set(0, 3.2 + k * 0.5, -7);
    }
    camera.lookAt(regard);
    camera.updateProjectionMatrix();
  }
  const observateur = new ResizeObserver(() => cadrer());
  observateur.observe(hote);

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
  canvas.addEventListener("pointermove", (e) => {
    const o = viser(e);
    const cible = o?.userData.tableau ? "tableau" : o?.userData.personne || null;
    canvas.style.cursor = cible ? "pointer" : "";
    if (cible !== survol) {
      for (const [id, x] of gens) x.etiquette.classList.toggle("classe3d__nom--survol", id === cible);
      survol = cible;
    }
  });
  canvas.addEventListener("click", (e) => {
    const o = viser(e);
    if (o?.userData.tableau) surTableau?.();
    else if (o?.userData.personne) {
      const x = gens.get(o.userData.personne);
      if (x) surPersonne?.(x.etiquette, x.personne.brut);
    }
  });

  /* --- La boucle : moins d'images en petit, aucune quand on ne voit rien --- */
  const vecteur = new THREE.Vector3();
  let dernier = 0, dernierTableau = 0, anime = 0, vivant = true, visible = true;
  let leger = null;
  const io = new IntersectionObserver(([x]) => { visible = x.isIntersecting; });
  io.observe(hote);

  /** Au-dessus du jeu, on laisse la carte graphique à Roblox. */
  function qualite() {
    const petit = hote.clientWidth < 720 || document.body.classList.contains("est-flottant");
    if (petit === leger) return;
    leger = petit;
    renderer.setPixelRatio(leger ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
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

  function image(t) {
    if (!vivant) return;
    anime = requestAnimationFrame(image);
    if (!visible || document.hidden || t - dernier < (leger ? 50 : 33)) return;
    dernier = t;
    const s = t / 1000;
    if (t - dernierTableau > (leger ? 500 : 300)) { suivreToile(); dernierTableau = t; qualite(); }

    for (const x of gens.values()) {
      const p = x.p;
      const k = s + p.phase;
      p.torse.scale.y = 1 + Math.sin(k * 1.6) * 0.012;
      // Qui arrive s'assoit : il descend doucement sur sa chaise.
      if (x.arrive) {
        const a = Math.min(1, (performance.now() - x.arrive) / 700);
        p.bassin.position.y = (1 - a) * (1 - a) * 0.8;
        if (a >= 1) x.arrive = 0;
      }
      if (x.personne.main) {
        p.brasD.epaule.rotation.x += (2.95 - p.brasD.epaule.rotation.x) * 0.15;
        p.brasD.coude.rotation.x += (0.15 - p.brasD.coude.rotation.x) * 0.15;
      } else if (p.brasD.epaule.rotation.x > 2) {
        p.poser(p.pose);
      } else if (p.outil) {
        // Il écrit : le bras sur la table, la main qui va et vient.
        p.brasD.epaule.rotation.x = 1.02 + Math.sin(k * 7) * 0.03;
        p.brasD.epaule.rotation.z = 0.12 + Math.sin(k * 3.1) * 0.05;
      }
      // En réunion on regarde les uns, puis les autres ; en classe, le
      // tableau, avec un coup d'œil de temps en temps. Qui écrit baisse la tête.
      p.tete.rotation.y = Math.sin(k * 0.35) * (dispo.reunion ? 0.45 : 0.18) + (Math.sin(k * 0.11) > 0.93 ? 0.5 : 0);
      p.tete.rotation.x = Math.sin(k * 0.5) * 0.04 + (p.outil && !x.personne.main ? 0.28 : 0);
    }
    if (prof) {
      const p = prof.p;
      if (!dispo.reunion) {
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
  anime = requestAnimationFrame(image);

  return {
    /**
     * Qui est là, et ce que chacun a devant lui.
     * @param {object} o
     * @param {"classe"|"reunion"} o.mode
     * @param {Array} o.eleves  [{ id, nom, brut, bureau: [{ k, m }], main }]
     * @param {object} o.prof   { present, nom, bureau }
     */
    maj({ mode = "classe", eleves = [], prof: p = { present: false } } = {}) {
      etat = { mode, eleves, prof: p };
      reconstruire();
      majGens();
      majProf();
    },
    /** Le professeur écrit : on le voit se tourner vers le tableau. */
    ecrit() { ecritJusqua = Date.now() + 2500; },
    /** Replacer le rendu ailleurs — dans la console, en petite fenêtre. */
    deplacer(nouvelHote) {
      if (hote === nouvelHote) return;
      nouvelHote.append(canvas, etiquettes);
      observateur.disconnect(); observateur.observe(nouvelHote);
      io.disconnect(); io.observe(nouvelHote);
      hote = nouvelHote;
      leger = null;
      qualite();
      cadrer();
    },
    detruire() {
      vivant = false;
      cancelAnimationFrame(anime);
      observateur.disconnect();
      io.disconnect();
      texture?.dispose();
      for (const x of textures.values()) x.tex?.dispose();
      renderer.dispose();
      canvas.remove();
      etiquettes.remove();
    }
  };
}
