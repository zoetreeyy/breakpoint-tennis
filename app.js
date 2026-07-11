// app.js - Controller and Routing Coordinator

import { 
  initSystemState, 
  saveState, 
  getInitialState, 
  autoScheduleMatches, 
  generateBracket, 
  advanceWinner, 
  loadMockDataIntoState,
  checkPlayerRestConflict,
  checkAndGenerateNextRound
} from './state.js?v=6';

import { 
  renderPlayerSearch, 
  renderPlayerCourts, 
  renderPlayerUpcoming, 
  renderPlayerBrackets, 
  renderStaffDashboard, 
  renderRefereePanel, 
  renderSetupPlayers, 
  renderSetupCourtMapBuilder,
  renderPlayerCourtMap,
  drawCertificate,
  initAudio,
  playNotificationChime,
  speakSummon
} from './ui.js?v=8';

let state = null;
let activeView = 'player-view';

// Keep track of called match IDs to avoid repeating speech/visual summons alerts
let previouslyCalledMatchIds = new Set();
let isAppInitialized = false;

// Initialize the App
function init() {
  initSystemState((newState) => {
    state = newState;
    
    // First time initialization
    if (!isAppInitialized) {
      isAppInitialized = true;
      
      // Cache initially called matches so we don't announce them upon page load
      state.matches.forEach(m => {
        if (m.status === 'called') {
          previouslyCalledMatchIds.add(m.id);
        }
      });

      setupEventListeners();
      
      // Periodic update loop (every 1 second) for timers
      setInterval(tickTimers, 1000);
      
      // Autoselect first event for bracket select if present
      const select = document.getElementById('player-bracket-event-select');
      if (state.events.length > 0 && select.options.length === 0) {
        state.events.forEach(ev => {
          const opt = document.createElement('option');
          opt.value = ev;
          opt.text = ev;
          select.add(opt);
        });
      }
    }

    // Every time state updates from cloud (or local)
    checkForNewSummons(state);
    renderAll();
  });
}

// Global renderer
function renderAll() {
  // Update state indicators & layouts
  renderPlayerCourtMap(state);
  renderPlayerCourts(state);
  renderPlayerUpcoming(state);
  renderPlayerBrackets(state);
  renderStaffDashboard(state);
  renderRefereePanel(state);
  renderSetupPlayers(state);
  renderSetupCourtMapBuilder(state);
}

// Local save state and dispatch render
function saveAndRender() {
  saveState(state);
  renderAll();
}

// Check for new match summons to trigger overlays and announcements
function checkForNewSummons(newState) {
  const currentCalled = newState.matches.filter(m => m.status === 'called');
  
  currentCalled.forEach(match => {
    if (!previouslyCalledMatchIds.has(match.id)) {
      previouslyCalledMatchIds.add(match.id);
      
      // Trigger summons overlay
      showSummonOverlay(match);
    }
  });
  
  // Clean up IDs that are no longer in called status
  const currentCalledIds = new Set(currentCalled.map(m => m.id));
  previouslyCalledMatchIds.forEach(id => {
    if (!currentCalledIds.has(id)) {
      previouslyCalledMatchIds.delete(id);
    }
  });
}

// Show Summon Overlay
function showSummonOverlay(match) {
  const p1 = state.players.find(p => p.id === match.player1Id);
  const p2 = state.players.find(p => p.id === match.player2Id);
  const court = state.courts.find(c => c.id === match.courtId);
  
  if (!p1 || !p2 || !court) return;

  const overlay = document.getElementById('summon-overlay');
  document.getElementById('summon-event').innerText = match.event;
  document.getElementById('summon-p1').innerText = p1.name;
  document.getElementById('summon-p2').innerText = p2.name;
  document.getElementById('summon-court').innerText = court.name;

  overlay.classList.remove('hidden');

  // Trigger web audio beep/chime
  playNotificationChime();

  // TTS Voice Summon
  speakSummon(match.event, p1.name, p2.name, court.name);
}

// Tick Timers (runs every 1 second)
function tickTimers() {
  // Only redraw UI elements with timers to avoid full-page flashes
  renderPlayerCourts(state);
  renderRefereePanel(state);
  
  // Also check if summons overlay count hits limit
  const calledMatches = state.matches.filter(m => m.status === 'called');
  calledMatches.forEach(match => {
    const elapsed = Date.now() - match.calledAt;
    const limit = state.configs.summonLimitMinutes * 60 * 1000;
    if (elapsed >= limit && !match.summonsExpiredAlertTriggered) {
      match.summonsExpiredAlertTriggered = true;
      // Mark internally so we don't alert repeatedly
      saveState(state);
    }
  });
}

// Cross-tab synchronization listener
window.addEventListener('storage', (event) => {
  if (event.key === 'tennis_tournament_state') {
    // Reload state
    try {
      state = JSON.parse(event.newValue);
      renderAll();
      checkForNewSummons(state);
    } catch (e) {
      console.error("Failed to parse storage sync state", e);
    }
  }
});

// Also trigger local updates
window.addEventListener('tournament-state-updated', (event) => {
  state = event.detail;
  checkForNewSummons(state);
});

// Setup Listeners
function setupEventListeners() {
  // 1. Navigation / View Switcher
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const viewId = btn.getAttribute('data-view');

      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const panels = document.querySelectorAll('.view-panel');
      panels.forEach(p => p.classList.remove('active'));
      
      const targetPanel = document.getElementById(viewId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
      activeView = viewId;
      renderAll();
      
      // Auto-close mobile menu when a tab is clicked
      document.querySelector('.view-selector').classList.remove('show-on-mobile');
    });
  });
  
  // Helper to switch to referee trap mode
  const checkRefereeAuth = () => {
    if (localStorage.getItem('referee_auth') === 'true') {
      const targetBtn = document.querySelector('.nav-btn[data-view="referee-panel"]');
      if (targetBtn) targetBtn.click();
      
      const viewSelector = document.querySelector('.view-selector');
      if (viewSelector) viewSelector.style.display = 'none';
      
      const mobileBtn = document.getElementById('mobile-menu-btn');
      if (mobileBtn) mobileBtn.style.display = 'none';
    }
  };

  // Check admin authorization on load
  const checkAuth = () => {
    if (localStorage.getItem('admin_auth') === 'true') {
      document.querySelectorAll('.admin-only').forEach(btn => {
        btn.style.display = 'flex'; // Nav buttons use flex in this template
      });
    } else if (localStorage.getItem('referee_auth') === 'true') {
      setTimeout(() => checkRefereeAuth(), 100);
    }
  };
  checkAuth();

  // Secret Portal Logic (5 clicks on logo)
  const logo = document.querySelector('.logo');
  let logoClickCount = 0;
  let logoClickTimer = null;
  
  if (logo) {
    logo.addEventListener('click', () => {
      logoClickCount++;
      clearTimeout(logoClickTimer);
      
      if (logoClickCount >= 5) {
        logoClickCount = 0;
        if (localStorage.getItem('admin_auth') !== 'true' && localStorage.getItem('referee_auth') !== 'true') {
          document.getElementById('auth-password').value = '';
          document.getElementById('auth-modal').classList.remove('hidden');
        } else {
          // Toggle off admin/referee mode for convenience
          if (confirm("您目前已處於「系統後台模式」。是否要登出並恢復一般選手視角？")) {
            localStorage.removeItem('admin_auth');
            localStorage.removeItem('referee_auth');
            
            document.querySelectorAll('.admin-only').forEach(btn => {
              btn.style.display = 'none';
            });
            
            const viewSelector = document.querySelector('.view-selector');
            if (viewSelector) viewSelector.style.display = '';
            
            const mobileBtn = document.getElementById('mobile-menu-btn');
            if (mobileBtn) mobileBtn.style.display = '';
            
            // Switch back to player view
            if (activeView !== 'player-view') {
              document.querySelector('.nav-btn[data-view="player-view"]').click();
            }
          }
        }
      }
      
      logoClickTimer = setTimeout(() => {
        logoClickCount = 0;
      }, 2000); // 2 seconds window
    });
  }

  // Global Auth Modal Submit
  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const pwd = document.getElementById('auth-password').value;
      if (pwd === 'admin123') {
        localStorage.setItem('admin_auth', 'true');
        document.getElementById('auth-modal').classList.add('hidden');
        checkAuth();
        alert("✅ 管理員驗證成功！已為您開啟全系統後台選單。");
      } else if (pwd === 'ref123') {
        localStorage.setItem('referee_auth', 'true');
        document.getElementById('auth-modal').classList.add('hidden');
        checkAuth();
        alert("✅ 裁判驗證成功！已進入防呆裁判專屬控制台。");
      } else {
        alert("密碼錯誤，請重新輸入。");
        document.getElementById('auth-password').value = '';
      }
    });
  }

  // Mobile Menu Toggle logic
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      document.querySelector('.view-selector').classList.toggle('show-on-mobile');
    });
  }


  
  // Also check if AudioContext is already initialized, else show banner
  // (Standard browser security policy)
  document.getElementById('btn-mock-summon').addEventListener('click', () => {
    playNotificationChime();
  });

  // Close summons overlay
  document.getElementById('btn-close-summon').addEventListener('click', () => {
    document.getElementById('summon-overlay').classList.add('hidden');
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  });

  // 3. Player Search Box
  const searchInput = document.getElementById('player-search-input');
  const searchBtn = document.getElementById('player-search-btn');
  
  const performSearch = () => {
    renderPlayerSearch(state, searchInput.value);
  };
  
  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  // Player self check-in click handler
  document.getElementById('player-search-result').addEventListener('click', (e) => {
    const btnCheckin = e.target.closest('#btn-self-checkin');
    const btnGift = e.target.closest('#btn-claim-gift');
    
    if (btnCheckin) {
      const playerId = btnCheckin.getAttribute('data-id');
      const playerObj = state.players.find(p => p.id === playerId);
      if (playerObj) {
      const inputPhone = window.prompt(`為了保護您的隱私，請輸入【${playerObj.name}】報名時留的「聯絡電話」以完成身分驗證：`);
      
      // If user clicked cancel on the prompt
      if (inputPhone === null) return;
      
      // Verify phone number (ignoring leading/trailing spaces)
      const storedPhone = (playerObj.phone || '').trim();
      const providedPhone = inputPhone.trim();
      
      if (providedPhone === storedPhone) {
        playerObj.checkedIn = true;
        saveAndRender();
        // Re-render the search card to update status
        renderPlayerSearch(state, playerObj.name);
        alert(`${playerObj.name} 選手，驗證成功！您已完成自主報到。請注意場地點名與大會召集廣播！`);
      } else {
        alert("驗證失敗：聯絡電話輸入錯誤，請確認後再試。");
      }
    }
  } else if (btnGift) {
      const playerId = btnGift.getAttribute('data-id');
      const playerObj = state.players.find(p => p.id === playerId);
      if (playerObj && !playerObj.giftClaimed) {
        const inputCode = window.prompt(`【工作人員專用】請輸入發放參賽禮物的「驗證碼」以確認發放：`);
        if (inputCode === null) return; // Cancelled
        
        const correctCode = state.configs.giftClaimCode || '8888';
        if (inputCode.trim() === correctCode.trim()) {
          playerObj.giftClaimed = true;
          saveAndRender();
          renderPlayerSearch(state, playerObj.name);
          alert(`✅ 已成功確認發放贈品給 ${playerObj.name}！`);
        } else {
          alert("❌ 驗證碼錯誤，無法確認發放！");
        }
      }
    }
  });

  // 4. Bracket Event Select
  document.getElementById('player-bracket-event-select').addEventListener('change', () => {
    renderPlayerBrackets(state);
  });

  // 4.5 Bracket Viewer Drag to Scroll
  const bracketViewer = document.getElementById('player-bracket-viewer');
  let isDown = false;
  let startX;
  let startY;
  let scrollLeft;
  let scrollTop;

  bracketViewer.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX - bracketViewer.offsetLeft;
    startY = e.pageY - bracketViewer.offsetTop;
    scrollLeft = bracketViewer.scrollLeft;
    scrollTop = bracketViewer.scrollTop;
  });
  bracketViewer.addEventListener('mouseleave', () => { isDown = false; });
  bracketViewer.addEventListener('mouseup', () => { isDown = false; });
  bracketViewer.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - bracketViewer.offsetLeft;
    const y = e.pageY - bracketViewer.offsetTop;
    const walkX = (x - startX) * 2; // Scroll speed multiplier
    const walkY = (y - startY) * 2;
    bracketViewer.scrollLeft = scrollLeft - walkX;
    bracketViewer.scrollTop = scrollTop - walkY;
  });

  // 5. Setup View Handlers
  // Update Courts
  document.getElementById('btn-update-courts').addEventListener('click', () => {
    const val = parseInt(document.getElementById('setup-court-count').value);
    if (val >= 1 && val <= 10) {
      // Re-create courts keeping occupied ones if possible, or reset
      const newCourts = [];
      for (let i = 1; i <= val; i++) {
        const letter = String.fromCharCode(64 + i);
        const courtName = `${letter}球場 (Court ${letter})`;
        const existing = state.courts.find(c => c.id === `c${i}`);
        if (existing) {
          existing.name = courtName;
          newCourts.push(existing);
        } else {
          newCourts.push({ id: `c${i}`, name: courtName, status: 'idle', currentMatchId: null });
        }
      }
      state.courts = newCourts;
      
      // Update rest limit and summon limit config
      state.configs.restBufferMinutes = parseInt(document.getElementById('setup-rest-buffer').value) || 30;
      state.configs.summonLimitMinutes = parseInt(document.getElementById('setup-summon-limit').value) || 10;
      state.configs.giftClaimCode = document.getElementById('setup-gift-claim-code').value || '8888';
      
      // Provide a clean slate for the court map when courts are updated
      state.configs.courtMap = Array(25).fill(null);
      saveAndRender();
      alert(`成功設定 ${val} 面球場與比賽參數。`);
    }
  });


  // Reset all
  document.getElementById('btn-reset-all').addEventListener('click', () => {
    if (confirm("此動作將刪除全部選手、球場與賽程數據，無法復原，是否確定？")) {
      state = getInitialState();
      saveAndRender();
      alert("系統已重置為空白狀態。");
    }
  });

  // Parse and Import players
  document.getElementById('btn-import-players').addEventListener('click', () => {
    const importText = document.getElementById('setup-player-import').value;
    const lines = importText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Parse groups
    const eventsText = document.getElementById('setup-events-list').value;
    const currentEvents = eventsText.split('\n').map(e => e.trim()).filter(e => e.length > 0);
    state.events = currentEvents;

    let successCount = 0;
    
    lines.forEach(line => {
      // Format: Name, Phone, Group1;Group2, Gift (supports commas, tabs, full-width punctuation)
      const parts = line.split(/[,\t，、]/).map(p => p.trim());
      const name = parts[0];
      if (!name) return; // Skip empty rows or invalid formatting
      
      const phone = parts[1] || '';
      const pEvents = parts[2] ? parts[2].split(/[;；]/).map(e => e.trim()).filter(e => e.length > 0) : [];
      const gift = parts[3] || '無';
        
        // Check if player already exists
        let playerObj = state.players.find(p => p.name === name);
        if (playerObj) {
          // Update
          playerObj.phone = phone;
          playerObj.events = [...new Set([...playerObj.events, ...pEvents])];
          playerObj.gift = gift;
        } else {
          // Insert
          state.players.push({
            id: 'p_' + Math.random().toString(36).substr(2, 9),
            name: name,
            phone: phone,
            events: pEvents,
            gift: gift,
            checkedIn: false,
            giftClaimed: false,
            lastMatchEndedAt: null
          });
        }
        
        // Auto-register new events
        pEvents.forEach(e => {
          if (!state.events.includes(e)) {
            state.events.push(e);
          }
        });
        successCount++;
    });

    saveAndRender();
    if (confirm(`成功解析並匯入 ${successCount} 名選手。\n是否要讓系統立刻自動為所有組別「生成淘汰賽籤表」並排定對戰組合？\n(注意：這會覆蓋目前的賽事圖與對戰紀錄)`)) {
      state.courts.forEach(c => {
        c.status = 'idle';
        c.currentMatchId = null;
      });
      state.matches = [];
      state.events.forEach(eventName => {
        const shouldShuffle = document.getElementById('setup-random-shuffle').checked;
        generateBracket(state, eventName, shouldShuffle);
      });
      saveAndRender();
      alert("太棒了！已自動為所有選手排好籤表與對戰組合，請前往「選手看板」查看！");
    }
  });


  // Manual Add Player Button
  document.getElementById('btn-add-player-manual').addEventListener('click', () => {
    document.getElementById('player-modal-title').innerText = '新增選手';
    document.getElementById('player-form').reset();
    document.getElementById('player-form-id').value = '';
    
    // Fill checkboxes
    const chkGroup = document.getElementById('player-form-events');
    chkGroup.innerHTML = '';
    state.events.forEach(ev => {
      const lbl = document.createElement('label');
      lbl.innerHTML = `<input type="checkbox" name="player-modal-events" value="${ev}"> ${ev}`;
      chkGroup.appendChild(lbl);
    });

    document.getElementById('player-modal').classList.remove('hidden');
  });

  // Manual Player Save Form Submit
  document.getElementById('player-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('player-form-id').value;
    const name = document.getElementById('player-form-name').value;
    const phone = document.getElementById('player-form-phone').value;
    const gift = document.getElementById('player-form-gift').value;
    
    const checkboxes = document.querySelectorAll('input[name="player-modal-events"]:checked');
    const selectedEvents = Array.from(checkboxes).map(cb => cb.value);

    if (id) {
      // Edit
      const p = state.players.find(p => p.id === id);
      if (p) {
        p.name = name;
        p.phone = phone;
        p.events = selectedEvents;
        p.gift = gift;
      }
    } else {
      // Add
      state.players.push({
        id: 'p_' + Math.random().toString(36).substr(2, 9),
        name: name,
        phone: phone,
        events: selectedEvents,
        gift: gift,
        checkedIn: false,
        giftClaimed: false,
        lastMatchEndedAt: null
      });
    }

    document.getElementById('player-modal').classList.add('hidden');
    saveAndRender();
  });

  // Regenerate Brackets
  document.getElementById('btn-regenerate-brackets').addEventListener('click', () => {
    if (state.players.length === 0) {
      alert("選手資料庫目前無人，請先匯入或新增選手。");
      return;
    }
    
    if (confirm("重新生成各組別淘汰賽籤表會清除所有現存的比賽結果與球場調度，是否確定？")) {
      // Clear court statuses
      state.courts.forEach(c => {
        c.status = 'idle';
        c.currentMatchId = null;
      });
      state.matches = [];

      state.events.forEach(eventName => {
        const shouldShuffle = document.getElementById('setup-random-shuffle').checked;
        generateBracket(state, eventName, shouldShuffle);
      });
      saveAndRender();
      alert("已依照目前選手名單重新產生所有的淘汰賽樹狀圖籤表！");
    }
  });

  // Schedule Queue Filter Change Handler (Staff)
  document.getElementById('staff-queue-filter').addEventListener('change', () => {
    renderAll();
  });

  // Upcoming Queue Filter Change Handler (Player)
  document.getElementById('player-queue-filter').addEventListener('change', () => {
    renderAll();
  });

  // Save Court Map Configuration
  document.getElementById('btn-save-court-map').addEventListener('click', () => {
    const selects = document.querySelectorAll('.setup-court-map-select');
    const newMap = Array.from(selects).map(select => select.value || null);
    
    state.configs.courtMap = newMap;
    saveAndRender();
    alert("場地配置示意圖已成功儲存！");
  });

  // Edit / Delete Player lists in Setup View
  document.getElementById('setup-players-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const action = btn.getAttribute('data-action');
    const playerId = btn.getAttribute('data-id');
    
    if (action === 'edit-player') {
      try {
        const p = state.players.find(p => p.id === playerId);
        if (p) {
          document.getElementById('player-modal-title').innerText = '修改選手資料';
          document.getElementById('player-form-id').value = p.id;
          document.getElementById('player-form-name').value = p.name;
          document.getElementById('player-form-phone').value = p.phone || '';
          document.getElementById('player-form-gift').value = p.gift || '無';
          
          // Checkboxes
          const chkGroup = document.getElementById('player-form-events');
          chkGroup.innerHTML = '';
          const playerEvents = Array.isArray(p.events) ? p.events : [];
          (state.events || []).forEach(ev => {
            const checked = playerEvents.includes(ev) ? 'checked' : '';
            const lbl = document.createElement('label');
            lbl.innerHTML = `<input type="checkbox" name="player-modal-events" value="${ev}" ${checked}> ${ev}`;
            chkGroup.appendChild(lbl);
          });
          
          document.getElementById('player-modal').classList.remove('hidden');
        }
      } catch (err) {
        alert("修改功能發生錯誤：" + err.message);
      }
    } else if (action === 'delete-player') {
      if (confirm("確定要刪除這名選手嗎？此舉將從資料庫中移除。")) {
        try {
          // Robust deletion
          const originalLength = state.players.length;
          state.players = state.players.filter(p => p.id !== playerId);
          
          if (state.players.length < originalLength) {
            saveAndRender();
            alert("已成功從資料庫中刪除該名選手！");
          } else {
            alert("找不到該選手，或者已經被刪除了。");
          }
        } catch (err) {
          alert("刪除功能發生錯誤：" + err.message);
        }
      }
    }
  });

  // 6. Staff Panel Actions (Check-in, Auto-schedule, Manual Assign, Certificates)
  // Check-in & Gift toggles
  document.getElementById('staff-checkin-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const action = btn.getAttribute('data-action');
    const playerId = btn.getAttribute('data-id');
    const playerObj = state.players.find(p => p.id === playerId);
    
    if (!playerObj) return;

    if (action === 'toggle-checkin') {
      playerObj.checkedIn = !playerObj.checkedIn;
      if (!playerObj.checkedIn) {
        playerObj.giftClaimed = false; // reset gift if unchecked check-in
      }
      saveAndRender();
    } else if (action === 'toggle-gift') {
      playerObj.giftClaimed = !playerObj.giftClaimed;
      saveAndRender();
    }
  });

  // Search input in staff dashboard
  document.getElementById('staff-player-search').addEventListener('input', () => {
    renderStaffDashboard(state);
  });

  // Auto-schedule matches
  document.getElementById('btn-auto-schedule').addEventListener('click', () => {
    const scheduled = autoScheduleMatches(state);
    if (scheduled) {
      alert("智慧自動排程已為您分派合適賽事至空閒球場！已開啟語音召集點名。");
    } else {
      alert("目前無符合條件的待排賽事（可能尚無空閒球場，或待排選手尚未完成報到、尚在30分鐘休息時間內）。");
    }
  });

  // Manual Court assignment dropdown
  document.getElementById('staff-match-queue-tbody').addEventListener('change', (e) => {
    const select = e.target.closest('select');
    if (!select) return;
    
    const action = select.getAttribute('data-action');
    const matchId = select.getAttribute('data-match-id');
    const courtId = select.value;
    
    if (action === 'assign-court-select' && courtId) {
      const match = state.matches.find(m => m.id === matchId);
      const court = state.courts.find(c => c.id === courtId);
      
      if (match && court && court.status === 'idle') {
        match.status = 'called';
        match.courtId = court.id;
        match.calledAt = Date.now();
        
        court.status = 'occupied';
        court.currentMatchId = match.id;
        
        saveAndRender();
        alert(`已手動將此賽事分派至 ${court.name}！已開啟召集通知。`);
      }
    }
  });

  // Free/Abort match from court in Staff view
  document.getElementById('staff-court-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const action = btn.getAttribute('data-action');
    const courtId = btn.getAttribute('data-court-id');
    const matchId = btn.getAttribute('data-match-id');

    if (action === 'staff-abort-match') {
      if (confirm("確定要強行中止此場地的比賽，將賽事移回待排隊列嗎？")) {
        const court = state.courts.find(c => c.id === courtId);
        const match = state.matches.find(m => m.id === matchId);
        
        if (court) {
          court.status = 'idle';
          court.currentMatchId = null;
        }
        if (match) {
          match.status = 'scheduled';
          match.courtId = null;
          match.calledAt = null;
          match.startedAt = null;
        }
        
        saveAndRender();
      }
    }
  });

  // Winners Table - Open Certificate Modal
  let selectedCertWinner = '';
  let selectedCertRunnerUp = '';
  let selectedCertEvent = '';

  document.getElementById('staff-winners-tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const action = btn.getAttribute('data-action');
    if (action === 'open-certificate') {
      selectedCertWinner = btn.getAttribute('data-winner');
      selectedCertRunnerUp = btn.getAttribute('data-runnerup');
      selectedCertEvent = btn.getAttribute('data-event');
      
      // Load modal
      document.getElementById('certificate-modal').classList.remove('hidden');
      triggerCertificateDraw();
    }
  });

  // Certificate Controls
  const certStyleSelect = document.getElementById('cert-style');
  const certTitleInput = document.getElementById('cert-title');
  const certRankInput = document.getElementById('cert-rank');

  function triggerCertificateDraw() {
    drawCertificate(
      selectedCertWinner,
      selectedCertRunnerUp,
      selectedCertEvent,
      certTitleInput.value,
      certStyleSelect.value
    );
  }

  certStyleSelect.addEventListener('change', triggerCertificateDraw);
  certTitleInput.addEventListener('input', triggerCertificateDraw);
  certRankInput.addEventListener('input', triggerCertificateDraw);

  // Print button
  document.getElementById('btn-print-certificate').addEventListener('click', () => {
    window.print();
  });

  // Download button
  document.getElementById('btn-download-certificate').addEventListener('click', () => {
    const canvas = document.getElementById('cert-canvas');
    const image = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
    const link = document.createElement('a');
    link.download = `ACE_${selectedCertWinner}_Certificate.png`;
    link.href = image;
    link.click();
  });

  // 7. Referee view control buttons
  document.getElementById('referee-court-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const action = btn.getAttribute('data-action');
    const matchId = btn.getAttribute('data-match-id');
    const match = state.matches.find(m => m.id === matchId);
    
    if (!match) return;
    const court = state.courts.find(c => c.id === match.courtId);

    if (action === 'referee-start') {
      // Player arrived, start match
      match.status = 'live';
      match.startedAt = Date.now();
      saveAndRender();
    } else if (action === 'referee-default-prompt') {
      // Default/Walkover prompt
      const p1 = state.players.find(p => p.id === match.player1Id);
      const p2 = state.players.find(p => p.id === match.player2Id);
      
      if (!p1 || !p2) return;
      
      const opt = prompt(`請選擇未到被「判定棄賽」的選手（輸入數字）：\n1. ${p1.name}\n2. ${p2.name}\n（取消請留空或輸入其他）`);
      
      if (opt === '1' || opt === '2') {
        const defaultedPlayerId = opt === '1' ? p1.id : p2.id;
        const winnerId = opt === '1' ? p2.id : p1.id;
        
        match.status = 'defaulted';
        match.winnerId = winnerId;
        match.defaultedPlayerId = defaultedPlayerId;
        match.endedAt = Date.now();
        
        if (court) {
          court.status = 'idle';
          court.currentMatchId = null;
        }

        // Set rest end for winner (no rest really needed for default, but updates state)
        const winnerObj = state.players.find(p => p.id === winnerId);
        if (winnerObj) winnerObj.lastMatchEndedAt = match.endedAt;

        // Advance bracket
        advanceWinner(match, winnerId, state.matches);
        checkAndGenerateNextRound(state, match);
        
        saveAndRender();
        alert(`已裁定選手棄賽。獲勝者：${getPlayerNameById(state, winnerId)}。`);
      }
    } else if (action === 'referee-reset') {
      // Abort/Reset match from referee view
      if (confirm("確定要中止此球場的賽事並退回待排狀態嗎？")) {
        match.status = 'scheduled';
        match.courtId = null;
        match.calledAt = null;
        match.startedAt = null;
        
        if (court) {
          court.status = 'idle';
          court.currentMatchId = null;
        }
        saveAndRender();
      }
    } else if (action === 'referee-score-prompt') {
      // Enter Score Modal
      const p1Name = getPlayerNameById(state, match.player1Id);
      const p2Name = getPlayerNameById(state, match.player2Id);
      
      document.getElementById('score-form-match-id').value = match.id;
      document.getElementById('score-team1-name').innerText = p1Name;
      document.getElementById('score-team2-name').innerText = p2Name;
      
      // Clear previous inputs
      document.getElementById('score-s1-p1').value = '';
      document.getElementById('score-s1-p2').value = '';
      document.getElementById('score-s2-p1').value = '';
      document.getElementById('score-s2-p2').value = '';
      document.getElementById('score-s3-p1').value = '';
      document.getElementById('score-s3-p2').value = '';
      
      document.getElementById('score-modal').classList.remove('hidden');
    }
  });

  // Score Form Submit Handler
  document.getElementById('score-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const matchId = document.getElementById('score-form-match-id').value;
    const match = state.matches.find(m => m.id === matchId);
    
    if (!match) return;

    // Get input games count
    const s1p1 = parseInt(document.getElementById('score-s1-p1').value);
    const s1p2 = parseInt(document.getElementById('score-s1-p2').value);
    
    const s2p1_val = document.getElementById('score-s2-p1').value;
    const s2p2_val = document.getElementById('score-s2-p2').value;
    const s2p1 = s2p1_val !== '' ? parseInt(s2p1_val) : 0;
    const s2p2 = s2p2_val !== '' ? parseInt(s2p2_val) : 0;

    const s3p1_val = document.getElementById('score-s3-p1').value;
    const s3p2_val = document.getElementById('score-s3-p2').value;
    
    // Parse sets
    const player1Sets = [];
    const player2Sets = [];
    
    player1Sets.push(s1p1);
    player2Sets.push(s1p2);
    
    let p1SetsWon = s1p1 > s1p2 ? 1 : 0;
    let p2SetsWon = s1p2 > s1p1 ? 1 : 0;

    // Add set 2 if entered
    if (s2p1_val !== '' && s2p2_val !== '') {
      player1Sets.push(s2p1);
      player2Sets.push(s2p2);
      if (s2p1 > s2p2) p1SetsWon++;
      else if (s2p2 > s2p1) p2SetsWon++;
    }

    let supertieObj = null;
    // Add supertie / set 3 if entered
    if (s3p1_val !== '' && s3p2_val !== '') {
      const s3p1 = parseInt(s3p1_val);
      const s3p2 = parseInt(s3p2_val);
      
      supertieObj = { player1: s3p1, player2: s3p2 };
      
      if (s3p1 > s3p2) p1SetsWon++;
      else if (s3p2 > s3p1) p2SetsWon++;
    }

    // Determine overall winner
    let winnerId = null;
    if (p1SetsWon > p2SetsWon) {
      winnerId = match.player1Id;
    } else if (p2SetsWon > p1SetsWon) {
      winnerId = match.player2Id;
    } else {
      alert("警告：未分出獲勝者（雙方贏得盤數相同）。請確認比分輸入是否正確！");
      return;
    }

    // Update match
    match.status = 'completed';
    match.score = {
      player1: player1Sets,
      player2: player2Sets,
      supertie: supertieObj
    };
    match.winnerId = winnerId;
    match.endedAt = Date.now();

    // Release court
    const court = state.courts.find(c => c.id === match.courtId);
    if (court) {
      court.status = 'idle';
      court.currentMatchId = null;
    }

    // Set player rest timers
    const p1Obj = state.players.find(p => p.id === match.player1Id);
    const p2Obj = state.players.find(p => p.id === match.player2Id);
    if (p1Obj) p1Obj.lastMatchEndedAt = match.endedAt;
    if (p2Obj) p2Obj.lastMatchEndedAt = match.endedAt;

    // Advance winner in tournament
    advanceWinner(match, winnerId, state.matches);
    checkAndGenerateNextRound(state, match);
    
    // Close score modal
    document.getElementById('score-modal').classList.add('hidden');
    
    saveAndRender();
    alert(`登記成功！比分：${formatScore(match.score)}，勝出者：${getPlayerNameById(state, winnerId)}。已自動更新晉級簽表。`);
  });
}

// Helper: Get Player Name by ID
function getPlayerNameById(state, id) {
  if (!id) return '等候晉級 (TBD)';
  if (id === 'BYE') return '輪空 (BYE)';
  const p = state.players.find(p => p.id === id);
  return p ? p.name : '未知選手';
}

// Helper: Format Match Score
function formatScore(score) {
  if (!score || !score.player1 || score.player1.length === 0) return '';
  
  let setsArr = [];
  for (let i = 0; i < score.player1.length; i++) {
    setsArr.push(`${score.player1[i]}-${score.player2[i]}`);
  }
  
  let scoreStr = setsArr.join(', ');
  
  if (score.supertie && score.supertie.player1 !== undefined && score.supertie.player1 !== '') {
    scoreStr += ` [${score.supertie.player1}-${score.supertie.player2}]`;
  }
  
  return scoreStr;
}

// Run app init on load
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
