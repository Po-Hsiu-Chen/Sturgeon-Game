import { _decorator, Component, Node, EditBox, Label, Prefab, instantiate, Button, Sprite, SpriteFrame, Texture2D, ImageAsset, Color } from 'cc';
import { DataManager } from './DataManager';
import { GameManager } from './GameManager';
import { showFloatingTextCenter } from './utils/UIUtils';
import { ConfirmDialogManager } from './ConfirmDialogManager';

const { ccclass, property } = _decorator;

enum TabKind { Friends = 'friends', Explore = 'explore' }

@ccclass('FriendPanel')
export class FriendPanel extends Component {
    // 共用 UI
    @property(Node) floatingNode: Node = null!;                // 提示浮動訊息
    @property(ConfirmDialogManager) confirmDialogManager: ConfirmDialogManager = null!; // 提示面板
    @property(SpriteFrame) defaultAvatar: SpriteFrame = null!; // 頭像預設圖片
    @property(Prefab) emptyStatePrefab: Prefab = null!;        // 空狀態或分隔線提示文字

    // 分頁按鈕
    @property(Button) friendsTabBtn: Button = null!;           // 我的好友
    @property(Button) exploreTabBtn: Button = null!;           // 探索

    // 我的好友分頁
    @property(Node) friendsSection: Node = null!;
    @property(Node) friendsListContent: Node = null!;
    @property(Prefab) friendRowPrefab: Prefab = null!;

    // 探索分頁
    @property(Node) exploreSection: Node = null!;
    @property(Node) exploreListContent: Node = null!;
    @property(EditBox) friendIdInput: EditBox = null!;  // 輸入好友 ID 輸入框
    @property(Button) searchBtn: Button = null!;        // 搜尋按鈕
    @property(Prefab) searchRowPrefab: Prefab = null!;

    private currentTab: TabKind = TabKind.Friends; // 預設顯示「我的好友」

    onEnable() {
        this.bindEvents();
        this.switchTab(this.currentTab);
    }

    onDisable() {
        this.unbindEvents();
    }

    /** 初始化 */
    start() {
    }

    /** 事件綁定 */
    private bindEvents() {
        this.exploreTabBtn?.node.on(Button.EventType.CLICK, this.onClickExploreTab, this);
        this.friendsTabBtn?.node.on(Button.EventType.CLICK, this.onClickFriendsTab, this);
        this.searchBtn?.node.on(Button.EventType.CLICK, this.onClickSearch, this);
    }

    private unbindEvents() {
        this.exploreTabBtn?.node.off(Button.EventType.CLICK, this.onClickExploreTab, this);
        this.friendsTabBtn?.node.off(Button.EventType.CLICK, this.onClickFriendsTab, this);
        this.searchBtn?.node.off(Button.EventType.CLICK, this.onClickSearch, this);
    }

    /** 分頁切換 */
    private onClickFriendsTab() { this.switchTab(TabKind.Friends); }
    private onClickExploreTab() { this.switchTab(TabKind.Explore); }
    private async switchTab(tab: TabKind) {
        this.currentTab = tab;
        this.updateTabVisual();

        // 互斥顯示
        this.friendsSection && (this.friendsSection.active = (tab === TabKind.Friends));
        this.exploreSection && (this.exploreSection.active = (tab === TabKind.Explore));

        // 清空該分頁的 list
        this.getActiveList()?.removeAllChildren();

        if (tab === TabKind.Friends) {
            await this.refreshFriendsList();
        } else {
            await this.refreshExploreList();
        }
    }

    /** 分頁按鈕視覺切換 */
    private updateTabVisual() {
        const isFriends = this.currentTab === TabKind.Friends;

        // 選中的顏色
        const selectedColor = new Color(80, 180, 255, 255);
        // 未選中的顏色
        const unselectedColor = new Color(180, 180, 180, 255);

        // 如果按鈕有 Sprite 元件，直接改底色
        const friendsSprite = this.friendsTabBtn?.getComponent(Sprite);
        const exploreSprite = this.exploreTabBtn?.getComponent(Sprite);

        if (friendsSprite) friendsSprite.color = isFriends ? selectedColor : unselectedColor;
        if (exploreSprite) exploreSprite.color = isFriends ? unselectedColor : selectedColor;

    }

    private async refreshExploreList() {
        const list = this.exploreListContent;
        list.removeAllChildren();

        // 插入分隔線
        this.addEmptyStateToList(list, '-----推薦好友-----', true);
        await this.recommendFriends(true);
    }

    /** 載入所有好友 */
    private async refreshFriendsList() {
        const list = this.friendsListContent;
        list.removeAllChildren();

        try {
            const friends = await DataManager.getFriends().catch(() => []);

            if (!friends || friends.length === 0) {
                this.addEmptyStateToList(list, '還沒有好友，快去探索結交新朋友吧！');
                return;
            }

            for (const f of friends) {
                const row = instantiate(this.friendRowPrefab);
                const nameLabel = row.getChildByName('NameLabel')?.getComponent(Label);
                const deleteBtn = row.getChildByName('DeleteBtn')?.getComponent(Button);

                // 刪除按鈕點擊
                deleteBtn?.node.on(Button.EventType.CLICK, async () => {
                    const friendName = f.displayName || f.userId || '這位好友';
                    if (!this.confirmDialogManager) {
                        console.warn('[FriendPanel] confirm manager missing; skipping ask.');
                        return;
                    }
                    const ok = await this.confirmDialogManager.ask(`確定要刪除「${friendName}」嗎？`);
                    if (!ok) return;
                    await this.deleteFriend(f, deleteBtn);
                }, this);

                if (nameLabel) nameLabel.string = f.displayName || '(未設定暱稱)';
                const idLabel = row.getChildByName('IdLabel')?.getComponent(Label);
                if (idLabel) idLabel.string = `ID: ${this.getDisplayId(f as any)}`;

                const avatarMask = row.getChildByName('UserAvatarMask');
                const avatarSprite = avatarMask?.getChildByName('UserAvatar')?.getComponent(Sprite);
                if (avatarSprite) {
                    if (f.picture) await this.loadAvatar(f.picture, avatarSprite);
                    else avatarSprite.spriteFrame = this.defaultAvatar;
                }

                const viewBtn = row.getChildByName('ViewBtn')?.getComponent(Button);
                viewBtn?.node.on(Button.EventType.CLICK, () => this.onViewFriendTank(f.userId), this);

                row.parent = list;
            }
        } catch (e) {
            console.warn('[FriendPanel] load friends failed:', e);
            list.removeAllChildren();
            this.addEmptyStateToList(list, '載入好友失敗，請稍後再試');
        }
    }

    /** 隨機推薦幾個玩家 */
    private async recommendFriends(appendMode = false) {
        const list = this.exploreListContent;
        if (!appendMode) {
            list.removeAllChildren();
            this.addEmptyStateToList(list, '推薦中…');
        }

        try {
            const candidates = await DataManager.getRecommendedUsers(5).catch(() => []);
            if (!candidates || candidates.length === 0) {
                if (!appendMode) this.addEmptyStateToList(list, '目前沒有推薦的玩家');
                return;
            }

            const [friends, reqs] = await Promise.all([
                DataManager.getFriends().catch(() => []),
                DataManager.getFriendRequests().catch(() => ({ incoming: [], outgoing: [] }))
            ]);

            for (const user of candidates) {
                const row = instantiate(this.searchRowPrefab);

                // 顯示資料
                const nameLabel = row.getChildByName('NameLabel')?.getComponent(Label);
                if (nameLabel) nameLabel.string = user.displayName || '(未設定暱稱)';

                const idLabel = row.getChildByName('IdLabel')?.getComponent(Label);
                if (idLabel) idLabel.string = `ID: ${this.getDisplayId(user as any)}`;

                const avatarMask = row.getChildByName('UserAvatarMask');
                const avatarSprite = avatarMask?.getChildByName('UserAvatar')?.getComponent(Sprite);
                if (avatarSprite) {
                    if (user.picture) await this.loadAvatar(user.picture, avatarSprite);
                    else avatarSprite.spriteFrame = this.defaultAvatar;
                }

                // 設定邀請按鈕（統一走 setupInviteButton）
                const inviteBtn = row.getChildByName('InviteBtn')?.getComponent(Button);
                if (inviteBtn) this.setupInviteButton(inviteBtn, user.userId, friends, reqs);

                row.parent = list;
            }
        } catch (e) {
            console.warn('[FriendPanel] recommend friends failed:', e);
            if (!appendMode) {
                list.removeAllChildren();
                this.addEmptyStateToList(list, '推薦好友失敗，請稍後再試');
            }
        }
    }

    /** 點擊搜尋好友 */
    async onClickSearch() {
        // 切到探索分頁
        if (this.currentTab !== TabKind.Explore) {
            await this.switchTab(TabKind.Explore);
        }

        const list = this.exploreListContent;

        const queryId = (this.friendIdInput.string || '').trim();
        if (!queryId) {
            list.removeAllChildren();
            this.addEmptyStateToList(list, '請輸入好友 ID');
            return;
        }

        try {
            list.removeAllChildren();

            const loadingNode = this.addEmptyStateToList(list, '搜尋中…');
            const user = await DataManager.lookupUserById(queryId);

            // 無論找到或找不到，先把 loading 移除
            if (loadingNode && loadingNode.isValid) loadingNode.destroy();

            if (!user) {
                list.removeAllChildren();

                // 顯示查無此人
                this.addEmptyStateToList(list, '海裡翻遍了，也沒找到這位玩家');

                // 插入推薦好友分隔線
                this.addEmptyStateToList(list, '-----推薦好友-----', true);
                await this.recommendFriends(true);
                return;
            }

            // 顯示結果
            const row = instantiate(this.searchRowPrefab);
            const nameLabel = row.getChildByName('NameLabel')?.getComponent(Label);
            if (nameLabel) nameLabel.string = user.displayName || '(未設定暱稱)';
            const idLabel = row.getChildByName('IdLabel')?.getComponent(Label);
            if (idLabel) idLabel.string = `ID: ${this.getDisplayId(user as any)}`;

            const avatarMask = row.getChildByName('UserAvatarMask');
            const avatarSprite = avatarMask?.getChildByName('UserAvatar')?.getComponent(Sprite);
            if (avatarSprite) {
                if (user.picture) await this.loadAvatar(user.picture, avatarSprite);
                else avatarSprite.spriteFrame = this.defaultAvatar;
            }

            // 送出邀請按鈕
            const inviteBtn = row.getChildByName('InviteBtn')?.getComponent(Button);

            // 查詢雙方關係狀態
            const [friends, reqs] = await Promise.all([
                DataManager.getFriends().catch(() => []),
                DataManager.getFriendRequests().catch(() => ({ incoming: [], outgoing: [] }))
            ]);

            // 根據狀態設定按鈕
            if (inviteBtn) {
                this.setupInviteButton(inviteBtn, user.userId, friends, reqs);
            }

            row.parent = list;

        } catch (e) {
            console.warn('[FriendPanel] search failed:', e);
            list.removeAllChildren();
            this.addEmptyStateToList(list, '查詢失敗，請稍後再試');
        }
    }

    private getActiveList(): Node {
        return this.currentTab === TabKind.Friends ? this.friendsListContent : this.exploreListContent;
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

            // 到朋友魚缸後，隱藏 FriendPanel
            this.node.active = false;
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

    /** 在列表中插入一個空狀態或分隔線 */
    private addEmptyStateToList(list: Node, message: string, isSeparator: boolean = false) {
        if (!this.emptyStatePrefab) return;

        const node = instantiate(this.emptyStatePrefab);
        const label = node.getComponentInChildren(Label);

        // 設定文字
        if (label) {
            label.string = message;
            if (isSeparator) {
                label.color = new Color(0, 0, 0, 255);   // 分隔線文字顏色
                label.fontSize = 20;                     // 分隔線標題較小
            } else {
                label.color = new Color(0, 0, 0, 255);   // 空狀態正常顏色
                label.fontSize = 24;
            }
        }

        node.parent = list;
        return node;
    }

    /** 統一設定邀請按鈕狀態與事件 */
    private setupInviteButton(inviteBtn: Button,
        targetUserId: string,
        friends: Array<{ userId: string }>,
        reqs: { incoming: any[], outgoing: any[] }
    ) {
        // 先清監聽
        inviteBtn.node.off(Button.EventType.CLICK);

        const isFriend = friends?.some(f => f.userId === targetUserId);
        const hasOutgoingPending = reqs?.outgoing?.some(r => r.toUserId === targetUserId && r.status === 'pending');
        const hasIncomingPending = reqs?.incoming?.some(r => r.fromUserId === targetUserId && r.status === 'pending');

        if ((friends?.length) >= DataManager.FRIEND_LIMIT) {
            this.setInviteBtn(inviteBtn, '好友已滿', false);
        } else if (isFriend) {
            this.setInviteBtn(inviteBtn, '已是好友', false);
        } else if (hasOutgoingPending) {
            this.setInviteBtn(inviteBtn, '已送出邀請', false);
        } else if (hasIncomingPending) {
            this.setInviteBtn(inviteBtn, '對方已邀請你', false);
        } else {
            this.setInviteBtn(inviteBtn, '送出邀請', true);

            inviteBtn.node.on(Button.EventType.CLICK, async () => {
                try {
                    this.setInviteBtn(inviteBtn, '送出中…', false);
                    const resp = await DataManager.sendFriendRequest(targetUserId);

                    // 立刻把本地 pending 狀態補上，鍵名用 userId
                    reqs.outgoing.push({
                        requestId: resp.request.requestId,
                        fromUserId: DataManager.currentUserId!,
                        toUserId: targetUserId,
                        createdAt: new Date().toISOString(),
                        status: 'pending'
                    });

                    if ((resp as any)?.autoAccepted) {
                        this.setInviteBtn(inviteBtn, '已成為好友', false);
                        showFloatingTextCenter(this.floatingNode, '已成為好友！');
                    } else {
                        this.setInviteBtn(inviteBtn, '已送出邀請', false);
                        showFloatingTextCenter(this.floatingNode, '邀請已送出，等待對方確認');
                    }

                    this.node.emit('refresh-mail-badge');
                } catch (e) {
                    console.warn('sendFriendRequest failed:', e);
                    const code = (e as any)?.code;
                    if (code === 'friend_limit_reached' || code === 'friend_limit_reached_sender' || code === 'friend_limit_reached_recipient') {
                        this.setInviteBtn(inviteBtn, '好友已滿', false);
                        showFloatingTextCenter(this.floatingNode, '你的好友數量或對方已滿，無法新增');
                    } else {
                        this.setInviteBtn(inviteBtn, '送出邀請', true);
                        showFloatingTextCenter(this.floatingNode, '邀請失敗，請稍後再試');
                    }
                }
            }, this);
        }
    }

    async deleteFriend(f: { userId: string, displayName?: string }, deleteBtn?: Button) {
        console.log('[FriendPanel] deleteFriend enter', f?.userId, f?.displayName, 'btn:', !!deleteBtn);
        try {
            if (deleteBtn) deleteBtn.interactable = false;
            await DataManager.deleteFriend(f.userId);
            console.log('[FriendPanel] deleteFriend success for', f.userId);
            showFloatingTextCenter(this.floatingNode, '已解除好友關係');

            await this.refreshFriendsList();
            if (this.currentTab === TabKind.Explore) {
                await this.refreshExploreList();
            }
        } catch (e) {
            console.warn('[FriendPanel] deleteFriend failed:', e);
            showFloatingTextCenter(this.floatingNode, '刪除失敗，請稍後再試');
            if (deleteBtn) deleteBtn.interactable = true;
        }
    }

    private getDisplayId(u: { gameId?: string; userId: string }): string {
        return (u.gameId && String(u.gameId)) || u.userId;
    }

}
