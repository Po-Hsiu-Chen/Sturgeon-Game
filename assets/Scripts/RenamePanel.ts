import { _decorator, Component, Node, EditBox } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('RenamePanel')
export class RenamePanel extends Component {
    @property(Node) panel: Node = null!;
    @property(EditBox) input: EditBox = null!;

    private fishId: number = -1;

    show(currentFish: any) {
        if (!currentFish) return;

        this.fishId = currentFish.id;
        this.input.string = currentFish.name;
        this.panel.active = true;
    }

    hide() {
        this.panel.active = false;
    }

    renameFish(fish: any, newName: string): boolean {
        if (!newName || newName.length > 12) return false;
        fish.name = newName;
        return true;
    }

    confirmRename() {
        const newName = this.input.string.trim();
        if (!newName) {
            console.warn("名字不能為空！");
            return;
        }

        const playerData = JSON.parse(localStorage.getItem('playerData'));
        const fish = playerData.fishList.find(f => f.id === this.fishId);
        if (!fish) return;

        const renamed = this.renameFish(fish, newName);
        if (!renamed) {
            console.warn("名字無效");
            return;
        }

        localStorage.setItem('playerData', JSON.stringify(playerData));
        this.hide();
    }
}