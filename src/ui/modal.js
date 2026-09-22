/* ---------------------------------------------------------------------------
 * Modales, confirmations, invites et menus contextuels.
 * Chaque modale renvoie une promesse résolue avec le résultat, ou null.
 * ------------------------------------------------------------------------- */
import { el } from "./dom.js";
import { icone } from "./icons.js";
import { docHote, fenetreHote } from "../core/hote.js";

const pile = [];

function calque() { return docHote().getElementById("calque-modales"); }

/**
 * ouvrirModale({ titre, corps, actions, large })
 * `corps` reçoit un objet { fermer, valider } et renvoie un noeud.
 */
export function ouvrirModale({ titre, corps, actions, large = false, surFermeture = null }) {
  return new Promise((resoudre) => {
    const hote = calque();
    let resolue = false;

    const api = {
      fermer(valeur = null) {
        if (resolue) return;
        resolue = true;
        voile.remove();
        pile.pop();
        clavier.removeEventListener("keydown", surTouche);
        surFermeture?.(valeur);
        resoudre(valeur);
        pile.at(-1)?.focus?.();
      }
    };

    const contenu = typeof corps === "function" ? corps(api) : corps;

    const boutons = (actions || [{ libelle: "Fermer", variante: "" }]).map((a) =>
      el(`button.btn${a.variante ? `.btn--${a.variante}` : ""}`, {
        onclick: async (ev) => {
          if (!a.action) return api.fermer(a.valeur ?? null);
          ev.currentTarget.disabled = true;
          try {
            const r = await a.action(api);
            // `false` maintient la modale ouverte (validation en échec).
            // `undefined` signifie « pas de valeur produite » ; `null` est une
            // valeur à part entière et ne doit jamais devenir `true`.
            if (r === false) return;
            api.fermer(r === undefined ? (a.valeur ?? true) : r);
          } finally {
            if (ev.currentTarget.isConnected) ev.currentTarget.disabled = false;
          }
        },
        type: "button"
      }, a.libelle)
    );

    const boite = el(`div.modale${large ? ".modale--large" : ""}`, {
      role: "dialog", "aria-modal": "true", "aria-label": titre
    },
      el("div.modale__entete",
        el("h2.modale__titre", titre),
        el("button.btn.btn--fantome.btn--icone", {
          onclick: () => api.fermer(null), "aria-label": "Fermer", type: "button"
        }, icone("croix", 16))
      ),
      el("div.modale__corps", contenu),
      boutons.length ? el("div.modale__pied", boutons) : null
    );

    const voile = el("div.voile", {
      onmousedown: (e) => { if (e.target === voile) api.fermer(null); }
    }, boite);

    function surTouche(e) {
      if (pile.at(-1) !== boite) return;
      if (e.key === "Escape") { e.stopPropagation(); api.fermer(null); }
      if (e.key === "Tab") piegerFocus(e, boite);
    }

    hote.appendChild(voile);
    pile.push(boite);
    // Le même document du début à la fin : si l'interface déménage pendant
    // qu'une modale est ouverte, on retire l'écouteur là où on l'a posé.
    const clavier = hote.ownerDocument;
    clavier.addEventListener("keydown", surTouche);

    const premier = boite.querySelector("input, textarea, select, button.btn--primaire");
    setTimeout(() => premier?.focus?.(), 30);
  });
}

function piegerFocus(event, racine) {
  const focusables = racine.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;
  const premier = focusables[0];
  const dernier = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === premier) {
    event.preventDefault(); dernier.focus();
  } else if (!event.shiftKey && document.activeElement === dernier) {
    event.preventDefault(); premier.focus();
  }
}

/** Confirmation. Résout true/false. */
export function confirmer({ titre = "Confirmer", message, libelle = "Confirmer", danger = false }) {
  return ouvrirModale({
    titre,
    corps: () => el("p.doux", message),
    actions: [
      { libelle: "Annuler", valeur: false },
      { libelle, variante: danger ? "danger" : "primaire", valeur: true }
    ]
  }).then((v) => v === true);
}

/** Saisie simple. Résout la chaîne ou null. */
export function demander({ titre, label, valeur = "", placeholder = "", libelle = "Valider", multiligne = false, aide = null }) {
  let champ;
  return ouvrirModale({
    titre,
    corps: (api) => el("div",
      el("label.champ",
        el("span.champ__label", label),
        champ = multiligne
          ? el("textarea.zone", { value: valeur, placeholder })
          : el("input.saisie", {
              value: valeur, placeholder,
              onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); api.fermer(champ.value.trim() || null); } }
            }),
        aide && el("span.champ__aide", aide)
      )
    ),
    actions: [
      { libelle: "Annuler", valeur: null },
      { libelle, variante: "primaire", action: () => champ.value.trim() || null }
    ]
  });
}

/** Formulaire générique : champs = [{ cle, label, type, valeur, options, requis }] */
export function formulaire({ titre, champs, libelle = "Enregistrer", large = false, note = null }) {
  const refs = {};
  return ouvrirModale({
    titre, large,
    corps: () => el("div",
      note && el("p.petit.faible", note),
      champs.map((c) => construireChamp(c, refs))
    ),
    actions: [
      { libelle: "Annuler", valeur: null },
      {
        libelle, variante: "primaire",
        action: () => {
          const sortie = {};
          for (const c of champs) {
            const noeud = refs[c.cle];
            if (!noeud) continue;
            let v = c.type === "checkbox" ? noeud.checked : noeud.value;
            if (c.type === "number") v = v === "" ? null : Number(v);
            if (typeof v === "string") v = v.trim();
            if (c.requis && (v === "" || v == null)) {
              noeud.focus();
              noeud.classList.add("champ--erreur");
              return false;
            }
            sortie[c.cle] = v;
          }
          return sortie;
        }
      }
    ]
  });
}

function construireChamp(c, refs) {
  const capter = (n) => { refs[c.cle] = n; };

  if (c.type === "checkbox") {
    return el("label.case",
      el("input", { type: "checkbox", checked: Boolean(c.valeur), ref: capter }),
      el("span", c.label)
    );
  }
  if (c.type === "select") {
    return el("label.champ",
      el("span.champ__label", c.label),
      el("select.saisie", { ref: capter },
        (c.options || []).map((o) =>
          el("option", { value: o.valeur, selected: o.valeur === c.valeur }, o.libelle))
      ),
      c.aide && el("span.champ__aide", c.aide)
    );
  }
  if (c.type === "textarea") {
    return el("label.champ",
      el("span.champ__label", c.label),
      el("textarea.zone", { value: c.valeur ?? "", placeholder: c.placeholder || "", rows: c.lignes || 4, ref: capter }),
      c.aide && el("span.champ__aide", c.aide)
    );
  }
  /* Choix illustré : on désigne un objet, pas une ligne dans une liste. */
  if (c.type === "choix") {
    let courant = c.valeur ?? c.options?.[0]?.valeur ?? "";
    const cache = el("input", { type: "hidden", value: courant, ref: capter });
    const groupe = el("div.choix-objets", { role: "radiogroup", "aria-label": c.label },
      (c.options || []).map((o) => el("button.choix-objet", {
        type: "button",
        role: "radio",
        dataset: { valeur: o.valeur },
        "aria-checked": String(o.valeur === courant),
        onclick: (e) => {
          courant = o.valeur; cache.value = o.valeur;
          groupe.querySelectorAll(".choix-objet")
            .forEach((b) => b.setAttribute("aria-checked", String(b.dataset.valeur === courant)));
          c.onchoix?.(o.valeur);
        }
      },
        el("span.choix-objet__figure", { dataset: { objet: o.valeur }, "aria-hidden": "true" }),
        el("span.choix-objet__nom", o.libelle),
        o.aide ? el("span.choix-objet__aide", o.aide) : null
      ))
    );
    return el("div.champ", el("span.champ__label", c.label), groupe, cache);
  }

  if (c.type === "couleur") {
    const teintes = ["olive", "laiton", "ardoise", "oxblood", "pourpre", "encre"];
    let courante = c.valeur || "olive";
    const cache = el("input", { type: "hidden", value: courante, ref: capter });
    const groupe = el("div.ligne-flex.enrouler",
      teintes.map((t) => el("button.teinte", {
        type: "button",
        dataset: { teinte: t },
        style: { background: `var(--${t === "encre" ? "encre-400" : t})` },
        "aria-pressed": String(t === courante),
        "aria-label": t,
        onclick: (e) => {
          courante = t; cache.value = t;
          groupe.querySelectorAll(".teinte").forEach((b) => b.setAttribute("aria-pressed", "false"));
          e.currentTarget.setAttribute("aria-pressed", "true");
        }
      }))
    );
    return el("div.champ", el("span.champ__label", c.label), groupe, cache);
  }
  return el("label.champ",
    el("span.champ__label", c.label),
    el("input.saisie", {
      type: c.type || "text", value: c.valeur ?? "",
      placeholder: c.placeholder || "", min: c.min, max: c.max, step: c.step,
      ref: capter
    }),
    c.aide && el("span.champ__aide", c.aide)
  );
}

/** Menu contextuel ancré à un élément. items = [{ libelle, icone, action, danger, separateur, titre }] */
export function menu(ancre, items) {
  document.querySelector(".menu")?.remove();

  const boite = el("div.menu", { role: "menu" },
    items.filter(Boolean).map((item) => {
      if (item.separateur) return el("div.menu__sep");
      if (item.titre) return el("div.menu__titre", item.titre);
      return el(`button.btn.btn--menu${item.danger ? ".btn--danger" : ""}`, {
        type: "button", role: "menuitem",
        onclick: () => { fermer(); item.action?.(); }
      }, item.icone ? icone(item.icone, 15) : null, item.libelle);
    })
  );

  const doc = ancre.ownerDocument || docHote();
  const vue = doc.defaultView || fenetreHote();
  doc.body.appendChild(boite);
  const r = ancre.getBoundingClientRect();
  const l = boite.getBoundingClientRect();
  const x = Math.min(r.left, vue.innerWidth - l.width - 8);
  const y = r.bottom + l.height > vue.innerHeight ? r.top - l.height - 4 : r.bottom + 4;
  boite.style.left = `${Math.max(8, x)}px`;
  boite.style.top = `${Math.max(8, y)}px`;

  function fermer() {
    boite.remove();
    doc.removeEventListener("mousedown", surClic, true);
    doc.removeEventListener("keydown", surTouche, true);
  }
  function surClic(e) { if (!boite.contains(e.target)) fermer(); }
  function surTouche(e) { if (e.key === "Escape") { e.stopPropagation(); fermer(); } }

  setTimeout(() => {
    doc.addEventListener("mousedown", surClic, true);
    doc.addEventListener("keydown", surTouche, true);
  }, 0);

  return fermer;
}
