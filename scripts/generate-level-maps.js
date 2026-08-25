// Genera los mapas completos de los 12 niveles para GUIA.md (dev-time):
//   npm run generate-level-maps   →  guia/nivel-01.png ... guia/nivel-12.png
//
// No dibuja una reproducción aproximada: carga el juego real en Chrome headless y usa las MISMAS
// clases (Platform, Enemy, LifeCapsule, EnergyCell, GoalFlag, Player) con cameraX=0 sobre un
// canvas del ancho del nivel entero — así el mapa de la guía es exactamente lo que se ve jugando,
// y se regenera fiel con solo re-ejecutar el script si los niveles cambian.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'guia');

(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--mute-audio'] });
    const page = await browser.newPage();
    await page.goto(`file://${path.join(ROOT, 'index.html')}`, { waitUntil: 'networkidle0' });

    const count = await page.evaluate(() => LEVELS.length);
    for (let i = 0; i < count; i++) {
        const dataURL = await page.evaluate((i) => {
            const SCALE = 2, H = 180;
            const level = LEVELS[i];
            const W = level.goal + 60;
            const c = document.createElement('canvas');
            c.width = W * SCALE; c.height = H * SCALE;
            const g = c.getContext('2d');
            g.scale(SCALE, SCALE);

            // Fondo + estrellas deterministas (sin Math.random: mismos PNG en cada ejecución → diffs limpios)
            const grad = g.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, PALETTE.bg2); grad.addColorStop(1, PALETTE.bg1);
            g.fillStyle = grad; g.fillRect(0, 0, W, H);
            for (let s = 0; s < W / 5; s++) {
                const x = (s * 97.3) % W, y = (s * 61.7) % 165;
                g.globalAlpha = 0.25 + ((s * 13) % 7) / 12;
                g.fillStyle = PALETTE.ink;
                const sz = s % 9 === 0 ? 1.6 : 0.9;
                g.fillRect(x, y, sz, sz);
            }
            g.globalAlpha = 1;

            level.platforms.forEach(p => new Platform(...p, level.variant).draw(g, 0));
            (level.reinforcedBlocks || []).forEach(b => new Platform(...b, 'reinforced').draw(g, 0));
            // Móviles en su Y base (con su raíl de recorrido) y rayos dibujados ACTIVOS —
            // en el mapa de la guía deben verse, no depender de la fase del ciclo.
            (level.movingPlatforms || []).forEach(([mx, my, mw, mh, amp, om]) => new MovingPlatform(mx, my, mw, mh, amp, om, level.variant).draw(g, 0));
            (level.beams || []).forEach(([bx, by, len, off]) => { const beam = new EnergyBeam(bx, by, len, off); beam.t = beam.PERIOD - beam.ON; beam.draw(g, 0); });
            (level.capsules || []).forEach(([x, y]) => { const cp = new LifeCapsule(x, y); cp.t = 0; cp.draw(g, 0); });
            (level.energyCells || []).forEach(([x, y]) => { const ce = new EnergyCell(x, y); ce.t = 0; ce.draw(g, 0); });
            level.enemies.forEach(e => new Enemy(...e).draw(g, 0)); // dibuja también su "LvN" (y "JEFE")
            new GoalFlag(level.goal, 128).draw(g, 0);

            // Punto de partida: Kes de pie en el arranque real del nivel (x=20, sobre el suelo)
            const pl = new Player(20, 137, 'kes');
            pl.onGround = true;
            pl.draw(g, 0);
            g.fillStyle = PALETTE.accent; g.font = '7px "Rajdhani", sans-serif';
            g.fillText('INICIO', 10, 131);

            return c.toDataURL('image/png');
        }, i);
        const file = path.join(OUT_DIR, `nivel-${String(i + 1).padStart(2, '0')}.png`);
        fs.writeFileSync(file, Buffer.from(dataURL.split(',')[1], 'base64'));
        console.log(path.basename(file));
    }
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
