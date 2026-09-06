import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  createCompleteOnboardingHandler,
  OnboardingForbiddenError,
  type OnboardingDependencies,
  type OnboardingInput,
  type VerifiedIdentity,
} from './_shared/complete-onboarding-core';

declare const Netlify: { env: { get(name: string): string | undefined } };
type NetlifyContext = { requestId: string };
type NetlifyConfig = Record<string, never>;

const ADMIN_APP_NAME = 'stockguard-netlify-onboarding';

function requiredServerEnvironment(name: 'FIREBASE_PROJECT_ID' | 'FIREBASE_CLIENT_EMAIL' | 'FIREBASE_PRIVATE_KEY') {
  const value = Netlify.env.get(name);
  if (!value) throw new Error('Missing server configuration.');
  return value;
}

function validDocumentId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function productionDependencies(): OnboardingDependencies {
  const existing = getApps().find(app => app.name === ADMIN_APP_NAME);
  const app = existing ?? initializeApp({
    credential: cert({
      projectId: requiredServerEnvironment('FIREBASE_PROJECT_ID'),
      clientEmail: requiredServerEnvironment('FIREBASE_CLIENT_EMAIL'),
      privateKey: requiredServerEnvironment('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    }),
  }, ADMIN_APP_NAME);
  const auth = getAuth(app);
  const appCheck = getAppCheck(app);
  const db = getFirestore(app);

  return {
    async verifyIdToken(token) {
      const decoded = await auth.verifyIdToken(token, true);
      return {
        uid: decoded.uid,
        email: typeof decoded.email === 'string' ? decoded.email : '',
        emailVerified: decoded.email_verified === true,
      };
    },
    async verifyAppCheckToken(token) {
      await appCheck.verifyToken(token);
    },
    async registrationsEnabled() {
      const snapshot = await db.doc('publicPlatformStatus/current').get();
      return snapshot.data()?.registrationsEnabled !== false;
    },
    async getOrCreateWorkspace(identity: VerifiedIdentity, input: OnboardingInput) {
      const lockRef = db.doc(`onboardingLocks/${identity.uid}`);
      const businessRef = db.collection('businesses').doc();
      const branchRef = db.collection('branches').doc();
      const membershipQuery = db.collection('memberships')
        .where('userId', '==', identity.uid)
        .where('status', '==', 'active');

      return db.runTransaction(async transaction => {
        const lock = await transaction.get(lockRef);
        if (lock.exists) {
          const businessId = lock.data()?.businessId;
          if (!validDocumentId(businessId) || lock.data()?.status !== 'complete') throw new Error('Invalid onboarding lock.');
          const membership = await transaction.get(db.doc(`memberships/${identity.uid}_${businessId}`));
          const membershipData = membership.data();
          if (!membership.exists || membershipData?.userId !== identity.uid || membershipData?.businessId !== businessId || membershipData?.role !== 'owner' || membershipData?.status !== 'active') {
            throw new OnboardingForbiddenError();
          }
          return { businessId, created: false };
        }

        const existingMemberships = await transaction.get(membershipQuery);
        if (!existingMemberships.empty) {
          const ownerMemberships = existingMemberships.docs.filter(document => document.data().role === 'owner');
          if (ownerMemberships.length !== 1) throw new OnboardingForbiddenError();
          const businessId = ownerMemberships[0]?.data().businessId;
          if (!validDocumentId(businessId)) throw new Error('Invalid existing membership.');
          const timestamp = FieldValue.serverTimestamp();
          transaction.create(lockRef, { businessId, status: 'complete', createdAt: timestamp, updatedAt: timestamp });
          return { businessId, created: false };
        }

        const businessId = businessRef.id;
        const timestamp = FieldValue.serverTimestamp();
        const business = {
          businessId,
          name: input.businessName,
          ownerName: input.ownerName,
          type: input.businessType,
          email: identity.email,
          phone: input.phone,
          location: input.location,
          employeeCount: input.employeeCount,
          currency: 'ZAR',
          timezone: 'Africa/Johannesburg',
          dateFormat: 'DD/MM/YYYY',
          warningPeriods: {
            critical: input.criticalDays,
            urgent: input.urgentDays,
            expiringSoon: input.soonDays,
            watchList: input.watchDays,
          },
          discounts: { soon: 10, urgent: 20, critical: 30 },
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        transaction.create(businessRef, business);
        transaction.create(db.doc(`memberships/${identity.uid}_${businessId}`), {
          businessId,
          userId: identity.uid,
          role: 'owner',
          status: 'active',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.set(db.doc(`users/${identity.uid}`), {
          businessId,
          displayName: input.ownerName,
          email: identity.email,
          phone: input.phone,
          termsAcceptedAt: timestamp,
          privacyAcceptedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        }, { merge: true });
        transaction.create(branchRef, {
          businessId,
          name: 'Main branch',
          location: input.location,
          active: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.create(db.doc(`businessAccessControls/${businessId}`), {
          businessId,
          accessStatus: 'active',
          subscriptionStatus: 'trial',
          updatedAt: timestamp,
        });
        transaction.create(db.doc(`subscriptions/${businessId}`), {
          businessId,
          status: 'trial',
          plan: 'Starter',
          trialStartedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.create(lockRef, {
          businessId,
          status: 'complete',
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        return { businessId, created: true };
      });
    },
    async ensureOwnerClaims(uid, businessId) {
      const user = await auth.getUser(uid);
      const existingClaims = user.customClaims ?? {};
      if (existingClaims.businessId === businessId && existingClaims.role === 'owner') return;
      await auth.setCustomUserClaims(uid, { ...existingClaims, businessId, role: 'owner' });
    },
    log(entry) {
      console.info(JSON.stringify(entry));
    },
  };
}

export default async function completeOnboarding(request: Request, context: NetlifyContext) {
  try {
    const handler = createCompleteOnboardingHandler(productionDependencies());
    return await handler(request, context.requestId);
  } catch {
    const requestId = /^[A-Za-z0-9_-]{1,80}$/.test(context.requestId ?? '') ? context.requestId : globalThis.crypto.randomUUID();
    console.error(JSON.stringify({ requestId, event: 'onboarding.configuration_failed' }));
    return new Response(JSON.stringify({
      ok: false,
      error: { code: 'onboarding_failed', message: 'The onboarding service is not configured correctly.' },
      requestId,
    }), {
      status: 500,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
}

export const config: NetlifyConfig = {};
