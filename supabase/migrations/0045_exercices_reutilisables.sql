-- 0045 — Exercices réutilisables + QCM à réponses multiples libres
-- À exécuter UNE FOIS dans Supabase → SQL Editor.

-- 1. Réglages par question (plusieurs réponses, points partiels, mélange)
alter table exercise_questions add column if not exists settings jsonb not null default '{}'::jsonb;

-- 2. Plusieurs passages par élève : une « manche » à chaque relance de l'exercice
alter table exercise_attempts add column if not exists round int not null default 1;
alter table exercise_attempts drop constraint if exists exercise_attempts_exercise_id_user_id_key;
create unique index if not exists attempts_ex_user_round_uidx on exercise_attempts(exercise_id, user_id, round);

-- 3. Supprimer une question n'efface plus les anciennes réponses des élèves
alter table exercise_answers drop constraint if exists exercise_answers_question_id_fkey;

-- 4. Vue élève : expose les réglages, jamais la solution
create or replace view exercise_questions_public
with (security_invoker = true) as
  select id, exercise_id, position, kind, prompt, helper, options, points, settings
    from exercise_questions;

-- 5. Correction automatique : une ou plusieurs bonnes réponses, points partiels en option
create or replace function autograde_attempt(target_attempt uuid)
returns exercise_attempts
language plpgsql volatile security definer set search_path = public as $$
declare
  att exercise_attempts; q record; ans exercise_answers;
  total numeric := 0; max_total numeric := 0; ok boolean; sc numeric;
  good jsonb; got jsonb; nb_good int; hit int; wrong int;
begin
  select * into att from exercise_attempts where id = target_attempt;
  if not found then raise exception 'Tentative introuvable' using errcode = 'P0002'; end if;
  if not app_is_staff(app_exercise_class(att.exercise_id)) then
    raise exception 'Permission refusée' using errcode = '42501';
  end if;

  for q in select * from exercise_questions where exercise_id = att.exercise_id loop
    max_total := max_total + q.points;
    select * into ans from exercise_answers where attempt_id = target_attempt and question_id = q.id;
    if not found then continue; end if;
    if q.solution is null then
      total := total + coalesce(ans.score, 0);
      continue;
    end if;

    if q.kind in ('qcm', 'single', 'multiple') then
      good := case jsonb_typeof(q.solution) when 'array' then q.solution else jsonb_build_array(q.solution) end;
      got  := case jsonb_typeof(ans.response) when 'array' then ans.response
                when 'number' then jsonb_build_array(ans.response) else '[]'::jsonb end;
      nb_good := jsonb_array_length(good);
      select count(*) filter (where good @> jsonb_build_array(t.v)),
             count(*) filter (where not good @> jsonb_build_array(t.v))
        into hit, wrong from jsonb_array_elements(got) as t(v);
      ok := (hit = nb_good and wrong = 0);
      sc := case
        when ok then q.points
        when coalesce((q.settings ->> 'partiel')::boolean, false)
          then round(q.points * greatest(0, hit - wrong)::numeric / greatest(nb_good, 1), 2)
        else 0 end;
      update exercise_answers set correct = ok, score = sc where id = ans.id;
      total := total + sc;
    elsif q.kind in ('truefalse', 'ordering', 'matching', 'fill') then
      ok := (ans.response = q.solution);
      update exercise_answers set correct = ok, score = case when ok then q.points else 0 end where id = ans.id;
      if ok then total := total + q.points; end if;
    elsif ans.score is not null then
      total := total + ans.score;
    end if;
  end loop;

  update exercise_attempts
     set score = total, max_score = max_total, status = 'graded', graded_by = auth.uid(), graded_at = now()
   where id = target_attempt returning * into att;
  return att;
end $$;
