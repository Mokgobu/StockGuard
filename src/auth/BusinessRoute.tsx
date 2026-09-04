import { useEffect,useState } from 'react';
import { collection,doc,getDoc,getDocs,onSnapshot,query,where } from 'firebase/firestore';
import { Navigate,Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { db } from '../firebase/client';
import { usePlatformStatus } from '../platform/usePlatformStatus';
import './account-state.css';

type Access='active'|'read-only'|'suspended'|'disabled';

export function BusinessRoute(){
  const {user,membership,loading}=useAuth(),platform=usePlatformStatus();
  const [access,setAccess]=useState<Access|null>(null);
  useEffect(()=>{if(!db||!membership)return;return onSnapshot(doc(db,'businessAccessControls',membership.businessId),snap=>setAccess(((snap.data()?.accessStatus as string)||'active').replace('_','-') as Access))},[membership]);
  if(loading||membership&&(access===null||platform===null))return <main className="empty">Loading your business...</main>;
  if(!user?.emailVerified)return <Navigate to="/verify-email" replace/>;
  if(!membership)return <Navigate to="/onboarding" replace/>;
  if(platform?.maintenanceMode)return <AccountState title="StockGuard is under maintenance" message={platform.maintenanceMessage||'We are making scheduled improvements. Please check back soon.'} businessId={membership.businessId}/>;
  if(platform?.loginEnabled===false)return <AccountState title="Login temporarily unavailable" message="Platform login has been paused. Your data remains protected." businessId={membership.businessId}/>;
  if(access==='suspended')return <AccountState title="Account suspended" message="You can sign in and download your account data, but inventory-management features are blocked until StockGuard restores access." businessId={membership.businessId}/>;
  if(access==='disabled')return <AccountState title="Business access disabled" message="Contact StockGuard support. No business data has been deleted."/>;
  return <>{access==='read-only'&&<div className="account-banner">Read-only mode: viewing and exports remain available; changes are blocked.</div>}<Outlet/></>;
}

function AccountState({title,message,businessId}:{title:string;message:string;businessId?:string}){
  const {logout}=useAuth();
  const [exporting,setExporting]=useState(false);
  async function exportData(){
    if(!db||!businessId)return;
    setExporting(true);
    try{
      const data:Record<string,unknown>={};
      for(const name of ['products','batches','stockActions','tasks','promotions']){
        const snap=await getDocs(query(collection(db,name),where('businessId','==',businessId)));
        data[name]=snap.docs.map(item=>({id:item.id,...item.data()}));
      }
      for(const name of ['businesses','businessAccessControls','subscriptions']){
        try{
          const snap=await getDoc(doc(db,name,businessId));
          data[name]=snap.exists()?{id:snap.id,...snap.data()}:null;
        }catch{
          data[name]=null;
        }
      }
      const blob=new Blob([JSON.stringify({businessId,exportedAt:new Date().toISOString(),data},null,2)],{type:'application/json'});
      const link=document.createElement('a');
      link.href=URL.createObjectURL(blob);
      link.download=`stockguard-account-export-${businessId}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    }finally{setExporting(false)}
  }
  return <main className="auth-page"><section className="auth-brand"><span className="brand-mark">SG</span><h1>{title}</h1><p>SMART INVENTORY &amp; EXPIRY MANAGEMENT.</p></section><section className="auth-panel"><div className="auth-card"><h2>{title}</h2><p>{message}</p><div className="auth-actions">{businessId&&<button className="button" disabled={exporting} onClick={exportData}>{exporting?'Preparing export...':'Download account export'}</button>}<button className="button secondary" onClick={logout}>Sign out</button></div></div></section></main>;
}
