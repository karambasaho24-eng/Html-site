@echo off
rem ---------------------------------------------------------------------------
rem  Mettre le site en ligne sur Netlify, depuis CMD.
rem
rem    deployer.cmd
rem
rem  La premiere fois : Netlify ouvre le navigateur pour vous connecter, puis
rem  demande a quel projet relier ce dossier (choisir "Create & configure a
rem  new project", nom : classe-parallele-rp). Les fois suivantes, tout part
rem  directement.
rem
rem  Rien a compiler : config.js contient deja l adresse Supabase et la cle
rem  publique. Aucune cle secrete ici, jamais : le depot est public.
rem ---------------------------------------------------------------------------
cd /d "%~dp0"

where node >/dev/null 2>&1 || (echo Il faut Node.js : winget install OpenJS.NodeJS.LTS & pause & exit /b 1)

echo.
echo 1/3  Je recupere la derniere version...
git pull

echo.
echo 2/3  Connexion a Netlify (une seule fois)...
call npx --yes netlify-cli status >/dev/null 2>&1 || call npx --yes netlify-cli login

echo.
echo 3/3  Publication...
call npx --yes netlify-cli deploy --prod --dir .

echo.
pause
