import { _decorator, Component, Node, EditBox, Label, Prefab, instantiate, Button, Sprite, SpriteFrame, Texture2D, ImageAsset, Color } from 'cc';
import { DataManager } from './DataManager';
import { GameManager } from './GameManager';
import { showFloatingTextCenter } from './utils/UIUtils';

const { ccclass, property } = _decorator;

enum TabKind { Friends = 'friends', Explore = 'explore' }

@ccclass('FriendPanel')
export class FriendPanel extends Component {
    // 共用 UI
    @property(Node) floatingNode: Node = null!;                // 提示浮動訊息
    @property(SpriteFrame) defaultAvatar: SpriteFrame = null!; // 頭像預設圖片

    // 分頁按鈕
    @property(Button) friendsTabBtn: Button = null!;           // 我的好友
    @property(Button) exploreTabBtn: Button = null!;           // 探索

    // 我的好友分頁
    @property(Node) friendsSection: Node = null!;
    @property(Node) friendsListContent: Node = null!;
    @property(Prefab) friendRowPrefab: Prefab = null!;
    @property(Node) friendsEmptyState: Node = null!;

    // 探索分頁
    @property(Node) exploreSection: Node = null!;
    @property(Node) exploreListContent: Node = null!;
    @property(EditBox) friendIdInput: EditBox = null!;  // 輸入好友 ID 輸入框
    @property(Button) searchBtn: Button = null!;        // 搜尋按鈕
    @property(Node) exploreEmptyState: Node = null!;
    @property(Prefab) searchRowPrefab: Prefab = null!;

    private currentTab: TabKind = TabKind.Friends; // 預設顯示「我的好友」

    onEnable() {
        this.bindEvents();
        this.switchTab(this.currentTab);
    }

    onDisable() {          // 解除事件，避免重複綁定
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
        this.showEmptyState('請輸入好友 ID 搜尋');
    }

    /** 載入所有好友 */
    private async refreshFriendsList() {
        const list = this.friendsListContent;
        try {
            const friends = await DataManager.getFriends().catch(() => []);
            list.removeAllChildren();

            if (!friends || friends.length === 0) {
                this.showEmptyState('還沒有好友，快去探索結交新朋友吧！');
                return;
            }

            this.hideEmptyState();

            for (const f of friends) {
                const row = instantiate(this.friendRowPrefab);
                const nameLabel = row.getChildByName('NameLabel')?.getComponent(Label);
                if (nameLabel) nameLabel.string = f.displayName || '(未設定暱稱)';
                const idLabel = row.getChildByName('IdLabel')?.getComponent(Label);
                if (idLabel) idLabel.string = f.userId;

                const avatarMask = row.getChildByName('UserAvatarMask');
                const avatarSprite = avatarMask?.getChildByName('UserAvatar')?.getComponent(Sprite);
                if (avatarSprite) {
                    if (f.picture) await this.loadAvatar(f.picture, avatarSprite);
                    else avatarSprite.spriteFrame = this.defaultAvatar;
                }

                const viewBtn = row.getChildByName('ViewBtn')?.getComponent(Button);
                viewBtn?.node.once(Button.EventType.CLICK, () => this.onViewFriendTank(f.userId), this);

                row.parent = list; // ★ 放到 friendsListContent
            }
        } catch (e) {
            console.warn('[FriendPanel] load friends failed:', e);
            list.removeAllChildren();
            this.showEmptyState('載入好友失敗，請稍後再試');
        }
    }

    /** 點擊搜尋好友 */
    async onClickSearch() {
        // 若不在探索分頁，先切過去（避免塞到朋友分頁的 list）
        if (this.currentTab !== TabKind.Explore) {
            await this.switchTab(TabKind.Explore);
        }

        const list = this.exploreListContent;

        const queryId = (this.friendIdInput.string || '').trim();
        if (!queryId) {
            list.removeAllChildren();
            this.showEmptyState('請輸入好友 ID');
            return;
        }

        try {
            list.removeAllChildren();
            this.showEmptyState('搜尋中…');

            const user = await DataManager.lookupUserById(queryId);
            if (!user) {
                list.removeAllChildren();
                this.showEmptyState('海裡翻遍了，也沒找到這位玩家');
                return;
            }

            this.hideEmptyState();

            const row = instantiate(this.searchRowPrefab);
            const nameLabel = row.getChildByName('NameLabel')?.getComponent(Label);
            if (nameLabel) nameLabel.string = user.displayName || '(未設定暱稱)';
            const idLabel = row.getChildByName('IdLabel')?.getComponent(Label);
            if (idLabel) idLabel.string = user.userId;

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

            row.parent = list;

        } catch (e) {
            console.warn('[FriendPanel] search failed:', e);
            list.removeAllChildren();
            this.showEmptyState('查詢失敗，請稍後再試');
        }
    }

    private getActiveList(): Node {
        return this.currentTab === TabKind.Friends ? this.friendsListContent : this.exploreListContent;
    }

    /** 顯示空狀態文字 */
    private showEmptyState(msg: string) {
        const n = this.currentTab === TabKind.Friends ? this.friendsEmptyState : this.exploreEmptyState;
        if (!n) return;
        const msgLabel = n.getComponent(Label) || n.getChildByName('MessageLabel')?.getComponent(Label) || n.getComponentInChildren(Label);
        if (msgLabel) msgLabel.string = msg;
        n.active = true;
    }

    /** 隱藏空狀態 */
    private hideEmptyState() {
        const n = this.currentTab === TabKind.Friends ? this.friendsEmptyState : this.exploreEmptyState;
        if (n) n.active = false;
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
