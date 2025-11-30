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
// 6. 角色管理器
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
        const newChar = { id: Date.now().toString(), name: "新角色", prompt: "人设...", userName: "玩家", userDesc: "", relation: "初识" };
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
    updateCurrentFromUI: function() {
        const char = this.getCurrent(); if(!char) return;
        char.name = document.getElementById('persona-name').value;
        char.prompt = document.getElementById('persona-prompt').value;
        char.userName = document.getElementById('user-name').value;
        char.userDesc = document.getElementById('user-desc').value;
        char.relation = document.getElementById('user-relation').value;
        this.save(); this.renderList();
    },
    loadCurrent: function() {
        const char = this.getCurrent(); if(!char) return;
        document.getElementById('persona-name').value = char.name;
        document.getElementById('persona-prompt').value = char.prompt;
        document.getElementById('user-name').value = char.userName;
        document.getElementById('user-desc').value = char.userDesc;
        document.getElementById('user-relation').value = char.relation;
        document.getElementById('char-name').innerText = char.name;
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
// 10. AI 引擎
// ==========================================
const aiEngine = {
    history: [], currentMode: 'dialogue',
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

    buildSystemPrompt: function() {
        const conf = this.getConfig();
        const assets = assetManager.cache;
        const charTags = Object.keys(assets.char).join(', ');
        const bgTags = Object.keys(assets.bg).join(', ');
        const bgmTags = Object.keys(assets.bgm).join(', ');
        const sfxTags = Object.keys(assets.sfx).join(', ');
        const timeCtx = timeManager.getTimeContext();

        return `
        ${conf.sysPrompt}
        
        === 用户信息 ===
        姓名: ${conf.userName}
        描述: ${conf.userDesc}
        关系: ${conf.relation}
        =================

        === 现实时间 ===
        ${timeCtx.fullTime} (${timeCtx.timeOfDay})
        ================

        [重要指令 - 情绪控制]:
        1. **情绪分级**：立绘标签中，像 "neutral", "smile", "calm" 是【Level 1 日常情绪】；而 "cry", "shout", "blush" 是【Level 2 极端情绪】。
        2. **表演克制**：默认只使用 Level 1 情绪。严禁在没有铺垫的情况下突然切换到 Level 2。

        [重要指令 - 记忆手账]:
        如果玩家在对话中提到了**新的**个人喜好、重要经历或共同回忆（如爱吃的食物、生日、约定），且你觉得值得记录，请在返回的 JSON 中包含 "memo" 字段。
        "memo" 格式: { "topic": "diet|date|like|hate|secret|default", "content": "用第一人称简短记录你的想法" }
        例如: { "script": [...], "memo": { "topic": "diet", "content": "原来他喜欢吃饺子，下次包给他吃。" } }

        [重要指令 - 素材调用]:
        1. 必须返回严格的 JSON 格式。严禁 Markdown。
        2. **严禁翻译标签！！** 必须原样使用以下列表中的字符串（包含中文）：
           - 立绘列表(sprite): [${charTags}]
           - 背景列表(bg): [${bgTags}]
           - 音乐列表(bgm): [${bgmTags}]
           - 音效列表(sfx): [${sfxTags}]
        3. 如果你想调用的标签不在上述列表中，**绝对不要**在 JSON 中包含 visual/audio 字段。
        
        输出格式:
        {
            "script": [
                { 
                    "type": "narration", 
                    "text": "场景描述...",
                    "visual": { "bg": "ID", "audio": { "bgm": "ID", "sfx": "ID" } }
                },
                { 
                    "type": "dialogue", 
                    "text": "角色台词...", 
                    "visual": { "sprite": "ID", "zoom": 1.0 }
                }
            ]
        }`;
    },

    request: async function() {
        const conf = this.getConfig();
        if(!conf.key) return alert("请先配置 API Key");
        const btn = document.getElementById('trigger-btn');
        btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i>`;

        try {
            const chatUrl = this.fixUrl(conf.url, "/chat/completions");
            const res = await fetch(chatUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${conf.key}` },
                body: JSON.stringify({ model: conf.model, messages: this.history, temperature: 0.7 })
            });
            const data = await res.json();
            let content = data.choices[0].message.content.replace(/```json/g, "").replace(/```/g, "").trim();
            try {
                const responseObj = JSON.parse(content);
                if (responseObj.memo) {
                    memoManager.add(responseObj.memo.topic, responseObj.memo.content);
                }
                if (responseObj.script && Array.isArray(responseObj.script)) {
                    director.loadScript(responseObj.script);
                    this.history.push({ role: "assistant", content: content });
                    responseObj.script.forEach(step => historyManager.add(step.type, step.text));
                } else {
                    director.loadScript([{ type: 'dialogue', text: responseObj.text || content }]);
                    historyManager.add('dialogue', responseObj.text || content);
                }
                this.saveContext();
                timeManager.updateLastInteraction();
            } catch(e) {
                director.loadScript([{ type: 'dialogue', text: content }]);
                historyManager.add('dialogue', content);
            }
        } catch(e) {
            director.loadScript([{ type: 'narration', text: `连接错误: ${e.message}` }]);
        } finally {
            btn.innerHTML = `<i class="ph ph-sparkle text-xl"></i>`;
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
            setTimeout(() => aiEngine.triggerGreeting(), 800);
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

// 手账管理器
const memoManager = {
    // 图标映射
    icons: {
        'diet': 'ph-bowl-food', // 饮食
        'date': 'ph-calendar-heart', // 约会/时间
        'like': 'ph-heart', // 喜好
        'hate': 'ph-thumbs-down', // 厌恶
        'secret': 'ph-lock-key', // 秘密
        'default': 'ph-push-pin' // 默认
    },

    open: function() {
        document.getElementById('dock-home').classList.add('hidden');
        document.getElementById('app-memo').classList.remove('hidden');
        this.render();
    },

    add: function(topic, content) {
        const char = characterManager.getCurrent();
        if (!char.memos) char.memos = [];
        
        // 存入数据
        char.memos.unshift({
            id: Date.now(),
            date: new Date().toLocaleString(),
            topic: topic || 'default',
            content: content
        });
        
        characterManager.save(); // 保存到本地存储
        this.showToast(`已记入 "${topic}"`);
    },

    render: function() {
        const container = document.getElementById('memo-container');
        const char = characterManager.getCurrent();
        container.innerHTML = "";

        if (!char.memos || char.memos.length === 0) {
            container.innerHTML = `<div class="text-center text-[10px] text-gray-700 mt-10 italic">暂无记录...</div>`;
            return;
        }

        char.memos.forEach(memo => {
            const iconClass = this.icons[memo.topic] || this.icons['default'];
            // 只显示日期的月/日 时间
            const shortDate = memo.date.split(' ')[0]; 
            
            const card = document.createElement('div');
            card.className = "memo-card";
            card.innerHTML = `
                <div class="memo-header">
                    <div class="memo-topic"><i class="ph ${iconClass}"></i> ${memo.topic}</div>
                    <div class="memo-date">${shortDate}</div>
                </div>
                <div class="memo-text">“${memo.content}”</div>
            `;
            container.appendChild(card);
        });
    },

    showToast: function(msg) {
        const el = document.getElementById('toast-notification');
        document.getElementById('toast-msg').innerText = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 3000);
    }
};