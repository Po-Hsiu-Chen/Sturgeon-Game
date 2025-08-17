import { _decorator, Component, Node, Button, input, Input, EventTouch, Vec2, UITransform } from 'cc';
import { playOpenPanelAnim } from './utils/UIUtils';
const { ccclass, property } = _decorator;

@ccclass('ButtomPanelToggle')
export class ButtomPanelToggle extends Component {
    @property(Node) panel: Node = null!;
    @property(Node) closeBtn: Node = null!;   // 如果有獨立關閉按鈕（可選）

    private _isOpen = false;

    onLoad() {
        // 綁定自己按鈕的事件
        this.node.on(Button.EventType.CLICK, this.togglePanel, this);

        if (this.closeBtn) {
            this.closeBtn.on(Button.EventType.CLICK, this.closePanel, this);
        }

        // 點擊背景自動關閉
        input.on(Input.EventType.TOUCH_START, this.onBackgroundTouch, this);

        if (this.panel) {
            this.panel.active = false;
        }
    }

    onDestroy() {
        this.node.off(Button.EventType.CLICK, this.togglePanel, this);
        if (this.closeBtn) {
            this.closeBtn.off(Button.EventType.CLICK, this.closePanel, this);
        }
        input.off(Input.EventType.TOUCH_START, this.onBackgroundTouch, this);
    }

    private togglePanel() {
        if (this._isOpen) this.closePanel();
        else this.openPanel();
    }

    private openPanel() {
        if (!this.panel) return;
        this.panel.active = true; 
        //playOpenPanelAnim(this.panel); // 共用動畫
        this._isOpen = true;
    }

    private closePanel() {
        if (!this.panel) return;
        this.panel.active = false; 
        this._isOpen = false;
    }

    /** 點背景關閉 */
    private onBackgroundTouch(e: EventTouch) {
        if (!this._isOpen) return;
        const touchPos = e.getUILocation();

        if (this.isPointInNode(this.panel, touchPos)) return;
        if (this.isPointInNode(this.node, touchPos)) return; // 按鈕自己也排除
        if (this.closeBtn && this.isPointInNode(this.closeBtn, touchPos)) return;

        this.closePanel();
    }

    /** 判斷觸點是否在某個節點的世界外接矩形內 */
    private isPointInNode(node: Node, uiPos: Vec2): boolean {
        const ui = node.getComponent(UITransform);
        if (!ui) return false;
        const rect = ui.getBoundingBoxToWorld();
        return rect.contains(uiPos);
    }
}
