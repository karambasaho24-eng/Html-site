/* ---------------------------------------------------------------------------
 * L'accès au site : suspendu, banni, connexion bannie (0033).
 *
 * À l'ouverture, puis de temps en temps, on demande à la base si l'accès est
 * bloqué. Si oui : un écran qui dit pourquoi et jusqu'à quand, et l'on est
 * déconnecté. La base refuse de son côté la connexion et l'inscription.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { etat, observer } from "../core/store.js";
import { profils } from "../data/index.js";
import { icone } from "../ui/icons.js";
import { deconnecter } from "../core/session.js";

let ecran = null;

export function surveillerAcces() {
  verifier();
  observer(["utilisateur"], () => verifier());
  setInterval(() => { if (document.visibilityState === "visible") verifier(); }, 90_000);
}

async function verifier() {
  let r = null;
  try { r = await profils.monAcces(); } catch { return; }   // fonction absente : on laisse passer
  // Pas bloqué : rien à faire. (L'écran déjà montré reste jusqu'à ce qu'on le ferme :
  // une fois déconnecté, la base ne voit plus le compte, mais le message vaut toujours.)
  if (!r?.bloque) return;
  afficher(r);
  if (etat.utilisateur) { try { await deconnecter(); } catch { /* déjà dehors */ } }
}

function afficher(r) {
  ecran?.remove();
  const quand = r.jusqua ? new Date(r.jusqua).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : null;
  const titre = r.genre === "temporaire" ? "Compte suspendu"
    : r.genre === "ip" ? "Accès bloqué" : "Compte banni";
  const phrase = r.genre === "temporaire" ? `Votre compte est suspendu jusqu'au ${quand}.`
    : r.genre === "ip" ? "Votre compte et cette connexion sont bannis définitivement."
    : "Votre compte est banni définitivement.";
  ecran = el("div.acces-bloque", { role: "alertdialog", "aria-modal": "true" },
    el("div.acces-bloque__boite",
      el("div.bannissement__sceau", icone("bouclier", 30)),
      el("h2", titre),
      el("p", phrase),
      el("div.bannissement__raison", el("span.bannissement__etiquette", "Raison"), el("p", r.raison || "—")),
      r.genre === "temporaire"
        ? el("p.petit.faible", "Vous pourrez revenir à la fin de la suspension.")
        : el("p.petit.faible", "Si vous pensez qu'il s'agit d'une erreur, contactez l'administration du serveur."),
      el("button.btn", { type: "button", onclick: () => { ecran?.remove(); ecran = null; } }, "Compris")));
  document.body.append(ecran);
}
