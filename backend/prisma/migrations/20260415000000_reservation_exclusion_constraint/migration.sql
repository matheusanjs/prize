-- Prevent overlapping reservations for the same boat
-- Using a trigger-based approach since tstzrange exclusion constraints
-- require IMMUTABLE functions which timezone-aware ranges don't support

CREATE OR REPLACE FUNCTION check_reservation_overlap()
RETURNS TRIGGER AS $$
BEGIN
  -- Only check overlaps for active reservations
  IF NEW.status IN ('CONFIRMED', 'PENDING', 'IN_USE') AND NEW."deletedAt" IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM "reservations"
      WHERE "boatId" = NEW."boatId"
        AND id != NEW.id
        AND status IN ('CONFIRMED', 'PENDING', 'IN_USE')
        AND "deletedAt" IS NULL
        AND "startDate" < NEW."endDate"
        AND "endDate" > NEW."startDate"
    ) THEN
      RAISE EXCEPTION 'Horario indisponivel. Esta embarcacao ja esta reservada no periodo solicitado.'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reservation_overlap_check
  BEFORE INSERT OR UPDATE OF "startDate", "endDate", "status", "deletedAt"
  ON "reservations"
  FOR EACH ROW
  EXECUTE FUNCTION check_reservation_overlap();
