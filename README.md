# StockGuard

StockGuard is a Firebase-backed, multi-tenant inventory application with a claim-protected Owner Control Centre at `/owner-admin`.

## Security model

- Firebase Authentication identifies users.
- Normal user tokens must contain a `businessId` custom claim.
- Owner administration requires `platformAdmins/{uid}` with `role: "super_admin"` and `active: true`.
- Firestore rules enforce tenant reads and account/platform state on every inventory write.
- Owner mutations are callable Cloud Functions using the Admin SDK. The client cannot write access controls, platform settings, user profiles, or audit logs.
- Firebase App Check is required by every owner function. Configure `VITE_FIREBASE_APP_CHECK_SITE_KEY` in the deployment environment before deployment.

## Deploy

1. Install the Firebase CLI and authenticate: `firebase login`.
2. Select the project: `firebase use stockguard-32a46`.
3. Install function dependencies: `npm --prefix functions install`.
4. Deploy rules, functions, and hosting: `firebase deploy`.
5. Confirm the owner's `platformAdmins/{uid}` document has `role: "super_admin"` and `active: true`. From a trusted workstation with Application Default Credentials, `node functions/set-super-admin.js FIREBASE_UID` can create or repair this record.

Never run the claim bootstrap script in a browser or ship service-account credentials with the application. Assign normal users a `businessId` claim through a separate trusted onboarding process.

## Required initial documents

Create `publicPlatformStatus/current` with `maintenanceMode: false`, an empty `maintenanceMessage`, and all `*Enabled` switches set to true. Each business needs a `businesses/{businessId}` document and a matching `businessAccessControls/{businessId}` document with `accessStatus: "active"` and `subscriptionStatus: "trial"`.

## Local static server

Run `npm install` and `npm start`. Firebase emulators are recommended for rules and function testing; the local Express server intentionally exposes no inventory API.
