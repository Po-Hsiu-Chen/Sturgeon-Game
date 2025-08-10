import { _decorator, Component, Node, Prefab, instantiate, Sprite, Label, ProgressBar, UITransform, Vec3, Button, tween, UIOpacity } from 'cc';
import { SwimmingFish } from './SwimmingFish';
import { DataManager } from './DataManager';
import { FishLogic } from './FishLogic';
import { TombManager } from './TombManager';
import { TankEnvironmentManager } from './TankEnvironmentManager';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {

    @property(Node) fishArea: Node = null!;  // 魚可以活動的區域
    @property([Prefab]) maleFishPrefabsByStage: Prefab[] = [];  // 公魚：第1~6階
    @property([Prefab]) femaleFishPrefabsByStage: Prefab[] = [];  // 母魚：第1~6階
    @property(Node) signInPanel: Node = null!; // 簽到面板
    @property([Button]) tankButtons: Button[] = [];
    @property(Button) tombTankBtn: Button = null!;
    @property([Node]) tankNodes: Node[] = [];
    @property(Node) tombTankNode: Node = null!;
    @property(TombManager) tombManager: TombManager = null!;

    @property(Node) deathNoticePanel: Node = null!;
    @property(Label) deathNoticeLabel: Label = null!;
    @property(Button) deathNoticeCloseBtn: Button = null!;

    // 環境資訊
    @property(Label) temperatureLabel: Label = null!;
    @property(Label) waterQualityLabel: Label = null!;

    // 道具按鈕
    @property(Button) heaterBtn: Button = null!;
    @property(Button) fanBtn: Button = null!;
    @property(Button) brushBtn: Button = null!;

    // 道具數量顯示
    @property(Label) heaterCountLabel: Label = null!;
    @property(Label) fanCountLabel: Label = null!;
    @property(Label) brushCountLabel: Label = null!;

    // 環境效果
    @property(Node) dirtyWaterOverlay: Node = null!;
    @property(Node) coldOverlay: Node = null!;
    @property(Node) hotOverlay: Node = null!;  

    // 溫度區間
    @property minComfortTemp: number = 18; 
    @property maxComfortTemp: number = 23; 

    // 確認提示視窗
    @property(Node) confirmDialogPanel: Node = null!;
    @property(Label) confirmDialogText: Label = null!;
    @property(Node) confirmDialogYesButton: Node = null!;
    @property(Node) confirmDialogNoButton: Node = null!;

    @property(Node) floatingNode: Node = null!;

    private confirmCallback: Function | null = null;
    private currentTankId: number = 1;

    /** 初始化 */
    async start() {
        await DataManager.ensureInitialized(); // 初始化資料
        await this.processDailyUpdate();       // 更新魚的狀態

        this.initButtons();
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

        await this.switchTank(1);              // 預設顯示主魚缸
        await this.tombManager?.init();

        if (this.signInPanel) {
            this.signInPanel.active = true;    // 預設打開簽到面板
        } 
        this.deathNoticeCloseBtn.node.on(Node.EventType.TOUCH_END, () => {
            this.deathNoticePanel.active = false;
        });

        await this.refreshEnvironmentUI();
    }

    initButtons() {
        this.tankButtons.forEach((btn, index) => {
            btn.node.on(Node.EventType.TOUCH_END, () => {
                this.switchTank(index + 1);
            });
        });

        this.tombTankBtn.node.on(Node.EventType.TOUCH_END, () => {
            this.switchToTombTank();
        });

        this.heaterBtn?.node.on(Node.EventType.TOUCH_END, () => this.onClickHeater());
        this.fanBtn?.node.on(Node.EventType.TOUCH_END, () => this.onClickFan());
        this.brushBtn?.node.on(Node.EventType.TOUCH_END, () => this.onClickBrush());
    }

    async switchTank(tankId: number) {
        this.tankNodes.forEach((node, idx) => {
            node.active = (idx + 1) === tankId;
        });
        this.tombTankNode.active = false;

        this.fishArea.removeAllChildren();
        const playerData = await DataManager.getPlayerData();
        const tank = playerData.tankList.find(t => t.id === tankId);
        if (!tank) {
            console.warn(`找不到魚缸 ${tankId}`);
            return;
        }

        const area = this.fishArea.getComponent(UITransform)!;
        const width = area.width;
        const height = area.height;
        const margin = 50;

        for (const fishId of tank.fishIds) {
            const fish = playerData.fishList.find(f => f.id === fishId);
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
        const playerData = await DataManager.getPlayerData();
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const lastLoginDate = playerData.lastLoginDate || today;
        const lastLoginTime = new Date(playerData.lastLoginTime || now);
        const env = playerData.tankEnvironment;

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
        for (const fish of playerData.fishList) {
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
        if (TankEnvironmentManager.shouldUpdateTemperature(playerData)) {
            TankEnvironmentManager.updateTemperature(playerData);
        }
        TankEnvironmentManager.checkWaterDirty(playerData);

        // 處理魚生病
        if (daysPassed > 0) {
            // 先依當前環境更新連續壞環境登入天數
            if (TankEnvironmentManager.isEnvBad(playerData)) {
                env.badEnvLoginDays += 1;
            } else {
                env.badEnvLoginDays = 0; // 環境恢復就重置
            }

            // 達門檻才讓一隻魚生病
            if (env.badEnvLoginDays >= BUFFER_DAYS) {
                const candidates = playerData.fishList.filter(f => !f.isDead && !f.status.sick);
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
        playerData.lastLoginDate = today;
        playerData.lastLoginTime = now.toISOString();
        await DataManager.savePlayerData(playerData);

        await this.refreshEnvironmentUI();
        console.log(`更新完成：經過 ${hoursPassed.toFixed(2)} 小時，飢餓與成長資料已更新`);
    }

    /** 生成魚的實體節點 */
    async spawnFishInTank(tankId: number) {
        this.fishArea.removeAllChildren(); // 清除上一缸魚

        const playerData = await DataManager.getPlayerData();
        const tank = playerData.tankList.find(t => t.id === tankId);
        if (!tank) {
            console.warn(`找不到魚缸 ${tankId}`);
            return;
        }

        const fishAreaTransform = this.fishArea.getComponent(UITransform);
        const width = fishAreaTransform.width;
        const height = fishAreaTransform.height;
        const margin = 50;

        for (const fishId of tank.fishIds) {
            const fish = playerData.fishList.find(f => f.id === fishId);
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
        const playerData = await DataManager.getPlayerData();
        if (!playerData) return;

        const env = playerData.tankEnvironment;
        const items = playerData.inventory.items;

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
        const isTooHot  = env.temperature > this.maxComfortTemp;

        if (this.heaterBtn) this.heaterBtn.interactable = items.heater > 0 && isTooCold;
        if (this.fanBtn)    this.fanBtn.interactable    = items.fan    > 0 && isTooHot;
        if (this.brushBtn)  this.brushBtn.interactable  = items.brush  > 0; // 刷子不受溫度限制

        this.updateEnvironmentOverlays(env);
    }

    /** 使用加熱器（點擊） */
    async onClickHeater() {
        const playerData = await DataManager.getPlayerData();
        const items = playerData.inventory.items;
        const env = playerData.tankEnvironment;

        if (items.heater <= 0) {
            this.showFloatingTextCenter('加熱器不足');
            return;
        }
        if (env.temperature >= this.minComfortTemp && env.temperature <= this.maxComfortTemp) {
            this.showFloatingTextCenter('目前水溫正常，無需使用加熱器');
            return;
        }
        if (env.temperature > this.maxComfortTemp) {
            this.showFloatingTextCenter('目前為高溫狀態，請使用風扇');
            return;
        }
        this.showConfirmDialog('確定要使用加熱器嗎？', () => this.useHeater());
    }

    /** 真正執行加熱器 */
    private async useHeater() {
        const playerData = await DataManager.getPlayerData();
        const items = playerData.inventory.items;
        const env = playerData.tankEnvironment;

        if (items.heater <= 0) {
            this.showFloatingTextCenter('加熱器不足');
            return;
        }
        // 再次保險檢查
        if (env.temperature >= this.minComfortTemp) {
            this.showFloatingTextCenter('目前水溫不低，不需使用加熱器');
            return;
        }

        items.heater -= 1;
        TankEnvironmentManager.adjustTemperature(playerData);

        await DataManager.savePlayerData(playerData);
        await this.refreshEnvironmentUI();
        this.showFloatingTextCenter('已使用加熱器');
    }

    /** 使用風扇（點擊） */
    async onClickFan() {
        const playerData = await DataManager.getPlayerData();
        const items = playerData.inventory.items;
        const env = playerData.tankEnvironment;

        if (items.fan <= 0) {
            this.showFloatingTextCenter('風扇不足');
            return;
        }
        if (env.temperature >= this.minComfortTemp && env.temperature <= this.maxComfortTemp) {
            this.showFloatingTextCenter('目前水溫正常，無需使用風扇');
            return;
        }
        if (env.temperature < this.minComfortTemp) {
            this.showFloatingTextCenter('目前為低溫狀態，請使用加熱器');
            return;
        }
        this.showConfirmDialog('確定要使用風扇嗎？', () => this.useFan());
    }

    /** 真正執行風扇 */
    private async useFan() {
        const playerData = await DataManager.getPlayerData();
        const items = playerData.inventory.items;
        const env = playerData.tankEnvironment;

        if (items.fan <= 0) {
            this.showFloatingTextCenter('風扇不足');
            return;
        }
        // 再次保險檢查
        if (env.temperature <= this.maxComfortTemp) {
            this.showFloatingTextCenter('目前水溫不高，不需使用風扇');
            return;
        }

        items.fan -= 1;
        TankEnvironmentManager.adjustTemperature(playerData);

        await DataManager.savePlayerData(playerData);
        await this.refreshEnvironmentUI();
        this.showFloatingTextCenter('已使用風扇');
    }

    /** 使用魚缸刷（點擊） */
    async onClickBrush() {
        const playerData = await DataManager.getPlayerData();
        const items = playerData.inventory.items;

        if (items.brush <= 0) {
            this.showFloatingTextCenter('魚缸刷不足');
            return;
        }
        this.showConfirmDialog('確定要使用魚缸刷嗎？', () => this.useBrush());
    }

    /** 真正執行魚缸刷 */
    private async useBrush() {
        const playerData = await DataManager.getPlayerData();
        const items = playerData.inventory.items;

        if (items.brush <= 0) {
            this.showFloatingTextCenter('魚缸刷不足');
            return;
        }

        items.brush -= 1;
        TankEnvironmentManager.cleanWater(playerData);

        await DataManager.savePlayerData(playerData);
        await this.refreshEnvironmentUI();
        this.showFloatingTextCenter('已清潔魚缸');
    }

    private updateEnvironmentOverlays(env: any) {
        const isDirty = env.waterQualityStatus !== 'clean';
        const tooCold = env.temperature < this.minComfortTemp;
        const tooHot  = env.temperature > this.maxComfortTemp;

        if (this.dirtyWaterOverlay) this.dirtyWaterOverlay.active = isDirty;
        if (this.coldOverlay) this.coldOverlay.active = !isDirty && tooCold; // 髒水優先
        if (this.hotOverlay)  this.hotOverlay.active  = !isDirty && tooHot;  // 髒水優先
    }

    showFloatingTextCenter(text: string) {
        const node = this.floatingNode;
        const label = node?.getComponentInChildren(Label);
        const uiOpacity = node?.getComponent(UIOpacity);

        if (!node || !label || !uiOpacity) {
            console.warn('floatingNode 缺少 Node / Label / UIOpacity 元件');
            return;
        }

        // 停掉先前動畫
        tween(node).stop();
        tween(uiOpacity).stop();

        label.string = text;
        node.active = true;
        uiOpacity.opacity = 0;

        const startPos = new Vec3(0, 0, 0);
        const endPos = new Vec3(0, 30, 0);

        node.setPosition(startPos);

        // 淡入 -> 停留 -> 淡出
        tween(uiOpacity)
            .to(0.3, { opacity: 255 })
            .delay(1.2) // 道具提示可比墓園短一點
            .to(0.4, { opacity: 0 })
            .call(() => node.active = false)
            .start();

        // 上浮位移
        tween(node)
            .to(1.2, { position: endPos }, { easing: 'quadOut' })
            .start();
    }

    private showConfirmDialog(message: string, onConfirm: Function) {
        if (!this.confirmDialogPanel || !this.confirmDialogText) return;
        this.confirmDialogText.string = message;
        this.confirmCallback = onConfirm;
        this.confirmDialogPanel.active = true;
    }
}
