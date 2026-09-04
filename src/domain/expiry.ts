export type ExpiryStatus='expired'|'critical'|'urgent'|'expiring-soon'|'watch-list'|'safe';
export type WarningPeriods={critical:number;urgent:number;expiringSoon:number;watchList:number};
export const defaultWarningPeriods:WarningPeriods={critical:3,urgent:7,expiringSoon:14,watchList:30};
const DATE=/^(\d{4})-(\d{2})-(\d{2})$/;
export function johannesburgDayNumber(value:string){const match=DATE.exec(value);if(!match)throw new Error('Date must use YYYY-MM-DD.');const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);const utc=Date.UTC(year,month-1,day);const check=new Date(utc);if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)throw new Error('Invalid calendar date.');return Math.floor(utc/86400000)}
export function todayInJohannesburg(now=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const value=(type:Intl.DateTimeFormatPartTypes)=>parts.find(x=>x.type===type)?.value??'';return `${value('year')}-${value('month')}-${value('day')}`}
export function daysUntilExpiry(expiry:string,today=todayInJohannesburg()){return johannesburgDayNumber(expiry)-johannesburgDayNumber(today)}
export function classifyExpiry(expiry:string,warning=defaultWarningPeriods,today=todayInJohannesburg()):ExpiryStatus{const days=daysUntilExpiry(expiry,today);if(days<0)return'expired';if(days<=warning.critical)return'critical';if(days<=warning.urgent)return'urgent';if(days<=warning.expiringSoon)return'expiring-soon';if(days<=warning.watchList)return'watch-list';return'safe'}
export const formatZar=(value:number)=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(value);
export const formatDateZA=(value:string)=>{const [year,month,day]=value.split('-');return `${day}/${month}/${year}`};
