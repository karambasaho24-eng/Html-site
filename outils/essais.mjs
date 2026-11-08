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
  await page.waitForSelector(".contexte", { timeout: 15000 });
  // Première visite : on habille son personnage, puis on choisit ses cahiers.
  // Les essais de la boutique créent leurs cahiers eux-mêmes : on referme.
  const habiller = await page.waitForSelector(".apparence", { timeout: 15000 }).then(() => true).catch(() => false);
  // On referme l'habillage, puis « Et vos cahiers ? » qui le suit.
  await page.keyboard.press("Escape");
  if (await page.waitForSelector(".mes-cahiers", { timeout: 6000 }).then(() => true).catch(() => false))
    await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  return habiller;
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

  const habille = await creerCompte(eleve, `Eleve${sfx}`);
  verifier("à l'inscription, on habille son personnage", habille);
  verifier("l'accueil est « Chez moi »", (await eleve.locator(".nav-lien[aria-current=page]").textContent()).includes("Chez moi"));
  verifier("la jauge d'encre est visible", await eleve.locator(".jauge-encre").isVisible());
  verifier("quatre onglets : chez moi, cahiers, documents, classes", (await eleve.locator(".nav-lien").count()) === 4);

  /* =======================================================================
     1. Le premier cahier est gratuit, et il garde ce qu'on y écrit
     ===================================================================== */
  titre("1. Le premier cahier");
  await eleve.goto(`${RACINE}#/cahiers`);
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
  await eleve.goto(`${RACINE}#/cahiers`);
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
    verifier("seuls Cahiers et Documents sont proposés", (await popup.locator(".nav-lien").count()) === 2);
    await popup.click(".parchemin__corps");
    await popup.keyboard.type(" Notée à côté du jeu.", { delay: 8 });
    await popup.waitForTimeout(1500);
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
    await eleve.waitForSelector(".scene--3d", { timeout: 15000 }).catch(() => null);
    verifier("la salle est en 3D", (await eleve.locator(".scene--3d").count()) >= 1);
    verifier("les affaires sont de retour : bureau ou sac à portée", (await eleve.locator("[class*=bureau], [class*=sac]").count()) > 0);
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
     11. Les systèmes rapatriés de l'ancienne version, à côté des nouveaux
     ===================================================================== */
  titre("11. Systèmes rapatriés");
  // Données : objets et remises de papiers fonctionnent avec la boutique.
  const remise = await depot(admin, `
    const p = await d.papiers.creer({ author_id: etat.utilisateur.id, title: "Convocation", model: "note", body: "Demain 8 h" });
    const r = await d.papiers.tendre({ paper_id: p.id, from_user: etat.utilisateur.id, to_user: "${eleveId}", attested: true });
    return r.id;`);
  const recus = await depot(eleve, `return (await d.papiers.recus(etat.utilisateur.id)).map((r) => r.id);`);
  verifier("un papier tendu arrive chez le destinataire", recus.includes(remise));
  await depot(eleve, `await d.papiers.confirmerPresence("${remise}", { present: true, lieu: "Couloir" });`);
  const prise = await depot(eleve, `return (await d.papiers.repondre("${remise}", "accepted")).state;`);
  verifier("présence confirmée, le papier est accepté", prise === "accepted", prise);
  const affairesEleve = await depot(eleve, `return (await d.affaires.miennes(etat.utilisateur.id)).map((o) => o.kind);`);
  verifier("l'élève a ses affaires (cartable, plume, encrier)",
    ["cartable", "plume", "encrier"].every((k) => affairesEleve.includes(k)), affairesEleve.join(","));
  // Encre : l'encrier (objet RP) et le porte-monnaie d'encre (boutique) coexistent.
  await eleve.goto(`${RACINE}#/affaires`); await eleve.waitForTimeout(1500);
  verifier("la page « Mes affaires » montre l'encrier", await eleve.locator('.objet-vignette__nom:text-is("Encrier")').count() >= 1);
  verifier("la jauge du porte-monnaie d'encre reste en haut", await eleve.locator(".jauge-encre").isVisible());
  // Bureau 3D : Chez moi ouvre la scène ; three.js ne se charge qu'à ce moment.
  // Rechargement sur « Mes affaires » : la session reste, et aucune 3D n'est encore demandée.
  await eleve.reload(); await eleve.waitForTimeout(2000);
  const threeCharge = () => eleve.evaluate(() => performance.getEntriesByType("resource").some((r) => /three\.module/.test(r.name)));
  verifier("three.js n'est pas chargé tant qu'aucune scène 3D n'est ouverte", !(await threeCharge()));
  await eleve.goto(`${RACINE}#/`);
  await eleve.waitForSelector(".chez-moi .scene--3d", { timeout: 15000 }).catch(() => null);
  verifier("Chez moi : la scène 3D du bureau s'ouvre, et three.js se charge à ce moment",
    await threeCharge() && await eleve.locator(".chez-moi .scene--3d").count() === 1);
  verifier("la barre du bas : Bureau, Sac, Cahier, Note, Papiers, Personnes",
    (await eleve.locator(".actions .actions__geste").count()) === 6);
  // Animations réduites : la scène reste, immobile.
  const ctxReduit = await nav.newContext({ viewport: { width: 1360, height: 900 }, reducedMotion: "reduce" });
  await ctxReduit.addInitScript(() =>
    localStorage.setItem("ojm.config", JSON.stringify({ supabaseUrl: "", supabaseAnonKey: "" })));
  const pr = await ctxReduit.newPage();
  pr.on("pageerror", (e) => erreursPage.push(`reduit: ${e.message}`));
  await creerCompte(pr, `Calme${sfx}`);
  await pr.goto(`${RACINE}#/`); await pr.waitForTimeout(2500);
  verifier("mouvements réduits : Chez moi s'affiche sans erreur", await pr.locator(".chez-moi").count() === 1);
  await ctxReduit.close();

} catch (err) {
  echoues++;
  journal.push(`\n  EXCEPTION ${err.stack || err}`);
}

verifier("aucune erreur JavaScript pendant tout le parcours", erreursPage.length === 0, erreursPage.slice(0, 4).join(" | "));
console.log(journal.join("\n"));
console.log(`\n${reussis} réussis, ${echoues} échoués`);
await nav.close();
process.exit(echoues ? 1 : 0);
