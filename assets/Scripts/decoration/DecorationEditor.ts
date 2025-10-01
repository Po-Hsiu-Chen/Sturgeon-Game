// assets/scripts/decor/DecorationEditor.ts
import { _decorator, Component, Node, Button, Label, Prefab, instantiate, UITransform, Sprite, Color, tween, UIOpacity, v3, resources, SpriteFrame } from 'cc';
import { DataManager, PlayerData } from '../DataManager';
import { GameManager } from '../GameManager';
import { DecorationItem } from './DecorationItem';


const { ccclass, property } = _decorator;

/** 儲存至存檔的裝飾資料結構 */
type DecoData = {
    id: string;
    x: number;
    y: number;
    scale?: number;
    rotation?: number;
    flipX?: boolean;
    zIndex?: number;
};

/** 統一管理名稱前綴，避免魔術字串分散 */
const DECORATION_PREFIX = 'Deco_';

@ccclass('DecorationEditor')
export class DecorationEditor extends Component {
    @property(Node) panel: Node = null!;                 // 編輯面板（覆蓋在魚缸上）
    @property(Node) paletteContent: Node = null!;        // 裝飾清單的容器（垂直/格狀都可）
    @property(Button) confirmBtn: Button = null!;
    @property(Button) cancelBtn: Button = null!;
    @property(Prefab) paletteButtonPrefab: Prefab = null!; // Palette 卡片（Icon + Title）
    @property([Node]) hideDuringEdit: Node[] = [];       // 進入編輯時需要隱藏的其他 UI 面板

    private gm!: GameManager;
    private decoLayer!: Node;
    private tankId!: number;
    private snapshot: DecoData[] = [];

    onLoad() {
        if (this.panel) this.panel.active = false;
        this.confirmBtn?.node.on(Node.EventType.TOUCH_END, this.onConfirm, this);
        this.cancelBtn?.node.on(Node.EventType.TOUCH_END, this.onCancel, this);
    }

    onDestroy() {
        if (this.decoLayer) {
            this.decoLayer.off(Node.EventType.CHILD_ADDED, this.updatePaletteLockState, this);
            this.decoLayer.off(Node.EventType.CHILD_REMOVED, this.updatePaletteLockState, this);
        }
        this.confirmBtn?.node.off(Node.EventType.TOUCH_END, this.onConfirm, this);
        this.cancelBtn?.node.off(Node.EventType.TOUCH_END, this.onCancel, this);
    }

    /** 進入編輯（只允許：自己的魚缸 + 非墓地） */
    async enter(gm: GameManager, tankId: number) {
        this.gm = gm;
        this.tankId = tankId;

        if ((gm as any).isViewingFriend || gm.tombTankNode?.active) return;

        const viewport = gm.activeTankViewport;
        const layer = viewport?.getChildByName('DecoLayer');
        if (!layer) {
            console.warn('[DecorationEditor] 找不到 DecoLayer');
            return;
        }
        this.decoLayer = layer;

        // 確保每個子物件都有 DecorationItem，名稱補上前綴
        for (const child of this.decoLayer.children) {
            if (!child.getComponent(DecorationItem)) child.addComponent(DecorationItem);
            if (!child.name.startsWith(DECORATION_PREFIX)) {
                child.name = `${DECORATION_PREFIX}${child.name}`;
            }
        }

        this.decoLayer.on(Node.EventType.CHILD_ADDED, this.updatePaletteLockState, this);
        this.decoLayer.on(Node.EventType.CHILD_REMOVED, this.updatePaletteLockState, this);

        const p = await DataManager.getPlayerDataCached();
        const tank = p.tankList.find((t) => t.id === tankId);
        this.snapshot = (tank?.decorations ?? []).map((d) => ({ ...d }));

        this.setDecorationInteractable(true);
        this.openPanel();
        this.setPanelsVisible(false);
        await this.renderPalette(p);
        this.updatePaletteLockState();
    }

    /** 打開面板（含透明動效） */
    private openPanel() {
        if (!this.panel) return;
        const op = this.panel.getComponent(UIOpacity) ?? this.panel.addComponent(UIOpacity);
        op.opacity = 0;
        this.panel.active = true;
        tween(op).to(0.15, { opacity: 255 }).start();
    }

    /** 關閉面板並恢復非編輯狀態 */
    private closePanel() {
        if (!this.panel) return;
        this.setDecorationInteractable(false);
        this.setPanelsVisible(true);
        if (this.decoLayer) {
            this.decoLayer.off(Node.EventType.CHILD_ADDED, this.updatePaletteLockState, this);
            this.decoLayer.off(Node.EventType.CHILD_REMOVED, this.updatePaletteLockState, this);
        }
        this.panel.active = false;
    }

    /** 進入/退出編輯時，同步隱藏/顯示其他 UI 面板 */
    private setPanelsVisible(visible: boolean) {
        for (const n of this.hideDuringEdit ?? []) {
            if (!n) continue;
            if (this.panel && (n === this.panel || n.isChildOf?.(this.panel) || this.panel.isChildOf?.(n))) {
                continue;
            }
            n.active = visible;
        }
    }

    /** 建立 Palette（每個已擁有的裝飾 → 一張卡片按鈕） */
    private async renderPalette(p: PlayerData) {
        if (!this.paletteContent) return;

        // 強制需要 prefab
        if (!this.paletteButtonPrefab) {
            console.error('[DecorationEditor] 請先在檢查器指定 paletteButtonPrefab。');
            return;
        }

        this.paletteContent.removeAllChildren();

        const owned: string[] = (p as any).decorationsOwned ?? [];
        if (owned.length === 0) {
            const hint = new Node('EmptyHint');
            const label = hint.addComponent(Label);
            label.string = '尚未擁有裝飾，請先到商城購買。';
            this.paletteContent.addChild(hint);
            return;
        }

        await Promise.all(
            owned.map(async (sku) => {
                const card = instantiate(this.paletteButtonPrefab);
                card.setParent(this.paletteContent);

                // Title（prefab 需有子節點 Title 或任一 Label）
                const title =
                    card.getChildByName('Title')?.getComponent(Label) ?? card.getComponentInChildren(Label);
                if (title) title.string = sku;

                // Icon（prefab 需有子節點 Icon 才會顯示）
                const iconNode = card.getChildByName('Icon');
                if (iconNode) {
                    const sp = iconNode.getComponent(Sprite) ?? iconNode.addComponent(Sprite);
                    const sf = await this.loadIconFrame(sku);
                    if (sf) sp.spriteFrame = sf;
                }

                // 鎖定/半透明 + 點擊事件
                const already = this.hasDecoration(sku);
                const btn = card.getComponent(Button) ?? card.addComponent(Button);
                btn.interactable = !already;
                btn.node.on(Node.EventType.TOUCH_END, () => this.spawnItem(sku, 0, 0), this);

                const opa = card.getComponent(UIOpacity) ?? card.addComponent(UIOpacity);
                opa.opacity = already ? 120 : 255;
            })
        );
    }

    /** 依當前 DecoLayer 狀態，更新 Palette 卡片互動/透明度 */
    private updatePaletteLockState() {
        if (!this.paletteContent) return;

        for (const card of this.paletteContent.children) {
            const lab =
                card.getChildByName('Title')?.getComponent(Label) ?? card.getComponentInChildren(Label);
            const sku = lab?.string ?? '';
            const already = this.hasDecoration(sku);

            const btn = card.getComponent(Button) ?? card.addComponent(Button);
            const opa = card.getComponent(UIOpacity) ?? card.addComponent(UIOpacity);
            btn.interactable = !already;
            opa.opacity = already ? 120 : 255;
        }
    }

    /** 從 resources/icons 載入 SpriteFrame（優先 icons/<key>/spriteFrame，其次 icons/<key>） */
    private async loadIconFrame(key: string): Promise<SpriteFrame | null> {
        return new Promise((resolve) => {
            resources.load(`icons/${key}/spriteFrame`, SpriteFrame, (err, sf) => {
                if (!err && sf) return resolve(sf);
                resources.load(`icons/${key}`, SpriteFrame, (err2, sf2) => {
                    resolve(err2 ? null : sf2);
                });
            });
        });
    }

    /** 新增一個裝飾實例到 DecoLayer（每種裝飾限制一個） */
    private spawnItem(decoId: string, offsetX = 0, offsetY = 0) {
        if (this.hasDecoration(decoId)) {
            console.warn(`[Decor] 每缸僅能放一個：${decoId}`);
            return;
        }
        const prefab = this.gm.getDecorationPrefab(decoId) as Prefab | null | undefined;
        if (!prefab) {
            console.warn('找不到裝飾 Prefab：', decoId);
            return;
        }

        const n = instantiate(prefab);
        n.name = `${DECORATION_PREFIX}${decoId}`;
        n.setPosition(offsetX, offsetY, 0);
        this.decoLayer.addChild(n);

        // 讓新物件可拖曳/縮放/刪除
        const di = n.getComponent(DecorationItem) ?? n.addComponent(DecorationItem);
        n.resumeSystemEvents(true);
        di.selectMe();

        // 放了一個後，同步更新 Palette 鎖定狀態
        this.updatePaletteLockState();
    }

    /** 切換裝飾是否可互動（非編輯模式時要完全不可點） */
    private setDecorationInteractable(enabled: boolean) {
        if (!this.decoLayer) return;
        for (const ch of this.decoLayer.children) {
            if (enabled) ch.resumeSystemEvents(true);
            else ch.pauseSystemEvents(true);

            const di = ch.getComponent(DecorationItem);
            if (di) di.setSelected(false); // 進編輯時先收起；點擊才出現
        }
    }

    /** 讀取 DecoLayer → 存回 playerData.tank.decorations */
    private async save() {
        const p = await DataManager.getPlayerDataCached();
        const tank = p.tankList.find((t) => t.id === this.tankId);
        if (!tank) return;

        const data: DecoData[] = [];
        for (const n of this.decoLayer.children) {
            const id = this.getDecoIdFromNode(n);
            if (!id) continue;

            const pos = n.getPosition();
            const sc = n.getScale();

            data.push({
                id,
                x: Math.round(pos.x),
                y: Math.round(pos.y),
                scale: Math.abs(sc.x),
                rotation: Math.round(n.eulerAngles.z),
                flipX: sc.x < 0,
                zIndex: n.getSiblingIndex(),
            });
        }
        tank.decorations = data;
        await DataManager.savePlayerDataWithCache(p);
    }

    /** 退出並存檔 */
    async onConfirm() {
        await this.save();
        const switchTank = (this.gm as any)['switchTank'];
        if (typeof switchTank === 'function') {
            await switchTank.call(this.gm, this.tankId);
        }
        this.closePanel();
    }

    /** 退出不存（還原快照） */
    async onCancel() {
        const p = await DataManager.getPlayerDataCached();
        const tank = p.tankList.find((t) => t.id === this.tankId);
        if (tank) {
            tank.decorations = this.snapshot.map((d) => ({ ...d }));
            await DataManager.savePlayerDataWithCache(p);

            const switchTank = (this.gm as any)['switchTank'];
            if (typeof switchTank === 'function') {
                await switchTank.call(this.gm, this.tankId);
            }
        }
        this.closePanel();
    }

    /** 是否已在此缸放置了指定裝飾 */
    private hasDecoration(decoId: string): boolean {
        const name = `${DECORATION_PREFIX}${decoId}`;
        return this.decoLayer.children.some((n) => n.name === name);
    }

    /** 從節點名稱還原裝飾 id（e.g. Deco_XYZ → XYZ） */
    private getDecoIdFromNode(n: Node): string | null {
        return n.name.startsWith(DECORATION_PREFIX)
            ? n.name.substring(DECORATION_PREFIX.length)
            : null;
    }
}