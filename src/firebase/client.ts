import { initializeApp,getApps } from 'firebase/app';
import { getAnalytics,isSupported as analyticsIsSupported } from 'firebase/analytics';
import { connectAuthEmulator,getAuth } from 'firebase/auth';
import { connectFirestoreEmulator,enableIndexedDbPersistence,getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { connectFunctionsEmulator,getFunctions } from 'firebase/functions';
import { initializeAppCheck,ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { appCheckSiteKey,env,firebaseReady,measurementId,useEmulators } from '../config/env';
const config={apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID,measurementId};
function initializeFirebase(){
  if(!firebaseReady)return {app:null,error:null};
  try{return {app:getApps()[0]??initializeApp(config),error:null}}
  catch(error){return {app:null,error}}
}
const initialized=initializeFirebase();
export const firebaseApp=initialized.app;
export const firebaseInitializationError=initialized.error;
export const auth=firebaseApp?getAuth(firebaseApp):null;
export const db=firebaseApp?getFirestore(firebaseApp):null;
export const storage=firebaseApp?getStorage(firebaseApp):null;
export const functions=firebaseApp?getFunctions(firebaseApp,'us-central1'):null;
export const analytics=firebaseApp&&measurementId?analyticsIsSupported().then(supported=>supported?getAnalytics(firebaseApp):null):Promise.resolve(null);
export let appCheckInitializationError:unknown=null;
if(firebaseApp&&appCheckSiteKey){try{initializeAppCheck(firebaseApp,{provider:new ReCaptchaEnterpriseProvider(appCheckSiteKey),isTokenAutoRefreshEnabled:true})}catch(error){appCheckInitializationError=error}}
export const firestorePersistenceResult=db?enableIndexedDbPersistence(db).then(()=>null).catch(error=>error):Promise.resolve(null);
if(useEmulators&&auth&&db&&functions){connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8080);connectFunctionsEmulator(functions,'127.0.0.1',5001)}
