import { _decorator, Component, Node, Label, Prefab, instantiate, Button, Sprite } from 'cc';
import { DataManager, MailItem } from './DataManager';
import { showFloatingTextCenter } from './utils/UIUtils';
const { ccclass, property } = _decorator;

@ccclass('MailboxPanel')
export class MailboxPanel extends Component {
    @property(Node) listContent: Node = null!;             // 信件列表容器
    @property(Prefab) friendReqRowPrefab: Prefab = null!;  // 好友邀請信件 row 預置體
    @property(Prefab) genericRowPrefab: Prefab = null!;    // 一般信件 row 預置體
    @property(Node) emptyStateNode: Node = null!;          // 空狀態提示
    @property(Node) floatingNode: Node = null!;            // 浮動提示用節點

    onEnable() { this.refresh(); }
    start() { this.refresh(); }

    /** 刷新信箱內容 */
    async refresh() {
        try {
            const allMails = await DataManager.getInbox();
            this.listContent.removeAllChildren();

            // 計算未讀信件數量，並發送事件通知（用於更新徽章）
            const unread = allMails.filter(x => x.status === 'unread').length;
            this.node.emit('mailbox-refreshed', { unread });

            // 顯示未讀信件（這裡可以依需求改成全部）
            const visible = allMails.filter(x => x.status === 'unread');
            if (!visible.length) {
                // 沒有信件時顯示空狀態
                this.emptyStateNode && (this.emptyStateNode.active = true);
                return;
            } else {
                this.emptyStateNode && (this.emptyStateNode.active = false);
            }

            // 逐一渲染信件
            for (const m of visible) {
                if (m.type === 'FRIEND_REQUEST' && m.payload?.requestId && m.payload?.fromUserId) {
                    this.renderFriendRequestRow(m);
                } else {
                    this.renderGenericRow(m);
                }
            }
        } catch (e) {
            console.warn('[MailboxPanel] refresh failed:', e);
            showFloatingTextCenter(this.floatingNode, '載入信箱失敗');
        }
    }

    /** 渲染好友邀請的信件 row */
    private renderFriendRequestRow(m: MailItem) {
        const row = instantiate(this.friendReqRowPrefab);

        // 標題 / 內容
        const titleLabel = row.getChildByName('TitleLabel')?.getComponent(Label);
        const detailLabel = row.getChildByName('DetailLabel')?.getComponent(Label);

        if (titleLabel) titleLabel.string = m.title || '好友邀請';
        if (detailLabel) {
            const name = m.fromUser?.displayName || '(未設定暱稱)';
            const uid = m.payload?.fromUserId || '';
            detailLabel.string = `${name} 想加你為好友`;
        }

        // 接受 / 拒絕按鈕
        const acceptBtn = row.getChildByName('AcceptBtn')?.getComponent(Button);
        const declineBtn = row.getChildByName('DeclineBtn')?.getComponent(Button);

        // 綁定事件
        acceptBtn && acceptBtn.node.on(Button.EventType.CLICK, async () => {
            await this.handleFriendRespond(m, 'accept');
        }, this);

        declineBtn && declineBtn.node.on(Button.EventType.CLICK, async () => {
            await this.handleFriendRespond(m, 'decline');
        }, this);

        row.parent = this.listContent;
    }

    /** 渲染一般系統 / 通知信件 row */
    private renderGenericRow(m: MailItem) {
        const row = instantiate(this.genericRowPrefab);

        // 標題 / 內文
        const titleLabel = row.getChildByName('TitleLabel')?.getComponent(Label);
        const bodyLabel = row.getChildByName('DetailLabel')?.getComponent(Label);
        titleLabel && (titleLabel.string = m.title || '訊息');
        bodyLabel && (bodyLabel.string = m.body || '');

        // 確認按鈕（標記已讀）
        const ackBtn = row.getChildByName('AckBtn')?.getComponent(Button);
        if (ackBtn) {
            ackBtn.node.on(Button.EventType.CLICK, async () => {
                try { await DataManager.markMailRead(m.mailId); this.refresh(); }
                catch { showFloatingTextCenter(this.floatingNode, '操作失敗'); }
            }, this);
        }
        row.parent = this.listContent;
    }

    /** 處理好友邀請的接受 / 拒絕 */
    private async handleFriendRespond(m: MailItem, action: 'accept' | 'decline') {
        try {
            // 呼叫後端 API
            await DataManager.respondFriendRequest(m.payload!.requestId!, action);

            // 顯示提示文字
            if (action === 'accept') showFloatingTextCenter(this.floatingNode, '已成為好友！');
            if (action === 'decline') showFloatingTextCenter(this.floatingNode, '已拒絕邀請');

            // 將該封信標記為已讀
            try { await DataManager.markMailRead(m.mailId); } catch { }

            // 刷新信箱、更新好友清單
            await this.refresh();
            const friendPanelNode = this.node.scene.getChildByName('FriendPanel');
            const friendPanelCmp: any = friendPanelNode?.getComponent('FriendPanel');
            friendPanelCmp?.refreshList?.();

        } catch (e: any) {
            console.warn('respondFriendRequest failed:', e);
            const code = e?.code || '';
            // 根據錯誤碼顯示提示
            if (code === 'request_not_found') {
                showFloatingTextCenter(this.floatingNode, '邀請不存在或已處理');
            } else if (code === 'not_request_participant') {
                showFloatingTextCenter(this.floatingNode, '你沒有權限處理這個邀請');
            } else {
                showFloatingTextCenter(this.floatingNode, '操作失敗');
            }
        }
    }
}
