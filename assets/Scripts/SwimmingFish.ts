import { _decorator, Component, Vec3, Node, find, UITransform, Sprite, SpriteFrame } from 'cc';
import { UIManager } from './UIManager';
import type { FishData } from './GameManager';

const { ccclass, property } = _decorator;

@ccclass('SwimmingFish')
export class SwimmingFish extends Component {
    /** 設定於編輯器的屬性 */
    @property(Sprite)
    fishSprite: Sprite = null!;  // 魚的 Sprite，用來顯示圖片
    @property([SpriteFrame])
    fishSprites: SpriteFrame[] = []; // 不同階段對應的圖片集

    /** 與魚資料相關的屬性 */
    public fishData: FishData = null!;  // 魚的資料（從 GameManager 傳入）
    static currentSelectedFish: SwimmingFish | null = null;  // 目前被選中的魚

    /** 移動邏輯控制 */
    private isMovingRight = false;            // 目前是否朝右移動
    private speed = 120;                      // 移動速度
    private fishAreaWorldLeft = 0;            // 可移動區域 - 左邊界
    private fishAreaWorldRight = 0;           // 可移動區域 - 右邊界

    /** UI 元件 */
    private emotionBubble: Node | null = null; // 泡泡（包含放大鏡按鈕）

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

    public setFishData(fish: FishData) {
        this.fishData = fish;
        this.updateFishAppearance(fish);
    }

    updateFishAppearance(fish: FishData) {
        if (fish.stage >= 1 && fish.stage <= this.fishSprites.length) {
            this.fishSprite.spriteFrame = this.fishSprites[fish.stage - 1];
        }

        // 根據階段設定不同大小
        const scaleByStage = {
            1: new Vec3(0.7, 0.7, 1), // 魚卵
            2: new Vec3(0.7, 0.4, 1), // 魚苗
            3: new Vec3(1.0, 0.6, 1), // 幼魚
            4: new Vec3(1.1, 0.8, 1), // 小魚
            5: new Vec3(1.2, 0.9, 1), // 中魚
            6: new Vec3(1.3, 1.0, 1), // 大魚
        };

        const scale = scaleByStage[fish.stage] || new Vec3(1, 1, 1);
        this.fishSprite.node.setScale(scale);

        console.log(`設定 ${fish.name} 為第 ${fish.stage} 階外觀與大小：`, scale);
    }

    onClickFish() {
        if (!this.emotionBubble) return;

        // 若這隻就是目前選中的魚，則關閉泡泡
        if (SwimmingFish.currentSelectedFish === this) {
            this.emotionBubble.active = false;
            SwimmingFish.currentSelectedFish = null;
        } else {
            // 關掉前一隻魚的泡泡
            if (SwimmingFish.currentSelectedFish) {
                SwimmingFish.currentSelectedFish.emotionBubble!.active = false;
            }

            // 顯示新的泡泡並設定選中魚
            this.emotionBubble.active = true;
            SwimmingFish.currentSelectedFish = this;
        }
    }

    static clearSelection() {
        if (SwimmingFish.currentSelectedFish) {
            SwimmingFish.currentSelectedFish.emotionBubble!.active = false;
            SwimmingFish.currentSelectedFish = null;
        }
    }
    
    onClickMagnifier() {
        const playerData = JSON.parse(localStorage.getItem('playerData'));
        const fishId = parseInt(this.node.name.split('_')[1]);
        const fishData = playerData.fishList.find(f => f.id === fishId);

        const uiManager = find('Canvas/UIManager')?.getComponent(UIManager);
        uiManager?.showFishDetail(fishData);
    }
}
