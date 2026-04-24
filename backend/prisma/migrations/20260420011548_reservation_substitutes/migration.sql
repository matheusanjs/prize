-- AlterTable: Reservation transfer audit fields
ALTER TABLE "reservations" ADD COLUMN     "transferredFromUserId" TEXT;
ALTER TABLE "reservations" ADD COLUMN     "transferredAt" TIMESTAMP(3);

-- CreateTable: substitute requests
CREATE TABLE "reservation_substitutes" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "substituteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "promotedAt" TIMESTAMP(3),
    CONSTRAINT "reservation_substitutes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reservation_substitutes_reservationId_substituteId_key" ON "reservation_substitutes"("reservationId", "substituteId");
CREATE INDEX "reservation_substitutes_reservationId_status_idx" ON "reservation_substitutes"("reservationId", "status");
CREATE INDEX "reservation_substitutes_substituteId_status_idx" ON "reservation_substitutes"("substituteId", "status");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_transferredFromUserId_fkey" FOREIGN KEY ("transferredFromUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reservation_substitutes" ADD CONSTRAINT "reservation_substitutes_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reservation_substitutes" ADD CONSTRAINT "reservation_substitutes_substituteId_fkey" FOREIGN KEY ("substituteId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
