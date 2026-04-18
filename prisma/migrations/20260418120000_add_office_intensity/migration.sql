-- Loop 3: Default mix prescription everywhere.
-- Adds the per-office `intensity` dial that drives the default prescription
-- engine. 0.0 = conservative (lower HP ceiling, more buffer/recare), 1.0 =
-- aggressive (higher HP ceiling, less buffer). Nullable — existing offices
-- fall back to the 0.5 default at read time.
ALTER TABLE "Office" ADD COLUMN "intensity" REAL;
