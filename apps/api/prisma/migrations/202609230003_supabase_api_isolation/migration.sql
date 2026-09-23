-- The application uses Fastify and Prisma, not Supabase's Data API. Supabase
-- projects may grant anon/authenticated direct access to new public tables.
-- This block is a no-op on ordinary PostgreSQL installations without those roles.
DO $$
DECLARE
  table_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    FOREACH table_name IN ARRAY ARRAY[
      'User', 'Session', 'Account', 'Verification', 'RateLimit', 'Guest',
      'RoomType', 'Room', 'Amenity', 'RoomAmenity', 'RoomImage', 'RoomBlock',
      'Reservation', 'ReservationRoom', 'ReservationStatusHistory',
      'ReservationEvent', 'VerificationToken', 'GuestGrant', 'Payment',
      'Promotion', 'PromotionRoomType', 'PromotionRoom', 'PromotionRedemption',
      'GalleryItem', 'Notification', 'AuditLog', 'SystemSettings',
      'HotelContent', 'OutboxJob', 'EmailQuota', 'Integration',
      'ExternalPropertyMapping', 'ExternalRoomMapping', 'ExternalRateMapping',
      'IntegrationSyncLog', 'WebhookEvent', '_prisma_migrations'
    ] LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated, service_role',
        table_name
      );
    END LOOP;

    -- Keep later Prisma migrations private until reviewed for API exposure.
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;
  END IF;
END $$;
