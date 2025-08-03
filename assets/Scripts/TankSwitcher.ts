import { _decorator, Button, Component, Node } from 'cc';
import { GameManager } from './GameManager';
import { TombManager } from './TombManager';
const { ccclass, property } = _decorator;

@ccclass('TankSwitcher')
export class TankSwitcher extends Component {
    @property(GameManager) gameManager: GameManager = null!;
    @property(TombManager) tombManager: TombManager = null!;

    @property([Button]) tankButtons: Button[] = [];   // index = tankId - 1
    @property(Button) tombTankBtn: Button = null!;

    @property([Node]) tankNodes: Node[] = [];         // index = tankId - 1
    @property(Node) tombTankNode: Node = null!;

    start() {
        this.tankButtons.forEach((btn, index) => {
            btn.node.on(Node.EventType.TOUCH_END, () => {
                this.switchToTank(index + 1); // tankId 從 1 開始
            });
        });

        this.tombTankBtn.node.on(Node.EventType.TOUCH_END, () => {
            this.switchToTombTank();
        });

        this.switchToTank(1); // 預設主魚缸
    }

    async switchToTank(tankId: number) {
        this.tankNodes.forEach((node, idx) => {
            node.active = (idx + 1) === tankId;
        });
        this.tombTankNode.active = false;

        await this.gameManager.switchTank(tankId);
    }

    async switchToTombTank() {
        this.tankNodes.forEach(node => node.active = false);
        this.tombTankNode.active = true;

        await this.tombManager.refreshTombs?.();
    }
}
