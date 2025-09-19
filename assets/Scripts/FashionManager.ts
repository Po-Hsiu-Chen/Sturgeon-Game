import { _decorator, Component, Node, SpriteFrame } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('FashionManager')
export class FashionManager extends Component {
  private static inst: FashionManager;
  @property([SpriteFrame]) hatFrames: SpriteFrame[] = [];
  private map: Record<string, SpriteFrame> = {};

  onLoad() {
    FashionManager.inst = this;
    const ids = ['acc_bowtie','hat_chef','hat_fedora','acc_sunglass','hat_crown','acc_flower','acc_heart_glass','hat_magic','hat_beret','hat_party'];
    ids.forEach((id, i) => this.map[id] = this.hatFrames[i]);
  }
  static get(id: string) { return this.inst?.map[id] || null; }
}

