CREATE TABLE "game_genres" (
	"game_id" integer NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "game_genres_game_id_genre_id_pk" PRIMARY KEY("game_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "genres_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"igdb_id" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "genres_igdb_id_unique" UNIQUE("igdb_id")
);
--> statement-breakpoint
ALTER TABLE "game_genres" ADD CONSTRAINT "game_genres_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_genres" ADD CONSTRAINT "game_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_genres_genre_idx" ON "game_genres" USING btree ("genre_id");--> statement-breakpoint
-- Games synced before genres existed have none; restart the nightly backfill so it fills them in.
UPDATE "sync_cursors" SET "cursor" = 0, "done" = false WHERE "name" = 'igdb-backfill';
