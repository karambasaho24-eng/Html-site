/* ---------------------------------------------------------------------------
 * Un papier : on l'écrit, on le signe, on le donne, on le déchire ou on le
 * jette. Seul celui qui l'a en main le voit ici ; écrire coûte de l'encre
 * (0048), comme dans un cahier. Signé, le texte ne bouge plus.
 * ------------------------------------------------------------------------- */
import { el } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { aller } from "../core/router.js";
import { debounce } from "../core/util.js";
import { papiers, transferts } from "../data/index.js";
import { blocVide } from "../ui/fragments.js";
import { confirmer } from "../ui/modal.js";
import { sortiePapier } from "../ui/animations.js";
import { erreur, succes, messageErreur } from "../ui/toast.js";
import { donner } from "../features/transferts.js";
import { chargerCommerce } from "../features/encre.js";

export default async function vuePapier({ params }) {
  const papier = await papiers.lire(params.id).catch(() => null);
  if (!papier || papier.holder_id !== etat.utilisateur.id) {
    return {
      noeud: el("div.page", blocVide("Papier introuvable",
        "Il a peut-être été donné, jeté, ou il n'est pas entre vos mains.",
        { libelle: "Revenir à mes affaires", action: () => aller("/") })),
      titre: "Papier introuvable"
    };
  }

  const { tendus } = await transferts.enAttente(etat.utilisateur.id).catch(() => ({ tendus: [] }));
  const tendu = tendus.some((r) => r.type === "papier" && r.objetId === papier.id);
  const fige = tendu || Boolean(papier.seal);
  const etatSauve = el("span.petit.faible", { "aria-live": "polite" });

  const sauver = debounce(async () => {
    try {
      await papiers.majorer(papier.id, { title: titre.value.trim() || "Papier", body: corps.value });
      etatSauve.textContent = "Enregistré";
      chargerCommerce();
    } catch (err) {
      etatSauve.textContent = "";
      erreur("Non enregistré", messageErreur(err));
    }
  }, 700);

  const titre = el("input.papier__titre", {
    value: papier.title || "", placeholder: "Titre", "aria-label": "Titre du papier",
    readOnly: fige, oninput: () => { etatSauve.textContent = "…"; sauver(); }
  });
  const corps = el("textarea.papier__corps", {
    value: papier.body || "", placeholder: "Écrivez ici…", "aria-label": "Texte du papier",
    readOnly: fige, oninput: () => { etatSauve.textContent = "…"; sauver(); }
  });
  const feuille = el("article.papier", titre, corps,
    papier.seal ? el("p.papier__sceau", icone("cachet", 14), papier.seal) : null);

  async function signer() {
    const ok = await confirmer({ titre: "Signer ce papier",
      message: "Votre nom sera apposé en bas. Signé, le texte ne pourra plus être modifié.", libelle: "Signer" });
    if (!ok) return;
    try {
      await papiers.majorer(papier.id, { seal: `Signé par ${etat.profil?.display_name || "—"}, le ${new Date().toLocaleDateString("fr-FR")}` });
      aller(`/papier/${papier.id}`, true);
    } catch (err) { erreur("Signature impossible", messageErreur(err)); }
  }

  async function detruire(maniere) {
    const ok = await confirmer({
      titre: maniere === "dechire" ? "Déchirer ce papier" : "Jeter ce papier",
      message: "Il disparaît pour de bon, pour tout le monde.", libelle: maniere === "dechire" ? "Déchirer" : "Jeter", danger: true
    });
    if (!ok) return;
    const sortie = sortiePapier(feuille, maniere);
    try { await papiers.supprimer(papier.id); await sortie.fini; succes(maniere === "dechire" ? "Déchiré" : "Jeté"); aller("/"); }
    catch (err) { sortie.annuler(); erreur("Impossible", messageErreur(err)); }
  }

  const gestes = el("div.papier__gestes",
    tendu ? el("span.etiq", icone("cadenas", 12), "Tendu : en attente de réponse") : [
      papier.seal ? null : el("button.btn", { type: "button", onclick: signer }, icone("cachet", 15), "Signer"),
      el("button.btn.btn--primaire", { type: "button",
        onclick: async () => { if (await donner({ type: "papier", objetId: papier.id, titre: papier.title || "Papier" })) aller("/"); }
      }, icone("echange", 15), "Donner"),
      el("button.btn.btn--fantome", { type: "button", onclick: () => detruire("dechire") }, "Déchirer"),
      el("button.btn.btn--fantome", { type: "button", onclick: () => detruire("jete") }, icone("corbeille", 15), "Jeter")
    ],
    etatSauve);

  return { noeud: el("div.page.page--papier", gestes, feuille), titre: papier.title || "Papier" };
}
