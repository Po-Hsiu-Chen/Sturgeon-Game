import { _decorator, Component, Label, Sprite, SpriteFrame, Node, Button, resources } from 'cc';
import { CatalogItem } from './types';
const { ccclass, property } = _decorator;

@ccclass('ItemCard')
export class ItemCard extends Component {
  @property(Sprite) icon: Sprite = null!;
  @property(Label)  nameLabel: Label = null!;
  @property(Label)  priceLabel: Label = null!;
  @property(Button) buyBtn: Button = null!;
  @property(Node)   ownedBadge: Node = null!;

  private item!: CatalogItem;
  private onBuy: (item: CatalogItem) => void = () => {};

  init(item: CatalogItem, opts: {
    priceText: string;
    owned: boolean;
    canBuy: boolean;
    onBuy: (i: CatalogItem) => void;
  }) {
    this.item = item;
    this.onBuy = opts.onBuy;

    if (this.nameLabel)  this.nameLabel.string  = item.name ?? '';
    if (this.priceLabel) this.priceLabel.string = opts.priceText ?? '';
    if (this.ownedBadge) this.ownedBadge.active = opts.owned;
    if (this.buyBtn)     this.buyBtn.interactable = !opts.owned && opts.canBuy;

    // 載圖（放在 assets/resources/icons/<iconKey>.png）
    if (item.iconKey && this.icon) {
      resources.load(`icons/${item.iconKey}/spriteFrame`, SpriteFrame, (err, sf) => {
        if (!err && sf) this.icon.spriteFrame = sf;
      });
    }
  }

  onClickBuy() { this.onBuy(this.item); }
}
