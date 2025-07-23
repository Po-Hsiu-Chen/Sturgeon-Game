import { _decorator, Component, Node, Sprite, Color, Label, Button, sys, Prefab, SpriteFrame, instantiate, UITransform } from 'cc';
import { DataManager } from './DataManager';
import { RewardPopup } from './RewardPopup';
const { ccclass, property } = _decorator;

enum DayStatus {
    Missed,
    Today,
    Future,
    Signed
}

@ccclass('SignInManager')
export class SignInManager extends Component {

    @property(Label)
    monthlyCountLabel: Label = null!;

    @property(Sprite)
    dayBgSprites: Sprite[] = [];

    @property(Label)
    dayLabels: Label[] = [];

    @property(Button)
    claimButton: Button = null!;

    @property(Prefab)
    rewardPopupPrefab: Prefab = null!;  

    @property(SpriteFrame)
    dragonBoneIconSpriteFrame: SpriteFrame = null!;

    @property(SpriteFrame)
    premiumFeedIconSpriteFrame: SpriteFrame = null!;

    @property(SpriteFrame)
    defaultIcon: SpriteFrame = null!;

    @property(Label)
    signInHintLabel: Label = null!;


    private todayIndex: number = 0;
    private playerData: any;

    async onLoad() {
        await DataManager.ensureInitialized(); // 確保資料存在
        this.playerData = await DataManager.getPlayerData(); // 讀資料
        this.handleWeekReset();
        this.todayIndex = this.getTodayIndex();
        this.updateSignInUI();
        this.claimButton.node.on('click', this.onClaimButtonClick, this);

        // 如果今天還沒簽到，開啟面板
        const today = new Date().toISOString().split('T')[0];

        if (this.playerData.signInData.weekly.lastSignDate === today) {
            console.log("今日已簽到");
            this.claimButton.interactable = false; // 禁用按鈕
            this.signInHintLabel.string = "今日已簽到";
            this.hidePanel();
        } else {
            console.log("今日未簽到");
            this.claimButton.interactable = true; // 啟用按鈕
            this.signInHintLabel.string = "答題簽到";
            this.showPanel();
        }

    }

    /** 取得今天是週幾（週一 = 0） */
    getTodayIndex(): number {
        const day = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        return (day + 6) % 7; // 轉換為 Mon=0, ..., Sun=6
    }

    /** 判斷當週是否要重置簽到狀態 */
    handleWeekReset() {
        const currentWeek = this.getCurrentWeekIndex();
        const storedWeek = this.playerData.signInData.weekly.weekIndex;

        if (currentWeek !== storedWeek) {
            console.log('新的一週開始，重置週簽到資料');
            this.playerData.signInData.weekly = {
                weekIndex: currentWeek,
                daysSigned: [false, false, false, false, false, false, false],
                questionsCorrect: [false, false, false, false, false, false, false],
                lastSignDate: ''
            };
            this.savePlayerData();
        }
    }

    /** 計算今年第幾週 */
    getCurrentWeekIndex(): number {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), 0, 1);
        const days = Math.floor((now.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24));
        return Math.floor(days / 7);
    }

    /** 儲存玩家資料 */
    async savePlayerData() {
        await DataManager.savePlayerData(this.playerData);
    }

    /** 更新 UI */
    updateSignInUI() {
        for (let i = 0; i < this.dayBgSprites.length; i++) {
            const sprite = this.dayBgSprites[i];
            const label = this.dayLabels[i];
            const signedCount = this.playerData.signInData.monthly.signedDaysCount;
            this.monthlyCountLabel.string = `本月累計簽到第 ${signedCount} 天`;

            let status: DayStatus;

            if (this.playerData.signInData.weekly.daysSigned[i]) {
                status = DayStatus.Signed;
            } else if (i === this.todayIndex) {
                status = DayStatus.Today;
            } else if (i < this.todayIndex) {
                status = DayStatus.Missed;
            } else {
                status = DayStatus.Future;
            }

            this.applyStyle(sprite, label, status);
        }

    }

    applyStyle(sprite: Sprite | null, label: Label | null, status: DayStatus) {
        switch (status) {
            case DayStatus.Signed:
                sprite.color = new Color(180, 255, 180); // 綠
                label.string = "✔ 已簽";
                break;
            case DayStatus.Today:
                sprite.color = new Color(255, 241, 150); // 黃
                label.string = "今天";
                break;
            case DayStatus.Missed:
                sprite.color = new Color(255, 143, 143); // 紅
                label.string = "未簽";
                break;
            case DayStatus.Future:
                sprite.color = new Color(224, 221, 222); // 灰
                label.string = "未來";
                break;
        }
    }

    getIconSpriteFrame(key: string): SpriteFrame {
        // 根據 key 傳出對應 SpriteFrame
        // 你可以自己用 SpriteAtlas 或一張張圖做對應
        switch (key) {
            case 'dragonbone':
                return this.dragonBoneIconSpriteFrame;
            case 'premium_feed':
                return this.premiumFeedIconSpriteFrame;
            default:
                return this.defaultIcon;
        }
    }

    /** 處理簽到按鈕點擊（含答題邏輯） */
    onClaimButtonClick() {
        const today = new Date().toISOString().split('T')[0];
        const lastSign = this.playerData.signInData.weekly.lastSignDate;

        if (lastSign === today) {
            console.log("今天已簽到");
            return;
        }

        // 模擬答題流程（這裡應換成你的問答 UI）
        const answeredCorrectly = Math.random() < 0.5; // 假資料：隨機答對或錯
        const doubleReward = answeredCorrectly;

        // 更新資料
        this.playerData.signInData.weekly.lastSignDate = today;
        this.playerData.signInData.weekly.daysSigned[this.todayIndex] = true;
        this.playerData.signInData.weekly.questionsCorrect[this.todayIndex] = answeredCorrectly;

        // 發獎勵
        let baseReward = 10;
        let finalReward = doubleReward ? baseReward * 2 : baseReward;
        this.playerData.dragonBones += finalReward;

        if (this.todayIndex === 6) {
            // 第七天：送高級飼料
            this.playerData.inventory.feeds.premium += 1;
            console.log("今日為第七天，發送一包高級飼料！");
        }
        
        // 建立要顯示的獎勵資料
        const rewards = [
            { icon: this.getIconSpriteFrame('dragonbone'), name: '龍骨', count: finalReward }
        ];

        if (this.todayIndex === 6) {
            rewards.push({
                icon: this.getIconSpriteFrame('premium_feed'),
                name: '高級飼料',
                count: 1
            });
        }

        // 顯示獎勵彈窗動畫
        const popup = instantiate(this.rewardPopupPrefab);
        popup.getComponent(RewardPopup).showRewards(rewards);
        this.node.getComponent(UITransform).node.parent!.addChild(popup);


        // 月簽到：累積一天
        const now = new Date();
        const thisMonth = now.getMonth() + 1;
        const thisYear = now.getFullYear();
        const monthly = this.playerData.signInData.monthly;

        if (monthly.month !== thisMonth || monthly.year !== thisYear) {
            monthly.month = thisMonth;
            monthly.year = thisYear;
            monthly.signedDaysCount = 1;
        } else if (monthly.signedDaysCount < 28) {
            monthly.signedDaysCount++;
        }

        this.savePlayerData();
        this.updateSignInUI();

        this.claimButton.interactable = false;
        this.signInHintLabel.string = "今日已簽到";
    }

    
    /** 顯示簽到面板 */
    showPanel() {
        this.node.active = true;
    }

    /** 隱藏簽到面板 */
    hidePanel() {
        this.node.active = false;
    }
}
