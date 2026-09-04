'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();
const REGION = 'us-central1';
const ACCESS = ['active', 'read-only', 'suspended', 'disabled'];
const SUBSCRIPTIONS = ['trial', 'active', 'past-due', 'cancelled'];
const FEATURES = ['publicLandingPage', 'registrations', 'login', 'inventoryUpdates', 'barcodeScanner', 'notifications', 'reports', 'signageGenerator'];

function assertOwner(request) {
  if (!request.auth || request.auth.token.superAdmin !== true) {
    throw new HttpsError('permission-denied', 'Verified super administrator access is required.');
  }
}
function cleanText(value, max = 1000) { return String(value || '').trim().slice(0, max); }
function audit(request, action, details = {}) {
  return {
    adminUid: request.auth.uid,
    action,
    ...details,
    createdAt: FieldValue.serverTimestamp(),
    session: {
      authTime: request.auth.token.auth_time || null,
      signInProvider: request.auth.token.firebase?.sign_in_provider || null,
      appCheckVerified: Boolean(request.app),
      userAgent: cleanText(request.rawRequest?.headers?.['user-agent'], 300) || null
    }
  };
}
async function countUsers(pageToken, total = 0) {
  const page = await getAuth().listUsers(1000, pageToken);
  const nextTotal = total + page.users.length;
  return page.pageToken ? countUsers(page.pageToken, nextTotal) : nextTotal;
}

exports.ownerDashboard = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  assertOwner(request);
  const [businessSnap, accessSnap, settingsSnap, usersResult] = await Promise.all([
    db.collection('businesses').orderBy('createdAt', 'desc').limit(250).get(),
    db.collection('businessAccessControls').get(),
    db.doc('platformSettings/global').get(),
    countUsers()
  ]);
  const controls = new Map(accessSnap.docs.map(d => [d.id, d.data()]));
  const businesses = await Promise.all(businessSnap.docs.map(async doc => {
    const data = doc.data();
    const itemCount = await doc.ref.collection('items').count().get();
    return {
      id: doc.id,
      name: data.name || 'Unnamed business',
      createdAt: data.createdAt || null,
      lastActivityAt: data.lastActivityAt || null,
      productCount: itemCount.data().count,
      plan: data.plan || 'Starter',
      ...controls.get(doc.id)
    };
  }));
  return { businesses, totalUsers: usersResult, settings: settingsSnap.exists ? settingsSnap.data() : null };
});

exports.ownerAuditLogs = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  assertOwner(request);
  const limit = Math.min(Math.max(Number(request.data?.limit) || 50, 1), 200);
  const snap = await db.collection('adminAuditLogs').orderBy('createdAt', 'desc').limit(limit).get();
  return { logs: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
});

exports.setBusinessAccess = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  assertOwner(request);
  const businessId = cleanText(request.data?.businessId, 128);
  const accessStatus = cleanText(request.data?.accessStatus, 20).toLowerCase();
  const reason = cleanText(request.data?.reason);
  const note = cleanText(request.data?.note, 2000);
  const effectiveAtRaw = request.data?.effectiveAt;
  if (!businessId || !ACCESS.includes(accessStatus)) throw new HttpsError('invalid-argument', 'Invalid business or access status.');
  if (!reason) throw new HttpsError('invalid-argument', 'A reason is required.');
  const businessRef = db.doc(`businesses/${businessId}`);
  const controlRef = db.doc(`businessAccessControls/${businessId}`);
  await db.runTransaction(async tx => {
    const [businessDoc, controlDoc] = await Promise.all([tx.get(businessRef), tx.get(controlRef)]);
    if (!businessDoc.exists) throw new HttpsError('not-found', 'Business not found.');
    const business = businessDoc.data();
    if (accessStatus === 'disabled' && cleanText(request.data?.confirmation, 200) !== business.name) {
      throw new HttpsError('failed-precondition', 'The business name confirmation does not match.');
    }
    const previousStatus = controlDoc.exists ? controlDoc.data().accessStatus : 'active';
    const change = { accessStatus, reason, internalNote: note, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid };
    if (effectiveAtRaw) change.effectiveAt = Timestamp.fromDate(new Date(effectiveAtRaw));
    tx.set(controlRef, change, { merge: true });
    tx.set(db.collection('adminAuditLogs').doc(), audit(request, 'business.access.changed', {
      businessId, businessName: business.name, previousStatus, newStatus: accessStatus, reason
    }));
  });
  return { ok: true };
});

exports.setSubscriptionStatus = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  assertOwner(request);
  const businessId = cleanText(request.data?.businessId, 128);
  const subscriptionStatus = cleanText(request.data?.subscriptionStatus, 20).toLowerCase();
  const reason = cleanText(request.data?.reason);
  if (!businessId || !SUBSCRIPTIONS.includes(subscriptionStatus) || !reason) throw new HttpsError('invalid-argument', 'Business, subscription status and reason are required.');
  const ref = db.doc(`businessAccessControls/${businessId}`);
  await db.runTransaction(async tx => {
    const old = await tx.get(ref);
    const previousStatus = old.exists ? old.data().subscriptionStatus : 'trial';
    tx.set(ref, { subscriptionStatus, subscriptionReason: reason, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
    tx.set(db.collection('adminAuditLogs').doc(), audit(request, 'business.subscription.changed', { businessId, previousStatus, newStatus: subscriptionStatus, reason }));
  });
  return { ok: true };
});

exports.updatePlatformSettings = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  assertOwner(request);
  const reason = cleanText(request.data?.reason);
  if (!reason) throw new HttpsError('invalid-argument', 'A reason is required.');
  const ref = db.doc('platformSettings/global');
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const previous = snap.exists ? snap.data() : {};
    const next = { ...previous };
    if (typeof request.data?.maintenanceMode === 'boolean') next.maintenanceMode = request.data.maintenanceMode;
    if (typeof request.data?.maintenanceMessage === 'string') next.maintenanceMessage = cleanText(request.data.maintenanceMessage, 500);
    next.estimatedReturnAt = request.data?.estimatedReturnAt ? Timestamp.fromDate(new Date(request.data.estimatedReturnAt)) : null;
    next.features = { ...(previous.features || {}) };
    for (const key of FEATURES) if (typeof request.data?.features?.[key] === 'boolean') next.features[key] = request.data.features[key];
    const shutdown = next.maintenanceMode && next.features.login === false;
    if (shutdown && request.data?.shutdownConfirmation !== 'SHUT DOWN STOCKGUARD') throw new HttpsError('failed-precondition', 'Global shutdown confirmation is required.');
    next.updatedAt = FieldValue.serverTimestamp(); next.updatedBy = request.auth.uid;
    tx.set(ref, next, { merge: true });
    tx.set(db.collection('adminAuditLogs').doc(), audit(request, 'platform.settings.changed', {
      previousStatus: { maintenanceMode: Boolean(previous.maintenanceMode), features: previous.features || {} },
      newStatus: { maintenanceMode: Boolean(next.maintenanceMode), features: next.features }, reason
    }));
  });
  return { ok: true };
});
