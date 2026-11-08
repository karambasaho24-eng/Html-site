/* ---------------------------------------------------------------------------
 * Les essais.
 *
 * Des scénarios joués dans un vrai navigateur, sur le pilote local. Ils ne
 * vérifient pas que les boutons existent : ils vérifient que les GESTES ont les
 * conséquences annoncées — qu'un texte écrit se retrouve après un rechargement,
 * que le deuxième cahier ne se crée pas sans achat, que l'encre épuisée
 * empêche d'écrire SANS rien ôter de ce qui est déjà écrit.
 *
 * LIMITE À CONNAÎTRE : le pilote local reproduit les règles du serveur
 * (mêmes seuils, mêmes erreurs) mais ne les protège pas — tout vit dans le
 * navigateur. Ces essais prouvent donc que l'interface et la logique se
 * comportent comme annoncé ; ils ne prouvent PAS la sécurité côté serveur,
 * qui tient aux migrations 0039 et 0040 et ne peut être éprouvée que sur un
 * vrai PostgreSQL (voir docs/COMMANDES.md, « Vérifier sur une vraie base »).
 *
 * Deux onglets = deux comptes : le pilote local garde la session dans
 * sessionStorage, ce qui permet de jouer l'administrateur et l'élève sur un
 * seul poste.
 *
 *   node outils/essais.mjs            (le serveur doit tourner sur :8777)
 * ------------------------------------------------------------------------- */
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
  if (condition) { reussis++; journal.push(`  ok    ${nom}`); }
  else { echoues++; journal.push(`  ECHEC ${nom}${detail ? ` — ${detail}` : ""}`); }
}
const titre = (t) => journal.push(`\n${t}`);

const sfx = Date.now().toString(36);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Accès par la couche de données — les mêmes modules que l'interface. */
async function depot(page, expression) {
  return page.evaluate(async (src) => {
    const d = await import("/src/data/index.js");
    const e = await import("/src/features/encre.js");
    const s = (await import("/src/core/store.js")).etat;
    return await (new Function("d", "e", "etat", `return (async () => { ${src} })()`))(d, e, s);
  }, expression);
}
/** Comme depot, mais renvoie l'erreur (code, message) au lieu de la lancer. */
async function essayer(page, expression) {
  return page.evaluate(async (src) => {
    const d = await import("/src/data/index.js");
    const e = await import("/src/features/encre.js");
    const s = (await import("/src/core/store.js")).etat;
    try {
      return { ok: true, valeur: await (new Function("d", "e", "etat", `return (async () => { ${src} })()`))(d, e, s) };
    } catch (err) { return { ok: false, code: err.code, message: String(err.message) }; }
  }, expression);
}

async function creerCompte(page, nom) {
  await page.goto(RACINE);
  await page.waitForSelector('[role="tab"]:has-text("Créer mon compte")', { timeout: 15000 });
  await page.click('[role="tab"]:has-text("Créer mon compte")');
  await page.fill('input[name="pseudo"]', nom);
  await page.fill('input[name="mdp"]', "motdepasse1");
  await page.fill('input[name="mdp2"]', "motdepasse1");
  await page.click('button[type="submit"]:has-text("Créer mon compte")');
  // Première étape obligatoire : le nom RP (on reprend le pseudo pour que les recherches suivantes le trouvent).
  await page.waitForSelector('input[name="nom_rp"]', { timeout: 15000 });
  await page.fill('input[name="nom_rp"]', nom);
  await page.click('button[type="submit"]:has-text("C\'est mon personnage")');
  await page.waitForSelector(".contexte", { timeout: 15000 });
  await page.waitForFunction(() => location.hash === "#/" || location.hash === "", null, { timeout: 8000 });
  await page.waitForTimeout(900);
}

const nav = await chromium.launch({ executablePath: CHROME });
const ctx = await nav.newContext({ viewport: { width: 1360, height: 900 } });
await ctx.addInitScript(() =>
  localStorage.setItem("ojm.config", JSON.stringify({ supabaseUrl: "", supabaseAnonKey: "" })));

const erreursPage = [];
const admin = await ctx.newPage();
const eleve = await ctx.newPage();
for (const [nom, p] of [["admin", admin], ["eleve", eleve]]) {
  p.on("pageerror", (e) => erreursPage.push(`${nom}: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|esm\.sh|fonts\./.test(m.text())) erreursPage.push(`${nom} console: ${m.text()}`); });
}

try {
  /* =======================================================================
     0. L'arrivée : plus d'avatar, plus de sac — l'étagère de cahiers
     ===================================================================== */
  titre("0. L'arrivée");
  await creerCompte(admin, `Admin${sfx}`);
  await depot(admin, `await d.pilote.rpc("amorcer_admin_demo", {});`);
  await admin.reload();                       // le rôle se relit à l'ouverture de session
  await admin.waitForSelector(".contexte");
  await admin.waitForTimeout(600);

  await creerCompte(eleve, `Eleve${sfx}`);
  verifier("aucune fenêtre d'avatar à l'inscription", (await eleve.locator(".apparence").count()) === 0);
  verifier("l'accueil est « Mes cahiers »", (await eleve.locator("h1").first().textContent()).includes("cahiers"));
  verifier("la jauge d'encre est visible", await eleve.locator(".jauge-encre").isVisible());
  verifier("trois onglets : cahiers, documents, classes", (await eleve.locator(".nav-lien").count()) === 3);

  /* =======================================================================
     1. Le premier cahier est gratuit, et il garde ce qu'on y écrit
     ===================================================================== */
  titre("1. Le premier cahier");
  await eleve.click('button:has-text("Nouveau cahier")');
  await eleve.fill('input[name="title"]', "Histoire");
  await eleve.click('[role="dialog"] button:text-is("Créer")');
  await eleve.waitForSelector(".parchemin__corps", { timeout: 8000 });
  verifier("le premier cahier se crée sans achat", true);

  const idPremier = await eleve.evaluate(() => location.hash.split("/")[2].split("?")[0]);
  const TEXTE = "La Révolution française commence en 1789.";
  await eleve.click(".parchemin__corps");
  await eleve.keyboard.type(TEXTE, { delay: 6 });
  await eleve.waitForTimeout(1800);
  await eleve.reload();
  await eleve.waitForSelector(".parchemin__corps");
  await eleve.waitForTimeout(800);
  const apres = await eleve.locator(".parchemin__corps").innerText();
  verifier("le texte survit au rechargement", apres.includes(TEXTE), apres.slice(0, 80));

  const solde1 = await depot(eleve, `await e.chargerCommerce(); return etat.commerce.encre.solde;`);
  verifier("écrire a consommé de l'encre (réserve de départ 3000)", solde1 === 3000 - TEXTE.length, `solde ${solde1}`);

  /* =======================================================================
     2. Le deuxième cahier s'achète ; supprimer ne rend rien
     ===================================================================== */
  titre("2. Cahiers payants");
  await eleve.goto(`${RACINE}#/`);
  await eleve.waitForSelector(".droits-cahiers");
  await eleve.click('button:has-text("Nouveau cahier")');
  const modale = await eleve.waitForSelector('.voile, [role="dialog"]', { timeout: 5000 }).catch(() => null);
  const texteModale = modale ? await modale.innerText() : "";
  verifier("le 2ᵉ cahier propose l'achat avant de demander un titre", /s'achète/.test(texteModale), texteModale.slice(0, 100));
  await eleve.keyboard.press("Escape");
  await eleve.waitForTimeout(300);

  const contournement = await essayer(eleve, `return await d.cahiers.creer({ owner_id: etat.utilisateur.id, kind: "personal", class_id: null, title: "Contournement", cover: "cuir", color: "olive", icon: "book", collaborative: false });`);
  verifier("créer par la couche de données est refusé (NB001)", !contournement.ok && contournement.code === "NB001", JSON.stringify(contournement));

  await depot(eleve, `await d.cahiers.supprimer("${idPremier}");`);
  const apresSuppr = await essayer(eleve, `return await d.cahiers.creer({ owner_id: etat.utilisateur.id, kind: "personal", class_id: null, title: "Renaissance", cover: "cuir", color: "olive", icon: "book", collaborative: false });`);
  verifier("supprimer le cahier ne rend pas de cahier gratuit", !apresSuppr.ok && apresSuppr.code === "NB001", JSON.stringify(apresSuppr));

  // L'administrateur offre un droit : la création redevient possible, une seule fois.
  const eleveId = await eleve.evaluate(async () => (await import("/src/core/store.js")).etat.utilisateur.id);
  await depot(admin, `await d.boutique.donnerCahiers("${eleveId}", 1, "essai");`);
  const offert = await essayer(eleve, `return (await d.cahiers.creer({ owner_id: etat.utilisateur.id, kind: "personal", class_id: null, title: "Offert", cover: "cuir", color: "olive", icon: "book", collaborative: false })).id;`);
  verifier("un droit offert par l'administration permet un cahier", offert.ok, JSON.stringify(offert));
  const encore = await essayer(eleve, `return await d.cahiers.creer({ owner_id: etat.utilisateur.id, kind: "personal", class_id: null, title: "Trop", cover: "cuir", color: "olive", icon: "book", collaborative: false });`);
  verifier("…mais un seul", !encore.ok && encore.code === "NB001");
  const cahierOffert = offert.valeur;
  await depot(eleve, `await d.pages.creer("${cahierOffert}", { title: "Page 1", created_by: etat.utilisateur.id });`);

  /* =======================================================================
     3. L'encre épuisée : on lit, on n'écrit plus
     ===================================================================== */
  titre("3. L'encre épuisée");
  // Il ne reste que 10 d'encre.
  const soldeAvant = await depot(eleve, `await e.chargerCommerce(); return etat.commerce.encre.solde;`);
  await depot(admin, `await d.boutique.donnerEncre("${eleveId}", ${-(soldeAvant - 10)}, "essai : presque vide");`);
  await eleve.goto(`${RACINE}#/cahier/${cahierOffert}`);
  await eleve.waitForSelector(".parchemin__corps");
  await eleve.waitForTimeout(600);
  await eleve.click(".parchemin__corps");
  await eleve.keyboard.type("abcdefghijklmnopqrstuvwxyz", { delay: 8 });
  await eleve.waitForTimeout(1500);
  const saisi = (await eleve.locator(".parchemin__corps").innerText()).replace(/\s/g, "");
  verifier("la frappe s'arrête quand l'encre manque", saisi.length <= 10 && saisi.length > 0, `saisi: "${saisi}"`);
  verifier("le bandeau « plus d'encre » apparaît", await eleve.locator(".bandeau-encre:not([hidden])").isVisible());
  verifier("la page n'est plus éditable", (await eleve.locator(".parchemin__corps").getAttribute("contenteditable")) === "false");

  const refus = await essayer(eleve, `const p = (await d.pages.liste("${cahierOffert}"))[0]; return await d.pages.majorer(p.id, { body: "x".repeat(400) });`);
  verifier("la base refuse une écriture sans encre (IK001)", !refus.ok && refus.code === "IK001", JSON.stringify(refus));

  // Les anciens contenus restent lisibles : le premier texte vit toujours dans le cahier supprimé ? Non — on relit le cahier offert.
  const lisible = await essayer(eleve, `const p = await d.pages.liste("${cahierOffert}"); return p.length;`);
  verifier("les cahiers restent consultables sans encre", lisible.ok && lisible.valeur >= 1);

  const poste = await essayer(eleve, `return await d.boutique.mesCommandes(etat.utilisateur.id);`);
  verifier("la boutique reste ouverte à la lecture", poste.ok);

  // Aucune fuite gratuite : ni pense-bête ni tracé.
  const penseBete = await essayer(eleve, `const p = (await d.pages.liste("${cahierOffert}"))[0]; return await d.penseBetes.creer({ page_id: p.id, author_id: etat.utilisateur.id, body: "x".repeat(300), color: "jaune", x: 10, y: 10, z: 1 });`);
  verifier("un pense-bête sans encre est refusé", !penseBete.ok && penseBete.code === "IK001", JSON.stringify(penseBete));

  /* =======================================================================
     4. La recharge : le paiement se fait EN JEU, le PDG livre
     ===================================================================== */
  titre("4. Commande par missive");
  const encre = await depot(admin, `return await d.boutique.enregistrerProduit({ sku: "cartouche-s", kind: "ink_cartridge", label: "Petite cartouche", price_cents: 50, ink_units: 5000, active: true });`);
  const livre = await depot(admin, `return await d.boutique.enregistrerProduit({ sku: "cahier-plus", kind: "notebook", label: "Cahier supplémentaire", price_cents: 100, notebook_credits: 1, active: true });`);

  const tentative = await essayer(eleve, `return await d.boutique.donnerEncre("${eleveId}", 5000, "je me sers");`);
  verifier("un élève ne peut pas se créditer lui-même", !tentative.ok && tentative.code === "42501", JSON.stringify(tentative));

  const soldeAvantCommande = await depot(eleve, `await e.chargerCommerce(); return etat.commerce.encre.solde;`);
  const missive = await essayer(eleve, `return await d.boutique.commander("cartouche-s", "Mon pseudo : Eleve, devant la fontaine");`);
  verifier("l'élève envoie une missive de commande", missive.ok && missive.valeur.status === "pending", JSON.stringify(missive));
  verifier("…au prix de la base, avec sa copie figée", missive.ok && missive.valeur.unit_price_cents === 50 && missive.valeur.ink_units === 5000);
  const soldeApres = await depot(eleve, `await e.chargerCommerce(); return etat.commerce.encre.solde;`);
  verifier("envoyer la missive ne crédite RIEN", soldeApres === soldeAvantCommande, `${soldeAvantCommande} -> ${soldeApres}`);

  const doublon = await essayer(eleve, `return await d.boutique.commander("cartouche-s");`);
  verifier("une seule missive en attente par article", !doublon.ok && doublon.code === "PA003", JSON.stringify(doublon));
  const seLivrer = await essayer(eleve, `return await d.boutique.livrerCommande("${missive.valeur?.id}");`);
  verifier("l'élève ne peut pas se livrer lui-même", !seLivrer.ok && seLivrer.code === "42501", JSON.stringify(seLivrer));

  await depot(admin, `await d.boutique.livrerCommande("${missive.valeur.id}");`);
  const soldeLivre = await depot(eleve, `await e.chargerCommerce(); return etat.commerce.encre.solde;`);
  verifier("la livraison par le PDG crédite l'encre commandée", soldeLivre === soldeAvantCommande + 5000, `${soldeAvantCommande} -> ${soldeLivre}`);
  await depot(admin, `await d.boutique.livrerCommande("${missive.valeur.id}");`);
  const soldeDeux = await depot(eleve, `await e.chargerCommerce(); return etat.commerce.encre.solde;`);
  verifier("livrer deux fois ne crédite pas deux fois", soldeDeux === soldeLivre, `${soldeLivre} -> ${soldeDeux}`);

  // Un cahier se commande aussi.
  const mCahier = await essayer(eleve, `return await d.boutique.commander("cahier-plus");`);
  const avantLivraison = await essayer(eleve, `return await d.cahiers.creer({ owner_id: etat.utilisateur.id, kind: "personal", class_id: null, title: "Commandé", cover: "cuir", color: "olive", icon: "book", collaborative: false });`);
  verifier("un cahier non livré ne se crée pas", !avantLivraison.ok && avantLivraison.code === "NB001");
  await depot(admin, `await d.boutique.livrerCommande("${mCahier.valeur.id}");`);
  const cahierCommande = await essayer(eleve, `return (await d.cahiers.creer({ owner_id: etat.utilisateur.id, kind: "personal", class_id: null, title: "Commandé", cover: "cuir", color: "olive", icon: "book", collaborative: false })).id;`);
  verifier("…et se crée une fois livré", cahierCommande.ok, JSON.stringify(cahierCommande));

  // Retirer ou refuser une missive.
  const m2 = await essayer(eleve, `return await d.boutique.commander("cartouche-s");`);
  await depot(eleve, `await d.boutique.annulerCommande("${m2.valeur.id}");`);
  const m3 = await essayer(eleve, `return await d.boutique.commander("cartouche-s");`);
  await depot(admin, `await d.boutique.refuserCommande("${m3.valeur.id}", "paiement non reçu");`);
  const etats = await depot(eleve, `return (await d.boutique.mesCommandes(etat.utilisateur.id)).map((c) => c.status + ":" + (c.decision_note || ""));`);
  verifier("la missive retirée et la missive refusée sont annulées", etats.filter((x) => x.startsWith("canceled")).length === 2, etats.join(" | "));
  verifier("le motif du refus est conservé pour l'élève", etats.some((x) => x.includes("paiement non reçu")));

  titre("4 bis. La recharge rouvre l'écriture");
  await depot(admin, `await d.boutique.donnerEncre("${eleveId}", ${-(soldeLivre - 10)}, "retour à presque vide");`);
  await eleve.goto(`${RACINE}#/cahier/${cahierOffert}`);
  await eleve.waitForSelector(".parchemin__corps");
  await eleve.waitForTimeout(600);
  await eleve.click(".parchemin__corps");
  await eleve.keyboard.type("abcdefghijklmnopqrstuvwxyz", { delay: 8 });
  await eleve.waitForTimeout(1200);
  verifier("encre à nouveau épuisée : la page se verrouille", (await eleve.locator(".parchemin__corps").getAttribute("contenteditable")) === "false");
  await depot(admin, `await d.boutique.donnerEncre("${eleveId}", 3000, "recharge d'essai");`);
  await eleve.waitForTimeout(1500);
  verifier("recharger rouvre l'écriture sans quitter la page",
    (await eleve.locator(".parchemin__corps").getAttribute("contenteditable")) === "true");
  await eleve.click(".parchemin__corps");
  await eleve.keyboard.type(" Suite.", { delay: 8 });
  await eleve.waitForTimeout(1500);
  verifier("…et le texte s'enregistre à nouveau", (await eleve.locator(".parchemin__corps").innerText()).includes("Suite."));

  /* =======================================================================
     4 ter. La limite de pages, réglée par le PDG
     ===================================================================== */
  titre("4 ter. Limite de pages");
  await depot(admin, `await d.boutique.regler("max_pages", 3);`);
  const limite = await essayer(eleve, `const c = "${cahierCommande.valeur}"; await d.pages.creer(c, { title: "Page 1", created_by: etat.utilisateur.id }); await d.pages.creer(c, { title: "Page 2", created_by: etat.utilisateur.id }); await d.pages.creer(c, { title: "Page 3", created_by: etat.utilisateur.id }); return await d.pages.creer(c, { title: "Page 4", created_by: etat.utilisateur.id });`);
  verifier("la 4ᵉ page d'un cahier limité à 3 est refusée (PG001)", !limite.ok && limite.code === "PG001", JSON.stringify(limite));
  await eleve.goto(`${RACINE}#/cahier/${cahierCommande.valeur}`);
  await eleve.waitForSelector(".tranche__pied", { timeout: 6000 });
  await eleve.waitForTimeout(500);
  const pied = eleve.locator(".tranche__pied button");
  verifier("l'interface affiche « Cahier plein » et bloque l'ajout", (await pied.isDisabled()) && /plein/i.test(await pied.innerText()));
  await depot(admin, `await d.boutique.regler("max_pages", 0);`);
  const sansLimite = await essayer(eleve, `return (await d.pages.creer("${cahierCommande.valeur}", { title: "Page 4", created_by: etat.utilisateur.id })).id;`);
  verifier("limite à 0 : plus de plafond", sansLimite.ok, JSON.stringify(sansLimite));
  await depot(admin, `await d.boutique.regler("max_pages", 10);`);
  const reglageRefuse = await essayer(eleve, `return await d.boutique.regler("max_pages", 9999);`);
  verifier("un élève ne règle pas la limite", !reglageRefuse.ok && reglageRefuse.code === "42501");

  /* =======================================================================
     5. Les prix : modifiables, tracés, jamais rétroactifs
     ===================================================================== */
  titre("5. Prix");
  const produit = { id: encre.id };
  await depot(admin, `await d.boutique.enregistrerProduit({ id: "${produit.id}", price_cents: 70 });`);
  await depot(admin, `await d.boutique.enregistrerProduit({ id: "${produit.id}", ink_units: 8000 });`);
  const histo = await depot(admin, `return (await d.boutique.historiquePrix()).filter((h) => h.product_sku === "cartouche-s");`);
  verifier("chaque changement est inscrit (création + 2 modifications)", histo.length === 3, `${histo.length}`);
  verifier("l'historique garde l'ancien et le nouveau prix", histo.some((h) => h.old_price_cents === 50 && h.new_price_cents === 70));
  verifier("…et l'administrateur responsable", histo.every((h) => h.changed_by));

  // Un achat déjà fait garde son prix : fixture directe dans le stockage du pilote local.
  await admin.evaluate((p) => {
    const cle = "ojm.local.purchases";
    const l = JSON.parse(localStorage.getItem(cle) || "[]");
    l.push({ id: "achat-essai", user_id: p.u, product_id: p.id, product_sku: "cartouche-s", product_label: "Petite cartouche", kind: "ink_cartridge", unit_price_cents: 50, currency: "RBX", ink_units: 5000, notebook_credits: 0, status: "paid", created_at: new Date().toISOString() });
    localStorage.setItem(cle, JSON.stringify(l));
  }, { u: eleveId, id: produit.id });
  await depot(admin, `await d.boutique.enregistrerProduit({ id: "${produit.id}", price_cents: 120 });`);
  const achats = await depot(admin, `return await d.boutique.commandes();`);
  verifier("changer un prix ne modifie pas une commande déjà passée", achats.find((a) => a.id === "achat-essai")?.unit_price_cents === 50);

  const interdit = await essayer(eleve, `return await d.boutique.enregistrerProduit({ sku: "gratuit", kind: "ink_cartridge", label: "Pirate", price_cents: 1, ink_units: 999999, active: true });`);
  verifier("un élève ne peut pas créer ni régler un produit", !interdit.ok && interdit.code === "42501", JSON.stringify(interdit));
  const prixNul = await essayer(admin, `return await d.boutique.enregistrerProduit({ sku: "zero", kind: "ink_cartridge", label: "Gratuit", price_cents: 0, ink_units: 10, active: true });`);
  verifier("un produit à prix nul est refusé", !prixNul.ok);

  await admin.goto(`${RACINE}#/administration`);
  await admin.waitForSelector(".onglet:has-text(\"Boutique\")", { timeout: 8000 });
  await admin.click('.onglet:text-is("Articles")');
  verifier("l'espace d'administration propose la Boutique", true);
  await admin.waitForTimeout(800);
  const texteAdmin = await admin.locator(".page").innerText();
  verifier("la liste des produits s'affiche avec le prix actuel", /Petite cartouche/.test(texteAdmin) && /120/.test(texteAdmin), texteAdmin.slice(0, 120));
  await admin.click('.onglet:text-is("Comptes")');
  await admin.waitForTimeout(600);
  const comptes = await admin.locator(".page").innerText();
  verifier("l'administrateur voit soldes d'encre et nombre de cahiers", /encre :/.test(comptes) && /cahiers :/.test(comptes));

  /* =======================================================================
     6. La boutique côté élève : la missive, avec son pigeon
     ===================================================================== */
  titre("6. Boutique élève et livraison par l'interface");
  await eleve.goto(`${RACINE}#/boutique`);
  await eleve.waitForSelector(".produit", { timeout: 6000 });
  verifier("le logo du pigeon voyageur est affiché", (await eleve.locator(".missive-mode .logo-pigeon").count()) === 1);
  const consignes = await eleve.locator(".missive-mode").innerText();
  verifier("la page dit de payer en jeu et d'être à proximité", /en jeu/i.test(consignes) && /proximité/i.test(consignes), consignes.slice(0, 160));
  verifier("…et que le site ne prend aucun paiement", /aucun paiement/i.test(consignes));
  const boutonMissive = eleve.locator(".produit button", { hasText: "Envoyer une missive" }).first();
  verifier("le bouton « Envoyer une missive » est actif", await boutonMissive.isEnabled());
  await boutonMissive.click();
  await eleve.fill('textarea[name="message"]', "Pseudo : Eleve, près du puits");
  await eleve.click('[role="dialog"] button:has-text("Envoyer la missive")');
  await eleve.waitForSelector(".liste-achats li", { timeout: 5000 });
  verifier("la missive apparaît « En route » dans Mes missives", /En route/.test(await eleve.locator(".liste-achats").innerText()));

  await admin.goto(`${RACINE}#/administration`);
  await admin.waitForSelector('.onglet:has-text("Commandes")', { timeout: 8000 });
  await admin.click('.onglet:has-text("Commandes")');
  await admin.waitForTimeout(900);
  const commandesTexte = await admin.locator(".page").innerText();
  verifier("le PDG voit la missive avec le mot de l'élève", /à livrer \(1\)/i.test(commandesTexte) && /près du puits/.test(commandesTexte), commandesTexte.slice(0, 600));
  const soldeUi0 = await depot(eleve, `await e.chargerCommerce(); return etat.commerce.encre.solde;`);
  await admin.click('button:has-text("Livrer — payé en jeu")');
  await admin.click('[role="dialog"] button:text-is("Livrer")');
  await admin.waitForTimeout(1200);
  const soldeUi1 = await depot(eleve, `await e.chargerCommerce(); return etat.commerce.encre.solde;`);
  verifier("« Livrer » dans l'interface crédite l'encre commandée", soldeUi1 === soldeUi0 + 8000, `${soldeUi0} -> ${soldeUi1}`);
  await depot(admin, `await d.boutique.regler("orders_open", false);`);
  const fermees = await essayer(eleve, `return await d.boutique.commander("cahier-plus");`);
  verifier("commandes fermées : aucune missive ne part (PA001)", !fermees.ok && fermees.code === "PA001", JSON.stringify(fermees));
  await depot(admin, `await d.boutique.regler("orders_open", true);`);

  /* =======================================================================
     7. Le mode flottant : le cahier dans sa fenêtre
     ===================================================================== */
  titre("7. Mode flottant");
  await eleve.goto(`${RACINE}#/cahier/${cahierOffert}`);
  await eleve.waitForSelector(".parchemin__corps");
  const [popup] = await Promise.all([
    eleve.waitForEvent("popup", { timeout: 6000 }).catch(() => null),
    eleve.click('.contexte__bouton--flottant')
  ]);
  if (!popup) verifier("la fenêtre flottante s'ouvre", false, "aucune fenêtre");
  else {
    await popup.waitForTimeout(1200);
    verifier("la fenêtre flottante s'ouvre", true);
    for (const [w, h] of [[553, 660], [460, 760], [380, 520]]) {
      await popup.setViewportSize({ width: w, height: h });
      await popup.waitForTimeout(500);
      const mesure = await popup.evaluate(() => ({
        barre: document.querySelector(".contexte").getBoundingClientRect().toJSON(),
        cahier: document.querySelector(".cahier").getBoundingClientRect().toJSON(),
        largeur: innerWidth
      }));
      verifier(`flottant ${w}×${h} : la barre reste en haut`, mesure.barre.top < 40, JSON.stringify(mesure.barre));
      verifier(`flottant ${w}×${h} : le cahier occupe la largeur`, mesure.cahier.width > mesure.largeur * 0.9, `cahier ${Math.round(mesure.cahier.width)} / fenêtre ${mesure.largeur}`);
      verifier(`flottant ${w}×${h} : la navigation entre pages reste accessible`, (await popup.locator(".tranche__pages .onglet-page").count()) >= 1);
    }
    await popup.setViewportSize({ width: 460, height: 760 });
    verifier("le cahier y est, avec son texte", (await popup.locator(".parchemin__corps").innerText()).includes("Suite."));
    const ongletsFlottant = await popup.evaluate(() => [...document.querySelectorAll(".nav-lien")].map((a) => a.title));
    verifier("à côté du jeu, un seul onglet : la manette (et le retour)",
      ongletsFlottant.filter((t) => t !== "Retour").join() === "Manette", JSON.stringify(ongletsFlottant));
    await popup.click(".parchemin__corps");
    await popup.keyboard.type(" Notée à côté du jeu.", { delay: 8 });
    await popup.waitForTimeout(1500);
    await popup.click('.nav-lien[title="Manette"]');
    await popup.waitForSelector(".manette", { timeout: 5000 }).catch(() => null);
    const gestes = await popup.locator(".manette__mot").allInnerTexts();
    verifier("la manette : Cahier, Mes affaires, Papier, Donner, Recevoir, Suivre, Rejoindre",
      gestes.join(",") === "Cahier,Mes affaires,Papier,Donner,Recevoir,Suivre,Rejoindre", gestes.join(","));
    const boutonsVisibles = await popup.evaluate(() => [...document.querySelectorAll(".manette__bouton")]
      .every((b) => { const r = b.getBoundingClientRect(); return r.height >= 100 && r.right <= innerWidth + 1; }));
    verifier("ses boutons sont gros et tiennent dans la fenêtre étroite", boutonsVisibles);
    await popup.click('.manette__bouton:has-text("Cahier")');
    await popup.waitForSelector(".parchemin__corps", { timeout: 8000 }).catch(() => null);
    verifier("« Cahier » rouvre le dernier cahier", (await popup.locator(".parchemin__corps").count()) === 1);
    await popup.click('.nav-lien[title="Retour"]');
    await popup.waitForSelector(".manette", { timeout: 5000 }).catch(() => null);
    verifier("« Retour » ramène à la manette, dans la fenêtre flottante", (await popup.locator(".manette").count()) === 1);
    await popup.click('.manette__bouton:has-text("Cahier")');
    await popup.waitForSelector(".parchemin__corps", { timeout: 8000 }).catch(() => null);
    await popup.close();
    await eleve.waitForTimeout(800);
    await eleve.reload();
    await eleve.waitForSelector(".parchemin__corps");
    await eleve.waitForTimeout(700);
    verifier("ce qu'on y note se retrouve dans le cahier", (await eleve.locator(".parchemin__corps").innerText()).includes("Notée à côté du jeu."));
  }

  /* =======================================================================
     8. La séance : tableau et cahier côte à côte
     ===================================================================== */
  titre("8. La séance");
  const classe = await depot(admin, `
    return await d.classes.creerAvecCahier({ name: "Histoire 3e", description: null, subject: "Histoire", level: "3e",
      color: "olive", icon: "balance", owner_id: etat.utilisateur.id, locked: false, join_open: true,
      require_approval: false, archived: false, settings: {} }, etat.utilisateur.id);`).catch((e) => { journal.push("  (création de classe : " + e.message + ")"); return null; });
  if (!classe) verifier("la classe se crée", false);
  else {
    const entree = await essayer(eleve, `return await d.classes.rejoindre("${classe.code}");`);
    verifier("l'élève rejoint la classe avec le code", entree.ok, JSON.stringify(entree));
    await depot(admin, `await d.sessions.demarrer("${classe.id}", "Séance d'essai");`);
    await admin.goto(`${RACINE}#/classe/${classe.id}/salle`);
    await admin.waitForSelector(".salle", { timeout: 8000 });
    await eleve.goto(`${RACINE}#/classe/${classe.id}/salle`);
    await eleve.waitForSelector(".salle", { timeout: 8000 });
    verifier("la salle s'ouvre pour le professeur et l'élève", true);
    verifier("le tableau est là", (await eleve.locator("canvas.tableau__toile").count()) === 1);
    verifier("le cahier de l'élève est à côté", (await eleve.locator(".salle__panneau .parchemin__corps").count()) === 1);
    verifier("aucun élément d'objet ou de bureau", (await eleve.locator("[class*=bureau], [class*=cartable], [class*=sac]").count()) === 0);
    await admin.waitForTimeout(600);
    verifier("le professeur a les outils de tableau", (await admin.locator(".tableau__barre .outil").count()) >= 5);
    verifier("l'élève est en lecture seule sur le tableau", (await eleve.locator(".tableau__barre .outil").count()) === 0);
  }

  /* =======================================================================
     9. Chaque écran s'ouvre sans erreur
     ===================================================================== */
  titre("9. Les écrans");
  for (const route of ["/", "/documents", "/boutique", "/classes", "/exercices", "/archives", "/recherche", "/profil", "/reglages", "/cahiers", "/affaires"]) {
    await eleve.goto(`${RACINE}#${route}`);
    await eleve.waitForTimeout(500);
    const vide = await eleve.locator(".vue").innerText();
    verifier(`${route} s'affiche`, vide.trim().length > 20 && !/n'a pas pu s'afficher/.test(vide), vide.slice(0, 60));
  }
  for (const route of ["/professeur", "/modeles", "/administration"]) {
    await admin.goto(`${RACINE}#${route}`);
    await admin.waitForTimeout(500);
    const vide = await admin.locator(".vue").innerText();
    verifier(`${route} s'affiche (administrateur)`, vide.trim().length > 20 && !/n'a pas pu s'afficher/.test(vide), vide.slice(0, 60));
  }
  /* =======================================================================
     10. Les rôles : PDG, super administrateurs
     ===================================================================== */
  titre("10. Rôles");
  const adminId = await admin.evaluate(async () => (await import("/src/core/store.js")).etat.utilisateur.id);
  const roleAdmin = await depot(admin, `return (await d.profils.lire(etat.utilisateur.id)).role_key;`);
  verifier("le fondateur du site a le rôle PDG", roleAdmin === "pdg", roleAdmin);
  await depot(admin, `await d.profils.nommer("${eleveId}", "super_admin");`);
  await eleve.reload(); await eleve.waitForSelector(".contexte"); await eleve.waitForTimeout(500);
  const contreLePDG = await essayer(eleve, `return await d.profils.nommer("${adminId}", "student");`);
  verifier("un super administrateur ne peut pas destituer le PDG", !contreLePDG.ok && contreLePDG.code === "42501", JSON.stringify(contreLePDG));
  const seFaireUnPDG = await essayer(eleve, `return await d.profils.nommer("${eleveId}", "pdg");`);
  verifier("…ni se nommer PDG soi-même", !seFaireUnPDG.ok && seFaireUnPDG.code === "42501", JSON.stringify(seFaireUnPDG));
  const nommer = await essayer(eleve, `const x = await d.profils.tous(); const cible = x.find((p) => p.role_key === "student"); if (!cible) return "personne"; return await d.profils.nommer(cible.id, "super_admin");`);
  verifier("un super administrateur ne nomme pas ses pairs", nommer.valeur === "personne" || !nommer.ok, JSON.stringify(nommer));
  const boutiqueSA = await essayer(eleve, `return await d.boutique.regler("max_pages", 12);`);
  verifier("les super administrateurs règlent la boutique avec le PDG", boutiqueSA.ok, JSON.stringify(boutiqueSA));
  await depot(admin, `await d.boutique.regler("max_pages", 10);`);
  await depot(admin, `await d.profils.nommer("${eleveId}", "student");`);
  verifier("le PDG rend son rôle à l'élève", (await depot(admin, `return (await d.profils.lire("${eleveId}")).role_key;`)) === "student");

  /* =======================================================================
     11. Simplicité : menu court, plus d'animations décoratives
     ===================================================================== */
  titre("11. Simplicité");
  await eleve.goto(`${RACINE}#/documents`); await eleve.waitForTimeout(800);
  await eleve.goto(`${RACINE}#/`); await eleve.reload(); await eleve.waitForTimeout(1500);   // l'élève vient de redevenir élève (étape 10)
  verifier("aucun dessin de cahier sur l'accueil", (await eleve.locator(".cahier-illu, .logo-cahier").count()) === 0);
  await eleve.click('[aria-label="Tout le reste"]'); await eleve.waitForTimeout(400);
  const entrees = await eleve.locator(".tiroir .rail__lien").allInnerTexts();
  verifier("le menu d'un élève tient en 4 entrées", entrees.length === 4, entrees.join(" | "));
  verifier("le menu ne répète pas les onglets du haut",
    !entrees.some((t) => /Mes cahiers|^Documents$|Mes classes|Archives|Rechercher/.test(t.trim())), entrees.join(" | "));
  verifier("plus d'interrupteur d'animations", (await eleve.locator('.tiroir [role="switch"]').count()) === 0);
  await eleve.keyboard.press("Escape");

  /* =======================================================================
     12. Transferts : un objet, un seul détenteur
     ===================================================================== */
  titre("12. Transferts");
  const trouve = await depot(eleve, `return (await d.profils.chercher("ÁDMÎN")).map((p) => p.id);`);
  verifier("chercher un pseudo : partiel, sans majuscules ni accents", trouve.includes(adminId), JSON.stringify(trouve));
  const papier = await depot(eleve, `return await d.papiers.creer({ author_id: etat.utilisateur.id, title: "Lettre", body: "Bonjour" });`);
  const tendre = (type, id, titre) => essayer(eleve,
    `return await d.transferts.tendre("${type}", { objetId: "${id}", titre: "${titre}", deId: etat.utilisateur.id, versId: "${adminId}" });`);
  verifier("tendre un papier", (await tendre("papier", papier.id, "Lettre")).ok);
  verifier("un papier tendu ne se tend pas une seconde fois", !(await tendre("papier", papier.id, "Lettre")).ok);
  verifier("un papier tendu ne s'écrit plus",
    !(await essayer(eleve, `return await d.papiers.majorer("${papier.id}", { body: "triche" });`)).ok);
  const recusAdmin = await depot(admin, `return (await d.transferts.enAttente(etat.utilisateur.id)).recus.map((r) => r.titre);`);
  verifier("le destinataire le voit, avec son titre", recusAdmin.includes("Lettre"), JSON.stringify(recusAdmin));
  await depot(eleve, `const { tendus } = await d.transferts.enAttente(etat.utilisateur.id); await d.transferts.reprendre(tendus[0]);`);
  verifier("repris, il redevient modifiable",
    (await essayer(eleve, `return await d.papiers.majorer("${papier.id}", { body: "Bonjour, ami" });`)).ok);
  verifier("on peut le tendre de nouveau", (await tendre("papier", papier.id, "Lettre")).ok);
  await admin.goto(`${RACINE}#/`); await admin.waitForSelector(".remises:not([hidden])", { timeout: 6000 }).catch(() => null);
  const texteRemises = await admin.locator(".remises").allInnerTexts();
  verifier("l'accueil du destinataire affiche « On vous donne »", texteRemises.join("|").toLowerCase().includes("on vous donne"), JSON.stringify(texteRemises));
  await admin.click('.remise:has-text("Lettre") button:has-text("Accepter")');
  await admin.waitForTimeout(800);
  const detenteurs = await depot(eleve, `return [(await d.papiers.enMain(etat.utilisateur.id)).some((p) => p.id === "${papier.id}")];`);
  const chezAdmin = await depot(admin, `return (await d.papiers.enMain(etat.utilisateur.id)).some((p) => p.id === "${papier.id}");`);
  verifier("accepté : un seul détenteur, le destinataire", chezAdmin && !detenteurs[0]);
  verifier("le papier reçu s'affiche sur son accueil", (await admin.locator(`a.carte-papier[href="#/papier/${papier.id}"]`).count()) === 1);

  const cahierEleve = await depot(eleve, `return (await d.cahiers.mesCahiers(etat.utilisateur.id))[0];`);
  const nbPages = await depot(eleve, `return (await d.pages.liste("${cahierEleve.id}")).length;`);
  verifier("tendre un cahier", (await tendre("cahier", cahierEleve.id, cahierEleve.title)).ok);
  verifier("un cahier tendu ne s'écrit plus",
    !(await essayer(eleve, `return await d.pages.creer("${cahierEleve.id}", { title: "triche" });`)).ok);
  await depot(admin, `const { recus } = await d.transferts.enAttente(etat.utilisateur.id); await d.transferts.refuser(recus.find((r) => r.type === "cahier"));`);
  verifier("refusé, il reste à l'expéditeur",
    (await depot(eleve, `return (await d.cahiers.lire("${cahierEleve.id}")).owner_id;`)) === eleveId);
  await tendre("cahier", cahierEleve.id, cahierEleve.title);
  const accepte = await essayer(admin, `const { recus } = await d.transferts.enAttente(etat.utilisateur.id); return await d.transferts.accepter(recus.find((r) => r.type === "cahier"));`);
  verifier("le destinataire accepte le cahier", accepte.ok, JSON.stringify(accepte));
  verifier("donné : il appartient au destinataire, avec toutes ses pages",
    (await depot(admin, `return [(await d.cahiers.lire("${cahierEleve.id}")).owner_id, (await d.pages.liste("${cahierEleve.id}")).length];`)).join() === [adminId, nbPages].join());
  const redonne = await essayer(admin,
    `return await d.transferts.tendre("cahier", { objetId: "${cahierEleve.id}", titre: "x", deId: etat.utilisateur.id, versId: "${eleveId}" });`);
  verifier("un cahier reçu peut être redonné", redonne.ok, JSON.stringify(redonne));
  await depot(admin, `const { tendus } = await d.transferts.enAttente(etat.utilisateur.id); await d.transferts.reprendre(tendus[0]);`);
  verifier("repris par l'expéditeur, le destinataire ne peut plus l'accepter", !(await essayer(eleve,
    `return await d.transferts.accepter({ type: "cahier", id: "${redonne.valeur?.id}" });`)).ok);
  const notifRemise = await depot(admin, `return (await d.notifications.liste(etat.utilisateur.id)).filter((n) => n.kind === "remise").length;`);
  verifier("chaque remise prévient le destinataire (notification)", notifRemise >= 1, String(notifRemise));

  /* =======================================================================
     13. Signatures, nom RP, présence
     ===================================================================== */
  titre("13. Signatures et nom RP");
  const lettre = await depot(eleve, `return await d.papiers.creer({ author_id: etat.utilisateur.id, title: "Contrat", body: "Je m'engage." });`);
  await eleve.goto(`${RACINE}#/papier/${lettre.id}`);
  await eleve.waitForSelector(".papier__corps", { timeout: 8000 });
  await eleve.click('.papier__gestes button:has-text("Signer")');
  await eleve.waitForSelector("canvas.signature__toile", { timeout: 5000 });
  const toile = await eleve.locator("canvas.signature__toile").boundingBox();
  await eleve.mouse.move(toile.x + 30, toile.y + toile.height * 0.6);
  await eleve.mouse.down();
  for (let i = 1; i <= 12; i++) await eleve.mouse.move(toile.x + 30 + i * 18, toile.y + toile.height * (0.6 - 0.3 * Math.sin(i / 2)));
  await eleve.mouse.up();
  await eleve.click('[role="dialog"] button:text-is("Valider")');
  await eleve.waitForSelector('[role="dialog"] button:text-is("Signer")', { timeout: 5000 });
  await eleve.click('[role="dialog"] button:text-is("Signer")');
  await eleve.waitForSelector(".papier__signature svg path", { timeout: 8000 }).catch(() => null);
  verifier("signature dessinée à la souris, apposée sur le papier", (await eleve.locator(".papier__signature svg path").count()) >= 1);
  const legende = await eleve.locator(".papier__signature figcaption").first().innerText().catch(() => "");
  verifier("la signature porte le nom RP et la date", legende.startsWith(`Eleve${sfx}, le `), legende);
  verifier("signé, le texte est figé à l'écran", await eleve.locator("textarea.papier__corps").evaluate((t) => t.readOnly));
  verifier("signé, la base refuse de modifier le texte",
    !(await essayer(eleve, `return await d.papiers.majorer("${lettre.id}", { body: "autre chose" });`)).ok);
  verifier("la signature est enregistrée pour la prochaine fois",
    (await depot(eleve, `return (await d.profils.lire(etat.utilisateur.id)).preferences?.signature?.kind;`)) === "trace");
  verifier("une signature écrite au clavier s'appose aussi",
    (await essayer(eleve, `return await d.signatures.apposer("${lettre.id}", { kind: "texte", data: { texte: "E. Test", police: "ronde" } });`)).ok);
  verifier("seul celui qui a le papier en main peut le signer",
    !(await essayer(admin, `return await d.signatures.apposer("${lettre.id}", { kind: "texte", data: { texte: "intrus", police: "plume" } });`)).ok);
  const nomForce = await essayer(eleve, `const s = await d.pilote.table("paper_signatures").creer({ paper_id: "${lettre.id}", kind: "texte", data: { texte: "x" }, nom_rp: "Faux Nom" }); return s.nom_rp;`);
  verifier("on ne peut pas signer sous un autre nom", !nomForce.ok || nomForce.valeur === `Eleve${sfx}`, JSON.stringify(nomForce));

  // Changer de nom RP : libre, sans demande ; l'histoire ne se réécrit pas.
  const change = await essayer(eleve, `return await d.profils.choisirNomRP("Élise Morand ${sfx}");`);
  verifier("changer son nom RP sans passer par l'administration", change.ok, JSON.stringify(change));
  const signataires = await depot(eleve, `return (await d.signatures.dePapier("${lettre.id}")).map((s) => s.nom_rp);`);
  verifier("les signatures gardent le nom d'alors", signataires.every((n) => n === `Eleve${sfx}`), JSON.stringify(signataires));
  verifier("on ne prend pas le nom d'un autre joueur",
    !(await essayer(eleve, `return await d.profils.choisirNomRP("Admin${sfx}");`)).ok);

  // Personnage mort : l'écran du nom RP revient, et le nom mort est interdit.
  await depot(admin, `await d.profils.personnageMort("${eleveId}");`);
  await eleve.goto(`${RACINE}#/`); await eleve.reload();
  await eleve.waitForSelector('input[name="nom_rp"]', { timeout: 8000 }).catch(() => null);
  verifier("sans nom RP, on est ramené à l'écran du personnage", (await eleve.locator('input[name="nom_rp"]').count()) === 1);
  await eleve.goto(`${RACINE}#/documents`); await eleve.waitForTimeout(600);
  verifier("…et on ne peut pas le contourner", (await eleve.locator('input[name="nom_rp"]').count()) === 1);
  verifier("le nom d'un personnage mort ne revient pas",
    !(await essayer(eleve, `return await d.profils.choisirNomRP("Élise Morand ${sfx}");`)).ok);
  await eleve.fill('input[name="nom_rp"]', `Eleve${sfx}`);
  await eleve.click('button[type="submit"]:has-text("C\'est mon personnage")');
  await eleve.waitForFunction(() => location.hash === "#/", null, { timeout: 8000 }).catch(() => null);
  verifier("un nouveau nom, et on retrouve ses affaires", (await eleve.locator('input[name="nom_rp"]').count()) === 0);

  // Présence : déclarer que le joueur n'est pas là bloque la remise.
  const billet = await depot(eleve, `return await d.papiers.creer({ author_id: etat.utilisateur.id, title: "Billet", body: "Salut" });`);
  await eleve.goto(`${RACINE}#/papier/${billet.id}`);
  await eleve.waitForSelector(".papier__corps", { timeout: 8000 });
  await eleve.click('.papier__gestes button:has-text("Donner")');
  await eleve.fill('[role="dialog"] input[type="search"]', `Admin${sfx}`.slice(0, 5));
  await eleve.waitForSelector('[role="dialog"] .destinataire', { timeout: 5000 });
  await eleve.click('[role="dialog"] .destinataire');
  await eleve.click('[role="dialog"] button:text-is("Continuer")');
  await eleve.waitForSelector('[role="dialog"] button:has-text("Non, il n\'est pas devant moi.")', { timeout: 5000 });
  verifier("la question de présence est posée mot pour mot",
    (await eleve.locator('[role="dialog"]').innerText()).includes("Le joueur à qui vous souhaitez donner cet objet se trouve-t-il actuellement devant vous dans Roblox ?"));
  await eleve.click('[role="dialog"] button:has-text("Non, il n\'est pas devant moi.")');
  await eleve.waitForTimeout(300);
  verifier("« non » : le message sur le metagaming s'affiche",
    (await eleve.locator('[role="dialog"]').innerText()).includes("considérée comme du metagaming"));
  await eleve.click('[role="dialog"] button:text-is("Compris")');
  await eleve.waitForTimeout(400);
  verifier("« non » : rien n'est tendu",
    !(await depot(eleve, `return (await d.transferts.enAttente(etat.utilisateur.id)).tendus.some((r) => r.objetId === "${billet.id}");`)));

} catch (err) {
  echoues++;
  journal.push(`\n  EXCEPTION ${err.stack || err}`);
}

verifier("aucune erreur JavaScript pendant tout le parcours", erreursPage.length === 0, erreursPage.slice(0, 4).join(" | "));
console.log(journal.join("\n"));
console.log(`\n${reussis} réussis, ${echoues} échoués`);
await nav.close();
process.exit(echoues ? 1 : 0);
