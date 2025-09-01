import { _decorator, Button, Component, EditBox, find } from 'cc';
import { DataManager } from '../DataManager'; // ← 使用你已有的 DataManager
import { GameManager } from '../GameManager';
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

        await DataManager.ready?.catch(()=>{});
        const data = await DataManager.getPlayerDataCached();
        if (!data) return;

        const fish = data.fishList.find(f => f.id === id);
        if (!fish) {
            console.warn(`找不到魚 ID: ${id}`);
            return;
        }

        fish.hunger = 100;
        await DataManager.savePlayerDataWithCache(data);
        console.log(`魚 ${fish.name} 飢餓設為 100，將於下次啟動自動死亡`);
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
        await DataManager.ready?.catch(()=>{});
        const data = await DataManager.getPlayerDataCached();
        if (!data) return;

        data.tankEnvironment.temperature = v;
        await DataManager.savePlayerDataWithCache(data);
        console.log(`水溫已設為 ${v}°C`);
    }


    /** 設為乾淨水（按鈕觸發） */
    async onSetWaterClean() {
        await DataManager.ready?.catch(()=>{});
        const data = await DataManager.getPlayerDataCached();
        if (!data) return;
        data.tankEnvironment.waterQualityStatus = 'clean';
        await DataManager.savePlayerDataWithCache(data);
        console.log('水質已設為乾淨');
    }

    /** 設為髒水（按鈕觸發） */
    async onSetWaterDirty() {
        await DataManager.ready?.catch(()=>{});
        const data = await DataManager.getPlayerDataCached();
        if (!data) return;
        data.tankEnvironment.waterQualityStatus = 'dirty';
        await DataManager.savePlayerDataWithCache(data);
        console.log('水質已設為髒');
    }


    /** 水質變髒觸發感冒（上次登入改成昨天＋把水質設髒＋累積壞環境一天→ 立刻呼叫 processDailyUpdate */
    async onSimulateDirtyAndSickToday() {
        await DataManager.ready?.catch(()=>{});
        const data = await DataManager.getPlayerDataCached();
        if (!data) return;

        const env = data.tankEnvironment;

        // 讓水質判定為髒
        env.waterQualityStatus = 'dirty';
        env.loginDaysSinceClean = Math.max(1, env.loginDaysSinceClean ?? 0);

        // 讓「連續壞環境登入日」先累積到 1（BUFFER_DAYS=2）
        env.badEnvLoginDays = 1;

        // 把上次登入時間改成「昨天」，讓今天呼叫 daily update 會 daysPassed=1
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        data.lastLoginDate = yesterday.toISOString().split('T')[0];
        data.lastLoginTime = yesterday.toISOString();

        const before = JSON.stringify(data, null, 2);
        const fresh = await DataManager.savePlayerDataWithCache(data);
        console.log("送出的 data:", before);
        console.log("伺服器回傳 fresh:", JSON.stringify(fresh, null, 2));

        // 直接觸發你的每日更新流程（會把 badEnvLoginDays += 1 → 達門檻 → 隨機一隻生病）
        const gm = find('/GameManager')?.getComponent(GameManager);
        await gm?.processDailyUpdate();

        console.log('今日水質為髒，且依緩衝機制讓一隻魚感冒。');
    }
}
