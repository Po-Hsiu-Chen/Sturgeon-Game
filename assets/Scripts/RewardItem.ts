import { _decorator, Component, Label, Node, Sprite, SpriteFrame } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('RewardItem')
export class RewardItem extends Component {
  @property(Sprite) itemSprite: Sprite;
  @property(Label) nameLabel: Label;
  @property(Label) countLabel: Label;

  init(icon: SpriteFrame, name: string, count: number) {
    this.itemSprite.spriteFrame = icon;
    this.nameLabel.string = name;
    this.countLabel.string = `x${count}`;
  }
}
