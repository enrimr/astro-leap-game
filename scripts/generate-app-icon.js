// Genera build/icon.png (1024x1024) — el icono de la app de escritorio. electron-builder lo
// convierte solo a .icns (macOS) y .ico (Windows) al empaquetar. Se ejecuta con:
// npm run generate-app-icon
//
// Estilo macOS moderno: cuadrado redondeado de 824px centrado en un lienzo transparente de
// 1024 (la rejilla oficial de iconos de Apple; Windows/Linux lo muestran igual de bien).
// Dentro, el juego en miniatura: cielo del menú, estrellas, la luna rosa con cráteres y una
// nave en órbita — misma paleta que PALETTE en js/entities.js, mismos trucos que el banner OG.
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const S = 1024;
const canvas = createCanvas(S, S);
const ctx = canvas.getContext('2d');

const PALETTE = { bg1: '#0b0620', ink: '#f5f3ff', accent: '#7cf5ff', accent2: '#ff5ecb', accent3: '#ffd23f' };

// ---- Cuadrado redondeado (824px, radio 185 ≈ la curva de los iconos de macOS) ----
const TILE = 824, R = 185, O = (S - TILE) / 2;
ctx.beginPath();
ctx.roundRect(O, O, TILE, TILE, R);
ctx.clip();

// ---- Fondo: el mismo degradado radial del menú del juego ----
const bg = ctx.createRadialGradient(S / 2, O - 60, 80, S / 2, S / 2, 760);
bg.addColorStop(0, '#241249');
bg.addColorStop(1, PALETTE.bg1);
ctx.fillStyle = bg;
ctx.fillRect(O, O, TILE, TILE);

function nebula(cx, cy, r, color, alpha) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha; ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
}
nebula(780, 260, 380, PALETTE.accent2, 0.12);
nebula(240, 800, 340, PALETTE.accent, 0.09);

// Estrellas deterministas (mismo LCG que el banner OG: diffs limpios al regenerar)
function seededRandom(seed) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
const rnd = seededRandom(42);
for (let i = 0; i < 90; i++) {
    const x = O + rnd() * TILE, y = O + rnd() * TILE, size = rnd() < 0.15 ? 5 : 2.5;
    ctx.globalAlpha = 0.3 + rnd() * 0.7;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(x, y, size, size);
}
ctx.globalAlpha = 1;

// ---- La luna rosa con cráteres, protagonista centrada ----
const MX = S / 2, MY = S / 2 + 40, MR = 240;
ctx.save();
ctx.shadowColor = PALETTE.accent2; ctx.shadowBlur = 90;
const moonG = ctx.createRadialGradient(MX - 70, MY - 80, 40, MX, MY, MR);
moonG.addColorStop(0, '#e86bd0');
moonG.addColorStop(1, '#9b3391');
ctx.fillStyle = moonG;
ctx.beginPath(); ctx.arc(MX, MY, MR, 0, Math.PI * 2); ctx.fill();
ctx.restore();
ctx.fillStyle = 'rgba(0,0,0,0.18)';
[[MX - 90, MY - 60, 42], [MX + 70, MY + 80, 30], [MX + 10, MY + 120, 20], [MX + 110, MY - 70, 24]]
    .forEach(([cx, cy, r]) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); });

// ---- Órbita cian con su nave: el "leap" del nombre ----
ctx.save();
ctx.translate(MX, MY);
ctx.rotate(-0.42);
ctx.strokeStyle = PALETTE.accent;
ctx.lineWidth = 10;
ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 26;
ctx.beginPath(); ctx.ellipse(0, 0, 350, 130, 0, 0, Math.PI * 2); ctx.stroke();
// La nave: un triángulo amarillo sobre la órbita, en el tramo que pasa por delante
const t = 0.62 * Math.PI; // ángulo paramétrico en el frente-izquierda
const sx = 350 * Math.cos(t), sy = 130 * Math.sin(t);
ctx.translate(sx, sy);
ctx.rotate(Math.atan2(130 * Math.cos(t), -350 * Math.sin(t)) + Math.PI / 2);
ctx.fillStyle = PALETTE.accent3;
ctx.shadowColor = PALETTE.accent3; ctx.shadowBlur = 30;
ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(24, 26); ctx.lineTo(-24, 26); ctx.closePath(); ctx.fill();
ctx.restore();

const outPath = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log(`✓ Icono generado: ${outPath}`);
