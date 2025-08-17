import { _decorator, Component, Node, Label, Button, Prefab, SpriteFrame, instantiate, UITransform } from 'cc';
import { DataManager } from '../DataManager';
import { RewardPopup } from '../RewardPopup';
import { tween, Vec3 } from 'cc';
import { getRandomItem } from '../utils/utils';
const { ccclass, property } = _decorator;

@ccclass('MonthlySignInManager')
export class MonthlySignInManager extends Component {

    // UI References
    @property(Node) daysGrid: Node = null!;
    @property(Label) monthlyCountLabel: Label = null!;
    @property(Button) claimButton: Button = null!;
    @property(Label) signInHintLabel: Label = null!;
    @property(Prefab) rewardPopupPrefab: Prefab = null!;
    @property(Node) flyingStampNode: Node = null!;

    // SpriteFrames
    @property(SpriteFrame) normalFeedSpriteFrame: SpriteFrame = null!;
    @property(SpriteFrame) premiumFeedSpriteFrame: SpriteFrame = null!;
    @property(SpriteFrame) fanSpriteFrame: SpriteFrame = null!;
    @property(SpriteFrame) heaterSpriteFrame: SpriteFrame = null!;
    @property(SpriteFrame) brushSpriteFrame: SpriteFrame = null!;
    @property(SpriteFrame) defaultSpriteFrame: SpriteFrame = null!;

    private dayLabels: Label[] = [];
    private dayStampNodes: Node[] = [];
    private playerData: any;

    async start() {
        await DataManager.ready?.catch(() => { });
        this.playerData = await DataManager.getPlayerDataCached();

        if (!this.playerData || !this.playerData.signInData) {
            console.warn('[MonthlySignIn] 尚未取得玩家資料，停用本元件初始化');
            return;
        }

        this.initDayNodes();

        const now = new Date();
        const thisMonth = now.getMonth() + 1;
        const thisYear = now.getFullYear();
        const todayString = now.toISOString().split('T')[0];

        const monthly = this.playerData.signInData.monthly;

        // 若月份不同則重置
        if (monthly.month !== thisMonth || monthly.year !== thisYear) {
            monthly.month = thisMonth;
            monthly.year = thisYear;
            monthly.signedDaysCount = 0;
            monthly.lastSignDate = '';
        }

        this.updateSignInUI();

        const todaySigned = monthly.lastSignDate === todayString;
        const fullySigned = monthly.signedDaysCount >= this.dayStampNodes.length;

        this.claimButton.interactable = !todaySigned && !fullySigned;
        this.signInHintLabel.string = fullySigned
            ? "本月已完成簽到"
            : (todaySigned ? "今日已簽到" : "點擊簽到");

        this.claimButton.node.on('click', this.onClaimButtonClick, this);
    }

    initDayNodes() {
        this.dayLabels = [];
        this.dayStampNodes = [];

        for (let i = 0; i < this.daysGrid.children.length; i++) {
            const dayNode = this.daysGrid.children[i];
            const labelNode = dayNode.getChildByName('Status');
            const stampNode = dayNode.getChildByName('Stamp');

            if (labelNode && stampNode) {
                const label = labelNode.getComponent(Label);
                if (label) {
                    this.dayLabels.push(label);
                    this.dayStampNodes.push(stampNode);
                }
            }
        }
    }

    updateSignInUI() {
        const monthly = this.playerData.signInData.monthly;
        this.monthlyCountLabel.string = `本月累計簽到第 ${monthly.signedDaysCount} 天`;
        for (let i = 0; i < this.dayLabels.length; i++) {
            const label = this.dayLabels[i];
            const stamp = this.dayStampNodes[i];

            label.string = `${i + 1}`;

            if (i < monthly.signedDaysCount) {
                stamp.active = true;
            } else {
                stamp.active = false; // 最後一格延後動畫蓋
            }
        }

    }

    addInventoryItem(key: string, count: number) {
        const inv = this.playerData.inventory;

        // 飼料類（feeds）
        if (key === 'normalFeed') {
            inv.feeds.normal += count;
        } else if (key === 'premiumFeed') {
            inv.feeds.premium += count;

            // 道具類（items）
        } else if (key in inv.items) {
            inv.items[key] += count;

        } else {
            console.warn(`未知的物品 key: ${key}`);
        }
    }

    async onClaimButtonClick() {
        const now = new Date();
        const todayString = now.toISOString().split('T')[0];
        const monthly = this.playerData.signInData.monthly;

        if (
            monthly.lastSignDate === todayString ||
            monthly.signedDaysCount >= this.dayStampNodes.length
        ) {
            return;
        }

        // 取得今天要簽到的格子 index
        const targetIndex = monthly.signedDaysCount;

        if (targetIndex >= this.dayStampNodes.length) {
            console.warn("簽到格子數量不足");
            return;
        }

        const targetStamp = this.dayStampNodes[targetIndex];


        // 更新資料
        monthly.signedDaysCount++;
        monthly.lastSignDate = todayString;

        const day = now.getDay(); // 0 = Sunday, 6 = Saturday
        const rewards = [];

        if (day === 0 || day === 6) {
            // 周末隨機獎勵
            const weekendItems = [
                { key: 'premiumFeed', name: '高級飼料', count: 1 },
                { key: 'fan', name: '風扇', count: 1 },
                { key: 'heater', name: '加熱器', count: 1 },
                { key: 'brush', name: '魚缸刷', count: 1 }
            ];
            const reward = getRandomItem(weekendItems);
            this.addInventoryItem(reward.key, reward.count);

            rewards.push({
                icon: this.getIconSpriteFrame(reward.key),
                name: reward.name,
                count: reward.count
            });

        } else {
            // 平日給普通飼料
            this.addInventoryItem('normalFeed', 1);

            rewards.push({
                icon: this.getIconSpriteFrame('normalFeed'),
                name: '普通飼料',
                count: 1
            });
        }
        rewards.forEach(r => {
            console.log(`月簽到獎勵：${r.name} x${r.count}`);
        });

        await DataManager.savePlayerDataWithCache(this.playerData);

        this.claimButton.interactable = false;
        this.signInHintLabel.string = "今日已簽到";

        // ===== 飛印章動畫開始 =====

        // 計算格子內 Stamp 的世界中心座標
        const rect = targetStamp.getComponent(UITransform)!.getBoundingBoxToWorld();
        const worldCenter = new Vec3(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2,
            0
        );

        // 將 world 座標轉為 flyingStampNode 的 parent 的 local 座標
        const parentUITransform = this.flyingStampNode.parent!.getComponent(UITransform)!;
        const targetLocalPos = parentUITransform.convertToNodeSpaceAR(worldCenter);

        // 計算縮放比例（讓 flyingStampNode 大小變成和目標 stamp 一樣大）
        const targetScaleX = rect.width / this.flyingStampNode.getComponent(UITransform)!.width;
        const targetScaleY = rect.height / this.flyingStampNode.getComponent(UITransform)!.height;

        const targetScale = new Vec3(targetScaleX, targetScaleY, 1);

        // 初始化 flyingStampNode 狀態
        this.flyingStampNode.active = true;
        this.flyingStampNode.setScale(new Vec3(3, 3, 1));
        this.flyingStampNode.setPosition(new Vec3(0, 0, 0)); // 畫面中央

        // 動畫：移動 & 縮小到目標 stamp 上
        tween(this.flyingStampNode)
            .to(1, {
                position: targetLocalPos,
                scale: targetScale
            }, { easing: 'backOut' })
            .call(() => {
                // 飛印章停下後，現在才該更新格子 UI
                this.updateSignInUI();
            })
            .delay(1)
            .call(() => {
                const popup = instantiate(this.rewardPopupPrefab);
                popup.getComponent(RewardPopup).showRewards(rewards);
                this.node.getComponent(UITransform).node.parent!.addChild(popup);
            })
            .start();
    }

    getIconSpriteFrame(key: string): SpriteFrame {
        switch (key) {
            case 'normalFeed': return this.normalFeedSpriteFrame;
            case 'premiumFeed': return this.premiumFeedSpriteFrame;
            case 'fan': return this.fanSpriteFrame;
            case 'heater': return this.heaterSpriteFrame;
            case 'brush': return this.brushSpriteFrame;
            default: return this.defaultSpriteFrame;
        }
    }
}
