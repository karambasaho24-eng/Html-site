/* ---------------------------------------------------------------------------
 * La classe, en trois dimensions.
 *
 * Ce que l'on voit depuis sa place : le tableau au fond, le professeur devant,
 * les autres assis à leur pupitre, de dos, qui regardent le cours. Des
 * personnages dans l'esprit de Roblox — têtes rondes, membres arrondis, un
 * costume sombre, des cheveux —, pas des cubes.
 *
 * Le tableau est VIVANT : sa texture est la toile même du tableau de la
 * séance, recopiée quelques fois par seconde. On lit ce que le professeur
 * écrit sans rien ouvrir ; un clic l'agrandit.
 *
 * Le module ne sait rien de la base : on lui dit qui est assis, si le
 * professeur est devant la classe, et où trouver la toile du tableau.
 *
 * three.js est livré avec le site (vendor/) et chargé à la demande. S'il ne
 * se charge pas, ou si WebGL manque, la salle garde sa vue à plat.
 * ------------------------------------------------------------------------- */
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

/* --- Une graine stable par personne : même coiffure, même place ----------- */
function graine(texte) {
  let h = 2166136261;
  for (const c of String(texte)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}
const choisir = (alea, liste) => liste[Math.floor(alea() * liste.length) % liste.length];

const PEAUX = ["#f2cfae", "#e6b48c", "#c98d62", "#a06a47", "#6f4731", "#f5cd30"];
const CHEVEUX = ["#17120f", "#2e2018", "#5a3a22", "#8a5a2b", "#c9a15a", "#7a2c1a", "#3b3b3b"];
const COSTUMES = ["#23272e", "#1d2536", "#2b2b30", "#353a42", "#1f1f23", "#2a3140"];

/* 12 places : trois rangées de quatre, face au tableau (vers -z). */
const PLACES = [];
// Les premiers rangs d'abord : ce sont eux qu'on voit, derrière eux on devine.
for (const z of [-4.6, -1.7, 1.2]) for (const x of [-1.8, 1.8, -5.4, 5.4]) PLACES.push({ x, z });

export async function creerClasse3D({ hote, toile = () => null, surTableau = null, surPersonne = null }) {
  const THREE = await chargerThree();

  /* --- Le rendu ------------------------------------------------------------ */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "classe3d__toile";

  const etiquettes = document.createElement("div");
  etiquettes.className = "classe3d__etiquettes";
  hote.append(canvas, etiquettes);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#171a1d");
  scene.fog = new THREE.Fog("#171a1d", 24, 40);

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 80);
  const regard = new THREE.Vector3(0, 3.1, -7);

  /* --- La lumière : une fenêtre à gauche, un plafonnier doux --------------- */
  scene.add(new THREE.HemisphereLight("#fff4e4", "#3a2c22", 1.25));
  const soleil = new THREE.DirectionalLight("#ffe9cc", 2.2);
  soleil.position.set(-12, 16, 6);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(1024, 1024);
  Object.assign(soleil.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  soleil.shadow.bias = -0.0004;
  scene.add(soleil);
  const tableauLumiere = new THREE.PointLight("#fff2dc", 14, 14, 2);
  tableauLumiere.position.set(0, 7, -6);
  scene.add(tableauLumiere);

  /* --- Matières ----------------------------------------------------------- */
  const mat = (couleur, extra = {}) => new THREE.MeshStandardMaterial({ color: couleur, roughness: .8, metalness: 0, ...extra });
  const cacheMat = new Map();
  const matDe = (c) => { if (!cacheMat.has(c)) cacheMat.set(c, mat(c)); return cacheMat.get(c); };

  function texturePlancher() {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const g = c.getContext("2d");
    for (let i = 0; i < 8; i++) {
      const teinte = 38 + (i * 37 % 7);
      g.fillStyle = `hsl(28, 32%, ${teinte}%)`;
      g.fillRect(0, i * 64, 512, 64);
      g.fillStyle = "rgba(0,0,0,.18)";
      g.fillRect(0, i * 64, 512, 2);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(${k % 2 ? "255,230,200" : "40,20,10"},.035)`;
        g.fillRect(0, i * 64 + Math.random() * 64, 512, 1);
      }
      g.fillStyle = "rgba(0,0,0,.2)";
      g.fillRect(((i * 173) % 512), i * 64, 2, 64);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 4);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

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
  // La tête Roblox : un cylindre aux bords très arrondis.
  const profilTete = [];
  {
    const R = 0.62, H = 1.2, r = 0.3;
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
    torse: boiteRonde(1.9, 1.95, 0.95, 0.2),
    bras: new THREE.CapsuleGeometry(0.34, 0.6, 6, 12),
    main: new THREE.SphereGeometry(0.3, 14, 10),
    cuisse: new THREE.CapsuleGeometry(0.4, 0.55, 6, 12),
    tibia: new THREE.CapsuleGeometry(0.38, 0.55, 6, 12),
    chaussure: boiteRonde(0.72, 0.36, 1.0, 0.14),
    cou: new THREE.CylinderGeometry(0.3, 0.34, 0.25, 14),
    col: new THREE.CylinderGeometry(0.46, 0.5, 0.22, 20, 1, true),
    oeil: new THREE.SphereGeometry(0.075, 10, 8),
    cheveuxCourts: new THREE.SphereGeometry(0.68, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
    cheveuxLongs: new THREE.SphereGeometry(1, 20, 14),
    chignon: new THREE.SphereGeometry(0.32, 14, 10)
  };

  /* --- Un personnage ------------------------------------------------------ */
  function personnage(cle, { face = false } = {}) {
    const alea = graine(cle);
    const peau = matDe(choisir(alea, PEAUX));
    const costume = matDe(choisir(alea, COSTUMES));
    const pantalon = matDe(choisir(alea, ["#1b1d22", "#23262d", "#2a2d33"]));
    const cheveux = matDe(choisir(alea, CHEVEUX));
    const chemise = matDe("#eef0f2");
    const noir = matDe("#141416");
    const coupe = choisir(alea, ["courts", "courts", "longs", "chignon", "courts"]);

    const racine = new THREE.Group();
    const bassin = new THREE.Group();          // point d'appui : le bassin
    racine.add(bassin);

    const torse = new THREE.Mesh(GEO.torse, costume);
    torse.position.y = 0.98;
    bassin.add(torse);
    // Le col de chemise et la cravate, sur le devant.
    const col = new THREE.Mesh(GEO.col, chemise);
    col.position.y = 1.98;
    bassin.add(col);
    if (face) {
      const plastron = new THREE.Mesh(boiteRonde(0.5, 0.9, 0.05, 0.02), chemise);
      plastron.position.set(0, 1.55, -0.49);
      const cravate = new THREE.Mesh(boiteRonde(0.18, 0.8, 0.06, 0.03), matDe("#6b1f24"));
      cravate.position.set(0, 1.5, -0.53);
      bassin.add(plastron, cravate);
    }

    const tete = new THREE.Group();
    tete.position.y = 2.1;
    bassin.add(tete);
    const cou = new THREE.Mesh(GEO.cou, peau);
    cou.position.y = 0.05;
    const crane = new THREE.Mesh(GEO.tete, peau);
    crane.position.y = 0.72;
    tete.add(cou, crane);
    // Les cheveux : une calotte, et selon la coupe une longueur ou un chignon.
    const calotte = new THREE.Mesh(GEO.cheveuxCourts, cheveux);
    calotte.position.y = 0.86;
    calotte.rotation.x = 0.28;                  // plus bas derrière que devant
    tete.add(calotte);
    if (coupe === "longs") {
      const longs = new THREE.Mesh(GEO.cheveuxLongs, cheveux);
      longs.scale.set(0.5, 0.6, 0.26);
      longs.position.set(0, 0.42, 0.44);
      tete.add(longs);
    } else if (coupe === "chignon") {
      const c = new THREE.Mesh(GEO.chignon, cheveux);
      c.position.set(0, 1.15, 0.55);
      tete.add(c);
    }
    if (face) {
      // Le visage classique : deux yeux, un sourire.
      for (const x of [-0.2, 0.2]) {
        const o = new THREE.Mesh(GEO.oeil, noir);
        o.scale.set(0.9, 1.4, 0.5);
        o.position.set(x, 0.82, -0.6);
        tete.add(o);
      }
      const sourire = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16, Math.PI), noir);
      sourire.rotation.set(0, Math.PI, Math.PI);
      sourire.position.set(0, 0.58, -0.6);
      tete.add(sourire);
    }

    const membre = (x, y, geoA, geoB, matA, matB, bout) => {
      const epaule = new THREE.Group();
      epaule.position.set(x, y, 0);
      const haut = new THREE.Mesh(geoA, matA);
      haut.position.y = -0.55;
      const coude = new THREE.Group();
      coude.position.y = -0.95;
      const bas = new THREE.Mesh(geoB, matB);
      bas.position.y = -0.5;
      coude.add(bas);
      if (bout) coude.add(bout);
      epaule.add(haut, coude);
      return { epaule, coude };
    };
    const main = () => { const m = new THREE.Mesh(GEO.main, peau); m.position.y = -1.05; return m; };
    const pied = () => { const s = new THREE.Mesh(GEO.chaussure, noir); s.position.set(0, -1.05, -0.2); return s; };
    const brasG = membre(-1.3, 1.78, GEO.bras, GEO.bras, costume, costume, main());
    const brasD = membre(1.3, 1.78, GEO.bras, GEO.bras, costume, costume, main());
    const jambeG = membre(-0.48, 0.05, GEO.cuisse, GEO.tibia, pantalon, pantalon, pied());
    const jambeD = membre(0.48, 0.05, GEO.cuisse, GEO.tibia, pantalon, pantalon, pied());
    for (const m of [brasG, brasD, jambeG, jambeD]) bassin.add(m.epaule);

    racine.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    const p = { racine, bassin, tete, brasG, brasD, jambeG, jambeD, torse, alea, phase: alea() * 10 };

    /* Les poses. Le personnage regarde vers -z (le tableau). */
    p.poser = (pose) => {
      p.pose = pose;
      for (const m of [brasG, brasD, jambeG, jambeD]) { m.epaule.rotation.set(0, 0, 0); m.coude.rotation.set(0, 0, 0); }
      bassin.rotation.set(0, 0, 0);
      if (pose === "debout") { bassin.position.y = 2.2; return; }
      bassin.position.y = 0;
      if (pose === "tailleur") {
        // Assis en tailleur sur sa chaise : les cuisses écartées, les tibias
        // croisés devant soi.
        jambeG.epaule.rotation.set(Math.PI / 2 - 0.15, 0, 0);
        jambeD.epaule.rotation.set(Math.PI / 2 - 0.15, 0, 0);
        jambeG.epaule.rotation.order = jambeD.epaule.rotation.order = "YXZ";
        jambeG.epaule.rotation.y = 0.75;
        jambeD.epaule.rotation.y = -0.75;
        jambeG.coude.rotation.z = Math.PI / 2 + 0.35;
        jambeD.coude.rotation.z = -(Math.PI / 2 + 0.35);
        jambeD.coude.position.y = -0.9;
        brasG.epaule.rotation.set(0.35, 0, -0.12);
        brasD.epaule.rotation.set(0.35, 0, 0.12);
        brasG.coude.rotation.x = 0.9;
        brasD.coude.rotation.x = 0.9;
        return;
      }
      // Assis sur sa chaise, les pieds au sol.
      jambeG.epaule.rotation.x = Math.PI / 2;
      jambeD.epaule.rotation.x = Math.PI / 2;
      jambeG.coude.rotation.x = -Math.PI / 2;
      jambeD.coude.rotation.x = -Math.PI / 2;
      if (pose === "accoude") {
        // Le coude sur le pupitre, la joue dans la main.
        brasD.epaule.rotation.set(1.25, 0, 0.1);
        brasD.coude.rotation.x = 1.9;
        brasG.epaule.rotation.set(1.0, 0, -0.05);
        brasG.coude.rotation.x = 0.55;
        tete.rotation.z = -0.12;
      } else {
        // Les avant-bras posés sur le pupitre : on écrit, on suit.
        brasG.epaule.rotation.set(0.95, 0, -0.08);
        brasD.epaule.rotation.set(0.95, 0, 0.08);
        brasG.coude.rotation.x = 0.65;
        brasD.coude.rotation.x = 0.65;
      }
    };
    return p;
  }

  /* --- La salle ------------------------------------------------------------ */
  const sol = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: texturePlancher(), roughness: .85 }));
  sol.rotation.x = -Math.PI / 2;
  sol.receiveShadow = true;
  scene.add(sol);

  const murMat = mat("#b9b2a6");
  const soubassement = mat("#5b4a3b");
  const mur = (l, h, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l, h), murMat);
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true;
    scene.add(m);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(l, 1.6), soubassement);
    b.position.set(x, 0.8, z); b.rotation.y = ry;
    b.translateZ(0.01);
    scene.add(b);
  };
  mur(30, 12, 0, 6, -10);
  mur(30, 12, -9.5, 6, 0, Math.PI / 2);
  mur(30, 12, 9.5, 6, 0, -Math.PI / 2);
  // Deux fenêtres à gauche : la lumière du jour.
  for (const z of [-4, 3]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(4, 4.5), new THREE.MeshBasicMaterial({ color: "#c4d3dc" }));
    f.position.set(-9.48, 5.4, z);
    f.rotation.y = Math.PI / 2;
    scene.add(f);
    const traverse = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.5, 0.12), matDe("#3a2d22"));
    traverse.position.set(-9.45, 5.4, z);
    scene.add(traverse);
  }

  /* Le tableau : la toile de la séance, sur un cadre de bois. */
  const LT = 9.6, HT = LT * 9 / 16;
  const cadre = new THREE.Mesh(boiteRonde(LT + 0.5, HT + 0.5, 0.2, 0.06), matDe("#4a3321"));
  cadre.position.set(0, 4.9, -9.85);
  cadre.castShadow = true;
  scene.add(cadre);
  const ardoiseMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .92 });
  const ardoiseVide = mat("#22332c");
  const ardoise = new THREE.Mesh(new THREE.PlaneGeometry(LT, HT), ardoiseVide);
  ardoise.position.set(0, 4.9, -9.72);
  ardoise.userData.tableau = true;
  scene.add(ardoise);
  const rebord = new THREE.Mesh(boiteRonde(LT + 0.3, 0.14, 0.4, 0.05), matDe("#4a3321"));
  rebord.position.set(0, 4.9 - HT / 2 - 0.25, -9.6);
  scene.add(rebord);
  const craie = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), matDe("#f3f0e6"));
  craie.rotation.z = Math.PI / 2;
  craie.position.set(-2.8, rebord.position.y + 0.12, -9.55);
  scene.add(craie);

  let texture = null;
  let toileSuivie = null;
  function suivreToile() {
    const t = toile();
    if (t !== toileSuivie) {
      texture?.dispose();
      texture = null;
      toileSuivie = t;
      if (t) {
        texture = new THREE.CanvasTexture(t);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        ardoiseMat.map = texture;
        ardoiseMat.needsUpdate = true;
        ardoise.material = ardoiseMat;
      } else {
        ardoise.material = ardoiseVide;
      }
    }
    if (texture) texture.needsUpdate = true;
  }

  /* L'estrade et le bureau du professeur. */
  const estrade = new THREE.Mesh(boiteRonde(14, 0.4, 3.2, 0.06), matDe("#4d3b2c"));
  estrade.position.set(0, 0.2, -8.3);
  estrade.receiveShadow = true;
  scene.add(estrade);
  const bureauProf = new THREE.Group();
  const plateauProf = new THREE.Mesh(boiteRonde(4, 0.2, 1.8, 0.05), matDe("#5e4230"));
  plateauProf.position.y = 2.6;
  const caisson = new THREE.Mesh(boiteRonde(3.8, 2.2, 0.15, 0.03), matDe("#523a2a"));
  caisson.position.set(0, 1.5, 0.8);
  bureauProf.add(plateauProf, caisson);
  bureauProf.position.set(-4.6, 0.4, -7.6);
  bureauProf.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(bureauProf);

  /* Les pupitres des élèves, et leurs tabourets. */
  const boisPupitre = matDe("#6b4b33");
  const metal = matDe("#2d3033");
  for (const { x, z } of PLACES) {
    const g = new THREE.Group();
    const plateau = new THREE.Mesh(boiteRonde(2.6, 0.16, 1.5, 0.05), boisPupitre);
    plateau.position.set(0, 2.15, -1.15);
    g.add(plateau);
    for (const [dx, dz] of [[-1.15, -1.75], [1.15, -1.75], [-1.15, -0.55], [1.15, -0.55]]) {
      const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.1, 8), metal);
      pied.position.set(dx, 1.05, dz);
      g.add(pied);
    }
    const assise = new THREE.Mesh(boiteRonde(1.5, 0.14, 1.3, 0.05), boisPupitre);
    assise.position.set(0, 0.95, 0.35);
    g.add(assise);
    for (const [dx, dz] of [[-0.6, -0.2], [0.6, -0.2], [-0.6, 0.9], [0.6, 0.9]]) {
      const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 8), metal);
      pied.position.set(dx, 0.47, dz);
      g.add(pied);
    }
    // Un cahier ouvert sur le pupitre.
    const cahier = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.65), matDe("#efe6d2"));
    cahier.position.set(-0.3, 2.25, -1.25);
    cahier.rotation.y = 0.12;
    g.add(cahier);
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
  }

  /* --- Les gens ------------------------------------------------------------ */
  const eleves = new Map();            // id → { p, place, etiquette }
  let prof = null;
  let profEtat = { present: false, nom: "" };
  let ecritJusqua = 0;

  function etiquette(texte, classe = "") {
    const e = document.createElement("button");
    e.type = "button";
    e.className = `classe3d__nom ${classe}`.trim();
    e.textContent = texte;
    etiquettes.appendChild(e);
    return e;
  }

  function placerEleve(personne, index) {
    const place = PLACES[index];
    const p = personnage(personne.id);
    const alea = graine(`pose:${personne.id}`);
    const pose = choisir(alea, ["assis", "assis", "tailleur", "accoude", "assis"]);
    p.poser(pose);
    // Assis au milieu du tabouret ; en tailleur, un peu plus en arrière.
    p.racine.position.set(place.x, 1.02 + (pose === "tailleur" ? 0.1 : 0), place.z + (pose === "tailleur" ? 0.5 : 0.35));
    p.racine.scale.setScalar(0.8);
    scene.add(p.racine);
    const e = etiquette(personne.nom);
    e.onclick = () => surPersonne?.(e, personne.brut);
    p.racine.traverse((o) => { o.userData.personne = personne; });
    eleves.set(personne.id, { p, place, etiquette: e, personne });
  }

  function retirerEleve(id) {
    const x = eleves.get(id);
    if (!x) return;
    scene.remove(x.p.racine);
    x.etiquette.remove();
    eleves.delete(id);
  }

  function majProf() {
    if (!profEtat.present) {
      if (prof) { scene.remove(prof.p.racine); prof.etiquette.remove(); prof = null; }
      return;
    }
    if (!prof) {
      const p = personnage(`prof:${profEtat.nom}`, { face: true });
      p.poser("debout");
      p.racine.rotation.y = Math.PI;         // face à la classe
      p.racine.position.set(6.4, 0.4, -8.1);
      p.racine.scale.setScalar(0.85);
      scene.add(p.racine);
      prof = { p, etiquette: etiquette(profEtat.nom, "classe3d__nom--prof") };
    }
    prof.etiquette.textContent = profEtat.nom;
  }

  /* --- Le cadrage ------------------------------------------------------------
     La caméra est à sa place, au fond : le tableau doit tenir en entier dans
     l'image, quelle que soit la forme de la fenêtre. */
  function cadrer() {
    const l = hote.clientWidth || 1, h = hote.clientHeight || 1;
    renderer.setSize(l, h, false);
    camera.aspect = l / h;
    // Fenêtre large : on s'approche, le tableau remplit la hauteur. Fenêtre
    // étroite : on recule, il tient en largeur.
    const k = Math.min(1, Math.max(0, (camera.aspect - 1.2) / 1.6));   // 0 étroit → 1 très large
    camera.fov = 56 - k * 24;
    camera.position.set(0.4, 10.2 - k * 2.4, 14 - k * 4);
    regard.set(0, 3.2 + k * 0.5, -7);
    camera.lookAt(regard);
    camera.updateProjectionMatrix();
  }
  const observateur = new ResizeObserver(cadrer);
  observateur.observe(hote);
  cadrer();

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
    const cible = o?.userData.tableau ? "tableau" : o?.userData.personne?.id || null;
    canvas.style.cursor = cible ? "pointer" : "";
    if (cible !== survol) {
      for (const x of eleves.values()) x.etiquette.classList.toggle("classe3d__nom--survol", x.personne.id === cible);
      survol = cible;
    }
  });
  canvas.addEventListener("click", (e) => {
    const o = viser(e);
    if (o?.userData.tableau) surTableau?.();
    else if (o?.userData.personne) {
      const x = eleves.get(o.userData.personne.id);
      if (x) surPersonne?.(x.etiquette, x.personne.brut);
    }
  });

  /* --- La boucle : 30 images par seconde, et seulement si on la voit ------- */
  const vecteur = new THREE.Vector3();
  let dernier = 0, dernierTableau = 0, anime = 0, vivant = true, visible = true;
  const io = new IntersectionObserver(([x]) => { visible = x.isIntersecting; });
  io.observe(hote);

  function placerEtiquette(el, objet, hauteur) {
    vecteur.setFromMatrixPosition(objet.matrixWorld);
    vecteur.y += hauteur;
    vecteur.project(camera);
    const derriere = vecteur.z > 1;
    el.style.transform = `translate(-50%, -100%) translate(${(vecteur.x * 0.5 + 0.5) * hote.clientWidth}px, ${(-vecteur.y * 0.5 + 0.5) * hote.clientHeight}px)`;
    el.hidden = derriere;
  }

  function image(t) {
    if (!vivant) return;
    anime = requestAnimationFrame(image);
    if (!visible || document.hidden || t - dernier < 33) return;
    dernier = t;
    const s = t / 1000;

    if (t - dernierTableau > 300) { suivreToile(); dernierTableau = t; }

    // On respire, on tourne un peu la tête, on écrit de temps en temps.
    for (const { p } of eleves.values()) {
      const k = s + p.phase;
      p.torse.scale.y = 1 + Math.sin(k * 1.6) * 0.012;
      p.tete.rotation.y = Math.sin(k * 0.35) * 0.18 + (Math.sin(k * 0.11) > 0.93 ? 0.5 : 0);
      p.tete.rotation.x = Math.sin(k * 0.5) * 0.04;
      if (p.pose === "assis") p.brasD.coude.rotation.x = 0.65 + Math.max(0, Math.sin(k * 3)) * 0.12 * (Math.sin(k * 0.3) > 0 ? 1 : 0);
    }
    if (prof) {
      const p = prof.p;
      const ecrit = Date.now() < ecritJusqua;
      // Il écrit : il se tourne vers le tableau, le bras levé.
      const cibleY = ecrit ? 0.1 : Math.PI - 0.35 + Math.sin(s * 0.4) * 0.25;
      p.racine.rotation.y += (cibleY - p.racine.rotation.y) * 0.08;
      const bras = ecrit ? -2.3 + Math.sin(s * 6) * 0.12 : Math.sin(s * 0.9) * 0.08;
      p.brasD.epaule.rotation.x += (bras - p.brasD.epaule.rotation.x) * 0.12;
      p.torse.scale.y = 1 + Math.sin(s * 1.4) * 0.012;
      // Il se tient à côté du tableau, pas devant : on doit pouvoir lire.
      p.racine.position.x += ((ecrit ? 4.2 : 6.4) - p.racine.position.x) * 0.03;
      placerEtiquette(prof.etiquette, p.tete, 1.3 * 0.85);
    }
    renderer.render(scene, camera);
    for (const x of eleves.values()) placerEtiquette(x.etiquette, x.p.tete, 1.3 * 0.8);
  }
  anime = requestAnimationFrame(image);

  return {
    /** Qui est là. `eleves` : [{ id, nom, brut }] ; `prof` : { present, nom }. */
    maj({ eleves: liste = [], prof: p = null } = {}) {
      const ids = new Set(liste.map((x) => String(x.id)));
      for (const id of [...eleves.keys()]) if (!ids.has(id)) retirerEleve(id);
      const prises = new Set([...eleves.values()].map((x) => PLACES.indexOf(x.place)));
      for (const x of liste.slice(0, PLACES.length)) {
        const id = String(x.id);
        if (eleves.has(id)) continue;
        // La première place libre, du premier rang vers le fond.
        let i = 0;
        while (prises.has(i) && i < PLACES.length) i++;
        prises.add(i);
        placerEleve({ ...x, id }, i);
      }
      if (p) { profEtat = p; majProf(); }
    },
    /** Le professeur écrit : on le voit se tourner vers le tableau. */
    ecrit() { ecritJusqua = Date.now() + 2500; },
    detruire() {
      vivant = false;
      cancelAnimationFrame(anime);
      observateur.disconnect();
      io.disconnect();
      texture?.dispose();
      renderer.dispose();
      canvas.remove();
      etiquettes.remove();
    }
  };
}
