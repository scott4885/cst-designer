-- Add staggerOffsetMin to Provider for persisting doctor start-time stagger
ALTER TABLE "Provider" ADD COLUMN "staggerOffsetMin" INTEGER NOT NULL DEFAULT 0;
