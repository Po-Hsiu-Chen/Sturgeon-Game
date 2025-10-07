import { _decorator, Component, Label, Sprite, SpriteFrame, Node, Button, resources } from 'cc';
import { CatalogItem } from './types';
const { ccclass, property } = _decorator;

@ccclass('ItemCard')
export class ItemCard extends Component {
  @property(Sprite) icon: Sprite = null!;
  @property(Label) nameLabel: Label = null!;
  @property(Label) priceLabel: Label = null!;
  @property(Button) buyBtn: Button = null!;
  @property(Node) ownedBadge: Node = null!;

  private item!: CatalogItem;
  private onBuy: (item: CatalogItem) => void = () => { };

  init(item: CatalogItem, opts: {
    priceText: string;
    owned: boolean;
    canBuy: boolean;
    onBuy: (i: CatalogItem) => void;
  }) {
    this.item = item;
    this.onBuy = opts.onBuy;

    if (this.nameLabel) this.nameLabel.string = item.name ?? '';
    if (this.priceLabel) this.priceLabel.string = opts.priceText ?? '';
    if (this.ownedBadge) this.ownedBadge.active = opts.owned;
    if (this.buyBtn) this.buyBtn.interactable = !opts.owned && opts.canBuy;

    // 載圖
    if (item.iconKey && this.icon) {
      this.loadIconSpriteFrame(item.iconKey, (sf) => {
        if (sf) this.icon.spriteFrame = sf;
      });
    }
  }

  private loadIconSpriteFrame(iconKey: string, cb: (sf: SpriteFrame | null) => void) {
    // 1) 先從 icons/
    resources.load(`icons/${iconKey}/spriteFrame`, SpriteFrame, (err, sf) => {
      if (!err && sf) return cb(sf);

      // 2) 再嘗試 icons/<key>
      resources.load(`icons/${iconKey}`, SpriteFrame, (err2, sf2) => {
        if (!err2 && sf2) return cb(sf2);

        // 3) 背景圖（先 /spriteFrame，再本體）
        resources.load(`backgrounds/${iconKey}/spriteFrame`, SpriteFrame, (e1, sf1) => {
          if (!e1 && sf1) return cb(sf1);
          resources.load(`backgrounds/${iconKey}`, SpriteFrame, (e2, sf2) => {
            cb(e2 ? null : sf2);
          });
        });

      });
    });
  }

  onClickBuy() { this.onBuy(this.item); }
}
