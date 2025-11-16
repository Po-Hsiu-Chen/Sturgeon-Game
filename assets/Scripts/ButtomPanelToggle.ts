import {
  _decorator,
  Component,
  Node,
  Button,
  EventTouch,
} from "cc";
const { ccclass, property } = _decorator;

@ccclass("ButtomPanelToggle")
export class ButtomPanelToggle extends Component {
  /** 這顆按鈕要控制的「小面板」（就是你平常手動勾 active 的那顆） */
  @property(Node)
  panel: Node = null!;

  /** 小面板裡的關閉按鈕（可選） */
  @property(Node)
  closeBtn: Node = null!;

  /** 點背景是否自動關閉（預設 true） */
  @property
  closeOnBackground: boolean = true;

  // 所有實例共用：目前是誰開著
  private static _currentOpen: ButtomPanelToggle | null = null;

  private _isOpen = false;
  private _touchRoot: Node | null = null; // 通常是 Canvas

  onLoad() {
    // 這顆按鈕：切換面板
    this.node.on(Button.EventType.CLICK, this.onClickButton, this);

    // 面板上的 X 按鈕（如果有）
    if (this.closeBtn) {
      this.closeBtn.on(Button.EventType.CLICK, this.onClickClose, this);
    }

    // 一開始只關這個 panel，不動別的東西
    if (this.panel) {
      this.panel.active = false;
    }

    // 在 Canvas 監聽點擊，決定是否關閉
    this._touchRoot = this.node.scene.getChildByName("Canvas") ?? null;
    if (this._touchRoot) {
      this._touchRoot.on(Node.EventType.TOUCH_START, this.onGlobalTouch, this);
    }
  }

  onDestroy() {
    this.node.off(Button.EventType.CLICK, this.onClickButton, this);
    if (this.closeBtn) {
      this.closeBtn.off(Button.EventType.CLICK, this.onClickClose, this);
    }
    if (this._touchRoot) {
      this._touchRoot.off(Node.EventType.TOUCH_START, this.onGlobalTouch, this);
    }

    // 如果我剛好是那個目前開著的，要順便清掉靜態記錄
    if (ButtomPanelToggle._currentOpen === this) {
      ButtomPanelToggle._currentOpen = null;
    }
  }

  // ------------- 事件 -------------

  private onClickButton() {
    this._isOpen ? this.closePanel() : this.openPanel();
  }

  private onClickClose() {
    this.closePanel();
  }

  /** 全畫面點擊（在 Canvas 上監聽） */
  private onGlobalTouch(e: EventTouch) {
    if (!this.closeOnBackground) return;
    if (!this._isOpen) return;
    if (!this.panel) return;

    const target = e.target as Node;

    // 點到這顆按鈕自己或子節點 不關閉
    if (target === this.node || target.isChildOf(this.node)) return;

    // 點到面板本身或子節點 不關閉
    if (target === this.panel || target.isChildOf(this.panel)) return;

    // 其他地方 關閉
    this.closePanel();
  }

  // ------------- 開關 -------------

  private openPanel() {
    if (!this.panel) return;

    // 如果有其他 toggle 的 panel 正在開啟，先關掉它
    if (ButtomPanelToggle._currentOpen && ButtomPanelToggle._currentOpen !== this) {
      ButtomPanelToggle._currentOpen.forceClosePanel();
    }

    this.panel.active = true;
    this._isOpen = true;
    ButtomPanelToggle._currentOpen = this; // 記錄目前開著的是我
  }

  private closePanel() {
    this.forceClosePanel();
  }

  /** 內部用的關閉（給別的實例呼叫，不會互相再觸發） */
  private forceClosePanel() {
    if (!this.panel) return;
    this.panel.active = false;
    this._isOpen = false;

    if (ButtomPanelToggle._currentOpen === this) {
      ButtomPanelToggle._currentOpen = null;
    }
  }
}
