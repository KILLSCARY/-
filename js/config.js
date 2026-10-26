// Всё, что настраивается без лезания в код игры: ссылки, баланс, тексты.

export const LINKS = {
    // ссылка на бота / мини-апп (для кнопки «Поделиться»)
    bot: "https://t.me/your_bot/app",
    // куда ведёт кнопка курса на экране проигрыша
    course: "https://t.me/your_course_channel",
};

// Баланс. Скорость в метрах (юнитах) в секунду.
export const BALANCE = {
    speedStart: 13,
    speedMax: 30,
    speedRamp: 0.18,        // +м/с за каждые 10 секунд забега
    laneWidth: 1.7,
    jumpPower: 9.2,
    gravity: 26,
    slideTime: 0.65,        // сек, сколько длится подкат
    rowGapStart: 20,        // метров между рядами препятствий в начале
    rowGapMin: 11,          // ...и минимум к концу
    boostTime: 8,           // сек действия бонуса ×2
};

// Почему проиграл — шутки по поводу причины
export const DEATH_TEXT = {
    cop: ["Остановил ДПС: «Откуда USDT?»", "Инспектор попросил показать чеки", "Документики! Приехали"],
    block: ["Влетел в бетонный блок", "Бетон не переспоришь", "Блок оказался крепче"],
    roadblock: ["Не перепрыгнул ограждение", "Споткнулся о полосатую балку", "Ограждение — 1, Крыс — 0"],
    atm: ["Врезался в банкомат", "Банкомат зажевал карту", "Снял наличку лбом"],
    dumpster: ["Влетел в мусорный бак", "Бак оказался быстрее", "Мусорка — 1, Крыс — 0"],
    barrier: ["Карту заблокировали по 115-ФЗ", "Банк попросил пояснить происхождение средств", "Блокировка! Надо было пригнуться"],
    car: ["Не успел увернуться от тачки", "Таксист на встречке", "Сбила «девятка»"],
};

export const TIPS = [
    "Свайп вверх — прыжок через баки",
    "Свайп вниз — подкат под «блокировку»",
    "Тачки только объезжать — свайп влево/вправо",
    "Полосатое ограждение — перепрыгни, бетонный блок и ДПС — объезжай",
    "Золотая монета «×2» удваивает профит на 8 секунд",
];

// Текстуры из папки textures/. Для каждой картинки скрипт tools/maketex.py делает
// карту нормалей (_nor), шероховатости (_rough, для земли) и свечения окон (_glow, для фасадов).
export const TEXTURES = {
    road: "ground2",
    sidewalk: "ground4",
    // rows — сколько этажей в одном тайле картинки (чтобы этаж был ~2.9 м)
    facades: [
        { name: "facade1", rows: 7 },
        { name: "facade2", rows: 6 },
        { name: "facade3", rows: 6 },
        { name: "facade4", rows: 5 },
    ],
};

// 3D-модель персонажа (.glb из Meshy/Tripo + анимация бега из Mixamo).
// Если файла нет — бегает крыс, собранный из примитивов.
export const MODEL = {
    url: "models/rat.glb",
    height: 1.75,     // во сколько метров отмасштабировать модель
    rotateY: Math.PI, // Mixamo смотрит в +Z, а бежим мы в -Z
    clips: { run: /run/i, idle: /idle/i, jump: /jump/i, slide: /slide|roll/i },
};

// Графика. "auto" — если на первых секундах забега меньше 40 fps, отражения и тени выключаются.
export const QUALITY = "auto"; // "auto" | "high" | "low"

// Отделения банков на первых этажах (фото из textures/bank_*). aspect — ширина/высота картинки.
export const BANKS = {
    chance: 0.35,  // доля домов с банком внизу
    height: 3.3,   // высота витрины, м
    list: [
        { name: "bank_alfa1", aspect: 1.37, light: 0xff2030 },
        { name: "bank_alfa2", aspect: 1.53, light: 0xff2030 },
        { name: "bank_alfa3", aspect: 1.5, light: 0xff2030 },
        { name: "bank_alfa4", aspect: 1.68, light: 0xff2030 },
        { name: "bank_sber1", aspect: 1.28, light: 0x20ff50 },
        { name: "bank_sber2", aspect: 1.65, light: 0x20ff50 },
        { name: "bank_sber3", aspect: 1.79, light: 0x20ff50 },
        { name: "bank_sber4", aspect: 1.36, light: 0x20ff50 },
    ],
};

// Банкоматы: препятствие на дороге и декор на тротуарах (фото лицевой стороны из textures/atm*)
export const ATMS = [
    { name: "atm1", aspect: 0.59, light: 0x20ff60 },
    { name: "atm2", aspect: 0.58, light: 0xff2030 },
    { name: "atm3", aspect: 0.56, light: 0x20ff60 },
    { name: "atm4", aspect: 0.51, light: 0xff2030 },
    { name: "atm5", aspect: 0.36, light: 0xff2030 },
];

// .glb-модели препятствий (например, Corvette из Meshy по фото). Если файла нет — процедурная модель.
// size — до какого размера по оси axis отмасштабировать; rotateY — довернуть, чтобы нос смотрел в +Z.
export const OBSTACLE_MODELS = {
    car: { url: "models/car.glb", axis: "z", size: 4.3, rotateY: 0 },
    atm: { url: "models/atm.glb", axis: "y", size: 2.3, rotateY: 0 },
    dumpster: { url: "models/dumpster.glb", axis: "x", size: 1.3, rotateY: 0 },
    barrier: { url: "models/barrier.glb", axis: "x", size: 1.75, rotateY: 0 },
};

// Объекты-спрайты, вырезанные из концептов (textures/sprites/*.webp, tools/cutout.py).
// height — высота в метрах; obstacle — может стоять на полосе; top — высота, которую надо перепрыгнуть.
export const SPRITES = {
    cop: { height: 1.9, obstacle: true, variants: [
        { name: "cop1", aspect: 0.436 }, { name: "cop2", aspect: 0.631 }, { name: "cop3", aspect: 0.539 }] },
    block: { height: 1.15, obstacle: true, variants: [
        { name: "block1", aspect: 1.213 }, { name: "block2", aspect: 1.076 }, { name: "block3", aspect: 1.107 }, { name: "block4", aspect: 1.309 }] },
    roadblock: { height: 1.05, obstacle: true, top: 0.95, variants: [
        { name: "roadblock1", aspect: 1.279 }, { name: "roadblock2", aspect: 1.465 }] },
    police: { height: 1.95, variants: [{ name: "police1", aspect: 1.701 }, { name: "police2", aspect: 1.65 }] },
    girl: { height: 1.7, variants: [{ name: "girl1", aspect: 0.436 }, { name: "girl2", aspect: 0.639 }] },
    bin: { height: 0.95, variants: [{ name: "bin1", aspect: 0.764 }, { name: "bin2", aspect: 0.789 }] },
    can: { height: 0.3, variants: [{ name: "can1", aspect: 1.26 }, { name: "can2", aspect: 1.25 }] },
};

// Частота препятствий (веса)
export const OBSTACLE_MIX = {
    dumpster: 22, roadblock: 14, barrier: 18, car: 14, atm: 10, block: 12, cop: 10,
};
