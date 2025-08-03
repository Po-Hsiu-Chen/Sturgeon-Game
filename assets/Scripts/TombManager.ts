import { _decorator, Component, Node, Prefab, instantiate, Label } from 'cc';
import { DataManager } from './DataManager';
import { FishData } from './DataManager';
const { ccclass, property } = _decorator;

@ccclass('TombManager')
export class TombManager extends Component {
    @property(Node) tombContainer: Node = null!;
    @property(Prefab) tombstonePrefab: Prefab = null!;
    @property(Node) deadFishDetailPanel: Node = null!;

    @property(Label) nameLabel: Label = null!;
    @property(Label) genderLabel: Label = null!;
    @property(Label) daysLabel: Label = null!;
    @property(Label) stageLabel: Label = null!;
    @property(Label) deathDateLabel: Label = null!;

    @property(Node) reviveBtn: Node = null!;
    @property(Label) reviveCountLabel: Label = null!;
    @property(Node) resetBtn: Node = null!;
    @property(Node) closeBtn: Node = null!;
    

    private deadFishList: FishData[] = [];

    async onEnable() {
        const data = await DataManager.getPlayerData();
        this.deadFishList = data.fishList.filter(f => f.isDead);
        this.refreshTombs();
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
        this.reviveCountLabel.string = `${data.inventory.items.revivePotion}`;
        
        this.nameLabel.string = `名字：${fish.name}`;
        this.genderLabel.string = `性別：${fish.gender === 'male' ? '公魚' : '母魚'}`;
        this.daysLabel.string = `成長天數：牠努力生活了 ${fish.growthDaysPassed} 天`;
        this.stageLabel.string = `階段：LV ${fish.stage}`;
        this.deathDateLabel.string = `離開的日子：在 ${fish.deathDate ?? '未知'}，牠悄悄地離開了魚缸`;

        this.reviveBtn.off(Node.EventType.TOUCH_END);
        this.resetBtn.off(Node.EventType.TOUCH_END);
        this.closeBtn.off(Node.EventType.TOUCH_END);

        this.reviveBtn.on(Node.EventType.TOUCH_END, () => this.reviveFish(fish));
        this.resetBtn.on(Node.EventType.TOUCH_END, () => this.resetFish(fish));
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

        this.deadFishDetailPanel.active = false;
        this.refreshTombs();

    }
}
