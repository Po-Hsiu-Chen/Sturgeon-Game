import { _decorator, Component, Node, Prefab, instantiate, Label, Button } from 'cc';
import { DataManager, FishData } from './DataManager';
import { playOpenPanelAnim, showFloatingTextCenter } from './utils/UIUtils';
import { ConfirmDialogManager } from './ConfirmDialogManager';
const { ccclass, property } = _decorator;

@ccclass('TombManager')
export class TombManager extends Component {
    @property(ConfirmDialogManager) confirm: ConfirmDialogManager = null!; // 確認視窗
    @property(Node) floatingNode: Node = null!;         // 浮動提示訊息
    @property(Node) tombContainer: Node = null!;        // 墓碑區容器
    @property(Prefab) tombstonePrefab: Prefab = null!;  // 墓碑 Prefab
    @property(Node) deadFishDetailPanel: Node = null!;  // 死魚詳細資訊面板

    // 魚詳細資訊 Label
    @property(Label) titleLabel: Label = null!;
    @property(Label) nameLabel: Label = null!;
    @property(Label) genderLabel: Label = null!;
    @property(Label) daysLabel: Label = null!;
    @property(Label) stageLabel: Label = null!;
    @property(Label) deathDateLabel: Label = null!;

    // 按鈕與數量顯示
    @property(Node) reviveBtn: Node = null!;           // 復活按鈕
    @property(Label) reviveCountLabel: Label = null!;  // 復活藥數量
    @property(Node) resetBtn: Node = null!;            // 重養按鈕
    
    // 關閉按鈕
    @property(Node) closeBtn: Node = null!;            

    private deadFishList: FishData[] = []; // 死魚列表

    /** 載入死亡魚資料並刷新墓碑 (GameManager用) */
    public async init() {
        const data = await DataManager.getPlayerDataCached();
        if (!data) return;
        this.deadFishList = data.fishList.filter(f => f.isDead);
        this.refreshTombs();
    }

    /** 刷新墓碑區 */
    async refreshTombs() {
        const data = await DataManager.getPlayerDataCached();
        this.deadFishList = data.fishList.filter(f => f.isDead);

        // 清空墓碑再重新生成
        this.tombContainer.removeAllChildren();
        if (this.deadFishList.length === 0) return;

        for (const fish of this.deadFishList) {
            const tomb = instantiate(this.tombstonePrefab);
            tomb.getComponentInChildren(Label)!.string = fish.name;
            
            // 點擊墓碑顯示死亡魚詳情
            tomb.on(Node.EventType.TOUCH_END, () => this.showDeadFishDetail(fish));
            this.tombContainer.addChild(tomb);
        }
    }

    /** 顯示死魚詳細資訊面板 */
    async showDeadFishDetail(fish: FishData) {
        playOpenPanelAnim(this.deadFishDetailPanel);

        const data = await DataManager.getPlayerDataCached();
        const reviveCount = data.inventory.items.revivePotion;

        // 更新 UI 顯示
        this.reviveCountLabel.string = `${reviveCount}`;
        this.reviveBtn.getComponent(Button)!.interactable = reviveCount > 0;

        this.titleLabel.string = `${fish.name} 的魚生回憶`;
        this.nameLabel.string = `名字：${fish.name}`;
        this.genderLabel.string = `性別：${fish.gender === 'male' ? '公魚' : '母魚'}`;
        this.daysLabel.string = `成長天數：牠努力生活了 ${fish.growthDaysPassed} 天`;
        this.stageLabel.string = `階段：LV ${fish.stage}`;
        this.deathDateLabel.string = `離開的日子：在 ${fish.deathDate ?? '未知'}，牠悄悄地離開了魚缸`;

        // 先清掉舊事件，避免重複綁定
        this.reviveBtn.off(Node.EventType.TOUCH_END);
        this.resetBtn.off(Node.EventType.TOUCH_END);
        this.closeBtn.off(Node.EventType.TOUCH_END);

        // 綁定復活按鈕
        if (reviveCount > 0) {
            this.reviveBtn.on(Node.EventType.TOUCH_END, async () => {
                const ok = await this.confirm.ask(`確定要復活 ${fish.name} 嗎？`);
                if (!ok) return;
                await this.reviveFish(fish);
            });
        }

        // 綁定重養按鈕
        this.resetBtn.on(Node.EventType.TOUCH_END, async () => {
            const ok = await this.confirm.ask(`確定要讓 ${fish.name} 重新開始嗎？`);
            if (!ok) return;
            await this.resetFish(fish);
        });

        // 關閉詳情面板
        this.closeBtn.on(Node.EventType.TOUCH_END, () => {
            this.deadFishDetailPanel.active = false;
        });
    }

    /** 復活魚 */
    async reviveFish(fish: FishData) {
        const data = await DataManager.getPlayerDataCached();
        if (data.inventory.items.revivePotion <= 0) {
            console.warn('沒有復活藥');
            return;
        }

        const index = data.fishList.findIndex(f => f.id === fish.id);
        if (index === -1) return;

        // 修改狀態
        data.inventory.items.revivePotion--;
        data.fishList[index].isDead = false;
        data.fishList[index].emotion = 'happy';
        data.fishList[index].hunger = 50;

        await DataManager.savePlayerDataWithCache(data);

        // 顯示提示並更新墓碑
        showFloatingTextCenter(this.floatingNode, `${fish.name} 已復活，快去 ${fish.tankId} 號魚缸看看牠吧！`);
        this.deadFishDetailPanel.active = false;
        this.refreshTombs();
    }

    /** 重新開始養 */
    async resetFish(fish: FishData) {
        const data = await DataManager.getPlayerDataCached();
        const index = data.fishList.findIndex(f => f.id === fish.id);
        if (index === -1) return;

        // 重置魚的狀態
        data.fishList[index].isDead = false;
        data.fishList[index].emotion = 'happy';
        data.fishList[index].stage = 1;
        data.fishList[index].growthDaysPassed = 0;
        data.fishList[index].hunger = 50;

        await DataManager.savePlayerDataWithCache(data);
        
        // 顯示提示並更新墓碑
        showFloatingTextCenter(this.floatingNode, `${fish.name} 已重新開始，快去 ${fish.tankId} 號魚缸看看牠吧！`);
        this.deadFishDetailPanel.active = false;
        this.refreshTombs();
    }
}
