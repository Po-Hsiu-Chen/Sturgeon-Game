import {
  _decorator, Component, Node, Prefab, instantiate, Sprite, Label, ProgressBar, UITransform,
  Vec3
} from 'cc';
const { ccclass, property } = _decorator;

// -------- 資料結構定義 --------

/** 魚的即時狀態：是否飢餓、過熱、過冷、生病 */
interface FishStatus {
    hungry: boolean;
    hot: boolean;
    cold: boolean;
    sick: boolean;
}

/** 魚的穿搭裝備資料 */
interface FishOutfit {
    head: string | null;         // 頭
    accessories: string[];       // 其他
}

/** 魚的資料結構 */
interface FishData {
    id: number;                          // 魚 ID
    name: string;                        // 名字
    gender: "male" | "female";           // 性別
    stage: number;                       // 成長階段（1 = 魚卵）
    growthDaysRequired: number;         // 成長所需天數
    growthDaysPassed: number;           // 已經經過的天數
    lastFedDate: string;                 // 最後一次被餵的時間
    hunger: number;                      // 飢餓值（0 = 飽）
    hungerRateMultiplier: number;       // 飢餓速度倍率
    appearance: "ugly" | "beautiful";   // 外觀美醜
    outfit: FishOutfit;                 // 時裝資訊
    isMarried: boolean;                 // 是否已婚
    spouseId: number | null;            // 配偶 ID
    status: FishStatus;                 // 即時狀態
    emotion: "happy" | "sad" | "angry" | "hungry" | "cold" | "hot";  // 情緒狀態
}

/** 魚缸的資料結構 */
interface TankData {
    id: number;             // 魚缸 ID
    name: string;           // 魚缸名稱
    waterQuality: number;   // 水質（0~100 暫定）
    temperature: number;    // 水溫（單位°C）
    comfort: number;        // 舒適度（0~100 暫定）
    fishIds: number[];      // 此魚缸內的魚 ID 陣列
}

/** 玩家資料結構 */
interface PlayerData {
    id: number;                     // 玩家 ID
    dragonBones: number;           // 遊戲貨幣（龍骨）
    fishList: FishData[];          // 擁有的魚列表
    tankList: TankData[];          // 擁有的魚缸列表
    consecutiveLoginDays: number; // 連續登入天數
    lastLoginDate: string;          // 最後一次登入
    inventory: {
        feeds: {
            normal: number;        // 普通飼料數量
            premium: number;       // 高級飼料數量
        };
        items: {
            coldMedicine: number;  // 感冒藥
            revivePotion: number;  // 復活藥
            heater: number;        // 加熱器
            fan: number;           // 電風扇
            cleaner: number;       // 淨水劑
        };
    };
    fashion: {
        owned: string[];           // 已擁有的時裝
    };
}

// -------- 遊戲主控 --------

@ccclass('GameManager')
export class GameManager extends Component {
    @property(Prefab)
    swimmingFishPrefab: Prefab = null!;  // 魚的 Prefab

    @property(Node)
    fishArea: Node = null!;              // 魚可以活動的區域

    /** 初始化玩家資料（只執行一次） */
    initPlayerData() {
        const existingData = localStorage.getItem('playerData');
        if (existingData) {
            console.log('已有玩家資料，略過初始化');
            return;
        }

        // 建立初始三隻魚
        const fishList: FishData[] = [];

        for (let i = 1; i <= 3; i++) {
            fishList.push({
                id: i,
                name: `鱘龍${i}號`,
                gender: i % 2 === 0 ? "female" : "male",
                stage: 1,
                growthDaysRequired: 10,
                growthDaysPassed: 0,
                lastFedDate: new Date().toISOString(),
                hunger: 33,
                hungerRateMultiplier: 1.0,
                appearance: "ugly",
                outfit: {
                    head: null,
                    accessories: [],
                },
                isMarried: false,
                spouseId: null,
                status: {
                    hungry: false,
                    hot: false,
                    cold: false,
                    sick: false,
                },
                emotion: "happy"
            });
        }

        // 建立初始玩家資料
        const playerData: PlayerData = {
            id: 1,
            dragonBones: 100,
            fishList: fishList,
            tankList: [{
                id: 1,
                name: "主魚缸",
                waterQuality: 100,
                temperature: 21,
                comfort: 80,
                fishIds: [1, 2, 3]
            }],
            consecutiveLoginDays: 0,
            lastLoginDate: new Date().toISOString().split('T')[0],
            inventory: {
                feeds: {
                    normal: 10,
                    premium: 3
                },
                items: {
                    coldMedicine: 1,
                    revivePotion: 1,
                    heater: 1,
                    fan: 1,
                    cleaner: 2
                }
            },
            fashion: {
                owned: []
            }
        };

        // 存入 localStorage
        localStorage.setItem('playerData', JSON.stringify(playerData));
        console.log('玩家資料已初始化：', playerData);
    }

    /** 處理魚的狀態更新 */
    processDailyUpdate() {
        const playerData = JSON.parse(localStorage.getItem('playerData'));
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        const lastLogin = playerData.lastLoginDate || today;
        const daysPassed = Math.floor((Date.parse(today) - Date.parse(lastLogin)) / (1000 * 60 * 60 * 24));
        if (daysPassed <= 0) return;

        for (const fish of playerData.fishList) {
            if (fish.isDead) continue;

            const lastFedTime = new Date(fish.lastFedDate).getTime();
            const nowTime = now.getTime();
            const hoursSinceFed = (nowTime - lastFedTime) / (1000 * 60 * 60);

            // 飢餓值 = 小時數 / 72 × 100，最多不超過 100
            fish.hunger = Math.min(100, Math.floor((hoursSinceFed / 72) * 100));

            // 判斷是否死亡
            if (fish.hunger >= 100) {
                fish.isDead = true;
                fish.hunger = 100;
                fish.emotion = "hungry";
            }

            // 成長與升級
            fish.growthDaysPassed += daysPassed;
            if (fish.growthDaysPassed >= fish.growthDaysRequired && fish.stage < 6) {
                fish.stage++;
                fish.growthDaysPassed = 0;

                const nextGrowthMap = { 1: 10, 2: 20, 3: 40, 4: 50, 5: 60 };
                fish.growthDaysRequired = nextGrowthMap[fish.stage] || 999;
            }

            // 更新情緒
            if (!fish.isDead) {
                fish.emotion = fish.hunger >= 80 ? "hungry" : "happy";
            }
        }

        playerData.lastLoginDate = today;
        localStorage.setItem('playerData', JSON.stringify(playerData));
        console.log(`📅 經過 ${daysPassed} 天，魚狀態已更新`);
    }


    /** 生成所有魚的實體節點 */
    spawnAllFish() {
        const playerData = JSON.parse(localStorage.getItem('playerData'));
        const fishList = playerData.fishList;

        // 取得魚區的寬高資訊
        const fishAreaTransform = this.fishArea.getComponent(UITransform);
        const width = fishAreaTransform.width;
        const height = fishAreaTransform.height;

        const margin = 50;  // 安全邊距，避免魚貼邊出現

        for (const fish of fishList) {
            const fishNode = instantiate(this.swimmingFishPrefab);
            fishNode.name = `Fish_${fish.id}`;

            // 隨機生成位置（保留邊距）
            const randX = Math.random() * (width - margin * 2) - (width / 2 - margin);
            const randY = Math.random() * (height - margin * 2) - (height / 2 - margin);
            fishNode.setPosition(randX, randY, 0);

            // 隨機方向（初始朝左或朝右）
            const initialDirection = Math.random() > 0.5 ? 1 : -1;
            fishNode.setScale(new Vec3(initialDirection, 1, 1)); // 預設用 scale 反映方向
            fishNode["initialDirection"] = initialDirection;     // 傳給 SwimmingFish 用

            // 加到魚區上
            this.fishArea.addChild(fishNode);
        }
    }

    
    /** 遊戲開始時執行的初始化流程 */
    start() {
        this.initPlayerData();   // 初始化玩家資料
        this.processDailyUpdate();   // 更新魚的狀態
        this.spawnAllFish();     // 產生所有魚
    }

    update(deltaTime: number) {
        
    }
}
