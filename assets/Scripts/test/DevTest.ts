import { _decorator, Component, EditBox } from 'cc';
import { DataManager } from '../DataManager'; // ← 使用你已有的 DataManager
const { ccclass, property } = _decorator;

@ccclass('DevTest')
export class DevTest extends Component {

    @property(EditBox)
    fishIdInput: EditBox = null!;

    /** 清除本地資料 */
    onClearData() {
        DataManager.clearPlayerData();
    }

    /** 將指定魚的飢餓值設為 100（模擬下次登入時餓死） */
    async onHungerDeath() {
        const id = parseInt(this.fishIdInput.string);
        if (isNaN(id)) {
            console.warn("請輸入正確的魚 ID");
            return;
        }

        const data = await DataManager.getPlayerData();
        if (!data) return;

        const fish = data.fishList.find(f => f.id === id);
        if (!fish) {
            console.warn(`找不到魚 ID: ${id}`);
            return;
        }

        fish.hunger = 100;
        await DataManager.savePlayerData(data);
        console.log(`魚 ${fish.name} 飢餓設為 100，將於下次啟動自動死亡`);
    }

    /** 印出目前魚的簡要摘要 */
    async onPrintSummary() {
        const data = await DataManager.getPlayerData();
        if (!data) {
            console.warn("尚未建立任何玩家資料");
            return;
        }

        const total = data.fishList.length;
        const dead = data.fishList.filter(f => f.isDead).length;

        console.log(`玩家ID: ${data.id}`);
        console.log(`魚數量: ${total}`);
        console.log(`死魚: ${dead}`);
    }
}
