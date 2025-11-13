import {
  _decorator,
  Component,
  Node,
  Prefab,
  instantiate,
  Sprite,
  Label,
  UITransform,
  Vec3,
  Button,
  SpriteFrame,
  ImageAsset,
  Texture2D,
  Color,
  UIOpacity,
  resources,
} from "cc";
import { SwimmingFish } from "./SwimmingFish";
import { DataManager, FishData, PlayerData } from "./DataManager";
import { FishLogic } from "./FishLogic";
import { TombManager } from "./TombManager";
import { TankEnvironmentManager } from "./TankEnvironmentManager";
import { showFloatingTextCenter } from "./utils/UIUtils";
import { initLiff, getIdentity } from "./bridge/LiffBridge";
import { authWithLine } from "./api/Api";
import { ConfirmDialogManager } from "./ConfirmDialogManager";
import { DecorationEditor } from "./decoration/DecorationEditor";
import { FishFamilyService, IGameAdapter } from "./marry/FishFamilyService";
import { FriendPanel } from "./FriendPanel";
import { BackgroundAnimator } from "./decoration/BackgroundAnimator";

const { ccclass, property } = _decorator;

// -----------------------------常數 / 類別屬性--------------------------------
const LIFF_ID = "2007937783-PJ4ZRBdY";
const RED = new Color(255, 0, 0, 255); // 紅色
const GREEN = new Color(120, 198, 80, 255); // 綠色
const BLUE = new Color(0, 0, 255, 255); // 藍色

const COST_ADD_DIRECT = 80; // 第二缸後直接加魚
const COST_ADD_BABY = 50; // 生魚寶寶

const TankAssets = {
  backgrounds: new Map<string, SpriteFrame>(),
  decorations: new Map<string, Prefab>(),
};

@ccclass("GameManager")
export class GameManager extends Component {
  @property(Node) floatingNode: Node = null!; // 提示浮動訊息
  @property(ConfirmDialogManager) confirmDialogManager: ConfirmDialogManager = null!;
  @property(TombManager) tombManager: TombManager = null!;

  // 魚缸與魚類
  @property(Node) activeTankViewport: Node = null!;
  @property(Node) fishArea: Node = null!; // 魚活動區域
  @property(SpriteFrame) defaultBackgroundSpriteFrame: SpriteFrame = null!; // 預設魚缸背景
  @property([Prefab]) maleFishPrefabsByStage: Prefab[] = []; // 公魚：第 1~6 階
  @property([Prefab]) femaleFishPrefabsByStage: Prefab[] = []; // 母魚：第 1~6 階
  @property([Prefab]) maleStage6FormPrefabs: Prefab[] = []; // 公魚：第 6 階醜魚
  @property([Prefab]) femaleStage6FormPrefabs: Prefab[] = []; // 母魚：第 6 階醜魚
  @property([Button]) tankButtons: Button[] = []; // 魚缸按鈕
  @property(Button) tombTankBtn: Button = null!; // 墓地魚缸按鈕
  @property(Node) tombTankNode: Node = null!; // 墓地魚缸節點

  // 顯示玩家資料
  @property(Label) userNameLabel: Label = null!; // 龍骨數量
  @property(Label) gameIdLabel: Label = null!; // 使用者ID
  @property(Sprite) userAvatar: Sprite = null!; // 使用者頭貼
  @property(SpriteFrame) defaultAvatar: SpriteFrame = null!; // 預設頭貼
  @property(Label) dragonboneLabel: Label = null!; // 龍骨數量
  @property(Label) fishCountLabel: Label = null!; // 魚數量

  // 環境資訊
  @property(Label) temperatureLabel: Label = null!; // 溫度顯示
  @property(Label) waterQualityLabel: Label = null!; // 水質顯示
  @property minComfortTemp: number = 18; // 最低舒適溫度
  @property maxComfortTemp: number = 23; // 最高舒適溫度

  // 道具
  @property(Button) heaterBtn: Button = null!; // 加熱器按鈕
  @property(Button) fanBtn: Button = null!; // 風扇按鈕
  @property(Button) brushBtn: Button = null!; // 魚缸刷按鈕
  @property(Label) heaterCountLabel: Label = null!; // 加熱器數量
  @property(Label) fanCountLabel: Label = null!; // 風扇數量
  @property(Label) brushCountLabel: Label = null!; // 魚缸刷數量

  // 環境效果
  @property(Node) dirtyWaterOverlay: Node = null!; // 髒
  @property(Node) coldOverlay: Node = null!; // 冷
  @property(Node) hotOverlay: Node = null!; // 熱

  // 簽到相關
  @property(Button) singInBtn: Button = null!;
  @property(Node) signInPanel: Node = null!;

  // 提示面板
  @property(Node) noticePanel: Node = null!; // 通知面板
  @property(Label) noticeLabel: Label = null!; // 通知面板文字
  @property(Button) noticeCloseBtn: Button = null!; // 通知面板關閉按鈕
  @property(Node) tombHintPanel: Node = null!; // 墓地提示面板
  @property(Button) tombHintCloseBtn: Button = null!; // 墓地提示關閉按鈕

  @property(Button) backToMyTankBtn: Button = null!; // 返回自己魚缸按鈕
  @property(Button) mailBoxBtn: Button = null!;
  @property(Node) mailboxRedDot: Node = null!; // Mail未讀紅點點
  @property(Button) addFishBtn: Button = null!; // 加魚按鈕

  @property(Label) tankFishCountLabel: Label = null!; // 顯示魚數量/上限

  @property(Button) decorEditBtn: Button = null!; // 「裝飾」編輯按鈕（只在自己缸顯示）
  @property(DecorationEditor) decorEditor: DecorationEditor = null!;

  private currentTankId: number = 1; // 當前魚缸 ID
  private offDMChange: (() => void) | null = null;
  private playerData: PlayerData | null = null;
  private isViewingFriend = false;
  private viewingFriend: Pick<
    PlayerData,
    "tankList" | "fishList" | "tankEnvironment" | "userId" | "displayName"
  > | null = null;
  private lastNoticeType: "none" | "death" | "env" = "none";
  private family!: FishFamilyService;

  // 第六階成魚型態的順序（要和 Inspector 中兩個 Prefab 陣列順序完全一致）
  private readonly ADULT_FORM_ORDER: FishData["adultForm"][] = [
    "form1", // Normal
    "form2", // 大眼魚
    "form3", // 胖鯉魚
    "form4", // 骨頭魚
  ];

  private getAdultFormDisplayName(form?: FishData["adultForm"]): string {
    const map: Record<string, string> = {
      form1: "Normal",
      form2: "大眼魚",
      form3: "胖鯉魚",
      form4: "骨頭魚",
    };
    return form ? map[form] ?? "未知型態" : "未知型態";
  }

  /** 依裝飾 id 取 Prefab（交給 DecorationEditor 使用） */
  public getDecorationPrefab(id: string) {
    return TankAssets.decorations?.get(id);
  }

  private _breedingInProgress = false;
  private friendSnapshot: PlayerData[] = [];
  // -----------------------------生命週期 / 啟動流程--------------------------------
  async onLoad() {
    // === Marriage/Breeding Adapter START ===
    const adapter: IGameAdapter = {
      // 回傳我的玩家資料
      getMyPlayer: () => this.playerData!,

      // 由 gameId 取得玩家（好友）。如果你有好友快取，就從那裡取；沒有就先回 null。
      getPlayerByGameId: (gameId: string) => {
        const fp = this.node.scene.getComponentInChildren(FriendPanel) as FriendPanel | null;
        const fromPanel = fp?.getAllFriendPlayerData()?.find((f) => f.gameId === gameId) || null;
        if (fromPanel) return fromPanel;
        return this.friendSnapshot?.find((f) => f.gameId === gameId) || null;
      },
      saveOtherPlayer: async (other: PlayerData) => {
        await fetch(`${DataManager.apiBase}/player/${encodeURIComponent(other.userId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(other),
        });
      },
      // 存檔
      saveMyPlayer: async (reason: string) => {
        await DataManager.savePlayerDataWithCache(this.playerData);
      },

      toast: (msg: string) => {
        showFloatingTextCenter(this.floatingNode, msg);
      },

      // 目前操作的魚缸 id（你現有切換邏輯的當前缸）
      getCurrentTankId: () => this.currentTankId,

      // GameManager.ts -> initFamilyService() 內的 adapter
      addBabyFishToTank: async (targetOwnerGameId: string, tankId: number) => {
        // 1) 自己 → 沿用原本流程（0成本，因為服務層已扣 COST_BIRTH）
        if (targetOwnerGameId === this.playerData!.gameId) {
          await this.commitAddFish(tankId, 0, "魚寶寶誕生啦！");
          return -1;
        }

        // 好友 → 直接改好友 PlayerData（你已經把 canMutateOtherPlayer 設成 true）
        // 從 FriendPanel 或 friendSnapshot 找到目標好友資料（內含 fishList、tankList）
        const fp = this.node.scene.getComponentInChildren(FriendPanel) as FriendPanel | null;
        const allFriends = fp?.getAllFriendPlayerData?.() ?? this.friendSnapshot ?? [];
        const other = allFriends.find((f) => f.gameId === targetOwnerGameId);
        if (!other) {
          console.warn("[breed] 找不到好友 PlayerData，略過好友寶寶派發");
          return -1;
        }

        // 選一個可用的魚缸：優先用呼叫方的 tankId；沒有就 fallback to 1
        let targetTankId = tankId;
        if (!other.tankList.some((t) => t.id === targetTankId)) {
          targetTankId = 1;
        }

        // 檢查空位（理論上前面 canBreed 已檢查，但再保險一次）
        const cap = other.tankList.find((t) => t.id === targetTankId)?.capacity ?? (targetTankId === 1 ? 3 : 6);
        const alive = other.tankList
          .find((t) => t.id === targetTankId)!
          .fishIds.map((id) => other.fishList.find((f) => f.id === id))
          .filter((f): f is FishData => !!f && !f.isDead).length;
        if (alive >= cap) {
          console.warn("[breed] 好友指定魚缸已滿，改發到 1 號缸");
          targetTankId = 1;
        }

        // 產生一隻 1 階寶寶魚，push 到好友 fishList 與對應 tank.fishIds
        const nextId = (other.fishList.reduce((m, f) => Math.max(m, f.id), 0) || 0) + 1;
        const genders: Array<"male" | "female"> = ["male", "female"];
        const baby: FishData = {
          id: nextId,
          name: `鱘龍${nextId}號`,
          gender: genders[Math.floor(Math.random() * genders.length)],
          stage: 1,
          growthDaysPassed: 0,
          lastFedDate: new Date().toISOString(),
          hunger: 50,
          hungerRateMultiplier: 1,
          appearance: "beautiful",
          outfit: { head: null, accessories: [] },
          isMarried: false,
          spouseId: null,
          status: { hungry: false, hot: false, cold: false, sick: false },
          emotion: "happy",
          isDead: false,
          tankId: targetTankId,
          spouseOwnerGameId: null,
          marriedAt: null,
        };

        other.fishList.push(baby);
        const targetTank = other.tankList.find((t) => t.id === targetTankId)!;
        targetTank.fishIds.push(baby.id);

        // 寫回後端（你已經有 saveOtherPlayer 的 API 打法）
        await fetch(`${DataManager.apiBase}/player/${encodeURIComponent(other.userId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(other),
        });

        // 不需要切換當前畫面，因此不呼叫 this.switchTank
        return baby.id;
      },

      // 計算某玩家的所有魚缸空位總數
      countEmptySlots: (owner: PlayerData) => {
        let total = 0;
        for (const t of owner.tankList) {
          const cap = t.capacity ?? (t.id === 1 ? 3 : 6);
          const alive = t.fishIds
            .map((id) => owner.fishList.find((f) => f.id === id))
            .filter((f): f is FishData => !!f && !f.isDead).length;
          total += Math.max(0, cap - alive);
        }
        return total;
      },
      canMutateOtherPlayer: (_gameId: string) => true,

      // 寄系統信（讓好友上線時領寶寶或套用婚姻）
      enqueueMailFor: async (gameId: string, subject: string, payload: any) => {
        // TODO: 這裡接你現有的 Mail 系統；先留白不影響本地測試
        // await DataManager.sendMail({ to: gameId, subject, payload });
      },
    };
    // 建立服務實例
    this.family = new FishFamilyService(adapter);
  }

  async start() {
    const urlParams = new URLSearchParams(window.location.search);
    const forceDev = urlParams.get("dev") === "1";
    const devUid = urlParams.get("uid") || "DEV_LOCAL";

    try {
      if (forceDev) {
        // 開發模式：直連本地後端
        console.warn("[Game] DEV 模式");
        DataManager.useLocalStorage = false;
        DataManager.apiBase = "http://localhost:3000";
        await DataManager.init(devUid);
      } else {
        // 正常模式：LINE LIFF 登入
        await initLiff(LIFF_ID);
        const { idToken } = await getIdentity();
        if (!idToken) throw new Error("取不到 idToken，請用 LINE App / LIFF URL 開啟");
        const { lineUserId } = await authWithLine(idToken);
        await DataManager.init(lineUserId);
      }
      await this.preloadDecorationPrefabs();
      await this.preloadBackgroundSpriteFrames();
      this.playerData = await DataManager.getPlayerDataCached();
      await this.initCapsAndRules();
    } catch (e) {
      console.error("[Game] 啟動失敗：", e);
      return;
    }

    if (!this.playerData) {
      console.error("玩家資料讀取失敗");
      return;
    }

    // 監聽信箱紅點事件並初始化
    this.node.scene?.on("mailbox-refreshed", this.onMailboxRefreshed, this);
    this.refreshMailboxBadge();
    const friendPanel = this.node.scene.getComponentInChildren(FriendPanel) as FriendPanel | null;
    if (friendPanel) {
      await friendPanel.refreshFriendCandidates(); // 預載一次
      this.friendSnapshot = friendPanel.getAllFriendPlayerData(); // 存快照

      // 同步之後的更新（搭配步驟1）
      friendPanel.node.on("friends-refreshed", (list: PlayerData[]) => {
        this.friendSnapshot = list || [];
        console.log("[GM] friendSnapshot updated, size =", this.friendSnapshot.length);
      });
    }
    // 初始化流程
    await this.processDailyUpdate();
    this.initButtons();
    this.initPanels();
    await this.switchTank(1);
    this.updateAddFishBtnState();
    this.updateTankFishCountLabel();
    await this.tombManager?.init();
    await this.refreshEnvironmentUI();
    this.maybeShowEnvNoticeOnEnter();

    // 玩家資料變動時跑解鎖檢查、UI 更新
    this.offDMChange = DataManager.onChange(async (p) => {
      await this.handlePlayerDataChange(p, "dm-change");
    });

    // 顯示玩家資訊
    this.userNameLabel.string = this.playerData.displayName || "未命名";
    this.gameIdLabel.string = `ID: ${this.playerData.gameId || this.playerData.userId || ""}`;
    if (this.playerData.picture) {
      this.loadAvatar(this.playerData.picture);
    } else {
      this.userAvatar.spriteFrame = this.defaultAvatar;
    }
  }

  async onDestroy() {
    this.offDMChange?.();
    this.offDMChange = null;
    this.node.scene?.off("mailbox-refreshed", this.onMailboxRefreshed, this);
  }

  /** 載入頭貼 */
  async loadAvatar(url: string) {
    try {
      const res = await fetch(url, { mode: "cors" });
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

  private async setHeaderUser(displayName: string, gameId: string, picture?: string) {
    this.userNameLabel.string = displayName || "未命名";
    this.gameIdLabel.string = gameId || "";

    if (picture) {
      await this.loadAvatar(picture);
    } else {
      this.userAvatar.spriteFrame = this.defaultAvatar;
    }
  }

  private async preloadDecorationPrefabs() {
    return new Promise<void>((resolve) => {
      resources.loadDir("decorations", Prefab, (err, list) => {
        if (!err && list) {
          list.forEach((pf) => TankAssets.decorations.set(pf.name, pf)); // pf.name 就是 deco_xxx
        } else {
          console.warn("[Decor] 沒載到 decorations：", err);
        }
        resolve();
      });
    });
  }
  // -----------------------------UI 初始化--------------------------------

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

    this.decorEditBtn?.node.on(Node.EventType.TOUCH_END, async () => {
      // 朋友缸/墓地不可編輯
      if (this["isViewingFriend"] || this.tombTankNode?.active) {
        showFloatingTextCenter(this.floatingNode, "此狀態不可編輯裝飾");
        return;
      }
      // 進入編輯器（把目前缸 id 傳進去）
      this.decorEditor?.enter?.(this, this["currentTankId"]);
    });

    // 返回按鈕
    this.backToMyTankBtn?.node.on(Node.EventType.TOUCH_END, () => this.backToMyTank());

    // 加魚按鈕
    this.addFishBtn.node.on(Node.EventType.TOUCH_END, async () => {
      await this.onClickAddFish();
    });
  }

  /** 初始化面板事件與狀態 */
  initPanels() {
    // 簽到面板
    if (this.signInPanel) this.signInPanel.active = true;

    // NoticePanel 關閉邏輯：依通知類型處理
    this.noticeCloseBtn.node.on(Node.EventType.TOUCH_END, () => {
      this.noticePanel.active = false;

      if (this.lastNoticeType === "death") {
        this.tombHintPanel.active = true; // 死亡才提示墓地
      }
      this.lastNoticeType = "none";
    });

    this.tombHintCloseBtn.node.on(Node.EventType.TOUCH_END, () => {
      this.tombHintPanel.active = false;
    });

    // 隱藏返回按鈕
    if (this.backToMyTankBtn) this.backToMyTankBtn.node.active = false;
  }

  /** 收到 MailboxPanel 廣播時的處理 */
  private onMailboxRefreshed = ({ unread }: { unread: number }) => {
    this.applyMailboxBadge(unread);
  };

  /** 進入遊戲時主動抓一次未讀數 */
  private async refreshMailboxBadge() {
    try {
      const all = await DataManager.getInbox();
      const unread = all.filter((x) => x.status === "unread").length;
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

  // -----------------------------場景切換與渲染--------------------------------

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
    const bgNode = container.getChildByName("Background");
    const decoLayer = container.getChildByName("DecoLayer"); // 可能不存在
    const fishArea = container.getChildByName("FishArea") || this.fishArea; // 保底用 GameManager 的 fishArea

    // ---- 背景（可選）----
    if (bgNode) {
      const animator = bgNode.getComponent(BackgroundAnimator);
      const bgSprite = bgNode.getComponent(Sprite);

      if (animator) {
        // 有動畫腳本 → 交給它處理不同背景
        const bgId = tank.backgroundId; // 例如 'bg_azure'，沒設就是 undefined
        animator.setBackground(bgId);

        // 沒有自訂背景時，可用預設 frames 或預設靜態圖
        if (!bgId && bgSprite && animator.frames.length === 0 && this.defaultBackgroundSpriteFrame) {
          bgSprite.spriteFrame = this.defaultBackgroundSpriteFrame;
        }
      } else if (bgSprite) {
        // 沒掛動畫 → 沿用原本靜態背景邏輯
        const sf =
          (tank.backgroundId && TankAssets.backgrounds.get(tank.backgroundId)) || this.defaultBackgroundSpriteFrame;
        if (sf) bgSprite.spriteFrame = sf;
      }
    }

    // ---- 裝飾（可選）----
    if (decoLayer) {
      decoLayer.removeAllChildren();
      for (const d of tank.decorations ?? []) {
        const prefab = TankAssets.decorations.get(d.id);
        if (!prefab) continue;
        const n = instantiate(prefab);
        n.name = `Deco_${d.id}`;
        n.setPosition(d.x ?? 0, d.y ?? 0, 0);
        const sx = (d.flipX ? -1 : 1) * (d.scale ?? 1);
        const sy = d.scale ?? 1;
        n.setScale(sx, sy, 1);
        n.setRotationFromEuler(0, 0, d.rotation ?? 0);
        if (typeof d.zIndex === "number") n.setSiblingIndex(d.zIndex);
        decoLayer.addChild(n);
      }
    }

    // ---- 魚 ----
    fishArea.removeAllChildren();
    const area = fishArea.getComponent(UITransform);
    if (!area) return; // 沒有 UITransform 就不要畫，避免 crash

    const width = area.width,
      height = area.height,
      margin = 50;
    const uniqIds = Array.from(new Set(tank.fishIds ?? []));
    for (const fid of uniqIds) {
      const fish = fishList.find((f) => f.id === fid);
      if (!fish || fish.isDead) continue;

      const si = Math.max(0, (fish.stage || 1) - 1);
      let prefab: Prefab | undefined;

      if (fish.stage === 6 && fish.adultForm) {
        const formIndex = this.formToIndex(fish.adultForm);
        const list = fish.gender === "female" ? this.femaleStage6FormPrefabs : this.maleStage6FormPrefabs;
        prefab = list[formIndex] ?? list[0]; // 保底
      } else {
        prefab = fish.gender === "female" ? femalePrefabs[si] : malePrefabs[si];
      }

      if (!prefab) continue;

      const node = instantiate(prefab);
      node.name = `Fish_${fish.id}`;

      // 只呼叫一次 setFishData，並把唯讀與環境一併傳入
      const comp = node.getComponent(SwimmingFish);
      comp?.setFishData(fish, { readOnly, env: envForEmotion });
      comp?.refreshOutfit();

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

  /** 預載背景 */
  private async preloadBackgroundSpriteFrames() {
    return new Promise<void>((resolve) => {
      resources.loadDir("backgrounds", SpriteFrame, (err, list) => {
        if (!err && list) {
          list.forEach((sf) => TankAssets.backgrounds.set(sf.name, sf)); // sf.name 如：bg_sandy
        } else {
          console.warn("[BG] 沒載到 backgrounds：", err);
        }
        resolve();
      });
    });
  }

  /** 顯示自己的缸 */
  async switchTank(tankId: number) {
    this.isViewingFriend = false;

    this.playerData = await DataManager.getPlayerDataCached();
    const tank = this.playerData?.tankList.find((t) => t.id === tankId);
    if (!tank) return;

    this.activeTankViewport.active = true; // 顯示主視圖
    this.tombTankNode.active = false; // 關閉墓園

    // 換回自己的名字/ID/頭像、隱藏返回鈕
    await this.setHeaderUser(
      this.playerData.displayName,
      this.playerData.gameId || this.playerData.userId,
      this.playerData.picture
    );
    if (this.backToMyTankBtn) this.backToMyTankBtn.node.active = false;

    this.currentTankId = tankId;

    this.renderTankView({
      container: this.activeTankViewport,
      tank,
      fishList: this.playerData!.fishList,
      malePrefabs: this.maleFishPrefabsByStage,
      femalePrefabs: this.femaleFishPrefabsByStage,
      envForEmotion: this.playerData!.tankEnvironment, // 用自己的環境
      readOnly: false, // 自己的魚非唯讀
    });
    this.applyFriendViewUI(false);
    this.updateTankFishCountLabel();
    this.updateAddFishBtnState();
    await this.refreshEnvironmentUI();
    this.updateTankButtons();
  }

  /** 顯示朋友魚缸 */
  public showFriendTank(
    friend: Pick<PlayerData, "tankList" | "fishList" | "tankEnvironment" | "userId" | "displayName">
  ) {
    this.isViewingFriend = true;
    this.viewingFriend = friend;

    // 切出主視圖、關掉墓地
    this.activeTankViewport.active = true; // 顯示主視圖（朋友的魚缸會畫在這裡）
    this.tombTankNode.active = false; // 關閉墓地視圖

    const firstTank = friend.tankList?.[0];
    if (!firstTank) {
      showFloatingTextCenter(this.floatingNode, "這位好友還沒有魚缸");
      return;
    }

    // 換成朋友頭像／名字／ID、顯示返回鈕
    this.setHeaderUser(
      (friend as any).displayName || (friend as any).gameId || friend.userId,
      (friend as any).gameId || friend.userId,
      (friend as any).picture
    );

    if (this.backToMyTankBtn) this.backToMyTankBtn.node.active = true;

    // 換 header 後
    this.applyFriendViewUI(true);
    this.updateTankButtons();

    const viewport = this.getActiveViewport();
    this.renderTankView({
      container: viewport,
      tank: firstTank,
      fishList: friend.fishList,
      malePrefabs: this.maleFishPrefabsByStage,
      femalePrefabs: this.femaleFishPrefabsByStage,
      envForEmotion: friend.tankEnvironment,
      readOnly: true,
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
      this.waterQualityLabel.string = env.waterQualityStatus === "clean" ? "Clean" : "Dirty";
      this.waterQualityLabel.color = env.waterQualityStatus === "clean" ? GREEN : RED;
    }

    showFloatingTextCenter(
      this.floatingNode,
      `${friend.displayName || (friend as any).gameId || friend.userId} 的魚缸`
    );
  }

  private renderFriendTankByIndex(idx: number) {
    if (!this.viewingFriend) return;
    const friend = this.viewingFriend;
    const tank = friend.tankList?.[idx];
    if (!tank) {
      showFloatingTextCenter(this.floatingNode, "朋友的這個魚缸還沒解鎖喔～");
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
        env.temperature < this.minComfortTemp ? BLUE : env.temperature > this.maxComfortTemp ? RED : GREEN;
    }
    if (this.waterQualityLabel) {
      this.waterQualityLabel.string = env.waterQualityStatus === "clean" ? "Clean" : "Dirty";
      this.waterQualityLabel.color = env.waterQualityStatus === "clean" ? GREEN : RED;
    }

    // 朋友的金錢顯示遮蔽
    if (this.dragonboneLabel) this.dragonboneLabel.string = "保密";
  }

  async switchToTombTank() {
    this.activeTankViewport.active = false; // 關閉主視圖
    this.tombTankNode.active = true; // 顯示墓園

    if (this.dirtyWaterOverlay) this.dirtyWaterOverlay.active = false;
    if (this.coldOverlay) this.coldOverlay.active = false;
    if (this.hotOverlay) this.hotOverlay.active = false;

    this.updateAddFishBtnState();
    await this.tombManager?.refreshTombs();
  }

  /** 回到自己的第一缸 */
  private async backToMyTank() {
    this.isViewingFriend = false;
    this.viewingFriend = null; // 清掉朋友狀態
    await this.switchTank(1);
  }

  /** 依目前視圖（自己/朋友）更新 Tank_1~3 的數字、鎖頭與可點狀態 */
  private updateTankButtons() {
    const totalOpened = this.isViewingFriend
      ? this.viewingFriend?.tankList?.length ?? 0
      : this.playerData?.tankList?.length ?? 0;

    this.tankButtons.forEach((btn, i) => {
      const n = btn.node;
      // 標號
      const label = n.getChildByName("Label")?.getComponent(Label);
      if (label) label.string = String(i + 1);

      // 是否已開這一缸（index 從 0 開始）
      const unlocked = i < totalOpened;

      // 鎖頭顯示
      const lockNode = n.getChildByName("padlock");
      if (lockNode) lockNode.active = !unlocked;

      // 是否可點
      btn.interactable = unlocked;
    });
  }

  /** 依是否為朋友魚缸切換 UI 顯示/隱藏 */
  private applyFriendViewUI(isFriend: boolean) {
    if (this.tombTankBtn) this.tombTankBtn.node.active = !isFriend;
    if (this.backToMyTankBtn) this.backToMyTankBtn.node.active = isFriend;
    if (this.decorEditBtn) this.decorEditBtn.node.active = !isFriend;
    if (this.singInBtn) this.singInBtn.node.active = !isFriend;
    if (this.addFishBtn) this.addFishBtn.node.active = !isFriend;
    if (this.mailBoxBtn) this.mailBoxBtn.node.active = !isFriend;

    // 龍骨數字
    if (this.dragonboneLabel) {
      this.dragonboneLabel.string = isFriend ? "保密" : this.playerData?.dragonBones?.toString() ?? "0";
    }
  }

  // -----------------------------每日流程 / 環境顯示--------------------------------

  /** 處理魚飢餓與成長 */
  async processDailyUpdate() {
    // 取得資料與時間計算
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const lastLoginDate = this.playerData.lastLoginDate || today;
    const lastLoginTime = new Date(this.playerData.lastLoginTime || now);
    const env = this.playerData.tankEnvironment;

    const hoursPassed = (now.getTime() - lastLoginTime.getTime()) / (1000 * 60 * 60);
    const daysPassed = Math.floor((Date.parse(today) - Date.parse(lastLoginDate)) / (1000 * 60 * 60 * 24));

    // 參數設定
    const baseHungerPerHour = 100 / 72; // 基礎飢餓速率
    const BUFFER_DAYS = 2; // 壞環境持續天數門檻

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
      const mulSick = fish.status?.sick ? 1.5 : 1; // 生病 1.5 倍
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

        // 當某魚死亡後：
        const deadFish = fish;
        this.family.dissolveOnDeath(deadFish);
        await DataManager.savePlayerDataWithCache(this.playerData);

        continue;
      }

      // 成長處理（以整天計）
      if (daysPassed > 0) {
        fish.growthDaysPassed += daysPassed;

        const upgraded = FishLogic.tryStageUpgradeByGrowthDays(fish);
        if (upgraded) {
          console.log(`${fish.name} 升級為第 ${fish.stage} 階！（自然長大）`);
          // 第六階決定形態 + 通知
          if (fish.stage === 6 && !fish.adultForm) {
            fish.adultForm = this.pickAdultForm(fish, this.playerData);
            const formName = this.getAdultFormDisplayName(fish.adultForm);
            this.showNotice(`${fish.name} 已成為第六階，屬於「${formName}」型態！`, "env");
          }
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
        const candidates = this.playerData.fishList.filter((f) => !f.isDead && !f.status.sick);
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
      const nameList = deadFishNames.join("、");
      const message = `${nameList}\n因為太餓，沒能撐下去...\n但牠的記憶還在某個地方等你`;
      this.showNotice(message, "death");
    }

    // 更新記錄的時間
    this.playerData.lastLoginDate = today;
    this.playerData.lastLoginTime = now.toISOString();

    await this.checkAndUnlockCapacityForFirstTank();
    await this.checkAndUnlockNextTankIfEligible(1);
    await this.checkAndUnlockNextTankIfEligible(2);

    await DataManager.savePlayerDataWithCache(this.playerData);

    await this.refreshEnvironmentUI();
    this.updateTankFishCountLabel();
    this.updateAddFishBtnState();

    console.log(`更新完成：經過 ${hoursPassed.toFixed(2)} 小時，飢餓與成長資料已更新`);
  }

  /** 玩家資料變更後的後處理：解鎖檢查＋UI 更新（避免重入） */
  private _handlingDMChange = false;
  private async handlePlayerDataChange(p?: PlayerData, reason: string = "dm-change") {
    if (this._handlingDMChange) return;
    this._handlingDMChange = true;
    try {
      if (p) this.playerData = p;

      // 跑一次解鎖檢查（包含：第一缸 3→5、以及可能的開新缸）
      await this.checkAndUnlockCapacityForFirstTank();
      await this.checkAndUnlockNextTankIfEligible(1);
      await this.checkAndUnlockNextTankIfEligible(2);

      // 更新畫面（不要在這裡 switchTank，以免多重渲染或觸發連鎖）
      await this.refreshEnvironmentUI();
      this.updateTankFishCountLabel();
      this.updateAddFishBtnState();

      // 可選：如果當前在墓地頁，叫墓地刷新一次（讓被復活的魚立刻消失）
      await this.tombManager?.refreshTombs?.();
    } finally {
      this._handlingDMChange = false;
    }
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
      this.temperatureLabel.color = RED; // 熱
    } else {
      this.temperatureLabel.color = GREEN; // 正常
    }

    if (this.waterQualityLabel) this.waterQualityLabel.string = env.waterQualityStatus === "clean" ? "Clean" : "Dirty";
    if (this.waterQualityLabel) this.waterQualityLabel.color = env.waterQualityStatus === "clean" ? GREEN : RED;

    // 顯示髒水遮罩
    if (this.dirtyWaterOverlay) {
      this.dirtyWaterOverlay.active = env.waterQualityStatus !== "clean";
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

  private updateEnvironmentOverlays(env: any) {
    // 墓地魚缸不顯示遮罩
    if (this.tombTankNode && this.tombTankNode.active) {
      if (this.dirtyWaterOverlay) this.dirtyWaterOverlay.active = false;
      if (this.coldOverlay) this.coldOverlay.active = false;
      if (this.hotOverlay) this.hotOverlay.active = false;
      return;
    }

    const isDirty = env.waterQualityStatus !== "clean";
    const tooCold = env.temperature < this.minComfortTemp;
    const tooHot = env.temperature > this.maxComfortTemp;

    if (this.dirtyWaterOverlay) this.dirtyWaterOverlay.active = isDirty;
    if (this.coldOverlay) this.coldOverlay.active = !isDirty && tooCold; // 髒水優先
    if (this.hotOverlay) this.hotOverlay.active = !isDirty && tooHot; // 髒水優先
  }

  /** 首次進入時，如環境異常則用 NoticePanel 提醒（死亡優先，不覆蓋） */
  private maybeShowEnvNoticeOnEnter() {
    if (!this.playerData) return;

    // 不在自己缸、不在主視圖時不提示
    if (this.isViewingFriend) return;
    if (this.tombTankNode?.active) return;

    // 如果已經有死亡通知在畫面上，就不要蓋掉（優先權：death > env）
    if (this.noticePanel?.active && this.lastNoticeType === "death") return;

    const env = this.playerData.tankEnvironment;
    const tooCold = env.temperature < this.minComfortTemp;
    const tooHot = env.temperature > this.maxComfortTemp;
    const isDirty = env.waterQualityStatus !== "clean";

    // 依優先序：髒 > 冷 > 熱
    if (isDirty) {
      this.showNotice("魚缸髒髒的～快用魚缸刷清潔魚缸", "env");
      return;
    }
    if (tooCold) {
      this.showNotice("魚缸好冷呀～快用加熱器升溫", "env");
      return;
    }
    if (tooHot) {
      this.showNotice("魚缸快煮沸啦～快用風扇降溫救救小魚", "env");
      return;
    }
  }

  showNotice(message: string, type: "death" | "env" = "env") {
    this.lastNoticeType = type;
    this.noticeLabel.string = message;
    this.noticePanel.active = true;
  }

  // -----------------------------道具使用--------------------------------

  /** 使用加熱器（點擊） */
  async onClickHeater() {
    const items = this.playerData.inventory.items;
    const env = this.playerData.tankEnvironment;

    if (items.heater <= 0) {
      showFloatingTextCenter(this.floatingNode, "加熱器庫存不足");
      return;
    }
    if (env.temperature >= this.minComfortTemp && env.temperature <= this.maxComfortTemp) {
      showFloatingTextCenter(this.floatingNode, "目前水溫正常，無需使用加熱器");
      return;
    }
    if (env.temperature > this.maxComfortTemp) {
      showFloatingTextCenter(this.floatingNode, "目前為高溫狀態，請使用風扇");
      return;
    }
    const ok = await this.confirmDialogManager.ask("確定要使用加熱器嗎？");
    if (!ok) return;
    await this.useHeater();
  }

  /** 真正執行加熱器 */
  private async useHeater() {
    const items = this.playerData.inventory.items;
    const env = this.playerData.tankEnvironment;

    if (items.heater <= 0) {
      showFloatingTextCenter(this.floatingNode, "加熱器庫存不足");
      return;
    }
    // 再次保險檢查
    if (env.temperature >= this.minComfortTemp) {
      showFloatingTextCenter(this.floatingNode, "目前水溫不低，不需使用加熱器");
      return;
    }

    items.heater -= 1;
    TankEnvironmentManager.adjustTemperature(this.playerData);

    await DataManager.savePlayerDataWithCache(this.playerData);
    await this.refreshEnvironmentUI();
    showFloatingTextCenter(this.floatingNode, "已使用加熱器");
  }

  /** 使用風扇（點擊） */
  async onClickFan() {
    const items = this.playerData.inventory.items;
    const env = this.playerData.tankEnvironment;

    if (items.fan <= 0) {
      showFloatingTextCenter(this.floatingNode, "風扇庫存不足");
      return;
    }
    if (env.temperature >= this.minComfortTemp && env.temperature <= this.maxComfortTemp) {
      showFloatingTextCenter(this.floatingNode, "目前水溫正常，無需使用風扇");
      return;
    }
    if (env.temperature < this.minComfortTemp) {
      showFloatingTextCenter(this.floatingNode, "目前為低溫狀態，請使用加熱器");
      return;
    }
    const ok = await this.confirmDialogManager.ask("確定要使用風扇嗎？");
    if (!ok) return;
    await this.useFan();
  }

  /** 真正執行風扇 */
  private async useFan() {
    const items = this.playerData.inventory.items;
    const env = this.playerData.tankEnvironment;

    if (items.fan <= 0) {
      showFloatingTextCenter(this.floatingNode, "風扇庫存不足");
      return;
    }
    // 再次保險檢查
    if (env.temperature <= this.maxComfortTemp) {
      showFloatingTextCenter(this.floatingNode, "目前水溫不高，不需使用風扇");
      return;
    }

    items.fan -= 1;
    TankEnvironmentManager.adjustTemperature(this.playerData);

    await DataManager.savePlayerDataWithCache(this.playerData);
    await this.refreshEnvironmentUI();
    showFloatingTextCenter(this.floatingNode, "已使用風扇");
  }

  /** 使用魚缸刷（點擊） */
  async onClickBrush() {
    const items = this.playerData.inventory.items;
    const env = this.playerData.tankEnvironment;

    if (items.brush <= 0) {
      showFloatingTextCenter(this.floatingNode, "魚缸刷庫存不足");
      return;
    }
    if (env.waterQualityStatus === "clean") {
      showFloatingTextCenter(this.floatingNode, "目前魚缸很乾淨，無需使用魚缸刷");
      return;
    }
    const ok = await this.confirmDialogManager.ask("確定要使用魚缸刷嗎？");
    if (!ok) return;
    await this.useBrush();
  }

  /** 真正執行魚缸刷 */
  private async useBrush() {
    const items = this.playerData.inventory.items;

    if (items.brush <= 0) {
      showFloatingTextCenter(this.floatingNode, "魚缸刷庫存不足");
      return;
    }
    items.brush -= 1;
    TankEnvironmentManager.cleanWater(this.playerData);

    await DataManager.savePlayerDataWithCache(this.playerData);
    await this.refreshEnvironmentUI();
    showFloatingTextCenter(this.floatingNode, "已清潔魚缸");
  }

  // -----------------------------魚的呈現 / 節點替換--------------------------------

  /** 生成魚的實體節點 */
  async spawnFishInTank(tankId: number) {
    this.fishArea.removeAllChildren(); // 清除上一缸魚
    const tank = this.playerData.tankList.find((t) => t.id === tankId);
    if (!tank) {
      console.warn(`找不到魚缸 ${tankId}`);
      return;
    }

    const fishAreaTransform = this.fishArea.getComponent(UITransform);
    const width = fishAreaTransform.width;
    const height = fishAreaTransform.height;
    const margin = 50;

    for (const fishId of tank.fishIds) {
      const fish = this.playerData.fishList.find((f) => f.id === fishId);
      if (!fish || fish.isDead) continue;

      let prefab =
        fish.gender === "female"
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
    const direction = oldFishNode["initialDirection"] ?? 1;
    oldFishNode.destroy();

    // 根據性別與階段取得 prefab
    const stageIndex = fishData.stage - 1;
    let prefab: Prefab | undefined;

    if (fishData.stage === 6 && fishData.adultForm) {
      const formIndex = this.formToIndex(fishData.adultForm);
      prefab =
        fishData.gender === "female" ? this.femaleStage6FormPrefabs[formIndex] : this.maleStage6FormPrefabs[formIndex];
    } else {
      prefab =
        fishData.gender === "male"
          ? this.maleFishPrefabsByStage[stageIndex]
          : this.femaleFishPrefabsByStage[stageIndex];
    }

    if (!prefab) {
      console.warn(`找不到對應魚 prefab：stage=${fishData.stage}, gender=${fishData.gender}`);
      return null!;
    }

    const newFishNode = instantiate(prefab);
    newFishNode.name = `Fish_${fishData.id}`;
    newFishNode.setPosition(oldPos);
    newFishNode["initialDirection"] = direction;
    newFishNode.setScale(new Vec3(direction, 1, 1));

    this.fishArea.addChild(newFishNode);

    const swimmingFish = newFishNode.getComponent(SwimmingFish);
    if (swimmingFish) {
      swimmingFish.setFishData(fishData);
      swimmingFish.onClickFish?.(); // 讓這隻魚自動成為目前選中的魚
    }

    return newFishNode;
  }

  // -----------------------------成長/解鎖規則--------------------------------

  /** 針對舊資料補預設值 + 規則初始化 */
  private async initCapsAndRules() {
    if (!this.playerData) return;

    // 為每個缸補 capacity：第一缸預設3，其它缸預設6
    for (const tank of this.playerData.tankList) {
      if (tank.capacity == null) {
        tank.capacity = tank.id === 1 ? 3 : 6;
      }
    }

    // 若當前只有第一缸，且已達「3隻≥3階」，就把第一缸容量升到6
    await this.checkAndUnlockCapacityForFirstTank();

    // 若符合開新缸條件，幫玩家補開（最多到3缸）
    await this.checkAndUnlockNextTankIfEligible(1); // 先看第一缸
    await this.checkAndUnlockNextTankIfEligible(2); // 若已經有第二缸，也檢查第二缸
  }

  /** 取某缸的 Fish 物件陣列（排除死亡） */
  private getAliveFishInTank(tankId: number) {
    const tank = this.playerData?.tankList.find((t) => t.id === tankId);
    if (!tank || !this.playerData) return [];
    return tank.fishIds
      .map((id) => this.playerData!.fishList.find((f) => f.id === id))
      .filter((f) => f && !f.isDead) as typeof this.playerData.fishList;
  }

  /** 是否有尚未復活的死亡魚（全帳號） */
  private hasDeadFish(): boolean {
    return !!this.playerData?.fishList.some((f) => f.isDead);
  }

  /** 若只有第一缸，且第一缸3隻都≥3階 → 將第一缸 capacity 從3升到6 */
  private async checkAndUnlockCapacityForFirstTank() {
    if (!this.playerData) return;
    if (this.playerData.tankList.length !== 1) return; // 只在「只有第一缸」時有效

    const tank1 = this.playerData.tankList.find((t) => t.id === 1);
    if (!tank1) return;

    if ((tank1.capacity ?? 3) >= 6) return; // 已經6就不用動

    // 至少有 3 隻達標
    const fish = this.getAliveFishInTank(1);
    const allGte3 = fish.length > 0 && fish.every((f) => (f.stage ?? 1) >= 3);
    if ((tank1.capacity ?? 3) < 6 && allGte3) {
      tank1.capacity = 6;
      await DataManager.savePlayerDataWithCache(this.playerData);
      showFloatingTextCenter(this.floatingNode, "第一缸容量解鎖：3 → 6！");
    }
  }

  /** 若某缸5隻都≥6階 → 開啟下一缸（最多三缸），新缸capacity=5 */
  private async checkAndUnlockNextTankIfEligible(tankId: number) {
    if (!this.playerData) return;
    // 最多三缸
    if (this.playerData.tankList.length >= 3) return;

    const tank = this.playerData.tankList.find((t) => t.id === tankId);
    if (!tank) return;

    // 需要「該缸容量至少是6」且「有6隻活魚」且「全部≥6階」
    const fish = this.getAliveFishInTank(tankId);
    if ((tank.capacity ?? (tankId === 1 ? 3 : 6)) < 6) return;
    if (fish.length < 6) return;
    if (!fish.every((f) => (f.stage ?? 1) >= 6)) return;

    // 開新缸（id=現在已有缸數+1），capacity=6
    const newTankId = this.playerData.tankList.length + 1;
    this.playerData.tankList.push({
      id: newTankId,
      name: `魚缸 ${newTankId}`,
      comfort: 100,
      fishIds: [],
      capacity: 6,
    });
    await DataManager.savePlayerDataWithCache(this.playerData);
    showFloatingTextCenter(this.floatingNode, `成功開啟第 ${newTankId} 缸！`);
  }

  private formToIndex(form: FishData["adultForm"]): number {
    const i = this.ADULT_FORM_ORDER.indexOf(form || "form1");
    return i >= 0 ? i : 0;
  }

  private pickAdultForm(fish: FishData, player: PlayerData): FishData["adultForm"] {
    // 等機率版本；若要做稀有度，可把 weights 換成你要的權重
    const forms = this.ADULT_FORM_ORDER;
    const i = Math.floor(Math.random() * forms.length);
    return forms[i];
  }

  // -----------------------------加魚行為--------------------------------

  /** 建立一條新魚（最簡版） */
  private createFish(tankId: number) {
    const pd = this.playerData!;
    const nextId = (pd.fishList.reduce((m, f) => Math.max(m, f.id), 0) || 0) + 1;
    const genders: Array<"male" | "female"> = ["male", "female"];
    const fish = {
      id: nextId,
      name: `鱘龍${nextId}號`,
      gender: genders[Math.floor(Math.random() * genders.length)],
      stage: 1,
      growthDaysPassed: 0,
      lastFedDate: new Date().toISOString(),
      hunger: 50,
      hungerRateMultiplier: 1,
      appearance: "beautiful" as const,
      outfit: { head: null, accessories: [] },
      isMarried: false,
      spouseId: null,
      status: { hungry: false, hot: false, cold: false, sick: false },
      emotion: "happy" as const,
      isDead: false,
      tankId,
    } as const;

    pd.fishList.push(fish as any);
    const tank = pd.tankList.find((t) => t.id === tankId)!;
    tank.fishIds.push(fish.id);
  }

  /** 取得「直接加魚」花費（只有第一缸存在時免費） */
  private getDirectAddCost(): number {
    return this.playerData!.tankList.length === 1 ? 0 : COST_ADD_DIRECT;
  }

  /** 檢查是否允許在指定魚缸加魚（墓地、滿缸、找不到缸…） */
  private canAddFish(tankId: number): { ok: boolean; msg?: string } {
    if (!this.playerData) return { ok: false, msg: "資料尚未就緒" };
    if (this.isViewingFriend || this.tombTankNode?.active) return { ok: false, msg: "此畫面不可加魚" };
    if (this.hasDeadFish()) return { ok: false, msg: "有小魚在墓地等你，先去把牠抱回家吧～" };

    const tank = this.playerData.tankList.find((t) => t.id === tankId);
    if (!tank) return { ok: false, msg: "找不到此魚缸" };

    const cap = tank.capacity ?? (tank.id === 1 ? 3 : 6);
    const alive = this.getAliveFishInTank(tankId).length;
    if (alive >= cap) return { ok: false, msg: "已達魚缸上限" };

    return { ok: true };
  }

  /** 扣款→生魚→存檔→切缸→更新UI→提示 */
  private async commitAddFish(tankId: number, cost: number, toast: string) {
    const pd = this.playerData!;
    if (cost > 0) {
      if ((pd.dragonBones ?? 0) < cost) {
        showFloatingTextCenter(this.floatingNode, "龍骨不夠…再努力存一下吧！");
        return;
      }
      pd.dragonBones -= cost;
    }
    this.createFish(tankId);
    await DataManager.savePlayerDataWithCache(pd);
    await this.switchTank(tankId);
    this.updateTankFishCountLabel();
    this.updateAddFishBtnState();
    showFloatingTextCenter(this.floatingNode, toast);
  }

  /** 點擊加魚按鈕 */
  public async onClickAddFish() {
    const tankId = this.currentTankId;
    const guard = this.canAddFish(tankId);
    if (!guard.ok) {
      if (guard.msg) showFloatingTextCenter(this.floatingNode, guard.msg);
      if (this.hasDeadFish()) await this.switchToTombTank();
      return;
    }

    // 組確認訊息
    const tank = this.playerData!.tankList.find((t) => t.id === tankId)!;
    const cap = tank.capacity ?? (tank.id === 1 ? 3 : 6);
    const alive = this.getAliveFishInTank(tankId).length;
    const cost = this.getDirectAddCost();
    const bones = this.playerData!.dragonBones ?? 0;
    const msg =
      cost === 0
        ? `要多邀請一隻小魚回家嗎？（免費）\n目前：${alive} / ${cap}`
        : `要花 ${cost} 龍骨收編一隻小魚嗎？\n目前：${alive} / ${cap}\n你有：${bones} 龍骨`;

    const ok = await this.confirmDialogManager.ask(msg);
    if (!ok) return;

    await this.commitAddFish(tankId, cost, cost === 0 ? "恭喜～魚寶寶誕生啦！" : `已花費 ${cost} 龍骨`);
  }

  private updateTankFishCountLabel() {
    if (!this.playerData) return;

    const tank = this.playerData.tankList.find((t) => t.id === this.currentTankId);
    if (!tank) return;

    const aliveFish = this.getAliveFishInTank(this.currentTankId).length;
    const capacity = tank.capacity ?? (tank.id === 1 ? 3 : 6);

    if (this.tankFishCountLabel) {
      this.tankFishCountLabel.string = `${aliveFish} / ${capacity}`;
    }
  }

  private updateAddFishBtnState() {
    if (!this.playerData || !this.addFishBtn) return;

    // 朋友頁或墓地頁 → 不能加
    if (this.isViewingFriend || this.tombTankNode?.active) {
      this.addFishBtn.interactable = false;
      return;
    }

    // 有死魚 → 不能加
    if (this.hasDeadFish()) {
      this.addFishBtn.interactable = false;
      return;
    }

    // 魚滿 → 不能加
    const tank = this.playerData.tankList.find((t) => t.id === this.currentTankId);
    if (!tank) return;
    const capacity = tank.capacity ?? (tank.id === 1 ? 3 : 6);
    const alive = this.getAliveFishInTank(this.currentTankId).length;
    this.addFishBtn.interactable = alive < capacity;
  }

  private onClickTankButton(index: number) {
    // 自己頁：若未解鎖就提示
    if (!this.isViewingFriend) {
      const opened = this.playerData?.tankList?.length ?? 0;
      if (index >= opened) {
        showFloatingTextCenter(this.floatingNode, "這個魚缸尚未開啟");
        return;
      }
    }
    // 朋友頁
    if (this.isViewingFriend && this.viewingFriend) {
      this.renderFriendTankByIndex(index);
    } else {
      this.switchTank(index + 1);
    }
  }

  public async marryFish(myFishId: number, partnerFishId: number, partnerOwnerGameId: string) {
    console.log("[GM] marryFish", { myFishId, partnerFishId, partnerOwnerGameId });
    const ok = await this.family.marry(myFishId, this.playerData!.gameId, partnerFishId, partnerOwnerGameId);
    if (ok) {
      this.node.emit("marriage-updated", { fishId: myFishId, spouseId: partnerFishId });
    }
  }

  public async breedFish(myFishId: number) {
    if (this._breedingInProgress) return;

    // 若自己這條魚已婚、spouseId 有值，但 spouseOwnerGameId 為空，就嘗試補上
    const me = await DataManager.getPlayerDataCached({ refresh: true });
    const a = me.fishList.find((f) => f.id === myFishId);
    if (!a) return;

    if (a.isMarried && a.spouseId != null && !a.spouseOwnerGameId) {
      // 從 FriendPanel 或 friendSnapshot 找出「配偶那條魚」屬於哪個玩家
      const fp = this.node.scene.getComponentInChildren(FriendPanel) as FriendPanel | null;
      const friends: PlayerData[] = fp?.getAllFriendPlayerData?.() ?? this.friendSnapshot ?? [];
      // 找包含「配偶那個魚 id」的玩家
      const owner = friends.find((p) => p.fishList.some((f) => f.id === a.spouseId));
      if (owner) {
        a.spouseOwnerGameId = owner.gameId; // 補上關鍵欄位
        await DataManager.savePlayerDataWithCache(me); // 寫回自己存檔
        // 同步到目前 GameManager 的內存
        this.playerData = me;
      }
    }

    // 接著走你原本的流程（確認 & 扣費 & 呼叫 family.breed）
    const bones = this.playerData?.dragonBones ?? 0;
    const msg = `確定要花費 50 龍骨生魚寶寶嗎？\n你有：${bones} 龍骨`;
    const ok = await this.confirmDialogManager.ask(msg);
    if (!ok) return;

    this._breedingInProgress = true;
    try {
      await this.family.breed(myFishId);
    } finally {
      this._breedingInProgress = false;
    }
  }

  public getMyPlayer(): PlayerData {
    return this.playerData!;
  }
  public getCurrentTankId(): number {
    return this.currentTankId;
  }
}
