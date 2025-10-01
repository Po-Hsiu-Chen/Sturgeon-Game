import { sys, EventTarget } from 'cc';
import { CatalogItem, Wallet } from './types';
import { DataManager, PlayerData } from '../DataManager';


const LS_KEY = 'demo_store_state_v2_drb'; // 換新 key 免干擾舊存檔

type StoreEvt =
  | 'wallet:change'
  | 'owned:change'
  | 'inventory:change'
  | 'category:change'
  | 'catalog:change';

export class StoreState {
  public events = new EventTarget();

  public wallet: Wallet = { DRAGONBONE: 1200 };
  public owned = new Set<string>();
  public inventory = new Map<string, number>();
  public currentCategory = '全部';
  public catalog: CatalogItem[] = [];

  constructor() {
    // 1) 訂閱 DataManager
    DataManager.onChange((p) => this.hydrateFromPlayer(p));
    // 2) 若已有登入，抓一次
    DataManager.getPlayerDataCached().then(p => p && this.hydrateFromPlayer(p));
  }
  private hydrateFromPlayer(p: PlayerData) {
    // 龍骨
    this.wallet.DRAGONBONE = p.dragonBones ?? 0;
    this.events.emit('wallet:change');

    // 擁有（非消耗）
    this.owned = new Set([
      ...(p.fashion?.owned ?? []),
      ...(p.decorationsOwned ?? [])
    ]);
    this.events.emit('owned:change');

    // 消耗品庫存（合併 feeds + items）
    this.inventory.clear();
    const inv = p.inventory || { feeds: { normal: 0, premium: 0 }, items: {} as any };
    this.inventory.set('feed_normal', inv.feeds?.normal ?? 0);
    this.inventory.set('feed_high', inv.feeds?.premium ?? 0);
    this.inventory.set('med_trans', inv.items?.genderPotion ?? 0);
    this.inventory.set('med_change', inv.items?.changePotion ?? 0);
    this.inventory.set('med_cold', inv.items?.coldMedicine ?? 0);
    this.inventory.set('med_lvup', inv.items?.upgradePotion ?? 0);
    this.inventory.set('med_revive', inv.items?.revivePotion ?? 0);
    this.inventory.set('env_brush', inv.items?.brush ?? 0);
    this.inventory.set('env_fan', inv.items?.fan ?? 0);
    this.inventory.set('heater', inv.items?.heater ?? 0);
    this.events.emit('inventory:change');
  }

  setCatalog(items: CatalogItem[]) {
    this.catalog = items.slice();
    this.events.emit('catalog:change');
  }

  setCategory(cat: string) {
    this.currentCategory = cat;
    this.events.emit('category:change');
  }

  canAfford(item: CatalogItem): boolean {
    const p = item.priceSoft;
    if (!p) return false;
    return this.wallet[p.currency] >= p.amount;
  }

  isOwned(sku: string) { return this.owned.has(sku); }
  getCount(sku: string) { return this.inventory.get(sku) ?? 0; }
  // 可買 N 個？
  canAffordQty(item: CatalogItem, qty: number): boolean {
    const p = item.priceSoft; if (!p) return false;
    return this.wallet[p.currency] >= p.amount * Math.max(1, qty);
  }

  // 效率版：一次買多個（只針對 CONSUMABLE）
  async purchaseMany(item: CatalogItem, qty: number): Promise<{ ok: boolean; reason?: string }> {
    qty = Math.max(1, Math.floor(qty));
    if (item.type !== 'CONSUMABLE') return this.purchase(item);

    const p = item.priceSoft;
    if (!p) return { ok: false, reason: 'NO_PRICE' };

    const res = await DataManager.purchase(item.sku, qty, p.amount);

    if ('error' in res) {
      return { ok: false, reason: res.error || 'FAILED' };
    }
    // hydrate 會自動跑（因為 DataManager.emit）
    return { ok: true };
  }

  async purchase(item: CatalogItem): Promise<{ ok: boolean; reason?: string }> {
    const p = item.priceSoft;
    if (!p) return { ok: false, reason: 'NO_PRICE' };

    if (item.type === 'NON_CONSUMABLE' && this.isOwned(item.sku)) {
      return { ok: false, reason: 'ALREADY_OWNED' };
    }

    const res = await DataManager.purchase(item.sku, 1, p.amount);

    if ('error' in res) {
      const r = res.error === 'NOT_ENOUGH' ? 'NOT_ENOUGH' : 'FAILED';
      return { ok: false, reason: r };
    }
    return { ok: true };
  }


  async resetDemo() {
    const p = await DataManager.getPlayerDataCached({ refresh: true });
    if (!p) return;
    p.dragonBones = 1200;
    await DataManager.savePlayerDataWithCache(p);
    // hydrate 會自動同步
  }
}
