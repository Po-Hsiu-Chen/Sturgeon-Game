import { PlayerData } from './DataManager';

export class TankEnvironmentManager {
    /** 加熱器或風扇水溫調為正常 */
    static adjustTemperature(playerData: PlayerData) {
        const env = playerData.tankEnvironment;
        env.temperature = 21;
        env.isTemperatureDanger = false;
        env.lastTempUpdateTime = new Date().toISOString();
        console.log("水溫已調整為 21°C（正常範圍）");
    }

    /** 魚缸刷清理水質 */
    static cleanWater(playerData: PlayerData) {
        const env = playerData.tankEnvironment;
        env.waterQualityStatus = "clean";
        env.lastCleanTime = new Date().toISOString();
        env.loginDaysSinceClean = 0; // 重置登入日累積
        console.log("魚缸已清理，狀態變為乾淨");
    }

    /** 判斷是否應該更新水溫（12 小時一次） */
    static shouldUpdateTemperature(playerData: PlayerData): boolean {
        const env = playerData.tankEnvironment;
        const last = new Date(env.lastTempUpdateTime || new Date());
        const now = new Date();
        const hours = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
        return hours >= 12;
    }

    /** 執行水溫更新（±2°C 隨機） */
    static updateTemperature(playerData: PlayerData) {
        const env = playerData.tankEnvironment;
        const delta = Math.random() * 4 - 2; // -2 ~ +2
        env.temperature = Math.round((env.temperature + delta) * 10) / 10;
        env.lastTempUpdateTime = new Date().toISOString();
        env.isTemperatureDanger = env.temperature < 18 || env.temperature > 23;
        console.log(`水溫更新為 ${env.temperature}°C，是否異常：${env.isTemperatureDanger}`);
    }

    /** 檢查是否水質變髒（以登入日累積判斷） */
    static checkWaterDirty(playerData: PlayerData) {
        const env = playerData.tankEnvironment;
        const days = env.loginDaysSinceClean ?? 0;
        if (days >= 2) {
            env.waterQualityStatus = "dirty";
            console.log("魚缸已變髒！（以登入日累積達 2 天）");
        }
    }

    /** 是否要感冒（水質或水溫異常） */
    static shouldCauseCold(playerData: PlayerData): boolean {
        const env = playerData.tankEnvironment;
        return env.isTemperatureDanger || env.waterQualityStatus === "dirty";
    }
}
