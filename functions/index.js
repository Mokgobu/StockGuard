'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { createHash } = require('node:crypto');

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

exports.completeOnboarding = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  if (!request.auth || request.auth.token.email_verified !== true) throw new HttpsError('permission-denied', 'Verify your email before onboarding.');
  const d=request.data||{}, uid=request.auth.uid, businessName=cleanText(d.businessName,120), ownerName=cleanText(d.ownerName,100);
  if(!businessName||!ownerName||!d.termsAccepted||!d.privacyAccepted)throw new HttpsError('invalid-argument','Business details and legal acceptance are required.');
  const existing=await db.collection('memberships').where('userId','==',uid).where('status','==','active').limit(1).get();
  if(!existing.empty)throw new HttpsError('already-exists','This user already belongs to a business.');
  const businessRef=db.collection('businesses').doc(), businessId=businessRef.id, now=FieldValue.serverTimestamp();
  const membershipRef=db.doc(`memberships/${uid}_${businessId}`), userRef=db.doc(`users/${uid}`);
  const business={businessId,name:businessName,ownerName,type:cleanText(d.businessType,60),email:cleanText(d.email,200),phone:cleanText(d.phone,40),location:cleanText(d.location,160),employeeCount:Math.max(1,Math.min(Number(d.employeeCount)||1,10000)),currency:'ZAR',timezone:'Africa/Johannesburg',dateFormat:'DD/MM/YYYY',warningPeriods:{critical:Number(d.criticalDays)||3,urgent:Number(d.urgentDays)||7,expiringSoon:Number(d.soonDays)||14,watchList:Number(d.watchDays)||30},discounts:{soon:10,urgent:20,critical:30},createdAt:now,updatedAt:now};
  const batch=db.batch();batch.create(businessRef,business);batch.create(membershipRef,{businessId,userId:uid,role:'owner',status:'active',createdAt:now,updatedAt:now});batch.set(userRef,{businessId,displayName:ownerName,email:request.auth.token.email,phone:business.phone,termsAcceptedAt:now,privacyAcceptedAt:now,createdAt:now,updatedAt:now},{merge:true});batch.create(db.collection('branches').doc(),{businessId,name:'Main branch',location:business.location,active:true,createdAt:now,updatedAt:now});batch.set(db.doc(`businessAccessControls/${businessId}`),{businessId,accessStatus:'active',subscriptionStatus:'trial',updatedAt:now});batch.set(db.doc(`subscriptions/${businessId}`),{businessId,status:'trial',plan:'Starter',trialStartedAt:now,createdAt:now,updatedAt:now});await batch.commit();
  await getAuth().setCustomUserClaims(uid,{businessId,role:'owner',...(request.auth.token.superAdmin===true?{superAdmin:true}:{})});
  return {businessId};
});

exports.migrateLegacyInventory = onCall({ region: REGION, enforceAppCheck: true }, async request => {
  if(!request.auth)throw new HttpsError('unauthenticated','Sign in before migrating.');
  const businessId=cleanText(request.auth.token.businessId,128),items=Array.isArray(request.data?.items)?request.data.items:[];
  if(!businessId)throw new HttpsError('failed-precondition','No business is assigned to this user.');
  if(items.length>150)throw new HttpsError('invalid-argument','Migrate at most 150 items at once. Contact support for a larger legacy inventory.');
  const markerRef=db.doc(`migrationMarkers/${request.auth.uid}_${businessId}`),marker=await markerRef.get();
  if(marker.exists)return {alreadyCompleted:true,imported:0,skipped:items.length};
  const membership=await db.doc(`memberships/${request.auth.uid}_${businessId}`).get();
  if(!membership.exists||membership.data().status!=='active')throw new HttpsError('permission-denied','An active business membership is required.');
  const write=db.batch(),now=FieldValue.serverTimestamp();let imported=0,skipped=0;
  for(const raw of items){const name=cleanText(raw?.name,160),expiry=cleanText(raw?.expiry,10),quantity=Number(raw?.quantity);if(!name||!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||!Number.isFinite(quantity)||quantity<0){skipped++;continue}const normalizedName=name.toLocaleLowerCase('en-ZA').replace(/\s+/g,' ').trim(),identity=cleanText(raw.barcode,80)||cleanText(raw.sku,80)||`${normalizedName}|${cleanText(raw.category,100).toLowerCase()}|${cleanText(raw.supplier,160).toLowerCase()}`,productId=createHash('sha256').update(`${businessId}|${identity}`).digest('hex').slice(0,32),batchId=createHash('sha256').update(`${businessId}|${productId}|${expiry}|${raw.id??''}`).digest('hex').slice(0,32),productRef=db.doc(`products/${productId}`),batchRef=db.doc(`batches/${batchId}`);const [existingProduct,existingBatch]=await Promise.all([productRef.get(),batchRef.get()]);if(existingBatch.exists){skipped++;continue}if(!existingProduct.exists)write.create(productRef,{businessId,name,normalizedName,barcode:cleanText(raw.barcode,80),sku:cleanText(raw.sku,80),category:cleanText(raw.category,100),supplier:cleanText(raw.supplier,160),imageUrl:'',sellingPrice:0,costPrice:0,minimumStockLevel:0,storageLocation:'',notes:'Migrated from StockGuard local inventory',unit:cleanText(raw.unit,40)||'units',archived:false,createdBy:request.auth.uid,updatedBy:request.auth.uid,createdAt:now,updatedAt:now});write.create(batchRef,{businessId,productId,batchNumber:`MIG-${batchId.slice(0,8).toUpperCase()}`,quantity,dateReceived:null,expiryDate:expiry,branchId:null,costPrice:0,sellingPrice:0,createdBy:request.auth.uid,createdAt:now,updatedAt:now});imported++}
  write.create(markerRef,{businessId,userId:request.auth.uid,source:'stockguard-items-v2',itemCount:items.length,imported,skipped,completedAt:now,createdAt:now,updatedAt:now});write.create(db.collection('auditLogs').doc(),{businessId,actorUid:request.auth.uid,action:'legacy.inventory.migrated',details:{source:'stockguard-items-v2',imported,skipped},createdAt:now,updatedAt:now});await write.commit();return {imported,skipped};
});
