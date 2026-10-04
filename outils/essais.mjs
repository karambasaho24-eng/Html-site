/* ---------------------------------------------------------------------------
 * Les essais.
 *
 * Neuf scénarios, joués dans un vrai navigateur sur le pilote local. Ils ne
 * vérifient pas que les boutons existent : ils vérifient que les GESTES ont
 * les conséquences annoncées — qu'un texte écrit se retrouve après un
 * rechargement, qu'un objet donné n'est plus chez celui qui l'a donné, et
 * qu'un refus ne perd rien.
 *
 * Deux onglets = deux comptes : le pilote local garde la session dans
 * sessionStorage, ce qui permet de jouer le maître et le cadet sur un seul
 * poste. C'est la même astuce que pour le mode démonstration.
 *
 *   node outils/essais.mjs            (le serveur doit tourner sur :8777)
 *   node outils/essais.mjs --montre   (garde le navigateur ouvert à la fin)
 * ------------------------------------------------------------------------- */
/* Playwright n'est pas une dependance du projet : le site n'a pas d'etape de
   construction, et on ne va pas en ajouter une pour les essais. On le prend ou
   il se trouve — `npx playwright` le fournit, ou PLAYWRIGHT_RACINE le designe. */
const paquet = await import(
  process.env.PLAYWRIGHT_RACINE
    ? `file://${process.env.PLAYWRIGHT_RACINE}/playwright/index.js`
    : "playwright");
const { chromium } = paquet.default || paquet;

const RACINE = process.env.ESSAIS_URL || "http://127.0.0.1:8777/";
const CHROME = process.env.PLAYWRIGHT_CHROMIUM
  || "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

let reussis = 0, echoues = 0;
const journal = [];

function verifier(nom, condition, detail = "") {
  if (condition) { reussis++; journal.push(`  ok   ${nom}`); }
  else { echoues++; journal.push(`  ECHEC ${nom}${detail ? ` — ${detail}` : ""}`); }
}

const sfx = Date.now().toString(36);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* --- Accès direct à la couche de données -----------------------------------
   Certains scénarios se jouent mieux par en dessous : « A donne à B » demande
   deux comptes et six écrans, alors que ce qu'on vérifie tient en trois
   lignes. On passe donc par les mêmes modules que l'interface — jamais par le
   stockage brut, sans quoi on testerait une base et non le code. */
async function depot(page, expression) {
  return page.evaluate(async (src) => {
    const d = await import("/src/data/index.js");
    const a = await import("/src/features/affaires.js");
    const c = await import("/src/features/cartable.js");
    const m = await import("/src/features/materiel.js");
    const s = (await import("/src/core/store.js")).etat;
    return await (new Function("d", "a", "c", "m", "etat", `return (async () => { ${src} })()`))(d, a, c, m, s);
  }, expression);
}

async function creerCompte(page, nom, email) {
  await page.goto(RACINE);
  await page.waitForTimeout(700);
  await page.click('[role="tab"]:has-text("Créer mon compte")');
  await page.fill('input[name="pseudo"]', nom);
  await page.fill('input[name="mdp"]', "motdepasse1");
  await page.fill('input[name="mdp2"]', "motdepasse1");
  await page.click('button[type="submit"]:has-text("Créer mon compte")');
  await page.waitForTimeout(1600);
  // La fenêtre « habillez votre personnage » s'ouvre à la première visite.
  const bienvenue = await page.waitForSelector(".apparence", { timeout: 15000 }).then(() => true).catch(() => false);
  verifier("tout juste inscrit, on commence par habiller son personnage", bienvenue);
  await page.keyboard.press("Escape");
  const cahiersDabord = await page.waitForSelector(".mes-cahiers", { timeout: 6000 }).then(() => true).catch(() => false);
  verifier("puis on choisit ses cahiers", cahiersDabord);
  for (let i = 0; i < 3 && await page.locator(".voile").count(); i++) {
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  }
}

const nav = await chromium.launch({ executablePath: CHROME });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 920 } });
await ctx.addInitScript(() =>
  localStorage.setItem("ojm.config", JSON.stringify({ supabaseUrl: "", supabaseAnonKey: "" })));

const erreursPage = [];
const maitre = await ctx.newPage();
const cadet  = await ctx.newPage();
for (const [nom, p] of [["maitre", maitre], ["cadet", cadet]]) {
  p.on("pageerror", (e) => erreursPage.push(`${nom}: ${e.message}`));
}

try {
  /* =======================================================================
     1. Le cahier garde ce qu'on y écrit
     ===================================================================== */
  journal.push("\n1. Le cahier");
  await creerCompte(cadet, "Cadet", `cadet${sfx}@essai.test`);

  const cahierId = await depot(cadet, `
    const c = await d.cahiers.creer({
      owner_id: etat.utilisateur.id, kind: "personal", class_id: null,
      title: "Cahier d'essai", support: "cahier", max_pages: 10,
      cover: "cuir", color: "olive", icon: "book", collaborative: false
    });
    await d.pages.creer(c.id, { title: "Page 1", created_by: etat.utilisateur.id });
    await d.pages.creer(c.id, { title: "Page 2", created_by: etat.utilisateur.id });
    return c.id;
  `);

  await cadet.goto(`${RACINE}#/cahier/${cahierId}`);
  await cadet.waitForTimeout(1400);

  const TEXTE1 = "Rapport du soir, mur Maria.";
  const TEXTE2 = "Seconde page, releve des sentinelles.";

  await cadet.click(".parchemin__corps");
  await cadet.keyboard.type(TEXTE1, { delay: 8 });

  // Le piège historique : changer de page AVANT la trêve d'enregistrement.
  // C'est là que le texte disparaissait.
  await cadet.click('.onglet-page:nth-child(2)');
  await cadet.waitForTimeout(400);
  await cadet.click(".parchemin__corps");
  await cadet.keyboard.type(TEXTE2, { delay: 8 });
  await cadet.waitForTimeout(1400);

  await cadet.click('.onglet-page:nth-child(1)');
  await cadet.waitForTimeout(700);
  const relu = await cadet.locator(".parchemin__corps").innerText();
  verifier("le texte survit a un changement de page immediat", relu.includes(TEXTE1), relu.slice(0, 60));

  await cadet.reload();
  await cadet.waitForTimeout(1800);
  const apresRechargement = await depot(cadet, `
    const ps = await d.pages.liste("${cahierId}");
    return ps.map((p) => p.body).join(" || ");
  `);
  verifier("le texte survit au rechargement (page 1)", apresRechargement.includes(TEXTE1));
  verifier("le texte survit au rechargement (page 2)", apresRechargement.includes(TEXTE2));

  /* =======================================================================
     2. Un objet est quelque part
     ===================================================================== */
  journal.push("\n2. Les objets");
  const etatObjets = await depot(cadet, `
    const mien = await d.affaires.assurerDotation(etat.utilisateur.id, c.dotationComplete());
    const plume = mien.find((o) => o.kind === "plume");
    const trousse = mien.find((o) => o.kind === "trousse");
    const index = a.indexer(mien);
    return {
      total: mien.length,
      plumeDansTrousse: String(plume.container_id) === String(trousse.id),
      plumeSurMoi: a.surMoi(plume, index),
      deQuoiEcrire: a.deQuoiEcrire(mien, etat.utilisateur.id).peut
    };
  `);
  verifier("la dotation pose des affaires", etatObjets.total >= 8, String(etatObjets.total));
  verifier("la plume est dans la trousse", etatObjets.plumeDansTrousse);
  verifier("la trousse portee met la plume sur moi", etatObjets.plumeSurMoi);
  verifier("avec plume et encrier, on peut ecrire", etatObjets.deQuoiEcrire);

  const sorti = await depot(cadet, `
    const mien = await d.affaires.miennes(etat.utilisateur.id);
    const plume = mien.find((o) => o.kind === "plume");
    await d.affaires.ranger(plume.id, null);
    const apres = await d.affaires.miennes(etat.utilisateur.id);
    const index = a.indexer(apres);
    return a.surMoi(apres.find((o) => o.id === plume.id), index);
  `);
  verifier("sortie du sac, la plume n'est plus sur moi", sorti === false);

  await depot(cadet, `
    const mien = await d.affaires.miennes(etat.utilisateur.id);
    const plume = mien.find((o) => o.kind === "plume");
    const trousse = mien.find((o) => o.kind === "trousse");
    await d.affaires.ranger(plume.id, trousse.id);
    return true;
  `);

  /* =======================================================================
     3-6. Donner, preter, rendre, refuser
     ===================================================================== */
  journal.push("\n3-6. Ce qui passe de main en main");
  await creerCompte(maitre, "Maitre", `maitre${sfx}@essai.test`);
  const idMaitre = await depot(maitre, `return etat.utilisateur.id;`);
  const idCadet  = await depot(cadet,  `return etat.utilisateur.id;`);
  await depot(maitre, `return d.affaires.assurerDotation(etat.utilisateur.id, c.dotationComplete());`);

  // DON : le maitre donne sa regle au cadet.
  const don = await depot(maitre, `
    const mien = await d.affaires.miennes(etat.utilisateur.id);
    const regle = mien.find((o) => o.kind === "regle");
    const r = await d.remisesObjet.tendre({
      belonging_id: regle.id, from_user: etat.utilisateur.id, to_user: "${idCadet}",
      kind: "give", direction: "offer", attested: true
    });
    return { remise: r.id, objet: regle.id };
  `);
  await depot(cadet, `return d.remisesObjet.accepter("${don.remise}");`);

  const apresDon = await depot(maitre, `
    const mien = await d.affaires.miennes(etat.utilisateur.id);
    const o = await d.affaires.lire("${don.objet}");
    return { chezMoi: mien.some((x) => x.id === "${don.objet}"), proprietaire: o.owner_id, ancien: o.former_owner };
  `);
  verifier("donne : l'objet quitte celui qui donne", apresDon.chezMoi === false);
  verifier("donne : il appartient a celui qui prend", apresDon.proprietaire === idCadet);
  verifier("donne : on sait d'ou il vient", apresDon.ancien === idMaitre);

  const pasDeDouble = await depot(cadet, `
    const mien = await d.affaires.toutes(etat.utilisateur.id);
    return mien.filter((o) => o.id === "${don.objet}").length;
  `);
  verifier("donne : il n'existe qu'une fois", pasDeDouble === 1, String(pasDeDouble));

  // PRET : le cadet prete son crayon au maitre.
  const pret = await depot(cadet, `
    const mien = await d.affaires.miennes(etat.utilisateur.id);
    const crayon = mien.find((o) => o.kind === "crayon");
    const r = await d.remisesObjet.tendre({
      belonging_id: crayon.id, from_user: etat.utilisateur.id, to_user: "${idMaitre}",
      kind: "lend", direction: "offer", attested: true
    });
    return { remise: r.id, objet: crayon.id };
  `);
  await depot(maitre, `return d.remisesObjet.accepter("${pret.remise}");`);

  const apresPret = await depot(cadet, `
    const o = await d.affaires.lire("${pret.objet}");
    const index = a.indexer(await d.affaires.toutes(etat.utilisateur.id));
    return {
      proprietaire: o.owner_id, detenteur: o.holder_id, etat: o.state,
      indisponible: a.indisponible(o, etat.utilisateur.id)
    };
  `);
  verifier("prete : il reste a son proprietaire", apresPret.proprietaire === idCadet);
  verifier("prete : il est entre les mains de l'autre", apresPret.detenteur === idMaitre);
  verifier("prete : son proprietaire n'en dispose plus", apresPret.indisponible === true);

  const disponiblePourLEmprunteur = await depot(maitre, `
    const o = await d.affaires.lire("${pret.objet}");
    return a.indisponible(o, etat.utilisateur.id);
  `);
  verifier("prete : l'emprunteur, lui, en dispose", disponiblePourLEmprunteur === false);

  // RETOUR
  await depot(maitre, `return d.remisesObjet.rendre("${pret.remise}");`);
  const apresRetour = await depot(cadet, `
    const o = await d.affaires.lire("${pret.objet}");
    return { detenteur: o.holder_id, etat: o.state, indisponible: a.indisponible(o, etat.utilisateur.id) };
  `);
  verifier("rendu : plus personne ne le detient", !apresRetour.detenteur);
  verifier("rendu : son proprietaire en dispose a nouveau", apresRetour.indisponible === false);

  // REFUS : rien ne doit bouger.
  const refus = await depot(cadet, `
    const mien = await d.affaires.miennes(etat.utilisateur.id);
    const gomme = mien.find((o) => o.kind === "gomme");
    const r = await d.remisesObjet.tendre({
      belonging_id: gomme.id, from_user: etat.utilisateur.id, to_user: "${idMaitre}",
      kind: "give", direction: "offer", attested: true
    });
    return { remise: r.id, objet: gomme.id };
  `);
  await depot(maitre, `return d.remisesObjet.refuser("${refus.remise}");`);
  const apresRefus = await depot(cadet, `
    const o = await d.affaires.lire("${refus.objet}");
    return { proprietaire: o.owner_id, etat: o.state };
  `);
  verifier("refuse : rien n'a bouge", apresRefus.proprietaire === idCadet && apresRefus.etat === "owned");

  // DEMANDE : le cadet demande une regle au maitre, qui choisit laquelle.
  const demande = await depot(cadet, `
    const r = await d.remisesObjet.demander({
      asked_kind: "buvard", asked_label: "Buvard",
      from_user: etat.utilisateur.id, to_user: "${idMaitre}",
      kind: "lend", direction: "request", attested: true
    });
    return r.id;
  `);
  const suiteDemande = await depot(maitre, `
    const mien = await d.affaires.miennes(etat.utilisateur.id);
    const buvard = mien.find((o) => o.kind === "buvard");
    await d.remisesObjet.accepter("${demande}", buvard.id);
    const o = await d.affaires.lire(buvard.id);
    return { detenteur: o.holder_id, proprietaire: o.owner_id };
  `);
  verifier("demande : l'objet part chez le demandeur", suiteDemande.detenteur === idCadet);
  verifier("demande : il reste au preteur", suiteDemande.proprietaire === idMaitre);

  /* =======================================================================
     7. Preparer ses affaires et ce qui manque
     ===================================================================== */
  journal.push("\n7. La preparation");
  const classeId = await depot(maitre, `
    const cl = await d.classes.creerAvecCahier({
      owner_id: etat.utilisateur.id, name: "Compagnie ${sfx}", color: "olive",
      settings: {}, archived: false, join_open: true, require_approval: false
    }, etat.utilisateur.id);
    await d.classes.majorer(cl.id, { settings: { materiel: m.consigneAEnregistrer({
      supports: [], bloquant: true, minutes: 10,
      requis: [
        { kind: "plume", label: "Plume", niveau: "obligatoire" },
        { kind: "encrier", label: "Encrier", niveau: "obligatoire" },
        { kind: "regle", label: "Regle", niveau: "recommande" }
      ]
    }) } });
    return cl.id;
  `);
  await depot(cadet, `return d.classes.rejoindre((await d.classes.lire("${classeId}")).code);`);

  const partiel = await depot(cadet, `
    const mien = await d.affaires.miennes(etat.utilisateur.id);
    const plume = mien.find((o) => o.kind === "plume");
    await d.cartable.enregistrer("${classeId}", etat.utilisateur.id, {
      notebooks: {}, supplies: { [plume.id]: { kind: "plume", label: "Plume" } }, session: null
    });
    const cl = await d.classes.lire("${classeId}");
    const sac = await d.cartable.pour("${classeId}", etat.utilisateur.id);
    const attendu = m.materielAttendu(cl, null);
    const e = m.ecart(sac, attendu);
    return { total: e.total, bloquants: e.bloquants.map((x) => x.label), noms: e.noms };
  `);
  verifier("preparation partielle : l'ecart est vu", partiel.total === 2, JSON.stringify(partiel.noms));
  verifier("preparation partielle : l'encrier est bloquant", partiel.bloquants.includes("Encrier"));
  verifier("preparation partielle : la regle ne l'est pas", !partiel.bloquants.includes("Regle"));

  const complet = await depot(cadet, `
    const mien = await d.affaires.miennes(etat.utilisateur.id);
    const carte = {};
    for (const o of mien) if (["plume", "encrier", "regle"].includes(o.kind)) {
      carte[o.id] = { kind: o.kind, label: o.label };
    }
    await d.cartable.enregistrer("${classeId}", etat.utilisateur.id, {
      notebooks: {}, supplies: carte, session: null
    });
    const cl = await d.classes.lire("${classeId}");
    const sac = await d.cartable.pour("${classeId}", etat.utilisateur.id);
    return m.ecart(sac, m.materielAttendu(cl, null)).total;
  `);
  verifier("preparation complete : plus rien ne manque", complet === 0, String(complet));

  /* =======================================================================
     8. La privation, et l'encre
     ===================================================================== */
  journal.push("\n8. Ne pas pouvoir ecrire");
  const sansRien = await depot(cadet, `
    const p = await import("/src/features/privation.js");
    const cl = await d.classes.lire("${classeId}");
    const attendu = m.materielAttendu(cl, null);
    return {
      lesMainsVides: p.nePeutPasEcrire({ notebooks: {}, supplies: {} }, attendu),
      plumeSansEncre: p.nePeutPasEcrire(
        { notebooks: {}, supplies: { x: { kind: "plume", label: "Plume" } } }, attendu),
      avecCrayon: p.nePeutPasEcrire(
        { notebooks: {}, supplies: { x: { kind: "crayon", label: "Crayon" } } }, attendu),
      complet: p.nePeutPasEcrire(
        { notebooks: {}, supplies: { x: { kind: "plume" }, y: { kind: "encrier" } } }, attendu)
    };
  `);
  verifier("les mains vides : on ne peut pas ecrire", sansRien.lesMainsVides.length > 0);
  verifier("une plume sans encre ne trace pas", sansRien.plumeSansEncre.includes("de l'encre"));
  verifier("un crayon suffit toujours", sansRien.avecCrayon.length === 0);
  verifier("plume et encrier : on travaille", sansRien.complet.length === 0);

  const encre = await depot(cadet, `
    const mien = await d.affaires.miennes(etat.utilisateur.id);
    const encrier = mien.find((o) => o.kind === "encrier");
    await d.affaires.majorer(encrier.id, { level: 4 });
    const vide = await d.affaires.consommer(await d.affaires.lire(encrier.id), 10);
    const flacon = await d.affaires.creer({
      owner_id: etat.utilisateur.id, kind: "encre", label: "Flacon", category: "ecriture", level: 60
    });
    const { verse } = await d.affaires.remplir(await d.affaires.lire(encrier.id), flacon);
    const apres = await d.affaires.lire(encrier.id);
    const restant = await d.affaires.lire(flacon.id);
    return { plancher: vide.level, verse, niveau: apres.level, flacon: restant.level };
  `);
  verifier("un encrier vide ne passe pas sous zero", encre.plancher === 0);
  // Un flacon contient quatre encriers : remplir un encrier vide en prend le quart.
  verifier("le remplissage verse ce qu'il faut", encre.verse === 100 && encre.niveau === 100, String(encre.verse));
  verifier("ce qui entre dans l'encrier sort du flacon (au quart)", encre.flacon === 60 - 25, String(encre.flacon));

  /* =======================================================================
     9. Les permissions ne sont pas dans l'ecran
     ===================================================================== */
  journal.push("\n9. Les permissions");
  const vol = await depot(cadet, `
    const mien = await d.affaires.miennes("${idMaitre}");
    const r = await d.remisesObjet.tendre({
      belonging_id: null, asked_kind: "plume",
      from_user: "${idMaitre}", to_user: etat.utilisateur.id,
      kind: "give", direction: "offer", attested: true
    }).catch(() => null);
    if (!r) return "refus a l'insertion";
    try { await d.remisesObjet.accepter(r.id); return "ACCEPTE"; }
    catch (e) { return "refus a l'acceptation : " + e.message; }
  `);
  verifier("on n'accepte pas une remise dont l'objet n'est pas au cedant",
    !String(vol).includes("ACCEPTE"), String(vol));

  const pasAMoi = await depot(maitre, `
    const enAttente = await d.remisesObjet.enAttente("${idCadet}");
    if (!enAttente.length) return "rien en attente";
    try { await d.remisesObjet.accepter(enAttente[0].id); return "ACCEPTE"; }
    catch (e) { return "refus : " + e.message; }
  `);
  verifier("on n'accepte pas ce qui est tendu a quelqu'un d'autre",
    !String(pasAMoi).includes("ACCEPTE"), String(pasAMoi));

  const confiscationHorsSac = await depot(maitre, `
    const mien = await d.affaires.miennes("${idCadet}");
    const absent = mien.find((o) => o.kind === "gomme");
    await d.cartable.enregistrer("${classeId}", "${idCadet}", {
      notebooks: {}, supplies: {}, session: null
    });
    try { await d.affaires.confisquer(absent.id, "${classeId}", "essai"); return "CONFISQUE"; }
    catch (e) { return "refus : " + e.message; }
  `);
  verifier("on ne confisque pas ce qui n'a pas ete apporte",
    String(confiscationHorsSac).includes("refus"), String(confiscationHorsSac));

  /* =======================================================================
     10. Supprimer ce qu'on a cree
     ===================================================================== */
  journal.push("\n10. La suppression");
  const suppression = await depot(maitre, `
    const s = await d.sessions.demarrer("${classeId}", "Seance d'essai", "cours");
    await d.sessions.supprimer(s.id);
    const restantes = await d.sessions.liste("${classeId}");
    const cl = await d.classes.creerAvecCahier({
      owner_id: etat.utilisateur.id, name: "A supprimer", color: "olive",
      settings: {}, archived: false, join_open: true, require_approval: false
    }, etat.utilisateur.id);
    await d.classes.supprimer(cl.id);
    const encore = await d.classes.lire(cl.id);
    return { seances: restantes.filter((x) => x.id === s.id).length, classe: encore };
  `);
  verifier("une seance se supprime vraiment", suppression.seances === 0);
  verifier("une classe se supprime vraiment", suppression.classe === null);

  /* =======================================================================
     11. La salle : la privation, la main levee, la levee
     ===================================================================== */
  journal.push("\n11. La salle");
  const seance = await depot(maitre, `
    const s = await d.sessions.demarrer("${classeId}", "Manoeuvre", "cours");
    return s.id;
  `);

  // Le cadet arrive les mains vides pour cette seance-ci : son sac est
  // prepare, mais il ne l'a pas repris aujourd'hui.
  await depot(cadet, `
    await d.cartable.enregistrer("${classeId}", etat.utilisateur.id, {
      notebooks: {}, supplies: {}, session: "${seance}"
    });
    return true;
  `);

  await cadet.goto(`${RACINE}#/classe/${classeId}/salle`);
  await cadet.waitForTimeout(3200);
  const bandeau = await cadet.locator(".privation").count();
  verifier("arrive sans rien, le cadet est prive", bandeau === 1);

  if (bandeau) {
    await cadet.click('.privation button:has-text("Demander")');
    await cadet.waitForTimeout(900);
    const leve = await depot(maitre, `
      const liste = await d.privations.liste("${seance}");
      const p = liste.find((x) => x.user_id === "${idCadet}");
      if (!p) return "aucune privation";
      if (p.state !== "asked") return "etat : " + p.state;
      await d.privations.trancher(p.id, true, etat.utilisateur.id);
      const apres = (await d.privations.liste("${seance}"))
        .find((x) => x.user_id === "${idCadet}");
      return { etat: apres.state, restant: d.privations.secondesRestantes(apres) };
    `);
    verifier("la main levee se voit depuis l'estrade", typeof leve === "object", String(leve));
    if (typeof leve === "object") {
      verifier("accordee, la privation tombe", leve.etat === "granted" && leve.restant === 0);
    }
  }

  await maitre.goto(`${RACINE}#/classe/${classeId}/salle`);
  await maitre.waitForTimeout(2600);
  verifier("la salle s'ouvre cote estrade", await maitre.locator(".salle").count() === 1);
  // En 3D, l'eleve present apparait a sa place, et son nom le suit : une vue
  // montee hors de la page ne se redessinait plus une fois affichee.
  if (await maitre.locator(".scene--3d").count()) {
    await maitre.bringToFront();
    await maitre.waitForTimeout(1500);
    const places = await maitre.$$eval(".classe3d__nom:not(.classe3d__nom--prof)",
      (noms) => noms.filter((n) => n.textContent && n.style.transform).length);
    verifier("en 3D, l'eleve present est assis a sa place", places >= 1, String(places));
  }
  verifier("le controle du materiel est affiche",
    await maitre.locator(".controle-materiel").count() >= 1);

  await depot(maitre, `return d.sessions.terminer("${seance}");`);

  /* =======================================================================
     13. La place des choses : les objets conditionnent les actions
     ===================================================================== */
  journal.push("\n13. La place des choses");
  const seanceA = await depot(maitre, `return (await d.sessions.demarrer("${classeId}", "Cours A", "cours")).id;`);

  // Le cadet s'installe : il sort de son sac un crayon et un cahier.
  const installe = await depot(cadet, `
    const p = await import("/src/features/portee.js");
    const classe = await d.classes.lire("${classeId}");
    const seance = { id: "${seanceA}", status: "live", class_id: classe.id };
    const ctx = p.contexte({ session: seance, classe });
    const moi = etat.utilisateur.id;
    let mien = await d.affaires.miennes(moi);
    // Le sac tel qu'on le boucle : le cartable sur l'epaule, la trousse
    // dedans, le crayon dans la trousse.
    const cartable = mien.find((o) => o.kind === "cartable");
    const trousse = mien.find((o) => o.kind === "trousse");
    await d.affaires.porter(cartable.id, true);
    await d.affaires.rangerDans(trousse, cartable.id);
    await d.affaires.rangerDans(mien.find((o) => o.kind === "crayon" && o.owner_id === moi), trousse.id);
    mien = await d.affaires.miennes(moi);
    const avant = p.peutFaire("ecrire", mien, { moiId: moi, ctx });
    const cahier = await d.cahiers.creer({ owner_id: moi, kind: "personal", title: "Cahier du jour",
      container_id: cartable.id });
    const crayon = mien.find((o) => o.kind === "crayon" && o.owner_id === moi);
    await d.affaires.sortir(crayon, { session: seance, classe });
    await d.cahiers.sortir(cahier, { session: seance, classe });
    mien = await d.affaires.miennes(moi);
    const apres = p.peutFaire("ecrire", mien, { moiId: moi, ctx });
    const effacer = p.peutFaire("effacer", mien, { moiId: moi, ctx });
    // Un compas resté chez soi ne se pose pas sur le bureau.
    const compas = await d.affaires.creer({ owner_id: moi, kind: "compas", label: "", size: 1 });
    let horsSac = "accepte";
    try { await d.affaires.sortir(compas, { session: seance, classe }); } catch (e) { horsSac = "refus"; }
    return { avant: avant.ok, conseil: avant.conseil || "", apres: apres.ok, effacer: effacer.ok,
      horsSac, cahier: cahier.id, crayon: crayon.id };
  `);
  verifier("en seance, un crayon au fond du sac ne suffit pas", installe.avant === false, installe.conseil);
  verifier("le conseil dit de le sortir du sac", /sac/i.test(installe.conseil), installe.conseil);
  verifier("sorti sur le bureau, le crayon permet d'ecrire", installe.apres === true);
  verifier("sans gomme sur le bureau, on n'efface pas", installe.effacer === false);
  verifier("on ne pose pas sur le bureau ce qui n'est pas dans le sac", installe.horsSac === "refus");

  // Il part en laissant crayon et cahier sur la table.
  await depot(cadet, `
    const classe = await d.classes.lire("${classeId}");
    await d.affaires.laisser({ id: "${installe.crayon}" }, { classe });
    await d.cahiers.laisser({ id: "${installe.cahier}" }, { classe });
    return true;
  `);
  await depot(maitre, `return d.sessions.terminer("${seanceA}");`);
  const seanceB = await depot(maitre, `return (await d.sessions.demarrer("${classeId}", "Cours B", "cours")).id;`);

  const suivante = await depot(cadet, `
    const p = await import("/src/features/portee.js");
    const classe = await d.classes.lire("${classeId}");
    const ctx = p.contexte({ session: { id: "${seanceB}", status: "live" }, classe });
    const moi = etat.utilisateur.id;
    const mien = await d.affaires.miennes(moi);
    // On retire la plume du jeu : seul le crayon oublie aurait permis d'ecrire.
    const plume = mien.find((o) => o.kind === "plume");
    const crayon = mien.find((o) => o.id === "${installe.crayon}");
    const sans = mien.filter((o) => o.id !== plume.id);
    const v = p.peutFaire("ecrire", sans, { moiId: moi, ctx });
    return { ok: v.ok, conseil: v.conseil || "", lieu: p.situer(crayon, { moiId: moi, ctx, index: a.indexer(mien) }).lieu };
  `);
  verifier("le crayon oublie reste dans la salle", suivante.lieu === "salle", suivante.lieu);
  verifier("a l'activite suivante, sans crayon, on n'ecrit pas", suivante.ok === false, suivante.conseil);

  // Le bogue d'origine : revenu à sa place, l'objet oublié avait « disparu ».
  // Il doit revenir devant soi, sur le bureau de la séance en cours.
  const reprise = await depot(cadet, `
    const p = await import("/src/features/portee.js");
    const classe = await d.classes.lire("${classeId}");
    await d.affaires.reprendre("${installe.crayon}", "${seanceB}");
    const moi = etat.utilisateur.id;
    const mien = await d.affaires.miennes(moi);
    const crayon = mien.find((o) => o.id === "${installe.crayon}");
    const ctx = p.contexte({ session: { id: "${seanceB}", status: "live" }, classe });
    return p.situer(crayon, { moiId: moi, ctx, index: a.indexer(mien) }).lieu;
  `);
  verifier("revenu en salle, l'objet oublie se reprend sur le bureau", reprise === "bureau", reprise);
  await depot(maitre, `return d.sessions.terminer("${seanceB}");`);

  const ferme = await depot(cadet, `
    try { await d.affaires.recuperer("${installe.crayon}"); return "repris"; }
    catch (e) { return "refus : " + e.message; }
  `);
  verifier("salle fermee : on ne recupere pas son crayon", ferme.startsWith("refus"), ferme);

  await cadet.goto(`${RACINE}#/cahier/${installe.cahier}`);
  await cadet.waitForTimeout(1500);
  verifier("le cahier oublie ne s'ouvre pas",
    (await cadet.locator("text=n'est pas entre vos mains").count()) === 1);

  const trouves = await depot(maitre, `
    const liste = await d.salles.oublies("${classeId}");
    const classe = await d.classes.lire("${classeId}");
    await d.salles.ouvrir(classe, 30);
    return liste.map((x) => x.id);
  `);
  verifier("le professeur voit les objets oublies", trouves.includes(installe.crayon)
    && trouves.includes(installe.cahier), JSON.stringify(trouves));

  const repris = await depot(cadet, `
    const o = await d.affaires.recuperer("${installe.crayon}");
    return { place: o.place, dans: o.container_id };
  `);
  verifier("salle ouverte : le crayon se recupere", repris.place === "range", JSON.stringify(repris));

  const rendu = await depot(maitre, `
    const classe = await d.classes.lire("${classeId}");
    await d.salles.fermer(classe);
    await d.salles.restituer("cahier", "${installe.cahier}");
    const c = await d.cahiers.lire("${installe.cahier}");
    return c.place;
  `);
  verifier("le professeur restitue le cahier a son proprietaire", rendu === "range", String(rendu));

  const contenance = await depot(cadet, `
    const moi = etat.utilisateur.id;
    const etui = await d.affaires.creer({ owner_id: moi, kind: "etui", size: 3, capacity: 6,
      is_container: true, carried: true });
    let n = 0;
    try {
      for (let i = 0; i < 8; i++) {
        const x = await d.affaires.creer({ owner_id: moi, kind: "crayon", size: 1 });
        await d.affaires.rangerDans(x, etui.id);
        n++;
      }
    } catch (e) { return { n, refus: e.message }; }
    return { n, refus: null };
  `);
  verifier("un etui plein refuse le crayon de trop", contenance.n === 6 && contenance.refus,
    JSON.stringify(contenance));

  const dossier = await depot(cadet, `
    const p = await import("/src/features/portee.js");
    const moi = etat.utilisateur.id;
    const classe = await d.classes.lire("${classeId}");
    const dos = await d.affaires.creer({ owner_id: moi, kind: "dossier", label: "Rapports",
      size: 3, capacity: 6, is_container: true });
    const papier = await d.papiers.creer({ author_id: moi, title: "Rapport de patrouille", model: "note", body: "RAS" });
    await d.classement.ranger(dos.id, papier.id, moi);
    const dedans = (await d.classement.contenu(dos.id)).length;
    await d.affaires.laisser(dos, { classe });
    const mien = await d.affaires.miennes(moi);
    const ou = p.situer(mien.find((o) => o.id === dos.id), { moiId: moi, ctx: p.contexte(), index: a.indexer(mien) });
    return { dedans, ok: ou.ok, lieu: ou.lieu };
  `);
  verifier("un papier se classe dans un dossier", dossier.dedans === 1);
  verifier("un dossier oublie n'est plus accessible", dossier.ok === false && dossier.lieu === "salle",
    JSON.stringify(dossier));

  /* =======================================================================
     14. La scene : le bureau devant soi
     ===================================================================== */
  journal.push("\n14. La scene");
  const CAPT = process.env.CAPTURES || "/tmp";
  const seanceC = await depot(maitre, `return (await d.sessions.demarrer("${classeId}", "Cours de geographie", "cours")).id;`);
  await depot(cadet, `
    const moi = etat.utilisateur.id;
    const mien = await d.affaires.miennes(moi);
    const cartable = mien.find((o) => o.kind === "cartable");
    const trousse = mien.find((o) => o.kind === "trousse");
    await d.affaires.porter(cartable.id, true);
    await d.affaires.rangerDans(trousse, cartable.id);
    for (const o of mien.filter((x) => x.owner_id === moi && ["crayon", "gomme", "regle"].includes(x.kind) && (x.place || "range") === "range")) {
      await d.affaires.rangerDans(o, trousse.id).catch(() => null);
    }
    await d.cahiers.creer({ owner_id: moi, kind: "personal", title: "Geographie", container_id: cartable.id });
    await d.cartable.enregistrer("${classeId}", moi, { notebooks: {}, supplies: {}, session: "${seanceC}" });
    return true;
  `);
  await cadet.setViewportSize({ width: 1440, height: 900 });
  await cadet.goto(`${RACINE}#/classe/${classeId}/salle`);
  await cadet.waitForTimeout(3200);
  for (let i = 0; i < 3 && await cadet.locator(".voile").count(); i++) {
    await cadet.keyboard.press("Escape"); await cadet.waitForTimeout(400);
  }
  // La consigne de materiel de la classe prive le cadet : le maitre la leve,
  // ce n'est pas ce qu'on essaie ici.
  await depot(maitre, `
    const liste = await d.privations.liste("${seanceC}");
    for (const p of liste) await d.privations.trancher(p.id, true, etat.utilisateur.id).catch(() => null);
    return true;
  `);
  await cadet.reload();
  await cadet.waitForTimeout(3000);
  for (let i = 0; i < 3 && await cadet.locator(".voile").count(); i++) {
    await cadet.keyboard.press("Escape"); await cadet.waitForTimeout(400);
  }
  verifier("la salle s'ouvre sur le bureau", await cadet.locator(".scene").isVisible());
  verifier("les gestes essentiels sont dans le dock", await cadet.locator(".dock .dock__chose").count() >= 6);
  await cadet.screenshot({ path: `${CAPT}/scene-1-bureau-vide.png` });

  await cadet.click(".scene__sac");
  await cadet.waitForTimeout(700);
  verifier("le sac s'ouvre et montre ce qu'il contient", await cadet.locator(".sac__chose").count() >= 2);
  await cadet.screenshot({ path: `${CAPT}/scene-2-sac-ouvert.png` });

  // En 3D, on fouille le sac à la souris ; la liste, invisible, sert au
  // clavier : on l'active comme le ferait la touche Entrée.
  const sortir = (sel) => cadet.locator(sel).first().evaluate((b) => b.click());
  await sortir('.sac__chose[aria-label="Sortir Geographie"]');
  await cadet.waitForTimeout(900);
  await sortir('.sac__chose[aria-label^="Sortir Crayon"]');
  await cadet.waitForTimeout(900);
  await sortir('.sac__chose[aria-label^="Sortir Gomme"]').catch(() => {});
  await cadet.waitForTimeout(900);
  await sortir('.sac__chose[aria-label^="Sortir Règle"]').catch(() => {});
  await cadet.waitForTimeout(900);
  await sortir('.sac__chose[aria-label^="Sortir Feuilles"]').catch(() => {});
  await cadet.waitForTimeout(900);
  verifier("sortis du sac, le cahier et le crayon sont sur le bureau",
    await cadet.locator('.pose[data-genre="cahier"]').count() === 1
    && await cadet.locator('.pose[data-kind="crayon"]').count() >= 1);
  await cadet.click(".scene__sac");
  await cadet.waitForTimeout(500);
  await cadet.screenshot({ path: `${CAPT}/scene-3-bureau-garni.png` });

  await cadet.click('.pose[data-genre="cahier"]');
  await cadet.waitForTimeout(1400);
  verifier("le cahier s'ouvre sur le bureau", await cadet.locator('.scene[data-etat="cahier"]').count() === 1);
  verifier("sans stylo en main, on n'ecrit pas", await cadet.locator(".manque-outil").count() === 1);
  await cadet.screenshot({ path: `${CAPT}/scene-4-cahier-sans-stylo.png` });
  await cadet.click('.rail__outil:has-text("Crayon")');
  await cadet.waitForTimeout(1200);
  verifier("le crayon en main, on ecrit", await cadet.locator(".manque-outil").count() === 0);
  await cadet.screenshot({ path: `${CAPT}/scene-5-cahier-crayon-en-main.png` });

  await maitre.setViewportSize({ width: 1440, height: 900 });
  await maitre.goto(`${RACINE}#/classe/${classeId}/salle`);
  await maitre.reload();
  await maitre.waitForTimeout(3000);
  await maitre.click(".contexte__statut button.presence");
  await maitre.waitForTimeout(900);
  await maitre.screenshot({ path: `${CAPT}/scene-6-professeur.png` });
  await cadet.click(".scene__livre .scene__fermer");
  await cadet.waitForTimeout(1500);
  verifier("l'eleve voit le professeur devant la classe",
    await cadet.locator(".contexte__statut .presence--oui").count() === 1);
  await cadet.screenshot({ path: `${CAPT}/scene-7-professeur-present.png` });

  await cadet.click('.dock__chose[aria-label="Écrire une note à quelqu\'un"]');
  await cadet.waitForTimeout(700);
  verifier("la note rapide s'ouvre en un geste", await cadet.locator(".note-rapide").count() === 1);
  await cadet.screenshot({ path: `${CAPT}/scene-8-note.png` });
  await cadet.keyboard.press("Escape");
  await cadet.waitForTimeout(400);

  // En petite fenêtre (au-dessus du jeu) : la console remplace la scène.
  await cadet.setViewportSize({ width: 460, height: 640 });
  await cadet.waitForTimeout(900);
  verifier("en petite fenetre, la salle devient une console",
    await cadet.locator(".salle > .console").isVisible() && !(await cadet.locator(".salle > .scene").isVisible()));
  await cadet.screenshot({ path: `${CAPT}/petit-1-salle-bureau.png` });
  // Animation allumée : on se voit assis à sa place, en 3D, en tête de la console.
  verifier("en petite fenetre, on se voit assis a son bureau (3D en tete de console)",
    await cadet.locator('.salle > .console[data-scene="1"] .console__scene canvas.classe3d__toile').count() === 1);
  await cadet.click(".salle > .console .console__anim");
  await cadet.waitForTimeout(800);
  verifier("animation coupee : plus de 3D, le tableau et l'interface",
    await cadet.locator(".salle canvas.classe3d__toile").count() === 0
    && await cadet.locator('.salle > .console .console__contenu[data-panneau="tableau"]').count() === 1);
  await cadet.screenshot({ path: `${CAPT}/petit-1b-animation-coupee.png` });
  await cadet.click(".salle > .console .console__anim");
  await cadet.waitForTimeout(1500);
  verifier("animation rallumee : on se revoit a sa place",
    await cadet.locator('.salle > .console[data-scene="1"] .console__scene canvas.classe3d__toile').count() === 1);
  await cadet.click('.console__barre [aria-label="Sac"]');
  await cadet.waitForTimeout(700);
  verifier("le sac s'ouvre dans la console", await cadet.locator('.console__contenu[data-panneau="sac"]').count() === 1);
  await cadet.screenshot({ path: `${CAPT}/petit-2-salle-sac.png` });
  await cadet.click('.console__barre [aria-label="Cahier"]');
  await cadet.waitForTimeout(1200);
  verifier("le cahier s'ouvre dans la console", await cadet.locator('.console .parchemin').count() >= 1);
  verifier("et la scene reste au-dessus : on se voit a son bureau pendant qu'on ecrit",
    await cadet.locator('.salle > .console[data-scene="1"] .console__scene canvas').isVisible());
  await cadet.screenshot({ path: `${CAPT}/petit-3-salle-cahier.png` });
  await cadet.setViewportSize({ width: 380, height: 300 });
  await cadet.waitForTimeout(900);
  await cadet.screenshot({ path: `${CAPT}/petit-4-salle-mini.png` });
  verifier("en toute petite fenetre, la barre des gestes reste la",
    await cadet.locator(".console__barre").isVisible());
  await cadet.setViewportSize({ width: 1440, height: 900 });
  await cadet.waitForTimeout(900);
  verifier("revenu en grand, la scene reprend sa place", await cadet.locator(".salle > .scene").isVisible());

  await depot(maitre, `return d.sessions.terminer("${seanceC}");`);
  await cadet.waitForTimeout(1500);
  await cadet.setViewportSize({ width: 1280, height: 800 });
  await maitre.setViewportSize({ width: 1280, height: 800 });

  // Chez moi : le bureau de la chambre, et la barre des gestes.
  await cadet.goto(`${RACINE}#/`);
  await cadet.waitForTimeout(1800);
  verifier("chez moi, on arrive devant son bureau", await cadet.locator(".chez-moi .scene").isVisible());
  verifier("la barre des gestes est la", await cadet.locator(".actions .actions__geste").count() === 6);
  verifier("plus de sigle « CP » : une maison pour rentrer chez soi",
    (await cadet.locator(".contexte__sceau").innerText()).trim() === "" && await cadet.locator(".contexte__sceau svg").count() === 1);
  const avantCahiers = await depot(cadet, "return (await d.cahiers.mesCahiers(etat.utilisateur.id)).length");
  await cadet.click('.mur__raccourcis button:has-text("Mes cahiers")');
  await cadet.waitForSelector(".mes-cahiers", { timeout: 5000 });
  await cadet.fill('.mes-cahiers input[name="titre-cahier"]', "Stratégie");
  await cadet.click('.mes-cahiers .mes-cahiers__teinte[title="Bordeaux"] >> nth=-1');
  await cadet.click('.mes-cahiers button:has-text("Le prendre")');
  await cadet.waitForTimeout(700);
  await cadet.screenshot({ path: `${CAPT}/mes-cahiers.png` });
  verifier("« Mes cahiers » : on en prend un neuf, couverture choisie",
    await cadet.locator('.mes-cahiers__cahier:has-text("Stratégie")').count() === 1
    && await depot(cadet, "return (await d.cahiers.mesCahiers(etat.utilisateur.id)).length") === avantCahiers + 1);
  await cadet.keyboard.press("Escape");
  await cadet.waitForTimeout(500);

  // L'encre : la plume en main, chez soi, chaque ligne entame l'encrier.
  const ids = await depot(cadet, `const l = await d.affaires.miennes(etat.utilisateur.id);
    const g = (k) => l.find((o) => o.kind === k);
    return { plume: g("plume")?.id, encrier: g("encrier")?.id, flacon: g("encre")?.id };`);
  verifier("un flacon d'encre attend a la maison", Boolean(ids.flacon));
  await depot(cadet, `for (const id of ${JSON.stringify([ids.plume, ids.encrier])}) await d.affaires.rangerDans(await d.affaires.lire(id), null);
    localStorage.setItem("ojm.enmain.maison", JSON.stringify(String(${JSON.stringify(ids.plume)}))); return 1;`);
  await cadet.goto(`${RACINE}#/affaires`);
  await cadet.waitForTimeout(600);
  await cadet.goto(`${RACINE}#/`);
  await cadet.waitForTimeout(1500);
  await cadet.click('.actions__geste[data-geste="cahier"]');
  await cadet.waitForTimeout(1200);
  verifier("chez soi, a la plume : la jauge d'encre est au-dessus du cahier",
    await cadet.locator(".mon-cahier .encre-niveau").isVisible());
  await cadet.click(".mon-cahier .parchemin__corps");
  await cadet.keyboard.type("Rapport de la troisieme expedition hors des murs : pertes legeres, cartes a refaire. ".repeat(2), { delay: 2 });
  await cadet.waitForTimeout(2200);
  const niveau = await depot(cadet, `return (await d.affaires.lire(${JSON.stringify(ids.encrier)})).level;`);
  verifier("ecrire a la plume vide l'encrier peu a peu", niveau <= 97 && niveau >= 90, `niveau ${niveau}`);
  verifier("la jauge suit en direct", (await cadet.locator(".mon-cahier .encre-niveau__pc").innerText()).trim() === `${niveau} %`);
  await depot(cadet, `await d.affaires.consommer(await d.affaires.lire(${JSON.stringify(ids.encrier)}), 100); return 1;`);
  await cadet.goto(`${RACINE}#/affaires`);
  await cadet.waitForTimeout(600);
  await cadet.goto(`${RACINE}#/`);
  await cadet.waitForTimeout(1500);
  await cadet.click('.actions__geste[data-geste="cahier"]');
  await cadet.waitForTimeout(1200);
  verifier("encrier vide : on le voit, et on ne trace plus",
    await cadet.locator('.mon-cahier .encre-niveau[data-vide="1"]').isVisible());
  await cadet.screenshot({ path: `${CAPT}/encre-vide.png` });
  await cadet.click(".mon-cahier .encre-niveau__remplir");
  await cadet.waitForTimeout(1500);
  const apres = await depot(cadet, `return { e: (await d.affaires.lire(${JSON.stringify(ids.encrier)})).level, f: (await d.affaires.lire(${JSON.stringify(ids.flacon)})).level };`);
  verifier("on remplit l'encrier au flacon de la maison (un quart du flacon)", apres.e === 100 && apres.f === 75, JSON.stringify(apres));
  verifier("et la plume peut de nouveau ecrire", await cadet.locator('.mon-cahier .encre-niveau[data-vide="1"]').count() === 0);
  await cadet.goto(`${RACINE}#/`);
  await cadet.waitForTimeout(1200);

  await cadet.click('.actions__geste[data-geste="sac"]');
  await cadet.waitForTimeout(700);
  verifier("le geste Sac ouvre le sac de la chambre", await cadet.locator('.chez-moi .scene[data-etat="sac"]').count() === 1);
  await cadet.screenshot({ path: `${CAPT}/chez-moi-sac.png` });
  await cadet.click('.actions__geste[data-geste="bureau"]');
  await cadet.waitForTimeout(500);

  await cadet.goto(`${RACINE}#/affaires`);
  await cadet.waitForTimeout(1500);
  verifier("mes affaires montrent ce qui est reste en salle",
    (await cadet.locator(".affaires__section--restes").count()) === 1
    && (await cadet.locator(".affaire--reste").count()) >= 1);
  await cadet.screenshot({ path: `${process.env.CAPTURES || "/tmp"}/affaires-restes.png`, fullPage: true }).catch(() => {});
  await cadet.goto(`${RACINE}#/papiers`);
  await cadet.waitForTimeout(900);
  await cadet.click('button.onglet:has-text("Dossiers")');
  await cadet.waitForTimeout(900);
  verifier("l'onglet dossiers montre le dossier oublie comme indisponible",
    (await cadet.locator(".dossier-carte--hors").count()) >= 1);

  /* =======================================================================
     12. Les ecrans repondent
     ===================================================================== */
  journal.push("\n12. Les ecrans");
  const manquantes = new Set();
  cadet.on("response", (r) => { if (r.status() === 404) manquantes.add(r.url().split("/").pop()); });
  for (const route of ["/affaires", "/cahiers", "/papiers", "/classes", "/documents"]) {
    await cadet.goto(`${RACINE}#${route}`);
    await cadet.waitForTimeout(900);
    const titre = await cadet.locator(".page, .cahier").count();
    verifier(`la page ${route} s'affiche`, titre > 0);
  }
  verifier("aucune image manquante", manquantes.size === 0, [...manquantes].join(", "));

  /* =======================================================================
     13. Le compte : pseudo et mot de passe, sans courriel
     ===================================================================== */
  journal.push("\n13. Le compte");
  await cadet.goto(`${RACINE}#/profil`);
  await cadet.waitForTimeout(1000);
  await cadet.click('button:has-text("Changer mon mot de passe")');
  await cadet.waitForTimeout(400);
  const champsMdp = cadet.locator('.modale input[type="password"]');
  await champsMdp.nth(0).fill("nouveau-secret");
  await champsMdp.nth(1).fill("nouveau-secret");
  await cadet.click('.modale button:has-text("Changer")');
  await cadet.waitForTimeout(600);
  await cadet.click('button:has-text("Se déconnecter")');
  await cadet.waitForTimeout(900);
  await cadet.fill('input[name="pseudo"]', "cadet");
  await cadet.fill('input[name="mdp"]', "motdepasse1");
  await cadet.click('button[type="submit"]:has-text("Entrer")');
  await cadet.waitForTimeout(900);
  verifier("l'ancien mot de passe ne marche plus", await cadet.locator('input[name="pseudo"]').count() === 1);
  await cadet.fill('input[name="mdp"]', "nouveau-secret");
  await cadet.click('button[type="submit"]:has-text("Entrer")');
  await cadet.waitForTimeout(1500);
  verifier("on rentre avec son pseudo (majuscules indifferentes) et le nouveau mot de passe",
    await cadet.locator('input[name="pseudo"]').count() === 0);

  /* =======================================================================
     15. La remise verifiee, la moderation
     ===================================================================== */
  journal.push("\n15. La remise verifiee");
  const remise = await depot(maitre, `
    const p = await d.papiers.creer({ author_id: etat.utilisateur.id, title: "Ordre", model: "ordre", body: "x" });
    const r = await d.papiers.tendre({ paper_id: p.id, from_user: etat.utilisateur.id, to_user: "${idCadet}",
      attested: true, lieu: "Trost — district" });
    return r.id;
  `);
  const sansPresence = await depot(cadet, `
    try { await d.papiers.repondre("${remise}", "accepted"); return "garde"; } catch (e) { return "bloque"; }
  `);
  verifier("on ne garde pas un papier sans dire que l'emetteur est devant soi", sansPresence === "bloque");
  const usurpe = await depot(maitre, `
    try { await d.papiers.confirmerPresence("${remise}", { present: true, lieu: "x" }); return "MAUVAIS"; } catch (e) { return "bloque"; }
  `);
  verifier("l'emetteur ne repond pas a la place du destinataire", usurpe === "bloque");
  const garde = await depot(cadet, `
    await d.papiers.confirmerPresence("${remise}", { present: true, lieu: "Trost — district" });
    const r = await d.papiers.repondre("${remise}", "accepted");
    return r.state;
  `);
  verifier("presence confirmee, le papier se garde", garde === "accepted");
  const traces = await depot(cadet, `
    const l = await d.journal.liste({}, 50);
    return l.filter((e) => e.meta?.remise === "${remise}").map((e) => e.action).sort().join(",");
  `);
  verifier("la remise est inscrite au journal (tendu, presence, garde)",
    traces === "papier.accepted,papier.presence_confirmee,papier.tendu", traces);
  const promotion = await depot(cadet, `
    try { await d.profils.nommer(etat.utilisateur.id, "admin"); return "MAUVAIS"; } catch (e) { return "bloque"; }
  `);
  verifier("on ne se nomme pas administrateur soi-meme", promotion === "bloque");
  const titre = await depot(cadet, `
    try { await d.profils.titrer(etat.utilisateur.id, "roi"); return "MAUVAIS"; } catch (e) { return "bloque"; }
  `);
  verifier("on ne se couronne pas soi-meme", titre === "bloque");

  verifier("aucune erreur de script", erreursPage.length === 0, erreursPage.slice(0, 3).join(" | "));

} catch (err) {
  echoues++;
  journal.push(`  ECHEC (interruption) — ${err.message}\n${err.stack?.split("\n")[1] || ""}`);
}

console.log(journal.join("\n"));
console.log(`\n${reussis} reussis, ${echoues} echoues`);

if (!process.argv.includes("--montre")) await nav.close();
process.exit(echoues ? 1 : 0);
