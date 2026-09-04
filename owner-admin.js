'use strict';
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const FEATURES = { publicLandingPage:'Public landing page', registrations:'New registrations', login:'User login', inventoryUpdates:'Inventory updates', barcodeScanner:'Barcode scanner', notifications:'Notifications', reports:'Reports', signageGenerator:'Signage generator' };
const IMPACT = { active:'Full plan access is restored immediately.', 'read-only':'Users can view and export data, but cannot add, edit or delete.', suspended:'Users see a suspension page and can only export their data.', disabled:'All business dashboard access is blocked. Data is retained.' };
let auth, functionsApi, state = { businesses:[], settings:null }, loading = false;

function initFirebase(){
  if(!window.firebaseConfig?.apiKey) throw new Error('Firebase is not configured.');
  if(!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
  if(window.firebaseConfig.appCheckSiteKey){ firebase.appCheck().activate(window.firebaseConfig.appCheckSiteKey, true); }
  auth=firebase.auth(); functionsApi=firebase.app().functions('us-central1');
}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
function date(value){const raw=value?.toDate?value.toDate():value?new Date(value):null;return raw&&!isNaN(raw)?raw.toLocaleString(): 'Never';}
function safe(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function call(name,data={}){const result=await functionsApi.httpsCallable(name)(data);return result.data;}
async function loadDashboard(){
  const data=await call('ownerDashboard'); state.businesses=data.businesses||[]; state.settings=data.settings||defaultSettings();
  renderStats(data.totalUsers||0); renderBusinesses(); renderRecent(); renderSettings();
}
function defaultSettings(){return {maintenanceMode:false,maintenanceMessage:'',features:Object.fromEntries(Object.keys(FEATURES).map(k=>[k,true]))};}
function renderStats(totalUsers){
  const bs=state.businesses, count=(field,val)=>bs.filter(b=>(b[field]||'').toLowerCase()===val).length;
  const cards=[['Registered businesses',bs.length,'All tenants'],['Active businesses',count('accessStatus','active'),'Full access'],['Suspended businesses',count('accessStatus','suspended'),'Data preserved'],['Trial accounts',count('subscriptionStatus','trial'),'Subscription'],['Past-due accounts',count('subscriptionStatus','past-due'),'Needs attention'],['Cancelled accounts',count('subscriptionStatus','cancelled'),'Retained accounts'],['Total users',totalUsers,'Firebase Authentication']];
  $('#stats').innerHTML=cards.map(x=>`<article class="stat"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join('');
}
function businessRow(b){const access=b.accessStatus||'active',sub=b.subscriptionStatus||'trial';return `<tr><td><b>${safe(b.name)}</b><small>${safe(b.id)}</small></td><td>${safe(b.plan||'Starter')}</td><td><span class="badge ${sub}">${safe(sub)}</span></td><td><span class="badge ${access}">${safe(access)}</span></td><td>${Number(b.productCount)||0}</td><td>${date(b.lastActivityAt)}</td><td><button class="secondary manage" data-id="${safe(b.id)}">Manage</button></td></tr>`}
function filtered(){const q=$('#businessSearch').value.trim().toLowerCase(),f=$('#statusFilter').value;return state.businesses.filter(b=>(!q||`${b.name} ${b.id}`.toLowerCase().includes(q))&&(f==='all'||(b.accessStatus||'active')===f));}
function renderBusinesses(){$('#businessRows').innerHTML=filtered().map(businessRow).join('')||'<tr><td colspan="7">No businesses match this view.</td></tr>';}
function renderRecent(){$('#recentBusinesses').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Business</th><th>Plan</th><th>Subscription</th><th>Access</th><th>Products</th><th>Last activity</th><th></th></tr></thead><tbody>${state.businesses.slice(0,8).map(businessRow).join('')}</tbody></table></div>`;}
function renderSettings(){const s=state.settings||defaultSettings();$('#maintenanceMode').checked=Boolean(s.maintenanceMode);$('#maintenanceMessage').value=s.maintenanceMessage||'';$('#estimatedReturnAt').value=s.estimatedReturnAt?.toDate?s.estimatedReturnAt.toDate().toISOString().slice(0,16):'';$('#featureSwitches').innerHTML=Object.entries(FEATURES).map(([key,label])=>`<label class="toggle-row"><span><b>${label}</b></span><input type="checkbox" data-feature="${key}" ${(s.features?.[key]??true)?'checked':''}></label>`).join('');toggleShutdown();}
function show(view){$$('.view').forEach(x=>x.classList.toggle('active',x.id===view));$$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===view));$('#title').textContent={overview:'Platform overview',businesses:'Business access control',platform:'Platform controls',audit:'Audit records'}[view];if(view==='audit')loadAudit();}
function openAccess(id){const b=state.businesses.find(x=>x.id===id);if(!b)return;$('#businessId').value=b.id;$('#businessName').value=b.name;$('#accessTitle').textContent=b.name;$('#accessStatus').value=b.accessStatus||'active';$('#subscriptionStatus').value=b.subscriptionStatus||'trial';$('#originalSubscription').value=b.subscriptionStatus||'trial';$('#accessReason').value='';$('#adminNote').value=b.internalNote||'';$('#effectiveAt').value='';$('#nameConfirmation').value='';updateImpact();$('#accessDialog').showModal();}
function updateImpact(){const v=$('#accessStatus').value;$('#impact').textContent=IMPACT[v];$('#nameConfirmWrap').hidden=v!=='disabled';}
function toggleShutdown(){const shutdown=$('#maintenanceMode').checked&&!$('#featureSwitches input[data-feature="login"]')?.checked;$('#shutdownField').hidden=!shutdown;}
async function loadAudit(){try{const {logs}=await call('ownerAuditLogs',{limit:100});$('#auditList').innerHTML=logs.map(l=>`<div class="audit-item"><b>${safe(l.action)}${l.businessName?' · '+safe(l.businessName):''}</b><small>${date(l.createdAt)} · Admin ${safe(l.adminUid)} · ${safe(l.reason||'No reason recorded')}</small></div>`).join('')||'No owner actions recorded.';}catch(e){toast(e.message)}}
function setBusy(button,busy){button.disabled=busy;button.dataset.label ||= button.textContent;button.textContent=busy?'Saving…':button.dataset.label;}

initFirebase();
auth.onAuthStateChanged(async user=>{
  if(!user){$('#authGate').hidden=false;$('#ownerApp').hidden=true;return;}
  const token=await user.getIdTokenResult(true);
  if(token.claims.superAdmin!==true){await auth.signOut();$('#authError').textContent='This account is not authorised for owner administration.';return;}
  $('#authGate').hidden=true;$('#ownerApp').hidden=false;
  try{await loadDashboard();}catch(e){toast(e.message||'Unable to load owner dashboard.');}
});
$('#ownerLogin').onsubmit=async e=>{e.preventDefault();$('#authError').textContent='';const b=e.submitter;setBusy(b,true);try{await auth.signInWithEmailAndPassword(e.currentTarget.email.value,e.currentTarget.password.value);}catch(err){$('#authError').textContent='Sign-in failed or this account is not authorised.';}finally{setBusy(b,false)}};
$('#signOut').onclick=()=>auth.signOut();
$$('.nav').forEach(b=>b.onclick=()=>show(b.dataset.view));document.addEventListener('click',e=>{if(e.target.dataset.open)show(e.target.dataset.open);if(e.target.classList.contains('manage'))openAccess(e.target.dataset.id);if(e.target.hasAttribute('data-close'))$('#accessDialog').close();});
$('#businessSearch').oninput=renderBusinesses;$('#statusFilter').onchange=renderBusinesses;$('#accessStatus').onchange=updateImpact;
$('#accessForm').onsubmit=async e=>{e.preventDefault();if(loading)return;const status=$('#accessStatus').value,name=$('#businessName').value,id=$('#businessId').value,reason=$('#accessReason').value,subscription=$('#subscriptionStatus').value;if(status==='disabled'&&$('#nameConfirmation').value!==name){toast('Type the exact business name to continue.');return;}if(!confirm(`Confirm ${status} access for ${name}? ${IMPACT[status]}`))return;loading=true;const btn=$('#confirmAccess');setBusy(btn,true);try{await call('setBusinessAccess',{businessId:id,accessStatus:status,reason,note:$('#adminNote').value,effectiveAt:$('#effectiveAt').value||null,confirmation:$('#nameConfirmation').value});if(subscription!==$('#originalSubscription').value)await call('setSubscriptionStatus',{businessId:id,subscriptionStatus:subscription,reason});$('#accessDialog').close();await loadDashboard();toast('Business account updated.');}catch(err){toast(err.message)}finally{loading=false;setBusy(btn,false)}};
$('#platformForm').onchange=toggleShutdown;
$('#platformForm').onsubmit=async e=>{e.preventDefault();if(loading)return;const features=Object.fromEntries($$('[data-feature]').map(x=>[x.dataset.feature,x.checked]));const shutdown=$('#maintenanceMode').checked&&!features.login;if(shutdown&&!confirm('This will prevent normal users from signing in. Owner access will remain available. Continue?'))return;loading=true;setBusy(e.submitter,true);try{await call('updatePlatformSettings',{maintenanceMode:$('#maintenanceMode').checked,maintenanceMessage:$('#maintenanceMessage').value,estimatedReturnAt:$('#estimatedReturnAt').value||null,features,reason:$('#platformReason').value,shutdownConfirmation:$('#shutdownConfirmation').value});await loadDashboard();$('#platformReason').value='';$('#shutdownConfirmation').value='';toast('Platform controls updated.');}catch(err){toast(err.message)}finally{loading=false;setBusy(e.submitter,false)}};
$('#refreshAudit').onclick=loadAudit;
