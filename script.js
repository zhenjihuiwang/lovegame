// ==========================================
//   全局变量定义
// ==========================================
let currentChatId = null;
let friendsData = [];
let chatHistory = {}; 
let bubblePresets = []; 
let currentTheme = 'theme-candy'; // 默认主题
let stickerLibrary = []; // 存储所有表情包对象 {id, src, desc}
let momentsData = []; // 存储所有动态
let isWorldActive = true; // 默认世界是运转的
let currentVideoLog = []; // 暂存当前视频通话的剧本
let videoCallStartTime = null;

// === 新增工具：将时间戳转为 HH:mm ===
function formatMsgTime(timestamp) {
    if (!timestamp) return ""; // 如果没时间戳，就不显示
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
}

// API 配置
let apiConfig = {
    url: "https://api.openai.com/v1",
    key: "",
    model: "gpt-3.5-turbo"
};

// 交互相关
let selectedMsgIndex = null;
let isSelectionMode = false;
let selectedIndices = new Set();
let currentQuote = null;

// 打字机相关
let aiBuffer = "";        
let isStreamActive = false; 
let typeIndex = 0;        
let typeTimer = null;     
let currentBubbleDOM = null; 

// ==========================================
//   初始化与数据迁移 (升级版)
// ==========================================
window.onload = async function() {
    // 配置数据库
    localforage.config({
        name: 'AIChatPhone',
        storeName: 'data_store'
    });

    // --- 自动迁移：把旧的 localStorage 数据搬家到无限数据库 ---
    const oldCheck = localStorage.getItem('ai_friends');
    if (oldCheck) {
        if(confirm("系统升级：检测到旧的聊天记录，是否迁移到大容量数据库？\n(迁移后请勿清除浏览器缓存)")) {
            try {
                // 搬运数据
                await localforage.setItem('ai_friends', JSON.parse(localStorage.getItem('ai_friends')));
                const chats = JSON.parse(localStorage.getItem('ai_chats'));
                await localforage.setItem('ai_chats', chats);
                
                const cfg = localStorage.getItem('ai_config');
                if(cfg) await localforage.setItem('ai_config', JSON.parse(cfg));
                
                const theme = localStorage.getItem('ai_theme');
                if(theme) await localforage.setItem('ai_theme', theme);
                
                const stickers = localStorage.getItem('ai_stickers');
                if(stickers) await localforage.setItem('ai_stickers', JSON.parse(stickers));

                // 清空旧仓库，防止冲突
                localStorage.clear();
                alert("✅ 迁移成功！现在你可以存储无限多的聊天记录和图片了！");
            } catch(e) {
                alert("迁移失败，请手动备份：" + e.message);
            }
        }
    }

    // 正常加载流程
    await loadData();
    await loadSoundSettings(); // 加载声音配置
    renderFriendList();
    
    // 启动状态栏更新
    updateStatusBar();
    setInterval(updateStatusBar, 1000);
    initBattery();
};

function goToScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ==========================================
//   数据存储 (升级版：使用 IndexedDB)
// ==========================================
async function saveData() {
    try {
        await localforage.setItem('ai_friends', friendsData);
        await localforage.setItem('ai_chats', chatHistory);
        await localforage.setItem('ai_config', apiConfig);
        await localforage.setItem('ai_presets', bubblePresets);
        await localforage.setItem('ai_theme', currentTheme);
        await localforage.setItem('ai_stickers', stickerLibrary);
        await localforage.setItem('ai_moments', momentsData);

    } catch (e) {
        console.error("保存失败:", e);
        alert("保存失败，硬盘可能满了？");
    }
}


// ==========================================
//   数据读取 (升级版：使用 IndexedDB)
// ==========================================
async function loadData() {
    try {
        const f = await localforage.getItem('ai_friends');
        const c = await localforage.getItem('ai_chats');
        const cfg = await localforage.getItem('ai_config');
        const presets = await localforage.getItem('ai_presets');
        const savedTheme = await localforage.getItem('ai_theme');
        const stickers = await localforage.getItem('ai_stickers');
        const moments = await localforage.getItem('ai_moments');

        if(f) friendsData = f;
        if(c) chatHistory = c;
        if(stickers) stickerLibrary = stickers;
        if(presets) bubblePresets = presets;
        if(moments) momentsData = moments;
        
        if(cfg) {
            apiConfig = cfg;
            document.getElementById('api-url').value = apiConfig.url || "";
            document.getElementById('api-key').value = apiConfig.key || "";
            // 回填模型逻辑
            const modelSelect = document.getElementById('api-model');
            if (apiConfig.model && modelSelect) {
                const option = document.createElement("option");
                option.value = apiConfig.model;
                option.text = apiConfig.model;
                modelSelect.add(option);
                modelSelect.value = apiConfig.model;
            }
        }

        // 初始化默认预设
        if (!bubblePresets || bubblePresets.length === 0) {
            bubblePresets = [
                { name: "默认样式", ai: "", user: "" },
                { name: "少女粉", ai: "background-color: #fff0f5; color: #d63384; border: 1px solid #ffb6c1;", user: "background-color: #ffb6c1; color: white;" }
            ];
        }

        // 应用主题
        if (savedTheme) {
            currentTheme = savedTheme;
            applyTheme(currentTheme);
        }
    } catch (e) {
        console.error("读取数据失败:", e);
    }

    // === 新增：加载全局开关状态 ===
    const worldStatus = await localforage.getItem('ai_world_active');
    if (worldStatus !== null) {
        isWorldActive = worldStatus;
    }
    // 更新设置页面的开关UI
    const toggle = document.getElementById('global-world-toggle');
    if(toggle) toggle.checked = isWorldActive;
}

// ==========================================
//   API 设置与拉取
// ==========================================
function saveApiSettings() {
    apiConfig.url = document.getElementById('api-url').value;
    apiConfig.key = document.getElementById('api-key').value;
    apiConfig.model = document.getElementById('api-model').value;
    saveData();
    alert("API设置已保存！");
    goToScreen('screen-home');
}

async function fetchModels() {
    const urlInput = document.getElementById('api-url').value.trim();
    const keyInput = document.getElementById('api-key').value.trim();
    const checkBtn = document.querySelector('.check-btn');
    const selectBox = document.getElementById('api-model');

    if (!urlInput || !keyInput) {
        alert("请先填写 API URL 和 API Key！");
        return;
    }

    checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    checkBtn.disabled = true;

    let baseUrl = urlInput.replace(/\/$/, ''); 

    try {
        const response = await fetch(`${baseUrl}/models`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${keyInput}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`连接失败 (状态码: ${response.status})`);

        const data = await response.json();
        if (data && data.data && Array.isArray(data.data)) {
            selectBox.innerHTML = '';
            data.data.sort((a, b) => a.id.localeCompare(b.id));
            data.data.forEach(model => {
                const option = document.createElement('option');
                option.value = model.id;
                option.text = model.id;
                selectBox.appendChild(option);
            });
            alert(`✅ 成功连接！获取到 ${data.data.length} 个模型。`);
        } else {
            throw new Error("API返回格式不正确");
        }
    } catch (error) {
        alert("❌ 获取失败：" + error.message);
    } finally {
        checkBtn.innerHTML = '<i class="fas fa-sync-alt"></i> 拉取';
        checkBtn.disabled = false;
    }
}

// ==========================================
//   好友管理
// ==========================================
function saveFriend() {
    const charName = document.getElementById('char-name').value || "AI角色";
    const charAvatar = document.getElementById('char-avatar').value || "https://cdn-icons-png.flaticon.com/512/4712/4712035.png";
    const charPrompt = document.getElementById('char-prompt').value;
    
    const userName = document.getElementById('user-name').value || "我";
    const userAvatar = document.getElementById('user-avatar').value || "https://cdn-icons-png.flaticon.com/512/1077/1077114.png";
    const userIntro = document.getElementById('user-intro').value; // 读取用户人设

    const newFriend = {
        id: Date.now().toString(),
        name: charName,
        avatar: charAvatar,
        prompt: charPrompt,
        userName: userName,
        userAvatar: userAvatar,
        userIntro: userIntro
    };

    friendsData.push(newFriend);
    saveData();
    renderFriendList();
    
    document.getElementById('char-name').value = '';
    document.getElementById('char-prompt').value = '';
    alert("角色创建成功！");
    goToScreen('screen-friends');
}

function renderFriendList() {
    const container = document.getElementById('friend-list-container');
    container.innerHTML = '';

    friendsData.forEach(friend => {
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.onclick = () => openChat(friend.id);
        div.innerHTML = `
            <img src="${friend.avatar}" class="friend-avatar">
            <div class="friend-info">
                <h4>${friend.name}</h4>
                <p>点击开始聊天</p>
            </div>
        `;
        container.appendChild(div);
    });
}

// ==========================================
//   聊天核心功能
// ==========================================
function openChat(friendId) {
    currentChatId = friendId;
    const friend = friendsData.find(f => f.id === friendId);
    document.getElementById('chat-title').innerText = friend.name;
    
    // 应用背景图
    const chatScreen = document.getElementById('screen-chat');
    if (friend.chatBg) {
        chatScreen.style.backgroundImage = `url('${friend.chatBg}')`;
        chatScreen.style.backgroundSize = "cover";
        chatScreen.style.backgroundPosition = "center";
    } else {
        chatScreen.style.backgroundImage = ""; 
        chatScreen.style.backgroundColor = ""; 
    }

    // 应用自定义气泡样式
    let styleTag = document.getElementById('dynamic-chat-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-chat-style';
        document.head.appendChild(styleTag);
    }
    const aiStyle = friend.aiBubbleStyle || "";
    const userStyle = friend.userBubbleStyle || "";
    styleTag.innerHTML = `
        #chat-box .message.ai .msg-bubble { ${aiStyle} }
        #chat-box .message.user .msg-bubble { ${userStyle} }
    `;

    goToScreen('screen-chat');
    renderChatHistory();
}

// ============================================================
//   核心渲染逻辑 (修复版：包含红包、系统消息、多选、点击事件)
// ============================================================

// 1. 渲染整个聊天列表
function renderChatHistory() {
    const box = document.getElementById('chat-box');
    if (!box) return; 
    
    box.innerHTML = '';
    
    if (!currentChatId || !chatHistory[currentChatId]) {
        return;
    }

    const history = chatHistory[currentChatId];
    const friend = friendsData.find(f => f.id === currentChatId);

    if (!friend) return;

    history.forEach((msg, index) => {
        const isUser = msg.role === 'user';
        const avatar = isUser ? friend.userAvatar : friend.avatar;
        
        // 这里的 msg.timestamp 非常重要
        appendMessageToUI(msg.content, isUser, avatar, index, msg.timestamp);
    });
    
    if (!isSelectionMode && !document.querySelector('.typing-dots')) {
        scrollToBottom();
    }
}

// 2. 渲染单条消息
function appendMessageToUI(content, isUser, avatarUrl, index, timestamp) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `message ${isUser ? 'user' : 'ai'}`;
    
    // 1. 生成时间字符串和HTML
    let timeString = timestamp ? formatMsgTime(timestamp) : "";
    const timeHtml = timeString ? `<span class="msg-time">${timeString}</span>` : '';

    // 2. 根据消息类型生成不同的内部HTML
    let innerHtml = '';

    if (content.startsWith('###SYSTEM:')) {
        // 系统消息保持居中，不加头像和时间
        div.className = 'message system'; // 覆盖之前的class
        const sysText = content.replace('###SYSTEM:', '');
        innerHtml = `<div class="msg-bubble">${sysText}</div>`;

    } else if (content.startsWith('###RED_PACKET:')) {
        // 红包消息
        const jsonStr = content.replace('###RED_PACKET:', '').replace('###', '');
        const rpData = JSON.parse(jsonStr);
        const statusClass = (rpData.status !== 'pending') ? 'disabled' : '';
        const statusText = rpData.status === 'pending' ? '微信红包' : (rpData.status === 'received' ? '红包已领取' : '红包已退回');
        const clickAction = (!isSelectionMode && index !== undefined) ? `onclick="openRedPacket(${index})"` : "";
        innerHtml = `
            <img src="${avatarUrl}" class="msg-avatar">
            <div class="bubble-red-packet ${statusClass}" ${clickAction}>
                <div class="rp-content">
                    <div class="rp-icon"><i class="fas fa-money-bill-wave"></i></div>
                    <div class="rp-info"><h4>${rpData.text}</h4><p>${statusText}</p></div>
                </div>
                <div class="rp-footer">Red Packet</div>
                ${timeHtml} <!-- 核心修改：时间放在红包气泡内部 -->
            </div>
        `;
    } else if (content.startsWith('###STICKER:')) {
        // 表情包消息
        const jsonStr = content.replace('###STICKER:', '').replace('###', '');
        const sData = JSON.parse(jsonStr);
        let imgSrc = sData.src;
        if (!imgSrc && sData.id) {
            const found = stickerLibrary.find(s => s.id == sData.id);
            if (found) imgSrc = found.src;
        }
        if (!imgSrc) imgSrc = "https://cdn-icons-png.flaticon.com/512/2748/2748558.png";
        innerHtml = `
            <img src="${avatarUrl}" class="msg-avatar">
            <div class="msg-bubble bubble-sticker">
                <img src="${imgSrc}" title="${sData.desc || '表情包'}">
                ${timeHtml} <!-- 核心修改：时间放在表情气泡内部 -->
            </div>
        `;

        } else if (content.startsWith('###VIDEO_LOG:')) {
        // === 新增：视频记录卡片渲染 ===
        const jsonStr = content.replace('###VIDEO_LOG:', '').replace('###', '');
        let logData = {};
        try { logData = JSON.parse(jsonStr); } catch(e) {}
        
        // 计算时间显示
        const dateObj = new Date(timestamp || Date.now());
        const timeStr = `${dateObj.getMonth()+1}/${dateObj.getDate()} ${String(dateObj.getHours()).padStart(2,'0')}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
        
        // 点击事件：打开回顾弹窗
        const clickAction = (!isSelectionMode) ? `onclick="openVideoHistoryModal(${index})"` : "";

        innerHtml = `
            <div class="message system"> <!-- 借用 system 让它居中，但内部自定义 -->
                <div class="bubble-video-record" ${clickAction}>
                    <div class="record-content">
                        <div class="record-icon"><i class="fas fa-film"></i></div>
                        <div class="record-info">
                            <h4>视频通话回顾</h4>
                            <p>${timeStr} · 剧本已生成</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

    } else {
        // 普通文本消息
        const clickAction = (!isSelectionMode && index !== undefined && index !== -1) ? `onclick="onMessageClick(${index})"` : "";
        innerHtml = `
            <img src="${avatarUrl}" class="msg-avatar">
            <div class="msg-bubble" ${clickAction}>
                ${content}
                ${timeHtml} <!-- 核心修改：时间放在文本气泡内部 -->
            </div>
        `;
    }

    // 3. 统一设置HTML并添加到页面
    div.innerHTML = innerHtml;
    
    // 4. 处理多选模式的样式
    if (isSelectionMode && index !== undefined && index !== -1 && !div.classList.contains('system')) {
        div.onclick = () => toggleSelection(index);
        if (selectedIndices.has(index)) div.classList.add('selected');
        else div.classList.add('selecting');
    }

    box.appendChild(div);
}

function scrollToBottom() {
    const box = document.getElementById('chat-box');
    box.scrollTop = box.scrollHeight;
}

// 发送消息
function sendUserMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text) return;

    let finalContent = text;
    if (currentQuote) {
        finalContent = `「回复：${currentQuote}」\n${text}`;
        cancelQuote();
    }
    
    if (!chatHistory[currentChatId]) chatHistory[currentChatId] = [];
    
    // 核心修改：添加 timestamp: Date.now()
    chatHistory[currentChatId].push({ 
        role: 'user', 
        content: finalContent,
        timestamp: Date.now() 
    });
    
    saveData();
    renderChatHistory(); 
    playSystemSound('chat'); // 播放气泡音
    input.value = '';
}

// ==========================================
//   (最终修复版) 触发 AI 回复 (包含手动/自动)
//   解决：失忆问题 + 退出界面无弹窗问题
// ==========================================
async function triggerAIResponse(isReaction = false) {
    if (!apiConfig.key) { alert("请先在首页设置API Key!"); return; }

    const friend = friendsData.find(f => f.id === currentChatId);
    
    // 1. 获取全局记忆 (时间、动态、历史)
    const globalMemory = getGlobalContext(currentChatId);

    // 2. 准备表情包清单
    let stickerListText = (stickerLibrary && stickerLibrary.length > 0) 
        ? stickerLibrary.map(s => `"${s.desc}"`).join(', ') 
        : "(暂无可用表情包)";

    // 3. 构造 System Prompt
    let systemPrompt = `你现在扮演：${friend.name}。设定：${friend.prompt}。
    用户：${friend.userName}。
    
    【当前现实时间】：${timeString}
    
    【核心规则】像真人一样说话，多用分段符号 ### 来控制气泡节奏。
    【表情包】可用关键词：[ ${stickerListText} ]。如果是表情，请单独输出指令：###STICKER_SEND:关键词###
    
    【视频通话指令】★重要★
    如果你想给用户打视频电话（比如用户要求，或者你想见对方），请单独输出指令：
    ###VIDEO_CALL_INITIATE:想打电话的原因###
    ❌ 绝对不要使用 [发起视频] 这种你自己编的格式。
    ✅ 只能输出唯一指令：###VIDEO_CALL_INITIATE:想见你的原因###
    输出指令后，立刻结束回复，不要加任何标点符号或文字。
    
    示例：
    (正确) ###VIDEO_CALL_INITIATE:想看看你###
    (错误) 好的，我打给你。
    (错误) [视频通话]

    ${memoryContext}
    `;

    // 4. 准备消息列表 (只保留 System 和最新的 User 指令，因为历史记录已经在 GlobalMemory 里了，节省 token 且更精准)
    // 但为了保险，还是保留最近 2 条对话作为上下文缓冲
    const recentMsgs = (chatHistory[currentChatId] || []).slice(-2).map(msg => ({
        role: msg.role, 
        content: msg.content.replace(/###.*?###/g, '') // 简化历史
    }));

    let finalMessages = [{ role: "system", content: systemPrompt }, ...recentMsgs];

    // 如果是红包或反应模式，追加特定指令
    if (isReaction) finalMessages.push({ role: "user", content: "(请根据刚才的情况做出反应)" });

    // 5. 界面反馈：显示正在输入
    // 只有当用户还在界面时才显示
    if (document.getElementById('screen-chat').classList.contains('active')) {
        createAiBubble(friend.avatar, "typing...");
    }

    // 处理 API URL
    let cleanUrl = apiConfig.url.trim().replace(/\/$/, '');
    if (!cleanUrl.endsWith('/v1') && cleanUrl.indexOf('openai') > -1) cleanUrl += '/v1';

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 40000); // 40秒超时

        const response = await fetch(`${cleanUrl}/chat/completions`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${apiConfig.key}` 
            },
            body: JSON.stringify({ 
                model: apiConfig.model, 
                messages: finalMessages, 
                stream: true 
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API错误: ${errText}`);
        }

        // --- 6. 接收流式数据 ---
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullText = ""; // 用来积攒完整的回复

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') break;
                    try {
                        const data = JSON.parse(dataStr);
                        const content = data.choices[0].delta.content;
                        if (content) fullText += content;
                    } catch (e) {}
                }
            }
        }

        // --- 7. (核心修改点) 回复接收完毕，判断用户去哪了 ---
        
        // 移除界面上的 "typing..." 气泡 (如果存在)
        const typingBubble = document.querySelector('.typing-dots');
        if (typingBubble && typingBubble.parentElement.parentElement) {
            typingBubble.parentElement.parentElement.remove();
        }

        // 再次检查：用户还在当前聊天窗口吗？
        const isUserStillWatching = (currentChatId === friend.id) && document.getElementById('screen-chat').classList.contains('active');

        if (isUserStillWatching) {
            // [A] 用户还在看：启动打字机效果，播放气泡音
            // 这里我们需要把 fullText 传给打字机，或者直接为了简单，直接上屏
            // 为了避免复杂的流式冲突，既然我们已经拿到了 fullText，直接模拟打字机比较稳
            aiBuffer = fullText; 
            typeIndex = 0; 
            isStreamActive = false; // 标记流已结束
            
            // 重新创建一个空的AI气泡用于打字
            createAiBubble(friend.avatar, ""); 
            startTypeWriter(friend.avatar); // 启动打字机逻辑
            
            // 播放气泡音 (如果你加了声音系统)
            if (typeof playSystemSound === "function") playSystemSound('chat');

        } else {
            // [B] 用户跑了：直接入库，弹窗通知，播放通知音
            console.log("用户已离开界面，转为后台通知模式");
            
            // 1. 直接存入数据库
            if (!chatHistory[friend.id]) chatHistory[friend.id] = [];
            
            // 处理一下特殊格式 (比如表情包指令)
            let saveContent = fullText;
            // 简单处理表情包 (如果AI回复里包含了指令，这里直接存文本，渲染时会变)
            // 这里为了简单，直接存原文，渲染函数会处理
            
            chatHistory[friend.id].push({
                role: 'assistant',
                content: saveContent,
                timestamp: Date.now()
            });
            await saveData();

            // 2. 弹窗 + 通知音
            pushNotification(friend.name, saveContent, friend.avatar, 'chat', friend.id);
        }

    } catch (e) {
        console.error("请求失败", e);
        // 移除 typing
        const typingBubble = document.querySelector('.typing-dots');
        if (typingBubble && typingBubble.parentElement.parentElement) {
            typingBubble.parentElement.parentElement.remove();
        }
        
        // 只有在看的时候才弹 alert
        if (document.getElementById('screen-chat').classList.contains('active')) {
            alert("AI 没反应：" + e.message);
        }
    }
}

// ==========================================
//   智能打字机 (无闪烁终极版：空格缓冲机制)
// ==========================================
function startTypeWriter(avatarUrl) {
    let hasSaved = false;
    let isBubbleStart = true;
    let pendingWhitespace = "";

    // 红包处理函数 (保持不变)
    function handleAiAction(actionCode) {
        const history = chatHistory[currentChatId];
        let packetIndex = -1;
        let packetData = null;
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].role === 'user' && history[i].content.includes('###RED_PACKET:')) {
                try {
                    const json = JSON.parse(history[i].content.replace('###RED_PACKET:', '').replace('###', ''));
                    if (json.status === 'pending') { packetIndex = i; packetData = json; break; }
                } catch (e) {}
            }
        }
        if (packetIndex !== -1 && packetData) {
            const friend = friendsData.find(f => f.id === currentChatId);
            const newStatus = (actionCode === '{{GET}}') ? 'received' : 'returned';
            packetData.status = newStatus;
            history[packetIndex].content = `###RED_PACKET:${JSON.stringify(packetData)}###`;
            const sysText = (newStatus === 'received') ? `${friend.name} 领取了你的红包` : `${friend.name} 退回了你的红包`;
            history.splice(packetIndex + 1, 0, { role: 'system', content: `###SYSTEM:${sysText}` });
            saveData().then(() => { renderChatHistory(); scrollToBottom(); createAiBubble(avatarUrl, "typing..."); });
        }
    }

    // 递归打字函数
    function typeNext() {

                const dumbKeywords = ["我打给你", "接视频", "打个视频", "视频通话", "[发起视频", "邀请你视频"];
        // 只有当 buffer 里有这些词，且还没有触发过指令时
        if (dumbKeywords.some(k => aiBuffer.includes(k)) && !aiBuffer.includes("###VIDEO_CALL_INITIATE")) {
            // 稍微延迟一点点，让文字打出来一部分，显得更自然
            if (Math.random() > 0.95) { // 增加一点随机性，不要每次都秒触发，防止误判
                // 强制触发来电
                isStreamActive = false; // 停止打字
                if (currentBubbleDOM && currentBubbleDOM.parentElement) {
                    currentBubbleDOM.parentElement.remove(); // 删掉那句废话气泡
                }
                showIncomingCallScreen("我想见你..."); // 强制弹窗
                return; // 结束打字机
            }
        }

        // --- 指令拦截区 (红包、表情包等) ---
        if (aiBuffer.startsWith("{{GET}}")) { aiBuffer = aiBuffer.replace("{{GET}}", ""); handleAiAction('{{GET}}'); typeNext(); return; }
        if (aiBuffer.startsWith("{{RETURN}}")) { aiBuffer = aiBuffer.replace("{{RETURN}}", ""); handleAiAction('{{RETURN}}'); typeNext(); return; }
         if (aiBuffer.substring(typeIndex).startsWith("###VIDEO_CALL_INITIATE:")) {
            const endIdx = aiBuffer.indexOf("###", typeIndex + 24);
            if (endIdx !== -1) {
                const reason = aiBuffer.substring(typeIndex + 24, endIdx).trim();
                
                // 停止打字，移除临时气泡
                isStreamActive = false; 
                if (currentBubbleDOM && currentBubbleDOM.parentElement) {
                    currentBubbleDOM.parentElement.remove();
                }
                
                // 触发来电界面！
                showIncomingCallScreen(reason);
                return; // 中断后续所有操作
            }
        }
        if (aiBuffer.substring(typeIndex).startsWith("###STICKER_SEND:")) {
            const endIdx = aiBuffer.indexOf("###", typeIndex + 16);
            if (endIdx !== -1) {
                const descTarget = aiBuffer.substring(typeIndex + 16, endIdx).trim();
                const foundSticker = stickerLibrary.find(s => s.desc.includes(descTarget)) || stickerLibrary.find(s => descTarget.includes(s.desc));
                if (foundSticker) {
                    const lightData = { id: foundSticker.id, desc: foundSticker.desc };
                    const realContent = `###STICKER:${JSON.stringify(lightData)}###`;
                    if (currentBubbleDOM && currentBubbleDOM.parentElement) currentBubbleDOM.parentElement.remove();
                    if (!chatHistory[currentChatId]) chatHistory[currentChatId] = [];
                    chatHistory[currentChatId].push({ role: 'assistant', content: realContent, timestamp: Date.now() });
                    saveData();
                    renderChatHistory();
                    typeIndex = endIdx + 3;
                    isStreamActive = false;
                    return;
                } else {
                    typeIndex = endIdx + 3;
                }
            }
        }

        // --- 核心逻辑：打字 或 结束 ---
        // 条件1：文字还没打完
        if (typeIndex < aiBuffer.length) {
            // 分段 ###
            const nextThree = aiBuffer.substring(typeIndex, typeIndex + 3);
            if (nextThree === "###" && !aiBuffer.substring(typeIndex).startsWith("###RED_PACKET")) {
                typeIndex += 3;
                pendingWhitespace = "";
                if (currentBubbleDOM && currentBubbleDOM.innerText !== "typing...") {
                    const text = currentBubbleDOM.innerText.trim();
                    if (text) {
                        if (!chatHistory[currentChatId]) chatHistory[currentChatId] = [];
                        chatHistory[currentChatId].push({ role: 'assistant', content: text, timestamp: Date.now() });
                        saveData();
                        renderChatHistory(); // 中间气泡刷新
                    }
                }
                setTimeout(() => {
                    createAiBubble(avatarUrl, "typing...");
                    isBubbleStart = true;
                    pendingWhitespace = "";
                    setTimeout(() => { if (currentBubbleDOM) currentBubbleDOM.innerHTML = ""; typeNext(); }, 100);
                }, 800);
                return;
            }

            // 正常打字
            const char = aiBuffer[typeIndex];
            if (isBubbleStart) {
                if (/\s/.test(char)) { typeIndex++; setTimeout(typeNext, 0); return; }
                isBubbleStart = false;
                if (currentBubbleDOM.innerText === "typing...") currentBubbleDOM.innerHTML = "";
                currentBubbleDOM.innerText += char;
            } else {
                if (/\s/.test(char)) { pendingWhitespace += char; }
                else {
                    if (pendingWhitespace) { currentBubbleDOM.innerText += pendingWhitespace; pendingWhitespace = ""; }
                    currentBubbleDOM.innerText += char;
                }
            }
            typeIndex++;
            scrollToBottom();
            setTimeout(typeNext, Math.floor(Math.random() * 40) + 30);
        
        // 条件2：文字打完了 (typeIndex >= aiBuffer.length)
        } else {
            // 再判断API数据流是不是也停了
            if (!isStreamActive) {
                // 如果两个条件都满足，说明是真的说完了！
                if (!hasSaved) {
                    hasSaved = true;
                    if (currentBubbleDOM) {
                        const finalContent = currentBubbleDOM.innerText.trim();
                        // 只有当气泡里真的有字时才保存
                        if (finalContent && finalContent !== "typing...") {
                            if (!chatHistory[currentChatId]) chatHistory[currentChatId] = [];
                            chatHistory[currentChatId].push({
                                role: 'assistant',
                                content: finalContent,
                                timestamp: Date.now()
                            });
                            saveData();
                            // 【最终气泡的关键修复】: 保存后，立刻、马上、原地刷新UI！
                            renderChatHistory(); 
                        } else {
                           // 如果最后一个气泡是空的，就删掉它
                           if(currentBubbleDOM.parentElement) currentBubbleDOM.parentElement.remove();
                        }
                    }
                }
                return; // 彻底结束
            } else {
                // 如果字打完了，但数据流还没停，就再等等看有没有新文字
                setTimeout(typeNext, 100);
            }
        }
    }
    // 启动
    typeNext();
}

function createAiBubble(avatarUrl, initialText) {
    const box = document.getElementById('chat-box');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message ai';
    const content = initialText === "typing..." ? '<span class="typing-dots">...</span>' : initialText;
    msgDiv.innerHTML = `<img src="${avatarUrl}" class="msg-avatar"><div class="msg-bubble">${content}</div>`;
    box.appendChild(msgDiv);
    scrollToBottom();
    currentBubbleDOM = msgDiv.querySelector('.msg-bubble');playSystemSound('chat'); // 播放气泡音
}

// ==========================================
//   详细设置与样式
// ==========================================
function openChatSettings() {
    const friend = friendsData.find(f => f.id === currentChatId);
    if (!friend) return;

    document.getElementById('edit-char-name').value = friend.name;
    document.getElementById('edit-char-prompt').value = friend.prompt;
    document.getElementById('edit-user-name').value = friend.userName;
    document.getElementById('edit-user-intro').value = friend.userIntro || ""; // 回填用户设定

    showImgPreview('preview-char-avatar', friend.avatar);
    showImgPreview('preview-user-avatar', friend.userAvatar);
    showImgPreview('preview-bg', friend.chatBg);

    document.getElementById('css-ai-bubble').value = friend.aiBubbleStyle || "";
    document.getElementById('css-user-bubble').value = friend.userBubbleStyle || "";
    
    updatePresetSelect();
    updatePreview();
    goToScreen('screen-chat-settings');
}

function backToChat() { openChat(currentChatId); }

function showImgPreview(imgId, src) {
    const img = document.getElementById(imgId);
    const span = img.nextElementSibling;
    if (src) { img.src = src; img.style.display = 'block'; if(span) span.style.display='none'; }
    else { img.style.display = 'none'; if(span) span.style.display='block'; }
}

function triggerFileUpload(id) { document.getElementById(id).click(); }
function handleFileSelect(input, previewId) {
    if (input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById(previewId);
            img.src = e.target.result;
            img.style.display = 'block';
            img.nextElementSibling.style.display = 'none';
        };
        reader.readAsDataURL(input.files[0]);
    }
}
function clearBackground() {
    document.getElementById('preview-bg').src = "";
    document.getElementById('preview-bg').style.display = "none";
}

function updatePreview() {
    const aiCss = document.getElementById('css-ai-bubble').value;
    const userCss = document.getElementById('css-user-bubble').value;
    document.getElementById('preview-bubble-ai').style.cssText = aiCss;
    document.getElementById('preview-bubble-user').style.cssText = userCss;
    
    // 头像预览
    const friend = friendsData.find(f => f.id === currentChatId);
    const cSrc = document.getElementById('preview-char-avatar').src;
    const uSrc = document.getElementById('preview-user-avatar').src;
    document.querySelector('.preview-ai-avatar').src = (cSrc && document.getElementById('preview-char-avatar').style.display !== 'none') ? cSrc : friend.avatar;
    document.querySelector('.preview-user-avatar').src = (uSrc && document.getElementById('preview-user-avatar').style.display !== 'none') ? uSrc : friend.userAvatar;
}

function updatePresetSelect() {
    const select = document.getElementById('bubble-preset-select');
    select.innerHTML = '<option value="">-- 选择预设 --</option>';
    bubblePresets.forEach((p, i) => {
        const opt = document.createElement('option');
        opt.value = i; opt.innerText = p.name;
        select.appendChild(opt);
    });
}
function loadBubblePreset() {
    const idx = document.getElementById('bubble-preset-select').value;
    if (idx === "") return;
    const p = bubblePresets[idx];
    document.getElementById('css-ai-bubble').value = p.ai;
    document.getElementById('css-user-bubble').value = p.user;
    updatePreview();
}
function saveAsPreset() {
    const name = document.getElementById('new-preset-name').value.trim();
    if (!name) return alert("请输入名称");
    bubblePresets.push({
        name: name,
        ai: document.getElementById('css-ai-bubble').value,
        user: document.getElementById('css-user-bubble').value
    });
    localStorage.setItem('ai_presets', JSON.stringify(bubblePresets));
    updatePresetSelect();
    alert("预设保存成功");
}

function saveChatSettings() {
    const friend = friendsData.find(f => f.id === currentChatId);
    if (!friend) return;
    
    friend.name = document.getElementById('edit-char-name').value;
    friend.prompt = document.getElementById('edit-char-prompt').value;
    friend.userName = document.getElementById('edit-user-name').value;
    friend.userIntro = document.getElementById('edit-user-intro').value; // 保存用户设定

    const cImg = document.getElementById('preview-char-avatar');
    if (cImg.style.display !== 'none') friend.avatar = cImg.src;
    
    const uImg = document.getElementById('preview-user-avatar');
    if (uImg.style.display !== 'none') friend.userAvatar = uImg.src;
    
    const bgImg = document.getElementById('preview-bg');
    friend.chatBg = (bgImg.style.display !== 'none') ? bgImg.src : "";

    friend.aiBubbleStyle = document.getElementById('css-ai-bubble').value;
    friend.userBubbleStyle = document.getElementById('css-user-bubble').value;

    saveData();
    renderFriendList();
    alert("设置已保存");
    backToChat();
}

// ==========================================
//   消息交互 (引用、编辑、多选)
// ==========================================
function onMessageClick(index) {
    if (isSelectionMode) return;
    selectedMsgIndex = index;
    const msg = chatHistory[currentChatId][index];
    document.getElementById('btn-regen').style.display = (msg.role === 'assistant') ? 'flex' : 'none';
    document.getElementById('msg-action-menu').style.display = 'flex';
}
function closeActionMenu() { document.getElementById('msg-action-menu').style.display = 'none'; selectedMsgIndex = null; }

function handleMenuAction(action) {
    const index = selectedMsgIndex;
    if (index === null && action !== 'multi') return;
    closeActionMenu();
    const history = chatHistory[currentChatId];

    if (action === 'reply') {
        currentQuote = history[index].content;
        document.getElementById('quote-text').innerText = currentQuote;
        document.getElementById('quote-preview-box').style.display = 'flex';
        document.getElementById('message-input').focus();
    } else if (action === 'copy') {
        navigator.clipboard.writeText(history[index].content);
    } else if (action === 'edit') {
        document.getElementById('edit-msg-content').value = history[index].content;
        document.getElementById('msg-edit-modal').style.display = 'flex';
    } else if (action === 'delete') {
        if(confirm("确定删除？")) {
            history.splice(index, 1);
            saveData(); renderChatHistory();
        }
    } else if (action === 'regenerate') {
        if(confirm("重生成将删除此消息及之后的对话，确定？")) {
            chatHistory[currentChatId] = history.slice(0, index);
            saveData(); renderChatHistory(); triggerAIResponse();
        }
    } else if (action === 'multi') {
        enterSelectionMode();
        if (index !== null) toggleSelection(index);
    }
}

function cancelQuote() {
    currentQuote = null;
    document.getElementById('quote-preview-box').style.display = 'none';
}
function closeEditModal() { document.getElementById('msg-edit-modal').style.display = 'none'; }
function confirmEditMessage() {
    const val = document.getElementById('edit-msg-content').value.trim();
    if (val) {
        chatHistory[currentChatId][selectedMsgIndex].content = val;
        saveData(); renderChatHistory(); closeEditModal();
    }
}

function enterSelectionMode() {
    isSelectionMode = true; selectedIndices.clear();
    document.getElementById('multi-select-bar').style.display = 'flex';
    document.querySelector('.chat-header').style.display = 'none';
    renderChatHistory();
}
function exitSelectionMode() {
    isSelectionMode = false; selectedIndices.clear();
    document.getElementById('multi-select-bar').style.display = 'none';
    document.querySelector('.chat-header').style.display = 'flex';
    renderChatHistory();
}
function toggleSelection(index) {
    if (selectedIndices.has(index)) selectedIndices.delete(index);
    else selectedIndices.add(index);
    document.getElementById('select-count').innerText = `已选 ${selectedIndices.size}`;
    
    // 局部更新 UI
    const bubbles = document.querySelectorAll('#chat-box .message');
    if (bubbles[index]) {
        if (selectedIndices.has(index)) {
            bubbles[index].classList.add('selected'); bubbles[index].classList.remove('selecting');
        } else {
            bubbles[index].classList.remove('selected'); bubbles[index].classList.add('selecting');
        }
    }
}
function deleteSelectedMessages() {
    if (!selectedIndices.size) return;
    if (confirm(`删除选中的 ${selectedIndices.size} 条消息？`)) {
        const sorted = Array.from(selectedIndices).sort((a,b) => b-a);
        sorted.forEach(i => chatHistory[currentChatId].splice(i, 1));
        saveData(); exitSelectionMode();
    }
}

// ==========================================
//   主题切换与状态栏
// ==========================================
function switchTheme(themeName) {
    currentTheme = themeName;
    saveData();
    localStorage.setItem('ai_theme', themeName);
    applyTheme(themeName);
    updateThemeUI();
}
// 修改 script.js 中的 applyTheme 和 updateThemeUI 函数

function applyTheme(name) {
    // 1. 移除所有已知的主题类名 (防止冲突)
    document.body.classList.remove('theme-glass', 'theme-paper', 'theme-clay', 'theme-candy');
    
    // 2. 如果不是默认的 'theme-candy'，则添加对应的类名
    if (name && name !== 'theme-candy') {
        document.body.classList.add(name);
    }
    
    // 3. 更新界面选中状态
    updateThemeUI();
}

function updateThemeUI() {
    // 移除所有卡片的 active 状态
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
    
    // 根据当前 currentTheme 找到对应的卡片并点亮
    // 我们假设卡片的 onclick 事件里传的名字就是 ID 的一部分
    // 这里简单处理：通过遍历查找 onclick 属性包含当前主题名的元素
    const cards = document.querySelectorAll('.theme-card');
    cards.forEach(card => {
        // 获取 onclick 属性里的字符串，例如 "switchTheme('theme-paper')"
        const attr = card.getAttribute('onclick');
        if (attr && attr.includes(currentTheme)) {
            card.classList.add('active');
        }
    });
}

function updateThemeUI() {
    // 1. 获取所有的主题卡片元素
    const allThemeCards = document.querySelectorAll('.theme-card');

    // 2. 遍历每一张卡片
    allThemeCards.forEach(card => {
        // 3. 获取卡片上的 onclick 事件内容，例如 "switchTheme('theme-paper')"
        const onclickAttribute = card.getAttribute('onclick');

        // 4. 检查 onclick 内容里，是否包含了当前激活的主题名字 (currentTheme)
        if (onclickAttribute && onclickAttribute.includes(currentTheme)) {
            // 如果找到了，就给这张卡片加上 'active' 类 (显示边框和对号)
            card.classList.add('active');
        } else {
            // 如果没找到，就确保它没有 'active' 类
            card.classList.remove('active');
        }
    });
}

function updateStatusBar() {
    const now = new Date();
    document.getElementById('status-time').innerText = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const wifi = document.getElementById('status-wifi');
    wifi.className = navigator.onLine ? "fas fa-wifi" : "fas fa-wifi-slash";
}

async function initBattery() {
    if ('getBattery' in navigator) {
        try {
            const bat = await navigator.getBattery();
            const updateBat = () => {
                const level = Math.floor(bat.level * 100);
                const text = document.getElementById('battery-level');
                const icon = document.getElementById('status-battery');
                text.innerText = level + "%";
                if (bat.charging) icon.className = "fas fa-bolt";
                else if (level > 90) icon.className = "fas fa-battery-full";
                else if (level > 50) icon.className = "fas fa-battery-half";
                else if (level > 20) icon.className = "fas fa-battery-quarter";
                else { icon.className = "fas fa-battery-empty"; icon.style.color = "red"; return; }
                icon.style.color = "";
            };
            updateBat();
            bat.addEventListener('levelchange', updateBat);
            bat.addEventListener('chargingchange', updateBat);
        } catch(e){}
    } else {
        document.getElementById('battery-level').style.display = 'none';
    }
}
// ==========================================
//   新增：数据永久备份与恢复 (JSON文件)
// ==========================================

// 1. 导出数据 (下载 .json 文件)
function exportData() {
    // 把所有重要数据打包成一个对象
    const backupData = {
        friends: friendsData,
        chats: chatHistory,
        config: apiConfig,
        presets: bubblePresets,
        theme: currentTheme
    };

    // 转换成字符串
    const dataStr = JSON.stringify(backupData, null, 2); // null, 2 让文件排版好看点
    
    // 创建一个下载链接
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    // 创建临时链接并点击
    const a = document.createElement('a');
    a.href = url;
    
    // 文件名带上时间，方便区分
    const date = new Date();
    const timeStr = `${date.getFullYear()}${date.getMonth()+1}${date.getDate()}_${date.getHours()}${date.getMinutes()}`;
    a.download = `AI小手机备份_${timeStr}.json`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert("备份已下载！\n请妥善保存这个 .json 文件，下次数据丢失时可以用它恢复。");
}

// 2. 触发导入 (点击隐藏的 input)
function triggerImport() {
    document.getElementById('import-file').click();
}

// 3. 导入数据 (读取 .json 文件)
function importData(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // 简单的格式检查
            if (!data.friends || !data.chats) {
                throw new Error("文件格式不对，找不到好友或聊天记录");
            }

            // 确认覆盖
            if (!confirm("确定要恢复备份吗？\n这将覆盖当前的聊天记录和设置！")) {
                input.value = ''; // 清空选择
                return;
            }

            // 恢复数据到内存
            friendsData = data.friends || [];
            chatHistory = data.chats || {};
            if(data.config) apiConfig = data.config;
            if(data.presets) bubblePresets = data.presets;
            if(data.theme) currentTheme = data.theme;

            // 恢复数据到 LocalStorage (浏览器存储)
            saveData();
            // 单独保存主题，因为它有两个 key
            if (data.theme) localStorage.setItem('ai_theme', data.theme);

            alert("✅ 数据恢复成功！页面将自动刷新。");
            location.reload(); // 刷新网页应用新数据

        } catch (err) {
            alert("❌ 恢复失败：文件可能已损坏。\n" + err.message);
        }
    };
    reader.readAsText(file);
}
// ==========================================
//   新增：底部抽屉控制
// ==========================================

function toggleDrawer() {
    const drawer = document.getElementById('tool-drawer');
    const toggleBtn = document.querySelector('.tool-btn-toggle');
    const chatBox = document.getElementById('chat-box');
    
    // 切换 active 类
    const isOpen = drawer.classList.contains('open');
    
    if (isOpen) {
        drawer.classList.remove('open');
        toggleBtn.classList.remove('open');
        // 抽屉关闭时，聊天框高度恢复（可选，如果需要更复杂的布局）
    } else {
        drawer.classList.add('open');
        toggleBtn.classList.add('open');
        // 抽屉打开时，自动滚动到底部，防止内容被遮挡
        setTimeout(() => scrollToBottom(), 300);
    }
}

// 优化：点击聊天区域时，自动收起抽屉
document.getElementById('chat-box').addEventListener('click', function() {
    const drawer = document.getElementById('tool-drawer');
    if (drawer.classList.contains('open')) {
        toggleDrawer();
    }
});
// ==========================================
//   丢失找回：红包功能逻辑全家桶
// ==========================================

// 1. 打开“发红包”弹窗
function openSendPacketModal() {
    const modal = document.getElementById('modal-send-packet');
    if (modal) {
        modal.style.display = 'flex';
        // 清空输入框
        document.getElementById('packet-amount').value = '';
        // 顺便关掉抽屉
        toggleDrawer(); 
    } else {
        console.error("找不到红包弹窗 ID: modal-send-packet");
    }
}

// 关闭任意弹窗
function closePacketModal(id) {
    document.getElementById(id).style.display = 'none';
}

// 2. 确认发送红包
function confirmSendPacket() {
    const amount = document.getElementById('packet-amount').value;
    const text = document.getElementById('packet-text').value || "恭喜发财，大吉大利";
    
    if (!amount || amount <= 0) {
        alert("请输入正确的金额！");
        return;
    }

    // 构建红包数据结构
    const rpData = {
        id: Date.now(),
        amount: amount,
        text: text,
        status: 'pending', // pending, received, returned
        sender: 'user'
    };

    // 封装成特殊字符串
    const content = `###RED_PACKET:${JSON.stringify(rpData)}###`;

    // 保存并渲染
    if (!chatHistory[currentChatId]) chatHistory[currentChatId] = [];
    chatHistory[currentChatId].push({ role: 'user', content: content });
    saveData();
    renderChatHistory();
    closePacketModal('modal-send-packet');

}

// 3. 点击红包 (打开操作弹窗)
let currentPacketIndex = null;

function openRedPacket(index) {
    currentPacketIndex = index;
    const msg = chatHistory[currentChatId][index];
    const isUser = msg.role === 'user';
    
    // 解析数据
    const jsonStr = msg.content.replace('###RED_PACKET:', '').replace('###', '');
    let rpData;
    try {
        rpData = JSON.parse(jsonStr);
    } catch(e) {
        alert("红包数据损坏");
        return;
    }
    
    // 填充弹窗信息
    const friend = friendsData.find(f => f.id === currentChatId);
    
    // 显示头像和名字
    const avatarEl = document.getElementById('packet-sender-avatar');
    const nameEl = document.getElementById('packet-sender-name');
    
    // 如果是用户发的
    if (rpData.sender === 'user') {
         avatarEl.src = friend.userAvatar;
         nameEl.innerText = friend.userName;
    } else {
         // 是 AI 发的
         avatarEl.src = friend.avatar;
         nameEl.innerText = friend.name;
    }

    document.getElementById('packet-msg-preview').innerText = rpData.text;
    document.getElementById('packet-money-display').innerText = `¥ ${rpData.amount}`;

    // 状态控制按钮显示
    const actionsDiv = document.getElementById('packet-actions');
    const statusText = document.getElementById('packet-status-text');

    if (rpData.status === 'pending') {
        // 如果是自己发的，只能看，不能自己领
        if (rpData.sender === 'user') {
            actionsDiv.style.display = 'none';
            statusText.style.display = 'block';
            statusText.innerText = "等待对方领取...";
        } else {
            // 对方发的，可以领/退
            actionsDiv.style.display = 'flex';
            statusText.style.display = 'none';
        }
    } else {
        // 已经处理过
        actionsDiv.style.display = 'none';
        statusText.style.display = 'block';
        statusText.innerText = rpData.status === 'received' ? "红包已被领取" : "红包已被退回";
    }

    document.getElementById('modal-open-packet').style.display = 'flex';
}

// 4. 处理领取/退回
function handlePacketAction(action) {
    const index = currentPacketIndex;
    const msg = chatHistory[currentChatId][index];
    const friend = friendsData.find(f => f.id === currentChatId);

    // 解析 -> 修改 -> 重新打包
    const jsonStr = msg.content.replace('###RED_PACKET:', '').replace('###', '');
    let rpData = JSON.parse(jsonStr);
    
    rpData.status = action; // 'received' or 'returned'
    msg.content = `###RED_PACKET:${JSON.stringify(rpData)}###`; // 更新原始消息
    
    // 插入一条系统通知
    // 如果是领取
    let sysMsg = "";
    if (action === 'receive') {
        sysMsg = `###SYSTEM:你领取了 ${friend.name} 的红包`;
    } else {
        sysMsg = `###SYSTEM:你退回了 ${friend.name} 的红包`;
    }
    
    // 插入到当前红包消息的后面
    chatHistory[currentChatId].splice(index + 1, 0, { role: 'system', content: sysMsg });
    
    saveData();
    renderChatHistory();
    closePacketModal('modal-open-packet');

}
// ==========================================
//   表情包功能全家桶
// ==========================================

// 1. 开关面板
function toggleStickerPanel() {
    const panel = document.getElementById('sticker-panel');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        renderStickerGrid();
        // 如果开了抽屉，关掉它
        document.getElementById('tool-drawer').classList.remove('open'); 
        document.querySelector('.tool-btn-toggle').classList.remove('open');
    } else {
        panel.style.display = 'none';
    }
}
// 点击聊天区域关闭表情面板
document.getElementById('chat-box').addEventListener('click', function() {
    document.getElementById('sticker-panel').style.display = 'none';
});

// 2. 打开添加弹窗
function openAddStickerModal() {
    document.getElementById('modal-add-sticker').style.display = 'flex';
    document.getElementById('sticker-desc').value = '';
    document.getElementById('preview-sticker-upload').src = '';
    document.getElementById('preview-sticker-upload').style.display = 'none';
}

// 3. 确认添加表情
// 既不省空间（保留高清），又保护手机内存

function confirmAddSticker() {
    const fileInput = document.getElementById('sticker-file-input');
    const desc = document.getElementById('sticker-desc').value.trim();
    
    if (!fileInput.files[0]) { alert("请先上传一张图片！"); return; }
    if (!desc) { alert("请描述一下这张表情包！"); return; }

    const btn = document.querySelector('.packet-btn-primary');
    btn.innerText = "处理中...";
    btn.disabled = true;

    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            
            // 设定一个“安全高清”尺寸
            // 1080像素宽足够在所有手机上全屏清晰显示，但体积只有原图的1/10
            let maxWidth = 1080; 
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // 质量设为 0.9 (极高画质)，几乎无损
            const highQualitySrc = canvas.toDataURL('image/jpeg', 0.9);
            
            stickerLibrary.push({
                id: Date.now(),
                src: highQualitySrc,
                desc: desc
            });
            
            // 调用新的 saveData (基于 localForage)
            saveData().then(() => {
                renderStickerGrid();
                closePacketModal('modal-add-sticker');
                btn.innerText = "保存表情";
                btn.disabled = false;
                alert("表情添加成功！");
            });
        };
    };
}

// 4. 渲染面板
function renderStickerGrid() {
    const grid = document.getElementById('sticker-grid');
    grid.innerHTML = '';
    stickerLibrary.forEach(s => {
        const div = document.createElement('div');
        div.className = 'sticker-item';
        div.innerHTML = `<img src="${s.src}">`;
        div.onclick = () => sendSticker(s);
        grid.appendChild(div);
    });
}

// 5. 发送表情包 (修改版：发送后不自动回复)
function sendSticker(stickerObj) {
    document.getElementById('sticker-panel').style.display = 'none';
    
    // 只保存 ID 和 描述，不保存 src (图片本体)
    const lightSticker = {
        id: stickerObj.id,
        desc: stickerObj.desc
    };
    
    const content = `###STICKER:${JSON.stringify(lightSticker)}###`;
    
    if (!chatHistory[currentChatId]) chatHistory[currentChatId] = [];
    chatHistory[currentChatId].push({ role: 'user', content: content });
    
    try {
        saveData(); // 保存到数据库
        renderChatHistory(); // 刷新界面显示表情
        
    } catch (e) {
        alert("发送失败：" + e.message);
        chatHistory[currentChatId].pop(); 
    }
}

// ==========================================
//   👇 请将这段代码添加到 script.js 末尾 👇
// ==========================================

// 1. 新增：返回好友列表时，强制刷新列表以更新最新消息
function backToFriendList() {
    renderFriendList(); // 重新渲染列表（更新最新消息）
    goToScreen('screen-friends'); // 跳转界面
}

// 2. 替换：请找到原本的 renderFriendList 函数，用下面这个覆盖它
function renderFriendList() {
    const container = document.getElementById('friend-list-container');
    container.innerHTML = '';

    friendsData.forEach(friend => {
        // --- 核心修改开始：获取最新一条消息 ---
        const history = chatHistory[friend.id] || [];
        let previewText = "点击开始聊天"; // 默认文案
        
        if (history.length > 0) {
            const lastMsg = history[history.length - 1];
            const rawContent = lastMsg.content;

            // 翻译特殊消息代码
            if (rawContent.includes('###STICKER:')) {
                previewText = "[表情包]";
            } else if (rawContent.includes('###RED_PACKET:')) {
                previewText = "[红包]";
            } else if (rawContent.startsWith('###SYSTEM:')) {
                // 去掉 ###SYSTEM: 前缀，只显示后面的字
                previewText = "[系统] " + rawContent.replace('###SYSTEM:', '');
            } else {
                // 普通文本
                previewText = rawContent;
            }
        }
        // --- 核心修改结束 ---

        const div = document.createElement('div');
        div.className = 'friend-item';
        div.onclick = () => openChat(friend.id);
        
        // 渲染 HTML
        div.innerHTML = `
            <img src="${friend.avatar}" class="friend-avatar">
            <div class="friend-info">
                <h4>${friend.name}</h4>
                <p>${previewText}</p>
            </div>
        `;
        container.appendChild(div);
    });
}
// =========================================================================
//   新增：QQ动态 (朋友圈) 功能逻辑
// =========================================================================

// --- 1. 导航与界面切换 ---
function switchQqTab(tabName) {
    // 1. 获取所有需要操作的元素
    const friendList = document.getElementById('friend-list-container');
    const momentsFeed = document.getElementById('qzone-feed-container');
    
    const navFriends = document.getElementById('nav-btn-friends');
    const navMoments = document.getElementById('nav-btn-moments');
    
    const title = document.getElementById('qq-title');
    
    // 获取右上角的两个按钮
    const btnAddFriend = document.getElementById('btn-add-friend');
    const btnAddMoment = document.getElementById('btn-add-moment');

    // 2. 判断当前切到哪个标签
    if (tabName === 'friends') {
        // --- 切到【好友列表】时 ---
        friendList.style.display = 'block';
        momentsFeed.style.display = 'none';
        
        navFriends.classList.add('active');
        navMoments.classList.remove('active');
        
        title.innerText = "好友列表";
        
        // 关键逻辑：显示加好友，隐藏相机
        if(btnAddFriend) btnAddFriend.style.display = 'block';
        if(btnAddMoment) btnAddMoment.style.display = 'none';
        
    } else {
        // --- 切到【好友动态】时 ---
        friendList.style.display = 'none';
        momentsFeed.style.display = 'block';
        
        navFriends.classList.remove('active');
        navMoments.classList.add('active');
        
        title.innerText = "好友动态";
        
        // 关键逻辑：隐藏加好友，显示相机
        if(btnAddFriend) btnAddFriend.style.display = 'none';
        if(btnAddMoment) btnAddMoment.style.display = 'block';
        
        renderMomentsFeed(); // 渲染数据
    }
}

function openFriendSelectionForMoment() {
    const container = document.getElementById('moment-friend-select-list');
    container.innerHTML = ''; // 清空旧列表
    
    friendsData.forEach(friend => {
        const div = document.createElement('div');
        div.className = 'friend-item-selectable';
        div.innerHTML = `
            <img src="${friend.avatar}" class="friend-avatar">
            <div class="friend-info">
                <h4>${friend.name}</h4>
                <p>${friend.prompt.substring(0, 30)}...</p>
            </div>
            <input type="checkbox" data-id="${friend.id}">
        `;
        container.appendChild(div);
    });
    goToScreen('screen-select-friends-for-moment');
}

// =========================================================================
//   AI 生成动态的核心 (V2.2 - 修复API请求格式错误)
// =========================================================================
async function generateMoments() {
    const checkboxes = document.querySelectorAll('#moment-friend-select-list input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
        alert("请至少选择一个好友！");
        return;
    }

    const confirmBtn = document.querySelector('.confirm-moment-footer button');
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在生成中...';
    confirmBtn.disabled = true;

    const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.id);

    for (const friendId of selectedIds) {
        try {
            const friend = friendsData.find(f => f.id === friendId);
            const history = (chatHistory[friendId] || []).slice(-10);

            const cleanHistory = history.map(msg => {
                let content = msg.content;
                if (content.includes('###')) content = '(特殊消息)';
                return `${msg.role === 'user' ? friend.userName : friend.name}: ${content}`;
            }).join('\n');

            // --- 核心修复：将一个大的 system prompt 拆分为 system + user ---

            // 1. System Prompt: 只负责设定角色
            const system_prompt = `你现在是 ${friend.name}，你的人设是：${friend.prompt}。`;

            // 2. User Prompt: 负责下达具体任务
            const user_prompt = `
                这是你最近和 ${friend.userName} 的聊天记录：
                ---
                ${cleanHistory || "（最近没有聊天记录）"}
                ---
                现在，请你基于你的性格和最近的聊天内容，发布一条“朋友圈”动态。
                动态需要包含“文字内容”也可加“配图的文字描述”。
                请严格按照以下JSON格式返回，不要有任何多余的文字或解释：
                {
                  "text": "这里是朋友圈的文字内容",
                  "image_description": "这里是对配图的详细文字描述"
                }
            `;
            
            const response = await fetch(`${apiConfig.url}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    // 3. 使用新的、更标准的 messages 结构
                    messages: [
                        { role: "system", content: system_prompt },
                        { role: "user", content: user_prompt }
                    ],
                    temperature: 0.8
                })
            });

            // --- 修复结束 ---

            if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
            
            const result = await response.json();
            const rawContent = result.choices[0].message.content;
            
            const jsonMatch = rawContent.match(/{[\s\S]*}/);
            
            if (!jsonMatch) {
                throw new Error("AI未返回有效的JSON格式。返回内容：" + rawContent.substring(0, 100));
            }
            
            const jsonString = jsonMatch[0];
            let momentJson;

            try {
                momentJson = JSON.parse(jsonString);
            } catch (parseError) {
                throw new Error("从AI回复中提取的JSON无效。提取内容：" + jsonString);
            }
            
            if (!momentJson.text || !momentJson.image_description) {
                 throw new Error("AI返回的JSON格式不正确，缺少 text 或 image_description 字段。");
            }

            // 用下面这个新版 newMoment 对象替换旧的
            const newMoment = {
                id: Date.now(), // 为每条动态添加一个独一无二的ID
                friendId: friend.id,
                timestamp: Date.now(),
                text: momentJson.text,
                imagePlaceholderUrl: `https://picsum.photos/seed/${Date.now()}/200`,
                imageDescription: momentJson.image_description,
                isLiked: false, // 新增：点赞状态，默认为 false
                comments: []    // 新增：评论数组，默认为空
            };

            momentsData.unshift(newMoment);

        } catch (error) {
            console.error(`为 ${friendId} 生成动态失败:`, error);
            alert(`为好友 ${friendsData.find(f=>f.id===friendId).name} 生成动态时出错：\n${error.message}`);
            break; 
        }
    }

    await saveData();
    confirmBtn.innerHTML = '<i class="fas fa-magic"></i> 让选中的好友发动态';
    confirmBtn.disabled = false;
    
    switchQqTab('moments');
}

// === 覆盖旧函数：渲染动态流 (包含删除按钮与长按事件) ===
function renderMomentsFeed() {
    const container = document.getElementById('qzone-feed-container');
    container.innerHTML = '';

    if (momentsData.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#999; margin-top:50px;">空空如也...</p>`;
        return;
    }

    momentsData.forEach(moment => {
        let name, avatar, isUserPost = false;

        // 判断是谁发的
        if (moment.author === 'user') {
            const me = friendsData[0] || { userName: '我', userAvatar: 'https://cdn-icons-png.flaticon.com/512/1077/1077114.png' };
            name = me.userName;
            avatar = me.userAvatar;
            isUserPost = true;
        } else {
            const friend = friendsData.find(f => f.id === moment.friendId);
            if (!friend) return; 
            name = friend.name;
            avatar = friend.avatar;
        }

        const time = new Date(moment.timestamp).toLocaleString();
        
        // --- 渲染评论区 (增加长按事件 oncontextmenu) ---
        const commentsHtml = (moment.comments || []).map((comment, index) => {
            const commentName = comment.name || (comment.author === 'user' ? '我' : '未知');
            // oncontextmenu 是右键菜单事件，在手机上通常对应长按
            return `
            <div class="comment" oncontextmenu="openCommentMenu(event, ${moment.id}, ${index}); return false;">
                <span class="comment-author">${commentName}:</span>
                <span class="comment-content">${comment.content}</span>
            </div>`;
        }).join('');

        // 点赞区
        let likesHtml = "";
        if (moment.likedBy && moment.likedBy.length > 0) {
            likesHtml = `<div style="font-size:12px; color:#4facfe; margin-bottom:5px;">
                <i class="fas fa-heart"></i> ${moment.likedBy.join(', ')} 觉得很赞
            </div>`;
        }

        // 图片区
        let imgHtml = "";
        if (moment.imagePlaceholderUrl) {
            imgHtml = `<div class="moment-image" style="background-image: url('${moment.imagePlaceholderUrl}')" onclick="showImageDetailById(${moment.id})"></div>`;
        }

        // 操作区
         let actionsHtml = "";
        // 只有非用户动态才显示点赞按钮
        if (!isUserPost) {
            actionsHtml = `
            <div class="moment-actions">
                <button class="action-btn-moment ${(moment.isLiked || false) ? 'liked' : ''}" onclick="toggleLike(${moment.id})">
                    <i class="fas fa-heart"></i> 赞
                </button>
            </div>`;
        }


        // 输入框 (AI动态才显示，或者都显示)
        let commentInputHtml = `
            <div class="comment-form">
                <input type="text" id="comment-input-${moment.id}" class="comment-input" placeholder="评论...">
                <button class="comment-submit-btn" onclick="submitComment(${moment.id})">发送</button>
            </div>`;

        const div = document.createElement('div');
        div.className = 'moment-post';
        div.style.position = 'relative'; // 为了让右上角按钮定位

        // --- HTML 结构 (新增了右上角的更多按钮) ---
        div.innerHTML = `
            <button class="moment-more-btn" onclick="openMomentMenu(${moment.id})">
                <i class="fas fa-ellipsis-h"></i>
            </button>

            <div class="moment-header">
                <img src="${avatar}">
                <div class="moment-header-info">
                    <h4>${name} ${isUserPost ? '<span style="font-size:10px; background:#FF9A9E; color:white; padding:2px 5px; border-radius:5px;">我</span>' : ''}</h4>
                    <p>${time}</p>
                </div>
            </div>
            <p class="moment-text">${moment.text}</p>
            ${imgHtml}
            ${actionsHtml}
            <div class="moment-comments-section" style="${(!likesHtml && !commentsHtml) ? 'display:none' : ''}">
                ${likesHtml}
                ${commentsHtml}
            </div>
            ${commentInputHtml}
        `;
        container.appendChild(div);
    });
}

// 小修改：把 showImageDetail 的参数从 index 改为 id
function showImageDetailById(momentId) {
    const moment = momentsData.find(m => m.id === momentId); // 通过ID查找
    if (!moment) return;
    
    document.getElementById('moment-image-description').innerText = moment.imageDescription;
    const placeholder = document.querySelector('#modal-moment-image-detail .moment-image-placeholder');
    placeholder.style.backgroundImage = `url('${moment.imagePlaceholderUrl}')`;
    placeholder.style.backgroundSize = 'cover';
    placeholder.querySelector('i').style.display = 'none';
    placeholder.querySelector('span').style.display = 'none';
    document.getElementById('modal-moment-image-detail').style.display = 'flex';
}

function showImageDetail(momentIndex) {
    const moment = momentsData[momentIndex];
    if (!moment) return;
    
    document.getElementById('moment-image-description').innerText = moment.imageDescription;
    // 更新占位图
    const placeholder = document.querySelector('#modal-moment-image-detail .moment-image-placeholder');
    placeholder.style.backgroundImage = `url('${moment.imagePlaceholderUrl}')`;
    placeholder.style.backgroundSize = 'cover';
    // 隐藏内部的图标和文字
    placeholder.querySelector('i').style.display = 'none';
    placeholder.querySelector('span').style.display = 'none';

    document.getElementById('modal-moment-image-detail').style.display = 'flex';
}

function closeImageDetailModal() {
    const modal = document.getElementById('modal-moment-image-detail');
    modal.style.display = 'none';
    // 恢复占位图的默认样式
    const placeholder = modal.querySelector('.moment-image-placeholder');
    placeholder.style.backgroundImage = '';
    placeholder.querySelector('i').style.display = 'block';
    placeholder.querySelector('span').style.display = 'block';
}

// =========================================================================
//   新增：点赞与评论的交互函数
// =========================================================================

function toggleLike(momentId) {
    const moment = momentsData.find(m => m.id === momentId);
    if (moment) {
        moment.isLiked = !moment.isLiked; // 切换点赞状态
        saveData();
        renderMomentsFeed(); // 重新渲染以更新UI
    }
}

function submitComment(momentId) {
    const input = document.getElementById(`comment-input-${momentId}`);
    const content = input.value.trim();
    
    if (!content) {
        alert("评论内容不能为空！");
        return;
    }

    const moment = momentsData.find(m => m.id === momentId);
    if (moment) {
        moment.comments.push({
            author: 'user',
            content: content,
            timestamp: Date.now()
        });
        input.value = ''; // 清空输入框
        saveData();
        renderMomentsFeed();
    }
}


// =========================================================================
//   AI 核心升级：注入朋友圈记忆 (替换旧的 triggerAIResponse)
async function triggerAIResponse(isReaction = false) {
    if (!apiConfig.key) { alert("请先在首页设置API Key!"); return; }

    const friend = friendsData.find(f => f.id === currentChatId);
    let history = chatHistory[currentChatId] || [];

    // --- 核心新增：获取当前现实时间 ---
    const now = new Date();
    // 格式化为：2023年10月27日 星期五 14:30
    const timeString = now.toLocaleString('zh-CN', { hour12: false, dateStyle: 'full', timeStyle: 'short' });

    let memoryContext = "";
    
    // 注入朋友圈记忆 (保留原有逻辑)
    const latestAiMoment = momentsData.find(m => m.friendId === currentChatId && m.author !== 'user');
    if (latestAiMoment) {
        memoryContext += `\n【关于你自己(AI)的动态】\n你之前发了：“${latestAiMoment.text}”。\n`;
        if(latestAiMoment.isLiked) memoryContext += `用户给你点了赞。\n`;
        const lastUserComment = (latestAiMoment.comments || []).find(c => c.author === 'user');
        if(lastUserComment) memoryContext += `用户评论说：“${lastUserComment.content}”\n`;
    }

    const latestUserMoment = momentsData.find(m => 
        m.author === 'user' && m.visibleTo && m.visibleTo.includes(currentChatId)
    );

    if (latestUserMoment) {
        const friend = friendsData.find(f => f.id === currentChatId); 
        const liked = latestUserMoment.likedBy && latestUserMoment.likedBy.includes(friend.name);
        const commentObj = (latestUserMoment.comments || []).find(c => c.name === friend.name);
        const commentContent = commentObj ? commentObj.content : "（你没有评论）"; 
        memoryContext += `\n【关于用户(你的朋友)的动态】\n用户最近发了朋友圈：“${latestUserMoment.text}” (配图描述: ${latestUserMoment.imageDescription})。\n`;
        memoryContext += `针对这条动态，你当时的反应是：${liked ? '点了赞' : '没点赞'}，并且评论说：“${commentContent}”。\n`;
    }

    let stickerListText = (stickerLibrary && stickerLibrary.length > 0) 
        ? stickerLibrary.map(s => `"${s.desc}"`).join(', ') 
        : "(暂无可用表情包)";

    let pendingPacket = null;
    for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        if (msg.role === 'user' && msg.content.includes('###RED_PACKET:')) {
            try {
                const json = JSON.parse(msg.content.replace('###RED_PACKET:', '').replace('###', ''));
                if (json.status === 'pending') pendingPacket = json;
            } catch(e) {}
            break;
        }
    }

    // --- 核心修改：在 Prompt 中注入时间 ---
    let systemPrompt = `你现在扮演：${friend.name}。设定：${friend.prompt}。
    用户：${friend.userName}。
    
    【当前现实时间】：${timeString} (请拥有时间观念，比如早上好、晚上好、节日快乐等)
    
    【核心规则】像真人一样说话，多用分段符号 ### 来控制气泡节奏。
    【表情包】可用关键词：[ ${stickerListText} ]。如果是表情，请单独输出指令：###STICKER_SEND:关键词###
    ${memoryContext}
    `;

    if (pendingPacket) {
        systemPrompt += `
        【用户发了红包：¥${pendingPacket.amount}，寄语："${pendingPacket.text}"】
        请立刻决定：
        领取回复格式: {{GET}}###(感谢语)
        退回回复格式: {{RETURN}}###(拒绝语)
        `;
    }

    let cleanHistory = history.map(msg => {
        let content = msg.content;
        if (content.includes('###STICKER:')) content = "(表情包图片)";
        if (content.includes('###RED_PACKET:')) content = "(红包消息)";
        if (content.includes('###SYSTEM:')) content = content.replace('###SYSTEM:', '(系统提示: ');
        return { role: msg.role, content: content };
    });

    let finalMessages = [{ role: "system", content: systemPrompt }, ...cleanHistory];
    
    if (pendingPacket) finalMessages.push({ role: "user", content: "(请立刻根据红包做出反应)" });
    else if (isReaction) finalMessages.push({ role: "user", content: "(请根据刚才的消息做出反应)" });

    aiBuffer = ""; typeIndex = 0; isStreamActive = true; 
    createAiBubble(friend.avatar, "typing...");
    startTypeWriter(friend.avatar); 

    let cleanUrl = apiConfig.url.trim().replace(/\/$/, '');
    if (!cleanUrl.endsWith('/v1') && cleanUrl.indexOf('openai') > -1) {
        cleanUrl += '/v1';
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(`${cleanUrl}/chat/completions`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${apiConfig.key}` 
            },
            body: JSON.stringify({ 
                model: apiConfig.model, 
                messages: finalMessages, 
                stream: true 
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API错误 (${response.status}): ${errText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') break;
                    try {
                        const data = JSON.parse(dataStr);
                        const content = data.choices[0].delta.content;
                        if (content) aiBuffer += content;
                    } catch (e) {}
                }
            }
        }
    } catch (e) {
        console.error("请求失败", e);
        isStreamActive = false; 
        if(currentBubbleDOM) {
            currentBubbleDOM.style.color = "red";
            currentBubbleDOM.innerText = "出错了: " + e.message;
            if (e.name === 'AbortError') {
                currentBubbleDOM.innerText = "连接超时！请检查网络或更换 API 地址。";
            }
        }
        alert("AI 没反应：" + e.message);
    } finally {
        isStreamActive = false;
    }
}

// === 新增：控制发布菜单 ===
function openPostMenu() {
    document.getElementById('modal-post-menu').style.display = 'flex';
}
function closePostMenu() {
    document.getElementById('modal-post-menu').style.display = 'none';
}

// === 新增：打开用户写动态弹窗 ===
function openUserPostModal() {
    closePostMenu(); // 关掉菜单
    const modal = document.getElementById('modal-user-post');
    const list = document.getElementById('user-post-visibility-list');
    
    // 1. 清空输入
    document.getElementById('user-post-text').value = "";
    document.getElementById('user-post-img-desc').value = "";
    
    // 2. 渲染好友勾选列表
    list.innerHTML = "";
    friendsData.forEach(friend => {
        const div = document.createElement('div');
        div.className = 'visibility-item';
        div.innerHTML = `
            <img src="${friend.avatar}">
            <h4>${friend.name}</h4>
            <input type="checkbox" value="${friend.id}" checked> <!-- 默认全选 -->
        `;
        list.appendChild(div);
    });
    
    // 3. 显示全屏弹窗 (利用已有的 screen 机制)
    modal.classList.add('active');
}

function closeUserPostModal() {
    document.getElementById('modal-user-post').classList.remove('active');
}

// === 最终版：极速发布 (把任务交给系统心跳) ===
async function submitUserPost() {
    const text = document.getElementById('user-post-text').value.trim();
    const imgDesc = document.getElementById('user-post-img-desc').value.trim();
    const checkboxes = document.querySelectorAll('#user-post-visibility-list input:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);

    if (!text && !imgDesc) { alert("写点什么吧！"); return; }
    if (selectedIds.length === 0) { alert("至少选一个好友看吧！"); return; }

    const newMoment = {
        id: Date.now(),
        author: 'user', 
        friendId: 'USER_ME', 
        timestamp: Date.now(),
        text: text,
        imageDescription: imgDesc || "（无配图）",
        imagePlaceholderUrl: imgDesc ? `https://picsum.photos/seed/${Date.now()}/200` : "",
        comments: [],
        likedBy: [],
        visibleTo: selectedIds 
    };

    momentsData.unshift(newMoment);
    await saveData();
    
    closeUserPostModal();
    renderMomentsFeed();
    
    alert("发布成功！好友们看到后会回复你的。");
}

// ==========================================
//   核心升级：虚拟生态系统 (Heartbeat & Free Will)
// ==========================================

// 1. 全局开关控制
function toggleWorldActivity() {
    isWorldActive = document.getElementById('global-world-toggle').checked;
    localforage.setItem('ai_world_active', isWorldActive);
    alert(isWorldActive ? "🌍 虚拟世界已唤醒，角色们开始自由活动。" : "💤 虚拟世界已暂停，所有角色进入休眠。");
}

// 2. 个人频率设置 (UI交互)
function setActivityLevel(level) {
    const friend = friendsData.find(f => f.id === currentChatId);
    if (!friend) return;

    friend.activityLevel = level; // 保存设置
    saveData();
    updateFrequencyUI(level); // 刷新UI
}

function updateFrequencyUI(level) {
    // 移除所有激活状态
    document.querySelectorAll('.segmented-control .option-btn').forEach(btn => btn.classList.remove('active'));
    // 激活当前按钮
    document.getElementById(`btn-freq-${level}`).classList.add('active');
    
    // 更新描述文案
    const texts = {
        'active': "🔥 活跃：话痨模式。TA会经常找你，秒回你的动态。",
        'standard': "🙂 标准：正常模式。偶尔找你，会思考后回复动态。",
        'quiet': "🍃 安静：高冷模式。几乎不主动找你，只点赞不评论。",
        'muted': "💤 沉睡：勿扰模式。完全停止主动互动。"
    };
    document.getElementById('freq-desc-text').innerText = texts[level];
}

// 3. 增强 openChatSettings，打开时回显当前频率
const originalOpenSettings = openChatSettings; // 备份原函数
openChatSettings = function() {
    originalOpenSettings(); // 调用原函数打开界面
    
    const friend = friendsData.find(f => f.id === currentChatId);
    // 默认为 standard
    const level = friend.activityLevel || 'standard';
    updateFrequencyUI(level);
};

// ==========================================
//   🫀 系统心跳 (The System Heartbeat)
//   这是让角色“活”过来的引擎，每 30 秒跳动一次
// ==========================================
setInterval(async () => {
    if (!isWorldActive) return; // 如果总开关关了，心脏停止跳动
    if (!apiConfig.key) return; // 没API也没法动

    console.log("🫀 系统心跳: 检查是否有角色想要行动...");

    // 遍历所有好友，进行“行动检定”
    for (const friend of friendsData) {
        await processCharacterDecision(friend);
    }

}, 30 * 1000); // 30秒一次，你可以根据需要调快或调慢


// === AI 决策引擎 ===
// === (修改版) AI 决策引擎 ===
async function processCharacterDecision(friend) {
    // 1. 获取活跃等级，计算基础概率
    const level = friend.activityLevel || 'standard';
    if (level === 'muted') return; // 沉睡者直接跳过

    let actionChance = 0;
    // 设定概率 (每30秒触发一次的概率)
    if (level === 'active') actionChance = 0.4;     // 提高到 40% 概率行动
    if (level === 'standard') actionChance = 0.1;   // 提高到 10% 概率
    if (level === 'quiet') actionChance = 0.02;     // 2% 概率

    // 掷骰子：如果没选中，就什么都不做
    if (Math.random() > actionChance) return; 

    console.log(`💡 ${friend.name} 决定开始行动...`);

    // === 决定行动内容 ===
    
    // A. 优先检查：有没有需要回复的用户动态？(保持原逻辑)
    const recentUserPost = momentsData.find(m => 
        m.author === 'user' && 
        m.visibleTo.includes(friend.id) && 
        !m.comments.some(c => c.name === friend.name) && 
        (!m.likedBy || !m.likedBy.includes(friend.name)) &&
        (!m.ignoredBy || !m.ignoredBy.includes(friend.id)) &&
        (Date.now() - m.timestamp < 24 * 60 * 60 * 1000)
    );

    if (recentUserPost) {
        console.log(`   -> 决定回复你的动态`);
        await triggerAutoReplyMoment(friend, recentUserPost);
        return; // 回复完就结束，不做其他事
    }

    // B. 如果没事可做，随机决定：是【发新动态】还是【找你聊天】？
    // 50% 概率发动态，50% 概率找你聊天
    const randomChoice = Math.random();

    if (randomChoice < 0.5) {
        // --- 新增功能：主动发朋友圈 ---
        console.log(`   -> 决定发布一条新动态`);
        await triggerAutoMoment(friend);
    } else {
        // --- 原有功能：主动私聊 ---
        // (仅限活跃和标准模式，高冷模式不主动私聊)
        if (level !== 'quiet') {
             console.log(`   -> 决定主动找你聊天`);
             await triggerAutoChat(friend);
        }
    }
}

// === 针对 Gemini 修复版：自动回复动态 ===
async function triggerAutoReplyMoment(friend, moment) {
    console.log(`🚀 [调试] 开始执行自动回复: ${friend.name} -> 动态ID ${moment.id}`);

    if (!apiConfig.key) {
        console.warn("❌ [调试] 自动回复失败: 未配置 API Key");
        return;
    }

    try {
        // 2. 构造 Prompt (保持不变)
        const systemPrompt = `你现在是 ${friend.name}，人设：${friend.prompt}。
        你的朋友发了一条朋友圈：“${moment.text}” (配图描述: ${moment.imageDescription})。
        请你做出反应。
        【重要要求】：
        1. 必须返回纯 JSON 格式，不要使用 markdown 代码块（不要写 \`\`\`json）。
        2. 格式必须为：{"like": true, "comment": "你的评论内容"}。
        3. 如果不想评论，comment 字段留空字符串。`;

        // 3. 发送请求 (关键修改在这里！！！)
        // Gemini 等模型必须要有 user 消息才能正常工作
        const response = await fetch(`${apiConfig.url}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [
                    { role: "system", content: systemPrompt }, 
                    // ▼▼▼ 新增了下面这一行，专门为了哄 Gemini 开心 ▼▼▼
                    { role: "user", content: "请根据上述情况，直接输出 JSON 结果。" } 
                ],
                temperature: 0.8
            })
        });

        // 4. 检查网络错误
        if (!response.ok) {
            const errText = await response.text();
            console.error(`❌ [调试] API 请求失败: ${response.status} - ${errText}`);
            return;
        }

        const result = await response.json();
        // 增加容错：有的API返回格式可能不同，这里打印出来看看
        console.log(`📥 [调试] API 返回完整结构:`, result);

        // 尝试获取内容
        let rawContent = "";
        if (result.choices && result.choices.length > 0 && result.choices[0].message) {
            rawContent = result.choices[0].message.content;
        } else {
            console.error("❌ [调试] API 返回结构里找不到 choices[0].message.content");
            return;
        }

        console.log(`📥 [调试] AI 原始返回内容:`, rawContent);

        // 5. 清洗与解析 JSON
        let jsonString = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
        const jsonMatch = jsonString.match(/{[\s\S]*}/);

        if (!jsonMatch) {
            console.error("❌ [调试] 无法从 AI 返回中提取 JSON，内容可能是报错信息");
            return;
        }

        let action;
        try {
            action = JSON.parse(jsonMatch[0]);
        } catch (e) {
            console.error("❌ [调试] JSON 解析错误:", e);
            return;
        }
        
        console.log(`✅ [调试] 解析成功:`, action);

        // 6. 写入数据
        let hasUpdate = false;

        // 处理点赞
        if (action.like === true) {
            if (!moment.likedBy) moment.likedBy = [];
            if (!moment.likedBy.includes(friend.name)) {
                moment.likedBy.push(friend.name);
                hasUpdate = true;
                console.log(`❤️ [调试] ${friend.name} 点赞成功`);
            }
        }

        // 处理评论
        if (action.comment && action.comment.trim() !== "") {
            if (!moment.comments) moment.comments = [];
            moment.comments.push({
                author: 'ai',
                name: friend.name,
                avatar: friend.avatar,
                content: action.comment,
                timestamp: Date.now()
            });
            hasUpdate = true;
            console.log(`💬 [调试] ${friend.name} 评论成功: ${action.comment}`);
        }

        // 7. 保存并刷新
        if (hasUpdate) {
            await saveData();

             // 如果 AI 评论了
            if (action.comment && action.comment.trim() !== "") {
                pushNotification(friend.name, `评论了你: ${action.comment}`, friend.avatar, 'moment', null);
            }
            // 如果 AI 仅仅是点赞了 (且没评论)，也可以通知
            else if (action.like === true) {
                pushNotification(friend.name, `赞了你的动态`, friend.avatar, 'moment', null);
            }
            
            console.log("💾 [调试] 数据已保存");
            
            const friendsScreen = document.getElementById('screen-friends');
            const feedContainer = document.getElementById('qzone-feed-container');
            if (friendsScreen.classList.contains('active') && feedContainer.style.display !== 'none') {
                console.log("🔄 [调试] 正在刷新动态界面 UI");
                renderMomentsFeed();
            }
        } else {
            console.log("⚠️ [调试] AI 决定无操作");
            // 标记为已忽略，防止死循环
            if (!moment.ignoredBy) moment.ignoredBy = [];
            moment.ignoredBy.push(friend.id);
            await saveData();
        }

    } catch(e) { 
        console.error("❌ [调试] 错误:", e); 
    }
}

// ==========================================
//   (最终修正版) AI 主动聊天：严格区分前台/后台
// ==========================================
async function triggerAutoChat(friend) {
    console.log(`🚀 [调试] ${friend.name} 准备发送主动消息...`);

    if (!apiConfig.key) return;

    try {
        // 1. 构造 Prompt
        const globalMemory = getGlobalContext(friend.id); 
        const systemPrompt = `你现在是 ${friend.name}，人设：${friend.prompt}。
        你决定主动给用户发一条消息。
        ${globalMemory}  // <--- 注入记忆

    【要求】：
    1. 结合当前时间、之前的动态或聊天话题，发起一个新的话题，或者继续之前的话题。
    2. 简短自然，不要带引号。直接输出内容。`;

        // 2. 请求 API
        const response = await fetch(`${apiConfig.url}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "请发一条消息。" }
                ]
            })
        });

        if (!response.ok) throw new Error("API 请求失败");

        const result = await response.json();
        const text = result.choices[0].message.content;
        console.log(`✅ [调试] 收到内容: ${text}`);

        // 3. 存入历史记录
        if (!chatHistory[friend.id]) chatHistory[friend.id] = [];
        chatHistory[friend.id].push({ 
            role: 'assistant', 
            content: text,
            timestamp: Date.now()
        });
        await saveData();

        // 刷新好友列表 (红点/预览更新)
        renderFriendList(); 

        // === 核心判断逻辑 ===
        // 条件：当前打开的聊天ID是这个人 AND 聊天屏幕是激活状态
        const isUserWatching = (currentChatId === friend.id) && document.getElementById('screen-chat').classList.contains('active');

        if (isUserWatching) {
            // [情况A：你在看] -> 直接上墙，播气泡音
            renderChatHistory(); 
            scrollToBottom();
            if (typeof playSystemSound === "function") playSystemSound('chat');
        } else {
            // [情况B：你没在看] -> 弹窗，播通知音
            // 注意：这里绝对不调用 playSystemSound('chat')
            pushNotification(friend.name, text, friend.avatar, 'chat', friend.id);
        }

    } catch(e) { 
        console.error("❌ [调试] 主动聊天出错:", e);
    }
}

// ==========================================
//   删除功能逻辑 (动态与评论)
// ==========================================

let deleteTarget = null; // 存储当前要删除的目标信息

// 1. 打开动态操作菜单 (点击右上角三个点触发)
function openMomentMenu(momentId) {
    const sheetContent = document.getElementById('action-sheet-content');
    
    sheetContent.innerHTML = `
        <div class="action-item" onclick="openSummonList(${momentId})">
            <i class="fas fa-magic" style="color: #a18cd1;"></i> 召唤好友围观
        </div>
        <div class="action-item danger" onclick="triggerDeleteMoment(${momentId})">
            <i class="fas fa-trash-alt"></i> 删除这条动态
        </div>
    `;
    document.getElementById('universal-action-menu').style.display = 'flex';
}

// 2. 打开评论操作菜单 (长按评论触发)
function openCommentMenu(event, momentId, commentIndex) {
    if(event) event.preventDefault();
    
    const sheetContent = document.getElementById('action-sheet-content');
    sheetContent.innerHTML = `
        <div class="action-item" onclick="replyToComment(${momentId}, ${commentIndex})">
            <i class="fas fa-reply" style="color: #4facfe;"></i> 回复
        </div>
        <div class="action-item" onclick="copyCommentText(${momentId}, ${commentIndex})">
            <i class="fas fa-copy"></i> 复制
        </div>
        <div class="action-item danger" onclick="triggerDeleteComment(${momentId}, ${commentIndex})">
            <i class="fas fa-trash-alt"></i> 删除
        </div>
    `;
    document.getElementById('universal-action-menu').style.display = 'flex';
}

// === 新增：回复评论逻辑 ===
function replyToComment(momentId, commentIndex) {
    closeUniversalMenu();
    
    const moment = momentsData.find(m => m.id === momentId);
    if (!moment || !moment.comments[commentIndex]) return;

    const targetComment = moment.comments[commentIndex];
    // 兼容旧数据，如果没有name就根据author判断
    const targetName = targetComment.name || (targetComment.author === 'user' ? '我' : '未知用户');

    const input = document.getElementById(`comment-input-${momentId}`);
    if (input) {
        input.value = `回复 @${targetName}: `;
        input.focus();
    }
}

// 关闭操作菜单
function closeUniversalMenu() {
    document.getElementById('universal-action-menu').style.display = 'none';
}

// 辅助：复制评论
function copyCommentText(mId, cIdx) {
    const m = momentsData.find(x => x.id === mId);
    if(m && m.comments[cIdx]) {
        navigator.clipboard.writeText(m.comments[cIdx].content);
        alert("已复制");
    }
    closeUniversalMenu();
}

// --- 删除确认流程 ---

// 触发动态删除
function triggerDeleteMoment(momentId) {
    closeUniversalMenu();
    deleteTarget = { type: 'moment', id: momentId };
    showConfirmModal("删除动态", "确定要删除这条动态吗？");
}

// 触发评论删除
function triggerDeleteComment(momentId, commentIndex) {
    closeUniversalMenu();
    deleteTarget = { type: 'comment', mId: momentId, cIdx: commentIndex };
    showConfirmModal("删除评论", "确定要删除这条评论吗？");
}

// 显示确认弹窗
function showConfirmModal(title, desc) {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-desc').innerText = desc;
    document.getElementById('universal-confirm-modal').style.display = 'flex';
}

// 关闭确认弹窗
function closeConfirmModal() {
    document.getElementById('universal-confirm-modal').style.display = 'none';
    deleteTarget = null;
}

// 执行删除 (点击确认后)
async function executeDelete() {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'moment') {
        // 删除动态
        momentsData = momentsData.filter(m => m.id !== deleteTarget.id);
    } 
    else if (deleteTarget.type === 'comment') {
        // 删除评论
        const moment = momentsData.find(m => m.id === deleteTarget.mId);
        if (moment && moment.comments) {
            moment.comments.splice(deleteTarget.cIdx, 1);
        }
    }

    // 保存并刷新
    await saveData();
    renderMomentsFeed();
    
    closeConfirmModal();
}

// ==========================================
//   🔮 召唤系统 (Summon System V2)
// ==========================================

let currentSummonMomentId = null;

// 1. 打开召唤列表弹窗
function openSummonList(momentId) {
    closeUniversalMenu(); // 关掉底部菜单
    currentSummonMomentId = momentId;
    
    const list = document.getElementById('summon-friend-list');
    list.innerHTML = '';

    // 过滤：如果是AI发的动态，虽然可以召唤别人来看，但通常不召唤发布者自己
    const moment = momentsData.find(m => m.id === momentId);
    
    friendsData.forEach(friend => {
        // 如果是发布者本人，跳过 (自己不用召唤自己)
        if (moment && moment.friendId === friend.id && moment.author !== 'user') return;

        const div = document.createElement('div');
        div.className = 'summon-item';
        div.onclick = () => executeSummon(friend);
        div.innerHTML = `
            <img src="${friend.avatar}">
            <h4>${friend.name}</h4>
            <i class="fas fa-chevron-right"></i>
        `;
        list.appendChild(div);
    });

    document.getElementById('modal-summon-selection').style.display = 'flex';
}

function closeSummonModal() {
    document.getElementById('modal-summon-selection').style.display = 'none';
    currentSummonMomentId = null;
}

// 2. 执行召唤 (核心 AI 逻辑)
async function executeSummon(targetFriend) {
    const momentId = currentSummonMomentId;
    const moment = momentsData.find(m => m.id === momentId);
    if (!moment || !apiConfig.key) return;

    closeSummonModal(); // 关闭弹窗
    alert(`🔮 已召唤 ${targetFriend.name}，请稍候...`);

    // --- A. 准备上下文：发帖者是谁？ ---
    let authorName = "用户(我)";
    let authorPrompt = "用户的性格设定：无（请根据正常朋友关系推断）。";

    if (moment.author !== 'user') {
        const authorFriend = friendsData.find(f => f.id === moment.friendId);
        if (authorFriend) {
            authorName = authorFriend.name;
            authorPrompt = `发帖者【${authorName}】的人设是：${authorFriend.prompt}。`;
        }
    }

    // --- B. 准备上下文：评论区有什么？ ---
    const commentsContext = (moment.comments || []).map(c => {
        const cName = c.name || (c.author === 'user' ? '用户' : '未知');
        return `- ${cName}: ${c.content}`;
    }).join('\n');

    try {
        // --- C. 构造超级 Prompt (包含双方人设 + 多选指令) ---
        const systemPrompt = `你现在是【${targetFriend.name}】，你的人设是：${targetFriend.prompt}。
        
        【背景】：
        你的朋友/熟人【${authorName}】发了一条动态。你被召唤来看这条动态。
        
        【对方(发帖者)信息】：
        ${authorPrompt}
        (请根据你们两个人设的差异或共同点，决定你的态度。例如：傲娇对热血，学霸对学渣，或者死党之间的互动。)

        【动态内容】：
        文字：“${moment.text}”
        配图描述：“${moment.imageDescription}”

        【已有评论】：
        ${commentsContext || "(暂无评论)"}

        【任务】：
        请根据你的人设和对方的人设，做出反应。
        你可以选择【一项或多项】行动。
        
        【行动选项】：
        1. "like": true (点赞)
        2. "comment": "你的评论内容" (在动态下评论。如果是回复某人，请在内容开头写 "回复 @名字: ")
        3. "private_msg": "私信内容" (发QQ私信给用户)
        4. "new_moment": {"text": "...", "img_desc": "..."} (有感而发，自己发一条新动态)

        【格式要求】：
        必须返回纯 JSON，包含一个 "actions" 数组。至少包含一个行动。
        示例：
        {
            "actions": [
                { "type": "like" },
                { "type": "comment", "content": "回复 @${authorName}: 哈哈哈笑死我了" },
                { "type": "private_msg", "content": "用户，你看那个动态了吗？" }
            ]
        }
        `;

        // --- D. 调用 API ---
        h(`${apiConfig.url}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "请开始你的表演，直接输出 JSON。" }
                ],
                temperature: 0.8
            })
        });

        const result = await response.json();
        const rawContent = result.choices[0].message.content;
        
        // --- E. 解析结果 ---
        let jsonString = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();
        const jsonMatch = jsonString.match(/{[\s\S]*}/);
        
        if (!jsonMatch) throw new Error("无法解析JSON");
        
        const data = JSON.parse(jsonMatch[0]);
        const actions = data.actions || [];
        
        let hasUpdate = false;

        // --- F. 执行所有行动 ---
        for (const action of actions) {
            // 1. 点赞
            if ((action.type === 'like' || action.like === true)) { // 兼容旧格式
                if (!moment.likedBy) moment.likedBy = [];
                if (!moment.likedBy.includes(targetFriend.name)) {
                    moment.likedBy.push(targetFriend.name);
                    hasUpdate = true;
                }
            }

            // 2. 评论
            if (action.type === 'comment' && action.content) {
                moment.comments.push({
                    author: 'ai',
                    name: targetFriend.name,
                    avatar: targetFriend.avatar,
                    content: action.content,
                    timestamp: Date.now()
                });
                hasUpdate = true;
            }

            // 3. 私信
            if (action.type === 'private_msg' && action.content) {
                if (!chatHistory[targetFriend.id]) chatHistory[targetFriend.id] = [];
                chatHistory[targetFriend.id].push({ role: 'assistant', content: action.content });
                // 刷新一下好友列表显示红点(最新消息)
                renderFriendList();
            }

            // 4. 发新动态
            if (action.type === 'new_moment' && action.content) {
                const newM = {
                    id: Date.now() + 10, // 加点时间防止ID冲突
                    author: 'ai',
                    friendId: targetFriend.id,
                    timestamp: Date.now(),
                    text: action.content.text || action.content, // 兼容
                    imageDescription: action.content.img_desc || "无配图",
                    imagePlaceholderUrl: `https://picsum.photos/seed/${Date.now()}/200`,
                    isLiked: false,
                    comments: []
                };
                momentsData.unshift(newM);
                hasUpdate = true;
            }
        }

        // --- G. 保存并刷新 ---
        if (hasUpdate) {
            await saveData();
            renderMomentsFeed();
        }

    } catch (e) {
        console.error("召唤失败", e);
        alert("召唤失败，AI 好像开小差了...");
    }
}

// ==========================================
//   (最终修复版) AI 主动发布朋友圈的核心逻辑
// ==========================================
async function triggerAutoMoment(friend) {
    if (!apiConfig.key) return;

    try {
        // 1. 构造提示词
        const globalMemory = getGlobalContext(friend.id);
        const systemPrompt = `你现在是 ${friend.name}，人设：${friend.prompt}。
        【当前任务】：请分享你的生活、心情或吐槽，发一条“朋友圈”动态。
        ${globalMemory} // <--- 注入记忆

        【要求】：
        1. 必须返回纯 JSON 格式。
        2. 格式：{"text": "正文内容", "img_desc": "对配图的画面描述"}
        3. 内容要符合人设，简短自然，不要太长。 根据当前时间（比如深夜、清晨）和最近发生的事来写。`;

        // 2. 请求 AI
        const response = await fetch(`${apiConfig.url}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "请直接输出JSON，不要废话。" }
                ]
            })
        });

        // 3. 解析结果
        const result = await response.json();
        const rawContent = result.choices[0].message.content;
        const jsonMatch = rawContent.match(/{[\s\S]*}/); 

        if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            
            // 4. 创建新动态对象
            const newMoment = {
                id: Date.now(),
                author: 'ai',
                friendId: friend.id,
                timestamp: Date.now(),
                text: data.text,
                imageDescription: data.img_desc || "无配图",
                imagePlaceholderUrl: `https://picsum.photos/seed/${Date.now()}/200`,
                isLiked: false,
                comments: []
            };

            // 5. 保存
            momentsData.unshift(newMoment); 
            await saveData();

            // === ⬇️ 这里是修复的地方，逻辑合并了 ⬇️ ===
            const feedContainer = document.getElementById('qzone-feed-container');
            
            // 判断：如果正好在看动态页，就刷新；如果没在看，就弹窗通知
            if (feedContainer.style.display !== 'none') {
                renderMomentsFeed();
            } else {
                pushNotification(friend.name, "发布了一条新动态", friend.avatar, 'moment', null);
            }
            // === ⬆️ 修复结束 ⬆️ ===
            
            console.log(`✅ ${friend.name} 的动态发布成功！`);
        }

    } catch (e) {
        console.error("AI 自动发动态失败:", e);
    }
}

// ==========================================
//   (最终修正版) 通知栏系统
// ==========================================
function pushNotification(title, content, avatar, type, targetId) {
    // 1. 播放通知音 (Notif Sound) - 绝对不播气泡音
    if (typeof playSystemSound === "function") {
        playSystemSound('notif'); 
    }
    if (navigator.vibrate) navigator.vibrate(200);

    // 2. 获取容器 (如果没有就自动创建一个，防止报错)
    let area = document.getElementById('notification-area');
    if (!area) {
        area = document.createElement('div');
        area.id = 'notification-area';
        document.querySelector('.phone-frame').appendChild(area);
    }

    // 3. 创建弹窗 DOM
    const div = document.createElement('div');
    div.className = 'notification-banner';
    
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
    
    div.innerHTML = `
        <img src="${avatar}" class="notif-avatar">
        <div class="notif-content">
            <div class="notif-title">
                <span style="font-weight:bold; color:#333;">${title}</span>
                <span class="notif-time">${timeStr}</span>
            </div>
            <div class="notif-text">${content}</div>
        </div>
    `;

    // 4. 点击跳转逻辑
    div.onclick = () => {
        div.remove();
        if (type === 'chat') {
            openChat(targetId);
        } else if (type === 'moment') {
            goToScreen('screen-friends');
            switchQqTab('moments');
        }
    };

    // 5. 显示并自动消失
    area.appendChild(div);
    setTimeout(() => {
        div.style.opacity = '0';
        div.style.transform = 'translateY(-20px)';
        div.style.transition = 'all 0.3s';
        setTimeout(() => div.remove(), 300);
    }, 4000);
}

// ==========================================
//   (新增) 手动唤醒/强制心跳功能
// ==========================================
async function forceHeartbeat() {
    if (!isWorldActive) {
        alert("虚拟世界已暂停，请先打开“允许角色自由活动”开关。");
        return;
    }
    if (!apiConfig.key) {
        alert("请先设置 API Key！");
        return;
    }

    alert("正在唤醒所有角色，请稍候...");
    console.log("🫀 手动强制心跳: 检查所有角色...");

    // 遍历所有好友，强制让他们进行一次“行动检定”
    for (const friend of friendsData) {
        await processCharacterDecision(friend);
    }

    alert("所有角色都检查完毕！\n如果有人想找你，你很快会收到通知或消息。");
}

// ==========================================
//   新增功能：黑金星空视频通话系统
// ==========================================

// 1. 进入视频通话
function enterVideoCall() {
    goToScreen('screen-video-call'); 
    const friend = friendsData.find(f => f.id === currentChatId);
    if(friend) document.getElementById('video-partner-avatar').src = friend.avatar;
    
    document.getElementById('video-chat-box').innerHTML = '';
    initStars();
    
    videoCallStartTime = Date.now(); //记录通话开始时间
    currentVideoLog = []; // --- 清空剧本记录 ---

    // 自动开场
    addVideoMessage('narration', '信号连接成功...');
    setTimeout(() => { triggerVideoAI(true); }, 1000);
}

// 2. 退出视频通话
// 修改后的退出函数：修复刷新问题
function exitVideoCall() {
     videoCallStartTime = null; //清空通话开始时间 
    // 1. 先判断有没有聊天记录需要保存
    if (currentVideoLog.length > 0) {
        const logData = {
            id: Date.now(),
            duration: currentVideoLog.length,
            logs: currentVideoLog
        };
        
        const content = `###VIDEO_LOG:${JSON.stringify(logData)}###`;
        
        if (!chatHistory[currentChatId]) chatHistory[currentChatId] = [];
        chatHistory[currentChatId].push({
            role: 'system',
            content: content,
            timestamp: Date.now()
        });
        
        // 保存数据
        saveData();
    }

    // 2. 关键修改：先切换回聊天界面
    goToScreen('screen-chat'); 

    // 3. 强制重新渲染聊天列表，并滚到底部
    // 使用 setTimeout 稍微延时一点点，确保界面切换动画完成后再渲染，保证万无一失
    setTimeout(() => {
        renderChatHistory(); // 重新画气泡
        scrollToBottom();    // 滚到底部看到新气泡
    }, 50);
}

// 3. 初始化星星动画 (性能优化版)
function initStars() {
    const starContainer = document.getElementById('star-bg');
    starContainer.innerHTML = ''; // 清空防止重复
    for(let i=0; i<70; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        const size = Math.random() * 1.5 + 1; 
        star.style.width = size + 'px';
        star.style.height = size + 'px';
        star.style.setProperty('--dur', (Math.random() * 3 + 2) + 's');
        star.style.animationDelay = (Math.random() * 2) + 's';
        starContainer.appendChild(star);
    }
}

// ==========================================
//   核心修改：手动控制回复 & 屏幕记忆读取
// ==========================================

// 4. 发送用户消息 (修改版：只发送，不触发AI)
function sendVideoMessage() {
    const input = document.getElementById('video-input');
    const text = input.value.trim();
    if (!text) return;
    
    // 只在屏幕上显示气泡
    addVideoMessage('user', text);
    input.value = '';
    
}

// ==============================================================
//   (最终时间感知版) 视频通话 AI 核心
// ==============================================================
async function triggerVideoAI(isInit = false) {
    if (!apiConfig.key) { alert("请先设置API Key"); return; }
    
    const friend = friendsData.find(f => f.id === currentChatId);
    const loadingDiv = addVideoMessage('narration', '正在渲染画面...');

    try {
        // --- A. (核心新增) 计算时间与通话时长 ---
        const now = new Date();
        const timeString = now.toLocaleString('zh-CN', { hour12: false, timeStyle: 'short' }); // 例如 "凌晨2:15"
        
        let durationContext = "";
        if (videoCallStartTime) {
            const durationInMinutes = Math.floor((Date.now() - videoCallStartTime) / (1000 * 60));
            if (durationInMinutes > 0) {
                durationContext = `你们已经通话了 ${durationInMinutes} 分钟。`;
            }
        }
        
        // --- B. 构造包含时间感知的剧本指令 ---
        const systemPrompt = `你现在正在和用户进行【视频通话】。
        你扮演：${friend.name}。人设：${friend.prompt}。
        
        【通话状态】：
        当前现实时间是：${timeString}。
        ${durationContext}
        (请基于当前时间和通话时长，做出符合逻辑的反应。例如，深夜时关心对方，长时间通话后表达开心或疲惫。)
        
        【核心指令】：
        请像写剧本一样回复，输出【多条】连续的内容。
        请严格遵守以下格式，每一行只写一个动作或一句话：可以连续生成多行动作或多行对话。
        
        格式说明：
        ###ACT: 旁白描写 (要有电影镜头感，描写光影、微表情、氛围等)
        ###SAY: 语音对话 (口语化、自然)
        
        示例 (深夜长时间通话)：
        ###ACT: 他看着屏幕里的你，眼神里流露出一丝心疼，声音也变得格外轻柔。
        ###SAY: 都${timeString}了，还不睡吗？
        ###ACT: 他打了个哈欠，但嘴角却忍不住微微上扬。
        ###SAY: 不过... 跟你聊了这么久，真开心。`;

        let messages = [
            { role: "system", content: systemPrompt }
        ];

        // --- C. 注入记忆 (代码不变) ---
        const recentHistory = (chatHistory[currentChatId] || []).slice(-3);
        recentHistory.forEach(msg => {
            if(!msg.content.includes('###')) {
                messages.push({ role: msg.role, content: msg.content });
            }
        });
        const screenBubbles = document.querySelectorAll('#video-chat-box .v-msg');
        screenBubbles.forEach(div => {
            const text = div.innerText.trim();
            if (div.classList.contains('v-user-msg')) {
                messages.push({ role: "user", content: text });
            }
            else if (div.classList.contains('v-ai-msg')) {
                messages.push({ role: "assistant", content: `###SAY:${text}` });
            }
        });

        // --- D. 触发逻辑 (代码不变) ---
        if (isInit) {
             messages.push({ role: "user", content: "（视频通话已接通，请你先开口打招呼）" });
        } else {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
                messages.push({ role: "user", content: "（请继续你的反应，或者补充几句）" });
            }
        }

        // --- E. 发送请求 (代码不变) ---
        const response = await fetch(`${apiConfig.url}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: messages,
                temperature: 0.85 
            })
        });

        const data = await response.json();
        const rawContent = data.choices[0].message.content;

        // --- F. 解析剧本并播放 (代码不变) ---
        loadingDiv.remove();
        const lines = rawContent.split('\n');
        const queue = [];

        lines.forEach(line => {
            line = line.trim();
            if (!line) return;
            if (line.startsWith('###ACT:')) {
                queue.push({ type: 'narration', text: line.replace('###ACT:', '').trim() });
            } 
            else if (line.startsWith('###SAY:')) {
                queue.push({ type: 'ai', text: line.replace('###SAY:', '').trim() });
            }
            else if (line.length > 0) {
                const cleanText = line.replace(/###/g, '').trim();
                if(cleanText) queue.push({ type: 'ai', text: cleanText });
            }
        });
        playVideoQueue(queue, 0);

    } catch (e) {
        if(loadingDiv) loadingDiv.innerHTML = `<span style="color:#ff4757">信号中断: ${e.message}</span>`;
        console.error(e);
    }
}

// 辅助函数保持不变
function playVideoQueue(queue, index) {
    if (index >= queue.length) return;

    const item = queue[index];
    addVideoMessage(item.type, item.text);

    // 计算延迟：因为现在的旁白变长了，用户需要更多时间阅读
    // 所以如果 type 是 narration，延迟要根据字数动态计算
    let delay = 1200; 
    
    if (item.type === 'narration') {
        // 基础 1秒 + 每5个字多读 0.1秒
        delay = 1000 + (item.text.length * 50); 
    }

    setTimeout(() => {
        playVideoQueue(queue, index + 1);
    }, delay);
}

// 6. 渲染黑金气泡到屏幕
function addVideoMessage(type, content) {
    const box = document.getElementById('video-chat-box');
    const div = document.createElement('div');
    div.className = 'v-msg'; 
    
    // --- 新增：实时记录剧本 ---
    // 把每一条消息都存进数组里
    if (content !== '信号连接成功...' && content !== '正在聆听...') {
        currentVideoLog.push({
            type: type, // 'user', 'ai', 'narration'
            content: content,
            time: Date.now()
        });
    }
    // ------------------------

    if (type === 'user') {
        div.classList.add('v-user-msg');
        div.innerHTML = `<div class="bubble">${content}</div>`;
    } else if (type === 'ai') {
        div.classList.add('v-ai-msg');
        div.innerHTML = `<div class="bubble">${content}</div>`;
    } else if (type === 'narration') {
        div.classList.add('v-narration');
        div.innerHTML = `<span>${content}</span>`;
    }
    
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div; 
}

// 打开剧本回顾
function openVideoHistoryModal(msgIndex) {
    const msg = chatHistory[currentChatId][msgIndex];
    if (!msg) return;
    
    const jsonStr = msg.content.replace('###VIDEO_LOG:', '').replace('###', '');
    const data = JSON.parse(jsonStr);
    const logs = data.logs || [];
    const friend = friendsData.find(f => f.id === currentChatId);
    
    const list = document.getElementById('video-script-list');
    list.innerHTML = ''; // 清空
    
    logs.forEach(item => {
        const div = document.createElement('div');
        
        if (item.type === 'narration') {
            div.className = 'script-item narration';
            div.innerText = item.content;
        } else {
            div.className = 'script-item dialogue';
            // 如果是 user 显示 '我'，如果是 ai 显示角色名
            const name = (item.type === 'user') ? '我' : friend.name;
            div.innerHTML = `<span class="script-role">${name}:</span> ${item.content}`;
        }
        list.appendChild(div);
    });
    
    document.getElementById('modal-video-history').style.display = 'flex';
}

// 关闭剧本回顾
function closeVideoHistoryModal() {
    document.getElementById('modal-video-history').style.display = 'none';
}

/**
 * 显示来电呼叫屏幕 (修复版)
 * @param {string} reason - AI 想要打电话的原因
 */
function showIncomingCallScreen(reason) {
    // 1. 尝试获取当前聊天的角色
    let friend = friendsData.find(f => f.id === currentChatId);

    // 2. 【修复点】如果当前没在聊天默认选第一个好友进行测试
    if (!friend) {
        if (friendsData.length > 0) {
            friend = friendsData[0];
            // 顺便把 currentChatId 设置为这个人，否则接听后会报错
            currentChatId = friend.id; 
        } else {
            alert("你还没有创建任何角色，无法测试来电！");
            return;
        }
    }

    // 3. 填充来电信息
    document.getElementById('caller-avatar').src = friend.avatar;
    document.getElementById('caller-name').innerText = friend.name;
    
    // 背景图逻辑
    const bgEl = document.querySelector('.incoming-call-bg');
    if(bgEl) bgEl.style.backgroundImage = `url('${friend.avatar}')`;

    // 如果AI没给原因，就用默认的
    document.getElementById('caller-reason').innerText = `“${reason || '想听听你的声音...'}”`;

    // 4. 切换到呼叫屏幕
    goToScreen('screen-incoming-call');

    // 5. 播放铃声
    playSystemSound('ring', true); // true 表示循环播放
}

/**
 * 用户点击“接听”按钮
 */
function acceptCall() {
    stopRingtone(); // 停止铃声
    // 直接进入已有的视频通话界面
    enterVideoCall(); 
}

/**
 * 用户点击“拒接”按钮
 */
function declineCall() {
    stopRingtone(); // 停止铃声
    // 1. 隐藏来电界面，返回聊天
    goToScreen('screen-chat');

    // 2. (关键) 向聊天记录中插入一条系统消息，告知AI它的通话被拒绝了
    const systemMsg = {
        role: 'system',
        content: '###SYSTEM:你发起的视频通话被用户挂断了。###',
        timestamp: Date.now()
    };

    if (!chatHistory[currentChatId]) {
        chatHistory[currentChatId] = [];
    }
    chatHistory[currentChatId].push(systemMsg);
    
    saveData();
    renderChatHistory();

    // 3. (可选但推荐) 立刻触发AI回应，让它对“被挂断”这件事做出反应
    setTimeout(() => {
        triggerAIResponse(true); // isReaction=true 告诉AI这是对事件的反应
    }, 500);
}

// ==========================================
//   🔊 声音系统 (Sound System) - 纯净自定义版
// ==========================================

// 1. 声音配置：只存音量
let soundConfig = {
    volume: 0.5 // 默认 50% 音量
};

// 2. 存储音频数据的缓存 (Base64字符串)
let customSounds = {
    notif: null,
    chat: null,
    ring: null
};

let currentRingtoneAudio = null; // 用于控制铃声停止

// 3. 初始化加载声音设置
async function loadSoundSettings() {
    // 读取音量设置
    const savedConfig = await localforage.getItem('ai_sound_config_v2');
    if (savedConfig && savedConfig.volume !== undefined) {
        soundConfig.volume = savedConfig.volume;
    }

    // 读取音频文件
    const custom = await localforage.getItem('ai_custom_sounds');
    if (custom) customSounds = custom;
    
    // 更新音量滑块UI
    const slider = document.getElementById('global-volume-slider');
    const label = document.getElementById('vol-display-text');
    if (slider && label) {
        slider.value = soundConfig.volume;
        label.innerText = Math.floor(soundConfig.volume * 100) + "%";
    }

    // 更新上传状态UI
    updateSoundStatusUI('notif');
    updateSoundStatusUI('chat');
    updateSoundStatusUI('ring');
}

// 辅助：更新文字显示 (已设置 / 未设置)
function updateSoundStatusUI(type) {
    const el = document.getElementById(`status-text-${type}`);
    if (!el) return;
    
    if (customSounds[type]) {
        el.innerText = "✅ 已设置自定义音频";
        el.style.color = "#4facfe";
        el.style.fontWeight = "bold";
    } else {
        el.innerText = "(未设置，静音)";
        el.style.color = "#ccc";
        el.style.fontWeight = "normal";
    }
}

// 4. 播放声音的核心函数
function playSystemSound(type, isLoop = false) {
    // 如果没有上传过这个类型的声音，直接退出，保持静音
    if (!customSounds[type]) {
        console.log(`[Sound] No custom sound for ${type}, keeping silent.`);
        return;
    }

    const src = customSounds[type];
    const audio = new Audio(src);
    
    // 应用全局音量
    audio.volume = soundConfig.volume; 
    audio.loop = isLoop;
    
    // 播放
    audio.play().catch(e => console.log("播放被浏览器拦截(需用户交互):", e));

    if (isLoop) currentRingtoneAudio = audio; // 保存引用以便停止铃声
    return audio;
}

// 5. 停止铃声
function stopRingtone() {
    if (currentRingtoneAudio) {
        currentRingtoneAudio.pause();
        currentRingtoneAudio.currentTime = 0;
        currentRingtoneAudio = null;
    }
}

// 6. UI交互：点击上传按钮
function triggerSoundUpload(type) {
    document.getElementById(`file-${type}`).click();
}

// 7. 处理文件选择
function handleSoundUpload(type, input) {
    const file = input.files[0];
    if (!file) return;
    
    // 限制大小 (比如 2MB)，防止浏览器存储爆炸
    if (file.size > 2 * 1024 * 1024) {
        alert("音频文件太大了！请上传 2MB 以内的 MP3/WAV 文件。");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const base64 = e.target.result;
        customSounds[type] = base64; // 更新内存
        
        // 自动保存
        saveAllSounds();
        
        // 更新UI
        updateSoundStatusUI(type);
        
        // 立即播放一下，让用户确认声音和音量
        playSystemSound(type);
    };
    reader.readAsDataURL(file);
}

// 8. 实时更新音量预览 (拖动滑块时)
function updateVolumePreview(val) {
    soundConfig.volume = parseFloat(val);
    document.getElementById('vol-display-text').innerText = Math.floor(soundConfig.volume * 100) + "%";
}

// 9. 保存音量设置 (松开滑块时)
function saveVolumeSetting() {
    localforage.setItem('ai_sound_config_v2', soundConfig);
    // 播放一个声音试听音量 (如果有通知音就播通知音，没有就算了)
    playSystemSound('notif');
}

// 10. 保存所有声音数据到数据库
function saveAllSounds() {
    localforage.setItem('ai_custom_sounds', customSounds);
}

// 11. 清空所有声音
function clearAllSounds() {
    if(confirm("确定要删除所有自定义声音并恢复静音吗？")) {
        customSounds = { notif: null, chat: null, ring: null };
        saveAllSounds();
        updateSoundStatusUI('notif');
        updateSoundStatusUI('chat');
        updateSoundStatusUI('ring');
        alert("已清空。");
    }
}

// ==========================================
//   🧠 全局记忆核心 (The Global Brain)
// ==========================================
function getGlobalContext(friendId) {
    const friend = friendsData.find(f => f.id === friendId);
    if (!friend) return "";

    // 1. 获取当前时间
    const now = new Date();
    const timeStr = now.toLocaleString('zh-CN', { hour12: false, weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    // 2. 整理最近聊天记录 (取最后 15 条)
    const chats = (chatHistory[friendId] || []).slice(-15);
    const chatContext = chats.map(msg => {
        const role = msg.role === 'user' ? friend.userName : friend.name;
        // 过滤掉系统指令，只保留纯文本，节省 Token
        let content = msg.content.replace(/###.*?###/g, '[动作/指令]'); 
        return `${role}: ${content}`;
    }).join('\n');

    // 3. 整理最近朋友圈动态 (AI发的 + 用户发的)
    // 找出关于这个好友相关的最近 5 条动态
    const relatedMoments = momentsData.filter(m => 
        m.friendId === friendId || // AI发的
        (m.author === 'user' && m.visibleTo && m.visibleTo.includes(friendId)) // 用户发给AI看的
    ).slice(0, 5);

    let momentContext = "";
    if (relatedMoments.length > 0) {
        momentContext = relatedMoments.map(m => {
            const author = m.author === 'user' ? '用户' : friend.name;
            const time = new Date(m.timestamp).toLocaleString('zh-CN', {month:'numeric', day:'numeric', hour:'numeric', minute:'numeric'});
            
            // 检查互动情况
            let interaction = "";
            if (m.isLiked) interaction += "[用户点了赞]";
            if (m.comments && m.comments.length > 0) {
                m.comments.forEach(c => {
                    const cName = c.name || (c.author === 'user' ? '用户' : friend.name);
                    interaction += ` [${cName}评论: ${c.content}]`;
                });
            }
            
            return `[${time}] ${author}发了一条动态: "${m.text}" (配图: ${m.imageDescription}) ${interaction}`;
        }).join('\n');
    } else {
        momentContext = "(暂无最近动态)";
    }

    // 4. 组装最终记忆块
    return `
    【全局状态记忆】
    [当前现实时间]: ${timeStr}
    
    [近期朋友圈动态与互动]:
    ${momentContext}
    
    [最近聊天对话]:
    ${chatContext}
    
    [你的记忆指令]:
    请结合上述动态、聊天记录和时间，保持对话的连贯性。不要重复之前说过的话。
    如果用户提到刚才的动态，请立刻反应过来。
    `;
}