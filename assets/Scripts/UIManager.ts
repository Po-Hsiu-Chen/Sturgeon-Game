import { _decorator, Component, Node, Label, Sprite, SpriteFrame, EditBox } from 'cc';
import { SwimmingFish } from './SwimmingFish';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
    @property(Node)
    fishDetailPanel: Node = null!;

    // Title
    @property(Label)
    fishNameLabel: Label = null!;

    // InfoSection
    @property(Label)
    genderLabel: Label = null!;
    @property(Label)
    daysLabel: Label = null!;
    @property(Label)
    stageLabel: Label = null!;
    @property(Label)
    hungerLabel: Label = null!;
    @property(Sprite)
    fishStatusImage: Sprite = null!;

    // 飼料按鈕
    @property(Node)
    feedBtnNormal: Node = null!;
    @property(Node)
    feedBtnPremium: Node = null!;

    // 飼料剩餘數量
    @property(Label)
    feedNormalCountLabel: Label = null!;
    @property(Label)
    feedPremiumCountLabel: Label = null!;

    // 關閉按鈕
    @property(Node)
    closeButton: Node = null!;

    // 情緒圖 (暫時先放兩個)
    @property(SpriteFrame)
    happySprite: SpriteFrame = null!;
    @property(SpriteFrame)
    sadSprite: SpriteFrame = null!;

    // 改名字相關
    @property(Node)
    RenamePanel: Node = null!;
    @property(EditBox)
    renameInput: EditBox = null!;
    @property(Node)
    renameConfirmButton: Node = null!;
    @property(Node)
    renameCancelButton: Node = null!;
    @property(Node)
    renameButton: Node = null!; // 玩家點這個來開啟 RenamePanel

    private currentFishId: number = -1;

    showFishDetail(fish: any) {
        this.fishDetailPanel.active = true;
        this.currentFishId = fish.id;

        // 顯示資訊
        this.fishNameLabel.string = fish.name;
        this.genderLabel.string = `性別：${fish.gender === 'male' ? '公' : '母'}`;
        this.daysLabel.string = `已成長天數：${fish.growthDaysPassed}`;
        this.stageLabel.string = `階段：${fish.stage}`;
        this.hungerLabel.string = `飢餓值：${Math.floor(fish.hunger)} / 100`;

        const playerData = JSON.parse(localStorage.getItem("playerData"));

        this.feedNormalCountLabel.string = playerData.inventory.feeds.normal.toString();
        this.feedPremiumCountLabel.string = playerData.inventory.feeds.premium.toString();

        // 綁定按鈕事件
        this.feedBtnNormal.off(Node.EventType.TOUCH_END);
        this.feedBtnPremium.off(Node.EventType.TOUCH_END);
        this.feedBtnNormal.on(Node.EventType.TOUCH_END, this.feedNormal, this);
        this.feedBtnPremium.on(Node.EventType.TOUCH_END, this.feedPremium, this);

        // 情緒
        switch (fish.emotion) {
            case "happy":
                this.fishStatusImage.spriteFrame = this.happySprite;
                break;
            case "sad":
                this.fishStatusImage.spriteFrame = this.sadSprite;
                break;
            default:
                this.fishStatusImage.spriteFrame = null!;
        }
    }

    feedNormal() {
        this.feedFish(3, 'normal');
    }

    feedPremium() {
        this.feedFish(20, 'premium');
    }

    feedFish(amount: number, type: 'normal' | 'premium') {
        const playerData = JSON.parse(localStorage.getItem('playerData'));
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        if (playerData.inventory.feeds[type] <= 0) {
            console.warn("沒有飼料！");
            return;
        }

        playerData.inventory.feeds[type]--;
        fish.hunger = Math.max(0, fish.hunger - amount);
        fish.lastFedDate = new Date().toISOString();
        fish.emotion = "happy";

        localStorage.setItem("playerData", JSON.stringify(playerData));
        this.showFishDetail(fish); 
    }

    hideAllSubPanels() {
        this.RenamePanel.active = false;
        // 之後所有需要關起來的 panel
    }
    
    closeFishDetail() {
        this.fishDetailPanel.active = false;
        this.hideAllSubPanels(); 
        SwimmingFish.clearSelection();
    }

    showRenamePanel() {
        const playerData = JSON.parse(localStorage.getItem('playerData'));
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        this.renameInput.string = fish.name;
        this.RenamePanel.active = true;
    }

    hideRenamePanel() {
        this.RenamePanel.active = false;
    }

    renameFish() {
        const newName = this.renameInput.string.trim();
        if (!newName) {
            console.warn("名字不能為空！");
            return;
        }

        const playerData = JSON.parse(localStorage.getItem('playerData'));
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        fish.name = newName;
        localStorage.setItem('playerData', JSON.stringify(playerData));

        this.hideRenamePanel();
        this.showFishDetail(fish); // 更新畫面
    }

    start() {
        this.closeButton.on(Node.EventType.TOUCH_END, this.closeFishDetail, this);

        this.renameButton.on(Node.EventType.TOUCH_END, this.showRenamePanel, this);
        this.renameConfirmButton.on(Node.EventType.TOUCH_END, this.renameFish, this);
        this.renameCancelButton.on(Node.EventType.TOUCH_END, this.hideRenamePanel, this);
    }

}
