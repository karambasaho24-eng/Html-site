-- Les notes et les présences ne s'écrivent pas soi-même.
--
-- Un élève pouvait, en appelant l'API directement :
--   · inscrire sa propre note sur sa copie (score, correction, appréciation)
--     tant qu'elle était « commencée », puis la rendre ;
--   · noter lui-même ses réponses ;
--   · se déclarer présent à une séance, ou gonfler son temps de présence.
-- Le site, lui, ne passe jamais par là : la note vient du professeur ou de
-- la correction automatique (réservée au professeur), la présence du
-- pointage (check_in) et de la fin de séance, côté serveur.
--
-- Les fonctions du serveur (SECURITY DEFINER) s'exécutent sous leur
-- propriétaire : seul un appel direct du navigateur (rôle « authenticated »)
-- est bridé. Les gardes, elles, s'exécutent sous le rôle de l'appelant
-- (SECURITY INVOKER) : c'est ce qui leur permet de le reconnaître.

-- --- Copies ---------------------------------------------------------------
create or replace function public.app_garde_copie()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if current_user <> 'authenticated' or app_is_staff(app_exercise_class(new.exercise_id)) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'started';
    new.score := null; new.max_score := null; new.feedback := null;
    new.graded_by := null; new.graded_at := null;
  else
    new.score := old.score; new.max_score := old.max_score; new.feedback := old.feedback;
    new.graded_by := old.graded_by; new.graded_at := old.graded_at;
    new.exercise_id := old.exercise_id; new.user_id := old.user_id;
  end if;
  return new;
end $$;

-- --- Réponses -------------------------------------------------------------
create or replace function public.app_garde_reponse()
returns trigger language plpgsql security invoker set search_path = public as $$
declare exo uuid;
begin
  select exercise_id into exo from exercise_attempts where id = new.attempt_id;
  if current_user <> 'authenticated' or app_is_staff(app_exercise_class(exo)) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.score := null; new.correct := null; new.feedback := null;
  else
    new.score := old.score; new.correct := old.correct; new.feedback := old.feedback;
    new.attempt_id := old.attempt_id; new.question_id := old.question_id;
  end if;
  return new;
end $$;

drop trigger if exists exercise_attempts_garde on public.exercise_attempts;
create trigger exercise_attempts_garde
  before insert or update on public.exercise_attempts
  for each row execute function public.app_garde_copie();

drop trigger if exists exercise_answers_garde on public.exercise_answers;
create trigger exercise_answers_garde
  before insert or update on public.exercise_answers
  for each row execute function public.app_garde_reponse();

-- --- Présences ------------------------------------------------------------
-- L'élève pointe par check_in ; seul l'encadrement écrit la feuille.
drop policy if exists attendance_self on public.attendance;
drop policy if exists attendance_self_update on public.attendance;
create policy attendance_staff_insert on public.attendance
  for insert with check (app_is_staff(app_session_class(session_id)));
create policy attendance_staff_update on public.attendance
  for update using (app_is_staff(app_session_class(session_id)))
  with check (app_is_staff(app_session_class(session_id)));

revoke execute on function public.app_garde_copie() from public, anon;
revoke execute on function public.app_garde_reponse() from public, anon;
