-- Composite indexes for hot query paths
CREATE INDEX IF NOT EXISTS "reservations_boatId_startDate_idx" ON "reservations"("boatId", "startDate");
CREATE INDEX IF NOT EXISTS "reservations_userId_status_startDate_idx" ON "reservations"("userId", "status", "startDate");
CREATE INDEX IF NOT EXISTS "operational_queue_boatId_status_position_idx" ON "operational_queue"("boatId", "status", "position");
CREATE INDEX IF NOT EXISTS "charges_userId_status_dueDate_idx" ON "charges"("userId", "status", "dueDate");
CREATE INDEX IF NOT EXISTS "fuel_logs_boatId_loggedAt_idx" ON "fuel_logs"("boatId", "loggedAt");
CREATE INDEX IF NOT EXISTS "notifications_userId_read_sentAt_idx" ON "notifications"("userId", "read", "sentAt");
