import { _decorator, Component, Node, Prefab, instantiate, Label, Button } from "cc";
import { DataManager, FishData, PlayerData } from "./DataManager";
import { playOpenPanelAnim, showFloatingTextCenter } from "./utils/UIUtils";
import { ConfirmDialogManager } from "./ConfirmDialogManager";
const { ccclass, property } = _decorator;

@ccclass("TombManager")
export class TombManager extends Component {
  @property(ConfirmDialogManager) confirm: ConfirmDialogManager = null!; // 確認視窗
  @property(Node) floatingNode: Node = null!; // 浮動提示訊息
  @property(Node) tombContainer: Node = null!; // 墓碑區容器
  @property(Prefab) tombstonePrefab: Prefab = null!; // 墓碑 Prefab
  @property(Node) deadFishDetailPanel: Node = null!; // 死魚詳細資訊面板

  // 魚詳細資訊 Label
  @property(Label) titleLabel: Label = null!;
  @property(Label) nameLabel: Label = null!;
  @property(Label) genderLabel: Label = null!;
  @property(Label) daysLabel: Label = null!;
  @property(Label) stageLabel: Label = null!;
  @property(Label) deathDateLabel: Label = null!;

  // 按鈕與數量顯示
  @property(Node) reviveBtn: Node = null!; // 復活按鈕
  @property(Label) reviveCountLabel: Label = null!; // 復活藥數量
  @property(Node) resetBtn: Node = null!; // 重養按鈕

  // 關閉按鈕
  @property(Node) closeBtn: Node = null!;

  private deadFishList: FishData[] = []; // 死魚列表

  /** 載入死亡魚資料並刷新墓碑 (GameManager用) */
  public async init() {
    const data = await DataManager.getPlayerDataCached();
    if (!data) return;
    this.deadFishList = data.fishList.filter((f) => f.isDead);
    this.refreshTombs();
  }

  /** 刷新墓碑區 */
  async refreshTombs() {
    const data = await DataManager.getPlayerDataCached();
    this.deadFishList = data.fishList.filter((f) => f.isDead);

    // 清空墓碑再重新生成
    this.tombContainer.removeAllChildren();
    if (this.deadFishList.length === 0) return;

    for (const fish of this.deadFishList) {
      const tomb = instantiate(this.tombstonePrefab);
      tomb.getComponentInChildren(Label)!.string = fish.name;

      // 點擊墓碑顯示死亡魚詳情
      tomb.on(Node.EventType.TOUCH_END, () => this.showDeadFishDetail(fish));
      this.tombContainer.addChild(tomb);
    }
  }

  /** 顯示死魚詳細資訊面板 */
  async showDeadFishDetail(fish: FishData) {
    playOpenPanelAnim(this.deadFishDetailPanel);

    const data = await DataManager.getPlayerDataCached();
    const reviveCount = data.inventory.items.revivePotion;

    // 更新 UI 顯示
    this.reviveCountLabel.string = `${reviveCount}`;
    this.reviveBtn.getComponent(Button)!.interactable = reviveCount > 0;

    this.titleLabel.string = `${fish.name} 的魚生回憶`;
    this.nameLabel.string = `名字：${fish.name}`;
    this.genderLabel.string = `性別：${fish.gender === "male" ? "公魚" : "母魚"}`;
    this.daysLabel.string = `成長天數：牠努力生活了 ${fish.growthDaysPassed} 天`;
    this.stageLabel.string = `階段：LV ${fish.stage}`;
    this.deathDateLabel.string = `離開的日子：在 ${fish.deathDate ?? "未知"}，牠悄悄地離開了魚缸`;

    // 先清掉舊事件，避免重複綁定
    this.reviveBtn.off(Node.EventType.TOUCH_END);
    this.resetBtn.off(Node.EventType.TOUCH_END);
    this.closeBtn.off(Node.EventType.TOUCH_END);

    // 綁定復活按鈕
    if (reviveCount > 0) {
      this.reviveBtn.on(Node.EventType.TOUCH_END, async () => {
        const ok = await this.confirm.ask(`確定要復活 ${fish.name} 嗎？`);
        if (!ok) return;
        await this.reviveFish(fish);
      });
    }

    // 綁定重養按鈕
    this.resetBtn.on(Node.EventType.TOUCH_END, async () => {
      const ok = await this.confirm.ask(`確定要讓 ${fish.name} 重新開始嗎？`);
      if (!ok) return;
      await this.resetFish(fish);
    });

    // 關閉詳情面板
    this.closeBtn.on(Node.EventType.TOUCH_END, () => {
      this.deadFishDetailPanel.active = false;
    });
  }

  /** 復活魚 */
  async reviveFish(fish: FishData) {
    const data = await DataManager.getPlayerDataCached();
    if (data.inventory.items.revivePotion <= 0) {
      console.warn("沒有復活藥");
      return;
    }

    const index = data.fishList.findIndex((f) => f.id === fish.id);
    if (index === -1) return;

    // 先確保有魚缸可以放
    const ok = this.ensureTankForRevive(data, data.fishList[index]);
    if (!ok.ok) {
      if (ok.msg) showFloatingTextCenter(this.floatingNode, ok.msg);
      return;
    }

    // 修改狀態（這時 fish.tankId 可能已被搬到新缸）
    data.inventory.items.revivePotion--;
    data.fishList[index].isDead = false;
    data.fishList[index].emotion = "happy";
    data.fishList[index].hunger = 50;

    await DataManager.savePlayerDataWithCache(data);

    showFloatingTextCenter(
      this.floatingNode,
      `${data.fishList[index].name} 已復活，快去 ${data.fishList[index].tankId} 號魚缸看看牠吧！`
    );
    this.deadFishDetailPanel.active = false;
    this.refreshTombs();
  }

  /** 重新開始養 */
  async resetFish(fish: FishData) {
    const data = await DataManager.getPlayerDataCached();
    const index = data.fishList.findIndex((f) => f.id === fish.id);
    if (index === -1) return;

    const ok = this.ensureTankForRevive(data, data.fishList[index]);
    if (!ok.ok) {
      if (ok.msg) showFloatingTextCenter(this.floatingNode, ok.msg);
      return;
    }

    data.fishList[index].isDead = false;
    data.fishList[index].emotion = "happy";
    data.fishList[index].stage = 1;
    data.fishList[index].growthDaysPassed = 0;
    data.fishList[index].hunger = 50;

    await DataManager.savePlayerDataWithCache(data);

    showFloatingTextCenter(
      this.floatingNode,
      `${data.fishList[index].name} 已重新開始，快去 ${data.fishList[index].tankId} 號魚缸看看牠吧！`
    );
    this.deadFishDetailPanel.active = false;
    this.refreshTombs();
  }

  /** 幫某隻魚找可以放的魚缸；原缸滿時嘗試搬到其它缸 */
  private ensureTankForRevive(data: PlayerData, fish: FishData): { ok: boolean; msg?: string } {
    const originalTank = data.tankList.find((t) => t.id === fish.tankId);
    if (!originalTank) {
      return { ok: false, msg: "找不到原本的魚缸" };
    }

    const calcAlive = (tankId: number) => {
      const tank = data.tankList.find((t) => t.id === tankId);
      if (!tank) return 0;
      return tank.fishIds.map((id) => data.fishList.find((f) => f.id === id)).filter((f) => f && !f.isDead).length;
    };

    const getCap = (tankId: number) => {
      const t = data.tankList.find((t) => t.id === tankId);
      if (!t) return 0;
      return t.capacity ?? (t.id === 1 ? 3 : 6);
    };

    // 1) 原缸有空位 → 不用搬
    const cap = getCap(fish.tankId);
    const alive = calcAlive(fish.tankId);
    if (alive < cap) {
      return { ok: true };
    }

    // 2) 找其它有空位的缸
    for (const t of data.tankList) {
      const c = getCap(t.id);
      const a = calcAlive(t.id);
      if (a < c) {
        // 從原缸移到這個缸
        const oldTank = originalTank;
        oldTank.fishIds = oldTank.fishIds.filter((id) => id !== fish.id);
        t.fishIds.push(fish.id);
        fish.tankId = t.id;
        return { ok: true };
      }
    }

    // 3) 所有魚缸都滿
    return { ok: false, msg: "所有魚缸都滿了，請先騰出空位再復活" };
  }
}
