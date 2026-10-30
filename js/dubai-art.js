import * as THREE from './vendor/three.module.js';

// Рекламные щиты Дубая (30.10, по просьбе): кадры «Пусть говорят» с Димой и Сашей и логотип передачи — целиком, без
// подписей поверх. Четыре места в атласе 2048×1024 (по 1024×512), щиты берут их по номеру (Vietnam.billboard index % 4).
// fit: "cover" — заполнить место (края обрезаются), "contain" — целиком, по бокам размытая копия кадра
export const DUBAI_BILLBOARDS = [
    { photo: 'img/billboards/tv_dima.jpg', fit: 'cover' },
    { photo: 'img/billboards/dima_sasha.jpg', fit: 'contain' },
    { photo: 'img/billboards/pust_govoryat.webp', fit: 'cover' },
    { photo: 'img/billboards/dima_sasha.jpg', fit: 'contain' },
];

const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img); img.onerror = reject; img.src = url;
});

export async function billboardAtlas() {
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024;
    const g = canvas.getContext('2d');
    g.fillStyle = '#0c1720'; g.fillRect(0, 0, 2048, 1024);
    for (let i = 0; i < DUBAI_BILLBOARDS.length; i++) {
        const b = DUBAI_BILLBOARDS[i], ox = (i % 2) * 1024, oy = Math.floor(i / 2) * 512, W = 1024, H = 512;
        let img;
        try { img = await loadImage(b.photo); } catch { continue; }
        g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, W, H); g.clip();
        const cover = Math.max(W / img.width, H / img.height), contain = Math.min(W / img.width, H / img.height);
        if (b.fit === 'contain') { // фон — тот же кадр крупно и размыто, сверху — целиком
            g.filter = 'blur(18px)'; // где фильтров у холста нет (старый Safari) — фон просто без размытия, но затемнён
            g.drawImage(img, (W - img.width * cover) / 2, (H - img.height * cover) / 2, img.width * cover, img.height * cover);
            g.filter = 'none';
            g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, W, H);
            g.drawImage(img, (W - img.width * contain) / 2, (H - img.height * contain) / 2, img.width * contain, img.height * contain);
        } else {
            g.drawImage(img, (W - img.width * cover) / 2, (H - img.height * cover) / 2, img.width * cover, img.height * cover);
        }
        g.restore();
    }
    const map = new THREE.CanvasTexture(canvas); map.encoding = THREE.sRGBEncoding; map.anisotropy = 8;
    return map;
}
