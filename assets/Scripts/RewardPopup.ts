import { _decorator, Component, Node, SpriteFrame, Prefab, instantiate, tween, Vec3, UIOpacity } from 'cc';
import { RewardItem } from './RewardItem';
const { ccclass, property } = _decorator;

@ccclass('RewardPopup')
export class RewardPopup extends Component {
    
    @property(Node) rewardGrid: Node = null!;
    @property(Prefab) rewardItemPrefab: Prefab = null!;

    // 效果光 - 三層
    @property(Node) effectLightBase: Node = null!;
    @property(Node) effectLightRotateCW: Node = null!;
    @property(Node) effectLightRotateCCW: Node = null!;

    showRewards(rewards: { icon: SpriteFrame, name: string, count: number }[]) {
        this.rewardGrid.removeAllChildren();

        for (const reward of rewards) {
            const item = instantiate(this.rewardItemPrefab);
            const itemScript = item.getComponent(RewardItem);
            itemScript.init(reward.icon, reward.name, reward.count);
            this.rewardGrid.addChild(item);
        }

        this.playEnterAnimation();
        this.playEffectLight();
    }

    playEnterAnimation() {
        this.node.scale = new Vec3(0.5, 0.5, 1);
        const uiOpacity = this.node.getComponent(UIOpacity);
        if (uiOpacity) {
            uiOpacity.opacity = 0;
            tween(uiOpacity)
                .to(0.6, { opacity: 255 }, { easing: 'quadOut' })
                .start();
        }

        tween(this.node)
            .to(0.6, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }


    playEffectLight() {
        // 順時針旋轉
        if (this.effectLightRotateCW) {
            tween(this.effectLightRotateCW)
                .by(5, { angle: 360 })
                .repeatForever()
                .start();
        }

        // 逆時針旋轉
        if (this.effectLightRotateCCW) {
            tween(this.effectLightRotateCCW)
                .by(5, { angle: -360 })
                .repeatForever()
                .start();
        }
    }

    onConfirm() {
        this.node.destroy();
    }


}
