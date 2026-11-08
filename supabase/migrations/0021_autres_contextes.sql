-- ===========================================================================
-- 0021 — L'école n'est qu'un contexte : mission et entretien
-- ===========================================================================
alter type session_mode add value if not exists 'mission';
alter type session_mode add value if not exists 'entretien';
