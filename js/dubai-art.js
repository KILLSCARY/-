import * as THREE from './vendor/three.module.js';
import { CHARACTERS } from './config.js';

// фото на щитах — те же портреты, что сейчас на карточках героев в игре (CHARACTERS[…].portrait): поменяли портрет —
// поменялся и щит, без отдельных файлов
const portrait = (id) => CHARACTERS.find((c) => c.id === id)?.portrait;

// Use the built-in portraits explicitly selected by the user; never synthesize replacement faces.
export const DUBAI_BILLBOARDS = [
    { title: 'ДИМА МЕНТ', subtitle: 'P2P DUBAI  /  MARINA', photo: portrait('dima') },
    { title: 'САША ТОВАРУС', subtitle: 'P2P DUBAI  /  SUNSET', photo: portrait('tovarus') },
    { title: 'ПАВЕЛ ИНАКОВ', subtitle: 'P2P DUBAI  /  WATERFRONT', photo: portrait('pavel') },
    { title: 'ДЕНЧИК', subtitle: 'P2P DUBAI  /  OUR PEOPLE', photo: portrait('denchik') },
];

export async function billboardAtlas() {
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024;
    const g = canvas.getContext('2d');
    for (let i = 0; i < DUBAI_BILLBOARDS.length; i++) {
        const b = DUBAI_BILLBOARDS[i], ox = (i % 2) * 1024, oy = Math.floor(i / 2) * 512;
        g.save(); g.translate(ox, oy); g.beginPath(); g.rect(0, 0, 1024, 512); g.clip();
        const grad = g.createLinearGradient(0, 0, 1024, 512);
        grad.addColorStop(0, ['#103c48', '#351e40', '#142d40', '#423026'][i]); grad.addColorStop(1, '#0c1720');
        g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
        // Graphic artwork is deliberately distinct from a placeholder portrait.
        g.strokeStyle = '#dcac6b'; g.lineWidth = 2;
        for (let ring = 0; ring < 6; ring++) { g.beginPath(); g.arc(800, 248, 110 + ring * 28, -.9, 3.5); g.stroke(); }
        g.fillStyle = '#d5a76d'; g.beginPath(); g.arc(800, 210, 84, 0, Math.PI * 2); g.fill();
        for (let j = 0; j < 13; j++) {
            const height = 40 + (j * 73 % 160);
            g.fillStyle = j % 2 ? '#1c3840' : '#28515a'; g.fillRect(580 + j * 35, 440 - height, 27, height);
            g.fillStyle = '#b6935b'; for (let y = 450 - height; y < 428; y += 13) g.fillRect(585 + j * 35, y, 3, 4);
        }
        if (b.photo) {
            const photo = await new THREE.TextureLoader().loadAsync(b.photo);
            const image = photo.image, scale = Math.max(500 / image.width, 512 / image.height);
            g.save(); g.beginPath(); g.rect(524, 0, 500, 512); g.clip();
            g.drawImage(image, 774 - image.width * scale / 2, 256 - image.height * scale / 2, image.width * scale, image.height * scale); g.restore();
            photo.dispose();
        }
        g.fillStyle = '#f0c98b'; g.font = '600 23px Arial'; g.fillText('P2P  /  DUBAI', 56, 76);
        g.fillStyle = '#fff3dc'; g.font = 'bold 74px Arial';
        for (const [j, word] of b.title.split(' ').entries()) g.fillText(word, 52, 200 + j * 83, 490);
        g.fillStyle = '#dbc3a3'; g.font = '20px Arial'; g.fillText(b.subtitle, 56, 453, 520);
        g.strokeStyle = '#d6b683'; g.strokeRect(20, 20, 984, 472); g.restore();
    }
    const map = new THREE.CanvasTexture(canvas); map.encoding = THREE.sRGBEncoding; map.anisotropy = 4;
    return map;
}
