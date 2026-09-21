/* ---------------------------------------------------------------------------
 * OJM ACADEMY — amorçage.
 *
 * Environnement scolaire numérique fonctionnant en parallèle d'un serveur
 * Roblox RP : les cahiers, le tableau, les documents, les exercices et la vie
 * de classe vivent ici, le jeu reste dédié au RolePlay.
 * ------------------------------------------------------------------------- */
import { initialiserDonnees, auth, pilote } from "./data/index.js";
import { definirRoute, demarrerRouteur, aller, resoudre } from "./core/router.js";
import { chargerSession, rafraichirNotifications } from "./core/session.js";
import { etat, definir, observer } from "./core/store.js";
import { construireChassis, zoneVue } from "./ui/chassis.js";
import { surveillerReseau } from "./core/reseau.js";
import { restaurerInterface, activerRaccourcis, enregistrerAction, cyclerDensite, appliquerDensite } from "./core/interface.js";
import { erreur, toast } from "./ui/toast.js";
import { el, render } from "./ui/dom.js";
import { ecouter } from "./core/bus.js";

/* --- Table de routage ------------------------------------------------------ */
function declarerRoutes() {
  const V = (fichier) => () => import(`./vues/${fichier}.js`);

  definirRoute("/connexion",             { nom: "connexion", vue: V("auth"), publique: true });
  definirRoute("/",                      { nom: "accueil", vue: V("accueil"), prive: true });
  definirRoute("/cahiers",               { nom: "cahiers", vue: V("cahiers"), prive: true });
  definirRoute("/cahier/:id",            { nom: "cahier", vue: V("cahier"), prive: true });
  definirRoute("/classes",               { nom: "classes", vue: V("classes"), prive: true });
  definirRoute("/classe/:id",            { nom: "classe", vue: V("classe"), prive: true });
  definirRoute("/classe/:id/salle",      { nom: "salle", vue: V("salle"), prive: true });
  definirRoute("/documents",             { nom: "documents", vue: V("documents"), prive: true });
  definirRoute("/bibliotheque",          { nom: "bibliotheque", vue: V("documents"), prive: true });
  definirRoute("/exercices",             { nom: "exercices", vue: V("exercices"), prive: true });
  definirRoute("/exercice/:id",          { nom: "exercice", vue: V("exercice"), prive: true });
  definirRoute("/archives",              { nom: "archives", vue: V("archives"), prive: true });
  definirRoute("/archive/:id",           { nom: "archive", vue: V("archive"), prive: true });
  definirRoute("/professeur",            { nom: "professeur", vue: V("professeur"), prive: true });
  definirRoute("/modeles",               { nom: "modeles", vue: V("modeles"), prive: true });
  definirRoute("/administration",        { nom: "administration", vue: V("administration"), prive: true });
  definirRoute("/recherche",             { nom: "recherche", vue: V("recherche"), prive: true });
  definirRoute("/profil",                { nom: "profil", vue: V("profil"), prive: true });
  definirRoute("/reglages",              { nom: "reglages", vue: V("reglages"), prive: true });
  definirRoute("*",                      { nom: "introuvable", vue: V("introuvable") });
}

/* --- Raccourcis globaux ---------------------------------------------------- */
function declarerRaccourcis() {
  enregistrerAction("cahiers.liste",    () => aller("/cahiers"));
  enregistrerAction("classes.liste",    () => aller("/classes"));
  enregistrerAction("recherche.ouvrir", () => aller("/recherche"));
  enregistrerAction("densite.cycler",   () => cyclerDensite());
  enregistrerAction("densite.minimal",  () => appliquerDensite(etat.densite === "minimal" ? "grand" : "minimal"));
  enregistrerAction("aide.raccourcis",  () => aller("/reglages?onglet=raccourcis"));
  enregistrerAction("cahier.ouvrir", () => {
    const dernier = etat.cahiers?.[0];
    aller(dernier ? `/cahier/${dernier.id}` : "/cahiers");
  });
  enregistrerAction("tableau.ouvrir", () => {
    if (etat.classeActive) aller(`/classe/${etat.classeActive.id}/salle`);
    else aller("/classes");
  });
}

/* --- Démarrage -------------------------------------------------------------- */
async function demarrer() {
  const ecran = document.getElementById("ecran-chargement");
  const hote = document.getElementById("application");

  try {
    restaurerInterface();
    await initialiserDonnees();

    if (pilote.repli) {
      toast("Projet Supabase injoignable", {
        corps: "Bascule en mode démonstration locale. Vérifiez la configuration dans Réglages.",
        type: "attn", duree: 9000
      });
    }

    await chargerSession();

    hote.hidden = false;
    const vue = construireChassis(hote);

    declarerRoutes();
    declarerRaccourcis();
    activerRaccourcis();
    surveillerReseau();

    demarrerRouteur(vue, {
      rendu: (noeud) => render(vue, noeud)
    });

    // Réaction aux changements d'authentification (autre onglet, expiration…)
    auth.surChangement(async (evenement) => {
      if (evenement === "SIGNED_OUT") {
        definir({ utilisateur: null, profil: null, classes: [], notifications: [] });
        aller("/connexion");
      } else if (evenement === "SIGNED_IN" || evenement === "TOKEN_REFRESHED") {
        if (!etat.utilisateur) {
          await chargerSession();
          const retour = sessionStorage.getItem("ojm.retour");
          sessionStorage.removeItem("ojm.retour");
          aller(retour ? retour.replace(/^#/, "") : "/");
        }
      }
    });

    // Rafraîchissement périodique discret des notifications
    setInterval(() => {
      if (document.visibilityState === "visible" && etat.utilisateur) rafraichirNotifications();
    }, 90_000);

    definir({ pret: true });
    ecran?.remove();

    if (!etat.utilisateur && !location.hash.startsWith("#/connexion")) {
      aller("/connexion", true);
    }
  } catch (err) {
    console.error("[amorçage]", err);
    ecran?.remove();
    hote.hidden = false;
    render(hote, ecranPanne(err));
  }
}

function ecranPanne(err) {
  return el("div.page",
    el("div.page__entete",
      el("div.page__titre",
        el("span.page__surtitre", "Panne au démarrage"),
        el("h1", "L'académie n'a pas pu s'ouvrir")
      )
    ),
    el("div.carte",
      el("p", "Une erreur est survenue pendant l'initialisation :"),
      el("pre.mono.petit", { style: { whiteSpace: "pre-wrap", color: "var(--alerte)" } }, String(err?.message || err)),
      el("p.doux.petit", "Vérifiez la configuration Supabase dans config.js, ou relancez en mode démonstration en laissant les champs vides."),
      el("div.ligne-flex",
        el("button.btn.btn--primaire", { onclick: () => location.reload() }, "Recharger"),
        el("button.btn", {
          onclick: () => {
            localStorage.removeItem("ojm.config");
            location.reload();
          }
        }, "Réinitialiser la configuration locale")
      )
    )
  );
}

/* Les erreurs non capturées ne doivent jamais laisser l'écran figé. */
window.addEventListener("unhandledrejection", (evenement) => {
  console.error("[promesse]", evenement.reason);
  if (etat.pret) erreur("Une action a échoué", evenement.reason?.message);
});

ecouter("route:erreur", ({ erreur: err }) => {
  render(zoneVue(), el("div.page",
    el("div.vide",
      el("span.vide__titre", "Cette page n'a pas pu s'afficher"),
      el("p", String(err?.message || err)),
      el("button.btn", { onclick: () => resoudre() }, "Réessayer")
    )
  ));
});

demarrer();
