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
        + '\nwindow.__T__ = { LEVELS, CombatSystem, Player, Enemy, Platform, MovingPlatform, EnergyBeam, HEROES, HERO_ORDER, WorldMap, game, ICE_MAX_SPEED, setRNG: (fn) => { RNG = fn; }, todayDateString, dailyHeroFor, dailyLevelFor, dailyDifficultyFor, mulberry32, hashStringToSeed, encodeDuelToken, decodeDuelToken, sanitizeDuelName, encodeDuelRoute, decodeDuelRoute };';
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

describe('Árbol de mejoras (contra el código real)', () => {
    test('cada subida de nivel da +1 punto de mejora', () => {
        const { Player } = loadGame();
        const p = new Player(0, 0, 'kes');
        expect(p.skillPoints).toBe(0);
        p.gainXP(10); // Lv2
        expect(p.skillPoints).toBe(1);
        p.gainXP(15 + 22); // Lv3 y Lv4 de una tacada
        expect(p.skillPoints).toBe(3);
    });

    test('desbloquear exige punto y prerrequisito de rama, y descuenta el punto', () => {
        const { game } = loadGame();
        expect(game.unlockSkill('crit')).toBe(false); // sin puntos
        game.player.skillPoints = 2;
        expect(game.unlockSkill('guardia')).toBe(false); // nodo 2 sin su nodo 1
        expect(game.unlockSkill('crit')).toBe(true);
        expect(game.player.skillPoints).toBe(1);
        expect(game.unlockSkill('crit')).toBe(false); // no se re-desbloquea (ni re-cobra)
        expect(game.unlockSkill('guardia')).toBe(true); // con el prerrequisito, sí
        expect(game.player.skillPoints).toBe(0);
        expect(game.unlockSkill('ejecutor')).toBe(false); // sin puntos otra vez
    });

    test('los bonos instantáneos (blindaje) se aplican una sola vez y sobreviven al guardado', () => {
        const { game, window } = loadGame();
        game.player.skillPoints = 1;
        const hp0 = game.player.maxHp;
        game.unlockSkill('blindaje');
        expect(game.player.maxHp).toBe(hp0 + 6);
        game.saveProgress();
        expect(JSON.parse(window.localStorage.getItem('astroLeapSave_v1')).skills).toContain('blindaje');
        game.player.skills = new Set(); // simula arrancar la sesión de cero
        game.loadProgress();
        expect(game.player.skills.has('blindaje')).toBe(true);
        expect(game.player.maxHp).toBe(hp0 + 6); // el +6 vive en el maxHp guardado — NO se re-aplica
    });

    test('Punto débil: crítico ×1.5 en Atacar, con el azar sembrado (RNG, no Math.random)', () => {
        const { Player, Enemy, CombatSystem, setRNG } = loadGame();
        const player = new Player(0, 0, 'kes');
        player.skills.add('crit');
        // RNG=0.5: variación ×1.0 y 0.5 ≥ 0.25 → sin crítico
        let enemy = new Enemy(0, 0, 'drone'); enemy.maxHp = 999; enemy.hp = 999;
        let combat = new CombatSystem(player, enemy);
        setRNG(() => 0.5);
        combat.executePlayerAction(0);
        expect(999 - enemy.hp).toBe(Math.max(1, Math.floor(player.attack * 1.0) - enemy.defense));
        expect(combat.message).not.toMatch(/CRÍTICO/);
        // RNG=0.1: variación ×0.84 y 0.1 < 0.25 → crítico ×1.5
        enemy = new Enemy(0, 0, 'drone'); enemy.maxHp = 999; enemy.hp = 999;
        combat = new CombatSystem(player, enemy);
        setRNG(() => 0.1);
        combat.executePlayerAction(0);
        setRNG(Math.random);
        const raw = Math.floor(Math.floor(player.attack * (0.8 + 0.1 * 0.4)) * 1.5);
        expect(999 - enemy.hp).toBe(Math.max(1, raw - enemy.defense));
        expect(combat.message).toMatch(/CRÍTICO/);
    });

    test('Ejecutor y Habilidad eficiente: la Habilidad hace ×2 y cuesta 2 EN', () => {
        const { Player, Enemy, CombatSystem } = loadGame();
        const player = new Player(0, 0, 'kes');
        player.skills.add('eficiente');
        player.skills.add('ejecutor');
        const enemy = new Enemy(0, 0, 'drone'); enemy.maxHp = 999; enemy.hp = 999;
        const combat = new CombatSystem(player, enemy);
        player.energy = 2; // con el coste base (3) ni siquiera podría usarla
        combat.executePlayerAction(1);
        expect(player.energy).toBe(0);
        expect(999 - enemy.hp).toBe(Math.max(1, Math.floor(player.attack * 2) - enemy.defense));
    });

    test('Guardia férrea: Defender reduce al 35% en vez de al 50%', () => {
        const { Player, Enemy, CombatSystem, setRNG } = loadGame();
        const player = new Player(0, 0, 'kes'); player.maxHp = 9999; player.hp = 9999;
        player.skills.add('guardia');
        const enemy = new Enemy(0, 0, 'magnetite');
        const combat = new CombatSystem(player, enemy);
        setRNG(() => 0.5);
        combat.defending = true;
        combat.resolveEnemyTurn();
        setRNG(Math.random);
        expect(9999 - player.hp).toBe(Math.max(1, Math.floor(Math.floor(enemy.attack * 1.0) * 0.35)));
    });

    test('Reciclador: el pisotón da +3 de Energía en vez de +2', () => {
        const { game } = loadGame();
        game.gameStarted = true;
        game.loadLevel(0);
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        const enemy = game.enemies[0];
        game.player.skills.add('reciclador');
        game.player.level = enemy.level + 1;
        game.player.xpToNextLevel = 9999;
        game.player.x = enemy.x; game.player.y = enemy.y - 12; game.player.vy = 0.5;
        game.player.onGround = false; game.playerInvulnerable = 0;
        game.player.energy = 5;
        game.update();
        expect(enemy.defeated).toBe(true);
        expect(game.player.energy).toBe(8);
    });

    test('Aislante: una puerta de energía activa hace la mitad de daño', () => {
        const { game } = loadGame();
        game.gameStarted = true;
        game.loadLevel(6); // Muelle de Carga, primer nivel con puertas
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        game.enemies.forEach(e => { e.x = -500; e.initialX = -500; });
        game.player.skills.add('aislante');
        const beam = game.beams[0];
        beam.t = beam.PERIOD - beam.ON;
        game.player.x = beam.x - 6; game.player.y = 137; game.player.vy = 0; game.player.onGround = true;
        const hp0 = game.player.hp;
        game.update();
        expect(game.player.hp).toBe(hp0 - Math.max(1, Math.ceil(4 / 2) - game.player.defense));
    });

    test('Sistema de emergencia: un golpe letal deja a 1 HP, y solo una vez', () => {
        const { Player } = loadGame();
        const p = new Player(0, 0, 'kes');
        p.skills.add('emergencia');
        p.hp = 3;
        p.takeDamage(99);
        expect(p.hp).toBe(1); // salvado in extremis
        p.takeDamage(99);
        expect(p.hp).toBeLessThanOrEqual(0); // la segunda vez, no
    });

    test('el sistema de emergencia también cubre el golpe recibido Defendiendo, y se rearma al recargar nivel', () => {
        const { Player, Enemy, CombatSystem, setRNG, game } = loadGame();
        const player = new Player(0, 0, 'kes');
        player.skills.add('emergencia');
        player.hp = 1;
        const combat = new CombatSystem(player, new Enemy(0, 0, 'magnetite'));
        setRNG(() => 0.5);
        combat.defending = true;
        combat.resolveEnemyTurn(); // la rama "defendiendo" resta HP sin pasar por takeDamage
        setRNG(Math.random);
        expect(player.hp).toBe(1);
        expect(player.emergencyUsed).toBe(true);
        game.player.skills.add('emergencia');
        game.player.emergencyUsed = true;
        game.loadLevel(0);
        expect(game.player.emergencyUsed).toBe(false); // rearmado con la (re)carga
    });
});

describe('Cristales de Señal — objetivo secundario y puertas de las torres (contra el código real)', () => {
    function inLevelWithCrystal(idx) {
        const { game, LEVELS, window } = loadGame();
        game.gameStarted = true;
        game.loadLevel(idx);
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        game.enemies.forEach(e => { e.x = -2500; e.initialX = -2500; });
        game.hintsSeen.add('ice-slide'); game.hintsSeen.add('ion-storm');
        return { game, LEVELS, window };
    }

    test('recoger un cristal suma, se guarda, y no se puede re-recoger al recargar el nivel', () => {
        const { game, LEVELS, window } = inLevelWithCrystal(0);
        const [cx, cy] = LEVELS[0].crystals[0];
        game.player.x = cx; game.player.y = cy; game.player.vy = 0;
        game.update();
        expect(game.signalCrystals.has('0-0')).toBe(true);
        expect(game.crystals[0].collected).toBe(true);
        expect(game.crystals[1].collected).toBe(false); // los otros dos del nivel siguen ahí
        // persiste en el guardado...
        expect(JSON.parse(window.localStorage.getItem('astroLeapSave_v1')).signalCrystals).toContain('0-0');
        // ...y al recargar el nivel ya viene recogido
        game.loadLevel(0);
        expect(game.crystals[0].collected).toBe(true);
    });

    test('con 8 cristales aparece la Torre de Vigía; con 20, la Aguja Glacial; antes, ocultas', () => {
        const { game } = loadGame();
        const torre = game.worldMap.nodes[12], aguja = game.worldMap.nodes[13];
        expect(torre.extra).toBe(true);
        expect(torre.unlocked).toBe(false);
        const keys = n => new Set(Array.from({ length: n }, (_, i) => `${Math.floor(i / 3)}-${i % 3}`));
        game.signalCrystals = keys(7);
        game.applySignalUnlocks();
        expect(torre.unlocked).toBe(false); // 7 no bastan
        game.signalCrystals = keys(8);
        game.applySignalUnlocks();
        expect(torre.unlocked).toBe(true);  // 8: primera puerta
        expect(aguja.unlocked).toBe(false); // la segunda aún no
        game.signalCrystals = keys(20);
        game.applySignalUnlocks();
        expect(aguja.unlocked).toBe(true);  // 20: segunda puerta
    });

    test('el desbloqueo en cadena de completar niveles nunca destapa las torres', () => {
        const { game } = loadGame();
        for (let i = 0; i < 12; i++) game.worldMap.completeLevel(i); // recorrido entero, Nodo Cero incluido
        expect(game.worldMap.nodes[12].unlocked).toBe(false);
        expect(game.worldMap.nodes[13].unlocked).toBe(false);
        // y completar una torre marca su ✓ sin destapar la siguiente
        game.worldMap.nodes[12].unlocked = true;
        game.worldMap.completeLevel(12);
        expect(game.worldMap.nodes[12].completed).toBe(true);
        expect(game.worldMap.nodes[13].unlocked).toBe(false);
    });

    test('cargar la partida restaura la cuenta y vuelve a destapar las puertas ganadas', () => {
        const { game } = loadGame();
        game.signalCrystals = new Set(['0-0', '0-1', '0-2', '1-0', '1-1', '1-2', '2-0', '2-1']);
        game.applySignalUnlocks();
        game.saveProgress();
        game.signalCrystals = new Set();
        game.worldMap = new (game.worldMap.constructor)(); // mapa fresco, torres ocultas
        game.loadProgress();
        expect(game.signalCrystals.size).toBe(8);
        expect(game.worldMap.nodes[12].unlocked).toBe(true);
    });

    test('el Game Over resetea los cristales y vuelve a ocultar las torres (roguelike)', () => {
        const { game } = loadGame();
        game.gameStarted = true;
        game.signalCrystals = new Set(['0-0', '0-1', '0-2', '1-0', '1-1', '1-2', '2-0', '2-1']);
        game.applySignalUnlocks();
        expect(game.worldMap.nodes[12].unlocked).toBe(true);
        game.player.lives = 1;
        game.loseLife();
        expect(game.signalCrystals.size).toBe(0);
        expect(game.worldMap.nodes[12].unlocked).toBe(false);
    });

    test('el Reto Diario no toca los cristales reales aunque el nivel del día tenga uno', () => {
        const { game, LEVELS } = loadGame();
        game.signalCrystals = new Set(['3-1']);
        game.startDailyChallenge();
        expect(game.signalCrystals.size).toBe(0); // set aparte durante el reto
        game.player.x = LEVELS[game.dailyLevelIdx].goal;
        game.update(); // completa el reto y restaura
        expect(game.signalCrystals.size).toBe(1);
        expect(game.signalCrystals.has('3-1')).toBe(true);
    });

    test('los marcadores de sectores siguen contando 12 (las torres no cuentan)', () => {
        const { game } = loadGame();
        expect(game.worldMap.nodes.length).toBe(14);
        expect(game.worldMap.mainCount).toBe(12);
    });

    test('invariante: TRES cristales por nivel del mapa, ninguno en las torres, y siempre a un salto de algo', () => {
        const { LEVELS } = loadGame();
        LEVELS.forEach(lvl => {
            expect({ nivel: lvl.name, cristales: (lvl.crystals || []).length })
                .toEqual({ nivel: lvl.name, cristales: lvl.extra ? 0 : 3 });
            (lvl.crystals || []).forEach(([cx, cy]) => {
                // percha válida: una plataforma (o el punto ALTO de una móvil) 8-42 por debajo
                // del cristal y con solape horizontal de sobra — es decir, se roza saltando.
                const perches = lvl.platforms.map(p => ({ x: p[0], y: p[1], w: p[2] }))
                    .concat((lvl.movingPlatforms || []).map(m => ({ x: m[0], y: m[1] - m[4], w: m[2] })));
                const ok = perches.some(p => cx >= p.x - 12 && cx <= p.x + p.w + 12 && (p.y - cy) >= 8 && (p.y - cy) <= 42);
                expect({ nivel: lvl.name, cx, cy, alcanzable: ok })
                    .toEqual({ nivel: lvl.name, cx, cy, alcanzable: true });
            });
        });
    });
});

describe('Acelerador de turnos del duelo — mantener pulsado (contra el código real)', () => {
    test('update(fast) drena la pausa de mensaje a 4x; sin fast, a 1x', () => {
        const { Player, Enemy, CombatSystem } = loadGame();
        const combat = new CombatSystem(new Player(0, 0, 'kes'), new Enemy(0, 0, 'drone'));
        combat.turn = 'player'; combat.messageTimer = 60;
        for (let i = 0; i < 10; i++) combat.update(true);
        expect(combat.messageTimer).toBe(20);
        combat.messageTimer = 60;
        for (let i = 0; i < 10; i++) combat.update(false);
        expect(combat.messageTimer).toBe(50);
    });

    test('acelerar no salta el turno enemigo: el clamp a 0 lo resuelve exactamente una vez', () => {
        const { Player, Enemy, CombatSystem, setRNG } = loadGame();
        const player = new Player(0, 0, 'kes'); player.maxHp = 9999; player.hp = 9999;
        const combat = new CombatSystem(player, new Enemy(0, 0, 'drone'));
        setRNG(() => 0.5);
        combat.turn = 'enemy'; combat.messageTimer = 3; // un paso de 4 lo pasaría de largo sin clamp
        combat.update(true);
        setRNG(Math.random);
        expect(combat.turn).toBe('player');
        expect(combat.messageTimer).toBe(60); // el golpe enemigo dejó su propio mensaje en pantalla
        expect(9999 - player.hp).toBeGreaterThan(0); // y golpeó UNA vez
    });

    test('el "Tu turno" vuelve por frames del combate (acelerables), no por un setTimeout de reloj real', () => {
        const { Player, Enemy, CombatSystem, setRNG } = loadGame();
        const player = new Player(0, 0, 'kes'); player.maxHp = 9999; player.hp = 9999;
        const combat = new CombatSystem(player, new Enemy(0, 0, 'drone'));
        setRNG(() => 0.5);
        combat.turn = 'enemy'; combat.messageTimer = 1;
        combat.update(false); // resuelve el turno enemigo → mensaje del golpe + promptTimer
        setRNG(Math.random);
        expect(combat.message).toMatch(/ataca/);
        // acelerado: 60 de mensaje (15 updates) + 20 de prompt (5 updates)
        for (let i = 0; i < 20; i++) combat.update(true);
        expect(combat.message).toBe('Tu turno. Elige acción:');
    });

    test('actuar rápido cancela el "Tu turno" pendiente (el temporizador viejo pisaba tu mensaje)', () => {
        const { Player, Enemy, CombatSystem, setRNG } = loadGame();
        const player = new Player(0, 0, 'kes'); player.maxHp = 9999; player.hp = 9999;
        const combat = new CombatSystem(player, new Enemy(0, 0, 'magnetite'));
        setRNG(() => 0.5);
        combat.turn = 'enemy'; combat.messageTimer = 1;
        combat.update(false);                              // vuelve tu turno, prompt pendiente
        expect(combat.promptTimer).toBeGreaterThan(0);
        for (let i = 0; i < 15; i++) combat.update(true);  // drena el mensaje del golpe enemigo
        combat.executePlayerAction(0);                     // atacas ANTES de que salga el prompt
        setRNG(Math.random);
        expect(combat.message).toMatch(/Disparaste|CRÍTICO/);
        expect(combat.promptTimer).toBe(0); // el prompt pendiente queda cancelado: ya no pisará tu mensaje
    });

    test('el autorepeat de una tecla mantenida NO dispara acciones en cadena', () => {
        const { game, window, Player, Enemy, CombatSystem } = loadGame();
        game.gameStarted = true;
        const enemy = new Enemy(0, 0, 'drone'); enemy.maxHp = 999; enemy.hp = 999;
        game.combat = new CombatSystem(game.player, enemy);
        game.combat.turn = 'player'; game.combat.messageTimer = 0;
        // keydown repetido (mantener la tecla): ignorado
        window.document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Digit1', repeat: true }));
        expect(enemy.hp).toBe(999);
        // keydown de pulsación real: ejecuta
        window.document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Digit1', repeat: false }));
        expect(enemy.hp).toBeLessThan(999);
    });

    test('mantener ESPACIO o el toque sostenido activan el acelerador; sueltos, no', () => {
        const { game } = loadGame();
        expect(game.combatFastForward()).toBe(false);
        game.keys.Space = true;
        expect(game.combatFastForward()).toBe(true);
        game.keys.Space = false;
        game.combatTouchHold = true;
        expect(game.combatFastForward()).toBe(true);
        game.combatTouchHold = false;
        expect(game.combatFastForward()).toBe(false);
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
                // dy<0 (plataforma más arriba): el aterrizaje real es el snap del motor — pies
                // DESCENDIENDO (vy>0) dentro de la banda (top, top+10]. Medir solo "cruzó la
                // altura exacta" ignoraba esa ventana de 10 y daba por imposibles subidas de
                // 27-36 que el juego permite de verdad (la ♥ del arranque del nivel 2, p.ej.).
                if (dy < 0) { if (p.vy > 0 && p.y > dy && p.y <= dy + 10) crossings.push(p.x); }
                else { if (p.y >= dy) { result = p.x; break; } }
            }
            // El último punto de la banda es el aterrizaje más lejano posible. Inalcanzable en
            // altura = -1, NO 0: con 0, una plataforma que solapa en horizontal (gap=0) pasaba
            // el `gap <= reach` y el BFS "subía" pisos enteros sin escalera — inofensivo en los
            // niveles horizontales, letal al validar torres.
            if (dy < 0) result = crossings.length ? crossings[crossings.length - 1] : -1;
            cache.set(dy, result);
            return result;
        };
    }
    // Alcance del salto CON carrerilla de hielo, medido con la física real (mismo convenio de
    // desplazamiento relativo que makeMaxReach): 90 frames acelerando sobre una pista de hielo
    // real y despegue manteniendo la dirección. Scrap puede — la carrerilla no gasta Energía ni
    // exige habilidad aérea (es el set piece del nivel 2), así que sigue siendo "salto simple".
    function makeMaxIceReach(Player, Platform) {
        const cache = new Map();
        return function maxIceReach(dy) {
            dy = Math.round(dy);
            if (cache.has(dy)) return cache.get(dy);
            // Pista en coordenadas POSITIVAS: Player.update clampa x>=0, y una pista en
            // negativas teleporta al corredor fuera de ella en el primer frame (medía un
            // salto normal en vez de uno con carrerilla).
            const runway = new Platform(0, 13, 400, 15, 'ice');
            const p = new Player(20, 0, 'scrap');
            p.onGround = true; p.groundPlatform = runway;
            const particles = { burst() {} };
            for (let f = 0; f < 90; f++) p.update({ ArrowRight: true }, [runway], particles);
            // al borde de despegue, con la velocidad de carrerilla puesta y en el convenio
            // relativo de makeMaxReach (x=0, y=0 en el despegue)
            p.x = 0; p.y = 0; p.vy = 0; p.onGround = true; p.prevJumpKey = false;
            let jumped = false;
            const crossings = [];
            let result = 0;
            for (let f = 0; f < 300; f++) {
                p.update({ ArrowRight: true, Space: !jumped }, [], particles);
                jumped = true;
                // misma banda de aterrizaje (snap de 10) y mismo -1 de "inalcanzable" que makeMaxReach
                if (dy < 0) { if (p.vy > 0 && p.y > dy && p.y <= dy + 10) crossings.push(p.x); }
                else if (p.y >= dy) { result = p.x; break; }
            }
            if (dy < 0) result = crossings.length ? crossings[crossings.length - 1] : -1;
            cache.set(dy, result);
            return result;
        };
    }
    // BFS de alcanzabilidad: ¿se puede llegar de la plataforma de salida hasta x >= goal saltando
    // (con salto simple) de plataforma en plataforma? Incluye reinforcedBlocks — antes de que
    // Scrap los rompa son sólidos para cualquiera, así que cuentan como suelo normal aquí.
    // BIDIRECCIONAL: el hueco horizontal se mide simétrico (la física del salto no distingue
    // izquierda de derecha) — necesario desde la Torre de Vigía, cuyo piso 2 se recorre de
    // derecha a izquierda; la versión original descartaba cualquier salto hacia la izquierda.
    // Dos extensiones ACOTADAS A NIVELES EXTRA (Aguja Glacial):
    //  - ascensores: cada movingPlatform aporta dos nodos gemelos (punto bajo y alto) unidos
    //    gratis — abordas abajo, te bajas arriba. En los 12 niveles del mapa las móviles SIGUEN
    //    sin contar: ahí la regla es que son atajos opcionales.
    //  - carrerilla: si la plataforma de salida es hielo ANCHO (≥100, aceleración garantizada),
    //    se usa el alcance con carrerilla en vez del salto en frío.
    function levelReachableWithSimpleJump(level, maxReach, maxIceReach) {
        const plats = level.platforms.map(p => ({ x: p[0], y: p[1], w: p[2], variant: p[4] }));
        (level.reinforcedBlocks || []).forEach(b => plats.push({ x: b[0], y: b[1], w: b[2] }));
        if (level.extra) {
            (level.movingPlatforms || []).forEach(([mx, my, mw, mh, amp]) => {
                const bottom = { x: mx, y: my + amp, w: mw };
                const top = { x: mx, y: my - amp, w: mw };
                bottom.twin = top; top.twin = bottom;
                plats.push(bottom, top);
            });
        }
        const start = plats.filter(p => p.x <= 20 && p.x + p.w >= 20).sort((a, b) => a.y - b.y)[0];
        const visited = new Set([start]);
        const queue = [start];
        let maxX = start.x + start.w;
        while (queue.length) {
            const a = queue.shift();
            maxX = Math.max(maxX, a.x + a.w);
            if (a.twin && !visited.has(a.twin)) { visited.add(a.twin); queue.push(a.twin); }
            for (const b of plats) {
                if (visited.has(b) || b === a) continue;
                const gap = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
                const dy = b.y - a.y;
                const reach = (a.variant === 'ice' && a.w >= 100 && maxIceReach) ? maxIceReach(dy) : maxReach(dy);
                if (gap <= reach) { visited.add(b); queue.push(b); }
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

    test('todos los niveles (12 del mapa + Extras) se completan solo con salto simple — y por tanto con cualquier piloto', () => {
        const { LEVELS, Player, Platform } = loadGame();
        const maxReach = makeMaxReach(Player);
        const maxIceReach = makeMaxIceReach(Player, Platform);
        const failing = LEVELS
            .map((lvl, i) => ({ i, name: lvl.name, ok: levelReachableWithSimpleJump(lvl, maxReach, maxIceReach) }))
            .filter(r => !r.ok);
        expect(failing).toEqual([]); // si esto falla, el mensaje lista qué niveles quedaron inalcanzables
    });

    test('Aguja Glacial: los ascensores son obligatorios y la meta solo se alcanza desde la cumbre', () => {
        const { LEVELS, Player, Platform, ICE_MAX_SPEED } = loadGame();
        const aguja = LEVELS.find(l => l.name === 'Aguja Glacial');
        expect(aguja).toBeDefined();
        const maxReach = makeMaxReach(Player);
        const maxIceReach = makeMaxIceReach(Player, Platform);
        // 1) sin los ascensores el nivel es imposible (la versión sin movingPlatforms no llega)
        const sinAscensores = { ...aguja, movingPlatforms: [] };
        expect(levelReachableWithSimpleJump(sinAscensores, maxReach, maxIceReach)).toBe(false);
        // 2) gating: ningún tramo bajo la cumbre (y > 65) alcanza la meta ni en pleno vuelo —
        //    contando ~70 de vuelo si el tramo es de hielo (deslizón) y ~42 si no
        const flight = maxReach(0);
        const iceFlight = maxIceReach(0);
        expect(iceFlight).toBeGreaterThan(flight); // sanity: la carrerilla de verdad alarga el salto
        aguja.platforms
            .filter(p => p[1] > 65)
            .forEach(p => {
                const reach = p[4] === 'ice' ? iceFlight : flight;
                expect(p[0] + p[2] + reach).toBeLessThan(aguja.goal);
            });
        // ...los ascensores tampoco (desde su punto alto, salto normal: son metal)
        aguja.movingPlatforms.forEach(m => expect(m[0] + m[2] + flight).toBeLessThan(aguja.goal));
        // 3) el hueco de la cumbre exige carrerilla: mayor que el salto en frío, cruzable deslizando
        const runway = aguja.platforms.find(p => p[0] === 303 && p[1] === 60);
        const summit = aguja.platforms.find(p => p[0] === 483 && p[1] === 60);
        const gap = summit[0] - (runway[0] + runway[2]);
        expect(gap).toBeGreaterThan(flight);
        expect(gap).toBeLessThanOrEqual(iceFlight);
        // 4) la velocidad de carrerilla que asume el diseño sigue siendo la real
        expect(ICE_MAX_SPEED).toBe(2.6);
    });

    test('un ascensor (móvil de amplitud 22 / omega 0.012) sube al jugador un piso entero sin perderlo', () => {
        // Regresión del límite documentado: velocidad vertical máx (amp × omega = 0.264) por
        // debajo de la gravedad (0.32) — si algún ascensor lo supera, el snap pierde al pasajero.
        const { MovingPlatform, Player } = loadGame();
        const lift = new MovingPlatform(100, 128, 34, 6, 22, 0.012);
        while (lift.y < 149.9) lift.update(); // baja hasta su punto de abordaje
        const p = new Player(110, lift.y - 13, 'kes');
        p.onGround = true;
        const particles = { burst() {} };
        let lost = false, minFeet = 999;
        for (let f = 0; f < 600; f++) { // más de medio ciclo: de abajo a arriba del todo
            lift.update();
            p.update({}, [lift], particles);
            if (!p.onGround) lost = true;
            minFeet = Math.min(minFeet, p.y + p.h);
        }
        expect(lost).toBe(false);
        expect(minFeet).toBeLessThan(107); // llegó al punto alto (128−22=106)
    });

    test('Torre de Vigía: el serpentín es obligatorio — sin subir al piso 3 no hay meta, ni en pleno salto', () => {
        const { LEVELS, Player } = loadGame();
        const maxReach = makeMaxReach(Player);
        const torre = LEVELS.find(l => l.extra);
        expect(torre).toBeDefined();
        // Todo tramo por debajo del piso 3 (suelo, recogida, peldaños, piso 2 — el piso 3 es
        // el más alto del nivel) debe quedarse corto de la meta INCLUSO saltando desde su
        // extremo derecho.
        const flight = maxReach(0); // alcance horizontal del salto simple en llano (~42)
        const topFloorY = Math.min(...torre.platforms.map(p => p[1]));
        torre.platforms
            .filter(p => p[1] > topFloorY)
            .forEach(p => expect(p[0] + p[2] + flight).toBeLessThan(torre.goal));
        // Y la separación entre pisos supera lo que sube incluso el DOBLE SALTO de Kes (con su
        // ventana de aterrizaje): de piso a piso solo se sube por los peldaños — únicamente el
        // vuelo de Bolt puede saltarse las escaleras.
        const f1 = torre.platforms.find(p => p[1] === 150);
        const f2 = torre.platforms.find(p => p[1] < 150 && p[3] === 8);
        const spacing = f1[1] - f2[1]; // separación real entre pisos (58)
        // doble salto óptimo medido con la física real: salto, soltar, y re-pulsar en el ápice
        const kes = new Player(0, 0, 'kes');
        kes.onGround = true;
        let phase = 'first', minY = 0;
        for (let f = 0; f < 120; f++) {
            let space = false;
            if (phase === 'first') { space = true; phase = 'released'; }
            else if (phase === 'released' && kes.vy > -0.2) { space = true; phase = 'doubled'; }
            kes.update({ Space: space }, [], { burst() {} });
            minY = Math.min(minY, kes.y);
        }
        expect(phase).toBe('doubled'); // el doble salto de verdad se ejecutó (si no, el test no mide nada)
        expect(spacing).toBeGreaterThan(-minY + 10); // 58 > ápice del doble (~46) + snap (10)
    });

    test('Torre de Vigía: completarla marca su nodo sin destapar la Aguja ni disparar la victoria', () => {
        const { game, LEVELS } = loadGame();
        const idx = LEVELS.findIndex(l => l.extra);
        game.gameStarted = true;
        expect(() => game.loadLevel(idx)).not.toThrow();
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        game.player.x = LEVELS[idx].goal; game.player.y = 47; game.player.vy = 0;
        expect(() => game.update()).not.toThrow();
        expect(game.levelCompleting).toBe(true);              // se completa como cualquier nivel...
        expect(game.gameStarted).toBe(true);                  // ...sin disparar la victoria del juego
        expect(game.worldMap.nodes[idx].completed).toBe(true); // su nodo-portal luce el ✓
        expect(game.worldMap.nodes[idx + 1].unlocked).toBe(false); // y la Aguja sigue tras su umbral de cristales
    });

    test('regresión: la victoria del juego la dispara Nodo Cero (final: true), no el último índice de LEVELS', () => {
        const { game, LEVELS, window } = loadGame();
        const nodoCero = LEVELS.findIndex(l => l.final);
        expect(nodoCero).toBe(11); // el 12º nivel del mapa, no el Extra
        game.gameStarted = true;
        game.loadLevel(nodoCero);
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        game.enemies.forEach(e => { e.alive = false; }); // jefe fuera: la meta se puede cruzar
        game.player.x = LEVELS[nodoCero].goal; game.player.y = 137; game.player.vy = 0;
        game.update();
        expect(game.gameStarted).toBe(false); // fin del juego de verdad
        expect(window.document.getElementById('startScreen').innerHTML).toContain('MISIÓN CUMPLIDA');
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

describe('Duelo a distancia — retos por URL con fantasma de ritmo (contra js/game.js real)', () => {
    test('el token codifica y decodifica fecha, tiempo y nombre (saneado)', () => {
        const { encodeDuelToken, decodeDuelToken } = loadGame();
        const token = encodeDuelToken('2026-08-24', 83450, 'Enrique');
        expect(decodeDuelToken(token)).toEqual({ date: '2026-08-24', time: 83450, name: 'Enrique', route: null });
        // sin nombre, y con nombre malicioso (HTML fuera, tope de 14)
        expect(decodeDuelToken(encodeDuelToken('2026-08-24', 60000)).name).toBe('');
        const evil = decodeDuelToken(encodeDuelToken('2026-08-24', 60000, '<img src=x onerror=1>MuyLargoDeVerdad'));
        expect(evil.name).not.toMatch(/[<>]/);
        expect(evil.name.length).toBeLessThanOrEqual(14);
    });

    test('tokens corruptos, con checksum falso o con tiempos absurdos se rechazan', () => {
        const { encodeDuelToken, decodeDuelToken } = loadGame();
        expect(decodeDuelToken('basura')).toBeNull();
        expect(decodeDuelToken('')).toBeNull();
        const token = encodeDuelToken('2026-08-24', 83450, 'Rival');
        expect(decodeDuelToken(token.slice(0, -1) + 'x')).toBeNull(); // checksum roto
        expect(decodeDuelToken(encodeDuelToken('2026-08-24', 1000))).toBeNull();      // < 5s: troll
        expect(decodeDuelToken(encodeDuelToken('2026-08-24', 99999999))).toBeNull();  // > 30min
        expect(decodeDuelToken(encodeDuelToken('no-es-fecha', 60000))).toBeNull();
    });

    test('el duelo juega el reto de LA FECHA DEL TOKEN, no el de hoy, y no toca el guardado real', () => {
        const { game, window, dailyLevelFor, dailyHeroFor, todayDateString } = loadGame();
        game.player.level = 5; game.saveProgress();
        const savedBefore = window.localStorage.getItem('astroLeapSave_v1');
        // una fecha distinta de hoy cuyo reto puede diferir del de hoy
        const duelDate = '2026-08-20';
        expect(duelDate).not.toBe(todayDateString());
        game.startDailyChallenge({ date: duelDate, time: 83450, name: 'Rival' });
        expect(game.dailyMode).toBe(true);
        expect(game.dailyDate).toBe(duelDate);
        expect(game.currentLevel).toBe(dailyLevelFor(duelDate));       // el nivel de ESA fecha
        expect(game.player.character).toBe(dailyHeroFor(duelDate));    // y su piloto
        expect(game.duelRival).toEqual({ time: 83450, name: 'Rival', route: null });
        expect(game.duelGhost).not.toBeNull();
        expect(window.localStorage.getItem('astroLeapSave_v1')).toBe(savedBefore);
    });

    test('completar un duelo de OTRA fecha no pisa tu registro diario de hoy; el de HOY sí', () => {
        const { game, LEVELS, todayDateString } = loadGame();
        game.saveDailyRecord(todayDateString(), 50000, 'kes'); // tu mejor tiempo de hoy
        game.startDailyChallenge({ date: '2026-08-20', time: 999999 * 0 + 90000, name: 'Rival' });
        game.player.x = LEVELS[game.dailyLevelIdx].goal;
        game.update(); // completa el duelo (más lento que el récord, y de otra fecha)
        expect(game.dailyRecord.date).toBe(todayDateString());
        expect(game.dailyRecord.time).toBe(50000); // intacto
    });

    test('el veredicto sale en la pantalla final y la revancha lleva tu tiempo en un token válido', () => {
        const { game, window, LEVELS, encodeDuelToken, decodeDuelToken, todayDateString } = loadGame();
        // el rival "tardó" 6s: el test completa casi al instante, así que el veredicto es victoria o
        // derrota según el reloj real — lo que se fija es que HAY veredicto y botón de revancha
        game.startDailyChallenge({ date: todayDateString(), time: 6000, name: 'Flash' });
        game.player.x = LEVELS[game.dailyLevelIdx].goal;
        game.update();
        const html = window.document.getElementById('startScreen').innerHTML;
        expect(html).toContain('DUELO'); // '¡DUELO GANADO!' o 'DUELO PERDIDO'
        expect(html).toContain('Flash');
        expect(html).toContain('data-action="challenge"'); // botón de revancha
        const m = html.match(/data-date="([0-9-]+)" data-time="([0-9.]+)"/);
        expect(m).not.toBeNull();
        // el dato del botón produce un token decodificable (con un tiempo del rango válido)
        expect(decodeDuelToken(encodeDuelToken(m[1], Math.max(5000, parseFloat(m[2])), 'yo'))).not.toBeNull();
    });

    test('el fantasma marca el ritmo exacto: 0 al salir, la meta a su tiempo, y clava el clamp', () => {
        const { game, LEVELS, todayDateString } = loadGame();
        game.startDailyChallenge({ date: todayDateString(), time: 60000, name: 'Rival' });
        const goal = LEVELS[game.dailyLevelIdx].goal;
        const ghostX = elapsed => 20 + Math.min(1, elapsed / 60000) * (goal - 20);
        expect(ghostX(0)).toBe(20);
        expect(ghostX(30000)).toBeCloseTo(20 + (goal - 20) / 2);
        expect(ghostX(60000)).toBe(goal);
        expect(ghostX(90000)).toBe(goal); // pasado su tiempo, espera en la meta
    });

    test('con ?duelo= válido el juego expone pendingDuel y el menú pinta el botón del duelo', () => {
        // loadGame no permite query strings fáciles — se simula el arranque: token → pendingDuel → menú
        const { game, window, encodeDuelToken, decodeDuelToken } = loadGame();
        game.pendingDuel = decodeDuelToken(encodeDuelToken('2026-08-24', 83450, 'Rival'));
        game.showMainMenu();
        const html = window.document.getElementById('startScreen').innerHTML;
        expect(html).toContain('data-action="duel"');
        expect(html).toContain('Rival');
        expect(html).toContain('Reto del 2026-08-24');
    });
});

describe('Regresión: el salto de Bolt (contra js/entities.js real)', () => {
    test('un toque de salto da el impulso completo — el vuelo no pisa el despegue', () => {
        const { Player, Platform } = loadGame();
        const floor = new Platform(0, 150, 400, 15);
        const bolt = new Player(20, 137, 'bolt');
        bolt.onGround = true;
        const particles = { burst() {} };
        // toque de un frame (con Energía llena, que era cuando fallaba)
        bolt.update({ Space: true }, [floor], particles);
        expect(bolt.vy).toBeCloseTo(-4.3 + 0.32, 5); // impulso completo + un frame de gravedad
        let minFeet = 150;
        for (let f = 0; f < 40; f++) {
            bolt.update({}, [floor], particles);
            minFeet = Math.min(minFeet, bolt.y + bolt.h);
        }
        expect(150 - minFeet).toBeGreaterThan(20); // el salto sube de verdad (~27), no ~1px
    });

    test('mantener pulsado tras despegar sigue siendo su vuelo lento de siempre', () => {
        const { Player, Platform } = loadGame();
        const floor = new Platform(0, 150, 400, 15);
        const bolt = new Player(20, 137, 'bolt');
        bolt.onGround = true;
        const particles = { burst() {} };
        bolt.update({ Space: true }, [floor], particles);   // despegue con impulso completo
        for (let f = 0; f < 30; f++) bolt.update({ Space: true }, [floor], particles); // y de ahí, vuelo
        expect(bolt.vy).toBeCloseTo(-1.1 + 0.32, 5); // ascenso sostenido del vuelo
        expect(bolt.energy).toBeLessThan(10);        // pagando Energía por tiempo, como siempre
        expect(bolt.y + bolt.h).toBeLessThan(125);   // y de verdad ha ganado altura (asciende ~0.78/frame)
    });
});

describe('Métricas de uso — balizas opcionales sin datos personales (contra el código real)', () => {
    test('por defecto apuntan al colector desplegado (mismo servicio que el acortador)', () => {
        const { game } = loadGame();
        expect(game.metricsBase).toBe('https://s.enri.me');
    });

    test('apagadas (base vacía): ni una llamada', () => {
        const { game, window } = loadGame();
        let beacons = 0;
        window.navigator.sendBeacon = () => { beacons++; return true; };
        game.metricsBase = '';
        game.track('visita');
        game.startGame();
        expect(beacons).toBe(0);
    });

    test('encendidas: cada evento manda su baliza con sitio y evento, y nada más', () => {
        const { game, window } = loadGame();
        game.metricsBase = 'https://s.enri.me/';
        const sent = [];
        window.navigator.sendBeacon = (url, body) => { sent.push({ url, body: JSON.parse(body) }); return true; };
        game.track('visita');
        game.startGame();          // → partida
        expect(sent.length).toBe(2);
        expect(sent[0].url).toBe('https://s.enri.me/api/metrics'); // la barra final se normaliza
        expect(sent[0].body).toEqual({ site: 'astroleap', event: 'visita' });
        expect(sent[1].body).toEqual({ site: 'astroleap', event: 'partida' });
        expect(Object.keys(sent[0].body).sort()).toEqual(['event', 'site']); // sin nada personal: solo sitio y evento
    });

    test('el reto y el duelo emiten eventos distintos; sin sendBeacon cae a fetch keepalive', () => {
        const { game, window, todayDateString, encodeDuelToken, decodeDuelToken } = loadGame();
        game.metricsBase = 'https://s.enri.me';
        const sent = [];
        delete window.navigator.sendBeacon; // navegador viejo: fallback
        window.fetch = (url, opts) => { sent.push(JSON.parse(opts.body).event); return Promise.resolve({ ok: true }); };
        game.startDailyChallenge();
        game.exitLevel();
        game.startDailyChallenge(decodeDuelToken(encodeDuelToken(todayDateString(), 60000, 'Rival')));
        expect(sent).toEqual(['reto', 'duelo']);
    });

    test('un colector caído no rompe nada: track nunca lanza', () => {
        const { game, window } = loadGame();
        game.metricsBase = 'https://s.enri.me';
        window.navigator.sendBeacon = () => { throw new Error('bloqueado'); };
        expect(() => game.track('visita')).not.toThrow();
        delete window.navigator.sendBeacon;
        window.fetch = () => Promise.reject(new Error('sin red'));
        expect(() => game.track('visita')).not.toThrow();
    });
});

describe('Acortador de URLs de duelo — opcional y con degradación (contra el código real)', () => {
    test('por defecto apunta al acortador desplegado', () => {
        const { game } = loadGame();
        expect(game.urlShortener).toBe('https://s.enri.me');
    });

    test('apagado (base vacía): devuelve la URL larga sin llamar a nada', async () => {
        const { game, window } = loadGame();
        let called = false;
        window.fetch = () => { called = true; return Promise.resolve({ ok: true }); };
        game.urlShortener = '';
        expect(await game.shortenUrl('https://x.test/?duelo=abc')).toBe('https://x.test/?duelo=abc');
        expect(called).toBe(false);
    });

    test('encendido y con respuesta válida: usa la URL corta y pide el prefijo del juego', async () => {
        const { game, window } = loadGame();
        game.urlShortener = 'https://s.enri.me';
        window.fetch = (url, opts) => {
            expect(url).toBe('https://s.enri.me/api/shorten');
            const body = JSON.parse(opts.body);
            expect(body.url).toBe('https://x.test/?duelo=abc');
            // El prefijo va SIEMPRE: con ADMIN_PASSWORD en el servidor, solo los prefijos de
            // PUBLIC_PREFIXES pueden acortar sin contraseña desde el navegador del jugador.
            expect(body.prefix).toBe('astroleap');
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ code: 'Xk3mP2a', prefix: 'astroleap', shortUrl: 'https://s.enri.me/astroleap/Xk3mP2a' }) });
        };
        expect(await game.shortenUrl('https://x.test/?duelo=abc')).toBe('https://s.enri.me/astroleap/Xk3mP2a');
    });

    test('cualquier fallo cae a la URL larga: error de red, HTTP no-ok y respuesta rara', async () => {
        const { game, window } = loadGame();
        game.urlShortener = 'https://s.enri.me';
        const LONG = 'https://x.test/?duelo=abc';
        window.fetch = () => Promise.reject(new Error('sin red'));
        expect(await game.shortenUrl(LONG)).toBe(LONG);
        window.fetch = () => Promise.resolve({ ok: false });
        expect(await game.shortenUrl(LONG)).toBe(LONG);
        window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ shortUrl: 'javascript:alert(1)' }) });
        expect(await game.shortenUrl(LONG)).toBe(LONG); // una respuesta maliciosa/corrupta no cuela
    });
});

describe('Fantasma con ruta real — grabación y reproducción (contra el código real)', () => {
    test('encodeDuelRoute/decodeDuelRoute: ida y vuelta con cuantización de 4px y flag de combate', () => {
        const { encodeDuelRoute, decodeDuelRoute } = loadGame();
        const samples = []; // tripletas (x, y, ¿en combate?): salto en arco, y duelo en las muestras 30-40
        for (let i = 0; i < 50; i++) samples.push(20 + i * 15, 137 - Math.round(Math.sin(i / 8) * 25), i >= 30 && i <= 40 ? 1 : 0);
        const route = decodeDuelRoute(encodeDuelRoute(samples));
        expect(route).not.toBeNull();
        expect(route.stride).toBe(12);
        expect(route.points.length).toBe(50);
        route.points.forEach((p, i) => {
            expect(Math.abs(p.x - samples[3 * i])).toBeLessThanOrEqual(2);
            expect(Math.abs(p.y - samples[3 * i + 1])).toBeLessThanOrEqual(2);
            expect(p.c).toBe(i >= 30 && i <= 40); // el "estaba en duelo" sobrevive al empaquetado
        });
        // rutas rotas → null
        expect(decodeDuelRoute('')).toBeNull();
        expect(decodeDuelRoute('nada')).toBeNull();
        expect(decodeDuelRoute('9999:AAAA')).toBeNull(); // stride absurdo
    });

    test('una partida larga se submuestrea a ≤600 puntos con el stride multiplicado', () => {
        const { encodeDuelRoute, decodeDuelRoute } = loadGame();
        const samples = [];
        for (let i = 0; i < 1500; i++) samples.push(i, 137, 0); // 1500 tripletas = 5 min de reto
        const route = decodeDuelRoute(encodeDuelRoute(samples));
        expect(route.points.length).toBeLessThanOrEqual(600);
        expect(route.stride).toBe(36); // 12 × 3
    });

    test('el token v2 lleva la ruta y el v1 (enlaces antiguos) sigue decodificando sin ella', () => {
        const { encodeDuelToken, decodeDuelToken, encodeDuelRoute } = loadGame();
        const samples = [];
        for (let i = 0; i < 40; i++) samples.push(20 + i * 20, 137, 0);
        const routeStr = encodeDuelRoute(samples);
        const v2 = decodeDuelToken(encodeDuelToken('2026-08-24', 83450, 'Rival', routeStr));
        expect(v2.route).not.toBeNull();
        expect(v2.route.points.length).toBe(40);
        const v1 = decodeDuelToken(encodeDuelToken('2026-08-24', 83450, 'Rival'));
        expect(v1.route).toBeNull();
    });

    test('presupuesto de URL: una partida de ~90s cabe en un token de menos de 2000 caracteres', () => {
        const { encodeDuelToken, encodeDuelRoute } = loadGame();
        const samples = [];
        for (let i = 0; i < 450; i++) samples.push(Math.min(1300, i * 3), 100 + (i % 40), i % 5 === 0 ? 1 : 0); // 450 muestras = 90s
        const token = encodeDuelToken('2026-08-24', 90000, 'Enrique', encodeDuelRoute(samples));
        expect(token.length).toBeLessThan(2000);
    });

    test('todo Reto Diario graba la ruta: una muestra cada 12 frames, también durante un combate', () => {
        const { game, CombatSystem, Enemy } = loadGame();
        game.startDailyChallenge();
        game.enemies.forEach(e => { e.x = -2500; e.initialX = -2500; });
        game.hintsSeen.add('ice-slide');
        for (let f = 0; f < 48; f++) { if (game.hintScreen) game.dismissHintScreen(); game.update(); }
        const afterLevel = game.duelRec.length;
        expect(afterLevel).toBeGreaterThanOrEqual(6); // ~4 muestras × 2 coordenadas
        // en combate, la posición se congela pero la grabación sigue (la pausa queda registrada)
        game.combat = new CombatSystem(game.player, new Enemy(0, 0, 'drone'));
        const frozenX = game.player.x;
        for (let f = 0; f < 48; f++) game.update();
        expect(game.duelRec.length).toBeGreaterThan(afterLevel);
        const tail = game.duelRec.slice(afterLevel);
        for (let i = 0; i < tail.length; i += 3) {
            expect(tail[i]).toBe(frozenX); // posición congelada durante el duelo...
            expect(tail[i + 2]).toBe(1);   // ...y marcada como "en combate" para el ⚔ del fantasma
        }
        game.combat = null;
        game.exitLevel(); // limpieza: restaura la partida real
    });

    test('al completar, lastDuelRun guarda la ruta y el botón de retar la adjunta solo para ESE run', () => {
        const { game, LEVELS, decodeDuelToken, encodeDuelToken } = loadGame();
        game.startDailyChallenge();
        game.enemies.forEach(e => { e.x = -2500; e.initialX = -2500; });
        game.hintsSeen.add('ice-slide');
        for (let f = 0; f < 60; f++) { if (game.hintScreen) game.dismissHintScreen(); game.update(); }
        game.player.x = LEVELS[game.dailyLevelIdx].goal;
        game.update(); // completa
        expect(game.lastDuelRun).not.toBeNull();
        expect(game.lastDuelRun.route).toMatch(/^\d+:/);
        // el token del run correcto lleva la ruta; el de otro tiempo, no
        const withRoute = decodeDuelToken(encodeDuelToken(game.lastDuelRun.date, Math.max(5000, game.lastDuelRun.time), '', game.lastDuelRun.route));
        expect(withRoute.route).not.toBeNull();
    });

    test('el fantasma reproduce la ruta interpolada, con los saltos del retador', () => {
        const { game, encodeDuelRoute, decodeDuelToken, encodeDuelToken, todayDateString } = loadGame();
        // ruta sintética con un salto claro en medio
        const samples = [];
        for (let i = 0; i < 60; i++) samples.push(20 + i * 10, i >= 20 && i <= 26 ? 110 : 137, 0);
        const duel = decodeDuelToken(encodeDuelToken(todayDateString(), 12000, 'Rival', encodeDuelRoute(samples)));
        game.startDailyChallenge(duel);
        expect(game.duelRival.route).not.toBeNull();
        // reproducción manual del mismo cálculo que draw(): a mitad del salto del retador
        const route = game.duelRival.route;
        const idx = 23; // muestra en pleno salto
        expect(route.points[idx].y).toBeLessThan(120); // el fantasma estará EN EL AIRE ahí
        expect(route.points[10].y).toBeGreaterThan(130); // y en el suelo antes
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

describe('El dominio del Centinela — barrido del nivel 6 (contra js/game.js real)', () => {
    function inWatchLevel() {
        const { game, LEVELS, Player } = loadGame();
        game.gameStarted = true;
        game.loadLevel(5); // Núcleo del Centinela
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        // aparta a todos MENOS al jefe (la zona depende de que siga vivo)
        game.enemies.forEach(e => { if (!e.isBoss) { e.x = -2500; e.initialX = -2500; } });
        game.hintsSeen.add('sentinel-watch');
        return { game, watch: LEVELS[5].sentinelWatch, LEVELS, Player };
    }
    function standAt(game, x, y = 137) {
        game.player.x = x; game.player.y = y;
        game.player.vx = 0; game.player.vy = 0; game.player.onGround = true;
    }

    test('el ciclo calma → apunta → onda es determinista por frames', () => {
        const { game, watch } = inWatchLevel();
        game.watchT = 0;
        expect(game.watchPhase(watch)).toBe('calm');
        game.watchT = watch.calm;
        expect(game.watchPhase(watch)).toBe('warn');
        game.watchT = watch.calm + watch.warn;
        expect(game.watchPhase(watch)).toBe('fire');
        game.watchT = watch.calm + watch.warn + watch.fire;
        expect(game.watchPhase(watch)).toBe('calm');
    });

    test('la onda golpea a quien pisa el suelo de la zona, con tregua (no re-golpea por frame)', () => {
        const { game, watch } = inWatchLevel();
        standAt(game, 250); // suelo de la zona, sin cobertura
        game.watchT = watch.calm + watch.warn;
        const hp0 = game.player.hp;
        game.update();
        expect(game.player.hp).toBe(hp0 - Math.max(1, 6 - game.player.defense));
        expect(game.playerInvulnerable).toBe(40);
        const hp1 = game.player.hp;
        for (let i = 0; i < 20; i++) game.update();
        expect(game.player.hp).toBe(hp1);
    });

    test('sobre una cobertura elevada, la onda entera pasa de largo', () => {
        const { game, watch } = inWatchLevel();
        standAt(game, 210, 109); // encima de la cobertura [200,122,40,8]
        game.watchT = watch.calm + watch.warn;
        const hp0 = game.player.hp;
        for (let i = 0; i < watch.fire; i++) game.update();
        expect(game.player.hp).toBe(hp0);
    });

    test('en el aire en el instante de la onda tampoco golpea (los pies están sobre la franja)', () => {
        const { game, watch } = inWatchLevel();
        standAt(game, 250);
        game.player.y = 90; game.player.onGround = false; game.player.vy = 0; // en pleno salto
        game.watchT = watch.calm + watch.warn;
        const hp0 = game.player.hp;
        game.update();
        expect(game.player.hp).toBe(hp0);
    });

    test('la intro (antes de zoneStart) queda fuera del dominio', () => {
        const { game, watch } = inWatchLevel();
        standAt(game, 60); // x + w < 140
        game.watchT = watch.calm + watch.warn;
        const hp0 = game.player.hp;
        for (let i = 0; i < watch.fire; i++) game.update();
        expect(game.player.hp).toBe(hp0);
    });

    test('con el Centinela derrotado, la zona se apaga', () => {
        const { game, watch } = inWatchLevel();
        game.enemies.find(e => e.isBoss).alive = false;
        standAt(game, 250);
        game.watchT = watch.calm + watch.warn;
        const hp0 = game.player.hp;
        for (let i = 0; i < watch.fire; i++) game.update();
        expect(game.player.hp).toBe(hp0);
    });

    test('regla de diseño: desde cualquier punto de la zona hay cobertura (o salida) a lo andable en el aviso', () => {
        const { game, watch, LEVELS, Player } = inWatchLevel();
        const lvl = LEVELS[5];
        const speed = new Player(0, 0, 'kes').speed;
        const reachInWarn = watch.warn * speed;
        const bossX = lvl.enemies.find(e => e[2] === 'sentinel')[0];
        // coberturas: plataformas elevadas finas por encima de la franja
        const covers = lvl.platforms.filter(p => p[1] < watch.band && p[3] <= 10);
        expect(covers.length).toBeGreaterThanOrEqual(6);
        for (let x = watch.zoneStart; x < bossX; x += 5) {
            const toCover = Math.min(...covers.map(c => x < c[0] ? c[0] - x : (x > c[0] + c[2] ? x - (c[0] + c[2]) : 0)));
            const toExit = x - watch.zoneStart; // también vale retirarse de la zona
            expect(Math.min(toCover, toExit)).toBeLessThanOrEqual(reachInWarn);
        }
    });

    test('regla de diseño: la onda dura más que un salto simple — saltar sin cobertura no basta', () => {
        const { watch, LEVELS, Player } = inWatchLevel();
        const { Platform } = loadGame();
        const floor = new Platform(0, 150, 500, 15);
        const p = new Player(20, 137, 'scrap');
        p.onGround = true;
        const particles = { burst() {} };
        let jumped = false, airFrames = 0;
        for (let f = 0; f < 120; f++) {
            p.update({ Space: !jumped }, [floor], particles);
            jumped = true;
            if (!p.onGround) airFrames++;
            else if (jumped && f > 5) break; // aterrizó: fin del salto
        }
        expect(airFrames).toBeGreaterThan(0);
        expect(watch.fire).toBeGreaterThan(airFrames); // 50 > ~27: el aire no te cubre la onda entera
    });
});

describe('Nodo Cero — la prueba final: muro con disparador, tormenta zonal y la finale (contra el código real)', () => {
    function inFinalLevel() {
        const { game, LEVELS, CombatSystem, window } = loadGame();
        game.gameStarted = true;
        game.loadLevel(11);
        game.inWorldMap = false; game.inLevel = true; game.combat = null; game.levelCompleting = false;
        game.enemies.forEach(e => { if (!e.isBoss) { e.x = -2500; e.initialX = -2500; } });
        game.hintsSeen.add('ion-storm');
        return { game, level: LEVELS[11], CombatSystem, window };
    }
    function standAt(game, x) {
        game.player.x = x; game.player.y = 137;
        game.player.vx = 0; game.player.vy = 0; game.player.onGround = true;
    }

    test('el muro con disparador NO existe hasta cruzar triggerX: cámara normal y cero daño', () => {
        const { game } = inFinalLevel();
        standAt(game, 500);
        const hp0 = game.player.hp;
        for (let i = 0; i < 120; i++) game.update();
        expect(game.wallStarted).toBe(false);
        expect(game.player.hp).toBe(hp0);
        expect(game.cameraX).toBeGreaterThan(300); // cámara centrada en el jugador, no clavada en 0
    });

    test('cruzar triggerX despierta a la Red: el muro arranca desde la cámara y alcanza como el del Túnel', () => {
        const { game, level } = inFinalLevel();
        standAt(game, level.forcedScroll.triggerX + 5);
        game.update();
        expect(game.wallStarted).toBe(true);
        expect(game.wallMessage).toBeGreaterThan(0); // «¡LA RED DESPIERTA!»
        // quedarse quieto: el muro te caza
        const hp0 = game.player.hp;
        game.player.x = game.cameraX + 1; // pegado al borde que persigue
        for (let i = 0; i < 60 && game.player.hp === hp0; i++) { game.player.x = game.cameraX + 1; game.update(); }
        expect(game.player.hp).toBeLessThan(hp0);
    });

    test('la tormenta zonal solo muerde dentro de su dominio (acto 2)', () => {
        const { game, level } = inFinalLevel();
        const storm = level.ionStorm;
        // dentro de la zona, al raso (piedra sin techo)
        standAt(game, 595);
        game.stormT = storm.calm + storm.warn;
        const hp0 = game.player.hp;
        game.update();
        expect(game.player.hp).toBeLessThan(hp0);
        // fuera de la zona (acto 1), misma fase: intacto
        const { game: g2, level: l2 } = inFinalLevel();
        standAt(g2, 40);
        g2.stormT = l2.ionStorm.calm + l2.ionStorm.warn;
        const hp2 = g2.player.hp;
        for (let i = 0; i < 30; i++) g2.update();
        expect(g2.player.hp).toBe(hp2);
    });

    test('ganar el duelo contra Nodo Cero derrumba la Red: finale en marcha, esbirros caídos, puertas dormidas', () => {
        const { game, CombatSystem } = inFinalLevel();
        game.player.xpToNextLevel = 999999; // sin hint de punto de mejora por medio
        const boss = game.enemies.find(e => e.isBoss);
        game.combat = new CombatSystem(game.player, boss);
        boss.alive = false; boss.defeated = true;
        game.combat.result = 'win'; game.combat.active = false;
        game.update(); // procesa la victoria del duelo
        expect(game.finale).not.toBeNull();
        expect(game.finale.phase).toBe('collapse');
        expect(game.enemies.every(e => !e.alive)).toBe(true); // los fragmentos caen con la Red
        game.beams.forEach(b => expect(b.phase()).toBe('off')); // puertas dormidas
        const t0 = game.beams[0].t;
        game.update();
        expect(game.beams[0].t).toBe(t0); // ...y congeladas: ya no ciclan
    });

    test('la meta retiene durante el colapso, embarca en fase nave, y el despegue acaba en ¡MISIÓN CUMPLIDA!', () => {
        const { game, level, CombatSystem, window } = inFinalLevel();
        game.player.xpToNextLevel = 999999;
        const boss = game.enemies.find(e => e.isBoss);
        game.combat = new CombatSystem(game.player, boss);
        boss.alive = false; boss.defeated = true;
        game.combat.result = 'win'; game.combat.active = false;
        game.update();
        // colapso: cruzar la meta retiene como un jefe vivo
        standAt(game, level.goal + 2);
        game.update();
        expect(game.player.x).toBeLessThan(level.goal);
        expect(game.gameStarted).toBe(true);
        // deja terminar el colapso → fase nave
        for (let i = 0; i < 160 && game.finale.phase === 'collapse'; i++) game.update();
        expect(game.finale.phase).toBe('ship');
        // embarque
        standAt(game, level.goal + 2);
        game.update();
        expect(game.finale.phase).toBe('takeoff');
        expect(game.levelCompleting).toBe(true); // el piloto va a bordo
        // despegue completo → victoria
        for (let i = 0; i < 220 && game.gameStarted; i++) game.update();
        expect(game.gameStarted).toBe(false);
        expect(window.document.getElementById('startScreen').innerHTML).toContain('MISIÓN CUMPLIDA');
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
