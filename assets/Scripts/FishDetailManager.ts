import { _decorator, Component, Node, Label, Sprite, SpriteFrame, EditBox, Vec3, tween, Tween, UITransform, UIOpacity, Button, Color, Prefab, instantiate } from 'cc';
import { SwimmingFish } from './SwimmingFish';
import { FishLogic } from './FishLogic';
import { GameManager } from './GameManager';
import { DataManager, FishData } from './DataManager';
import { playOpenPanelAnim, showFloatingTextCenter } from './utils/UIUtils';
import { ConfirmDialogManager } from './ConfirmDialogManager';
import { FashionManager } from './FashionManager';

const { ccclass, property } = _decorator;

type FashionSlot = 'head';
const FASHION_CATALOG: Record<string, { slot: FashionSlot; name: string; iconIndex: number }> = {
  acc_bowtie:   { slot:'head', name:'蝴蝶結',   iconIndex: 0 },
  hat_chef:     { slot:'head', name:'廚師帽',   iconIndex: 1 },
  hat_fedora:   { slot:'head', name:'紳士帽',   iconIndex: 2 },
  acc_sunglass: { slot:'head', name:'墨鏡',     iconIndex: 3 },
  hat_crown:        { slot:'head', name:'皇冠',       iconIndex: 4 },
  acc_flower:       { slot:'head', name:'花環',       iconIndex: 5 },
  acc_heart_glass:  { slot:'head', name:'愛心眼鏡',   iconIndex: 6 },
  hat_magic:        { slot:'head', name:'魔法帽',     iconIndex: 7 },
  hat_beret:        { slot:'head', name:'畫家帽',     iconIndex: 8 },
  hat_party:        { slot:'head', name:'派對帽',     iconIndex: 9 },
};

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
    @property(Node) fashionGrid: Node = null!;
    @property(Prefab) ownedItemCardPrefab: Prefab = null!;

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
            btn.on(Node.EventType.TOUCH_END, async () => {
                if (this.isReadOnly && (key === 'heal' || key === 'fashion')) {
                    showFloatingTextCenter(this.floatingNode, '朋友的魚缸只能瀏覽，無法使用這個分頁');
                    return;
                }
                if (key === 'fashion') {
                    const { fish } = await this.getCurrentFishAndPlayer();
                    if (!fish || fish.stage < 6) {
                        showFloatingTextCenter(this.floatingNode, '需要達到第 6 階才能使用時裝');
                        return;
                    }
                }
                this.switchTab(key);
            });
        }

        this.closeButton.on(Node.EventType.TOUCH_END, this.closeFishDetail, this);

        this.renameButton.on(Node.EventType.TOUCH_END, this.showRenamePanel, this);
        this.renameConfirmButton.on(Node.EventType.TOUCH_END, this.renameFish, this);
        this.renameCancelButton.on(Node.EventType.TOUCH_END, this.hideRenamePanel, this);
    }

    /** 顯示魚詳細資訊（opts.readOnly: 朋友魚唯讀） */
    async showFishDetail(
        fish: FishData,
        emotionSprite?: SpriteFrame | null,
        opts?: { readOnly?: boolean; preserveTab?: boolean }
    ) {
        playOpenPanelAnim(this.fishDetailPanel);
        this.currentFishId = fish.id;

        // 判斷是否唯讀（朋友魚缸）
        this.isReadOnly = !!opts?.readOnly;

        // 決定要切去哪一頁（唯讀固定 feed）
        const preserve = !!opts?.preserveTab;
        const targetTab = this.isReadOnly ? 'feed' : (preserve ? this._currentTab : 'feed');
        this.switchTab(targetTab);

        // 顯示魚基本資訊
        this.fishNameLabel.string = fish.name;
        this.genderLabel.string = `性別：${fish.gender === 'male' ? '公' : '母'}`;
        this.daysLabel.string = `已成長天數：${fish.growthDaysPassed}`;
        this.stageLabel.string = `LV ${fish.stage}`;
        this.hungerLabel.string = `飢餓值：${Math.floor(fish.hunger)} / 100`;

        // 分頁可見性/互動（朋友缸：只留 Feed）
        const canUseHeal = !this.isReadOnly;
        const canUseFashion = !this.isReadOnly && (fish.stage ?? 1) >= 3;

        // 按鈕可點與視覺
        this.setButtonEnabled(this.tabButtons[1], canUseHeal);     // Heal
        this.setButtonEnabled(this.tabButtons[2], canUseFashion);  // Fashion

        // 顯示剩餘數量
        if (this.isReadOnly) {
            // 朋友魚數量顯示為 "-"
            this.feedNormalCountLabel.string = "-";
            this.feedPremiumCountLabel.string = "-";
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
        if (!this.isReadOnly) {
            this.feedBtnNormal.on(Node.EventType.TOUCH_END, this.feedNormal, this);
            this.feedBtnPremium.on(Node.EventType.TOUCH_END, this.feedPremium, this);
            this.genderPotionBtn.on(Node.EventType.TOUCH_END, this.onUseGenderPotion, this);
            this.upgradePotionBtn.on(Node.EventType.TOUCH_END, this.onUseUpgradePotion, this);
            this.coldMedicineBtn.on(Node.EventType.TOUCH_END, this.onUseColdMedicine, this);
            this.changePotionBtn.on(Node.EventType.TOUCH_END, this.onUseChangePotion, this);
        }

        // 鎖定互動
        this.feedBtnNormal.getComponent(Button)!.interactable = !this.isReadOnly;
        this.feedBtnPremium.getComponent(Button)!.interactable = !this.isReadOnly;

        // 情緒圖 (優先使用 SwimmingFish 傳來的 sprite)
        if (emotionSprite) {
            this.fishStatusImage.spriteFrame = emotionSprite;
        } else {
            const { env } = await this.getCurrentFishAndPlayer();
            const currentEmotion = fish.emotion as any;
            if (currentEmotion) {
                this.fishStatusImage.spriteFrame = SwimmingFish.getEmotionSpriteByKey(currentEmotion);
            } else {
                const computed = SwimmingFish.computeEmotion(fish, env);
                this.fishStatusImage.spriteFrame = SwimmingFish.getEmotionSpriteByKey(computed);
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

        // 儲存
        await DataManager.savePlayerDataWithCache(playerData);

        // 立即更新 UI
        this.hungerLabel.string = `飢餓值：${Math.floor(fish.hunger)} / 100`;
        this.feedNormalCountLabel.string = playerData.inventory.feeds.normal.toString();
        this.feedPremiumCountLabel.string = playerData.inventory.feeds.premium.toString();
        this.showFloatingTextRightOf(this.hungerLabel.node, `餵食 -${amount}`);

        // 把最新 fish 物件放回場上的 SwimmingFish
        const fishes = this.node.scene.getComponentsInChildren(SwimmingFish);
        const comp = fishes.find(c => c.fishData?.id === fish.id);
        comp?.setFishData(fish);

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
        // 朋友缸：強制只顯示 Feed（保險）
        if (this.isReadOnly && tabName !== 'feed') {
            showFloatingTextCenter(this.floatingNode, '朋友的魚缸只能瀏覽，無法使用這個分頁');
            tabName = 'feed';
        }

        this._currentTab = tabName;
        this._tabKeys.forEach(key => this._tabSections[key].active = (key === tabName));
        this.updateTabVisuals();

        // 唯讀不渲染 fashion grid
        if (tabName === 'fashion' && !this.isReadOnly) {
            this.getCurrentFishAndPlayer().then(({ fish }) => { if (fish) this.renderFashionGrid(fish); });
        }
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
        await this.showFishDetail(fish, undefined, { preserveTab: true });

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
        await this.showFishDetail(fish, undefined, { preserveTab: true });

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
            await this.showFishDetail(fish, undefined, { preserveTab: true });
        }
    }

    /** 道具使用：整形藥 */
    onUseChangePotion() {
        this.getCurrentFishAndPlayer().then(async ({ playerData, fish }) => {
            if (!playerData || !fish) return;
            if (playerData.inventory.items.changePotion <= 0) {
                showFloatingTextCenter(this.floatingNode, '沒有整形藥了');
                return;
            }
            if (fish.stage < 6) {
                showFloatingTextCenter(this.floatingNode, '需要達到第 6 階才能使用整形藥');
                return;
            }
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
        await this.showFishDetail(fish, undefined, { preserveTab: true });

        //this.showFloatingTextRightOf(this.genderLabel.node, '整形完成！');

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
        const gm = this.node.scene.getComponentInChildren(GameManager) as any;
        // 在朋友缸：從 gm.viewingFriend 取資料
        if (gm?.isViewingFriend) {
            const friend = gm.viewingFriend;
            const fish = friend?.fishList?.find((f: any) => f.id === this.currentFishId) as FishData | undefined;
            const env = friend?.tankEnvironment;
            return { playerData: null, fish, env, isFriend: true };
        }
        // 在自己缸：走原本的 DataManager
        const playerData = await DataManager.getPlayerDataCached();
        const fish = playerData?.fishList.find(f => f.id === this.currentFishId) as FishData | undefined;
        const env = playerData?.tankEnvironment;
        return { playerData, fish, env, isFriend: false };
    }

    showFloatingTextRightOf(targetNode: Node, text: string) {
        const node = this.floatingText.node;
        const uiOpacity = node.getComponent(UIOpacity);
        if (!uiOpacity) {
            console.warn('FloatingText node is missing UIOpacity component!');
            return;
        }

        // 停掉舊動畫，避免卡頓/疊動畫
        Tween.stopAllByTarget(node);
        Tween.stopAllByTarget(uiOpacity);

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

    private async renderFashionGrid(fish: FishData) {
        this.fashionGrid.removeAllChildren();

        const pd = await DataManager.getPlayerDataCached();
        const ownedIds = (pd.fashion?.owned ?? []).filter(id => !!FASHION_CATALOG[id]);
        const items = ownedIds.map(id => ({
            id,
            ...FASHION_CATALOG[id],
            icon: FashionManager.get(id),
        }));

        const unlocked = (fish.stage ?? 1) >= 6;

        for (const it of items) {
            const card = instantiate(this.ownedItemCardPrefab);

            const iconNode = card.getChildByName('Frame');
            const iconSp = iconNode?.getChildByName('ItemImage')?.getComponent(Sprite)!;
            const nameLbl = card.getChildByName('NameLabel')?.getComponent(Label)!;
            const badge = card.getChildByName('EquippedBadge')!;
            const btn = card.getComponent(Button) || card.addComponent(Button);
            const op = card.getComponent(UIOpacity) || card.addComponent(UIOpacity);

            iconSp.spriteFrame = it.icon;
            nameLbl.string = it.name;
            badge.active = (fish.outfit?.head === it.id);

            btn.interactable = unlocked && !this.isReadOnly;
            op.opacity = (unlocked && !this.isReadOnly) ? 255 : 120;

            card.on(Node.EventType.TOUCH_END, async () => {
                if (!btn.interactable) {
                    showFloatingTextCenter(this.floatingNode, '需要達到第 6 階才能使用時裝');
                    return;
                }
                const fresh = await DataManager.getPlayerDataCached();
                const f = fresh.fishList.find(x => x.id === fish.id);
                if (!f) return;

                f.outfit = f.outfit ?? { head: null, accessories: [] };
                f.outfit.head = (f.outfit.head === it.id) ? null : it.id;
                await DataManager.savePlayerDataWithCache(fresh);

                await this.showFishDetail(f, undefined, { preserveTab: true }); // 重畫面板

                // 立刻刷新場上的那條魚
                const fishes = this.node.scene.getComponentsInChildren(SwimmingFish);
                const comp = fishes.find(c => c.fishData?.id === f.id);
                if (comp) {
                    comp.setFishData(f);     // 把最新的 fish 物件放回去
                    comp.refreshOutfit();    // 立即依新資料換外觀
                }
            });

            this.fashionGrid.addChild(card);
        }
    }
}