import { Label, UIOpacity, Vec3, tween, Node } from 'cc';

export function showFloatingTextCenter(floatingNode: Node, text: string) {
    const label = floatingNode?.getComponentInChildren(Label);
    const uiOpacity = floatingNode?.getComponent(UIOpacity);

    if (!floatingNode || !label || !uiOpacity) {
        console.warn('[UIUtils] floatingNode 缺少 Node / Label / UIOpacity 元件');
        return;
    }

    // 停掉先前動畫
    tween(floatingNode).stop();
    tween(uiOpacity).stop();

    label.string = text;
    floatingNode.active = true;
    uiOpacity.opacity = 0;

    const startPos = new Vec3(0, 0, 0);
    const endPos = new Vec3(0, 30, 0);

    floatingNode.setPosition(startPos);

    // 淡入 -> 停留 -> 淡出
    tween(uiOpacity)
        .to(0.3, { opacity: 255 })
        .delay(1.2)
        .to(0.4, { opacity: 0 })
        .call(() => (floatingNode.active = false))
        .start();

    // 上浮位移
    tween(floatingNode)
        .to(1.2, { position: endPos }, { easing: 'quadOut' })
        .start();
}

export function playOpenPanelAnim(panel: Node, duration: number = 0.3) {
    if (!panel) return;

    // 如果面板原本是關閉的，先打開
    const wasInactive = !panel.active;
    if (wasInactive) {
        panel.active = true;
        panel.scale = new Vec3(0.3, 0.3, 1);
    }

    // 播放動畫
    tween(panel)
        .to(duration, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .start();
}