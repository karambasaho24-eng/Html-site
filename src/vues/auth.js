/* ---------------------------------------------------------------------------
 * Écran d'accès : connexion par Discord (production) ; pseudo + mot de passe
 * uniquement en démonstration hors ligne.
 *
 * Pas de courriel : le pseudo du jeu et un mot de passe, c'est tout. Le
 * pseudo est celui du personnage — c'est sous ce nom que les autres le
 * verront, en classe comme sur les cahiers.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { auth, pilote } from "../data/index.js";
import { chargerSession } from "../core/session.js";
import { aller } from "../core/router.js";
import { config } from "../core/config.js";
import { erreur, messageErreur } from "../ui/toast.js";
import { stockageSession } from "../core/stockage.js";
import { local } from "../core/util.js";
import { logoCahier } from "../ui/logo-cahier.js";

/** Logo Discord, en SVG inline (aucune ressource externe). */
function ICONE_DISCORD() {
  const n = document.createElement("span");
  n.className = "btn__logo";
  n.setAttribute("aria-hidden", "true");
  n.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>';
  return n;
}

const PSEUDO = /^[\p{L}\p{N}][\p{L}\p{N} '._-]{1,22}[\p{L}\p{N}]$/u;

export default async function vueAuth() {
  let mode = "connexion";   // connexion | inscription

  const boite = el("div.acces__carte");
  const noeud = el("div.acces",
    el("div.acces__colonne",
      el("div.acces__logo", logoCahier(76)),
      el("h1.acces__titre", config.academyName || "Classe Parallèle"),
      el("p.acces__sous-titre", "Votre école, à côté du jeu."),
      boite
    )
  );

  function onglets() {
    return el("div.acces__onglets", { role: "tablist" },
      el("button", { type: "button", role: "tab", "aria-selected": String(mode === "connexion"), onclick: () => basculer("connexion") }, "Se connecter"),
      el("button", { type: "button", role: "tab", "aria-selected": String(mode === "inscription"), onclick: () => basculer("inscription") }, "Créer mon compte"));
  }

  function champPseudo(nouveau) {
    return el("label.champ",
      el("span.champ__label", "Pseudo RP"),
      el("input.saisie", {
        name: "pseudo", required: true, minlength: 3, maxlength: 24,
        autocomplete: nouveau ? "username" : "username", autocapitalize: "words", spellcheck: "false",
        placeholder: "Le nom de votre personnage"
      }),
      nouveau ? el("span.champ__aide",
        "Votre vrai pseudo RP, celui de votre personnage dans le jeu : c'est sous ce nom que les autres vous verront. "
        + "3 à 24 caractères.") : null
    );
  }

  /* --- Entrer ----------------------------------------------------------- */
  function formConnexion() {
    let bouton;
    const f = el("form.acces__formulaire", {
      onsubmit: async (e) => {
        e.preventDefault();
        const pseudo = f.elements.pseudo.value.trim();
        bouton.disabled = true;
        try {
          await auth.connecter({ pseudo, motDePasse: f.elements.mdp.value });
          await chargerSession();
          const retour = stockageSession.getItem("ojm.retour");
          stockageSession.removeItem("ojm.retour");
          aller(retour ? retour.replace(/^#/, "") : "/");
        } catch (err) {
          erreur("Connexion refusée", messageErreur(err));
          bouton.disabled = false;
        }
      }
    },
      champPseudo(false),
      el("label.champ",
        el("span.champ__label", "Mot de passe"),
        el("input.saisie", { name: "mdp", type: "password", required: true, autocomplete: "current-password" })),
      bouton = el("button.btn.btn--primaire.btn--grand.btn--bloc", { type: "submit" }, "Entrer"),
      el("p.acces__aide", "Mot de passe oublié ? Demandez à l'administration de vous en donner un nouveau.")
    );
    return f;
  }

  /* --- Créer son compte --------------------------------------------------- */
  function formInscription() {
    let bouton;
    const f = el("form.acces__formulaire", {
      onsubmit: async (e) => {
        e.preventDefault();
        const pseudo = f.elements.pseudo.value.trim().replace(/\s+/g, " ");
        const mdp = f.elements.mdp.value;
        if (!PSEUDO.test(pseudo)) {
          erreur("Pseudo refusé", "3 à 24 caractères : lettres, chiffres, espaces, et - _ . ' au milieu.");
          return;
        }
        if (mdp.length < 8) { erreur("Mot de passe trop court", "Huit caractères au minimum."); return; }
        if (mdp !== f.elements.mdp2.value) { erreur("Les mots de passe diffèrent", "Tapez deux fois le même."); return; }
        bouton.disabled = true;
        try {
          await auth.inscrire({ pseudo, motDePasse: mdp });
          await chargerSession();
          // Premier pas : on s'habille (tenue, coupe, teint).
          local.ecrire("ojm.bienvenue", true);
          aller("/");
        } catch (err) {
          erreur("Inscription impossible", messageErreur(err));
          bouton.disabled = false;
        }
      }
    },
      champPseudo(true),
      el("label.champ",
        el("span.champ__label", "Mot de passe"),
        el("input.saisie", { name: "mdp", type: "password", required: true, minlength: 8, autocomplete: "new-password" }),
        el("span.champ__aide", "Huit caractères minimum.")),
      el("label.champ",
        el("span.champ__label", "Encore une fois"),
        el("input.saisie", { name: "mdp2", type: "password", required: true, minlength: 8, autocomplete: "new-password" })),
      bouton = el("button.btn.btn--primaire.btn--grand.btn--bloc", { type: "submit" }, "Créer mon compte")
    );
    return f;
  }

  /* --- Discord : la seule porte d'entrée en production ---------------------- */
  function blocDiscord() {
    let bouton;
    return el("div.acces__formulaire.acces__discord",
      el("p.acces__aide.acces__aide--haut",
        "Connectez-vous avec votre compte Discord. Votre compte est créé automatiquement à la première connexion."),
      bouton = el("button.btn.btn--primaire.btn--grand.btn--bloc.btn--discord", {
        type: "button",
        onclick: async () => {
          bouton.disabled = true;
          try { await auth.discord(); }   // redirige vers Discord
          catch (err) { erreur("Connexion Discord impossible", messageErreur(err)); bouton.disabled = false; }
        }
      }, ICONE_DISCORD(), "Continuer avec Discord")
    );
  }

  function peindre() {
    if (pilote.mode !== "local") {
      render(boite, blocDiscord());
      return;
    }
    // Démonstration hors ligne : pas de Discord possible, on garde l'ancien formulaire.
    render(boite, onglets(), mode === "connexion" ? formConnexion() : formInscription(),
      el("p.acces__aide", "Mode démonstration : les comptes restent dans ce navigateur."));
    boite.querySelector('input[name="pseudo"]')?.focus();
  }
  function basculer(nouveau) { mode = nouveau; peindre(); }

  peindre();
  const retourErreur = new URLSearchParams(location.search).get("error_description");
  if (retourErreur) {
    erreur("Connexion Discord refusée", retourErreur);
    history.replaceState(null, "", location.pathname + location.hash);
  }
  document.body.classList.add("hors-session");

  return {
    noeud,
    titre: "Connexion",
    nettoyer: () => document.body.classList.remove("hors-session")
  };
}
