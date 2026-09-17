-- ============================================================================
-- 0009_drop_tmp_july_analysis.sql
-- ----------------------------------------------------------------------------
-- Drop leftover public.tmp_july_analysis (ad-hoc analysis copy, RLS off).
-- Applied to the live cluster by hand; listed in bootstrap so a rebuilt
-- cluster is a no-op if the table is absent.
-- ============================================================================

DROP TABLE IF EXISTS public.tmp_july_analysis CASCADE;
