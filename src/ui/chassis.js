/* ---------------------------------------------------------------------------
 * Châssis : marque, barre supérieure, rail de navigation, zone de vue.
 * Rendu une seule fois ; seuls les fragments concernés sont recalculés.
 * ------------------------------------------------------------------------- */
import { el, render, $ } from "./dom.js";
import { icone } from "./icons.js";
import { etat, observer, definir } from "../core/store.js";
import { aller, chemin } from "../core/router.js";
import { config } from "../core/config.js";
import { L } from "../core/lexique.js";
import { estEnseignant, estAdmin } from "../core/permissions.js";
import { initiales, depuis } from "../core/util.js";
import { menu } from "./modal.js";
import { deconnecter, notificationsNonLues, rafraichirNotifications } from "../core/session.js";
import { basculerTheme, cyclerDensite, appliquerDensite, DENSITES } from "../core/interface.js";
import { notifications as depotNotifications } from "../data/index.js";
import { pilote } from "../data/index.js";

let refs = {};

export function construireChassis(hote) {
  const chassis = el("div.chassis",
    el("div.marque",
      el("div.marque__sceau", "OJM"),
      el("div", { style: { minWidth: "0" } },
        el("div.marque__nom", config.academyName || "OJM Academy"),
        el("span.marque__devise", config.academyMotto || "")
      )
    ),
    el("header.barre",
      el("button.btn.btn--fantome.btn--icone.bouton-tiroir", {
        "aria-label": "Navigation", onclick: () => document.body.classList.toggle("tiroir-ouvert")
      }, icone("menu", 17)),
      refs.fil = el("div.barre__fil"),
      refs.outils = el("div.barre__outils")
    ),
    refs.rail = el("nav.rail", { "aria-label": "Navigation principale" }),
    refs.vue = el("main#vue.vue", { tabindex: "-1" })
  );

  render(hote, chassis);
  peindreRail();
  peindreOutils();
  peindreFil();

  observer(["route", "classes", "profil"], () => { peindreRail(); peindreFil(); });
  observer(["notifications", "reseau", "densite", "theme", "utilisateur"], peindreOutils);
  observer("classeActive", peindreFil);

  return refs.vue;
}

/* --- Rail ------------------------------------------------------------------ */
function lienRail(href, nom, libelle, icone_, compteur = null) {
  const actif = chemin() === href || (href !== "/" && chemin().startsWith(href));
  return el("a.rail__lien", {
    href: `#${href}`,
    "aria-current": actif ? "page" : null,
    title: libelle,
    onclick: () => document.body.classList.remove("tiroir-ouvert")
  }, icone(icone_, 16), el("span", libelle),
     compteur ? el("span.compteur", String(compteur)) : null);
}

function peindreRail() {
  const enseignant = estEnseignant();
  const classesActives = etat.classes.filter((c) => !c.archived);

  render(refs.rail,
    el("div.rail__titre", "Mon espace"),
    lienRail("/", "accueil", "Accueil", "accueil"),
    lienRail("/cahiers", "cahiers", `Mes ${L("cahiers")}`, "cahiers"),
    lienRail("/classes", "classes", `Mes ${L("classes")}`, "classe", classesActives.length || null),
    lienRail("/documents", "documents", "Documents", "documents"),
    lienRail("/exercices", "exercices", L("Exercices"), "exercices"),
    lienRail("/archives", "archives", "Archives", "archives"),

    enseignant ? el("div.rail__titre", `Espace ${L("professeur")}`) : null,
    enseignant ? lienRail("/professeur", "professeur", "Tableau de bord", "grille") : null,
    enseignant ? lienRail("/bibliotheque", "bibliotheque", "Bibliothèque", "livre") : null,
    enseignant ? lienRail("/modeles", "modeles", "Modèles de cours", "cours") : null,

    estAdmin() ? el("div.rail__titre", "Administration") : null,
    estAdmin() ? lienRail("/administration", "administration", "Comptes & journaux", "bouclier") : null,

    el("div.rail__pied",
      lienRail("/profil", "profil", "Mon profil", "profil"),
      lienRail("/reglages", "reglages", "Réglages", "reglages")
    )
  );
}

/* --- Fil d'Ariane ---------------------------------------------------------- */
function peindreFil() {
  const { nom } = etat.route;
  const titres = {
    accueil: "Accueil", cahiers: `Mes ${L("cahiers")}`, cahier: L("Cahier"),
    classes: `Mes ${L("classes")}`, classe: L("Classe"), salle: "Session en direct",
    documents: "Documents", exercices: L("Exercices"), exercice: L("Exercice"),
    archives: "Archives", profil: "Profil", reglages: "Réglages",
    professeur: `Espace ${L("professeur")}`, bibliotheque: "Bibliothèque",
    modeles: "Modèles", administration: "Administration", recherche: "Recherche"
  };

  const morceaux = [el("span", { style: { color: "var(--texte-faible)" } }, titres[nom] || "OJM")];

  if (etat.classeActive && ["classe", "salle", "exercice", "cahier"].includes(nom)) {
    morceaux.unshift(
      el("a", { href: `#/classe/${etat.classeActive.id}` }, el("b", etat.classeActive.name)),
      el("span.barre__sep", "›")
    );
  }
  if (etat.sessionActive?.status === "live") {
    morceaux.push(el("span.barre__sep", "·"), el("span.etiq.etiq--direct", "En direct"));
  }
  if (etat.modeExamen) {
    morceaux.push(el("span.barre__sep", "·"), el("span.etiq.etiq--alerte", "Mode examen"));
  }
  render(refs.fil, morceaux);
}

/* --- Outils de la barre ---------------------------------------------------- */
function peindreOutils() {
  const nonLues = notificationsNonLues();
  const etatReseau = pilote?.mode === "local" ? "local" : etat.reseau;
  const libelleReseau = {
    ok: "En ligne", rompu: "Hors ligne", reprise: "Reconnexion…", local: "Mode démonstration"
  }[etatReseau];

  render(refs.outils,
    el("span.reseau.hors-examen", { dataset: { etat: etatReseau }, title: libelleReseau },
      el("span.pastille", {
        class: etatReseau === "ok" ? "pastille--present"
             : etatReseau === "rompu" ? "pastille--absent"
             : etatReseau === "local" ? "pastille--away" : "pastille--offline"
      }),
      el("span.petit", libelleReseau)
    ),

    el("button.btn.btn--fantome.btn--icone.hors-examen", {
      "aria-label": "Recherche globale", title: "Recherche (/)",
      onclick: () => aller("/recherche")
    }, icone("recherche", 17)),

    el("button.btn.btn--fantome.btn--icone.hors-examen", {
      "aria-label": `Notifications${nonLues ? ` (${nonLues} non lues)` : ""}`,
      title: "Notifications",
      style: { position: "relative" },
      onclick: (e) => panneauNotifications(e.currentTarget)
    },
      icone("cloche", 17),
      nonLues ? el("span.pastille-compteur", nonLues > 9 ? "9+" : String(nonLues)) : null
    ),

    el("button.btn.btn--fantome.btn--icone.hors-examen", {
      "aria-label": "Densité d'affichage", title: "Densité (Ctrl+\\)",
      onclick: (e) => menu(e.currentTarget, [
        { titre: "Cohabitation Roblox" },
        ...DENSITES.map((d) => ({
          libelle: `${d.libelle}${etat.densite === d.cle ? "  ✓" : ""}`,
          action: () => appliquerDensite(d.cle)
        })),
        { separateur: true },
        { libelle: etat.theme === "nuit" ? "Thème clair" : "Thème sombre", icone: "oeil", action: basculerTheme }
      ])
    }, icone("grille", 17)),

    el("button.btn.btn--fantome", {
      "aria-label": "Mon compte",
      onclick: (e) => menu(e.currentTarget, [
        { titre: etat.profil?.display_name || "Compte" },
        { libelle: "Mon profil", icone: "profil", action: () => aller("/profil") },
        { libelle: "Réglages", icone: "reglages", action: () => aller("/reglages") },
        { libelle: "Raccourcis clavier", icone: "liste", action: () => aller("/reglages?onglet=raccourcis") },
        { separateur: true },
        { libelle: "Se déconnecter", icone: "sortie", danger: true, action: async () => {
          await deconnecter(); aller("/connexion");
        } }
      ])
    },
      el("span.avatar", { class: estEnseignant() ? "avatar--prof" : "" },
        initiales(etat.profil?.display_name))
    )
  );
}

/* --- Panneau de notifications --------------------------------------------- */
function panneauNotifications(ancre) {
  const liste = etat.notifications.slice(0, 12);
  if (!liste.length) {
    menu(ancre, [{ titre: "Notifications" }, { libelle: "Aucune notification", action: () => {} }]);
    return;
  }
  menu(ancre, [
    { titre: "Notifications" },
    ...liste.map((n) => ({
      libelle: `${n.read_at ? "" : "• "}${n.title}`,
      action: async () => {
        if (!n.read_at) { await depotNotifications.lire(n.id); await rafraichirNotifications(); }
        if (n.link) aller(n.link);
      }
    })),
    { separateur: true },
    {
      libelle: "Tout marquer comme lu", icone: "coche",
      action: async () => {
        await depotNotifications.toutLire(etat.utilisateur.id);
        await rafraichirNotifications();
      }
    }
  ]);
}

export function zoneVue() { return refs.vue; }

/** Affiche la vue en pleine hauteur (tableau, salle, cahier). */
export function modePleineVue(actif) {
  refs.vue?.classList.toggle("vue--pleine", Boolean(actif));
}
