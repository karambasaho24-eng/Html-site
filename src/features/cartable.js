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

/**
 * Le nom de fichier d'un objet : « Règle » → `regle.png`.
 *
 * Tant que l'image n'existe pas, le navigateur échoue silencieusement sur
 * l'url et la figure dessinée en CSS reste visible dessous. On peut donc
 * livrer les images une par une sans jamais casser l'écran.
 */
export function imageObjet(nom) {
  const cle = String(nom).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `assets/objets/${cle}.png`;
}

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
 *
 * Deux plateaux et un geste : ce qui est sur l'étagère, ce qui est dans le
 * sac, et l'objet qui passe de l'un à l'autre — en le voyant voler, parce
 * qu'un inventaire où les choses se téléportent n'est pas un sac, c'est un
 * formulaire à cases.
 *
 * `session` change la nature du geste. Sans elle, on range ses affaires
 * tranquillement : le chargement est permanent, il reste d'une fois sur
 * l'autre. Avec elle, on s'équipe POUR CETTE SÉANCE — le sac garde son
 * contenu, mais il faut reposer la main dessus. C'est la différence entre
 * posséder une plume et l'avoir sur soi ce matin.
 */
export async function preparerAffaires({ classe, session = null, surEnregistrement = null }) {
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
  const etagere = el("div.plateau__objets");
  const dansLeSac = el("div.plateau__objets");

  /* --- Les objets, une fois pour toutes -----------------------------------
     Chaque objet est un nœud unique qu'on DÉPLACE d'un plateau à l'autre.
     Le recréer à chaque clic casserait l'animation : on ne peut pas faire
     voler un élément qui vient de naître. */
  const noeuds = new Map();

  for (const c of mesSupports) noeuds.set(`s:${c.id}`, objetSupport(c));
  for (const f of fournituresOffertes) noeuds.set(`f:${f}`, objetFourniture(f));

  function estPris(cle) {
    return cle.startsWith("s:") ? emportes.has(cle.slice(2)) : trousse.has(cle.slice(2));
  }

  function placer() {
    for (const [cle, noeud] of noeuds) {
      (estPris(cle) ? dansLeSac : etagere).appendChild(noeud);
    }
    majPlateaux();
  }

  /**
   * L'objet vole d'un plateau à l'autre.
   *
   * Technique FLIP : on relève sa position AVANT de le déplacer, on le
   * déplace dans le DOM, on relève sa position APRÈS, puis on le renvoie
   * optiquement à son point de départ avant de relâcher. Le navigateur
   * interpole le reste. Rien n'est simulé : c'est bien le même objet qui
   * traverse, pas une copie qui s'allume ailleurs.
   */
  function deplacer(cle) {
    const noeud = noeuds.get(cle);
    const avant = noeud.getBoundingClientRect();

    const versLeSac = !estPris(cle);
    if (cle.startsWith("s:")) {
      const id = cle.slice(2);
      if (versLeSac) emportes.set(id, mesSupports.find((c) => String(c.id) === id)?.title || "");
      else emportes.delete(id);
    } else {
      const nom = cle.slice(2);
      if (versLeSac) trousse.add(nom); else trousse.delete(nom);
    }

    (versLeSac ? dansLeSac : etagere).appendChild(noeud);
    noeud.setAttribute("aria-pressed", String(versLeSac));
    noeud.classList.toggle("objet--pris", versLeSac);

    const apres = noeud.getBoundingClientRect();
    const dx = avant.left - apres.left;
    const dy = avant.top - apres.top;

    if (dx || dy) {
      // Un léger sursaut d'échelle : l'objet qu'on saisit se soulève avant
      // de se poser. Sans cela, le trajet est juste, mais mou.
      noeud.style.transition = "none";
      noeud.style.transform = `translate(${dx}px, ${dy}px) scale(${versLeSac ? 1.12 : 0.92})`;
      noeud.style.zIndex = "5";
      requestAnimationFrame(() => {
        noeud.style.transition = "transform 320ms cubic-bezier(.34,1.3,.5,1)";
        noeud.style.transform = "";
        setTimeout(() => { noeud.style.zIndex = ""; noeud.style.transition = ""; }, 340);
      });
    }
    majPlateaux();
  }

  const enregistre = await ouvrirModale({
    titre: session ? "Équiper mes affaires" : "Préparer mes affaires",
    large: true,
    corps: () => {
      const noeud = el("div.cartable",
        el("p.petit.faible",
          session
            ? "Ce que vous emportez en séance. Le sac garde son contenu d'une fois "
              + "sur l'autre — il faut seulement reposer la main dessus avant d'entrer."
            : "Ce que vous mettez dans votre sac est ce dont vous disposerez en séance — "
              + "et c'est aussi la seule chose que l'encadrement pourra vous demander d'ouvrir."),

        attendu.supports.length || attendu.fournitures.length
          ? el("div.cartable__consigne",
              el("span.etiq.etiq--attn", icone("alerte", 12), "Demandé pour cette séance"),
              el("p.petit",
                [...attendu.supports.map((s) => s.title),
                 ...attendu.fournitures].join(" · ") || "—"))
          : null,

        el("div.etabli",
          el("section.plateau.plateau--etagere",
            el("h3.plateau__titre", icone("grille", 13), " Sur l'étagère"),
            etagere,
            el("p.plateau__vide.petit.faible", "Tout est dans le sac.")),

          el("section.plateau.plateau--sac",
            el("h3.plateau__titre", icone("sac", 13), " Dans mon sac"),
            dansLeSac,
            el("p.plateau__vide.petit.faible", "Le sac est vide. Cliquez un objet pour l'y mettre."))
        ),

        zoneRabat
      );
      placer();
      return noeud;
    },
    actions: [
      { libelle: "Annuler", valeur: null },
      {
        libelle: session ? "Je les ai sur moi" : "Boucler le sac", variante: "primaire",
        action: async () => {
          try {
            await depotCartable.enregistrer(classe.id, etat.utilisateur.id, {
              notebooks: Object.fromEntries(emportes), supplies: [...trousse],
              session: session?.id || null
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
    const demande = demandes.has(String(c.id))
      || demandesParTitre.has(String(c.title || "").trim().toLowerCase());
    const bouton = el("button.objet", {
      type: "button",
      dataset: { support: c.support || "cahier" },
      "aria-pressed": String(emportes.has(String(c.id))),
      class: demande ? "objet--demande" : "",
      onclick: () => deplacer(`s:${c.id}`)
    },
      el("span.objet__figure", {
        dataset: { objet: c.support || "cahier" }, "aria-hidden": "true",
        style: { backgroundImage: `url("${imageObjet(c.support || "cahier")}")` }
      }),
      el("span.objet__nom", c.title),
      el("span.objet__type", NOMS_SUPPORT[c.support] || "Cahier"),
      demande ? el("span.objet__demande", "demandé") : null
    );
    if (emportes.has(String(c.id))) bouton.classList.add("objet--pris");
    return bouton;
  }

  function objetFourniture(f) {
    const demande = attendu.fournitures.some((x) => x.toLowerCase() === f.toLowerCase());
    const bouton = el("button.objet.objet--fourniture", {
      type: "button",
      "aria-pressed": String(trousse.has(f)),
      class: demande ? "objet--demande" : "",
      onclick: () => deplacer(`f:${f}`)
    },
      el("span.objet__figure.objet__figure--fourniture", {
        "aria-hidden": "true",
        style: { backgroundImage: `url("${imageObjet(f)}")` }
      }),
      el("span.objet__nom", f),
      demande ? el("span.objet__demande", "demandé") : null
    );
    if (trousse.has(f)) bouton.classList.add("objet--pris");
    return bouton;
  }

  /** Le rabat annonce le poids du sac et ce qui manque encore. */
  function majPlateaux() {
    etagere.parentElement?.classList.toggle("plateau--nu", !etagere.children.length);
    dansLeSac.parentElement?.classList.toggle("plateau--nu", !dansLeSac.children.length);

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
    succes(session ? "Affaires équipées" : "Sac bouclé");
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
  // Un sac préparé un autre jour n'est pas un sac qu'on a sur soi. Le dire
  // à part : « il a oublié sa plume » et « il n'a pas repris ses affaires »
  // ne se jouent pas de la même manière.
  if (options.session && String(sac.last_session) !== String(options.session)) {
    return el("span.etiq.etiq--attn", icone("alerte", 12),
      options.court ? "Pas équipé" : "N'a pas repris ses affaires");
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
