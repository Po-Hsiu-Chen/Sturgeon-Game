import { _decorator, Component, Node, Label } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
    @property(Node)
    fishDetailPanel: Node = null!;

    @property(Label)
    infoLabel: Label = null!;

    showFishDetail(fish: any) {
        this.fishDetailPanel.active = true;

        this.infoLabel.string =
            `名稱：${fish.name}\n` +
            `階段：${fish.stage}\n` +
            `性別：${fish.gender === 'male' ? '公' : '母'}\n` +
            `飢餓值：${fish.hunger}\n` +
            `已婚：${fish.isMarried ? '是' : '否'}\n`;
    }

    closeFishDetail() {
        this.fishDetailPanel.active = false;
    }
}
