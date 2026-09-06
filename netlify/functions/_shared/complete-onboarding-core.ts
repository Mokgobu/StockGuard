export type VerifiedIdentity = {
  uid: string;
  email: string;
  emailVerified: boolean;
};

export type OnboardingInput = {
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
  termsAccepted: true;
  privacyAccepted: true;
};

export type WorkspaceResult = { businessId: string; created: boolean };

export type OnboardingDependencies = {
  verifyIdToken: (token: string) => Promise<VerifiedIdentity>;
  verifyAppCheckToken: (token: string) => Promise<void>;
  registrationsEnabled: () => Promise<boolean>;
  getOrCreateWorkspace: (identity: VerifiedIdentity, input: OnboardingInput) => Promise<WorkspaceResult>;
  ensureOwnerClaims: (uid: string, businessId: string) => Promise<void>;
  log: (entry: { requestId: string; event: string }) => void;
};

type ErrorCode =
  | 'method_not_allowed'
  | 'auth_required'
  | 'invalid_auth_token'
  | 'account_identity_invalid'
  | 'email_not_verified'
  | 'account_email_invalid'
  | 'app_check_required'
  | 'app_check_invalid'
  | 'invalid_request'
  | 'registrations_disabled'
  | 'existing_membership'
  | 'onboarding_failed';

export class OnboardingForbiddenError extends Error {}

const responseHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

function json(status: number, body: unknown, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...responseHeaders, ...extraHeaders } });
}

function errorResponse(status: number, code: ErrorCode, message: string, requestId: string) {
  return json(status, { ok: false, error: { code, message }, requestId });
}

function safeRequestId(candidate?: string) {
  if (candidate && /^[A-Za-z0-9_-]{1,80}$/.test(candidate)) return candidate;
  return globalThis.crypto.randomUUID();
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validUid(value: string) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function stringField(source: Record<string, unknown>, key: string, max: number, required = false) {
  const value = source[key];
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') throw new Error('invalid');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if ((required && !normalized) || normalized.length > max) throw new Error('invalid');
  return normalized;
}

function numberField(source: Record<string, unknown>, key: string, fallback: number, min: number, max: number) {
  const value = source[key] ?? fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error('invalid');
  return value;
}

const allowedFields = new Set([
  'businessName', 'ownerName', 'businessType', 'phone', 'location', 'employeeCount',
  'criticalDays', 'urgentDays', 'soonDays', 'watchDays', 'termsAccepted', 'privacyAccepted',
]);

export function validateOnboardingInput(value: unknown): OnboardingInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some(key => !allowedFields.has(key))) throw new Error('invalid');
  if (source.termsAccepted !== true || source.privacyAccepted !== true) throw new Error('invalid');

  return {
    businessName: stringField(source, 'businessName', 120, true),
    ownerName: stringField(source, 'ownerName', 100, true),
    businessType: stringField(source, 'businessType', 60),
    phone: stringField(source, 'phone', 40),
    location: stringField(source, 'location', 160),
    employeeCount: numberField(source, 'employeeCount', 1, 1, 10_000),
    criticalDays: numberField(source, 'criticalDays', 3, 0, 30),
    urgentDays: numberField(source, 'urgentDays', 7, 1, 60),
    soonDays: numberField(source, 'soonDays', 14, 1, 90),
    watchDays: numberField(source, 'watchDays', 30, 1, 180),
    termsAccepted: true,
    privacyAccepted: true,
  };
}

export function createCompleteOnboardingHandler(deps: OnboardingDependencies) {
  return async (request: Request, suppliedRequestId?: string): Promise<Response> => {
    const requestId = safeRequestId(suppliedRequestId);
    deps.log({ requestId, event: 'onboarding.request' });

    if (request.method !== 'POST') {
      return json(405, {
        ok: false,
        error: { code: 'method_not_allowed', message: 'Only POST requests are accepted.' },
        requestId,
      }, { Allow: 'POST' });
    }

    const authorization = request.headers.get('Authorization') ?? '';
    const bearer = authorization.match(/^Bearer\s+([^\s]+)$/i)?.[1];
    if (!bearer) return errorResponse(401, 'auth_required', 'Sign in before completing onboarding.', requestId);

    let identity: VerifiedIdentity;
    try {
      identity = await deps.verifyIdToken(bearer);
    } catch {
      return errorResponse(401, 'invalid_auth_token', 'Your sign-in session is invalid or expired.', requestId);
    }
    if (!identity.uid || !validUid(identity.uid)) {
      return errorResponse(403, 'account_identity_invalid', 'The account identity cannot be used for onboarding.', requestId);
    }
    if (!identity.email || !validEmail(identity.email)) {
      return errorResponse(403, 'account_email_invalid', 'A valid account email is required.', requestId);
    }
    if (identity.emailVerified !== true) {
      return errorResponse(403, 'email_not_verified', 'Verify your email before completing onboarding.', requestId);
    }

    const appCheckToken = request.headers.get('X-Firebase-AppCheck');
    if (!appCheckToken) return errorResponse(403, 'app_check_required', 'App verification is required.', requestId);
    try {
      await deps.verifyAppCheckToken(appCheckToken);
    } catch {
      return errorResponse(403, 'app_check_invalid', 'App verification failed. Refresh the page and try again.', requestId);
    }

    let input: OnboardingInput;
    try {
      input = validateOnboardingInput(await request.json());
    } catch {
      return errorResponse(400, 'invalid_request', 'Some onboarding information is missing or invalid.', requestId);
    }

    try {
      if (!(await deps.registrationsEnabled())) {
        return errorResponse(403, 'registrations_disabled', 'New registrations are temporarily unavailable.', requestId);
      }
      const result = await deps.getOrCreateWorkspace(identity, input);
      await deps.ensureOwnerClaims(identity.uid, result.businessId);
      deps.log({ requestId, event: result.created ? 'onboarding.created' : 'onboarding.reused' });
      return json(200, { ok: true, businessId: result.businessId, created: result.created, requestId });
    } catch (error) {
      if (error instanceof OnboardingForbiddenError) {
        return errorResponse(403, 'existing_membership', 'This account already belongs to a different workspace.', requestId);
      }
      deps.log({ requestId, event: 'onboarding.failed' });
      return errorResponse(500, 'onboarding_failed', 'StockGuard could not complete onboarding. It is safe to try again.', requestId);
    }
  };
}
