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
  maxCaregivers: number;
  testHistoryLimit: number | null;
  entitlements: Record<EntitlementKey, boolean>;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  FREE: {
    aiMessagesPerMonth: 20,
    maxPatients: 1,
    maxCaregivers: 1,
    testHistoryLimit: 3,
    entitlements: {
      ai_patient_context: false,
      clinical_insights: false,
      medication_management: false,
      journaling: false,
      pdf_export: false,
      // Accessibility is never paywalled: the people who need large text and
      // high contrast are the patients themselves.
      accessibility_suite: true,
      multi_caregiver: false,
      safety_location: false,
      care_digest: false,
    },
  },
  PLUS: {
    // Fair-use ceiling rather than truly unlimited; protects the AI budget
    // without ever being reachable by a real caregiver.
    aiMessagesPerMonth: 500,
    maxPatients: 1,
    maxCaregivers: 1,
    testHistoryLimit: null,
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
    aiMessagesPerMonth: 500,
    // Consumer ceiling. Professional/facility use belongs in a future Pro tier
    // rather than leaking into the cheapest multi-patient plan.
    maxPatients: 3,
    maxCaregivers: 10,
    testHistoryLimit: null,
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
