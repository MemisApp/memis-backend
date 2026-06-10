-- Tracks the last time a "no reminders completed in 24h" alert was sent for a patient.
ALTER TABLE "Patient" ADD COLUMN "lastInactivityAlertAt" TIMESTAMP(3);
