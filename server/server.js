require('dotenv').config();
const fetch = require('node-fetch'); // Node 18 也可用內建 fetch

const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());

const path = require('path');
// 把 web-mobile 當作網站根目錄
app.use(express.static(path.join(__dirname, 'public', 'web-mobile')));

// 可選：確保 / 會回到 index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'web-mobile', 'index.html'));
})

// 連接 MongoDB
const uri = 'mongodb://127.0.0.1:27017';
const client = new MongoClient(uri);

let db, users, quiz;

async function initDB() {
    await client.connect();
    db = client.db('Sturgeon-Game'); // 連到 Sturgeon-Game 資料庫
    users = db.collection('users');
    quiz = db.collection('quiz-questions');

    // 確保 userId 唯一
    await users.createIndex({ userId: 1 }, { unique: true });
    console.log('MongoDB 連線成功');
}
initDB();

function getWeekStartKey(date = new Date(), tzOffsetMinutes = 480) {
  const shifted = new Date(date.getTime() + tzOffsetMinutes * 60_000);
  const d = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - dow);  // 回到本週一
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}


function buildDefaultPlayer(userId, displayName, picture) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

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

  return {
    userId,
    displayName,
    picture,
    dragonBones: 666,
    lastLoginDate: today,
    lastLoginTime: now.toISOString(),
    fishList,
    tankList: [{ id: 1, name: "主魚缸", comfort: 80, fishIds: [1,2,3] }],
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
        daysSigned: [false,false,false,false,false,false,false],
        questionsCorrect: [false,false,false,false,false,false,false],
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

// ---------------- 玩家資料 API ----------------

// 取得玩家資料
app.get('/player/:userId', async (req, res) => {
  const id = req.params.userId?.trim();
  const user = await users.findOne({ userId: id });
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json(user);
});



// 新增玩家
app.post('/player', async (req, res) => {
    const newPlayer = req.body;
    const existing = await users.findOne({ userId: newPlayer.userId });
    if (existing) {
        return res.status(400).send('Player already exists');
    }
    await users.insertOne(newPlayer);
    res.json({ success: true });
});


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



// ---------------- 好友 API ----------------

// 取得好友列表
app.get('/friends/:userId', async (req, res) => {
    const user = await users.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: '找不到玩家' });

    const friendList = await users.find({ userId: { $in: user.friends || [] } })
        .project({ userId: 1, displayName: 1, _id: 0 })
        .toArray();

    res.json(friendList);
});

// 加好友
app.post('/add-friend', async (req, res) => {
    const { userId, friendId } = req.body;
    await users.updateOne({ userId }, { $addToSet: { friends: friendId } });
    await users.updateOne({ userId: friendId }, { $addToSet: { friends: userId } });
    res.json({ message: '已加好友' });
});

// ---------------- 題庫 API ----------------

// 取得所有題目
app.get('/quiz', async (req, res) => {
    const questions = await quiz.find().toArray();
    res.json(questions);
});

// ---------------- LINE Auth ----------------
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


// 啟動伺服器
app.listen(3000, () => console.log('伺服器已啟動：http://localhost:3000'));

