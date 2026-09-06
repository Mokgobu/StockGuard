// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCompleteOnboardingHandler, OnboardingForbiddenError, type OnboardingDependencies, type OnboardingInput, type VerifiedIdentity } from './complete-onboarding-core';

const identity: VerifiedIdentity = { uid: 'test-user', email: 'owner@example.test', emailVerified: true };
const validPayload: OnboardingInput = {
  businessName: 'Test Shop',
  ownerName: 'Test Owner',
  businessType: 'Small retailer',
  phone: '+27000000000',
  location: 'Test location',
  employeeCount: 1,
  criticalDays: 3,
  urgentDays: 7,
  soonDays: 14,
  watchDays: 30,
  termsAccepted: true,
  privacyAccepted: true,
};

function request(body: unknown = validPayload, headers: Record<string, string> = {}) {
  return new Request('https://example.test/api/complete-onboarding', {
    method: 'POST',
    headers: { Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-check-token', ...headers },
    body: JSON.stringify(body),
  });
}

function dependencies(overrides: Partial<OnboardingDependencies> = {}): OnboardingDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue(identity),
    verifyAppCheckToken: vi.fn().mockResolvedValue(undefined),
    registrationsEnabled: vi.fn().mockResolvedValue(true),
    getOrCreateWorkspace: vi.fn().mockResolvedValue({ businessId: 'business-one', created: true }),
    ensureOwnerClaims: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    ...overrides,
  };
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

describe('complete onboarding handler', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('accepts POST only', async () => {
    const response = await createCompleteOnboardingHandler(dependencies())(
      new Request('https://example.test/api/complete-onboarding', { method: 'GET' }),
      'request-method',
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
    expect((await body(response)).error.code).toBe('method_not_allowed');
  });

  it('rejects a missing authorization header', async () => {
    const deps = dependencies();
    const response = await createCompleteOnboardingHandler(deps)(request(validPayload, { Authorization: '' }), 'request-1');
    expect(response.status).toBe(401);
    expect((await body(response)).error.code).toBe('auth_required');
    expect(deps.verifyIdToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid Firebase ID token', async () => {
    const response = await createCompleteOnboardingHandler(dependencies({
      verifyIdToken: vi.fn().mockRejectedValue(new Error('invalid token')),
    }))(request(), 'request-2');
    expect(response.status).toBe(401);
    expect((await body(response)).error.code).toBe('invalid_auth_token');
  });

  it('rejects an account whose email is not verified', async () => {
    const response = await createCompleteOnboardingHandler(dependencies({
      verifyIdToken: vi.fn().mockResolvedValue({ ...identity, emailVerified: false }),
    }))(request(), 'request-3');
    expect(response.status).toBe(403);
    expect((await body(response)).error.code).toBe('email_not_verified');
  });

  it('rejects a missing App Check token', async () => {
    const response = await createCompleteOnboardingHandler(dependencies())(
      request(validPayload, { 'X-Firebase-AppCheck': '' }),
      'request-4',
    );
    expect(response.status).toBe(403);
    expect((await body(response)).error.code).toBe('app_check_required');
  });

  it('rejects an invalid App Check token', async () => {
    const response = await createCompleteOnboardingHandler(dependencies({
      verifyAppCheckToken: vi.fn().mockRejectedValue(new Error('invalid app token')),
    }))(request(), 'request-5');
    expect(response.status).toBe(403);
    expect((await body(response)).error.code).toBe('app_check_invalid');
  });

  it.each(['uid', 'email', 'role', 'businessId'])('rejects the untrusted identity/authorization field %s', async field => {
    const deps = dependencies();
    const response = await createCompleteOnboardingHandler(deps)(request({ ...validPayload, [field]: 'untrusted-value' }), 'request-6');
    expect(response.status).toBe(400);
    expect((await body(response)).error.code).toBe('invalid_request');
    expect(deps.getOrCreateWorkspace).not.toHaveBeenCalled();
  });

  it.each([
    { ...validPayload, businessName: ' ' },
    { ...validPayload, employeeCount: 0 },
    { ...validPayload, criticalDays: 31 },
    { ...validPayload, termsAccepted: false },
  ])('rejects missing, out-of-range, or unaccepted onboarding input', async invalidPayload => {
    const response = await createCompleteOnboardingHandler(dependencies())(request(invalidPayload), 'request-validation');
    expect(response.status).toBe(400);
    expect((await body(response)).error.code).toBe('invalid_request');
  });

  it('creates a workspace and repairs owner claims on success', async () => {
    const deps = dependencies();
    const response = await createCompleteOnboardingHandler(deps)(request(), 'request-7');
    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({ ok: true, businessId: 'business-one', created: true });
    expect(deps.getOrCreateWorkspace).toHaveBeenCalledWith(identity, validPayload);
    expect(deps.ensureOwnerClaims).toHaveBeenCalledWith('test-user', 'business-one');
  });

  it('reuses the same workspace on a sequential retry', async () => {
    let existing = false;
    const deps = dependencies({
      getOrCreateWorkspace: vi.fn().mockImplementation(async () => {
        const created = !existing;
        existing = true;
        return { businessId: 'business-one', created };
      }),
    });
    const handler = createCompleteOnboardingHandler(deps);
    const first = await handler(request(), 'request-8a');
    const second = await handler(request(), 'request-8b');
    expect(await body(first)).toMatchObject({ businessId: 'business-one', created: true });
    expect(await body(second)).toMatchObject({ businessId: 'business-one', created: false });
  });

  it('prevents two concurrent requests from creating separate workspaces', async () => {
    let result: { businessId: string } | undefined;
    let pending: Promise<{ businessId: string }> | undefined;
    const deps = dependencies({
      getOrCreateWorkspace: vi.fn().mockImplementation(async () => {
        if (result) return { ...result, created: false };
        if (pending) return { ...(await pending), created: false };
        pending = new Promise(resolve => setTimeout(() => resolve({ businessId: 'business-one' }), 5));
        result = await pending;
        return { ...result, created: true };
      }),
    });
    const handler = createCompleteOnboardingHandler(deps);
    const [first, second] = await Promise.all([handler(request(), 'request-9a'), handler(request(), 'request-9b')]);
    const results = await Promise.all([body(first), body(second)]);
    expect(new Set(results.map(item => item.businessId))).toEqual(new Set(['business-one']));
    expect(results.map(item => item.created).sort()).toEqual([false, true]);
  });

  it('repairs missing claims when an existing workspace is found', async () => {
    const ensureOwnerClaims = vi.fn().mockResolvedValue(undefined);
    const deps = dependencies({
      getOrCreateWorkspace: vi.fn().mockResolvedValue({ businessId: 'business-one', created: false }),
      ensureOwnerClaims,
    });
    const response = await createCompleteOnboardingHandler(deps)(request(), 'request-10');
    expect(response.status).toBe(200);
    expect(ensureOwnerClaims).toHaveBeenCalledWith('test-user', 'business-one');
  });

  it('does not add owner claims when an existing membership is not an owner workspace', async () => {
    const deps = dependencies({
      getOrCreateWorkspace: vi.fn().mockRejectedValue(new OnboardingForbiddenError()),
    });
    const response = await createCompleteOnboardingHandler(deps)(request(), 'request-membership');
    expect(response.status).toBe(403);
    expect((await body(response)).error.code).toBe('existing_membership');
    expect(deps.ensureOwnerClaims).not.toHaveBeenCalled();
  });

  it('returns a safe server error without exposing thrown details', async () => {
    const response = await createCompleteOnboardingHandler(dependencies({
      getOrCreateWorkspace: vi.fn().mockRejectedValue(new Error('private@example.test secret-token-value')),
    }))(request(), 'request-11');
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(text).toContain('onboarding_failed');
    expect(text).not.toContain('private@example.test');
    expect(text).not.toContain('secret-token-value');
  });
});
