import { _decorator, Component, Node, Prefab, instantiate, Sprite, Label, UITransform, Vec3, Button, SpriteFrame, ImageAsset, Texture2D, Color } from 'cc';
import { SwimmingFish } from './SwimmingFish';
import { DataManager, FishData, PlayerData } from './DataManager';
import { FishLogic } from './FishLogic';
import { TombManager } from './TombManager';
import { TankEnvironmentManager } from './TankEnvironmentManager';
import { showFloatingTextCenter } from './utils/UIUtils';
import { initLiff, getIdentity } from './bridge/LiffBridge';
import { authWithLine } from './api/Api';
import { ConfirmDialogManager } from './ConfirmDialogManager';

const { ccclass, property } = _decorator;
const LIFF_ID = '2007937783-PJ4ZRBdY';
const RED = new Color(255, 0, 0, 255);    // 紅色
const GREEN = new Color(120, 198, 80, 255);  // 綠色
const BLUE = new Color(0, 0, 255, 255);   // 藍色

const TankAssets = {
    backgrounds: new Map<string, SpriteFrame>(),
    decorations: new Map<string, Prefab>(),
};

@ccclass('GameManager')
export class GameManager extends Component {
    @property(Node) floatingNode: Node = null!;                 // 提示浮動訊息
    @property(ConfirmDialogManager) confirmDialogManager: ConfirmDialogManager = null!;
    @property(TombManager) tombManager: TombManager = null!;
    
    // 魚缸與魚類
    @property(Node) activeTankViewport: Node = null!;
    @property(Node) fishArea: Node = null!;                     // 魚活動區域
    @property(SpriteFrame) defaultBackgroundSpriteFrame: SpriteFrame = null!; // 預設魚缸背景
    @property([Prefab]) maleFishPrefabsByStage: Prefab[] = [];  // 公魚：第 1~6 階
    @property([Prefab]) femaleFishPrefabsByStage: Prefab[] = [];// 母魚：第 1~6 階
    @property([Button]) tankButtons: Button[] = [];             // 魚缸按鈕
    @property(Button) tombTankBtn: Button = null!;              // 墓地魚缸按鈕
    @property(Node) tombTankNode: Node = null!;                 // 墓地魚缸節點

    // 顯示玩家資料
    @property(Label) userNameLabel: Label = null!;              // 龍骨數量
    @property(Label) userIdLabel: Label = null!;                // 使用者ID
    @property(Sprite) userAvatar: Sprite = null!;               // 使用者頭貼
    @property(SpriteFrame) defaultAvatar: SpriteFrame = null!;  // 預設頭貼
    @property(Label) dragonboneLabel: Label = null!;            // 龍骨數量
    @property(Label) fishCountLabel: Label = null!;             // 魚數量

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

    // 簽到面板
    @property(Node) signInPanel: Node = null!;

    // 提示面板
    @property(Node) noticePanel: Node = null!;                  // 通知面板
    @property(Label) noticeLabel: Label = null!;                // 通知面板文字
    @property(Button) noticeCloseBtn: Button = null!;           // 通知面板關閉按鈕
    @property(Node) tombHintPanel: Node = null!;                // 墓地提示面板
    @property(Button) tombHintCloseBtn: Button = null!;         // 墓地提示關閉按鈕

    @property(Button) backToMyTankBtn: Button = null!;          // 返回自己魚缸按鈕
    @property(Node) mailboxRedDot: Node = null!;                // Mail未讀紅點點

    private currentTankId: number = 1;                       // 當前魚缸 ID
    private offDMChange: (() => void) | null = null;
    private playerData: PlayerData | null = null;
    private isViewingFriend = false;
    private viewingFriend: Pick<PlayerData, 'tankList' | 'fishList' | 'tankEnvironment' | 'userId' | 'displayName'> | null = null;
    private lastNoticeType: 'none' | 'death' | 'env' = 'none';

    /** 初始化 */
    async start() {
        const urlParams = new URLSearchParams(window.location.search);
        const forceDev = urlParams.get('dev') === '1';
        const devUid = urlParams.get('uid') || 'DEV_LOCAL';

        try {
            if (forceDev) {
                // 開發模式：直連本地後端
                console.warn('[Game] DEV 模式');
                DataManager.useLocalStorage = false;
                DataManager.apiBase = 'http://localhost:3000';
                await DataManager.init(devUid);
            } else {
                // 正常模式：LINE LIFF 登入
                await initLiff(LIFF_ID);
                const { idToken } = await getIdentity();
                if (!idToken) throw new Error('取不到 idToken，請用 LINE App / LIFF URL 開啟');
                const { lineUserId } = await authWithLine(idToken);
                await DataManager.init(lineUserId);
            }
            this.playerData = await DataManager.getPlayerDataCached();
        } catch (e) {
            console.error('[Game] 啟動失敗：', e);
            return;
        }

        if (!this.playerData) {
            console.error('玩家資料讀取失敗');
            return;
        }

        // 監聽信箱紅點事件並初始化
        this.node.scene?.on('mailbox-refreshed', this.onMailboxRefreshed, this);
        this.refreshMailboxBadge();

        // 初始化流程
        await this.processDailyUpdate();
        this.initButtons();
        this.initPanels();
        await this.switchTank(1);
        await this.tombManager?.init();
        await this.refreshEnvironmentUI();
        this.maybeShowEnvNoticeOnEnter();

        // 玩家資料變動時即時刷新 UI
        this.offDMChange = DataManager.onChange((p) => {
            this.playerData = p;
            void this.refreshEnvironmentUI();
        });

        // 顯示玩家資訊
        this.userNameLabel.string = this.playerData.displayName || "未命名";
        this.userIdLabel.string = this.playerData.userId || "";
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
            btn.node.on(Node.EventType.TOUCH_END, () => this.onClickTankButton(index));
        });

        // 墓園魚缸
        this.tombTankBtn.node.on(Node.EventType.TOUCH_END, () => this.switchToTombTank());

        // 道具按鈕
        this.heaterBtn?.node.on(Node.EventType.TOUCH_END, () => this.onClickHeater());
        this.fanBtn?.node.on(Node.EventType.TOUCH_END, () => this.onClickFan());
        this.brushBtn?.node.on(Node.EventType.TOUCH_END, () => this.onClickBrush());

        // 返回按鈕
        this.backToMyTankBtn?.node.on(Node.EventType.TOUCH_END, () => this.backToMyTank());
    }

    /** 初始化面板事件與狀態 */
    initPanels() {
        // 簽到面板
        if (this.signInPanel) this.signInPanel.active = true;

        // NoticePanel 關閉邏輯：依通知類型處理
        this.noticeCloseBtn.node.on(Node.EventType.TOUCH_END, () => {
            this.noticePanel.active = false;

            if (this.lastNoticeType === 'death') {
                this.tombHintPanel.active = true;   // 死亡才提示墓地
            }
            this.lastNoticeType = 'none';
        });

        this.tombHintCloseBtn.node.on(Node.EventType.TOUCH_END, () => {
            this.tombHintPanel.active = false;
        });

        // 隱藏返回按鈕
        if (this.backToMyTankBtn) this.backToMyTankBtn.node.active = false;
    }

    private getActiveViewport(): Node {
        return this.activeTankViewport ?? this.node; // 總是用共用視窗來畫
    }

    /** 把任何一個 tank 畫進指定容器 */
    private renderTankView(params: {
        container: Node;
        tank: { id: number; backgroundId?: string; decorations?: any[]; fishIds: number[] };
        fishList: FishData[];
        malePrefabs: Prefab[];
        femalePrefabs: Prefab[];
        envForEmotion: any;
        readOnly: boolean;
    }) {
        const { container, tank, fishList, malePrefabs, femalePrefabs, envForEmotion, readOnly } = params;
        const bgNode = container.getChildByName('Background');
        const decoLayer = container.getChildByName('DecoLayer');  // 可能不存在
        const fishArea = container.getChildByName('FishArea') || this.fishArea; // 保底用 GameManager 的 fishArea

        // ---- 背景（可選）----
        if (bgNode) {
            const bgSprite = bgNode.getComponent(Sprite);
            if (bgSprite) {
                const sf = (tank.backgroundId && TankAssets.backgrounds.get(tank.backgroundId))
                    || this.defaultBackgroundSpriteFrame;
                if (sf) bgSprite.spriteFrame = sf;
            }
        }

        // ---- 裝飾（可選）----
        if (decoLayer) {
            decoLayer.removeAllChildren();
            for (const d of (tank.decorations ?? [])) {
                const prefab = TankAssets.decorations.get(d.id);
                if (!prefab) continue;
                const n = instantiate(prefab);
                n.setPosition(d.x ?? 0, d.y ?? 0, 0);
                const sx = (d.flipX ? -1 : 1) * (d.scale ?? 1);
                const sy = d.scale ?? 1;
                n.setScale(sx, sy, 1);
                n.setRotationFromEuler(0, 0, d.rotation ?? 0);
                if (typeof d.zIndex === 'number') n.setSiblingIndex(d.zIndex);
                decoLayer.addChild(n);
            }
        }

        // ---- 魚 ----
        fishArea.removeAllChildren();
        const area = fishArea.getComponent(UITransform);
        if (!area) return; // 沒有 UITransform 就不要畫，避免 crash

        const width = area.width, height = area.height, margin = 50;

        for (const fid of (tank.fishIds ?? [])) {
            const fish = fishList.find(f => f.id === fid);
            if (!fish || fish.isDead) continue;

            const si = Math.max(0, (fish.stage || 1) - 1);
            const prefab = fish.gender === 'female' ? femalePrefabs[si] : malePrefabs[si];
            if (!prefab) continue;

            const node = instantiate(prefab);
            node.name = `Fish_${fish.id}`;

            // 只呼叫一次 setFishData，並把唯讀與環境一併傳入
            const comp = node.getComponent(SwimmingFish);
            comp?.setFishData(fish, { readOnly, env: envForEmotion });

            // 位置/方向
            const dir = Math.random() > 0.5 ? 1 : -1;
            node.setPosition(
                Math.random() * (width - margin * 2) - (width / 2 - margin),
                Math.random() * (height - margin * 2) - (height / 2 - margin),
                0
            );
            node.setScale(dir, 1, 1);
            (node as any).initialDirection = dir;

            fishArea.addChild(node);
        }
    }

    private onClickTankButton(index: number) {
        if (this.isViewingFriend && this.viewingFriend) {
            this.renderFriendTankByIndex(index);
        } else {
            this.switchTank(index + 1);
        }
    }

    /** 顯示自己的缸 */
    async switchTank(tankId: number) {
        this.isViewingFriend = false;

        this.playerData = await DataManager.getPlayerDataCached();
        const tank = this.playerData?.tankList.find(t => t.id === tankId);
        if (!tank) return;

        this.activeTankViewport.active = true;  // 顯示主視圖
        this.tombTankNode.active = false;       // 關閉墓園

        // 換回自己的頭像／名字／ID、隱藏返回鈕
        await this.setHeaderUser(this.playerData.displayName, this.playerData.userId, this.playerData.picture);
        if (this.backToMyTankBtn) this.backToMyTankBtn.node.active = false;

        this.currentTankId = tankId;

        this.renderTankView({
            container: this.activeTankViewport,
            tank,
            fishList: this.playerData!.fishList,
            malePrefabs: this.maleFishPrefabsByStage,
            femalePrefabs: this.femaleFishPrefabsByStage,
            envForEmotion: this.playerData!.tankEnvironment,    // 用自己的環境
            readOnly: false                                     // 自己的魚非唯讀
        });
        await this.refreshEnvironmentUI();
    }

    /** 顯示朋友魚缸 */
    public showFriendTank(friend: Pick<PlayerData, 'tankList' | 'fishList' | 'tankEnvironment' | 'userId' | 'displayName'>) {
        this.isViewingFriend = true;
        this.viewingFriend = friend;

        const firstTank = friend.tankList?.[0];
        if (!firstTank) { showFloatingTextCenter(this.floatingNode, '這位好友還沒有魚缸'); return; }

        // 換成朋友頭像／名字／ID、顯示返回鈕
        this.setHeaderUser(friend.displayName || friend.userId, friend.userId, (friend as any).picture);
        if (this.backToMyTankBtn) this.backToMyTankBtn.node.active = true;

        // 隱藏墓地按鈕、遮蔽金錢
        if (this.tombTankBtn) this.tombTankBtn.node.active = false;
        if (this.dragonboneLabel) this.dragonboneLabel.string = '保密';

        const viewport = this.getActiveViewport();
        this.renderTankView({
            container: viewport,
            tank: firstTank,
            fishList: friend.fishList,
            malePrefabs: this.maleFishPrefabsByStage,
            femalePrefabs: this.femaleFishPrefabsByStage,
            envForEmotion: friend.tankEnvironment,
            readOnly: true
        });

        const env = friend.tankEnvironment;
        this.updateEnvironmentOverlays(env);

        // 溫度：數值 + 色彩（藍／綠／紅）
        if (this.temperatureLabel) {
            this.temperatureLabel.string = `${env.temperature.toFixed(1)}°C`;
            if (env.temperature < this.minComfortTemp) {
                this.temperatureLabel.color = BLUE;
            } else if (env.temperature > this.maxComfortTemp) {
                this.temperatureLabel.color = RED;
            } else {
                this.temperatureLabel.color = GREEN;
            }
        }

        // 水質：Clean / Dirty + 色彩（綠／紅）
        if (this.waterQualityLabel) {
            this.waterQualityLabel.string = (env.waterQualityStatus === 'clean') ? 'Clean' : 'Dirty';
            this.waterQualityLabel.color = (env.waterQualityStatus === 'clean') ? GREEN : RED;
        }

        showFloatingTextCenter(this.floatingNode, `${friend.displayName || friend.userId} 的魚缸`);
    }

    private renderFriendTankByIndex(idx: number) {
        if (!this.viewingFriend) return;
        const friend = this.viewingFriend;
        const tank = friend.tankList?.[idx];
        if (!tank) {
            showFloatingTextCenter(this.floatingNode, '這個朋友沒有此魚缸');
            return;
        }

        const viewport = this.getActiveViewport();
        this.renderTankView({
            container: viewport,
            tank,
            fishList: friend.fishList,
            malePrefabs: this.maleFishPrefabsByStage,
            femalePrefabs: this.femaleFishPrefabsByStage,
            envForEmotion: friend.tankEnvironment,
            readOnly: true,
        });

        // 溫度 / 水質顯示（用自己頁面一致的風格）
        const env = friend.tankEnvironment;
        this.updateEnvironmentOverlays(env);
        if (this.temperatureLabel) {
            this.temperatureLabel.string = `${env.temperature.toFixed(1)}°C`;
            this.temperatureLabel.color =
                env.temperature < this.minComfortTemp ? BLUE :
                    env.temperature > this.maxComfortTemp ? RED : GREEN;
        }
        if (this.waterQualityLabel) {
            this.waterQualityLabel.string = env.waterQualityStatus === 'clean' ? 'Clean' : 'Dirty';
            this.waterQualityLabel.color = env.waterQualityStatus === 'clean' ? GREEN : RED;
        }

        // 朋友的金錢顯示遮蔽
        if (this.dragonboneLabel) this.dragonboneLabel.string = '保密';
    }

    async switchToTombTank() {
        this.activeTankViewport.active = false; // 關閉主視圖
        this.tombTankNode.active = true;        // 顯示墓園

        // 墓地魚缸不顯示環境遮罩
        if (this.dirtyWaterOverlay) this.dirtyWaterOverlay.active = false;
        if (this.coldOverlay) this.coldOverlay.active = false;
        if (this.hotOverlay) this.hotOverlay.active = false;

        await this.tombManager?.refreshTombs();
    }

    /** 回到自己的第一缸 */
    private async backToMyTank() {
        this.isViewingFriend = false;
        this.viewingFriend = null; // 清掉朋友狀態
        if (this.tombTankBtn) this.tombTankBtn.node.active = true; // 顯示墓地按鈕回來
        if (this.backToMyTankBtn) this.backToMyTankBtn.node.active = false;
        await this.switchTank(1);
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
            this.showNotice(message, 'death');
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

    showNotice(message: string, type: 'death' | 'env' = 'env') {
        this.lastNoticeType = type;
        this.noticeLabel.string = message;
        this.noticePanel.active = true;
    }


    /** 資料刷新 */
    async refreshEnvironmentUI() {
        if (!this.playerData) return;

        const env = this.playerData.tankEnvironment;
        const items = this.playerData.inventory.items;

        // 水溫、水質顯示
        if (this.temperatureLabel) this.temperatureLabel.string = `${env.temperature.toFixed(1)}°C`;
        if (env.temperature < this.minComfortTemp) {
            this.temperatureLabel.color = BLUE; // 冷
        } else if (env.temperature > this.maxComfortTemp) {
            this.temperatureLabel.color = RED;  // 熱
        }
        else {
            this.temperatureLabel.color = GREEN; // 正常
        }

        if (this.waterQualityLabel) this.waterQualityLabel.string = env.waterQualityStatus === 'clean' ? 'Clean' : 'Dirty';
        if (this.waterQualityLabel) this.waterQualityLabel.color = env.waterQualityStatus === 'clean' ? GREEN : RED;

        // 顯示髒水遮罩
        if (this.dirtyWaterOverlay) {
            this.dirtyWaterOverlay.active = (env.waterQualityStatus !== 'clean');
        }

        //顯示龍骨數量
        if (this.dragonboneLabel) this.dragonboneLabel.string = this.playerData.dragonBones.toString();

        //顯示魚數量
        if (this.fishCountLabel) this.fishCountLabel.string = this.playerData.fishList.length.toString();

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

    /** 首次進入時，如環境異常則用 NoticePanel 提醒（死亡優先，不覆蓋） */
    private maybeShowEnvNoticeOnEnter() {
        if (!this.playerData) return;

        // 不在自己缸、不在主視圖時不提示
        if (this.isViewingFriend) return;
        if (this.tombTankNode?.active) return;

        // 如果已經有死亡通知在畫面上，就不要蓋掉（優先權：death > env）
        if (this.noticePanel?.active && this.lastNoticeType === 'death') return;

        const env = this.playerData.tankEnvironment;
        const tooCold = env.temperature < this.minComfortTemp;
        const tooHot = env.temperature > this.maxComfortTemp;
        const isDirty = env.waterQualityStatus !== 'clean';

        // 依優先序：髒 > 冷 > 熱
        if (isDirty) {
            this.showNotice('魚缸髒髒的～快用魚缸刷清潔魚缸', 'env');
            return;
        }
        if (tooCold) {
            this.showNotice('魚缸好冷呀～快用加熱器升溫', 'env');
            return;
        }
        if (tooHot) {
            this.showNotice('魚缸快煮沸啦～快用風扇降溫救救小魚', 'env');
            return;
        }
    }

    async onDestroy() {
        this.offDMChange?.();
        this.offDMChange = null;
        this.node.scene?.off('mailbox-refreshed', this.onMailboxRefreshed, this);

    }

    /** 收到 MailboxPanel 廣播時的處理 */
    private onMailboxRefreshed = ({ unread }: { unread: number }) => {
        this.applyMailboxBadge(unread);
    };

    /** 進入遊戲時主動抓一次未讀數 */
    private async refreshMailboxBadge() {
        try {
            const all = await DataManager.getInbox();
            const unread = all.filter(x => x.status === 'unread').length;
            this.applyMailboxBadge(unread);
        } catch (e) {
            // 拿不到就先關掉紅點
            this.applyMailboxBadge(0);
        }
    }

    /** 控制紅點 */
    private applyMailboxBadge(unread: number) {
        if (this.mailboxRedDot) {
            this.mailboxRedDot.active = unread > 0;
        }
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
        const ok = await this.confirmDialogManager.ask('確定要使用加熱器嗎？');
        if (!ok) return;
        await this.useHeater();
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
        const ok = await this.confirmDialogManager.ask('確定要使用風扇嗎？');
        if (!ok) return;
        await this.useFan();
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
        const ok = await this.confirmDialogManager.ask('確定要使用魚缸刷嗎？');
        if (!ok) return;
        await this.useBrush();
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
        // 墓地魚缸不顯示遮罩
        if (this.tombTankNode && this.tombTankNode.active) {
            if (this.dirtyWaterOverlay) this.dirtyWaterOverlay.active = false;
            if (this.coldOverlay) this.coldOverlay.active = false;
            if (this.hotOverlay) this.hotOverlay.active = false;
            return;
        }

        const isDirty = env.waterQualityStatus !== 'clean';
        const tooCold = env.temperature < this.minComfortTemp;
        const tooHot = env.temperature > this.maxComfortTemp;

        if (this.dirtyWaterOverlay) this.dirtyWaterOverlay.active = isDirty;
        if (this.coldOverlay) this.coldOverlay.active = !isDirty && tooCold; // 髒水優先
        if (this.hotOverlay) this.hotOverlay.active = !isDirty && tooHot;  // 髒水優先
    }

    private async setHeaderUser(displayName: string, userId: string, picture?: string) {
        this.userNameLabel.string = displayName || "未命名";
        this.userIdLabel.string = userId || "";

        if (picture) {
            await this.loadAvatar(picture);
        } else {
            this.userAvatar.spriteFrame = this.defaultAvatar;
        }
    }

}
