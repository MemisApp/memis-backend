-- Add push token to User for caregiver/doctor notifications
ALTER TABLE "public"."User" ADD COLUMN "expoPushToken" TEXT;

-- Extend Reminder with recurrence support (ONCE | DAILY | WEEKLY | YEARLY)
ALTER TABLE "public"."Reminder" ADD COLUMN "recurrence" TEXT NOT NULL DEFAULT 'DAILY';
ALTER TABLE "public"."Reminder" ADD COLUMN "scheduledDate" TIMESTAMP(3);
