import { useEffect,useState } from 'react';
import { doc,onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/client';

export type PlatformStatus={maintenanceMode?:boolean;maintenanceMessage?:string;registrationsEnabled?:boolean;loginEnabled?:boolean;inventoryUpdatesEnabled?:boolean;notificationsEnabled?:boolean;reportsEnabled?:boolean;signageEnabled?:boolean};

export function usePlatformStatus(){const [status,setStatus]=useState<PlatformStatus|null>(null);useEffect(()=>{if(!db){setStatus({});return}return onSnapshot(doc(db,'publicPlatformStatus','current'),snapshot=>setStatus(snapshot.exists()?snapshot.data() as PlatformStatus:{}),()=>setStatus({}))},[]);return status}
