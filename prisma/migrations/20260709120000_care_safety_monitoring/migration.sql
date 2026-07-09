-- Location safety (safe zones + pings), daily check-ins, per-patient care
-- settings, and a medication refill-alert throttle.

-- AlterTable
ALTER TABLE "Medication" ADD COLUMN "lastRefillAlertAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SafeZone" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusM" INTEGER NOT NULL DEFAULT 150,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafeZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "battery" DOUBLE PRECISION,
    "insideSafeZone" BOOLEAN,
    "source" TEXT NOT NULL DEFAULT 'app',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientCareSettings" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "lastKnownLat" DOUBLE PRECISION,
    "lastKnownLng" DOUBLE PRECISION,
    "lastLocationAt" TIMESTAMP(3),
    "lastKnownInsideSafeZone" BOOLEAN,
    "lastWanderAlertAt" TIMESTAMP(3),
    "checkInEnabled" BOOLEAN NOT NULL DEFAULT false,
    "checkInByHour" INTEGER NOT NULL DEFAULT 20,
    "lastCheckInAt" TIMESTAMP(3),
    "lastMissedCheckInAlertAt" TIMESTAMP(3),
    "lastMissedMedAlertAt" TIMESTAMP(3),
    "cognitiveMonitoringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastCognitivePromptAt" TIMESTAMP(3),
    "lastDeclineAlertAt" TIMESTAMP(3),
    "digestFrequency" TEXT NOT NULL DEFAULT 'OFF',
    "lastDigestAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientCareSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SafeZone_patientId_idx" ON "SafeZone"("patientId");
CREATE INDEX "LocationPing_patientId_createdAt_idx" ON "LocationPing"("patientId", "createdAt");
CREATE INDEX "CheckIn_patientId_createdAt_idx" ON "CheckIn"("patientId", "createdAt");
CREATE UNIQUE INDEX "PatientCareSettings_patientId_key" ON "PatientCareSettings"("patientId");

-- AddForeignKey
ALTER TABLE "SafeZone" ADD CONSTRAINT "SafeZone_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientCareSettings" ADD CONSTRAINT "PatientCareSettings_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
