// Всё, что настраивается без лезания в код игры: ссылки, баланс, тексты.

export const LINKS = {
    // ссылка на бота / мини-апп (для кнопки «Поделиться»)
    bot: "https://p2p-game-eta.vercel.app", // заменить на https://t.me/<бот>/<app>, когда будет мини-приложение
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
    stumbleTime: 8,         // как в сабвее: первый удар прощается, но столько секунд ДПС на хвосте — второй удар = поймали
    stumbleSlow: 0.9,       // сек замедления после удара
};

// Почему проиграл — шутки по поводу причины
export const DEATH_TEXT = {
    hood: ["Споткнулся о ржавый капот", "Капот — 1, Крыс — 0", "Зацепился за тряпки на капоте"],
    cart: ["Врезался в тележку", "Тележка с баулами победила", "Не перепрыгнул тележку"],
    starbox: ["Влетел в ящик со звездой", "Сигналка мигала не зря", "Ящик оказался тяжелее"],
    cop: ["Остановил ДПС: «Откуда USDT?»", "Инспектор попросил показать чеки", "Документики! Приехали"],
    caught: ["Споткнулся дважды — ДПС догнал", "Второй удар — и инспектор тут как тут", "Догнали. Документики!"],
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
    "Капот и тележку можно перепрыгнуть, ящик со звездой — только объехать",
    "Золотая монета «×2» удваивает профит на 8 секунд",
];

// Текстуры из папки textures/. Для каждой картинки скрипт tools/maketex.py делает
// карту нормалей (_nor), шероховатости (_rough, для земли) и свечения окон (_glow, для фасадов).
export const TEXTURES = {
    road: "ground2",
    sidewalk: "ground4",
    // Фасады — снимки домов из Meshy спереди, переведённые в ночь (tools/nightify.py). Картинка — дом целиком:
    // floors — этажей на ней, aspect — ширина/высота, ground — свои подъезды внизу (без нарисованного первого этажа),
    // weight — как часто попадается
    facades: [
        { name: "house1", floors: 7, aspect: 1, weight: 1 },
        { name: "house2", floors: 6, aspect: 1, weight: 1 },
        { name: "house3", floors: 5, aspect: 1.84, ground: true, weight: 2 }, // главный
        { name: "house4", floors: 5, aspect: 1.87, ground: true, weight: 1 },
    ],
};

// Графика. "auto" — если на первых секундах забега меньше 40 fps, отражения и тени выключаются.
export const QUALITY = "auto"; // "auto" | "high" | "medium" | "low"

// Уровни графики. auto: телефон — medium, компьютер — high; если в забеге fps проседает — уровень ниже.
// ratio — потолок devicePixelRatio, bloom — во сколько раз уменьшен буфер свечения (0 — без свечения),
// lights — сколько фонарей светят по-настоящему, rain — капель дождя, fps — потолок кадров в забеге / в меню,
// lite — облегчённые модели из models/obj/lite (в ~3 раза меньше треугольников, текстуры 512 WebP).
export const QUALITY_TIERS = {
    high:   { ratio: 1.75, reflections: true,  shadows: true,  bloom: 2, lights: 4, police: true,  rain: 700, fps: [60, 40], lite: false },
    medium: { ratio: 1.3,  reflections: false, shadows: false, bloom: 4, lights: 2, police: false, rain: 350, fps: [60, 30], lite: true },
    low:    { ratio: 1.0,  reflections: false, shadows: false, bloom: 0, lights: 1, police: false, rain: 180, fps: [45, 24], lite: true },
};

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

// 3D-модели из Meshy (models/obj/*.glb, сжаты gltfpack). Для каждого вида — список вариантов.
// size — до какого размера в метрах отмасштабировать по оси axis; rotateY — разворот, чтобы «лицо» смотрело на игрока (+Z).
// halfZ/top — переопределить размеры для столкновений. Пока модель грузится, видна процедурная модель или спрайт.
const R = Math.PI / 2;
export const MODELS = {
    car: [
        { url: "models/obj/car1.glb", axis: "z", size: 4.4, rotateY: R },
        { url: "models/obj/car2.glb", axis: "z", size: 4.4, rotateY: R }],
    cop: [ // пост ДПС: инспектор с поднятой рукой перед патрульной машиной
        { url: "models/obj/post1.glb", axis: "z", size: 5.6, rotateY: R, halfZ: 2.7 },
        { url: "models/obj/post2.glb", axis: "z", size: 5.6, rotateY: R, halfZ: 2.7 },
        { url: "models/obj/post3.glb", axis: "z", size: 5.6, rotateY: R, halfZ: 2.7 }],
    police: [
        { url: "models/obj/post1.glb", axis: "z", size: 5.6, rotateY: R },
        { url: "models/obj/post3.glb", axis: "z", size: 5.6, rotateY: R }],
    atm: [
        { url: "models/obj/atm_kiosk.glb", axis: "y", size: 2.4 },
        { url: "models/obj/atm_pair0.glb", axis: "y", size: 2.1 },
        { url: "models/obj/atm_pair1.glb", axis: "y", size: 2.1 }],
    cart: [{ url: "models/obj/cart.glb", axis: "y", size: 1.4 }],
    starbox: [{ url: "models/obj/starbox.glb", axis: "y", size: 1.45 }],
    hood: [{ url: "models/obj/hood.glb", axis: "x", size: 1.6 }],
    block: [
        { url: "models/obj/blockset_a1.glb", axis: "x", size: 1.4 },
        { url: "models/obj/blockset_b1.glb", axis: "x", size: 1.6 },
        { url: "models/obj/barricade.glb", axis: "x", size: 1.6, rotateY: R }],
    roadblock: [
        { url: "models/obj/blockset_a0.glb", axis: "x", size: 1.6, rotateY: R },
        { url: "models/obj/blockset_b0.glb", axis: "x", size: 1.6, rotateY: R }],
    coin: [{ url: "models/obj/coin_usdt.glb", axis: "x", size: 0.62 }],
    testo: [{ url: "models/obj/testo.glb", axis: "y", size: 0.8 }],     // баночка тестобустера — полёт
    choline: [{ url: "models/obj/choline.glb", axis: "y", size: 0.8 }], // баночка холина — магнит
    boost: [{ url: "models/obj/coin_trx.glb", axis: "x", size: 0.85 }],
    girl: [{ url: "models/obj/girl.glb", axis: "y", size: 1.7, rotateY: R / 2 }], // девушка в красном пальто (Meshy Red Coat Getaway)
    bin: [{ url: "models/obj/trash1.glb", axis: "y", size: 0.95 }],
    can: [{ url: "models/obj/trash0.glb", axis: "x", size: 0.35 }],
    bank: [ // павильоны отделений, size — ширина фасада
        { url: "models/obj/bank_sber.glb", axis: "x", size: 9 },
        { url: "models/obj/bank_alfa.glb", axis: "x", size: 9 }],
};

// Персонажи (Meshy biped с анимациями): Спиди Гонзалес — мышь, стартовый; Павел Инаков — человек с бородой
// (по сценарию его выкупают, пока выбирается свободно); Денчик в меню виден, но не играбелен — locked, текст на кнопке.
// ?v=N в url — версия: модели кэшируются на телефоне на неделю, после замены файла номер надо поднять.
// clips — какой клип играть в каждой позе; если позы нет — модель наклоняется (подкат) или играет бег.
// fly — полёт на тестобустере, fall — лицом в асфальт, когда поймал ДПС (нет клипа — играет dead).
// hold: [начало, пик] — клип стартует с «начала» и замирает на «пике» (полёт с раскинутыми руками).
export const CHARACTERS = [
    { id: "mouse", name: "Спиди Гонзалес", url: "models/mouse.glb?v=2", height: 1.75, portrait: "img/heroes/speedy.webp",
        clips: { run: "run", jump: "jump", slide: "slide", dead: "dead", fly: "fly", fall: "fall" }, hold: { fly: [1.0, 1.62] } },
    { id: "pavel", name: "Павел Инаков", url: "models/pavel.glb", height: 1.8, portrait: "img/heroes/pavel.webp",
        clips: { run: "run", jump: "jump", slide: "slide", dead: "dead" } },
    { id: "denchik", name: "Денчик", url: "models/denchik.glb", height: 1.78, portrait: "img/heroes/denchik.webp", locked: "Не бегает — на связи у Спиди",
        clips: { run: "run", jump: "jump", slide: "slide", dead: "dead" } },
];

// Герои, которых пока нельзя выбрать: в списке «Герои» с портретом и пометкой «Скоро»
export const SOON_HEROES = [
    { name: "Ислам", portrait: "img/heroes/islam.webp" },
    { name: "Саша Белый", portrait: "img/heroes/sasha.webp" },
    { name: "Юрец", portrait: "img/heroes/yurets.webp" },
];

// Объекты-спрайты, вырезанные из концептов (textures/sprites/*.webp, tools/cutout.py).
// height — высота в метрах; obstacle — может стоять на полосе; top — высота, которую надо перепрыгнуть.
export const SPRITES = {
    cop: { height: 1.9, obstacle: true, variants: [
        { name: "cop1", aspect: 0.436 }, { name: "cop2", aspect: 0.631 }, { name: "cop3", aspect: 0.539 }] },
    block: { height: 1.15, obstacle: true, variants: [
        { name: "block1", aspect: 1.213 }, { name: "block2", aspect: 1.076 }, { name: "block3", aspect: 1.107 }, { name: "block4", aspect: 1.309 },
        { name: "block5", aspect: 1.082 }] },
    hood: { height: 0.8, obstacle: true, top: 0.72, variants: [{ name: "hood1", aspect: 1.537 }] },
    cart: { height: 1.35, obstacle: true, top: 0.95, variants: [{ name: "cart1", aspect: 0.779 }] },
    // lamp — где на картинке светится фонарь: доли ширины (от центра) и высоты (от низа)
    starbox: { height: 1.45, obstacle: true, variants: [
        { name: "starbox1", aspect: 0.742, lamp: { x: -0.2, y: 0.8, color: 0xff4010 } }] },
    roadblock: { height: 1.05, obstacle: true, top: 0.95, variants: [
        { name: "roadblock1", aspect: 1.279 }, { name: "roadblock2", aspect: 1.465 }] },
    police: { height: 1.95, variants: [{ name: "police1", aspect: 1.701 }, { name: "police2", aspect: 1.65 }] },
    girl: { height: 1.7, variants: [{ name: "girl1", aspect: 0.436 }, { name: "girl2", aspect: 0.639 }] },
    bin: { height: 0.95, variants: [{ name: "bin1", aspect: 0.764 }, { name: "bin2", aspect: 0.789 }] },
    can: { height: 0.3, variants: [{ name: "can1", aspect: 1.26 }, { name: "can2", aspect: 1.25 }] },
};

// Частота препятствий (веса)
export const OBSTACLE_MIX = {
    dumpster: 18, roadblock: 12, barrier: 16, car: 12, atm: 9, block: 11, cop: 9, hood: 9, cart: 8, starbox: 8,
};

// Музыка и звуки — mp3 в audio/. У меню (и экрана проигрыша) и у забега свои треки, идут по кругу;
// на паузе забег играет тише. Громкость 0…1; у звука может быть несколько вариантов — играет случайный.
// Чего здесь нет (монетка USDT, отсчёт, «погнали»), синтезирует audio.js.
export const SOUNDS = {
    music: {
        menu: ["audio/music_menu.mp3"],
        run: ["audio/music_chicago.mp3"], // есть ещё audio/music_v2.mp3 — пока не играет
    },
    musicVolume: { menu: 0.45, run: 0.6, pause: 0.2 },
    ambience: { url: "audio/ambience.mp3", volume: 0.25 }, // фоновый шум улицы во время забега
    sfx: {
        swipe: { urls: ["audio/swipe1.mp3", "audio/swipe2.mp3", "audio/swipe3.mp3"], volume: 0.6 }, // полоса, прыжок, подкат
        hit: { urls: ["audio/crash.mp3", "audio/crash2.mp3"], volume: 0.9 },
        boost: { urls: ["audio/coin_trx.mp3"], volume: 0.8 }, // монета TRX ×2
        whistle: { urls: ["audio/police_whistle.mp3"], volume: 0.6 }, // пробегаешь мимо ДПС
        busted: { urls: ["audio/police.mp3"], volume: 0.6 }, // поймал ДПС
        record: { urls: ["audio/achievement.mp3"], volume: 0.8 }, // новый рекорд, новая глава
        buy: { urls: ["audio/purchase.mp3"], volume: 0.8 }, // покупка в магазине, выкуп героя
        chest: { urls: ["audio/chest.mp3"], volume: 0.8 }, // кейс открылся
    },
};

// ---- Экономика: кошелёк, магазин, кейсы, главы (сценарий — артефакт «Сценарий Покорителя P2P») ----

// Главы сюжета: сколько USDT надо заработать за всё время (траты не мешают)
export const CHAPTERS = [
    { name: "Первый ордер", goal: 1000 },
    { name: "Печати", goal: 5000 },
    { name: "Первый миллион", goal: 20000 },
    { name: "Тот, кто вернулся", goal: 50000 },
    { name: "Трон", goal: 100000 },
];

// Выкуп героев (кого нет в списке — доступен сразу; locked в CHARACTERS — не продаётся)
export const HERO_PRICES = { pavel: 50000 };

// Умения героев: lane — быстрее смена полосы, coinBonus — каждая N-я монета даёт +1, slide — подкат дольше
export const HERO_PERKS = {
    mouse: { text: "Быстрые лапы: смена полосы на 15% быстрее", lane: 1.15 },
    pavel: { text: "Знает связки: +10% USDT, подкат длиннее", coinBonus: 10, slide: 1.25 },
};

// «НЕ СУЩИЙ STORE» — добавки на следующий забег (cur: usdt | trx). Купленные копятся и тратятся по одной на старте.
export const BOOSTS = [
    { id: "magnet", name: "Холин", text: "Первые 15 с концентрация на максимум: USDT сами тянутся к тебе", price: 300, time: 15 },
    { id: "testo", name: "Тестобустер", text: "Старт с дикого пампа: 5 с летишь над дорогой", price: 800, time: 5 },
    { id: "honey", name: "Мёд с пасеки", text: "15 с прыжки выше", price: 400, time: 15 },
    { id: "shield", name: "Чистая карта", text: "Одно столкновение не считается", price: 600 },
    { id: "x2", name: "Лимит ×2", text: "Двойные USDT первые 30 с", price: 700, time: 30 },
    { id: "dash", name: "Рывок", text: "Старт сразу с 500 м", price: 900, meters: 500 },
];
// Баночки на дороге. Тестобустер — дикий памп: герой взлетает над препятствиями и собирает USDT в воздухе,
// потом приземляется. Холин — ум притягивает умные мысли, а заодно и монеты (магнит).
// chance — шанс баночки в ряду, gap — минимум рядов между баночками
export const POWERUPS = {
    testo: { name: "Тестобустер", text: "дикий памп, летишь!", hud: "ПАМП", time: 5, height: 4.2, color: 0x35e39b },
    choline: { name: "Холин", text: "мысли и USDT тянутся к тебе", hud: "ХОЛИН", time: 10, color: 0xf2c46b },
};
export const POWERUP_SPAWN = { chance: 0.08, gap: 8 };

// Апелляция — продолжить забег после проигрыша, один раз за забег
export const APPEAL_PRICE = 2; // TRX

// Прокачка навсегда: сколько секунд действует монета TRX ×2 на уровнях 1…5 и цена следующего уровня
export const UPGRADES = {
    x2: { name: "Монета TRX ×2", text: "Дольше действует ×2 с дороги", times: [8, 10, 12, 15, 18], prices: [1000, 2500, 5000, 10000] },
};

// Кейсы. Награды: usdt [от, до], trx, boosts (сколько случайных добавок), all (по одной каждой), level (уровень прокачки)
export const CASES = [
    { id: "envelope", name: "Конверт", text: "Бесплатно раз в 4 часа", free: 4 * 3600 * 1000, drops: [
        { r: "common", w: 70, usdt: [50, 400] },
        { r: "common", w: 30, boosts: 1 }] },
    { id: "merchant", name: "Кейс Мерчанта", text: "USDT, добавки, TRX", price: 2500, drops: [
        { r: "common", w: 35, usdt: [800, 1500] },
        { r: "common", w: 25, boosts: 2 },
        { r: "rare", w: 18, usdt: [3000, 3000] },
        { r: "rare", w: 10, level: 1 },
        { r: "epic", w: 10, trx: 5, all: true },
        { r: "legend", w: 2, usdt: [10000, 10000], trx: 10 }] },
    { id: "conqueror", name: "Кейс Покорителя", text: "Только редкое и лучше", priceTrx: 10, drops: [
        { r: "rare", w: 35, usdt: [4000, 6000] },
        { r: "rare", w: 20, level: 1 },
        { r: "epic", w: 35, trx: 8, all: true },
        { r: "legend", w: 10, usdt: [20000, 20000], trx: 15 }] },
];
export const RARITY = {
    common: { name: "Обычное", color: "#9aa3ad" },
    rare: { name: "Редкое", color: "#3d8bff" },
    epic: { name: "Эпическое", color: "#b05cff" },
    legend: { name: "Легендарное", color: "#e9c25a" },
};
