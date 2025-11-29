// 注意：AI 只能看到 key (例如 'casual', 'bedroom')，看不到链接。
// 所以 key 的名字要起得通俗易懂，最好是英文。

const ASSETS = {
    // 1. 角色 (char)
    char: {
        casual: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=1000&auto=format&fit=crop", 
        // 比如你可以加一个 crying: "链接...", AI 如果觉得剧情悲伤，就会自动调用 crying
    },

    // 2. 背景 (bg)
    bg: {
        office: "https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=1000&auto=format&fit=crop",
        bedroom: "https://images.unsplash.com/photo-1515549832467-8783363e19b6?q=80&w=1000&auto=format&fit=crop",
        sea: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1000&auto=format&fit=crop"
    },

    // 3. 音频 (audio)
    // 建议把 BGM 和 SFX 混在一起放在这里，让 AI 自己选
    audio: {
        bgm_happy: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        bgm_sad: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
        sfx_rain: "https://assets.mixkit.co/sfx/preview/mixkit-light-rain-loop-2393.mp3"
    }
};