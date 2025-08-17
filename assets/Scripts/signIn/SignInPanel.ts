import { _decorator, Component, Node, Button, Sprite, Color } from 'cc';
import { DataManager } from '../DataManager';
const { ccclass, property } = _decorator;

@ccclass('SignInPanel')
export class SignInPanel extends Component {
    // 兩個子面板
    @property(Node) weeklyPanel: Node = null!;
    @property(Node) monthlyPanel: Node = null!;

    // 分頁按鈕
    @property(Button) weeklyTabBtn: Button = null!;
    @property(Button) monthlyTabBtn: Button = null!;

    // 關閉按鈕
    @property(Button) closeBtn: Button = null!;

    async start() {
        // 綁定按鈕事件
        this.weeklyTabBtn?.node.on(Button.EventType.CLICK, this.showWeekly, this);
        this.monthlyTabBtn?.node.on(Button.EventType.CLICK, this.showMonthly, this);
        this.closeBtn?.node.on(Button.EventType.CLICK, this.closePanel, this);

        // 預設顯示週簽到
        this.showWeekly();

        // 依今日簽到狀態決定是否顯示面板與預設頁籤
        await this.checkIfShouldShow();
    }

    /** 依據今日的簽到狀態，決定是否顯示面板與預設頁籤 */
    async checkIfShouldShow() {
        await DataManager.ready?.catch(() => { });
        const playerData = await DataManager.getPlayerDataCached();

        if (!playerData || !playerData.signInData) {
            console.warn('[簽到面板] 尚未取得玩家資料，先隱藏面板');
            this.node.active = false;
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        const weeklySigned = playerData.signInData.weekly?.lastSignDate === today;
        const monthlySigned = playerData.signInData.monthly?.lastSignDate === today;

        if (!weeklySigned) {
            this.node.active = true;
            this.showWeekly();
            console.log('[簽到面板] 今日週尚未簽到 -> 顯示週簽到');
        } else if (!monthlySigned) {
            this.node.active = true;
            this.showMonthly();
            console.log('[簽到面板] 今日週已簽到但月未簽到 -> 自動切到月簽到');
        } else {
            this.node.active = false;
            console.log('[簽到面板] 週與月皆已簽到 -> 關閉面板');
        }
    }

    /** 顯示週簽到 */
    showWeekly() {
        this.weeklyPanel.active = true;
        this.monthlyPanel.active = false;
        this.updateTabVisual();
    }

    /** 顯示月簽到 */
    showMonthly() {
        this.weeklyPanel.active = false;
        this.monthlyPanel.active = true;
        this.updateTabVisual();
    }

    /** 更新分頁按鈕的顏色（白=選中、灰=未選） */
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

    /** 關閉面板 */
    closePanel() {
        this.node.active = false;
    }

    /** 手動開啟（預設切到週） */
    openPanel() {
        this.node.active = true;
        this.showWeekly();  // 預設顯示週簽到
        console.log('[簽到面板] 手動開啟');
    }


    public async onWeeklySignInDone() {
        try {
            this.showMonthly();
            console.log('[簽到面板] 週簽到完成 -> 自動切換到月簽到');
        } catch (e) {
            console.warn('[簽到面板] 週簽到完成後切換月簽到失敗：', e);
        }
    }
}
