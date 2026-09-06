import { useRef, useState, type FormEvent } from 'react';
import { getToken } from 'firebase/app-check';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { appCheck } from '../firebase/client';
import {
  completeOnboarding,
  onboardingErrorInfo,
  OnboardingRequestError,
  type OnboardingErrorInfo,
  type OnboardingPayload,
} from '../onboarding/completeOnboarding';

function legalAcceptance() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('stockguard-legal-acceptance') || '{}') as { terms?: unknown; privacy?: unknown };
    return { termsAccepted: saved.terms === true, privacyAccepted: saved.privacy === true };
  } catch {
    return { termsAccepted: false, privacyAccepted: false };
  }
}

function numberValue(data: FormData, name: string) {
  return Number(data.get(name));
}

export function OnboardingPage() {
  const { user, membership } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<OnboardingErrorInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  if (!user?.emailVerified) return <Navigate to="/verify-email" replace />;
  if (membership) return <Navigate to="/" replace />;
  const onboardingUser = user;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const payload: OnboardingPayload = {
      businessName: String(data.get('businessName') ?? ''),
      ownerName: String(data.get('ownerName') ?? ''),
      businessType: String(data.get('businessType') ?? ''),
      phone: String(data.get('phone') ?? ''),
      location: String(data.get('location') ?? ''),
      employeeCount: numberValue(data, 'employeeCount'),
      criticalDays: numberValue(data, 'criticalDays'),
      urgentDays: numberValue(data, 'urgentDays'),
      soonDays: numberValue(data, 'soonDays'),
      watchDays: numberValue(data, 'watchDays'),
      ...legalAcceptance(),
    };

    try {
      const verifiedAppCheck = appCheck;
      if (!verifiedAppCheck) throw new OnboardingRequestError('app_check_required', 0);
      await completeOnboarding(payload, {
        getIdToken: () => onboardingUser.getIdToken(),
        getAppCheckToken: async () => {
          try {
            return (await getToken(verifiedAppCheck)).token;
          } catch {
            throw new OnboardingRequestError('app_check_invalid', 0);
          }
        },
      });
      await onboardingUser.getIdToken(true);
      navigate('/', { replace: true });
    } catch (caught) {
      setError(onboardingErrorInfo(caught));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-brand">
      <span className="brand-mark">SG</span>
      <h1>Tell us about your business.</h1>
      <p>South African defaults are applied automatically and can be customised later.</p>
    </section>
    <section className="auth-panel">
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">Business onboarding</p>
        <h2>Create your StockGuard workspace</h2>
        <label className="field">Business name<input name="businessName" required maxLength={120} /></label>
        <label className="field">Owner&apos;s name<input name="ownerName" defaultValue={user.displayName || ''} required maxLength={100} /></label>
        <label className="field">Business type<select name="businessType" required><option value="">Choose one</option>{['Spaza shop', 'Café', 'Restaurant', 'Bakery', 'Grocery store', 'Small retailer', 'Other'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="field">Business email<input type="email" value={user.email || ''} readOnly aria-readonly="true" /></label>
        <label className="field">Phone number<input name="phone" type="tel" placeholder="+27…" required maxLength={40} /></label>
        <label className="field">Location<input name="location" required maxLength={160} /></label>
        <label className="field">Number of employees<input name="employeeCount" type="number" min="1" max="10000" defaultValue="1" required /></label>
        <fieldset>
          <legend>Expiry warning periods</legend>
          <label className="field">Critical (days)<input name="criticalDays" type="number" min="0" max="30" defaultValue="3" /></label>
          <label className="field">Urgent (days)<input name="urgentDays" type="number" min="1" max="60" defaultValue="7" /></label>
          <label className="field">Expiring soon (days)<input name="soonDays" type="number" min="1" max="90" defaultValue="14" /></label>
          <label className="field">Watch list (days)<input name="watchDays" type="number" min="1" max="180" defaultValue="30" /></label>
        </fieldset>
        <div aria-live="polite">
          {error && <p className="error" role="alert">{error.userMessage}</p>}
          {error?.reference && <p>Reference: {error.reference}</p>}
        </div>
        <button className="button" disabled={busy}>{busy ? 'Creating workspace…' : 'Create business workspace'}</button>
      </form>
    </section>
  </main>;
}
