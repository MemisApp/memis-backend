import { SubscriptionPlan } from '@prisma/client';

export type EntitlementKey =
  | 'ai_patient_context'
  | 'clinical_insights'
  | 'medication_management'
  | 'journaling'
  | 'pdf_export'
  | 'accessibility_suite'
  | 'multi_caregiver'
  | 'safety_location'
  | 'care_digest';

export interface PlanLimits {
  aiMessagesPerMonth: number | null;
  maxPatients: number;
  entitlements: Record<EntitlementKey, boolean>;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  FREE: {
    aiMessagesPerMonth: 10,
    maxPatients: 1,
    entitlements: {
      ai_patient_context: false,
      clinical_insights: false,
      medication_management: false,
      journaling: false,
      pdf_export: false,
      accessibility_suite: false,
      multi_caregiver: false,
      safety_location: false,
      care_digest: false,
    },
  },
  PLUS: {
    aiMessagesPerMonth: null,
    maxPatients: 1,
    entitlements: {
      ai_patient_context: true,
      clinical_insights: true,
      medication_management: true,
      journaling: true,
      pdf_export: true,
      accessibility_suite: true,
      multi_caregiver: false,
      // Location safety / wander alerts / SOS / check-in anchor the paid tier.
      safety_location: true,
      care_digest: true,
    },
  },
  FAMILY: {
    aiMessagesPerMonth: null,
    maxPatients: 25,
    entitlements: {
      ai_patient_context: true,
      clinical_insights: true,
      medication_management: true,
      journaling: true,
      pdf_export: true,
      accessibility_suite: true,
      multi_caregiver: true,
      safety_location: true,
      care_digest: true,
    },
  },
};

export function planFromProductId(productId?: string | null): SubscriptionPlan {
  if (!productId) return SubscriptionPlan.FREE;
  const id = productId.toLowerCase();
  if (id.includes('family')) return SubscriptionPlan.FAMILY;
  if (id.includes('plus') || id.includes('premium') || id.includes('care')) {
    return SubscriptionPlan.PLUS;
  }
  return SubscriptionPlan.FREE;
}

export function currentBillingPeriod(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
