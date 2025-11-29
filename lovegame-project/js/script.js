// ==========================================
// 1. 本地数据库 (IndexedDB - Assets)
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
    saveAsset: function(type, tag, fileBlob) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction("assets", "readwrite");
            const id = `${type}_${tag}`; 
            tx.objectStore("assets").put({ id: id, type: type, tag: tag, blob: fileBlob });
            tx.oncomplete = () => resolve(id);
            tx.onerror = () => reject();
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
// 2. 素材管理器
// ==========================================
const assetManager = {
    cache: { char: {}, bg: {}, audio: {} },
    init: async function() { await dbSystem.init(); await this.refreshCache(); },
    refreshCache: async function() {
        const items = await dbSystem.getAllAssets();
        this.cache = { char: {}, bg: {}, audio: {} };
        const listEl = document.getElementById('assets-list');
        if(listEl) listEl.innerHTML = "";
        items.forEach(item => {
            const url = URL.createObjectURL(item.blob);
            this.cache[item.type][item.tag] = url;
            if(listEl) this.renderAssetItem(item, url, listEl);
        });
    },
    renderAssetItem: function(item, url, container) {
        const div = document.createElement('div');
        div.className = "relative aspect-square bg-white/5 border border-white/10 group cursor-pointer";
        div.onclick = () => { if(confirm(`Delete ${item.tag}?`)) dbSystem.deleteAsset(item.id).then(() => this.refreshCache()); };
        div.innerHTML = item.type === 'audio' ? `<div class="w-full h-full flex items-center justify-center text-white/50"><i class="ph ph-speaker-high text-2xl"></i></div>` : `<img src="${url}" class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition">`;
        div.innerHTML += `<div class="absolute bottom-0 inset-x-0 bg-black/80 text-[9px] text-gray-300 text-center py-1 font-mono">${item.tag}</div>`;
        container.appendChild(div);
    },
    handleUpload: async function() {
        const file = document.getElementById('upload-file').files[0];
        const type = document.getElementById('upload-type').value;
        const tag = document.getElementById('upload-tag').value.trim();
        if(!file || !tag) return alert("File & Tag required.");
        try { await dbSystem.saveAsset(type, tag, file); alert("Saved."); this.refreshCache(); } 
        catch(e) { alert("Failed."); }
    }
};

// ==========================================
// 3. 历史记录 (持久化升级)
// ==========================================
const historyManager = {
    logs: [],

    init: function() {
        // 从本地存储读取历史
        const saved = localStorage.getItem('chat_history');
        if (saved) {
            try {
                this.logs = JSON.parse(saved);
            } catch (e) {
                console.error("History parse error", e);
            }
        }
    },

    add: function(role, text) {
        this.logs.push({ role: role, text: text });
        this.save();
    },

    save: function() {
        localStorage.setItem('chat_history', JSON.stringify(this.logs));
    },

    clear: function() {
        if(confirm("Permanently delete all chat history?")) {
            this.logs = [];
            this.save();
            aiEngine.clearContext(); // 同时清除 AI 上下文
            alert("History Cleared.");
            this.hide();
        }
    },

    show: function() {
        const container = document.getElementById('history-list');
        container.innerHTML = "";
        
        if (this.logs.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-700 text-xs mt-10">NO RECORDS</div>`;
        }

        this.logs.forEach(log => {
            const div = document.createElement('div');
            div.className = "log-item";
            let roleName = "YOU";
            let roleClass = "user";
            
            if (log.role === 'dialogue' || log.role === 'assistant') { // assistant 是为了兼容
                roleName = aiEngine.getConfig().charName;
                roleClass = "ai";
            } else if (log.role === 'narration') {
                roleName = "NARRATION";
                roleClass = "narr";
            }
            div.innerHTML = `<span class="log-role ${roleClass}">${roleName}</span><div class="log-text">${log.text}</div>`;
            container.appendChild(div);
        });
        document.getElementById('history-modal').classList.add('modal-open');
        setTimeout(() => { container.scrollTop = container.scrollHeight; }, 100);
    },
    hide: function() { document.getElementById('history-modal').classList.remove('modal-open'); }
};

// ==========================================
// 4. 数据备份与恢复 (新增模块)
// ==========================================
const dataManager = {
    backup: function() {
        const data = {
            config: {
                url: localStorage.getItem('conf_url'),
                key: localStorage.getItem('conf_key'),
                model: localStorage.getItem('conf_model'),
                charName: localStorage.getItem('conf_charName'),
                sysPrompt: localStorage.getItem('conf_sysPrompt')
            },
            history: historyManager.logs,
            context: aiEngine.history // 保存 AI 的上下文记忆
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().slice(0,10);
        a.download = `loveos_backup_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    restore: function(input) {
        const file = input.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                
                // 恢复配置
                if(data.config) {
                    if(data.config.url) localStorage.setItem('conf_url', data.config.url);
                    if(data.config.key) localStorage.setItem('conf_key', data.config.key);
                    if(data.config.model) localStorage.setItem('conf_model', data.config.model);
                    if(data.config.charName) localStorage.setItem('conf_charName', data.config.charName);
                    if(data.config.sysPrompt) localStorage.setItem('conf_sysPrompt', data.config.sysPrompt);
                }

                // 恢复历史
                if(data.history) {
                    historyManager.logs = data.history;
                    historyManager.save();
                }

                // 恢复 AI 上下文
                if(data.context) {
                    aiEngine.history = data.context;
                    aiEngine.saveContext();
                }

                alert("System Restored Successfully. Reloading...");
                location.reload();

            } catch (err) {
                alert("Invalid Backup File.");
                console.error(err);
            }
        };
        reader.readAsText(file);
    }
};

// ==========================================
// 5. AI 引擎 (持久化升级)
// ==========================================
const aiEngine = {
    history: [], // 上下文记忆
    
    init: function() {
        const savedCtx = localStorage.getItem('ai_context');
        if(savedCtx) {
            try { this.history = JSON.parse(savedCtx); } catch(e){}
        }
    },

    saveContext: function() {
        localStorage.setItem('ai_context', JSON.stringify(this.history));
    },

    clearContext: function() {
        this.history = [];
        this.saveContext();
    },
    
    getConfig: function() {
        return {
            url: localStorage.getItem('conf_url') || "https://gcli.ggchan.dev",
            key: localStorage.getItem('conf_key') || "",
            model: localStorage.getItem('conf_model') || "gpt-3.5-turbo",
            charName: localStorage.getItem('conf_charName') || "UNKNOWN",
            sysPrompt: localStorage.getItem('conf_sysPrompt') || "Roleplay."
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

        if (!urlInput || !keyInput) return alert("Missing URL or Key");
        statusEl.innerText = "CONNECTING...";
        
        try {
            let modelsUrl = this.fixUrl(urlInput, "/models");
            const res = await fetch(modelsUrl, { headers: { "Authorization": `Bearer ${keyInput}` } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const models = data.data || [];
            selectEl.innerHTML = "";
            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id; opt.text = m.id; selectEl.add(opt);
            });
            statusEl.innerText = "CONNECTED";
            statusEl.className = "text-[10px] text-[#D4AF37] mt-1 text-right";
        } catch (e) {
            statusEl.innerText = "FAILED";
            statusEl.className = "text-[10px] text-red-500 mt-1 text-right";
        }
    },

    send: function() {
        const input = document.getElementById('user-input');
        const text = input.value.trim();
        if(!text) return;
        input.value = "";
        
        if(this.history.length === 0) this.history.push({ role: "system", content: this.buildSystemPrompt() });
        this.history.push({ role: "user", content: text });
        this.saveContext(); // 保存上下文
        
        historyManager.add('user', text); // 保存可见历史

        this.request();
    },

    buildSystemPrompt: function() {
        const conf = this.getConfig();
        const assets = assetManager.cache;
        const charTags = Object.keys(assets.char).join(', ');
        const bgTags = Object.keys(assets.bg).join(', ');
        const audioTags = Object.keys(assets.audio).join(', ');

        return `
        ${conf.sysPrompt}
        STRICT JSON RESPONSE. NO MARKDOWN.
        ASSETS: Sprite[${charTags}], BG[${bgTags}], Audio[${audioTags}]
        
        TASK: Generate a scene with multiple steps (script).
        TYPE: "dialogue" (Character speaks) OR "narration" (Scene description).
        
        FORMAT:
        {
            "script": [
                { 
                    "type": "narration", 
                    "text": "Description...",
                    "visual": { "bg": "ID", "audio": { "bgm": "ID", "sfx": "ID" } }
                },
                { 
                    "type": "dialogue", 
                    "text": "Character line.", 
                    "visual": { "sprite": "ID", "zoom": 1.0 }
                }
            ]
        }`;
    },

    request: async function() {
        const conf = this.getConfig();
        if(!conf.key) return alert("Configure API Key first.");
        const btn = document.getElementById('send-btn');
        btn.style.opacity = "0.5";

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
                // 收到新剧本
                if (responseObj.script && Array.isArray(responseObj.script)) {
                    director.loadScript(responseObj.script);
                    this.history.push({ role: "assistant", content: content });
                    
                    // 将 AI 回复也拆解存入历史记录，方便阅读
                    responseObj.script.forEach(step => {
                        historyManager.add(step.type, step.text);
                    });
                } else {
                    director.loadScript([{ type: 'dialogue', text: responseObj.text || content }]);
                    // 兼容旧格式日志
                    historyManager.add('dialogue', responseObj.text || content);
                }
                this.saveContext(); // 保存 AI 记忆

            } catch(e) {
                director.loadScript([{ type: 'dialogue', text: content }]);
                historyManager.add('dialogue', content);
            }

        } catch(e) {
            director.loadScript([{ type: 'narration', text: `Connection Error: ${e.message}` }]);
        } finally {
            btn.style.opacity = "1";
        }
    }
};

// ==========================================
// 6. 导演引擎
// ==========================================
const director = {
    queue: [],
    cursor: 0,

    loadScript: function(scriptArray) {
        this.queue = scriptArray;
        this.cursor = 0;
        document.getElementById('dialogue-box').classList.remove('hidden');
        this.renderStep();
    },

    next: function() {
        if (this.cursor < this.queue.length - 1) {
            this.cursor++;
            this.renderStep();
        }
    },

    prev: function() {
        if (this.cursor > 0) {
            this.cursor--;
            this.renderStep();
        }
    },

    renderStep: function() {
        const step = this.queue[this.cursor];
        if (!step) return;

        // UI 状态
        const btnPrev = document.getElementById('btn-prev');
        const indicator = document.getElementById('indicator-next');
        const box = document.getElementById('dialogue-box');
        const nameEl = document.getElementById('char-name');

        if (this.cursor > 0) btnPrev.classList.remove('hidden');
        else btnPrev.classList.add('hidden');

        if (this.cursor >= this.queue.length - 1) indicator.style.opacity = "0.3"; 
        else indicator.style.opacity = "1";

        // 文本
        document.getElementById('dialogue-text').innerText = step.text;
        
        // 样式切换
        if (step.type === 'narration') {
            box.classList.add('narration-mode');
        } else {
            box.classList.remove('narration-mode');
            nameEl.innerText = aiEngine.getConfig().charName;
        }

        // 视觉
        if (step.visual) {
            const wrapper = document.getElementById('char-wrapper');
            const charImg = document.getElementById('char-img');
            const bgImg = document.getElementById('bg-img');
            const cache = assetManager.cache;

            wrapper.style.transform = `scale(${step.visual.zoom || 1})`;
            wrapper.style.transformOrigin = step.visual.focus || "50% 25%";
            bgImg.style.filter = step.visual.filter || "none";

            if(step.visual.sprite && cache.char[step.visual.sprite]) {
                charImg.src = cache.char[step.visual.sprite];
                charImg.classList.remove('hidden');
            }
            if(step.visual.bg && cache.bg[step.visual.bg]) {
                if(bgImg.src !== cache.bg[step.visual.bg]) {
                    bgImg.style.opacity = 0;
                    setTimeout(() => {
                        bgImg.src = cache.bg[step.visual.bg];
                        bgImg.style.opacity = 1;
                        document.getElementById('bg-placeholder').classList.add('hidden');
                    }, 300);
                }
            }
        }

        // 音频
        if (step.audio) {
            const cache = assetManager.cache;
            const play = (el, id) => {
                if(id && cache.audio[id] && el.src !== cache.audio[id]) {
                    el.src = cache.audio[id];
                    el.play();
                }
            };
            if(step.audio.bgm) play(document.getElementById('audio-bgm'), step.audio.bgm);
            if(step.audio.sfx) play(document.getElementById('audio-sfx'), step.audio.sfx);
        }
    }
};

// ==========================================
// 7. App 启动
// ==========================================
const app = {
    start: function() {
        document.getElementById('start-overlay').style.display = 'none';
        
        // 初始化各个模块
        assetManager.init().then(() => {
            // 回显配置
            document.getElementById('api-url').value = aiEngine.getConfig().url;
            document.getElementById('api-key').value = aiEngine.getConfig().key;
            
            const savedModel = aiEngine.getConfig().model;
            const select = document.getElementById('api-model');
            const opt = document.createElement('option');
            opt.value = savedModel; opt.text = savedModel; select.add(opt);

            document.getElementById('persona-name').value = aiEngine.getConfig().charName;
            document.getElementById('persona-prompt').value = aiEngine.getConfig().sysPrompt;
            document.getElementById('char-name').innerText = aiEngine.getConfig().charName;
            
            // 初始化历史记录和记忆
            historyManager.init();
            aiEngine.init();
        });
    },
    saveAllSettings: function() {
        localStorage.setItem('conf_url', document.getElementById('api-url').value);
        localStorage.setItem('conf_key', document.getElementById('api-key').value);
        localStorage.setItem('conf_model', document.getElementById('api-model').value);
        localStorage.setItem('conf_charName', document.getElementById('persona-name').value);
        localStorage.setItem('conf_sysPrompt', document.getElementById('persona-prompt').value);
        
        document.getElementById('char-name').innerText = document.getElementById('persona-name').value;
        uiManager.closeSettings();
        alert("SYSTEM SAVED");
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
    if (typeof director === 'undefined') alert("Error: Scripts not loaded.");
};