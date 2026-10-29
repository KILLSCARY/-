// Короткий комикс поверх настоящего меню. Без отдельной сцены, библиотек и цикла анимации.
export const GUIDE_VERSION = 1;
export const GUIDE_STEPS = [
    { target: '.hub-top .cur', title: 'На районе — со мной!', text: 'Я Горилла. Покажу район! Сверху — твои игровые USDT и Карты. Сейчас расскажу, что с ними делать.' },
    { target: '#tiles [data-go="heroes"]', title: 'Собери свою команду', text: 'Здесь выбираешь героя. У каждого свой навык, а условия открытия написаны на его карточке.' },
    { target: '#tiles [data-go="cases"]', title: 'Забирай лут', text: 'В кейсах — награды. Бесплатный конверт тоже здесь: таймер подскажет, когда можно открыть следующий.' },
    { target: '#tiles [data-go="shop"]', title: 'Прокачай забег', text: 'Бери бусты на следующий забег или прокачивай способности. Описание поможет выбрать под свой стиль.' },
    { target: '#tiles [data-go="chapters"]', title: 'Двигай сюжет', text: 'Здесь главы, прогресс и боссы. Зарабатывай USDT и проходи сюжет. Покупки накопленный прогресс не отнимают.' },
    { target: '#tiles [data-go="rating"]', title: 'Покажи свой результат', text: 'Тут рейтинг и задания. В забеге собирай USDT и беги дальше: очки = USDT × 10 + метры.' },
    { target: '#btn-play', title: 'Погнали!', text: 'В бою появятся кнопки удара и защиты. А пока — свайпай и собирай USDT!', controls: true },
];

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
        this.active = false;
        this.next.onclick = () => this.index < GUIDE_STEPS.length - 1 ? this.show(this.index + 1) : this.finish();
        this.prev.onclick = () => this.show(this.index - 1);
        this.skip.onclick = () => this.finish();
        this.layout = () => this.place();
        this.keys = (e) => this.keydown(e);
        this.keepFocus = (e) => { if (this.active && !this.root.contains(e.target)) this.next.focus({ preventScroll: true }); };
    }

    get done() { return (this.hub.p.data.guideVersion || 0) >= GUIDE_VERSION; }

    start({ replay = false, onFinish } = {}) {
        if (this.active || this.hub.game.state !== 'menu' || (!replay && this.done)) return false;
        if (document.getElementById('boot') || document.querySelector('.modal:not([hidden]), #anketa:not([hidden]), #mode:not([hidden]), #case-open:not([hidden])')) return false;
        this.active = true;
        this.onFinish = onFinish;
        this.returnTab = replay ? this.hub.current : 'run';
        this.oldFocus = document.activeElement;
        this.menu = document.querySelector('.hub');
        this.scroll = this.menu.scrollTop;
        this.wasInert = this.menu.inert;
        document.body.classList.add('guide-running');
        this.hub.tab('run');
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
        this.index = Math.max(0, Math.min(GUIDE_STEPS.length - 1, index));
        const step = GUIDE_STEPS[this.index];
        document.getElementById('guide-count').textContent = `КАДР ${String(this.index + 1).padStart(2, '0')} / ${String(GUIDE_STEPS.length).padStart(2, '0')}`;
        document.getElementById('guide-title').textContent = step.title;
        document.getElementById('guide-text').textContent = step.text;
        document.getElementById('guide-controls').hidden = !step.controls;
        document.getElementById('guide-keyboard').hidden = !step.controls || !matchMedia('(pointer: fine)').matches;
        this.root.setAttribute('aria-describedby', ['guide-text', ...(!document.getElementById('guide-controls').hidden ? ['guide-controls'] : []), ...(!document.getElementById('guide-keyboard').hidden ? ['guide-keyboard'] : [])].join(' '));
        for (const [i, dot] of [...this.root.querySelectorAll('.guide-progress i')].entries()) dot.classList.toggle('on', i <= this.index);
        this.prev.hidden = this.index === 0;
        this.next.textContent = this.index === GUIDE_STEPS.length - 1 ? 'Всё понятно!' : 'Дальше →';
        this.target = document.querySelector(step.target);
        this.target?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
        this.place();
        this.next.focus({ preventScroll: true });
    }

    place() {
        if (!this.active || !this.target) return;
        const style = getComputedStyle(this.root);
        const p = guidePlacement(this.target.getBoundingClientRect(), this.card.getBoundingClientRect(), {
            width: window.innerWidth, height: window.innerHeight,
            top: parseFloat(style.paddingTop) || 12, bottom: parseFloat(style.paddingBottom) || 12,
        });
        for (const [key, value] of Object.entries(p.focus)) this.focus.style[key] = `${value}px`;
        for (const [key, value] of Object.entries(p.panel)) this.card.style[key] = `${value}px`;
    }

    keydown(e) {
        if (!this.active) return;
        e.stopImmediatePropagation(); // Enter и стрелки не запускают забег под обучением
        if (e.key === 'Escape') { e.preventDefault(); this.finish(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); this.next.click(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); if (this.index) this.prev.click(); }
        else if (e.key === 'Tab') {
            e.preventDefault();
            const buttons = [this.skip, ...(!this.prev.hidden ? [this.prev] : []), this.next];
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
        this.hub.p.data.guideVersion = GUIDE_VERSION;
        this.hub.p.save(); // тот же локальный/облачный профиль, что и игровой прогресс
        this.hub.tab(this.returnTab);
        this.menu.scrollTop = this.scroll;
        const fallback = document.getElementById(this.returnTab === 'settings' ? 'btn-replay-guide' : 'btn-play');
        (this.oldFocus?.isConnected && this.oldFocus !== document.body ? this.oldFocus : fallback)?.focus({ preventScroll: true });
        const done = this.onFinish;
        this.onFinish = null;
        done?.();
    }
}
