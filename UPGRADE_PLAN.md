# StockGuard Upgrade Plan

Audit date: 4 September 2026  
Baseline: the project in this workspace, including the previously added Firebase owner-control prototype  
Product tagline: **SMART INVENTORY & EXPIRY MANAGEMENT.**

## 1. Existing project audit

### Files inspected

- `index.html`: single-page inventory dashboard, login/account-state screens, four client-side views, product dialog, Firebase compat CDN scripts.
- `styles.css`, `access-states.css`: desktop-first dashboard styles, two breakpoints, authentication and account-state styles.
- `app.js`: rendering, search, three-state expiry calculation, CRUD, CSV export, Firebase Authentication gate and business access checks.
- `owner-admin.html`, `owner-admin.css`, `owner-admin.js`: separate owner login, business table, platform switches and audit viewer.
- `firebase-config.js`: public Firebase web configuration embedded in source and optional App Check placeholder.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`: initial claim-based rules and Firebase deployment configuration.
- `functions/index.js`, `functions/package.json`, `functions/set-super-admin.js`: callable owner functions and trusted claim bootstrap utility.
- `server.js`, `package.json`, `package-lock.json`, `Procfile`, `netlify.toml`: Express/static hosting and Netlify configuration.
- `README.md`, `.gitignore`: current setup notes and ignored runtime files.
- `stockguard.db`: retained legacy SQLite data file. Its previously used `items` schema contains `id`, `name`, `category`, `quantity`, `unit`, `expiry`, and `supplier`. It will not be deleted.

`node_modules` is generated third-party code and was dependency-audited through the manifests rather than treated as application source. Browser localStorage contents are runtime/user-specific and cannot be read from the filesystem audit.

### Working functionality

- StockGuard green/black/light visual identity and responsive desktop layout.
- Dashboard, inventory, alerts and report-view navigation.
- Product add/edit/remove, search, expiry-status filter, nearest-expiry ordering and CSV export when Firebase is correctly configured.
- Aggregate product/unit/at-risk/expired figures derived from loaded inventory.
- Email/password sign-in gate and secure logout for the business app.
- Tenant inventory path based on a `businessId` authentication claim.
- Active, read-only, suspended and disabled account experiences.
- Separate owner route with verified `superAdmin` claim checks in both client and callable functions.
- Owner business status controls, platform switches and server-written audit records.
- Basic responsive breakpoints and security response headers.

### Incomplete or missing functionality

- No Vite, React or TypeScript application architecture.
- No registration, password reset, email verification, terms/privacy acceptance, onboarding or membership provisioning.
- No active migration for `stockguard-items-v2`; current code never reads that key.
- No products/batches separation, branches, users/memberships UI, roles, product history, images, CSV import or archive workflow.
- Only expired/soon/safe classification exists; configurable six-stage expiry logic is missing.
- No barcode camera scanner or manual scanner workflow.
- No notifications, action centre, discount approvals, signage generator, tasks or complete reports.
- No Firebase Storage integration.
- No PWA manifest, service worker, offline screen, connectivity indicator or draft preservation.
- No automated application, expiry, migration or Firestore rules tests.
- Platform owner dashboard is a separate vanilla-JS implementation and must be integrated into the routed React app without weakening claim protection.
- Platform feature switches exist but only maintenance, login and inventory updates are meaningfully enforced.
- Existing SQLite data is retained but is not wired into the current Firebase client.

### Defects and duplicated/fragile code

- `today` is calculated once at script load, so an app left open overnight uses stale expiry results.
- Date handling uses browser-local midnight and `Math.round`, which can misclassify around daylight-saving/timezone boundaries and does not explicitly enforce Africa/Johannesburg.
- “Expires today” is classified as expired instead of critical.
- Products and batches are conflated; one product can have only one expiry date.
- Destructive item removal uses browser `confirm`, has no audit record, and permanently deletes instead of archiving.
- Read-only mode disables three obvious buttons but row edit/delete controls remain visible and depend on runtime/rules rejection.
- Suspended export is attempted after a Firestore read whose rules may not match all future collections.
- Navigation has no URL/history semantics, focus management or active-page announcement.
- HTML is rendered through large template strings and global event handlers, making validation, testing and accessibility fragile.
- Two separate CSS systems duplicate brand, button, panel, table, modal and responsive patterns.
- Firebase compat libraries are loaded from a CDN and the Firebase project configuration is committed rather than injected at build time.
- The Express and Netlify/Firebase hosting paths duplicate deployment concerns.
- The owner dashboard loads per-business product counts individually, which will not scale.
- Owner account effective dates are recorded but not scheduled for future execution.
- No pagination is present for businesses beyond the first 250 or audit records beyond the selected limit.
- `firestore.indexes.json` contains no indexes for the required compound queries.

### Security findings

- Positive baseline: administrative writes go through claim-checked callable functions and protected collections deny direct client writes.
- Current `businessId`-claim-only membership model does not meet the requirement that access derives from active membership documents and makes multi-business membership awkward.
- The broad recursive business subcollection rule grants identical write access to every role and every document type; employees could perform owner-only operations.
- No field allowlists, immutable-field checks, role validation, archival controls, image validation rules, or audit-log create constraints exist.
- Client-created inventory records lack mandatory `businessId`, `createdAt`, `updatedAt`, and actor metadata.
- Public platform settings expose the whole document instead of a public-safe settings projection.
- No Storage rules exist.
- No App Check initialization key is configured, while owner functions require App Check.
- Registration/onboarding writes and custom-claim/membership synchronization are not implemented.
- No rate limiting exists for sensitive callable operations.
- No Content Security Policy is configured; inline-heavy markup and CDN scripts would make a strict CSP difficult.
- CSV injection protection is absent for exported cells beginning with `=`, `+`, `-`, or `@`.
- Error handling may display raw backend messages and does not provide structured recovery.
- No emulator-based rules proof currently confirms cross-business and cross-role denial.

### Existing localStorage data model

The required legacy key is `stockguard-items-v2`. It is not referenced by the current source, but the existing UI/legacy database establishes the compatible item shape:

```ts
type LegacyStockItem = {
  id?: string | number;
  name: string;
  category?: string;
  quantity: number;
  unit?: string;
  expiry: string;       // expected YYYY-MM-DD
  supplier?: string;
};
```

The migration will defensively accept either a direct array or an object containing an `items` array, validate every field, create a product plus initial batch, and deduplicate by normalized barcode/SKU when present or by normalized name + category + supplier + expiry. It will retain `stockguard-items-v2` untouched, write a timestamped temporary backup key, and store a per-user migration marker in Firestore only after the entire batched migration succeeds.

### Interaction audit

- Working: primary navigation, quick links, search, status filter, add/edit form, remove buttons, clear-expired confirmation, CSV export, sign-in/sign-out, owner navigation, business manage dialog and platform switches.
- Incomplete: no empty/error/loading state for several owner operations; no pagination; no keyboard shortcut or focus return after dialogs; table actions are cramped on mobile; “clear expired” is unsafe permanent deletion; buttons lack consistent accessible names/icons; no registration/reset links; no scanner permissions/fallback; report and other feature switches do not disable their corresponding UI.

### Mobile and accessibility audit

- Existing breakpoints reduce the sidebar and eventually hide it, but mobile then has no replacement navigation.
- Tables rely on horizontal scrolling and do not expose a mobile card alternative.
- Some touch targets and secondary actions are below the preferred 44px size.
- Focus-visible styles, skip link, landmark consistency, dialog focus restoration, form help/error association and reduced-motion support are missing.
- Status is communicated mostly with colour and small text; status icons/text should be consistently paired.
- Several muted foreground colours and 10–11px labels need contrast/readability review.
- Toasts use a live region on the main app but the owner toast lacks explicit live-region semantics.

## 2. Upgrade architecture

- Vite + React + TypeScript with React Router and modular feature folders.
- Organised reusable CSS using tokens/components, preserving the existing green/black/light StockGuard brand.
- Firebase modular SDK configured exclusively from `VITE_FIREBASE_*` environment variables.
- Firestore top-level collections: `users`, `businesses`, `memberships`, `branches`, `products`, `batches`, `notifications`, `tasks`, `promotions`, `stockActions`, `auditLogs`, and `subscriptions`. Every tenant record contains `businessId`.
- Active membership documents are the source of business access and role; custom claims remain reserved for platform administration and optional coarse-grained acceleration.
- Cloud Functions handle onboarding, membership/role changes, account administration, sensitive audit creation, notification deduplication and scheduled summaries.
- Firebase Storage stores validated product images under business-scoped paths.
- PWA application shell with conservative caching; Firestore remains authoritative and offline drafts contain no authentication secrets.

## 3. Phased implementation and validation

Each phase ends with lint/typecheck/tests, a production build, a runtime smoke test and a separate Git commit. Work does not advance while a check is failing.

1. **Audit and repair baseline** — preserve legacy files/data, add this plan, establish tests for legacy expiry behavior and record the baseline.
2. **Vite/React/TypeScript conversion** — create the routed shell, reusable design system and compatible dashboard/inventory views; keep legacy artifacts in a migration-safe archive until acceptance.
3. **Firebase configuration** — modular SDK, typed converters, environment validation, emulators, App Check hooks, Storage configuration and `.env.example`.
4. **Authentication and onboarding** — registration, login, reset, verification, legal acceptance, onboarding and secure logout.
5. **Database and rules** — typed schema, membership/role enforcement, field validation, Storage rules, indexes and emulator rules tests.
6. **Legacy migration** — one-time `stockguard-items-v2` migration with backup, progress, idempotency, deduplication and failure recovery.
7. **Products and batches** — full product fields, images, batch CRUD, archive, history, branches, FEFO, CSV import/export and duplicate prevention.
8. **Expiry and notifications** — Johannesburg-safe six-stage classification, custom thresholds, in-app/browser alerts, daily summaries and deduplication.
9. **Action Centre and discounts** — validated stock actions, value saved/lost, safe sale constraints and manager approval.
10. **Promotional signage** — A4, POS and square outputs with PNG/PDF downloads and WhatsApp sharing.
11. **People and tasks** — employee membership management, role-aware UI, branch/storage tasks, overdue/completion tracking and actor history.
12. **Reports and platform administration** — real filtered metrics, CSV/PDF output, account usage/status controls and scalable platform statistics.
13. **PWA and offline** — manifest, icons, service worker, offline route, network indicator, cached shell, mobile bottom navigation and draft recovery.
14. **Release hardening** — complete unit/integration/rules checklist, accessibility and responsive review, dependency/security review, Netlify production configuration and deployment documentation.

## 4. File change map

### Replaced or substantially changed

- `index.html` — Vite entry document and PWA metadata.
- `app.js`, `styles.css`, `access-states.css` — functionality moves into typed React modules and reusable CSS; legacy behavior remains covered by migration/tests.
- `owner-admin.*` — owner features move into protected React routes and shared components.
- `package.json`, `package-lock.json` — Vite/React/TypeScript/Firebase/test/PWA toolchain.
- `firebase-config.js` — removed after environment-driven modular configuration is working.
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `netlify.toml` — production data model, deployment and security.
- `functions/index.js`, `functions/package.json` — typed or modularised backend operations, onboarding, audit, notifications and administration.
- `README.md`, `.gitignore` — setup, emulators, tests, migration and deployment.

### Added

- `.env.example`, `tsconfig*.json`, `vite.config.ts`, `eslint.config.js`.
- `src/` application, feature, component, hook, service, schema, utility and style modules.
- `src/features/migration/` legacy migration utility and progress UI.
- `src/dev/seed.ts` explicitly development-only seed utility.
- `public/manifest.webmanifest`, icons and offline assets.
- `storage.rules`.
- Unit/integration tests and Firestore rules tests.
- `TESTING_CHECKLIST.md` and deployment/runbook documentation.

### Preserved

- `stockguard.db` and the browser’s `stockguard-items-v2` value are never deleted by the upgrade.
- Existing StockGuard branding, useful dashboard concepts, inventory search/filter/export behavior and expiry-related product data.

## 5. Acceptance gates

- No production sample data is created automatically.
- All tenant documents carry `businessId`; cross-business access fails in emulator tests.
- Role-restricted writes fail in rules tests even when called directly outside the UI.
- Legacy data migrates once, deduplicates, reports progress, leaves a backup and never deletes local data on failure.
- All dashboard/report figures derive from Firestore records.
- Production build and TypeScript checks pass with no console errors.
- Owner and suspended-account recovery paths remain usable.
- Android installation, offline shell, mobile navigation and draft restoration are verified.
