import { Outlet } from 'react-router-dom';
import type { PlatformStatus } from '../platform/usePlatformStatus';
import { usePlatformStatus } from '../platform/usePlatformStatus';

export function FeatureRoute({feature,label}:{feature:keyof PlatformStatus;label:string}){const status=usePlatformStatus();if(status===null)return <main className="empty">Checking feature availability…</main>;if(status[feature]===false)return <main className="empty"><h1>{label} temporarily unavailable</h1><p>This feature has been paused by StockGuard. Your existing data is safe.</p></main>;return <Outlet/>}
