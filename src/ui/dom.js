/* ---------------------------------------------------------------------------
 * Fabrique d'éléments. Volontairement minuscule : pas de framework, pas de
 * compilation, pas de VDOM. Les vues sont recomposées quand l'état change.
 * ------------------------------------------------------------------------- */

const SVG_NS = "http://www.w3.org/2000/svg";
const SVG_TAGS = new Set(["svg", "path", "circle", "rect", "line", "g", "polyline", "polygon", "text", "ellipse"]);

/**
 * el("div.carte#mon-id", { onclick, ... }, enfants)
 * Les clés commençant par « on » deviennent des écouteurs, `dataset` et `style`
 * acceptent un objet, tout le reste devient un attribut (ou une propriété si
 * l'élément l'expose).
 */
export function el(selector, props = null, ...children) {
  const [tag, id, classes] = parseSelector(selector);
  const node = SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);

  if (id) node.id = id;
  if (classes.length) node.setAttribute("class", classes.join(" "));

  if (props && !isChild(props)) {
    for (const [key, value] of Object.entries(props)) {
      applyProp(node, key, value);
    }
  } else if (props != null) {
    children.unshift(props);
  }

  append(node, children);
  return node;
}

/**
 * Analyse « tag#id.classe », dans n'importe quel ordre : « div.carte#mon-id »
 * et « div#mon-id.carte » sont équivalents.
 *
 * Un sélecteur invalide lève plutôt que de retomber silencieusement sur un
 * <div> : une faute de frappe doit se voir tout de suite, pas se traduire en
 * champ de formulaire introuvable trois écrans plus loin.
 */
function parseSelector(selector) {
  const brut = selector || "div";
  const match = /^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/.exec(brut);
  if (!match) throw new Error(`Sélecteur invalide : « ${brut} »`);

  const tag = match[1] || "div";
  let id = "";
  const classes = [];

  for (const jeton of (match[2] || "").match(/[.#][\w-]+/g) || []) {
    if (jeton[0] === "#") id = jeton.slice(1);
    else classes.push(jeton.slice(1));
  }
  return [tag, id, classes];
}

function isChild(value) {
  return typeof value === "string" || typeof value === "number"
    || Array.isArray(value) || value instanceof Node;
}

function applyProp(node, key, value) {
  if (value == null || value === false) return;

  if (key === "class" || key === "className") {
    node.setAttribute("class", [node.getAttribute("class"), value].filter(Boolean).join(" "));
    return;
  }
  if (key === "style" && typeof value === "object") {
    Object.assign(node.style, value);
    return;
  }
  if (key === "dataset") {
    for (const [k, v] of Object.entries(value)) {
      if (v != null) node.dataset[k] = v;
    }
    return;
  }
  if (key.startsWith("on") && typeof value === "function") {
    node.addEventListener(key.slice(2).toLowerCase(), value);
    return;
  }
  if (key === "html") { node.innerHTML = value; return; }
  if (key === "text") { node.textContent = value; return; }
  if (key === "ref" && typeof value === "function") { value(node); return; }
  if (value === true) { node.setAttribute(key, ""); return; }

  if (key in node && !(node instanceof SVGElement) && key !== "list" && key !== "form") {
    try { node[key] = value; return; } catch { /* attribut seulement */ }
  }
  node.setAttribute(key, String(value));
}

function append(node, children) {
  for (const child of children.flat(4)) {
    if (child == null || child === false || child === true) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Vide un conteneur et y place de nouveaux enfants. */
export function render(container, ...children) {
  container.replaceChildren();
  append(container, children);
  return container;
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

export function clear(node) { node.replaceChildren(); return node; }

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Écouteur délégué : on(racine, "click", ".btn", handler) */
export function on(root, type, selector, handler, options) {
  if (typeof selector === "function") {
    root.addEventListener(type, selector, handler);
    return () => root.removeEventListener(type, selector, handler);
  }
  const wrapped = (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(type, wrapped, options);
  return () => root.removeEventListener(type, wrapped, options);
}

/** Petit utilitaire d'échappement pour les rares insertions HTML. */
export function echapper(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
