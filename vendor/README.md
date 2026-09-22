# Bibliothèques livrées avec le site

Ces fichiers sont versionnés volontairement : l'application ne dépend d'aucun
CDN tiers au moment de l'exécution. Elle fonctionne donc derrière un réseau
restreint, et une panne ou une modification chez un hébergeur externe ne peut
pas casser le site en production.

| Fichier                | Origine                  | Version  |
|------------------------|--------------------------|----------|
| `supabase-js.min.js`   | `@supabase/supabase-js`  | 2.45.4   |
| `pdf.min.mjs`          | `pdfjs-dist`             | 4.6.82   |
| `pdf.worker.min.mjs`   | `pdfjs-dist`             | 4.6.82   |

`supabase-js.min.js` est chargé au démarrage ; les deux fichiers `pdf.*` ne le
sont qu'au moment d'une conversion de PDF en pages de cahier.

## Régénérer

```sh
npm install @supabase/supabase-js@2.45.4 pdfjs-dist@4.6.82 esbuild

npx esbuild node_modules/@supabase/supabase-js/dist/module/index.js \
  --bundle --format=esm --platform=browser --target=es2020 --minify \
  --outfile=vendor/supabase-js.min.js

cp node_modules/pdfjs-dist/build/pdf.min.mjs        vendor/
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs vendor/
```

En cas d'absence de ces fichiers, `src/data/supabase.js` et
`src/features/import-document.js` se replient automatiquement sur esm.sh.
