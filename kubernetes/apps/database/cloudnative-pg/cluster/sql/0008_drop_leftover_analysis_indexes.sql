-- ============================================================================
-- 0008_drop_leftover_analysis_indexes.sql
-- ----------------------------------------------------------------------------
-- Drop unused secondary indexes on leftover public.tmp_july_analysis.
-- Applied to the live cluster by hand; listed in bootstrap so a rebuilt
-- cluster is a no-op (IF EXISTS) if the table is absent.
-- ============================================================================

DROP INDEX IF EXISTS public.tmp_july_analysis_entry_time_idx;
DROP INDEX IF EXISTS public.tmp_july_analysis_user_id_entry_time_idx;
