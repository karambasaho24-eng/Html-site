/* ---------------------------------------------------------------------------
 * Livret de service.
 *
 * Une note sur vingt ne veut rien dire dans un corps militaire, et personne
 * ne se bat pour une moyenne. Ce qui fait tenir un RP d'académie, c'est que
 * les actes laissent des traces : une mention, un blâme, une promotion, un
 * rang de promotion qui décide de l'affectation.
 *
 * Le livret donne à l'encadrement une autorité qui existe dans le monde, et
 * aux membres un dossier qui les suit d'une séance à l'autre.
 * ------------------------------------------------------------------------- */
import { el, render } from "../ui/dom.js";
import { icone } from "../ui/icons.js";
import { livret } from "../data/index.js";
import { formulaire, confirmer } from "../ui/modal.js";
import { succes, erreur, messageErreur } from "../ui/toast.js";
import { blocVide } from "../ui/fragments.js";
import { depuis } from "../core/util.js";
import {
  GENRES_LIVRET, aptitudesDisponibles, gradesDisponibles,
  dateRP, reglagesRP, nomAffiche, libelleRang
} from "../core/rp.js";

/* ===========================================================================
   Affichage du livret
   ========================================================================= */

export function listeEntrees(entrees, { classe, nomDe, surSuppression = null }) {
  if (!entrees.length) {
    return blocVide("Livret vierge",
      "Rien n'y est encore inscrit — ni mention, ni sanction, ni évaluation.");
  }
  const rp = reglagesRP(classe);

  return el("div.liste", entrees.map((e) => {
    const genre = GENRES_LIVRET[e.kind] || GENRES_LIVRET.note;
    return el("div.liste__item",
      el("span", { style: { color: `var(--${genre.teinte || "texte-faible"})`, flex: "0 0 auto" } },
        icone(genre.icone, 16)),
      el("div.liste__principal",
        el("div.liste__nom",
          e.kind === "aptitude" && e.score != null
            ? `${e.label} — ${e.score}/${e.max_score}`
            : e.label),
        e.body ? el("div.petit.doux", { style: { whiteSpace: "pre-wrap" } }, e.body) : null,
        el("div.liste__detail",
          [nomDe ? nomDe(e.user_id) : null,
           genre.libelle,
           rp.actif ? dateRP(e.created_at, rp) : depuis(e.created_at)
          ].filter(Boolean).join(" · "))
      ),
      el("div.liste__fin",
        e.kind === "promotion" && e.rank_to ? el("span.etiq.etiq--laiton", e.rank_to) : null,
        surSuppression
          ? el("button.btn.btn--fantome.btn--icone", {
              "aria-label": "Retirer du livret",
              onclick: async () => {
                const ok = await confirmer({
                  titre: "Retirer cette inscription",
                  message: `« ${e.label} » sera effacée du livret. Un livret se corrige, il ne se réécrit pas à la légère.`,
                  libelle: "Retirer", danger: true
                });
                if (!ok) return;
                await livret.supprimer(e.id);
                surSuppression();
              }
            }, icone("corbeille", 14))
          : null
      )
    );
  }));
}

/* ===========================================================================
   Inscrire au livret
   ========================================================================= */

/**
 * `membres` : [{ user_id, nom }] — à qui l'inscription s'adresse.
 * Renvoie l'entrée créée, ou null.
 */
export async function inscrireAuLivret({ classe, membres, auteurId, sessionId = null, membrePreselectionne = null }) {
  if (!membres.length) {
    erreur("Personne à inscrire", "L'espace ne compte encore aucun membre.");
    return null;
  }

  const genre = await formulaire({
    titre: "Inscrire au livret",
    champs: [{
      cle: "kind", label: "Nature de l'inscription", type: "select", valeur: "mention",
      options: Object.entries(GENRES_LIVRET).map(([cle, g]) => ({ valeur: cle, libelle: g.libelle })),
      aide: "Une promotion s'applique aussitôt au grade porté sur la fiche."
    }],
    libelle: "Continuer"
  });
  if (!genre) return null;

  const g = GENRES_LIVRET[genre.kind];
  const aptitudes = aptitudesDisponibles(classe);
  const grades = gradesDisponibles(classe);

  const champs = [
    { cle: "user_id", label: "Concerne", type: "select",
      valeur: membrePreselectionne || membres[0].user_id,
      options: membres.map((m) => ({ valeur: m.user_id, libelle: m.nom })) }
  ];

  if (genre.kind === "aptitude") {
    champs.push(
      { cle: "label", label: "Axe évalué", type: "select", valeur: aptitudes[0],
        options: aptitudes.map((a) => ({ valeur: a, libelle: a })) },
      { cle: "score", label: "Résultat", type: "number", valeur: 7, min: 0, max: 100, step: 0.5 },
      { cle: "max_score", label: "Sur", type: "number", valeur: 10, min: 1, max: 100 }
    );
  } else if (genre.kind === "promotion") {
    champs.push(grades.length
      ? { cle: "rank_to", label: "Nouveau grade", type: "select", valeur: grades[0],
          options: grades.map((r) => ({ valeur: r, libelle: r })) }
      : { cle: "rank_to", label: "Nouveau grade", requis: true });
  } else {
    champs.push({ cle: "label", label: "Motif", requis: true,
      placeholder: genre.kind === "sanction"
        ? "Insubordination lors de la manœuvre"
        : "Sang-froid face au danger" });
  }

  champs.push({ cle: "body", label: "Circonstances", type: "textarea", lignes: 3,
    aide: "Rédigez-le comme un rapport : c'est ce que liront les autres." });

  const sortie = await formulaire({
    titre: g.libelle, note: g.aide, champs, libelle: "Inscrire", large: true
  });
  if (!sortie) return null;

  const donnees = {
    class_id: classe.id,
    user_id: sortie.user_id,
    author_id: auteurId,
    session_id: sessionId,
    kind: genre.kind,
    label: genre.kind === "promotion"
      ? `Élevé au grade de ${sortie.rank_to}`
      : sortie.label,
    body: sortie.body || null,
    score: genre.kind === "aptitude" ? Number(sortie.score) : null,
    max_score: genre.kind === "aptitude" ? Number(sortie.max_score) : null,
    rank_to: genre.kind === "promotion" ? sortie.rank_to : null
  };

  try {
    const entree = await livret.creer(donnees);
    const qui = membres.find((m) => m.user_id === sortie.user_id)?.nom || "";
    succes(`${g.libelle} inscrite`, qui);
    return entree;
  } catch (err) {
    erreur("Inscription impossible", messageErreur(err));
    return null;
  }
}

/* ===========================================================================
   Classement de promotion
   ========================================================================= */

/**
 * Dans bien des univers, le rang décide de l'affectation — les dix premiers
 * d'une brigade choisissent leur corps. Il doit donc se lire d'un coup d'œil,
 * et la coupure doit être visible.
 */
export function tableauClassement(classement, { nomDe, coupure = 10, moiId = null }) {
  if (!classement.length) {
    return blocVide("Classement vide",
      "Il s'établit à partir des aptitudes inscrites au livret. Évaluez un premier axe pour l'ouvrir.");
  }

  return el("div.liste", classement.map((ligne) => {
    const dansLesPremiers = ligne.rang <= coupure;
    const moi = ligne.user_id === moiId;
    return el("div.liste__item", {
      "aria-current": String(moi),
      style: dansLesPremiers ? { boxShadow: "inset 2px 0 0 var(--laiton)" } : null
    },
      el("span.mono", {
        style: {
          flex: "0 0 2.4em", textAlign: "right",
          color: dansLesPremiers ? "var(--laiton-clair)" : "var(--texte-faible)",
          fontWeight: dansLesPremiers ? "600" : "400"
        }
      }, libelleRang(ligne.rang)),
      el("div.liste__principal",
        el("div.liste__nom", nomDe(ligne.user_id) + (moi ? " (vous)" : "")),
        el("div.liste__detail",
          `${ligne.evaluations} aptitude${ligne.evaluations > 1 ? "s" : ""} évaluée${ligne.evaluations > 1 ? "s" : ""}`)
      ),
      el("div.liste__fin",
        el("span.mono", { style: { fontVariantNumeric: "tabular-nums" } }, `${ligne.taux} %`)
      )
    );
  }));
}

/** Bandeau d'explication de la coupure, quand elle a un sens dans l'univers. */
export function noteCoupure(coupure = 10) {
  return el("p.petit.faible",
    `Les ${coupure} premiers sont mis en avant : dans beaucoup d'univers, c'est ce rang `
    + `qui ouvre le choix de l'affectation.`);
}
