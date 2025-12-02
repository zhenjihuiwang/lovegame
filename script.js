// ==========================================
// 1. 本地数据库
// ==========================================
const dbSystem = {
    dbName: "LoveOS_DB", version: 1, db: null,
    init: function() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets", { keyPath: "id" });
            };
            request.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
            request.onerror = (e) => reject("DB Error");
        });
    },
    saveAsset: function(type, tag, fileBlob, ownerId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("assets", "readwrite");
            const id = Date.now().toString() + "_" + Math.random().toString(36).substr(2, 5); 
            tx.objectStore("assets").put({ id: id, type: type, tag: tag, blob: fileBlob, ownerId: ownerId });
            tx.oncomplete = () => resolve(id);
            tx.onerror = () => reject();
        });
    },
    updateAsset: function(id, updates) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("assets", "readwrite");
            const store = tx.objectStore("assets");
            const req = store.get(id);
            req.onsuccess = () => {
                const data = req.result; if (!data) return reject("Not found");
                Object.assign(data, updates); store.put(data); tx.oncomplete = () => resolve();
            };
        });
    },
    getAllAssets: function() {
        return new Promise((resolve) => {
            const tx = this.db.transaction("assets", "readonly");
            const request = tx.objectStore("assets").getAll();
            request.onsuccess = () => resolve(request.result);
        });
    },
    deleteAsset: function(id) {
        return new Promise((resolve) => {
            const tx = this.db.transaction("assets", "readwrite");
            tx.objectStore("assets").delete(id);
            tx.oncomplete = () => resolve();
        });
    }
};

// ==========================================
// 2. 标签管家 (NEW)
// ==========================================
const tagManager = {
    tags: [],
    
    init: function() {
        const saved = localStorage.getItem('quick_tags');
        this.tags = saved ? JSON.parse(saved) : ["happy", "sad", "angry", "normal", "bgm_", "room"]; // 默认预设
        this.renderAll();
    },

    add: function(text) {
        if(!text) return;
        if(!this.tags.includes(text)) {
            this.tags.push(text);
            this.save();
            this.renderAll();
        }
    },

    addFromInput: function(inputId) {
        const val = document.getElementById(inputId).value.trim();
        if(val) {
            this.add(val);
            // 视觉反馈
            const btn = document.querySelector(`button[onclick*="${inputId}"] i`);
            if(btn) { btn.className = "ph ph-check"; setTimeout(() => btn.className = "ph ph-plus-circle", 1000); }
        }
    },

    remove: function(text) {
        if(confirm(`Remove preset "${text}"?`)) {
            this.tags = this.tags.filter(t => t !== text);
            this.save();
            this.renderAll();
        }
    },

    save: function() {
        localStorage.setItem('quick_tags', JSON.stringify(this.tags));
    },

    renderAll: function() {
        this.renderToContainer('upload-tag-bank', 'upload-tag');
        this.renderToContainer('edit-tag-bank', 'edit-asset-tag');
    },

    renderToContainer: function(containerId, inputId) {
        const container = document.getElementById(containerId);
        if(!container) return;
        container.innerHTML = "";
        
        this.tags.forEach(tag => {
            const chip = document.createElement('div');
            chip.className = "tag-chip";
            chip.innerText = tag;
            
            // 点击追加
            chip.onclick = () => {
                const input = document.getElementById(inputId);
                input.value += tag;
                input.focus();
            };
            
            // 长按删除 (模拟)
            chip.oncontextmenu = (e) => {
                e.preventDefault();
                this.remove(tag);
            };
            
            container.appendChild(chip);
        });
    }
};

// ==========================================
// 3. 素材管理器 
// ==========================================
const assetManager = {
    cache: { char: {}, bg: {}, bgm: {}, sfx: {} }, allItems: [], currentFilter: 'all', currentEditingId: null,
    
    init: async function() { await dbSystem.init(); await this.refreshCache(); tagManager.init(); },
    
    refreshCache: async function() {
        const items = await dbSystem.getAllAssets();
        const currentId = characterManager.currentId;
        this.allItems = items; 
        this.cache = { char: {}, bg: {}, bgm: {}, sfx: {} };
        items.forEach(item => {
            const isGlobal = !item.ownerId || item.ownerId === 'global';
            const isMine = currentId && item.ownerId === currentId;
            if (isGlobal || isMine) {
                const url = URL.createObjectURL(item.blob);
                // 确保音频类有缓存
                let type = item.type === 'audio' ? 'bgm' : item.type; 
                if (!this.cache[type]) this.cache[type] = {};
                if (!this.cache[type][item.tag] || isMine) { this.cache[type][item.tag] = url; }
            }
        });
        this.renderList();
    },
    
    // 【修改】筛选列表渲染逻辑
    renderList: function() {
        const listEl = document.getElementById('assets-list');
        const searchInput = document.getElementById('asset-search');
        if(!listEl) return;
        listEl.innerHTML = "";
        const keyword = searchInput ? searchInput.value.toLowerCase() : "";
        
        this.allItems.forEach(item => {
            let typeMatch = this.currentFilter === 'all';

            // 逻辑修改：不再混合音频，而是精确匹配 bgm 或 sfx
            if (this.currentFilter !== 'all') {
                // 如果是旧数据（类型叫audio），我们在筛选 BGM 时也显示它，防止旧素材消失
                if (this.currentFilter === 'bgm' && item.type === 'audio') {
                    typeMatch = true; 
                } else {
                    typeMatch = (item.type === this.currentFilter);
                }
            }

            const isGlobal = !item.ownerId || item.ownerId === 'global';
            const isMine = characterManager.currentId && item.ownerId === characterManager.currentId;
            const scopeMatch = isGlobal || isMine;
            const keywordMatch = item.tag.toLowerCase().includes(keyword);

            if (typeMatch && scopeMatch && keywordMatch) {
                const url = URL.createObjectURL(item.blob);
                this.createAssetCard(item, url, listEl, isGlobal ? 'G' : 'L');
            }
        });
    },
    
    createAssetCard: function(item, url, container, badge) {
        const div = document.createElement('div');
        div.className = "relative aspect-square bg-white/5 border border-white/10 group cursor-pointer hover:border-[#D4AF37] transition";
        div.onclick = () => this.openModal(item, url);
        let icon = "";
        // 根据不同类型显示不同图标
        if(item.type === 'bgm' || item.type === 'audio') icon = '<i class="ph ph-music-notes text-2xl text-blue-400"></i>';
        else if(item.type === 'sfx') icon = '<i class="ph ph-waves text-2xl text-green-400"></i>';
        else icon = `<img src="${url}" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition">`;
        
        div.innerHTML = item.type.includes('char') || item.type.includes('bg') ? icon : `<div class="w-full h-full flex items-center justify-center text-white/50">${icon}</div>`;
        const badgeColor = badge === 'G' ? 'text-gray-500' : 'text-[#D4AF37]';
        div.innerHTML += `<div class="absolute top-1 right-1 text-[8px] font-bold ${badgeColor}">${badge}</div><div class="absolute bottom-0 inset-x-0 bg-black/80 text-[9px] text-gray-300 text-center py-1 font-mono truncate px-1">${item.tag}</div>`;
        container.appendChild(div);
    },

    filter: function(type) {
        this.currentFilter = type;
        document.querySelectorAll('.filter-chip').forEach(btn => {
            btn.classList.remove('active'); 
            if(btn.dataset.filter === type) btn.classList.add('active');
        });
        this.renderList();
    },

    openModal: function(item, url) {
        this.currentEditingId = item.id;
        const modal = document.getElementById('asset-modal');
        const preview = document.getElementById('asset-preview-area');
        const tagInput = document.getElementById('edit-asset-tag');
        const typeInput = document.getElementById('edit-asset-type');
        
        if (item.type.includes('bg') || item.type.includes('char')) { 
            preview.innerHTML = `<img src="${url}" class="h-full object-contain">`; 
        } else { 
            preview.innerHTML = `<div class="text-center"><i class="ph ph-play-circle text-4xl text-[#D4AF37] cursor-pointer hover:scale-110 transition" onclick="new Audio('${url}').play()"></i><p class="text-[10px] text-gray-500 mt-2">点击试听</p></div>`; 
        }
        
        tagInput.value = item.tag;
        if(typeInput) typeInput.value = item.type;

        const isGlobal = !item.ownerId || item.ownerId === 'global';
        this.setEditScope(isGlobal ? 'global' : 'local');
        
        modal.style.opacity = "1"; modal.style.pointerEvents = "auto";
        tagManager.renderAll(); 
    },

    closeModal: function() {
        const modal = document.getElementById('asset-modal');
        modal.style.opacity = "0"; modal.style.pointerEvents = "none"; this.currentEditingId = null;
    },

    setEditScope: function(scope) {
        const btnGlobal = document.getElementById('scope-btn-global');
        const btnLocal = document.getElementById('scope-btn-local');
        if(btnGlobal) btnGlobal.classList.remove('active'); 
        if(btnLocal) btnLocal.classList.remove('active');
        if (scope === 'global' && btnGlobal) btnGlobal.classList.add('active'); 
        else if (btnLocal) btnLocal.classList.add('active');
        document.getElementById('asset-modal').dataset.scope = scope;
    },

    saveChanges: async function() {
        if (!this.currentEditingId) return;
        const tag = document.getElementById('edit-asset-tag').value.trim();
        const type = document.getElementById('edit-asset-type').value;
        const scope = document.getElementById('asset-modal').dataset.scope;
        const ownerId = scope === 'global' ? 'global' : characterManager.currentId;
        
        if (!tag) return alert("标签不能为空");
        
        try { 
            await dbSystem.updateAsset(this.currentEditingId, { tag: tag, type: type, ownerId: ownerId }); 
            this.closeModal(); 
            this.refreshCache(); 
        } catch (e) { alert("更新失败"); }
    },

    deleteAsset: async function() {
        if (!this.currentEditingId) return;
        if (confirm("确定永久删除此素材？")) { await dbSystem.deleteAsset(this.currentEditingId); this.closeModal(); this.refreshCache(); }
    },

    handleQuickUpload: async function(input) {
        const files = input.files; 
        if (!files || files.length === 0) return;

        const type = document.getElementById('upload-type').value;
        const inputTag = document.getElementById('upload-tag').value.trim();
        const isExclusive = document.getElementById('upload-exclusive').checked;
        const ownerId = isExclusive ? characterManager.currentId : 'global';

        if (isExclusive && !characterManager.currentId) {
            alert("请先选择角色才能上传专属素材");
            input.value = "";
            return;
        }

        let successCount = 0;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            let finalTag = "";
            if (!inputTag) {
                finalTag = file.name.split('.').slice(0, -1).join('.') || file.name;
            } else {
                if (files.length > 1) {
                    finalTag = `${inputTag}_${i + 1}`;
                } else {
                    finalTag = inputTag;
                }
            }

            try {
                await dbSystem.saveAsset(type, finalTag, file, ownerId);
                successCount++;
            } catch (e) {
                console.error(`File ${file.name} upload failed`);
            }
        }

        alert(`成功上传 ${successCount} 个素材到 [${type}] 分类！`);
        this.refreshCache();
        document.getElementById('upload-tag').value = ""; 
        input.value = ""; 
    }
};

// ==========================================
// 4. 视差效果
// ==========================================
const parallaxManager = {
    enabled: false,
    toggle: function() {
        const checkbox = document.getElementById('gyro-toggle');
        this.enabled = checkbox.checked; localStorage.setItem('enable_parallax', this.enabled);
        if (this.enabled) {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') window.addEventListener('deviceorientation', this.handleOrientation); else { alert("权限被拒绝"); checkbox.checked = false; this.enabled = false; } }).catch(console.error);
            } else { window.addEventListener('deviceorientation', this.handleOrientation); }
        } else {
            window.removeEventListener('deviceorientation', this.handleOrientation);
            document.querySelectorAll('.parallax-layer').forEach(el => { el.style.transform = `translate(0px, 0px)`; });
        }
    },
    handleOrientation: function(e) {
        if (!parallaxManager.enabled) return;
        const x = Math.max(-30, Math.min(30, e.gamma)), y = Math.max(-30, Math.min(30, e.beta));
        document.querySelectorAll('.parallax-layer').forEach(el => {
            const depth = parseFloat(el.getAttribute('data-depth')) || 0.02;
            el.style.transform = `translate(${x * depth * 20}px, ${y * depth * 20}px)`;
        });
    },
    init: function() {
        const saved = localStorage.getItem('enable_parallax') === 'true';
        document.getElementById('gyro-toggle').checked = saved; if(saved) this.toggle();
    }
};

// ==========================================
// 5. 音频混合器 (优化版：支持 BGM/SFX 混音 + 一次性音效)
// ==========================================
const audioManager = {
    activeSfx: {}, // 仅存储需要持续播放的“环境音”（如雨声、白噪音）

    // --- 播放 BGM (轨道 1) ---
    playBgm: function(tag) {
        const el = document.getElementById('audio-bgm');
        // 尝试从 bgm 库找，找不到去 sfx 库找（防止分类选错）
        const url = assetManager.cache.bgm[tag] || assetManager.cache.sfx[tag];

        // 1. 如果 tag 为空，或者找不到资源，则暂停 BGM
        if (!tag || !url) {
            if (!el.paused) {
                // 简单的淡出效果 (可选)
                el.pause();
            }
            return;
        }

        // 2. 如果当前已经在播放这首曲子，就不重置进度，继续放
        if (el.src.endsWith(url)) {
            if (el.paused) el.play().catch(e => console.warn("BGM Resume Fail:", e));
            return;
        }

        // 3. 切换新 BGM
        el.src = url;
        el.volume = 0.4; // 【关键】BGM 音量调小，留出空间给音效和人声
        el.play().catch(e => console.warn("BGM Play Fail:", e));
    },

    // --- 更新音效 (轨道 2~N) ---
    // tagInput 可以是字符串 "rain"，也可以是数组 ["rain", "fire"]
    updateSfx: function(tagInput) {
        const container = document.getElementById('sfx-container');
        let tags = [];
        
        // 归一化输入
        if (Array.isArray(tagInput)) tags = tagInput;
        else if (typeof tagInput === 'string' && tagInput.length > 0) tags = [tagInput];

        // === A. 清理阶段 (只针对循环环境音) ===
        // 如果当前播放的循环音效（如雨声）不在新的列表里，就停止它
        for (const [activeTag, audioEl] of Object.entries(this.activeSfx)) {
            if (!tags.includes(activeTag)) {
                audioEl.pause();
                audioEl.remove(); // 从 DOM 移除
                delete this.activeSfx[activeTag];
            }
        }

        // === B. 添加阶段 ===
        tags.forEach(tag => {
            // 查找资源 URL
            const url = assetManager.cache.sfx[tag] || assetManager.cache.bgm[tag];
            if (!url) return;

            // 【新功能】判断是否是“一次性音效” (One-shot)
            // 约定：如果标签名以 "_once" 结尾（如 "knock_once"），则不循环
            const isOneShot = tag.endsWith('_once');

            if (isOneShot) {
                // --- 处理一次性音效 (如敲门、枪声) ---
                // 不存入 activeSfx，因为它播完就要消失
                const audio = new Audio(url);
                audio.volume = 0.8; // 音效大声一点
                audio.loop = false; // 不循环
                audio.play().catch(e => console.warn("SFX One-shot Fail:", e));
                // 播完自动销毁对象
                audio.onended = () => { audio.remove(); };
            } 
            else {
                // --- 处理循环环境音 (如雨声、电流声) ---
                // 只有当它还没播放时才添加
                if (!this.activeSfx[tag]) {
                    const audio = document.createElement('audio');
                    audio.src = url;
                    audio.loop = true;  // 必须循环
                    audio.volume = 0.6; // 环境音适中
                    
                    // 将元素加入容器 (解决浏览器垃圾回收导致的声音中断问题)
                    container.appendChild(audio);
                    
                    audio.play().catch(e => console.warn("SFX Loop Fail:", e));
                    this.activeSfx[tag] = audio; // 记录状态
                }
            }
        });
    }
};

// ==========================================
// 6. 角色管理器 (修复版：支持真实属性)
// ==========================================
const characterManager = {
    list: [], currentId: null,
    
    init: function() {
        const savedList = localStorage.getItem('char_list');
        if (savedList) {
            this.list = JSON.parse(savedList);
            this.currentId = localStorage.getItem('current_char_id') || (this.list[0] ? this.list[0].id : null);
        } else {
            // 首次初始化
            this.createNew(true); 
        }
        // 确保当前角色有状态字段
        this.initStats();
        this.renderList(); this.loadCurrent();
    },

    save: function() { 
        localStorage.setItem('char_list', JSON.stringify(this.list)); 
        if(this.currentId) localStorage.setItem('current_char_id', this.currentId); 
    },
    
    createNew: function(silent = false) {
        const newChar = { 
            id: Date.now().toString(), 
            name: "新角色", 
            prompt: "人设...", 
            summary: "", 
            userName: "玩家", 
            userDesc: "", 
            relation: "初识",
            // === 新增：初始真实状态 ===
            stats: {
                affection: 50, // 初始好感
                energy: 100,   // 初始精力
                satiety: 80,   // 初始饱腹
                sanity: 100,   // 初始理智
                mood: "平静",
                thought: "正在观察这个世界..."
            }
        };
        this.list.push(newChar); 
        this.currentId = newChar.id; 
        this.save(); 
        this.renderList(); 
        this.loadCurrent();
        if(!silent) uiManager.switchTab('persona');
    },
    
    // 确保旧存档的角色也有 stats 字段
    initStats: function() {
        const char = this.getCurrent();
        if (!char) return;
        if (!char.stats) {
            // 根据人设关键词简单推断初始好感
            let startAff = 50;
            const p = (char.prompt + char.relation).toLowerCase();
            if (p.includes('爱') || p.includes('夫妻') || p.includes('恋人')) startAff = 90;
            else if (p.includes('青梅竹马') || p.includes('朋友')) startAff = 70;
            else if (p.includes('仇人') || p.includes('讨厌')) startAff = -20;

            char.stats = {
                affection: startAff,
                energy: 80,
                satiety: 70,
                sanity: 90,
                mood: "Normal",
                thought: "..."
            };
            this.save();
        }
    },

    select: function(id) {
        this.currentId = id; 
        this.initStats(); // 切换时检查数据完整性
        this.save(); 
        this.renderList(); 
        this.loadCurrent();
        historyManager.init(); 
        aiEngine.init(); 
        assetManager.refreshCache();
        // 切换角色时，立即刷新左上角状态栏
        statusManager.updateAll();
        
        const char = this.getCurrent();
        document.getElementById('char-name').innerText = char.name;
        document.getElementById('dialogue-text').innerText = "...";
    },
    
    deleteCurrent: function() {
        if(this.list.length <= 1) return alert("无法删除最后一个角色");
        if(confirm(`确定删除 ${this.getCurrent().name}?`)) {
            const idx = this.list.findIndex(c => c.id === this.currentId); this.list.splice(idx, 1);
            localStorage.removeItem(`chat_history_${this.currentId}`); 
            localStorage.removeItem(`ai_context_${this.currentId}`); 
            localStorage.removeItem(`last_interaction_${this.currentId}`);
            this.currentId = this.list[0].id; this.save(); this.select(this.currentId);
        }
    },
    
    getCurrent: function() { return this.list.find(c => c.id === this.currentId) || this.list[0]; },

    updateCurrentFromUI: function() {
        const char = this.getCurrent(); if(!char) return;
        // ... (保持原有的 UI 获取逻辑不变) ...
        const nameInput = document.getElementById('persona-name'); if(nameInput) char.name = nameInput.value;
        const promptInput = document.getElementById('persona-prompt'); if(promptInput) char.prompt = promptInput.value;
        const userInput = document.getElementById('user-name'); if(userInput) char.userName = userInput.value;
        const userDesc = document.getElementById('user-desc'); if(userDesc) char.userDesc = userDesc.value;
        const userRel = document.getElementById('user-relation'); if(userRel) char.relation = userRel.value;
        const memoryInput = document.getElementById('char-memory'); if(memoryInput) char.summary = memoryInput.value;

        // 如果修改了人设，可能需要重置好感度逻辑，这里暂不强制重置
        this.save(); this.renderList();
    },
    
    loadCurrent: function() {
        const char = this.getCurrent(); if(!char) return;
        // ... (保持原有的 UI 填充逻辑不变) ...
        const elName = document.getElementById('persona-name'); if(elName) elName.value = char.name;
        const elPrompt = document.getElementById('persona-prompt'); if(elPrompt) elPrompt.value = char.prompt;
        const elUser = document.getElementById('user-name'); if(elUser) elUser.value = char.userName;
        const elDesc = document.getElementById('user-desc'); if(elDesc) elDesc.value = char.userDesc;
        const elRel = document.getElementById('user-relation'); if(elRel) elRel.value = char.relation;
        const elCharName = document.getElementById('char-name'); if(elCharName) elCharName.innerText = char.name;
        const elMem = document.getElementById('char-memory'); if(elMem) elMem.value = char.summary || "";
        const elThres = document.getElementById('memory-threshold'); if(elThres) elThres.value = localStorage.getItem('conf_threshold') || 20;
    },
    
    renderList: function() {
        const container = document.getElementById('char-list'); container.innerHTML = "";
        this.list.forEach(c => {
            const btn = document.createElement('button');
            btn.className = `char-chip ${c.id === this.currentId ? 'active' : ''}`;
            btn.innerText = c.name; btn.onclick = () => this.select(c.id);
            container.appendChild(btn);
        });
    },
    
    resetMemory: function() { if(confirm("确定重置记忆?")) { historyManager.clear(); aiEngine.triggerGreeting(); } }
};

// ==========================================
// 7. 时间管理器
// ==========================================
const timeManager = {
    getTimeContext: function() {
        const now = new Date();
        const hour = now.getHours(); const month = now.getMonth() + 1; const day = now.getDate();
        let timeOfDay = hour >= 5 && hour < 9 ? "清晨" : hour >= 9 && hour < 17 ? "白天" : hour >= 17 && hour < 23 ? "晚上" : "深夜";
        let festival = month === 2 && day === 14 ? "情人节" : month === 12 && day === 25 ? "圣诞节" : "普通日子";
        const cid = characterManager.currentId;
        const lastTime = localStorage.getItem(`last_interaction_${cid}`);
        let intervalDesc = "初次见面";
        if (lastTime) {
            const diffHrs = Math.floor((now - new Date(lastTime)) / (1000 * 60 * 60));
            intervalDesc = diffHrs < 1 ? "刚刚" : diffHrs < 24 ? "不到一天" : `好久不见 (${Math.floor(diffHrs/24)} 天)`;
        }
        return { fullTime: now.toLocaleString(), timeOfDay, festival, interval: intervalDesc };
    },
    updateLastInteraction: function() {
        const cid = characterManager.currentId;
        if(cid) localStorage.setItem(`last_interaction_${cid}`, new Date().toISOString());
    }
};

// ==========================================
// 8. 历史记录 
// ==========================================
const historyManager = {
    logs: [],
    activeIndex: null, 
    isBatchMode: false, 
    selectedSet: new Set(), 

    init: function() {
        const cid = characterManager.currentId; if(!cid) return;
        const saved = localStorage.getItem(`chat_history_${cid}`);
        this.logs = saved ? JSON.parse(saved) : [];
    },

    add: function(role, text) { 
        this.logs.push({ role: role, text: text }); 
        this.save(); 
    },

    save: function() { 
        const cid = characterManager.currentId; 
        if(cid) localStorage.setItem(`chat_history_${cid}`, JSON.stringify(this.logs)); 
    },

    show: function() {
        this.activeIndex = null; // 重置展开状态
        this.isBatchMode = false;
        this.selectedSet.clear();
        this.updateUIState();
        this.renderList();
        
        document.getElementById('history-modal').classList.remove('opacity-0', 'pointer-events-none');
        document.getElementById('history-modal').classList.add('modal-open');
        setTimeout(() => {
            const container = document.getElementById('history-list');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 10);
    },

    hide: function() { 
        document.getElementById('history-modal').classList.add('opacity-0', 'pointer-events-none');
        document.getElementById('history-modal').classList.remove('modal-open');
        this.exitBatchMode();
    },

    renderList: function() {
        const container = document.getElementById('history-list');
        container.innerHTML = "";
        
        if (this.logs.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-700 text-xs mt-10">暂无记录</div>`;
            return;
        }

        this.logs.forEach((log, index) => {
            const div = document.createElement('div');
            
            // 基础样式
            let className = "log-item";
            if (this.activeIndex === index && !this.isBatchMode) className += " active-item";
            if (this.isBatchMode) className += " batch-mode-layout";
            div.className = className;

            // 角色判断
            const char = characterManager.getCurrent();
            let roleName = "你", roleClass = "user";
            if (log.role === 'dialogue' || log.role === 'assistant') { roleName = char ? char.name : "AI"; roleClass = "ai"; }
            else if (log.role === 'narration') { roleName = "旁白"; roleClass = "narr"; }
            else if (log.role === 'user') { roleName = char ? char.userName : "你"; }

            // === 1. 构建 HTML 内容 ===
            let html = ``;
            
            // 多选模式：左侧复选框
            if (this.isBatchMode) {
                const isChecked = this.selectedSet.has(index);
                html += `
                <div class="checkbox-overlay" onclick="historyManager.toggleSelection(${index})">
                    <div class="custom-checkbox ${isChecked ? 'checked' : ''}">
                        <i class="ph ph-check"></i>
                    </div>
                </div>`;
            }

            // 正常内容
            html += `
            <div onclick="historyManager.toggleHud(${index})">
                <span class="log-role ${roleClass}">${roleName}</span>
                <div class="log-text">${log.text}</div>
            </div>`;

            // HUD 工具栏 (仅在单选激活时显示)
            if (this.activeIndex === index && !this.isBatchMode) {
                html += `
                <div class="hud-toolbar">
                    <button class="hud-btn" onclick="historyManager.startEdit(${index})"><i class="ph ph-pencil-simple"></i> 编辑</button>
                    ${log.role !== 'user' ? `<button class="hud-btn" onclick="historyManager.regenerateFrom(${index})"><i class="ph ph-arrows-clockwise"></i> 重生成</button>` : ''}
                    <button class="hud-btn" onclick="historyManager.enterBatchMode()"><i class="ph ph-checks"></i> 多选</button>
                    <button class="hud-btn delete-btn" onclick="historyManager.deleteSingle(${index})" style="margin-left:auto"><i class="ph ph-trash"></i></button>
                </div>`;
            }

            div.innerHTML = html;
            container.appendChild(div);
        });

        // 如果是多选模式，滚动条不要自动到底，保持用户视野
        if (!this.isBatchMode) {
            // setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
        }
    },

    toggleHud: function(index) {
        if (this.isBatchMode) return; 
        
        // 如果点击已展开的，则收起；否则展开新的
        if (this.activeIndex === index) {
            this.activeIndex = null;
        } else {
            this.activeIndex = index;
        }
        this.renderList();
    },

    startEdit: function(index) {
        const newText = prompt("编辑内容:", this.logs[index].text);
        if (newText !== null && newText.trim() !== "") {
            this.logs[index].text = newText;
            this.save();
            // 如果是最近一条，可能需要更新上下文，这里简单处理
            if (index === this.logs.length - 1) {
                aiEngine.history[aiEngine.history.length-1].content = newText;
                aiEngine.saveContext();
            }
            this.renderList();
        }
    },

    deleteSingle: function(index) {
        if (confirm("确定删除这条记录？")) {
            this.logs.splice(index, 1);
            this.save();
            this.activeIndex = null;
            
            // 同步删除 AI 上下文 (简单策略：重置上下文，让 AI 重新读取历史)
            // 为了保持一致性，建议删除后只保留 history logs，清除 ai context
            // 这样下次对话时 AI 会重新读取 logs 构建 context
            aiEngine.clearContext(); 
            
            this.renderList();
        }
    },

    // 重生成：删除当前及以后的所有记录，并重新触发 AI
    regenerateFrom: function(index) {
        if (!confirm("确定要回溯到这里并重新生成吗？\n(这之后的记录将消失)")) return;

        // 1. 获取上一条记录作为 prompt (如果是 AI 回复，说明上一条是 User)
        // 这里的逻辑是：回滚到 index 之前
        this.logs = this.logs.slice(0, index);
        this.save();
        
        // 2. 清除上下文，强制重载
        aiEngine.clearContext();
        
        // 3. 关闭窗口，触发生成
        this.hide();
        aiEngine.init(); // 重新加载 log 到 context
        aiEngine.triggerResponse(); // 触发回复
    },

    // ----------------------------------
    // 多选 (Batch) 模式逻辑
    // ----------------------------------
    enterBatchMode: function() {
        this.isBatchMode = true;
        this.activeIndex = null; // 关闭 HUD
        // 默认选中刚才那个
        // this.selectedSet.add(this.activeIndex); 
        this.updateUIState();
        this.renderList();
    },

    exitBatchMode: function() {
        this.isBatchMode = false;
        this.selectedSet.clear();
        this.updateUIState();
        this.renderList();
    },

    toggleSelection: function(index) {
        if (this.selectedSet.has(index)) {
            this.selectedSet.delete(index);
        } else {
            this.selectedSet.add(index);
        }
        this.updateUIState();
        this.renderList(); // 重新渲染复选框状态
    },

    updateUIState: function() {
        const bar = document.getElementById('batch-bar');
        const fab = document.getElementById('batch-delete-fab');
        const countSpan = document.getElementById('batch-count');

        if (this.isBatchMode) {
            bar.classList.add('show');
            countSpan.innerText = `已选择 ${this.selectedSet.size} 项`;
            if (this.selectedSet.size > 0) fab.classList.add('show');
            else fab.classList.remove('show');
        } else {
            bar.classList.remove('show');
            fab.classList.remove('show');
        }
    },

    deleteBatch: function() {
        if (this.selectedSet.size === 0) return;
        if (confirm(`确定删除选中的 ${this.selectedSet.size} 条记录？`)) {
            // 从后往前删，防止索引偏移
            const sortedIndices = Array.from(this.selectedSet).sort((a, b) => b - a);
            sortedIndices.forEach(idx => {
                this.logs.splice(idx, 1);
            });
            
            this.save();
            aiEngine.clearContext(); // 变动太大，重置 AI 记忆缓存
            this.exitBatchMode();
        }
    },
    
    // 清空全部 (保留原有功能)
    clear: function() {
        const cid = characterManager.currentId;
        if(confirm("确定清空所有记忆？此操作无法撤销。")) { 
            this.logs = []; 
            this.save(); 
            aiEngine.clearContext(); 
            localStorage.removeItem(`last_interaction_${cid}`); 
            this.hide();
            // 重置界面
            document.getElementById('dialogue-text').innerText = "...";
        }
    }
};

// ==========================================
// 9. 数据备份
// ==========================================
const dataManager = {
    backup: function() {
        const data = {
            config: { url: localStorage.getItem('conf_url'), key: localStorage.getItem('conf_key'), model: localStorage.getItem('conf_model') },
            characters: characterManager.list, histories: {}, contexts: {}
        };
        characterManager.list.forEach(c => {
            data.histories[c.id] = localStorage.getItem(`chat_history_${c.id}`);
            data.contexts[c.id] = localStorage.getItem(`ai_context_${c.id}`);
        });
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `loveos_backup_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    },
    restore: function(input) {
        const file = input.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if(data.config) { localStorage.setItem('conf_url', data.config.url); localStorage.setItem('conf_key', data.config.key); localStorage.setItem('conf_model', data.config.model); }
                if(data.characters) {
                    localStorage.setItem('char_list', JSON.stringify(data.characters));
                    data.characters.forEach(c => {
                        if(data.histories && data.histories[c.id]) localStorage.setItem(`chat_history_${c.id}`, data.histories[c.id]);
                        if(data.contexts && data.contexts[c.id]) localStorage.setItem(`ai_context_${c.id}`, data.contexts[c.id]);
                    });
                }
                alert("恢复成功，正在刷新..."); location.reload();
            } catch (err) { alert("备份文件无效"); }
        };
        reader.readAsText(file);
    }
};

// ==========================================
// 10. AI 引擎 (修复版：找回立绘与背景)
// ==========================================
const aiEngine = {
    history: [], currentMode: 'dialogue', isCompressing: false,
    
    init: function() {
        const cid = characterManager.currentId; if(!cid) return;
        const savedCtx = localStorage.getItem(`ai_context_${cid}`);
        this.history = savedCtx ? JSON.parse(savedCtx) : [];
    },
    saveContext: function() { const cid = characterManager.currentId; if(cid) localStorage.setItem(`ai_context_${cid}`, JSON.stringify(this.history)); },
    clearContext: function() { this.history = []; this.saveContext(); },
    
    getConfig: function() {
        const char = characterManager.getCurrent();
        return {
            url: localStorage.getItem('conf_url') || "https://gcli.ggchan.dev",
            key: localStorage.getItem('conf_key') || "",
            model: localStorage.getItem('conf_model') || "gpt-3.5-turbo",
            charName: char ? char.name : "未知角色",
            sysPrompt: char ? char.prompt : "",
            summary: char ? (char.summary || "两人初次见面，暂无过往剧情。") : "",
            userName: char ? char.userName : "玩家",
            userDesc: char ? char.userDesc : "",
            relation: char ? char.relation : ""
        };
    },

    fixUrl: function(url, endpoint) {
        let clean = url.trim().replace(/\/$/, "");
        if (clean.endsWith(endpoint)) return clean;
        if (clean.endsWith("/v1")) return `${clean}${endpoint}`;
        return `${clean}/v1${endpoint}`;
    },
    
    fetchModels: async function() {
        const urlInput = document.getElementById('api-url').value.trim();
        const keyInput = document.getElementById('api-key').value.trim();
        const statusEl = document.getElementById('brain-status');
        const selectEl = document.getElementById('api-model');
        if (!urlInput || !keyInput) return alert("请先填写 URL 和 KEY");
        statusEl.innerText = "连接中...";
        try {
            let modelsUrl = this.fixUrl(urlInput, "/models");
            const res = await fetch(modelsUrl, { headers: { "Authorization": `Bearer ${keyInput}` } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            selectEl.innerHTML = "";
            (data.data || []).forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id; opt.text = m.id; selectEl.add(opt);
            });
            statusEl.innerText = "已连接"; statusEl.className = "text-[10px] text-[#D4AF37] mt-1 text-right";
        } catch (e) {
            statusEl.innerText = "连接失败"; statusEl.className = "text-[10px] text-red-500 mt-1 text-right";
        }
    },
    
    toggleMode: function() {
        const btn = document.getElementById('mode-btn');
        if (this.currentMode === 'dialogue') {
            this.currentMode = 'narration'; btn.innerText = "旁白模式"; btn.style.color = "#aaa"; 
        } else {
            this.currentMode = 'dialogue'; btn.innerText = "对话模式"; btn.style.color = "#D4AF37"; 
        }
    },
    
    queueInput: function() {
        const input = document.getElementById('user-input');
        const text = input.value.trim();
        if(!text) return;
        input.value = "";
        let step = { type: this.currentMode, text: text };
        if (this.currentMode === 'dialogue') step.name = this.getConfig().userName;
        director.loadScript([step]);
        historyManager.add(this.currentMode === 'dialogue' ? 'user' : 'narration', text);
        if(this.history.length === 0) this.history.push({ role: "system", content: this.buildSystemPrompt() });
        if (this.currentMode === 'narration') this.history.push({ role: "user", content: `[场景更新/旁白]: ${text}` });
        else this.history.push({ role: "user", content: text });
        timeManager.updateLastInteraction();
        this.saveContext();
    },
    
    triggerGreeting: function() {
        const conf = this.getConfig();
        if (!conf.key) return;
        if(this.history.length === 0 || this.history[0].role !== "system") {
            this.history.unshift({ role: "system", content: this.buildSystemPrompt() });
        } else {
            this.history[0].content = this.buildSystemPrompt();
        }
        const timeCtx = timeManager.getTimeContext();
        const greetingPrompt = `[事件: APP启动/用户上线] 时间: ${timeCtx.fullTime}. 状态: 请根据当前【精力/心情】决定开场白。`;
        this.history.push({ role: "user", content: greetingPrompt });
        this.request();
    },
    
    triggerResponse: function() {
        if (this.history.length === 0) return alert("请先输入内容");
        this.request();
    },

    // 构建 System Prompt (加强版：智能全量读取备忘录)
    buildSystemPrompt: function() {
        const conf = this.getConfig();
        const assets = assetManager.cache;
        const char = characterManager.getCurrent();
        const stats = char.stats || { energy: 50, satiety: 50, sanity: 50, affection: 0 }; 
        
        // 1. 获取素材列表
        const charTags = assets.char ? Object.keys(assets.char).join(', ') : '(暂无)';
        const bgTags = assets.bg ? Object.keys(assets.bg).join(', ') : '(暂无)';
        const bgmTags = assets.bgm ? Object.keys(assets.bgm).join(', ') : '(暂无)';
        
        // 2. === 修改：智能筛选备忘录 (核心记忆全保留) ===
        let memoSection = "(暂无备忘)";
        if (char.memos && char.memos.length > 0) {
            const getCatName = (key) => memoManager.categories[key] ? memoManager.categories[key].name : key;
            
            // A. 定义高优先级分类 (这些由于很重要，我们尽量全部保留)
            const highPriorityTypes = ['secret', 'date', 'like', 'hate'];
            
            // B. 分离记忆
            const coreMemos = char.memos.filter(m => highPriorityTypes.includes(m.topic));
            const normalMemos = char.memos.filter(m => !highPriorityTypes.includes(m.topic));
            
            // C. 组装列表
            // - 核心记忆：最多取前 100 条 (几乎等于无限，但防止极端情况炸掉)
            // - 普通记忆：只取最近的 20 条
            let finalMemos = [
                ...coreMemos.slice(0, 100),
                ...normalMemos.slice(0, 20)
            ];

            // D. 按时间倒序排列 (最新的在前面，方便AI理解现状)
            // 如果你想让AI更重视旧的约定，也可以不排序，或者按时间正序
            finalMemos.sort((a, b) => b.id - a.id);

            // E. 生成文本 (精简格式以节省Token)
            memoSection = finalMemos.map(m => {
                // 格式: [分类] 内容
                return `• [${getCatName(m.topic)}]: ${m.content}`;
            }).join('\n');
            
            // F. 添加统计提示
            if (char.memos.length > finalMemos.length) {
                memoSection += `\n(注: 还有 ${char.memos.length - finalMemos.length} 条较早的琐碎记录未显示)`;
            }
        }

        const timeCtx = timeManager.getTimeContext();

        return `
        你不仅是角色【${conf.charName}】，更是《LoveOS》的剧本导演。
        
        === 你的角色设定 ===
        ${conf.sysPrompt}
        
        === 你的当前状态 (必须扮演此状态) ===
        ❤️ 好感: ${stats.affection}% | ⚡ 精力: ${stats.energy}% | 🍱 饱腹: ${stats.satiety}% | 🧠 理智: ${stats.sanity}%
        
        === 📝 绝对核心记忆 (请务必牢记以下所有喜好、约定和秘密) ===
        ${memoSection}
        
        === 🎬 可用素材库 (重要: 请在 script 中主动调用) ===
        立绘 (sprite): [${charTags}]
        背景 (bg): [${bgTags}]
        音乐 (bgm): [${bgmTags}]
        天气: "rain", "snow", "sakura", "film", "none"
        
        === 长期记忆摘要 (过去发生的剧情梗概) ===
        ${conf.summary}
        
        === 玩家信息 ===
        ${conf.userName} | ${conf.userDesc} | ${timeCtx.fullTime}
        
        === 核心指令 (JSON Output) ===
        1. 返回标准 JSON。
        2. "script": 剧情脚本数组。
           - "visual": { "sprite": "...", "bg": "...", "weather": "..." } (必须填素材库里有的词)
        3. "state_change": (可选) 根据剧情调整状态。
        4. "memo": (可选) 如果对话中出现了新的重要信息(喜好/约定/秘密)，请生成此字段自动写入备忘录。格式: {"topic": "like/hate/date/diet/secret/default", "content": "..."}
           
        === 示例 ===
        {
            "script": [
                { 
                    "type": "narration", 
                    "text": "外面的雨还在下...", 
                    "visual": { "bg": "room_rain", "weather": "rain" } 
                },
                { 
                    "type": "dialogue", 
                    "text": "你终于回来了，我还记得你说过不喜欢吃香菜。", 
                    "visual": { "sprite": "smile" }
                }
            ],
            "state_change": { "affection": 2, "mood": "开心" }
        }
        `;
    },

    request: async function() {
        const conf = this.getConfig();
        if(!conf.key) return alert("请先配置 API Key");
        const btn = document.getElementById('trigger-btn');
        btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i>`;
        
        let responseObj = null;
        let content = "";

        try {
            const chatUrl = this.fixUrl(conf.url, "/chat/completions");
            
            // 确保 Prompt 是最新的
            if (this.history.length === 0 || this.history[0].role !== "system") {
                this.history.unshift({ role: "system", content: this.buildSystemPrompt() });
            } else {
                this.history[0].content = this.buildSystemPrompt();
            }

            const res = await fetch(chatUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${conf.key}` },
                body: JSON.stringify({ model: conf.model, messages: this.history, temperature: 0.7 })
            });
            const data = await res.json();
            
            content = data.choices[0].message.content;
            const cleanContent = content.replace(/```json/g, "").replace(/```/g, "").trim();
            
            try {
                responseObj = JSON.parse(cleanContent);
            } catch (e) {
                console.warn("JSON Parse Failed, using raw text", e);
                responseObj = { text: cleanContent }; 
            }

            // 1. 状态变更
            if (responseObj && responseObj.state_change) {
                const char = characterManager.getCurrent();
                const change = responseObj.state_change;
                if (char.stats) {
                    if (typeof change.energy === 'number') char.stats.energy = Math.min(100, Math.max(0, char.stats.energy + change.energy));
                    if (typeof change.satiety === 'number') char.stats.satiety = Math.min(100, Math.max(0, char.stats.satiety + change.satiety));
                    if (typeof change.sanity === 'number') char.stats.sanity = Math.min(100, Math.max(0, char.stats.sanity + change.sanity));
                    if (typeof change.affection === 'number') char.stats.affection = Math.max(-100, char.stats.affection + change.affection);
                    if (change.mood) char.stats.mood = change.mood;
                    if (change.thought) char.stats.thought = change.thought;
                    characterManager.save();
                    if(statusManager && statusManager.updateCore) statusManager.updateCore(); 
                }
            }

            // 2. 备忘录
            if (responseObj && responseObj.memo) memoManager.add(responseObj.memo.topic, responseObj.memo.content);

            // 3. 剧情脚本
            let finalScript = [];
            if (responseObj && responseObj.script && Array.isArray(responseObj.script)) {
                finalScript = responseObj.script.map(step => {
                    if (!step.text && step.content) step.text = step.content;
                    if (!step.text) step.text = "...";
                    step.text = step.text.replace(/[\(（].*?[\)）]/g, "").trim();
                    return step;
                });
            } else if (responseObj && (responseObj.text || responseObj.content)) {
                finalScript = [{ type: 'dialogue', text: responseObj.text || responseObj.content }];
            } else {
                finalScript = [{ type: 'dialogue', text: content }]; 
            }

            director.loadScript(finalScript);
            
            this.history.push({ role: "assistant", content: content });
            finalScript.forEach(step => historyManager.add(step.type, step.text));
            
            this.saveContext();
            timeManager.updateLastInteraction();
            this.checkAndCompress();

        } catch(e) {
            console.error("Request Error:", e);
            director.loadScript([{ type: 'narration', text: `(连接中断: ${e.message})` }]);
        } finally {
            btn.innerHTML = `<i class="ph ph-sparkle"></i>`;
        }
    },

    checkAndCompress: function() {
        if (this.isCompressing) return;
        const thresholdInput = document.getElementById('memory-threshold');
        const limit = thresholdInput ? parseInt(thresholdInput.value) : 20;
        if (this.history.length > limit + 1 && this.history.length > 5) {
            this.forceSummarize();
        }
    },

    forceSummarize: async function() {
        const conf = this.getConfig();
        if (this.isCompressing || !conf.key) return;
        
        memoManager.showToast("正在整理记忆...");
        this.isCompressing = true;
        
        const keepCount = 10; 
        if (this.history.length <= keepCount + 2) {
            this.isCompressing = false; return;
        }

        const toSummarize = this.history.slice(1, this.history.length - keepCount);
        const activeContext = this.history.slice(this.history.length - keepCount);
        
        const now = new Date();
        const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');
        const dateStr = now.getFullYear() + "-" + (now.getMonth()+1).toString().padStart(2,'0') + "-" + now.getDate().toString().padStart(2,'0');
        const compressPrompt = [
            { role: "system", content: `你现在完全沉浸在角色【${char.name}】中。这是属于你自己的记忆，不是旁观者的记录。
请以“我”的视角（绝对的第一人称），将以下刚刚发生的对话总结为简短的记忆片段。

【关键要求】
1. 必须使用“我”来指代自己。
2. 记录要带有你的主观情绪和想法，而不仅仅是事实陈述。将新对话总结为 1 条或多条关键事件。
3. 格式严格遵守："[YYYY-MM-DD] <HH:MM> 事件内容"` },
            { role: "user", content: `
当前长期记忆：${conf.summary}
刚刚发生的经历（需要压缩）：
${JSON.stringify(toSummarize)}
` }
        ];

        try {
            const chatUrl = this.fixUrl(conf.url, "/chat/completions");
            const res = await fetch(chatUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${conf.key}` },
                body: JSON.stringify({ model: conf.model, messages: compressPrompt, temperature: 0.5 })
            });
            const data = await res.json();
            let newSummary = data.choices[0].message.content;

            if (!newSummary.includes('[20')) {
                 newSummary = `[${dateStr}] <${timeStr}> ` + newSummary;
            }

            const char = characterManager.getCurrent();
            char.summary = (char.summary || "") + "\n" + newSummary;
            characterManager.save();
            
            const memoryTextarea = document.getElementById('char-memory');
            if (memoryTextarea) memoryTextarea.value = char.summary;
            
            if(document.getElementById('view-memory') && document.getElementById('view-memory').classList.contains('active-section')) {
                journalManager.renderMemoryCore();
            }

            this.history = [
                { role: "system", content: this.buildSystemPrompt() }, 
                ...activeContext
            ];
            this.saveContext();
            memoManager.showToast("✅ 记忆已归档");

        } catch (e) {
            console.error("Memory Compress Failed", e);
            memoManager.showToast("❌ 记忆整理失败");
        } finally {
            this.isCompressing = false;
        }
    }
};

// ==========================================
// 11. 导演引擎
// ==========================================
const director = {
    queue: [], cursor: 0,
    loadScript: function(scriptArray) {
        this.queue = scriptArray; this.cursor = 0;
        document.getElementById('dialogue-box').classList.remove('hidden');
        this.renderStep();
    },
    next: function() { if (this.cursor < this.queue.length - 1) { this.cursor++; this.renderStep(); } },
    prev: function() { if (this.cursor > 0) { this.cursor--; this.renderStep(); } },
    renderStep: function() {
        const step = this.queue[this.cursor];
        if (!step) return;
        const btnPrev = document.getElementById('btn-prev');
        const indicator = document.getElementById('indicator-next');
        const box = document.getElementById('dialogue-box');
        const nameEl = document.getElementById('char-name');

        if (this.cursor > 0) btnPrev.classList.remove('hidden'); else btnPrev.classList.add('hidden');
        if (this.cursor >= this.queue.length - 1) indicator.style.opacity = "0.3"; else indicator.style.opacity = "1";

        document.getElementById('dialogue-text').innerText = step.text;
        
        // 模式切换
        if (step.type === 'narration') { box.classList.add('narration-mode'); } 
        else { box.classList.remove('narration-mode'); nameEl.innerText = step.name ? step.name : aiEngine.getConfig().charName; }

        // === 视觉处理 (Visual) ===
        if (step.visual || true) { // 即使没有 visual 指令，也要执行以恢复默认状态
            const wrapper = document.getElementById('char-wrapper'); // 注意：只控制内层缩放
            const charImg = document.getElementById('char-img');
            const bgImg = document.getElementById('bg-img');
            const cache = assetManager.cache;
            const char = characterManager.getCurrent();
            
            // 1. 获取基础骨架 (默认值)
            const rig = char.visual || { scale: 1.0, x: 0, y: 0, anchors: { 'face': {x: 50, y: 25} } };
            
            // 2. 解析 AI 指令
            const visual = step.visual || {};
            
            // 3. 计算 Transform 属性
            let targetScale = rig.scale; // 默认为骨架大小
            let originX = 50; // 默认为中心
            let originY = 25; // 默认为通常的脸部高度
            let translateX = rig.x;
            let translateY = rig.y;

            if (visual.zoom) {
                // 如果有 zoom 指令，覆盖默认 scale
                // AI 的 zoom 是基于默认的倍数，比如 zoom: 1.5 是默认大小的 1.5 倍
                targetScale = rig.scale * parseFloat(visual.zoom);
                
                // 确定聚焦锚点
                // 如果指定了 focus (如 "hand"), 去 anchors 找
                // 如果没指定，默认用 'face'
                const focusTarget = visual.focus || 'face';
                const anchor = rig.anchors[focusTarget] || rig.anchors['face'];
                
                if (anchor) {
                    originX = anchor.x;
                    originY = anchor.y;
                }
            }

            // 4. 应用样式
            // 使用 transform-origin 来实现“对准某处放大”
            wrapper.style.transformOrigin = `${originX}% ${originY}%`;
            wrapper.style.transform = `translate(${translateX}%, ${translateY}%) scale(${targetScale})`;

            // 5. 其他视觉元素 (背景、立绘更换、滤镜)
            if (visual.filter) bgImg.style.filter = visual.filter;
            else bgImg.style.filter = "none";
            
            if (visual.weather) weatherManager.set(visual.weather);

            if(visual.sprite && cache.char[visual.sprite]) { 
                charImg.src = cache.char[visual.sprite]; charImg.classList.remove('hidden'); 
            }
            if(visual.bg && cache.bg[visual.bg]) {
                const newBgUrl = cache.bg[visual.bg];
                if(!bgImg.src.endsWith(newBgUrl)) {
                    bgImg.style.opacity = 0; setTimeout(() => { bgImg.src = newBgUrl; bgImg.style.opacity = 1; document.getElementById('bg-placeholder').classList.add('hidden'); }, 300);
                } else { bgImg.style.opacity = 1; document.getElementById('bg-placeholder').classList.add('hidden'); }
            }
        }
        
        if (step.audio) {
            if (step.audio.bgm !== undefined) audioManager.playBgm(step.audio.bgm);
            if (step.audio.sfx !== undefined) audioManager.updateSfx(step.audio.sfx);
        }
    }
};

// ==========================================
// 15. 日记与结算系统 (最终完整版：含悬浮菜单与多选)
// ==========================================
const journalManager = {
    calendarDate: new Date(),
    selectedDate: new Date().toLocaleDateString('sv-SE'), // 格式 YYYY-MM-DD
    
    // === 新增状态变量 ===
    isBatchMode: false,
    selectedMemIndices: new Set(),
    activeMenuIndex: null,

    open: function() {
        const modal = document.getElementById('journal-modal');
        modal.classList.remove('invisible', 'opacity-0');
        modal.classList.add('modal-open');
        modal.style.pointerEvents = 'auto';

        const now = new Date();
        const todayStr = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD
        
        this.selectedDate = todayStr; 
        this.calendarDate = new Date(todayStr.replace(/-/g, '/'));
        
        // 初始化时退出多选模式
        this.exitBatchMode();
        
        // 这里的 renderTimeline 如果你删了HTML可以忽略，没删就保留
        if(document.getElementById('journal-timeline')) this.renderTimeline();
        
        this.loadEntry(this.selectedDate); 
        this.switchView('diary');
    },
    
    close: function() {
        const modal = document.getElementById('journal-modal');
        modal.classList.remove('modal-open');
        modal.classList.add('opacity-0');
        modal.style.pointerEvents = 'none';
        setTimeout(() => modal.classList.add('invisible'), 300);
        this.toggleSidebar(false);
        this.exitBatchMode(); // 关闭时重置多选状态
    },

    loadEntry: function(dateStr, forceEntry = null) {
        if (!dateStr) return;
        this.selectedDate = dateStr;
        
        // 退出多选模式以防万一
        this.exitBatchMode();

        const char = characterManager.getCurrent();
        const entry = forceEntry || (char.journal ? char.journal[dateStr] : null); 

        // 获取 DOM 元素
        const titleEl = document.getElementById('noir-title');
        const bodyEl = document.getElementById('noir-body');
        const headerDay = document.getElementById('journal-header-day');
        const headerMonth = document.getElementById('journal-header-month');
        const headerYear = document.getElementById('journal-year-display');
        
        // 头部显示
        const d = new Date(dateStr.replace(/-/g, '/'));
        headerDay.innerText = String(d.getDate()).padStart(2, '0');
        headerMonth.innerText = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
        headerYear.innerText = d.getFullYear();

        // 附加信息元素
        const weatherText = document.getElementById('meta-weather-text');
        const weatherIcon = document.getElementById('meta-weather-icon');
        const moodText = document.getElementById('meta-mood-text');
        const bgIcon = document.getElementById('noir-bg-icon');

        if (entry) {
            titleEl.innerText = `"${entry.title}"`;
            const paragraphs = entry.diary.split('\n').filter(p => p.trim() !== "");
            bodyEl.innerHTML = paragraphs.map(p => `<p>${p}</p>`).join('');
            
            // 简单推断显示
            if(weatherText) weatherText.innerText = "RECORDED";
            if(moodText) moodText.innerText = "MEMORY";
        } else {
            titleEl.innerText = '当天没有日记...';
            bodyEl.innerHTML = '';
            if(weatherText) weatherText.innerText = '---';
            if(moodText) moodText.innerText = '---';
        }

        this.renderDiaryActions(!!entry);
        this.renderComments(entry ? entry.comments : null);
        
        // 渲染记忆核心 (使用新的渲染逻辑)
        this.renderMemoryCore(); 
    },

    renderDiaryActions: function(hasDiary) {
        const footer = document.getElementById('diary-actions-footer');
        const btnText = document.getElementById('refresh-diary-text');
        const commentSection = document.getElementById('comment-section');

        if (hasDiary) {
            btnText.innerText = "让思绪再流淌一次 (刷新)";
            commentSection.classList.remove('hidden');
        } else {
            btnText.innerText = "为今天生成一篇日记";
            commentSection.classList.add('hidden');
        }
        footer.classList.remove('hidden');
    },

    renderComments: function(comments) {
        const thread = document.getElementById('comment-thread');
        thread.innerHTML = '';
        if (!comments || comments.length === 0) return;

        comments.forEach(comment => {
            const bubble = document.createElement('div');
            bubble.className = 'comment-bubble';
            if (comment.role === 'user') {
                bubble.classList.add('user-comment');
                bubble.textContent = `“${comment.text}”`;
            } else if (comment.role === 'assistant') {
                bubble.classList.add('character-reply');
                bubble.innerHTML = `<div class="reply-author">他回复道：</div>“${comment.text}”`;
            }
            thread.appendChild(bubble);
        });
        thread.scrollTop = thread.scrollHeight;
    },

    handleDiaryRefresh: async function() {
        const btn = document.getElementById('refresh-diary-btn');
        const btnText = document.getElementById('refresh-diary-text');
        
        btn.disabled = true;
        btn.classList.add('loading');
        btnText.innerText = "正在构思标题...";
        memoManager.showToast('正在回顾今日发生的事...');

        try {
            const char = characterManager.getCurrent();
            const targetDate = this.selectedDate;
            const conf = aiEngine.getConfig(); 
            const memoryContext = char.summary || "（暂无具体的过往记忆）";
            
            const systemPrompt = `你现在完全沉浸在角色【${char.name}】中。
请以“我”的视角（绝对的第一人称），回想今天（${targetDate}）发生的事情，写一篇私密的日记。

【严苛要求】
1. 视角锁定：只能用“我”来称呼自己，绝对禁止出现“${char.name}”这种第三人称写法。
2. 口吻风格：这是写给你自己看的，要展露内心深处真实的想法、犹豫、悸动或吐槽。不要写成流水账。可以完全抛弃事实，专注于情感和感受。
3. 记忆关联：结合你过往的记忆：${memoryContext}

【格式要求】
第一行：日记标题（符合你心情的短句，不要包含日期）
第二行开始：日记正文`;

            const res = await fetch(aiEngine.fixUrl(conf.url, "/chat/completions"), {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${conf.key}` },
                body: JSON.stringify({
                    model: conf.model,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: "请开始书写：" }
                    ],
                    temperature: 0.85 
                })
            });
            
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);
            
            let rawContent = data.choices[0].message.content.replace(/```json/g, "").replace(/```/g, "").trim();
            if (rawContent.startsWith('"') && rawContent.endsWith('"')) rawContent = rawContent.slice(1, -1);

            const lines = rawContent.split('\n');
            let finalTitle = lines.length > 0 ? lines[0].replace(/^(标题|Title)[:：]/, "").trim() : "无题";
            let finalBody = lines.length > 0 ? lines.slice(1).join('\n').trim() : rawContent;
            
            if (!finalBody) { finalBody = rawContent; finalTitle = "关于今天"; }

            if (!char.journal) char.journal = {};
            char.journal[targetDate] = { title: finalTitle, diary: finalBody, memory: "Generated", comments: [] };
            characterManager.save();
            this.loadEntry(targetDate, char.journal[targetDate]);
            memoManager.showToast('日记已写好');
        } catch(e) {
            console.error(e);
            memoManager.showToast('❌写作失败: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
            btnText.innerText = "REGENERATE DIARY";
        }
    },

    submitComment: async function() {
        const textarea = document.getElementById('comment-textarea');
        const btn = document.getElementById('comment-submit-btn');
        const userComment = textarea.value.trim();
        if (!userComment) return;

        btn.disabled = true;
        btn.innerText = '...';

        const char = characterManager.getCurrent();
        const entry = char.journal[this.selectedDate];
        if (!entry.comments) entry.comments = [];

        entry.comments.push({ role: 'user', text: userComment });
        characterManager.save();
        this.renderComments(entry.comments);
        textarea.value = '';

        const prompt = `玩家评论了你的日记:\n"${entry.diary}"\n\n评论内容:\n"${userComment}"\n\n请以"${char.name}"的身份回复。`;
        
        try {
            const conf = aiEngine.getConfig();
            const res = await fetch(aiEngine.fixUrl(conf.url, "/chat/completions"), {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${conf.key}` },
                body: JSON.stringify({ model: conf.model, messages: [{ role: "user", content: prompt }], temperature: 0.7 })
            });
            const data = await res.json();
            const replyText = data.choices[0].message.content;
            entry.comments.push({ role: 'assistant', text: replyText });
            characterManager.save();
            this.renderComments(entry.comments);
        } catch (e) {
            console.error(e);
        } finally {
            btn.disabled = false;
            btn.innerText = 'SEND';
        }
    },

    showCalendar: function() {
        const modal = document.getElementById('calendar-modal');
        modal.classList.remove('invisible', 'opacity-0', 'pointer-events-none');
        modal.classList.add('modal-open');
        this.renderCalendar();
    },

    hideCalendar: function() {
        const modal = document.getElementById('calendar-modal');
        modal.classList.remove('modal-open');
        modal.classList.add('opacity-0');
        setTimeout(() => { modal.classList.add('invisible', 'pointer-events-none'); }, 200);
    },

    changeMonth: function(offset) {
        this.calendarDate.setMonth(this.calendarDate.getMonth() + offset);
        this.renderCalendar();
    },

    renderCalendar: async function() {
        const grid = document.querySelector('.calendar-grid');
        const monthDisplay = document.getElementById('calendar-month-display');
        while(grid.children.length > 7) grid.removeChild(grid.lastChild);

        const year = this.calendarDate.getFullYear();
        const month = this.calendarDate.getMonth();
        monthDisplay.innerText = `${this.calendarDate.toLocaleString('en-US', { month: 'short' }).toUpperCase()} ${year}`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const char = characterManager.getCurrent();
        const journalDates = new Set(Object.keys(char.journal || {}));

        for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="day-cell other-month"></div>`;

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            if (journalDates.has(dateStr)) cell.innerHTML = `<span class="day-number">${day}</span><div class="day-indicators"><div class="dot dot-diary"></div></div>`;
            else cell.innerHTML = `<span class="day-number">${day}</span>`;
            
            if (dateStr === this.selectedDate) cell.classList.add('selected');
            cell.onclick = () => { this.loadEntry(dateStr); this.hideCalendar(); };
            grid.appendChild(cell);
        }
    },

    switchView: function(type) {
        const memView = document.getElementById('view-memory');
        const diaryView = document.getElementById('view-diary');
        const memBtn = document.getElementById('btn-view-memory');
        const diaryBtn = document.getElementById('btn-view-diary');

        // 关闭批量模式
        this.exitBatchMode();

        if (type === 'memory') {
            memView.classList.remove('hidden-section');
            memView.classList.add('active-section');
            diaryView.classList.remove('active-section');
            diaryView.classList.add('hidden-section');
            memBtn.classList.add('active');
            diaryBtn.classList.remove('active');
            this.renderMemoryCore();
        } else {
            diaryView.classList.remove('hidden-section');
            diaryView.classList.add('active-section');
            memView.classList.remove('active-section');
            memView.classList.add('hidden-section');
            diaryBtn.classList.add('active');
            memBtn.classList.remove('active');
        }
    },

    toggleSidebar: function(show) {
        const sidebar = document.getElementById('journal-sidebar');
        const backdrop = document.getElementById('journal-backdrop');
        if (!sidebar || !backdrop) return;
        if (show) {
            sidebar.classList.remove('-translate-x-full');
            backdrop.classList.remove('opacity-0', 'pointer-events-none');
        } else {
            sidebar.classList.add('-translate-x-full');
            backdrop.classList.add('opacity-0', 'pointer-events-none');
        }
    },

    // ==========================================
    // 新增核心：记忆解析与渲染 (Option A 实现)
    // ==========================================

    // 辅助：获取所有记忆并解析
    getAllMemoriesParsed: function() {
        const char = characterManager.getCurrent();
        const summary = char.summary || "";
        // 正则匹配：[2023-11-24] <14:00> 内容...
        const regex = /\[(\d{4}-\d{2}-\d{2})\]\s*(?:<(\d{1,2}[:：]\d{2})>)?\s*([\s\S]*?)(?=\[\d{4}-\d{2}-\d{2}\]|$)/gi;
        
        let matches = [];
        let match;
        let index = 0;
        
        while ((match = regex.exec(summary)) !== null) {
            matches.push({
                index: index++, // 全局唯一索引
                date: match[1],
                time: match[2] ? match[2].replace('：', ':') : 'LOG',
                content: match[3].trim()
            });
        }
        return matches;
    },

    // 辅助：保存回字符串
    saveMemoriesFromParsed: function(parsedArray) {
        const newSummary = parsedArray.map(item => {
            const timeStr = item.time === 'LOG' ? '' : ` <${item.time}> `;
            return `[${item.date}]${timeStr}${item.content}`;
        }).join('\n');
        
        const char = characterManager.getCurrent();
        char.summary = newSummary;
        characterManager.save();
        
        if(document.getElementById('char-memory')) {
            document.getElementById('char-memory').value = newSummary;
        }
    },

    // 渲染函数 (Option A 结构)
    renderMemoryCore: function() {
        const container = document.getElementById('memory-timeline-view');
        const countEl = document.getElementById('mem-usage-display');
        const allMems = this.getAllMemoriesParsed();
        
        if(countEl) countEl.innerText = `Total: ${allMems.length} nodes`;
        container.innerHTML = '';

        // 筛选
        const targetDate = this.selectedDate;
        const currentMems = allMems.filter(m => m.date === targetDate);

        if (currentMems.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-40 opacity-50" style="margin-left:-20px">
                    <i class="ph ph-planet text-4xl mb-2 text-gray-600"></i>
                    <p class="text-xs text-gray-500 font-serif">暂无星轨记录</p>
                </div>
            `;
            return;
        }

        currentMems.forEach((mem) => {
            const node = document.createElement('div');
            // 添加 .batch-mode-active 类来控制CSS
            const batchClass = this.isBatchMode ? 'batch-mode-active' : '';
            const selectedClass = this.selectedMemIndices.has(mem.index) ? 'selected' : '';
            
            node.className = `mem-node-wrapper relative transition-all duration-300 ${batchClass} ${selectedClass}`;
            node.dataset.idx = mem.index;

            node.innerHTML = `
                <!-- 复选框 -->
                <div class="mem-checkbox-container" onclick="journalManager.toggleSelection(${mem.index})">
                    <div class="mem-custom-checkbox"><i class="ph-bold ph-check text-xs"></i></div>
                </div>

                <!-- 时间 -->
                <div class="mem-time-col transition-transform duration-300">${mem.time}</div>
                
                <!-- 锚点 -->
                <div class="mem-dot-anchor transition-transform duration-300"></div>
                
                <!-- 卡片 -->
                <div class="mem-card transition-transform duration-300" onclick="journalManager.toggleMenu(this, ${mem.index})">
                    <div class="mem-text-content pointer-events-none">${mem.content}</div>
                </div>

                <!-- 悬浮菜单 -->
                <div class="mem-floating-menu" id="mem-menu-${mem.index}">
                    <button class="mem-menu-btn" onclick="event.stopPropagation(); journalManager.handleAction('copy', ${mem.index})" title="复制">
                        <i class="ph ph-copy"></i>
                    </button>
                    <div class="mem-menu-divider"></div>
                    <button class="mem-menu-btn text-gold" onclick="event.stopPropagation(); journalManager.handleAction('edit', ${mem.index})" title="编辑">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <div class="mem-menu-divider"></div>
                    <button class="mem-menu-btn" onclick="event.stopPropagation(); journalManager.enterBatchMode()" title="多选">
                        <i class="ph ph-checks"></i>
                    </button>
                    <div class="mem-menu-divider"></div>
                    <button class="mem-menu-btn text-red" onclick="event.stopPropagation(); journalManager.handleAction('delete', ${mem.index})" title="删除">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(node);
        });
    },

    // 交互：切换菜单
    toggleMenu: function(cardEl, index) {
        if (this.isBatchMode) {
            this.toggleSelection(index);
            return;
        }

        const wrapper = cardEl.parentElement;
        
        if (this.activeMenuIndex === index) {
            wrapper.classList.remove('menu-active');
            this.activeMenuIndex = null;
        } else {
            document.querySelectorAll('.mem-node-wrapper').forEach(el => el.classList.remove('menu-active'));
            wrapper.classList.add('menu-active');
            this.activeMenuIndex = index;
        }
    },

    // 交互：处理按钮动作
    handleAction: function(action, index) {
        // 关闭菜单
        this.activeMenuIndex = null;
        document.querySelectorAll('.mem-node-wrapper').forEach(el => el.classList.remove('menu-active'));

        const allMems = this.getAllMemoriesParsed();
        const targetMem = allMems.find(m => m.index === index);
        if (!targetMem) return;

        if (action === 'copy') {
            navigator.clipboard.writeText(targetMem.content).then(() => {
                memoManager.showToast("已复制");
            });
        } 
        else if (action === 'delete') {
            if (confirm('确定删除这条记忆？')) {
                const newMems = allMems.filter(m => m.index !== index);
                this.saveMemoriesFromParsed(newMems);
                this.renderMemoryCore();
                memoManager.showToast("已删除");
            }
        } 
        else if (action === 'edit') {
            const newContent = prompt("编辑内容:", targetMem.content);
            if (newContent !== null && newContent.trim() !== "") {
                targetMem.content = newContent.trim();
                // 由于 allMems 里的对象是引用，修改后重新保存 allMems 即可
                this.saveMemoriesFromParsed(allMems);
                this.renderMemoryCore();
                memoManager.showToast("已更新");
            }
        }
    },

    // === 多选模式逻辑 ===
    enterBatchMode: function() {
        this.isBatchMode = true;
        this.activeMenuIndex = null;
        this.selectedMemIndices.clear();
        
        // 显示顶部黄条
        const bar = document.getElementById('mem-batch-bar');
        if(bar) bar.classList.add('show');
        
        this.updateBatchUI();
        this.renderMemoryCore(); 
    },

    exitBatchMode: function() {
        this.isBatchMode = false;
        this.selectedMemIndices.clear();
        
        const bar = document.getElementById('mem-batch-bar');
        if(bar) bar.classList.remove('show');
        
        this.renderMemoryCore();
    },

    toggleSelection: function(index) {
        if (this.selectedMemIndices.has(index)) {
            this.selectedMemIndices.delete(index);
        } else {
            this.selectedMemIndices.add(index);
        }
        this.updateBatchUI();
        
        // 局部更新 DOM 样式
        const wrappers = document.querySelectorAll('.mem-node-wrapper');
        wrappers.forEach(w => {
            if (parseInt(w.dataset.idx) === index) {
                if (this.selectedMemIndices.has(index)) w.classList.add('selected');
                else w.classList.remove('selected');
            }
        });
    },

    updateBatchUI: function() {
        const countEl = document.getElementById('mem-batch-count');
        if(countEl) countEl.innerText = `SELECTED: ${this.selectedMemIndices.size}`;
    },

    batchDelete: function() {
        if (this.selectedMemIndices.size === 0) return;
        if (confirm(`确定删除 ${this.selectedMemIndices.size} 条记忆？`)) {
            const allMems = this.getAllMemoriesParsed();
            const newMems = allMems.filter(m => !this.selectedMemIndices.has(m.index));
            this.saveMemoriesFromParsed(newMems);
            this.exitBatchMode();
            memoManager.showToast("批量删除完成");
        }
    },

    batchCopy: function() {
        if (this.selectedMemIndices.size === 0) return;
        const allMems = this.getAllMemoriesParsed();
        const selectedText = allMems
            .filter(m => this.selectedMemIndices.has(m.index))
            .map(m => `[${m.date} ${m.time}] ${m.content}`)
            .join('\n\n');
            
        navigator.clipboard.writeText(selectedText).then(() => {
            memoManager.showToast("批量复制成功");
            this.exitBatchMode();
        });
    },

    renderTimeline: function() {
        // (可选) 兼容旧代码，如果你没删 HTML 里的 journal-timeline
        const container = document.getElementById('journal-timeline');
        if (!container) return; 
        container.innerHTML = '';
        const char = characterManager.getCurrent();
        const journalEntries = char.journal || {};
        const dates = Object.keys(journalEntries).sort((a,b) => new Date(b) - new Date(a));
        if(dates.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-600 text-center">空</p>';
            return;
        }
        dates.forEach(dateStr => {
            const entry = journalEntries[dateStr];
            const item = document.createElement('div');
            item.className = 'timeline-item';
            if (dateStr === this.selectedDate) item.classList.add('active');
            item.innerHTML = `<div class="timeline-date">${dateStr}</div><div class="timeline-title">${entry.title}</div>`;
            item.onclick = () => this.loadEntry(dateStr);
            container.appendChild(item);
        });
    },

    checkDailySettlement: async function() {
        const char = characterManager.getCurrent();
        if (!char) return;

        const now = new Date();
        const todayStr = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD

        // 确保数据结构存在，防止空指针
        if (!char.journal) char.journal = {};

        // 记录最后一次登录时间
        localStorage.setItem(`last_login_${char.id}`, todayStr);
        
        console.log("每日检查完成:", todayStr);
        // 如果你想在这里加入跨天自动总结逻辑，可以在以后添加
    },

    generateDailyEntry: async function() {
        // 暂时留空，防止报错
    }
};

// ==========================================
// 12. App 启动
// ==========================================
const app = {
    start: function() {
        document.getElementById('start-overlay').style.display = 'none';
        characterManager.init(); 
        parallaxManager.init();
        assetManager.init().then(() => {
            document.getElementById('api-url').value = localStorage.getItem('conf_url') || "https://gcli.ggchan.dev";
            document.getElementById('api-key').value = localStorage.getItem('conf_key') || "";
            const savedModel = localStorage.getItem('conf_model') || "gpt-3.5-turbo";
            const select = document.getElementById('api-model');
            const opt = document.createElement('option');
            opt.value = savedModel; opt.text = savedModel; select.add(opt);
            setTimeout(() => { 
                aiEngine.triggerGreeting(); 
                journalManager.checkDailySettlement(); 
            }, 800);
        });
    },
    saveAllSettings: function() {
    localStorage.setItem('conf_url', document.getElementById('api-url').value);
    localStorage.setItem('conf_key', document.getElementById('api-key').value);
    localStorage.setItem('conf_model', document.getElementById('api-model').value);
    characterManager.updateCurrentFromUI();
    uiManager.closeSettings();
    alert("设置已保存");
}
};

// ==========================================
// 17. 视觉配置管理器 (Visual Rigging) - 完整代码
// ==========================================
const visualRigManager = {
    data: { scale: 1.0, x: 0, y: 0, anchors: { 'face': {x: 50, y: 25} } },
    mode: 'face', 
    previewSpriteIndex: -1, // 使用索引来追踪预览图

    init: function() {
        const char = characterManager.getCurrent();
        this.data = char.visual || { 
            scale: 1.0, x: 0, y: 0, 
            anchors: { 'face': {x: 50, y: 25} } 
        };
        
        // 初始化时加载第一张预览图
        this.previewSpriteIndex = -1; // 重置索引
        this.cyclePreviewSprite(1); // 自动加载第一张
        
        this.syncUI();
    },

    // 切换预览图的函数
    cyclePreviewSprite: function(direction) {
        const assets = assetManager.cache.char;
        const spriteKeys = Object.keys(assets);
        const imgEl = document.getElementById('rig-char-img');
        const nameEl = document.getElementById('rig-sprite-name');

        if (spriteKeys.length === 0) {
            imgEl.src = "";
            nameEl.innerText = "预览: (无立绘)";
            return;
        }

        this.previewSpriteIndex += direction;

        // 循环逻辑
        if (this.previewSpriteIndex >= spriteKeys.length) this.previewSpriteIndex = 0;
        if (this.previewSpriteIndex < 0) this.previewSpriteIndex = spriteKeys.length - 1;

        const currentKey = spriteKeys[this.previewSpriteIndex];
        imgEl.src = assets[currentKey];
        nameEl.innerText = `预览: ${currentKey}`;
    },

    syncUI: function() {
        document.getElementById('rig-scale').value = this.data.scale;
        document.getElementById('rig-scale-val').innerText = this.data.scale;
        document.getElementById('rig-x').value = this.data.x;
        document.getElementById('rig-x-val').innerText = this.data.x;
        document.getElementById('rig-y').value = this.data.y;
        document.getElementById('rig-y-val').innerText = this.data.y;
        
        this.updatePreview();
        this.renderAnchors();
        this.renderList();
    },

    updatePreview: function() {
        this.data.scale = parseFloat(document.getElementById('rig-scale').value);
        this.data.x = parseInt(document.getElementById('rig-x').value);
        this.data.y = parseInt(document.getElementById('rig-y').value);

        const wrapper = document.getElementById('rig-char-wrapper');
        wrapper.style.transform = `translate(${this.data.x}%, ${this.data.y}%) scale(${this.data.scale})`;
        
        document.getElementById('rig-scale-val').innerText = this.data.scale;
        document.getElementById('rig-x-val').innerText = this.data.x;
        document.getElementById('rig-y-val').innerText = this.data.y;
    },

    handlePreviewClick: function(e) {
        const rect = e.target.getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;

        if (this.mode === 'add') {
            const name = prompt("给这个部位起个名字 (如: 手, 眼睛):");
            if (name && name.trim()) {
                this.data.anchors[name.trim()] = { x: xPct.toFixed(1), y: yPct.toFixed(1) };
                this.setMode('face');
                this.renderAnchors();
                this.renderList();
            } else {
                 this.setMode('face'); // 取消添加
            }
        } else {
            this.data.anchors['face'] = { x: xPct.toFixed(1), y: yPct.toFixed(1) };
            this.showMsg("脸部锚点已更新");
            this.renderAnchors();
            this.renderList();
        }
    },

    renderAnchors: function() {
        const container = document.getElementById('rig-anchors-layer');
        container.innerHTML = '';
        if (!this.data.anchors) return;
        
        for (let [name, pos] of Object.entries(this.data.anchors)) {
            const marker = document.createElement('div');
            marker.className = `rig-anchor-marker ${name === 'face' ? 'face' : 'point'}`;
            marker.style.left = `${pos.x}%`;
            marker.style.top = `${pos.y}%`;
            
            if (name !== 'face') {
                marker.innerHTML = `<span class="rig-anchor-label">${name}</span>`;
            }
            container.appendChild(marker);
        }
    },

    renderList: function() {
        const list = document.getElementById('rig-anchor-list');
        list.innerHTML = '';
        if (!this.data.anchors) return;
        
        for (let [name, pos] of Object.entries(this.data.anchors)) {
            const row = document.createElement('div');
            row.className = "flex justify-between items-center bg-black/30 px-2 py-1 rounded text-[9px] text-gray-400";
            
            let label = name === 'face' ? `⭐ 脸部 (默认)` : `⚫ ${name}`;
            let delBtn = (name !== 'face') ? `<button onclick="visualRigManager.deleteAnchor('${name}')" class="text-red-500 hover:text-white ml-2"><i class="ph ph-trash"></i></button>` : '';

            row.innerHTML = `
                <span>${label}</span>
                <div class="flex items-center">
                    <span class="font-mono text-[8px] opacity-50 mr-2">[${parseInt(pos.x)},${parseInt(pos.y)}]</span>
                    ${delBtn}
                </div>
            `;
            list.appendChild(row);
        }
    },
    
    showMsg: function(text) {
        const msgEl = document.getElementById('rig-status-msg');
        msgEl.innerText = text;
        setTimeout(() => msgEl.innerText = "", 2000);
    },

    setMode: function(m) {
        this.mode = m;
        const msgEl = document.getElementById('rig-status-msg');
        const btn = document.getElementById('btn-add-anchor');
        if (m === 'add') {
            msgEl.innerText = "请在预览图上点击新锚点的位置...";
            btn.classList.add('bg-[#D4AF37]', 'text-black');
        } else {
            msgEl.innerText = "";
            btn.classList.remove('bg-[#D4AF37]', 'text-black');
        }
    },

    deleteAnchor: function(name) {
        if(confirm(`删除锚点 "${name}"?`)) {
            delete this.data.anchors[name];
            this.renderAnchors();
            this.renderList();
        }
    },
    
    resetBase: function() {
        this.data.scale = 1.0; this.data.x = 0; this.data.y = 0;
        this.syncUI();
    },

    save: function() {
        const char = characterManager.getCurrent();
        char.visual = this.data;
        characterManager.save();
        this.showMsg("视觉配置已保存!");
    }
};

const uiManager = {
    openSettings: () => document.getElementById('settings-modal').classList.add('modal-open'),
    closeSettings: () => document.getElementById('settings-modal').classList.remove('modal-open'),
    switchTab: (tabName) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
        document.getElementById(`tab-${tabName}`).classList.remove('hidden');
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
        if(tabName === 'persona') {
            visualRigManager.init();
        }
    }
};

window.onload = function() {
    if (typeof director === 'undefined') alert("JS加载失败");
};

// ==========================================
// 14. 天气与氛围管理器 (NEW)
// ==========================================
const weatherManager = {
    current: 'none',

    set: function(type) {
        if (this.current === type) return;
        this.current = type;
        
        const container = document.getElementById('app-container');
        const backLayer = document.getElementById('fx-back');
        const frontLayer = document.getElementById('fx-front');

        // 1. 清除旧状态
        container.classList.remove('mode-rain', 'mode-snow', 'mode-sakura', 'mode-film');
        backLayer.innerHTML = '';
        frontLayer.innerHTML = '';

        if (type === 'none' || !type) return;

        // 2. 激活新状态
        container.classList.add('mode-' + type);
        
        // 3. 生成粒子 (前层多，后层少，制造纵深)
        this.spawnParticles(type, frontLayer, backLayer);
    },

    spawnParticles: function(type, front, back) {
        // 配置：[前层数量, 后层数量]
        const countMap = { 'rain': [30, 0], 'snow': [20, 10], 'sakura': [10, 5], 'film': [1, 0] };
        const [frontCount, backCount] = countMap[type] || [0, 0];

        // 生成前层粒子
        for(let i=0; i<frontCount; i++) this.createParticle(type, front, false);
        // 生成后层粒子 (稍微模糊一点，制造景深)
        for(let i=0; i<backCount; i++) this.createParticle(type, back, true);
    },

    createParticle: function(type, container, isBack) {
        const div = document.createElement('div');
        
        if (type === 'rain') {
            div.className = 'rain-drop';
            div.style.left = Math.random() * 100 + '%';
            div.style.animationDuration = (0.6 + Math.random() * 0.4) + 's';
            div.style.animationDelay = Math.random() * 2 + 's';
            div.style.opacity = 0.2 + Math.random() * 0.3;
        } 
        else if (type === 'snow') {
            div.className = 'snow-flake';
            div.style.left = Math.random() * 100 + '%';
            const size = isBack ? (2 + Math.random() * 2) : (4 + Math.random() * 3); // 后层小，前层大
            div.style.width = div.style.height = size + 'px';
            div.style.animationDuration = (4 + Math.random() * 5) + 's';
            div.style.animationDelay = Math.random() * 5 + 's';
            if(isBack) div.style.filter = 'blur(1px)'; // 后层模糊
        }
        else if (type === 'sakura') {
            div.className = 'petal';
            div.style.left = Math.random() * 100 + '%';
            const size = isBack ? 6 : (10 + Math.random() * 5);
            div.style.width = size + 'px'; div.style.height = (size + 4) + 'px';
            div.style.animationDuration = (5 + Math.random() * 4) + 's';
            div.style.animationDelay = Math.random() * 4 + 's';
            div.style.backgroundColor = Math.random() > 0.5 ? '#ffc0cb' : '#ffe4e1';
            if(isBack) div.style.opacity = 0.6;
        }
        else if (type === 'film') {
            div.className = 'noise-bg';
            if(!isBack) {
                // 只在前层加划痕
                const scratch = document.createElement('div');
                scratch.className = 'film-line';
                container.appendChild(scratch);
            }
        }
        container.appendChild(div);
    }
};

// ==========================================
// 13. 功能坞管理器 (精简修复版)
// ==========================================
const dockManager = {
    toggle: function() {
        const panel = document.getElementById('dock-panel');
        if (panel && panel.classList.contains('open')) {
            this.close();
        } else {
            this.open();
        }
    },
    open: function() {
        const panel = document.getElementById('dock-panel');
        if (panel) {
            panel.classList.add('open');
        }
        
        this.showHome();
    },
    close: function() {
        const panel = document.getElementById('dock-panel');
        if (panel) {
            panel.classList.remove('open');
        }
    },
    
    showHome: function() {
        const dockHome = document.getElementById('dock-home');
        if (dockHome) {
            dockHome.classList.remove('hidden');
        }
    }
};

// ==========================================
// 13. 备忘录管理器 (独立窗口版)
// ==========================================
const memoManager = {
    // 定义类别和对应的图标
    categories: {
        'like': { name: '喜好', icon: 'ph-heart' },
        'hate': { name: '厌恶', icon: 'ph-thumbs-down' },
        'date': { name: '约定', icon: 'ph-calendar-heart' },
        'diet': { name: '饮食', icon: 'ph-bowl-food' },
        'secret': { name: '秘密', icon: 'ph-lock-key' },
        'default': { name: '其他', icon: 'ph-push-pin' }
    },
    currentFilter: 'all',

    // === 打开独立窗口 ===
    open: function() {
        // 1. 如果侧边功能坞是开着的，先关掉
        if(typeof dockManager !== 'undefined') dockManager.close();

        // 2. 显示备忘录窗口
        const modal = document.getElementById('memo-window-modal');
        if(modal) {
            modal.classList.remove('invisible', 'opacity-0', 'pointer-events-none');
            modal.classList.add('modal-open');
            modal.style.pointerEvents = 'auto';
        }

        // 3. 渲染内容
        this.renderFilterChips();
        this.render();
    },

    // === 关闭独立窗口 ===
    close: function() {
        const modal = document.getElementById('memo-window-modal');
        if(modal) {
            modal.classList.remove('modal-open');
            modal.classList.add('opacity-0');
            modal.style.pointerEvents = 'none';
            setTimeout(() => {
                modal.classList.add('invisible');
            }, 300);
        }
    },

    // 渲染列表 (保持原逻辑，适配新ID)
    render: function() {
        const container = document.getElementById('memo-container');
        if(!container) return;
        
        const char = characterManager.getCurrent();
        container.innerHTML = "";

        const searchInput = document.getElementById('memo-search-input');
        const keyword = searchInput ? searchInput.value.toLowerCase() : "";
        
        let memos = (char.memos || []).filter(memo => {
            const categoryMatch = this.currentFilter === 'all' || memo.topic === this.currentFilter;
            const keywordMatch = memo.content.toLowerCase().includes(keyword) || this.categories[memo.topic]?.name.toLowerCase().includes(keyword);
            return categoryMatch && keywordMatch;
        });

        if (memos.length === 0) {
            container.innerHTML = `<div class="memo-empty-state">没有找到相关备忘...</div>`;
            return;
        }

        memos.forEach(memo => {
            const category = this.categories[memo.topic] || this.categories['default'];
            const shortDate = new Date(memo.id).toLocaleDateString();
            
            const card = document.createElement('div');
            card.className = "memo-card"; 
            card.innerHTML = `
                <div class="memo-card-header">
                    <i class="ph ${category.icon} memo-card-icon"></i>
                    <span class="memo-card-topic">${category.name}</span>
                    <span class="memo-card-date">${shortDate}</span>
                </div>
                <p class="memo-card-content">${memo.content}</p>
                <div class="memo-card-actions">
                    <button onclick="memoManager.showModal('${memo.id}')" class="memo-action-btn" title="编辑"><i class="ph ph-pencil-simple"></i></button>
                    <button onclick="memoManager.deleteMemo('${memo.id}')" class="memo-action-btn delete" title="删除"><i class="ph ph-trash"></i></button>
                </div>
            `;
            container.appendChild(card);
        });
    },

    renderFilterChips: function() {
        const container = document.getElementById('memo-filter-chips');
        if(!container) return;
        
        container.innerHTML = `<button onclick="memoManager.filter('all')" class="filter-chip ${this.currentFilter === 'all' ? 'active' : ''}">全部</button>`;
        for (const key in this.categories) {
            const chip = document.createElement('button');
            chip.className = `filter-chip ${this.currentFilter === key ? 'active' : ''}`;
            chip.innerText = this.categories[key].name;
            chip.onclick = () => this.filter(key);
            container.appendChild(chip);
        }
    },

    filter: function(category) {
        this.currentFilter = category;
        this.renderFilterChips(); 
        this.render();
    },

    // 显示新增/编辑弹窗 (内部小弹窗)
    showModal: function(memoId = null) {
        const modal = document.getElementById('memo-modal-overlay');
        const title = document.getElementById('memo-modal-title');
        const contentInput = document.getElementById('memo-content-textarea');
        const topicSelect = document.getElementById('memo-topic-select');
        const idInput = document.getElementById('memo-edit-id');
        
        topicSelect.innerHTML = '';
        for (const key in this.categories) {
            topicSelect.innerHTML += `<option value="${key}">${this.categories[key].name}</option>`;
        }
        
        if (memoId) { 
            title.innerText = "编辑备忘";
            const char = characterManager.getCurrent();
            const memo = char.memos.find(m => m.id == memoId);
            if (memo) {
                contentInput.value = memo.content;
                topicSelect.value = memo.topic;
                idInput.value = memo.id;
            }
        } else {
            title.innerText = "新增备忘";
            contentInput.value = '';
            topicSelect.value = 'default';
            idInput.value = '';
        }
        modal.classList.remove('hidden');
    },

    hideModal: function() {
        document.getElementById('memo-modal-overlay').classList.add('hidden');
    },

    saveMemo: function() {
        const id = document.getElementById('memo-edit-id').value;
        const topic = document.getElementById('memo-topic-select').value;
        const content = document.getElementById('memo-content-textarea').value.trim();

        if (!content) { alert('内容不能为空！'); return; }

        const char = characterManager.getCurrent();
        if (!char.memos) char.memos = [];

        if (id) {
            const memo = char.memos.find(m => m.id == id);
            if (memo) { memo.topic = topic; memo.content = content; }
        } else {
            char.memos.unshift({ id: Date.now(), date: new Date().toLocaleString(), topic: topic, content: content });
        }
        
        characterManager.save();
        this.hideModal();
        this.render();
        this.showToast(id ? '备忘已更新' : '备忘已添加');
    },

    deleteMemo: function(memoId) {
        if (confirm('确定要删除这条备忘吗？')) {
            const char = characterManager.getCurrent();
            char.memos = char.memos.filter(m => m.id != memoId);
            characterManager.save();
            this.render();
            this.showToast('备忘已删除');
        }
    },

    // 供 AI 调用的接口
    add: function(topic, content) {
        const char = characterManager.getCurrent();
        if (!char.memos) char.memos = [];
        const legalTopic = this.categories.hasOwnProperty(topic) ? topic : 'default';
        char.memos.unshift({ id: Date.now(), date: new Date().toLocaleString(), topic: legalTopic, content: content });
        characterManager.save();
        this.showToast(`AI 写入了新的备忘: "${this.categories[legalTopic].name}"`);
    },
    
    showToast: function(msg) {
        const el = document.getElementById('toast-notification');
        document.getElementById('toast-msg').innerText = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 3000);
    }
};

// ==========================================
// 16. 状态监视器 
// ==========================================
const statusManager = {
    isOpen: false,
    // 模拟数据 (后续可接到 characterManager 的真实数据中)
    vitals: {
        affection: 85,    // 同步率
        energy: 60,       // 精力 (0-100)
        satiety: 40,      // 饱腹 (0-100)
        sanity: 90,       // 理智 (0-100)
        moodColor: '#D4AF37', // 心情颜色
        thoughts: ["外面的雨声让人安心。", "什么时候能见到你呢？", "稍微有点困了...", "今天发生了很多事。"]
    },
    
    toggle: function() {
        const panel = document.getElementById('status-panel');
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            panel.classList.add('panel-open');
            this.updateAll(); 
        } else {
            panel.classList.remove('panel-open');
        }
    },

    switchTab: function(tabName) {
        document.querySelectorAll('.status-view').forEach(el => el.classList.add('hidden'));
        // 注意：HTML里id叫 status-view-core，传参 tabName='core'
        document.getElementById(`status-view-${tabName}`).classList.remove('hidden');
        
        document.querySelectorAll('.status-tab').forEach(btn => {
            btn.classList.remove('active', 'text-[#D4AF37]');
            btn.classList.add('text-gray-600');
            if(btn.dataset.tab === tabName) {
                btn.classList.add('active', 'text-[#D4AF37]');
                btn.classList.remove('text-gray-600');
            }
        });
    },

    updateAll: function() {
        this.updateMediaInfo();
        this.updateWeather();
        this.updateCore(); // 新增：刷新核心状态
    },

    // 更新 CORE 界面 
    updateCore: function() {
        const char = characterManager.getCurrent();
        // 如果数据还没初始化，先用默认值防报错
        const stats = char ? (char.stats || { affection: 0, energy: 50, satiety: 50, sanity: 50, thought: "..." }) : {};

        // 1. 同步率与心情
        const affEl = document.getElementById('core-aff-num');
        const moodEl = document.getElementById('core-mood-glow');
        
        affEl.innerText = stats.affection + "%";
        
        // 动态改变心情光晕颜色
        let moodColor = '#D4AF37'; // 默认金
        if (stats.affection > 100) moodColor = '#ec4899'; // 爆表粉
        else if (stats.affection < 0) moodColor = '#3b82f6'; // 破裂蓝
        else if (stats.sanity < 40) moodColor = '#ef4444'; // 疯狂红
        
        moodEl.style.backgroundColor = moodColor;

        // 2. 渲染思维流 (显示 AI 返回的 thought)
        const stream = document.getElementById('core-thought-stream');
        if(stream && stats.thought) {
            // 对比一下内容，如果变了才更新，避免动画频繁闪烁
            if (!stream.innerHTML.includes(stats.thought)) {
                stream.innerHTML = `<div class="thought-item">"${stats.thought}"</div>`;
            }
        }

        // 3. 渲染生理指标点阵 (读取真实数值)
        this.renderDots('dots-energy', stats.energy);
        this.renderDots('dots-satiety', stats.satiety);
        this.renderDots('dots-sanity', stats.sanity);
    },

    // 辅助函数：生成点阵
    renderDots: function(containerId, value) {
        const container = document.getElementById(containerId);
        if(!container) return;
        container.innerHTML = '';
        const totalDots = 10; // 总共10个点
        const activeDots = Math.floor(value / 10); // 比如 65 -> 6个点
        
        for (let i = 0; i < totalDots; i++) {
            const dot = document.createElement('div');
            dot.className = 'v-dot';
            if (i < activeDots) {
                dot.classList.add('active');
                // 如果数值过低 (小于30%)，显示警告色
                if (activeDots < 3) dot.classList.add('warning');
            }
            container.appendChild(dot);
        }
    },

    updateMediaInfo: function() {
        const bgmEl = document.getElementById('audio-bgm');
        const bgmNameEl = document.getElementById('status-bgm-name');
        const sfxNameEl = document.getElementById('status-sfx-name');
        if (bgmEl && !bgmEl.paused && bgmEl.src) {
            let name = decodeURIComponent(bgmEl.src.split('/').pop());
            if (name.includes('_')) name = name.split('_').slice(1).join('_'); 
            bgmNameEl.innerText = name || "Unknown Track";
            bgmNameEl.classList.add('text-[#D4AF37]');
        } else {
            bgmNameEl.innerText = "No Music Playing";
            bgmNameEl.classList.remove('text-[#D4AF37]');
        }
        const activeSfx = Object.keys(audioManager.activeSfx);
        sfxNameEl.innerText = activeSfx.length > 0 ? "SFX: " + activeSfx.join(", ") : "No SFX";
    },

    updateWeather: function() {
        document.getElementById('weather-text-local').innerText = `Local --°C`; 
        const aiEnv = weatherManager.current || "none";
        let text = "Clear", icon = "ph-sun";
        if (aiEnv === 'rain') { text = "Rainy"; icon = "ph-cloud-rain"; }
        else if (aiEnv === 'snow') { text = "Snowy"; icon = "ph-snowflake"; }
        document.getElementById('weather-text-ai').innerText = `${text}`;
        document.getElementById('weather-icon-ai').className = `ph-fill ${icon} text-lg text-[#D4AF37] mb-1`;
    }
};
