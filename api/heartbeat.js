// 这是 AI 的离线大脑，它会在 Vercel 的服务器上运行

export default async function handler(request, response) {
    // TODO: 在这里获取所有需要推送的用户的订阅信息
    // (我们先跳过这一步，假设我们已经拿到了一个)
    const userSubscription = null; // 之后我们会从数据库读取

    if (!userSubscription) {
        return response.status(200).json({ message: "No users to message." });
    }

    // 1. 【感知】获取当前情况
    const now = new Date();
    // TODO: 从数据库读取玩家的设置和上次互动时间
    const frequency = 'medium'; // 假设频率为中
    const lastContacted = new Date(0); // 假设从未联系过

    // 2. 【决策】根据频率决定是否要尝试发消息
    let contactChance = 0;
    switch (frequency) {
        case 'high':   contactChance = 0.5; break; // 50% 的基础概率
        case 'medium': contactChance = 0.2; break; // 20%
        case 'low':    contactChance = 0.05; break; // 5%
        case 'off':    contactChance = 0; break;
    }

    // 如果随机数小于我们的概率，就决定发消息！
    if (Math.random() < contactChance) {
        
        // 3. 【构思】让 AI 生成一条消息
        // TODO: 在这里加入你调用大模型 API 的逻辑
        const aiMessage = {
            title: "来自「他的名字」",
            body: "没什么事，就是突然很想你。"
        };

        // 4. 【行动】发送推送通知
        // TODO: 在这里加入发送 Web Push 的代码

        console.log("Decided to send a message:", aiMessage.body);
        return response.status(200).json({ status: "Message Sent", message: aiMessage });

    } else {
        console.log("Decided not to send a message this time.");
        return response.status(200).json({ status: "No Message Sent" });
    }
}
