/* Essais des animations de papier (styles/animations.css, src/ui/animations.js).
 *   node outils/essais-animations.mjs     (serveur sur :8777, mêmes variables que essais.mjs) */
const paquet = await import(process.env.PLAYWRIGHT_RACINE ? `file://${process.env.PLAYWRIGHT_RACINE}/playwright/index.js` : "playwright");
const { chromium } = paquet.default || paquet;
const RACINE = process.env.ESSAIS_URL || "http://127.0.0.1:8777/";
const CHROME = process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
let ok = 0, ko = 0; const j = [];
const verifier = (n, c, d = "") => { c ? ok++ : ko++; j.push(`  ${c ? "ok   " : "ECHEC"} ${n}${!c && d ? " — " + d : ""}`); };
const sfx = Math.random().toString(36).slice(2, 7);
const nav = await chromium.launch({ executablePath: CHROME });

async function session(reduit) {
  const ctx = await nav.newContext({ viewport: { width: 1360, height: 900 }, reducedMotion: reduit ? "reduce" : "no-preference" });
  await ctx.addInitScript(() => localStorage.setItem("ojm.config", JSON.stringify({ supabaseUrl: "", supabaseAnonKey: "" })));
  const p = await ctx.newPage(); const erreurs = [];
  p.on("pageerror", (e) => erreurs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|esm\.sh|fonts\./.test(m.text())) erreurs.push(m.text()); });
  await p.goto(RACINE);
  await p.waitForSelector('[role="tab"]:has-text("Créer mon compte")', { timeout: 15000 });
  await p.click('[role="tab"]:has-text("Créer mon compte")');
  await p.fill('input[name="pseudo"]', `Anim${reduit ? "R" : "N"}${sfx}`);
  await p.fill('input[name="mdp"]', "motdepasse1"); await p.fill('input[name="mdp2"]', "motdepasse1");
  await p.click('button[type="submit"]:has-text("Créer mon compte")');
  await p.waitForSelector(".contexte", { timeout: 15000 }); await p.waitForTimeout(900);
  await p.click('button:has-text("Nouveau cahier")');
  await p.fill('input[name="title"]', "Histoire");
  await p.click('[role="dialog"] button:text-is("Créer")');
  return { ctx, p, erreurs };
}
const compter = (p, s) => p.locator(s).count();
const supprimerVia = async (p, cible, secours) => {
  await (secours ? p.locator(cible).click({ button: "right" }) : p.locator(cible).click());
};

try {
  /* ---- mouvement normal ---- */
  const { ctx, p, erreurs } = await session(false);
  // 1. le livre s'ouvre à l'arrivée, puis la classe disparaît
  await p.waitForSelector(".parchemin__corps", { timeout: 8000 });
  verifier("le livre s'ouvre à l'arrivée dans le cahier", await compter(p, ".relieur--ouvre") === 1);
  await p.waitForTimeout(900);
  verifier("…et la classe d'animation est retirée ensuite", await compter(p, ".relieur--ouvre") === 0);

  // 2. une page jetée
  await p.click(".tranche__pied .btn"); await p.waitForTimeout(700);
  const avant = await compter(p, ".onglet-page");
  verifier("le cahier a maintenant deux pages", avant === 2, `pages ${avant}`);
  await p.locator(".onglet-page").nth(1).click({ button: "right" });
  await p.click('.menu button:has-text("Supprimer")');
  await p.click('[role="dialog"] button:text-is("Supprimer")');
  await p.waitForTimeout(120);
  verifier("page supprimée : une boule de papier s'envole", await compter(p, ".papier-fantome--jete") === 1);
  await p.waitForTimeout(1000);
  verifier("…puis elle disparaît du DOM", await compter(p, ".papier-fantome") === 0);
  verifier("la page est bien supprimée", await compter(p, ".onglet-page") === avant - 1);

  // 3. échec de suppression : le cahier revient intact
  await p.goto(RACINE + "#/"); await p.waitForSelector(".dos-cahier");
  await p.evaluate(async () => { const d = await import("/src/data/index.js"); window.__sup = d.cahiers.supprimer; d.cahiers.supprimer = async () => { throw new Error("panne simulée"); }; });
  await p.click('button[aria-label="Actions du cahier"]');
  await p.click('.menu button:has-text("Supprimer")');
  await p.click('[role="dialog"] button:text-is("Supprimer")');
  await p.waitForTimeout(1200);
  verifier("suppression en échec : le cahier reste affiché", await p.locator(".dos-cahier").isVisible());
  verifier("…et plus aucun fantôme à l'écran", await compter(p, ".papier-fantome") === 0);
  const vis = await p.locator(".dos-cahier").evaluate((n) => getComputedStyle(n.parentElement).visibility);
  verifier("…l'élément d'origine n'est plus caché", vis === "visible", vis);

  // 4. cahier déchiré (suppression réussie)
  await p.evaluate(async () => { const d = await import("/src/data/index.js"); d.cahiers.supprimer = window.__sup; });
  await p.click('button[aria-label="Actions du cahier"]');
  await p.click('.menu button:has-text("Supprimer")');
  await p.click('[role="dialog"] button:text-is("Supprimer")');
  await p.waitForTimeout(150);
  verifier("cahier supprimé : deux moitiés dentelées", await compter(p, ".papier-fantome--gauche") === 1 && await compter(p, ".papier-fantome--droite") === 1);
  const anim = await p.locator(".papier-fantome--gauche").evaluate((n) => getComputedStyle(n).animationName).catch(() => "");
  verifier("…avec l'animation de déchirure", anim === "papier-gauche", anim);
  await p.waitForTimeout(1100);
  verifier("…puis les moitiés disparaissent", await compter(p, ".papier-fantome") === 0);
  verifier("le cahier a disparu de l'étagère", await compter(p, ".dos-cahier") === 0);
  verifier("aucune erreur JavaScript (mouvement normal)", erreurs.length === 0, erreurs.join(" | ").slice(0, 200));
  await ctx.close();

  /* ---- mouvement réduit : rien ne doit être lancé ---- */
  const r = await session(true);
  await r.p.waitForSelector(".parchemin__corps", { timeout: 8000 });
  verifier("mouvement réduit : le livre ne pivote pas", await compter(r.p, ".relieur--ouvre") === 0);
  await r.p.goto(RACINE + "#/"); await r.p.waitForSelector(".dos-cahier");
  await r.p.click('button[aria-label="Actions du cahier"]');
  await r.p.click('.menu button:has-text("Supprimer")');
  await r.p.click('[role="dialog"] button:text-is("Supprimer")');
  await r.p.waitForTimeout(100);
  verifier("mouvement réduit : aucun fantôme", await compter(r.p, ".papier-fantome") === 0);
  await r.p.waitForTimeout(500);
  verifier("mouvement réduit : le cahier est quand même supprimé", await compter(r.p, ".dos-cahier") === 0);
  verifier("aucune erreur JavaScript (mouvement réduit)", r.erreurs.length === 0, r.erreurs.join(" | ").slice(0, 200));
  await r.ctx.close();
} catch (e) { ko++; j.push(`  EXCEPTION ${String(e.message).slice(0, 300)}`); }
await nav.close();
console.log(j.join("\n") + `\n\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
