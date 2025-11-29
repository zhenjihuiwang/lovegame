// ==========================================
// 1. 本地数据库 (保持不变)
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
// 2. 素材管理器 (保持不变)
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
// 3. 历史记录 (升级支持类型)
// ==========================================
const historyManager = {
    logs: [],
    add: function(role, text) {
        this.logs.push({ role: role, text: text });
    },
    show: function() {
        const container = document.getElementById('history-list');
        container.innerHTML = "";
        this.logs.forEach(log => {
            const div = document.createElement('div');
            div.className = "log-item";
            let roleName = "YOU";
            let roleClass = "user";
            
            if (log.role === 'dialogue') {
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
// 4. AI 引擎 (Prompt 重写)
// ==========================================
const aiEngine = {
    history: [],
    
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
        historyManager.add('user', text);
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
                    "text": "Description of action or atmosphere.",
                    "visual": { "bg": "ID", "audio": { "bgm": "ID", "sfx": "ID" } }
                },
                { 
                    "type": "dialogue", 
                    "text": "Character line 1.", 
                    "visual": { "sprite": "ID", "zoom": 2.0, "focus": "50% 20%" }
                },
                { 
                    "type": "dialogue", 
                    "text": "Character line 2.", 
                    "visual": { "sprite": "ID_2", "zoom": 1.0 }
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
                // 收到新剧本，交给导演加载
                if (responseObj.script && Array.isArray(responseObj.script)) {
                    director.loadScript(responseObj.script);
                    this.history.push({ role: "assistant", content: content });
                } else {
                    // 兼容旧格式（万一AI犯蠢）
                    director.loadScript([{ type: 'dialogue', text: responseObj.text || content, visual: responseObj.visual, audio: responseObj.audio }]);
                }
            } catch(e) {
                // 兜底：纯文本
                director.loadScript([{ type: 'dialogue', text: content }]);
            }

        } catch(e) {
            director.loadScript([{ type: 'narration', text: `Connection Error: ${e.message}` }]);
        } finally {
            btn.style.opacity = "1";
        }
    }
};

// ==========================================
// 5. 导演引擎 (核心升级：状态机)
// ==========================================
const director = {
    queue: [],
    cursor: 0,

    // 加载新剧本
    loadScript: function(scriptArray) {
        this.queue = scriptArray;
        this.cursor = 0;
        document.getElementById('dialogue-box').classList.remove('hidden');
        this.renderStep();
    },

    // 下一句
    next: function() {
        if (this.cursor < this.queue.length - 1) {
            this.cursor++;
            this.renderStep();
        } else {
            // 剧本播完了，提示用户输入
            // 可以加一个 visual feedback，比如箭头闪烁停止
        }
    },

    // 上一句
    prev: function() {
        if (this.cursor > 0) {
            this.cursor--;
            this.renderStep();
        }
    },

    // 渲染当前步
    renderStep: function() {
        const step = this.queue[this.cursor];
        if (!step) return;

        // 1. UI 状态控制 (前进后退按钮)
        const btnPrev = document.getElementById('btn-prev');
        const indicator = document.getElementById('indicator-next');
        const box = document.getElementById('dialogue-box');
        const nameEl = document.getElementById('char-name');

        if (this.cursor > 0) btnPrev.classList.remove('hidden');
        else btnPrev.classList.add('hidden');

        if (this.cursor >= this.queue.length - 1) indicator.style.opacity = "0.3"; // 到底了变淡
        else indicator.style.opacity = "1";

        // 2. 文本与样式
        document.getElementById('dialogue-text').innerText = step.text;
        
        // 记录历史（如果是第一次播放到这一步，可以记一下，这里为了简化，每次 request 成功时已记入）
        // 如果想记录用户的每一步阅读，逻辑会更复杂，这里暂不处理。

        // 旁白 vs 对话 样式切换
        if (step.type === 'narration') {
            box.classList.add('narration-mode');
        } else {
            box.classList.remove('narration-mode');
            // 更新名字（以防万一配置改了）
            nameEl.innerText = aiEngine.getConfig().charName;
        }

        // 3. 视觉渲染
        if (step.visual) {
            const wrapper = document.getElementById('char-wrapper');
            const charImg = document.getElementById('char-img');
            const bgImg = document.getElementById('bg-img');
            const cache = assetManager.cache;

            // 运镜
            wrapper.style.transform = `scale(${step.visual.zoom || 1})`;
            wrapper.style.transformOrigin = step.visual.focus || "50% 25%";
            bgImg.style.filter = step.visual.filter || "none";

            // 换图
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

        // 4. 音频渲染
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

const app = {
    start: function() {
        document.getElementById('start-overlay').style.display = 'none';
        assetManager.init().then(() => {
            document.getElementById('api-url').value = aiEngine.getConfig().url;
            document.getElementById('api-key').value = aiEngine.getConfig().key;
            
            const savedModel = aiEngine.getConfig().model;
            const select = document.getElementById('api-model');
            const opt = document.createElement('option');
            opt.value = savedModel; opt.text = savedModel; select.add(opt);

            document.getElementById('persona-name').value = aiEngine.getConfig().charName;
            document.getElementById('persona-prompt').value = aiEngine.getConfig().sysPrompt;
            document.getElementById('char-name').innerText = aiEngine.getConfig().charName;
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