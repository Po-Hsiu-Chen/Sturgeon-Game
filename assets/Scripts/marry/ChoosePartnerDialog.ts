import {
  _decorator,
  Component,
  Node,
  Button,
  Prefab,
  instantiate,
  Label,
  ScrollView,
  Sprite,
  Color,
  UITransform,
} from "cc";
import { GameManager } from "../GameManager";
import { FishData, PlayerData } from "../DataManager";
import { showFloatingTextCenter } from "../utils/UIUtils";

const { ccclass, property } = _decorator;

enum TabKind {
  My = 0,
  Friend = 1,
}

@ccclass("ChoosePartnerDialog")
export class ChoosePartnerDialog extends Component {
  // ====== 參考節點 / Prefab ======
  @property(GameManager) gameManager: GameManager = null!;

  @property(Node) titleLabelNode: Node = null!; // 標題 Label（可有可無）
  @property(Node) mySection: Node = null!; // "我的魚" 區塊（整個容器）
  @property(Node) myListContent: Node = null!; // ScrollView/View/Content
  @property(Node) friendSection: Node = null!; // "好友的魚" 區塊（整個容器）
  @property(Node) friendListContent: Node = null!; // ScrollView/View/Content
  @property(Prefab) rowPrefab: Prefab = null!; // 列表單列：需有子節點 Name(Label) / Choose(Button)

  @property(Button) myTabBtn: Button = null!; // 分頁按鈕：我的魚
  @property(Button) friendTabBtn: Button = null!; // 分頁按鈕：好友的魚
  @property(Button) closeBtn: Button = null!; // 關閉按鈕

  @property(Node) floatingNode: Node = null!;

  // 狀態
  private myFishId: number = -1; // 發起結婚的那條我的魚
  private currentTab: TabKind = TabKind.My;

  // 由外部（FriendPanel / GameManager）注入好友候選的提供者
  // 回傳陣列，每一項包含 fish 與其 owner 的 gameId
  private friendCandidatesProvider: null | (() => { ownerGameId: string; fish: FishData }[]) = null;
  private _uiBound = false;

  onLoad() {
    if (!this._uiBound) {
      console.log("[ChooseDialog] onLoad -> bindUI()");
      this.bindUI();
      this._uiBound = true;
    }
    // 初始預設分頁狀態（確保顏色正確）
    this.currentTab = TabKind.My;
    this.updateTabVisuals();
  }

  // Public API

  /** 打開對話框，指定我方要結婚的魚 id */
  public openFor(myFishId: number) {
    console.log("[ChooseDialog] openFor, myFishId =", myFishId);
    this.myFishId = myFishId;
    this.node.active = true;
    console.log("[ChooseDialog] node.active 已設 true");
    this.switchTab(TabKind.My);
    this.renderLists();
  }

  /** 設定好友候選提供者 */
  public setFriendCandidatesProvider(provider: () => { ownerGameId: string; fish: FishData }[]) {
    this.friendCandidatesProvider = () => {
      const arr = provider() ?? [];
      console.log("[ChooseDialog] 取用 friendCandidates，長度 =", arr.length);
      return arr;
    };
    console.log("[ChooseDialog] provider 已注入（非空？）=", !!provider);
  }

  /** 關閉視窗 */
  public close() {
    this.node.active = false;
  }

  // UI 綁定
  private bindUI() {
    console.log("[ChooseDialog] bindUI() 綁定中");
    this.myTabBtn?.node.on(
      Button.EventType.CLICK,
      () => {
        console.log("[ChooseDialog] MyTab CLICK");
        this.switchTab(TabKind.My);
      },
      this
    );

    this.friendTabBtn?.node.on(
      Button.EventType.CLICK,
      () => {
        console.log("[ChooseDialog] FriendTab CLICK");
        this.switchTab(TabKind.Friend);
      },
      this
    );

    this.closeBtn?.node.on(
      Button.EventType.CLICK,
      () => {
        console.log("[ChooseDialog] Close CLICK");
        this.close();
      },
      this
    );
  }

  private switchTab(tab: TabKind) {
    console.log("[ChooseDialog] switchTab ->", tab, "provider?", !!this.friendCandidatesProvider);

    const wantFriend = tab === TabKind.Friend;

    if (wantFriend && !this.friendCandidatesProvider) {
      console.warn("[ChooseDialog] 想切 Friend，但 provider 為空，改回 My");
      showFloatingTextCenter(this.floatingNode, "還沒有朋友的魚可以選擇 🐟");
      tab = TabKind.My;
    }

    this.currentTab = tab;
    const showMy = tab === TabKind.My;
    this.mySection.active = showMy;
    this.friendSection.active = !showMy;
    this.friendTabBtn.interactable = !!this.friendCandidatesProvider;

    console.log("[ChooseDialog] 顯示分頁：", showMy ? "My" : "Friend");
    this.updateTabVisuals();

    // 切 TAB 後重畫
    this.renderLists();
  }

  /** 依目前分頁更新「我的魚 / 好友」兩個分頁按鈕的顏色 */
  private updateTabVisuals() {
    const onColor = Color.WHITE; // 被選中顏色
    const offColor = new Color(220, 220, 220, 255); // 未選中顏色

    // 幫按鈕找要換色的 Sprite：優先找子節點 "Frame"，找不到就用按鈕自己
    const paint = (btn: Button | null, isOn: boolean) => {
      if (!btn) return;
      const node = btn.node;
      const frameNode = node.getChildByName("Frame");
      const sprite = (frameNode ?? node).getComponent(Sprite);
      if (sprite) sprite.color = isOn ? onColor : offColor;
    };

    paint(this.myTabBtn, this.currentTab === TabKind.My);
    paint(this.friendTabBtn, this.currentTab === TabKind.Friend);

    // 如果朋友分頁被禁用（沒有候選），你也可以讓它維持未選的灰色或另做顏色處理
    // 例如：禁用時再加深一點灰色
    if (this.friendTabBtn && !this.friendCandidatesProvider) {
      const node = this.friendTabBtn.node;
      const frameNode = node.getChildByName("Frame");
      const sprite = (frameNode ?? node).getComponent(Sprite);
      if (sprite) sprite.color = new Color(180, 180, 180, 255);
    }
  }

  // 列表渲染
  private renderLists() {
    this.clearList(this.myListContent);
    this.clearList(this.friendListContent);

    // ======== My Tab ========
    const me = this.gameManager.getMyPlayer();
    const myCandidates = this.getMyCandidates(me);
    let myShown = 0;
    for (const f of myCandidates) {
      if (!this.isCandidate(f)) continue;
      this.addRow(this.myListContent, f, me.gameId);
      myShown++;
    }

    if (myShown === 0) {
      // 在自己的 TAB 顯示提示
      this.showEmptyMessage(this.myListContent, "你目前沒有可結婚的魚 🐟");
    }

    // ======== Friend Tab ========
    if (this.friendCandidatesProvider) {
      const items = this.friendCandidatesProvider();
      let friendShown = 0;

      for (const { ownerGameId, fish } of items) {
        if (!this.isCandidate(fish)) continue;
        this.addRow(this.friendListContent, fish, ownerGameId);
        friendShown++;
      }

      if (friendShown === 0) {
        // 在朋友的 TAB 顯示提示
        this.showEmptyMessage(this.friendListContent, "朋友目前沒有可結婚的魚 🫂🐟");
      }
    }

    this.updateTabVisuals();
  }

  private showEmptyMessage(parent: Node, msg: string) {
    const labelNode = new Node("EmptyMessage");
    const label = labelNode.addComponent(Label);

    label.string = msg;
    label.fontSize = 24;
    label.lineHeight = 28;

    // 讓文字置中
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;

    // 設定文字顏色為黑色
    label.color = new Color(0, 0, 0, 255); // R, G, B, A

    // Anchor 用 UITransform
    const ui = labelNode.addComponent(UITransform);
    ui.setAnchorPoint(0.5, 0.5);

    // 位置置中
    labelNode.setPosition(0, 0, 0);

    parent.addChild(labelNode);
  }

  private clearList(content: Node) {
    if (!content) return;
    content.removeAllChildren();
  }

  private addRow(parent: Node, fish: FishData, ownerGameId: string) {
    const row = instantiate(this.rowPrefab);
    row.parent = parent;

    // 取 Label（容錯：找 Name / NameLabel / Title / 第一個 Label）
    const tryNames = ["Name", "NameLabel", "Title", "Label"];
    let nameLabel: Label | null = null;
    for (const n of tryNames) {
      const nNode = row.getChildByName(n);
      if (nNode) {
        const lab = nNode.getComponent(Label);
        if (lab) {
          nameLabel = lab;
          break;
        }
      }
    }
    if (!nameLabel) nameLabel = row.getComponentInChildren(Label) ?? null;

    if (nameLabel) {
      const g = fish.gender === "male" ? "♂" : "♀";
      nameLabel.string = `${fish.name}（${g}）  Lv.${fish.stage}`;
    } else {
      console.warn("[ChoosePartnerDialog] RowPrefab 缺 Label（Name/NameLabel/Title/Label 都找不到）");
    }

    if (ownerGameId !== this.gameManager.getMyPlayer().gameId) {
      nameLabel.string += "  (好友)";
    }

    // 綁 Choose 按鈕（容錯抓子樹的第一個 Button 也行）
    const chooseBtn = row.getChildByName("Choose")?.getComponent(Button) || row.getComponentInChildren(Button);
    chooseBtn?.node.on(Button.EventType.CLICK, async () => {
      try {
        console.log("[ChoosePartnerDialog] choose", { myFishId: this.myFishId, partnerId: fish.id, ownerGameId });
        await this.gameManager.marryFish(this.myFishId, fish.id, ownerGameId);
        this.close(); // 成功就關閉面板
      } catch (e) {
        console.error("[ChoosePartnerDialog] marry failed", e);
      }
    });
  }

  // ====== 候選條件 ======
  private getMyCandidates(me: PlayerData): FishData[] {
    return me.fishList.filter((f) => this.isCandidate(f) && f.id !== this.myFishId);
  }

  private isCandidate(f: FishData): boolean {
    // 成魚、活著、未婚（你的規則）
    const isAdult = (f.stage ?? 0) >= 6;
    return !!f && !f.isDead && !f.isMarried && isAdult;
  }
}
