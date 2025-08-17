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

        const upgraded = this.tryStageUpgradeByGrowthDays(fish);

        const message = upgraded
            ? `${fish.name} 升級為第 ${fish.stage} 階！（吃藥長大）`
            : `${fish.name} 成長天數 +5`;

        return { message, upgraded };
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

    static useColdMedicine(fish: any, items: any): { message: string; cured: boolean } {
        if (items.coldMedicine <= 0) {
            return { message: '沒有感冒藥了', cured: false };
        }
        if (fish.isDead) {
            return { message: '魚已死亡，不能使用感冒藥', cured: false };
        }

        // 保險：status 可能還沒建立
        if (!fish.status) {
            fish.status = { sick: false };
        }

        if (!fish.status.sick) {
            return { message: `${fish.name} 並沒有生病`, cured: false };
        }

        items.coldMedicine -= 1;
        fish.status.sick = false;
        fish.emotion = 'happy'; // sick -> happy（UI 立即更新）

        return { message: `${fish.name} 已治癒`, cured: true };
    }

    static tryStageUpgradeByGrowthDays(fish: any): boolean {
        const thresholds: Record<number, number> = {
            1: 0,
            2: 5,
            3: 15,
            4: 35,
            5: 60,
            6: 90,
        };

        let upgraded = false;

        while (fish.stage < 6 && fish.growthDaysPassed >= thresholds[fish.stage + 1]) {
            fish.stage++;
            upgraded = true;
        }

        return upgraded;
    }

}

