import { _decorator, Component, Node, Prefab, instantiate, Label, UIOpacity, Vec3, tween, Button } from 'cc';
import { DataManager, FishData } from './DataManager';
import { playOpenPanelAnim, showFloatingTextCenter } from './utils/UIUtils';
const { ccclass, property } = _decorator;

@ccclass('TombManager')
export class TombManager extends Component {
    @property(Node) tombContainer: Node = null!;
    @property(Prefab) tombstonePrefab: Prefab = null!;
    @property(Node) deadFishDetailPanel: Node = null!;

    @property(Label) titleLabel: Label = null!;
    @property(Label) nameLabel: Label = null!;
    @property(Label) genderLabel: Label = null!;
    @property(Label) daysLabel: Label = null!;
    @property(Label) stageLabel: Label = null!;
    @property(Label) deathDateLabel: Label = null!;

    @property(Node) floatingNode: Node = null!;
    @property(Node) reviveBtn: Node = null!;
    @property(Label) reviveCountLabel: Label = null!;
    @property(Node) resetBtn: Node = null!;
    @property(Node) closeBtn: Node = null!;

    @property(Node) confirmDialogPanel: Node = null!;
    @property(Label) confirmDialogText: Label = null!;
    @property(Node) confirmDialogYesButton: Node = null!;
    @property(Node) confirmDialogNoButton: Node = null!;

    private deadFishList: FishData[] = [];
    private confirmCallback: Function | null = null;

    public async init() {
        const data = await DataManager.getPlayerDataCached();
        if (!data) return;

        this.deadFishList = data.fishList.filter(f => f.isDead);
        this.refreshTombs();
    }

    start() {
        this.confirmDialogYesButton.on(Node.EventType.TOUCH_END, () => {
            if (this.confirmCallback) {
                this.confirmCallback();
                this.confirmCallback = null;
            }
            this.confirmDialogPanel.active = false;
        });

        this.confirmDialogNoButton.on(Node.EventType.TOUCH_END, () => {
            this.confirmCallback = null;
            this.confirmDialogPanel.active = false;
        });
    }

    async refreshTombs() {
        const data = await DataManager.getPlayerDataCached();
        this.deadFishList = data.fishList.filter(f => f.isDead);

        this.tombContainer.removeAllChildren();

        if (this.deadFishList.length === 0) return;

        for (const fish of this.deadFishList) {
            const tomb = instantiate(this.tombstonePrefab);
            tomb.getComponentInChildren(Label)!.string = fish.name;

            tomb.on(Node.EventType.TOUCH_END, () => {
                this.showDeadFishDetail(fish);
            });

            this.tombContainer.addChild(tomb);
        }
    }

    async showDeadFishDetail(fish: FishData) {
        playOpenPanelAnim(this.deadFishDetailPanel);

        const data = await DataManager.getPlayerDataCached();
        const reviveCount = data.inventory.items.revivePotion;
        this.reviveCountLabel.string = `${reviveCount}`;
        this.reviveBtn.getComponent(Button)!.interactable = reviveCount > 0;
        
        this.titleLabel.string = `${fish.name} 的魚生回憶`;
        this.nameLabel.string = `名字：${fish.name}`;
        this.genderLabel.string = `性別：${fish.gender === 'male' ? '公魚' : '母魚'}`;
        this.daysLabel.string = `成長天數：牠努力生活了 ${fish.growthDaysPassed} 天`;
        this.stageLabel.string = `階段：LV ${fish.stage}`;
        this.deathDateLabel.string = `離開的日子：在 ${fish.deathDate ?? '未知'}，牠悄悄地離開了魚缸`;

        this.reviveBtn.off(Node.EventType.TOUCH_END);
        this.resetBtn.off(Node.EventType.TOUCH_END);
        this.closeBtn.off(Node.EventType.TOUCH_END);

        if (reviveCount > 0) {
            this.reviveBtn.on(Node.EventType.TOUCH_END, () => {
                this.showConfirmDialog(`確定要復活 ${fish.name} 嗎？`, () => this.reviveFish(fish));
            });
        }
        this.resetBtn.on(Node.EventType.TOUCH_END, () => {
            this.showConfirmDialog(`確定要讓 ${fish.name} 重新開始嗎？`, () => this.resetFish(fish));
        });
        this.closeBtn.on(Node.EventType.TOUCH_END, () => {
            this.deadFishDetailPanel.active = false;
        });
        
    }

    async reviveFish(fish: FishData) {
        const data = await DataManager.getPlayerDataCached();
        if (data.inventory.items.revivePotion <= 0) {
            console.warn("沒有復活藥");
            return;
        }

        const index = data.fishList.findIndex(f => f.id === fish.id);
        if (index === -1) return;

        data.inventory.items.revivePotion--;
        data.fishList[index].isDead = false;
        data.fishList[index].emotion = 'happy';
        data.fishList[index].hunger = 50;

        await DataManager.savePlayerDataWithCache(data);
        console.log(`${fish.name} 已復活`);
        showFloatingTextCenter(this.floatingNode, `${fish.name} 已復活，快去 ${fish.tankId} 號魚缸看看牠吧！`);

        this.deadFishDetailPanel.active = false;
        this.refreshTombs();

    }

    async resetFish(fish: FishData) {
        const data = await DataManager.getPlayerDataCached();
        const index = data.fishList.findIndex(f => f.id === fish.id);
        if (index === -1) return;

        data.fishList[index].isDead = false;
        data.fishList[index].emotion = 'happy';
        data.fishList[index].stage = 1;
        data.fishList[index].growthDaysPassed = 0;
        data.fishList[index].hunger = 50;

        await DataManager.savePlayerDataWithCache(data);
        console.log(`${fish.name} 已重新開始養殖`);
        showFloatingTextCenter(this.floatingNode, `${fish.name} 已重新開始，快去 ${fish.tankId} 號魚缸看看牠吧！`);

        this.deadFishDetailPanel.active = false;
        this.refreshTombs();

    }

    showConfirmDialog(message: string, onConfirm: Function) {
        this.confirmDialogText.string = message;
        this.confirmDialogPanel.active = true;
        this.confirmCallback = onConfirm;
    }
}