-- reviews.like_count follows the likes table in the database, so every path
-- that adds or removes a like (including cascades when a player is deleted)
-- keeps it right.
CREATE FUNCTION reviews_like_count_sync() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE reviews SET like_count = like_count + 1 WHERE id = NEW.target_id;
  ELSE
    UPDATE reviews SET like_count = like_count - 1 WHERE id = OLD.target_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER likes_review_count_insert AFTER INSERT ON likes
  FOR EACH ROW WHEN (NEW.target_type = 'review')
  EXECUTE FUNCTION reviews_like_count_sync();
--> statement-breakpoint
CREATE TRIGGER likes_review_count_delete AFTER DELETE ON likes
  FOR EACH ROW WHEN (OLD.target_type = 'review')
  EXECUTE FUNCTION reviews_like_count_sync();
--> statement-breakpoint
UPDATE reviews SET like_count = (
  SELECT count(*) FROM likes
  WHERE likes.target_type = 'review' AND likes.target_id = reviews.id
);
