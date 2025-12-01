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
                let type = item.type === 'audio' ? 'bgm' : item.type;
                if (!this.cache[type]) this.cache[type] = {};
                if (!this.cache[type][item.tag] || isMine) { this.cache[type][item.tag] = url; }
            }
        });
        this.renderList();
    },
    
    renderList: function() {
        const listEl = document.getElementById('assets-list');
        const searchInput = document.getElementById('asset-search');
        if(!listEl) return;
        listEl.innerHTML = "";
        const keyword = searchInput ? searchInput.value.toLowerCase() : "";
        this.allItems.forEach(item => {
            let typeMatch = this.currentFilter === 'all';
            if (this.currentFilter === 'audio') typeMatch = (item.type === 'bgm' || item.type === 'sfx' || item.type === 'audio');
            else if (this.currentFilter !== 'all') typeMatch = (item.type === this.currentFilter);
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
        if(item.type === 'bgm') icon = '<i class="ph ph-music-notes text-2xl text-blue-400"></i>';
        else if(item.type === 'sfx') icon = '<i class="ph ph-waves text-2xl text-green-400"></i>';
        else if(item.type === 'audio') icon = '<i class="ph ph-speaker-high text-2xl"></i>';
        else icon = `<img src="${url}" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition">`;
        div.innerHTML = item.type.includes('char') || item.type.includes('bg') ? icon : `<div class="w-full h-full flex items-center justify-center text-white/50">${icon}</div>`;
        const badgeColor = badge === 'G' ? 'text-gray-500' : 'text-[#D4AF37]';
        div.innerHTML += `<div class="absolute top-1 right-1 text-[8px] font-bold ${badgeColor}">${badge}</div><div class="absolute bottom-0 inset-x-0 bg-black/80 text-[9px] text-gray-300 text-center py-1 font-mono truncate px-1">${item.tag}</div>`;
        container.appendChild(div);
    },
    filter: function(type) {
        this.currentFilter = type;
        document.querySelectorAll('.filter-chip').forEach(btn => {
            btn.classList.remove('active'); if(btn.dataset.filter === type) btn.classList.add('active');
        });
        this.renderList();
    },
    openModal: function(item, url) {
        this.currentEditingId = item.id;
        const modal = document.getElementById('asset-modal');
        const preview = document.getElementById('asset-preview-area');
        const tagInput = document.getElementById('edit-asset-tag');
        if (item.type.includes('bg') || item.type.includes('char')) { preview.innerHTML = `<img src="${url}" class="h-full object-contain">`; } 
        else { preview.innerHTML = `<div class="text-center"><i class="ph ph-play-circle text-4xl text-[#D4AF37] cursor-pointer hover:scale-110 transition" onclick="new Audio('${url}').play()"></i><p class="text-[10px] text-gray-500 mt-2">点击试听</p></div>`; }
        tagInput.value = item.tag;
        const isGlobal = !item.ownerId || item.ownerId === 'global';
        this.setEditScope(isGlobal ? 'global' : 'local');
        modal.style.opacity = "1"; modal.style.pointerEvents = "auto";
        tagManager.renderAll(); // 刷新标签库
    },
    closeModal: function() {
        const modal = document.getElementById('asset-modal');
        modal.style.opacity = "0"; modal.style.pointerEvents = "none"; this.currentEditingId = null;
    },
    setEditScope: function(scope) {
        const btnGlobal = document.getElementById('scope-btn-global');
        const btnLocal = document.getElementById('scope-btn-local');
        btnGlobal.classList.remove('active'); btnLocal.classList.remove('active');
        if (scope === 'global') btnGlobal.classList.add('active'); else btnLocal.classList.add('active');
        document.getElementById('asset-modal').dataset.scope = scope;
    },
    saveChanges: async function() {
        if (!this.currentEditingId) return;
        const tag = document.getElementById('edit-asset-tag').value.trim();
        const scope = document.getElementById('asset-modal').dataset.scope;
        const ownerId = scope === 'global' ? 'global' : characterManager.currentId;
        if (!tag) return alert("标签不能为空");
        try { await dbSystem.updateAsset(this.currentEditingId, { tag: tag, ownerId: ownerId }); this.closeModal(); this.refreshCache(); } 
        catch (e) { alert("更新失败"); }
    },
    deleteAsset: async function() {
        if (!this.currentEditingId) return;
        if (confirm("确定永久删除此素材？")) { await dbSystem.deleteAsset(this.currentEditingId); this.closeModal(); this.refreshCache(); }
    },
    handleQuickUpload: async function(input) {
        const file = input.files[0]; if(!file) return;
        let type = 'bg'; 
        if (file.type.startsWith('audio')) type = 'bgm'; 
        else if (file.name.includes('char') || file.name.includes('sprite')) type = 'char';
        const tag = file.name.split('.')[0];
        const ownerId = characterManager.currentId || 'global';
        try { await dbSystem.saveAsset(type, tag, file, ownerId); alert("上传成功，请编辑分类"); this.refreshCache(); } 
        catch(e) { alert("上传失败"); }
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
// 5. 音频混合器
// ==========================================
const audioManager = {
    activeSfx: {}, 
    playBgm: function(tag) {
        const url = assetManager.cache.bgm[tag];
        const el = document.getElementById('audio-bgm');
        if (!url) { if(tag === "") el.pause(); return; }
        if (!el.src.endsWith(url)) { el.src = url; el.play().catch(e => console.log("BGM Play Error", e)); }
    },
    updateSfx: function(tagInput) {
        const container = document.getElementById('sfx-container');
        let tags = [];
        if (Array.isArray(tagInput)) tags = tagInput;
        else if (typeof tagInput === 'string' && tagInput.length > 0) tags = [tagInput];
        for (const [activeTag, audioEl] of Object.entries(this.activeSfx)) {
            if (!tags.includes(activeTag)) { audioEl.pause(); audioEl.remove(); delete this.activeSfx[activeTag]; }
        }
        tags.forEach(tag => {
            if (!this.activeSfx[tag]) {
                const url = assetManager.cache.sfx[tag];
                if (url) {
                    const audio = document.createElement('audio'); audio.src = url; audio.loop = true;
                    audio.play().catch(e => console.log("SFX Play Error", e));
                    container.appendChild(audio); this.activeSfx[tag] = audio;
                }
            }
        });
    }
};

// ==========================================
// 6. 角色管理器 (适配新版界面)
// ==========================================
const characterManager = {
    list: [], currentId: null,
    
    init: function() {
        const savedList = localStorage.getItem('char_list');
        if (savedList) {
            this.list = JSON.parse(savedList);
            this.currentId = localStorage.getItem('current_char_id') || (this.list[0] ? this.list[0].id : null);
        } else {
            const oldName = localStorage.getItem('conf_charName');
            if (oldName) {
                const newChar = {
                    id: Date.now().toString(), name: oldName, prompt: localStorage.getItem('conf_sysPrompt') || "",
                    userName: localStorage.getItem('conf_userName') || "玩家", userDesc: localStorage.getItem('conf_userDesc') || "", relation: localStorage.getItem('conf_userRelation') || ""
                };
                this.list.push(newChar); this.currentId = newChar.id; this.save();
            } else { this.createNew(true); }
        }
        this.renderList(); this.loadCurrent();
    },

    save: function() { localStorage.setItem('char_list', JSON.stringify(this.list)); if(this.currentId) localStorage.setItem('current_char_id', this.currentId); },
    
    createNew: function(silent = false) {
        const newChar = { id: Date.now().toString(), name: "新角色", prompt: "人设...", summary: "", userName: "玩家", userDesc: "", relation: "初识" };
        this.list.push(newChar); this.currentId = newChar.id; this.save(); this.renderList(); this.loadCurrent();
        assetManager.refreshCache(); if(!silent) uiManager.switchTab('persona');
    },
    
    select: function(id) {
        this.currentId = id; this.save(); this.renderList(); this.loadCurrent();
        historyManager.init(); aiEngine.init(); assetManager.refreshCache();
        const char = this.getCurrent();
        document.getElementById('char-name').innerText = char.name;
        document.getElementById('dialogue-text').innerText = "...";
    },
    
    deleteCurrent: function() {
        if(this.list.length <= 1) return alert("无法删除最后一个角色");
        if(confirm(`确定删除 ${this.getCurrent().name}?`)) {
            const idx = this.list.findIndex(c => c.id === this.currentId); this.list.splice(idx, 1);
            localStorage.removeItem(`chat_history_${this.currentId}`); localStorage.removeItem(`ai_context_${this.currentId}`); localStorage.removeItem(`last_interaction_${this.currentId}`);
            this.currentId = this.list[0].id; this.save(); this.select(this.currentId);
        }
    },
    
    getCurrent: function() { return this.list.find(c => c.id === this.currentId) || this.list[0]; },
    
    // 【更新】从 UI 读取数据 (适配新的 DOM 结构)
    updateCurrentFromUI: function() {
        const char = this.getCurrent(); if(!char) return;
        // 人设 Tab
        const nameInput = document.getElementById('persona-name');
        if(nameInput) char.name = nameInput.value;
        
        const promptInput = document.getElementById('persona-prompt');
        if(promptInput) char.prompt = promptInput.value;
        
        const userInput = document.getElementById('user-name');
        if(userInput) char.userName = userInput.value;
        
        const userDesc = document.getElementById('user-desc');
        if(userDesc) char.userDesc = userDesc.value;
        
        const userRel = document.getElementById('user-relation');
        if(userRel) char.relation = userRel.value;
        
        // 【关键】长期记忆现在位于 日记-Memory 视图中
        const memoryInput = document.getElementById('char-memory');
        if(memoryInput) char.summary = memoryInput.value;

        this.save(); this.renderList();
    },
    
    // 【更新】加载数据到 UI
    loadCurrent: function() {
        const char = this.getCurrent(); if(!char) return;
        
        // 填充人设 Tab
        const elName = document.getElementById('persona-name'); if(elName) elName.value = char.name;
        const elPrompt = document.getElementById('persona-prompt'); if(elPrompt) elPrompt.value = char.prompt;
        const elUser = document.getElementById('user-name'); if(elUser) elUser.value = char.userName;
        const elDesc = document.getElementById('user-desc'); if(elDesc) elDesc.value = char.userDesc;
        const elRel = document.getElementById('user-relation'); if(elRel) elRel.value = char.relation;
        
        // 填充对话框名字
        const elCharName = document.getElementById('char-name'); if(elCharName) elCharName.innerText = char.name;

        // 【关键】填充长期记忆到日记视图的隐藏输入框
        const elMem = document.getElementById('char-memory'); 
        if(elMem) elMem.value = char.summary || "";
        
        // 填充阈值设置
        const elThres = document.getElementById('memory-threshold');
        if(elThres) elThres.value = localStorage.getItem('conf_threshold') || 20;
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
    init: function() {
        const cid = characterManager.currentId; if(!cid) return;
        const saved = localStorage.getItem(`chat_history_${cid}`);
        this.logs = saved ? JSON.parse(saved) : [];
    },
    add: function(role, text) { this.logs.push({ role: role, text: text }); this.save(); },
    save: function() { const cid = characterManager.currentId; if(cid) localStorage.setItem(`chat_history_${cid}`, JSON.stringify(this.logs)); },
    clear: function() {
        const cid = characterManager.currentId;
        if(cid) { this.logs = []; this.save(); aiEngine.clearContext(); localStorage.removeItem(`last_interaction_${cid}`); alert("记忆已清空"); this.hide(); }
    },
    show: function() {
        const container = document.getElementById('history-list'); container.innerHTML = "";
        if (this.logs.length === 0) container.innerHTML = `<div class="text-center text-gray-700 text-xs mt-10">暂无记录</div>`;
        this.logs.forEach(log => {
            const div = document.createElement('div'); div.className = "log-item";
            let roleName = "你", roleClass = "user";
            const char = characterManager.getCurrent();
            if (log.role === 'dialogue' || log.role === 'assistant') { roleName = char ? char.name : "AI"; roleClass = "ai"; }
            else if (log.role === 'narration') { roleName = "旁白"; roleClass = "narr"; }
            if (log.role === 'user') roleName = char ? char.userName : "你";
            div.innerHTML = `<span class="log-role ${roleClass}">${roleName}</span><div class="log-text">${log.text}</div>`;
            container.appendChild(div);
        });
        document.getElementById('history-modal').classList.add('modal-open');
        setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
    },
    hide: function() { document.getElementById('history-modal').classList.remove('modal-open'); }
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
// 10. AI 引擎 (支持带日期的记忆压缩)
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
        if(this.history.length === 0) this.history.push({ role: "system", content: this.buildSystemPrompt() });
        const timeCtx = timeManager.getTimeContext();
        const greetingPrompt = `[事件: APP启动] 时间: ${timeCtx.fullTime} (${timeCtx.timeOfDay}). 间隔: ${timeCtx.interval} 节日: ${timeCtx.festival}. 任务: 生成开场剧情。`;
        this.history.push({ role: "user", content: greetingPrompt });
        this.request();
    },
    
    triggerResponse: function() {
        if (this.history.length === 0) return alert("请先输入内容");
        this.request();
    },

    // 构建 System Prompt
    buildSystemPrompt: function() {
        const conf = this.getConfig();
        const assets = assetManager.cache;
        
        // 获取素材列表，告诉 AI 它有什么资源可用
        const charTags = Object.keys(assets.char).join(', ');
        const bgTags = Object.keys(assets.bg).join(', ');
        const bgmTags = Object.keys(assets.bgm).join(', ');
        const sfxTags = Object.keys(assets.sfx).join(', ');
        const timeCtx = timeManager.getTimeContext();

        return `
        你不仅是角色【${conf.charName}】，更是《LoveOS》的剧本导演。
        
        === 你的角色设定 ===
        ${conf.sysPrompt}
        
        === 长期记忆摘要 ===
        ${conf.summary}
        
        === 玩家信息 ===
        姓名: ${conf.userName} | 描述: ${conf.userDesc} | 关系: ${conf.relation}
        当前时间: ${timeCtx.fullTime} (${timeCtx.timeOfDay})
        
        ==============================================================
        【⚡ 绝对核心指令 - 违反将被系统惩罚 ⚡】
        ==============================================================
        
        1. **严禁使用括号动作**：
           ❌ 错误: { "type": "dialogue", "text": "(无奈地叹气) 你真是个笨蛋。" }
           ✅ 正确: 
           [
               { "type": "narration", "text": "${conf.charName} 无奈地叹了一口气，眼神中带着一丝宠溺。" },
               { "type": "dialogue", "text": "你真是个笨蛋。" }
           ]

        2. **拒绝一句话回复**：
           请尽量生成 **2 到 4 个步骤** 的剧本。
           不要干巴巴地说话，要先用 'narration' 描写你的表情、动作、心理活动或环境氛围，然后再接 'dialogue'。

        3. **格式要求**：
           - 必须返回标准 JSON 格式。
           - 严禁包含 markdown 标记（如 \`\`\`json）。
           
        4. **素材调用能力 (Visual & Audio)**：
           请根据剧情主动切换立绘和背景，增强演出效果。
           - 可用立绘(sprite): [${charTags}] (仅使用列表内的词，没有则不填)
           - 可用背景(bg): [${bgTags}]
           - 可用音乐(bgm): [${bgmTags}]
           - 环境特效(weather): "none", "rain", "snow", "sakura", "film"
           
        5. **记忆与手账**:
           如果玩家提到了新的重要喜好或约定，请在 JSON 根对象中包含 "memo" 字段记录下来。

        === 最终输出 JSON 结构示例 ===
        {
            "script": [
                { 
                    "type": "narration", 
                    "text": "看着窗外的雨，心中泛起一丝涟漪...", 
                    "visual": { "bg": "room_rain", "weather": "rain" } 
                },
                { 
                    "type": "dialogue", 
                    "text": "这场雨下得真久啊，你带伞了吗？", 
                    "visual": { "sprite": "worry", "zoom": 1.1 },
                    "audio": { "sfx": "rain_heavy" }
                }
            ]
        }
        `;
    },

    request: async function() {
        const conf = this.getConfig();
        if(!conf.key) return alert("请先配置 API Key");
        const btn = document.getElementById('trigger-btn');
        btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i>`;

        try {
            const chatUrl = this.fixUrl(conf.url, "/chat/completions");
            
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
            let content = data.choices[0].message.content.replace(/```json/g, "").replace(/```/g, "").trim();
            
            try {
                const responseObj = JSON.parse(content);
                if (responseObj.script && Array.isArray(responseObj.script)) {
                    responseObj.script.forEach(step => {
                        if (step.type === 'dialogue') {
                            // 正则表达式：删除 () 或 （） 中的内容
                            // 并在控制台警告，方便调试
                            if (/[\(（].*?[\)）]/.test(step.text)) {
                                console.warn("清洗了括号内容:", step.text);
                                step.text = step.text.replace(/[\(（].*?[\)）]/g, "").trim();
                            }
                        }
                    });
                }
                if (responseObj.memo) memoManager.add(responseObj.memo.topic, responseObj.memo.content);
                if (responseObj.script && Array.isArray(responseObj.script)) {
                    director.loadScript(responseObj.script);
                    this.history.push({ role: "assistant", content: content });
                    responseObj.script.forEach(step => historyManager.add(step.type, step.text));
                } else { throw new Error("Format error"); }
            } catch(e) {
                director.loadScript([{ type: 'dialogue', text: responseObj?.text || content }]);
                historyManager.add('dialogue', responseObj?.text || content);
                this.history.push({ role: "assistant", content: content });
            }
            
            this.saveContext();
            timeManager.updateLastInteraction();
            this.checkAndCompress();

        } catch(e) {
            director.loadScript([{ type: 'narration', text: `连接错误: ${e.message}` }]);
        } finally {
            btn.innerHTML = `<i class="ph ph-sparkle text-xl"></i>`;
        }
    },

    checkAndCompress: function() {
        if (this.isCompressing) return;
        // 【关键】读取新位置的阈值设置
        const thresholdInput = document.getElementById('memory-threshold');
        const limit = thresholdInput ? parseInt(thresholdInput.value) : 20;
        
        if (this.history.length > limit + 1 && this.history.length > 5) {
            this.forceSummarize();
        }
    },

    // 【更新】强制压缩，并加上日期标签
    forceSummarize: async function() {
        const conf = this.getConfig();
        if (this.isCompressing || !conf.key) return;
        
        memoManager.showToast("⚡ 正在整理记忆...");
        this.isCompressing = true;
        
        const keepCount = 10; 
        if (this.history.length <= keepCount + 2) {
            this.isCompressing = false; return;
        }

        const toSummarize = this.history.slice(1, this.history.length - keepCount);
        const activeContext = this.history.slice(this.history.length - keepCount);
        
        const compressPrompt = [
            { role: "system", content: "你是一个专业的剧情记录员。请简要总结以下对话发生的关键事件。请使用【第一人称】(我=AI角色)。" },
            { role: "user", content: `当前已有的长期记忆：${conf.summary}\n\n需要合并的新对话：\n${JSON.stringify(toSummarize)}\n\n重要：请以 "[YYYY-MM-DD] 总结内容" 的格式输出新的总结段落。如果已有记忆也有类似格式，请保留，并将新总结追加在最后。` }
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

            const todayStr = new Date().toISOString().split('T')[0];
            if (!newSummary.includes('[20') && !newSummary.includes('202')) {
                 newSummary = `[${todayStr}] ` + newSummary;
            }

            const char = characterManager.getCurrent();
            char.summary = newSummary;
            characterManager.save();
            
            // 【修复关键】将更新后的记忆同步到隐藏的textarea中，确保UI与数据一致
            const memoryTextarea = document.getElementById('char-memory');
            if (memoryTextarea) {
                memoryTextarea.value = newSummary;
            }
            
            if(document.getElementById('view-memory') && document.getElementById('view-memory').classList.contains('view-active')) {
                journalManager.renderMemoryCore();
            }

            this.history = [
                { role: "system", content: this.buildSystemPrompt() }, 
                ...activeContext
            ];
            this.saveContext();
            
            memoManager.showToast("✅ 记忆已压缩更新");

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
        if (step.type === 'narration') { box.classList.add('narration-mode'); } 
        else { box.classList.remove('narration-mode'); nameEl.innerText = step.name ? step.name : aiEngine.getConfig().charName; }

        if (step.visual) {
            const wrapper = document.getElementById('char-wrapper');
            const charImg = document.getElementById('char-img');
            const bgImg = document.getElementById('bg-img');
            const cache = assetManager.cache;
            wrapper.style.transform = `scale(${step.visual.zoom || 1})`;
            wrapper.style.transformOrigin = step.visual.focus || "50% 25%";
            bgImg.style.filter = step.visual.filter || "none";
            if (step.visual.weather) {
                weatherManager.set(step.visual.weather);
            }
            if(step.visual.sprite && cache.char[step.visual.sprite]) { charImg.src = cache.char[step.visual.sprite]; charImg.classList.remove('hidden'); }
            if(step.visual.bg && cache.bg[step.visual.bg]) {
                const newBgUrl = cache.bg[step.visual.bg];
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
// 15. 日记与结算系统 
// ==========================================
const journalManager = {
    calendarDate: new Date(), 
    selectedDate: new Date().toLocaleDateString('sv-SE'),

    open: function() {
        const modal = document.getElementById('journal-modal');
        modal.classList.remove('invisible', 'opacity-0');
        modal.classList.add('modal-open');
        modal.style.pointerEvents = 'auto'; // 确保父容器可点击

        const char = characterManager.getCurrent();
        const dates = Object.keys(char.journal || {}).sort().reverse();
        const latestDate = dates[0] || new Date().toLocaleDateString('sv-SE');
        
        this.selectedDate = latestDate;
        this.calendarDate = new Date(latestDate.replace(/-/g, '/'));
        
        this.renderTimeline();
        this.loadEntry(this.selectedDate);
        this.switchView('diary'); // 默认显示日记
    },
    
    close: function() {
        const modal = document.getElementById('journal-modal');
        modal.classList.remove('modal-open');
        modal.classList.add('opacity-0');
        modal.style.pointerEvents = 'none';
        setTimeout(() => modal.classList.add('invisible'), 300);
        this.toggleSidebar(false);
        if(!document.getElementById('char-memory').classList.contains('hidden')) {
            this.toggleMemoryEdit(); 
        }
    },

    // [FINAL CORRECTED VERSION] - 这是本次修复的核心
    loadEntry: function(dateStr) {
        if (!dateStr) return;
        this.selectedDate = dateStr;
        this.renderTimeline(); // 重新渲染时间轴以高亮当前选项

        const char = characterManager.getCurrent();
        const entry = char.journal ? char.journal[dateStr] : null;

        if (entry) {
            const d = new Date(dateStr.replace(/-/g, '/'));
            const year = d.getFullYear().toString();
            const monthName = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
            const day = d.getDate();

            // 更新【新头部】的日期元素
            document.getElementById('journal-header-day').innerText = day;
            document.getElementById('journal-header-month').innerText = monthName;
            document.getElementById('journal-year-display').innerText = year;

            // 更新【日记正文区】的元素
            document.getElementById('noir-bg-year').innerText = `'${year.slice(2)}`;
            document.getElementById('noir-title').innerText = `"${entry.title}"`;
            
            const paragraphs = entry.diary.split('\n').filter(p => p.trim() !== "");
            document.getElementById('noir-body').innerHTML = paragraphs.map(p => `<p>${p}</p>`).join('');
        } else {
            // 如果没有日记，则【清空】所有相关显示
            document.getElementById('journal-header-day').innerText = '--';
            document.getElementById('journal-header-month').innerText = '---';
            document.getElementById('journal-year-display').innerText = '----';

            document.getElementById('noir-bg-year').innerText = ''; // 背景年份也清空
            document.getElementById('noir-title').innerText = '当天没有日记...';
            document.getElementById('noir-body').innerHTML = '';
        }

        this.renderDiaryActions(!!entry);
        this.renderComments(entry ? entry.comments : null);
    },
    
    // [后面的代码保持不变，确保功能完整]
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
        btn.disabled = true;
        btn.classList.add('loading');
        memoManager.showToast('正在连接他的思绪...');

        const char = characterManager.getCurrent();
        const entry = char.journal ? char.journal[this.selectedDate] : null;

        let prompt = '';
        if (entry) { // 刷新逻辑
            prompt = `你是一位作家，擅长用细腻的笔触书写内心独白。这是你之前为日期 ${this.selectedDate} 写下的一篇日记：\n\n"""\n${entry.diary}\n"""\n\n现在，请你围绕同样的核心事件和情感，但用一种全新的角度或更丰富的细节，重新书写这篇日记。让它感觉既熟悉又新颖。请直接输出日记正文。`;
        } else { // 生成逻辑
            prompt = `今天是 ${this.selectedDate}，但你和玩家之间没有任何互动记录。请根据你的角色设定和长期记忆，想象一下你独自一人时会想些什么、做些什么，并为今天写下一篇充满你个人风格的日记。请直接输出日记正文。`;
        }

        try {
            const conf = aiEngine.getConfig();
            const res = await fetch(aiEngine.fixUrl(conf.url, "/chat/completions"), {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${conf.key}` },
                body: JSON.stringify({ model: conf.model, messages: [{ role: "user", content: prompt }], temperature: 0.8 })
            });
            const data = await res.json();
            const newDiaryText = data.choices[0].message.content;

            if (!char.journal) char.journal = {};
            if (!char.journal[this.selectedDate]) { // 如果是新生成的
                char.journal[this.selectedDate] = { title: "一次新的回忆", memory: "由玩家主动生成。", comments: [] };
            }
            
            char.journal[this.selectedDate].diary = newDiaryText;
            char.journal[this.selectedDate].comments = []; // 刷新或新生成后，清空旧评论

            characterManager.save();
            this.loadEntry(this.selectedDate); 
            memoManager.showToast('✅ 他的思绪已更新');

        } catch(e) {
            console.error("Diary refresh failed:", e);
            memoManager.showToast('❌ 连接中断了...');
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
        }
    },
    
    submitComment: async function() {
        const textarea = document.getElementById('comment-textarea');
        const btn = document.getElementById('comment-submit-btn');
        const userComment = textarea.value.trim();
        if (!userComment) return;

        btn.disabled = true;
        btn.innerText = '正在倾听...';

        const char = characterManager.getCurrent();
        const entry = char.journal[this.selectedDate];
        if (!entry.comments) entry.comments = [];

        entry.comments.push({ role: 'user', text: userComment });
        characterManager.save();
        this.renderComments(entry.comments);
        textarea.value = '';

        const thread = document.getElementById('comment-thread');
        const loadingBubble = document.createElement('div');
        loadingBubble.className = 'comment-bubble character-reply reply-loading';
        loadingBubble.textContent = '他正在输入...';
        thread.appendChild(loadingBubble);
        thread.scrollTop = thread.scrollHeight;

        const prompt = `你正在与玩家回顾你过去的一篇日记。\n\n[这是你当时写的日记原文]\n"""\n${entry.diary}\n"""\n\n[这是玩家刚刚对这篇日记发表的评论]\n"""\n${userComment}\n"""\n\n任务：请完全沉浸在你的角色（${char.name}）中，以第一人称视角，自然地回复这条评论。你的回复需要与日记内容和玩家评论都紧密相关。请直接输出回复内容，不要包含任何额外的前缀或格式。`;
        
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
            console.error("Comment reply failed:", e);
            loadingBubble.textContent = '回复失败，请检查网络连接。';
        } finally {
            btn.disabled = false;
            btn.innerText = '发送回信';
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
        setTimeout(() => {
            modal.classList.add('invisible', 'pointer-events-none');
        }, 200);
    },

    changeMonth: function(offset) {
        this.calendarDate.setMonth(this.calendarDate.getMonth() + offset);
        this.renderCalendar();
    },

    renderCalendar: async function() {
        const grid = document.querySelector('.calendar-grid');
        const monthDisplay = document.getElementById('calendar-month-display');
        
        while(grid.children.length > 7) {
            grid.removeChild(grid.lastChild);
        }

        const year = this.calendarDate.getFullYear();
        const month = this.calendarDate.getMonth();
        monthDisplay.innerText = `${this.calendarDate.toLocaleString('en-US', { month: 'short' }).toUpperCase()} ${year}`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const char = characterManager.getCurrent();
        const journalDates = new Set(Object.keys(char.journal || {}));
        const memoryDates = new Set();
        (char.summary || "").split('[').forEach(part => {
            if (part.startsWith('20')) {
                const dateMatch = part.match(/^\d{4}-\d{2}-\d{2}/);
                if (dateMatch) memoryDates.add(dateMatch[0]);
            }
        });
        
        for (let i = 0; i < firstDay; i++) {
            grid.innerHTML += `<div class="day-cell other-month"></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const cell = document.createElement('div');
            cell.className = 'day-cell';
            
            let indicators = '<div class="day-indicators">';
            if (journalDates.has(dateStr)) indicators += '<div class="dot dot-diary"></div>';
            if (memoryDates.has(dateStr)) indicators += '<div class="dot dot-memory"></div>';
            indicators += '</div>';

            cell.innerHTML = `<span class="day-number">${day}</span>${indicators}`;
            
            if (dateStr === this.selectedDate) cell.classList.add('selected');
            
            const today = new Date();
            if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
                cell.classList.add('today');
            }

            cell.onclick = () => {
                this.loadEntry(dateStr);
                this.hideCalendar();
            };
            grid.appendChild(cell);
        }
    },

    switchView: function(type) {
        const memView = document.getElementById('view-memory');
        const diaryView = document.getElementById('view-diary');
        const memBtn = document.getElementById('btn-view-memory');
        const diaryBtn = document.getElementById('btn-view-diary');

        // 注意：新版切换按钮没有 .active-switch 类，只有 .active
        if (type === 'memory') {
            memView.classList.remove('view-hidden');
            memView.classList.add('view-active');
            diaryView.classList.remove('view-active');
            diaryView.classList.add('view-hidden');
            
            memBtn.classList.add('active');
            diaryBtn.classList.remove('active');
            
            this.renderMemoryCore();
        } else {
            diaryView.classList.remove('view-hidden');
            diaryView.classList.add('view-active');
            memView.classList.remove('view-active');
            memView.classList.add('view-hidden');
            
            diaryBtn.classList.add('active');
            memBtn.classList.remove('active');
        }
    },
    
    toggleSidebar: function(show) {
        const sidebar = document.getElementById('journal-sidebar');
        const backdrop = document.getElementById('journal-backdrop');
        if (show) {
            sidebar.classList.remove('-translate-x-full');
            backdrop.classList.remove('opacity-0', 'pointer-events-none');
        } else {
            sidebar.classList.add('-translate-x-full');
            backdrop.classList.add('opacity-0', 'pointer-events-none');
        }
    },

    renderTimeline: function() {
        const container = document.getElementById('journal-timeline');
        container.innerHTML = '';
        const char = characterManager.getCurrent();
        const journalEntries = char.journal || {};
        
        const dates = Object.keys(journalEntries).sort((a,b) => new Date(b) - new Date(a));

        if(dates.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-600 text-center">还没有任何日记...</p>';
            return;
        }

        dates.forEach(dateStr => {
            const entry = journalEntries[dateStr];
            const item = document.createElement('div');
            item.className = 'timeline-item';
            if (dateStr === this.selectedDate) {
                item.classList.add('active');
            }
            item.innerHTML = `
                <div class="timeline-date">${dateStr}</div>
                <div class="timeline-title">${entry.title}</div>
            `;
            item.onclick = () => this.loadEntry(dateStr);
            container.appendChild(item);
        });
    },
    
    toggleMemoryEdit: function() {
        const textarea = document.getElementById('char-memory');
        const view = document.getElementById('memory-timeline-view');
        textarea.classList.toggle('hidden');
        view.classList.toggle('hidden');
    },
    
    renderMemoryCore: function() {
        const container = document.getElementById('memory-timeline-view');
        container.innerHTML = '';
        const char = characterManager.getCurrent();
        const summary = char.summary || "核心记忆为空。";

        document.getElementById('mem-usage-display').innerText = `${summary.length} chars`;

        const memories = summary.split(/(?=\[\d{4}-\d{2}-\d{2}\])/g);

        if (memories.length === 0 || summary === "核心记忆为空。") {
            container.innerHTML = `<p class="text-sm text-gray-500">${summary}</p>`;
            return;
        }

        memories.forEach(mem => {
            if (mem.trim() === '') return;
            const dateMatch = mem.match(/\[(\d{4}-\d{2}-\d{2})\]/);
            const date = dateMatch ? dateMatch[1] : '未知日期';
            const content = mem.replace(/\[\d{4}-\d{2}-\d{2}\]\s*/, '');
            this.createMemoryNode(container, date, `<p class="mem-text">${content}</p>`);
        });
    },
    
    createMemoryNode: function(container, date, htmlContent) {
        const node = document.createElement('div');
        node.className = 'mem-node';
        node.innerHTML = `
            <div class="mem-date">${date}</div>
            ${htmlContent}
        `;
        container.appendChild(node);
    },
    
    checkDailySettlement: async function() {
        // ... (此函数保持不变)
    },
    
    generateDailyEntry: async function(dateStr, chatLogs) {
        // ... (此函数保持不变)
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

const uiManager = {
    openSettings: () => document.getElementById('settings-modal').classList.add('modal-open'),
    closeSettings: () => document.getElementById('settings-modal').classList.remove('modal-open'),
    switchTab: (tabName) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
        document.getElementById(`tab-${tabName}`).classList.remove('hidden');
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');
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
// 13. 功能坞与手账管理器 (NEW)
// ==========================================

// 侧边栏管理
const dockManager = {
    toggle: function() {
        const panel = document.getElementById('dock-panel');
        if (panel.classList.contains('open')) this.close(); else this.open();
    },
    open: function() {
        document.getElementById('dock-panel').classList.add('open');
        this.showHome(); // 每次打开都回到主菜单
    },
    close: function() {
        document.getElementById('dock-panel').classList.remove('open');
    },
    showHome: function() {
        document.getElementById('dock-home').classList.remove('hidden');
        document.getElementById('app-memo').classList.add('hidden');
    }
};

// 手账管理器 (已升级为功能完善的备忘录)
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

    // 打开备忘录界面
    open: function() {
        document.getElementById('dock-home').classList.add('hidden');
        document.getElementById('app-memo').classList.remove('hidden');
        this.renderFilterChips();
        this.render();
    },

    //  渲染所有内容（包括筛选和搜索）
    render: function() {
        const container = document.getElementById('memo-container');
        const char = characterManager.getCurrent();
        container.innerHTML = "";

        const keyword = document.getElementById('memo-search-input').value.toLowerCase();
        
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

    // 渲染顶部的筛选按钮
    renderFilterChips: function() {
        const container = document.getElementById('memo-filter-chips');
        container.innerHTML = `<button onclick="memoManager.filter('all')" class="filter-chip ${this.currentFilter === 'all' ? 'active' : ''}">全部</button>`;
        for (const key in this.categories) {
            const chip = document.createElement('button');
            chip.className = `filter-chip ${this.currentFilter === key ? 'active' : ''}`;
            chip.innerText = this.categories[key].name;
            chip.onclick = () => this.filter(key);
            container.appendChild(chip);
        }
    },

    //设置筛选条件并重新渲染
    filter: function(category) {
        this.currentFilter = category;
        this.renderFilterChips(); // 更新按钮高亮状态
        this.render();
    },

    // 显示新增/编辑弹窗
    showModal: function(memoId = null) {
        const modal = document.getElementById('memo-modal-overlay');
        const title = document.getElementById('memo-modal-title');
        const contentInput = document.getElementById('memo-content-textarea');
        const topicSelect = document.getElementById('memo-topic-select');
        const idInput = document.getElementById('memo-edit-id');
        
        // 动态填充分类选项
        topicSelect.innerHTML = '';
        for (const key in this.categories) {
            topicSelect.innerHTML += `<option value="${key}">${this.categories[key].name}</option>`;
        }
        
        if (memoId) { // 编辑模式
            title.innerText = "编辑备忘";
            const char = characterManager.getCurrent();
            const memo = char.memos.find(m => m.id == memoId);
            if (memo) {
                contentInput.value = memo.content;
                topicSelect.value = memo.topic;
                idInput.value = memo.id;
            }
        } else { // 新增模式
            title.innerText = "新增备忘";
            contentInput.value = '';
            topicSelect.value = 'default';
            idInput.value = '';
        }
        modal.classList.remove('hidden');
    },

    // 隐藏弹窗
    hideModal: function() {
        document.getElementById('memo-modal-overlay').classList.add('hidden');
    },

    // 保存备忘录 (处理新增和编辑)
    saveMemo: function() {
        const id = document.getElementById('memo-edit-id').value;
        const topic = document.getElementById('memo-topic-select').value;
        const content = document.getElementById('memo-content-textarea').value.trim();

        if (!content) {
            alert('内容不能为空！');
            return;
        }

        const char = characterManager.getCurrent();
        if (!char.memos) char.memos = [];

        if (id) { // 更新
            const memo = char.memos.find(m => m.id == id);
            if (memo) {
                memo.topic = topic;
                memo.content = content;
            }
        } else { // 新增
            char.memos.unshift({
                id: Date.now(),
                date: new Date().toLocaleString(),
                topic: topic,
                content: content
            });
        }
        
        characterManager.save();
        this.hideModal();
        this.render();
        this.showToast(id ? '备忘已更新' : '备忘已添加');
    },

    //删除备忘录
    deleteMemo: function(memoId) {
        if (confirm('确定要删除这条备忘吗？')) {
            const char = characterManager.getCurrent();
            char.memos = char.memos.filter(m => m.id != memoId);
            characterManager.save();
            this.render();
            this.showToast('备忘已删除');
        }
    },

    // AI调用的添加接口
    add: function(topic, content) {
        const char = characterManager.getCurrent();
        if (!char.memos) char.memos = [];
        
        // 检查topic是否合法，不合法则归为default
        const legalTopic = this.categories.hasOwnProperty(topic) ? topic : 'default';

        char.memos.unshift({
            id: Date.now(),
            date: new Date().toLocaleString(),
            topic: legalTopic,
            content: content
        });
        
        characterManager.save();
        this.showToast(`AI 写入了新的备忘: "${this.categories[legalTopic].name}"`);
    },
    
    // Toast通知
    showToast: function(msg) {
        const el = document.getElementById('toast-notification');
        document.getElementById('toast-msg').innerText = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 3000);
    }
};

  