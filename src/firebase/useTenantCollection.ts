import { useEffect,useState } from 'react';
import { collection,onSnapshot,query,where,type DocumentData } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { db } from './client';
export function useTenantCollection<T extends DocumentData>(name:string){const {membership}=useAuth();const [data,setData]=useState<T[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');useEffect(()=>{if(!db||!membership){setLoading(false);return}setLoading(true);return onSnapshot(query(collection(db,name),where('businessId','==',membership.businessId)),snap=>{setData(snap.docs.map(d=>({id:d.id,...d.data()} as unknown as T)));setLoading(false)},err=>{setError(err.message);setLoading(false)})},[name,membership]);return{data,loading,error}}
