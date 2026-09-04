const required=['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_STORAGE_BUCKET','VITE_FIREBASE_MESSAGING_SENDER_ID','VITE_FIREBASE_APP_ID'] as const;
export const env=Object.fromEntries(required.map(key=>[key,import.meta.env[key] as string|undefined])) as Record<typeof required[number],string|undefined>;
export const firebaseReady=required.every(key=>Boolean(env[key]));
