/* ---------------------------------------------------------------------------
 * Écran d'accès : entrer avec son pseudo RP, ou créer son personnage.
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

const PSEUDO = /^[\p{L}\p{N}][\p{L}\p{N} '._-]{1,22}[\p{L}\p{N}]$/u;

export default async function vueAuth() {
  let mode = "connexion";   // connexion | inscription

  const boite = el("div.acces__carte");
  const noeud = el("div.acces",
    el("div.acces__colonne",
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

  function peindre() {
    render(boite, onglets(), mode === "connexion" ? formConnexion() : formInscription(),
      pilote.mode === "local"
        ? el("p.acces__aide", "Mode démonstration : les comptes restent dans ce navigateur.")
        : null);
    boite.querySelector('input[name="pseudo"]')?.focus();
  }
  function basculer(nouveau) { mode = nouveau; peindre(); }

  peindre();
  document.body.classList.add("hors-session");

  return {
    noeud,
    titre: "Connexion",
    nettoyer: () => document.body.classList.remove("hors-session")
  };
}
