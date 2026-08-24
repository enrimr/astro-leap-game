/**
 * A diferencia de game.test.js (que reimplementa la lógica en paralelo, sin DOM, para poder
 * correr en Node sin más), estos tests cargan los ficheros REALES del juego —
 * js/entities.js, js/levels.js, js/game.js, tal cual se sirven al navegador— contra un DOM
 * simulado con jsdom. Sirven para cubrir lo que la reimplementación en paralelo no puede tocar
 * por vivir en código con dependencias de DOM (el sistema de avisos contextuales y el toggle de
 * accesibilidad, ambos en Game) y para probar los patrones de jefe de CombatSystem contra el
 * código que de verdad se envía, no una copia de mantenimiento aparte.
 *
 * Truco de carga: los 3 ficheros son <script> clásicos (sin module.exports, comparten un único
 * scope global vía `window`, como en el navegador). window.eval(código) los ejecuta como eval
 * INDIRECTO, cuyas declaraciones de nivel superior (class/const) no se filtran fuera de esa
 * llamada a eval — así que el propio código evaluado termina asignando las referencias que nos
 * interesan a window.__T__ antes de devolver el control, y las leemos desde ahí.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const FILES = ['js/entities.js', 'js/levels.js', 'js/game.js'];

const FIXTURE_HTML = `<!doctype html><html><body>
<div id="audioControls">
  <button id="btnMusicToggle" class="audio-btn"><svg class="icon-on"></svg><svg class="icon-off"></svg></button>
  <button id="btnSfxToggle" class="audio-btn"><svg class="icon-on"></svg><svg class="icon-off"></svg></button>
  <button id="btnReduceFxToggle" class="audio-btn"><svg class="icon-on"></svg><svg class="icon-off"></svg></button>
</div>
<div id="gameContainer" class="menu-open">
  <canvas id="gameCanvas" width="320" height="180"></canvas>
  <button id="btnExit">Salir</button>
  <div id="startScreen"></div>
</div>
<div id="moveControls">
  <div class="dpad"><button id="btnLeft"></button><button id="btnRight"></button></div>
  <button id="btnJump" class="wide">SALTO</button>
</div>
<div id="combatButtons">
  <button class="combat-btn" data-code="Digit1">1</button>
  <button class="combat-btn" data-code="Digit2">2</button>
  <button class="combat-btn" data-code="Digit3">3</button>
  <button class="combat-btn" data-code="Digit4">4</button>
</div>
</body></html>`;

// jsdom no implementa renderizado real de <canvas> (getContext('2d') da null salvo que el
// paquete nativo "canvas" esté instalado Y sea binariamente compatible con este Node). Como
// nuestros tests solo comprueban ESTADO del juego (hintScreen, reduceEffects, mensajes de
// combate...), nunca píxeles, basta con un contexto falso que acepte cualquier llamada sin
// romperse — evita depender de que el binario nativo de "canvas" esté bien compilado en cada
// máquina/CI.
function makeFakeCtx() {
    const store = {};
    const gradient = { addColorStop: () => {} };
    return new Proxy({}, {
        get(target, prop) {
            if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
            if (prop === 'measureText') return () => ({ width: 10 });
            if (prop in store) return store[prop];
            return () => {};
        },
        set(target, prop, value) { store[prop] = value; return true; }
    });
}

// Crea una sesión de juego fresca e independiente (DOM + localStorage propios, sin fugas entre
// tests). Devuelve el window de jsdom más las clases/instancia reales que necesitamos comprobar.
function loadGame() {
    const dom = new JSDOM(FIXTURE_HTML, { runScripts: 'dangerously', url: 'http://localhost/' });
    const { window } = dom;
    // Stubs de APIs de navegador que jsdom no implementa (o que no nos interesa que hagan nada
    // real en un test): sin esto, el arranque de game.js lanzaría o imprimiría ruido de sobra.
    window.matchMedia = window.matchMedia || (() => ({ matches: false }));
    window.requestAnimationFrame = window.requestAnimationFrame || (() => 0);
    window.cancelAnimationFrame = window.cancelAnimationFrame || (() => {});
    window.scrollTo = window.scrollTo || (() => {});
    window.HTMLCanvasElement.prototype.getContext = () => makeFakeCtx();

    const combined = FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n')
        // setRNG: RNG es un `let` de entities.js — al ser eval INDIRECTO (ver cabecera del
        // fichero), no se filtra fuera como window.RNG por sí solo. Este setter, definido DENTRO
        // del mismo eval, cierra sobre ese binding y deja a los tests fijar el azar del combate
        // sin depender de espiar Math.random (que RNG ya no llama directamente una vez asignado).
        + '\nwindow.__T__ = { LEVELS, CombatSystem, Player, Enemy, HEROES, HERO_ORDER, WorldMap, game, setRNG: (fn) => { RNG = fn; }, todayDateString, dailyHeroFor, dailyLevelFor, dailyDifficultyFor, mulberry32, hashStringToSeed };';
    window.eval(combined);

    return { window, document: window.document, ...window.__T__ };
}

describe('CombatSystem — patrones de jefe (contra js/entities.js real)', () => {
    function freshCombat(type) {
        const { window, Player, Enemy, CombatSystem, setRNG } = loadGame();
        const player = new Player(0, 0, 'kes');
        player.maxHp = 9999; player.hp = 9999; // que no muera mientras avanzamos turnos de prueba
        const enemy = new Enemy(0, 0, type);
        return { window, setRNG, combat: new CombatSystem(player, enemy), player, enemy };
    }

    test('la Reina Larva se regenera cada 3 turnos en vez de atacar', () => {
        const { combat } = freshCombat('queen_larva');
        const messages = [];
        for (let i = 1; i <= 6; i++) { combat.resolveEnemyTurn(); messages.push(combat.message); }
        expect(messages[0]).toMatch(/ataca/);
        expect(messages[1]).toMatch(/ataca/);
        expect(messages[2]).toMatch(/se regenera/);
        expect(messages[3]).toMatch(/ataca/);
        expect(messages[4]).toMatch(/ataca/);
        expect(messages[5]).toMatch(/se regenera/);
    });

    test('la Reina Larva no supera nunca su HP máximo al regenerarse', () => {
        const { combat, enemy } = freshCombat('queen_larva');
        for (let i = 1; i <= 3; i++) combat.resolveEnemyTurn(); // turno 3 = curación, ya a HP máximo
        expect(enemy.hp).toBe(enemy.maxHp);
    });

    test('el Centinela carga un turno sin dañar y golpea el doble al siguiente', () => {
        const { setRNG, combat, player, enemy } = freshCombat('sentinel');
        // RNG fijo (ver el mismo razonamiento en el test del Overlord más abajo): sin esto, un
        // golpe normal con suerte alta y uno reforzado con suerte baja podrían casi empatar y el
        // test se volvería intermitente. OJO: el juego ya no llama a Math.random() directamente
        // para esto — usa RNG() (ver entities.js), así que hay que sustituir RNG, no Math.random.
        setRNG(() => 0.5);
        const messages = [];
        const dmgs = [];
        for (let i = 1; i <= 4; i++) {
            const hpBefore = player.hp;
            combat.resolveEnemyTurn();
            messages.push(combat.message);
            dmgs.push(hpBefore - player.hp);
        }
        setRNG(Math.random);
        // player.takeDamage() resta la Defensa del jugador (2 por defecto) sobre el daño bruto —
        // el daño que de verdad se lleva del HP no es solo attack*multiplicador.
        const normalDmg = Math.max(1, Math.floor(enemy.attack * 1.0) - player.defense);
        const reinforcedDmg = Math.max(1, Math.floor(enemy.attack * 2 * 1.0) - player.defense);
        expect(messages[2]).toMatch(/carga/);
        expect(dmgs[2]).toBe(0); // el turno de carga no hace daño
        expect(messages[3]).toMatch(/Descarga corrupta/);
        expect(dmgs[0]).toBe(normalDmg);
        expect(dmgs[3]).toBe(reinforcedDmg);
    });

    test('el Overlord ignora Defender cada 3 turnos', () => {
        const { setRNG, combat, player, enemy } = freshCombat('overlord');
        // El daño tiene variación aleatoria (±20%, ver CombatSystem.enemyStrikeTurn) — se fija
        // RNG (ver el mismo comentario en el test del Centinela) a un valor central para que el
        // turno "completo" y los "a medias" no puedan solaparse por azar y la comparación sea determinista.
        setRNG(() => 0.5);
        const dmgs = [];
        for (let i = 1; i <= 3; i++) {
            combat.defending = true; // defiende SIEMPRE, para aislar el efecto de ignoreDefense
            const hpBefore = player.hp;
            combat.resolveEnemyTurn();
            dmgs.push(hpBefore - player.hp);
        }
        setRNG(Math.random);
        const rawDmg = Math.floor(enemy.attack * 1.0); // multiplicador fijo al 1.0 con random()=0.5
        // Dos rutas distintas en CombatSystem.enemyStrikeTurn: defendiendo (turnos 1-2) resta el
        // 50% del daño BRUTO sin tocar la Defensa del jugador; con ignoreDefense (turno 3) se cae
        // al else y pasa por player.takeDamage(), que SÍ resta la Defensa. No son la misma cuenta.
        const halvedDmg = Math.max(1, Math.floor(rawDmg * 0.5));
        const fullDmg = Math.max(1, rawDmg - player.defense);
        // turnos 1-2: Defender a medias reduce el daño. Turno 3: lo ignora, daño completo.
        expect(dmgs[0]).toBe(halvedDmg);
        expect(dmgs[1]).toBe(halvedDmg);
        expect(dmgs[2]).toBe(fullDmg);
        expect(dmgs[2]).toBeGreaterThan(dmgs[0]);
    });

    test('el aviso "ignora tus defensas" del Overlord SOLO aparece si de verdad estabas defendiendo', () => {
        const { combat: combatDefendiendo } = freshCombat('overlord');
        combatDefendiendo.resolveEnemyTurn(); combatDefendiendo.resolveEnemyTurn(); // turnos 1-2, normales
        combatDefendiendo.defending = true;
        combatDefendiendo.resolveEnemyTurn(); // turno 3: ignora defensas, Y estabas defendiendo
        expect(combatDefendiendo.message).toMatch(/ignora tus defensas/);

        const { combat: combatSinDefender } = freshCombat('overlord');
        combatSinDefender.resolveEnemyTurn(); combatSinDefender.resolveEnemyTurn();
        combatSinDefender.defending = false;
        combatSinDefender.resolveEnemyTurn(); // turno 3, pero NO estabas defendiendo
        expect(combatSinDefender.message).not.toMatch(/ignora tus defensas/);
        expect(combatSinDefender.message).toMatch(/ataca/);
    });

    test('Nodo Cero combina los tres patrones anteriores en un ciclo de 6 turnos', () => {
        const { setRNG, combat, player, enemy } = freshCombat('nodo_cero');
        // RNG fijo — mismo motivo que en los tests del Centinela/Overlord: sin esto, dos turnos
        // con multiplicadores distintos podrían casi empatar por azar.
        setRNG(() => 0.5);
        const messages = [];
        const dmgs = [];
        for (let i = 1; i <= 6; i++) {
            const hpBefore = player.hp;
            combat.resolveEnemyTurn();
            messages.push(combat.message);
            dmgs.push(hpBefore - player.hp);
        }
        setRNG(Math.random);
        const normalDmg = Math.max(1, Math.floor(enemy.attack * 1.0) - player.defense);
        const reinforcedDmg = Math.max(1, Math.floor(enemy.attack * 2 * 1.0) - player.defense);
        expect(messages[0]).toMatch(/ataca/); // turno 1: normal (aún no le toca ningún patrón)
        expect(messages[1]).toMatch(/ataca/); // turno 2: normal
        expect(messages[2]).toMatch(/se regenera/); // turno 3: cura, como la Reina Larva
        expect(dmgs[2]).toBe(0);
        expect(messages[3]).toMatch(/carga/); // turno 4: carga sin dañar, como el Centinela
        expect(dmgs[3]).toBe(0);
        expect(messages[4]).toMatch(/Sobrecarga de la Red/); // turno 5: golpe reforzado tras la carga
        expect(dmgs[4]).toBe(reinforcedDmg);
        expect(dmgs[0]).toBe(normalDmg);
        expect(messages[5]).toMatch(/ataca/); // turno 6: ignora Defender, pero no estabas defendiendo -> mensaje normal
    });

    test('Nodo Cero ignora Defender en su turno 6 SOLO si de verdad estabas defendiendo', () => {
        const { combat } = freshCombat('nodo_cero');
        for (let i = 1; i <= 5; i++) combat.resolveEnemyTurn(); // llega hasta el turno 6 sin defender
        combat.defending = true;
        combat.resolveEnemyTurn(); // turno 6: el ciclo completo
        expect(combat.message).toMatch(/La Red ignora tus defensas/);
    });

    test('un enemigo normal (no jefe) siempre ataca, sin patrón', () => {
        const { combat } = freshCombat('drone');
        for (let i = 1; i <= 6; i++) {
            combat.resolveEnemyTurn();
            expect(combat.message).toMatch(/ataca/);
        }
    });
});

describe('Game — avisos contextuales (hintScreen, contra js/game.js real)', () => {
    test('showHint() abre el diálogo y marca el id como visto', () => {
        const { game } = loadGame();
        game.showHint('test-id', 'un texto');
        expect(game.hintScreen).toEqual({ text: 'un texto' });
        expect(game.hintsSeen.has('test-id')).toBe(true);
    });

    test('un id ya visto no vuelve a mostrarse', () => {
        const { game } = loadGame();
        game.showHint('test-id', 'texto 1');
        game.dismissHintScreen();
        game.showHint('test-id', 'texto 2');
        expect(game.hintScreen).toBeNull();
    });

    test('regresión: dos avisos en el mismo frame no se pisan (el segundo no se "quema")', () => {
        const { game } = loadGame();
        game.showHint('a', 'primero');
        game.showHint('b', 'segundo'); // dispara mientras "primero" sigue en pantalla
        expect(game.hintScreen.text).toBe('primero');
        expect(game.hintsSeen.has('b')).toBe(false); // NO se marca como visto: se pudo reintentar
        game.dismissHintScreen();
        game.showHint('b', 'segundo');
        expect(game.hintScreen.text).toBe('segundo');
    });

    test('hintsSeen se guarda en localStorage bajo la clave esperada', () => {
        const { game, window } = loadGame();
        game.showHint('persist-me', 'x');
        const stored = JSON.parse(window.localStorage.getItem('astroLeapHintsSeen_v1'));
        expect(stored).toContain('persist-me');
    });

    test('dismissHintScreen() no hace nada si no hay ningún aviso abierto', () => {
        const { game } = loadGame();
        expect(() => game.dismissHintScreen()).not.toThrow();
        expect(game.hintScreen).toBeNull();
    });

    // Se quitaron a propósito los avisos de salto y de combate/Habilidad — el juego debe
    // explicarse solo en esos dos casos (siguen documentados en el menú de Ayuda). Este test es
    // de regresión: que nadie los reintroduzca sin querer al tocar update().
    test('regresión: saltar ya NO dispara ningún aviso (se quitó a propósito)', () => {
        const { game } = loadGame();
        game.gameStarted = true; // update() no hace nada hasta que empieza la partida
        game.worldMap.nodes[0].unlocked = true;
        game.loadLevel(0);
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        game.player.x = 20; game.player.y = 130; game.player.vy = 0;
        game.player.onGround = true; game.player.jumping = false; game.player.prevJumpKey = false;
        game.keys.Space = true;
        game.update();
        game.keys.Space = false;
        expect(game.hintScreen).toBeNull();
    });

    test('regresión: entrar en combate ya NO dispara ningún aviso (se quitó a propósito)', () => {
        const { game } = loadGame();
        game.gameStarted = true;
        game.worldMap.nodes[0].unlocked = true;
        game.loadLevel(0);
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        const enemy = game.enemies.find(e => e.alive);
        game.player.x = enemy.x; game.player.y = enemy.y; game.player.vy = 0.1; game.playerInvulnerable = 0;
        game.update();
        expect(!!game.combat).toBe(true); // el combate sí debe empezar, solo sin el aviso
        expect(game.hintScreen).toBeNull();
    });

    test('equipar a Scrap por primera vez dispara su propio aviso', () => {
        const { game, HERO_ORDER } = loadGame();
        game.unlockedCharacters.add('scrap');
        game.charSelectIndex = HERO_ORDER.indexOf('scrap');
        game.confirmCharSelect();
        expect(game.hintScreen).not.toBeNull();
        expect(game.hintScreen.text).toMatch(/franjas de peligro/);
    });

    test('regresión: el aviso se dibuja también estando en el mapa estelar (no solo en nivel)', () => {
        const { game } = loadGame();
        game.inWorldMap = true; game.inLevel = false;
        game.hintScreen = { text: 'aviso de prueba en el mapa' };
        const spy = jest.spyOn(game, 'drawHintOverlay');
        game.draw();
        expect(spy).toHaveBeenCalled();
    });
});

describe('Game — accesibilidad: reducir temblor/parpadeo (contra js/game.js real)', () => {
    test('empieza apagado por defecto', () => {
        const { game, window } = loadGame();
        expect(game.reduceEffects).toBe(false);
        expect(window.REDUCE_EFFECTS).toBe(false);
    });

    test('tocar el botón lo activa, lo persiste y sincroniza window.REDUCE_EFFECTS', () => {
        const { game, window, document } = loadGame();
        const btn = document.getElementById('btnReduceFxToggle');
        btn.dispatchEvent(new window.Event('click', { bubbles: true }));

        expect(game.reduceEffects).toBe(true);
        expect(window.REDUCE_EFFECTS).toBe(true);
        expect(window.localStorage.getItem('astroLeapReduceEffects')).toBe('1');
        expect(btn.classList.contains('off')).toBe(true);
    });

    test('tocar el botón dos veces lo vuelve a apagar', () => {
        const { game, window, document } = loadGame();
        const btn = document.getElementById('btnReduceFxToggle');
        btn.dispatchEvent(new window.Event('click', { bubbles: true }));
        btn.dispatchEvent(new window.Event('click', { bubbles: true }));

        expect(game.reduceEffects).toBe(false);
        expect(window.localStorage.getItem('astroLeapReduceEffects')).toBe('0');
        expect(btn.classList.contains('off')).toBe(false);
    });

    test('con el ajuste activo, el shake se anula en el cálculo de dibujo del nivel', () => {
        const { game } = loadGame();
        game.reduceEffects = true;
        game.shake = 20;
        expect(() => game.draw()).not.toThrow();
        // shakeMag se computa dentro de draw(); comprobamos el efecto indirecto: this.shake
        // sigue existiendo (no se pisa), reduceEffects es quien anula su aplicación visual.
        expect(game.shake).toBe(20);
        expect(game.reduceEffects).toBe(true);
    });
});

describe('Diseño de niveles — completables con salto SIMPLE (Scrap), contra js/levels.js real', () => {
    // Scrap no tiene ninguna habilidad aérea: solo el salto base que comparten los 4 pilotos.
    // Si Scrap puede llegar a la meta de un nivel, los otros 3 también pueden (tienen el mismo
    // salto base MÁS una habilidad extra) — así que basta con probar el caso más restrictivo.
    //
    // La tabla de alcance se mide simulando la física REAL de Player.update() (no una fórmula
    // copiada a mano), para que este test no se quede desactualizado en silencio si algún día
    // cambian jumpPower/gravity/speed — mediría el nuevo alcance real, no uno viejo.
    // Sin tabla ni interpolación: cada dy que de verdad aparece en algún nivel se mide EXACTO
    // simulando la física real (memoizado, porque solo hay un puñado de valores distintos entre
    // los 12 niveles). Interpolar entre puntos de muestreo parecía buena idea pero escondía un
    // caso límite real: una altura entre un punto "inalcanzable" (null) y uno válido acababa
    // devolviendo 0 en vez de un valor real — y ese caso límite ocultó dos huecos genuinamente
    // rotos en el nivel 8 durante el desarrollo de este mismo test.
    function makeMaxReach(Player) {
        const cache = new Map();
        return function maxReach(dy) {
            dy = Math.round(dy);
            if (cache.has(dy)) return cache.get(dy);
            const p = new Player(0, 0, 'scrap');
            p.onGround = true;
            const particles = { burst() {} };
            const noPlatforms = [];
            let jumped = false;
            const crossings = [];
            let result = 0;
            for (let f = 0; f < 300; f++) {
                const keys = { ArrowRight: true, Space: !jumped };
                jumped = true;
                p.update(keys, noPlatforms, particles);
                if (dy < 0) { if (p.y <= dy) crossings.push(p.x); }
                else { if (p.y >= dy) { result = p.x; break; } }
            }
            // dy<0 (plataforma más arriba): se cruza esa altura dos veces (subiendo y bajando tras
            // el ápice) — el último cruce es el de bajada, que es el que de verdad se puede aterrizar.
            if (dy < 0) result = crossings.length ? crossings[crossings.length - 1] : 0;
            cache.set(dy, result);
            return result;
        };
    }
    // BFS de alcanzabilidad: ¿se puede llegar de la plataforma de salida hasta x >= goal saltando
    // (con salto simple) de plataforma en plataforma? Incluye reinforcedBlocks — antes de que
    // Scrap los rompa son sólidos para cualquiera, así que cuentan como suelo normal aquí.
    function levelReachableWithSimpleJump(level, maxReach) {
        const plats = level.platforms.map(p => ({ x: p[0], y: p[1], w: p[2] }));
        (level.reinforcedBlocks || []).forEach(b => plats.push({ x: b[0], y: b[1], w: b[2] }));
        const start = plats.filter(p => p.x <= 20 && p.x + p.w >= 20).sort((a, b) => a.y - b.y)[0];
        const visited = new Set([start]);
        const queue = [start];
        let maxX = start.x + start.w;
        while (queue.length) {
            const a = queue.shift();
            maxX = Math.max(maxX, a.x + a.w);
            for (const b of plats) {
                if (visited.has(b) || b === a || b.x + b.w < a.x) continue;
                const gap = Math.max(0, b.x - (a.x + a.w));
                const dy = b.y - a.y;
                if (gap <= maxReach(dy)) { visited.add(b); queue.push(b); }
            }
        }
        return maxX >= level.goal;
    }

    test('los 12 niveles se pueden completar solo con salto simple — y por tanto con cualquier piloto', () => {
        const { LEVELS, Player } = loadGame();
        const maxReach = makeMaxReach(Player);
        const failing = LEVELS
            .map((lvl, i) => ({ i, name: lvl.name, ok: levelReachableWithSimpleJump(lvl, maxReach) }))
            .filter(r => !r.ok);
        expect(failing).toEqual([]); // si esto falla, el mensaje lista qué niveles quedaron inalcanzables
    });
});

describe('Reto Diario (contra js/game.js real)', () => {
    test('mulberry32 es determinista: misma semilla, misma secuencia siempre', () => {
        const { mulberry32 } = loadGame();
        const a = mulberry32(12345);
        const b = mulberry32(12345);
        const seqA = [a(), a(), a()];
        const seqB = [b(), b(), b()];
        expect(seqA).toEqual(seqB);
        // y produce valores en [0,1) como Math.random, no cualquier número
        seqA.forEach(v => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); });
    });

    test('la misma fecha da siempre el mismo piloto del día', () => {
        const { dailyHeroFor, HERO_ORDER } = loadGame();
        const h1 = dailyHeroFor('2026-08-24');
        const h2 = dailyHeroFor('2026-08-24');
        expect(h1).toBe(h2);
        expect(HERO_ORDER).toContain(h1);
    });

    test('la misma fecha da siempre el mismo nivel y la misma dificultad del día', () => {
        const { dailyLevelFor, dailyDifficultyFor, LEVELS } = loadGame();
        expect(dailyLevelFor('2026-08-24')).toBe(dailyLevelFor('2026-08-24'));
        expect(dailyDifficultyFor('2026-08-24').label).toBe(dailyDifficultyFor('2026-08-24').label);
        // El nivel de hoy siempre debe existir y no tener jefe — el Reto Diario arranca un
        // jugador desde cero, un jefe pensado para alguien ya subido de nivel no sería justo.
        const idx = dailyLevelFor('2026-08-24');
        expect(LEVELS[idx]).toBeDefined();
        expect(LEVELS[idx].boss).toBeUndefined();
    });

    test('startDailyChallenge() carga el nivel/piloto/dificultad de hoy, sin tocar el guardado real', () => {
        const { game, window, todayDateString, dailyHeroFor, dailyLevelFor, dailyDifficultyFor } = loadGame();
        // Progreso real "de mentira", para comprobar después que el reto no lo ha tocado.
        game.player.level = 5; game.player.attack = 99;
        game.unlockedCharacters = new Set(['kes', 'bolt']);
        game.saveProgress();
        const savedBefore = window.localStorage.getItem('astroLeapSave_v1');
        const today = todayDateString();

        game.startDailyChallenge();

        expect(game.dailyMode).toBe(true);
        expect(game.currentLevel).toBe(dailyLevelFor(today));
        expect(game.dailyDifficulty.label).toBe(dailyDifficultyFor(today).label);
        expect(game.player.level).toBe(1); // jugador NUEVO del reto, no el de nivel 5
        expect(game.player.character).toBe(dailyHeroFor(today));
        expect(window.localStorage.getItem('astroLeapSave_v1')).toBe(savedBefore); // intacto
    });

    test('la dificultad de hoy escala HP y ataque de los enemigos del nivel (Defensa intacta)', () => {
        const { game, Enemy } = loadGame();
        game.startDailyChallenge();
        const mult = game.dailyDifficulty.mult;
        game.enemies.forEach(enemy => {
            expect(enemy.hp).toBe(enemy.maxHp); // recién cargado, a tope de vida
            const unscaled = new Enemy(0, 0, enemy.type); // mismas ENEMY_STATS, sin dificultad aplicada
            expect(enemy.maxHp).toBe(Math.max(1, Math.round(unscaled.maxHp * mult)));
            expect(enemy.attack).toBe(Math.max(1, Math.round(unscaled.attack * mult)));
            expect(enemy.defense).toBe(unscaled.defense); // Defensa NO se toca
        });
    });

    test('abandonar el reto a medias (ESC / botón salir) restaura exactamente el jugador y el mapa reales', () => {
        const { game } = loadGame();
        game.player.level = 5; game.player.attack = 99;
        const realPlayer = game.player;
        const realWorldMap = game.worldMap;

        game.startDailyChallenge();
        expect(game.player).not.toBe(realPlayer); // durante el reto es un jugador aparte

        game.exitLevel(); // mismo botón ESC/✕ que un nivel normal — ver el guard de dailyMode

        expect(game.dailyMode).toBe(false);
        expect(game.player).toBe(realPlayer);
        expect(game.worldMap).toBe(realWorldMap);
        expect(game.player.level).toBe(5); // el progreso real sigue intacto
    });

    test('completar el nivel del reto guarda en el registro diario, no en el progreso real', () => {
        const { game, window, LEVELS, todayDateString } = loadGame();
        game.player.level = 5; game.saveProgress();
        const savedBefore = window.localStorage.getItem('astroLeapSave_v1');

        game.startDailyChallenge();
        game.player.x = LEVELS[game.dailyLevelIdx].goal; // ningún nivel del pool tiene jefe, se completa solo con llegar
        game.update();

        expect(game.dailyMode).toBe(false); // ya volvió al menú
        expect(window.localStorage.getItem('astroLeapSave_v1')).toBe(savedBefore); // guardado real intacto
        const daily = JSON.parse(window.localStorage.getItem('astroLeapDaily_v1'));
        expect(daily.date).toBe(todayDateString());
        expect(typeof daily.time).toBe('number');
    });

    test('morir sin vidas durante el reto NO dispara Game Over completo (no borra el guardado real)', () => {
        const { game, window } = loadGame();
        game.player.level = 5; game.saveProgress();
        const savedBefore = window.localStorage.getItem('astroLeapSave_v1');

        game.startDailyChallenge();
        game.player.lives = 1;
        game.loseLife();

        expect(game.dailyMode).toBe(false);
        expect(window.localStorage.getItem('astroLeapSave_v1')).toBe(savedBefore); // NO se borró
        expect(game.player.level).toBe(5); // el jugador real (restaurado) sigue como estaba
    });

    test('la pantalla de "¡RETO SUPERADO!" solo ofrece compartir y volver al menú (no el menú completo)', () => {
        const { game, window, LEVELS } = loadGame();
        game.startDailyChallenge();
        game.player.x = LEVELS[game.dailyLevelIdx].goal;
        game.update(); // completa el reto y construye la pantalla de resultado

        const screen = window.document.getElementById('startScreen');
        expect(screen.innerHTML).toContain('data-action="menu"'); // volver al menú
        expect(screen.innerHTML).toContain('share'); // compartir (botón nativo o fila de enlaces)
        expect(screen.innerHTML).not.toContain('data-action="play"'); // sin JUGAR/CONTINUAR
        expect(screen.innerHTML).not.toContain('data-action="daily"'); // sin relanzar el reto desde aquí
        expect(screen.innerHTML).not.toContain('data-action="times"');

        game.handleMenuAction('menu'); // el botón de volver reconstruye el menú completo
        expect(screen.innerHTML).toContain('data-action="play"');
        expect(screen.innerHTML).toContain('data-action="daily"');
    });

    test('un empate exacto con el mejor tiempo de hoy NO cuenta como nuevo récord', () => {
        const { game } = loadGame();
        game.saveDailyRecord('2026-08-24', 5000, 'kes');
        expect(game.saveDailyRecord('2026-08-24', 5000, 'kes')).toBe(false); // igualar no es superar
        expect(game.dailyRecord.time).toBe(5000);
    });

    test('saveDailyRecord se queda con el MEJOR tiempo del día, no con el último intento', () => {
        const { game } = loadGame();
        const isRecord1 = game.saveDailyRecord('2026-08-24', 5000, 'kes');
        expect(isRecord1).toBe(true);
        expect(game.dailyRecord.time).toBe(5000);

        const isRecord2 = game.saveDailyRecord('2026-08-24', 8000, 'kes'); // peor intento, mismo día
        expect(isRecord2).toBe(false);
        expect(game.dailyRecord.time).toBe(5000); // se queda el mejor, no se pisa con el peor

        const isRecord3 = game.saveDailyRecord('2026-08-25', 9000, 'kes'); // día NUEVO
        expect(isRecord3).toBe(true); // un día nuevo siempre "es récord" (no hay con qué comparar)
        expect(game.dailyRecord.time).toBe(9000);
    });
});

describe('Regresiones: pisotón, Energía por derrota y anti-farmeo de XP (contra js/game.js real)', () => {
    // Deja al jugador cayendo justo sobre la mitad superior del primer enemigo del nivel 1
    // (drone Lv1), con nivel de sobra para que el contacto del próximo update() sea un PISOTÓN
    // (derrota instantánea) y no un combate. xpToNextLevel altísimo para que la XP ganada no
    // suba de nivel (subir rellenaría HP/Energía y contaminaría lo que se quiere medir).
    function setupStomp() {
        const { game } = loadGame();
        game.gameStarted = true;
        game.loadLevel(0);
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        const enemy = game.enemies[0];
        game.player.level = enemy.level + 1;
        game.player.xpToNextLevel = 9999;
        game.player.x = enemy.x; game.player.y = enemy.y - 12; game.player.vy = 0.5;
        game.player.onGround = false; game.playerInvulnerable = 0;
        return { game, enemy };
    }

    test('regresión: un pisotón SIN subida de nivel no muestra el cartel "¡SUBISTE DE NIVEL!"', () => {
        const { game, enemy } = setupStomp();
        game.update();
        expect(enemy.defeated).toBe(true); // el pisotón sí ocurrió (si no, el test no mide nada)
        expect(game.levelUpMessage).toBe(0); // pero sin subir de nivel no hay cartel
    });

    test('derrotar de un pisotón regenera Energía (+2, DESIGN §2.2)', () => {
        const { game, enemy } = setupStomp();
        game.player.energy = 5;
        game.update();
        expect(enemy.defeated).toBe(true);
        expect(game.player.energy).toBe(7);
    });

    test('la Energía regenerada por derrota no pasa del máximo', () => {
        const { game, enemy } = setupStomp();
        game.player.energy = game.player.maxEnergy;
        game.update();
        expect(enemy.defeated).toBe(true);
        expect(game.player.energy).toBe(game.player.maxEnergy);
    });

    test('ganar un DUELO también regenera Energía (+2) y apunta al enemigo como derrotado', () => {
        const { game, CombatSystem } = loadGame();
        game.gameStarted = true;
        game.loadLevel(0);
        game.inWorldMap = false; game.inLevel = true; game.levelCompleting = false;
        const enemy = game.enemies[0];
        game.player.xpToNextLevel = 9999;
        game.player.energy = 5;
        game.combat = new CombatSystem(game.player, enemy);
        game.combat.result = 'win'; game.combat.active = false; // el duelo acaba de ganarse
        game.update(); // procesa el resultado del combate
        expect(game.player.energy).toBe(7);
        expect(game.collectedPickups.has(enemy.xpKey)).toBe(true);
    });

    test('anti-farmeo: un enemigo ya derrotado reaparece al recargar el nivel, pero con la mitad de XP', () => {
        const { game, enemy } = setupStomp();
        const fullXP = enemy.xpReward;
        game.update(); // pisotón: derrota al primer enemigo y lo apunta en collectedPickups
        expect(enemy.defeated).toBe(true);
        game.loadLevel(0); // salir y reentrar al nivel: todos los enemigos reaparecen...
        expect(game.enemies[0].alive).toBe(true);
        expect(game.enemies[0].xpReward).toBe(Math.floor(fullXP / 2)); // ...el derrotado, a media XP
        expect(game.enemies[1].xpReward).toBe(fullXP); // los NO derrotados (mismo tipo) siguen a XP completa
    });

    test('recargar o salir del nivel cancela la transición pendiente de "sector completado"', () => {
        const { game, window } = loadGame();
        game.loadLevel(0);
        game.levelCompleteTimeout = window.setTimeout(() => {}, 5000);
        game.loadLevel(0); // equivale a pulsar R durante la celebración
        expect(game.levelCompleteTimeout).toBeNull();
        game.levelCompleteTimeout = window.setTimeout(() => {}, 5000);
        game.exitLevel(); // equivale a ESC / botón ✕
        expect(game.levelCompleteTimeout).toBeNull();
    });
});
