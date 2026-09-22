# Déploiement

Le site est entièrement statique : aucun serveur d'application, aucune
compilation. Un dossier, un hébergeur.

## 1. Le projet Supabase

Créez un projet sur [supabase.com](https://supabase.com), puis exécutez les
migrations **dans l'ordre**, depuis l'éditeur SQL :

```
supabase/migrations/0001_schema.sql        tables, types, index, déclencheurs
supabase/migrations/0002_rls.sql           fonctions d'aide et politiques RLS
supabase/migrations/0003_functions.sql     procédures, vues, Realtime, Storage
supabase/migrations/0004_seed_rbac.sql     rôles et permissions
supabase/migrations/0005_hardening.sql     search_path figé, surface RPC réduite
supabase/migrations/0006_fix_join_class.sql correctif de join_class
```

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
  academyName: "OJM Academy",
  academyMotto: "Ordre · Justice · Mérite",
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

## Premiers comptes

Le premier compte créé est un élève ou un professeur ordinaire. Pour désigner
l'administration, promouvez-le depuis l'éditeur SQL :

```sql
update profiles set role_key = 'super_admin'
 where id = (select id from auth.users where email = 'vous@exemple.fr');
```

Ce compte donne ensuite accès à *Administration › Comptes*, d'où les autres
rôles se règlent à la souris.

## Entretien

- **Journaux** : `activity_logs` grossit avec l'usage. À purger si nécessaire :
  ```sql
  delete from activity_logs where created_at < now() - interval '6 months';
  ```
- **Bibliothèques** : `vendor/README.md` explique comment les régénérer.
- **Sauvegardes** : les sauvegardes automatiques de Supabase dépendent du plan.
  Un `pg_dump` régulier ne coûte rien.
