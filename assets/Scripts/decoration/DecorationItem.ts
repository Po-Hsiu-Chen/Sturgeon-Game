import { _decorator, Component, Node, Vec3, EventTouch, UITransform, Sprite, Color, Graphics, UIOpacity, Label, SpriteFrame } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DecorationItem')
export class DecorationItem extends Component {

    @property(SpriteFrame) closeIcon: SpriteFrame | null = null; // 刪除叉叉的圖
 
    // 選取狀態全域（一次只選一個）
    private static _selected: DecorationItem | null = null;

    private parentUI!: UITransform;

    // 拖曳
    private dragging = false;
    private dragStart = new Vec3();
    private nodeStart = new Vec3();

    // 縮放
    private scaling = false;
    private scaleStart = 1;
    private cornerIndex: 0 | 1 | 2 | 3 = 0; // TL=0, TR=1, BL=2, BR=3
    private centerAtStart = new Vec3();
    private radiusStart = 1;
    private scaleMin = 0.3;
    private scaleMax = 10.0;

    // 選取 UI
    private uiRoot!: Node;         // 包住框線與把手
    private frame!: Node;          // 紅框（Graphics）
    private handles: Node[] = [];  // 四個角把手
    private closeBtn!: Node;       // X 按鈕

    // 視覺常數（像素）
    private readonly HANDLE_SIZE = 12;   // 角落黑方塊的視覺大小（px）
    private readonly CLOSE_SIZE = 30;    // 叉叉按鈕的視覺大小（px）
    private readonly FRAME_WIDTH = 5;    // 紅框線寬（px）
    private readonly FRAME_MARGIN = 0;   // 紅框與圖片邊緣距離
    private readonly CLOSE_MARGIN = 20;  // 叉叉離左上角的外側距離

    onLoad() {
        this.parentUI = this.node.parent!.getComponent(UITransform)!;

        // 建立選取 UI（預設關閉）
        this.buildSelectionUI();
        this.setSelected(false);

        // 主體拖曳（點到把手則不觸發）
        this.node.on(Node.EventType.TOUCH_START, this.onDown, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.onUp, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onUp, this);

        // 預設非編輯 (不可互動)
        this.node.pauseSystemEvents(true);
    }

    onDestroy() {
        if (DecorationItem._selected === this) DecorationItem._selected = null;
    }

    /** 外部可呼叫，將此物件選取 */
    public selectMe() {
        if (DecorationItem._selected && DecorationItem._selected !== this) {
            DecorationItem._selected.setSelected(false);
        }
        DecorationItem._selected = this;
        this.setSelected(true);
        // 置頂（讓把手不被其它裝飾蓋住）
        const p = this.node.parent!;
        this.node.setSiblingIndex(p.children.length - 1);
    }

    private createFilledBox(size: number, color: Color): Node {
        const n = new Node('box');
        const ui = n.addComponent(UITransform);
        ui.setContentSize(size, size);
        const g = n.addComponent(Graphics);
        g.fillColor = color;
        g.rect(-size / 2, -size / 2, size, size);
        g.fill();
        return n;
    }

    /** 建立紅框＋把手＋關閉鈕 */
    private buildSelectionUI() {
        // 容器
        this.uiRoot = new Node('__SelectUI');
        this.uiRoot.layer = this.node.layer;
        this.uiRoot.setParent(this.node);
        this.uiRoot.setPosition(0, 0, 0);

        // 紅框
        this.frame = new Node('Frame');
        this.frame.layer = this.node.layer;
        this.frame.setParent(this.uiRoot);
        const g = this.frame.addComponent(Graphics);
        g.lineWidth = this.FRAME_WIDTH;
        g.strokeColor = new Color(255, 60, 60, 255);

        // 四個角黑方塊（可拖拉）
        const mk = () => {
            const h = this.createFilledBox(this.HANDLE_SIZE, new Color(0, 0, 0, 255));
            h.setParent(this.uiRoot);
            h.on(Node.EventType.TOUCH_START, this.onScaleStart, this);
            h.on(Node.EventType.TOUCH_MOVE, this.onScaleMove, this);
            h.on(Node.EventType.TOUCH_END, this.onScaleEnd, this);
            h.on(Node.EventType.TOUCH_CANCEL, this.onScaleEnd, this);
            return h;
        };
        this.handles = [mk(), mk(), mk(), mk()]; // TL, TR, BL, BR
        this.handles[0].name = 'TL';
        this.handles[1].name = 'TR';
        this.handles[2].name = 'BL';
        this.handles[3].name = 'BR';

        // 左上小叉叉（用你的圖片）
        this.closeBtn = new Node('Close');
        this.closeBtn.layer = this.node.layer;
        this.closeBtn.setParent(this.uiRoot);

        // 點擊區域（事件命中範圍）固定為 CLOSE_SIZE
        const uiC = this.closeBtn.addComponent(UITransform);
        uiC.setContentSize(this.CLOSE_SIZE, this.CLOSE_SIZE);

        // Sprite：用原圖尺寸，後面用 scale 等比縮放到 CLOSE_SIZE
        const sp = this.closeBtn.addComponent(Sprite);
        if (this.closeIcon) sp.spriteFrame = this.closeIcon;
        sp.type = Sprite.Type.SIMPLE;
        sp.sizeMode = Sprite.SizeMode.RAW; // 不吃 contentSize，等下用 scale 控制實際顯示大小

        this.closeBtn.on(Node.EventType.TOUCH_END, () => this.node.destroy());

    }


    /** 打開/關閉選取 UI */
    public setSelected(on: boolean) {
        if (this.uiRoot) this.uiRoot.active = on;
        if (on) this.refreshSelectionUI();
    }

    /** 取得目前節點的絕對縮放（避免 0 與 undefined） */
    private _getNodeScaleAbs(): { sx: number; sy: number } {
        const s = this.node.getScale();
        return {
            sx: Math.abs(s.x) || 1,
            sy: Math.abs(s.y) || 1,
        };
    }
    /** 依當前 UITransform 尺寸更新紅框與把手位置 */
    private refreshSelectionUI() {
        const ui = this.node.getComponent(UITransform)!;

        // 未縮放的寬高（加上邊距）
        const w0 = ui.width + this.FRAME_MARGIN * 2;
        const h0 = ui.height + this.FRAME_MARGIN * 2;

        // 目前縮放與反向縮放
        const { sx, sy } = this._getNodeScaleAbs();
        const invX = 1 / sx, invY = 1 / sy;

        // ===== 紅框：幾何用已縮放尺寸，節點用 1/scale 抵消，線寬固定 =====
        const W = w0 * sx;
        const H = h0 * sy;

        this.frame.setScale(invX, invY, 1);
        const g = this.frame.getComponent(Graphics)!;
        g.clear();
        g.lineWidth = this.FRAME_WIDTH;
        g.moveTo(-W / 2, -H / 2);
        g.lineTo(W / 2, -H / 2);
        g.lineTo(W / 2, H / 2);
        g.lineTo(-W / 2, H / 2);
        g.close();
        g.stroke();

        // ===== 把手：位置用未縮放 w0/h0，大小用 1/scale 抵消 =====
        const pos = [
            { x: -w0 / 2, y: h0 / 2 }, // TL
            { x: w0 / 2, y: h0 / 2 }, // TR
            { x: -w0 / 2, y: -h0 / 2 }, // BL
            { x: w0 / 2, y: -h0 / 2 }, // BR
        ];
        for (let i = 0; i < 4; i++) {
            const hN = this.handles[i];
            hN.setPosition(pos[i].x, pos[i].y);    // 位置不乘 scale
            hN.setScale(invX, invY, 1);            // 大小固定像素
        }

        // ===== 叉叉：在左上角外推 m 像素（用 m * invScale） =====
        const m = this.CLOSE_MARGIN;
        this.closeBtn.setPosition(-(w0 / 2) - m * invX, (h0 / 2) + m * invY);
        const sp = this.closeBtn.getComponent(Sprite);
        if (sp && sp.spriteFrame) {
            // 取圖的原始尺寸（含被打包/trim 也能抓到合理值）
            const sf = sp.spriteFrame as any;
            const baseW = sf.originalSize?.width ?? sf.rect.width;
            const baseH = sf.originalSize?.height ?? sf.rect.height;
            const fit = this.CLOSE_SIZE / Math.max(baseW, baseH); // 縮放到 CLOSE_SIZE
            this.closeBtn.setScale(fit * invX, fit * invY, 1);
        } else {
            // 沒圖就維持原本策略
            this.closeBtn.setScale(invX, invY, 1);
        }
    }


    // ================= 拖曳本體 =================
    private onDown(e: EventTouch) {
        // 若點到選取 UI 的子節點（把手或 X），不啟動本體拖曳
        if (e.target !== this.node && e.target?.isChildOf(this.uiRoot)) {
            return;
        }
        // 切成選取狀態
        this.selectMe();

        this.dragging = true;
        this.dragStart = this.getLocalPoint(e);
        this.nodeStart = this.node.getPosition();
    }

    private onMove(e: EventTouch) {
        if (!this.dragging) return;
        const now = this.getLocalPoint(e);
        const dx = now.x - this.dragStart.x;
        const dy = now.y - this.dragStart.y;
        const target = new Vec3(this.nodeStart.x + dx, this.nodeStart.y + dy, 0);
        this.clampToParent(target);
        this.node.setPosition(target);
    }
    private onUp() { this.dragging = false; }

    // ================= 四角縮放（等比） =================
    private onScaleStart(e: EventTouch) {
        this.selectMe(); // 先選上
        this.scaling = true;
        this.centerAtStart = this.node.getPosition().clone();
        const p0 = this.getLocalPoint(e);
        const v0 = new Vec3(p0.x - this.centerAtStart.x, p0.y - this.centerAtStart.y, 0);
        this.radiusStart = Math.max(1, Math.hypot(v0.x, v0.y));
        this.scaleStart = Math.abs(this.node.getScale().x);

        // 判斷是哪個角（0:TL,1:TR,2:BL,3:BR）
        const h = e.target as Node;
        this.cornerIndex = ['TL', 'TR', 'BL', 'BR'].indexOf(h.name) as any;

        e.propagationStopped = true;
    }

    private onScaleMove(e: EventTouch) {
        if (!this.scaling) return;
        const p = this.getLocalPoint(e);
        const v = new Vec3(p.x - this.centerAtStart.x, p.y - this.centerAtStart.y, 0);
        const r = Math.max(1, Math.hypot(v.x, v.y));
        const ratio = r / this.radiusStart;

        let next = this.scaleStart * ratio;
        next = Math.max(this.scaleMin, Math.min(this.scaleMax, next));

        const cur = this.node.getScale();
        const signX = cur.x < 0 ? -1 : 1;
        this.node.setScale(signX * next, next, 1);
        this.refreshSelectionUI();
    }

    private onScaleEnd() { this.scaling = false; }

    // ================= 工具 =================
    private clampToParent(out: Vec3) {
        const halfW = this.parentUI.width / 2;
        const halfH = this.parentUI.height / 2;
        out.x = Math.max(-halfW, Math.min(halfW, out.x));
        out.y = Math.max(-halfH, Math.min(halfH, out.y));
    }
    private getLocalPoint(e: EventTouch): Vec3 {
        const loc = e.getUILocation();
        return this.parentUI.convertToNodeSpaceAR(new Vec3(loc.x, loc.y, 0));
    }
}
