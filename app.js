/**
 * 暖色調三欄看板待辦清單 (Kanban Todo App)
 * 支援功能：
 * 1. 新增任務（工作/生活分類、指派負責人）
 * 2. 三欄看板（To-do, Process, Done）
 * 3. 原生 HTML5 拖曳（Drag and Drop）跨欄移動
 * 4. 分類篩選（全部、工作、生活）
 * 5. 瀏覽器本地儲存 (localStorage) 與即時統計
 */

(function () {
  'use strict';

  // 本地儲存鍵名
  const STORAGE_KEY = 'minimal_warm_kanban_todos';

  // 預設示範資料（溫馨直觀的看板初始預覽）
  const DEFAULT_TASKS = [
    {
      id: 'task_demo_1',
      text: '整理第四季專案規劃與重要里程碑',
      category: 'work',
      assignee: 'Alex',
      priority: 'high',
      status: 'todo',
      createdAt: Date.now() - 3600000 * 3
    },
    {
      id: 'task_demo_2',
      text: '週末採買手沖咖啡豆與新鮮麵包',
      category: 'life',
      assignee: '自己',
      priority: 'low',
      status: 'todo',
      createdAt: Date.now() - 3600000 * 2
    },
    {
      id: 'task_demo_3',
      text: '進行三欄看板介面體驗微調與測試',
      category: 'work',
      assignee: '設計組',
      priority: 'high',
      status: 'process',
      createdAt: Date.now() - 3600000 * 1
    },
    {
      id: 'task_demo_4',
      text: '晨間慢跑 3 公里並做伸展呼吸',
      category: 'life',
      assignee: '自己',
      priority: 'medium',
      status: 'done',
      createdAt: Date.now() - 3600000 * 5
    }
  ];

  // 應用程式狀態
  let tasks = [];
  let currentFilter = 'all'; // 'all' | 'work' | 'life'
  let draggedTaskId = null;

  // 優先級排序權重 (High -> Medium -> Low)
  const PRIORITY_WEIGHT = { high: 1, medium: 2, low: 3 };

  // DOM 元素快取
  const todoForm = document.getElementById('todoForm');
  const taskInput = document.getElementById('taskInput');
  const assigneeInput = document.getElementById('assigneeInput');
  const currentDateEl = document.getElementById('currentDate');

  const listTodo = document.getElementById('listTodo');
  const listProcess = document.getElementById('listProcess');
  const listDone = document.getElementById('listDone');

  const colBadgeTodo = document.getElementById('colBadgeTodo');
  const colBadgeProcess = document.getElementById('colBadgeProcess');
  const colBadgeDone = document.getElementById('colBadgeDone');

  const headerTodoCount = document.getElementById('headerTodoCount');
  const headerProcessCount = document.getElementById('headerProcessCount');
  const headerDoneCount = document.getElementById('headerDoneCount');

  const countAllEl = document.getElementById('countAll');
  const countWorkEl = document.getElementById('countWork');
  const countLifeEl = document.getElementById('countLife');

  const clearCompletedBtn = document.getElementById('clearCompletedBtn');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const dropzones = [listTodo, listProcess, listDone];

  /**
   * 初始化入口
   */
  function init() {
    setupCurrentDate();
    loadTasks();
    setupEventListeners();
    setupDragAndDrop();
    render();
  }

  /**
   * 格式化並顯示今日日期
   */
  function setupCurrentDate() {
    if (!currentDateEl) return;
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
    currentDateEl.textContent = now.toLocaleDateString('zh-TW', options);
  }

  /**
   * 從 localStorage 讀取任務，並相容舊資料結構
   */
  function loadTasks() {
    try {
      // 嘗試讀取新鍵值，若無則讀取舊版鍵值做無縫轉移
      let stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        const legacyStored = localStorage.getItem('minimal_warm_todos');
        if (legacyStored) {
          stored = legacyStored;
        }
      }

      if (stored) {
        const parsed = JSON.parse(stored);
        tasks = parsed.map(item => {
          // 向下相容處理：若缺少 status 欄位，由 completed 轉換
          if (!item.status) {
            item.status = item.completed ? 'done' : 'todo';
          }
          // 向下相容處理：預設優先級為 medium
          if (!item.priority) {
            item.priority = 'medium';
          }
          return item;
        });
      } else {
        tasks = DEFAULT_TASKS;
      }
      saveTasks();
    } catch (e) {
      console.error('無法讀取本機任務資料：', e);
      tasks = DEFAULT_TASKS;
    }
  }

  /**
   * 儲存任務至 localStorage
   */
  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      console.error('無法寫入本機任務資料：', e);
    }
  }

  /**
   * 綁定一般事件監聽
   */
  function setupEventListeners() {
    // 提交建立任務表單
    todoForm.addEventListener('submit', function (e) {
      e.preventDefault();
      handleAddTask();
    });

    // 分類篩選按鈕
    filterBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        const filter = this.getAttribute('data-filter');
        setFilter(filter);
      });
    });

    // 清除 Done 欄位已完成任務
    clearCompletedBtn.addEventListener('click', function () {
      clearDoneTasks();
    });

    // 看板區域全域點擊委派（處理卡片刪除）
    document.querySelector('.kanban-board').addEventListener('click', function (e) {
      const deleteBtn = e.target.closest('.card-delete-btn');
      if (deleteBtn) {
        const taskId = deleteBtn.getAttribute('data-id');
        deleteTask(taskId);
      }
    });
  }

  /**
   * 建立新任務（預設進入 To-do 欄位）
   */
  function handleAddTask() {
    const text = taskInput.value.trim();
    if (!text) {
      taskInput.focus();
      return;
    }

    const assignee = assigneeInput.value.trim();
    const categoryOption = document.querySelector('input[name="taskCategory"]:checked');
    const category = categoryOption ? categoryOption.value : 'work';

    const priorityOption = document.querySelector('input[name="taskPriority"]:checked');
    const priority = priorityOption ? priorityOption.value : 'medium';

    const newTask = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      text: text,
      category: category,
      assignee: assignee,
      priority: priority,
      status: 'todo',
      createdAt: Date.now()
    };

    tasks.unshift(newTask);
    saveTasks();
    render();

    // 清空輸入並回到焦點
    taskInput.value = '';
    assigneeInput.value = '';
    taskInput.focus();
  }

  /**
   * 刪除指定任務
   */
  function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    render();
  }

  /**
   * 清除所有 Done 狀態的任務
   */
  function clearDoneTasks() {
    const hasDone = tasks.some(t => t.status === 'done');
    if (!hasDone) return;

    tasks = tasks.filter(t => t.status !== 'done');
    saveTasks();
    render();
  }

  /**
   * 切換分類篩選
   */
  function setFilter(filter) {
    currentFilter = filter;
    filterBtns.forEach(btn => {
      if (btn.getAttribute('data-filter') === filter) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    render();
  }

  /**
   * 移動任務狀態並持久化
   */
  function moveTaskToStatus(taskId, targetStatus) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (task.status !== targetStatus) {
      task.status = targetStatus;
      saveTasks();
      render();
    }
  }

  /**
   * 設定拖曳放置 (Drag & Drop) 邏輯
   */
  function setupDragAndDrop() {
    dropzones.forEach(zone => {
      // 允許拖曳元素懸停放置
      zone.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this.classList.add('drag-over');
      });

      // 離開目標欄位時移除高亮
      zone.addEventListener('dragleave', function (e) {
        if (!this.contains(e.relatedTarget)) {
          this.classList.remove('drag-over');
        }
      });

      // 放下卡片至目標欄位
      zone.addEventListener('drop', function (e) {
        e.preventDefault();
        this.classList.remove('drag-over');

        const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
        const targetStatus = this.getAttribute('data-status');

        if (taskId && targetStatus) {
          moveTaskToStatus(taskId, targetStatus);
        }
      });
    });
  }

  /**
   * 為個別卡片綁定拖曳起始與結束事件
   */
  function attachCardDragEvents(cardEl) {
    cardEl.addEventListener('dragstart', function (e) {
      draggedTaskId = this.getAttribute('data-id');
      e.dataTransfer.setData('text/plain', draggedTaskId);
      e.dataTransfer.effectAllowed = 'move';

      // 延遲一點加入 dragging 樣式，避免原生拖曳殘影也是透明的
      setTimeout(() => {
        this.classList.add('dragging');
      }, 0);
    });

    cardEl.addEventListener('dragend', function () {
      this.classList.remove('dragging');
      draggedTaskId = null;
      dropzones.forEach(zone => zone.classList.remove('drag-over'));
    });
  }

  /**
   * 更新計數與概覽數據
   */
  function updateCounts() {
    const totalCount = tasks.length;
    const workCount = tasks.filter(t => t.category === 'work').length;
    const lifeCount = tasks.filter(t => t.category === 'life').length;

    const todoCount = tasks.filter(t => t.status === 'todo').length;
    const processCount = tasks.filter(t => t.status === 'process').length;
    const doneCount = tasks.filter(t => t.status === 'done').length;

    // 篩選頁籤數量
    if (countAllEl) countAllEl.textContent = totalCount;
    if (countWorkEl) countWorkEl.textContent = workCount;
    if (countLifeEl) countLifeEl.textContent = lifeCount;

    // 欄位標籤數量
    if (colBadgeTodo) colBadgeTodo.textContent = todoCount;
    if (colBadgeProcess) colBadgeProcess.textContent = processCount;
    if (colBadgeDone) colBadgeDone.textContent = doneCount;

    // 頂部概覽數量
    if (headerTodoCount) headerTodoCount.textContent = todoCount;
    if (headerProcessCount) headerProcessCount.textContent = processCount;
    if (headerDoneCount) headerDoneCount.textContent = doneCount;

    // 清除按鈕狀態
    if (clearCompletedBtn) {
      clearCompletedBtn.style.opacity = doneCount > 0 ? '1' : '0.4';
      clearCompletedBtn.style.pointerEvents = doneCount > 0 ? 'auto' : 'none';
    }
  }

  /**
   * XSS 安全字串轉義
   */
  function escapeHtml(string) {
    const div = document.createElement('div');
    div.textContent = string;
    return div.innerHTML;
  }

  /**
   * 產生單一任務卡片 HTML
   */
  function createCardHTML(task) {
    const isWork = task.category === 'work';
    const isDone = task.status === 'done';

    const categoryBadge = isWork
      ? `<span class="badge badge-work">💼 工作</span>`
      : `<span class="badge badge-life">🌿 生活</span>`;

    const assigneeBadge = task.assignee
      ? `<span class="badge badge-assignee">👤 ${escapeHtml(task.assignee)}</span>`
      : '';

    let priorityBadge = '';
    if (task.priority === 'high') {
      priorityBadge = `<span class="badge badge-prio-high" title="優先程度：高">🔥 High</span>`;
    } else if (task.priority === 'low') {
      priorityBadge = `<span class="badge badge-prio-low" title="優先程度：低">🌱 Low</span>`;
    } else {
      priorityBadge = `<span class="badge badge-prio-medium" title="優先程度：中">⚡ Med</span>`;
    }

    return `
      <div 
        class="task-card ${isDone ? 'is-done' : ''}" 
        draggable="true" 
        data-id="${task.id}"
        title="按住即可拖曳至其他欄位"
      >
        <div class="card-header-row">
          <span class="card-title">${escapeHtml(task.text)}</span>
          <button 
            type="button" 
            class="card-delete-btn" 
            data-id="${task.id}" 
            title="刪除任務"
            aria-label="刪除任務"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>

        <div class="card-footer-row">
          <div class="card-tags">
            ${priorityBadge}
            ${categoryBadge}
            ${assigneeBadge}
          </div>
          <div class="drag-indicator" title="可拖曳">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="8" cy="6" r="2"></circle>
              <circle cx="16" cy="6" r="2"></circle>
              <circle cx="8" cy="12" r="2"></circle>
              <circle cx="16" cy="12" r="2"></circle>
              <circle cx="8" cy="18" r="2"></circle>
              <circle cx="16" cy="18" r="2"></circle>
            </svg>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 依任務優先程度排序 (High -> Medium -> Low)，同優先度以最新建立排前
   */
  function sortByPriority(taskList) {
    return taskList.slice().sort((a, b) => {
      const pA = PRIORITY_WEIGHT[a.priority] || 2;
      const pB = PRIORITY_WEIGHT[b.priority] || 2;
      if (pA !== pB) {
        return pA - pB;
      }
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  /**
   * 渲染個別欄位卡片
   */
  function renderColumn(dropzone, filteredTasks, emptyIcon, emptyText) {
    if (filteredTasks.length === 0) {
      dropzone.innerHTML = `
        <div class="column-empty">
          <span class="column-empty-icon">${emptyIcon}</span>
          <span class="column-empty-text">${emptyText}</span>
        </div>
      `;
      return;
    }

    dropzone.innerHTML = filteredTasks.map(createCardHTML).join('');

    // 為渲染出來的卡片元素綁定拖曳監聽
    dropzone.querySelectorAll('.task-card').forEach(card => {
      attachCardDragEvents(card);
    });
  }

  /**
   * 主渲染函式
   */
  function render() {
    updateCounts();

    // 依目前分類（工作 / 生活）過濾任務
    let visibleTasks = tasks;
    if (currentFilter === 'work') {
      visibleTasks = tasks.filter(t => t.category === 'work');
    } else if (currentFilter === 'life') {
      visibleTasks = tasks.filter(t => t.category === 'life');
    }

    // 分流至三個欄位，並依優先程度排序 (High -> Medium -> Low)
    const todoTasks = sortByPriority(visibleTasks.filter(t => t.status === 'todo'));
    const processTasks = sortByPriority(visibleTasks.filter(t => t.status === 'process'));
    const doneTasks = sortByPriority(visibleTasks.filter(t => t.status === 'done'));

    // 渲染三個欄位
    renderColumn(listTodo, todoTasks, '📝', '尚無待辦事項');
    renderColumn(listProcess, processTasks, '⏳', '無進行中事項');
    renderColumn(listDone, doneTasks, '✨', '尚無已完成事項');
  }

  // 頁面就緒啟動
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
