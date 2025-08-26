// assets/scripts/store/PurchaseModal.ts
import {
  _decorator, Component, Node, Label, Sprite, SpriteFrame, Button,
  UIOpacity, tween, easing, v3, resources, Widget, UITransform, Size
} from 'cc';
import { StoreState } from './StoreState';
import { CatalogItem } from './types';
const { ccclass, property } = _decorator;

@ccclass('PurchaseModal')
export class PurchaseModal extends Component {
  @property(Node)  panel: Node = null!;

  // 上半部資訊
  @property(Sprite) icon: Sprite = null!;
  @property(Label)  nameLabel: Label = null!;
  @property(Label)  ownedLabel: Label = null!;

  // 中段數量/價格
  @property(Label)  qtyLabel: Label = null!;
  @property(Label)  haveLabel: Label = null!;
  @property(Label)  needLabel: Label = null!;

  // 數量控制
  @property(Button) minBtn: Button = null!;
  @property(Button) minusBtn: Button = null!;
  @property(Button) plusBtn: Button = null!;
  @property(Button) maxBtn: Button = null!;

  // 底部按鈕
  @property(Button) confirmBtn: Button = null!;
  @property(Button) cancelBtn:  Button = null!;
  @property(Button) closeBtn:   Button = null!;   // 右上角 X

  private state!: StoreState;
  private item!: CatalogItem;
  private qty = 1;
  private onConfirm: ((qty:number)=>void) | null = null;

  /** 打開：把狀態&商品塞進來，並套 UI */
  open(state: StoreState, item: CatalogItem, onConfirm: (qty:number)=>void) {
    this.state = state;
    this.item = item;
    this.onConfirm = onConfirm;

    // 名稱 / 已擁有
    if (this.nameLabel)  this.nameLabel.string = item.name ?? '';
    const owned = item.type === 'CONSUMABLE'
      ? state.getCount(item.sku)
      : (state.isOwned(item.sku) ? 1 : 0);
    if (this.ownedLabel) this.ownedLabel.string = `持有數量 ${owned}`;

    // 圖片
    if (this.icon && item.iconKey) {
      resources.load(`icons/${item.iconKey}/spriteFrame`, SpriteFrame, (err, sf) => {
        if (!err && sf) {
          this.icon.spriteFrame = sf;

          // 1) 確保不被九宮格/平鋪影響
          this.icon.type = Sprite.Type.SIMPLE;

          // 2) 不用 CUSTOM，改用 RAW（或 TRIMMED）
          this.icon.sizeMode = Sprite.SizeMode.RAW; // 或 Sprite.SizeMode.TRIMMED

          // 3) 若外層或自己有 Widget 在拉伸，先關掉四邊同時對齊
          const widget = this.icon.getComponent(Widget);
          if (widget) {
            widget.isAlignLeft = widget.isAlignRight = false;
            widget.isAlignTop = widget.isAlignBottom = false;
          }

          // 4) 如需把圖塞進一個最大方框，請「等比」縮放 contentSize
          const ui = this.icon.getComponent(UITransform)!;
          const rawW = sf.getRect().width;
          const rawH = sf.getRect().height;

          // 設定你要塞進去的最大框（例：120x120）
          const maxW = 120, maxH = 120;
          const scale = Math.min(maxW / rawW, maxH / rawH, 1); // 不放大，只縮小
          ui.setContentSize(new Size(Math.round(rawW * scale), Math.round(rawH * scale)));
        }
      });
    }

    // 初始數量
    this.qty = 1;
    this.refresh();

    // 進場動畫
    const op = this.panel.getComponent(UIOpacity) ?? this.panel.addComponent(UIOpacity);
    op.opacity = 0;
    this.panel.setScale(0.95, 0.95, 1);
    this.node.active = true;
    tween(op).to(0.14, { opacity: 255 }, { easing: easing.quadOut }).start();
    tween(this.panel).to(0.14, { scale: v3(1, 1, 1) }, { easing: easing.quadOut }).start();
  }

  // ===== 內部邏輯 =====
  private unitPrice(): number { return this.item.priceSoft?.amount ?? 0; }

  /** 能買到的最大數量（消耗品） */
  private maxAffordable(): number {
    if (this.item.type !== 'CONSUMABLE') return 1;
    const price = Math.max(1, this.unitPrice());
    const wallet = this.state.wallet.DRAGONBONE;
    return Math.max(0, Math.min(999, Math.floor(wallet / price)));
  }

  /** 依目前數量刷新 UI 與可按狀態 */
  private refresh(): void {
    const have = this.state.wallet.DRAGONBONE;
    const price = this.unitPrice();
    const need  = price * this.qty;

    if (this.qtyLabel)  this.qtyLabel.string  = String(this.qty);
    if (this.haveLabel) this.haveLabel.string = have.toString();
    if (this.needLabel) this.needLabel.string = need.toString();

    const isNCBlocked = this.item.type !== 'CONSUMABLE' && this.state.isOwned(this.item.sku);
    const maxQ = this.maxAffordable() || 1;

    if (this.minBtn)   this.minBtn.interactable   = this.qty > 1;
    if (this.minusBtn) this.minusBtn.interactable = this.qty > 1;
    if (this.plusBtn)  this.plusBtn.interactable  = this.qty < maxQ;
    if (this.maxBtn)   this.maxBtn.interactable   = this.qty < maxQ;

    const canConfirm = !isNCBlocked && have >= need && this.qty >= 1;
    if (this.confirmBtn) this.confirmBtn.interactable = canConfirm;
  }

  // ===== Button Handlers =====
  onMin(): void { this.qty = 1; this.refresh(); }
  onDec(): void { if (this.qty > 1) { this.qty--; this.refresh(); } }
  onInc(): void { const m = this.maxAffordable() || 1; if (this.qty < m) { this.qty++; this.refresh(); } }
  onMax(): void { const m = this.maxAffordable() || 1; this.qty = Math.max(1, m); this.refresh(); }

  onClickConfirm(): void { this.onConfirm?.(this.qty); this.hide(); }
  onClickCancel(): void { this.hide(); }
  onClickClose(): void  { this.hide(); }
  onClickBackdrop(): void { this.hide(); } // 想點遮罩也能關，就把 Mask 的 Button 綁這個

  /** 退場 */
  hide(): void {
    const op = this.panel.getComponent(UIOpacity) ?? this.panel.addComponent(UIOpacity);
    tween(op).to(0.1, { opacity: 0 }).start();
    tween(this.panel).to(0.1, { scale: v3(0.96, 0.96, 1) })
      .call(() => { this.node.active = false; })
      .start();
  }
}
