-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "patientAuthorId" TEXT,
ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "patientId" TEXT;

-- CreateIndex
CREATE INDEX "Message_patientAuthorId_idx" ON "public"."Message"("patientAuthorId");

-- CreateIndex
CREATE INDEX "Room_patientId_idx" ON "public"."Room"("patientId");

-- AddForeignKey
ALTER TABLE "public"."Room" ADD CONSTRAINT "Room_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "public"."Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_patientAuthorId_fkey" FOREIGN KEY ("patientAuthorId") REFERENCES "public"."Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
