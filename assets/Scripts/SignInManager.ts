import { _decorator, Component, Node, Sprite, Color, Label, Button, sys } from 'cc';
import { DataManager } from './DataManager';
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
        if (this.playerData.signInData.weekly.lastSignDate !== today) {
            console.log("今日未簽到");
            this.showPanel();
        } else {
            console.log("今日已簽到");
            this.hidePanel(); // 預設收起來
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
            // reset
            this.playerData.signInData.weekly.weekIndex = currentWeek;
            this.playerData.signInData.weekly.daysSigned = [false, false, false, false, false, false, false];
            this.playerData.signInData.weekly.questionsCorrect = [false, false, false, false, false, false, false];
            this.playerData.signInData.weekly.lastSignDate = '';
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

    /** 載入玩家資料 */
    loadPlayerData() {
        const data = localStorage.getItem('playerData');
        this.playerData = data ? JSON.parse(data) : null;
    }

    /** 儲存玩家資料 */
    async savePlayerData() {
        await DataManager.savePlayerData(this.playerData);
    }

    /** 更新 UI 樣式 */
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
                sprite.color = new Color(180, 255, 180); // 淺綠
                label.string = "✔ 已簽";
                break;
            case DayStatus.Today:
                sprite.color = new Color(255, 241, 150); // 黃
                label.string = "今天";
                break;
            case DayStatus.Missed:
                sprite.color = new Color(150, 150, 150); // 灰
                label.string = "未簽";
                break;
            case DayStatus.Future:
                sprite.color = new Color(224, 221, 222); // 淺灰
                label.string = "未來";
                break;
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

        console.log(`簽到成功：+${finalReward} 龍骨，答題${answeredCorrectly ? "✔正確（雙倍）" : "✘錯誤（正常）"}`);
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
