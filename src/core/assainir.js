/* ---------------------------------------------------------------------------
 * Assainissement du HTML.
 *
 * Le contenu des pages de cahier est saisi dans un champ `contenteditable`,
 * stocké tel quel puis réinjecté — chez l'auteur comme chez les autres membres
 * de la classe. Sans filtrage, n'importe quel élève pourrait exécuter du script
 * dans le navigateur de son professeur. Tout passage de HTML vers le DOM doit
 * donc traverser `assainirHTML`.
 *
 * Liste blanche stricte : mise en forme et structure uniquement.
 * ------------------------------------------------------------------------- */

const BALISES = new Set([
  "P", "BR", "DIV", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "MARK", "SMALL",
  "H2", "H3", "H4", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE", "HR",
  "A", "IMG", "FIGURE", "FIGCAPTION", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD"
]);

const ATTRIBUTS = {
  A: new Set(["href", "title"]),
  IMG: new Set(["src", "alt", "width", "height"]),
  TD: new Set(["colspan", "rowspan"]),
  TH: new Set(["colspan", "rowspan"])
};

const PROTOCOLES_SURS = new Set(["http:", "https:", "mailto:"]);

function urlSure(valeur, autoriserDonnees = false) {
  const brut = String(valeur || "").trim();
  if (!brut) return null;
  if (autoriserDonnees && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(brut)) return brut;
  if (brut.startsWith("#")) return brut;
  try {
    const url = new URL(brut, location.href);
    return PROTOCOLES_SURS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Nettoie une chaîne HTML et renvoie une chaîne sûre. */
export function assainirHTML(html) {
  if (!html) return "";
  const gabarit = document.createElement("template");
  gabarit.innerHTML = String(html);
  nettoyerNoeud(gabarit.content);
  return gabarit.innerHTML;
}

/** Nettoie puis injecte dans un élément existant. */
export function injecterHTML(hote, html) {
  hote.innerHTML = assainirHTML(html);
  return hote;
}

/** Renvoie un DocumentFragment assaini, prêt à être inséré. */
export function fragmentSur(html) {
  const gabarit = document.createElement("template");
  gabarit.innerHTML = String(html || "");
  nettoyerNoeud(gabarit.content);
  return gabarit.content;
}

function nettoyerNoeud(racine) {
  const aRetirer = [];
  const parcours = document.createTreeWalker(racine, NodeFilter.SHOW_ELEMENT);

  while (parcours.nextNode()) {
    const noeud = parcours.currentNode;

    if (!BALISES.has(noeud.tagName)) {
      aRetirer.push(noeud);
      continue;
    }

    for (const attribut of Array.from(noeud.attributes)) {
      const nom = attribut.name.toLowerCase();
      const autorises = ATTRIBUTS[noeud.tagName];

      if (nom === "style") {
        noeud.setAttribute("style", filtrerStyle(attribut.value));
        if (!noeud.getAttribute("style")) noeud.removeAttribute("style");
        continue;
      }
      if (!autorises || !autorises.has(nom)) {
        noeud.removeAttribute(attribut.name);
        continue;
      }
      if (nom === "href") {
        const sure = urlSure(attribut.value);
        if (sure) { noeud.setAttribute("href", sure); noeud.setAttribute("rel", "noopener noreferrer"); noeud.setAttribute("target", "_blank"); }
        else noeud.removeAttribute("href");
      }
      if (nom === "src") {
        const sure = urlSure(attribut.value, true);
        if (sure) noeud.setAttribute("src", sure);
        else aRetirer.push(noeud);
      }
    }
  }

  // Les éléments refusés sont remplacés par leur contenu textuel assaini,
  // sauf les porteurs de script qui disparaissent entièrement.
  for (const noeud of aRetirer) {
    if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META"].includes(noeud.tagName)) {
      noeud.remove();
      continue;
    }
    const parent = noeud.parentNode;
    if (!parent) continue;
    while (noeud.firstChild) parent.insertBefore(noeud.firstChild, noeud);
    parent.removeChild(noeud);
  }
}

const PROPRIETES_STYLE = new Set([
  "color", "background-color", "font-weight", "font-style", "text-decoration",
  "text-align", "font-size"
]);

function filtrerStyle(valeur) {
  return String(valeur || "")
    .split(";")
    .map((regle) => regle.trim())
    .filter(Boolean)
    .filter((regle) => {
      const [propriete, contenu = ""] = regle.split(":").map((p) => p.trim().toLowerCase());
      if (!PROPRIETES_STYLE.has(propriete)) return false;
      return !/url\s*\(|expression|javascript:/i.test(contenu);
    })
    .join("; ");
}

/** Extrait le texte brut d'une chaîne HTML (recherche, aperçus). */
export function texteBrut(html) {
  const gabarit = document.createElement("template");
  gabarit.innerHTML = assainirHTML(html);
  return (gabarit.content.textContent || "").replace(/\s+/g, " ").trim();
}
