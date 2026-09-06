import { onAuthStateChanged,signInWithEmailAndPassword,signOut } from 'firebase/auth';
import { addDoc,collection,doc,getCountFromServer,getDoc,getDocs,limit,onSnapshot,orderBy,query,serverTimestamp,setDoc,where } from 'firebase/firestore';
import { appCheckInitializationError,auth,db,firebaseInitializationError,firestorePersistenceResult } from './src/firebase/client';
import { setOwnerAdminUiState } from './src/owner-admin/ui-state';

const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
const FEATURES={publicLandingPageEnabled:'Public landing page',registrationsEnabled:'New registrations',loginEnabled:'User login',inventoryUpdatesEnabled:'Inventory updates',barcodeScannerEnabled:'Barcode scanner',notificationsEnabled:'Notifications',reportsEnabled:'Reports',signageEnabled:'Signage generator'};
const IMPACT={active:'Full plan access is restored immediately.','read-only':'Users can view and export data, but cannot add, edit or delete.',suspended:'Users can log in, see the suspension page and export their data. Inventory management is blocked.',disabled:'All business dashboard access is blocked. Existing data is retained.'};
let state={businesses:[],settings:null,totalUsers:0},saving=false,adminWatcher=null;
const uiElements={gate:$('#authGate'),checking:$('#authChecking'),login:$('#ownerLogin'),denied:$('#accessDenied'),deniedMessage:$('#ownerStatusMessage'),app:$('#ownerApp')};
const setUiState=(next,message='')=>setOwnerAdminUiState(uiElements,next,message);

const AUTH_MESSAGES={
  'auth/invalid-credential':'Incorrect email or password, or the account does not exist.',
  'auth/wrong-password':'Incorrect email or password.',
  'auth/user-not-found':'No account exists for this email address.',
  'auth/user-disabled':'This account has been disabled. Contact the StockGuard administrator.',
  'auth/unauthorized-domain':'This domain is not authorised for Firebase sign-in.',
  'auth/network-request-failed':'Firebase sign-in could not reach the network. Check your connection and Firebase configuration.',
  'auth/invalid-api-key':'Firebase sign-in is not configured correctly for this site.',
  'auth/app-not-authorized':'This site is not authorised to use the configured Firebase project.',
  'auth/operation-not-allowed':'Email and password sign-in is not enabled for this Firebase project.',
  'auth/too-many-requests':'Sign-in is temporarily blocked after too many attempts. Please wait and try again.'
};
function errorCode(error){return typeof error==='object'&&error&&'code' in error?String(error.code):''}
function authFailureMessage(error){return AUTH_MESSAGES[errorCode(error)]||'Firebase sign-in failed because of a configuration or network problem. Please try again.'}
function isAppCheckFailure(error){const code=errorCode(error).toLowerCase();return code.includes('app-check')||String(error instanceof Error?error.message:'').toLowerCase().includes('app check')}
function ownerFailureMessage(error){
  const code=errorCode(error);
  if(isAppCheckFailure(error))return 'Firebase Authentication succeeded, but App Check could not verify this browser or domain.';
  if(code==='permission-denied'||code==='firestore/permission-denied')return 'Firebase Authentication succeeded, but Firestore denied the owner authorization check.';
  if(code==='unavailable'||code==='firestore/unavailable'||code==='auth/network-request-failed')return 'Firebase Authentication succeeded, but owner access could not be verified because of a network failure.';
  return 'Firebase Authentication succeeded, but owner access could not be verified because of a Firebase configuration or network failure.';
}
function firestoreFailureMessage(error,action){
  const code=errorCode(error);
  if(isAppCheckFailure(error))return `${action} was blocked because App Check could not verify this browser or domain.`;
  if(code==='permission-denied'||code==='firestore/permission-denied')return `${action} was denied by Firestore permissions.`;
  if(code==='unavailable'||code==='firestore/unavailable')return `${action} could not reach Firestore. Check your network and try again.`;
  return `${action} failed because of a Firestore configuration or network problem.`;
}
function setAuthError(message){$('#authError').textContent=message}
function inspectAdministrator(snapshot,user){const data=snapshot.data();return {documentFound:snapshot.exists(),documentIdMatches:snapshot.id===user.uid,roleMatches:snapshot.exists()&&data?.role==='super_admin',activeMatches:snapshot.exists()&&data?.active===true}}
function administratorMessage(result){
  if(!result.documentFound)return 'Firebase Authentication succeeded, but no admin document was found at the authenticated UID. The document is missing or is stored under a different document ID.';
  if(!result.documentIdMatches)return 'Firebase Authentication succeeded and an admin document was found, but its document ID does not match the authenticated UID.';
  const failures=[];
  if(!result.roleMatches)failures.push('role must be exactly the string “super_admin”');
  if(!result.activeMatches)failures.push('active must be the boolean true');
  return `Firebase Authentication succeeded and the admin document was found, but ${failures.join(' and ')}.`;
}

function toast(message,isError=false){const el=$('#toast');el.textContent=message;el.classList.toggle('error-toast',isError);el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3200)}
function date(value){const raw=value?.toDate?value.toDate():value?new Date(value):null;return raw&&!Number.isNaN(raw.valueOf())?raw.toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'}):'Never'}
function safe(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function friendly(value){return String(value||'').replaceAll('_',' ').replaceAll('-',' ')}
function defaults(){return {maintenanceMode:false,maintenanceMessage:'',publicLandingPageEnabled:true,registrationsEnabled:true,loginEnabled:true,inventoryUpdatesEnabled:true,barcodeScannerEnabled:true,notificationsEnabled:true,reportsEnabled:true,signageEnabled:true}}
function nowSession(user){return {authTime:null,signInProvider:user?.providerData?.[0]?.providerId||null,userAgent:navigator.userAgent.slice(0,300)}}
async function verifyAdministrator(user){
  if(!db)throw new Error('Firestore is unavailable.');
  const ref=doc(db,'platformAdmins',user.uid),snapshot=await getDoc(ref),result=inspectAdministrator(snapshot,user);
  if(!result.documentFound||!result.documentIdMatches||!result.roleMatches||!result.activeMatches)return result;
  adminWatcher?.();
  adminWatcher=onSnapshot(ref,current=>{const currentResult=inspectAdministrator(current,user);if(!currentResult.documentFound||!currentResult.documentIdMatches||!currentResult.roleMatches||!currentResult.activeMatches)setUiState('unauthorized',administratorMessage(currentResult))},error=>setUiState('unauthorized',ownerFailureMessage(error)));
  return result;
}
async function productCount(businessId){const snap=await getCountFromServer(query(collection(db,'products'),where('businessId','==',businessId)));return snap.data().count}
async function loadDashboard(){const [businessSnap,accessSnap,settingsSnap,userCount]=await Promise.all([getDocs(query(collection(db,'businesses'),orderBy('createdAt','desc'),limit(250))),getDocs(collection(db,'businessAccessControls')),getDoc(doc(db,'publicPlatformStatus','current')),getCountFromServer(collection(db,'users'))]);const controls=new Map(accessSnap.docs.map(item=>[item.id,item.data()]));state.businesses=await Promise.all(businessSnap.docs.map(async item=>{const data=item.data(),control=controls.get(item.id)||{};return {id:item.id,name:data.name||'Unnamed business',ownerName:data.ownerName||'',createdAt:data.createdAt||null,lastActivityAt:data.lastActivityAt||null,productCount:await productCount(item.id),plan:data.plan||'Starter',...control,accessStatus:String(control.accessStatus||'active').replace('_','-'),subscriptionStatus:control.subscriptionStatus||'trial'}}));state.totalUsers=userCount.data().count;state.settings={...defaults(),...(settingsSnap.exists()?settingsSnap.data():{})};renderStats();renderBusinesses();renderRecent();renderSettings()}
function renderStats(){const count=(field,value)=>state.businesses.filter(b=>b[field]===value).length,cards=[['Registered businesses',state.businesses.length,'All tenants'],['Active businesses',count('accessStatus','active'),'Full access'],['Suspended businesses',count('accessStatus','suspended'),'Data preserved'],['Trial accounts',count('subscriptionStatus','trial'),'Subscription'],['Past-due accounts',count('subscriptionStatus','past_due'),'Needs attention'],['Cancelled accounts',count('subscriptionStatus','cancelled'),'Retained accounts'],['Total users',state.totalUsers,'Firestore user profiles'],['Account warnings',state.businesses.filter(b=>['past_due','cancelled'].includes(b.subscriptionStatus)||['suspended','disabled'].includes(b.accessStatus)).length,'Needs review']];$('#stats').innerHTML=cards.map(item=>`<article class="stat"><span>${item[0]}</span><strong>${item[1]}</strong><small>${item[2]}</small></article>`).join('')}
function businessRow(b){const access=(b.accessStatus||'active').replace('_','-'),subscription=b.subscriptionStatus||'trial';return `<tr><td><b>${safe(b.name)}</b><small>${safe(b.id)}</small></td><td>${safe(b.ownerName||'Not recorded')}</td><td>${safe(b.plan||'Starter')}</td><td><span class="badge ${subscription}">${safe(friendly(subscription))}</span></td><td><span class="badge ${access}">${safe(friendly(access))}</span></td><td>${Number(b.productCount)||0}</td><td>${date(b.lastActivityAt)}</td><td><button class="secondary manage" data-id="${safe(b.id)}">Manage</button></td></tr>`}
function filtered(){const queryText=$('#businessSearch').value.trim().toLowerCase(),filter=$('#statusFilter').value;return state.businesses.filter(b=>(!queryText||`${b.name} ${b.ownerName||''} ${b.id}`.toLowerCase().includes(queryText))&&(filter==='all'||((b.accessStatus||'active').replace('_','-'))===filter))}
function renderBusinesses(){$('#businessRows').innerHTML=filtered().map(businessRow).join('')||'<tr><td colspan="8">No businesses match this view.</td></tr>'}
function renderRecent(){$('#recentBusinesses').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Business</th><th>Owner</th><th>Plan</th><th>Subscription</th><th>Access</th><th>Products</th><th>Last activity</th><th></th></tr></thead><tbody>${state.businesses.slice(0,8).map(businessRow).join('')}</tbody></table></div>`}
function renderSettings(){const settings=state.settings||defaults();$('#maintenanceMode').checked=Boolean(settings.maintenanceMode);$('#maintenanceMessage').value=settings.maintenanceMessage||'';$('#estimatedReturnAt').value=settings.estimatedReturnAt?.toDate?settings.estimatedReturnAt.toDate().toISOString().slice(0,16):'';$('#featureSwitches').innerHTML=Object.entries(FEATURES).map(([key,label])=>`<label class="toggle-row"><span><b>${label}</b></span><input type="checkbox" data-feature="${key}" ${settings[key]!==false?'checked':''}></label>`).join('');toggleShutdown()}
function show(view){$$('.view').forEach(element=>element.classList.toggle('active',element.id===view));$$('.nav').forEach(element=>element.classList.toggle('active',element.dataset.view===view));$('#title').textContent={overview:'Platform overview',businesses:'Business access control',platform:'Platform Control',audit:'Audit records'}[view];if(view==='audit')loadAudit()}
function openAccess(id){const business=state.businesses.find(item=>item.id===id);if(!business)return;$('#businessId').value=business.id;$('#businessName').value=business.name;$('#accessTitle').textContent=business.name;$('#accessStatus').value=(business.accessStatus||'active').replace('_','-');$('#subscriptionStatus').value=business.subscriptionStatus||'trial';$('#originalSubscription').value=business.subscriptionStatus||'trial';$('#accessReason').value='';$('#adminNote').value=business.internalNote||'';$('#effectiveAt').value='';$('#nameConfirmation').value='';updateImpact();$('#accessDialog').showModal()}
function updateImpact(){const status=$('#accessStatus').value;$('#impact').textContent=IMPACT[status];$('#nameConfirmWrap').hidden=status!=='disabled'}
function toggleShutdown(){const shutdown=$('#maintenanceMode').checked&&!$('#featureSwitches [data-feature="loginEnabled"]')?.checked;$('#shutdownField').hidden=!shutdown}
async function loadAudit(){try{const snap=await getDocs(query(collection(db,'adminAuditLogs'),orderBy('createdAt','desc'),limit(100)));$('#auditList').innerHTML=snap.docs.map(item=>{const log=item.data();return `<div class="audit-item"><b>${safe(log.action)}${log.businessName?' - '+safe(log.businessName):''}</b><small>${date(log.createdAt)} - Admin ${safe(log.adminUid)} - ${safe(log.reason||'No reason recorded')}</small></div>`}).join('')||'No administrator actions recorded.'}catch(error){toast(firestoreFailureMessage(error,'Loading the audit history'),true)}}
function setBusy(button,busy){button.disabled=busy;button.dataset.label||=button.textContent;button.textContent=busy?'Saving...':button.dataset.label}
function confirmChange(title,message){return new Promise(resolve=>{const dialog=$('#confirmDialog');$('#confirmTitle').textContent=title;$('#confirmMessage').textContent=message;const finish=value=>{dialog.close();$('#confirmYes').onclick=null;$('#confirmNo').onclick=null;resolve(value)};$('#confirmYes').onclick=()=>finish(true);$('#confirmNo').onclick=()=>finish(false);dialog.showModal()})}
async function audit(action,details){await addDoc(collection(db,'adminAuditLogs'),{adminUid:auth.currentUser.uid,action,...details,createdAt:serverTimestamp(),session:nowSession(auth.currentUser)})}

setUiState('checking');
if(!auth||!db){setUiState('signed-out');setAuthError(firebaseInitializationError?'Firebase could not initialize. Check the site Firebase configuration.':'Firebase environment variables are not configured.')}else{
  onAuthStateChanged(auth,async user=>{
    adminWatcher?.();adminWatcher=null;
    if(!user){setUiState('signed-out');if(appCheckInitializationError)setAuthError('Firebase App Check could not initialize for this browser or domain.');return}
    setUiState('checking');setAuthError('');
    try{
      const result=await verifyAdministrator(user);
      if(!result.documentFound||!result.documentIdMatches||!result.roleMatches||!result.activeMatches){
        setUiState('unauthorized',administratorMessage(result));
        return;
      }
      setUiState('authorized');
      await loadDashboard();
    }catch(error){
      const message=ownerFailureMessage(error);
      setUiState('unauthorized',message);
    }
  },error=>{setUiState('signed-out');setAuthError(authFailureMessage(error))});
}
void firestorePersistenceResult.then(error=>{if(error)toast('Offline caching is unavailable in this browser; online Firebase access will continue.',true)});
$('#ownerLogin').onsubmit=async event=>{event.preventDefault();setAuthError('');const button=event.submitter||$('#ownerLogin button[type="submit"]');setBusy(button,true);try{if(!auth)throw firebaseInitializationError||new Error('Firebase is unavailable.');const formData=new FormData(event.currentTarget);await signInWithEmailAndPassword(auth,String(formData.get('email')||'').trim(),String(formData.get('password')||''))}catch(error){setUiState('signed-out');setAuthError(authFailureMessage(error))}finally{setBusy(button,false)}};
async function requestSignOut(){try{setUiState('checking');if(auth)await signOut(auth);else setUiState('signed-out')}catch(error){setUiState('unauthorized',authFailureMessage(error))}}
$('#signOut').onclick=requestSignOut;$('#gateSignOut').onclick=requestSignOut;$$('.nav').forEach(button=>button.onclick=()=>show(button.dataset.view));
document.addEventListener('click',event=>{const target=event.target;if(!(target instanceof HTMLElement))return;if(target.dataset.open)show(target.dataset.open);if(target.classList.contains('manage'))openAccess(target.dataset.id);if(target.hasAttribute('data-close'))$('#accessDialog').close()});
$('#businessSearch').oninput=renderBusinesses;$('#statusFilter').onchange=renderBusinesses;$('#accessStatus').onchange=updateImpact;
$('#accessForm').onsubmit=async event=>{event.preventDefault();if(saving)return;const status=$('#accessStatus').value,name=$('#businessName').value,id=$('#businessId').value,reason=$('#accessReason').value.trim(),subscription=$('#subscriptionStatus').value;if(status==='disabled'&&$('#nameConfirmation').value!==name){toast('Type the exact business name to continue.',true);return}if(!await confirmChange('Confirm business access change',`${IMPACT[status]} This will affect ${name} immediately.`))return;saving=true;const button=$('#confirmAccess');setBusy(button,true);try{const previous=state.businesses.find(item=>item.id===id)||{};await setDoc(doc(db,'businessAccessControls',id),{businessId:id,accessStatus:status,subscriptionStatus:subscription,reason,internalNote:$('#adminNote').value,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid,effectiveAt:$('#effectiveAt').value?new Date($('#effectiveAt').value):null},{merge:true});await audit('business.access.changed',{targetBusinessId:id,businessName:name,setting:'accessStatus',previousValue:previous.accessStatus||'active',newValue:status,reason});if(subscription!==$('#originalSubscription').value)await audit('business.subscription.changed',{targetBusinessId:id,businessName:name,setting:'subscriptionStatus',previousValue:$('#originalSubscription').value,newValue:subscription,reason});$('#accessDialog').close();await loadDashboard();toast('Business account updated.')}catch(error){toast(firestoreFailureMessage(error,'Updating the business account'),true)}finally{saving=false;setBusy(button,false)}};
$('#platformForm').onchange=toggleShutdown;
$('#platformForm').onsubmit=async event=>{event.preventDefault();if(saving)return;const values=Object.fromEntries($$('[data-feature]').map(input=>[input.dataset.feature,input.checked])),maintenanceMode=$('#maintenanceMode').checked,shutdown=maintenanceMode&&!values.loginEnabled,reason=$('#platformReason').value.trim();if(!await confirmChange('Confirm platform change',maintenanceMode?'Normal users will see the maintenance screen. Owner administration remains available.':'The selected platform availability settings will take effect immediately.'))return;if(shutdown&&$('#shutdownConfirmation').value!=='SHUT DOWN STOCKGUARD'){toast('Type SHUT DOWN STOCKGUARD for the additional shutdown confirmation.',true);return}saving=true;setBusy(event.submitter,true);try{const previous=state.settings||defaults(),next={...previous,maintenanceMode,maintenanceMessage:$('#maintenanceMessage').value,estimatedReturnAt:$('#estimatedReturnAt').value?new Date($('#estimatedReturnAt').value):null,...values,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid};await setDoc(doc(db,'publicPlatformStatus','current'),next,{merge:true});await audit('platform.settings.changed',{targetBusinessId:null,setting:'platformStatus',previousValue:{maintenanceMode:Boolean(previous.maintenanceMode),...Object.fromEntries(Object.keys(FEATURES).map(key=>[key,previous[key]!==false]))},newValue:{maintenanceMode,...values},reason});await loadDashboard();$('#platformReason').value='';$('#shutdownConfirmation').value='';toast('Platform controls updated.')}catch(error){toast(firestoreFailureMessage(error,'Saving platform controls'),true)}finally{saving=false;setBusy(event.submitter,false)}};
$('#refreshAudit').onclick=loadAudit;
