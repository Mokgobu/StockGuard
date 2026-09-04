import { Navigate,Route,Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AuthPage } from './pages/AuthPage';
import { DashboardLayout } from './layout/DashboardLayout';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
export function App(){return <Routes><Route path="/auth" element={<AuthPage/>}/><Route element={<ProtectedRoute/>}><Route element={<DashboardLayout/>}><Route index element={<DashboardPage/>}/><Route path="inventory" element={<InventoryPage/>}/>{['alerts','scanner','actions','tasks','reports','team','settings','owner-admin'].map(path=><Route key={path} path={path} element={<PlaceholderPage title={path}/>}/>)}</Route></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes>}
