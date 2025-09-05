import { _decorator, Component, Node, Label, Sprite, SpriteFrame, EditBox, Vec3, tween, UITransform, UIOpacity, Button, Color } from 'cc';
import { SwimmingFish } from './SwimmingFish';
import { FishLogic } from './FishLogic';
import { GameManager } from './GameManager';
import { DataManager, FishData } from './DataManager';
import { playOpenPanelAnim, showFloatingTextCenter } from './utils/UIUtils';
import { ConfirmDialogManager } from './ConfirmDialogManager';

const { ccclass, property } = _decorator;

@ccclass('FishDetailManager')
export class FishDetailManager extends Component {
    @property(ConfirmDialogManager) confirmDialogManager: ConfirmDialogManager = null!;
    @property(Node) floatingNode: Node = null!;

    @property(Node) fishDetailPanel: Node = null!;

    // Title and InfoSection
    @property(Label) fishNameLabel: Label = null!;
    @property(Label) stageLabel: Label = null!;
    @property(Node) renameButton: Node = null!;
    @property(Label) genderLabel: Label = null!;
    @property(Label) daysLabel: Label = null!;
    @property(Label) hungerLabel: Label = null!;
    @property(Sprite) fishStatusImage: Sprite = null!;
    @property(Label) floatingText: Label = null!;

    // TabButton
    @property([Node]) tabButtons: Node[] = []; // 依序放：Feed / Heal / Fashion

    // Feed 相關
    @property(Node) feedSection: Node = null!;
    @property(Node) feedBtnNormal: Node = null!;
    @property(Node) feedBtnPremium: Node = null!;
    @property(Label) feedNormalCountLabel: Label = null!;
    @property(Label) feedPremiumCountLabel: Label = null!;

    // Heal 相關
    @property(Node) healSection: Node = null!;
    @property(Node) genderPotionBtn: Node = null!;
    @property(Label) genderPotionCountLabel: Label = null!;
    @property(Node) upgradePotionBtn: Node = null!;
    @property(Label) upgradePotionCountLabel: Label = null!;
    @property(Node) coldMedicineBtn: Node = null!;
    @property(Label) coldMedicineCountLabel: Label = null!;
    @property(Node) changePotionBtn: Node = null!;
    @property(Label) changePotionCountLabel: Label = null!;

    // Fashion 相關
    @property(Node) fashionSection: Node = null!;

    // 關閉按鈕
    @property(Node) closeButton: Node = null!;

    // 情緒圖片 
    @property(SpriteFrame) happySprite: SpriteFrame = null!;
    @property(SpriteFrame) sadSprite: SpriteFrame = null!;
    @property(SpriteFrame) angrySprite: SpriteFrame = null!;
    @property(SpriteFrame) hungrySprite: SpriteFrame = null!;
    @property(SpriteFrame) coldSprite: SpriteFrame = null!;
    @property(SpriteFrame) hotSprite: SpriteFrame = null!;
    @property(SpriteFrame) sickSprite: SpriteFrame = null!;

    // Rename Panel 相關
    @property(Node) RenamePanel: Node = null!;
    @property(EditBox) renameInput: EditBox = null!;
    @property(Node) renameConfirmButton: Node = null!;
    @property(Node) renameCancelButton: Node = null!;

    private currentFishId: number = -1;
    private isReadOnly: boolean = false;
    private _currentTab: 'feed' | 'heal' | 'fashion' = 'feed';
    private _tabKeys: Array<'feed' | 'heal' | 'fashion'> = ['feed', 'heal', 'fashion'];
    private _tabSections!: Record<'feed' | 'heal' | 'fashion', Node>;

    /** 初始化 */
    start() {
        SwimmingFish.setEmotionFrames({
            happy: this.happySprite,
            sad: this.sadSprite,
            angry: this.angrySprite,
            hungry: this.hungrySprite,
            cold: this.coldSprite,
            hot: this.hotSprite,
            sick: this.sickSprite,
        });

        // 對應三個 Section
        this._tabSections = {
            feed: this.feedSection,
            heal: this.healSection,
            fashion: this.fashionSection,
        };

        // 綁定按鈕事件
        for (let i = 0; i < this.tabButtons.length; i++) {
            const key = this._tabKeys[i];
            const btn = this.tabButtons[i];

            btn.off(Node.EventType.TOUCH_END);
            btn.on(Node.EventType.TOUCH_END, () => {
                this.switchTab(key);
            });
        }

        this.closeButton.on(Node.EventType.TOUCH_END, this.closeFishDetail, this);

        this.renameButton.on(Node.EventType.TOUCH_END, this.showRenamePanel, this);
        this.renameConfirmButton.on(Node.EventType.TOUCH_END, this.renameFish, this);
        this.renameCancelButton.on(Node.EventType.TOUCH_END, this.hideRenamePanel, this);

        this.genderPotionBtn.on(Node.EventType.TOUCH_END, this.onUseGenderPotion, this);
        this.upgradePotionBtn.on(Node.EventType.TOUCH_END, this.onUseUpgradePotion, this);
        this.coldMedicineBtn.on(Node.EventType.TOUCH_END, this.onUseColdMedicine, this);
        this.changePotionBtn.on(Node.EventType.TOUCH_END, this.onUseChangePotion, this);
    }

    /** 顯示魚詳細資訊（opts.readOnly: 朋友魚唯讀） */
    async showFishDetail(
        fish: FishData,
        emotionSprite?: SpriteFrame | null,
        opts?: { readOnly?: boolean }
    ) {
        playOpenPanelAnim(this.fishDetailPanel);
        this.currentFishId = fish.id;
        this.switchTab('feed'); // 預設顯示餵食面板

        // 顯示魚基本資訊
        this.fishNameLabel.string = fish.name;
        this.genderLabel.string = `性別：${fish.gender === 'male' ? '公' : '母'}`;
        this.daysLabel.string = `已成長天數：${fish.growthDaysPassed}`;
        this.stageLabel.string = `LV ${fish.stage}`;
        this.hungerLabel.string = `飢餓值：${Math.floor(fish.hunger)} / 100`;

        // 判斷是否唯讀（朋友魚缸）
        const isReadOnly = !!opts?.readOnly;

        // 顯示剩餘數量
        if (isReadOnly) {
            // 朋友魚數量顯示為 "-"
            this.feedNormalCountLabel.string = "-";
            this.feedPremiumCountLabel.string = "-";
            this.genderPotionCountLabel.string = "-";
            this.upgradePotionCountLabel.string = "-";
            this.changePotionCountLabel.string = "-";
            this.coldMedicineCountLabel.string = "-";
        } else {
            // 自己的魚顯示實際數量
            const playerData = await DataManager.getPlayerDataCached();
            this.feedNormalCountLabel.string = playerData.inventory.feeds.normal.toString();
            this.feedPremiumCountLabel.string = playerData.inventory.feeds.premium.toString();
            this.genderPotionCountLabel.string = playerData.inventory.items.genderPotion.toString();
            this.upgradePotionCountLabel.string = playerData.inventory.items.upgradePotion.toString();
            this.changePotionCountLabel.string = playerData.inventory.items.changePotion.toString();
            this.coldMedicineCountLabel.string = playerData.inventory.items.coldMedicine.toString();
        }

        // 先清掉舊事件
        this.feedBtnNormal.off(Node.EventType.TOUCH_END);
        this.feedBtnPremium.off(Node.EventType.TOUCH_END);
        this.genderPotionBtn.off(Node.EventType.TOUCH_END);
        this.upgradePotionBtn.off(Node.EventType.TOUCH_END);
        this.coldMedicineBtn.off(Node.EventType.TOUCH_END);
        this.changePotionBtn.off(Node.EventType.TOUCH_END);

        // 只有「非唯讀」才綁定事件
        if (!isReadOnly) {
            this.feedBtnNormal.on(Node.EventType.TOUCH_END, this.feedNormal, this);
            this.feedBtnPremium.on(Node.EventType.TOUCH_END, this.feedPremium, this);
            this.genderPotionBtn.on(Node.EventType.TOUCH_END, this.onUseGenderPotion, this);
            this.upgradePotionBtn.on(Node.EventType.TOUCH_END, this.onUseUpgradePotion, this);
            this.coldMedicineBtn.on(Node.EventType.TOUCH_END, this.onUseColdMedicine, this);
            this.changePotionBtn.on(Node.EventType.TOUCH_END, this.onUseChangePotion, this);
        }

        // 鎖定互動
        this.feedBtnNormal.getComponent(Button)!.interactable = !isReadOnly;
        this.feedBtnPremium.getComponent(Button)!.interactable = !isReadOnly;
        this.genderPotionBtn.getComponent(Button)!.interactable = !isReadOnly;
        this.upgradePotionBtn.getComponent(Button)!.interactable = !isReadOnly;
        this.coldMedicineBtn.getComponent(Button)!.interactable = !isReadOnly;
        this.changePotionBtn.getComponent(Button)!.interactable = !isReadOnly;
        this.renameButton.getComponent(Button)!.interactable = !isReadOnly;

        // 情緒圖 (優先使用 SwimmingFish 傳來的 sprite)
        if (emotionSprite) {
            this.fishStatusImage.spriteFrame = emotionSprite;
        } else {
            const playerData = await DataManager.getPlayerDataCached();
            const currentEmotion = fish.emotion as any;
            if (currentEmotion) {
                const sf = SwimmingFish.getEmotionSpriteByKey(currentEmotion);
                this.fishStatusImage.spriteFrame = sf;
            } else {
                const env = playerData.tankEnvironment;
                const computed = SwimmingFish.computeEmotion(fish, env);
                const sf = SwimmingFish.getEmotionSpriteByKey(computed);
                this.fishStatusImage.spriteFrame = sf;
            }
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
        const playerData = await DataManager.getPlayerDataCached();
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        // 飢餓值為 0：禁止餵食
        if (fish.hunger <= 0) {
            this.showFloatingTextRightOf(this.hungerLabel.node, '已飽，無需餵食');
            return;
        }

        const msg = FishLogic.feed(fish, playerData.inventory, amount, type);
        console.log(msg);
        await DataManager.savePlayerDataWithCache(playerData);
        this.showFishDetail(fish);

        this.showFloatingTextRightOf(this.hungerLabel.node, `餵食 -${amount}`);
    }

    /** 重新命名 */
    async renameFish() {
        const newName = this.renameInput.string.trim();
        if (!newName) {
            console.warn("名字不能為空！");
            return;
        }

        const playerData = await DataManager.getPlayerDataCached();
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        const renamed = FishLogic.renameFish(fish, newName);
        if (!renamed) {
            console.warn("名字無效");
            return;
        }

        await DataManager.savePlayerDataWithCache(playerData);
        this.hideRenamePanel();
        this.showFishDetail(fish);
    }

    /** Tab 切換 */
    switchTab(tabName: 'feed' | 'heal' | 'fashion') {
        this._currentTab = tabName;

        // 控制 Section 顯示
        this._tabKeys.forEach(key => {
            this._tabSections[key].active = (key === tabName);
        });

        // 更新按鈕狀態
        this.updateTabVisuals();
    }

    /** 更新按鈕顏色（選中白色、未選灰色） */
    private updateTabVisuals() {
        const onColor = Color.WHITE;
        const offColor = new Color(220, 220, 220, 255);

        this.tabButtons.forEach((btn, i) => {
            const key = this._tabKeys[i];
            const frameNode = btn.getChildByName('Frame');
            const sprite = frameNode?.getComponent(Sprite);
            if (sprite) {
                sprite.color = key === this._currentTab ? onColor : offColor;
            }
        });
    }

    /** 道具使用：變性藥 */
    onUseGenderPotion() {
        this.getCurrentFishAndPlayer().then(async ({ playerData, fish }) => {
            if (!playerData || !fish) return;
            if (playerData.inventory.items.genderPotion <= 0) {
                showFloatingTextCenter(this.floatingNode, '沒有變性藥了');
                return;
            }
            const ok = await this.confirmDialogManager.ask('確定要使用變性藥嗎？');
            if (!ok) return;
            await this.useGenderPotion();
        });
    }
    private async useGenderPotion() {
        const playerData = await DataManager.getPlayerDataCached();
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        const msg = FishLogic.useGenderPotion(fish, playerData.inventory.items);
        await DataManager.savePlayerDataWithCache(playerData);
        console.log(msg);
        this.showFishDetail(fish); // 更新畫面

        this.showFloatingTextRightOf(this.genderLabel.node, '變性完成！');

        const gameManager = this.node.scene.getComponentInChildren(GameManager);
        if (gameManager) {
            gameManager.replaceFishNode(fish);  // 根據新性別產生對應 prefab
        }
    }

    /** 道具使用：升級藥 */
    onUseUpgradePotion() {
        this.getCurrentFishAndPlayer().then(async ({ playerData, fish }) => {
            if (!playerData || !fish) return;
            if (playerData.inventory.items.upgradePotion <= 0) {
                showFloatingTextCenter(this.floatingNode, '沒有升級藥了');
                return;
            }
            const ok = await this.confirmDialogManager.ask('確定要使用升級藥嗎？');
            if (!ok) return;
            await this.useUpgradePotion();
        });
    }
    private async useUpgradePotion() {
        const playerData = await DataManager.getPlayerDataCached();
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        const { message, upgraded } = FishLogic.useUpgradePotion(fish, playerData.inventory.items);
        await DataManager.savePlayerDataWithCache(playerData);
        console.log(message);

        await this.showFishDetail(fish); // 更新資訊
        this.showFloatingTextRightOf(this.daysLabel.node, '成長天數 +5');

        if (upgraded) {
            const gameManager = this.node.scene.getComponentInChildren(GameManager);
            if (gameManager) {
                gameManager.replaceFishNode(fish);  // 替換模型
            }
        }
    }

    /** 道具使用：感冒藥 */
    onUseColdMedicine() {
        this.getCurrentFishAndPlayer().then(async ({ playerData, fish }) => {
            if (!playerData || !fish) return;
            if (playerData.inventory.items.coldMedicine <= 0) {
                showFloatingTextCenter(this.floatingNode, '沒有感冒藥了');
                return;
            }

            // 沒生病就不能用
            if (!fish.status || !fish.status.sick) {
                showFloatingTextCenter(this.floatingNode, '這隻魚沒有生病');
                return;
            }
            const ok = await this.confirmDialogManager.ask('確定要使用感冒藥嗎？');
            if (!ok) return;
            await this.useColdMedicine();
        });
    }
    private async useColdMedicine() {
        const playerData = await DataManager.getPlayerDataCached();
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        const { message, cured } = FishLogic.useColdMedicine(fish, playerData.inventory.items);
        await DataManager.savePlayerDataWithCache(playerData);
        console.log(message);

        if (cured) {
            const gameManager = this.node.scene.getComponentInChildren(GameManager);
            if (gameManager) {
                gameManager.replaceFishNode(fish);
            }
            this.showFloatingTextRightOf(this.fishStatusImage.node, '已治癒！');
            await this.showFishDetail(fish);
        }
    }

    /** 道具使用：整形藥 */
    onUseChangePotion() {
        this.getCurrentFishAndPlayer().then(async ({ playerData, fish }) => {
            if (!playerData || !fish) return;

            // 先檢查階段
            if (fish.stage < 6) {
                showFloatingTextCenter(this.floatingNode, '需要達到第 6 階才能使用整形藥');
                return;
            }

            // 再檢查數量
            if (playerData.inventory.items.changePotion <= 0) {
                showFloatingTextCenter(this.floatingNode, '沒有整形藥了');
                return;
            }

            // 確認使用
            const ok = await this.confirmDialogManager.ask('確定要使用整形藥嗎？');
            if (!ok) return;

            await this.useChangePotion();
        })
    }

    private async useChangePotion() {
        const playerData = await DataManager.getPlayerDataCached();
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        const msg = FishLogic.useChangePotion(fish, playerData.inventory.items);
        await DataManager.savePlayerDataWithCache(playerData);
        console.log(msg);
        this.showFishDetail(fish); // 更新畫面

        const gameManager = this.node.scene.getComponentInChildren(GameManager);
        if (gameManager) {
            gameManager.replaceFishNode(fish);  // 根據新長相產生對應 prefab
        }
    }

    private setButtonEnabled(node: Node, enabled: boolean) {
        node.getComponent(Button)?.node && (node.getComponent(Button)!.interactable = enabled);
        // 視覺：半透明顯示停用
        let op = node.getComponent(UIOpacity);
        if (!op) {
            op = node.addComponent(UIOpacity);
        }
        op.opacity = enabled ? 255 : 120;
    }

    private async getCurrentFishAndPlayer() {
        const playerData = await DataManager.getPlayerDataCached();
        const fish = playerData?.fishList.find(f => f.id === this.currentFishId) as FishData | undefined;
        return { playerData, fish };
    }

    showFloatingTextRightOf(targetNode: Node, text: string) {
        const node = this.floatingText.node;
        const uiOpacity = node.getComponent(UIOpacity);
        if (!uiOpacity) {
            console.warn('FloatingText node is missing UIOpacity component!');
            return;
        }

        // 設定文字內容與起始狀態
        this.floatingText.string = text;
        node.active = true;
        uiOpacity.opacity = 0;

        // 取得 targetNode 的右側世界座標
        const labelTransform = targetNode.getComponent(UITransform)!;
        const worldRect = labelTransform.getBoundingBoxToWorld();
        const worldPos = new Vec3(
            worldRect.xMax + 10, // 右邊 + 偏移
            (worldRect.yMin + worldRect.yMax) / 2, // 垂直置中
            0
        );

        // 轉換為 local 座標
        const parentTransform = node.parent!.getComponent(UITransform)!;
        const localPos = parentTransform.convertToNodeSpaceAR(worldPos);

        // 設定起始位置
        node.setPosition(localPos);

        const endPos = localPos.clone().add(new Vec3(0, 30, 0)); // 向上漂浮

        // 透明度動畫（使用 UIOpacity）
        tween(uiOpacity)
            .to(0.1, { opacity: 255 })     // 淡入
            .delay(0.4)                    // 停留一下
            .to(0.2, { opacity: 0 })       // 淡出
            .call(() => node.active = false)
            .start();

        // 位移動畫（針對 Node 本身）
        tween(node)
            .to(0.6, { position: endPos }, { easing: 'quadOut' }) // 漂浮
            .start();
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
        const playerData = await DataManager.getPlayerDataCached();
        const fish = playerData.fishList.find(f => f.id === this.currentFishId);
        if (!fish) return;

        this.renameInput.string = fish.name;
        this.RenamePanel.active = true;
    }

    hideRenamePanel() {
        this.RenamePanel.active = false;
    }
}