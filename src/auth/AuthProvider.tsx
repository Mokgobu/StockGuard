import { createContext,useContext,useEffect,useMemo,useState,type ReactNode } from 'react';
import { onAuthStateChanged,signOut,type User } from 'firebase/auth';
import { auth } from '../firebase/client';
type AuthState={user:User|null;loading:boolean;logout:()=>Promise<void>};
const Context=createContext<AuthState>({user:null,loading:true,logout:async()=>{}});
export function AuthProvider({children}:{children:ReactNode}){const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(Boolean(auth));useEffect(()=>auth?onAuthStateChanged(auth,u=>{setUser(u);setLoading(false)}):setLoading(false),[]);const value=useMemo(()=>({user,loading,logout:async()=>{if(auth)await signOut(auth)}}),[user,loading]);return <Context.Provider value={value}>{children}</Context.Provider>}
export const useAuth=()=>useContext(Context);
