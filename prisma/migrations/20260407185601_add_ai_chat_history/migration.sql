-- CreateEnum
CREATE TYPE "public"."AiOwnerRole" AS ENUM ('CAREGIVER', 'PATIENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."AiMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "public"."AiConversation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "ownerRole" "public"."AiOwnerRole" NOT NULL,
    "patientId" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "public"."AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "contactSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiConversation_ownerId_ownerRole_updatedAt_idx" ON "public"."AiConversation"("ownerId", "ownerRole", "updatedAt");

-- CreateIndex
CREATE INDEX "AiConversation_patientId_idx" ON "public"."AiConversation"("patientId");

-- CreateIndex
CREATE INDEX "AiConversationMessage_conversationId_createdAt_idx" ON "public"."AiConversationMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."AiConversationMessage" ADD CONSTRAINT "AiConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
