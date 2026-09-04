import { describe,expect,it } from 'vitest';
import { discountValues,fefoBatches,recommendedDiscount } from './inventory';
import type { Batch } from './types';
const batch=(id:string,expiryDate:string):Batch=>({id,businessId:'b',productId:'p',batchNumber:id,quantity:1,dateReceived:null,expiryDate,branchId:null,costPrice:1,sellingPrice:2,createdBy:'u'});
describe('inventory rules',()=>{it('uses first-expired-first-out',()=>expect(fefoBatches([batch('late','2027-01-01'),batch('first','2026-01-01')])[0]?.id).toBe('first'));it('never recommends discount for expired stock',()=>expect(recommendedDiscount(-1)).toBe(0));it('calculates discount values',()=>expect(discountValues(100,2,20)).toEqual({newPrice:80,expectedRevenue:160,potentialLossPrevented:160}))});
