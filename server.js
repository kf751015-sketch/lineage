/**
 * 1-17號彩票與投注系統 - 後端伺服器 (server.js)
 * 提供靜態網頁託管與共享 REST API，將資料保存於本機 database.json 中。
 * 讓多部手機與電腦能連線至同一個共享資料庫。
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3080;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(express.json());
// 託管當前目錄下的靜態網頁資源 (index.html, styles.css, app.js 等)
app.use(express.static(__dirname));

// --- 資料庫讀寫輔助函式 ---
function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    // 預設種子資料
    const defaultData = {
      adminPin: '8888',
      draws: [
        {
          id: '2026052501',
          name: '端午端陽加碼大紅包 🧧',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          status: 'active',
          winningNumbers: null
        },
        {
          id: '2026052401',
          name: '週末樂透超級大驚喜 🎁',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          status: 'completed',
          winningNumbers: [3, 7, 10, 14, 17]
        }
      ],
      bets: [
        {
          id: 'bet_demo_1',
          drawId: '2026052501',
          playerName: '王小明',
          numbers: [2, 5, 8, 12, 15],
          multiplier: 5,
          createdAt: new Date(Date.now() - 3000000).toISOString(),
          isValid: false // 新規則：預設無效
        },
        {
          id: 'bet_demo_2',
          drawId: '2026052501',
          playerName: '李小美',
          numbers: [1, 3, 7, 13, 17],
          multiplier: 2,
          createdAt: new Date(Date.now() - 2000000).toISOString(),
          isValid: false // 新規則：預設無效
        },
        {
          id: 'bet_demo_3',
          drawId: '2026052501',
          playerName: '張大華',
          numbers: [4, 8, 10, 14, 16],
          multiplier: 10,
          createdAt: new Date(Date.now() - 1000000).toISOString(),
          isValid: false
        },
        {
          id: 'bet_demo_4',
          drawId: '2026052401',
          playerName: '陳大文',
          numbers: [3, 7, 10, 14, 17],
          multiplier: 2,
          createdAt: new Date(Date.now() - 85000000).toISOString(),
          isValid: true // 已開獎為有效測試
        },
        {
          id: 'bet_demo_5',
          drawId: '2026052401',
          playerName: '林志豪',
          numbers: [3, 7, 10, 14, 16],
          multiplier: 5,
          createdAt: new Date(Date.now() - 84000000).toISOString(),
          isValid: true
        },
        {
          id: 'bet_demo_6',
          drawId: '2026052401',
          playerName: '黃美玲',
          numbers: [3, 7, 10, 11, 15],
          multiplier: 3,
          createdAt: new Date(Date.now() - 83000000).toISOString(),
          isValid: true
        }
      ]
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
    return defaultData;
  }
  
  try {
    const content = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error('讀取資料庫失敗，重新初始化:', err);
    return { adminPin: '8888', draws: [], bets: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// --- API 路由定義 ---

// 1. 健康檢查 (用以偵測是否啟用伺服器模式)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'server' });
});

// 2. 獲取管理員 PIN 碼驗證
app.post('/api/settings/verify-pin', (req, res) => {
  const { pin } = req.body;
  const dbData = readDB();
  if (pin === dbData.adminPin) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: '密碼錯誤' });
  }
});

// 3. 修改管理員 PIN 碼
app.post('/api/settings/change-pin', (req, res) => {
  const { oldPin, newPin } = req.body;
  const dbData = readDB();
  if (oldPin !== dbData.adminPin) {
    return res.status(400).json({ success: false, message: '舊密碼錯誤' });
  }
  if (!newPin || newPin.trim().length < 4) {
    return res.status(400).json({ success: false, message: '新密碼格式不合' });
  }
  dbData.adminPin = newPin.trim();
  writeDB(dbData);
  res.json({ success: true });
});

// 4. 重設資料庫
app.post('/api/settings/reset', (req, res) => {
  if (fs.existsSync(DB_FILE)) {
    fs.unlinkSync(DB_FILE);
  }
  // 重新讀取會自動生成種子資料
  const seeded = readDB();
  res.json({ success: true, message: '資料庫已重設還原' });
});

// 5. 獲取所有期數活動
app.get('/api/draws', (req, res) => {
  const dbData = readDB();
  res.json(dbData.draws);
});

// 6. 建立新期數活動
app.post('/api/draws', (req, res) => {
  const { id, name } = req.body;
  const dbData = readDB();
  if (dbData.draws.some(d => d.id === id)) {
    return res.status(400).json({ message: '此流水期號已存在！' });
  }
  
  const newDraw = {
    id: id.trim(),
    name: name.trim() || `第 ${id} 期活動`,
    createdAt: new Date().toISOString(),
    status: 'active',
    winningNumbers: null
  };
  
  dbData.draws.unshift(newDraw);
  writeDB(dbData);
  res.json(newDraw);
});

// 7. 刪除期數活動 (連帶刪除該期投注)
app.delete('/api/draws/:id', (req, res) => {
  const drawId = req.params.id;
  const dbData = readDB();
  
  dbData.draws = dbData.draws.filter(d => d.id !== drawId);
  dbData.bets = dbData.bets.filter(b => b.drawId !== drawId);
  
  writeDB(dbData);
  res.json({ success: true });
});

// 8. 封簽開獎
app.post('/api/draws/:id/complete', (req, res) => {
  const drawId = req.params.id;
  const { winningNumbers } = req.body;
  const dbData = readDB();
  
  const drawIndex = dbData.draws.findIndex(d => d.id === drawId);
  if (drawIndex === -1) {
    return res.status(404).json({ message: '找不到此活動期數' });
  }
  
  const sortedNumbers = [...winningNumbers].map(Number).sort((a, b) => a - b);
  dbData.draws[drawIndex].status = 'completed';
  dbData.draws[drawIndex].winningNumbers = sortedNumbers;
  
  writeDB(dbData);
  res.json(dbData.draws[drawIndex]);
});

// 9. 獲取所有投注
app.get('/api/bets', (req, res) => {
  const dbData = readDB();
  res.json(dbData.bets);
});

// 10. 新增玩家投注 (預設為無效: isValid = false)
app.post('/api/bets', (req, res) => {
  const { drawId, playerName, numbers, multiplier } = req.body;
  const dbData = readDB();
  
  const draw = dbData.draws.find(d => d.id === drawId);
  if (!draw) return res.status(404).json({ message: '此活動期數不存在！' });
  if (draw.status !== 'active') return res.status(400).json({ message: '此期數已截止投注！' });
  
  const sortedNumbers = [...numbers].map(Number).sort((a, b) => a - b);
  
  const newBet = {
    id: 'bet_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    drawId,
    playerName: playerName.trim(),
    numbers: sortedNumbers,
    multiplier: parseInt(multiplier, 10) || 1,
    createdAt: new Date().toISOString(),
    isValid: false // 🎯 新增需求：投注後預設為無效！
  };
  
  dbData.bets.unshift(newBet);
  writeDB(dbData);
  res.json(newBet);
});

// 11. 切換投注有效性 (isValid)
app.patch('/api/bets/:id', (req, res) => {
  const betId = req.params.id;
  const { isValid } = req.body;
  const dbData = readDB();
  
  const betIndex = dbData.bets.findIndex(b => b.id === betId);
  if (betIndex === -1) {
    return res.status(404).json({ message: '找不到指定的投注紀錄！' });
  }
  
  dbData.bets[betIndex].isValid = isValid;
  writeDB(dbData);
  res.json(dbData.bets[betIndex]);
});

// 12. 刪除單筆投注
app.delete('/api/bets/:id', (req, res) => {
  const betId = req.params.id;
  const dbData = readDB();
  
  dbData.bets = dbData.bets.filter(b => b.id !== betId);
  writeDB(dbData);
  res.json({ success: true });
});

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`==================================================`);
  console.log(`🪐 1-17號共享彩票系統伺服器已成功啟動！`);
  console.log(`💻 本機訪問網址: http://localhost:${PORT}`);
  console.log(`💾 共享資料庫檔案儲存於: ${DB_FILE}`);
  console.log(`==================================================`);
});
