import { _decorator, Component, Node, Label, Button, EventTouch } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ConfirmDialogManager')
export class ConfirmDialogManager extends Component {
  @property(Node) panel: Node = null!;      
  @property(Node) contentNode: Node = null!; 
  @property(Node) maskNode: Node = null!;     
  @property(Label) messageLabel: Label = null!;
  @property(Button) yesBtn: Button = null!;
  @property(Button) noBtn: Button = null!;

  private _resolver: ((ok: boolean) => void) | null = null;
  private _open = false;

  onLoad() {
    this.panel && (this.panel.active = false);

    // 只綁一次：CLICK 為主、TOUCH_END 備援
    this.yesBtn?.node.on(Button.EventType.CLICK, this._onYes, this);
    this.noBtn?.node.on(Button.EventType.CLICK, this._onNo, this);
    this.yesBtn?.node.on(Node.EventType.TOUCH_END, this._onYesTouch, this);
    this.noBtn?.node.on(Node.EventType.TOUCH_END, this._onNoTouch, this);

    // 遮罩只阻擋背景點擊
    this.maskNode?.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      e.propagationStopped = true;
    }, this);
  }

  // 讓面板/內容位於最上層，避免被遮罩或其他 UI 蓋住
  private _bringToFront() {
    const parent = this.panel?.parent;
    if (parent) this.panel.setSiblingIndex(parent.children.length - 1);
    this.maskNode?.setSiblingIndex(0);
    this.contentNode?.setSiblingIndex(1);
  }

  // 確保按鈕可互動且節點已啟用
  private _ensureInteractable() {
    if (this.yesBtn) this.yesBtn.interactable = true;
    if (this.noBtn)  this.noBtn.interactable = true;
    this.contentNode && (this.contentNode.active = true);
    this.yesBtn?.node && (this.yesBtn.node.active = true);
    this.noBtn?.node  && (this.noBtn.node.active  = true);
  }

  private _onYes() { if (this._resolver) this._resolver(true); this._close(); }
  private _onNo()  { if (this._resolver) this._resolver(false); this._close(); }
  private _onYesTouch() { this._onYes(); }
  private _onNoTouch()  { this._onNo();  }

  /** 顯示確認框，回傳 true=YES / false=NO */
  async ask(message: string): Promise<boolean> {
    // 若已開啟，更新文字並共用同一個 Promise（避免回傳遺失）
    if (this._open) {
      if (this.messageLabel) this.messageLabel.string = message;
      return new Promise<boolean>((resolve) => {
        const prev = this._resolver;
        this._resolver = (ok: boolean) => { prev?.(ok); resolve(ok); };
      });
    }

    this._open = true;
    this._resolver = null;

    if (this.messageLabel) this.messageLabel.string = message;
    this._bringToFront();
    this._ensureInteractable();
    this.panel && (this.panel.active = true);

    return new Promise<boolean>((resolve) => { this._resolver = resolve; });
  }

  private _close() {
    this._open = false;
    this._resolver = null;
    this.panel && (this.panel.active = false);
  }
}
