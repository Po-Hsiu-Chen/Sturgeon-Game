import { _decorator, Component, Node, Sprite, Color, Label, Button, sys, Prefab, SpriteFrame, instantiate, UITransform } from 'cc';
import { DataManager } from '../DataManager';
import { RewardPopup } from '../RewardPopup';
import { QuizPanel } from '../quiz/QuizPanel';
import { SignInPanel } from './SignInPanel';
import { getRandomItem, getTodayIndex, getWeekStartKey } from '../utils/utils';
const { ccclass, property } = _decorator;

enum DayStatus {
    Missed,
    Today,
    Future,
    Signed
}

@ccclass('WeeklySignInManager')
export class WeeklySignInManager extends Component {

    @property(SignInPanel) signInPanel: SignInPanel = null!;

    // 7 簽到格子
    @property(Sprite) dayBgSprites: Sprite[] = [];
    @property(Label) dayLabels: Label[] = [];

    // UI References
    @property(Button) claimButton: Button = null!;
    @property(Label) signInHintLabel: Label = null!;

    // 彈出獎勵 Prefab
    @property(Prefab) rewardPopupPrefab: Prefab = null!;
    @property(Prefab) quizPanelPrefab: Prefab = null!;

    // SpriteFrames
    @property(SpriteFrame) dragonBoneSpriteFrame: SpriteFrame = null!;
    @property(SpriteFrame) premiumFeedSpriteFrame: SpriteFrame = null!;
    @property(SpriteFrame) defaultSpriteFrame: SpriteFrame = null!;

    private todayIndex: number = 0;
    private playerData: any;

    async start() {
        await DataManager.ready?.catch(() => { });
        this.playerData = await DataManager.getPlayerDataCached();

        if (!this.playerData || !this.playerData.signInData) {
            console.warn('[WeeklySignIn] 尚未取得玩家資料，停用本元件初始化');
            return;
        }

        this.handleWeekReset();
        this.todayIndex = getTodayIndex();
        this.updateSignInUI();
        this.claimButton.node.on('click', this.onClaimButtonClick, this);

        // 是否已簽到
        const today = new Date().toISOString().split('T')[0];

        if (this.playerData.signInData.weekly.lastSignDate === today) {
            this.claimButton.interactable = false; // 禁用按鈕
            this.signInHintLabel.string = "今日已簽到";
        } else {
            this.claimButton.interactable = true; // 啟用按鈕
            this.signInHintLabel.string = "答題簽到";
        }
    }

    /** 判斷當週是否要重置簽到狀態 */
    async handleWeekReset() {
        const currentWeekKey = getWeekStartKey();
        const weekly = this.playerData.signInData.weekly || {};
        const storedWeekKey: string | undefined = weekly.weekKey;

        console.log("本週週鍵 =", currentWeekKey);
        console.log("玩家資料週鍵 =", storedWeekKey);

        if (storedWeekKey !== currentWeekKey) {
            console.log('新的一週開始，重置週簽到資料');
            this.playerData.signInData.weekly = {
                weekKey: currentWeekKey, // 用週一日期當鍵
                daysSigned: [false, false, false, false, false, false, false],
                questionsCorrect: [false, false, false, false, false, false, false],
                lastSignDate: ''
            };
            await DataManager.savePlayerDataWithCache(this.playerData);
        }
    }

    /** 更新 7 格簽到 UI（顏色與文字 */
    updateSignInUI() {
        for (let i = 0; i < this.dayBgSprites.length; i++) {
            const sprite = this.dayBgSprites[i];
            const label = this.dayLabels[i];

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

    /** 依 key 取得 icon */
    private getIconSpriteFrame(key: string): SpriteFrame {
        switch (key) {
            case 'dragonbone': return this.dragonBoneSpriteFrame;
            case 'premium_feed': return this.premiumFeedSpriteFrame;
            default: return this.defaultSpriteFrame;
        }
    }

    /** 週簽到按鈕 → 題目 → 計算獎勵 → 儲存 → 切到月簽到 */
    async onClaimButtonClick() {
        const today = new Date().toISOString().split('T')[0];
        const lastSign = this.playerData.signInData.weekly.lastSignDate;

        if (lastSign === today) {
            console.log("今天已簽到");
            return;
        }

        // 顯示答題（隨機一題）
        const questions = await DataManager.getQuizQuestions();
        const randomQuestion = getRandomItem(questions);
        const quizNode = instantiate(this.quizPanelPrefab);
        this.node.parent.addChild(quizNode);
        const quiz = quizNode.getComponent(QuizPanel);
        const isCorrect = await quiz.setup(randomQuestion);

        // 寫入週簽到結果
        this.playerData.signInData.weekly.lastSignDate = today;
        this.playerData.signInData.weekly.daysSigned[this.todayIndex] = true;

        // 發獎勵
        let baseReward = 10;
        let finalReward = isCorrect ? baseReward * 2 : baseReward;
        this.playerData.dragonBones += finalReward;

        // 第 7 天（index=6）額外給高級飼料
        if (this.todayIndex === 6) {
            this.playerData.inventory.feeds.premium += 1;
            console.log("今日為第七天，發送一包高級飼料！");
        }

        // 彈窗顯示獎勵
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
        const popup = instantiate(this.rewardPopupPrefab);
        popup.getComponent(RewardPopup).showRewards(rewards);
        this.node.getComponent(UITransform).node.parent!.addChild(popup);

        // 儲存 + 更新 UI + 鎖按鈕
        await DataManager.savePlayerDataWithCache(this.playerData);
        this.updateSignInUI();
        this.claimButton.interactable = false;

        // 切換至月簽到
        this.signInPanel?.onWeeklySignInDone();
    }
}
