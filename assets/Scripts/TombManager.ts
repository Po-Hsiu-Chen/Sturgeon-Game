import { _decorator, Component, Node, Prefab, instantiate, Label, UIOpacity, Vec3, tween, Button } from 'cc';
import { DataManager } from './DataManager';
import { FishData } from './DataManager';
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
        const data = await DataManager.getPlayerData();
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
        const data = await DataManager.getPlayerData();
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
        this.deadFishDetailPanel.active = true;

        const data = await DataManager.getPlayerData();
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
        const data = await DataManager.getPlayerData();
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

        await DataManager.savePlayerData(data);
        console.log(`${fish.name} 已復活`);
        this.showFloatingTextCenter(`${fish.name} 已復活，快去 ${fish.tankId} 號魚缸看看牠吧！`);

        this.deadFishDetailPanel.active = false;
        this.refreshTombs();

    }

    async resetFish(fish: FishData) {
        const data = await DataManager.getPlayerData();
        const index = data.fishList.findIndex(f => f.id === fish.id);
        if (index === -1) return;

        data.fishList[index].isDead = false;
        data.fishList[index].emotion = 'happy';
        data.fishList[index].stage = 1;
        data.fishList[index].growthDaysPassed = 0;
        data.fishList[index].hunger = 50;

        await DataManager.savePlayerData(data);
        console.log(`${fish.name} 已重新開始養殖`);
        this.showFloatingTextCenter(`${fish.name} 已重新開始，快去 ${fish.tankId} 號魚缸看看牠吧！`);

        this.deadFishDetailPanel.active = false;
        this.refreshTombs();

    }

    showConfirmDialog(message: string, onConfirm: Function) {
        this.confirmDialogText.string = message;
        this.confirmDialogPanel.active = true;
        this.confirmCallback = onConfirm;
    }

    showFloatingTextCenter(text: string) {
        const node = this.floatingNode;
        const label = node.getComponentInChildren(Label);
        const uiOpacity = node.getComponent(UIOpacity);

        if (!label || !uiOpacity) {
            console.warn('floatingNode 缺少 Label 或 UIOpacity 元件');
            return;
        }

        // 若之前的動畫未結束，先停止
        tween(node).stop();
        tween(uiOpacity).stop();

        label.string = text;
        node.active = true;
        uiOpacity.opacity = 0;

        // 初始與目標位置
        const startPos = new Vec3(0, 0, 0);
        const endPos = new Vec3(0, 30, 0);

        node.setPosition(startPos);

        // 動畫：淡入、停留、淡出
        tween(uiOpacity)
            .to(0.3, { opacity: 255 })    // 淡入
            .delay(2.5)                   // 停留
            .to(0.4, { opacity: 0 })      // 淡出
            .call(() => node.active = false)
            .start();

        // 動畫：向上漂浮
        tween(node)
            .to(1.5, { position: endPos }, { easing: 'quadOut' })
            .start();
    }

}