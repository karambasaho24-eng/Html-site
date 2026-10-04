/* ---------------------------------------------------------------------------
 * La barre de commandes.
 *
 * Tout en bas à gauche, « >_ » (ou la touche « ² ») : une ligne où l'on tape
 * des commandes, comme dans un jeu. Chacun peut s'en servir ; ce qu'une
 * commande permet dépend du rôle, et c'est la base qui tranche (0029, 0030).
 *
 * Pour devenir modérateur ou administrateur : un administrateur tape
 * « /code moderateur », obtient un code à usage unique (valable 24 h), le
 * donne en main propre ; la personne tape « /role CE-CODE ». Aucun code
 * n'est écrit dans le site : le dépôt est public.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { chargerSession } from "../core/session.js";
import { profils, moderation, auth } from "../data/index.js";
import { estModerateur, peutNommer, LIBELLES_ROLES } from "../core/permissions.js";
import { TITRES, libelleTitre } from "./titres.js";
import { messageErreur } from "../ui/toast.js";

/* Les rôles, tels qu'on les tape. */
const ROLES = {
  membre: "student", eleve: "student", student: "student",
  observateur: "observer", observer: "observer",
  professeur: "teacher", teacher: "teacher", formateur: "instructor",
  moderateur: "moderator", modo: "moderator", moderator: "moderator",
  directeur: "director", director: "director",
  admin: "admin", administrateur: "admin",
  superadmin: "super_admin", super: "super_admin", super_admin: "super_admin"
};
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const roleDe = (mot) => ROLES[sansAccent(mot).replace(/[\s-]/g, "")] || null;

function motDePasseAuHasard() {
  const mots = ["Rempart", "Plume", "Encrier", "Bougie", "Pupitre", "Muraille", "Craie", "Horloge", "Lanterne", "Cadet"];
  const n = new Uint32Array(3); crypto.getRandomValues(n);
  return `${mots[n[0] % mots.length]}-${mots[n[1] % mots.length]}-${1000 + (n[2] % 9000)}`;
}

/** La liste, avec qui peut s'en servir. */
const COMMANDES = [
  { nom: "aide", usage: "/aide", aide: "La liste des commandes." },
  { nom: "moi", usage: "/moi", aide: "Votre pseudo, votre rôle, votre titre." },
  { nom: "role", usage: "/role CODE", aide: "Utiliser un code reçu de l'administration (modérateur, administrateur…)." },
  { nom: "code", usage: "/code moderateur|admin|superadmin", aide: "Créer un code à usage unique, valable 24 h.", qui: "admin" },
  { nom: "nommer", usage: "/nommer PSEUDO ROLE", aide: "Changer le rôle d'un compte (membre, moderateur, admin…).", qui: "admin" },
  { nom: "titre", usage: "/titre PSEUDO roi|reine|commandant…|aucun [libellé]", aide: "Donner un titre de personnage.", qui: "admin" },
  { nom: "bannir", usage: "/bannir PSEUDO RAISON", aide: "Bannir le personnage (le compte reste) ; le joueur lira la raison.", qui: "modo" },
  { nom: "supprimer", usage: "/supprimer PSEUDO", aide: "Supprimer un compte, définitivement (demande une confirmation).", qui: "admin" },
  { nom: "mdp", usage: "/mdp PSEUDO", aide: "Donner un nouveau mot de passe à un joueur.", qui: "admin" },
  { nom: "annonce", usage: "/annonce TITRE | TEXTE", aide: "Une annonce à tous les joueurs.", qui: "modo" },
  { nom: "message", usage: "/message PSEUDO TEXTE", aide: "Écrire à un joueur, au nom de la modération.", qui: "modo" },
  { nom: "moderation", usage: "/moderation", aide: "Ouvrir la modération (remises, journal…).", qui: "modo" },
  { nom: "effacer", usage: "/effacer", aide: "Vider cette fenêtre." }
];
const autorise = (c) => !c.qui || (c.qui === "admin" ? peutNommer() : estModerateur());

/** Exécute une ligne ; renvoie ce qu'il faut afficher : [{ texte, genre }]. */
async function executer(ligne) {
  const brut = ligne.trim().replace(/^\//, "");
  const [nomBrut, ...args] = brut.split(/\s+/);
  const nom = sansAccent(nomBrut);
  const reste = brut.slice(nomBrut.length).trim();
  const ok = (texte) => [{ texte, genre: "ok" }];
  const info = (texte) => [{ texte, genre: "info" }];
  const ko = (texte) => [{ texte, genre: "erreur" }];
  const commande = COMMANDES.find((c) => c.nom === nom);
  if (!commande) return ko(`Commande inconnue : « ${nomBrut} ». Tapez /aide.`);
  if (!autorise(commande)) return ko(`/${commande.nom} est réservée à ${commande.qui === "admin" ? "l'administration" : "la modération"}.`);
  if (!etat.utilisateur) return ko("Connectez-vous d'abord.");

  const compte = async (pseudo) => {
    const p = await profils.parPseudo(pseudo);
    if (!p) throw new Error(`Aucun compte « ${pseudo} ».`);
    return p;
  };

  switch (nom) {
    case "aide":
      return COMMANDES.filter(autorise).map((c) => ({ texte: `${c.usage} — ${c.aide}`, genre: "info" }));

    case "moi": {
      const p = etat.profil || {};
      const titre = libelleTitre(p);
      return info(`${p.display_name} · ${LIBELLES_ROLES[p.role_key] || p.role_key}${titre ? ` · ${titre}` : ""}`);
    }

    case "role": {
      if (!args[0]) return ko("Usage : /role CODE");
      const avant = etat.profil?.role_key;
      const role = await profils.utiliserCodeRole(args[0]);
      await chargerSession();
      return role === avant
        ? info(`Code utilisé, mais vous étiez déjà ${LIBELLES_ROLES[role] || role} (ou plus) : rien ne change.`)
        : ok(`Vous êtes maintenant ${LIBELLES_ROLES[role] || role}.`);
    }

    case "code": {
      const role = roleDe(args[0] || "");
      if (!["moderator", "admin", "super_admin"].includes(role)) return ko("Usage : /code moderateur|admin|superadmin");
      const code = await profils.creerCodeRole(role);
      return [
        { texte: `Code ${LIBELLES_ROLES[role]} : ${code}`, genre: "ok", copier: code },
        { texte: "À donner en main propre. Il sert une seule fois et expire dans 24 h. La personne tape : /role " + code, genre: "info" }
      ];
    }

    case "nommer": {
      if (args.length < 2) return ko("Usage : /nommer PSEUDO ROLE");
      const role = roleDe(args[args.length - 1]);
      if (!role) return ko("Rôle inconnu. Exemples : membre, moderateur, admin, superadmin.");
      const p = await compte(args.slice(0, -1).join(" "));
      await profils.nommer(p.id, role);
      return ok(`${p.display_name} est maintenant ${LIBELLES_ROLES[role]}.`);
    }

    case "titre": {
      if (args.length < 2) return ko("Usage : /titre PSEUDO roi|reine|commandant…|aucun [libellé]");
      const p = await compte(args[0]);
      const cle = sansAccent(args[1]);
      if (cle === "aucun") { await profils.titrer(p.id, null); return ok(`${p.display_name} n'a plus de titre.`); }
      const fiche = TITRES.find((t) => t.cle === cle || sansAccent(t.libelle) === cle);
      if (!fiche) return ko(`Titre inconnu. Titres : ${TITRES.map((t) => t.cle).join(", ")}.`);
      const libelle = args.slice(2).join(" ") || null;
      await profils.titrer(p.id, fiche.cle, libelle);
      return ok(`${p.display_name} : ${libelle || fiche.libelle}.`);
    }

    case "bannir": {
      if (args.length < 2) return ko("Usage : /bannir PSEUDO RAISON");
      const p = await compte(args[0]);
      const raison = args.slice(1).join(" ");
      await moderation.bannir(p.id, raison);
      return ok(`Personnage de ${p.display_name} banni. Il lira : « ${raison} ».`);
    }

    case "supprimer": {
      if (!args.length) return ko("Usage : /supprimer PSEUDO");
      const confirme = sansAccent(args[args.length - 1]) === "oui";
      const pseudo = (confirme ? args.slice(0, -1) : args).join(" ");
      const p = await compte(pseudo);
      if (!confirme) {
        return [{ texte: `Supprimer ${p.display_name} est définitif (compte, fiches, cahiers, papiers, affaires, espaces).`, genre: "erreur" },
                { texte: `Pour confirmer, tapez : /supprimer ${p.display_name} oui`, genre: "info" }];
      }
      await profils.supprimerCompte(p.id);
      return ok(`Compte ${p.display_name} supprimé.`);
    }

    case "mdp": {
      if (!args[0]) return ko("Usage : /mdp PSEUDO");
      const p = await compte(args.join(" "));
      const mdp = motDePasseAuHasard();
      await auth.remettreMotDePasse(p.id, mdp);
      return [{ texte: `Nouveau mot de passe de ${p.display_name} : ${mdp}`, genre: "ok", copier: mdp },
              { texte: "Transmettez-le en jeu ; il pourra le changer depuis son profil.", genre: "info" }];
    }

    case "annonce": {
      if (!reste) return ko("Usage : /annonce TITRE | TEXTE");
      const [titre, ...corps] = reste.split("|");
      const n = await moderation.annoncer(titre.trim(), corps.join("|").trim() || null);
      return ok(`Annonce envoyée à ${n} compte${n > 1 ? "s" : ""}.`);
    }

    case "message": {
      if (args.length < 2) return ko("Usage : /message PSEUDO TEXTE");
      const p = await compte(args[0]);
      const texte = args.slice(1).join(" ");
      await moderation.ecrire(p.id, "Message de la modération", texte);
      return ok(`Message envoyé à ${p.display_name}.`);
    }

    case "moderation":
      aller("/administration");
      return info("Ouverture de la modération…");

    case "effacer":
      return [{ effacer: true }];
  }
  return ko("Commande inconnue.");
}

/* ===========================================================================
   L'interface
   ========================================================================= */
let ouverte = false;
let racine, sortie, saisie;
const historique = [];
let curseur = -1;

function ecrire(lignes) {
  for (const l of lignes) {
    if (l.effacer) { sortie.replaceChildren(); continue; }
    sortie.append(el("div.commandes__ligne", { class: `commandes__ligne--${l.genre || "info"}` },
      el("span", l.texte),
      l.copier ? el("button.commandes__copier", {
        type: "button", title: "Copier",
        onclick: (e) => { navigator.clipboard?.writeText(l.copier).then(() => { e.currentTarget.textContent = "copié"; }).catch(() => {}); }
      }, "copier") : null));
  }
  while (sortie.childElementCount > 60) sortie.firstElementChild.remove();
  sortie.scrollTop = sortie.scrollHeight;
}

function basculer(force = !ouverte) {
  ouverte = force;
  racine.classList.toggle("commandes--ouverte", ouverte);
  if (ouverte) setTimeout(() => saisie.focus(), 0);
}

export function monterCommandes(hote = document.body) {
  if (racine) return;
  sortie = el("div.commandes__sortie", { role: "log", "aria-live": "polite" });
  saisie = el("input.commandes__saisie", {
    type: "text", placeholder: "/aide", spellcheck: "false", autocomplete: "off",
    "aria-label": "Commande",
    onkeydown: async (e) => {
      if (e.key === "Escape") { basculer(false); return; }
      if (e.key === "ArrowUp" && historique.length) {
        curseur = Math.min(historique.length - 1, curseur + 1);
        saisie.value = historique[historique.length - 1 - curseur]; e.preventDefault(); return;
      }
      if (e.key === "ArrowDown") {
        curseur = Math.max(-1, curseur - 1);
        saisie.value = curseur < 0 ? "" : historique[historique.length - 1 - curseur]; e.preventDefault(); return;
      }
      if (e.key !== "Enter") return;
      const ligne = saisie.value.trim();
      if (!ligne) return;
      saisie.value = "";
      curseur = -1;
      historique.push(ligne);
      // On n'affiche pas un code tapé : il ne sert qu'une fois, mais on ne le laisse pas traîner.
      ecrire([{ texte: /^\/?role\s/i.test(ligne) ? "/role ••••-••••-••••" : (ligne.startsWith("/") ? ligne : `/${ligne}`), genre: "tape" }]);
      saisie.disabled = true;
      try { ecrire(await executer(ligne)); }
      catch (err) {
        // Nos propres refus sont déjà en français clair : on les montre tels quels.
        const m = String(err?.message || "");
        const clair = /^[A-ZÀ-Ý«]/.test(m) && !/violates|duplicate key|JWT|fetch|syntax/i.test(m);
        ecrire([{ texte: clair ? m : messageErreur(err) || m, genre: "erreur" }]);
      }
      finally { saisie.disabled = false; saisie.focus(); }
    }
  });
  racine = el("div.commandes",
    el("div.commandes__panneau",
      sortie,
      el("label.commandes__ligne-saisie", el("span.commandes__invite", ">"), saisie)),
    el("button.commandes__bouton", {
      type: "button", title: "Commandes (touche ²)", "aria-label": "Commandes",
      onclick: () => basculer()
    }, ">_"));
  hote.append(racine);
  ecrire([{ texte: "Tapez /aide pour la liste des commandes.", genre: "info" }]);

  window.addEventListener("keydown", (e) => {
    const cible = e.target;
    const dansUnChamp = cible?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible?.tagName);
    // La touche « ² » (en haut à gauche), comme la console d'un jeu.
    if ((e.code === "Backquote" || e.key === "²") && !e.ctrlKey && !e.metaKey && !e.altKey && etat.utilisateur
        && (!dansUnChamp || cible === saisie)) {
      e.preventDefault();
      basculer();
    }
  });
}
