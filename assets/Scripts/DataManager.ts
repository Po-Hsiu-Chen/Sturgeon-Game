import { _decorator, Component, Node } from 'cc';
import { quizQuestions } from './quiz/QuizData';
import { getWeekStartKey } from './utils/utils';
const { ccclass, property } = _decorator;

// -------- 資料結構定義 --------

/** 魚的即時狀態 */
interface FishStatus {
    hungry: boolean;
    hot: boolean;
    cold: boolean;
    sick: boolean;
}

/** 時裝 */
interface FishOutfit {
    head: string | null;         // 頭
    accessories: string[];       // 其他
}

/** 魚本身 */
export interface FishData {
    id: number;                          // 魚 ID
    name: string;                        // 名字
    gender: "male" | "female";           // 性別
    stage: number;                       // 成長階段（1 = 魚卵）
    growthDaysPassed: number;            // 已經經過的天數
    lastFedDate: string;                 // 最後一次被餵的時間
    hunger: number;                      // 飢餓值（0 = 飽）
    hungerRateMultiplier: number;        // 飢餓速度倍率
    appearance: "ugly" | "beautiful";    // 外觀美醜
    outfit: FishOutfit;                  // 時裝資訊
    isMarried: boolean;                  // 是否已婚
    spouseId: number | null;             // 配偶 ID
    status: FishStatus;                  // 即時狀態
    emotion: "happy" | "sad" | "angry" | "hungry" | "cold" | "hot" | "dead" | "sick";  // 情緒狀態
    isDead: boolean;                     // 是否死了
    deathDate?: string;                  // 死掉時間
    tankId: number;                      // 所在魚缸
}

/** 共用魚缸環境 */
interface TankEnvironment {
    temperature: number;                    // 當前水溫（°C）
    lastTempUpdateTime: string;             // 上次更新水溫的時間
    waterQualityStatus: "clean" | "dirty";  // 水質狀態
    lastCleanTime: string;                  // 上次清理時間
    isTemperatureDanger: boolean;           // 是否水溫異常（登入後根據時間計算）
    loginDaysSinceClean: number;            // 清缸後累積的登入天數
    badEnvLoginDays?: number;               // 連續壞環境的登入天數
}

/** 魚缸 */
interface TankData {
    id: number;             // 魚缸 ID
    name: string;           // 魚缸名稱
    comfort: number;        // 舒適度（0~100 暫定）
    fishIds: number[];      // 此魚缸內的魚 ID 陣列
}

/** 玩家 */
export interface PlayerData {
    id: number;                    // 玩家 ID
    dragonBones: number;           // 遊戲貨幣（龍骨）
    lastLoginDate: string;         // 上次登入日期（升級用）
    lastLoginTime: string;         // 用來計算小時差（飢餓值用）
    fishList: FishData[];          // 擁有的魚列表
    tankList: TankData[];          // 擁有的魚缸列表
    tankEnvironment: TankEnvironment;  // 魚缸環境狀態
    inventory: {
        feeds: {
            normal: number;        // 普通飼料數量
            premium: number;       // 高級飼料數量
        };
        items: {
            coldMedicine: number;  // 感冒藥
            revivePotion: number;  // 復活藥
            genderPotion: number;  // 變性藥
            upgradePotion: number; // 升級藥
            changePotion: number;  // 整形藥
            heater: number;        // 加熱器
            fan: number;           // 電風扇
            brush: number;         // 魚缸刷
        };
    };
    fashion: {
        owned: string[];           // 已擁有的時裝
    };
    signInData: {
        weekly: {
            weekKey: number;               // 該週星期一
            daysSigned: boolean[];         // 一週 7 天簽到紀錄
            questionsCorrect: boolean[];   // 是否答對紀錄
            lastSignDate: string;          // 最後簽到日期
        },
        monthly: {
            month: number;                 // 月份（1~12）
            year: number;                  // 年（跨年重置）
            signedDaysCount: number;       // 當月已簽到幾天
            lastSignDate: string;          // 最後簽到日期
        }
    };

}

export interface QuizQuestion {
    question: string;
    options: string[];
    answerIndex: number; // 正確答案在 options 陣列中的位置
}

export class DataManager {
    static useLocalStorage = true;

    static async getPlayerData(): Promise<PlayerData | null> {
        if (this.useLocalStorage) {
            const json = localStorage.getItem('playerData');
            return json ? JSON.parse(json) : null;
        } else {
            // 預留：未來接 API 或 Firebase 可以寫這裡
            const res = await fetch('/api/player');
            return await res.json();
        }
    }

    static async savePlayerData(data: any) {
        if (this.useLocalStorage) {
            localStorage.setItem('playerData', JSON.stringify(data));
        } else {
            await fetch('/api/player', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        }
    }

    /** 初始化玩家資料（若不存在） */
    static async ensureInitialized() {
        const existing = await this.getPlayerData();
        if (existing) return;

        // 建立初始三隻魚
        const fishList = [];
        for (let i = 1; i <= 3; i++) {
            fishList.push({
                id: i,
                name: `鱘龍${i}號`,
                gender: i % 2 === 0 ? "female" : "male",
                // stage: 1,
                // growthDaysPassed: 0,
                stage: 2, // 測試用
                growthDaysPassed: 14, // 測試用
                lastFedDate: new Date().toISOString(),
                hunger: 33,
                hungerRateMultiplier: 1.0,
                appearance: "ugly",
                outfit: { head: null, accessories: [] },
                isMarried: false,
                spouseId: null,
                status: { hungry: false, hot: false, cold: false, sick: false },
                emotion: "happy",
                isDead: false,
                tankId: 1
            });
        }

        const newPlayer = {
            id: 1,
            dragonBones: 666,
            lastLoginDate: new Date().toISOString().split('T')[0],
            fishList,
            tankList: [{
                id: 1,
                name: "主魚缸",
                waterQuality: 100,
                temperature: 21,
                comfort: 80,
                fishIds: [1, 2, 3]
            }],
            tankEnvironment: {
                temperature: 21,
                lastTempUpdateTime: new Date().toISOString(),
                waterQualityStatus: "clean",
                lastCleanTime: new Date().toISOString(),
                isTemperatureDanger: false,
                loginDaysSinceClean: 0,
                badEnvLoginDays: 0,
            },
            inventory: {
                feeds: { normal: 666, premium: 66 },
                items: {
                    coldMedicine: 10,
                    revivePotion: 10,
                    genderPotion: 10,
                    upgradePotion: 10,
                    heater: 10,
                    fan: 15,
                    brush: 17
                }
            },
            fashion: { owned: [] },
            signInData: {
                weekly: {
                    //daysSigned: [false, false, false, false, false, false, true], // 測試用
                    weekKey: getWeekStartKey(),
                    daysSigned: [false, false, false, false, false, false, false],
                    questionsCorrect: [false, false, false, false, false, false, false],
                    lastSignDate: ""
                },
                monthly: {
                    month: new Date().getMonth() + 1,
                    year: new Date().getFullYear(),
                    signedDaysCount: 2,
                    lastSignDate: ""
                }
            }
        };

        await this.savePlayerData(newPlayer);
        console.log("玩家資料初始化完成！");
    }

    static async getQuizQuestions(): Promise<{ question: string; options: string[]; answerIndex: number }[]> {
        if (this.useLocalStorage) {
            return quizQuestions;
        } else {
            const res = await fetch('/api/quiz');
            const data = await res.json();
            return data.questions;
        }
    }

    /** 清除本地儲存的玩家資料（測試用） */
    static clearPlayerData() {
        if (this.useLocalStorage) {
            localStorage.removeItem('playerData');
            console.log('玩家資料已清除');
        }
    }
}


