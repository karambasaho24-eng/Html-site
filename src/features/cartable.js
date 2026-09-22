/* ---------------------------------------------------------------------------
 * Le cartable et la trousse.
 *
 * Avant d'entrer, on prépare ses affaires. L'encadrement a demandé le cahier
 * rouge et une plume : celui qui arrive les mains vides le sait, et tout le
 * monde le voit. C'est une scène à jouer, pas une sanction automatique — le
 * site constate, il ne punit pas.
 *
 * Le cartable sert aussi de frontière : un support laissé chez soi ne peut
 * pas être inspecté (voir inspect_notebook et app_can_read_notebook). Ce
 * n'est donc pas un décor, c'est la limite de ce qui est consultable.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { etat } from "../core/store.js";
import { cahiers, cartable as depotCartable } from "../data/index.js";
import { ouvrirModale } from "../ui/modal.js";
import { succes, erreur, messageErreur } from "../ui/toast.js";
import { L } from "../core/lexique.js";

/** Ce qu'on met dans une trousse quand personne n'a rien demandé de précis. */
export const TROUSSE_DEFAUT = ["Plume", "Encre", "Crayon", "Gomme", "Règle", "Buvard"];

const NOMS_SUPPORT = { feuille: "Feuille", cahier: "Cahier", carnet: "Carnet", dossier: "Dossier" };

/** La liste du matériel attendu, telle que l'encadrement l'a fixée. */
export function materielAttendu(classe) {
  const m = classe?.settings?.materiel || {};
  return {
    supports: Array.isArray(m.supports) ? m.supports : [],
    fournitures: Array.isArray(m.fournitures) ? m.fournitures : []
  };
}

/**
 * « Je prépare mes affaires. »
 * Ouvre le sac, montre ce qu'on possède, et laisse choisir ce qu'on emporte.
 */
export async function preparerAffaires({ classe, surEnregistrement = null }) {
  const attendu = materielAttendu(classe);
  const [mesSupports, sac] = await Promise.all([
    cahiers.mesCahiers(etat.utilisateur.id).catch(() => []),
    depotCartable.pour(classe.id, etat.utilisateur.id).catch(() => null)
  ]);

  const emportes = new Map(Object.entries(
    Array.isArray(sac?.notebooks)
      ? Object.fromEntries((sac.notebooks || []).map((id) => [String(id), ""]))
      : (sac?.notebooks || {})));
  const trousse = new Set((sac?.supplies || []).map(String));
  const fournituresOffertes = [...new Set([...TROUSSE_DEFAUT, ...attendu.fournitures])];

  const demandes = new Set(attendu.supports.map((s) => String(s.id)));
  const demandesParTitre = new Set(
    attendu.supports.map((s) => String(s.title || "").trim().toLowerCase()));
  const zoneRabat = el("div.cartable__rabat");

  const enregistre = await ouvrirModale({
    titre: "Préparer mes affaires",
    large: true,
    corps: () => {
      const noeud = el("div.cartable",
        el("p.petit.faible",
          "Ce que vous mettez dans votre sac est ce dont vous disposerez en séance — "
          + "et c'est aussi la seule chose que l'encadrement pourra vous demander d'ouvrir."),

        attendu.supports.length || attendu.fournitures.length
          ? el("div.cartable__consigne",
              el("span.etiq.etiq--attn", icone("alerte", 12), "Demandé pour cette séance"),
              el("p.petit",
                [...attendu.supports.map((s) => s.title),
                 ...attendu.fournitures].join(" · ") || "—"))
          : null,

        el("div.cartable__sac",
          el("div.cartable__poignee", { "aria-hidden": "true" }),
          zoneRabat,

          el("section.cartable__poche",
            el("h3.cartable__titre", icone("cahier", 14), " Supports"),
            mesSupports.length
              ? el("div.cartable__objets", mesSupports.map((c) => objetSupport(c)))
              : el("p.petit.faible",
                  `Votre étagère est vide : créez un ${L("cahier")} avant d'entrer en séance.`)
          ),

          el("section.cartable__poche.cartable__poche--trousse",
            el("h3.cartable__titre", icone("crayon", 14), " Trousse"),
            el("div.trousse",
              el("div.trousse__rabat", { "aria-hidden": "true" }),
              el("div.trousse__contenu", fournituresOffertes.map((f) => objetFourniture(f)))
            )
          )
        )
      );
      majRabat();
      return noeud;
    },
    actions: [
      { libelle: "Annuler", valeur: null },
      {
        libelle: "Boucler le sac", variante: "primaire",
        action: async () => {
          try {
            await depotCartable.enregistrer(classe.id, etat.utilisateur.id, {
              notebooks: Object.fromEntries(emportes), supplies: [...trousse]
            });
            return true;
          } catch (err) {
            erreur("Sac non enregistré", messageErreur(err));
            return false;
          }
        }
      }
    ]
  });

  function objetSupport(c) {
    const pris = emportes.has(String(c.id));
    // Demandé par son nom : « apportez votre cahier de manœuvre ».
    const demande = demandes.has(String(c.id))
      || demandesParTitre.has(String(c.title || "").trim().toLowerCase());
    const bouton = el("button.objet", {
      type: "button",
      dataset: { support: c.support || "cahier" },
      "aria-pressed": String(pris),
      class: demande ? "objet--demande" : "",
      onclick: (e) => {
        const cle = String(c.id);
        if (emportes.has(cle)) emportes.delete(cle); else emportes.set(cle, c.title);
        e.currentTarget.setAttribute("aria-pressed", String(emportes.has(cle)));
        e.currentTarget.classList.toggle("objet--pris", emportes.has(cle));
        majRabat();
      }
    },
      el("span.objet__figure", { dataset: { objet: c.support || "cahier" }, "aria-hidden": "true" }),
      el("span.objet__nom", c.title),
      el("span.objet__type", NOMS_SUPPORT[c.support] || "Cahier"),
      demande ? el("span.objet__demande", "demandé") : null
    );
    if (pris) bouton.classList.add("objet--pris");
    return bouton;
  }

  function objetFourniture(f) {
    const pris = trousse.has(f);
    const demande = attendu.fournitures.some((x) => x.toLowerCase() === f.toLowerCase());
    const bouton = el("button.fourniture", {
      type: "button",
      "aria-pressed": String(pris),
      class: demande ? "fourniture--demande" : "",
      onclick: (e) => {
        if (trousse.has(f)) trousse.delete(f); else trousse.add(f);
        e.currentTarget.setAttribute("aria-pressed", String(trousse.has(f)));
        e.currentTarget.classList.toggle("fourniture--prise", trousse.has(f));
        majRabat();
      }
    }, f);
    if (pris) bouton.classList.add("fourniture--prise");
    return bouton;
  }

  /** Le rabat annonce le poids du sac et ce qui manque encore. */
  function majRabat() {
    const manque = depotCartable.manquants(
      { notebooks: Object.fromEntries(emportes), supplies: [...trousse] }, attendu);
    const total = emportes.size + trousse.size;
    render(zoneRabat,
      el("span.cartable__compte",
        total ? `${total} objet${total > 1 ? "s" : ""} dans le sac` : "Sac vide"),
      manque.supports.length || manque.fournitures.length
        ? el("span.cartable__manque", icone("alerte", 12), " Il manque : ",
            [...manque.supports.map((s) => s.title), ...manque.fournitures].join(", "))
        : el("span.cartable__complet", icone("coche", 12), " Rien n'a été oublié")
    );
  }

  if (enregistre) {
    succes("Sac bouclé");
    surEnregistrement?.({ notebooks: Object.fromEntries(emportes), supplies: [...trousse] });
  }
  return enregistre === true;
}

/**
 * Le contrôle du matériel, vu de l'estrade : qui a quoi, qui a oublié quoi.
 * On ne liste pas le contenu du sac dans le détail — seulement l'écart avec
 * ce qui a été demandé, parce que c'est cela qui se joue.
 */
export function ligneMateriel(sac, attendu, options = {}) {
  if (!sac) {
    return el("span.etiq.etiq--attn", icone("alerte", 12),
      options.court ? "Sac non préparé" : "N'a pas préparé son sac");
  }
  const manque = depotCartable.manquants(sac, attendu);
  const nb = manque.supports.length + manque.fournitures.length;
  if (!nb) {
    return el("span.etiq.etiq--ok", icone("coche", 12),
      options.court ? "En ordre" : "Matériel complet");
  }
  const noms = [...manque.supports.map((s) => s.title), ...manque.fournitures];
  return el("span.etiq.etiq--attn", { title: `Manque : ${noms.join(", ")}` },
    icone("alerte", 12), options.court ? `${nb} oubli${nb > 1 ? "s" : ""}` : `Oublié : ${noms.join(", ")}`);
}
