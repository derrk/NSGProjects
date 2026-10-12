-- Two tables were keyed globally that are owned per division.
--
-- `blocked_phrases` is the worse of the two, and it was not theoretical: the seed
-- script inserts the ten-phrase IP list with onConflictDoNothing, so the FIRST pod
-- division to be created took every phrase and every division created after it
-- silently took none. On this machine that was Deadstock 10, Paw Order 0, Filament
-- Works 0, Anti Scalper Club 0 — three divisions whose IP gate let everything
-- through while reading, from the code, as though it were switched on.
--
-- `niches` is the same shape with a different consequence: two divisions that both
-- find "dog people" cannot both have it, so the second one's scout either raises a
-- constraint violation or overwrites the first division's row with its own score.
--
-- Nothing is deleted here. The old index is dropped and a per-division one takes its
-- place, so existing rows keep working and the divisions that have none can finally
-- be given some.

DROP INDEX IF EXISTS "pod"."pod_blocked_phrases_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "pod_blocked_phrases_idx" ON "pod"."blocked_phrases" USING btree ("division_id","phrase");--> statement-breakpoint

DROP INDEX IF EXISTS "pod"."pod_niches_name_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "pod_niches_name_idx" ON "pod"."niches" USING btree ("division_id","name");
