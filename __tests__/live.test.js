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
        + '\nwindow.__T__ = { LEVELS, CombatSystem, Player, Enemy, Platform, MovingPlatform, EnergyBeam, HEROES, HERO_ORDER, WorldMap, game, setRNG: (fn) => { RNG = fn; }, todayDateString, dailyHeroFor, dailyLevelFor, dailyDifficultyFor, mulberry32, hashStringToSeed };';
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
        expect(game.combatTransition).not.toBeNull(); // arranca la transición de encuentro...
        for (let i = 0; i < 80; i++) game.update(); // ...y al terminar, el combate de verdad
        expect(!!game.combat).toBe(true);
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

    test('toda bóveda bajo un refuerzo tiene suelo SÓLIDO que recoja al jugador (y salida de un salto)', () => {
        // Sin suelo, romper el refuerzo mata a Scrap en plena recogida (premio y castigo se
        // anulan) y deja el agujero como pozo mortal permanente para cualquier piloto. Y debe
        // ser sólido de verdad (ni frágil ni cinta): Scrap no tiene habilidad aérea con la que
        // recuperarse si el suelo de la cámara del tesoro desaparece bajo sus pies.
        const { LEVELS } = loadGame();
        const missing = [];
        LEVELS.forEach((lvl, i) => (lvl.reinforcedBlocks || []).forEach(([bx, by, bw]) => {
            const floor = lvl.platforms.find(p =>
                p[1] > by && p[1] - by <= 24 // debajo, pero a tiro de un salto simple (~29) para salir
                && p[0] <= bx && p[0] + p[2] >= bx + bw // cubre el agujero entero: nada se cuela al vacío
                && !p[4]); // sin variante especial: suelo normal y sólido
            if (!floor) missing.push(`${lvl.name} (refuerzo en x=${bx})`);
        }));
        expect(missing).toEqual([]);
    });

    test('regla de diseño: los dos huecos del set piece de hielo (nivel 2) NO se cruzan sin carrerilla', () => {
        // Si algún día crece jumpPower/speed, este test avisa de que el set piece del nivel 2
        // deja de serlo (el salto normal cruzaría gratis, sin necesitar el deslizamiento).
        const { LEVELS, Player } = loadGame();
        const maxReach = makeMaxReach(Player);
        const lvl = LEVELS[1]; // Grietas de Hielo
        // Hueco 1: pista de despegue → islote de la cápsula
        const runway = lvl.platforms.find(p => p[0] === 600 && p[1] === 150);
        const island = lvl.platforms.find(p => p[0] === 782 && p[1] === 130);
        expect(runway).toBeDefined();
        expect(island).toBeDefined();
        expect(island[0] - (runway[0] + runway[2])).toBeGreaterThan(maxReach(island[1] - runway[1]));
        // Hueco 2 (el salto final, aún más ancho): meseta → plataforma de la BASE
        const runway2 = lvl.platforms.find(p => p[0] === 862 && p[1] === 150);
        const basePlat = lvl.platforms.find(p => p[0] === 1010 && p[1] === 150);
        expect(runway2).toBeDefined();
        expect(basePlat).toBeDefined();
        const finalGap = basePlat[0] - (runway2[0] + runway2[2]);
        expect(finalGap).toBeGreaterThan(maxReach(0));
        // Y de verdad es el más ancho de los dos — es el bis, no una repetición literal
        expect(finalGap).toBeGreaterThan(island[0] - (runway[0] + runway[2]));
    });

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

describe('Hielo resbaladizo (contra js/entities.js real)', () => {
    // Suelo largo del variant pedido + jugador ya de pie encima, con groundPlatform preasignado
    // (en el juego real lo asigna el snap de aterrizaje del frame anterior).
    function onFloor(variant, character = 'kes') {
        const { Player, Platform, LEVELS } = loadGame();
        const floor = new Platform(0, 150, 400, 15, variant);
        const p = new Player(20, 137, character);
        p.onGround = true; p.groundPlatform = floor;
        const particles = { burst() {} };
        return { p, floor, particles, Player, Platform, LEVELS };
    }

    test('sobre hielo, mantener la dirección coge carrerilla por encima de la velocidad base', () => {
        const { p, floor, particles } = onFloor('ice');
        for (let f = 0; f < 90; f++) p.update({ ArrowRight: true }, [floor], particles);
        expect(p.vx).toBeGreaterThan(2.3); // muy por encima de speed (1.55), cerca de ICE_MAX_SPEED (2.6)
    });

    test('regresión: sobre suelo NO helado la velocidad sigue clavada en la base', () => {
        const { p, floor, particles } = onFloor('metal');
        for (let f = 0; f < 90; f++) p.update({ ArrowRight: true }, [floor], particles);
        expect(p.vx).toBe(p.speed);
    });

    test('al soltar la dirección sobre hielo sigues deslizándote, y acabas frenando del todo', () => {
        const { p, floor, particles } = onFloor('ice');
        for (let f = 0; f < 90; f++) p.update({ ArrowRight: true }, [floor], particles);
        p.update({}, [floor], particles);
        expect(p.vx).toBeGreaterThan(1); // un frame después de soltar, aún deslizando (nada de parar en seco)
        for (let f = 0; f < 120; f++) p.update({}, [floor], particles);
        expect(Math.abs(p.vx)).toBeLessThan(0.1); // pero el deslizamiento sí se agota solo
    });

    test('el impulso de la carrerilla se conserva en el aire — ahí vive el salto largo', () => {
        const { p, floor, particles } = onFloor('ice');
        for (let f = 0; f < 90; f++) p.update({ ArrowRight: true }, [floor], particles);
        p.update({ ArrowRight: true, Space: true }, [floor], particles); // salta con carrerilla
        expect(p.onGround).toBe(false);
        for (let f = 0; f < 10; f++) p.update({ ArrowRight: true }, [floor], particles);
        expect(p.vx).toBeGreaterThan(2); // sigue muy por encima de la velocidad base en pleno vuelo
    });

    test('pulsar la dirección contraria en el aire devuelve el control normal (puedes frenarte)', () => {
        const { p, floor, particles } = onFloor('ice');
        for (let f = 0; f < 90; f++) p.update({ ArrowRight: true }, [floor], particles);
        p.update({ ArrowRight: true, Space: true }, [floor], particles);
        p.update({ ArrowLeft: true }, [floor], particles);
        expect(p.vx).toBe(-p.speed); // el impulso se descarta en cuanto contradices la dirección
    });

    test('regresión: el dash de Shade no hereda la inercia aérea del hielo', () => {
        const { p, floor, particles } = onFloor('metal', 'shade');
        p.update({ Space: true }, [floor], particles);  // salto desde el suelo
        p.update({}, [floor], particles);               // suelta (edge detection)
        p.update({ Space: true }, [floor], particles);  // dash en el aire: 12 frames a 3.2
        for (let f = 0; f < 13; f++) p.update({}, [floor], particles); // el dash se agota
        expect(p.vx).toBe(0); // sin teclas y sin dash: control directo normal — el 3.2 no "flota"
    });

    test('el set piece del nivel 2: con carrerilla desde la pista se aterriza en el islote de la cápsula', () => {
        const { LEVELS, Player, Platform } = loadGame();
        const lvl = LEVELS[1]; // Grietas de Hielo
        const plats = lvl.platforms.map(pp => new Platform(...pp, lvl.variant));
        const p = new Player(602, 137, 'scrap'); // Scrap, sin habilidad aérea: si llega, es solo el hielo
        p.onGround = true;
        const particles = { burst() {} };
        let jumped = false;
        for (let f = 0; f < 300; f++) {
            const keys = { ArrowRight: !jumped };
            if (!jumped && p.x + p.w >= 729) { keys.Space = true; keys.ArrowRight = true; jumped = true; }
            p.update(keys, plats, particles);
            if (jumped && (p.onGround || p.y > 200)) break;
        }
        expect(jumped).toBe(true);
        expect(p.y + p.h).toBe(130);            // de pie sobre el islote [782,130,40,6]...
        expect(p.x + p.w).toBeGreaterThan(782); // ...cruzado el hueco de 52 de verdad
        expect(p.x).toBeLessThan(822);          // ...y sin pasarse de largo
    });

    test('el salto final del nivel 2: con carrerilla desde la meseta se cruza el hueco de 58 hasta la BASE', () => {
        const { LEVELS, Player, Platform } = loadGame();
        const lvl = LEVELS[1];
        const plats = lvl.platforms.map(pp => new Platform(...pp, lvl.variant));
        const p = new Player(865, 137, 'scrap'); // arranca parado al inicio de la meseta [862,150,90,15]
        p.onGround = true;
        const particles = { burst() {} };
        let jumped = false;
        for (let f = 0; f < 300; f++) {
            const keys = { ArrowRight: !jumped };
            if (!jumped && p.x + p.w >= 951) { keys.Space = true; keys.ArrowRight = true; jumped = true; }
            p.update(keys, plats, particles);
            if (jumped && (p.onGround || p.y > 200)) break;
        }
        expect(jumped).toBe(true);
        expect(p.y + p.h).toBe(150);             // aterrizó en la plataforma de la BASE [1010,150,80,15]...
        expect(p.x + p.w).toBeGreaterThan(1010); // ...no en la red de seguridad de abajo
    });
});

describe('Peligros: frágiles, móviles, rayos y cintas (contra el código real)', () => {
    // Prepara una partida dentro del nivel `idx`, con los enemigos apartados para que ningún
    // choque accidental abra un combate en mitad del test.
    function inLevel(idx) {
        const { game, Platform, MovingPlatform, EnergyBeam, Player } = loadGame();
        game.gameStarted = true;
        game.loadLevel(idx);
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        game.enemies.forEach(e => { e.x = -500; e.initialX = -500; });
        return { game, Platform, MovingPlatform, EnergyBeam, Player };
    }
    function standOn(game, p) {
        game.player.x = p.x + 5; game.player.y = p.y - game.player.h;
        game.player.vx = 0; game.player.vy = 0; game.player.onGround = true;
    }

    test('una plataforma frágil se desmorona ~50 frames después de pisarla y reaparece a los 180', () => {
        const { Platform } = loadGame();
        const p = new Platform(0, 100, 40, 6, 'fragile');
        expect(p.solid).toBe(true);
        p.touched();
        for (let i = 0; i < 50; i++) p.update();
        expect(p.gone).toBe(true);
        expect(p.solid).toBe(false);
        for (let i = 0; i < 180; i++) p.update();
        expect(p.solid).toBe(true); // reaparece: el nivel nunca queda bloqueado sin salida
        expect(p.crumbleTimer).toBe(-1); // y vuelve intacta, con su cuenta atrás sin arrancar
    });

    test('estar de pie sobre una frágil (nivel 4 real) arranca su cuenta atrás y acaba cayendo', () => {
        const { game } = inLevel(3); // Chatarral Magnético: primer nivel con frágiles
        const frag = game.platforms.find(p => p.variant === 'fragile');
        standOn(game, frag);
        game.update();
        expect(frag.crumbleTimer).toBeGreaterThanOrEqual(0); // pisada: cuenta atrás en marcha
        for (let i = 0; i < 60; i++) game.update();
        expect(frag.gone).toBe(true);
    });

    test('una plataforma móvil oscila alrededor de su Y base y lleva al jugador encima', () => {
        const { MovingPlatform, Player } = loadGame();
        const m = new MovingPlatform(100, 120, 60, 6, 14, 0.02);
        let minY = Infinity, maxY = -Infinity;
        const pl = new Player(110, 120 - 13, 'kes');
        pl.onGround = true;
        const particles = { burst() {} };
        for (let i = 0; i < 350; i++) {
            m.update();
            pl.update({}, [m], particles);
            minY = Math.min(minY, m.y); maxY = Math.max(maxY, m.y);
        }
        expect(minY).toBeLessThan(110); // recorre su amplitud hacia arriba...
        expect(maxY).toBeGreaterThan(130); // ...y hacia abajo
        expect(pl.onGround).toBe(true); // y el jugador sigue de pie encima
        expect(Math.abs((pl.y + pl.h) - m.y)).toBeLessThan(1); // pegado a la altura ACTUAL
    });

    test('el ciclo del rayo eléctrico: apagado → aviso → activo, determinista por frames', () => {
        const { EnergyBeam } = loadGame();
        const b = new EnergyBeam(0, 100, 40, 0);
        expect(b.phase()).toBe('off');
        b.t = b.PERIOD - b.ON - b.WARN;
        expect(b.phase()).toBe('warn');
        b.t = b.PERIOD - b.ON;
        expect(b.phase()).toBe('on');
        b.t = b.PERIOD; // ciclo nuevo
        expect(b.phase()).toBe('off');
    });

    test('tocar una puerta de energía activa (nivel 7 real) daña, empuja y concede tregua', () => {
        const { game } = inLevel(6); // Muelle de Carga: primer nivel con puertas
        const beam = game.beams[0];
        beam.t = beam.PERIOD - beam.ON; // forzada a fase activa
        // andando hacia la columna a ras de suelo desde la izquierda, solapando su banda x±2
        game.player.x = beam.x - 6; game.player.y = 137; game.player.vy = 0; game.player.onGround = true;
        const hp0 = game.player.hp;
        game.update();
        expect(game.player.hp).toBe(hp0 - Math.max(1, 4 - game.player.defense));
        expect(game.playerInvulnerable).toBe(50); // tregua: no re-golpea cada frame
        expect(game.player.x).toBeLessThan(beam.x - 6); // el empujón lo devuelve por donde venía
    });

    test('una puerta apagada no hace nada aunque la cruces', () => {
        const { game } = inLevel(6);
        const beam = game.beams[0];
        beam.t = 0; // fase apagada
        game.player.x = beam.x - 4; game.player.y = 137; game.player.vy = 0; game.player.onGround = true;
        const hp0 = game.player.hp;
        game.update();
        expect(game.player.hp).toBe(hp0);
    });

    test('regla de diseño: el salto simple NO supera los 40 de alto de una puerta', () => {
        // Si algún día sube jumpPower, este test avisa de que las puertas dejan de ser puertas
        // (se saltarían por encima gratis, sin gastar Energía ni esperar el ciclo).
        const { Player } = loadGame();
        const pl = new Player(0, 137, 'kes');
        pl.onGround = true;
        const particles = { burst() {} };
        let jumped = false, minFeet = 150;
        for (let f = 0; f < 80; f++) {
            pl.update({ Space: !jumped }, [], particles);
            jumped = true;
            minFeet = Math.min(minFeet, pl.y + pl.h);
        }
        expect(150 - minFeet).toBeLessThan(40); // altura máxima del salto simple < altura de puerta
    });

    test('una cinta (nivel 9 real) arrastra al jugador parado hacia atrás', () => {
        const { game } = inLevel(8); // Núcleo del Reactor: primer nivel con cinta
        const belt = game.platforms.find(p => p.variant === 'beltL');
        standOn(game, belt);
        const x0 = game.player.x;
        for (let i = 0; i < 10; i++) game.update();
        expect(game.player.x).toBeLessThan(x0); // sin pulsar nada, la cinta te lleva
    });
});

describe('Tormenta iónica — nivel 5 (contra js/game.js real)', () => {
    function inStormLevel() {
        const { game, LEVELS, Player } = loadGame();
        game.gameStarted = true;
        game.loadLevel(4); // Tormenta de Iones
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        game.enemies.forEach(e => { e.x = -1500; e.initialX = -1500; });
        game.hintsSeen.add('ion-storm'); // sin diálogo de aviso por medio (se testea aparte)
        return { game, storm: LEVELS[4].ionStorm, LEVELS, Player };
    }
    function standAt(game, x) {
        game.player.x = x; game.player.y = 137;
        game.player.vx = 0; game.player.vy = 0; game.player.onGround = true;
    }

    test('el ciclo calma → aviso → descarga es determinista por frames', () => {
        const { game, storm } = inStormLevel();
        game.stormT = 0;
        expect(game.stormPhase(storm)).toBe('calm');
        game.stormT = storm.calm;
        expect(game.stormPhase(storm)).toBe('warn');
        game.stormT = storm.calm + storm.warn;
        expect(game.stormPhase(storm)).toBe('strike');
        game.stormT = storm.calm + storm.warn + storm.strike; // ciclo nuevo
        expect(game.stormPhase(storm)).toBe('calm');
    });

    test('en plena descarga, al raso: daño con tregua de invulnerabilidad (no re-golpea cada frame)', () => {
        const { game, storm } = inStormLevel();
        standAt(game, 110); // sobre una piedra de la carrera 1, sin ningún techo encima
        game.stormT = storm.calm + storm.warn; // al borde de la descarga
        const hp0 = game.player.hp;
        game.update();
        expect(game.player.hp).toBe(hp0 - Math.max(1, 5 - game.player.defense));
        expect(game.playerInvulnerable).toBe(45);
        const hp1 = game.player.hp;
        for (let i = 0; i < 20; i++) game.update();
        expect(game.player.hp).toBe(hp1); // la tregua aguanta: nada de daño por frame
    });

    test('bajo el techo de un refugio, la descarga entera no hace nada', () => {
        const { game, storm } = inStormLevel();
        standAt(game, 350); // refugio B: isla [330,150,70,15] con techo [336,112,58,8]
        game.stormT = storm.calm + storm.warn;
        const hp0 = game.player.hp;
        for (let i = 0; i < storm.strike; i++) game.update();
        expect(game.player.hp).toBe(hp0);
    });

    test('en calma no pasa nada aunque estés al raso', () => {
        const { game } = inStormLevel();
        standAt(game, 110);
        game.stormT = 0;
        const hp0 = game.player.hp;
        for (let i = 0; i < 60; i++) game.update();
        expect(game.player.hp).toBe(hp0);
    });

    test('el primer aviso de tormenta dispara su hint (una sola vez por navegador)', () => {
        const { game, storm } = inStormLevel();
        game.hintsSeen.delete('ion-storm');
        standAt(game, 350);
        game.stormT = storm.calm - 1; // el próximo update cruza a fase de aviso
        game.update();
        expect(game.hintScreen).not.toBeNull();
        expect(game.hintScreen.text).toMatch(/cubierto/);
    });

    test('con la física real, cada carrera entre refugios se cruza dentro de una ventana de calma', () => {
        // No solo distancia en llano (eso lo cubre el test de abajo): un corredor de verdad
        // salta piedras. Bot mínimo — correr a la derecha y salto simple al borde de cada hueco —
        // de refugio a refugio, contando frames. Si alguna carrera no cabe en la calma, el nivel
        // se volvió injusto (te obliga a comerte una descarga sí o sí).
        const { LEVELS, Player, Platform } = loadGame();
        const lvl = LEVELS[4];
        const plats = lvl.platforms.map(pp => new Platform(...pp, lvl.variant));
        const roofs = lvl.platforms.filter(p => p[3] === 8).sort((a, b) => a[0] - b[0]);
        const particles = { burst() {} };
        for (let i = 0; i < roofs.length - 1; i++) {
            const from = roofs[i], to = roofs[i + 1];
            const p = new Player(from[0] + from[2] - 12, 137, 'scrap'); // sale del borde del techo i
            p.onGround = true;
            let frames = 0;
            while (p.x + p.w < to[0] + 4 && frames < 1000) {
                // ¿hay suelo a ras (y≥145) justo delante? si no, toca saltar el hueco
                const ahead = lvl.platforms.some(q => q[1] >= 145 && p.x + 24 > q[0] && p.x + 14 < q[0] + q[2]);
                p.update({ ArrowRight: true, Space: p.onGround && !ahead }, plats, particles);
                frames++;
                if (p.y > 180) break; // cayó a un hueco: la carrera no se puede correr
            }
            expect(p.y).toBeLessThanOrEqual(180);
            expect(p.x + p.w).toBeGreaterThanOrEqual(to[0] + 4); // llegó bajo el siguiente techo
            expect(frames).toBeLessThan(lvl.ionStorm.calm);      // ...dentro de una sola calma
        }
    });

    test('regla de diseño: el secreto del nivel 5 queda fuera del alcance del salto simple desde la frágil', () => {
        // Regresión de un agujero real: con la secreta a y=72, el salto simple desde la flotante
        // frágil (ápice ~79 + ventana de aterrizaje de 10) llegaba, y la cadena flotante → móvil →
        // frágil → secreta abría el "secreto de doble salto" sin gastar Energía.
        const { LEVELS, Player } = inStormLevel();
        const lvl = LEVELS[4];
        const fragile = lvl.platforms.find(p => p[4] === 'fragile' && p[0] === 860);
        const secret = lvl.platforms.find(p => p[0] === 875 && p[2] === 28);
        expect(fragile).toBeDefined();
        expect(secret).toBeDefined();
        // Altura del salto simple, medida con la física real (mismo método que makeMaxReach):
        const p = new Player(0, 0, 'scrap');
        p.onGround = true;
        let jumped = false, minY = 0;
        for (let f = 0; f < 60; f++) {
            p.update({ Space: !jumped }, [], { burst() {} });
            jumped = true;
            minY = Math.min(minY, p.y);
        }
        const simpleJumpRise = -minY; // ~27 con la física actual
        const rise = fragile[1] - secret[1]; // cuánto hay que subir hasta la secreta
        expect(rise).toBeGreaterThan(simpleJumpRise + 10); // +10: la ventana de snap de aterrizaje
    });

    test('regla de diseño: ningún tramo abierto entre techos supera lo andable en una ventana de calma', () => {
        const { LEVELS, Player } = inStormLevel();
        const lvl = LEVELS[4];
        const speed = new Player(0, 0, 'kes').speed;
        const calmDistance = lvl.ionStorm.calm * speed;
        // Los techos de los refugios son las únicas plataformas con h=8 del nivel.
        const roofs = lvl.platforms.filter(p => p[3] === 8).sort((a, b) => a[0] - b[0]);
        expect(roofs.length).toBeGreaterThanOrEqual(4);
        for (let i = 1; i < roofs.length; i++) {
            const gap = roofs[i][0] - (roofs[i - 1][0] + roofs[i - 1][2]);
            expect(gap).toBeLessThan(calmDistance);
        }
        // y la meta queda al alcance de una calma desde el último refugio
        const last = roofs[roofs.length - 1];
        expect(lvl.goal).toBeLessThanOrEqual(last[0] + last[2] + calmDistance);
    });
});

describe('Túnel de Escape — cuenta atrás del scroll forzado (contra js/game.js real)', () => {
    function inTunnel() {
        const { game } = loadGame();
        game.gameStarted = true;
        game.loadLevel(7); // Túnel de Escape
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        game.enemies.forEach(e => { e.x = -500; e.initialX = -500; });
        return game;
    }

    test('durante la cuenta atrás la cámara sigue al jugador: se puede avanzar sin esperar', () => {
        const game = inTunnel();
        expect(game.forcedScrollDelay).toBeGreaterThan(0);
        game.player.x = 260; game.player.y = 137; game.player.vy = 0; game.player.onGround = true;
        game.update();
        expect(game.cameraX).toBeGreaterThan(90); // centrada en el jugador (~100), no clavada en 0
    });

    test('al terminar la cuenta atrás, el muro arranca desde donde esté la cámara, no desde x=0', () => {
        const game = inTunnel();
        game.player.x = 420; game.player.y = 137; game.player.vy = 0; game.player.onGround = true;
        game.forcedScrollDelay = 1;
        game.update(); // último tick de cuenta atrás: la cámara aún sigue al jugador (~260)
        game.update(); // primer tick de muro: avanza DESDE ahí
        expect(game.autoScrollX).toBeGreaterThan(255);
    });

    test('durante la cuenta atrás el muro no empuja ni daña (todavía no existe)', () => {
        const game = inTunnel();
        game.player.x = 0; game.player.y = 137; game.player.vy = 0; game.player.onGround = true;
        const hp0 = game.player.hp;
        game.update();
        expect(game.player.hp).toBe(hp0);
        expect(game.playerInvulnerable).toBe(0);
    });
});

describe('Transición de encuentro estilo Pokémon (contra js/game.js real)', () => {
    // Deja al jugador chocando con el primer enemigo del nivel 1 en el próximo update()
    // (contacto lateral, no pisotón: mismo nivel que el enemigo).
    function collideSetup() {
        const { game, window } = loadGame();
        game.gameStarted = true;
        game.loadLevel(0);
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        const enemy = game.enemies.find(e => e.alive);
        game.player.x = enemy.x; game.player.y = enemy.y; game.player.vy = 0.1; game.playerInvulnerable = 0;
        return { game, window, enemy };
    }

    test('chocar con un enemigo congela el juego y arranca la transición, no el combate directo', () => {
        const { game } = collideSetup();
        game.update();
        expect(game.combat).toBeNull();
        expect(game.combatTransition).not.toBeNull();
        const px = game.player.x;
        game.keys.ArrowRight = true;
        game.update(); // con la transición activa, la física está congelada
        expect(game.player.x).toBe(px);
        game.keys.ArrowRight = false;
    });

    test('al terminar la transición se abre el combate con ESE enemigo', () => {
        const { game, enemy } = collideSetup();
        game.update();
        for (let i = 0; i < 80; i++) game.update();
        expect(game.combatTransition).toBeNull();
        expect(game.combat).not.toBeNull();
        expect(game.combat.enemy).toBe(enemy);
        expect(game.combat.active).toBe(true);
    });

    test('ESC no hace nada durante la transición (el combate ya es inevitable)', () => {
        const { game, window } = collideSetup();
        game.update();
        window.document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Escape' }));
        expect(game.inLevel).toBe(true); // no ha salido al mapa
        expect(game.combatTransition).not.toBeNull(); // ni se ha cancelado la transición
    });

    test('con reduceEffects la transición es un fundido más corto y también desemboca en combate', () => {
        const { game } = collideSetup();
        game.reduceEffects = true;
        game.update();
        for (let i = 0; i < 45; i++) game.update();
        expect(game.combat).not.toBeNull();
    });

    test('recargar el nivel (perder una vida) descarta cualquier transición pendiente', () => {
        const { game } = collideSetup();
        game.update();
        expect(game.combatTransition).not.toBeNull();
        game.loadLevel(0);
        expect(game.combatTransition).toBeNull();
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
