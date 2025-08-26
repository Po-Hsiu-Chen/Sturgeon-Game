import { _decorator, Component, Label } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CategoryTab')
export class CategoryTab extends Component {
  @property(Label) title: Label = null!;

  private _tabName = '全部';
  private _onPick: (n: string) => void = () => {};

  init(name: string, onPick: (n: string) => void) {
    this._tabName = name;
    this._onPick = onPick;
    if (this.title) this.title.string = name;
  }

  onClick() { this._onPick(this._tabName); }
}

