const today=new Date(); today.setHours(0,0,0,0);
let items=[];
let editingId=null;
let firestoreDb=null;
let usingFirestore=false;
let firebaseAuth=null;
let currentBusinessId=null;
let accessStatus='disabled';
let platformSettings=null;
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const days=d=>Math.round((new Date(d+'T00:00:00')-today)/86400000);
const status=x=>{const n=days(x.expiry);return n<0?{key:'expired',text:`Expired ${Math.abs(n)}d ago`}:n===0?{key:'expired',text:'Expires today'}:n<=14?{key:'soon',text:`${n} day${n===1?'':'s'} left`}:{key:'safe',text:'Safe stock'}};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>new Date(d+'T00:00:00').toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const byExpiry=(a,b)=>new Date(a.expiry+'T00:00:00')-new Date(b.expiry+'T00:00:00');

function isFirebaseConfigured(){
  return Boolean(window.firebaseConfig && window.firebaseConfig.apiKey && window.firebaseConfig.apiKey !== 'YOUR_API_KEY' && window.firebaseConfig.projectId && window.firebaseConfig.projectId !== 'YOUR_PROJECT_ID');
}

function initStorage(){
  if (!isFirebaseConfigured()) {
    usingFirestore=false;
    return false;
  }

  if (typeof window.firebase === 'undefined' || !window.firebase.firestore || !window.firebase.auth) {
    usingFirestore=false;
    return false;
  }

  try {
    if (!window.firebase.apps || !window.firebase.apps.length) {
      window.firebase.initializeApp(window.firebaseConfig);
    }
    firestoreDb=window.firebase.firestore();
    firebaseAuth=window.firebase.auth();
    usingFirestore=true;
    return true;
  } catch (error) {
    console.error('Firebase initialization failed', error);
    usingFirestore=false;
    return false;
  }
}
function row(x,withDelete=false){const s=status(x);return `<div class="stock-row"><div><strong>${escape(x.name)}</strong><small>${escape(x.category||'Uncategorised')} · ${fmt(x.expiry)} · ${x.quantity} ${escape(x.unit||'units')}</small></div><div><span class="pill ${s.key}">${s.text}</span>${withDelete?` <button class="action edit" data-edit="${x.id}">Edit</button> <button class="action delete" data-delete="${x.id}">Remove</button>`:''}</div></div>`}
function render(){const group=k=>items.filter(x=>status(x).key===k);const safe=group('safe'),soon=group('soon'),expired=group('expired');$('#totalCount').textContent=items.length;$('#safeCount').textContent=safe.length;$('#soonCount').textContent=soon.length;$('#expiredCount').textContent=expired.length;$('#navAlertCount').textContent=soon.length+expired.length;const priority=[...soon,...expired].sort(byExpiry);$('#priorityList').innerHTML=priority.slice(0,5).map(x=>row(x)).join('')||empty('Everything is looking fresh','No products need attention.');$('#alertList').innerHTML=priority.map(x=>row(x,true)).join('')||empty('No expiry alerts','All tracked stock has more than 14 days left.');renderTable();const units=items.reduce((n,x)=>n+Number(x.quantity),0),risk=[...soon,...expired].reduce((n,x)=>n+Number(x.quantity),0),expiredUnits=expired.reduce((n,x)=>n+Number(x.quantity),0);$('#unitCount').textContent=units;$('#riskUnits').textContent=risk;$('#expiredUnits').textContent=expiredUnits;const total=Math.max(items.length,1);[['safe',safe],['soon',soon],['expired',expired]].forEach(([k,a])=>{$(`#${k}Bar`).style.width=`${a.length/total*100}%`;$(`#${k}Pct`).textContent=`${Math.round(a.length/total*100)}%`});}
function empty(title,subtitle){return `<div class="stock-row"><div><strong>${title}</strong><small>${subtitle}</small></div></div>`}
function renderTable(){const q=$('#search').value.toLowerCase(),f=$('#filter').value;const list=items.filter(x=>(!q||`${x.name} ${x.category} ${x.supplier}`.toLowerCase().includes(q))&&(f==='all'||status(x).key===f)).sort(byExpiry);$('#inventorySubtitle').textContent=`${list.length} of ${items.length} products shown`;
$('#stockTable').innerHTML=list.map(x=>{const s=status(x);return `<tr><td><b>${escape(x.name)}</b><br><small>${escape(x.category||'Uncategorised')}</small></td><td>${x.quantity} ${escape(x.unit||'')}</td><td>${fmt(x.expiry)}</td><td>${escape(x.supplier||'—')}</td><td><span class="pill ${s.key}">${s.text}</span></td><td><button class="action edit" data-edit="${x.id}">Edit</button> <button class="action delete" data-delete="${x.id}">Remove</button></td></tr>`}).join('')||'<tr><td colspan="6">No matching stock found.</td></tr>'}
function show(view){$$('.view').forEach(x=>x.classList.toggle('active',x.id===view));$$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===view));$('#pageTitle').textContent={dashboard:'Good afternoon, Manager',inventory:'Your stock',alerts:'Expiry alerts',reports:'Stock health report'}[view];}
function openDialog(item=null){editingId=item?item.id:null;const form=$('#productForm');form.reset();const title=$('#dialogTitle');const saveBtn=$('#saveItemBtn');if(item){title.textContent='Edit stock item';saveBtn.textContent='Update item';form.elements.name.value=item.name||'';form.elements.category.value=item.category||'';form.elements.quantity.value=item.quantity||'';form.elements.unit.value=item.unit||'';form.elements.expiry.value=item.expiry||'';form.elements.supplier.value=item.supplier||'';form.elements.id.value=item.id;}else{title.textContent='Add stock item';saveBtn.textContent='Save item';form.elements.id.value='';}$('#productDialog').showModal();}
function closeDialog(){$('#productDialog').close();}
function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
const API_BASE = '';

async function loadItems(){
  if (usingFirestore && firestoreDb) {
    if(!currentBusinessId) throw new Error('No business is assigned to this user.');
    const snapshot = await firestoreDb.collection('businesses').doc(currentBusinessId).collection('items').orderBy('expiry', 'asc').get();
    items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    render();
    return;
  }

  throw new Error('Secure Firebase storage is not configured.');
}

async function saveItem(payload, method='POST', id=null){
  if (usingFirestore && firestoreDb) {
    assertWritable();
    if (id) {
      await firestoreDb.collection('businesses').doc(currentBusinessId).collection('items').doc(id).set(payload, { merge: true });
    } else {
      await firestoreDb.collection('businesses').doc(currentBusinessId).collection('items').add(payload);
    }
    return;
  }

  throw new Error('Secure Firebase storage is not configured.');
}

async function deleteItem(id){
  if (usingFirestore && firestoreDb) {
    assertWritable();
    await firestoreDb.collection('businesses').doc(currentBusinessId).collection('items').doc(id).delete();
    return;
  }

  throw new Error('Secure Firebase storage is not configured.');
}
function assertWritable(){if(accessStatus!=='active')throw new Error('This account is not allowed to change inventory.');if(platformSettings?.maintenanceMode||platformSettings?.features?.inventoryUpdates===false)throw new Error('Inventory updates are temporarily unavailable.');}
function showState(title,message,{exportAllowed=false,eyebrow='Account notice',returnAt=null}={}){$('.app-shell').hidden=true;$('#loginGate').hidden=true;$('#accountState').hidden=false;$('#stateTitle').textContent=title;$('#stateMessage').textContent=message;$('#stateEyebrow').textContent=eyebrow;$('#stateExport').hidden=!exportAllowed;$('#returnTime').textContent=returnAt?`Estimated return: ${returnAt.toLocaleString()}`:'';}
function exportCsv(){const lines=['Product,Category,Quantity,Unit,Expiry date,Supplier,Status',...items.map(x=>[x.name,x.category,x.quantity,x.unit,x.expiry,x.supplier,status(x).text].map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(','))];const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));a.download='stockguard-inventory.csv';a.click();URL.revokeObjectURL(a.href);}
async function startAuthenticatedApp(user){
  const token=await user.getIdTokenResult(true);if(token.claims.superAdmin===true){location.href='/owner-admin';return;}
  currentBusinessId=token.claims.businessId||null;if(!currentBusinessId){showState('Business access unavailable','Your account is not assigned to a StockGuard business. Contact your business owner.');return;}
  const [settingsDoc,controlDoc]=await Promise.all([firestoreDb.doc('platformSettings/global').get(),firestoreDb.doc(`businessAccessControls/${currentBusinessId}`).get()]);
  platformSettings=settingsDoc.exists?settingsDoc.data():{features:{}};accessStatus=controlDoc.exists?(controlDoc.data().accessStatus||'active'):'active';
  if(platformSettings.maintenanceMode){showState('StockGuard is under maintenance',platformSettings.maintenanceMessage||'We are carrying out scheduled improvements. Please check back soon.',{eyebrow:'Scheduled maintenance',returnAt:platformSettings.estimatedReturnAt?.toDate?.()});return;}
  if(platformSettings.features?.login===false){showState('Login is temporarily unavailable','StockGuard sign-in has been paused by the platform administrator.');return;}
  if(accessStatus==='disabled'){showState('Business access disabled','Contact StockGuard support to restore access. Your business data has not been deleted.');return;}
  await loadItems();if(accessStatus==='suspended'){showState('Account suspended',controlDoc.data().reason||'Inventory management is unavailable. Contact StockGuard support.',{exportAllowed:true});return;}
  $('.app-shell').hidden=false;$('#loginGate').hidden=true;$('#accountState').hidden=true;const readOnly=accessStatus==='read-only';$('#readOnlyNotice').hidden=!readOnly;['#addBtn','#quickAdd','#clearExpired'].forEach(s=>$(s).disabled=readOnly);render();
}
$$('.nav').forEach(b=>b.onclick=()=>show(b.dataset.view));$$('[data-go]').forEach(b=>b.onclick=()=>show(b.dataset.go));$('#addBtn').onclick=$('#quickAdd').onclick=()=>openDialog();$('#closeDialog').onclick=$('#cancelDialog').onclick=()=>closeDialog();$('#search').oninput=$('#filter').onchange=renderTable;
$('#productForm').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;const d=new FormData(form);const rawExpiry=d.get('expiry').toString().trim();const payload={name:d.get('name').toString().trim(),category:d.get('category').toString().trim(),quantity:+d.get('quantity'),unit:d.get('unit').toString().trim(),expiry:rawExpiry,supplier:d.get('supplier').toString().trim()};if(!payload.name){toast('Please enter a product name.');return;}if(Number.isNaN(payload.quantity)||payload.quantity<0){toast('Quantity must be 0 or more.');return;}if(!rawExpiry){toast('Please choose an expiry date before saving.');return;}const expiryDate=new Date(rawExpiry+'T00:00:00');if(Number.isNaN(expiryDate.getTime())){toast('Please choose a valid expiry date.');return;}try{if(editingId){await saveItem(payload,'PUT',editingId);toast('Stock item updated');}else{await saveItem(payload);toast('Stock item added');}editingId=null;await loadItems();form.reset();closeDialog();show('inventory');}catch(err){toast(err.message||'Unable to save item');}};
document.addEventListener('click',async e=>{const editId=e.target.dataset.edit;if(editId){const item=items.find(x=>String(x.id)===String(editId));if(item)openDialog(item);return;}const deleteId=e.target.dataset.delete;if(deleteId){try{await deleteItem(String(deleteId));await loadItems();toast('Item removed');}catch(err){toast(err.message||'Unable to delete item');}}});$('#clearExpired').onclick=async ()=>{const count=items.filter(x=>status(x).key==='expired').length;if(count&&confirm(`Remove ${count} expired item${count===1?'':'s'}?`)){for(const item of items.filter(x=>status(x).key==='expired')){await deleteItem(item.id);}await loadItems();toast('Expired stock cleared')}};
$('#exportBtn').onclick=exportCsv;$('#stateExport').onclick=exportCsv;$('#stateSignOut').onclick=()=>firebaseAuth.signOut();
$('#userLogin').onsubmit=async e=>{e.preventDefault();$('#loginError').textContent='';e.submitter.disabled=true;try{await firebaseAuth.signInWithEmailAndPassword(e.currentTarget.email.value,e.currentTarget.password.value);}catch(err){$('#loginError').textContent='Sign-in failed. Check your details and try again.';}finally{e.submitter.disabled=false}};
if(initStorage()){firebaseAuth.onAuthStateChanged(user=>{if(user)startAuthenticatedApp(user).catch(err=>showState('Unable to open StockGuard',err.message));else{$('.app-shell').hidden=true;$('#accountState').hidden=true;$('#loginGate').hidden=false;}});}else{showState('Setup required','Secure Firebase authentication is not configured for this deployment.');}
