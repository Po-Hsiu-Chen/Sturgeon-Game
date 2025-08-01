export class FishLogic {
    static feed(fish: any, inventory: any, amount: number, type: 'normal' | 'premium'): string {
        if (inventory.feeds[type] <= 0) {
            return `沒有 ${type === 'normal' ? '普通' : '高級'}飼料了`;
        }

        inventory.feeds[type]--;
        fish.hunger = Math.max(0, fish.hunger - amount);
        fish.lastFedDate = new Date().toISOString();

        return `已餵食 ${fish.name}，飢餓值 -${amount}`;
    }

    static renameFish(fish: any, newName: string): boolean {
        if (!newName || newName.length > 12) return false;
        fish.name = newName;
        return true;
    }

    static getEmotionKey(fish: any): 'happy' | 'sad' | null {
        if (fish.emotion === 'happy') return 'happy';
        if (fish.emotion === 'sad') return 'sad';
        return null;
    }

    static useUpgradePotion(fish: any, items: any): { message: string; upgraded: boolean } {
        if (items.upgradePotion <= 0) {
            return { message: "沒有升級藥了", upgraded: false };
        }
        if (fish.isDead) {
            return { message: "魚已死亡，不能使用升級藥", upgraded: false };
        }
        if (fish.stage >= 6) {
            return { message: "這隻魚已達最高階段", upgraded: false };
        }

        items.upgradePotion--;
        fish.growthDaysPassed += 5;

        if (fish.growthDaysPassed >= fish.growthDaysRequired) {
            fish.stage++;
            fish.growthDaysPassed = 0;

            // 設定下一階段所需天數
            const stageRequirements: Record<number, number> = {
                1: 10,
                2: 20,
                3: 40,
                4: 50,
                5: 60,
                6: 999,
            };
            if (fish.stage < 6) {
                fish.growthDaysRequired = stageRequirements[fish.stage];
            }

            return { message: `${fish.name} 升級為第 ${fish.stage} 階！`, upgraded: true };
        }

        return { message: `${fish.name} 成長進度提升了 +5 天！`, upgraded: false };
    }


    static useGenderPotion(fish: any, items: any): string {
        if (items.genderPotion <= 0) {
            return "沒有變性藥了";
        }
        if (fish.isDead) {
            return "魚已死亡，不能變性";
        }

        items.genderPotion--;
        fish.gender = fish.gender === "male" ? "female" : "male";
        
        return `${fish.name} 的性別已變更為 ${fish.gender === 'male' ? '公' : '母'}`;
    }
}