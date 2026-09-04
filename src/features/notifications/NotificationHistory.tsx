import { useEffect,useState } from 'react';
import { collection,doc,onSnapshot,query,serverTimestamp,updateDoc,where,type Timestamp } from 'firebase/firestore';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../firebase/client';
import './notifications.css';
type Notice={id:string;title:string;message:string;readAt:Timestamp|null;createdAt?:Timestamp};
export function NotificationHistory(){const {user}=useAuth();const [notices,setNotices]=useState<Notice[]>([]);useEffect(()=>{if(!db||!user)return;return onSnapshot(query(collection(db,'notifications'),where('userId','==',user.uid)),snap=>setNotices(snap.docs.map(d=>({id:d.id,...d.data()} as Notice)).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))))},[user]);return <section className="panel"><div className="panel-head"><div><h2>Notification history</h2><p>{notices.filter(n=>!n.readAt).length} unread</p></div></div>{notices.length?notices.map(n=><button className={`notice ${n.readAt?'':'unread'}`} key={n.id} onClick={()=>db&&updateDoc(doc(db,'notifications',n.id),{readAt:serverTimestamp(),updatedAt:serverTimestamp()})}><b>{n.title}</b><span>{n.message}</span></button>):<div className="empty">No notifications yet.</div>}</section>}
