import { _decorator, Component, Node, Prefab, instantiate, Sprite, Label, ProgressBar, UITransform, Vec3 } from 'cc';
import { SwimmingFish } from './SwimmingFish';
import { DataManager } from './DataManager';
const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {

    @property(Node)
    fishArea: Node = null!;  // 魚可以活動的區域

    @property([Prefab])
    maleFishPrefabsByStage: Prefab[] = [];  // 公魚：第1~6階

    @property([Prefab])
    femaleFishPrefabsByStage: Prefab[] = [];  // 母魚：第1~6階

    /** 初始化 */
    async start() {
        await DataManager.ensureInitialized(); // 初始化資料
        await this.processDailyUpdate();       // 更新魚的狀態
        await this.spawnAllFish();             // 產生魚
    }

    /** 處理魚飢餓與成長 */
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

            // 成長處理(以整天計)
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
            let prefab: Prefab | null = null;

            if (fish.gender === "female") {
                prefab = this.femaleFishPrefabsByStage[fish.stage - 1];
            } else {
                prefab = this.maleFishPrefabsByStage[fish.stage - 1];
            }

            if (!prefab) {
                console.warn(`找不到 ${fish.gender} 的階段 ${fish.stage} 魚 prefab`);
                continue;
            }

            const fishNode = instantiate(prefab);
            const swimmingFish = fishNode.getComponent(SwimmingFish);
            if (swimmingFish) {
                swimmingFish.setFishData(fish);
            }

            // 隨機位置與方向
            const randX = Math.random() * (width - margin * 2) - (width / 2 - margin);
            const randY = Math.random() * (height - margin * 2) - (height / 2 - margin);
            const initialDirection = Math.random() > 0.5 ? 1 : -1;

            fishNode.name = `Fish_${fish.id}`;
            fishNode.setPosition(randX, randY, 0);
            fishNode.setScale(new Vec3(initialDirection, 1, 1));
            fishNode["initialDirection"] = initialDirection;

            this.fishArea.addChild(fishNode);
            console.log(`生成${fish.gender === 'female' ? '母魚' : '公魚'} ${fish.name}（階段 ${fish.stage}）於 (${randX}, ${randY})`);
        }
    }

    /** 替換Prefab(變性用) */
    replaceFishNode(fishData: any): Node {
        // 找出原本節點
        const oldFishNode = this.fishArea.getChildByName(`Fish_${fishData.id}`);
        if (!oldFishNode) {
            console.warn(`找不到原魚節點 Fish_${fishData.id}`);
            return null!;
        }
        const oldPos = oldFishNode.getPosition();
        const direction = oldFishNode['initialDirection'] ?? 1;
        oldFishNode.destroy();

        // 根據性別與階段取得 prefab
        const stageIndex = fishData.stage - 1;
        const isMale = fishData.gender === 'male';
        const prefab = isMale
            ? this.maleFishPrefabsByStage[stageIndex]
            : this.femaleFishPrefabsByStage[stageIndex];

        if (!prefab) {
            console.warn(`找不到對應魚 prefab：stage=${fishData.stage}, gender=${fishData.gender}`);
            return null!;
        }

        const newFishNode = instantiate(prefab);
        newFishNode.name = `Fish_${fishData.id}`;
        newFishNode.setPosition(oldPos);
        newFishNode['initialDirection'] = direction;
        newFishNode.setScale(new Vec3(direction, 1, 1));

        this.fishArea.addChild(newFishNode);

        const swimmingFish = newFishNode.getComponent(SwimmingFish);
        if (swimmingFish) {
            swimmingFish.setFishData(fishData);
            swimmingFish.onClickFish?.(); // 讓這隻魚自動成為目前選中的魚
        }

        return newFishNode;
    }

}
