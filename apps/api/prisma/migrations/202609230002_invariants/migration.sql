CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "no_active_room_overlap"
EXCLUDE USING gist ("roomId" WITH =, daterange("checkIn", "checkOut", '[)') WITH &&) WHERE (active);
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "allocation_valid_dates" CHECK ("checkOut" > "checkIn"), ADD CONSTRAINT "allocation_positive_rate" CHECK ("nightlyRate" > 0);
ALTER TABLE "Reservation" ADD CONSTRAINT "reservation_valid_dates" CHECK ("checkOut" > "checkIn"), ADD CONSTRAINT "reservation_price_integrity" CHECK (subtotal >= 0 AND discount >= 0 AND discount <= subtotal AND total = subtotal - discount), ADD CONSTRAINT "reservation_counts" CHECK ("guestCount" >= "roomCount" AND "roomCount" > 0);
ALTER TABLE "Room" ADD CONSTRAINT "room_capacity" CHECK (capacity > 0), ADD CONSTRAINT "room_price" CHECK ("basePrice" IS NULL OR "basePrice" > 0);
ALTER TABLE "RoomType" ADD CONSTRAINT "roomtype_capacity_price" CHECK (capacity > 0 AND "basePrice" > 0);
ALTER TABLE "RoomBlock" ADD CONSTRAINT "block_valid_dates" CHECK ("endDate" > "startDate");
ALTER TABLE "Promotion" ADD CONSTRAINT "promotion_validity" CHECK ("endsAt" > "startsAt" AND value > 0 AND (kind <> 'PERCENTAGE' OR value <= 100) AND "usageLimit" > 0 AND "perEmailLimit" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "payment_sign" CHECK (("reversalOfId" IS NULL AND amount > 0) OR ("reversalOfId" IS NOT NULL AND amount < 0));
CREATE FUNCTION prevent_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical records are append-only'; END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER payment_append_only BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER status_append_only BEFORE UPDATE OR DELETE ON "ReservationStatusHistory" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER events_append_only BEFORE UPDATE OR DELETE ON "ReservationEvent" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE FUNCTION prevent_reservation_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Reservations must be retained'; END;
$$;
CREATE TRIGGER reservation_retain BEFORE DELETE ON "Reservation" FOR EACH ROW EXECUTE FUNCTION prevent_reservation_delete();
