/**
 * 1-17號彩票與投注系統 - 核心前端邏輯 (app.js)
 * 控制視圖切換、表單驗證、選號互動、中獎核對計算與炫麗動畫。
 * 升級為 Async/Await 架構，無縫支援 Local 模式與共享伺服器模式。
 */

import { db } from './db.js';

// --- 全局狀態管理 ---
const state = {
  currentView: 'player',
  selectedPlayerNumbers: [],
  selectedWinningNumbers: [],
  currentAdminSelectedDrawId: null,
  isAdminAuthenticated: false,
  pendingView: null // 記錄等待密碼驗證通過後切換的視圖
};

// --- DOM 節點快取 ---
const DOM = {
  // 導覽切換
  tabPlayer: document.getElementById('tab-player'),
  tabAdmin: document.getElementById('tab-admin'),
  viewPlayer: document.getElementById('view-player'),
  viewAdmin: document.getElementById('view-admin'),
  btnSettings: document.getElementById('btn-settings'),
  
  // 玩家選號表單
  betForm: document.getElementById('bet-form'),
  playerDrawSelect: document.getElementById('player-draw-select'),
  playerNameInput: document.getElementById('player-name'),
  numberGridPlayer: document.getElementById('number-grid-player'),
  selectedBadge: document.getElementById('selected-badge'),
  betMultiplierInput: document.getElementById('bet-multiplier'),
  btnDec: document.getElementById('btn-dec'),
  btnInc: document.getElementById('btn-inc'),
  btnClearBet: document.getElementById('btn-clear-bet'),
  btnSubmitBet: document.getElementById('btn-submit-bet'),
  
  // 彩票預覽
  ticketPreview: document.getElementById('ticket-preview'),
  ticketDrawId: document.getElementById('ticket-draw-id'),
  ticketPlayerName: document.getElementById('ticket-player-name'),
  ticketMultiplier: document.getElementById('ticket-multiplier'),
  ticketNumbersContainer: document.getElementById('ticket-numbers-container'),
  ticketStatus: document.getElementById('ticket-status'),
  ticketTime: document.getElementById('ticket-time'),
  
  // 即時跑馬燈
  recentBetsTicker: document.getElementById('recent-bets-ticker'),
  
  // 管理員控制
  createDrawForm: document.getElementById('create-draw-form'),
  drawIdInput: document.getElementById('draw-id-input'),
  drawNameInput: document.getElementById('draw-name-input'),
  adminDrawList: document.getElementById('admin-draw-list'),
  drawingPanel: document.getElementById('drawing-panel'),
  drawingDrawId: document.getElementById('drawing-draw-id'),
  drawingDrawName: document.getElementById('drawing-draw-name'),
  numberGridWinning: document.getElementById('number-grid-winning'),
  winningSelectedBadge: document.getElementById('winning-selected-badge'),
  btnResetWinningSelection: document.getElementById('btn-reset-winning-selection'),
  btnSubmitWinning: document.getElementById('btn-submit-winning'),
  
  // 數據與中獎名單
  betsCountBadge: document.getElementById('bets-count-badge'),
  betsTableBody: document.getElementById('bets-table-body'),
  winnerReportCard: document.getElementById('winner-report-card'),
  winnerReportSubtitle: document.getElementById('winner-report-subtitle'),
  countTier5: document.getElementById('count-tier-5'),
  countTier4: document.getElementById('count-tier-4'),
  countTier3: document.getElementById('count-tier-3'),
  listTier5: document.getElementById('list-tier-5'),
  listTier4: document.getElementById('list-tier-4'),
  listTier3: document.getElementById('list-tier-3'),
  
  // 模態對話框
  pinModal: document.getElementById('pin-modal'),
  pinInput: document.getElementById('pin-input'),
  pinErrorMsg: document.getElementById('pin-error-msg'),
  btnPinCancel: document.getElementById('btn-pin-cancel'),
  btnPinSubmit: document.getElementById('btn-pin-submit'),
  
  settingsModal: document.getElementById('settings-modal'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  oldPinInput: document.getElementById('old-pin'),
  newPinInput: document.getElementById('new-pin'),
  btnChangePin: document.getElementById('btn-change-pin'),
  btnResetDb: document.getElementById('btn-reset-db'),
  
  toastContainer: document.getElementById('toast-container')
};

// --- 初始化進入點 ---
document.addEventListener('DOMContentLoaded', async () => {
  // 1. 初始化種子資料
  await db.seedDemoData();
  
  // 2. 生成選號網格
  generateNumberGrid(DOM.numberGridPlayer, 'player');
  generateNumberGrid(DOM.numberGridWinning, 'winning');
  
  // 3. 綁定事件監聽
  setupEventListeners();
  
  // 4. 載入並渲染 UI 狀態
  await refreshDrawSelections();
  await refreshAdminDrawList();
  await refreshRecentBetsTicker();
  
  // 5. 預設選中最新一期活動
  await autoSelectDefaultDraw();
});

// --- 生成 1~17 號按鈕網格 ---
function generateNumberGrid(container, type) {
  container.innerHTML = '';
  for (let i = 1; i <= 17; i++) {
    const ball = document.createElement('button');
    ball.type = 'button';
    ball.className = 'num-ball';
    ball.textContent = i < 10 ? '0' + i : i;
    ball.dataset.num = i;
    
    ball.addEventListener('click', () => handleNumberClick(i, ball, type));
    container.appendChild(ball);
  }
}

// --- 處理選號點擊邏輯 ---
function handleNumberClick(num, element, type) {
  if (type === 'player') {
    // 玩家選號
    const index = state.selectedPlayerNumbers.indexOf(num);
    if (index > -1) {
      state.selectedPlayerNumbers.splice(index, 1);
      element.classList.remove('selected');
    } else {
      if (state.selectedPlayerNumbers.length >= 5) {
        showToast('⚠️ 最多只能挑選 5 個幸運號碼！', 'warning');
        return;
      }
      state.selectedPlayerNumbers.push(num);
      element.classList.add('selected');
    }
    state.selectedPlayerNumbers.sort((a, b) => a - b);
    
    // 更新 UI 狀態
    DOM.selectedBadge.textContent = `已選 ${state.selectedPlayerNumbers.length} / 5`;
    if (state.selectedPlayerNumbers.length === 5) {
      DOM.selectedBadge.classList.add('badge-gold');
    } else {
      DOM.selectedBadge.classList.remove('badge-gold');
    }
    
    updateTicketPreview();
    
  } else if (type === 'winning') {
    // 管理員開獎選號
    const index = state.selectedWinningNumbers.indexOf(num);
    if (index > -1) {
      state.selectedWinningNumbers.splice(index, 1);
      element.classList.remove('selected');
    } else {
      if (state.selectedWinningNumbers.length >= 5) {
        showToast('⚠️ 開獎號碼為剛好 5 個號碼！', 'warning');
        return;
      }
      state.selectedWinningNumbers.push(num);
      element.classList.add('selected');
    }
    state.selectedWinningNumbers.sort((a, b) => a - b);
    
    DOM.winningSelectedBadge.textContent = `已選 ${state.selectedWinningNumbers.length} / 5`;
    if (state.selectedWinningNumbers.length === 5) {
      DOM.winningSelectedBadge.classList.add('badge-gold');
    } else {
      DOM.winningSelectedBadge.classList.remove('badge-gold');
    }
  }
}

// --- 綁定事件監聽器 ---
function setupEventListeners() {
  // 視角切換
  DOM.tabPlayer.addEventListener('click', () => switchView('player'));
  DOM.tabAdmin.addEventListener('click', () => {
    if (state.isAdminAuthenticated) {
      switchView('admin');
    } else {
      state.pendingView = 'admin';
      openPinModal();
    }
  });

  // 設定與模態框
  DOM.btnSettings.addEventListener('click', openSettingsModal);
  DOM.btnCloseSettings.addEventListener('click', closeSettingsModal);
  DOM.btnPinCancel.addEventListener('click', closePinModal);
  
  DOM.btnPinSubmit.addEventListener('click', handlePinVerification);
  DOM.pinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handlePinVerification();
  });
  
  DOM.btnChangePin.addEventListener('click', handleChangePin);
  DOM.btnResetDb.addEventListener('click', handleResetDatabase);

  // 玩家投注表單
  DOM.playerNameInput.addEventListener('input', updateTicketPreview);
  DOM.playerDrawSelect.addEventListener('change', async () => {
    updateTicketPreview();
    await refreshRecentBetsTicker();
  });
  
  DOM.btnDec.addEventListener('click', () => adjustMultiplier(-1));
  DOM.btnInc.addEventListener('click', () => adjustMultiplier(1));
  DOM.btnClearBet.addEventListener('click', clearPlayerSelection);
  DOM.betForm.addEventListener('submit', handleBetSubmit);

  // 管理員：建立新活動
  DOM.createDrawForm.addEventListener('submit', handleCreateDraw);
  
  // 管理員：開獎重設與送出
  DOM.btnResetWinningSelection.addEventListener('click', resetWinningSelection);
  DOM.btnSubmitWinning.addEventListener('click', handleSubmitWinningNumbers);
}

// --- 視角切換邏輯 ---
async function switchView(viewName) {
  state.currentView = viewName;
  
  if (viewName === 'player') {
    DOM.tabPlayer.classList.add('active');
    DOM.tabAdmin.classList.remove('active');
    DOM.viewPlayer.classList.add('active');
    DOM.viewAdmin.classList.remove('active');
    await refreshDrawSelections();
    updateTicketPreview();
  } else if (viewName === 'admin') {
    DOM.tabPlayer.classList.remove('active');
    DOM.tabAdmin.classList.add('active');
    DOM.viewPlayer.classList.remove('active');
    DOM.viewAdmin.classList.add('active');
    await refreshAdminDrawList();
  }
}

// --- 管理驗證密碼彈窗邏輯 ---
function openPinModal() {
  DOM.pinInput.value = '';
  DOM.pinErrorMsg.style.display = 'none';
  DOM.pinModal.classList.add('active');
  setTimeout(() => DOM.pinInput.focus(), 150);
}

function closePinModal() {
  DOM.pinModal.classList.remove('active');
  state.pendingView = null;
}

async function handlePinVerification() {
  const pin = DOM.pinInput.value;
  if (await db.verifyAdminPin(pin)) {
    state.isAdminAuthenticated = true;
    closePinModal();
    showToast('🔑 權限驗證成功！歡迎進入管理控制台', 'success');
    if (state.pendingView) {
      await switchView(state.pendingView);
    }
  } else {
    DOM.pinErrorMsg.style.display = 'block';
    DOM.pinInput.focus();
    DOM.pinInput.select();
  }
}

// --- 系統設定彈窗邏輯 ---
function openSettingsModal() {
  DOM.oldPinInput.value = '';
  DOM.newPinInput.value = '';
  DOM.settingsModal.classList.add('active');
}

function closeSettingsModal() {
  DOM.settingsModal.classList.remove('active');
}

async function handleChangePin() {
  const oldPin = DOM.oldPinInput.value;
  const newPin = DOM.newPinInput.value;
  
  if (!await db.verifyAdminPin(oldPin)) {
    showToast('❌ 目前密碼輸入錯誤！', 'danger');
    return;
  }
  
  if (newPin.trim().length < 4) {
    showToast('❌ 新密碼長度必須大於或等於 4 位！', 'danger');
    return;
  }
  
  if (await db.setAdminPin(newPin)) {
    showToast('🔑 管理員密碼變更成功！', 'success');
    DOM.oldPinInput.value = '';
    DOM.newPinInput.value = '';
    closeSettingsModal();
  }
}

async function handleResetDatabase() {
  if (confirm('⚠️ 您確定要「清空並還原」整個資料庫嗎？\n此動作將會清除所有現有期數與投注，並置入初始種子測試資料，且無法復原！')) {
    await db.resetDatabase();
    showToast('🔥 資料庫已清空並還原！網頁即將重載...', 'danger');
    setTimeout(() => {
      location.reload();
    }, 1500);
  }
}

// --- 玩家投注選號輔助邏輯 ---
function adjustMultiplier(amount) {
  let val = parseInt(DOM.betMultiplierInput.value, 10) || 1;
  val += amount;
  if (val < 1) val = 1;
  if (val > 1000) val = 1000;
  DOM.betMultiplierInput.value = val;
  updateTicketPreview();
}

function clearPlayerSelection() {
  state.selectedPlayerNumbers = [];
  DOM.selectedBadge.textContent = '已選 0 / 5';
  DOM.selectedBadge.classList.remove('badge-gold');
  
  // 取消所有球的選中 class
  DOM.numberGridPlayer.querySelectorAll('.num-ball').forEach(btn => {
    btn.classList.remove('selected');
  });
  
  updateTicketPreview();
}

// --- 更新擬真電子彩票預覽 ---
function updateTicketPreview() {
  const selectedDrawId = DOM.playerDrawSelect.value;
  const name = DOM.playerNameInput.value.trim() || '—';
  const multiplier = DOM.betMultiplierInput.value;
  
  DOM.ticketDrawId.textContent = selectedDrawId ? `第 ${selectedDrawId} 期` : '—';
  DOM.ticketPlayerName.textContent = name;
  DOM.ticketMultiplier.textContent = `${multiplier} 柱`;
  
  // 更新投注號碼球
  DOM.ticketNumbersContainer.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const numSpan = document.createElement('span');
    if (i < state.selectedPlayerNumbers.length) {
      const num = state.selectedPlayerNumbers[i];
      numSpan.className = 'ticket-num filled';
      numSpan.textContent = num < 10 ? '0' + num : num;
    } else {
      numSpan.className = 'ticket-num empty';
      numSpan.textContent = '—';
    }
    DOM.ticketNumbersContainer.appendChild(numSpan);
  }
  
  DOM.ticketStatus.textContent = 'DRAFT';
  DOM.ticketStatus.className = 'ticket-status-stamp';
  DOM.ticketTime.textContent = 'REAL-TIME SYSTEM PREVIEW';
}

// --- 提交投注邏輯 ---
async function handleBetSubmit(e) {
  e.preventDefault();
  
  const drawId = DOM.playerDrawSelect.value;
  const playerName = DOM.playerNameInput.value.trim();
  const multiplier = parseInt(DOM.betMultiplierInput.value, 10);
  
  if (!drawId) {
    showToast('❌ 請先選擇一個進行中的投注期數！', 'danger');
    return;
  }
  if (!playerName) {
    showToast('❌ 請輸入投注人姓名！', 'danger');
    DOM.playerNameInput.focus();
    return;
  }
  if (state.selectedPlayerNumbers.length !== 5) {
    showToast('❌ 請完整選取 5 個幸運號碼！', 'danger');
    return;
  }
  
  try {
    const newBet = await db.addBet(drawId, playerName, state.selectedPlayerNumbers, multiplier);
    
    // 渲染成功效果：彩票狀態與粒子特效
    DOM.ticketStatus.textContent = 'SUBMITTED';
    DOM.ticketStatus.classList.add('submitted');
    DOM.ticketTime.textContent = new Date(newBet.createdAt).toLocaleString();
    
    // 粒子爆炸效果
    createParticleExplosion(DOM.btnSubmitBet);
    
    showToast(`🎉 投注成功送出！(預設審核中，待管理員確認後生效)`, 'success');
    
    // 重設選號與欄位，但保留姓名便於連續投注
    clearPlayerSelection();
    DOM.betMultiplierInput.value = 1;
    
    // 重新載入最新動態
    await refreshRecentBetsTicker();
    
  } catch (error) {
    showToast(`❌ 投注失敗：${error.message}`, 'danger');
  }
}

// --- 即時投注跑馬燈/動態 ---
async function refreshRecentBetsTicker() {
  const currentDrawId = DOM.playerDrawSelect.value;
  DOM.recentBetsTicker.innerHTML = '';
  
  if (!currentDrawId) {
    DOM.recentBetsTicker.innerHTML = '<div class="empty-state">尚無近期投注紀錄</div>';
    return;
  }
  
  const bets = await db.getBetsByDrawId(currentDrawId);
  const draw = await db.getDrawById(currentDrawId);
  
  if (bets.length === 0) {
    DOM.recentBetsTicker.innerHTML = '<div class="empty-state">💨 本期尚無玩家投注紀錄，快來搶頭香！</div>';
    return;
  }
  
  bets.slice(0, 15).forEach(bet => {
    const item = document.createElement('div');
    item.className = 'ticker-item';
    
    const relativeTime = getRelativeTime(new Date(bet.createdAt));
    
    let numbersHtml = '';
    bet.numbers.forEach(num => {
      // 如果該期已開獎，標記中獎球色
      const isMatch = draw && draw.winningNumbers && draw.winningNumbers.includes(num);
      numbersHtml += `<span class="ticker-num-ball ${isMatch ? 'match' : ''}">${num < 10 ? '0' + num : num}</span>`;
    });
    
    item.innerHTML = `
      <div class="ticker-player-info">
        <span class="ticker-name">${escapeHtml(bet.playerName)} ${bet.isValid ? '' : '<span class="text-error" style="font-size: 0.72rem; font-weight: 500;">(審核中/無效)</span>'}</span>
        <span class="ticker-meta">${relativeTime} 下注</span>
      </div>
      <div class="ticker-numbers">
        ${numbersHtml}
      </div>
      <span class="ticker-multiplier">${bet.multiplier} 柱</span>
    `;
    DOM.recentBetsTicker.appendChild(item);
  });
}

// --- 重新載入投注下拉選單 ---
async function refreshDrawSelections() {
  const draws = (await db.getDraws()).filter(d => d.status === 'active');
  const previousVal = DOM.playerDrawSelect.value;
  
  DOM.playerDrawSelect.innerHTML = '';
  
  if (draws.length === 0) {
    DOM.playerDrawSelect.innerHTML = '<option value="">(無進行中的活動，請先至後台建立)</option>';
    return;
  }
  
  draws.forEach(draw => {
    const opt = document.createElement('option');
    opt.value = draw.id;
    opt.textContent = `${draw.id} — ${draw.name}`;
    DOM.playerDrawSelect.appendChild(opt);
  });
  
  // 保留原有選擇，如果依然存在
  if (previousVal && draws.some(d => d.id === previousVal)) {
    DOM.playerDrawSelect.value = previousVal;
  }
}

// --- 自動選取最新活動 ---
async function autoSelectDefaultDraw() {
  const activeDraws = (await db.getDraws()).filter(d => d.status === 'active');
  if (activeDraws.length > 0) {
    DOM.playerDrawSelect.value = activeDraws[0].id;
    updateTicketPreview();
    await refreshRecentBetsTicker();
  }
}

// ==========================================================================
// 管理員控制台邏輯
// ==========================================================================

// --- 新增活動 ---
async function handleCreateDraw(e) {
  e.preventDefault();
  const id = DOM.drawIdInput.value.trim();
  const name = DOM.drawNameInput.value.trim();
  
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    showToast('❌ 活動期數流水號只能包含英數字、底線或破折號！', 'danger');
    return;
  }
  
  try {
    await db.addDraw(id, name);
    showToast(`✨ 活動期數 ${id} 建立成功！狀態預設為：投注中`, 'success');
    DOM.drawIdInput.value = '';
    DOM.drawNameInput.value = '';
    
    await refreshAdminDrawList();
    await refreshDrawSelections();
    
    // 自動選取新建立的期數
    await selectAdminDraw(id);
    
  } catch (error) {
    showToast(`❌ 建立失敗：${error.message}`, 'danger');
  }
}

// --- 渲染管理後台活動期數清單 ---
async function refreshAdminDrawList() {
  const draws = await db.getDraws();
  DOM.adminDrawList.innerHTML = '';
  
  if (draws.length === 0) {
    DOM.adminDrawList.innerHTML = '<div class="empty-state">尚無活動期數，請在上方建立第一期！</div>';
    return;
  }
  
  draws.forEach(draw => {
    const item = document.createElement('div');
    item.className = `draw-item ${draw.status} ${state.currentAdminSelectedDrawId === draw.id ? 'selected' : ''}`;
    
    // 如果是已開獎期數，顯示開出獎號球
    let winningHtml = '';
    if (draw.status === 'completed' && draw.winningNumbers) {
      winningHtml = `<div class="draw-winning-balls">`;
      draw.winningNumbers.forEach(n => {
        winningHtml += `<span class="draw-winning-ball">${n < 10 ? '0' + n : n}</span>`;
      });
      winningHtml += `</div>`;
    }
    
    item.innerHTML = `
      <div class="draw-info">
        <div class="draw-info-header">
          <span class="draw-id-tag">期號: ${draw.id}</span>
          <span class="draw-status-badge ${draw.status}">
            ${draw.status === 'active' ? '🟢 投注中' : '🏆 已開獎'}
          </span>
        </div>
        <div class="draw-name-tag">${escapeHtml(draw.name)}</div>
        ${winningHtml}
      </div>
      <div class="draw-actions">
        <button class="draw-delete-btn" title="刪除本期資料">🗑️</button>
      </div>
    `;
    
    // 點擊期數卡片載入管理詳情
    item.addEventListener('click', async (e) => {
      if (e.target.classList.contains('draw-delete-btn') || e.target.parentElement.classList.contains('draw-delete-btn')) {
        e.stopPropagation();
        await handleDeleteDraw(draw.id);
        return;
      }
      await selectAdminDraw(draw.id);
    });
    
    DOM.adminDrawList.appendChild(item);
  });
}

// --- 選擇管理期數 ---
async function selectAdminDraw(drawId) {
  state.currentAdminSelectedDrawId = drawId;
  
  const draws = await db.getDraws();
  const draw = draws.find(d => d.id === drawId);
  
  await refreshAdminDrawList(); // 最簡單的維持 class 狀態方式
  
  if (!draw) return;
  
  // 更新開獎面板資訊與中獎名單
  if (draw.status === 'active') {
    DOM.drawingPanel.style.display = 'block';
    DOM.winnerReportCard.style.display = 'none';
    
    DOM.drawingDrawId.textContent = draw.id;
    DOM.drawingDrawName.textContent = draw.name;
    
    resetWinningSelection();
  } else {
    // 已開獎，顯示中獎報表
    DOM.drawingPanel.style.display = 'none';
    DOM.winnerReportCard.style.display = 'block';
    
    DOM.winnerReportSubtitle.textContent = `期數：${draw.id} | 開獎號碼：${draw.winningNumbers.map(n => n < 10 ? '0' + n : n).join(', ')}`;
    
    // 分析並渲染中獎名單
    await renderWinnersReport(draw);
  }
  
  // 載入該期玩家投注清單
  await refreshBetsListTable(drawId);
}

// --- 刪除期數 (流水號) 功能 ---
async function handleDeleteDraw(drawId) {
  const pin = prompt(`⚠️ 危險動作！刪除期數 [第 ${drawId} 期] 會連同該期所有玩家投注資料一併「永久抹除」！\n請輸入管理員 PIN 碼以確認執行：`);
  
  if (pin === null) return; // 點擊取消
  
  if (await db.verifyAdminPin(pin)) {
    await db.deleteDraw(drawId);
    showToast(`🗑️ 期數 ${drawId} 資料已成功永久刪除！`, 'danger');
    
    // 如果刪除的是當前選取的管理期數，重置選取狀態
    if (state.currentAdminSelectedDrawId === drawId) {
      state.currentAdminSelectedDrawId = null;
      DOM.drawingPanel.style.display = 'none';
      DOM.winnerReportCard.style.display = 'none';
      DOM.betsTableBody.innerHTML = '<tr><td colspan="6" class="table-empty">請先在左側選擇一個活動期數</td></tr>';
      DOM.betsCountBadge.textContent = '0 筆投注';
    }
    
    await refreshAdminDrawList();
    await refreshDrawSelections();
    await refreshRecentBetsTicker();
  } else {
    alert('❌ 權限驗證失敗，PIN 碼輸入錯誤！刪除動作已被拒絕。');
  }
}

// --- 渲染投注名單管理表格 ---
async function refreshBetsListTable(drawId) {
  const bets = await db.getBetsByDrawId(drawId);
  const draw = await db.getDrawById(drawId);
  
  DOM.betsTableBody.innerHTML = '';
  DOM.betsCountBadge.textContent = `${bets.length} 筆投注`;
  
  if (bets.length === 0) {
    DOM.betsTableBody.innerHTML = '<tr><td colspan="6" class="table-empty">📭 本期目前尚無玩家投注。</td></tr>';
    return;
  }
  
  bets.forEach(bet => {
    const tr = document.createElement('tr');
    if (!bet.isValid) {
      tr.className = 'row-invalid';
    }
    
    // 渲染號碼球（如果該期已開獎，核對是否中獎並高亮）
    let numbersHtml = '<div class="table-numbers">';
    bet.numbers.forEach(num => {
      const isMatch = draw && draw.winningNumbers && draw.winningNumbers.includes(num);
      numbersHtml += `<span class="table-num-ball ${isMatch ? 'match' : ''}">${num < 10 ? '0' + num : num}</span>`;
    });
    numbersHtml += '</div>';
    
    const formattedTime = new Date(bet.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    tr.innerHTML = `
      <td style="font-weight: 700;">${escapeHtml(bet.playerName)}</td>
      <td>${numbersHtml}</td>
      <td class="table-multiplier">${bet.multiplier} 柱</td>
      <td class="text-muted" style="font-size: 0.75rem;">${formattedTime}</td>
      <td>
        <label class="switch">
          <input type="checkbox" class="toggle-validity" data-bet-id="${bet.id}" ${bet.isValid ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <button class="bet-delete-btn" data-bet-id="${bet.id}" title="刪除此筆投注">🗑️</button>
      </td>
    `;
    
    // 綁定有效性開關 Toggle 事件
    const toggleInput = tr.querySelector('.toggle-validity');
    toggleInput.addEventListener('change', async () => {
      await db.toggleBetActive(bet.id, toggleInput.checked);
      
      // 動態更新該行不透明度
      if (toggleInput.checked) {
        tr.classList.remove('row-invalid');
        showToast(`✅ 已啟用並核准 ${bet.playerName} 的投注`, 'success');
      } else {
        tr.classList.add('row-invalid');
        showToast(`❌ 已將 ${bet.playerName} 的投注設為審核無效`, 'warning');
      }
      
      // 如果該期已開獎，因為投注有效性改變，必須立即重新計算中獎名單
      if (draw && draw.status === 'completed') {
        await renderWinnersReport(draw);
      }
      
      // 更新即時跑馬燈與投注清單
      await refreshRecentBetsTicker();
    });
    
    // 綁定單獨刪除下注事件
    const deleteBtn = tr.querySelector('.bet-delete-btn');
    deleteBtn.addEventListener('click', async () => {
      await handleDeleteSingleBet(bet.id, bet.playerName);
    });
    
    DOM.betsTableBody.appendChild(tr);
  });
}

// --- 刪除單個投注 ---
async function handleDeleteSingleBet(betId, playerName) {
  if (confirm(`⚠️ 您確定要刪除 [玩家: ${playerName}] 的這筆投注嗎？\n此動作刪除後無法復原！`)) {
    await db.deleteSingleBet(betId);
    showToast(`🗑️ 已刪除 ${playerName} 的投注！`, 'danger');
    
    // 重新載入 UI
    await refreshBetsListTable(state.currentAdminSelectedDrawId);
    await refreshRecentBetsTicker();
    
    // 如果已開獎，重新整理分析報表
    const draw = await db.db.getDrawById(state.currentAdminSelectedDrawId);
    if (draw && draw.status === 'completed') {
      await renderWinnersReport(draw);
    }
  }
}

// --- 重設開獎選號狀態 ---
function resetWinningSelection() {
  state.selectedWinningNumbers = [];
  DOM.winningSelectedBadge.textContent = '已選 0 / 5';
  DOM.winningSelectedBadge.classList.remove('badge-gold');
  
  DOM.numberGridWinning.querySelectorAll('.num-ball').forEach(btn => {
    btn.classList.remove('selected');
  });
}

// --- 確認封簽開獎 ---
async function handleSubmitWinningNumbers() {
  const drawId = state.currentAdminSelectedDrawId;
  if (!drawId) return;
  
  if (state.selectedWinningNumbers.length !== 5) {
    showToast('❌ 請完整選取 5 個開獎號碼！', 'danger');
    return;
  }
  
  const draw = await db.getDrawById(drawId);
  
  if (confirm(`🎉 確認為期數 [第 ${drawId} 期] 封簽開獎嗎？\n開獎號碼：${state.selectedWinningNumbers.join(', ')}\n封簽開獎後，該期將無法再接收新投注！`)) {
    try {
      await db.completeDraw(drawId, state.selectedWinningNumbers);
      showToast(`🏆 第 ${drawId} 期已成功開獎！並已產出中獎名單統計`, 'success');
      
      // 切換為已開獎狀態視圖
      await selectAdminDraw(drawId);
      
      // 更新玩家選單與跑馬燈
      await refreshDrawSelections();
      await autoSelectDefaultDraw();
      await refreshRecentBetsTicker();
      
    } catch (error) {
      showToast(`❌ 開獎失敗：${error.message}`, 'danger');
    }
  }
}

// --- 分析並渲染中獎名單報表 ---
async function renderWinnersReport(draw) {
  const winningNumbers = draw.winningNumbers;
  // 只比對「有效」投注！
  const bets = (await db.getBetsByDrawId(draw.id)).filter(b => b.isValid === true);
  
  // 三個獎項分類陣列
  const prizeTiers = {
    5: [], // 中 5 碼 (頭獎)
    4: [], // 中 4 碼 (二獎)
    3: []  // 中 3 碼 (三獎)
  };
  
  bets.forEach(bet => {
    // 計算中幾碼
    const matches = bet.numbers.filter(num => winningNumbers.includes(num));
    const matchCount = matches.length;
    
    if (matchCount >= 3) {
      prizeTiers[matchCount].push({
        playerName: bet.playerName,
        numbers: bet.numbers,
        multiplier: bet.multiplier,
        matches: matches
      });
    }
  });
  
  // 渲染頭獎、二獎、三獎數量
  DOM.countTier5.textContent = `${prizeTiers[5].length} 人`;
  DOM.countTier4.textContent = `${prizeTiers[4].length} 人`;
  DOM.countTier3.textContent = `${prizeTiers[3].length} 人`;
  
  // 渲染名單
  renderTierList(DOM.listTier5, prizeTiers[5], winningNumbers);
  renderTierList(DOM.listTier4, prizeTiers[4], winningNumbers);
  renderTierList(DOM.listTier3, prizeTiers[3], winningNumbers);
}

function renderTierList(container, winners, winningNumbers) {
  container.innerHTML = '';
  
  if (winners.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span>💨</span>
        <span>本獎項無人中獎</span>
      </div>
    `;
    return;
  }
  
  winners.forEach(winner => {
    const item = document.createElement('div');
    item.className = 'winner-row';
    
    let numbersHtml = '<div class="winner-numbers">';
    winner.numbers.forEach(num => {
      const isMatch = winningNumbers.includes(num);
      numbersHtml += `<span class="winner-num ${isMatch ? 'match' : ''}">${num < 10 ? '0' + num : num}</span>`;
    });
    numbersHtml += '</div>';
    
    item.innerHTML = `
      <div class="winner-player-info">
        <span class="winner-name">${escapeHtml(winner.playerName)}</span>
        <span class="winner-multiplier">${winner.multiplier} 柱</span>
      </div>
      ${numbersHtml}
    `;
    container.appendChild(item);
  });
}

// ==========================================================================
// 炫麗特效與輔助函式 (Helper Functions)
// ==========================================================================

// --- 動態 Toast 訊息提示 ---
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '🎉';
  if (type === 'warning') icon = '⚠️';
  if (type === 'danger') icon = '🔥';
  
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  DOM.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

// --- 送出下注粒子噴砂爆炸特效 ---
function createParticleExplosion(element) {
  const rect = element.getBoundingClientRect();
  const explosionContainer = document.createElement('div');
  explosionContainer.style.position = 'fixed';
  explosionContainer.style.left = `${rect.left + rect.width / 2}px`;
  explosionContainer.style.top = `${rect.top + rect.height / 2}px`;
  explosionContainer.style.pointerEvents = 'none';
  explosionContainer.style.zIndex = '9999';
  document.body.appendChild(explosionContainer);
  
  const particleCount = 28;
  const colors = ['#3b82f6', '#60a5fa', '#f59e0b', '#fbbf24', '#10b981', '#34d399'];
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    const size = Math.random() * 8 + 4;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 90 + 40;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    
    particle.style.setProperty('--x', `${x}px`);
    particle.style.setProperty('--y', `${y}px`);
    
    explosionContainer.appendChild(particle);
  }
  
  setTimeout(() => {
    explosionContainer.remove();
  }, 1000);
}

// --- 計算相對時間 ---
function getRelativeTime(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 5) return '剛剛';
  if (diffInSeconds < 60) return `${diffInSeconds} 秒前`;
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} 分鐘前`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} 小時前`;
  
  return date.toLocaleDateString();
}

// --- HTML 安全逸出過濾 ---
function escapeHtml(string) {
  return String(string).replace(/[&<>"']/g, function (s) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[s];
  });
}
