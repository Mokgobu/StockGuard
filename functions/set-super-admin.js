'use strict';
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const uid = process.argv[2];
if (!uid) { console.error('Usage: node set-super-admin.js <firebase-uid>'); process.exit(1); }
initializeApp({ credential: applicationDefault() });
getAuth().getUser(uid)
  .then(() => getFirestore().doc(`platformAdmins/${uid}`).set({ role: 'super_admin', active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true }))
  .then(() => console.log(`Active super_admin record granted to UID ${uid}.`))
  .catch(error => { console.error(error); process.exitCode = 1; });
