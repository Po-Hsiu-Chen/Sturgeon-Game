// 單一貨幣：DradenBone
export type Currency = 'DRAGONBONE';

export interface Wallet {
  DRAGONBONE: number;
}

export type ProductType = 'CONSUMABLE' | 'NON_CONSUMABLE' | 'BUNDLE';

export interface PriceSoft {
  currency: Currency; // 只會是 'DRADENBONE'
  amount: number;
}

export interface CatalogItem {
  id: string;
  sku: string;
  name: string;
  type: ProductType;
  category: string;          // 分類顯示（例如：全部/藥品/外觀/飼料）
  desc?: string;
  iconKey?: string;          // 對應 assets/resources/icons/<iconKey>.png
  priceSoft?: PriceSoft;     // 本 DEMO 只做虛擬幣
}
