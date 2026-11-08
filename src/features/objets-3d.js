/* ---------------------------------------------------------------------------
 * Les affaires, en volume.
 *
 * Sur les tables de la classe en 3D, chaque objet est un vrai objet : un
 * cahier a son épaisseur, sa tranche de pages et son étiquette ; un crayon
 * est un prisme à six pans taillé en pointe ; l'encrier est en verre, avec
 * son encre dedans. Posés à plat, on les reconnaît de loin et de près.
 *
 * Unités de la scène : un pupitre fait 2,6 de large. Chaque modèle a sa base
 * à y = 0, centré sur l'origine ; on le tourne ensuite comme on veut.
 *
 * Les modèles sont construits une fois par sorte (et par couverture), puis
 * clonés : les clones partagent géométries et matières.
 * ------------------------------------------------------------------------- */

const COUVERTURES = {
  parchment: "#d9c9a3", cuir: "#4a3122", ardoise: "#34464f", olive: "#55623a",
  oxblood: "#6e2c2c", encre: "#232a33"
};

/** Les sortes que l'on sait modeler (les autres gardent leur photographie). */
export const SORTES_3D = new Set([
  "cahier", "cahier-ouvert", "carnet", "feuille", "feuilles", "dossier", "chemise", "pochette",
  "registre", "crayon", "plume", "stylo-plume", "gomme", "buvard", "regle", "equerre", "compas",
  "rapporteur", "regle-a-calcul", "boulier", "encrier", "encre", "craie", "cachet"
]);

export function creerAtelier(THREE) {
  const mats = new Map();
  const mat = (couleur, extra = {}) => {
    const cle = couleur + JSON.stringify(extra);
    if (!mats.has(cle)) mats.set(cle, new THREE.MeshStandardMaterial({ color: couleur, roughness: .7, metalness: 0, ...extra }));
    return mats.get(cle);
  };
  const laiton = () => mat("#b8913f", { metalness: .8, roughness: .3 });
  const acier = () => mat("#a9adb3", { metalness: .85, roughness: .25 });

  // Une page lignée, peinte une fois.
  let texPage = null;
  const page = () => {
    if (!texPage) {
      const c = document.createElement("canvas"); c.width = 256; c.height = 340;
      const g = c.getContext("2d");
      g.fillStyle = "#f3ecdb"; g.fillRect(0, 0, 256, 340);
      g.strokeStyle = "rgba(90,110,150,.35)"; g.lineWidth = 1.2;
      for (let y = 40; y < 330; y += 14) { g.beginPath(); g.moveTo(14, y); g.lineTo(242, y); g.stroke(); }
      g.strokeStyle = "rgba(170,60,60,.45)"; g.beginPath(); g.moveTo(34, 0); g.lineTo(34, 340); g.stroke();
      // Quelques lignes d'écriture à l'encre, en haut.
      g.strokeStyle = "rgba(30,34,60,.55)"; g.lineWidth = 1.4;
      for (let y = 38, i = 0; i < 6; y += 14, i++) {
        g.beginPath(); g.moveTo(40, y);
        for (let x = 40; x < 200 - (i % 3) * 30; x += 6) g.lineTo(x, y - 2 - Math.sin(x * .7 + i) * 2);
        g.stroke();
      }
      texPage = new THREE.CanvasTexture(c);
      texPage.colorSpace = THREE.SRGBColorSpace;
    }
    return mat("#ffffff", { map: texPage, roughness: .9 });
  };
  // Une règle graduée.
  let texRegle = null;
  const graduee = () => {
    if (!texRegle) {
      const c = document.createElement("canvas"); c.width = 512; c.height = 64;
      const g = c.getContext("2d");
      g.fillStyle = "#c9a066"; g.fillRect(0, 0, 512, 64);
      g.fillStyle = "rgba(90,50,20,.18)";
      for (let i = 0; i < 30; i++) g.fillRect(0, Math.random() * 64, 512, 1);
      g.fillStyle = "#2a1c10";
      for (let i = 0; i <= 100; i++) {
        const x = 12 + i * 4.88, h = i % 10 === 0 ? 22 : i % 5 === 0 ? 15 : 9;
        g.fillRect(x, 0, 1.2, h);
        if (i % 10 === 0) { g.font = "11px serif"; g.fillText(String(i / 10), x - 3, 36); }
      }
      texRegle = new THREE.CanvasTexture(c);
      texRegle.colorSpace = THREE.SRGBColorSpace;
    }
    return mat("#ffffff", { map: texRegle, roughness: .6 });
  };

  const boite = (l, h, p, m, x = 0, y = 0, z = 0) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(l, h, p), m);
    b.position.set(x, y + h / 2, z);
    return b;
  };
  const cylindre = (r1, r2, h, m, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);

  /** Un cahier fermé : deux plats, la tranche des pages, une étiquette. */
  function cahier(l, p, e, couleur, { spirale = false, elastique = false } = {}) {
    const g = new THREE.Group();
    const couv = mat(couleur, { roughness: .8 });
    g.add(boite(l, 0.012, p, couv));
    g.add(boite(l - 0.02, e - 0.024, p - 0.02, mat("#efe6d0", { roughness: .95 }), 0.006, 0.012));
    g.add(boite(l, 0.012, p, couv, 0, e - 0.012));
    // Le dos, plus sombre.
    g.add(boite(0.03, e, p, mat(couleur, { roughness: .6, color: new THREE.Color(couleur).multiplyScalar(.7) }), -l / 2 + 0.015));
    const etiquette = boite(l * 0.55, 0.003, p * 0.22, mat("#f1e8d2", { roughness: .9 }), 0.03, e, -p * 0.18);
    g.add(etiquette);
    if (elastique) g.add(boite(0.02, e + 0.006, p + 0.006, mat("#1b1b1d"), l * 0.36, -0.003));
    return g;
  }

  const fabriques = {
    cahier: (o) => cahier(0.76, 1.0, 0.07, COUVERTURES[o.couverture] || "#6b4a30"),
    carnet: (o) => cahier(0.54, 0.74, 0.08, COUVERTURES[o.couverture] || "#3a2a22", { elastique: true }),
    registre: () => cahier(0.8, 1.05, 0.16, "#5e2424"),

    "cahier-ouvert": (o) => {
      const g = new THREE.Group();
      const couv = mat(COUVERTURES[o.couverture] || "#6b4a30", { roughness: .8 });
      for (const s of [-1, 1]) {
        const plat = boite(0.62, 0.01, 0.95, couv, s * 0.31);
        plat.rotation.z = -s * 0.05;
        const feuillets = boite(0.6, 0.03, 0.92, mat("#ece3cc", { roughness: .95 }), s * 0.3, 0.008);
        feuillets.rotation.z = -s * 0.05;
        const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.9), page());
        pg.rotation.set(-Math.PI / 2, 0, 0);
        pg.position.set(s * 0.3, 0.045 + 0.012, 0);
        pg.rotation.y = s * 0.05;
        g.add(plat, feuillets, pg);
      }
      return g;
    },

    feuille: () => {
      const g = new THREE.Group();
      g.add(boite(0.62, 0.004, 0.86, mat("#f0e8d6", { roughness: .95 })));
      const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.84), page());
      pg.rotation.x = -Math.PI / 2; pg.position.y = 0.0045;
      g.add(pg);
      return g;
    },
    feuilles: () => {
      const g = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const f = boite(0.66, 0.006, 0.9, mat(i % 2 ? "#efe7d4" : "#f4ecdb", { roughness: .95 }), (i % 3 - 1) * 0.012, i * 0.007, (i % 2) * 0.01);
        f.rotation.y = (i % 3 - 1) * 0.03;
        g.add(f);
      }
      const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.88), page());
      pg.rotation.x = -Math.PI / 2; pg.position.y = 0.05;
      g.add(pg);
      return g;
    },

    dossier: () => {
      const g = new THREE.Group();
      const carton = mat("#c9a36a", { roughness: .9 });
      g.add(boite(0.8, 0.012, 1.02, carton));
      g.add(boite(0.7, 0.03, 0.94, mat("#f2ead8", { roughness: .95 }), 0.02, 0.012));
      const rabat = boite(0.8, 0.012, 1.02, carton, 0, 0.042);
      rabat.rotation.y = 0.04;
      g.add(rabat);
      g.add(boite(0.32, 0.003, 0.12, mat("#f3ecdc"), 0.1, 0.054, -0.3));
      return g;
    },
    chemise: () => {
      const g = new THREE.Group();
      const carton = mat("#8fa7b8", { roughness: .9 });
      g.add(boite(0.78, 0.01, 1.0, carton));
      g.add(boite(0.74, 0.02, 0.96, mat("#f2ead8", { roughness: .95 }), 0.03, 0.01));
      g.add(boite(0.78, 0.01, 1.0, carton, -0.02, 0.03));
      return g;
    },
    pochette: () => {
      const g = new THREE.Group();
      g.add(boite(0.72, 0.03, 0.96, mat("#6d4b33", { roughness: .7 })));
      const rabat = boite(0.72, 0.012, 0.3, mat("#5d3f2a", { roughness: .7 }), 0, 0.03, -0.33);
      g.add(rabat);
      g.add(boite(0.05, 0.02, 0.05, laiton(), 0, 0.042, -0.2));
      return g;
    },

    crayon: () => {
      const g = new THREE.Group();
      const corps = cylindre(0.028, 0.028, 0.68, mat("#d9a23c", { roughness: .5 }), 6);
      corps.rotation.z = Math.PI / 2;
      const bois = cylindre(0.028, 0.004, 0.1, mat("#e7c795", { roughness: .8 }), 6);
      bois.rotation.z = -Math.PI / 2; bois.position.x = 0.39;
      const mine = cylindre(0.006, 0.0005, 0.03, mat("#2b2b2e", { roughness: .4 }), 6);
      mine.rotation.z = -Math.PI / 2; mine.position.x = 0.45;
      const virole = cylindre(0.03, 0.03, 0.05, laiton(), 12);
      virole.rotation.z = Math.PI / 2; virole.position.x = -0.365;
      const gomme = cylindre(0.028, 0.028, 0.05, mat("#c9716b", { roughness: .8 }), 12);
      gomme.rotation.z = Math.PI / 2; gomme.position.x = -0.41;
      g.add(corps, bois, mine, virole, gomme);
      g.position.y = 0.028;
      const h = new THREE.Group(); h.add(g); return h;
    },
    plume: () => {
      const g = new THREE.Group();
      const manche = cylindre(0.024, 0.032, 0.6, mat("#5a3a24", { roughness: .45 }), 14);
      manche.rotation.z = Math.PI / 2; manche.position.x = -0.05;
      const bague = cylindre(0.026, 0.026, 0.05, laiton(), 14);
      bague.rotation.z = Math.PI / 2; bague.position.x = 0.27;
      const bec = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.12, 4), acier());
      bec.scale.set(1, 1, 0.35);
      bec.rotation.z = -Math.PI / 2; bec.position.x = 0.35;
      g.add(manche, bague, bec);
      g.position.y = 0.03;
      const h = new THREE.Group(); h.add(g); return h;
    },
    "stylo-plume": () => {
      const g = new THREE.Group();
      const corps = cylindre(0.03, 0.028, 0.46, mat("#141416", { roughness: .2, metalness: .1 }), 16);
      corps.rotation.z = Math.PI / 2;
      const capuchon = cylindre(0.033, 0.033, 0.2, mat("#141416", { roughness: .2, metalness: .1 }), 16);
      capuchon.rotation.z = Math.PI / 2; capuchon.position.x = -0.3;
      const agrafe = boite(0.16, 0.012, 0.012, laiton(), -0.3, 0.03);
      const anneau = cylindre(0.034, 0.034, 0.015, laiton(), 16);
      anneau.rotation.z = Math.PI / 2; anneau.position.x = -0.2;
      const bec = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 4), laiton());
      bec.scale.set(1, 1, 0.4); bec.rotation.z = -Math.PI / 2; bec.position.x = 0.27;
      g.add(corps, capuchon, agrafe, anneau, bec);
      g.position.y = 0.033;
      const h = new THREE.Group(); h.add(g); return h;
    },

    gomme: () => {
      const g = new THREE.Group();
      g.add(boite(0.32, 0.1, 0.18, mat("#e9d9c9", { roughness: .95 })));
      g.add(boite(0.2, 0.101, 0.182, mat("#3f5f86", { roughness: .9 }), 0.06));
      return g;
    },
    buvard: () => {
      // Le tampon buvard : un berceau de bois arrondi dessous, le papier buvard
      // tendu contre la courbe, un bouton de laiton pour le tenir.
      const g = new THREE.Group();
      const bois = mat("#6b4526", { roughness: .5 });
      const berceau = cylindre(0.15, 0.15, 0.5, mat("#e7dccb", { roughness: 1 }), 24);
      berceau.rotation.x = Math.PI / 2;
      berceau.scale.set(1, 1, 0.45);
      berceau.position.y = 0.07;
      const dessus = boite(0.3, 0.05, 0.5, bois, 0, 0.07);
      const pied = cylindre(0.025, 0.035, 0.06, laiton(), 12); pied.position.y = 0.15;
      const bouton = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), laiton());
      bouton.position.y = 0.2;
      g.add(berceau, dessus, pied, bouton);
      return g;
    },
    regle: () => {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.14), [mat("#b88a52"), mat("#b88a52"), graduee(), mat("#b88a52"), mat("#b88a52"), mat("#b88a52")]);
      b.position.y = 0.01;
      g.add(b);
      return g;
    },
    equerre: () => {
      const forme = new THREE.Shape();
      forme.moveTo(0, 0); forme.lineTo(0.62, 0); forme.lineTo(0, 0.42); forme.lineTo(0, 0);
      const trou = new THREE.Path();
      trou.moveTo(0.1, 0.07); trou.lineTo(0.36, 0.07); trou.lineTo(0.1, 0.25); trou.lineTo(0.1, 0.07);
      forme.holes.push(trou);
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(forme, { depth: 0.018, bevelEnabled: false }), mat("#c49a5e", { roughness: .55 }));
      m.rotation.x = -Math.PI / 2; m.position.set(-0.3, 0, 0.2);
      const g = new THREE.Group(); g.add(m); return g;
    },
    rapporteur: () => {
      const forme = new THREE.Shape();
      forme.absarc(0, 0, 0.34, 0, Math.PI, false); forme.lineTo(0.34, 0);
      const trou = new THREE.Path(); trou.absarc(0, 0, 0.2, 0, Math.PI, false); trou.lineTo(0.2, 0);
      forme.holes.push(trou);
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(forme, { depth: 0.012, bevelEnabled: false }),
        mat("#dfe8ee", { roughness: .15, transparent: true, opacity: .6 }));
      m.rotation.x = -Math.PI / 2; m.position.z = 0.12;
      const g = new THREE.Group(); g.add(m); return g;
    },
    compas: () => {
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const branche = boite(0.36, 0.02, 0.03, acier(), s * 0.15, 0);
        branche.rotation.y = s * 0.12;
        g.add(branche);
      }
      const tete = cylindre(0.035, 0.035, 0.05, laiton(), 16);
      tete.position.set(0, 0.03, 0);
      const pointe = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.06, 6), acier());
      pointe.rotation.z = -Math.PI / 2; pointe.position.set(0.36, 0.01, 0.04);
      const mine = cylindre(0.01, 0.01, 0.06, mat("#2b2b2e"));
      mine.rotation.z = Math.PI / 2; mine.position.set(-0.36, 0.01, 0.04);
      g.add(tete, pointe, mine);
      return g;
    },
    "regle-a-calcul": () => {
      const g = new THREE.Group();
      g.add(boite(1.14, 0.03, 0.2, mat("#efe9da", { roughness: .5 })));
      g.add(boite(1.14, 0.032, 0.06, mat("#d8d0bd", { roughness: .5 }), 0.1));
      g.add(boite(0.08, 0.05, 0.22, mat("#cfd7dc", { roughness: .1, transparent: true, opacity: .55 }), -0.1));
      return g;
    },
    boulier: () => {
      const g = new THREE.Group();
      const bois = mat("#6b4526", { roughness: .5 });
      g.add(boite(0.56, 0.04, 0.04, bois, 0, 0, -0.24), boite(0.56, 0.04, 0.04, bois, 0, 0, 0.24));
      g.add(boite(0.04, 0.04, 0.52, bois, -0.26), boite(0.04, 0.04, 0.52, bois, 0.26));
      const couleurs = ["#8e2f2f", "#d7b24a", "#2f5a8e"];
      for (let r = 0; r < 5; r++) {
        const z = -0.18 + r * 0.09;
        const tige = cylindre(0.005, 0.005, 0.5, acier()); tige.rotation.z = Math.PI / 2; tige.position.set(0, 0.02, z);
        g.add(tige);
        for (let b = 0; b < 5; b++) {
          const perle = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat(couleurs[r % 3], { roughness: .4 }));
          perle.scale.set(0.7, 1, 1);
          perle.position.set(-0.2 + b * 0.045 + (b > 2 ? 0.12 : 0), 0.02, z);
          g.add(perle);
        }
      }
      return g;
    },

    encrier: () => {
      // Le verre, l'encre qu'on voit au travers, le col et son bouchon de laiton.
      const g = new THREE.Group();
      const verre = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.22),
        mat("#dfeaf0", { roughness: .05, metalness: .1, transparent: true, opacity: .35 }));
      verre.position.y = 0.08;
      const encre = boite(0.19, 0.1, 0.19, mat("#141a33", { roughness: .2 }), 0, 0.012);
      const col = cylindre(0.05, 0.06, 0.05, mat("#dfeaf0", { roughness: .05, transparent: true, opacity: .45 }), 16);
      col.position.y = 0.185;
      const bouchon = cylindre(0.058, 0.058, 0.04, laiton(), 16);
      bouchon.position.y = 0.225;
      g.add(encre, verre, col, bouchon);
      return g;
    },
    encre: () => {
      const g = new THREE.Group();
      const flacon = cylindre(0.08, 0.09, 0.26, mat("#1a2140", { roughness: .15, metalness: .05, transparent: true, opacity: .85 }), 20);
      flacon.position.y = 0.13;
      const etiquette = cylindre(0.092, 0.092, 0.1, mat("#efe6cf", { roughness: .9 }), 20);
      etiquette.position.y = 0.12;
      const col = cylindre(0.035, 0.05, 0.06, mat("#1a2140", { roughness: .15 }), 16); col.position.y = 0.29;
      const liege = cylindre(0.038, 0.034, 0.05, mat("#b98a55", { roughness: .9 }), 12); liege.position.y = 0.34;
      const cire = cylindre(0.042, 0.042, 0.02, mat("#8e1e1e", { roughness: .5 }), 12); cire.position.y = 0.36;
      g.add(flacon, etiquette, col, liege, cire);
      return g;
    },
    craie: () => {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const c = cylindre(0.025, 0.025, 0.22 - i * 0.04, mat("#f3f0e6", { roughness: 1 }), 10);
        c.rotation.z = Math.PI / 2; c.rotation.y = i * 0.5;
        c.position.set(0, 0.025, (i - 1) * 0.06);
        g.add(c);
      }
      return g;
    },
    cachet: () => {
      const g = new THREE.Group();
      const socle = cylindre(0.07, 0.08, 0.05, laiton(), 20); socle.position.y = 0.025;
      const manche = cylindre(0.03, 0.045, 0.16, mat("#3b2416", { roughness: .4 }), 16); manche.position.y = 0.13;
      const pommeau = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), mat("#3b2416", { roughness: .4 }));
      pommeau.position.y = 0.23;
      g.add(socle, manche, pommeau);
      return g;
    }
  };
  fabriques.cahier.couvre = true;
  fabriques.carnet.couvre = true;
  fabriques["cahier-ouvert"].couvre = true;

  const prototypes = new Map();
  /**
   * Le modèle d'une sorte, prêt à poser (base à y = 0). null si on ne sait pas
   * la modeler : on garde alors la photographie.
   */
  function modele(kind, { couverture = null } = {}) {
    const f = fabriques[kind];
    if (!f) return null;
    const cle = f.couvre ? `${kind}|${couverture || ""}` : kind;
    if (!prototypes.has(cle)) {
      const p = f({ couverture });
      p.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      prototypes.set(cle, p);
    }
    const c = prototypes.get(cle).clone();
    c.traverse((m) => { m.userData.objet = kind; });
    return c;
  }
  return { modele };
}
