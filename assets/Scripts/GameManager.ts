import { _decorator, Component, Node, Prefab, instantiate, Sprite, Label, ProgressBar, UITransform, Vec3 } from 'cc';
import { SwimmingFish } from './SwimmingFish';
import { DataManager } from './DataManager';

const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {

    @property(Node)
    fishArea: Node = null!;  // 魚可以活動的區域

    @property([Prefab])
    fishPrefabsByStage: Prefab[] = [];  // 1~6 階魚 Prefab

    /** 處理魚的狀態更新 */
    async processDailyUpdate() {
        const playerData = await DataManager.getPlayerData();
        const now = new Date();

        const today = now.toISOString().split('T')[0];  // 只取日期部分
        const lastLoginDate = playerData.lastLoginDate || today;
        const lastLoginTime = new Date(playerData.lastLoginTime || now);  // 時間部分

        // 計算時間差
        const msDiff = now.getTime() - lastLoginTime.getTime();
        const hoursPassed = msDiff / (1000 * 60 * 60);  // 精準到小時
        const daysPassed = Math.floor((Date.parse(today) - Date.parse(lastLoginDate)) / (1000 * 60 * 60 * 24));  // 整天

        const hungerPerHour = 100 / 72;  // 每小時增加的飢餓值
        const stageRequirements = {
            1: 10,
            2: 20,
            3: 40,
            4: 50,
            5: 60,
            6: 999,
        };

        for (const fish of playerData.fishList) {
            if (fish.isDead) continue;

            // 飢餓更新
            fish.hunger += hoursPassed * hungerPerHour;
            fish.hunger = Math.min(fish.hunger, 100);

            if (fish.hunger >= 100) {
                fish.isDead = true;
                fish.emotion = "dead";
                console.log(`${fish.name} 因飢餓過久而死亡`);
                continue;
            }

            // 成長處理（只根據 calendar days）
            if (daysPassed > 0) {
                fish.growthDaysPassed += daysPassed;

                if (fish.growthDaysPassed >= fish.growthDaysRequired && fish.stage < 6) {
                    fish.stage++;
                    fish.growthDaysPassed = 0;

                    if (fish.stage < 6) {
                        fish.growthDaysRequired = stageRequirements[fish.stage];
                    }

                    console.log(`${fish.name} 升級到第 ${fish.stage} 階！`);
                }
            }

            // 情緒更新
            fish.emotion = fish.hunger >= 80 ? "hungry" : "happy";
        }

        // 更新記錄的時間
        playerData.lastLoginDate = today;
        playerData.lastLoginTime = now.toISOString();

        await DataManager.savePlayerData(playerData);
        console.log(`更新完成：經過 ${hoursPassed.toFixed(2)} 小時，飢餓與成長資料已更新`);
    }

    /** 生成所有魚的實體節點 */
    async spawnAllFish() {
        const playerData = await DataManager.getPlayerData();
        const fishList = playerData.fishList;

        const fishAreaTransform = this.fishArea.getComponent(UITransform);
        const width = fishAreaTransform.width;
        const height = fishAreaTransform.height;
        const margin = 50;

        for (const fish of fishList) {
            // 根據階段取得對應 prefab
            const prefab = this.fishPrefabsByStage[fish.stage - 1];
            if (!prefab) {
                console.warn(`找不到階段 ${fish.stage} 對應的魚 prefab`);
                continue;
            }

            const fishNode = instantiate(prefab);
            const swimmingFish = fishNode.getComponent(SwimmingFish);
            if (swimmingFish) {
                swimmingFish.setFishData(fish);
            }

            fishNode.name = `Fish_${fish.id}`;
            
            // 隨機位置
            const randX = Math.random() * (width - margin * 2) - (width / 2 - margin);
            const randY = Math.random() * (height - margin * 2) - (height / 2 - margin);
            fishNode.setPosition(randX, randY, 0);

            // 隨機方向
            const initialDirection = Math.random() > 0.5 ? 1 : -1;
            fishNode.setScale(new Vec3(initialDirection, 1, 1));
            fishNode["initialDirection"] = initialDirection;

            this.fishArea.addChild(fishNode);
            console.log(`生成魚 ${fish.name}（階段 ${fish.stage}）於 (${randX}, ${randY})`);
        }
    }

    /** 遊戲開始時執行的初始化流程 */
    async start() {
        await DataManager.ensureInitialized();
        await this.processDailyUpdate();
        await this.spawnAllFish();
    }

    update(deltaTime: number) {
        
    }
}
