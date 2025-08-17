import { _decorator, Component, Node, Prefab, instantiate, Sprite, Label, UITransform, Vec3, Button, SpriteFrame, ImageAsset, Texture2D } from 'cc';
import { SwimmingFish } from './SwimmingFish';
import { DataManager, PlayerData } from './DataManager';
import { FishLogic } from './FishLogic';
import { TombManager } from './TombManager';
import { TankEnvironmentManager } from './TankEnvironmentManager';
import { getOrCreateUserId } from './utils/utils';
import { showFloatingTextCenter } from './utils/UIUtils';
import { initLiff, getIdentity } from './bridge/LiffBridge';
import { authWithLine } from './api/Api';
const { ccclass, property } = _decorator;
const LIFF_ID = '2007937783-PJ4ZRBdY';

@ccclass('GameManager')
export class GameManager extends Component {

    @property(TombManager) tombManager: TombManager = null!;

    // 魚缸與魚類
    @property(Node) fishArea: Node = null!;                     // 魚活動區域
    @property([Prefab]) maleFishPrefabsByStage: Prefab[] = [];  // 公魚：第 1~6 階
    @property([Prefab]) femaleFishPrefabsByStage: Prefab[] = [];// 母魚：第 1~6 階
    @property([Button]) tankButtons: Button[] = [];             // 魚缸按鈕
    @property(Button) tombTankBtn: Button = null!;              // 墓地魚缸按鈕
    @property([Node]) tankNodes: Node[] = [];                   // 魚缸節點
    @property(Node) tombTankNode: Node = null!;                 // 墓地魚缸節點

    // 簽到面板
    @property(Node) signInPanel: Node = null!;

    // 環境資訊
    @property(Label) temperatureLabel: Label = null!;           // 溫度顯示
    @property(Label) waterQualityLabel: Label = null!;          // 水質顯示
    @property minComfortTemp: number = 18;                      // 最低舒適溫度
    @property maxComfortTemp: number = 23;                      // 最高舒適溫度

    // 道具
    @property(Button) heaterBtn: Button = null!;                 // 加熱器按鈕
    @property(Button) fanBtn: Button = null!;                    // 風扇按鈕
    @property(Button) brushBtn: Button = null!;                  // 魚缸刷按鈕
    @property(Label) heaterCountLabel: Label = null!;            // 加熱器數量
    @property(Label) fanCountLabel: Label = null!;               // 風扇數量
    @property(Label) brushCountLabel: Label = null!;             // 魚缸刷數量

    // 環境效果
    @property(Node) dirtyWaterOverlay: Node = null!;             // 髒
    @property(Node) coldOverlay: Node = null!;                   // 冷
    @property(Node) hotOverlay: Node = null!;                    // 熱

    // 確認面板
    @property(Node) confirmDialogPanel: Node = null!;            // 確認提示面板
    @property(Label) confirmDialogText: Label = null!;           // 提示文字
    @property(Node) confirmDialogYesButton: Node = null!;        // 是按鈕
    @property(Node) confirmDialogNoButton: Node = null!;         // 否按鈕

    // 提示面板
    @property(Node) deathNoticePanel: Node = null!;             // 死亡通知面板
    @property(Label) deathNoticeLabel: Label = null!;           // 死亡通知文字
    @property(Button) deathNoticeCloseBtn: Button = null!;      // 死亡通知關閉按鈕
    @property(Node) tombHintPanel: Node = null!;                // 墓地提示面板
    @property(Button) tombHintCloseBtn: Button = null!;         // 墓地提示關閉按鈕

    // user data
    @property(Label) userNameLabel: Label = null!;
    @property(Label) userIdLabel: Label = null!;
    @property(Sprite) userAvatar: Sprite = null!;
    @property(SpriteFrame) defaultAvatar: SpriteFrame = null!;

    @property(Node) floatingNode: Node = null!;

    private confirmCallback: Function | null = null;         // 確認回調
    private currentTankId: number = 1;                       // 當前魚缸 ID
    private playerData: PlayerData | null = null;
    private userId: string = getOrCreateUserId();

    /** 初始化 */
    async start() {
        // 檢查是否要強制 dev 模式（例如網址帶 ?dev=1）
        const urlParams = new URLSearchParams(window.location.search);
        const forceDev = urlParams.get('dev') === '1';
        const devUid = urlParams.get('uid') || 'DEV_LOCAL';;

        try {
            if (forceDev) {
                console.warn('[Game] 強制 DEV 模式');
                // 重要：本機測試要走資料庫，不要寫 localStorage
                DataManager.useLocalStorage = false;
                // 指向本機後端
                DataManager.apiBase = 'http://localhost:3000';

                await DataManager.init(devUid);
                this.playerData = await DataManager.getPlayerDataCached();
            } else {
                // === 正常 LIFF 登入流程 ===
                await initLiff(LIFF_ID);
                const { idToken } = await getIdentity();
                if (!idToken) {
                    throw new Error('取不到 idToken，請用 LINE App / LIFF URL 開啟');
                }

                const { lineUserId } = await authWithLine(idToken);

                await DataManager.init(lineUserId);
                this.playerData = await DataManager.getPlayerDataCached();
            }
        } catch (e) {
            console.error('[Game] 啟動失敗，錯誤：', e);
            // 注意：這裡就「不要」自動 fallback 到 DEV_LOCAL
            return;
        }

        if (!this.playerData) {
            console.error('玩家資料讀取失敗');
            return;
        }

        // === 正常遊戲初始化 ===
        await this.processDailyUpdate();

        this.initButtons();
        this.initDialogs();
        this.initPanels();

        await this.switchTank(1);
        await this.tombManager?.init();
        await this.refreshEnvironmentUI();


        // 顯示基本資料
        this.userNameLabel.string = this.playerData.displayName || "未命名";
        this.userIdLabel.string = this.playerData.userId || "";

        // 載入頭貼
        if (this.playerData.picture) {
            this.loadAvatar(this.playerData.picture);
        } else {
            this.userAvatar.spriteFrame = this.defaultAvatar;
        }

    }

    /** 載入頭貼 */
    async loadAvatar(url: string) {
        try {
            const res = await fetch(url, { mode: 'cors' });
            const blob = await res.blob();
            const bitmap = await createImageBitmap(blob);
            const imageAsset = new ImageAsset(bitmap);

            const texture = new Texture2D();
            texture.image = imageAsset;

            const spriteFrame = new SpriteFrame();
            spriteFrame.texture = texture;

            this.userAvatar.spriteFrame = spriteFrame;
        } catch (err) {
            console.error("載入頭貼失敗", err);
            this.userAvatar.spriteFrame = this.defaultAvatar;
        }
    }

    /** 初始化所有按鈕事件 */
    initButtons() {
        // 魚缸切換按鈕
        this.tankButtons.forEach((btn, index) => {
            btn.node.on(Node.EventType.TOUCH_END, () => this.switchTank(index + 1));
        });

        // 墓園魚缸
        this.tombTankBtn.node.on(Node.EventType.TOUCH_END, () => this.switchToTombTank());

        // 道具按鈕
        this.heaterBtn?.node.on(Node.EventType.TOUCH_END, () => this.onClickHeater());
        this.fanBtn?.node.on(Node.EventType.TOUCH_END, () => this.onClickFan());
        this.brushBtn?.node.on(Node.EventType.TOUCH_END, () => this.onClickBrush());
    }

    /** 初始化對話框事件 */
    initDialogs() {
        // 確認視窗
        this.confirmDialogYesButton?.on(Node.EventType.TOUCH_END, () => {
            if (this.confirmCallback) {
                const cb = this.confirmCallback;
                this.confirmCallback = null;
                this.confirmDialogPanel.active = false;
                cb(); // 執行實際行為
            } else {
                this.confirmDialogPanel.active = false;
            }
        });

        this.confirmDialogNoButton?.on(Node.EventType.TOUCH_END, () => {
            this.confirmCallback = null;
            this.confirmDialogPanel.active = false;
        });
    }

    /** 初始化面板事件與狀態 */
    initPanels() {
        // 簽到面板
        if (this.signInPanel) {
            this.signInPanel.active = true;
        }

        // 死亡提示面板
        this.deathNoticeCloseBtn.node.on(Node.EventType.TOUCH_END, () => {
            this.deathNoticePanel.active = false;
            this.tombHintPanel.active = true;
        });

        // 墓園提示面板
        this.tombHintCloseBtn.node.on(Node.EventType.TOUCH_END, () => {
            this.tombHintPanel.active = false;
        });
    }

    async switchTank(tankId: number) {
        this.playerData = await DataManager.getPlayerDataCached();
        this.tankNodes.forEach((node, idx) => {
            node.active = (idx + 1) === tankId;
        });
        this.tombTankNode.active = false;

        this.fishArea.removeAllChildren();

        const tank = this.playerData.tankList.find(t => t.id === tankId);
        if (!tank) {
            console.warn(`找不到魚缸 ${tankId}`);
            return;
        }

        const area = this.fishArea.getComponent(UITransform)!;
        const width = area.width;
        const height = area.height;
        const margin = 50;

        for (const fishId of tank.fishIds) {
            const fish = this.playerData.fishList.find(f => f.id === fishId);
            if (!fish || fish.isDead) continue;

            const prefab = fish.gender === "female"
                ? this.femaleFishPrefabsByStage[fish.stage - 1]
                : this.maleFishPrefabsByStage[fish.stage - 1];

            if (!prefab) continue;

            const fishNode = instantiate(prefab);
            fishNode.name = `Fish_${fish.id}`;

            const randX = Math.random() * (width - margin * 2) - (width / 2 - margin);
            const randY = Math.random() * (height - margin * 2) - (height / 2 - margin);
            const direction = Math.random() > 0.5 ? 1 : -1;

            fishNode.setPosition(randX, randY, 0);
            fishNode.setScale(new Vec3(direction, 1, 1));
            fishNode["initialDirection"] = direction;

            const swimmingFish = fishNode.getComponent(SwimmingFish);
            swimmingFish?.setFishData(fish);

            this.fishArea.addChild(fishNode);
        }

        this.currentTankId = tankId;
    }

    async switchToTombTank() {
        this.tankNodes.forEach(node => node.active = false);
        this.tombTankNode.active = true;

        await this.tombManager?.refreshTombs();
    }

    /** 處理魚飢餓與成長 */
    async processDailyUpdate() {
        // 取得資料與時間計算
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const lastLoginDate = this.playerData.lastLoginDate || today;
        const lastLoginTime = new Date(this.playerData.lastLoginTime || now);
        const env = this.playerData.tankEnvironment;

        const hoursPassed = (now.getTime() - lastLoginTime.getTime()) / (1000 * 60 * 60);
        const daysPassed = Math.floor((Date.parse(today) - Date.parse(lastLoginDate)) / (1000 * 60 * 60 * 24));

        // 參數設定
        const baseHungerPerHour = 100 / 72; // 基礎飢餓速率
        const BUFFER_DAYS = 2;              // 壞環境持續天數門檻

        // 暫存變數初始化
        let deadFishNames: string[] = [];

        // 環境病症累積初始化
        if (env.badEnvLoginDays == null) {
            env.badEnvLoginDays = 0;
        }

        // 飢餓與成長
        for (const fish of this.playerData.fishList) {
            if (fish.isDead) continue;

            // 套用倍率（自帶倍率 × 生病倍率）
            const mulBase = fish.hungerRateMultiplier ?? 1;
            const mulSick = (fish.status?.sick ? 1.5 : 1); // 生病 1.5 倍
            const effectiveRate = baseHungerPerHour * mulBase * mulSick;

            // 飢餓更新（套用有效倍率）
            fish.hunger += hoursPassed * effectiveRate;
            fish.hunger = Math.min(fish.hunger, 100);

            // 魚飢餓過久而死亡
            if (fish.hunger >= 100) {
                fish.isDead = true;
                fish.deathDate = today;
                fish.emotion = "dead";
                deadFishNames.push(fish.name);
                console.log(`${fish.name} 因飢餓過久而死亡`);
                continue;
            }

            // 成長處理（以整天計）
            if (daysPassed > 0) {
                fish.growthDaysPassed += daysPassed;

                const upgraded = FishLogic.tryStageUpgradeByGrowthDays(fish);
                if (upgraded) {
                    console.log(`${fish.name} 升級為第 ${fish.stage} 階！（自然長大）`);
                }
            }

            // 情緒更新
            if (fish.hunger >= 80) {
                fish.emotion = "hungry";
            }
        }

        // 登入日累加（只在跨日登入時加 1）
        if (env.loginDaysSinceClean == null) env.loginDaysSinceClean = 0;
        if (daysPassed > 0) {
            env.loginDaysSinceClean += 1;
        }

        // 更新環境（水溫與水質）
        if (TankEnvironmentManager.shouldUpdateTemperature(this.playerData)) {
            TankEnvironmentManager.updateTemperature(this.playerData);
        }
        TankEnvironmentManager.checkWaterDirty(this.playerData);

        // 處理魚生病
        if (daysPassed > 0) {
            // 先依當前環境更新連續壞環境登入天數
            if (TankEnvironmentManager.isEnvBad(this.playerData)) {
                env.badEnvLoginDays += 1;
            } else {
                env.badEnvLoginDays = 0; // 環境恢復就重置
            }

            // 達門檻才讓一隻魚生病
            if (env.badEnvLoginDays >= BUFFER_DAYS) {
                const candidates = this.playerData.fishList.filter(f => !f.isDead && !f.status.sick);
                if (candidates.length > 0) {
                    const idx = Math.floor(Math.random() * candidates.length);
                    candidates[idx].status.sick = true;
                    console.log(`環境不良已持續 ${env.badEnvLoginDays} 天，${candidates[idx].name} 生病了`);
                    env.badEnvLoginDays = 0;
                }
            }
        }

        // 魚掰掰通知
        if (deadFishNames.length > 0) {
            const nameList = deadFishNames.join('、');
            const message = `${nameList}\n因為太餓，沒能撐下去...\n但牠的記憶還在某個地方等你`;
            this.showDeathNotice(message);
        }

        // 更新記錄的時間
        this.playerData.lastLoginDate = today;
        this.playerData.lastLoginTime = now.toISOString();
        await DataManager.savePlayerDataWithCache(this.playerData);

        await this.refreshEnvironmentUI();
        console.log(`更新完成：經過 ${hoursPassed.toFixed(2)} 小時，飢餓與成長資料已更新`);
    }

    /** 生成魚的實體節點 */
    async spawnFishInTank(tankId: number) {
        this.fishArea.removeAllChildren(); // 清除上一缸魚
        const tank = this.playerData.tankList.find(t => t.id === tankId);
        if (!tank) {
            console.warn(`找不到魚缸 ${tankId}`);
            return;
        }

        const fishAreaTransform = this.fishArea.getComponent(UITransform);
        const width = fishAreaTransform.width;
        const height = fishAreaTransform.height;
        const margin = 50;

        for (const fishId of tank.fishIds) {
            const fish = this.playerData.fishList.find(f => f.id === fishId);
            if (!fish || fish.isDead) continue;

            let prefab = fish.gender === "female"
                ? this.femaleFishPrefabsByStage[fish.stage - 1]
                : this.maleFishPrefabsByStage[fish.stage - 1];

            if (!prefab) continue;

            const fishNode = instantiate(prefab);
            fishNode.name = `Fish_${fish.id}`;

            // 隨機位置與方向
            const randX = Math.random() * (width - margin * 2) - (width / 2 - margin);
            const randY = Math.random() * (height - margin * 2) - (height / 2 - margin);
            const direction = Math.random() > 0.5 ? 1 : -1;

            fishNode.setPosition(randX, randY, 0);
            fishNode.setScale(new Vec3(direction, 1, 1));
            fishNode["initialDirection"] = direction;

            const swimmingFish = fishNode.getComponent(SwimmingFish);
            swimmingFish?.setFishData(fish);

            this.fishArea.addChild(fishNode);
        }

        this.currentTankId = tankId;
    }

    /** 替換Prefab(變性用) */
    replaceFishNode(fishData: any): Node {
        // 找出原本節點
        const oldFishNode = this.fishArea.getChildByName(`Fish_${fishData.id}`);
        if (!oldFishNode) {
            console.warn(`找不到原魚節點 Fish_${fishData.id}`);
            return null!;
        }
        const oldPos = oldFishNode.getPosition();
        const direction = oldFishNode['initialDirection'] ?? 1;
        oldFishNode.destroy();

        // 根據性別與階段取得 prefab
        const stageIndex = fishData.stage - 1;
        const isMale = fishData.gender === 'male';
        const prefab = isMale
            ? this.maleFishPrefabsByStage[stageIndex]
            : this.femaleFishPrefabsByStage[stageIndex];

        if (!prefab) {
            console.warn(`找不到對應魚 prefab：stage=${fishData.stage}, gender=${fishData.gender}`);
            return null!;
        }

        const newFishNode = instantiate(prefab);
        newFishNode.name = `Fish_${fishData.id}`;
        newFishNode.setPosition(oldPos);
        newFishNode['initialDirection'] = direction;
        newFishNode.setScale(new Vec3(direction, 1, 1));

        this.fishArea.addChild(newFishNode);

        const swimmingFish = newFishNode.getComponent(SwimmingFish);
        if (swimmingFish) {
            swimmingFish.setFishData(fishData);
            swimmingFish.onClickFish?.(); // 讓這隻魚自動成為目前選中的魚
        }

        return newFishNode;
    }

    showDeathNotice(message: string) {
        this.deathNoticeLabel.string = message;
        this.deathNoticePanel.active = true;
    }

    /** 資料刷新 */
    async refreshEnvironmentUI() {
        if (!this.playerData) return;

        const env = this.playerData.tankEnvironment;
        const items = this.playerData.inventory.items;

        // 水溫、水質顯示
        if (this.temperatureLabel) this.temperatureLabel.string = `水溫 : ${env.temperature.toFixed(1)}°C`;
        if (this.waterQualityLabel) this.waterQualityLabel.string = env.waterQualityStatus === 'clean' ? '水質 : 乾淨' : '水質 : 髒';

        // 顯示髒水遮罩
        if (this.dirtyWaterOverlay) {
            this.dirtyWaterOverlay.active = (env.waterQualityStatus !== 'clean');
        }

        // 道具數量
        if (this.heaterCountLabel) this.heaterCountLabel.string = `${items.heater}`;
        if (this.fanCountLabel) this.fanCountLabel.string = `${items.fan}`;
        if (this.brushCountLabel) this.brushCountLabel.string = `${items.brush}`;

        // 按鈕能否點擊
        const isTooCold = env.temperature < this.minComfortTemp;
        const isTooHot = env.temperature > this.maxComfortTemp;

        if (this.heaterBtn) this.heaterBtn.interactable = items.heater > 0 && isTooCold;
        if (this.fanBtn) this.fanBtn.interactable = items.fan > 0 && isTooHot;
        if (this.brushBtn) this.brushBtn.interactable = items.brush > 0; // 刷子不受溫度限制

        this.updateEnvironmentOverlays(env);
    }

    /** 使用加熱器（點擊） */
    async onClickHeater() {
        const items = this.playerData.inventory.items;
        const env = this.playerData.tankEnvironment;

        if (items.heater <= 0) {
            showFloatingTextCenter(this.floatingNode, '加熱器不足');
            return;
        }
        if (env.temperature >= this.minComfortTemp && env.temperature <= this.maxComfortTemp) {
            showFloatingTextCenter(this.floatingNode, '目前水溫正常，無需使用加熱器');
            return;
        }
        if (env.temperature > this.maxComfortTemp) {
            showFloatingTextCenter(this.floatingNode, '目前為高溫狀態，請使用風扇');
            return;
        }
        this.showConfirmDialog('確定要使用加熱器嗎？', () => this.useHeater());
    }

    /** 真正執行加熱器 */
    private async useHeater() {
        const items = this.playerData.inventory.items;
        const env = this.playerData.tankEnvironment;

        if (items.heater <= 0) {
            showFloatingTextCenter(this.floatingNode, '加熱器不足');
            return;
        }
        // 再次保險檢查
        if (env.temperature >= this.minComfortTemp) {
            showFloatingTextCenter(this.floatingNode, '目前水溫不低，不需使用加熱器');
            return;
        }

        items.heater -= 1;
        TankEnvironmentManager.adjustTemperature(this.playerData);

        await DataManager.savePlayerDataWithCache(this.playerData);
        await this.refreshEnvironmentUI();
        showFloatingTextCenter(this.floatingNode, '已使用加熱器');
    }

    /** 使用風扇（點擊） */
    async onClickFan() {
        const items = this.playerData.inventory.items;
        const env = this.playerData.tankEnvironment;

        if (items.fan <= 0) {
            showFloatingTextCenter(this.floatingNode, '風扇不足');
            return;
        }
        if (env.temperature >= this.minComfortTemp && env.temperature <= this.maxComfortTemp) {
            showFloatingTextCenter(this.floatingNode, '目前水溫正常，無需使用風扇');
            return;
        }
        if (env.temperature < this.minComfortTemp) {
            showFloatingTextCenter(this.floatingNode, '目前為低溫狀態，請使用加熱器');
            return;
        }
        this.showConfirmDialog('確定要使用風扇嗎？', () => this.useFan());
    }

    /** 真正執行風扇 */
    private async useFan() {
        const items = this.playerData.inventory.items;
        const env = this.playerData.tankEnvironment;

        if (items.fan <= 0) {
            showFloatingTextCenter(this.floatingNode, '風扇不足');
            return;
        }
        // 再次保險檢查
        if (env.temperature <= this.maxComfortTemp) {
            showFloatingTextCenter(this.floatingNode, '目前水溫不高，不需使用風扇');
            return;
        }

        items.fan -= 1;
        TankEnvironmentManager.adjustTemperature(this.playerData);

        await DataManager.savePlayerDataWithCache(this.playerData);
        await this.refreshEnvironmentUI();
        showFloatingTextCenter(this.floatingNode, '已使用風扇');
    }

    /** 使用魚缸刷（點擊） */
    async onClickBrush() {
        const items = this.playerData.inventory.items;
        const env = this.playerData.tankEnvironment;

        if (items.brush <= 0) {
            showFloatingTextCenter(this.floatingNode, '魚缸刷不足');
            return;
        }
        if (env.waterQualityStatus === "clean") {
            showFloatingTextCenter(this.floatingNode, '目前魚缸很乾淨，無需使用魚缸刷');
            return;
        }

        this.showConfirmDialog('確定要使用魚缸刷嗎？', () => this.useBrush());
    }

    /** 真正執行魚缸刷 */
    private async useBrush() {
        const items = this.playerData.inventory.items;

        if (items.brush <= 0) {
            showFloatingTextCenter(this.floatingNode, '魚缸刷不足');
            return;
        }
        items.brush -= 1;
        TankEnvironmentManager.cleanWater(this.playerData);

        await DataManager.savePlayerDataWithCache(this.playerData);
        await this.refreshEnvironmentUI();
        showFloatingTextCenter(this.floatingNode, '已清潔魚缸');
    }

    private updateEnvironmentOverlays(env: any) {
        const isDirty = env.waterQualityStatus !== 'clean';
        const tooCold = env.temperature < this.minComfortTemp;
        const tooHot = env.temperature > this.maxComfortTemp;

        if (this.dirtyWaterOverlay) this.dirtyWaterOverlay.active = isDirty;
        if (this.coldOverlay) this.coldOverlay.active = !isDirty && tooCold; // 髒水優先
        if (this.hotOverlay) this.hotOverlay.active = !isDirty && tooHot;  // 髒水優先
    }

    private showConfirmDialog(message: string, onConfirm: Function) {
        if (!this.confirmDialogPanel || !this.confirmDialogText) return;
        this.confirmDialogText.string = message;
        this.confirmCallback = onConfirm;
        this.confirmDialogPanel.active = true;
    }

    public showFriendTank(friendData: {
        userId: string, displayName?: string,
        tankEnvironment: any, tankList: any[], fishList: any[]
    }) {

    }

}
