/* ---------------------------------------------------------------------------
 * Écran d'accès : connexion, inscription, lien par courriel.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { auth, pilote } from "../data/index.js";
import { chargerSession } from "../core/session.js";
import { aller } from "../core/router.js";
import { config } from "../core/config.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";
import { L } from "../core/lexique.js";
import { stockageSession } from "../core/stockage.js";

/** Monogramme dérivé du nom affiché. */
function sceau() {
  const mots = String(config.academyName || "Classe Parallèle")
    .split(/[\s\u00b7\u2014-]+/).filter(Boolean);
  if (mots.length === 1) return mots[0].slice(0, 3).toUpperCase();
  return mots.slice(0, 3).map((m) => m[0]).join("").toUpperCase();
}

const ARGUMENTS = [
  ["cahiers", "Un cahier personnel pour chaque élève", "Pages, dessins, annotations. Il reste privé, même pendant le cours."],
  ["tableau", "Un tableau partagé en temps réel", "Le professeur écrit, la classe voit. Les pages se conservent."],
  ["classe", "Une classe, un code", "Le professeur donne un code, les élèves entrent et rejoignent la session."],
  ["robot", "Roblox reste le jeu", "Toute la logique scolaire vit ici : le serveur RP ne s'alourdit pas."]
];

export default async function vueAuth() {
  let mode = "connexion";   // connexion | inscription | lien

  const boite = el("div.acces__boite");
  const noeud = el("div.accueil-acces",
    el("aside.acces__enseigne",
      el("div.acces__sceau", sceau()),
      el("div",
        el("p.acces__devise", config.academyMotto || "Ordre · Justice · Mérite"),
        el("h1.acces__titre", config.academyName || config.academyName),
        el("p.doux", { style: { maxWidth: "44ch", marginTop: "var(--e-3)" } },
          "L'environnement scolaire numérique de votre académie RP. Il fonctionne à côté de Roblox, jamais à sa place.")
      ),
      el("div.acces__points",
        ARGUMENTS.map(([ic, titre, corps]) => el("div.acces__point",
          icone(ic, 18),
          el("div", el("b", titre), el("br"), el("span.petit", corps))
        ))
      )
    ),
    el("section.acces__formulaire", boite)
  );

  function peindre() {
    render(boite, mode === "connexion" ? formConnexion()
      : mode === "inscription" ? formInscription()
      : formLien());
  }

  function basculer(nouveau) { mode = nouveau; peindre(); }

  /* --- Connexion ---------------------------------------------------------- */
  function formConnexion() {
    let email, motDePasse, bouton;
    const formulaire = el("form", {
      onsubmit: async (e) => {
        e.preventDefault();
        bouton.disabled = true;
        try {
          await auth.connecter({ email: email.value.trim(), motDePasse: motDePasse.value });
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
      el("h2", { style: { marginBottom: "var(--e-2)" } }, "Entrer dans l'académie"),
      el("p.doux.petit", { style: { marginBottom: "var(--e-5)" } },
        "Identifiez-vous pour retrouver vos cahiers et vos classes."),

      el("label.champ",
        el("span.champ__label", "Adresse de courriel"),
        email = el("input.saisie", { type: "email", required: true, autocomplete: "email", placeholder: "vous@exemple.fr" })
      ),
      el("label.champ",
        el("span.champ__label", "Mot de passe"),
        motDePasse = el("input.saisie", { type: "password", required: true, autocomplete: "current-password" })
      ),
      bouton = el("button.btn.btn--primaire.btn--grand.btn--bloc", { type: "submit" }, "Se connecter"),

      el("div.ligne-flex.ligne-flex--entre", { style: { marginTop: "var(--e-4)" } },
        el("button.btn.btn--fantome.petit", { type: "button", onclick: () => basculer("inscription") },
          "Créer un compte"),
        pilote.mode === "supabase"
          ? el("button.btn.btn--fantome.petit", { type: "button", onclick: () => basculer("lien") },
              "Lien par courriel")
          : null
      ),
      noteMode()
    );
    return formulaire;
  }

  /* --- Inscription -------------------------------------------------------- */
  function formInscription() {
    let nom, email, motDePasse, bouton;
    return el("form", {
      onsubmit: async (e) => {
        e.preventDefault();
        if (motDePasse.value.length < 8) {
          erreur("Mot de passe trop court", "Huit caractères au minimum.");
          return;
        }
        bouton.disabled = true;
        try {
          const sortie = await auth.inscrire({
            email: email.value.trim(), motDePasse: motDePasse.value,
            nom: nom.value.trim(), role: "student"
          });
          if (!sortie?.session && pilote.mode === "supabase") {
            succes("Compte créé",
              "Ce projet demande encore une confirmation par courriel : ouvrez le message reçu, puis connectez-vous.");
            basculer("connexion");
            return;
          }
          await chargerSession();
          aller("/");
        } catch (err) {
          erreur("Inscription impossible", messageErreur(err));
          bouton.disabled = false;
        }
      }
    },
      el("h2", { style: { marginBottom: "var(--e-2)" } }, "Créer un compte"),
      el("p.doux.petit", { style: { marginBottom: "var(--e-5)" } },
        "Votre nom sera visible des membres des espaces que vous rejoignez."),

      el("label.champ",
        el("span.champ__label", "Nom affiché"),
        nom = el("input.saisie", { required: true, placeholder: "Jean Marchand", autocomplete: "name" }),
        el("span.champ__aide", "Idéalement le nom de votre personnage RP.")
      ),
      el("label.champ",
        el("span.champ__label", "Adresse de courriel"),
        email = el("input.saisie", { type: "email", required: true, autocomplete: "email" })
      ),
      el("label.champ",
        el("span.champ__label", "Mot de passe"),
        motDePasse = el("input.saisie", { type: "password", required: true, minlength: 8, autocomplete: "new-password" }),
        el("span.champ__aide", "Huit caractères minimum.")
      ),
      el("p.petit.faible", { style: { marginBottom: "var(--e-4)" } },
        `Un seul type de compte. Vous serez ${L("professeur")} des ${L("classes")} que vous créez, `
        + `${L("eleve")} de celles que vous rejoignez avec un code.`),
      bouton = el("button.btn.btn--primaire.btn--grand.btn--bloc", { type: "submit" }, "Créer mon compte"),
      el("div.centre", { style: { marginTop: "var(--e-4)" } },
        el("button.btn.btn--fantome.petit", { type: "button", onclick: () => basculer("connexion") },
          "J'ai déjà un compte")
      ),
      noteMode()
    );
  }

  /* --- Lien par courriel --------------------------------------------------- */
  function formLien() {
    let email, bouton;
    return el("form", {
      onsubmit: async (e) => {
        e.preventDefault();
        bouton.disabled = true;
        try {
          await auth.lienMagique(email.value.trim());
          succes("Lien envoyé", "Consultez votre boîte de réception.");
        } catch (err) {
          erreur("Envoi impossible", messageErreur(err));
        } finally {
          bouton.disabled = false;
        }
      }
    },
      el("h2", { style: { marginBottom: "var(--e-2)" } }, "Lien de connexion"),
      el("p.doux.petit", { style: { marginBottom: "var(--e-5)" } },
        "Recevez un lien à usage unique, sans mot de passe."),
      el("label.champ",
        el("span.champ__label", "Adresse de courriel"),
        email = el("input.saisie", { type: "email", required: true, autocomplete: "email" })
      ),
      bouton = el("button.btn.btn--primaire.btn--grand.btn--bloc", { type: "submit" }, "Recevoir le lien"),
      el("div.centre", { style: { marginTop: "var(--e-4)" } },
        el("button.btn.btn--fantome.petit", { type: "button", onclick: () => basculer("connexion") }, "Retour")
      )
    );
  }

  function noteMode() {
    if (pilote.mode !== "local") return null;
    return el("div.carte", { style: { marginTop: "var(--e-5)", borderColor: "var(--ligne-laiton)" } },
      el("div.ligne-flex", icone("bouclier", 16),
        el("b.petit", "Mode démonstration")),
      el("p.petit.doux", { style: { margin: "var(--e-2) 0 0" } },
        "Aucun projet Supabase n'est configuré : les comptes et les données restent dans ce navigateur, "
        + "et la synchronisation ne fonctionne qu'entre les onglets de ce poste. "
        + "Renseignez config.js pour passer en mode réel."),
      el("button.btn.petit", {
        style: { marginTop: "var(--e-3)" },
        onclick: () => aller("/reglages?onglet=connexion")
      }, "Configurer Supabase")
    );
  }

  peindre();
  document.body.classList.add("hors-session");

  return {
    noeud,
    titre: "Connexion",
    nettoyer: () => document.body.classList.remove("hors-session")
  };
}
