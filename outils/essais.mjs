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
  await page.click("text=Créer un compte");
  await page.fill('input[autocomplete="name"]', nom);
  await page.fill('input[type="email"]', email);
  await page.fill('input[autocomplete="new-password"]', "motdepasse1");
  await page.click('button:has-text("Créer mon compte")');
  await page.waitForTimeout(1600);
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
  verifier("le remplissage verse ce qu'il faut", encre.verse === 100 - 0 - 40 || encre.verse === 60, String(encre.verse));
  verifier("ce qui entre dans l'encrier sort du flacon", encre.niveau + encre.flacon === 60);

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
  verifier("le controle du materiel est affiche",
    await maitre.locator(".controle-materiel").count() >= 1);

  await depot(maitre, `return d.sessions.terminer("${seance}");`);

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
  verifier("aucune erreur de script", erreursPage.length === 0, erreursPage.slice(0, 3).join(" | "));

} catch (err) {
  echoues++;
  journal.push(`  ECHEC (interruption) — ${err.message}\n${err.stack?.split("\n")[1] || ""}`);
}

console.log(journal.join("\n"));
console.log(`\n${reussis} reussis, ${echoues} echoues`);

if (!process.argv.includes("--montre")) await nav.close();
process.exit(echoues ? 1 : 0);
