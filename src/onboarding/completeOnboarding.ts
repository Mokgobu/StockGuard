export type OnboardingPayload = {
  businessName: string;
  ownerName: string;
  businessType: string;
  phone: string;
  location: string;
  employeeCount: number;
  criticalDays: number;
  urgentDays: number;
  soonDays: number;
  watchDays: number;
  termsAccepted: boolean;
  privacyAccepted: boolean;
};

export type OnboardingErrorInfo = {
  code: string;
  userMessage: string;
  reference: string | null;
};

type ClientDependencies = {
  getIdToken: () => Promise<string>;
  getAppCheckToken: () => Promise<string>;
  fetch?: typeof globalThis.fetch;
};

type ErrorEnvelope = {
  error?: { code?: unknown };
  requestId?: unknown;
};

export class OnboardingRequestError extends Error {
  constructor(public readonly code: string, public readonly status: number, public readonly reference: string | null = null) {
    super(code);
    this.name = 'OnboardingRequestError';
  }
}

function safeCode(value: unknown) {
  return typeof value === 'string' && /^[a-z0-9_]{1,50}$/.test(value) ? value : 'onboarding_failed';
}

function safeReference(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
}

export async function completeOnboarding(payload: OnboardingPayload, dependencies: ClientDependencies) {
  const fetchRequest = dependencies.fetch ?? globalThis.fetch;
  try {
    const [idToken, appCheckToken] = await Promise.all([
      dependencies.getIdToken(),
      dependencies.getAppCheckToken(),
    ]);
    const response = await fetchRequest('/api/complete-onboarding', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': appCheckToken,
      },
      body: JSON.stringify(payload),
    });
    let envelope: ErrorEnvelope & { ok?: unknown; businessId?: unknown };
    try {
      envelope = await response.json() as ErrorEnvelope & { ok?: unknown; businessId?: unknown };
    } catch {
      throw new OnboardingRequestError('invalid_response', response.status);
    }
    if (!response.ok) {
      throw new OnboardingRequestError(safeCode(envelope.error?.code), response.status, safeReference(envelope.requestId));
    }
    if (envelope.ok !== true || typeof envelope.businessId !== 'string') {
      throw new OnboardingRequestError('invalid_response', response.status, safeReference(envelope.requestId));
    }
    return { businessId: envelope.businessId };
  } catch (error) {
    if (error instanceof OnboardingRequestError) throw error;
    throw new OnboardingRequestError('network_error', 0);
  }
}

export function onboardingErrorInfo(error: unknown): OnboardingErrorInfo {
  const requestError = error instanceof OnboardingRequestError
    ? error
    : new OnboardingRequestError('onboarding_failed', 0);
  const messages: Record<string, string> = {
    auth_required: 'Sign in again before completing onboarding.',
    invalid_auth_token: 'Your sign-in session expired. Sign in again and retry.',
    account_identity_invalid: 'This account cannot complete onboarding. Sign out and contact support.',
    email_not_verified: 'Verify your email before completing onboarding.',
    account_email_invalid: 'Your account needs a valid email before onboarding.',
    app_check_required: 'StockGuard could not verify this app. Refresh the page and try again.',
    app_check_invalid: 'StockGuard could not verify this app. Refresh the page and try again.',
    invalid_request: 'Some onboarding information is missing or invalid.',
    registrations_disabled: 'New registrations are temporarily unavailable.',
    existing_membership: 'This account already belongs to another workspace. Refresh the page or contact support.',
    invalid_response: 'The onboarding service returned an unexpected response. It is safe to retry.',
    network_error: 'The onboarding service could not be reached. Check your connection and try again.',
    onboarding_failed: 'StockGuard could not complete onboarding. It is safe to try again.',
  };
  return {
    code: requestError.code,
    userMessage: messages[requestError.code] ?? messages.onboarding_failed!,
    reference: requestError.reference,
  };
}
