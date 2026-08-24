// Graba clips de gameplay real (dev-time): abre el juego en Chrome headless, un bot juega un
// nivel leyendo el estado real (game.player/platforms/enemies/combat) y el <canvas> se captura
// con MediaRecorder. Un clip POR PILOTO, cada uno en un nivel que luce su habilidad:
//
//   node scripts/record-gameplay.js kes|bolt|shade|scrap   (o sin argumento: los 4 seguidos)
//   npm run record-gameplay
//
// Salida: gameplay-<piloto>.webm en la raíz. Conversión después con ffmpeg:
//   ffmpeg -i gameplay-kes.webm -vf scale=1280:-2 -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart gameplay-kes.mp4
//
// Detalles del bot pensados para que el VÍDEO se entienda, no para jugar óptimo:
// - En combate espera ~2.5s con el menú de acciones visible antes de elegir, para que se lea.
// - Empieza con nivel de sobra (subido vía gainXP real) para poder PISOTEAR a los enemigos
//   comunes — el lado plataformas de la mecánica — en vez de abrir duelo con todos.
// - Cada piloto usa su habilidad aérea en cada hueco (aunque no hiciera falta), porque el clip
//   existe para enseñarla: Kes remata cada salto con el doble salto, Bolt mantiene el vuelo,
//   Shade encadena el dash, y Scrap (sin habilidad aérea) rompe su bloque reforzado del nivel 1.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.join(__dirname, '..');

// Nivel (1-based, vía ?level=) y nivel de personaje por piloto. El nivel de personaje se sube
// ANTES de grabar con gainXP() de verdad (stats coherentes), lo justo para que los enemigos
// comunes del sector sean pisoteables (pisotón exige enemy.level < player.level).
// duelTypes: tipos de enemigo que el bot NO pisotea aunque pueda — camina hacia ellos y abre
// duelo por turnos, para que cada clip enseñe también el combate (con su menú bien visible).
const SHOWCASES = {
    kes:   { level: 2, playerLevel: 4, duelTypes: [], note: 'Grietas de Hielo — doble salto + pisotones (plataformas puras)' },
    bolt:  { level: 4, playerLevel: 6, duelTypes: ['magnetite'], note: 'Chatarral Magnético — vuelo sostenido + duelo + pisotón' },
    shade: { level: 7, playerLevel: 7, duelTypes: ['crawler'], note: 'Muelle de Carga — dash + duelo + pisotón' },
    scrap: { level: 1, playerLevel: 3, duelTypes: ['drone'], note: 'Cráter de Amerizaje — duelo + bóveda reforzada con cápsula' }
};

async function record(browser, hero) {
    const cfg = SHOWCASES[hero];
    const out = path.join(ROOT, `gameplay-${hero}.webm`);
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
    page.on('pageerror', e => console.error(`[${hero}] page error:`, e.message));

    await page.goto(`file://${path.join(ROOT, 'index.html')}?level=${cfg.level}&char=${hero}`, { waitUntil: 'load' });
    // OJO: `game` es un const de nivel superior de un script clásico — NO existe window.game
    // (mismo caso que el bug histórico de window.SFX, DESIGN.md §2.10): se usa el binding léxico.
    await page.waitForFunction('typeof game !== "undefined" && game.inLevel', { timeout: 15000 });

    await page.evaluate((cfg) => {
        // Nivel de personaje de partida, subido por el camino real (stats/HP/Energía coherentes)
        while (game.player.level < cfg.playerLevel) game.player.gainXP(game.player.xpToNextLevel - game.player.xp);
        game.levelUpMessage = 0; // que el clip no arranque con el cartel de "¡SUBISTE DE NIVEL!"
    }, cfg);
    await new Promise(r => setTimeout(r, 400)); // primer frame ya dibujado

    await page.evaluate((cfg) => {
        const canvas = document.getElementById('gameCanvas');
        const stream = canvas.captureStream(60);
        window.__chunks = [];
        window.__rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 6_000_000 });
        window.__rec.ondataavailable = e => { if (e.data.size) window.__chunks.push(e.data); };
        window.__rec.start(250);

        let jumpHold = 0, jumpCooldown = 0, airTicks = 0, menuSince = 0, startedAt = performance.now();
        window.__bot = setInterval(() => {
            const g = game;
            if (!g.gameStarted) return;
            if (g.hintScreen) { g.dismissHintScreen(); return; }
            if (g.unlockScreen) { g.dismissUnlockScreen(); return; }
            if (performance.now() - startedAt < 700) return; // respiro inicial: la escena quieta

            if (g.combat && g.combat.active) {
                g.keys.ArrowRight = false; g.keys.Space = false;
                const menuOpen = g.combat.turn === 'player' && g.combat.messageTimer === 0;
                if (!menuOpen) { menuSince = 0; return; }
                if (!menuSince) menuSince = performance.now();
                // ~2.5s con el menú de acciones en pantalla antes de elegir, para que se lea bien
                if (performance.now() - menuSince > 2500) { g.combat.handleInput('Digit1'); menuSince = 0; }
                return;
            }
            if (!g.inLevel || g.levelCompleting) { g.keys.ArrowRight = false; g.keys.Space = false; return; }

            const p = g.player;
            // Duelo garantizado con los tipos de duelTypes: al acercarse, se abre el combate tal
            // cual lo abriría el choque (misma CombatSystem, mismo estado) — sin esto, el bot a
            // veces les aterrizaba encima sin querer y el pisotón se comía el duelo del clip.
            const duelEnemy = g.enemies.find(e => e.alive && cfg.duelTypes.includes(e.type)
                && Math.abs(e.x - p.x) < 44 && Math.abs((e.y + e.h) - (p.y + p.h)) < 45);
            if (duelEnemy) {
                g.keys.ArrowRight = false; g.keys.Space = false;
                g.combat = new CombatSystem(p, duelEnemy);
                return;
            }
            g.keys.ArrowRight = true;
            airTicks = p.onGround ? 0 : airTicks + 1;

            // ¿Hay suelo un poco por delante de los pies? (a esta altura o hasta 30 por debajo)
            const lookahead = 14;
            const footY = p.y + p.h;
            const groundAhead = g.platforms.some(pl => !pl.broken
                && pl.y >= footY - 2 && pl.y <= footY + 30
                && p.x + p.w + lookahead >= pl.x && p.x + lookahead <= pl.x + pl.w);

            // Pisotón: enemigo común vivo, a la altura del suelo actual y pisoteable → saltarle
            // encima un poco antes de llegar (el arco del salto cae sobre su cabeza).
            const stompTarget = g.enemies.some(e => e.alive && !e.isBoss && !e.isFlying
                && e.level < p.level
                && !cfg.duelTypes.includes(e.type) // estos se dejan para el duelo, no se pisotean
                && Math.abs((e.y + e.h) - footY) < 20
                && e.x > p.x + p.w && e.x - (p.x + p.w) < 34);

            if (jumpHold > 0) { g.keys.Space = true; jumpHold--; }
            else g.keys.Space = false;
            if (jumpCooldown > 0) jumpCooldown--;

            if (p.onGround && (stompTarget || !groundAhead) && jumpHold <= 0 && jumpCooldown <= 0) {
                jumpHold = 2; jumpCooldown = 10;
            }

            // Habilidad aérea de cada piloto, usada en CADA salto de hueco — el clip existe para enseñarla
            if (p.character === 'bolt') {
                // Vuelo: tras el impulso del salto, mantener pulsado un buen rato para ascender
                if (airTicks >= 12 && airTicks <= 34 && p.energy > 0 && !groundAhead) g.keys.Space = true;
            } else if ((p.character === 'kes' || p.character === 'shade') && jumpHold <= 0) {
                // Doble salto / dash: segunda pulsación cerca del ápice del primer salto
                if (airTicks === 14 && !p.usedAirAbility && p.energy >= 1 && !groundAhead) jumpHold = 2;
                // ...y de rescate si aún así se queda corto y va cayendo sin suelo a la vista
                if (!p.onGround && p.vy > 1.2 && !p.usedAirAbility && p.energy >= 1 && !groundAhead) jumpHold = 2;
            }
        }, 16);
    }, cfg);

    await page.waitForFunction('game.levelCompleting || game.inWorldMap || !game.gameStarted', { timeout: 120000 });
    await new Promise(r => setTimeout(r, 2200)); // capturar el cartel de "SECTOR COMPLETADO"

    const base64 = await page.evaluate(() => new Promise(resolve => {
        clearInterval(window.__bot);
        window.__rec.onstop = async () => {
            const blob = new Blob(window.__chunks, { type: 'video/webm' });
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let bin = '';
            for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
            resolve(btoa(bin));
        };
        window.__rec.stop();
    }));

    fs.writeFileSync(out, Buffer.from(base64, 'base64'));
    console.log(`gameplay-${hero}.webm (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB) — ${cfg.note}`);
    await page.close();
}

(async () => {
    const arg = process.argv[2];
    const heroes = arg ? [arg] : Object.keys(SHOWCASES);
    if (arg && !SHOWCASES[arg]) { console.error(`Piloto desconocido: ${arg} (usa ${Object.keys(SHOWCASES).join('|')})`); process.exit(1); }
    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: 'new',
        args: ['--mute-audio', '--window-size=1400,900']
    });
    for (const hero of heroes) await record(browser, hero);
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
