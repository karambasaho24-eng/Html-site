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

- **Confirmation par courriel** : activée par défaut. Laissez-la si votre
  académie accepte des inscriptions ouvertes ; désactivez-la si les comptes
  sont créés par l'administration.
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

Glissez le dossier sur [app.netlify.com/drop](https://app.netlify.com/drop),
ou connectez le dépôt avec :

- commande de build : *(aucune)*
- dossier à publier : `.`

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
