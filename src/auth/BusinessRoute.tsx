import { Navigate,Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
export function BusinessRoute(){const {user,membership,loading}=useAuth();if(loading)return <main className="empty">Loading your business…</main>;if(!user?.emailVerified)return <Navigate to="/verify-email" replace/>;return membership?<Outlet/>:<Navigate to="/onboarding" replace/>}
