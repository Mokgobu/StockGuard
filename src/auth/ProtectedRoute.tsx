import { Navigate,Outlet,useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
export function ProtectedRoute(){const {user,loading}=useAuth();const location=useLocation();if(loading)return <main className="empty">Opening StockGuard…</main>;return user?<Outlet/>:<Navigate to="/auth" replace state={{from:location}}/>}
