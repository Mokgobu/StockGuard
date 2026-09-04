'use strict';
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const uid = process.argv[2];
if (!uid) { console.error('Usage: node set-super-admin.js <firebase-uid>'); process.exit(1); }
initializeApp({ credential: applicationDefault() });
getAuth().setCustomUserClaims(uid, { superAdmin: true })
  .then(() => console.log(`superAdmin claim granted to UID ${uid}. Re-authentication is required.`))
  .catch(error => { console.error(error); process.exitCode = 1; });
