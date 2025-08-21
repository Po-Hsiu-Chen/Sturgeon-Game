import { _decorator, Component, Node, EditBox, Label, Prefab, instantiate, Button, Sprite, SpriteFrame, Texture2D, ImageAsset } from 'cc';
import { DataManager } from './DataManager';
import { GameManager } from './GameManager';
import { showFloatingTextCenter } from './utils/UIUtils';

const { ccclass, property } = _decorator;

@ccclass('FriendPanel')
export class FriendPanel extends Component {
    @property(EditBox) friendIdInput: EditBox = null!;   // 輸入好友 ID 輸入框
    @property(Button) SearchBtn: Button = null!;         // 搜尋按鈕
    @property(Node) listContent: Node = null!;           // 顯示搜尋結果容器
    @property(Prefab) friendRowPrefab: Prefab = null!;   // 好友列 Prefab
    @property(Node) floatingNode: Node = null!;          // 提示浮動訊息
    @property(Node) emptyStateNode: Node = null!;        // 空狀態
    @property(SpriteFrame) defaultAvatar: SpriteFrame = null!; // 頭像預設圖片

    onEnable() { this.refreshList(); }

    /** 初始化 */
    start() {
        this.refreshList();
        if (this.SearchBtn) {
            this.SearchBtn.node.on(Button.EventType.CLICK, this.onClickSearch, this);
        }
    }

    /** 初始化時清空列表，顯示空狀態 */
    async refreshList() {
        this.listContent.removeAllChildren();
        if (this.emptyStateNode) this.emptyStateNode.active = true;
    }

    /** 點擊搜尋好友 */
    async onClickSearch() {
        const queryId = (this.friendIdInput.string || '').trim();
        if (!queryId) {
            // 沒輸入 ID 時顯示提示
            this.listContent.removeAllChildren();
            this.showEmptyState('請輸入好友 ID');
            return;
        }

        try {
            // 清空列表並顯示搜尋中
            this.listContent.removeAllChildren();
            this.showEmptyState('搜尋中…');

            // 查詢使用者
            const user = await DataManager.lookupUserById(queryId);
            if (!user) {
                this.listContent.removeAllChildren();
                this.showEmptyState('找不到此使用者');
                return;
            }

            // 找到使用者，隱藏空狀態
            this.hideEmptyState();

            // 建立一筆好友列
            const row = instantiate(this.friendRowPrefab);

            // 名字、ID
            const nameLabel = row.getChildByName('NameLabel')?.getComponent(Label);
            const idLabel = row.getChildByName('IdLabel')?.getComponent(Label);
            if (nameLabel) nameLabel.string = user.displayName || '(未設定暱稱)';
            if (idLabel) idLabel.string = user.userId;

            // 頭貼
            const avatarMask = row.getChildByName('UserAvatarMask');
            const avatarSprite = avatarMask?.getChildByName('UserAvatar')?.getComponent(Sprite);
            if (avatarSprite) {
                if (user.picture) {
                    this.loadAvatar(user.picture, avatarSprite);
                } else {
                    avatarSprite.spriteFrame = this.defaultAvatar;
                }
            }

            // // 查看好友魚缸
            // const viewBtn = row.getChildByName('ViewBtn')?.getComponent(Button);
            // if (viewBtn) {
            //     viewBtn.node.on(Button.EventType.CLICK, () => this.onViewFriendTank(user.userId), this);
            // }

            // 送出邀請按鈕
            const inviteBtn = row.getChildByName('InviteBtn')?.getComponent(Button);

            // 查詢雙方關係狀態
            const [friends, reqs] = await Promise.all([
                DataManager.getFriends().catch(() => []),
                DataManager.getFriendRequests().catch(() => ({ incoming: [], outgoing: [] }))
            ]);

            const isFriend = friends?.some(f => f.userId === user.userId);
            const hasOutgoingPending = reqs?.outgoing?.some(r => r.toUserId === user.userId && r.status === 'pending');
            const hasIncomingPending = reqs?.incoming?.some(r => r.fromUserId === user.userId && r.status === 'pending');

            // 根據狀態設定按鈕
            if (inviteBtn) {
                if (isFriend) {
                    this.setInviteBtn(inviteBtn, '已是好友', false);
                } else if (hasOutgoingPending) {
                    this.setInviteBtn(inviteBtn, '已送出邀請', false);
                } else if (hasIncomingPending) {
                    this.setInviteBtn(inviteBtn, '對方已邀請你', false);
                } else {
                    this.setInviteBtn(inviteBtn, '送出邀請', true);
                }
            }

            // 綁定邀請按鈕點擊事件
            if (inviteBtn) {
                inviteBtn.node.on(Button.EventType.CLICK, async () => {
                    try {
                        this.setInviteBtn(inviteBtn, '送出中…', false); // 點擊後鎖住按鈕
                        const resp = await DataManager.sendFriendRequest(user.userId); // 發送好友邀請

                        // 若後端偵測到對向已有 pending，可能直接 auto-accept
                        if ((resp as any)?.autoAccepted) {
                            this.setInviteBtn(inviteBtn, '已成為好友', false);
                            showFloatingTextCenter(this.floatingNode, '已成為好友！');
                        } else {
                            this.setInviteBtn(inviteBtn, '已送出邀請', false);
                            showFloatingTextCenter(this.floatingNode, '邀請已送出，等待對方確認');
                        }

                        this.node.emit('refresh-mail-badge'); // 可選：刷新徽章
                    } catch (e: any) {
                        console.warn('sendFriendRequest failed:', e);
                        const code = e?.code || '';

                        // 根據錯誤碼提示訊息
                        if (code === 'user_not_found' || code === 'user_or_friend_not_found') {
                            showFloatingTextCenter(this.floatingNode, 'ID 錯誤或對方未玩遊戲');
                            this.setInviteBtn(inviteBtn, '送出邀請', true);
                        } else if (code === 'cannot_add_self') {
                            showFloatingTextCenter(this.floatingNode, '不能加自己為好友');
                            this.setInviteBtn(inviteBtn, '送出邀請', true);
                        } else if (code === 'already_friends') {
                            this.setInviteBtn(inviteBtn, '已是好友', false);
                            showFloatingTextCenter(this.floatingNode, '你們已經是好友');
                        } else if (code === 'already_pending') {
                            this.setInviteBtn(inviteBtn, '已送出邀請', false);
                            showFloatingTextCenter(this.floatingNode, '已經有待確認的邀請');
                        } else {
                            showFloatingTextCenter(this.floatingNode, '送出邀請失敗');
                            this.setInviteBtn(inviteBtn, '送出邀請', true);
                        }
                    }
                }, this);
            }

            // 把結果加到列表
            row.parent = this.listContent;

        } catch (e) {
            console.warn('[FriendPanel] search failed:', e);
            this.listContent.removeAllChildren();
            this.showEmptyState('查詢失敗，請稍後再試');
        }
    }

    /** 顯示空狀態文字 */
    private showEmptyState(message: string) {
        if (!this.emptyStateNode) return;
        const msgLabel =
            this.emptyStateNode.getComponent(Label) ||
            this.emptyStateNode.getChildByName('MessageLabel')?.getComponent(Label) ||
            this.emptyStateNode.getComponentInChildren(Label);
        if (msgLabel) msgLabel.string = message;
        this.emptyStateNode.active = true;
    }

    /** 隱藏空狀態 */
    private hideEmptyState() {
        if (this.emptyStateNode) this.emptyStateNode.active = false;
    }

    /** 載入頭像圖片 */
    async loadAvatar(url: string, sprite: Sprite) {
        try {
            const res = await fetch(url, { mode: 'cors' });
            const blob = await res.blob();
            const bitmap = await createImageBitmap(blob);
            const imageAsset = new ImageAsset(bitmap);

            const texture = new Texture2D();
            texture.image = imageAsset;

            const spriteFrame = new SpriteFrame();
            spriteFrame.texture = texture;

            sprite.spriteFrame = spriteFrame;
        } catch (err) {
            console.warn("載入好友頭貼失敗:", err);
            sprite.spriteFrame = this.defaultAvatar;
        }
    }

    /** 查看好友的魚缸 */
    async onViewFriendTank(friendUserId: string) {
        try {
            const friendData = await DataManager.getPublicPlayerData(friendUserId);
            const gm = this.node.scene.getChildByName('GameManager')?.getComponent(GameManager);
            gm?.showFriendTank(friendData);
        } catch (e) {
            console.warn('getPublicPlayerData failed:', e);
            showFloatingTextCenter(this.floatingNode, '載入好友資料失敗');
        }
    }

    /** 設置邀請按鈕的狀態與文字 */
    private setInviteBtn(inviteBtn: Button | null, text: string, enabled: boolean) {
        if (!inviteBtn) return;
        const label = inviteBtn.node.getComponentInChildren(Label);
        if (label) label.string = text;
        inviteBtn.interactable = enabled;
    }

}
