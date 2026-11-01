// Короткий комикс поверх настоящего меню. Без отдельной сцены, библиотек и цикла анимации.
export const GUIDE_VERSION = 2; // выросла — обучение и предупреждение увидят все ещё раз
// Первый кадр — предупреждение: без цели на экране и без «Пропустить», закрывается только кнопкой
export const GUIDE_STEPS = [
    { notice: true, title: 'Сначала важное', text: 'Это игра. Прочитай, что здесь игровое, а что настоящее.', items: [
        ['USDT, NSS и Карты', 'игровые валюты. Это не криптовалюта и не деньги: их нельзя вывести, продать или обменять на деньги.'],
        ['Добавки, БАДы и бусты', 'игровой ресурс: работают только в забеге. Это не описание настоящих товаров и не совет, что принимать.'],
        ['Настоящее', 'только промокоды на скидку в магазине и приз первой сотне. Условия написаны на их экранах.'],
    ] },
    // до первого забега — только кошелёк и забег; про остальные разделы Горилла рассказывает при первом заходе (TAB_TIPS)
    { target: '.hub-top .cur', title: 'На районе — со мной!', text: 'Я Горилла. Сверху кошелёк: USDT, NSS и Карты. Про остальные разделы расскажу, когда в них зайдёшь, — сейчас главное бежать.' },
    { target: '#btn-play', title: 'Погнали!', text: 'Жми «Забег». Свайпай по экрану, собирай USDT и беги в табличку с верным ответом. Тебя ждут на станции «Обмен».', controls: true },
];
// Совет Гориллы при первом заходе в раздел: один кадр, без подсветки (кнопка раздела уже позади)
export const TAB_TIPS = {
    heroes: { title: 'Собери свою команду', text: 'Здесь выбираешь героя. У каждого свой навык, а условия открытия написаны на его карточке.' },
    cases: { title: 'Забирай лут', text: 'В кейсах — награды за игровые USDT. Тут же бусты на следующий забег и наборы.' },
    shop: { title: 'Забирай смену', text: 'Никита копит USDT и NSS, пока тебя нет: заходи и забирай. Здесь же промокоды: они дают настоящую скидку в магазине.' },
    chapters: { title: 'Двигай сюжет', text: 'Три главы: отвечай на вопросы в забеге и побеждай боссов. В бою бьёшь тапом по экрану, слева — «Блок», «Уклон» и «Супер».' },
    rating: { title: 'Покажи свой результат', text: 'Тут рейтинг и задания. Очки = USDT × 10 + метры.' },
    map: { title: 'Смени район', text: 'На карте районы города: выбирай, где бежать.' },
};
const frames = (steps) => steps.filter((s) => !s.notice).length; // предупреждение — не кадр комикса

// Координаты в пределах доступной области, включая узкие телефоны и системные отступы Telegram.
export function guidePlacement(target, panel, viewport) {
    const { width, height, top = 12, bottom = 12 } = viewport;
    const pad = 7, gap = 18;
    const x = Math.max(8, Math.min(width - 8, target.left - pad));
    const y = Math.max(top, Math.min(height - bottom, target.top - pad));
    const right = Math.max(x, Math.min(width - 8, target.right + pad));
    const lower = Math.max(y, Math.min(height - bottom, target.bottom + pad));
    const maxTop = Math.max(top, height - bottom - panel.height);
    const below = lower + gap;
    const panelTop = below <= maxTop ? below : Math.max(top, Math.min(maxTop, y - gap - panel.height));
    return {
        focus: { left: x, top: y, width: right - x, height: lower - y },
        panel: { left: Math.max(8, (width - panel.width) / 2), top: panelTop },
    };
}

export class GorillaGuide {
    constructor(hub) {
        this.hub = hub;
        this.root = document.getElementById('gorilla-guide');
        this.card = this.root.querySelector('.guide-card');
        this.focus = this.root.querySelector('.guide-focus');
        this.next = document.getElementById('guide-next');
        this.prev = document.getElementById('guide-prev');
        this.skip = document.getElementById('guide-skip');
        this.list = document.getElementById('guide-list');
        this.steps = GUIDE_STEPS;
        this.active = false;
        this.next.onclick = () => this.index < this.steps.length - 1 ? this.show(this.index + 1) : this.finish();
        this.prev.onclick = () => this.show(this.index - 1);
        this.skip.onclick = () => this.finish();
        this.layout = () => this.place();
        this.keys = (e) => this.keydown(e);
        this.keepFocus = (e) => { if (this.active && !this.root.contains(e.target)) this.next.focus({ preventScroll: true }); };
        // В Telegram на iPhone click по кнопке мог не дойти, и обучение застревало. Поэтому тап ловим сами, на всём документе:
        // по координатам кнопок, а мимо кнопок — следующий кадр. Обычный click от пальца гасим (иначе шаг сработает дважды,
        // а после закрытия нажмётся плитка под обучением); click без указателя (Enter, пробел) идёт как обычно
        this.down = null;
        document.addEventListener('pointerdown', (e) => { this.down = this.active ? { x: e.clientX, y: e.clientY } : null; }, true);
        document.addEventListener('pointercancel', () => { this.down = null; }, true);
        document.addEventListener('pointerup', (e) => this.tap(e), true);
        document.addEventListener('click', (e) => {
            if (e.detail > 0 && (this.active || performance.now() - (this.tapAt || 0) < 600)) { e.preventDefault(); e.stopPropagation(); }
        }, true);
    }

    tap(e) {
        const d = this.down;
        this.down = null;
        if (!this.active || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return; // прокрутка текста карточки — не тап
        const on = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && e.clientX >= r.left - 6 && e.clientX <= r.right + 6 && e.clientY >= r.top - 6 && e.clientY <= r.bottom + 6; };
        this.tapAt = performance.now();
        if (this.steps[this.index].notice) { if (on(this.next)) this.next.onclick(); return; } // предупреждение случайным тапом не закрыть
        if (on(this.skip)) this.finish();
        else if (on(this.prev)) this.prev.onclick();
        else this.next.onclick();
    }

    get done() { return (this.hub.p.data.guideVersion || 0) >= GUIDE_VERSION; }

    // совет раздела (TAB_TIPS): один раз, только тем, кто прошёл короткое обучение; раздел не переключаем
    tip(name) {
        const seen = (this.hub.p.data.tips ||= {});
        if (!TAB_TIPS[name] || seen[name] || !this.hub.p.data.tipsOn || !this.done) return false;
        if (!this.start({ replay: true, steps: [TAB_TIPS[name]] })) return false;
        seen[name] = 1;
        this.hub.p.save();
        return true;
    }

    start({ replay = false, onFinish, steps = GUIDE_STEPS } = {}) {
        if (this.active || this.hub.game.state !== 'menu' || (!replay && this.done)) return false;
        if (document.getElementById('boot') || document.querySelector('.modal:not([hidden]), #anketa:not([hidden]), #mode:not([hidden]), #case-open:not([hidden])')) return false;
        this.active = true;
        this.steps = steps;
        this.single = steps.length === 1;
        this.root.querySelector('.guide-progress').innerHTML = this.single ? '' : '<i></i>'.repeat(frames(steps));
        this.onFinish = onFinish;
        this.returnTab = replay ? this.hub.current : 'run';
        this.oldFocus = document.activeElement;
        this.menu = document.querySelector('.hub');
        this.scroll = this.menu.scrollTop;
        this.wasInert = this.menu.inert;
        document.body.classList.add('guide-running');
        if (!this.single) this.hub.tab('run');
        this.root.hidden = false;
        this.menu.inert = true;
        document.addEventListener('keydown', this.keys, true);
        document.addEventListener('focusin', this.keepFocus, true);
        window.addEventListener('resize', this.layout);
        window.visualViewport?.addEventListener('resize', this.layout);
        this.menu.addEventListener('scroll', this.layout, { passive: true });
        this.show(0);
        document.fonts?.ready.then(this.layout);
        return true;
    }

    show(index) {
        const steps = this.steps;
        this.index = Math.max(0, Math.min(steps.length - 1, index));
        const step = steps[this.index];
        const frame = frames(steps.slice(0, this.index + 1));
        document.getElementById('guide-count').textContent = step.notice ? 'ВАЖНО' : this.single ? 'СОВЕТ ГОРИЛЛЫ' : `КАДР ${String(frame).padStart(2, '0')} / ${String(frames(steps)).padStart(2, '0')}`;
        document.getElementById('guide-title').textContent = step.title;
        document.getElementById('guide-text').textContent = step.text;
        this.list.hidden = !step.notice;
        this.list.replaceChildren(...(step.items || []).map(([name, about]) => { const li = document.createElement('li'), b = document.createElement('b'); b.textContent = name; li.append(b, ` — ${about}`); return li; }));
        this.skip.hidden = !!step.notice || this.single;
        this.focus.classList.toggle('none', !step.target);
        document.getElementById('guide-controls').hidden = !step.controls;
        document.getElementById('guide-keyboard').hidden = !step.controls || !matchMedia('(pointer: fine)').matches;
        this.root.setAttribute('aria-describedby', ['guide-text', ...(!document.getElementById('guide-controls').hidden ? ['guide-controls'] : []), ...(!document.getElementById('guide-keyboard').hidden ? ['guide-keyboard'] : [])].join(' '));
        for (const [i, dot] of [...this.root.querySelectorAll('.guide-progress i')].entries()) dot.classList.toggle('on', i < frame);
        this.prev.hidden = this.index === 0;
        this.next.textContent = step.notice || this.single ? 'Понятно' : this.index === steps.length - 1 ? 'Всё понятно!' : 'Дальше →';
        this.target = step.target ? document.querySelector(step.target) : null;
        // меню не дёргаем: прокручиваем, только если кнопка не видна целиком (на маленьких экранах), и плавно;
        // облачко само встаёт над кнопкой или под ней (guidePlacement)
        const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
        // только само меню: scrollIntoView на iPhone двигает и страницу, и зоны нажатия расходятся с картинкой
        const box = this.target?.getBoundingClientRect(), area = this.menu.getBoundingClientRect();
        const by = !box ? 0 : box.top < area.top + 8 ? box.top - area.top - 8 : box.bottom > area.bottom - 8 ? box.bottom - area.bottom + 8 : 0;
        if (by) this.menu.scrollBy({ top: by, behavior: still ? 'auto' : 'smooth' });
        if (window.scrollY) window.scrollTo(0, 0);
        this.place();
        // новый кадр комикса: карточка выскакивает с наклоном (через кадр — в другую сторону), Горилла кивает,
        // облачко раздувается, подсветка переезжает к новой кнопке (CSS: .guide-card.pop, .guide-focus)
        this.card.style.setProperty('--tilt', this.index % 2 ? '2.5deg' : '-2.5deg');
        this.card.classList.remove('pop'); void this.card.offsetWidth; this.card.classList.add('pop');
        this.next.focus({ preventScroll: true });
    }

    place() {
        if (!this.active) return;
        const style = getComputedStyle(this.root);
        // размер карточки — без трансформации: во время «выскакивания» (scale .88) getBoundingClientRect меньше настоящего,
        // и облачко вставало ниже, наезжая на кнопку
        const panel = { width: this.card.offsetWidth, height: this.card.offsetHeight };
        if (!this.target) { // предупреждение — по центру экрана, всё вокруг затемнено
            const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
            Object.assign(this.focus.style, { left: `${cx}px`, top: `${cy}px`, width: '0px', height: '0px' });
            Object.assign(this.card.style, { left: `${Math.max(8, cx - panel.width / 2)}px`, top: `${Math.max(parseFloat(style.paddingTop) || 12, cy - panel.height / 2)}px` });
            return;
        }
        const p = guidePlacement(this.target.getBoundingClientRect(), panel, {
            width: window.innerWidth, height: window.innerHeight,
            top: parseFloat(style.paddingTop) || 12, bottom: parseFloat(style.paddingBottom) || 12,
        });
        for (const [key, value] of Object.entries(p.focus)) this.focus.style[key] = `${value}px`;
        for (const [key, value] of Object.entries(p.panel)) this.card.style[key] = `${value}px`;
    }

    keydown(e) {
        if (!this.active) return;
        e.stopImmediatePropagation(); // Enter и стрелки не запускают забег под обучением
        if (e.key === 'Escape') { e.preventDefault(); if (!this.steps[this.index].notice) this.finish(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); this.next.click(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); if (this.index) this.prev.click(); }
        else if (e.key === 'Tab') {
            e.preventDefault();
            const buttons = [...(!this.skip.hidden ? [this.skip] : []), ...(!this.prev.hidden ? [this.prev] : []), this.next];
            const index = buttons.indexOf(document.activeElement);
            buttons[(index + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus({ preventScroll: true });
        }
    }

    finish() {
        if (!this.active) return;
        this.active = false;
        this.root.hidden = true;
        this.menu.inert = this.wasInert;
        document.body.classList.remove('guide-running');
        document.removeEventListener('keydown', this.keys, true);
        document.removeEventListener('focusin', this.keepFocus, true);
        window.removeEventListener('resize', this.layout);
        window.visualViewport?.removeEventListener('resize', this.layout);
        this.menu.removeEventListener('scroll', this.layout);
        if (!this.single) { // обучение пройдено: дальше советы разделов при первом заходе
            this.hub.p.data.guideVersion = GUIDE_VERSION;
            this.hub.p.data.tipsOn = true;
        }
        this.hub.p.save(); // тот же локальный/облачный профиль, что и игровой прогресс
        if (!this.single) this.hub.tab(this.returnTab); // совет раздела: остаёмся там же, без повторного въезда
        this.menu.scrollTop = this.scroll;
        const fallback = document.getElementById(this.returnTab === 'settings' ? 'btn-replay-guide' : 'btn-play');
        (this.oldFocus?.isConnected && this.oldFocus !== document.body ? this.oldFocus : fallback)?.focus({ preventScroll: true });
        const done = this.onFinish;
        this.onFinish = null;
        done?.();
    }
}
