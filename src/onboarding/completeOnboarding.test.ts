import { describe, expect, it, vi } from 'vitest';
import { completeOnboarding, onboardingErrorInfo, OnboardingRequestError, type OnboardingPayload } from './completeOnboarding';

const payload: OnboardingPayload = {
  businessName: 'Test Shop', ownerName: 'Test Owner', businessType: 'Other', phone: '+27000000000',
  location: 'Test location', employeeCount: 1, criticalDays: 3, urgentDays: 7, soonDays: 14,
  watchDays: 30, termsAccepted: true, privacyAccepted: true,
};

describe('completeOnboarding client', () => {
  it('sends both Firebase tokens to the same-origin endpoint without identity fields', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, businessId: 'business-one' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    await completeOnboarding(payload, {
      getIdToken: vi.fn().mockResolvedValue('id-token'),
      getAppCheckToken: vi.fn().mockResolvedValue('app-token'),
      fetch,
    });
    expect(fetch).toHaveBeenCalledWith('/api/complete-onboarding', expect.objectContaining({ method: 'POST' }));
    const options = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(options.headers).toMatchObject({ Authorization: 'Bearer id-token', 'X-Firebase-AppCheck': 'app-token' });
    expect(JSON.parse(String(options.body))).not.toHaveProperty('uid');
    expect(JSON.parse(String(options.body))).not.toHaveProperty('email');
  });

  it('maps a structured safe server error without flattening it', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false, error: { code: 'app_check_invalid', message: 'safe server text' }, requestId: 'request-safe',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    await expect(completeOnboarding(payload, {
      getIdToken: async () => 'id-token', getAppCheckToken: async () => 'app-token', fetch,
    })).rejects.toMatchObject({ code: 'app_check_invalid', status: 403, reference: 'request-safe' });
  });

  it('maps network failures to a retry-safe user message', async () => {
    const error = await completeOnboarding(payload, {
      getIdToken: async () => 'id-token', getAppCheckToken: async () => 'app-token',
      fetch: vi.fn().mockRejectedValue(new Error('private network detail')),
    }).catch(value => value);
    expect(error).toBeInstanceOf(OnboardingRequestError);
    expect(onboardingErrorInfo(error)).toMatchObject({ code: 'network_error' });
    expect(onboardingErrorInfo(error).userMessage).not.toContain('private network detail');
  });
});
