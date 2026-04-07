-- CreateEnum
CREATE TYPE "public"."Workplace" AS ENUM ('LSMUKK', 'KLAIPEDOS_LIGONINE', 'VU_LIGONINE');

-- CreateEnum
CREATE TYPE "public"."DoctorPatientStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "public"."Role" ADD VALUE 'DOCTOR';

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "profession" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "workplace" "public"."Workplace";

-- CreateTable
CREATE TABLE "public"."DoctorPatient" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "public"."DoctorPatientStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorPatient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Anamneze" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anamneze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClockTest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClockTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MMSETest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "assignedByDoctor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MMSETest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Treatment" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Treatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DoctorNote" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AppNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "patientId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "actorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoctorPatient_doctorId_status_idx" ON "public"."DoctorPatient"("doctorId", "status");

-- CreateIndex
CREATE INDEX "DoctorPatient_patientId_idx" ON "public"."DoctorPatient"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorPatient_doctorId_patientId_key" ON "public"."DoctorPatient"("doctorId", "patientId");

-- CreateIndex
CREATE INDEX "Anamneze_patientId_updatedAt_idx" ON "public"."Anamneze"("patientId", "updatedAt");

-- CreateIndex
CREATE INDEX "Anamneze_doctorId_idx" ON "public"."Anamneze"("doctorId");

-- CreateIndex
CREATE INDEX "ClockTest_patientId_createdAt_idx" ON "public"."ClockTest"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "MMSETest_patientId_createdAt_idx" ON "public"."MMSETest"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "MMSETest_assignedByDoctor_idx" ON "public"."MMSETest"("assignedByDoctor");

-- CreateIndex
CREATE INDEX "Treatment_patientId_createdAt_idx" ON "public"."Treatment"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Treatment_doctorId_idx" ON "public"."Treatment"("doctorId");

-- CreateIndex
CREATE INDEX "DoctorNote_patientId_updatedAt_idx" ON "public"."DoctorNote"("patientId", "updatedAt");

-- CreateIndex
CREATE INDEX "DoctorNote_doctorId_idx" ON "public"."DoctorNote"("doctorId");

-- CreateIndex
CREATE INDEX "AppNotification_userId_isRead_createdAt_idx" ON "public"."AppNotification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "AppNotification_patientId_idx" ON "public"."AppNotification"("patientId");

-- AddForeignKey
ALTER TABLE "public"."DoctorPatient" ADD CONSTRAINT "DoctorPatient_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DoctorPatient" ADD CONSTRAINT "DoctorPatient_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "public"."Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Anamneze" ADD CONSTRAINT "Anamneze_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "public"."Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Anamneze" ADD CONSTRAINT "Anamneze_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClockTest" ADD CONSTRAINT "ClockTest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "public"."Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MMSETest" ADD CONSTRAINT "MMSETest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "public"."Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Treatment" ADD CONSTRAINT "Treatment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "public"."Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Treatment" ADD CONSTRAINT "Treatment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DoctorNote" ADD CONSTRAINT "DoctorNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "public"."Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DoctorNote" ADD CONSTRAINT "DoctorNote_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppNotification" ADD CONSTRAINT "AppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppNotification" ADD CONSTRAINT "AppNotification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "public"."Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AppNotification" ADD CONSTRAINT "AppNotification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
