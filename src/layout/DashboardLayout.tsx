import { Bell,ChartNoAxesColumn,ClipboardCheck,House,Image,LogOut,PackageSearch,ScanLine,Settings,ShieldCheck,Tags,Users } from 'lucide-react';
import { NavLink,Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { MigrationAssistant } from '../features/migration/MigrationAssistant';
import { useOnlineStatus } from '../shared/useOnlineStatus';

const links=[['/',House,'Overview'],['/inventory',PackageSearch,'Inventory'],['/alerts',Bell,'Expiry alerts'],['/scanner',ScanLine,'Scanner'],['/actions',Tags,'Action centre'],['/signage',Image,'Signage'],['/tasks',ClipboardCheck,'Tasks'],['/reports',ChartNoAxesColumn,'Reports'],['/team',Users,'Team'],['/settings',Settings,'Settings']] as const;
const ownerLink=['/owner-admin',ShieldCheck,'Platform admin'] as const;

function Navigation({mobile=false,owner=false}:{mobile?:boolean;owner?:boolean}){
  const all=owner?[...links,ownerLink]:links,shown=mobile?all.slice(0,5):all;
  return <nav className={mobile?'mobile-nav':'nav-list'} aria-label={mobile?'Mobile navigation':'Main navigation'}>{shown.map(([to,Icon,label])=><NavLink key={to} to={to} end={to==='/'} className={({isActive})=>`nav-link${isActive?' active':''}`}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>;
}

export function DashboardLayout(){
  const {user,logout,isSuperAdmin}=useAuth(),online=useOnlineStatus();
  return <div className="shell"><MigrationAssistant/><a href="#main" className="skip-link">Skip to content</a><aside className="sidebar"><NavLink className="brand" to="/"><span className="brand-mark">SG</span><span><strong>StockGuard</strong><small>SMART INVENTORY &amp; EXPIRY MANAGEMENT.</small></span></NavLink><Navigation owner={isSuperAdmin}/><div className="sidebar-footer"><small>{user?.email}</small><button className="nav-link" onClick={logout}><LogOut size={18}/>Sign out</button></div></aside><main id="main" className="main"><Outlet/></main><Navigation mobile owner={isSuperAdmin}/><span className={`online-indicator${online?'':' offline'}`} role="status">{online?'Online':'Offline - drafts protected'}</span></div>;
}
