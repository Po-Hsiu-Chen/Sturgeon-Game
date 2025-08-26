require('dotenv').config();
const fetch = require('node-fetch');          // 用於呼叫 LINE API（Node 18 也可用內建 fetch）
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const path = require('path');
const { v4: uuid } = require('uuid');

const app = express();
app.use(cors());             // 開啟跨來源資源共用（CORS）
app.use(express.json());     // 處理 JSON 請求

// ------------------- 靜態檔案設定 -------------------
// 把 public/web-mobile 當作網站根目錄
app.use(express.static(path.join(__dirname, 'public', 'web-mobile')));

// 設定 / 預設回傳 index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'web-mobile', 'index.html'));
});

// ------------------- MongoDB 連線 -------------------
const uri = 'mongodb://127.0.0.1:27017';
const client = new MongoClient(uri);

// 宣告 Collections
let db, users, quiz, friendRequests, mails;

// 初始化資料庫
async function initDB() {
  await client.connect();
  db = client.db('Sturgeon-Game');
  users = db.collection('users');
  quiz = db.collection('quiz-questions');
  friendRequests = db.collection('friend_requests');
  mails = db.collection('mails');

  // 索引
  await users.createIndex({ userId: 1 }, { unique: true });
  await friendRequests.createIndex({ toUserId: 1, status: 1, createdAt: -1 });
  await friendRequests.createIndex({ fromUserId: 1, status: 1, createdAt: -1 });
  await mails.createIndex({ userId: 1, status: 1, createdAt: -1 });

  console.log('MongoDB 連線成功');
}
initDB();

// ------------------- 函式 -------------------

/** 發送 Mail */
async function sendMail(toUserId, mail) {
  // mail: { type, title, body, fromUser, payload }
  const mailDoc = {
    mailId: 'M_' + uuid(),
    userId: toUserId,
    status: 'unread',
    createdAt: new Date(),
    ...mail,
  };
  await mails.insertOne(mailDoc);
  return mailDoc;
}

/** 取得某週一的日期字串 (YYYY-MM-DD) */
function getWeekStartKey(date = new Date(), tzOffsetMinutes = 480) {
  const shifted = new Date(date.getTime() + tzOffsetMinutes * 60_000);
  const d = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dow);  // 回到本週一
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/** 建立新玩家的預設資料 */
function buildDefaultPlayer(userId, displayName, picture) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // 預設擁有 3 隻魚
  const fishList = [];
  for (let i = 1; i <= 3; i++) {
    fishList.push({
      id: i,
      name: `鱘龍${i}號`,
      gender: i % 2 === 0 ? "female" : "male",
      stage: 2,                 // 你現在測試用
      growthDaysPassed: 14,     // 你現在測試用
      lastFedDate: now.toISOString(),
      hunger: 33,
      hungerRateMultiplier: 1.0,
      appearance: "ugly",
      outfit: { head: null, accessories: [] },
      isMarried: false,
      spouseId: null,
      status: { hungry: false, hot: false, cold: false, sick: false },
      emotion: "happy",
      isDead: false,
      tankId: 1
    });
  }

  // 回傳預設玩家資料
  return {
    userId,
    displayName,
    picture,
    dragonBones: 666,
    lastLoginDate: today,
    lastLoginTime: now.toISOString(),
    fishList,
    tankList: [{ id: 1, name: "主魚缸", comfort: 80, fishIds: [1, 2, 3] }],
    tankEnvironment: {
      temperature: 21,
      lastTempUpdateTime: now.toISOString(),
      waterQualityStatus: "clean",
      lastCleanTime: now.toISOString(),
      isTemperatureDanger: false,
      loginDaysSinceClean: 0,
      badEnvLoginDays: 0
    },
    inventory: {
      feeds: { normal: 666, premium: 66 },
      items: {
        coldMedicine: 10,
        revivePotion: 10,
        genderPotion: 10,
        upgradePotion: 10,
        changePotion: 10,
        heater: 10,
        fan: 15,
        brush: 17
      }
    },
    fashion: { owned: [] },
    signInData: {
      weekly: {
        weekKey: getWeekStartKey(),
        daysSigned: [false, false, false, false, false, false, false],
        questionsCorrect: [false, false, false, false, false, false, false],
        lastSignDate: ""
      },
      monthly: {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        signedDaysCount: 0,
        lastSignDate: ""
      }
    },
    friends: [],
    createdAt: now
  };
}

// ------------------- 玩家資料 API -------------------

/** 取得玩家資料 */
app.get('/player/:userId', async (req, res) => {
  const id = req.params.userId?.trim();
  const user = await users.findOne({ userId: id });
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json(user);
});

/** 新增玩家 */
app.post('/player', async (req, res) => {
  const newPlayer = req.body;
  const existing = await users.findOne({ userId: newPlayer.userId });
  if (existing) {
    return res.status(400).send('Player already exists');
  }
  await users.insertOne(newPlayer);
  res.json({ success: true });
});

/** 更新玩家資料 */
app.put('/player/:userId', async (req, res) => {
  const id = req.params.userId?.trim();
  const updateData = { ...req.body };

  // 不允許改主鍵
  delete updateData._id;
  delete updateData.userId;

  try {
    // 先確認這個玩家存在
    const exists = await users.findOne({ userId: id });
    console.log('[PUT /player]', { id, exists: !!exists });

    if (!exists) {
      return res.status(404).json({ error: 'not found', id });
    }

    // 執行更新（整份 document 的覆寫式 $set）
    await users.updateOne({ userId: id }, { $set: updateData });

    // 回傳更新後的最新文件
    const fresh = await users.findOne({ userId: id });
    return res.json(fresh);
  } catch (err) {
    console.error('[PUT /player] error:', err);
    return res.status(500).json({ error: 'server_error' });
  }
});

// ------------------- 題庫 API -------------------

/** 取得所有題目 */
app.get('/quiz', async (req, res) => {
  const questions = await quiz.find().toArray();
  res.json(questions);
});

// ------------------- LINE 登入 API -------------------
app.post('/auth/line', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'missing idToken' });

  try {
    const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        id_token: idToken,
        client_id: process.env.LINE_LOGIN_CHANNEL_ID,
      })
    });
    const data = await r.json();
    if (!r.ok || !data.sub) {
      console.error('LINE verify 失敗：', data);
      return res.status(401).json({ error: 'invalid idToken', detail: data });
    }

    const lineUserId = data.sub;
    const displayName = data.name || '玩家';
    const picture = data.picture || '';

    let user = await users.findOne({ userId: lineUserId });
    const isNew = !user;

    if (!user) {
      const newPlayer = buildDefaultPlayer(lineUserId, displayName, picture);
      await users.insertOne(newPlayer);
      user = newPlayer;
    } else {
      // 舊的「空殼」文件 → 補齊缺欄位（不覆蓋原本已有值）
      const base = buildDefaultPlayer(lineUserId, displayName, picture);
      const $set = {};

      if (user.dragonBones == null) $set.dragonBones = base.dragonBones;
      if (!user.lastLoginDate) $set.lastLoginDate = base.lastLoginDate;
      if (!user.lastLoginTime) $set.lastLoginTime = base.lastLoginTime;
      if (!user.tankEnvironment) $set.tankEnvironment = base.tankEnvironment;
      if (!user.inventory || !user.inventory.feeds || !user.inventory.items) $set.inventory = base.inventory;
      if (!user.fashion) $set.fashion = base.fashion;
      if (!user.signInData || !user.signInData.weekly || !user.signInData.monthly) $set.signInData = base.signInData;
      if (!Array.isArray(user.tankList) || user.tankList.length === 0) $set.tankList = base.tankList;
      if (!Array.isArray(user.fishList) || user.fishList.length === 0) $set.fishList = base.fishList;
      if (!Array.isArray(user.friends)) $set.friends = [];

      // 同步最新暱稱/頭像（可選）
      if (user.displayName !== displayName) $set.displayName = displayName;
      if (user.picture !== picture) $set.picture = picture;

      if (Object.keys($set).length > 0) {
        await users.updateOne({ userId: lineUserId }, { $set });
        user = await users.findOne({ userId: lineUserId });
      }
    }

    res.json({ lineUserId, displayName, picture, isNew, user });

  } catch (e) {
    console.error('auth/line 例外：', e);
    res.status(500).json({ error: 'server_error', detail: String(e) });
  }
});

// ------------------- 好友系統 API -------------------

/** 取得好友列表 */
app.get('/friends/:userId', async (req, res) => {
  const user = await users.findOne({ userId: req.params.userId });
  if (!user) return res.status(404).json({ error: '找不到玩家' });

  const friendList = await users.find({ userId: { $in: user.friends || [] } })
    .project({ userId: 1, displayName: 1, picture: 1, _id: 0 })
    .toArray();

  res.json(friendList);
});

/** 取得好友公開資料（只回傳魚缸、魚等資訊） */
app.get('/public/player/:userId', async (req, res) => {
  const id = req.params.userId?.trim();
  const doc = await users.findOne(
    { userId: id },
    {
      projection: {
        _id: 0,
        userId: 1,
        displayName: 1,
        picture: 1,
        tankEnvironment: 1,
        tankList: 1,
        fishList: 1,
      }
    }
  );
  if (!doc) return res.status(404).json({ error: 'not found' });

  // ---- 把 fishList 補齊成完整 FishData ----
  const nowISO = new Date().toISOString();
  const fullFishList = (doc.fishList ?? []).map(f => ({
    id: f.id,
    name: f.name ?? `Fish_${f.id}`,
    gender: f.gender ?? 'male',
    stage: f.stage ?? 1,
    growthDaysPassed: f.growthDaysPassed ?? 0,
    lastFedDate: f.lastFedDate ?? nowISO,
    hunger: f.hunger ?? 0,
    hungerRateMultiplier: f.hungerRateMultiplier ?? 1,
    appearance: f.appearance ?? 'beautiful',
    outfit: {
      head: f.outfit?.head ?? null,
      accessories: f.outfit?.accessories ?? []
    },
    isMarried: f.isMarried ?? false,
    spouseId: f.spouseId ?? null,
    status: {
      hungry: f.status?.hungry ?? false,
      hot: f.status?.hot ?? false,
      cold: f.status?.cold ?? false,
      sick: f.status?.sick ?? false,
    },
    emotion: f.emotion ?? 'happy',
    isDead: !!f.isDead,
    deathDate: f.deathDate ?? undefined,
    tankId: f.tankId ?? (doc.tankList?.[0]?.id ?? 1),
  }));

  // 過濾掉不存在的 fishId，避免舊資料殘留
  const tankIds = new Set(fullFishList.map(fi => fi.id));
  const cleanTankList = (doc.tankList ?? []).map(t => ({
    ...t,
    fishIds: (t.fishIds ?? []).filter(fid => tankIds.has(fid)),
  }));

  res.json({
    userId: doc.userId,
    displayName: doc.displayName,
    picture: doc.picture,
    tankEnvironment: doc.tankEnvironment,
    tankList: cleanTankList,
    fishList: fullFishList,
  });
});


/** 發送好友邀請 */
app.post('/friend-requests', async (req, res) => {
  const { fromUserId, toUserId } = req.body || {};
  if (!fromUserId || !toUserId) return res.status(400).json({ error: 'invalid_params' });
  if (fromUserId === toUserId) return res.status(400).json({ error: 'cannot_add_self' });

  const [fromUser, toUser] = await Promise.all([
    users.findOne({ userId: fromUserId }),
    users.findOne({ userId: toUserId }),
  ]);
  if (!fromUser || !toUser) return res.status(404).json({ error: 'user_not_found' });

  // 已成為好友
  if ((fromUser.friends || []).includes(toUserId)) {
    return res.status(409).json({ error: 'already_friends' });
  }

  // 是否已有待處理邀請（任一方向）
  const existing = await friendRequests.findOne({
    $or: [
      { fromUserId, toUserId, status: 'pending' },
      { fromUserId: toUserId, toUserId: fromUserId, status: 'pending' }
    ]
  });

  // 若對方先邀請你 → 自動成為好友
  if (existing && existing.fromUserId === toUserId && existing.toUserId === fromUserId) {
    await friendRequests.updateOne(
      { requestId: existing.requestId },
      { $set: { status: 'accepted', respondedAt: new Date() } }
    );
    await users.updateOne({ userId: fromUserId }, { $addToSet: { friends: toUserId } });
    await users.updateOne({ userId: toUserId }, { $addToSet: { friends: fromUserId } });

    await sendMail(fromUserId, {
      type: 'NOTICE',
      title: '好友已成立',
      body: `${toUser.displayName || toUserId} 已與你成為好友`,
      fromUser: { userId: toUserId, displayName: toUser.displayName, picture: toUser.picture }
    });
    await sendMail(toUserId, {
      type: 'NOTICE',
      title: '好友已成立',
      body: `你已與 ${fromUser.displayName || fromUserId} 成為好友`,
      fromUser: { userId: fromUserId, displayName: fromUser.displayName, picture: fromUser.picture }
    });

    return res.json({ autoAccepted: true });
  }

  // 你已經送過 pending
  if (existing && existing.fromUserId === fromUserId) {
    return res.status(409).json({ error: 'already_pending' });
  }

  // 建立新的邀請
  const request = {
    requestId: 'FR_' + uuid(),
    fromUserId,
    toUserId,
    status: 'pending',
    createdAt: new Date()
  };
  await friendRequests.insertOne(request);

  // 寄好友邀請信件給對方
  await sendMail(toUserId, {
    type: 'FRIEND_REQUEST',
    title: '好友邀請',
    body: `${fromUser.displayName || fromUserId} 想加你好友`,
    fromUser: { userId: fromUserId, displayName: fromUser.displayName, picture: fromUser.picture },
    payload: { requestId: request.requestId, fromUserId }
  });

  res.json({ request });
});


/** 查詢好友邀請列表 */
app.get('/friend-requests', async (req, res) => {
  const userId = (req.query.userId || '').toString();
  if (!userId) return res.status(400).json({ error: 'invalid_params' });

  const [incoming, outgoing] = await Promise.all([
    friendRequests.find({ toUserId: userId }).sort({ createdAt: -1 }).toArray(),
    friendRequests.find({ fromUserId: userId }).sort({ createdAt: -1 }).toArray(),
  ]);

  res.json({ incoming, outgoing });
});

/** 回覆好友邀請（接受 / 拒絕 / 取消） */
app.post('/friend-requests/respond', async (req, res) => {
  const { userId, requestId, action } = req.body || {};
  if (!userId || !requestId || !action) return res.status(400).json({ error: 'invalid_params' });

  const fr = await friendRequests.findOne({ requestId });
  if (!fr) return res.status(404).json({ error: 'request_not_found' });
  if (fr.status !== 'pending') return res.status(409).json({ error: 'already_handled' });

  const isRecipient = (userId === fr.toUserId);
  const isSender = (userId === fr.fromUserId);

  if (action === 'cancel') {
    if (!isSender) return res.status(403).json({ error: 'not_request_participant' });
    await friendRequests.updateOne({ requestId }, { $set: { status: 'canceled', respondedAt: new Date() } });
    return res.json({ ok: true });
  }

  if (!isRecipient) return res.status(403).json({ error: 'not_request_participant' });

  const [fromUser, toUser] = await Promise.all([
    users.findOne({ userId: fr.fromUserId }),
    users.findOne({ userId: fr.toUserId })
  ]);

  if (action === 'decline') {
    await friendRequests.updateOne({ requestId }, { $set: { status: 'declined', respondedAt: new Date() } });
    await sendMail(fr.fromUserId, {
      type: 'NOTICE',
      title: '好友邀請已被拒絕',
      body: `${toUser?.displayName || fr.toUserId} 拒絕了你的好友邀請`,
      fromUser: { userId: fr.toUserId, displayName: toUser?.displayName, picture: toUser?.picture }
    });
    return res.json({ ok: true });
  }

  if (action === 'accept') {
    await friendRequests.updateOne({ requestId }, { $set: { status: 'accepted', respondedAt: new Date() } });
    await users.updateOne({ userId: fr.fromUserId }, { $addToSet: { friends: fr.toUserId } });
    await users.updateOne({ userId: fr.toUserId }, { $addToSet: { friends: fr.fromUserId } });

    await sendMail(fr.fromUserId, {
      type: 'NOTICE',
      title: '好友已成立',
      body: `${toUser?.displayName || fr.toUserId} 已接受你的邀請`,
      fromUser: { userId: fr.toUserId, displayName: toUser?.displayName, picture: toUser?.picture }
    });
    await sendMail(fr.toUserId, {
      type: 'NOTICE',
      title: '好友已成立',
      body: `你已與 ${fromUser?.displayName || fr.fromUserId} 成為好友`,
      fromUser: { userId: fr.fromUserId, displayName: fromUser?.displayName, picture: fromUser?.picture }
    });

    return res.json({ ok: true });
  }

  res.status(400).json({ error: 'invalid_action' });
});

/** 推薦隨機玩家 */
/** 推薦隨機玩家 */
app.get('/recommend-users', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 5;
    const excludeUserId = (req.query.excludeUserId || '').toString();

    // 先找出使用者的好友清單
    const currentUser = await users.findOne(
      { userId: excludeUserId },
      { projection: { friends: 1 } }
    );

    const excludeIds = [excludeUserId, ...(currentUser?.friends || [])];

    // 從 DB 隨機抓玩家（排除自己和好友）
    const pipeline = [
      { $match: { userId: { $nin: excludeIds } } },
      { $sample: { size: count } },
      { $project: { _id: 0, userId: 1, displayName: 1, picture: 1 } }
    ];

    const usersList = await users.aggregate(pipeline).toArray();
    res.json(usersList);
  } catch (e) {
    console.error('[GET /recommend-users] error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});


// ------------------- 信箱 API -------------------

/** 取得收件匣 */
app.get('/mail/inbox', async (req, res) => {
  const userId = (req.query.userId || '').toString();
  if (!userId) return res.status(400).json({ error: 'invalid_params' });

  const list = await mails.find({ userId }).sort({ createdAt: -1 }).toArray();
  res.json(list);
});

/** 標記信件已讀 */
app.post('/mail/mark-read', async (req, res) => {
  const { userId, mailId } = req.body || {};
  if (!userId || !mailId) return res.status(400).json({ error: 'invalid_params' });

  const r = await mails.updateOne({ mailId, userId }, { $set: { status: 'read' } });
  if (!r.matchedCount) return res.status(404).json({ error: 'mail_not_found' });
  res.json({ ok: true });
});


// ------------------- 測試用 API -------------------

/** 建立測試使用者 */
app.post('/dev/create/:userId', async (req, res) => {
  try {
    const userId = req.params.userId?.trim();
    if (!userId) return res.status(400).json({ error: 'missing userId' });

    // 你檔案裡已經有 buildDefaultPlayer(...) 可以直接用
    const exists = await users.findOne({ userId });
    if (exists) return res.json({ ok: true, user: exists, existed: true });

    const player = buildDefaultPlayer(`${userId}_id`, `${userId}`, '');
    await users.insertOne(player);
    const fresh = await users.findOne({ userId });
    res.json({ ok: true, user: fresh, existed: false });
  } catch (e) {
    console.error('[DEV create] error:', e);
    res.status(500).json({ error: 'server_error' });
  }
});

// 啟動伺服器
app.listen(3000, () => console.log('伺服器已啟動：http://localhost:3000'));

