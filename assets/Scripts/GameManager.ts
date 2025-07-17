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
        const today = now.toISOString().split('T')[0];

        const lastLogin = playerData.lastLoginDate || today;
        const daysPassed = Math.floor((Date.parse(today) - Date.parse(lastLogin)) / (1000 * 60 * 60 * 24));

        const stageRequirements = {
            1: 10,  // 第1階段 10天
            2: 20,  // 第2階段 20天
            3: 40,  // 第3階段 40天
            4: 50,  // 第4階段 50天
            5: 60,  // 第5階段 60天
            6: 999, // 第6階段後無上限
        };
        
        if (daysPassed <= 0) return;  // 今天已經處理過

        for (const fish of playerData.fishList) {
            if (fish.isDead) continue;

            // 累積天數
            fish.growthDaysPassed += daysPassed;

            // 升級邏輯：檢查是否達到升級的條件
            if (fish.growthDaysPassed >= fish.growthDaysRequired && fish.stage < 6) {
                fish.stage++;  // 升級
                fish.growthDaysPassed = 0;  // 重置成長天數
                if (fish.stage < 6) {
                    fish.growthDaysRequired = stageRequirements[fish.stage];
                } 
                console.log(`${fish.name} 升級到第 ${fish.stage} 階！`);
            }

            // 更新情緒
            fish.emotion = fish.hunger >= 80 ? "hungry" : "happy";
        }

        playerData.lastLoginDate = today;
        await DataManager.savePlayerData(playerData);
        console.log(`經過 ${daysPassed} 天，魚狀態已更新`);
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
