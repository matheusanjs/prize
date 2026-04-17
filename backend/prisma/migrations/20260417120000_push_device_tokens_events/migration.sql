-- AlterTable: enrich device_tokens with iOS push metadata + enabled/lastSeenAt tracking
ALTER TABLE "device_tokens"
  ADD COLUMN IF NOT EXISTS "appVersion"  TEXT,
  ADD COLUMN IF NOT EXISTS "bundleId"    TEXT,
  ADD COLUMN IF NOT EXISTS "deviceName"  TEXT,
  ADD COLUMN IF NOT EXISTS "enabled"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "locale"      TEXT,
  ADD COLUMN IF NOT EXISTS "osVersion"   TEXT,
  ADD COLUMN IF NOT EXISTS "timezone"    TEXT,
  ADD COLUMN IF NOT EXISTS "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable: analytics-friendly record of delivered/opened/dismissed/action events
CREATE TABLE IF NOT EXISTS "notification_events" (
    "id"             TEXT        NOT NULL,
    "userId"         TEXT        NOT NULL,
    "deviceTokenId"  TEXT,
    "kind"           TEXT        NOT NULL,
    "notificationId" TEXT,
    "messageId"      TEXT,
    "data"           JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_events_userId_kind_createdAt_idx"
  ON "notification_events"("userId", "kind", "createdAt");

CREATE INDEX IF NOT EXISTS "notification_events_notificationId_idx"
  ON "notification_events"("notificationId");

CREATE INDEX IF NOT EXISTS "device_tokens_platform_idx"
  ON "device_tokens"("platform");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_events_deviceTokenId_fkey'
  ) THEN
    ALTER TABLE "notification_events"
      ADD CONSTRAINT "notification_events_deviceTokenId_fkey"
      FOREIGN KEY ("deviceTokenId") REFERENCES "device_tokens"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
