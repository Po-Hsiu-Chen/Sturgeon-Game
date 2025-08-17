import { _decorator, Component, Node, EditBox, Label, Prefab, instantiate, Button } from 'cc';
import { DataManager } from './DataManager';
import { GameManager } from './GameManager';
import { showFloatingTextCenter } from './utils/UIUtils';

const { ccclass, property } = _decorator;

@ccclass('FriendPanel')
export class FriendPanel extends Component {
    @property(EditBox) friendIdInput: EditBox = null!;
    @property(Button) AddFriendBtn: Button = null!;
    @property(Node) listContent: Node = null!;
    @property(Prefab) friendRowPrefab: Prefab = null!;
    @property(Node) floatingNode: Node = null!;
    @property(Node) emptyStateNode: Node = null!;

    onEnable() {
        this.refreshList();
    }

    start() {
        this.refreshList();
        if (this.AddFriendBtn) {
            this.AddFriendBtn.node.on(Button.EventType.CLICK, this.onClickAddFriend, this);
        }
    }

    async refreshList() {
        try {
            const friends = await DataManager.getFriends();
            this.listContent.removeAllChildren();

            if (!friends || friends.length === 0) {
                if (this.emptyStateNode) this.emptyStateNode.active = true;
                return;
            } else {
                if (this.emptyStateNode) this.emptyStateNode.active = false;
            }

            for (const f of friends) {
                const row = instantiate(this.friendRowPrefab);

                const nameLabel = row.getChildByName('NameLabel')?.getComponent(Label);
                if (nameLabel) nameLabel.string = f.displayName || '(未設定暱稱)';

                const idLabel = row.getChildByName('IdLabel')?.getComponent(Label);
                if (idLabel) idLabel.string = f.userId;

                const viewBtn = row.getChildByName('ViewBtn')?.getComponent(Button);
                if (viewBtn) {
                    viewBtn.node.on(Button.EventType.CLICK, () => this.onViewFriendTank(f.userId), this);
                }

                row.parent = this.listContent;
            }
        } catch (e) {
            console.warn('[FriendPanel] refreshList failed:', e);
            showFloatingTextCenter(this.floatingNode, '載入好友清單失敗');
        }
    }

    async onClickAddFriend() {
        const friendId = (this.friendIdInput.string || '').trim();
        if (!friendId) {
            showFloatingTextCenter(this.floatingNode, '請輸入好友 ID');
            return;
        }

        try {
            const newFriends = await DataManager.addFriend(friendId); // 永遠回傳 friends[]
            this.friendIdInput.string = '';
            await this.refreshList();
            showFloatingTextCenter(this.floatingNode, '好友新增成功');
        } catch (e: any) {
            console.warn('addFriend failed:', e);
            const code = e?.code || '';
            if (code === 'user_or_friend_not_found') {
                showFloatingTextCenter(this.floatingNode, 'ID 錯誤或對方未玩遊戲');
            } else if (code === 'cannot_add_self') {
                showFloatingTextCenter(this.floatingNode, '不能加自己為好友');
            } else if (code === 'already_friends') {
                showFloatingTextCenter(this.floatingNode, '對方已經是你的好友');
            } else {
                showFloatingTextCenter(this.floatingNode, '新增好友失敗');
            }
        }
    }


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
}
