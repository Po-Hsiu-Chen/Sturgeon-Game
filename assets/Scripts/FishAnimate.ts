import { _decorator, Component, Node, tween, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('FishAnimate')
export class FishPartsRotateSwing extends Component {
    @property({ type: Node })
    fishHand: Node = null;

    @property({ type: Node })
    fishTail: Node = null;

    // 最大搖擺角度（左右最大旋轉角度，單位:度）
    @property
    swingAngle: number = 10;   // 例如設定30就是 -30~+30度擺動

    // 動畫一個來回所需時間
    @property
    swingTime: number = 1.0;   // 單位: 秒

    start() {
        this.swingNodeRotate(this.fishHand, this.swingAngle, this.swingTime);
        this.swingNodeRotate(this.fishTail, this.swingAngle, this.swingTime);
    }

    swingNodeRotate(node: Node, angle: number, time: number) {
        if (!node) return;
        const origin = node.eulerAngles.clone();

        // 定義無限循環左右擺動
        const anim = () => {
            tween(node)
                .to(time / 2, { eulerAngles: new Vec3(origin.x, origin.y, origin.z + angle) })
                .to(time, { eulerAngles: new Vec3(origin.x, origin.y, origin.z - angle) })
                .to(time / 2, { eulerAngles: origin })
                .call(anim)
                .start();
        };
        anim();
    }
}
