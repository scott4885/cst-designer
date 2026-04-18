-- Loop 9: Variant day support (Early-Off Friday, Opt1/Opt2 alternate schedules).
-- Adds a nullable `variantLabel` to ScheduleTemplate so a day can be tagged
-- with a variant (e.g. "EOF", "Opt1", "Opt2"). When null/empty, the schedule
-- is the regular (non-variant) version of that day. Additive + nullable, so
-- existing rows keep working without backfill.
ALTER TABLE "ScheduleTemplate" ADD COLUMN "variantLabel" TEXT;
