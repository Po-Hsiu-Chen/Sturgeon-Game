import { _decorator, Component, Vec3, Node, find, UITransform } from 'cc';
import { UIManager } from './UIManager';
const { ccclass, property } = _decorator;

@ccclass('SwimmingFish')
export class SwimmingFish extends Component {
    private isMovingRight = false;
    private speed = 120;
    private fishAreaWorldLeft = 0;
    private fishAreaWorldRight = 0;

    private emotionBubble: Node | null = null;

    start() {
        const fishArea = this.node.parent; // parent 是 FishArea
        const fishAreaTransform = fishArea.getComponent(UITransform);
        const areaWorldPos = fishArea.getWorldPosition();

        const halfWidth = fishAreaTransform.width / 2;
        this.fishAreaWorldLeft = areaWorldPos.x - halfWidth + 50;
        this.fishAreaWorldRight = areaWorldPos.x + halfWidth - 50;

        // 初始方向（從 GameManager 傳進來）
        const direction = this.node["initialDirection"];
        this.isMovingRight = direction === 1;

        // 根據初始方向翻面
        this.node.setScale(this.isMovingRight ? new Vec3(-1, 1, 1) : new Vec3(1, 1, 1));

        // 泡泡
        this.emotionBubble = this.node.getChildByName("EmotionBubble");

        // 綁定放大鏡按鈕
        const magnifierBtn = this.emotionBubble?.getChildByName("MagnifierBtn");
        magnifierBtn?.on(Node.EventType.TOUCH_END, this.onClickMagnifier, this);

        this.node.on(Node.EventType.TOUCH_END, this.onClickFish, this);
    }

    update(dt: number) {
        if (this.emotionBubble?.active) return;

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

    onClickFish() {
        if (!this.emotionBubble) return;
        const isActive = this.emotionBubble.active;
        this.emotionBubble.active = !isActive;
    }

    onClickMagnifier() {
        const playerData = JSON.parse(localStorage.getItem('playerData'));
        const fishId = parseInt(this.node.name.split('_')[1]);
        const fishData = playerData.fishList.find(f => f.id === fishId);

        const uiManager = find('Canvas/UIManager')?.getComponent(UIManager);
        uiManager?.showFishDetail(fishData);
    }
}
