import { _decorator, Component, Node, UITransform, UIOpacity, tween, Tween, Vec3, EventTouch, input, Input, Vec2 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ExpandMenu')
export class ExpandMenu extends Component {
  @property(Node) panel: Node = null!;
  @property(Node) content: Node = null!;
  @property(Node) toggleBtn: Node = null!;

  private _isOpen = false;
  private _isAnimating = false;
  private _openTween?: Tween<Node>;
  private _closeTween?: Tween<Node>;

  onLoad () {
    this.initPanelState(false);
    this.toggleBtn.on(Node.EventType.TOUCH_END, this.onToggle, this);
    input.on(Input.EventType.TOUCH_START, this.onBackgroundTouch, this);
  }

  onDestroy () {
    this.toggleBtn.off(Node.EventType.TOUCH_END, this.onToggle, this);
    input.off(Input.EventType.TOUCH_START, this.onBackgroundTouch, this);
    this._openTween?.stop();
    this._closeTween?.stop();
  }

  /** 初始化 panel 外觀  */
  private initPanelState (visible: boolean) {
    const opacity = this.panel.getComponent(UIOpacity) ?? this.panel.addComponent(UIOpacity);
    if (visible) {
      this.panel.active = true;
      this.panel.scale = new Vec3(1, 1, 1);
      opacity.opacity = 255;
    } else {
      this.panel.active = false;
      this.panel.scale = new Vec3(0.8, 0.8, 0.8);
      opacity.opacity = 0;
    }
  }

  /** 切換 */
  private onToggle () {
    if (this._isAnimating) return;
    if (this._isOpen) this.close();
    else this.open();   // ← 不再用 openAtButton()
  }

  /** 打開（不改變位置） */
  private open () {
    // 不動位置：沿用你在場景/Prefab 已經設好的 panel 座標與錨點
    const opacity = this.panel.getComponent(UIOpacity)!;

    this.panel.active = true;
    this.panel.scale = new Vec3(0.8, 0.8, 0.8);
    opacity.opacity = 0;

    this._closeTween?.stop();
    this._isAnimating = true;

    this._openTween = tween(this.panel)
      .parallel(
        tween(this.panel).to(0.15, { scale: new Vec3(1.02, 1.02, 1.02) }),
        tween(opacity).to(0.15, { opacity: 255 })
      )
      .to(0.08, { scale: new Vec3(1, 1, 1) })
      .call(() => {
        this._isAnimating = false;
        this._isOpen = true;
      })
      .start();
  }

  /** 關閉（反向動畫） */
  private close () {
    const opacity = this.panel.getComponent(UIOpacity)!;

    this._openTween?.stop();
    this._isAnimating = true;

    this._closeTween = tween(this.panel)
      .to(0.12, { scale: new Vec3(0.92, 0.92, 0.92) })
      .parallel(
        tween(this.panel).to(0.12, { scale: new Vec3(0.8, 0.8, 0.8) }),
        tween(opacity).to(0.12, { opacity: 0 })
      )
      .call(() => {
        this.panel.active = false;
        this._isAnimating = false;
        this._isOpen = false;
      })
      .start();
  }

  /** 點背景（非 panel 範圍）時關閉 */
  private onBackgroundTouch (e: EventTouch) {
    if (!this._isOpen || this._isAnimating) return;

    const touchPos = e.getUILocation();

    if (this.isPointInNode(this.panel, touchPos)) return;
    if (this.isPointInNode(this.toggleBtn, touchPos)) return;

    this.close();
  }

  /** 判斷觸點是否在某個節點的世界外接矩形內 */
  private isPointInNode (node: Node, uiPos: Vec2): boolean {
    const ui = node.getComponent(UITransform);
    if (!ui) return false;
    const rect = ui.getBoundingBoxToWorld();
    return rect.contains(uiPos);
  }
}
