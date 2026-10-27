// Всё, что настраивается без лезания в код игры: ссылки, баланс, тексты.

export const LINKS = {
    // ссылка на бота / мини-апп (для кнопки «Поделиться»)
    bot: "https://p2p-game-eta.vercel.app", // заменить на https://t.me/<бот>/<app>, когда будет мини-приложение
    // куда ведёт кнопка курса на экране проигрыша
    course: "https://t.me/your_course_channel",
    // менеджер отдела продаж: кнопка «Назвать фразу менеджеру» открывает чат с готовым сообщением (кодовые фразы)
    manager: "https://t.me/your_manager",
};

// Баланс. Скорость в метрах (юнитах) в секунду.
export const BALANCE = {
    speedStart: 13,
    speedMax: 30,
    speedRamp: 0.18,        // +м/с за каждую секунду забега (speedMax — примерно на 95-й секунде)
    laneWidth: 1.7,
    jumpPower: 9.2,
    gravity: 30,            // прыжок ~1,4 м и быстрее: препятствия низкие (бак 1,15 м), выше не нужно
    slideTime: 0.65,        // сек, сколько длится подкат
    rowGapStart: 20,        // метров между рядами препятствий в начале
    rowGapMin: 11,          // ...и минимум к концу
    boostTime: 8,           // сек действия бонуса ×2
    stumbleTime: 8,         // как в сабвее: первый удар прощается, но столько секунд ДПС на хвосте — второй удар = поймали
    stumbleSlow: 0.9,       // сек замедления после удара
};

// Почему проиграл — шутки по поводу причины
export const DEATH_TEXT = {
    wind: ["Сдуло Исламом", "Ислам дунул — и всё", "Не удержался на ветру"],
    wall: ["Стена возражений не пустила", "Возражение оказалось крепче", "Два неверных ответа подряд — стоп"],
    hood: ["Споткнулся о ржавый капот", "Капот — 1, Крыс — 0", "Зацепился за тряпки на капоте"],
    cart: ["Врезался в тележку", "Тележка с баулами победила", "Не перепрыгнул тележку"],
    starbox: ["Влетел в ящик со звездой", "Сигналка мигала не зря", "Ящик оказался тяжелее"],
    cop: ["Остановил ДПС: «Откуда USDT?»", "Инспектор попросил показать чеки", "Документики! Приехали"],
    caught: ["Споткнулся дважды — Инспекторша догнала", "Второй удар — и Инспекторша тут как тут", "Протокол: слишком много «подумаю». Бежим ещё раз?"],
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

// Небо и туман вдали (один цвет — дальние дома растворяются в небе), light — сила рассеянного света,
// exposure — общая яркость кадра
export const SKY = { color: 0x5a1f30, zenith: "#3a1426", light: 1.4, exposure: 1.2 };

// Графика. "auto" — если на первых секундах забега меньше 40 fps, отражения и тени выключаются.
export const QUALITY = "auto"; // "auto" | "high" | "medium" | "low"

// Уровни графики. auto: телефон — medium, компьютер — high; если в забеге fps проседает — уровень ниже.
// ratio — потолок devicePixelRatio, bloom — во сколько раз уменьшен буфер свечения (0 — без свечения),
// lights — сколько фонарей светят по-настоящему, rain — капель дождя, fps — потолок кадров в забеге / в меню,
// lite — облегчённые модели из models/obj/lite (в ~3 раза меньше треугольников, текстуры 512 WebP);
// npc — доля живых NPC со скелетом (девушки, кошки, стайки голубей): на слабом телефоне их меньше, остальные девушки — спрайты.
export const QUALITY_TIERS = {
    high:   { ratio: 1.75, reflections: true,  shadows: true,  bloom: 2, lights: 4, police: true,  rain: 700, fps: [60, 40], lite: false, far: 100, npc: 1 },
    medium: { ratio: 1.3,  reflections: false, shadows: false, bloom: 4, lights: 2, police: false, rain: 350, fps: [60, 30], lite: true,  far: 80,  npc: 1 },
    low:    { ratio: 1.0,  reflections: false, shadows: false, bloom: 0, lights: 1, police: false, rain: 160, fps: [45, 24], lite: true,  far: 62,  npc: 0.4 },
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
// Столкновения считаются по габаритам модели (что перепрыгнуть — её верх, длина — по ней же); halfZ/top — переопределить.
// Пока модель грузится, видна процедурная модель или спрайт.
const R = Math.PI / 2;
export const MODELS = {
    car: [
        { url: "models/obj/car1.glb", axis: "z", size: 4.4, rotateY: R },
        { url: "models/obj/car2.glb", axis: "z", size: 4.4, rotateY: R }],
    police: [ // патрульные машины постов ДПС (инспектор рядом — живой, POLICE_OFFICER)
        { url: "models/obj/patrol1.glb", axis: "z", size: 4.6, rotateY: R },
        { url: "models/obj/patrol2.glb", axis: "z", size: 4.6, rotateY: R },
        { url: "models/obj/patrol3.glb", axis: "z", size: 4.6, rotateY: R }],
    atm: [
        { url: "models/obj/atm_kiosk.glb", axis: "y", size: 2.4 },
        { url: "models/obj/atm_pair0.glb", axis: "y", size: 2.1 },
        { url: "models/obj/atm_pair1.glb", axis: "y", size: 2.1 }],
    cart: [{ url: "models/obj/cart.glb", axis: "y", size: 1.1 }], // выше — не перепрыгнуть (прыжок ~1,6 м, бак — 1,15)
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
    bin: [{ url: "models/obj/trash1.glb", axis: "y", size: 0.95 }],
    // неоновая вывеска «ОБМЕН 24/7» над подъездами (модель смотрит в +Z, разворот к дороге — в makeBuilding); glow — самосвечение
    sign: [
        { url: "models/obj/sign_obmen1.glb", axis: "x", size: 2.6, glow: 1.6 },
        { url: "models/obj/sign_obmen2.glb", axis: "x", size: 2.6, glow: 1.6 }],
    can: [{ url: "models/obj/trash0.glb", axis: "x", size: 0.35 }],
    bank: [ // павильоны отделений, size — ширина фасада
        { url: "models/obj/bank_sber.glb", axis: "x", size: 9 },
        { url: "models/obj/bank_alfa.glb", axis: "x", size: 9 }],
};

// Инспектор ДПС (Meshy biped с анимациями): на постах и на полосе кричит или объясняет руками (idle — случайный),
// за героем после первого удара — бежит (run). Пока модель грузится, вместо него спрайт.
export const POLICE_OFFICER = { url: "models/obj/cop.glb?v=2", height: 1.85, idle: ["shout", "talk"], run: "run" }; // ?v — версия, как у героев

// Кто бежит за героем после первого удара (BALANCE.stumbleTime секунд); hud — надпись в забеге.
// Пока модель грузится — инспектор ДПС, а без него спрайт.
// arrest — клип, когда догнала (жест «протокол»), stop/walk — запасные клипы модели
export const CHASER = { url: "models/obj/inspector.glb?v=2", height: 1.72, run: "run", arrest: "cast", hud: "ИНСПЕКТОРША" };

// Живые NPC на тротуарах (Meshy, со скелетом). Пока модели нет — девушки спрайтами, кошек и голубей просто нет.
// girl: walkShare — доля гуляющих (остальные танцуют), speed — м/с вдоль тротуара;
// cat: length — длина кошки в метрах; pigeon: стайки у бордюра, взлетают, когда герой подбегает ближе flee метров
export const NPCS = {
    girl: { url: "models/obj/girl_npc.glb", height: 1.7, walk: "walk", idle: "dance", walkShare: 0.4, speed: 1.1 },
    cat: { url: "models/obj/cat.glb", length: 0.55, walk: "walk", count: 3, speed: 0.6 },
    pigeon: { url: "models/obj/pigeon.glb", height: 0.55, flocks: 3, flock: [3, 5], flee: 9 }, // height — с поднятыми крыльями, как в модели
};

// Персонажи (Meshy biped с анимациями): Спиди Гонзалес — мышь, стартовый; Павел Инаков — человек с бородой
// (выкуп), Ислам и Саша Белый — тоже выкуп, Денчик — бесплатно. locked: "текст" — герой виден в меню, но не играбелен.
// ?v=N в url — версия: модели кэшируются на телефоне на неделю, после замены файла номер надо поднять.
// clips — какой клип играть в каждой позе; если позы нет — модель наклоняется (подкат) или играет бег.
// fly — полёт на тестобустере, fall — лицом в асфальт, когда поймал ДПС (нет клипа — играет dead).
// flyClip — кадры клипа полёта (сек): start — присед перед толчком, launch — отрыв от земли, peak — верхняя точка
// (в ней герой летит), touch — касание земли, end — встал из приседа и дальше бежит; ground — сколько секунд
// длится приземление (по умолчанию 0.4); pin — в клипе высота «вшита» в бёдра: в воздухе её гасим, высоту задаёт игра.
// Клипы из Meshy (папка «Персонажи» на Диске): у Спиди и Саши полёт — «Jump with Arms Open» (руки раскинуты в верхней точке).
export const CHARACTERS = [
    { id: "mouse", name: "Спиди Гонзалес", url: "models/mouse.glb?v=4", height: 1.75, portrait: "img/heroes/speedy.webp",
        // подкат — «slide right» (присесть), падение от удара — «Shot and Blown Back», ничком от погони — «Fall»;
        // полёт — «Swim Forward» Саши Белого (те же кости Meshy, перенесены только повороты)
        clips: { run: "run", jump: "jump", slide: "slide", dead: "dead", fly: "fly", fall: "fall" }, flyClip: { loop: true, speed: 1.3, pitch: 1.35 } }, // pitch — лечь горизонтально (рад)
    { id: "pavel", name: "Павел Инаков", url: "models/pavel.glb?v=3", height: 1.8, portrait: "img/heroes/pavel.webp",
        // подкат — «Roll Dodge», полёт — «Swim Forward», в меню — «Proud Strut»
        clips: { run: "run", jump: "jump", slide: "slide", dead: "dead", fly: "fly", idle: "idle" }, flyClip: { loop: true, speed: 1.3 } },
    { id: "islam", name: "Ислам", url: "models/islam.glb?v=2", height: 1.8, portrait: "img/heroes/islam.webp",
        // прыжок — через препятствие, подкат — перекат, полёт — нырок с неба и «супергеройское» приземление, в меню — «Indoor Swing»
        clips: { run: "run", jump: "jump", slide: "slide", dead: "dead", fall: "fall", fly: "dive", idle: "swing" },
        flyClip: { start: 0.2, launch: 0.2, peak: 0.26, touch: 0.46, end: 1.9, ground: 0.9, pin: true } },
    { id: "denchik", name: "Денчик", url: "models/denchik.glb?v=2", height: 1.78, portrait: "img/heroes/denchik.webp",
        // подкат — «Roll Dodge», от удара — «Knock Down»
        clips: { run: "run", jump: "jump", slide: "slide", dead: "dead" } },
    { id: "sasha", name: "Саша Белый", url: "models/sasha.glb?v=2", height: 1.82, portrait: "img/heroes/sasha.webp",
        // полёт — «Swim Forward»: плывёт по воздуху по кругу, без приседа на взлёте и посадке
        clips: { run: "run", jump: "jump", slide: "slide", dead: "dead", fly: "fly" }, flyClip: { loop: true, speed: 1.3 } },
];

// Герои, которых пока нельзя выбрать: в списке «Герои» с портретом и пометкой «Скоро»
export const SOON_HEROES = [
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
// Главы по сценарию «Воронка»: за каждую — кодовая фраза, её называют менеджеру. wall — общая стена главы
// (чаще других появляется в забеге, пока идёт эта глава). Финал — экзамен у босса Инакова (следующий этап).
export const CHAPTERS = [
    { name: "Подумаю", goal: 1000, phrase: "ПЕРВЫЙ ШАГ", wall: "think" },
    { name: "Дорого", goal: 5000, phrase: "ИНВЕСТИЦИЯ", wall: "price" },
    { name: "Первый миллион", goal: 20000, phrase: "Я СМОГУ", place: "промзона Тюмени, с Сашей Белым" },
    { name: "Не сейчас", goal: 50000, phrase: "СЕЙЧАС", wall: "later", place: "крыши, с Исламом" },
    { name: "Сам разберусь", goal: 100000, phrase: "СИСТЕМА", place: "лабиринт курсов" },
];

// «Ислам дует»: стоит у обочины, порыв ветра сносит героя на полосу в сторону от него. Удержаться — тапать
// (taps раз за gust секунд), увернуться — подкатом или в прыжке. Выкуплен Ислам — не дует: «Своих не сдуваю».
export const WIND = { firstAt: 420, every: [420, 620], inhale: 1.8, gust: 2, push: 2.4, taps: 5, reward: 3 };
// inhale — вдох (камера на Исламе, замедление), gust — порыв, push — с какой скоростью сносит (м/с) без тапов;
// не натапал taps за порыв — проигрыш («Сдуло Исламом»)

// Экзамен у босса Павла Инакова: раз за забег на at метрах — три сложные стены подряд (gap м между ними, меньше
// времени на ответ). Сдал (pass верных из 3) — reward USDT и сундук; без ошибок — ещё gems кристаллов.
// Экзамен Инакова: rounds раундов по per стен (между стенами gap м, между раундами roundGap), в каждом раунде одна стена —
// на тип клиента, на котором игрок чаще ошибается; сдал — pass верных из rounds × per
export const BOSS = { at: 900, gap: 70, roundGap: 130, rounds: 3, per: 4, pass: 9, reward: 100, gems: 10, portrait: "img/heroes/pavel.webp",
    lines: ["Разминка. Ты уже это слышал.", "Теперь честно. Что мешает именно тебе?", "Последний. Ответь, как будто это уже твоя жизнь."],
    hello: "Возражения слышал все. Покажи, что ты их прошёл.",
    win: "Экзамен сдан. Кодовое слово для менеджера: ВОРОНКА ПРОЙДЕНА", phrase: "ВОРОНКА ПРОЙДЕНА",
    lose: "Почти. Возвращайся, когда будешь готов. Я подожду." };

// Реплики героев на старте забега (сценарий v2) и Инспекторши, когда выбегает за героем
export const HERO_LINES = {
    mouse: ["Ариба! Кто думает, тот догоняет", "Быстрее, чем твоё «потом»"],
    denchik: ["Посчитал: стоять дороже, чем бежать", "+8% к монетам, потому что я всё посчитал"],
    sasha: ["Первый миллион начинается с первого «да»", "В Тюмени холодно, а мы горячие"],
    islam: ["Ветер за мной, не против меня"],
    pavel: ["Возражения слышал все. Покажи, что ты их прошёл"],
};
export const CHASER_LINES = { start: "Гражданин, вы бежите без цели! Предъявите мотивацию!", reply: "Ариба! Мотивация у меня в кроссовках!" };

// Кристаллы — твёрдая валюта: паки за USDT (стартовый набор — один раз), за главу, экзамен без ошибок и вход.
export const GEMS = {
    chapter: 15,
    packs: [
        // price — реальные USDT (Telegram Stars или кошелёк — ждёт решения), оплата пока не подключена
        { id: "starter", name: "Стартовый пак + Денчик", gems: 120, price: 1.99, hero: "denchik", once: true },
        { id: "p100", name: "Горсть кристаллов", gems: 100, price: 1.99 },
        { id: "p550", name: "Мешок кристаллов", gems: 550, price: 8.99 },
        { id: "p1200", name: "Сундук кристаллов", gems: 1200, price: 17.99 },
    ],
};
// Выкуп героя за кристаллы (вместо USDT)
export const HERO_GEM_PRICES = { islam: 40, pavel: 80, sasha: 120 };
// Ежедневный вход: награда за 1…7-й день подряд (пропустил день — серия с начала); 7-й — герой на пробу на 24 ч
export const DAILY = [
    { usdt: 100 }, { gems: 3 }, { usdt: 250 }, { gems: 5 }, { usdt: 400 }, { gems: 8 }, { trial: 24 },
];

// Стены-возражения: вопрос над дорогой и три таблички с ответами на полосах — беги в правильную.
// В банке правильный ответ всегда первый, в игре таблички перемешиваются. Новичков не стыдим и над ними не шутим.
// type — тип клиента: цвет и значок таблички (арты Жупела — потом), по ошибкам менеджер понимает, с кем говорит.
export const CLIENT_TYPES = {
    novice: { name: "Новичок", color: "#3d8bff", tag: "01" },
    breakup: { name: "После расставания", color: "#ff6b9a", tag: "02" },
    pro: { name: "Опытный", color: "#e9c25a", tag: "03" },
    aimless: { name: "Без цели", color: "#9aa3ad", tag: "04" },
    partner: { name: "Ищет спутницу", color: "#b05cff", tag: "05" },
    priority: { name: "Другие приоритеты", color: "#35e39b", tag: "06" },
    common: { name: "Возражение", color: "#e3343a", tag: "НСС" },
};
export const WALLS = {
    firstAt: 160,     // метров до первой стены
    every: [220, 300], // и дальше между стенами (случайно в пределах)
    reward: 5,        // USDT за правильный ответ
    streak: 5,        // столько правильных подряд — ×2 на streakTime секунд
    streakTime: 12,
    chapterWall: 0.35, // доля стен «главы» (общая стена текущей главы)
};
// Банк вопросов (сценарий v2, 30 штук): правильный ответ всегда первый, в игре таблички перемешиваются
export const QUESTIONS = [
    { type: "novice", q: "У меня не получится", a: ["Начну с первого маленького шага", "Не моё, и всё", "Сначала накачаюсь"] },
    { type: "novice", q: "Я некрасивый или уже не тот возраст", a: ["Важнее то, что я делаю", "Значит, шансов нет", "Подожду, пока само сложится"] },
    { type: "novice", q: "Не знаю, что сказать при знакомстве", a: ["Этому можно научиться", "Лучше промолчу", "Скажу заученную фразу"] },
    { type: "novice", q: "Боюсь отказа", a: ["Отказ — это просто опыт", "Не буду подходить вообще", "Подойду, только если 100% уверен"] },
    { type: "novice", q: "Мне стыдно просить помощи", a: ["Просить помощи — это сила", "Сам как-нибудь", "Посмотрю ролики"] },
    { type: "breakup", q: "Хочу её вернуть", a: ["Сначала разберусь, что пошло не так", "Буду писать ей каждый день", "Забуду и закроюсь"] },
    { type: "breakup", q: "Больше никому не доверяю", a: ["Доверие можно выстроить заново", "Все одинаковые", "Лучше быть одному"] },
    { type: "breakup", q: "Я во всём виноват", a: ["Сделаю выводы и пойду дальше", "Буду винить себя", "Виновата только она"] },
    { type: "breakup", q: "Нет сил ни на что", a: ["Начну с заботы о себе", "Буду лежать, пока не пройдёт", "Заглушу работой"] },
    { type: "breakup", q: "Сразу найду новую, чтобы забыть", a: ["Сначала восстановлюсь", "Клин клином", "Неважно, кто"] },
    { type: "pro", q: "Я и так всё умею", a: ["Можно тратить меньше сил и получать больше", "Мне учиться нечему", "Просто удача"] },
    { type: "pro", q: "Знакомств много, а толку мало", a: ["Пора поменять подход", "Нужно ещё больше знакомств", "Так у всех"] },
    { type: "pro", q: "Отношения быстро заканчиваются", a: ["Научусь их удерживать", "Так и задумано", "Найду следующую"] },
    { type: "pro", q: "Техники перестали работать", a: ["Нужен подход, а не техники", "Найду новые фишки", "Девушки стали другими"] },
    { type: "pro", q: "Мне скучно", a: ["Поставлю новую цель", "Это и есть успех", "Брошу всё"] },
    { type: "aimless", q: "Просто хочу развиваться", a: ["Назову, что конкретно хочу изменить", "Как-нибудь само", "Почитаю ещё"] },
    { type: "aimless", q: "Не знаю, чего хочу", a: ["Разберусь с наставником", "Потом пойму", "Буду как все"] },
    { type: "aimless", q: "Всё и так нормально", a: ["Нормально — не значит хорошо", "Не трогаю, что работает", "Ничего не изменится"] },
    { type: "aimless", q: "Попробую всё понемногу", a: ["Выберу одно направление", "Чем больше, тем лучше", "Потом решу"] },
    { type: "aimless", q: "Цели — это для других", a: ["Маленькая цель тоже цель", "Мне не надо", "Пусть ставят за меня"] },
    { type: "partner", q: "Устал от случайных встреч", a: ["Научусь выбирать свою женщину", "Буду ждать ту самую", "Возьму количеством"] },
    { type: "partner", q: "Хорошие девушки все заняты", a: ["Научусь их встречать", "Значит, не судьба", "Подожду, пока освободятся"] },
    { type: "partner", q: "Хочу семью, но не получается", a: ["Разберу, что мешает", "Само получится", "Женюсь на первой"] },
    { type: "partner", q: "Боюсь ошибиться с выбором", a: ["Пойму, что мне важно", "Буду выбирать вечно", "Доверюсь случаю"] },
    { type: "partner", q: "Мне некогда искать", a: ["Встроюсь в свой ритм", "Как-нибудь найдётся", "Найду после работы, через годик"] },
    { type: "priority", q: "Сейчас важнее деньги", a: ["Уверенность помогает и в делах", "Отношения потом", "Одно другому мешает"] },
    { type: "priority", q: "Нет времени", a: ["Хватит и часа в неделю", "Займусь, когда разгребусь", "Это не важно"] },
    { type: "priority", q: "Сначала спорт, потом всё остальное", a: ["Можно совмещать", "Только по очереди", "Брошу спорт"] },
    { type: "priority", q: "Отношения отвлекают от цели", a: ["Хорошие отношения дают силы", "Они только мешают", "Пусть будут, но без вложений"] },
    { type: "priority", q: "Разберусь, когда стану успешным", a: ["Успех легче, когда рядом поддержка", "Сначала миллион", "Это не про меня"] },
    { type: "common", id: "think", q: "ПОДУМАЮ", a: ["Решу сейчас, чего хочу", "Отложу на потом", "Спрошу у друзей"] },
    { type: "common", id: "price", q: "ДОРОГО", a: ["Это вложение в себя", "Найду бесплатно", "Потом накоплю"] },
    { type: "common", id: "later", q: "НЕ СЕЙЧАС", a: ["Лучшее время — сейчас", "После Нового года", "Когда будет настроение"] },
];

// Выкуп героев (кого нет в списке — доступен сразу; locked в CHARACTERS — не продаётся)
export const HERO_PRICES = { pavel: 50000, islam: 25000, sasha: 75000 };

// Умения героев: lane — быстрее смена полосы, coinBonus — каждая N-я монета даёт +1, slide — подкат дольше
export const HERO_PERKS = {
    mouse: { text: "Связка: +4% USDT. Быстрые лапы: смена полосы на 15% быстрее", lane: 1.15, coinBonus: 25 }, // каждая 25-я монета +1 = +4%
    pavel: { text: "Знает связки: +10% USDT, подкат длиннее", coinBonus: 10, slide: 1.25 },
    islam: { text: "Одна ошибка на стене прощается, перекат длиннее", wallForgive: 1, slide: 1.3 },
    denchik: { text: "Мозг команды: +10% USDT", coinBonus: 10 },
    sasha: { text: "+1 жизнь за забег и +20% USDT", extraLife: 1, coinBonus: 5 },
};

// Активные умения героев — кнопка в забеге, один раз за забег. kind: turbo — быстрее и неуязвим, magnet — монеты
// тянутся, x2 — двойные USDT, ram — столько стен подряд засчитываются без ответа (charges)
export const HERO_SKILLS = {
    mouse: { name: "Турбо", text: "4 с быстрее и неуязвим", kind: "turbo", time: 4 },
    denchik: { name: "Магнит", text: "8 с монеты тянутся к тебе", kind: "magnet", time: 8 },
    islam: { name: "Попутный ветер", text: "5 с ускорение и защита", kind: "turbo", time: 5 },
    sasha: { name: "Таран", text: "3 стены подряд — без ответа", kind: "ram", charges: 3 },
    pavel: { name: "Связки", text: "8 с двойные USDT", kind: "x2", time: 8 },
};

// «НЕ СУЩИЙ STORE» (каталог shop_v4_bady): бусты на один забег — только за монеты (price, игровой кошелёк),
// наборы — только за кристаллы (gems). За USDT (реальные деньги) — только паки кристаллов (GEMS.packs).
// Купленные копятся и тратятся на старте забега, не больше BOOST_LIMIT за забег. Цены в рублях не показываем:
// у каждой карточки кнопка «Заказать настоящие» → NS_STORE_URL. Тексты — сценарий v2.2 / shop_cards_texts_v1.
export const NS_STORE_URL = "https://t.me/Nesuschiystore";
export const BOOST_LIMIT = 2;
// photos — настоящие продукты NS Store в витрине карточки (img/shop/bady/<файл>.webp, фон вырезан): [файл, подпись]
export const BOOSTS = [
    { id: "fokus", name: "Фокус", text: "Подсветка верной полосы на 5 стенах. Холин внутри: 15 с монеты тянутся к тебе", line: "«Голова чистая — ответ очевидный.»", price: 350, walls: 5, time: 15, art: "img/shop/boost_fokus.png",
        photos: [["focus_ezhovik", "Ежовик"], ["focus_alpha_gpc", "ALPHA-GPC"], ["focus_l_teanin", "Л-Теанин"], ["focus_bakopa", "Бакопа"], ["focus_ginkgo", "Гинкго билоба"]] },
    { id: "ryvok", name: "Рывок", text: "+15% скорости и прыжок выше", line: "«Ноги помнят, куда бежать.»", price: 300, time: 15, art: "img/shop/boost_ryvok.png",
        photos: [["ryvok_kreatin", "Креатин"], ["ryvok_sigma_protein", "SIGMA PROTEIN"], ["ryvok_bcaa", "BCAA 2:1:1"], ["ryvok_citrullin", "Цитруллин"]] },
    { id: "ustoychivost", name: "Устойчивость", text: "Ветер Ислама не сносит с полосы", line: "Ислам: «Даже я не сдую.»", price: 250, art: "img/shop/boost_ustoychivost.png",
        photos: [["ustoychivost_gorilla_flex", "GORILLA FLEX"]] },
    { id: "spokoystvie", name: "Спокойствие", text: "Время перед стеной замедляется, 1 ошибка прощается", line: "Инспекторша: «Сегодня отпущу.»", price: 400, art: "img/shop/boost_spokoystvie.png",
        photos: [["spokoystvie_ashvaganda", "Ашваганда"], ["spokoystvie_magniy_glicinat", "Магний глицинат"], ["spokoystvie_da_hun_pao", "Да Хун Пао"], ["spokoystvie_shu_puer", "Шу пуэр"]] },
    { id: "shchit", name: "Щит", text: "+1 жизнь: одно столкновение не считается", line: "«Запас прочности никогда не лишний.»", price: 450, art: "img/shop/boost_shchit.png",
        photos: [["shit_d3", "Витамин D3"], ["shit_omega3", "Омега-3"], ["shit_cink", "Цинк"], ["shit_d3_k2", "D3 + K2"], ["shit_magniy_taurat", "Магний таурат"]] },
    { id: "berserk", name: "Берсерк", text: "Таран через 3 стены. Тестобустер внутри: старт с пампа, 5 с летишь", line: "«Возражения? Не слышу.»", price: 600, charges: 3, time: 5, art: "img/shop/boost_berserk.png",
        photos: [["berserk_testobooster", "Тестобустер"], ["berserk_maka", "Мака"], ["berserk_tongkat_ali", "Тонгкат Али"]] },
    { id: "magnit", name: "Магнит", text: "Монеты и буквы кодовых фраз летят к тебе (15 с)", line: "«Всё нужное — само в руки.»", price: 300, time: 15, art: "img/shop/boost_magnit.png",
        photos: [["magnit_zhenshen", "Женьшень"], ["magnit_nac", "NAC"], ["magnit_q10", "Коэнзим Q10"], ["magnit_chesnok", "Чеснок"]] },
];
// Наборы за кристаллы. give — сколько бустов кладём в запас; x2runs — ×2 монеты на N забегов; restore, skin — флаги.
// Состав настоящих наборов (Ебобо, Рама, Борода) в игре не показываем — только игровой эффект.
export const SETS = [
    { id: "ebobo", name: "Финансовый Ебобо", text: "×2 монеты на 3 забега + Магнит ×3", line: "Саша Белый: «Миллион сам себя не соберёт.»", gems: 120, give: { magnit: 3 }, x2runs: 3, art: "img/shop/set_finansovyy_ebobo.png" },
    { id: "rama", name: "Рама Два Ван Дамма", text: "Рывок ×3 + Устойчивость ×3", line: "Ислам: «Крыши — это наш спортзал.»", gems: 100, give: { ryvok: 3, ustoychivost: 3 }, art: "img/shop/set_rama_dva_van_damma.png" },
    { id: "gberserk", name: "Гормональный Берсерк", text: "Берсерк ×3 + Щит ×2. Награда за экзамен у Инакова", line: "Инаков: «Заслужил на экзамене? Забирай. Нет — докажи.»", gems: 150, give: { berserk: 3, shchit: 2 }, art: "img/shop/set_gormonalnyy_berserk.png" },
    { id: "son", name: "Королевский Сон", text: "Спокойствие ×5 + полное восстановление жизней", line: "«Выспался — и Инспекторша не догонит.»", gems: 130, give: { spokoystvie: 5 }, restore: true, art: "img/shop/set_korolevskiy_son.png" },
    { id: "boroda", name: "Бородатый Ублюдок", text: "Скин «Борода» для всех героев", line: "«Борода не делает мужчиной. Но выглядит мощно.»", gems: 200, skin: "beard", art: "img/shop/set_borodatyy_ublyudok.png" },
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
// color — цвет свечения кейса; art — картинка кейса (img/cases/*.webp, прозрачный фон; null — нарисованная заглушка);
// video — ролик открытия на чёрном фоне (video/case_*.mp4, накладывается «осветлением»), burst — секунда ролика,
// когда кейс раскрылся и бьёт свет: в этот момент вспышка и лента наград. Иконки наград — CASE_ITEM_ART ниже.
export const CASES = [
    { id: "envelope", name: "Конверт", text: "Бесплатно раз в 4 часа", color: "#e9c25a", art: "img/cases/envelope.webp", video: "video/case_envelope.mp4", burst: 4.4, free: 4 * 3600 * 1000, drops: [
        { r: "common", w: 70, usdt: [50, 400] },
        { r: "common", w: 30, boosts: 1 }] },
    { id: "merchant", name: "Кейс Мерчанта", text: "USDT, добавки, TRX", color: "#e3343a", art: "img/cases/merchant.webp", video: "video/case_merchant.mp4", burst: 4.4, price: 2500, drops: [
        { r: "common", w: 35, usdt: [800, 1500] },
        { r: "common", w: 25, boosts: 2 },
        { r: "rare", w: 18, usdt: [3000, 3000] },
        { r: "rare", w: 10, level: 1 },
        { r: "epic", w: 10, trx: 5, all: true },
        { r: "legend", w: 2, usdt: [10000, 10000], trx: 10 }] },
    { id: "conqueror", name: "Кейс Покорителя", text: "Только редкое и лучше", color: "#b05cff", art: "img/cases/conqueror.webp", video: "video/case_conqueror.mp4", burst: 4.4, priceTrx: 10, drops: [
        { r: "rare", w: 35, usdt: [4000, 6000] },
        { r: "rare", w: 20, level: 1 },
        { r: "epic", w: 35, trx: 8, all: true },
        { r: "legend", w: 10, usdt: [20000, 20000], trx: 15 }] },
];
// Иконки наград в ленте и в окне приза (img/cases/items/*.webp, прозрачный фон). null — нарисованная заглушка.
export const CASE_ITEM_ART = { usdt: null, trx: null, boost: null, level: null, all: null };

export const RARITY = {
    common: { name: "Обычное", color: "#9aa3ad" },
    rare: { name: "Редкое", color: "#3d8bff" },
    epic: { name: "Эпическое", color: "#b05cff" },
    legend: { name: "Легендарное", color: "#e9c25a" },
};
