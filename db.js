/**
 * 1-17號彩票與投注系統 - 智能資料儲存層 (db.js)
 * 混合模式：自動偵測 Express 後端伺服器 API。
 * - 若偵測到伺服器 (Server Mode)：使用 HTTP Fetch 與雲端/主機端資料庫同步。
 * - 若為純靜態打開 (Local Mode)：自動降級使用瀏覽器 `localStorage`，確保依然可獨立執行。
 */

const STORAGE_KEYS = {
  DRAWS: 'lottery_draws',
  BETS: 'lottery_bets',
  ADMIN_PIN: 'lottery_admin_pin'
};

const DEFAULT_PIN = '8888';

// --- Local Mode 本機儲存輔助函式 ---
function getFromStorage(key, defaultValue = []) {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : defaultValue;
}

function saveToStorage(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// 偵測後端伺服器 API 是否可用
let useServer = false;

async function checkApiAvailability() {
  try {
    const res = await fetch('/api/health');
    if (res.ok) {
      const data = await res.json();
      if (data.mode === 'server') {
        useServer = true;
        console.log('📡 偵測到共享伺服器，已啟用 [伺服器雲端同步模式]');
        return true;
      }
    }
  } catch (e) {
    // 忽略錯誤，降級使用 localStorage
  }
  console.log('📦 未偵測到後端，已啟用 [本機獨立 localStorage 模式]');
  useServer = false;
  return false;
}

// 在加載時啟動檢測
const apiCheckPromise = checkApiAvailability();

export const db = {
  // 供外部調用以確認是否處於伺服器模式
  async isServerMode() {
    await apiCheckPromise;
    return useServer;
  },

  // --- 管理員密碼相關 ---
  async getAdminPin() {
    await apiCheckPromise;
    if (useServer) {
      // 伺服器端密碼安全起見不由 API 直接返回，由後端比對
      return null;
    }
    const pin = localStorage.getItem(STORAGE_KEYS.ADMIN_PIN);
    return pin || DEFAULT_PIN;
  },

  async setAdminPin(newPin) {
    await apiCheckPromise;
    if (newPin || newPin.trim().length >= 4) {
      if (useServer) {
        const oldPin = localStorage.getItem('temp_admin_pin') || DEFAULT_PIN;
        const res = await fetch('/api/settings/change-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPin, newPin })
        });
        if (res.ok) {
          localStorage.setItem('temp_admin_pin', newPin.trim());
          return true;
        }
        return false;
      } else {
        localStorage.setItem(STORAGE_KEYS.ADMIN_PIN, newPin.trim());
        return true;
      }
    }
    return false;
  },

  async verifyAdminPin(inputPin) {
    await apiCheckPromise;
    if (useServer) {
      try {
        const res = await fetch('/api/settings/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: inputPin })
        });
        if (res.ok) {
          // 密碼驗證通過，本地記住做為變更密碼時使用
          localStorage.setItem('temp_admin_pin', inputPin);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    } else {
      const realPin = await this.getAdminPin();
      return inputPin === realPin;
    }
  },

  // --- 期數活動 (Draws) 相關 ---
  async getDraws() {
    await apiCheckPromise;
    if (useServer) {
      const res = await fetch('/api/draws');
      return await res.json();
    }
    return getFromStorage(STORAGE_KEYS.DRAWS);
  },

  async getDrawById(id) {
    const draws = await this.getDraws();
    return draws.find(draw => draw.id === id);
  },

  async addDraw(id, name) {
    await apiCheckPromise;
    if (useServer) {
      const res = await fetch('/api/draws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '建立活動失敗');
      }
      return await res.json();
    } else {
      const draws = getFromStorage(STORAGE_KEYS.DRAWS);
      if (draws.some(d => d.id === id)) {
        throw new Error('此流水期號已存在！');
      }
      const newDraw = {
        id: id.trim(),
        name: name.trim() || `第 ${id} 期活動`,
        createdAt: new Date().toISOString(),
        status: 'active',
        winningNumbers: null
      };
      draws.unshift(newDraw);
      saveToStorage(STORAGE_KEYS.DRAWS, draws);
      return newDraw;
    }
  },

  async deleteDraw(id) {
    await apiCheckPromise;
    if (useServer) {
      const res = await fetch(`/api/draws/${id}`, { method: 'DELETE' });
      return res.ok;
    } else {
      let draws = getFromStorage(STORAGE_KEYS.DRAWS);
      draws = draws.filter(d => d.id !== id);
      saveToStorage(STORAGE_KEYS.DRAWS, draws);

      let bets = getFromStorage(STORAGE_KEYS.BETS);
      bets = bets.filter(b => b.drawId !== id);
      saveToStorage(STORAGE_KEYS.BETS, bets);
      return true;
    }
  },

  async completeDraw(id, winningNumbers) {
    await apiCheckPromise;
    if (useServer) {
      const res = await fetch(`/api/draws/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winningNumbers })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '開獎失敗');
      }
      return await res.json();
    } else {
      if (!Array.isArray(winningNumbers) || winningNumbers.length !== 5) {
        throw new Error('開獎號碼必須是 5 個數字！');
      }
      const draws = getFromStorage(STORAGE_KEYS.DRAWS);
      const drawIndex = draws.findIndex(d => d.id === id);
      if (drawIndex === -1) {
        throw new Error('找不到指定的活動期數！');
      }
      
      const sortedNumbers = [...winningNumbers].map(Number).sort((a, b) => a - b);
      draws[drawIndex].status = 'completed';
      draws[drawIndex].winningNumbers = sortedNumbers;
      saveToStorage(STORAGE_KEYS.DRAWS, draws);
      return draws[drawIndex];
    }
  },

  // --- 投注 (Bets) 相關 ---
  async getBets() {
    await apiCheckPromise;
    if (useServer) {
      const res = await fetch('/api/bets');
      return await res.json();
    }
    return getFromStorage(STORAGE_KEYS.BETS);
  },

  async getBetsByDrawId(drawId) {
    const bets = await this.getBets();
    return bets.filter(bet => bet.drawId === drawId);
  },

  async addBet(drawId, playerName, numbers, multiplier) {
    await apiCheckPromise;
    if (useServer) {
      const res = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drawId, playerName, numbers, multiplier })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || '投注失敗');
      }
      return await res.json();
    } else {
      const draw = await this.getDrawById(drawId);
      if (!draw) {
        throw new Error('此期數不存在！');
      }
      if (draw.status !== 'active') {
        throw new Error('此活動期數已截止投注！');
      }
      if (!playerName || playerName.trim() === '') {
        throw new Error('請輸入投注人姓名！');
      }
      if (!Array.isArray(numbers) || numbers.length < 5) {
        throw new Error('最少必須挑選 5 個號碼！');
      }
      const mult = parseInt(multiplier, 10);
      if (isNaN(mult) || mult <= 0) {
        throw new Error('下注柱數必須大於 0！');
      }

      const bets = getFromStorage(STORAGE_KEYS.BETS);
      const sortedNumbers = [...numbers].map(Number).sort((a, b) => a - b);

      const newBet = {
        id: 'bet_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        drawId,
        playerName: playerName.trim(),
        numbers: sortedNumbers,
        multiplier: mult,
        createdAt: new Date().toISOString(),
        isValid: false // 🎯 新增需求：投注後預設為無效！
      };

      bets.unshift(newBet);
      saveToStorage(STORAGE_KEYS.BETS, bets);
      return newBet;
    }
  },

  async toggleBetActive(betId, isValid) {
    await apiCheckPromise;
    if (useServer) {
      const res = await fetch(`/api/bets/${betId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isValid })
      });
      return await res.json();
    } else {
      const bets = getFromStorage(STORAGE_KEYS.BETS);
      const betIndex = bets.findIndex(b => b.id === betId);
      if (betIndex === -1) {
        throw new Error('找不到指定的投注紀錄！');
      }
      bets[betIndex].isValid = isValid;
      saveToStorage(STORAGE_KEYS.BETS, bets);
      return bets[betIndex];
    }
  },

  // 刪除單個投注
  async deleteSingleBet(betId) {
    await apiCheckPromise;
    if (useServer) {
      const res = await fetch(`/api/bets/${betId}`, { method: 'DELETE' });
      return res.ok;
    } else {
      let bets = getFromStorage(STORAGE_KEYS.BETS);
      bets = bets.filter(b => b.id !== betId);
      saveToStorage(STORAGE_KEYS.BETS, bets);
      return true;
    }
  },

  // --- 重設資料庫 (含種子測試資料) ---
  async resetDatabase() {
    await apiCheckPromise;
    if (useServer) {
      const res = await fetch('/api/settings/reset', { method: 'POST' });
      return res.ok;
    } else {
      localStorage.clear();
      return true;
    }
  },

  async seedDemoData() {
    await apiCheckPromise;
    if (useServer) return; // 伺服器端有內建種子讀取，不在此處寫入

    const draws = getFromStorage(STORAGE_KEYS.DRAWS);
    if (draws.length > 0) return;

    const demoDraws = [
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
    ];

    const demoBets = [
      {
        id: 'bet_demo_1',
        drawId: '2026052501',
        playerName: '王小明',
        numbers: [2, 5, 8, 12, 15],
        multiplier: 5,
        createdAt: new Date(Date.now() - 3000000).toISOString(),
        isValid: false // 預設無效
      },
      {
        id: 'bet_demo_2',
        drawId: '2026052501',
        playerName: '李小美',
        numbers: [1, 3, 7, 13, 17],
        multiplier: 2,
        createdAt: new Date(Date.now() - 2000000).toISOString(),
        isValid: false // 預設無效
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
        isValid: true
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
    ];

    saveToStorage(STORAGE_KEYS.DRAWS, demoDraws);
    saveToStorage(STORAGE_KEYS.BETS, demoBets);
  }
};
