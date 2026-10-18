import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const logStatus = pgEnum("log_status", [
  "playing",
  "finished",
  "dropped",
  "shelved",
]);

export const likeTarget = pgEnum("like_target", ["review", "list"]);

export const activityVerb = pgEnum("activity_verb", [
  "logged",
  "reviewed",
  "created_list",
]);

export const activityObject = pgEnum("activity_object", [
  "log",
  "review",
  "list",
]);

// Text ids so the auth task can map Better Auth's user model onto this table.
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    favouriteGameIds: integer("favourite_game_ids")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`),
    check(
      "users_favourite_games_max_4",
      sql`cardinality(${t.favouriteGameIds}) <= 4`,
    ),
  ],
);

export const games = pgTable(
  "games",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    igdbId: integer("igdb_id").notNull().unique(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    coverUrl: text("cover_url"),
    releaseDate: date("release_date"),
    summary: text("summary"),
    // Denormalised by a background job; ratings are 1-10 half-stars.
    avgRating: numeric("avg_rating", { precision: 4, scale: 2 }),
    ratingCount: integer("rating_count").notNull().default(0),
  },
  (t) => [
    index("games_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
  ],
);

export const platforms = pgTable("platforms", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  igdbId: integer("igdb_id").notNull().unique(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation"),
});

export const gamePlatforms = pgTable(
  "game_platforms",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    platformId: integer("platform_id")
      .notNull()
      .references(() => platforms.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.platformId] }),
    index("game_platforms_platform_idx").on(t.platformId),
  ],
);

// One row per play of a game by a user; the diary is logs ordered by date.
export const logs = pgTable(
  "logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    platformId: integer("platform_id").references(() => platforms.id, {
      onDelete: "set null",
    }),
    status: logStatus("status").notNull(),
    startedOn: date("started_on"),
    finishedOn: date("finished_on"),
    hours: numeric("hours", { precision: 6, scale: 1 }),
    rating: smallint("rating"),
    hearted: boolean("hearted").notNull().default(false),
    isReplay: boolean("is_replay").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("logs_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("logs_game_idx").on(t.gameId),
    check(
      "logs_rating_range",
      sql`${t.rating} IS NULL OR ${t.rating} BETWEEN 1 AND 10`,
    ),
    check("logs_hours_nonnegative", sql`${t.hours} IS NULL OR ${t.hours} >= 0`),
    check(
      "logs_dates_ordered",
      sql`${t.startedOn} IS NULL OR ${t.finishedOn} IS NULL OR ${t.finishedOn} >= ${t.startedOn}`,
    ),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    logId: integer("log_id")
      .notNull()
      .unique()
      .references(() => logs.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    containsSpoilers: boolean("contains_spoilers").notNull().default(false),
    likeCount: integer("like_count").notNull().default(0),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check("reviews_body_not_blank", sql`btrim(${t.body}) <> ''`)],
);

export const lists = pgTable(
  "lists",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    isRanked: boolean("is_ranked").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("lists_user_idx").on(t.userId)],
);

export const listItems = pgTable(
  "list_items",
  {
    listId: integer("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    note: text("note"),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.gameId] }),
    index("list_items_list_position_idx").on(t.listId, t.position),
  ],
);

export const backlogItems = pgTable(
  "backlog_items",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    platformId: integer("platform_id").references(() => platforms.id, {
      onDelete: "set null",
    }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.gameId] }),
    index("backlog_items_user_position_idx").on(t.userId, t.position),
  ],
);

// One-way follows, like Letterboxd.
export const follows = pgTable(
  "follows",
  {
    followerId: text("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followeeId: text("followee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    index("follows_followee_idx").on(t.followeeId),
    check("follows_not_self", sql`${t.followerId} <> ${t.followeeId}`),
  ],
);

// Polymorphic: target_id points at reviews.id or lists.id depending on target_type.
export const likes = pgTable(
  "likes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: likeTarget("target_type").notNull(),
    targetId: integer("target_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
    index("likes_target_idx").on(t.targetType, t.targetId),
  ],
);

// Written on each log, review and list; the feed reads it for followed users (fan-out on read).
export const activities = pgTable(
  "activities",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verb: activityVerb("verb").notNull(),
    objectType: activityObject("object_type").notNull(),
    objectId: integer("object_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("activities_actor_created_idx").on(t.actorId, t.createdAt.desc()),
  ],
);
