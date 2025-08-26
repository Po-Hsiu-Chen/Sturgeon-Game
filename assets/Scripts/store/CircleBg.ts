// CircleBg.ts  掛在 MinusBtn/PlusBtn 上
import { _decorator, Component, Graphics, Color, UITransform } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CircleBg')
export class CircleBg extends Component {
  @property(Color) fill = new Color(255,255,255,255);
  onEnable() {
    const g = this.getComponent(Graphics) ?? this.addComponent(Graphics);
    const ui = this.getComponent(UITransform)!;
    const r = Math.min(ui.width, ui.height) / 2;
    g.clear(); g.fillColor = this.fill;
    g.circle(ui.width/2, ui.height/2, r);
    g.fill();
  }
}
