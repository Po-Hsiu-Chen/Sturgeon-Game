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

/** 取得今天是週幾（週一 = 0） */
export function getTodayIndex(): number {
    //const day = 6; // 測試用
    const day = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    return (day + 6) % 7; // 轉換為 Mon=0, ..., Sun=6
}

/** 計算本週一 */
export function getWeekStartKey(date = new Date(), tzOffsetMinutes = 480): string {
    const shifted = new Date(date.getTime() + tzOffsetMinutes * 60_000);
    const d = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
    const dow = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    d.setUTCDate(d.getUTCDate() - dow);  // 回到本週一
    return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}
