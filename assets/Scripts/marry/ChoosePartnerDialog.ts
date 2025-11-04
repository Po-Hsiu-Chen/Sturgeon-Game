// ChoosePartnerDialog.ts
import {
  _decorator,
  Component,
  Node,
  Button,
  Prefab,
  instantiate,
  Label,
  ScrollView,
} from 'cc';
import { GameManager } from '../GameManager';
import { FishData, PlayerData } from '../DataManager';
import { showFloatingTextCenter } from '../utils/UIUtils';

const { ccclass, property } = _decorator;

enum TabKind { My = 0, Friend = 1 }

@ccclass('ChoosePartnerDialog')
export class ChoosePartnerDialog extends Component {

  // ====== 參考節點 / Prefab ======
  @property(GameManager) gameManager: GameManager = null!;

  @property(Node) titleLabelNode: Node = null!;           // 標題 Label（可有可無）
  @property(Node) mySection: Node = null!;                 // "我的魚" 區塊（整個容器）
  @property(Node) myListContent: Node = null!;             // ScrollView/View/Content
  @property(Node) friendSection: Node = null!;             // "好友的魚" 區塊（整個容器）
  @property(Node) friendListContent: Node = null!;         // ScrollView/View/Content
  @property(Prefab) rowPrefab: Prefab = null!;             // 列表單列：需有子節點 Name(Label) / Choose(Button)

  @property(Button) myTabBtn: Button = null!;              // 分頁按鈕：我的魚
  @property(Button) friendTabBtn: Button = null!;          // 分頁按鈕：好友的魚
  @property(Button) closeBtn: Button = null!;              // 關閉按鈕

  @property(Node) floatingNode: Node = null!;

  // 狀態 
  private myFishId: number = -1;       // 發起結婚的那條我的魚
  private currentTab: TabKind = TabKind.My;

  // 由外部（FriendPanel / GameManager）注入好友候選的提供者
  // 回傳陣列，每一項包含 fish 與其 owner 的 gameId
  private friendCandidatesProvider: null | (() => { ownerGameId: string, fish: FishData }[]) = null;
  private _uiBound = false;


  onLoad() {
    if (!this._uiBound) {
      console.log("[ChooseDialog] onEnable 被呼叫");
      this.bindUI();
      this._uiBound = true;
    }
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

  /** 設定好友候選提供者（可之後再接） */
  public setFriendCandidatesProvider(
    provider: () => { ownerGameId: string, fish: FishData }[]
  ) {
    this.friendCandidatesProvider = provider;
  }

  /** 關閉視窗 */
  public close() {
    this.node.active = false;
  }

  // UI 綁定
  private bindUI() {
    console.log("[ChooseDialog] bindUI() 被執行");
    this.myTabBtn?.node.on(Button.EventType.CLICK, () => this.switchTab(TabKind.My), this);
    this.friendTabBtn?.node.on(Button.EventType.CLICK, () => this.switchTab(TabKind.Friend), this);
    this.closeBtn?.node.on(Button.EventType.CLICK, () => this.close(), this);
  }

  private switchTab(tab: TabKind) {
    const wantFriend = (tab === TabKind.Friend);

    if (wantFriend && !this.friendCandidatesProvider) {
      // 提示：沒有朋友的魚可以選擇
      showFloatingTextCenter(this.floatingNode, "還沒有朋友的魚可以選擇 🐟");

      // 保持在「我的魚」，不要靜默切換
      tab = TabKind.My;
    }

    this.currentTab = tab;
    const showMy = (tab === TabKind.My);
    this.mySection.active = showMy;
    this.friendSection.active = !showMy;
    this.friendTabBtn.interactable = !!this.friendCandidatesProvider;
  }

  // 列表渲染
  private renderLists() {
    this.clearList(this.myListContent);
    this.clearList(this.friendListContent);

    const me = this.gameManager.getMyPlayer();
    const myCandidates = this.getMyCandidates(me);

    // --- 我的魚清單 ---
    for (const f of myCandidates) {
      this.addRow(this.myListContent, f, me.gameId);
    }

    // --- 好友魚清單 ---
    if (this.friendCandidatesProvider) {
      const items = this.friendCandidatesProvider();
      for (const { ownerGameId, fish } of items) {
        if (!this.isCandidate(fish)) continue;
        this.addRow(this.friendListContent, fish, ownerGameId);
      }
      // 啟用好友分頁
      if (this.friendTabBtn) this.friendTabBtn.interactable = true;
    } else {
      // 沒設定 provider：禁用好友分頁
      if (this.friendTabBtn) this.friendTabBtn.interactable = false;
    }
  }


  private clearList(content: Node) {
    if (!content) return;
    content.removeAllChildren();
  }

  private addRow(parent: Node, fish: FishData, ownerGameId: string) {
    const row = instantiate(this.rowPrefab);
    row.parent = parent;

    // 取 Label（容錯：找 Name / NameLabel / Title / 第一個 Label）
    const tryNames = ['Name', 'NameLabel', 'Title', 'Label'];
    let nameLabel: Label | null = null;
    for (const n of tryNames) {
      const nNode = row.getChildByName(n);
      if (nNode) { const lab = nNode.getComponent(Label); if (lab) { nameLabel = lab; break; } }
    }
    if (!nameLabel) nameLabel = row.getComponentInChildren(Label) ?? null;

    if (nameLabel) {
      const g = fish.gender === 'male' ? '♂' : '♀';
      nameLabel.string = `${fish.name}（${g}）  Lv.${fish.stage}`;
    } else {
      console.warn('[ChoosePartnerDialog] RowPrefab 缺 Label（Name/NameLabel/Title/Label 都找不到）');
    }

    if (ownerGameId !== this.gameManager.getMyPlayer().gameId) {
      nameLabel.string += "  (好友)";
    }

    // 綁 Choose 按鈕（容錯抓子樹的第一個 Button 也行）
    const chooseBtn = row.getChildByName('Choose')?.getComponent(Button)
      || row.getComponentInChildren(Button);
    chooseBtn?.node.on(Button.EventType.CLICK, async () => {
      try {
        console.log("[ChoosePartnerDialog] choose", { myFishId: this.myFishId, partnerId: fish.id, ownerGameId });
        await this.gameManager.marryFish(this.myFishId, fish.id, ownerGameId);
        this.close();               // 成功就關閉面板
      } catch (e) {
        console.error("[ChoosePartnerDialog] marry failed", e);
      }
    });
  }


  // ====== 候選條件 ======
  private getMyCandidates(me: PlayerData): FishData[] {
    return me.fishList
      .filter(f => this.isCandidate(f) && f.id !== this.myFishId);
  }

  private isCandidate(f: FishData): boolean {
    // 成魚、活著、未婚（你的規則）
    const isAdult = (f.stage ?? 0) >= 6;
    return !!f && !f.isDead && !f.isMarried && isAdult;
  }
}
