import { _decorator, Component, Node, Label, Prefab, instantiate, ScrollView, UIOpacity, tween, Color, Sprite } from 'cc';
import { StoreState } from './StoreState';
import { CATEGORIES, MOCK_CATALOG } from './mockCatalog';
import { CatalogItem } from './types';
import { ItemCard } from './ItemCard';
import { CategoryTab } from './CategoryTab';
import { PurchaseModal } from './PurchaseModal';
import { Toast } from './Toast';

const { ccclass, property } = _decorator;

@ccclass('StoreUI')
export class StoreUI extends Component {
  @property([Node]) categoryButtons: Node[] = [];

  // —— Header（單一貨幣 Label）——
  @property(Label) boneLabel: Label = null!;

  // —— Tabs —— 
  @property(Node) categoryTabs: Node = null!;
  @property(Prefab) categoryTabPrefab: Prefab = null!;

  // —— Grid/List —— 
  @property(ScrollView) itemScroll: ScrollView = null!;
  @property(Node) itemContent: Node = null!;
  @property(Prefab) itemCardPrefab: Prefab = null!;

  // —— Modal（新）——
  @property(PurchaseModal) modal: PurchaseModal = null!;

  @property(Toast) toast: Toast = null!;


  private state = new StoreState();

  onLoad() {
    this.toast?.show('測試', 0.8)
    this.state.setCatalog(MOCK_CATALOG);

    // 先把 modal 關起來保險
    if (this.modal && this.modal.node) this.modal.node.active = false;

    this.renderWallet();
    //this.renderCategories();
    this.setupCategoryButtons();
    this.renderItems();

    this.state.events.on('wallet:change', this.renderWallet, this);
    this.state.events.on('owned:change', this.renderItems, this);
    this.state.events.on('inventory:change', this.renderItems, this);
    this.state.events.on('category:change', () => {
      this.updateCategoryVisuals();
      this.renderItems();
    }, this);
  }

  // 顯示錢包
  private renderWallet = () => {
    const n = this.state.wallet.DRAGONBONE;
    this.boneLabel.string = n.toLocaleString('zh-TW');
  }

  // 價格字串（DRAGONBONE）
  private priceText(item: CatalogItem): string {
    const n = item.priceSoft?.amount ?? 0;
    return `${n.toLocaleString('zh-TW')} `;
  }

  // === 分類按鈕（取代原本 CategoryTab 預置體）===
  private setupCategoryButtons() {
    // 1) 設定每顆按鈕的文字與點擊行為
    for (let i = 0; i < this.categoryButtons.length; i++) {
      const btnNode = this.categoryButtons[i];
      const name = CATEGORIES[i] ?? `分類${i + 1}`;

      // 設文字
      const label = btnNode.getComponent(Label);
      if (label) label.string = name;

      // 移除舊事件（避免重複綁定）
      btnNode.off(Node.EventType.TOUCH_END);

      // 綁定點擊：更新分類
      btnNode.on(Node.EventType.TOUCH_END, () => {
        this.state.setCategory(name);
      }, this);
    }

    // 2) 依目前分類刷新顏色
    this.updateCategoryVisuals();
  }

  // 切換選中/未選中狀態（選中：白色；未選中：灰色）
  private updateCategoryVisuals() {
    const activeCat = this.state.currentCategory;

    for (let i = 0; i < this.categoryButtons.length; i++) {
      const btnNode = this.categoryButtons[i];
      const name = CATEGORIES[i] ?? '';

      // 取得 Frame 子節點
      const frameNode = btnNode.getChildByName("Frame");
      if (!frameNode) continue;

      // 取得 Sprite 元件
      const sprite = frameNode.getComponent(Sprite);
      if (!sprite) continue;

      if (name === activeCat) {
        // 選中 -> 白色
        sprite.color = Color.WHITE;
      } else {
        // 未選中 -> 灰色
        sprite.color = new Color(220, 220, 220, 255);
      }
    }
  }

  // Tabs
  private renderCategories() {
    this.categoryTabs.removeAllChildren();
    for (const name of CATEGORIES) {
      const n = instantiate(this.categoryTabPrefab);
      n.setParent(this.categoryTabs);
      const comp = n.getComponent(CategoryTab)!;
      comp.init(name, picked => this.state.setCategory(picked));
    }
  }

  // 依分類過濾
  private filteredCatalog(): CatalogItem[] {
    const cat = this.state.currentCategory;
    if (cat === '全部') return this.state.catalog;
    return this.state.catalog.filter(i => i.category === cat);
  }

  // 商品列表
  private renderItems = () => {
    this.itemContent.removeAllChildren();
    const list = this.filteredCatalog();
    list.forEach(item => {
      const cardNode = instantiate(this.itemCardPrefab);
      cardNode.setParent(this.itemContent);
      const comp = cardNode.getComponent(ItemCard)!;
      comp.init(item, {
        priceText: this.priceText(item),
        owned: item.type !== 'CONSUMABLE' && this.state.isOwned(item.sku),
        canBuy: this.state.canAfford(item),
        onBuy: (it) => this.openPurchase(it),
      });
    });
    const op = this.itemContent.getComponent(UIOpacity) ?? this.itemContent.addComponent(UIOpacity);
    op.opacity = 0;
    tween(op).to(0.15, { opacity: 255 }).start();
  }

  // 打開彈窗
  private openPurchase(item: CatalogItem) {
    this.modal.open(this.state, item, async (qty) => {
      const res = (item.type === 'CONSUMABLE')
        ? await this.state.purchaseMany(item, qty)
        : await this.state.purchase(item);

      if (res.ok) {
        const qtyText = item.type === 'CONSUMABLE' ? ` ×${qty}` : '';
        this.toast?.show(`購買成功：\n${item.name}${qtyText}`);
      } else {
        const reason = res.reason === 'NOT_ENOUGH' ? '龍骨不足'
          : res.reason === 'ALREADY_OWNED' ? '已擁有'
            : '失敗';
        this.toast?.show(`購買失敗：${reason}`);
      }
    });
  }


  // 測試重置
  onDevReset() { this.state.resetDemo(); this.renderItems(); }
}
