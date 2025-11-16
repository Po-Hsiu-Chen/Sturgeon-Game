import { _decorator, Component, Sprite, SpriteFrame, resources } from "cc";
const { ccclass, property } = _decorator;

@ccclass("BackgroundAnimator")
export class BackgroundAnimator extends Component {
  @property([SpriteFrame])
  frames: SpriteFrame[] = [];

  @property
  fps: number = 10;

  private _sprite: Sprite = null!;
  private _t = 0;
  private _i = 0;

  // 用來記錄一開始 Inspector 裡那組預設動畫
  private _defaultFrames: SpriteFrame[] = [];

  onLoad() {
    this._sprite = this.getComponent(Sprite)!;

    // 一開始 Inspector 裡填好的預設動畫，先存一份備份
    this._defaultFrames = this.frames ? this.frames.slice() : [];

    // 如果有預設 frame，先顯示第一張
    if (this.frames.length > 0 && this._sprite) {
      this._sprite.spriteFrame = this.frames[0];
    }
  }

  /**
   * 根據背景 id 載入該背景的整組動畫圖
   * bgId 例如：'bg_azure'、'bg_dream'
   */
  public setBackground(bgId?: string) {
    this._t = 0;
    this._i = 0;

    // 沒指定 完全切回預設那組動畫
    if (!bgId) {
      // 還原成一開始備份的那組
      this.frames = this._defaultFrames ? this._defaultFrames.slice() : [];

      if (this._sprite && this.frames.length > 0) {
        this._sprite.spriteFrame = this.frames[0];
      }
      return;
    }

    // 下面維持原本邏輯：載入 backgrounds/bgId 底下那一整組
    resources.loadDir(`backgrounds/${bgId}`, SpriteFrame, (err, list) => {
      if (err || !list || list.length === 0) {
        resources.load(`backgrounds/${bgId}/spriteFrame`, SpriteFrame, (e1, sf1) => {
          if (!e1 && sf1) {
            this.frames = [sf1];
            if (this._sprite) this._sprite.spriteFrame = sf1;
          }
        });
        return;
      }

      list.sort((a, b) => a.name.localeCompare(b.name));
      this.frames = list;

      if (this._sprite && this.frames.length > 0) {
        this._sprite.spriteFrame = this.frames[0];
      }
    });
  }

  update(dt: number) {
    if (this.frames.length <= 1) return; // 只有一張就當作靜態背景

    this._t += dt;
    const frameDuration = 1 / this.fps;

    if (this._t >= frameDuration) {
      this._t -= frameDuration;
      this._i = (this._i + 1) % this.frames.length;
      if (this._sprite) {
        this._sprite.spriteFrame = this.frames[this._i];
      }
    }
  }
}
