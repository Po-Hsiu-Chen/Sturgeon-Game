import { FishData, PlayerData } from "../DataManager";

export interface IGameAdapter {
  getMyPlayer(): PlayerData;
  getPlayerByGameId(gameId: string): PlayerData | null;
  saveMyPlayer(reason: string): Promise<void>;
  toast(msg: string): void;
  getCurrentTankId(): number;
  addBabyFishToTank(targetOwnerGameId: string, tankId: number): Promise<number>;
  countEmptySlots(owner: PlayerData): number;
  canMutateOtherPlayer(gameId: string): boolean;
  enqueueMailFor(gameId: string, subject: string, payload: any): Promise<void>;
}

export const COST_MARRIAGE = 30;
export const COST_BIRTH = 50;
export const ADULT_STAGE = 6;


export class FishFamilyService {
  constructor(private adapter: IGameAdapter) { }

  // ------- 查找小工具 -------
  private findFishByIdAndOwner(id: number, owner: PlayerData): FishData | null {
    return owner.fishList.find(f => f.id === id) ?? null;
  }
  private isAdult(f: FishData) { return f.stage >= ADULT_STAGE; }
  private isAlive(f: FishData) { return !f.isDead; }

  // ------- 結婚 -------
  public canMarry(a: FishData, aOwner: PlayerData, b: FishData, bOwner: PlayerData) {
    if (!this.isAdult(a) || !this.isAdult(b)) return { ok: false, msg: "雙方都需要是成魚（LV6）" };
    if (!this.isAlive(a) || !this.isAlive(b)) return { ok: false, msg: "其中一方已死亡" };
    if (a.isMarried || b.isMarried) return { ok: false, msg: "只能與未婚魚結婚" };

    const me = this.adapter.getMyPlayer();
    if (me.dragonBones < COST_MARRIAGE) return { ok: false, msg: `龍骨不足（需要 ${COST_MARRIAGE}）` };
    return { ok: true };
  }

  public async marry(aId: number, aOwnerGameId: string, bId: number, bOwnerGameId: string) {
    const me = this.adapter.getMyPlayer();
    const aOwner = aOwnerGameId === me.gameId ? me : this.adapter.getPlayerByGameId(aOwnerGameId);
    const bOwner = bOwnerGameId === me.gameId ? me : this.adapter.getPlayerByGameId(bOwnerGameId);
    if (!aOwner || !bOwner) { this.adapter.toast("找不到玩家資料"); return false; }

    const a = this.findFishByIdAndOwner(aId, aOwner);
    const b = this.findFishByIdAndOwner(bId, bOwner);
    if (!a || !b) { this.adapter.toast("找不到魚"); return false; }

    const v = this.canMarry(a, aOwner, b, bOwner);
    if (!v.ok) { this.adapter.toast(v.msg); return false; }

    // 扣我方龍骨
    me.dragonBones -= COST_MARRIAGE;

    // 建立雙向關係（注意：若跨玩家，暫存在 Mail，由對方上線套用亦可）
    const now = new Date().toISOString();
    a.isMarried = true; a.spouseId = b.id; a.spouseOwnerGameId = bOwner.gameId; a.marriedAt = now;
    b.isMarried = true; b.spouseId = a.id; b.spouseOwnerGameId = aOwner.gameId; b.marriedAt = now;

    await this.adapter.saveMyPlayer("marry");

    if (bOwner.gameId !== me.gameId) {
      if (this.adapter.canMutateOtherPlayer(bOwner.gameId)) {
        await this.adapter.saveMyPlayer("marry-cross"); // 或者有單獨 API 同步對方
      } else {
        // 改成寄送 Mail，請後端在對方上線時套用關係
        await this.adapter.enqueueMailFor(bOwner.gameId, "marry", {
          type: "MARRY_APPLY",
          partnerId: a.id,
          partnerOwner: aOwner.gameId,
          fishId: b.id,
          fishOwner: bOwner.gameId,
          marriedAt: now
        });
      }
    }

    this.adapter.toast(`結婚成功！已花費 ${COST_MARRIAGE} 龍骨`);
    return true;
  }

  // ------- 生魚寶寶 -------
  public canBreed(a: FishData, aOwner: PlayerData, b: FishData, bOwner: PlayerData) {
    if (!a.isMarried || !b.isMarried) return { ok: false, msg: "尚未結婚" };
    if (!this.isAlive(a) || !this.isAlive(b)) return { ok: false, msg: "其中一方已死亡" };
    if (a.gender === b.gender) return { ok: false, msg: "生魚寶寶需要一公一母" };

    const me = this.adapter.getMyPlayer();
    const cross = (bOwner.gameId !== me.gameId);
    const myNeed = 1;
    const friendNeed = cross ? 1 : 0;

    const myEmpty = this.adapter.countEmptySlots(me);
    const friendEmpty = cross ? this.adapter.countEmptySlots(bOwner) : Infinity;

    if (myEmpty < myNeed) return { ok: false, msg: "你的魚缸沒有空位" };
    if (cross && friendEmpty < friendNeed) return { ok: false, msg: "好友魚缸沒有空位" };

    if (me.dragonBones < COST_BIRTH) return { ok: false, msg: `龍骨不足（需要 ${COST_BIRTH}）` };

    return { ok: true, cross };
  }

  public async breed(aId: number) {
    const me = this.adapter.getMyPlayer();
    const a = this.findFishByIdAndOwner(aId, me);
    if (!a || !a.isMarried || !a.spouseId || !a.spouseOwnerGameId) {
      this.adapter.toast("配偶資訊不完整");
      return false;
    }
    const bOwner = a.spouseOwnerGameId === me.gameId ? me : this.adapter.getPlayerByGameId(a.spouseOwnerGameId);
    if (!bOwner) { this.adapter.toast("找不到配偶所屬玩家"); return false; }
    const b = this.findFishByIdAndOwner(a.spouseId, bOwner);
    if (!b) { this.adapter.toast("找不到配偶"); return false; }

    const v = this.canBreed(a, me, b, bOwner);
    if (!v.ok) { this.adapter.toast(v.msg); return false; }

    // 扣 50 龍骨（由發起方負擔）
    me.dragonBones -= COST_BIRTH;

    const myTankId = this.adapter.getCurrentTankId();
    await this.adapter.addBabyFishToTank(me.gameId, myTankId);

    if (v.cross) {
      // 好友那一條：若不能直接改，就寄 Mail
      if (this.adapter.canMutateOtherPlayer(bOwner.gameId)) {
        const friendTankId = myTankId; // 也可用對方預設缸或最空的缸
        await this.adapter.addBabyFishToTank(bOwner.gameId, friendTankId);
      } else {
        await this.adapter.enqueueMailFor(bOwner.gameId, "new-baby", {
          type: "GRANT_BABY",
          suggestedTankId: myTankId
        });
      }
    }

    await this.adapter.saveMyPlayer("breed");
    this.adapter.toast("魚寶寶誕生啦！");
    return true;
  }

  // ------- 死亡解婚 -------
  public dissolveOnDeath(deadFish: FishData) {
    if (!deadFish.isMarried || deadFish.spouseId == null || !deadFish.spouseOwnerGameId) return false;
    const me = this.adapter.getMyPlayer();
    const spouseOwner = deadFish.spouseOwnerGameId === me.gameId ? me : this.adapter.getPlayerByGameId(deadFish.spouseOwnerGameId);
    const spouse = spouseOwner?.fishList.find(f => f.id === deadFish.spouseId);
    // 清除雙向關係
    deadFish.isMarried = false; deadFish.spouseId = null; deadFish.spouseOwnerGameId = null;
    if (spouse) { spouse.isMarried = false; spouse.spouseId = null; spouse.spouseOwnerGameId = null; }
    return true;
  }
}
