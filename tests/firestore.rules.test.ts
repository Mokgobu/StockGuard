import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const projectId = 'demo-stockguard-rules';
const product = {
  businessId: 'business-a',
  name: 'Milk',
  normalizedName: 'milk',
  archived: false,
  createdBy: 'business-owner-a',
  updatedBy: 'business-owner-a',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'publicPlatformStatus/current'), { maintenanceMode: false, inventoryUpdatesEnabled: true }),
      setDoc(doc(db, 'platformSettings/current'), { maintenanceMode: false }),
      setDoc(doc(db, 'platformAdmins/platform-admin'), { role: 'super_admin', active: true }),
      setDoc(doc(db, 'platformAdmins/inactive-admin'), { role: 'super_admin', active: false }),
      setDoc(doc(db, 'businessAccessControls/business-a'), { businessId: 'business-a', accessStatus: 'active' }),
      setDoc(doc(db, 'businessAccessControls/business-b'), { businessId: 'business-b', accessStatus: 'active' }),
      setDoc(doc(db, 'memberships/business-owner-a_business-a'), { businessId: 'business-a', userId: 'business-owner-a', role: 'owner', status: 'active' }),
      setDoc(doc(db, 'memberships/employee-a_business-a'), { businessId: 'business-a', userId: 'employee-a', role: 'employee', status: 'active' }),
      setDoc(doc(db, 'memberships/business-owner-b_business-b'), { businessId: 'business-b', userId: 'business-owner-b', role: 'owner', status: 'active' }),
      setDoc(doc(db, 'users/business-owner-a'), { businessId: 'business-a', displayName: 'Owner A' }),
      setDoc(doc(db, 'users/employee-a'), { businessId: 'business-a', displayName: 'Employee A' }),
      setDoc(doc(db, 'businesses/business-a'), { businessId: 'business-a', name: 'A', createdAt: new Date(), updatedAt: new Date() }),
      setDoc(doc(db, 'businesses/business-b'), { businessId: 'business-b', name: 'B', createdAt: new Date(), updatedAt: new Date() }),
      setDoc(doc(db, 'subscriptions/business-a'), { businessId: 'business-a', status: 'trial' }),
      setDoc(doc(db, 'products/product-a'), { ...product, createdAt: new Date(), updatedAt: new Date() }),
      setDoc(doc(db, 'adminAuditLogs/log-a'), { adminUid: 'platform-admin', action: 'fixture', createdAt: new Date() }),
      setDoc(doc(db, 'auditLogs/tenant-log-a'), { businessId: 'business-a', actorUid: 'business-owner-a', action: 'fixture', createdAt: new Date() }),
    ]);
  });
});

describe('StockGuard tenant and role rules', () => {
  it('allows an active owner to create a tenant product', async () => {
    const db = env.authenticatedContext('business-owner-a').firestore();
    await assertSucceeds(setDoc(doc(db, 'products/new-product'), product));
  });

  it('requires both the custom claim and active admin record for owner-only reads', async () => {
    const authorized = env.authenticatedContext('platform-admin', { superAdmin: true }).firestore();
    const recordOnly = env.authenticatedContext('platform-admin').firestore();
    const claimOnly = env.authenticatedContext('claim-only-admin', { superAdmin: true }).firestore();
    const inactive = env.authenticatedContext('inactive-admin', { superAdmin: true }).firestore();
    const businessOwner = env.authenticatedContext('business-owner-a').firestore();
    const path = 'adminAuditLogs/log-a';

    await assertSucceeds(getDoc(doc(authorized, path)));
    await assertFails(getDoc(doc(recordOnly, path)));
    await assertFails(getDoc(doc(claimOnly, path)));
    await assertFails(getDoc(doc(inactive, path)));
    await assertFails(getDoc(doc(businessOwner, path)));
  });

  it('allows only the fully authorized super-admin to read private platform settings', async () => {
    const authorized = env.authenticatedContext('platform-admin', { superAdmin: true }).firestore();
    const recordOnly = env.authenticatedContext('platform-admin').firestore();
    const claimOnly = env.authenticatedContext('claim-only-admin', { superAdmin: true }).firestore();
    const path = 'platformSettings/current';

    await assertSucceeds(getDoc(doc(authorized, path)));
    await assertFails(getDoc(doc(recordOnly, path)));
    await assertFails(getDoc(doc(claimOnly, path)));
  });

  it('blocks all client writes to private platform settings', async () => {
    const adminDb = env.authenticatedContext('platform-admin', { superAdmin: true }).firestore();
    await assertFails(updateDoc(doc(adminDb, 'platformSettings/current'), { maintenanceMode: true }));
  });

  it('allows only a fully authorized super-admin to make validated public platform changes', async () => {
    const authorized = env.authenticatedContext('platform-admin', { superAdmin: true }).firestore();
    const recordOnly = env.authenticatedContext('platform-admin').firestore();
    const change = { maintenanceMode: true, updatedAt: serverTimestamp(), updatedBy: 'platform-admin' };

    await assertSucceeds(setDoc(doc(authorized, 'publicPlatformStatus/current'), change, { merge: true }));
    await assertFails(setDoc(doc(recordOnly, 'publicPlatformStatus/current'), change, { merge: true }));
  });

  it('allows only a fully authorized super-admin to make validated business access changes', async () => {
    const authorized = env.authenticatedContext('platform-admin', { superAdmin: true }).firestore();
    const recordOnly = env.authenticatedContext('platform-admin').firestore();
    const change = {
      businessId: 'business-a',
      accessStatus: 'suspended',
      subscriptionStatus: 'trial',
      updatedAt: serverTimestamp(),
      updatedBy: 'platform-admin',
    };

    await assertSucceeds(setDoc(doc(authorized, 'businessAccessControls/business-a'), change, { merge: true }));
    await assertFails(setDoc(doc(recordOnly, 'businessAccessControls/business-a'), change, { merge: true }));
  });

  it('allows only a fully authorized super-admin to create correctly stamped admin audit records', async () => {
    const authorized = env.authenticatedContext('platform-admin', { superAdmin: true }).firestore();
    const recordOnly = env.authenticatedContext('platform-admin').firestore();
    const record = { adminUid: 'platform-admin', action: 'verified-test', createdAt: serverTimestamp() };

    await assertSucceeds(setDoc(doc(authorized, 'adminAuditLogs/verified'), record));
    await assertFails(setDoc(doc(recordOnly, 'adminAuditLogs/forged'), record));
  });

  it('prevents users from creating or changing documents that grant administrative access', async () => {
    const employeeDb = env.authenticatedContext('employee-a').firestore();

    await assertFails(setDoc(doc(employeeDb, 'platformAdmins/employee-a'), { role: 'super_admin', active: true }));
    await assertFails(updateDoc(doc(employeeDb, 'memberships/employee-a_business-a'), { role: 'owner', status: 'active' }));
    await assertFails(updateDoc(doc(employeeDb, 'users/employee-a'), { businessId: 'business-b', updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(employeeDb, 'businessAccessControls/business-a'), { businessId: 'business-a', accessStatus: 'active' }, { merge: true }));
    await assertFails(setDoc(doc(employeeDb, 'subscriptions/business-a'), { businessId: 'business-a', status: 'active' }));
    await assertFails(setDoc(doc(employeeDb, 'onboardingLocks/employee-a'), { businessId: 'business-a', status: 'complete' }));
  });

  it('prevents a newly authenticated user from forging profile authorization fields', async () => {
    const db = env.authenticatedContext('new-user', { email: 'verified-account' }).firestore();
    await assertFails(setDoc(doc(db, 'users/new-user'), {
      email: 'verified-account',
      businessId: 'business-a',
      role: 'super_admin',
      active: true,
    }));
  });

  it('allows an existing user to update only safe self-profile fields', async () => {
    const db = env.authenticatedContext('employee-a').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/employee-a'), {
      displayName: 'Updated employee',
      updatedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(doc(db, 'users/employee-a'), {
      role: 'owner',
      updatedAt: serverTimestamp(),
    }));
  });

  it('blocks cross-business reads and changes', async () => {
    const ownerDb = env.authenticatedContext('business-owner-b').firestore();
    await assertFails(getDoc(doc(ownerDb, 'products/product-a')));
    await assertFails(updateDoc(doc(ownerDb, 'businesses/business-a'), { name: 'Changed', updatedAt: serverTimestamp() }));
  });

  it('allows an owner to update only the permitted fields of their own business', async () => {
    const ownerDb = env.authenticatedContext('business-owner-a').firestore();
    await assertSucceeds(updateDoc(doc(ownerDb, 'businesses/business-a'), { name: 'Updated A', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ownerDb, 'businesses/business-a'), { businessId: 'business-b', updatedAt: serverTimestamp() }));
  });

  it('blocks employees from changing business settings', async () => {
    const db = env.authenticatedContext('employee-a').firestore();
    await assertFails(updateDoc(doc(db, 'businesses/business-a'), { name: 'Changed', updatedAt: serverTimestamp() }));
  });

  it('allows reads but blocks inventory writes while read-only or suspended', async () => {
    const db = env.authenticatedContext('business-owner-a').firestore();
    await env.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), 'businessAccessControls/business-a'), { accessStatus: 'read-only' });
    });
    await assertSucceeds(getDoc(doc(db, 'products/product-a')));
    await assertFails(setDoc(doc(db, 'products/new-product-read-only'), product));

    await env.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), 'businessAccessControls/business-a'), { accessStatus: 'suspended' });
    });
    await assertSucceeds(getDoc(doc(db, 'products/product-a')));
    await assertFails(setDoc(doc(db, 'products/new-product-suspended'), product));
  });

  it('allows an owner to read a subscription but never write it', async () => {
    const ownerDb = env.authenticatedContext('business-owner-a').firestore();
    await assertSucceeds(getDoc(doc(ownerDb, 'subscriptions/business-a')));
    await assertFails(updateDoc(doc(ownerDb, 'subscriptions/business-a'), { status: 'active' }));
  });

  it('allows tenant audit reads only for managers and blocks every client audit write', async () => {
    const ownerDb = env.authenticatedContext('business-owner-a').firestore();
    const employeeDb = env.authenticatedContext('employee-a').firestore();
    await assertSucceeds(getDoc(doc(ownerDb, 'auditLogs/tenant-log-a')));
    await assertFails(getDoc(doc(employeeDb, 'auditLogs/tenant-log-a')));
    await assertFails(setDoc(doc(ownerDb, 'auditLogs/forged'), { businessId: 'business-a', createdAt: serverTimestamp() }));
  });
});
