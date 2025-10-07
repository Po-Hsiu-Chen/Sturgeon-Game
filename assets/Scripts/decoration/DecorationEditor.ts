// assets/scripts/decor/DecorationEditor.ts
import { _decorator, Component, Node, Button, Label, Prefab, instantiate, UITransform, Sprite, Color, tween, UIOpacity, v3, resources, SpriteFrame } from 'cc';
import { DataManager, PlayerData } from '../DataManager';
import { GameManager } from '../GameManager';
import { DecorationItem } from './DecorationItem';
import { MOCK_CATALOG } from '../store/mockCatalog';

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

    private currentBgId: string = 'bg_default';
    private isBgSku(sku: string) { return sku.startsWith('bg_') || sku === 'bg_default'; }
    private isDecoSku(sku: string) { return sku.startsWith('deco_'); }

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
        const tank = p.tankList.find(t => t.id === tankId);
        this.snapshot = (tank?.decorations ?? []).map(d => ({ ...d }));
        this.currentBgId = tank?.backgroundId || 'bg_default';

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

        const ownedDecor: string[] = (p as any).decorationsOwned?.filter(this.isDecoSku) ?? [];
        const ownedBg: string[] = this.getOwnedBackgrounds(p);

        const ownedAll = [...ownedBg, ...ownedDecor]; // 背景在前，裝飾在後（你也可分段加小標題）

        await Promise.all(
            ownedAll.map(async (sku) => {
                const card = instantiate(this.paletteButtonPrefab);
                card.setParent(this.paletteContent);
                (card as any).__sku = sku;
                (card as any).__kind = this.isBgSku(sku) ? 'bg' : 'deco';

                // 標題：取中文名
                const title = card.getChildByName('Title')?.getComponent(Label) ?? card.getComponentInChildren(Label);
                const item = MOCK_CATALOG.find(i => i.sku === sku);
                const displayName = item?.name ?? (sku === 'bg_default' ? '預設背景' : sku);
                if (title) title.string = displayName;

                // Icon：背景與裝飾的來源資料夾可能不同 → 依類型載入
                const iconNode = card.getChildByName('Icon');
                if (iconNode) {
                    const sp = iconNode.getComponent(Sprite) ?? iconNode.addComponent(Sprite);
                    const iconKey = item?.iconKey ?? sku;
                    const sf = await this.loadIconFrame(iconKey); // 若你的 backgrounds 也有縮圖，就放在 resources/icons/bg_xxx
                    if (sf) sp.spriteFrame = sf;
                }

                const btn = card.getComponent(Button) ?? card.addComponent(Button);
                const opa = card.getComponent(UIOpacity) ?? card.addComponent(UIOpacity);

                if (this.isBgSku(sku)) {
                    // 背景邏輯：點擊切換背景
                    btn.interactable = true;
                    btn.node.on(Node.EventType.TOUCH_END, () => this.applyBackground(sku), this);
                    opa.opacity = (sku === this.currentBgId) ? 255 : 120; // 選中高亮，其餘半透明
                } else {
                    // 裝飾邏輯：已放上的不可再放
                    const already = this.hasDecoration(sku);
                    btn.interactable = !already;
                    btn.node.on(Node.EventType.TOUCH_END, () => this.spawnItem(sku, 0, 0), this);
                    opa.opacity = already ? 120 : 255;
                }
            })
        );

    }

    /** 依當前 DecoLayer 狀態，更新 Palette 卡片互動/透明度 */
    private updatePaletteLockState() {
        if (!this.paletteContent) return;

        for (const card of this.paletteContent.children) {
            const sku = (card as any).__sku as string;
            const kind = (card as any).__kind as 'bg' | 'deco';
            const btn = card.getComponent(Button) ?? card.addComponent(Button);
            const opa = card.getComponent(UIOpacity) ?? card.addComponent(UIOpacity);

            if (kind === 'bg') {
                btn.interactable = true;
                opa.opacity = (sku === this.currentBgId) ? 120 : 255; // 使用中半透明，未使用不透明
            } else {
                const already = this.hasDecoration(sku);
                btn.interactable = !already;
                opa.opacity = already ? 120 : 255;
            }
        }
    }


    /** 從 resources/icons 載入 SpriteFrame（優先 icons/<key>/spriteFrame，其次 icons/<key>） */
    private async loadIconFrame(key: string): Promise<SpriteFrame | null> {
        return new Promise((resolve) => {
            // 先從 icons/ 找
            resources.load(`icons/${key}/spriteFrame`, SpriteFrame, (err, sf) => {
                if (!err && sf) return resolve(sf);

                // 再從 icons/<key> 嘗試
                resources.load(`icons/${key}`, SpriteFrame, (err2, sf2) => {
                    if (!err2 && sf2) return resolve(sf2);

                    // 最後再從 backgrounds/ 嘗試（共用圖片）
                    // 建議改成：先試 backgrounds/<key>/spriteFrame，再試 backgrounds/<key>
                    resources.load(`backgrounds/${key}/spriteFrame`, SpriteFrame, (e1, sf1) => {
                        if (!e1 && sf1) return resolve(sf1);
                        resources.load(`backgrounds/${key}`, SpriteFrame, (e2, sf2) => {
                            resolve(e2 ? null : sf2);
                        });
                    });
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

    private getOwnedBackgrounds(p: PlayerData): string[] {
        // 你的擁有系統如果把背景也放在同一個 owned 陣列，就這樣過濾
        const allOwned: string[] = (p as any).decorationsOwned ?? [];
        const bgOwned = allOwned.filter(this.isBgSku);
        // 永遠帶入預設背景
        if (bgOwned.indexOf('bg_default') === -1) {
            bgOwned.unshift('bg_default');
        }

        return bgOwned;
    }

    private async applyBackground(bgId: string) {
        this.currentBgId = bgId;

        // 即時更新視覺：直接改 ActiveViewport/Background 的 Sprite
        const bgNode = this.gm.activeTankViewport?.getChildByName('Background');
        const sp = bgNode?.getComponent(Sprite);
        if (sp) {
            if (bgId === 'bg_default') {
                sp.spriteFrame = this.gm['defaultBackgroundSpriteFrame']; // 直接用預設
            } else {
                const sf = (this as any).constructor['__tmp']; // 只是避免 TS 嗆，實際上直接從 TankAssets 取
                const map = (GameManager as any)['TankAssets']?.backgrounds;
                if (map && map.has(bgId)) {
                    sp.spriteFrame = map.get(bgId);
                } else {
                    // 若沒載到，可直接從 resources 補載一次
                    resources.load(`backgrounds/${bgId}/spriteFrame`, SpriteFrame, (e1, sf1) => {
                        if (!e1 && sf1) sp.spriteFrame = sf1;
                        else {
                            resources.load(`backgrounds/${bgId}`, SpriteFrame, (e2, sf2) => {
                                if (!e2 && sf2) sp.spriteFrame = sf2;
                            });
                        }
                    });

                }

            }
        }

        // 更新 palette 顯示
        this.updatePaletteLockState();
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
        tank.backgroundId = (this.currentBgId === 'bg_default') ? undefined : this.currentBgId;
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