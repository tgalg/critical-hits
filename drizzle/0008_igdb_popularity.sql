ALTER TABLE "games" ADD COLUMN "igdb_rating" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "igdb_rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "igdb_hypes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "games_igdb_rating_count_idx" ON "games" USING btree ("igdb_rating_count");--> statement-breakpoint
CREATE INDEX "games_release_date_idx" ON "games" USING btree ("release_date");