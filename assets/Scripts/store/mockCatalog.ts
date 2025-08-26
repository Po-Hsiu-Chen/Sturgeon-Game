import { CatalogItem } from './types';

// 你的頁籤
export const CATEGORIES = ['全部', '藥品', '外觀', '飼料', '環境', '裝飾'];

export const MOCK_CATALOG: CatalogItem[] = [
  { id:'1', sku:'med_trans',  name:'變性藥', type:'CONSUMABLE',    category:'藥品', iconKey:'trans_medicine',  priceSoft:{ currency:'DRAGONBONE', amount:20 } },
  { id:'2', sku:'med_change', name:'整形藥',         type:'CONSUMABLE',    category:'藥品', iconKey:'change',           priceSoft:{ currency:'DRAGONBONE', amount:100 } },
  { id:'3', sku:'med_cold',   name:'感冒藥',  type:'CONSUMABLE',    category:'藥品', iconKey:'cold_medicine',     priceSoft:{ currency:'DRAGONBONE', amount:5 } },
  { id:'4', sku:'med_lvup',  name:'升級藥',          type:'CONSUMABLE',category:'藥品', iconKey:'lv_up',             priceSoft:{ currency:'DRAGONBONE', amount:50 } },
  { id:'5', sku:'med_revive',     name:'復活藥',         type:'CONSUMABLE',    category:'藥品', iconKey:'revive',           priceSoft:{ currency:'DRAGONBONE', amount:50 } },
  { id:'6', sku:'feed_normal',   name:'普通飼料',       type:'CONSUMABLE',    category:'飼料', iconKey:'normal_food',         priceSoft:{ currency:'DRAGONBONE', amount:1 } },
  { id:'7', sku:'feed_high',   name:'高級飼料',       type:'CONSUMABLE',    category:'飼料', iconKey:'high_level_food',         priceSoft:{ currency:'DRAGONBONE', amount:5 } },
  { id:'8', sku:'env_brush',   name:'魚缸刷',       type:'CONSUMABLE',    category:'環境', iconKey:'brush',         priceSoft:{ currency:'DRAGONBONE', amount:10 } },
  { id:'9', sku:'env_fan',   name:'風扇',       type:'CONSUMABLE',    category:'環境', iconKey:'fan',         priceSoft:{ currency:'DRAGONBONE', amount:10 } },
  { id:'10', sku:'heater',   name:'加熱棒',       type:'CONSUMABLE',    category:'環境', iconKey:'hot_bar',         priceSoft:{ currency:'DRAGONBONE', amount:10 } },
  
];
