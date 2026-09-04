# StockGuard

StockGuard is a Firebase-backed, multi-tenant inventory application with a claim-protected Owner Control Centre at `/owner-admin`.

## Security model

- Firebase Authentication identifies users.
- Normal user tokens must contain a `businessId` custom claim.
- The platform owner token must contain `superAdmin: true`.
- Firestore rules enforce tenant reads and account/platform state on every inventory write.
- Owner mutations are callable Cloud Functions using the Admin SDK. The client cannot write access controls, platform settings, user profiles, or audit logs.
- Firebase App Check is required by every owner function. Configure `appCheckSiteKey` in `firebase-config.js` before deployment.

## Deploy

1. Install the Firebase CLI and authenticate: `firebase login`.
2. Select the project: `firebase use stockguard-12`.
3. Install function dependencies: `npm --prefix functions install`.
4. Deploy rules, functions, and hosting: `firebase deploy`.
5. Grant the first owner claim from a trusted administrator workstation using Application Default Credentials: `node functions/set-super-admin.js FIREBASE_UID`.
6. Sign out and back in so Firebase issues a fresh token.

Never run the claim bootstrap script in a browser or ship service-account credentials with the application. Assign normal users a `businessId` claim through a separate trusted onboarding process.

## Required initial documents

Create `platformSettings/global` with `maintenanceMode: false` and a `features` map whose switches are true. Each business needs a `businesses/{businessId}` document and a matching `businessAccessControls/{businessId}` document with `accessStatus: "active"` and `subscriptionStatus: "trial"`.

## Local static server

Run `npm install` and `npm start`. Firebase emulators are recommended for rules and function testing; the local Express server intentionally exposes no inventory API.
