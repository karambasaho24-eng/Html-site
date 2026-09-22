# La couche RolePlay

## Le problème

**HRP** — « hors roleplay » — désigne tout ce qui vient du joueur et non du
personnage. Sur un serveur, c'est la principale cause de rupture d'immersion :
une phrase lâchée en plein cours, une information qu'un personnage ne peut pas
connaître, un pseudo moderne au bas d'un rapport militaire.

Un outil scolaire branché sur un serveur RP est, sans précaution, **une source
permanente de HRP**. Trois fuites reviennent sans cesse :

| Fuite | Ce que voit le joueur |
|---|---|
| Le calendrier réel | « Modifiée le 22/09/2026 » dans un monde qui n'a ni cette ère ni ce calendrier |
| Le pseudo du compte | Un rapport d'instruction signé « xX_DarkShadow_Xx » |
| Aucun endroit pour le hors-perso | « jdois partir dsl » en plein milieu d'une manœuvre |

La plateforme traite les trois.

## Ce qui a été ajouté

### Fiche de personnage

Le compte identifie le joueur ; la **fiche** identifie le personnage. Une fiche
par membre **et par espace** : on peut être cadet dans une brigade et
instructeur ailleurs, ce que font réellement les serveurs.

Elle porte un nom, un grade, un corps, une promotion, une origine, une
naissance telle que le personnage la dirait, et ce que l'on sait de lui.

Dès qu'une fiche existe, c'est elle qui signe : l'appel, les questions, les
listes de membres. Le nom du compte ne reste visible que de l'encadrement, et
discrètement — il faut bien pouvoir retrouver quelqu'un en jeu.

Table `rp_profiles`, migration `0008`. Chacun écrit la sienne ; l'encadrement
peut corriger un grade ou un corps.

### Calendrier de l'univers

Chaque espace choisit son ère. Une page n'est plus datée « lundi 22 septembre
2026 » mais :

> **an 850 — 22ᵉ jour du neuvième mois**

Le décalage d'années et le libellé de l'ère sont réglés par univers, et la date
réelle reste disponible au survol — l'encadrement en a besoin, le personnage
non.

### Marquage hors-roleplay

Le hors-perso n'est pas interdit : l'interdire le pousse en vocal ou en privé,
où il pollue quand même la scène. On lui donne **une forme reconnaissable**,
selon la convention admise dans les communautés RP — la double parenthèse :

> Rapport de manœuvre. *(( je dois filer, à demain ))*

Trois mécanismes :

- une **case à cocher** sur les questions et les annonces, qui marque le
  message entier comme hors-RP ;
- un **bouton dans le carnet** qui met la sélection à part ;
- une **reconnaissance automatique** de `(( … )) ` dans tout texte affiché.

Le rendu est en retrait, en italique grisé : l'œil le saute naturellement en
relisant une séance.

La classe `hrp` fait partie d'une **liste blanche fermée** dans
`src/core/assainir.js` — avec `rp-action`, `rp-pensee` et `rp-citation`. Un
attribut `class` libre serait une porte ouverte ; une liste fermée ne l'est pas.

### Univers

Un univers réunit un calendrier, des grades, des corps et un vocabulaire :

| Univers | Ère | Grades | Corps |
|---|---|---|---|
| Aucun | dates réelles | — | — |
| Derrière les murs | `an 850` | Cadet → Major | Brigade d'entraînement, Garnison, Bataillon d'exploration, Brigades spéciales |
| Royaume | `an de grâce 1326` | Apprenti → Grand maître | Guilde, Ordre, Maison, Chancellerie |
| Contemporain | date courte | Stagiaire → Directeur | Académie, Service, Cabinet, Brigade |

Choisir un univers ajuste aussi le vocabulaire de l'interface — sauf si
l'établissement l'a déjà réglé lui-même : on ne défait pas un choix explicite.

Le but n'est pas de simuler une œuvre précise, mais de donner des points de
départ crédibles que chaque serveur ajuste ensuite mot à mot (*Réglages ›
Vocabulaire RP*).

## Ce que ça donne

Dans un espace réglé sur « Derrière les murs », l'interface ne dit plus
*classe*, *élève*, *professeur*, *exercice*, *cahier*, mais **brigade**,
**cadet**, **instructeur**, **épreuve**, **carnet**. Le menu affiche « Espace
instructeur ». L'appel liste « Commandant Keith Sadies » et « Cadet Eren
Jaeger ». Une page de carnet est datée de l'an 850.

Un cadet qui doit vraiment dire quelque chose hors-perso coche une case : son
message part marqué, visible comme tel, et le reste de la séance demeure jouable.

## Limites assumées

- **Aucun contrôle n'est imposé.** Rien n'empêche d'écrire hors-perso sans le
  marquer. Un outil ne remplace pas la modération d'un serveur ; il rend la
  bonne pratique plus simple que la mauvaise.
- **Le calendrier est un décalage d'années**, pas un calendrier inventé de
  toutes pièces (mois de longueurs différentes, semaines à six jours…). C'est
  suffisant pour sortir de l'ère moderne sans obliger personne à apprendre une
  arithmétique nouvelle.
- **La fiche n'est pas vérifiée.** Un cadet peut se déclarer commandant. C'est
  à l'encadrement de corriger — il en a le droit sur toutes les fiches de son
  espace.

## Sources

Les conventions retenues viennent des usages établis dans les communautés
francophones de RP :

- [Hors-RolePlay (HRP) — Wiki Fyrolia](https://fyrolia.fandom.com/fr/wiki/Hors-RolePlay(HRP))
- [Hors-roleplay — Wiki Renaissance Kingdoms](https://wiki.renaissancekingdoms.com/fr/Hors-roleplay)
- [Le HRP dans le RP — Wiki Larpalot](https://wiki.larpalot.com/le-hrp-dans-le-rp/)
- [Règle 3 : convention d'écriture du RP](https://runefactory.forumactif.org/t737-regle-3-convention-d-ecriture-du-rp)
- [Charte et définition de la section RP — forum Wakfu](https://www.wakfu.com/fr/forum/106-propos-forum/271750-nouvelle-charte-definition-section-rp)

Le vocabulaire militaire de l'univers « Derrière les murs » s'appuie sur la
structure classique d'une armée de fiction à trois corps et brigades
d'entraînement :

- [Armée de Paradis — Wiki L'Attaque des Titans](https://attaque-des-titans.fandom.com/fr/wiki/Arm%C3%A9e_de_Paradis)
- [Les régiments militaires expliqués](https://attaque-des-titans.fr/blogs/attaque-des-titans/attaque-des-titans-regiments-militaires)
