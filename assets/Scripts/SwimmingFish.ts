import { _decorator, Component, Vec3, Node, find, UITransform, Sprite, SpriteFrame, Prefab, tween, Label } from 'cc';
import { FishDetailManager } from './FishDetailManager';
import { type FishData } from './DataManager';
const { ccclass, property } = _decorator;

@ccclass('SwimmingFish')
export class SwimmingFish extends Component {

    // 與魚資料相關的屬性
    public fishData: FishData = null!;                       // 魚的資料（從 GameManager 傳入）
    static currentSelectedFish: SwimmingFish | null = null;  // 目前被選中的魚

    // 互動/唯讀 與 表情用環境 
    @property
    public interactive: boolean = true;      // 朋友魚 => false
    private _envForEmotion: any = null;      // 用來算情緒的環境（自己 or 朋友的環境）

    // Movement 
    private isMovingRight = false;   // 目前是否朝右移動
    private speed = 80;              // 移動速度
    private fishAreaWorldLeft = 0;   // 可移動區域 - 左邊界
    private fishAreaWorldRight = 0;  // 可移動區域 - 右邊界

    // Emotion
    private emotionBubble: Node | null = null; // 泡泡（包含放大鏡按鈕）
    private emotionSprite: Sprite | null = null;
    private static _emotionFrames: Record<string, SpriteFrame> = {};
    static setEmotionFrames(map: Record<string, SpriteFrame>) {
        this._emotionFrames = map || {};
    }
    static getEmotionSpriteByKey(key: "happy" | "sad" | "angry" | "hungry" | "cold" | "hot" | "sick"): SpriteFrame | null {
        return this._emotionFrames[key] ?? this._emotionFrames["happy"] ?? null;
    }

    // Emotion Cache
    private _lastEmotion: "happy" | "sad" | "angry" | "hungry" | "cold" | "hot" | "sick" | null = null;
    private _lastEmotionSprite: SpriteFrame | null = null;

    start() {
        // 取得父節點（FishArea）範圍
        const fishArea = this.node.parent;
        const fishAreaTransform = fishArea.getComponent(UITransform);
        const areaWorldPos = fishArea.getWorldPosition();
        const halfWidth = fishAreaTransform.width / 2;

        // 魚游動相關
        this.fishAreaWorldLeft = areaWorldPos.x - halfWidth + 50; // 邊界
        this.fishAreaWorldRight = areaWorldPos.x + halfWidth - 50;
        const direction = this.node["initialDirection"]; // 初始移動方向
        this.isMovingRight = direction === 1;
        this.node.setScale(this.isMovingRight ? new Vec3(-1, 1, 1) : new Vec3(1, 1, 1)); // 根據方向設定初始翻面（朝右 = 負 scale）

        // 泡泡與點擊事件
        this.emotionBubble = this.node.getChildByName("EmotionBubble");
        const iconNode = this.emotionBubble?.getChildByName('EmotionIcon');
        this.emotionSprite = iconNode?.getChildByName('Sprite')?.getComponent(Sprite) || null;
        if (!this.emotionSprite) {
            console.warn(`[SwimmingFish] 找不到 EmotionBubble 內的 Sprite，請確認泡泡底下有 Sprite 元件`);
        }

        const magnifierBtn = this.emotionBubble?.getChildByName("MagnifierBtn");
        magnifierBtn?.on(Node.EventType.TOUCH_END, this.onClickMagnifier, this);
        this.node.on(Node.EventType.TOUCH_END, this.onClickFish, this);
    }


    update(dt: number) {
        if (this !== SwimmingFish.currentSelectedFish && this.emotionBubble?.active) {
            this.emotionBubble.active = false;
        }

        if (this.emotionBubble?.active) return; // 泡泡開啟時不移動

        const move = this.speed * dt * (this.isMovingRight ? 1 : -1);
        const newX = this.node.position.x + move;
        this.node.setPosition(newX, this.node.position.y, 0);
        const worldX = this.node.getWorldPosition().x;

        // 根據實際位置自動翻面
        if (worldX > this.fishAreaWorldRight && this.isMovingRight) {
            this.isMovingRight = false;
            this.node.setScale(new Vec3(1, 1, 1));  // 朝左
        } else if (worldX < this.fishAreaWorldLeft && !this.isMovingRight) {
            this.isMovingRight = true;
            this.node.setScale(new Vec3(-1, 1, 1)); // 朝右
        }

    }

    public setFishData(fish: FishData, opts?: { readOnly?: boolean; env?: any }) {
        this.fishData = fish;
        if (opts && 'readOnly' in opts) {
            this.interactive = !opts.readOnly!;
        }
        if (opts?.env) {
            this._envForEmotion = opts.env;
        }
    }

    async onClickFish() {
        // if (!this.interactive) return; // 不讓朋友魚有任何點擊反應 (暫定)
        if (!this.emotionBubble) return;

        if (SwimmingFish.currentSelectedFish === this) {
            this.emotionBubble.active = false;
            SwimmingFish.currentSelectedFish = null;
            return;
        }
        if (SwimmingFish.currentSelectedFish) {
            SwimmingFish.currentSelectedFish.emotionBubble!.active = false;
        }
        SwimmingFish.currentSelectedFish = this;

        this.emotionBubble.active = true;
        this.emotionBubble.setScale(new Vec3(0.3, 0.3, 1));
        await this.updateBubbleEmotionIcon();
        tween(this.emotionBubble).to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    }


    static clearSelection() {
        if (SwimmingFish.currentSelectedFish) {
            const bubble = SwimmingFish.currentSelectedFish.emotionBubble;
            if (bubble && bubble.isValid) {
                bubble.active = false;
            }
            SwimmingFish.currentSelectedFish = null;
        }
    }

    async onClickMagnifier() {
        if (!this.fishData) return;
        const fishDetailManager = find('/GameManager')?.getComponent(FishDetailManager);
        if (!fishDetailManager) return;

        if (!this._lastEmotionSprite) {
            await this.updateBubbleEmotionIcon();
        }

        const readOnly = !this.interactive; // 朋友魚唯讀
        fishDetailManager.showFishDetail(this.fishData, this._lastEmotionSprite || null, { readOnly });
    }

    private async updateBubbleEmotionIcon() {
        if (!this.emotionSprite || !this.fishData) return;
        const env = this._envForEmotion || null; // 不回頭查 DataManager 了
        const emo = SwimmingFish.computeEmotion(this.fishData, env);
        const sf = SwimmingFish.getEmotionSpriteByKey(emo);
        if (sf) {
            this.emotionSprite.spriteFrame = sf;
            this._lastEmotion = emo;
            this._lastEmotionSprite = sf;
        }
    }

    /** 依優先序決定情緒：sick > cold/hot > hungry(>=80)/hungry(<=20) > 隨機(happy|sad|angry) */
    static computeEmotion(fish: FishData, env: any):
        "happy" | "sad" | "angry" | "hungry" | "cold" | "hot" | "sick" {
        if (fish.status?.sick) return "sick";
        const minComfort = 18, maxComfort = 23;
        if (env?.temperature < minComfort) return "cold";
        if (env?.temperature > maxComfort) return "hot";
        if ((fish.hunger ?? 0) >= 80) return "hungry";
        if ((fish.hunger ?? 0) <= 20) return "happy";
        const pool = ["happy", "sad", "angry"] as const;
        return pool[Math.floor(Math.random() * pool.length)];
    }

}
