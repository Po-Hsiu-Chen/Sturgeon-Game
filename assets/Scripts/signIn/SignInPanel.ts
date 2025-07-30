import { _decorator, Component, Node, Button, Sprite, Color } from 'cc';
import { DataManager } from '../DataManager';
const { ccclass, property } = _decorator;

@ccclass('SignInPanel')
export class SignInPanel extends Component {
    @property(Node)
    weeklyPanel: Node = null;

    @property(Node)
    monthlyPanel: Node = null;

    @property(Button)
    weeklyTabBtn: Button = null;

    @property(Button)
    monthlyTabBtn: Button = null;

    @property(Button)
    closeBtn: Button = null;

    async onLoad() {
        this.weeklyTabBtn.node.on(Button.EventType.CLICK, this.showWeekly, this);
        this.monthlyTabBtn.node.on(Button.EventType.CLICK, this.showMonthly, this);
        this.closeBtn.node.on(Button.EventType.CLICK, this.closePanel, this);

        this.showWeekly(); // 預設顯示週簽到

        // 判斷今天是否需要顯示面板
        await this.checkIfShouldShow();
    }

    async checkIfShouldShow() {
        await DataManager.ensureInitialized();
        const playerData = await DataManager.getPlayerData();
        const today = new Date().toISOString().split('T')[0];

        const weeklySigned = playerData.signInData.weekly?.lastSignDate === today;

        if (!weeklySigned) {
            this.node.active = true;
            console.log("[簽到面板] 今日尚未簽到，打開面板 (週簽到為基準)");
        } else {
            this.node.active = false;
            console.log("[簽到面板] 今日已簽到，關閉面板 (週簽到為基準)");
        }
    }

    showWeekly() {
        this.weeklyPanel.active = true;
        this.monthlyPanel.active = false;

        this.updateTabVisual();
    }

    showMonthly() {
        this.weeklyPanel.active = false;
        this.monthlyPanel.active = true;

        this.updateTabVisual();
    }

    updateTabVisual() {
        const weeklySprite = this.weeklyTabBtn.node.getComponent(Sprite);
        const monthlySprite = this.monthlyTabBtn.node.getComponent(Sprite);

        if (weeklySprite && monthlySprite) {
            // 被選到的是白色，未選是淺灰
            weeklySprite.color = this.weeklyPanel.active
                ? new Color(255, 255, 255)
                : new Color(180, 180, 180);

            monthlySprite.color = this.monthlyPanel.active
                ? new Color(255, 255, 255)
                : new Color(180, 180, 180);
        }
    }

    closePanel() {
        this.node.active = false;
    }

    openPanel() {
        this.node.active = true;
        this.showWeekly();  // 預設顯示週簽到
        console.log("[簽到面板] 手動開啟");
    }

}
