// Genera og-image.png (1200x630) para las previews al compartir el enlace.
// Se ejecuta en tiempo de desarrollo con: npm run generate-og-image
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const W = 1200, H = 630;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

const PALETTE = { bg1: '#0b0620', bg2: '#160c33', ink: '#f5f3ff', dim: '#a89ee0', accent: '#7cf5ff', accent2: '#ff5ecb', accent3: '#ffd23f' };

// Fondo degradado
const bgGrad = ctx.createRadialGradient(W / 2, -100, 100, W / 2, H / 2, 900);
bgGrad.addColorStop(0, '#241249');
bgGrad.addColorStop(1, PALETTE.bg1);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

// Estrellas
function seededRandom(seed) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
const rnd = seededRandom(42);
for (let i = 0; i < 220; i++) {
    const x = rnd() * W, y = rnd() * H, size = rnd() < 0.15 ? 2.4 : 1.2;
    ctx.globalAlpha = 0.3 + rnd() * 0.7;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(x, y, size, size);
}
ctx.globalAlpha = 1;

// Luna decorativa (círculo con glow) esquina inferior derecha
ctx.save();
ctx.shadowColor = PALETTE.accent2; ctx.shadowBlur = 60;
ctx.fillStyle = '#3a2160';
ctx.beginPath(); ctx.arc(1020, 520, 160, 0, Math.PI * 2); ctx.fill();
ctx.restore();
ctx.fillStyle = 'rgba(0,0,0,0.15)';
[[970, 470, 22], [1060, 560, 16], [1000, 570, 12]].forEach(([cx, cy, r]) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); });

// Plataforma flotante + jugador simplificado (silueta del gameplay)
function platform(x, y, w) {
    const g = ctx.createLinearGradient(0, y, 0, y + 14);
    g.addColorStop(0, '#2a1a5e'); g.addColorStop(1, '#1c1140');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, 14);
    ctx.fillStyle = PALETTE.accent; ctx.globalAlpha = 0.6; ctx.fillRect(x, y, w, 2); ctx.globalAlpha = 1;
}
platform(120, 460, 140);
platform(330, 400, 100);
platform(500, 340, 90);

ctx.save();
ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 24;
const pg = ctx.createLinearGradient(0, 280, 0, 340);
pg.addColorStop(0, PALETTE.accent); pg.addColorStop(1, '#3fa9c9');
ctx.fillStyle = pg;
ctx.fillRect(540, 280, 46, 60);
ctx.restore();
ctx.fillStyle = PALETTE.bg1;
ctx.fillRect(552, 296, 8, 8); ctx.fillRect(568, 296, 8, 8);

// Titulo
ctx.textAlign = 'left';
ctx.font = '800 96px "Arial Black", Arial, sans-serif';
ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 26;
ctx.fillStyle = PALETTE.ink;
ctx.fillText('ASTRO LEAP', 80, 170);
ctx.shadowBlur = 0;

ctx.font = '600 32px Arial, sans-serif';
ctx.fillStyle = PALETTE.accent3;
ctx.fillText('Plataformas + duelos por turnos', 84, 220);

ctx.font = '500 26px Arial, sans-serif';
ctx.fillStyle = PALETTE.dim;
ctx.fillText('2 lunas · 6 sectores · el doble salto cuesta energía', 84, 258);

// Tag inferior
ctx.font = '600 22px Arial, sans-serif';
ctx.fillStyle = PALETTE.accent2;
ctx.fillText('Jugable en móvil y escritorio — teclado, ratón o táctil', 84, 570);

const out = fs.createWriteStream(path.join(__dirname, '..', 'og-image.png'));
const stream = canvas.createPNGStream();
stream.pipe(out);
out.on('finish', () => console.log('og-image.png generado correctamente'));
