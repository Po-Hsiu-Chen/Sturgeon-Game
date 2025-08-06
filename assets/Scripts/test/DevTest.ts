import { _decorator, Button, Component, EditBox } from 'cc';
import { DataManager } from '../DataManager'; // ← 使用你已有的 DataManager
const { ccclass, property } = _decorator;

@ccclass('DevTest')
export class DevTest extends Component {

    @property(EditBox)
    fishIdInput: EditBox = null!;

    @property(EditBox)
    tempInput: EditBox = null!; // 輸入水溫

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

    /** 將全形數字/符號轉半形 */
    private toHalfWidth(s: string) {
        // 全形轉半形（含數字、小數點、負號等常見字元）
        return s.replace(/[\uFF01-\uFF5E]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
                .replace(/\u3000/g, ' ');
    }

    /** 直接設定水溫（從 tempInput 讀數） */
    async onSetTemperature() {
        if (!this.tempInput) {
            console.warn('tempInput 沒有在編輯器綁定到 DevTest！');
            return;
        }

        const raw = this.tempInput.string ?? '';
        const normalized = this.toHalfWidth(raw).trim(); // 處理全形與空白
        const v = parseFloat(normalized);

        if (!isFinite(v)) {
            console.warn(`請輸入數字水溫（目前輸入: "${raw}" -> "${normalized}"）`);
            return;
        }

        const data = await DataManager.getPlayerData();
        if (!data) return;

        data.tankEnvironment.temperature = v;
        await DataManager.savePlayerData(data);
        console.log(`水溫已設為 ${v}°C`);
    }


    /** 設為乾淨水（按鈕觸發） */
    async onSetWaterClean() {
        const data = await DataManager.getPlayerData();
        if (!data) return;
        data.tankEnvironment.waterQualityStatus = 'clean';
        await DataManager.savePlayerData(data);
        console.log('水質已設為乾淨');
    }

    /** 設為髒水（按鈕觸發） */
    async onSetWaterDirty() {
        const data = await DataManager.getPlayerData();
        if (!data) return;
        data.tankEnvironment.waterQualityStatus = 'dirty';
        await DataManager.savePlayerData(data);
        console.log('水質已設為髒');
    }
}
