import { _decorator, Component, Vec3, Node, find, UITransform, Sprite, SpriteFrame, tween } from "cc";
import { FishDetailManager } from "./FishDetailManager";
import { DataManager, type FishData } from "./DataManager";
import { FashionManager } from "./FashionManager";

const { ccclass, property } = _decorator;

type EmotionKey = "happy" | "sad" | "angry" | "hungry" | "cold" | "hot" | "sick";

@ccclass("SwimmingFish")
export class SwimmingFish extends Component {
  // -------------------- 外觀 / 時裝 --------------------
  @property(Node) hatAnchor: Node = null!; // 頭飾掛點（在魚 prefab 上）
  @property(Node) glassAnchor: Node = null!;
  private hatNode: Node | null = null; // 由程式動態建立的頭飾節點

  // -------------------- 資料 / 互動屬性 --------------------
  public fishData: FishData = null!; // 此節點對應的魚資料
  static currentSelectedFish: SwimmingFish | null = null; // 目前打開泡泡的那一條魚

  @property
  public interactive: boolean = true; // 是否允許互動（朋友魚缸可設為 false）
  private _envForEmotion: any = null; // 計算情緒時使用的環境（自己的缸 or 朋友的缸）

  // -------------------- 移動參數 --------------------
  private isMovingRight = false;
  private readonly speed = 80;
  private fishAreaWorldLeft = 0;
  private fishAreaWorldRight = 0;

  // -------------------- 情緒顯示（泡泡） --------------------
  private emotionBubble: Node | null = null; // 泡泡根節點（含放大鏡按鈕）
  private emotionSprite: Sprite | null = null; // 泡泡內真正顯示表情的 Sprite

  // 全域情緒貼圖註冊
  private static _emotionFrames: Record<string, SpriteFrame> = {};
  static setEmotionFrames(map: Record<string, SpriteFrame>) {
    this._emotionFrames = map || {};
  }
  static getEmotionSpriteByKey(key: EmotionKey): SpriteFrame | null {
    return this._emotionFrames[key] ?? this._emotionFrames["happy"] ?? null;
  }

  // 快取最近一次計算結果（減少重算／維持視覺一致）
  private _lastEmotion: EmotionKey | null = null;
  private _lastEmotionSprite: SpriteFrame | null = null;

  /** 初始化 */
  start(): void {
    // 取得可移動區域（父層 FishArea）的世界座標邊界
    const fishArea = this.node.parent;
    const fishAreaTransform = fishArea?.getComponent(UITransform);
    if (!fishAreaTransform) {
      console.warn("[SwimmingFish] FishArea 缺少 UITransform，無法計算移動範圍");
      return;
    }
    const areaWorldPos = fishArea.getWorldPosition();
    const halfWidth = fishAreaTransform.width / 2;
    this.fishAreaWorldLeft = areaWorldPos.x - halfWidth + 50;
    this.fishAreaWorldRight = areaWorldPos.x + halfWidth - 50;

    // 根據初始方向設定翻面
    const direction = (this.node as any)["initialDirection"];
    this.isMovingRight = direction === 1;
    this.node.setScale(this.isMovingRight ? new Vec3(-1, 1, 1) : new Vec3(1, 1, 1));

    // 取得泡泡與表情 Sprite
    this.emotionBubble = this.node.getChildByName("EmotionBubble") || null;
    const iconNode = this.emotionBubble?.getChildByName("EmotionIcon") || null;
    this.emotionSprite = iconNode?.getChildByName("Sprite")?.getComponent(Sprite) || null;
    if (!this.emotionSprite) {
      console.warn("[SwimmingFish] 找不到 EmotionBubble/EmotionIcon/Sprite(Sprite)");
    }

    // 綁定點擊事件（魚本體、泡泡內放大鏡）
    const magnifierBtn = this.emotionBubble?.getChildByName("MagnifierBtn") || null;
    magnifierBtn?.on(Node.EventType.TOUCH_END, this.onClickMagnifier, this);
    this.node.on(Node.EventType.TOUCH_END, this.onClickFish, this);
  }

  update(dt: number): void {
    // 同時間只允許一條魚的泡泡是打開的
    if (this !== SwimmingFish.currentSelectedFish && this.emotionBubble?.active) {
      this.emotionBubble.active = false;
    }

    // 泡泡開啟時讓魚停止移動（避免視覺抖動）
    if (this.emotionBubble?.active) return;

    // 基本左右移動邏輯 + 觸邊翻面
    const move = this.speed * dt * (this.isMovingRight ? 1 : -1);
    const newX = this.node.position.x + move;
    this.node.setPosition(newX, this.node.position.y, 0);

    const worldX = this.node.getWorldPosition().x;
    if (worldX > this.fishAreaWorldRight && this.isMovingRight) {
      this.isMovingRight = false;
      this.node.setScale(new Vec3(1, 1, 1));
    } else if (worldX < this.fishAreaWorldLeft && !this.isMovingRight) {
      this.isMovingRight = true;
      this.node.setScale(new Vec3(-1, 1, 1));
    }
  }

  /** 設定此魚的資料與情緒環境（朋友魚缸可設唯讀） */
  public setFishData(fish: FishData, opts?: { readOnly?: boolean; env?: any }): void {
    this.fishData = fish;
    if (opts && "readOnly" in opts) this.interactive = !opts.readOnly;
    if (opts?.env) this._envForEmotion = opts.env;
    this.refreshOutfit();
  }

  /** 點擊魚本體：開/關泡泡、更新表情 */
  async onClickFish(): Promise<void> {
    if (!this.emotionBubble) return;

    // 再次點同一條魚 → 收起泡泡
    if (SwimmingFish.currentSelectedFish === this) {
      this.emotionBubble.active = false;
      SwimmingFish.currentSelectedFish = null;
      return;
    }
    // 切換選取
    if (SwimmingFish.currentSelectedFish) {
      SwimmingFish.currentSelectedFish.emotionBubble!.active = false;
    }
    SwimmingFish.currentSelectedFish = this;

    // 開啟泡泡 + Scale 動畫
    this.emotionBubble.active = true;
    this.emotionBubble.setScale(new Vec3(0.3, 0.3, 1));
    await this.updateBubbleEmotionIcon();
    tween(this.emotionBubble)
      .to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: "backOut" })
      .start();
  }

  /** 清除當前選取（給外部用） */
  static clearSelection(): void {
    if (SwimmingFish.currentSelectedFish) {
      const bubble = SwimmingFish.currentSelectedFish.emotionBubble;
      if (bubble && bubble.isValid) bubble.active = false;
      SwimmingFish.currentSelectedFish = null;
    }
  }

  /** 點泡泡上的放大鏡：跳到詳情面板（帶上當前表情） */
  async onClickMagnifier(): Promise<void> {
    if (!this.fishData) return;

    const fishDetailManager = find("/GameManager")?.getComponent(FishDetailManager);
    if (!fishDetailManager) return;

    if (!this._lastEmotionSprite) await this.updateBubbleEmotionIcon();

    const readOnly = !this.interactive; // 朋友魚唯讀
    fishDetailManager.showFishDetail(this.fishData, this._lastEmotionSprite || null, { readOnly });
  }

  /** 計算並更新泡泡的表情圖示 */
  private async updateBubbleEmotionIcon(): Promise<void> {
    if (!this.emotionSprite || !this.fishData) return;

    const env = this._envForEmotion || null;
    const emo = SwimmingFish.computeEmotion(this.fishData, env);

    try {
      if (this.interactive) {
        // 只在自己魚時才允許寫入
        const pd = await DataManager.getPlayerDataCached();
        const f = pd?.fishList.find((x) => x.id === this.fishData.id);
        if (f) {
          (f as any).emotion = emo;
          await DataManager.savePlayerDataWithCache(pd);
        }
      }
    } catch (e) {
      console.warn("[SwimmingFish] save emotion failed", e);
    }

    // 更新泡泡圖示與快取
    const sf = SwimmingFish.getEmotionSpriteByKey(emo);
    if (sf) {
      this.emotionSprite.spriteFrame = sf;
      this._lastEmotion = emo;
      this._lastEmotionSprite = sf;
    }
  }

  /** 計算顯示的情緒 */
  static computeEmotion(fish: FishData, env: any): EmotionKey {
    if (fish.status?.sick) return "sick";

    const minComfort = 18,
      maxComfort = 23;
    if (env?.temperature < minComfort) return "cold";
    if (env?.temperature > maxComfort) return "hot";

    const hunger = fish.hunger ?? 0;
    if (hunger >= 80) return "hungry";
    if (hunger <= 20) return "happy";

    const pool = ["happy", "sad", "angry"] as const;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** 依魚的解鎖狀態與設定，更新頭飾 / 眼鏡外觀 */
  public refreshOutfit(): void {
    if (!this.fishData) return;

    const unlocked = (this.fishData.stage ?? 1) >= 6;
    const itemId = unlocked ? this.fishData.outfit?.head ?? null : null;

    // 沒有穿任何時裝 → 關掉節點
    if (!itemId) {
      if (this.hatNode) this.hatNode.active = false;
      return;
    }

    // 判斷這個 item 是眼鏡還是帽子
    const isGlass = itemId.startsWith("acc_sunglass") || itemId.startsWith("acc_heart_glass");
    const targetAnchor = isGlass ? this.glassAnchor : this.hatAnchor;

    // 安全檢查（ prefab 沒拉到 Anchor 時避免爆炸 ）
    if (!targetAnchor) {
      console.warn("[SwimmingFish] 缺少對應的 Anchor", { itemId, isGlass });
      return;
    }

    // 尚未建立就動態建立頭飾節點
    if (!this.hatNode || !this.hatNode.isValid) {
      this.hatNode = new Node("FashionSprite");
      this.hatNode.addComponent(Sprite);
      targetAnchor.addChild(this.hatNode);
    } else if (this.hatNode.parent !== targetAnchor) {
      // 如果原本掛在另一個 Anchor 底下，先移過來
      this.hatNode.removeFromParent();
      targetAnchor.addChild(this.hatNode);
    }

    // 向全域 Manager 拿圖
    const sf = FashionManager.get(itemId);
    const sp = this.hatNode.getComponent(Sprite)!;

    if (sf) {
      sp.spriteFrame = sf;

      // 讓 Sprite 的尺寸跟 Anchor 的 Content Size 一樣大
      // 前提：HatAnchor / GlassAnchor 上有 UITransform，且有設定好 width / height
      const anchorTransform = targetAnchor.getComponent(UITransform);
      if (anchorTransform) {
        // 確保 hatNode 也有 UITransform
        let hatTransform = this.hatNode.getComponent(UITransform);
        if (!hatTransform) {
          hatTransform = this.hatNode.addComponent(UITransform);
        }

        // 設定 hatNode 的 contentSize = Anchor 的 contentSize
        hatTransform.setContentSize(anchorTransform.contentSize);

        // Sprite 使用自訂尺寸模式，才會依照 UITransform 的 contentSize 拉伸
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
      }

      this.hatNode.active = true;
      this.hatNode.setPosition(Vec3.ZERO);
      // 不再用 scale 控制大小，統一保持 1
      this.hatNode.setScale(1, 1, 1);
    } else {
      this.hatNode.active = false;
    }
  }
}
