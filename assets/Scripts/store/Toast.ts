// assets/scripts/ui/Toast.ts
import { _decorator, Component, Label, UIOpacity, tween, v3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Toast')
export class Toast extends Component {
  @property(Label) label: Label = null!;

  onLoad() {
    const op = this.getComponent(UIOpacity) ?? this.addComponent(UIOpacity);
    op.opacity = 0;
    this.node.active = false;
  }

  show(text: string, duration = 1.6) {
    const op = this.getComponent(UIOpacity) ?? this.addComponent(UIOpacity);
    const lab = this.label ?? this.getComponentInChildren(Label);
    if (!lab) { console.warn('Toast: label not bound'); return; }

    lab.string = text;
    this.node.active = true;
    this.node.setSiblingIndex(9999); // 拉最上層避免被蓋
    op.opacity = 0;
    this.node.setPosition(0, -20, 0);

    tween(op).to(0.15, { opacity: 255 })
      .delay(duration).to(0.15, { opacity: 0 })
      .call(() => this.node.active = false).start();
    tween(this.node).to(0.15, { position: v3(0, 0, 0) })
      .delay(duration).to(0.15, { position: v3(0, 10, 0) }).start();
  }
}
