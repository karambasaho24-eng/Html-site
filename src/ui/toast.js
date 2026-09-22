/* ---------------------------------------------------------------------------
 * Notifications éphémères.
 * ------------------------------------------------------------------------- */
import { el } from "./dom.js";
import { icone } from "./icons.js";
import { docHote } from "../core/hote.js";

const ICONES = { info: "cloche", ok: "coche", alerte: "croix", attn: "drapeau" };

function calque() {
  return docHote().getElementById("calque-toasts");
}

export function toast(titre, options = {}) {
  const { corps = null, type = "info", duree = 4200, action = null } = options;
  const hote = calque();
  if (!hote) return () => {};

  const noeud = el(`div.toast.toast--${type}`, { role: "status" },
    el("span", { style: { color: "var(--laiton)", marginTop: "1px" } }, icone(ICONES[type] || "cloche", 15)),
    el("div", { style: { flex: "1", minWidth: "0" } },
      el("span.toast__titre", titre),
      corps && el("span.toast__corps", corps)
    ),
    action && el("button.btn.btn--fantome.petit", {
      onclick: () => { action.action(); fermer(); }
    }, action.libelle)
  );

  hote.appendChild(noeud);
  let minuteur = duree > 0 ? setTimeout(fermer, duree) : null;

  noeud.addEventListener("mouseenter", () => { if (minuteur) clearTimeout(minuteur); });
  noeud.addEventListener("mouseleave", () => { if (duree > 0) minuteur = setTimeout(fermer, 1600); });
  noeud.addEventListener("click", (e) => { if (!e.target.closest("button")) fermer(); });

  function fermer() {
    if (!noeud.isConnected) return;
    noeud.classList.add("part");
    setTimeout(() => noeud.remove(), 170);
  }
  return fermer;
}

export const succes = (titre, corps) => toast(titre, { corps, type: "ok" });
export const erreur = (titre, corps) => toast(titre, { corps, type: "alerte", duree: 6500 });
export const avertir = (titre, corps) => toast(titre, { corps, type: "attn", duree: 5200 });

/** Transforme une erreur Supabase/JS en message lisible. */
export function messageErreur(err) {
  if (!err) return "Erreur inconnue.";
  const brut = err.message || String(err);
  const table = {
    "Invalid login credentials": "Identifiants incorrects.",
    "User already registered": "Un compte existe déjà avec cette adresse.",
    "Email not confirmed": "Adresse non confirmée : ouvrez le courriel reçu à la création du compte.",
    "Permission refusée": "Vous n'avez pas les droits nécessaires.",
    "Code de classe introuvable": "Ce code ne correspond à aucune classe.",
    "Les inscriptions sont fermées": "Les inscriptions à cette classe sont fermées.",
    "Failed to fetch": "Serveur injoignable. Vérifiez votre connexion."
  };
  for (const [motif, message] of Object.entries(table)) {
    if (brut.includes(motif)) return message;
  }
  if (err.code === "23505") return "Cet élément existe déjà.";
  if (err.code === "42501") return "Vous n'avez pas les droits nécessaires.";
  return brut;
}
