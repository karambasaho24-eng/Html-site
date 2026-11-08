# Déploiement

Le site est entièrement statique : aucun serveur d'application, aucune
compilation. Un dossier, un hébergeur.

## 1. Le projet Supabase

Créez un projet sur [supabase.com](https://supabase.com), puis exécutez les
migrations **dans l'ordre**, depuis l'éditeur SQL :

```
supabase/migrations/0001_schema.sql … 0038_*.sql   le schéma, la RLS, les procédures
supabase/migrations/0039_boutique.sql              l'encre, les cahiers payants, les articles
supabase/migrations/0040_retrait_objets.sql        ferme les anciens systèmes d'objets
supabase/migrations/0041_commandes_en_jeu.sql      commandes par missive, limite de pages, rôle PDG
supabase/migrations/0042_apparence_whitelist_hub.sql  apparence (fond, verre, musique…) et stockage « site-assets »
```

Exécutez **tous** les fichiers, **dans l'ordre numérique**. Les migrations 0039
et 0040 n'effacent ni ne modifient aucune donnée existante : elles ajoutent des
tables, créent un portefeuille d'encre pour chaque compte déjà présent et
referment des accès. Lisez leur en-tête avant de les lancer sur une base en
service, et essayez-les d'abord sur une copie (voir `docs/COMMANDES.md`,
« Vérifier sur une vraie base »).

Avec la CLI Supabase, `supabase db push` fait la même chose.

### Réglages d'authentification

Dans *Authentication › Providers › Email* :

- **Confirm email** : à **désactiver**. L'inscription devient alors un seul
  geste — nom, adresse, mot de passe, et l'on entre. C'est le comportement
  attendu ici : le courriel ne sert qu'à identifier un compte, pas à en
  vérifier le propriétaire, et une académie RP n'a rien à gagner à faire
  attendre un élève devant sa boîte mail. Laissée active, l'application le
  détecte : le compte est créé, l'écran d'accès demande la confirmation, et
  la connexion se fait au second passage.
- **Leaked password protection** : à activer (*Authentication › Policies*).
  Supabase vérifie alors les mots de passe auprès de HaveIBeenPwned.
- **URL de redirection** : ajoutez l'adresse publique du site dans
  *Authentication › URL Configuration*, sinon les liens par courriel retombent
  sur `localhost`.

### Stockage

Les deux seaux sont créés par la migration `0003` :

| Seau        | Public | Contenu                                    |
|-------------|--------|--------------------------------------------|
| `documents` | non    | PDF, images et fiches, lus via URL signée  |
| `avatars`   | oui    | photos de profil, 2 Mo maximum             |

Le chemin d'un document commence par l'identifiant de sa classe
(`<class_id>/<uuid>.<ext>`) : c'est ce que lisent les politiques de Storage
pour vérifier l'appartenance.

## 2. Le site

Renseignez `config.js` :

```js
window.OJM_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "sb_publishable_…",
  academyName: "Classe Parallèle",
  academyMotto: "L'école qui tourne à côté du jeu",
  lexique: {}
};
```

> La clé **publishable** (ou `anon`) est publique par construction : elle part
> dans chaque requête du navigateur. La sécurité vient de la RLS.
> Une clé de service (`service_role`, `sb_secret_…`) contourne la RLS et ne
> doit jamais figurer ici. L'écran *Réglages › Connexion* refuse d'ailleurs de
> l'enregistrer.

Puis déposez le dossier.

### Netlify

**Le plus rapide** — glissez le dossier sur
[app.netlify.com/drop](https://app.netlify.com/drop). Aucune construction :
c'est le `config.js` du dépôt qui sert.

**Le plus durable** — reliez le dépôt : *Project configuration › Build &
deploy › Continuous deployment › Link repository*. Le `netlify.toml` porte
déjà tout le reste :

- commande de build : `node outils/config-depuis-env.mjs`
- dossier à publier : `.`

Chaque poussée met alors le site à jour toute seule.

#### Les identifiants par variables d'environnement

*Project configuration › Environment variables* :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `sb_publishable_…` |
| `ACADEMY_NAME` | facultatif |
| `ACADEMY_MOTTO` | facultatif |

La commande de build les dépose dans `config.js`. **C'est cette étape qui les
rend utiles** : un site statique ne lit pas l'environnement, donc sans elle
les variables resteraient lettre morte et le site parlerait à l'instance
écrite en dur dans le dépôt.

Sans variables, le script ne touche à rien — le glisser-déposer et l'ouverture
en local continuent de fonctionner avec le `config.js` versionné.

Ces valeurs ne sont pas des secrets : ne les marquez pas *secret*. Elles
doivent être écrites dans un fichier que le navigateur télécharge. Ce qui
protège les données, c'est la RLS.

### GitHub Pages

*Settings › Pages › Deploy from a branch*, branche `main`, dossier `/`.
Les URL sont des fragments (`#/classe/…`), rien à configurer côté serveur.

### Vercel, Cloudflare Pages, un serveur maison

Même principe : servir le dossier tel quel. Un `nginx` ou un `python3 -m
http.server` suffisent, à condition de servir les `.js` en
`text/javascript` — sans quoi les modules ES sont refusés par le navigateur.

## 3. Vérifier

1. Ouvrez le site : la barre supérieure doit afficher **En ligne** et non
   « Mode démonstration ».
2. Créez un compte professeur, puis une classe : un code doit apparaître.
3. Depuis une fenêtre privée, créez un compte élève et saisissez le code.
4. Démarrez une session, tracez au tableau : l'élève doit voir le trait.

Si la barre indique « Mode démonstration » alors que la configuration est
renseignée, la bibliothèque Supabase n'a pas pu être chargée : vérifiez que
`vendor/supabase-js.min.js` est bien déployé.

## Connexion Discord et administrateurs

La connexion se fait **uniquement par Discord**.

1. [discord.com/developers/applications](https://discord.com/developers/applications) :
   créez une application, puis *OAuth2* : copiez l'identifiant client et le
   secret, et ajoutez comme *Redirect* l'adresse de callback affichée par
   Supabase (*Authentication › Providers › Discord*).
2. Supabase › *Authentication › Providers* : activez **Discord** (identifiant
   client + secret) et **désactivez Email**, sans quoi l'API Supabase reste
   ouverte à une inscription par courriel qui contournerait Discord.
3. *Authentication › URL Configuration* : mettez l'adresse du site dans
   *Site URL* et *Redirect URLs*.
4. Exécutez les migrations `0034` puis `0035`.

**Les deux administrateurs** se désignent par leur identifiant Discord (le
nombre, pas le pseudo : Discord › Paramètres › Avancés › Mode développeur,
puis clic droit sur le profil › *Copier l'identifiant*). Dans l'éditeur SQL :

```sql
insert into public.admins_discord (discord_id, role_key, note) values
  ('111111111111111111', 'super_admin', 'Administrateur 1'),
  ('222222222222222222', 'admin',       'Administrateur 2');
```

Le rôle est accordé à leur prochaine connexion (ou au rechargement de la
page s'ils sont déjà connectés). Ensuite, *Administration › Comptes* permet de
régler les autres rôles à la souris.

## Entretien

- **Journaux** : `activity_logs` grossit avec l'usage. À purger si nécessaire :
  ```sql
  delete from activity_logs where created_at < now() - interval '6 months';
  ```
- **Bibliothèques** : `vendor/README.md` explique comment les régénérer.
- **Sauvegardes** : les sauvegardes automatiques de Supabase dépendent du plan.
  Un `pg_dump` régulier ne coûte rien.
