/* ---------------------------------------------------------------------------
 * Le dessin des objets.
 *
 * Tous les objets de l'univers sortent d'ici, et c'est le point : ils doivent
 * sembler avoir été faits dans la même séance. Même plaque sombre, même
 * lumière venue du haut-gauche, même ombre de contact, mêmes matières — cuir
 * fauve, toile huilée olive, laiton terni, buis, acier, papier jauni, encre.
 *
 * Pourquoi du SVG et non des images générées : ces objets s'affichent à 24 ou
 * 30 pixels de haut. À cette taille une photographie devient une tache brune —
 * c'est la silhouette qui porte la reconnaissance, pas le grain du cuir. Le
 * vecteur donne des formes franches à n'importe quelle échelle, pèse quelques
 * centaines d'octets, et se recolore en changeant une ligne.
 *
 *   node outils/dessiner-objets.mjs
 * ------------------------------------------------------------------------- */
import { writeFileSync, mkdirSync } from "node:fs";

const SORTIE = "assets/objets";

/* --- Les matières ---------------------------------------------------------
   Une seule définition par matière, partagée par tous les objets. C'est ce qui
   fait qu'un cartable et une trousse ont l'air d'être en cuir du même tannage. */
const MATIERES = {
  plaque: `<linearGradient id="plaque" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#151b21"/><stop offset="1" stop-color="#0a0d10"/></linearGradient>`,
  lum: `<radialGradient id="lum" cx="30%" cy="16%" r="78%">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".085"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`,
  sol: `<radialGradient id="sol" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#000" stop-opacity=".55"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`,

  cuir: `<linearGradient id="cuir" x1=".1" y1="0" x2=".9" y2="1">
      <stop offset="0" stop-color="#b87d42"/><stop offset=".45" stop-color="#96622f"/>
      <stop offset="1" stop-color="#5f3c1b"/></linearGradient>`,
  cuirSombre: `<linearGradient id="cuirSombre" x1=".1" y1="0" x2=".9" y2="1">
      <stop offset="0" stop-color="#7d5531"/><stop offset="1" stop-color="#3b2412"/></linearGradient>`,
  toile: `<linearGradient id="toile" x1=".1" y1="0" x2=".9" y2="1">
      <stop offset="0" stop-color="#78854f"/><stop offset=".5" stop-color="#5c6a3c"/>
      <stop offset="1" stop-color="#3a4326"/></linearGradient>`,
  laiton: `<linearGradient id="laiton" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e6cb78"/><stop offset=".45" stop-color="#b9932f"/>
      <stop offset="1" stop-color="#7d5f15"/></linearGradient>`,
  acier: `<linearGradient id="acier" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e2e7ec"/><stop offset=".5" stop-color="#a5aeb7"/>
      <stop offset="1" stop-color="#6d767f"/></linearGradient>`,
  bois: `<linearGradient id="bois" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e0c68d"/><stop offset=".55" stop-color="#bd9d5f"/>
      <stop offset="1" stop-color="#8a6c3a"/></linearGradient>`,
  boisSombre: `<linearGradient id="boisSombre" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8d6a3d"/><stop offset="1" stop-color="#4d3720"/></linearGradient>`,
  papier: `<linearGradient id="papier" x1=".2" y1="0" x2=".8" y2="1">
      <stop offset="0" stop-color="#f4ecd8"/><stop offset=".6" stop-color="#e2d5b8"/>
      <stop offset="1" stop-color="#c3b493"/></linearGradient>`,
  encre: `<linearGradient id="encre" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2c3644"/><stop offset="1" stop-color="#0f151c"/></linearGradient>`,
  corne: `<linearGradient id="corne" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d6c09a"/><stop offset="1" stop-color="#8b7350"/></linearGradient>`,
  cuivre: `<linearGradient id="cuivre" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d59a5b"/><stop offset=".5" stop-color="#a9662c"/>
      <stop offset="1" stop-color="#6d3d15"/></linearGradient>`,
  verre: `<linearGradient id="verre" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d7e8ee" stop-opacity=".9"/>
      <stop offset="1" stop-color="#5d7f8b" stop-opacity=".8"/></linearGradient>`,
  ardoise: `<linearGradient id="ardoise" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#48555e"/><stop offset="1" stop-color="#232b32"/></linearGradient>`,
  craieBlanc: `<linearGradient id="craieBlanc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6f3ea"/><stop offset="1" stop-color="#c8c2b2"/></linearGradient>`,
  feutrine: `<linearGradient id="feutrine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6a6152"/><stop offset="1" stop-color="#3c362c"/></linearGradient>`
};

/* --- L'usure ---------------------------------------------------------------
   Un objet neuf n'a pas servi, et cela se voit. Deux traits suffisent : un pli
   assombri, une arête éclaircie. */
const PLI = (d, o = ".3") => `<path d="${d}" fill="none" stroke="#000" stroke-opacity="${o}" stroke-width="1"/>`;
const LUEUR = (d, o = ".32") => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="${o}" stroke-width=".9"/>`;

/* ===========================================================================
   Les objets — un par entrée, dessiné de face
   ========================================================================= */
const OBJETS = {

/* --- Contenants ---------------------------------------------------------- */
cartable: `
  <path d="M11 26h42a3 3 0 0 1 3 3v21a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V29a3 3 0 0 1 3-3z" fill="url(#cuirSombre)"/>
  <path d="M24 20h16v7H24z" fill="none" stroke="url(#cuir)" stroke-width="2.6"/>
  <path d="M10 28h44a2 2 0 0 1 2 2v9H8v-9a2 2 0 0 1 2-2z" fill="url(#cuir)"/>
  <path d="M8 36h48v6a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" fill="url(#cuir)" opacity=".92"/>
  ${PLI("M8 39h48")}
  <rect x="17" y="41" width="5" height="11" rx="1" fill="url(#cuirSombre)"/>
  <rect x="42" y="41" width="5" height="11" rx="1" fill="url(#cuirSombre)"/>
  <rect x="17.5" y="44" width="4" height="3" rx="1" fill="url(#laiton)"/>
  <rect x="42.5" y="44" width="4" height="3" rx="1" fill="url(#laiton)"/>
  ${LUEUR("M10 30h44", ".22")}
  <path d="M8 50c8 3 40 3 48 0v2a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4z" fill="#000" opacity=".22"/>`,

/* Ouvert, le rabat bascule VERS L'AVANT et la gueule du sac se voit : sans
   cela on lisait une étagère. */
"cartable-ouvert": `
  <path d="M11 22h42a3 3 0 0 1 3 3v25a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V25a3 3 0 0 1 3-3z" fill="url(#cuirSombre)"/>
  <path d="M12 24h40v10a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3z" fill="#0a0806"/>
  <path d="M16 25h9v11h-9zM27 23h8v13h-8zM37 26h10v10H37z" fill="url(#papier)" opacity=".78"/>
  <path d="M27 23h8v3h-8z" fill="#8b3f3a" opacity=".8"/>
  <path d="M8 34h48v6H8z" fill="url(#cuir)"/>
  ${LUEUR("M10 35h44", ".2")}
  <path d="M8 40h48l-3 12a3 3 0 0 1-3 2H14a3 3 0 0 1-3-2z" fill="url(#cuir)"/>
  ${PLI("M9 40h46", ".34")}
  <rect x="18" y="44" width="5" height="9" rx="1" fill="url(#cuirSombre)"/>
  <rect x="41" y="44" width="5" height="9" rx="1" fill="url(#cuirSombre)"/>
  <rect x="18.5" y="46" width="4" height="3" rx="1" fill="url(#laiton)"/>
  <rect x="41.5" y="46" width="4" height="3" rx="1" fill="url(#laiton)"/>`,

sacoche: `
  <path d="M15 24h34a3 3 0 0 1 3 3v22a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V27a3 3 0 0 1 3-3z" fill="url(#cuirSombre)"/>
  <path d="M12 26h40v12a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2z" fill="url(#cuir)"/>
  ${PLI("M12 36h40")}
  <path d="M18 24c0-8 6-12 14-12s14 4 14 12" fill="none" stroke="url(#cuirSombre)" stroke-width="2.4"/>
  <rect x="29" y="36" width="6" height="9" rx="1" fill="url(#cuirSombre)"/>
  <circle cx="32" cy="41" r="2" fill="url(#laiton)"/>
  ${LUEUR("M14 28h36", ".2")}
  <path d="M12 48c8 3 32 3 40 0v1a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" fill="#000" opacity=".2"/>`,

musette: `
  <path d="M13 27h38a2 2 0 0 1 2 2v20a4 4 0 0 1-4 4H15a4 4 0 0 1-4-4V29a2 2 0 0 1 2-2z" fill="url(#toile)"/>
  <path d="M11 29h42v9a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2z" fill="url(#toile)" opacity=".75"/>
  ${PLI("M11 37h42", ".34")}
  <path d="M20 27c0-7 4-11 12-11s12 4 12 11" fill="none" stroke="url(#toile)" stroke-width="3"/>
  <rect x="28" y="36" width="8" height="8" rx="1.5" fill="#3a4326"/>
  <circle cx="32" cy="40" r="1.8" fill="url(#laiton)"/>
  <path d="M16 44h6v7h-6zM42 44h6v7h-6z" fill="#000" opacity=".16"/>
  ${LUEUR("M13 31h38", ".16")}`,

mallette: `
  <rect x="9" y="24" width="46" height="28" rx="3" fill="url(#cuirSombre)"/>
  <rect x="9" y="24" width="46" height="13" rx="3" fill="url(#cuir)"/>
  ${PLI("M9 37h46", ".4")}
  <rect x="11" y="26" width="42" height="24" rx="2" fill="none" stroke="#000" stroke-opacity=".22"/>
  <path d="M25 24c0-5 3-7 7-7s7 2 7 7" fill="none" stroke="url(#cuirSombre)" stroke-width="3"/>
  <rect x="17" y="33" width="7" height="7" rx="1.2" fill="url(#laiton)"/>
  <rect x="40" y="33" width="7" height="7" rx="1.2" fill="url(#laiton)"/>
  <rect x="19.5" y="35.5" width="2" height="2" fill="#4a3a12"/>
  <rect x="42.5" y="35.5" width="2" height="2" fill="#4a3a12"/>
  ${LUEUR("M11 27h42", ".2")}`,

trousse: `
  <path d="M10 28h44a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z" fill="url(#toile)"/>
  <path d="M10 28h44a6 6 0 0 1 6 6H4a6 6 0 0 1 6-6z" fill="url(#toile)" opacity=".6"/>
  ${PLI("M4 34h56", ".32")}
  <path d="M24 28h16v9a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2z" fill="url(#cuirSombre)"/>
  <circle cx="32" cy="35" r="2.2" fill="url(#laiton)"/>
  <ellipse cx="46" cy="42" rx="4" ry="2.4" fill="#22303c" opacity=".55"/>
  ${LUEUR("M12 31h40", ".16")}`,

"trousse-ouverte": `
  <path d="M8 34h48a5 5 0 0 1 5 5v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-5a5 5 0 0 1 5-5z" fill="url(#toile)"/>
  <path d="M6 34h52l-3-8a3 3 0 0 0-3-2H12a3 3 0 0 0-3 2z" fill="url(#toile)" opacity=".55"/>
  <rect x="14" y="26" width="3" height="10" rx="1.5" fill="url(#boisSombre)"/>
  <rect x="20" y="24" width="2.6" height="12" rx="1.3" fill="url(#bois)"/>
  <rect x="26" y="26" width="9" height="9" rx="1" fill="url(#encre)"/>
  <rect x="39" y="27" width="11" height="3" rx="1" fill="url(#bois)"/>
  ${PLI("M6 34h52", ".34")}
  <circle cx="32" cy="41" r="2" fill="url(#laiton)"/>`,

etui: `
  <path d="M8 27h48a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3a4 4 0 0 1 4-4z" fill="url(#cuirSombre)"/>
  <path d="M8 27h48a4 4 0 0 1 4 4H4a4 4 0 0 1 4-4z" fill="url(#cuir)" opacity=".8"/>
  ${PLI("M4 31h56", ".3")}
  <rect x="27" y="27" width="10" height="7" rx="1" fill="url(#cuir)"/>
  <circle cx="32" cy="31" r="1.8" fill="url(#laiton)"/>
  <path d="M6 38h52l-2 3H8z" fill="#000" opacity=".25"/>
  ${LUEUR("M10 29h44", ".18")}`,

boite: `
  <path d="M10 28h44v22a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3z" fill="url(#boisSombre)"/>
  <path d="M8 24h48a2 2 0 0 1 2 2v4H6v-4a2 2 0 0 1 2-2z" fill="url(#bois)"/>
  ${PLI("M6 30h52", ".38")}
  <rect x="13" y="33" width="38" height="16" rx="1" fill="none" stroke="#000" stroke-opacity=".2"/>
  <rect x="28" y="28" width="8" height="5" rx="1" fill="url(#laiton)"/>
  ${LUEUR("M9 26h46", ".2")}
  <path d="M10 46h44v4a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3z" fill="#000" opacity=".16"/>`,

/* Une chemise de carton bulle : rabat court devant, feuilles qui dépassent
   derrière. Le contraste papier clair sur carton fauve la rend lisible. */
chemise: `
  <path d="M16 16h28l6 6v30H16z" fill="url(#papier)" opacity=".9"/>
  <path d="M19 22h22M19 27h22M19 32h15" stroke="#8b7a5c" stroke-opacity=".5" stroke-width="1.1"/>
  <path d="M10 24h20l4 4h20a2 2 0 0 1 2 2v22a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V26a2 2 0 0 1 0-2z" fill="#b08a4e"/>
  <path d="M10 28h44v3H10z" fill="#000" opacity=".14"/>
  ${LUEUR("M12 30h40", ".14")}
  <path d="M36 44h14v4H36z" fill="url(#papier)" opacity=".85"/>
  <path d="M38 46h10" stroke="#8b7a5c" stroke-opacity=".7" stroke-width=".9"/>
  ${PLI("M10 52h44", ".2")}`,

/* --- Écriture ------------------------------------------------------------- */
/* La plume ne doit pas se confondre avec le crayon : à 26 pixels, seule la
   silhouette parle. Un manche renflé qui s'affine, un collet de laiton large,
   un bec fendu en pointe de lance — et rien de conique. */
plume: `
  <path d="M52 12c2 2 2 4 0 6L38 32l-6-6z" fill="url(#boisSombre)"/>
  <path d="M50 14l-2-2" stroke="#fff" stroke-opacity=".3" stroke-width="1.2"/>
  <path d="M38 32l-6-6-5 5 6 6z" fill="url(#bois)"/>
  <path d="M33 37l-6-6-3.6 3.6 6 6z" fill="url(#laiton)"/>
  <path d="M29.4 40.6l-6-6L15 49l1.4 1.4 1.4 1.4z" fill="url(#acier)"/>
  <path d="M23.4 34.6l6 6-3 3-6-6z" fill="#fff" fill-opacity=".22"/>
  <path d="M26.4 37.6L17 47" stroke="#000" stroke-opacity=".45" stroke-width="1.1"/>
  <path d="M15 49l-3.4 4 4-3.4z" fill="#141a21"/>
  ${LUEUR("M49 15L40 24", ".34")}
  <ellipse cx="14" cy="55" rx="4" ry="1.6" fill="#22303c" opacity=".5"/>`,

/* Le crayon, lui, est franchement conique au bout et cerclé en haut : c'est
   par là qu'on le distingue de la plume d'un coup d'œil. */
crayon: `
  <path d="M21 43l27-27 5 5-27 27z" fill="url(#bois)"/>
  <path d="M23.4 45.4l27-27 1.6 1.6-27 27z" fill="#000" opacity=".14"/>
  <path d="M30 34.6l9-9" stroke="#fff" stroke-opacity=".22" stroke-width="1.6"/>
  <path d="M48 16l5 5 4-4a3.6 3.6 0 0 0-5-5z" fill="url(#cuivre)"/>
  <path d="M49.6 14.4l5 5" stroke="#000" stroke-opacity=".28" stroke-width="1"/>
  <path d="M21 43l5 5-8 3z" fill="url(#papier)"/>
  <path d="M18 51l3.2-1.4 1.4-3.2z" fill="#171c22"/>
  <ellipse cx="18" cy="55" rx="4" ry="1.6" fill="#000" opacity=".3"/>`,

encrier: `
  <path d="M20 30h24l-2 18a5 5 0 0 1-5 4h-10a5 5 0 0 1-5-4z" fill="url(#verre)"/>
  <path d="M23 36h18l-1.4 12a3 3 0 0 1-3 2.6h-9.2a3 3 0 0 1-3-2.6z" fill="url(#encre)"/>
  <rect x="18" y="25" width="28" height="6" rx="2" fill="url(#laiton)"/>
  <rect x="26" y="19" width="12" height="7" rx="2" fill="url(#laiton)"/>
  ${LUEUR("M24 28h16", ".34")}
  <path d="M25 33v16" stroke="#fff" stroke-opacity=".22" stroke-width="1.4"/>
  <ellipse cx="32" cy="53" rx="12" ry="2.4" fill="#000" opacity=".3"/>`,

encre: `
  <path d="M25 22h14v5l3 4v18a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V31l3-4z" fill="url(#verre)"/>
  <path d="M24 36h16v13a3 3 0 0 1-3 3h-10a3 3 0 0 1-3-3z" fill="url(#encre)"/>
  <rect x="26" y="16" width="12" height="7" rx="1.6" fill="url(#cuir)"/>
  <rect x="27" y="14" width="10" height="3" rx="1" fill="url(#laiton)"/>
  <rect x="26" y="38" width="12" height="8" rx="1" fill="url(#papier)" opacity=".82"/>
  <path d="M28 41h8M28 43.5h6" stroke="#6d5f46" stroke-opacity=".7" stroke-width=".9"/>
  ${LUEUR("M27 26v8", ".3")}`,

craie: `
  <rect x="14" y="28" width="26" height="8" rx="2" fill="url(#craieBlanc)" transform="rotate(-12 27 32)"/>
  <rect x="14" y="28" width="26" height="3" rx="1.5" fill="#fff" opacity=".35" transform="rotate(-12 27 32)"/>
  <rect x="34" y="34" width="18" height="7" rx="2" fill="url(#craieBlanc)" opacity=".85" transform="rotate(8 43 37)"/>
  <ellipse cx="20" cy="46" rx="14" ry="2.6" fill="#e8e3d6" opacity=".14"/>
  <ellipse cx="30" cy="50" rx="18" ry="2.4" fill="#000" opacity=".28"/>`,

gomme: `
  <path d="M16 32h32a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3z" fill="#9a958a"/>
  <path d="M16 32h32a3 3 0 0 1 3 3H13a3 3 0 0 1 3-3z" fill="#b5b0a3"/>
  <path d="M13 38h38v3H13z" fill="url(#papier)" opacity=".85"/>
  ${PLI("M13 41h38", ".2")}
  <path d="M46 44l5 3" stroke="#000" stroke-opacity=".2" stroke-width="1"/>
  <ellipse cx="32" cy="49" rx="16" ry="2.2" fill="#000" opacity=".3"/>`,

buvard: `
  <path d="M10 34h44l-3 12H13z" fill="url(#cuirSombre)"/>
  <path d="M12 30h40l2 5H10z" fill="#8b3f3a"/>
  <path d="M14 26h36l2 5H12z" fill="#a5544c" opacity=".9"/>
  <rect x="26" y="18" width="12" height="9" rx="2" fill="url(#bois)"/>
  ${LUEUR("M16 28h32", ".2")}
  <ellipse cx="32" cy="47" rx="20" ry="2.4" fill="#000" opacity=".3"/>`,

/* --- Papier --------------------------------------------------------------- */
feuilles: `
  <path d="M16 16h26l6 6v28H16z" fill="#c9bb9a" transform="rotate(-4 32 32)"/>
  <path d="M15 15h26l6 6v28H15z" fill="#ded0b0" transform="rotate(2 32 32)"/>
  <path d="M14 14h26l6 6v28H14z" fill="url(#papier)"/>
  <path d="M40 14v6h6z" fill="#b9aa89"/>
  <path d="M19 26h20M19 31h20M19 36h14" stroke="#8b7a5c" stroke-opacity=".5" stroke-width="1.2"/>
  <ellipse cx="32" cy="52" rx="20" ry="2.4" fill="#000" opacity=".3"/>`,

feuille: `
  <path d="M17 12h22l8 8v32H17z" fill="url(#papier)"/>
  <path d="M39 12v8h8z" fill="#b9aa89"/>
  <path d="M22 26h20M22 31h20M22 36h20M22 41h13" stroke="#8b7a5c" stroke-opacity=".5" stroke-width="1.2"/>
  ${PLI("M17 47h30", ".12")}
  <ellipse cx="32" cy="54" rx="17" ry="2.2" fill="#000" opacity=".28"/>`,

cahier: `
  <path d="M15 12h34a2 2 0 0 1 2 2v36a2 2 0 0 1-2 2H15z" fill="url(#cuirSombre)"/>
  <path d="M15 12h34a2 2 0 0 1 2 2v4H15z" fill="url(#cuir)" opacity=".5"/>
  <rect x="13" y="12" width="5" height="40" fill="#2c1c0e"/>
  <path d="M20 16h26v32H20z" fill="url(#papier)" opacity=".2"/>
  <rect x="26" y="22" width="18" height="10" rx="1" fill="url(#papier)" opacity=".85"/>
  <path d="M28 26h14M28 29h10" stroke="#8b7a5c" stroke-opacity=".6" stroke-width=".9"/>
  ${LUEUR("M20 14h28", ".14")}
  <path d="M49 12l2 2v36l-2 2z" fill="#000" opacity=".25"/>`,

carnet: `
  <path d="M20 12h24a2 2 0 0 1 2 2v38a2 2 0 0 1-2 2H20z" fill="#3d4339"/>
  <rect x="18" y="12" width="4" height="42" fill="#22271f"/>
  <path d="M24 17h18v33H24z" fill="#fff" opacity=".06"/>
  <rect x="27" y="23" width="12" height="8" rx="1" fill="url(#papier)" opacity=".8"/>
  <path d="M44 24h5v10h-5z" fill="#8b3f3a"/>
  ${LUEUR("M24 15h20", ".12")}
  <path d="M44 12l2 2v38l-2 2z" fill="#000" opacity=".25"/>`,

dossier: `
  <path d="M12 18h18l4 4h18a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V20a2 2 0 0 1 2-2z" fill="url(#bois)" opacity=".9"/>
  <path d="M16 26h32v4H16z" fill="url(#papier)" opacity=".7"/>
  <path d="M14 34h34M14 39h28" stroke="#6d5a38" stroke-opacity=".6" stroke-width="1.2"/>
  <path d="M10 44h44v10a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2z" fill="url(#boisSombre)"/>
  ${PLI("M10 44h44", ".3")}
  <rect x="38" y="47" width="12" height="5" rx="1" fill="url(#papier)" opacity=".75"/>`,

/* --- Calculer ------------------------------------------------------------- */
"regle-a-calcul": `
  <rect x="5" y="24" width="54" height="17" rx="2" fill="url(#bois)"/>
  <rect x="5" y="29" width="54" height="7" fill="#efdcb2"/>
  ${PLI("M5 29h54", ".3")} ${PLI("M5 36h54", ".3")}
  <g stroke="#3a2f1c" stroke-opacity=".8" stroke-width=".8">
    <path d="M9 24v4M14 24v3M19 24v4M24 24v3M29 24v4M34 24v3M39 24v4M44 24v3M49 24v4M54 24v3"/>
    <path d="M9 41v-4M16 41v-3M23 41v-4M30 41v-3M37 41v-4M44 41v-3M51 41v-4"/>
    <path d="M11 33v3M18 33v2.4M25 33v3M32 33v2.4M39 33v3M46 33v2.4M53 33v3"/>
  </g>
  <rect x="33" y="20" width="9" height="25" rx="1.5" fill="url(#verre)" opacity=".55" stroke="url(#laiton)"/>
  <path d="M37.5 20v25" stroke="#8b2f2a" stroke-width="1"/>
  ${LUEUR("M7 26h50", ".24")}
  <ellipse cx="32" cy="47" rx="26" ry="2.2" fill="#000" opacity=".3"/>`,

boulier: `
  <rect x="9" y="14" width="46" height="38" rx="3" fill="none" stroke="url(#boisSombre)" stroke-width="4"/>
  <rect x="11" y="16" width="42" height="34" fill="#171d16" opacity=".5"/>
  <g stroke="url(#acier)" stroke-width="1">
    <path d="M13 23h38M13 31h38M13 39h38M13 46h38"/>
  </g>
  <g fill="url(#corne)">
    <circle cx="17" cy="23" r="3"/><circle cx="24" cy="23" r="3"/><circle cx="44" cy="23" r="3"/>
    <circle cx="17" cy="31" r="3"/><circle cx="37" cy="31" r="3"/><circle cx="44" cy="31" r="3"/>
    <circle cx="17" cy="39" r="3"/><circle cx="24" cy="39" r="3"/><circle cx="31" cy="39" r="3"/>
    <circle cx="44" cy="46" r="3"/><circle cx="37" cy="46" r="3"/><circle cx="17" cy="46" r="3"/>
  </g>
  ${LUEUR("M11 17h42", ".16")}`,

/* --- Tracer --------------------------------------------------------------- */
regle: `
  <rect x="4" y="27" width="56" height="11" rx="1.5" fill="url(#bois)"/>
  <rect x="4" y="27" width="56" height="3" fill="#fff" opacity=".16"/>
  <rect x="4" y="35.5" width="56" height="2.5" fill="url(#laiton)"/>
  <g stroke="#3a2f1c" stroke-opacity=".75" stroke-width=".9">
    <path d="M8 27v5M12 27v3M16 27v3M20 27v5M24 27v3M28 27v3M32 27v5M36 27v3M40 27v3M44 27v5M48 27v3M52 27v3M56 27v5"/>
  </g>
  ${PLI("M4 33h56", ".18")}
  <ellipse cx="32" cy="42" rx="27" ry="2" fill="#000" opacity=".3"/>`,

equerre: `
  <path d="M10 50V14l40 36z" fill="url(#bois)" opacity=".95"/>
  <path d="M15 45V26l21 19z" fill="#0d1013" opacity=".55"/>
  <g stroke="#3a2f1c" stroke-opacity=".7" stroke-width=".9">
    <path d="M10 20h4M10 26h4M10 32h4M10 38h4M10 44h4"/>
    <path d="M18 50v-4M25 50v-4M32 50v-4M39 50v-4"/>
  </g>
  ${LUEUR("M11 16v33", ".22")}
  <ellipse cx="30" cy="53" rx="21" ry="2" fill="#000" opacity=".28"/>`,

compas: `
  <path d="M32 14l10 34" stroke="url(#laiton)" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M32 14L22 48" stroke="url(#laiton)" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M42 46l1 6-3-4z" fill="url(#acier)"/>
  <path d="M22 46l-1 6 3-4z" fill="url(#acier)"/>
  <circle cx="32" cy="14" r="4.6" fill="url(#laiton)"/>
  <circle cx="32" cy="14" r="1.8" fill="#4a3a12"/>
  <rect x="28" y="24" width="8" height="3" rx="1.5" fill="url(#acier)"/>
  ${LUEUR("M31 17l-8 27", ".3")}
  <ellipse cx="32" cy="54" rx="16" ry="2" fill="#000" opacity=".28"/>`,

rapporteur: `
  <path d="M8 42a24 24 0 0 1 48 0z" fill="url(#corne)"/>
  <path d="M14 42a18 18 0 0 1 36 0z" fill="#0d1013" opacity=".45"/>
  <g stroke="#3a2f1c" stroke-opacity=".75" stroke-width=".9">
    <path d="M9 40l5-1M12 32l4.6 2M18 25l3.4 3.6M26 20.5l1.6 4.6M32 19v5M38 20.5l-1.6 4.6M46 25l-3.4 3.6M52 32l-4.6 2M55 40l-5-1"/>
  </g>
  <rect x="8" y="42" width="48" height="3" rx="1" fill="url(#corne)"/>
  ${PLI("M8 42h48", ".3")}
  <circle cx="32" cy="42" r="1.6" fill="#8b2f2a"/>`,

/* --- Administrer ---------------------------------------------------------- */
registre: `
  <path d="M12 10h36a3 3 0 0 1 3 3v40a3 3 0 0 1-3 3H12z" fill="#5a2c28"/>
  <path d="M12 10h36a3 3 0 0 1 3 3v5H12z" fill="#6d3832"/>
  <rect x="9" y="10" width="6" height="46" fill="#3d1d1a"/>
  <rect x="22" y="22" width="20" height="13" rx="1" fill="url(#papier)" opacity=".9"/>
  <path d="M25 26h14M25 29h14M25 32h9" stroke="#8b7a5c" stroke-opacity=".7" stroke-width=".9"/>
  <rect x="20" y="42" width="24" height="3" rx="1" fill="url(#laiton)" opacity=".8"/>
  <path d="M48 10l3 3v40l-3 3z" fill="#000" opacity=".28"/>
  ${LUEUR("M17 13h32", ".14")}`,

cachet: `
  <rect x="26" y="12" width="12" height="18" rx="5" fill="url(#boisSombre)"/>
  <rect x="27" y="14" width="10" height="5" rx="2.5" fill="url(#bois)"/>
  <rect x="22" y="28" width="20" height="7" rx="2" fill="url(#laiton)"/>
  <path d="M19 35h26l-2 9H21z" fill="url(#laiton)"/>
  <rect x="20" y="44" width="24" height="4" rx="1" fill="#6d3832"/>
  ${LUEUR("M28 16h8", ".36")}
  <ellipse cx="32" cy="51" rx="15" ry="2.2" fill="#000" opacity=".3"/>`,

/* --- Servir --------------------------------------------------------------- */
carte: `
  <path d="M6 20l17-4 18 4 17-4v32l-17 4-18-4-17 4z" fill="url(#papier)"/>
  <path d="M23 16v36M41 20v36" stroke="#000" stroke-opacity=".18" stroke-width="1"/>
  <path d="M11 30c6-4 12 2 18-1s14 3 20-2" fill="none" stroke="#7d8c58" stroke-opacity=".8" stroke-width="1.4"/>
  <path d="M10 40c8 2 14-3 22 0s12-2 20 1" fill="none" stroke="#5b829c" stroke-opacity=".8" stroke-width="1.4"/>
  <circle cx="33" cy="35" r="2" fill="#8b2f2a"/>
  <path d="M6 20l17-4v36l-17 4z" fill="#000" opacity=".06"/>`,

boussole: `
  <circle cx="32" cy="34" r="18" fill="url(#cuivre)"/>
  <circle cx="32" cy="34" r="14" fill="#0f1620"/>
  <circle cx="32" cy="34" r="13" fill="none" stroke="url(#laiton)" stroke-opacity=".6"/>
  <path d="M32 22l3.4 10.6L32 34z" fill="#b4554e"/>
  <path d="M32 46l-3.4-10.6L32 34z" fill="#e2e7ec"/>
  <g stroke="url(#laiton)" stroke-width="1"><path d="M32 20v3M32 45v3M17 34h3M44 34h3"/></g>
  <circle cx="32" cy="34" r="1.6" fill="url(#laiton)"/>
  <path d="M26 16h12a3 3 0 0 1 0 3H26a3 3 0 0 1 0-3z" fill="url(#cuivre)"/>
  ${LUEUR("M22 24a14 14 0 0 1 10-6", ".3")}`,

lorgnette: `
  <rect x="8" y="27" width="20" height="12" rx="2" fill="url(#cuivre)"/>
  <rect x="26" y="25" width="18" height="16" rx="2" fill="url(#feutrine)"/>
  <rect x="42" y="23" width="14" height="20" rx="2" fill="url(#cuivre)"/>
  <rect x="55" y="25" width="3" height="16" rx="1.5" fill="url(#laiton)"/>
  <rect x="6" y="28" width="3" height="10" rx="1.5" fill="url(#laiton)"/>
  <path d="M26 27h2v12h-2z" fill="#000" opacity=".3"/>
  <path d="M42 25h2v16h-2z" fill="#000" opacity=".3"/>
  ${LUEUR("M10 30h16", ".3")} ${LUEUR("M44 26h10", ".26")}
  <ellipse cx="32" cy="45" rx="24" ry="2.2" fill="#000" opacity=".3"/>`,

lanterne: `
  <rect x="29" y="9" width="6" height="4" rx="2" fill="url(#laiton)"/>
  <path d="M24 13h16l-2 5H26z" fill="url(#laiton)"/>
  <path d="M22 18h20v22a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z" fill="url(#verre)" opacity=".5"/>
  <rect x="20" y="16" width="24" height="3" rx="1.5" fill="url(#laiton)"/>
  <rect x="20" y="43" width="24" height="6" rx="2" fill="url(#laiton)"/>
  <path d="M27 30h10v12H27z" fill="#e0b25a" opacity=".45"/>
  <path d="M32 26c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z" fill="#f2c97a"/>
  <path d="M22 18h3v26h-3zM39 18h3v26h-3z" fill="url(#laiton)" opacity=".7"/>
  ${LUEUR("M23 20v22", ".2")}`,

/* --- À soi ---------------------------------------------------------------- */
montre: `
  <circle cx="30" cy="36" r="17" fill="url(#laiton)"/>
  <circle cx="30" cy="36" r="13.5" fill="url(#papier)"/>
  <g stroke="#3a2f1c" stroke-width="1">
    <path d="M30 24v2.6M30 45.4V48M18 36h2.6M39.4 36H42"/>
  </g>
  <path d="M30 36V27" stroke="#2a2620" stroke-width="1.4"/>
  <path d="M30 36l6 4" stroke="#2a2620" stroke-width="1.2"/>
  <circle cx="30" cy="36" r="1.3" fill="#8b2f2a"/>
  <rect x="27" y="15" width="6" height="5" rx="2" fill="url(#laiton)"/>
  <path d="M33 16c6-2 12 0 16 5" fill="none" stroke="url(#laiton)" stroke-width="1.6"/>
  ${LUEUR("M20 28a16 16 0 0 1 10-7", ".3")}`,

gourde: `
  <path d="M25 18h14v5c6 2 8 7 8 14s-2 13-8 15H25c-6-2-8-8-8-15s2-12 8-14z" fill="url(#feutrine)"/>
  <path d="M25 23h14c5 2 6 6 6 14s-1 12-6 14H25c-5-2-6-7-6-14s1-12 6-14z" fill="#6a6152" opacity=".5"/>
  <rect x="26" y="12" width="12" height="7" rx="2" fill="url(#acier)"/>
  <rect x="27" y="10" width="10" height="3" rx="1.5" fill="url(#laiton)"/>
  <path d="M19 33h26" stroke="#000" stroke-opacity=".22" stroke-width="1.2"/>
  ${LUEUR("M23 24v22", ".18")}
  <ellipse cx="32" cy="53" rx="15" ry="2.2" fill="#000" opacity=".3"/>`,

/* Un objet dont le type n'est pas au catalogue : une forme neutre plutôt
   qu'une image manquante. */
autre: `
  <rect x="17" y="20" width="30" height="26" rx="3" fill="url(#feutrine)"/>
  <rect x="17" y="20" width="30" height="7" rx="3" fill="#7a7162"/>
  ${PLI("M17 27h30", ".3")}
  <circle cx="32" cy="36" r="4" fill="none" stroke="#a8a091" stroke-width="1.4"/>
  <ellipse cx="32" cy="48" rx="15" ry="2" fill="#000" opacity=".28"/>`
};

/* ===========================================================================
   Assemblage
   ========================================================================= */
function assembler(nom, corps, { plaque = true } = {}) {
  // On n'embarque que les matières réellement employées : chaque fichier reste
  // sous le kilo-octet, et rien n'est chargé pour rien.
  const utilisees = Object.keys(MATIERES)
    .filter((cle) => corps.includes(`url(#${cle})`) || (plaque && ["plaque", "lum", "sol"].includes(cle)));
  const defs = utilisees.map((cle) => MATIERES[cle]).join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${nom}">
  <defs>
    ${defs}
  </defs>
  ${plaque ? `<rect width="64" height="64" rx="10" fill="url(#plaque)"/>
  <ellipse cx="32" cy="52" rx="22" ry="5" fill="url(#sol)"/>` : ""}
  ${corps.trim()}
  ${plaque ? `<rect width="64" height="64" rx="10" fill="url(#lum)"/>
  <rect x=".5" y=".5" width="63" height="63" rx="9.5" fill="none" stroke="#fff" stroke-opacity=".05"/>` : ""}
</svg>
`;
}

mkdirSync(SORTIE, { recursive: true });
// La même figure sans sa plaque, pour la poser DANS un contenant : un carré
// sombre au milieu d'une trousse trahirait l'image.
mkdirSync(`${SORTIE}/sans-fond`, { recursive: true });
for (const [nom, corps] of Object.entries(OBJETS)) {
  writeFileSync(`${SORTIE}/sans-fond/${nom}.svg`, assembler(nom, corps, { plaque: false }), "utf8");
}
let n = 0;
for (const [nom, corps] of Object.entries(OBJETS)) {
  writeFileSync(`${SORTIE}/${nom}.svg`, assembler(nom, corps), "utf8");
  n++;
}
console.log(`${n} objets dessinés dans ${SORTIE}`);
