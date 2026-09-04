const required=['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_STORAGE_BUCKET','VITE_FIREBASE_MESSAGING_SENDER_ID','VITE_FIREBASE_APP_ID'] as const;
export const env=Object.fromEntries(required.map(key=>[key,import.meta.env[key] as string|undefined])) as Record<typeof required[number],string|undefined>;
export const firebaseReady=required.every(key=>Boolean(env[key]));
export const appCheckSiteKey=import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY as string|undefined;
export const measurementId=import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string|undefined;
export const useEmulators=import.meta.env.DEV&&import.meta.env.VITE_USE_FIREBASE_EMULATORS==='true';
