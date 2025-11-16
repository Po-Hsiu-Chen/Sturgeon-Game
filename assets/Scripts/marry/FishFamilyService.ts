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
  saveOtherPlayer(other: PlayerData, reason: string): Promise<void>;
}

export const COST_MARRIAGE = 30;
export const COST_BIRTH = 50;
export const ADULT_STAGE = 6;

export class FishFamilyService {
  constructor(private adapter: IGameAdapter) {}

  // ------- 查找小工具 -------
  private findFishByIdAndOwner(id: number, owner: PlayerData): FishData | null {
    return owner.fishList.find((f) => f.id === id) ?? null;
  }

  /** 找出「這個玩家第一個有空位的魚缸 id」（依 id 由小到大） */
  private findFirstAvailableTankId(owner: PlayerData): number | null {
    const tanks = [...owner.tankList].sort((a, b) => a.id - b.id);

    for (const t of tanks) {
      const cap = t.capacity ?? (t.id === 1 ? 3 : 6);
      const alive = t.fishIds
        .map((id) => owner.fishList.find((f) => f.id === id))
        .filter((f): f is FishData => !!f && !f.isDead).length;

      if (alive < cap) {
        return t.id;
      }
    }

    return null; // 沒有任何空位
  }

  private isAdult(f: FishData) {
    return f.stage >= ADULT_STAGE;
  }

  private isAlive(f: FishData) {
    return !f.isDead;
  }

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
    if (!aOwner || !bOwner) {
      this.adapter.toast("找不到玩家資料");
      return false;
    }

    const a = this.findFishByIdAndOwner(aId, aOwner);
    const b = this.findFishByIdAndOwner(bId, bOwner);
    if (!a || !b) {
      this.adapter.toast("找不到魚");
      return false;
    }

    const v = this.canMarry(a, aOwner, b, bOwner);
    if (!v.ok) {
      this.adapter.toast(v.msg);
      return false;
    }

    // 扣我方龍骨
    me.dragonBones -= COST_MARRIAGE;

    // 建立雙向關係（注意：若跨玩家，暫存在 Mail，由對方上線套用亦可）
    const now = new Date().toISOString();
    a.isMarried = true;
    a.spouseId = b.id;
    a.spouseOwnerGameId = bOwner.gameId;
    a.marriedAt = now;
    b.isMarried = true;
    b.spouseId = a.id;
    b.spouseOwnerGameId = aOwner.gameId;
    b.marriedAt = now;

    await this.adapter.saveMyPlayer("marry");

    if (bOwner.gameId !== me.gameId) {
      if (this.adapter.canMutateOtherPlayer(bOwner.gameId)) {
        await this.adapter.saveOtherPlayer(bOwner, "marry-cross");
      } else {
        // 改成寄送 Mail，請後端在對方上線時套用關係
        await this.adapter.enqueueMailFor(bOwner.gameId, "marry", {
          type: "MARRY_APPLY",
          partnerId: a.id,
          partnerOwner: aOwner.gameId,
          fishId: b.id,
          fishOwner: bOwner.gameId,
          marriedAt: now,
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
    const cross = bOwner.gameId !== me.gameId;
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
    if (!bOwner) {
      this.adapter.toast("找不到配偶所屬玩家");
      return false;
    }
    const b = this.findFishByIdAndOwner(a.spouseId, bOwner);
    if (!b) {
      this.adapter.toast("找不到配偶");
      return false;
    }

    const v = this.canBreed(a, me, b, bOwner);
    if (!v.ok) {
      this.adapter.toast(v.msg);
      return false;
    }

    // 再保險：找出雙方「第一個有空位的魚缸」
    const myTankId = this.findFirstAvailableTankId(me);
    if (myTankId == null) {
      this.adapter.toast("你的魚缸沒有空位");
      return false;
    }

    let friendTankId: number | null = null;
    if (v.cross) {
      friendTankId = this.findFirstAvailableTankId(bOwner);
      if (friendTankId == null) {
        this.adapter.toast("好友魚缸沒有空位");
        return false;
      }
    }

    // 扣 50 龍骨（由發起方負擔）
    me.dragonBones -= COST_BIRTH;

    // 自己的寶寶：放到「有空位魚缸中的第一缸」
    await this.adapter.addBabyFishToTank(me.gameId, myTankId);

    // 好友那一條：同樣放到好友「有空位魚缸中的第一缸」
    if (v.cross && friendTankId != null) {
      if (this.adapter.canMutateOtherPlayer(bOwner.gameId)) {
        await this.adapter.addBabyFishToTank(bOwner.gameId, friendTankId);
      } else {
        await this.adapter.enqueueMailFor(bOwner.gameId, "new-baby", {
          type: "GRANT_BABY",
          suggestedTankId: friendTankId,
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
    const spouseOwner =
      deadFish.spouseOwnerGameId === me.gameId ? me : this.adapter.getPlayerByGameId(deadFish.spouseOwnerGameId);
    const spouse = spouseOwner?.fishList.find((f) => f.id === deadFish.spouseId);
    // 清除雙向關係
    deadFish.isMarried = false;
    deadFish.spouseId = null;
    deadFish.spouseOwnerGameId = null;
    if (spouse) {
      spouse.isMarried = false;
      spouse.spouseId = null;
      spouse.spouseOwnerGameId = null;
    }
    return true;
  }
}
