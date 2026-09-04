import type { Timestamp } from 'firebase/firestore';
export type Role='owner'|'manager'|'employee';
export type AccessStatus='active'|'read-only'|'suspended'|'disabled';
export type SubscriptionStatus='trial'|'active'|'past-due'|'suspended'|'cancelled';
export interface Membership{id:string;businessId:string;userId:string;role:Role;status:'active'|'invited'|'disabled';createdAt?:Timestamp;updatedAt?:Timestamp}
export interface UserProfile{id:string;displayName:string;email:string;phone?:string;termsAcceptedAt?:Timestamp;privacyAcceptedAt?:Timestamp}
export interface Business{id:string;businessId:string;name:string;ownerName:string;type:string;email:string;phone:string;location:string;employeeCount:number;timezone:'Africa/Johannesburg';currency:'ZAR';warningPeriods:{critical:number;urgent:number;expiringSoon:number;watchList:number};discounts:{soon:number;urgent:number;critical:number};createdAt?:Timestamp;updatedAt?:Timestamp}
