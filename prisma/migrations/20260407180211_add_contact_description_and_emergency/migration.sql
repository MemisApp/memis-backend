-- AlterTable
ALTER TABLE "public"."Contact" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isEmergencyContact" BOOLEAN NOT NULL DEFAULT false;
