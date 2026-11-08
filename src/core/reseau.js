/* ---------------------------------------------------------------------------
 * État de la connexion. Le temps réel exige une liaison ; l'interface, elle,
 * doit rester utilisable et ne jamais perdre une saisie en cours.
 * ------------------------------------------------------------------------- */
import { definir, etat } from "./store.js";
import { emettre } from "./bus.js";
import { toast } from "../ui/toast.js";

let fermerToast = null;
let etaitRompu = false;

export function surveillerReseau() {
  window.addEventListener("online", () => marquer("ok"));
  window.addEventListener("offline", () => marquer("rompu"));
  if (!navigator.onLine) marquer("rompu");
}

/** etat : "ok" | "rompu" | "reprise" | "local" */
export function marquer(nouvelEtat) {
  if (etat.reseau === nouvelEtat) return;
  definir({ reseau: nouvelEtat });
  emettre("reseau:change", nouvelEtat);

  if (nouvelEtat === "rompu") {
    etaitRompu = true;
    fermerToast?.();
    fermerToast = toast("Connexion interrompue", {
      corps: "Vos modifications sont conservées localement et seront envoyées au retour du réseau.",
      type: "alerte", duree: 0
    });
  } else if (nouvelEtat === "reprise") {
    fermerToast?.();
    fermerToast = toast("Reconnexion…", { type: "attn", duree: 0 });
  } else if (nouvelEtat === "ok") {
    fermerToast?.();
    fermerToast = null;
    if (etaitRompu) {
      etaitRompu = false;
      toast("Connexion rétablie", { type: "ok" });
      emettre("reseau:retabli");
    }
  }
}
