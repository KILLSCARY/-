// Планировщик не привязывает 60 FPS к целому числу кадров дисплея:
// на 90 Гц это иначе превращалось в 45 FPS. Просроченные кадры не догоняем.
export class FramePacer {
    reset() { this.last = this.next = 0; this.interval = 1000 / 60; this.budget = 0; }
    constructor() { this.reset(); }
    ready(now, budget) {
        const gap = this.last ? now - this.last : 0;
        if (gap > 0 && gap < 40) this.interval += (gap - this.interval) * 0.1;
        this.last = now;
        if (budget !== this.budget) { this.next = now; this.budget = budget; }
        if (now < this.next - this.interval * 0.45) return false;
        this.next = Math.max(this.next + budget, now + budget - this.interval * 0.45);
        return true;
    }
}

// FPS измеряется по реальному времени, а не по сглаженному/обрезанному dt игры.
export class FrameMeter {
    reset() { this.start = null; this.frames = 0; }
    constructor(windowMs = 1200) { this.windowMs = windowMs; this.reset(); }
    sample(now) {
        if (this.start === null) { this.start = now; return null; }
        this.frames++;
        const elapsed = now - this.start;
        if (elapsed < this.windowMs) return null;
        const fps = this.frames * 1000 / elapsed;
        this.start = now; this.frames = 0;
        return fps;
    }
}

// Только фоновая анимация; положение объектов и столкновения обновляются каждый кадр.
export function updateAmbientAnimation(object, dt, tier) {
    const u = object.userData, z = object.position.z;
    if (!u.mixer) return;
    if (!object.visible || z < -Math.min(70, tier.far - 12) || z > 8) { u.animationTime = 0; return; }
    const hz = z > -18 ? 60 : (tier.animationHz || 30);
    u.animationTime = (u.animationTime || 0) + dt;
    if (u.animationTime + 1e-6 < 1 / hz) return;
    u.mixer.update(u.animationTime);
    u.animationTime = 0;
}

// DPR — линейная величина: ×3 означает в девять раз больше пикселей.
// Лимит площади защищает также большие телефоны и планшеты, в обеих ориентациях.
export function renderPixelRatio(width, height, dpr, tier, mobile, resolution = 1, heat = 1) {
    const areaLimit = mobile ? Math.sqrt(1500000 / Math.max(1, width * height)) : Infinity;
    return Math.min(dpr || 1, tier.ratio, areaLimit) * resolution * heat;
}
