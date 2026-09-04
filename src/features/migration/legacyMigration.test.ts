import { describe,expect,it } from 'vitest';
import { parseLegacyInventory } from './legacyMigration';
describe('legacy inventory parser',()=>{it('accepts arrays and wrapped item arrays',()=>{expect(parseLegacyInventory('[{"name":"Milk","quantity":2,"expiry":"2026-10-01"}]')).toHaveLength(1);expect(parseLegacyInventory('{"items":[{"name":"Bread","quantity":3,"expiry":"2026-10-02"}]}')).toHaveLength(1)});it('rejects malformed and negative stock without destroying the source',()=>expect(parseLegacyInventory('[{"name":"Bad","quantity":-1,"expiry":"tomorrow"}]')).toEqual([]))});
