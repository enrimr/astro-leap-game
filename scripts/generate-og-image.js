// Genera og-image.png (1200x630) para las previews al compartir el enlace.
// Se ejecuta en tiempo de desarrollo con: npm run generate-og-image
//
// Usa las MISMAS fuentes que el juego (Orbitron para títulos, Rajdhani para texto — ver
// index.html) en vez de Arial, para que la tarjeta se lea como el juego y no como un banner
// genérico. Los TTF viven en scripts/fonts/ (gitignored); si faltan, se descargan solos del
// repo oficial google/fonts (licencia OFL) — y si no hay red, se cae a Arial con un aviso,
// nunca falla la generación.
const { createCanvas, registerFont } = require('canvas');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FONTS_DIR = path.join(__dirname, 'fonts');
const FONTS = [
    { file: 'Orbitron.ttf', family: 'Orbitron', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/orbitron/Orbitron%5Bwght%5D.ttf' },
    { file: 'Rajdhani-SemiBold.ttf', family: 'Rajdhani SemiBold', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/rajdhani/Rajdhani-SemiBold.ttf' },
    { file: 'Rajdhani-Medium.ttf', family: 'Rajdhani Medium', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/rajdhani/Rajdhani-Medium.ttf' }
];
let FONTS_OK = true;
fs.mkdirSync(FONTS_DIR, { recursive: true });
for (const f of FONTS) {
    const p = path.join(FONTS_DIR, f.file);
    if (!fs.existsSync(p)) {
        try { execSync(`curl -sfLo '${p}' '${f.url}'`); } catch (e) { /* sin red: fallback abajo */ }
    }
    if (fs.existsSync(p)) registerFont(p, { family: f.family });
    else FONTS_OK = false;
}
if (!FONTS_OK) console.warn('⚠ No se pudieron obtener las fuentes del juego — se genera con Arial.');
const F_TITLE = FONTS_OK ? 'Orbitron' : '"Arial Black", Arial';
const F_SEMI = FONTS_OK ? '"Rajdhani SemiBold"' : 'Arial';
const F_MED = FONTS_OK ? '"Rajdhani Medium"' : 'Arial';

const W = 1200, H = 630;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// Misma paleta que el juego (PALETTE en js/entities.js)
const PALETTE = { bg1: '#0b0620', bg2: '#160c33', ink: '#f5f3ff', dim: '#a89ee0', accent: '#7cf5ff', accent2: '#ff5ecb', accent3: '#ffd23f' };

// ---- Fondo: degradado + nebulosas suaves + estrellas (deterministas, para diffs limpios) ----
const bgGrad = ctx.createRadialGradient(W / 2, -100, 100, W / 2, H / 2, 900);
bgGrad.addColorStop(0, '#241249');
bgGrad.addColorStop(1, PALETTE.bg1);
ctx.fillStyle = bgGrad;
ctx.fillRect(0, 0, W, H);

function nebula(cx, cy, r, color, alpha) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha; ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
}
nebula(1050, 80, 420, '#ff5ecb', 0.10);
nebula(180, 560, 380, '#7cf5ff', 0.07);

function seededRandom(seed) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
const rnd = seededRandom(42);
for (let i = 0; i < 220; i++) {
    const x = rnd() * W, y = rnd() * H, size = rnd() < 0.15 ? 2.4 : 1.2;
    ctx.globalAlpha = 0.3 + rnd() * 0.7;
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(x, y, size, size);
}
ctx.globalAlpha = 1;

// ---- Luna con cráteres, abajo a la derecha (detrás de las plataformas) ----
ctx.save();
ctx.shadowColor = PALETTE.accent2; ctx.shadowBlur = 60;
ctx.fillStyle = '#3a2160';
ctx.beginPath(); ctx.arc(1030, 540, 160, 0, Math.PI * 2); ctx.fill();
ctx.restore();
ctx.fillStyle = 'rgba(0,0,0,0.15)';
[[980, 490, 22], [1070, 580, 16], [1010, 590, 12]].forEach(([cx, cy, r]) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); });

// ---- Nodo Cero (el antagonista), pequeño arriba a la derecha: red de 4 nodos orbitando un
// núcleo rojo — misma idea que Enemy.drawNodoCero en js/entities.js ----
(function drawNodoCero(cx, cy, orbitR) {
    const nodes = ['#ff5ecb', '#8b83c2', '#ffd23f', '#ff3366'].map((c, i) => {
        const a = 0.7 + i * Math.PI / 2;
        return { x: cx + Math.cos(a) * orbitR, y: cy + Math.sin(a) * orbitR * 0.85, c };
    });
    ctx.strokeStyle = 'rgba(255,51,102,0.45)'; ctx.lineWidth = 2;
    nodes.forEach(n => { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(n.x, n.y); ctx.stroke(); });
    ctx.save();
    ctx.shadowColor = '#ff3366'; ctx.shadowBlur = 22;
    ctx.fillStyle = '#ff3366';
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    nodes.forEach(n => {
        ctx.save();
        ctx.shadowColor = n.c; ctx.shadowBlur = 14;
        ctx.fillStyle = n.c;
        ctx.beginPath(); ctx.arc(n.x, n.y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    });
})(1100, 95, 38);

// ---- Plataformas (con variante reforzada de Scrap) ----
function platform(x, y, w, reinforced = false) {
    const g = ctx.createLinearGradient(0, y, 0, y + 16);
    if (reinforced) { g.addColorStop(0, '#5a4a2a'); g.addColorStop(1, '#3a2a0f'); }
    else { g.addColorStop(0, '#2a1a5e'); g.addColorStop(1, '#1c1140'); }
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, 16);
    if (reinforced) {
        // franjas de peligro ámbar, como Platform.draw() variante 'reinforced'
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, w, 16); ctx.clip();
        ctx.fillStyle = PALETTE.accent3; ctx.globalAlpha = 0.55;
        for (let sx = -16; sx < w; sx += 18) {
            ctx.beginPath();
            ctx.moveTo(x + sx, y + 16); ctx.lineTo(x + sx + 16, y);
            ctx.lineTo(x + sx + 22, y); ctx.lineTo(x + sx + 6, y + 16);
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }
    ctx.fillStyle = PALETTE.accent; ctx.globalAlpha = 0.6; ctx.fillRect(x, y, w, 2); ctx.globalAlpha = 1;
}

// Etiqueta con el nombre del piloto bajo su plataforma
function label(text, cx, y) {
    ctx.font = `21px ${F_SEMI}`;
    ctx.fillStyle = PALETTE.dim; ctx.textAlign = 'center';
    ctx.fillText(text, cx, y);
    ctx.textAlign = 'left';
}

// ---- Los 4 pilotos, cada uno con su silueta y su habilidad insinuada ----
// Scrap: bloque ámbar ancho, de pie sobre una plataforma reforzada (la que solo él rompe)
function drawScrap(x, y) {
    const w = 52, h = 54;
    ctx.save();
    ctx.shadowColor = PALETTE.accent3; ctx.shadowBlur = 18;
    const g = ctx.createLinearGradient(0, y - h, 0, y);
    g.addColorStop(0, '#e0a94a'); g.addColorStop(1, '#c98a2b');
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.restore();
    ctx.fillStyle = PALETTE.bg1;
    ctx.fillRect(x - 13, y - h + 13, 10, 10);
    ctx.fillRect(x + 4, y - h + 13, 10, 10);
}
// Shade: pastilla-capucha magenta en pleno dash (estelas horizontales detrás)
function drawShade(x, y) {
    const w = 44, h = 56;
    // estelas del dash: a la altura del cuerpo y con hueco antes del sprite, para que se lean
    // como movimiento y no como una línea que lo atraviesa
    [[-88, 0.10, 30], [-62, 0.20, 26], [-38, 0.32, 22]].forEach(([dx, a, lw]) => {
        ctx.globalAlpha = a; ctx.fillStyle = PALETTE.accent2;
        ctx.fillRect(x + dx - lw, y - h * 0.45, lw, 7);
        ctx.globalAlpha = 1;
    });
    ctx.save();
    ctx.shadowColor = PALETTE.accent2; ctx.shadowBlur = 18;
    const g = ctx.createLinearGradient(0, y - h, 0, y);
    g.addColorStop(0, '#ffb3e6'); g.addColorStop(1, '#c93f96');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h, w, h, [18, 18, 4, 4]); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffe3f5';
    ctx.fillRect(x - 10, y - h + 16, 8, 8);
    ctx.fillRect(x + 3, y - h + 16, 8, 8);
}
// Bolt: esfera-dron amarilla flotando, con brillo de propulsión debajo
function drawBolt(x, y) {
    const r = 26;
    ctx.save();
    ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.ellipse(x, y + r + 14, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = 20;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffe28a'); g.addColorStop(1, '#ffd23f');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#0b0620';
    ctx.beginPath(); ctx.arc(x + 4, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(x + 4, y, 4, 0, Math.PI * 2); ctx.fill();
}
// Kes: la protagonista cian, en el punto más alto de un doble salto (ráfaga magenta debajo)
function drawKes(x, y) {
    const w = 46, h = 58;
    ctx.fillStyle = PALETTE.accent2;
    [[-16, 20, 7], [12, 28, 6], [-2, 36, 5], [22, 14, 5], [-26, 8, 4]].forEach(([dx, dy, s]) => {
        ctx.globalAlpha = 0.7 - dy * 0.012;
        ctx.fillRect(x + dx, y + dy, s, s);
    });
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 24;
    const g = ctx.createLinearGradient(0, y - h, 0, y);
    g.addColorStop(0, PALETTE.accent); g.addColorStop(1, '#3fa9c9');
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.restore();
    ctx.fillStyle = PALETTE.bg1;
    ctx.fillRect(x - 11, y - h + 14, 9, 9);
    ctx.fillRect(x + 3, y - h + 14, 9, 9);
}

// Escalera ascendente hacia la luna: Scrap (suelo reforzado) → Shade (dash) → Bolt (vuelo) → Kes (doble salto)
platform(120, 520, 170, true);
drawScrap(205, 520);
label('SCRAP', 205, 562);

platform(370, 455, 130);
drawShade(452, 455);
label('SHADE', 435, 497);

platform(610, 395, 120);
drawBolt(670, 340);
label('BOLT', 670, 437);

platform(840, 330, 140);
drawKes(910, 260);
label('KES', 910, 372);

// ---- Bloque de título ----
ctx.textAlign = 'left';
ctx.font = `100px ${F_TITLE}`;
ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 26;
ctx.fillStyle = PALETTE.ink;
ctx.fillText('ASTRO LEAP', 80, 165);
// Orbitron variable se registra en su instancia por defecto — un trazo del mismo color
// engorda el título hasta el peso 800 que usa el juego, sin depender de un TTF estático.
ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 3.5;
ctx.strokeText('ASTRO LEAP', 80, 165);
ctx.shadowBlur = 0;

ctx.font = `38px ${F_SEMI}`;
ctx.fillStyle = PALETTE.accent3;
ctx.fillText('Plataformas + duelos por turnos', 84, 222);

ctx.font = `29px ${F_MED}`;
ctx.fillStyle = PALETTE.dim;
ctx.fillText('4 zonas · 12 sectores · 4 pilotos · Reto Diario', 84, 264);

ctx.font = `26px ${F_MED}`;
ctx.fillStyle = PALETTE.accent;
ctx.fillText('La misma energía paga tu doble salto y tus duelos', 84, 302);

// ---- Pie: cómo se juega (izquierda) y dónde (derecha) ----
ctx.font = `24px ${F_SEMI}`;
ctx.fillStyle = PALETTE.accent2;
ctx.fillText('Jugable en móvil y escritorio — sin instalar nada', 84, 596);
ctx.font = `26px ${F_SEMI}`;
ctx.fillStyle = PALETTE.accent;
ctx.textAlign = 'right';
ctx.fillText('astroleap.enri.me', 1120, 596);
ctx.textAlign = 'left';

const out = fs.createWriteStream(path.join(__dirname, '..', 'og-image.png'));
const stream = canvas.createPNGStream();
stream.pipe(out);
out.on('finish', () => console.log('og-image.png generado correctamente'));
