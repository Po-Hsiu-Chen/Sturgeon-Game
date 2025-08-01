import { _decorator, Component, Node, Label, Sprite, SpriteFrame, EditBox, Vec3, tween } from 'cc';
import { SwimmingFish } from './SwimmingFish';
import { FishLogic } from './FishLogic';
import { GameManager } from './GameManager';
import { DataManager } from './DataManager';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
    @property(Node)
    fishDetailPanel: Node = null!;

    // Title and InfoSection
    @property(Label) fishNameLabel: Label = null!;
    @property(Label) genderLabel: Label = null!;
    @property(Label) daysLabel: Label = null!;
    @property(Label) stageLabel: Label = null!;
    @property(Label) hungerLabel: Label = null!;
    @property(Sprite) fishStatusImage: Sprite = null!;

    // 飼料相關
    @property(Node) feedBtnNormal: Node = null!;
    @property(Node) feedBtnPremium: Node = null!;
    @property(Label) feedNormalCountLabel: Label = null!;
    @property(Label) feedPremiumCountLabel: Label = null!;

    // 道具相關
    @property(Node) genderPotionBtn: Node = null!;
    @property(Node) upgradePotionBtn: Node = null!;
    @property(Label) genderPotionCountLabel: Label = null!;
    @property(Label) upgradePotionCountLabel: Label = null!;

    // 關閉按鈕
    @property(Node) closeButton: Node = null!;

    // 情緒圖片 (暫時先放兩個)
    @property(SpriteFrame) happySprite: SpriteFrame = null!;
    @property(SpriteFrame) sadSprite: SpriteFrame = null!;

    // 改名字相關
    @property(Node) RenamePanel: Node = null!;
    @property(EditBox) renameInput: EditBox = null!;
    @property(Node) renameConfirmButton: Node = null!;
    @property(Node) renameCancelButton: Node = null!;
    @property(Node) renameButton: Node = null!;

    // Tab 切換
    @property(Node) fashionTabButton: Node = null!;
    @property(Node) healTabButton: Node = null!;
    @property(Node) feedTabButton: Node = null!;
    @property(Node) fashionSection: Node = null!;
    @property(Node) healSection: Node = null!;
    @property(Node) feedSection: Node = null!;

    private currentFishId: number = -1;

    /** 初始化 */
    start() {
        this.closeButton.on(Node.EventType.TOUCH_END, this.closeFishDetail, this);

        this.renameButton.on(Node.EventType.TOUCH_END, this.showRenamePanel, this);
        this.renameConfirmButton.on(Node.EventType.TOUCH_END, this.renameFish, this);
        this.renameCancelButton.on(Node.EventType.TOUCH_END, this.hideRenamePanel, this);

        this.fashionTabButton.on(Node.EventType.TOUCH_END, () => this.switchTab('fashion'), this);
        this.healTabButton.on(Node.EventType.TOUCH_END, () => this.switchTab('heal'), this);
        this.feedTabButton.on(Node.EventType.TOUCH_END, () => this.switchTab('feed'), this);

        this.genderPotionBtn.on(Node.EventType.TOUCH_END, this.onUseGenderPotion, this);
        this.upgradePotionBtn.on(Node.EventType.TOUCH_END, this.onUseUpgradePotion, this);
    }

    /** 顯示魚詳細資訊 */
    async showFishDetail(fish: any) {
        const wasInactive = !this.fishDetailPanel.active;

        if (wasInactive) {
            this.fishDetailPanel.active = true;
            this.fishDetailPanel.scale = new Vec3(0.3, 0.3, 1);

            tween(this.fishDetailPanel)
                .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .start();
        }

        this.currentFishId = fish.id;
        this.switchTab('feed'); // 預設顯示餵食面板

        // 顯示資訊
        this.fishNameLabel.string = fish.name;
        this.genderLabel.string = `性別：${fish.gender === 'male' ? '公' : '母'}`;
        this.daysLabel.string = `已成長天數：${fish.growthDaysPassed}`;
        this.stageLabel.string = `LV ${fish.stage}`;
        this.hungerLabel.string = `飢餓值：${Math.floor(fish.hunger)} / 100`;
        
        // 剩餘數量顯示
        const playerData = await DataManager.getPlayerData();
        this.feedNormalCountLabel.string = playerData.inventory.feeds.normal.toString();
        this.feedPremiumCountLabel.string = playerData.inventory.feeds.premium.toString();
        this.genderPotionCountLabel.string = playerData.inventory.items.genderPotion.toString();
        this.upgradePotionCountLabel.string = playerData.inventory.items.upgradePotion.toString();

        // 綁定按鈕事件
        this.feedBtnNormal.off(Node.EventType.TOUCH_END);
        this.feedBtnPremium.off(Node.EventType.TOUCH_END);
        this.feedBtnNormal.on(Node.EventType.TOUCH_END, this.feedNormal, this);
        this.feedBtnPremium.on(Node.EventType.TOUCH_END, this.feedPremium, this);

        // 情緒圖
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

    /** 餵食 */
    feedNormal() {
        this.feedFish(3, 'normal');
    }
    feedPremium() {
        this.feedFish(20, 'premium');
    }
    async feedFish(amount: number, type: 'normal' | 'premium') {
        const playerData = await DataManager.getPlayerData();
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        const msg = FishLogic.feed(fish, playerData.inventory, amount, type);
        console.log(msg);
        await DataManager.savePlayerData(playerData);
        this.showFishDetail(fish);
    }

    /** 重新命名 */
    async renameFish() {
        const newName = this.renameInput.string.trim();
        if (!newName) {
            console.warn("名字不能為空！");
            return;
        }

        const playerData = await DataManager.getPlayerData();
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        const renamed = FishLogic.renameFish(fish, newName);
        if (!renamed) {
            console.warn("名字無效");
            return;
        }

        await DataManager.savePlayerData(playerData);
        this.hideRenamePanel();
        this.showFishDetail(fish);
    }

    /** Tab 切換 */
    switchTab(tabName: 'fashion' | 'heal' | 'feed') {
        // 重置所有 tab 的順序
        this.fashionSection.setSiblingIndex(0);
        this.healSection.setSiblingIndex(0);
        this.feedSection.setSiblingIndex(0);

        // 把選中的排最上面
        switch (tabName) {
            case 'fashion':
                this.fashionSection.setSiblingIndex(99);
                break;
            case 'heal':
                this.healSection.setSiblingIndex(99);
                break;
            case 'feed':
                this.feedSection.setSiblingIndex(99);
                break;
        }

    }

    /** 道具使用：變性 */
    async onUseGenderPotion() {
        const playerData = await DataManager.getPlayerData();
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        const msg = FishLogic.useGenderPotion(fish, playerData.inventory.items);
        await DataManager.savePlayerData(playerData);
        console.log(msg);
        this.showFishDetail(fish); // 更新畫面

        const gameManager = this.node.scene.getComponentInChildren(GameManager); 
        if (gameManager) {
            gameManager.replaceFishNode(fish);  // 根據新性別產生對應 prefab
        }
    }

    /** 道具使用：升級 */
    async onUseUpgradePotion() {
        const playerData = await DataManager.getPlayerData();
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        const { message, upgraded } = FishLogic.useUpgradePotion(fish, playerData.inventory.items);
        await DataManager.savePlayerData(playerData);
        console.log(message);

        await this.showFishDetail(fish); // 更新資訊

        if (upgraded) {
            const gameManager = this.node.scene.getComponentInChildren(GameManager); 
            if (gameManager) {
                gameManager.replaceFishNode(fish);  // 替換模型
            }
        }
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

    async showRenamePanel() {
        const playerData = await DataManager.getPlayerData();
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        this.renameInput.string = fish.name;
        this.RenamePanel.active = true;
    }

    hideRenamePanel() {
        this.RenamePanel.active = false;
    }
}
