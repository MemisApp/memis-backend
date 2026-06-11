-- Chat restructure (family group + 1:1 DMs) and caregiver/family invites.

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('GROUP', 'DIRECT');
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Room" ADD COLUMN "type" "RoomType" NOT NULL DEFAULT 'GROUP';
ALTER TABLE "Room" ADD COLUMN "key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Room_key_key" ON "Room"("key");

-- CreateTable
CREATE TABLE "RoomParticipant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT,
    "patientId" TEXT,
    "role" "RoomMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomParticipant_roomId_userId_key" ON "RoomParticipant"("roomId", "userId");
CREATE UNIQUE INDEX "RoomParticipant_roomId_patientId_key" ON "RoomParticipant"("roomId", "patientId");
CREATE INDEX "RoomParticipant_userId_idx" ON "RoomParticipant"("userId");
CREATE INDEX "RoomParticipant_patientId_idx" ON "RoomParticipant"("patientId");
CREATE INDEX "RoomParticipant_roomId_idx" ON "RoomParticipant"("roomId");

-- AddForeignKey
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "CaregiverInvite" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "CaregiverRole" NOT NULL DEFAULT 'VIEWER',
    "tokenHash" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaregiverInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaregiverInvite_tokenHash_key" ON "CaregiverInvite"("tokenHash");
CREATE INDEX "CaregiverInvite_patientId_idx" ON "CaregiverInvite"("patientId");
CREATE INDEX "CaregiverInvite_email_idx" ON "CaregiverInvite"("email");
CREATE INDEX "CaregiverInvite_status_idx" ON "CaregiverInvite"("status");

-- AddForeignKey
ALTER TABLE "CaregiverInvite" ADD CONSTRAINT "CaregiverInvite_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaregiverInvite" ADD CONSTRAINT "CaregiverInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill participants from existing user memberships
INSERT INTO "RoomParticipant" ("id", "roomId", "userId", "role", "joinedAt")
SELECT 'rpu_' || "id", "roomId", "userId", "role", "joinedAt" FROM "RoomMember";

-- Backfill patient participants from existing patient-linked rooms
INSERT INTO "RoomParticipant" ("id", "roomId", "patientId", "role", "joinedAt")
SELECT 'rpp_' || "id", "id", "patientId", 'MEMBER', "createdAt" FROM "Room" WHERE "patientId" IS NOT NULL;

-- Existing patient-linked rooms become DIRECT (doctor<->patient); the rest are GROUP by default.
UPDATE "Room" SET "type" = 'DIRECT' WHERE "patientId" IS NOT NULL;
