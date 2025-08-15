const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json());

// 連接 MongoDB
const uri = 'mongodb://127.0.0.1:27017';
const client = new MongoClient(uri);

let db, users, quiz;

async function initDB() {
    await client.connect();
    db = client.db('Sturgeon-Game'); // 連到 Sturgeon-Game 資料庫
    users = db.collection('users');
    quiz = db.collection('quiz-questions');
    console.log('MongoDB 連線成功');
}
initDB();

// ---------------- 玩家資料 API ----------------

// 取得玩家資料
app.get('/player/:userId', async (req, res) => {
    const user = await users.findOne({ userId: req.params.userId });
    res.json(user || null);
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


// 更新玩家資料
app.put('/player/:userId', async (req, res) => {
    const updateData = { ...req.body };
    delete updateData._id; // 確保不會更新 _id
    await users.updateOne(
        { userId: req.params.userId },
        { $set: updateData }
    );
    res.json({ message: '玩家更新成功' });
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

// 新增題目
app.post('/quiz', async (req, res) => {
    await quiz.insertOne(req.body);
    res.json({ message: '題目新增成功' });
});

// 啟動伺服器
app.listen(3000, () => console.log('伺服器已啟動：http://localhost:3000'));
