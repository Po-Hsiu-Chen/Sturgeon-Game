/** 打亂順序 */
export function shuffleArray<T>(array: T[]): T[] {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/** 取隨機 */
export function getRandomItem<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

/** 計算今年第幾週 */
export function getCurrentWeekIndex(): number {
    const now = new Date();
    const firstThursday = new Date(now.getFullYear(), 0, 1);
    // 找到第一個週四（ISO 週從包含週四的週一開始）
    while (firstThursday.getDay() !== 4) {
        firstThursday.setDate(firstThursday.getDate() + 1);
    }
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    return Math.floor((now.getTime() - firstThursday.getTime()) / msPerWeek) + 1;
}
