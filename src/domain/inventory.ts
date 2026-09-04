import type { Batch,Product } from './types';
import { classifyExpiry,daysUntilExpiry,type ExpiryStatus,type WarningPeriods } from './expiry';
export function productQuantity(productId:string,batches:Batch[]){return batches.filter(b=>b.productId===productId).reduce((sum,b)=>sum+b.quantity,0)}
export function fefoBatches(batches:Batch[]){return [...batches].filter(b=>b.quantity>0).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate))}
export function productExpiry(product:Product,batches:Batch[],warning?:WarningPeriods):ExpiryStatus|undefined{const first=fefoBatches(batches.filter(b=>b.productId===product.id))[0];return first?classifyExpiry(first.expiryDate,warning):undefined}
export function recommendedDiscount(days:number,discounts={soon:10,urgent:20,critical:30}){if(days<1)return 0;if(days<=3)return discounts.critical;if(days<=7)return discounts.urgent;if(days<=14)return discounts.soon;return 0}
export function discountValues(price:number,quantity:number,percent:number){const newPrice=Math.round(price*(1-percent/100)*100)/100;return{newPrice,expectedRevenue:newPrice*quantity,potentialLossPrevented:newPrice*quantity}}
export function isExpiredBatch(batch:Batch,today?:string){return daysUntilExpiry(batch.expiryDate,today)<0}
