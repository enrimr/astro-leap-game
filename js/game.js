const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('gameContainer');
const startScreen = document.getElementById('startScreen');
const moveControls = document.getElementById('moveControls');
const combatButtonsEl = document.getElementById('combatButtons');
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const btnJump = document.getElementById('btnJump');
const btnExit = document.getElementById('btnExit');
const btnMusicToggle = document.getElementById('btnMusicToggle');
const btnSfxToggle = document.getElementById('btnSfxToggle');
const btnReduceFxToggle = document.getElementById('btnReduceFxToggle');
// El <span> del botón táctil "2" (Habilidad) del menú de combate — su texto se actualiza por
// piloto en Game.updateTouchUI(), igual que el menú del canvas (ver CombatSystem.actions).
const combatAbilityBtnSpan = combatButtonsEl ? combatButtonsEl.querySelector('[data-code="Digit2"] span') : null;

const IS_TOUCH_DEVICE = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const SAVE_KEY = 'astroLeapSave_v1';
const BEST_TIMES_KEY = 'astroLeapBestTimes_v1';
const MAX_BEST_TIMES = 5;
// Avisos contextuales de una sola vez (doble salto, primer combate). Aparte de SAVE_KEY a
// propósito: son puramente informativos, así que no deben reaparecer en una Nueva Partida
// ni tras un Game Over — solo la primera vez que ese jugador se topa con la situación.
const HINTS_SEEN_KEY = 'astroLeapHintsSeen_v1';
// Un único registro { date, time, hero } — el mejor intento de HOY, se pisa solo al cambiar de
// día. No es una lista de histórico: eso es una mejora aparte, esto es la versión mínima.
const DAILY_KEY = 'astroLeapDaily_v1';

// El canvas mantiene su aspect-ratio 320:180 SIEMPRE (también en juego), así que en móviles
// #gameContainer puede quedar más bajo que el propio menú (título+subtítulo+botones). Mientras
// el menú está visible le damos una altura mínima con esta clase; startGame() la quita para que
// el canvas recupere su alto normal en cuanto empieza a jugarse.
function openMenuOverlay() { startScreen.style.display = 'flex'; gameContainer.classList.add('menu-open'); }
function closeMenuOverlay() { startScreen.style.display = 'none'; gameContainer.classList.remove('menu-open'); }

// Pide pantalla completa nativa al arrancar a jugar, para quitar de en medio la barra de
// direcciones del navegador en Android/Chrome (Safari de iPhone no lo permite desde JS — ahí
// la única forma real es "Añadir a pantalla de inicio", ver las meta apple-mobile-web-app-* del
// <head>). Tiene que llamarse dentro del gesto de clic del usuario o el navegador lo rechaza.
function requestMobileFullscreen() {
    if (!IS_TOUCH_DEVICE || document.fullscreenElement) return;
    const el = document.documentElement;
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!request) return;
    try {
        const result = request.call(el);
        if (result && result.catch) result.catch(() => { /* rechazado por el navegador: se sigue jugando igual, solo sin fullscreen nativo */ });
    } catch (e) { /* algunos navegadores lanzan en vez de rechazar la promesa */ }
}

// Gráfico de cabecera: un único icono pequeño (luna + un par de cráteres + estrellas) que se
// reutiliza a ambos lados del título. Al ser una sola constante compartida, cambiar el gráfico
// de la cabecera es tocar un solo sitio en vez de mantener una escena grande a mano.
const MENU_HEADER_ART_SVG = `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="32" cy="34" r="26" fill="#ff5ecb" opacity="0.15"/>
    <circle cx="32" cy="34" r="17" fill="#ff5ecb" opacity="0.85"/>
    <circle cx="26" cy="27" r="3" fill="#c93ea0" opacity="0.5"/>
    <circle cx="39" cy="40" r="2" fill="#c93ea0" opacity="0.5"/>
    <circle cx="10" cy="10" r="1.4" fill="#f5f3ff" opacity="0.7"/>
    <circle cx="55" cy="15" r="1" fill="#f5f3ff" opacity="0.5"/>
    <circle cx="13" cy="53" r="1" fill="#f5f3ff" opacity="0.5"/>
</svg>`;

// El canvas dibuja siempre en el sistema de coordenadas lógico GAME_WIDTH x GAME_HEIGHT,
// pero el buffer interno se redimensiona a la resolución real de pantalla (con devicePixelRatio)
// para que las formas, gradientes y texto salgan nítidos en vez de pixelados/borrosos al escalar por CSS.
let fitCanvasW = 0, fitCanvasH = 0;
function fitCanvas() {
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(cssW * dpr), targetH = Math.round(cssH * dpr);
    if (targetW === fitCanvasW && targetH === fitCanvasH) return;
    fitCanvasW = targetW; fitCanvasH = targetH;
    canvas.width = targetW; canvas.height = targetH;
    ctx.setTransform(targetW / GAME_WIDTH, 0, 0, targetH / GAME_HEIGHT, 0, 0);
}

// m:ss.d — el cronómetro de la partida (tiempo real de reloj, no en frames: así no depende
// de si el navegador va a 60fps o va renqueando, que es lo justo para comparar tiempos).
function formatTime(ms) {
    const totalMs = Math.max(0, Math.round(ms));
    const m = Math.floor(totalMs / 60000);
    const s = (totalMs % 60000) / 1000;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

// Fecha+hora compacta para la tabla de mejores tiempos (p.ej. "21 ago, 14:32") — vive en el
// menú HTML (#startScreen), no en el canvas, así que no hay límite de ancho tan estricto como
// el resto del HUD, pero igualmente sin año para no alargar la fila sin necesidad.
function formatRecordDate(ts) {
    try {
        return new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
}

// ---- Reto Diario: mismo nivel y mismo generador de números aleatorios (sembrado por la fecha)
// para todo el mundo ese día, así que comparar tiempos significa algo de verdad — ver RNG en
// entities.js. Determinista: la MISMA fecha da SIEMPRE la MISMA semilla y el MISMO piloto.

// mulberry32: generador pseudoaleatorio determinista minúsculo (sin dependencias, coherente con
// que el resto del juego tampoco usa ninguna) — misma semilla, misma secuencia siempre.
function mulberry32(seed) {
    let s = seed | 0;
    return function () {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// Hash de cadena → entero, para convertir "2026-08-24" en una semilla numérica.
function hashStringToSeed(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return h;
}
// Fecha local en YYYY-MM-DD (no UTC — el reto cambia a medianoche de quien juega, no en Londres).
function todayDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// El piloto de hoy: determinista a partir de la fecha, rota entre los 4. Todos comparten las
// mismas stats de combate (solo cambian traversal + nombre de Habilidad), así que forzar
// cualquiera de los 4 es igual de justo para cualquier visitante, tenga o no progreso guardado.
function dailyHeroFor(dateStr) {
    const seed = hashStringToSeed(dateStr + ':hero');
    return HERO_ORDER[Math.abs(seed) % HERO_ORDER.length];
}
// El nivel de hoy: determinista, rota SOLO entre los del Mundo 1 sin jefe (Cráter de Amerizaje,
// Grietas de Hielo) — es la única zona diseñada para completarse con un personaje recién creado,
// sin ningún nivel/stat previo (el Reto Diario siempre arranca un jugador desde cero, nunca usa
// el progreso guardado real). Los niveles con jefe se quedan fuera a propósito: un jefe pensado
// para alguien que ya subió de nivel en 2 sectores previos aplastaría a un nivel 1 recién salido
// de fábrica — añadirlos a la rotación es la mejora obvia siguiente, pero necesita antes escalar
// las stats iniciales del jugador según el nivel, no solo elegir el mapa.
const DAILY_LEVEL_POOL = [0, 1];
function dailyLevelFor(dateStr) {
    const seed = hashStringToSeed(dateStr + ':level');
    return DAILY_LEVEL_POOL[Math.abs(seed) % DAILY_LEVEL_POOL.length];
}
// La dificultad de hoy: multiplicador determinista sobre HP/ataque de los enemigos del nivel
// (incluida la Reina Larva si algún día entra en DAILY_LEVEL_POOL) — para que rejugar el MISMO
// nivel en días distintos no se sienta idéntico, y para que "hoy toca un día duro" sea parte del
// gancho de volver mañana. La Defensa no se toca: solo cambia cuánto aguantan y cuánto pegan, no
// la fórmula de daño en sí.
// emoji: la versión de un vistazo de la dificultad en el texto de compartir (tipo Wordle:
// quien lo recibe entiende el tier sin conocer las etiquetas del juego).
const DAILY_DIFFICULTIES = [
    { label: 'Suave', mult: 0.85, emoji: '🟢' },
    { label: 'Normal', mult: 1.0, emoji: '🟡' },
    { label: 'Intensa', mult: 1.15, emoji: '🟠' },
    { label: 'Brutal', mult: 1.3, emoji: '🔴' }
];
function dailyDifficultyFor(dateStr) {
    const seed = hashStringToSeed(dateStr + ':difficulty');
    return DAILY_DIFFICULTIES[Math.abs(seed) % DAILY_DIFFICULTIES.length];
}

// Texto centrado partido en líneas para que quepa en un ancho máximo (px). Usado por la
// pantalla de desbloqueo de personaje, la única con un párrafo en vez de una línea suelta.
function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '', ly = y;
    for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            ctx.fillText(line, cx, ly);
            line = word; ly += lineHeight;
        } else line = test;
    }
    if (line) ctx.fillText(line, cx, ly);
}

function makeStars(count, maxX) {
    const stars = [];
    for (let i = 0; i < count; i++) {
        stars.push({ x: Math.random() * maxX, y: Math.random() * GAME_HEIGHT, size: Math.random() < 0.15 ? 1.6 : 0.9, tw: Math.random() * Math.PI * 2 });
    }
    return stars;
}

class Game {
    constructor() {
        this.unlockedCharacters = new Set(['kes']);
        this.player = new Player(20, 100, 'kes');
        this.currentLevel = 0; this.platforms = []; this.enemies = []; this.goalFlag = null; this.capsules = []; this.energyCells = []; this.beams = [];
        this.combat = null; this.combatTransition = null; this.keys = {}; this.cameraX = 0; this.gameStarted = false;
        this.levelUpMessage = 0; this.levelCompleteMessage = 0; this.livesLostMessage = 0; this.extraLifeMessage = 0; this.extraEnergyMessage = 0;
        this.unlockScreen = null; // id de héroe mientras se muestra su pantalla de desbloqueo (pausa el juego)
        this.charSelectOpen = false; this.charSelectIndex = 0; // hangar de selección de personaje (pausa el juego)
        this.collectedPickups = new Set(); // "life-N" / "energy-N" / "reinforced-N-N" por nivel, para no poder re-recoger/re-romper saliendo y entrando
        this.worldMap = new WorldMap(); this.inWorldMap = false; this.inLevel = false;
        this.levelCompleting = false; this.levelCompleteTimeout = null; this.playerInvulnerable = 0;
        this.autoScrollX = 0; this.forcedScrollDelay = 0;
        this.particles = new ParticleSystem();
        this.shake = 0;
        this.mapStars = makeStars(70, GAME_WIDTH);
        this.levelStars = makeStars(140, 1200);
        this.musicOn = this.loadAudioPref('astroLeapMusicOn');
        this.sfxOn = this.loadAudioPref('astroLeapSfxOn');
        // Accesibilidad: reduce/anula el screen shake y el parpadeo de invulnerabilidad, y calma
        // el pulso rojo del muro del Túnel de Escape. A diferencia de música/sonido, empieza
        // APAGADO por defecto — es un ajuste que se activa a propósito, no algo que se silencie.
        this.reduceEffects = this.loadReduceEffectsPref();
        this.runStartTime = 0; this.runElapsed = 0; // cronómetro: tiempo real de reloj desde que arrancas hasta la victoria
        this.bestTimes = this.loadBestTimes();
        this.hintScreen = null; // { text } mientras se muestra un aviso contextual (pausa el juego, ver showHint())
        this.hintsSeen = this.loadHintsSeen();
        this.dailyMode = false; // true durante un intento del Reto Diario — ver startDailyChallenge()
        this.dailyRecord = this.loadDailyRecord();
        this.loadProgress();
        this.setupInput();
        this.setupTouchControls();
        this.applyAudioPrefs();
        this.applyReduceEffectsPref();
        startScreen.innerHTML = this.buildMenuScreen({ title: 'ASTRO&nbsp;LEAP', subtitle: '4 zonas · 12 sectores · duelos de energía' });
    }

    loadBestTimes() {
        try {
            const raw = localStorage.getItem(BEST_TIMES_KEY);
            const list = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(list)) return [];
            // Migración desde el formato viejo (array de números sueltos, sin fecha): un record
            // guardado antes de este cambio se queda sin fecha en vez de perderse de la lista.
            return list
                .map(entry => typeof entry === 'number' ? { time: entry, date: null } : entry)
                .filter(entry => entry && typeof entry.time === 'number');
        } catch (e) { return []; }
    }
    // Guarda un tiempo de partida COMPLETA (Game Over no cuenta, solo terminar el juego entero).
    // Devuelve true si ha quedado el nuevo mejor tiempo (el primero de la lista).
    saveBestTime(ms) {
        const entry = { time: ms, date: Date.now() };
        this.bestTimes.push(entry);
        this.bestTimes.sort((a, b) => a.time - b.time);
        this.bestTimes = this.bestTimes.slice(0, MAX_BEST_TIMES);
        try { localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(this.bestTimes)); } catch (e) { /* sin almacenamiento: no pasa nada, solo no se guarda */ }
        return this.bestTimes[0] === entry;
    }
    loadDailyRecord() {
        try {
            const raw = localStorage.getItem(DAILY_KEY);
            return raw ? JSON.parse(raw) : null; // { date, time, hero } | null
        } catch (e) { return null; }
    }
    // Se pisa solo si es un día distinto o si el tiempo de hoy mejora al guardado. Devuelve true
    // si ha quedado como el mejor intento de HOY (para el "¡Nuevo mejor tiempo de hoy!").
    saveDailyRecord(dateStr, ms, hero) {
        const prev = this.dailyRecord;
        const isSameDay = prev && prev.date === dateStr;
        const best = isSameDay ? Math.min(prev.time, ms) : ms;
        // Estrictamente mejor: un empate exacto NO es "nuevo mejor tiempo", solo lo iguala.
        const isRecord = !isSameDay || ms < prev.time;
        this.dailyRecord = { date: dateStr, time: best, hero };
        try { localStorage.setItem(DAILY_KEY, JSON.stringify(this.dailyRecord)); } catch (e) { /* sin almacenamiento: no pasa nada, solo no se guarda */ }
        return isRecord;
    }
    loadHintsSeen() {
        try {
            const raw = localStorage.getItem(HINTS_SEEN_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(list) ? list : []);
        } catch (e) { return new Set(); }
    }
    // Diálogo modal (pausa update(), ver el guard al inicio de update()) para explicar sobre la
    // marcha la primera vez que una mecánica no obvia entra en juego, en vez de dejarlo solo en
    // el menú de Ayuda. Cada id se muestra una sola vez por navegador — nunca se repite, ni
    // siquiera tras una Nueva Partida o un Game Over completo (ver HINTS_SEEN_KEY). Mismo patrón
    // de pausa que unlockScreen/charSelectOpen, pero sin sustituir la pantalla entera: se dibuja
    // encima del juego oscurecido para que se note que sigue ahí, solo congelado.
    showHint(id, text) {
        if (this.hintsSeen.has(id)) return;
        // Si ya hay un aviso en pantalla ESTE mismo frame (p.ej. saltas justo encima de un enemigo
        // y disparas el de salto y el de combate a la vez), no lo pisamos ni lo marcamos como visto
        // — si lo hiciéramos, el primero desaparecería sin que el jugador llegara a leerlo y
        // quedaría "visto" para siempre. Se reintentará la próxima vez que se dé la situación.
        if (this.hintScreen) return;
        this.hintsSeen.add(id);
        try { localStorage.setItem(HINTS_SEEN_KEY, JSON.stringify(Array.from(this.hintsSeen))); } catch (e) { /* sin almacenamiento: se mostrará otra vez la próxima sesión, no pasa nada */ }
        this.hintScreen = { text };
    }
    dismissHintScreen() {
        if (!this.hintScreen) return;
        this.hintScreen = null;
        if (window.SFX) SFX.confirm();
    }
    // Capa oscura sobre el frame actual (congelado, no se vuelve a dibujar detrás) + caja de
    // mensaje centrada. Se llama SIEMPRE al final de draw() (nivel o combate), a diferencia de
    // drawUnlockScreen/drawHangarScreen que sustituyen el frame entero — aquí interesa que se note
    // que el juego sigue debajo, solo en pausa.
    drawHintOverlay(ctx) {
        if (!this.hintScreen) return;
        ctx.save();
        ctx.fillStyle = 'rgba(5,2,15,0.75)';
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        const w = 270, h = 66, x = GAME_WIDTH / 2 - w / 2, y = GAME_HEIGHT / 2 - h / 2;
        ctx.save();
        ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(20,12,48,0.97)';
        ctx.fillRect(x, y, w, h);
        ctx.restore();
        ctx.strokeStyle = PALETTE.accent; ctx.lineWidth = 1.4;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = PALETTE.ink; ctx.font = '8px "Rajdhani", sans-serif'; ctx.textAlign = 'center';
        wrapText(ctx, this.hintScreen.text, GAME_WIDTH / 2, y + 16, w - 24, 11);
        ctx.fillStyle = PALETTE.accent; ctx.font = 'bold 8px "Rajdhani", sans-serif';
        ctx.fillText(IS_TOUCH_DEVICE ? 'TOCA PARA CONTINUAR' : 'PULSA ESPACIO PARA CONTINUAR', GAME_WIDTH / 2, y + h - 8);
        ctx.textAlign = 'left';
        ctx.restore();
    }
    renderBestTimesHTML() {
        if (!this.bestTimes.length) return '';
        const items = this.bestTimes.map((entry, i) => {
            // Records guardados antes de este cambio no tienen fecha (ver loadBestTimes) — se
            // listan igual, solo sin la columna de fecha, en vez de perderse de la tabla.
            const dateHTML = entry.date ? `<span class="best-times-date">${formatRecordDate(entry.date)}</span>` : '';
            return `<li>${i + 1}. ${formatTime(entry.time)}${dateHTML}</li>`;
        }).join('');
        return `<div class="best-times"><p class="best-times-title">MEJORES TIEMPOS</p><ol>${items}</ol></div>`;
    }
    hasSaveData() {
        try { return localStorage.getItem(SAVE_KEY) !== null; } catch (e) { return false; }
    }
    // Construye el HTML entero de la pantalla de menú (arranque / Game Over / Victoria son la
    // misma estructura, solo cambia el título y si hay o no "Continuar partida" según haya save).
    buildMenuScreen({ title, subtitle = '', resultHTML = '' }) {
        const hasSave = this.hasSaveData();
        const timesHTML = this.renderBestTimesHTML() || '<p class="best-times-empty">Todavía no has completado ninguna partida.</p>';
        const today = todayDateString();
        const playedToday = this.dailyRecord && this.dailyRecord.date === today;
        // Nivel/dificultad/piloto de hoy visibles ANTES de entrar — mismo cálculo que usará
        // startDailyChallenge(), así que lo que se anuncia aquí es justo lo que te vas a encontrar.
        const todayLevelName = LEVELS[dailyLevelFor(today)].name;
        const todayDifficulty = dailyDifficultyFor(today).label;
        const dailyNote = playedToday
            ? `Hoy: ${formatTime(this.dailyRecord.time)} con ${HEROES[this.dailyRecord.hero].name} (${todayLevelName})`
            : `Hoy: ${todayLevelName} · dificultad ${todayDifficulty} · piloto sorpresa`;
        return `
            <div class="menu-header">
                <div class="menu-header-art">${MENU_HEADER_ART_SVG}</div>
                <h1>${title}</h1>
                <div class="menu-header-art">${MENU_HEADER_ART_SVG}</div>
            </div>
            ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
            ${resultHTML}
            <div class="menu-panel" id="menuMain">
                <button class="menu-btn" data-action="play">${hasSave ? 'CONTINUAR PARTIDA' : 'JUGAR'}</button>
                ${hasSave ? '<button class="menu-btn" data-action="newgame">NUEVA PARTIDA</button>' : ''}
                <button class="menu-btn daily-btn" data-action="daily">RETO DIARIO${playedToday ? ' ✓' : ''}</button>
                <p class="daily-note">${dailyNote}</p>
                <!-- Opciones secundarias como enlaces discretos (clase .quiet), no como botones
                     de tarjeta — no deben competir visualmente con JUGAR / RETO DIARIO. Siguen
                     siendo .menu-btn para heredar la navegación con flechas y el click delegado. -->
                <div class="menu-quiet-row">
                    <button class="menu-btn quiet" data-action="times">Mejores tiempos</button>
                    <button class="menu-btn quiet" data-action="help">Ayuda</button>
                </div>
            </div>
            <div class="menu-panel" id="menuTimes" hidden>
                ${timesHTML}
                <button class="menu-btn" data-action="back">◂ VOLVER</button>
            </div>
            <div class="menu-panel" id="menuHelp" hidden>
                <p class="help-text">
                    <b>Mover</b> — ← →<br>
                    <b>Saltar</b> — ESPACIO (segunda vez en el aire según el piloto: doble salto, vuelo, impulso...)<br>
                    <b>Combate</b> — ↑↓ + ESPACIO, o las teclas 1-4<br>
                    <b>Pilotos</b> — Kes dobla salto, Bolt vuela, Shade da un impulso lateral, Scrap rompe refuerzos.
                    Se desbloquean derrotando al jefe de cada mundo; cámbialos desde la chapa del mapa o con la tecla C.<br>
                    <b>Salir de un nivel</b> — ESC o el botón ✕<br>
                    <b>Accesibilidad</b> — el tercer botón de la esquina (junto a música/sonido) reduce el temblor de pantalla y el parpadeo de invulnerabilidad
                </p>
                <button class="menu-btn" data-action="back">◂ VOLVER</button>
            </div>`;
    }
    // Pantalla de fin del Reto Diario: a diferencia del menú completo (buildMenuScreen), aquí
    // solo caben dos acciones — compartir el tiempo y volver al menú — para que el resultado sea
    // el protagonista y no haya media docena de botones compitiendo con él.
    buildDailyResultScreen({ title, subtitle = '', resultHTML = '' }) {
        // Sin las lunas decorativas a los lados: este título es más largo que "ASTRO LEAP" y
        // con ellas la cabecera flex se parte en dos líneas.
        return `
            <div class="menu-header">
                <h1>${title}</h1>
            </div>
            ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
            ${resultHTML}
            <div class="menu-panel">
                <button class="menu-btn" data-action="menu">◂ VOLVER AL MENÚ</button>
            </div>`;
    }
    // Reconstruye el menú principal completo (título por defecto). Lo usa el "VOLVER AL MENÚ"
    // de la pantalla de resultado del Reto Diario.
    showMainMenu() {
        startScreen.innerHTML = this.buildMenuScreen({ title: 'ASTRO&nbsp;LEAP', subtitle: '4 zonas · 12 sectores · duelos de energía' });
        openMenuOverlay();
    }
    showMenuPanel(id) {
        ['menuMain', 'menuTimes', 'menuHelp'].forEach(pid => {
            const el = document.getElementById(pid);
            if (el) el.hidden = pid !== id;
        });
        const first = document.querySelector(`#${id} .menu-btn`);
        if (first) first.focus();
    }
    handleMenuAction(action, btn) {
        if (window.SFX) SFX.confirm();
        if (action === 'play') this.startGame();
        else if (action === 'newgame') this.startNewGame();
        else if (action === 'daily') this.startDailyChallenge();
        else if (action === 'times') this.showMenuPanel('menuTimes');
        else if (action === 'help') this.showMenuPanel('menuHelp');
        else if (action === 'back') this.showMenuPanel('menuMain');
        else if (action === 'menu') this.showMainMenu();
        else if (action === 'share') this.shareRun(btn.dataset.shareText);
    }
    // Botón nativo de compartir (X, Facebook, WhatsApp, Instagram... lo que tenga instalado el
    // sistema); solo se renderiza cuando existe soporte, ver buildShareHTML().
    shareRun(text) {
        if (!navigator.share) return;
        navigator.share({ title: 'Astro Leap', text, url: location.href }).catch(() => { /* cancelado por el usuario: no pasa nada */ });
    }
    // navigator.share (móvil y navegadores modernos de escritorio) abre el selector nativo con
    // TODAS las apps instaladas (X, Facebook, WhatsApp, Instagram...). Si no existe, alternativa
    // de enlaces directos a X/Facebook/WhatsApp — Instagram no tiene intent web para texto/enlace.
    buildShareHTML(text) {
        if (navigator.share) {
            return `<button class="menu-btn share-btn" data-action="share" data-share-text="${text.replace(/"/g, '&quot;')}">↗ Compartir</button>`;
        }
        const encodedText = encodeURIComponent(text);
        const encodedUrl = encodeURIComponent(location.href);
        return `
            <div class="share-row">
                <a class="share-icon" href="https://twitter.com/intent/tweet?text=${encodedText}%20${encodedUrl}" target="_blank" rel="noopener" aria-label="Compartir en X">𝕏</a>
                <a class="share-icon" href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}" target="_blank" rel="noopener" aria-label="Compartir en Facebook">f</a>
                <a class="share-icon" href="https://wa.me/?text=${encodedText}%20${encodedUrl}" target="_blank" rel="noopener" aria-label="Compartir en WhatsApp">W</a>
            </div>`;
    }
    // "Nueva partida" con un save existente: descarta el progreso guardado y empieza de cero,
    // en vez del "Continuar partida" por defecto que reanuda donde lo dejaste.
    startNewGame() {
        this.clearProgress();
        this.unlockedCharacters = new Set(['kes']);
        this.player = new Player(20, 100, 'kes');
        this.worldMap = new WorldMap();
        this.collectedPickups = new Set();
        this.startGame();
    }

    // ---- Reto Diario: nivel, piloto, dificultad y física de combate, todo sembrado por la fecha
    // (ver dailyLevelFor()/dailyHeroFor()/dailyDifficultyFor()/RNG en entities.js) — misma
    // partida para todo el mundo ese día, así que los tiempos se pueden comparar de verdad. Corre
    // en instancias de player/worldMap APARTE de las reales (guardadas en this._real*), para que
    // nada de esto pueda tocar la partida guardada — ni al ganar, ni al morir, ni si el jugador
    // sale a media partida.
    startDailyChallenge() {
        if (this.gameStarted) return;
        this._realPlayer = this.player;
        this._realWorldMap = this.worldMap;
        this._realUnlocked = this.unlockedCharacters;
        this._realPickups = this.collectedPickups;

        const dateStr = todayDateString();
        const hero = dailyHeroFor(dateStr);
        const levelIdx = dailyLevelFor(dateStr);
        const difficulty = dailyDifficultyFor(dateStr);
        RNG = mulberry32(hashStringToSeed(dateStr));
        this.dailyMode = true; this.dailyDate = dateStr; this.dailyHero = hero;
        this.dailyLevelIdx = levelIdx; this.dailyDifficulty = difficulty;

        this.player = new Player(20, 100, hero);
        this.unlockedCharacters = new Set([hero]);
        this.worldMap = new WorldMap();
        this.collectedPickups = new Set();

        if (window.SFX) { SFX.unlock(); SFX.boot(); SFX.music.playExplore(); }
        this.gameStarted = true;
        this.runStartTime = performance.now(); this.runElapsed = 0;
        closeMenuOverlay();
        this.loadLevel(levelIdx);
        // Dificultad de hoy: sube o baja HP/ataque de cada enemigo del nivel (Defensa intacta).
        // Se aplica DESPUÉS de loadLevel() para no tocar ENEMY_STATS ni afectar a la partida normal.
        this.enemies.forEach(e => {
            e.maxHp = Math.max(1, Math.round(e.maxHp * difficulty.mult));
            e.hp = e.maxHp;
            e.attack = Math.max(1, Math.round(e.attack * difficulty.mult));
        });
        this.inWorldMap = false; this.inLevel = true;
        requestMobileFullscreen();
    }
    // Deshace startDailyChallenge(): recupera la partida real tal cual estaba y apaga el RNG
    // sembrado. Se llama SIEMPRE al terminar un intento — con éxito, muerte, o saliendo a medias.
    restoreAfterDaily() {
        RNG = Math.random;
        this.dailyMode = false;
        if (this._realPlayer) {
            this.player = this._realPlayer; this.worldMap = this._realWorldMap;
            this.unlockedCharacters = this._realUnlocked; this.collectedPickups = this._realPickups;
            this._realPlayer = null; this._realWorldMap = null; this._realUnlocked = null; this._realPickups = null;
        }
    }
    // Salir a medias (ESC/botón ✕) durante el Reto Diario: no hay mapa al que volver (es un
    // único nivel aislado), así que aborta directo al menú en vez de abrir un mapa de un solo nodo.
    abandonDailyChallenge() {
        if (window.SFX) SFX.music.stop();
        this.gameStarted = false;
        this.restoreAfterDaily();
        startScreen.innerHTML = this.buildMenuScreen({ title: 'ASTRO&nbsp;LEAP', subtitle: '4 zonas · 12 sectores · duelos de energía' });
        openMenuOverlay();
        this.inLevel = false; this.inWorldMap = false; this.combat = null;
    }
    // Sin vidas durante el reto: a diferencia de fullGameOver(), esto NO toca el progreso
    // guardado real — el reto de hoy se puede reintentar cuando se quiera, no consume "partidas".
    dailyChallengeFailed() {
        if (window.SFX) { SFX.music.stop(); SFX.gameOver(); }
        this.gameStarted = false;
        this.restoreAfterDaily();
        startScreen.innerHTML = this.buildMenuScreen({
            title: 'RETO FALLIDO',
            subtitle: 'Sin vidas — el reto de hoy sigue disponible, inténtalo otra vez cuando quieras.'
        });
        openMenuOverlay();
        this.inLevel = false; this.inWorldMap = false; this.combat = null;
    }

    loadAudioPref(key) {
        try { return localStorage.getItem(key) !== '0'; } catch (e) { return true; }
    }
    applyAudioPrefs() {
        if (window.SFX) { SFX.setSfxEnabled(this.sfxOn); SFX.music.setEnabled(this.musicOn); }
        if (btnMusicToggle) btnMusicToggle.classList.toggle('off', !this.musicOn);
        if (btnSfxToggle) btnSfxToggle.classList.toggle('off', !this.sfxOn);
    }
    // A diferencia de loadAudioPref (que por defecto es "encendido" salvo que se guarde '0'),
    // este ajuste empieza APAGADO salvo que se haya guardado '1' explícitamente.
    loadReduceEffectsPref() {
        try { return localStorage.getItem('astroLeapReduceEffects') === '1'; } catch (e) { return false; }
    }
    // window.REDUCE_EFFECTS es cómo CombatSystem.draw() (entities.js) se entera de este ajuste sin
    // tener una referencia a Game — mismo patrón que window.SFX (ver audio.js §2.10 en DESIGN.md).
    applyReduceEffectsPref() {
        window.REDUCE_EFFECTS = this.reduceEffects;
        if (btnReduceFxToggle) btnReduceFxToggle.classList.toggle('off', this.reduceEffects);
    }

    saveProgress() {
        try {
            const data = {
                nodes: this.worldMap.nodes.map(n => ({ completed: n.completed, unlocked: n.unlocked })),
                player: {
                    level: this.player.level, xp: this.player.xp, xpToNextLevel: this.player.xpToNextLevel,
                    maxHp: this.player.maxHp, maxEnergy: this.player.maxEnergy,
                    attack: this.player.attack, defense: this.player.defense
                },
                unlockedCharacters: Array.from(this.unlockedCharacters),
                selectedCharacter: this.player.character
            };
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        } catch (e) { /* almacenamiento no disponible: seguimos sin guardar */ }
    }
    loadProgress() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (data.nodes) data.nodes.forEach((n, i) => { if (this.worldMap.nodes[i]) Object.assign(this.worldMap.nodes[i], n); });
            if (data.player) Object.assign(this.player, data.player, { hp: data.player.maxHp, energy: data.player.maxEnergy });
            if (Array.isArray(data.unlockedCharacters)) this.unlockedCharacters = new Set(data.unlockedCharacters);
            if (data.selectedCharacter && this.unlockedCharacters.has(data.selectedCharacter)) this.player.character = data.selectedCharacter;
        } catch (e) { /* save corrupto: ignorar */ }
    }
    clearProgress() {
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
    }

    startGame() {
        if (this.gameStarted) return;
        if (window.SFX) { SFX.unlock(); SFX.boot(); SFX.music.playExplore(); }
        this.gameStarted = true;
        this.runStartTime = performance.now(); this.runElapsed = 0;
        closeMenuOverlay();
        this.inWorldMap = true;
        requestMobileFullscreen();
    }

    // Cancela la transición pendiente de "sector completado" (si la hay) — recargar el nivel o
    // salir de él durante la celebración debe descartarla, no dejar que dispare a destiempo.
    cancelLevelCompleteTransition() {
        if (this.levelCompleteTimeout) { clearTimeout(this.levelCompleteTimeout); this.levelCompleteTimeout = null; }
    }

    loadLevel(lvl) {
        this.cancelLevelCompleteTransition();
        this.combatTransition = null;
        this.currentLevel = lvl;
        const level = LEVELS[lvl];
        this.platforms = level.platforms.map(p => new Platform(...p, level.variant));
        (level.reinforcedBlocks || []).forEach(([bx, by, bw, bh], i) => {
            const block = new Platform(bx, by, bw, bh, 'reinforced');
            block.reinforcedKey = `reinforced-${lvl}-${i}`;
            if (this.collectedPickups.has(block.reinforcedKey)) block.broken = true;
            this.platforms.push(block);
        });
        // Plataformas móviles: en un array aparte de levels.js A PROPÓSITO — el test BFS de
        // alcanzabilidad no las cuenta, así que el camino obligatorio funciona sin ellas
        // (son atajos/ruta alta). Comparten this.platforms para físicas y dibujo.
        (level.movingPlatforms || []).forEach(([mx, my, mw, mh, amp, omega]) => {
            this.platforms.push(new MovingPlatform(mx, my, mw, mh, amp, omega, level.variant));
        });
        this.beams = (level.beams || []).map(([bx, by, bh, off]) => new EnergyBeam(bx, by, bh, off));
        const levelCompleted = this.worldMap.nodes[lvl].completed;
        this.enemies = level.enemies.map((e, i) => {
            const enemy = new Enemy(...e);
            // Anti-farmeo de XP, misma regla que rejugar un nivel completado: un enemigo ya
            // derrotado esta sesión (clave "xp-N-i" en collectedPickups) reaparece al recargar el
            // nivel —saliendo con ESC, o al morir— pero da la mitad de XP. Sin esto, entrar y
            // salir de un nivel a medias regeneraba a todos los enemigos con XP completa,
            // farmeable infinito (y exitLevel() encima rellena HP/Energía gratis).
            enemy.xpKey = `xp-${lvl}-${i}`;
            if (levelCompleted || this.collectedPickups.has(enemy.xpKey)) enemy.xpReward = Math.floor(enemy.xpReward / 2);
            return enemy;
        });
        this.goalFlag = new GoalFlag(level.goal, 128);
        this.capsules = (level.capsules || []).map(([cx, cy]) => {
            const cap = new LifeCapsule(cx, cy);
            if (this.collectedPickups.has(`life-${lvl}`)) cap.collected = true;
            return cap;
        });
        this.energyCells = (level.energyCells || []).map(([cx, cy]) => {
            const cell = new EnergyCell(cx, cy);
            if (this.collectedPickups.has(`energy-${lvl}`)) cell.collected = true;
            return cell;
        });
        this.player.x = 20; this.player.y = 100; this.player.vx = 0; this.player.vy = 0;
        this.player.energy = this.player.maxEnergy; this.cameraX = 0;
        this.autoScrollX = 0;
        this.forcedScrollDelay = level.forcedScroll ? level.forcedScroll.startDelay : 0;
        // Tormenta iónica (ver ionStorm en levels.js): el reloj arranca en calma SIEMPRE —
        // también al reaparecer tras morir, para que nunca respawnees bajo una descarga.
        this.stormT = 0;
    }

    // Fase del ciclo de la tormenta iónica según this.stormT: calma (se puede correr) → aviso
    // (tinte y sonido: busca techo) → descarga (estar al raso duele). Frames, no tiempo real:
    // determinista en cualquier máquina, como el resto de peligros con ciclo.
    stormPhase(storm) {
        const c = this.stormT % (storm.calm + storm.warn + storm.strike);
        if (c < storm.calm) return 'calm';
        if (c < storm.calm + storm.warn) return 'warn';
        return 'strike';
    }
    // Regla de refugio: a salvo si hay CUALQUIER plataforma sólida encima de la cabeza ("bajo
    // techo"). Emergente a propósito — sin zonas marcadas aparte: el propio level design (islas
    // con techo, flotantes de la ruta alta) es lo que da o niega cobijo.
    playerSheltered() {
        return this.platforms.some(p => p.solid && p.y + p.h <= this.player.y
            && p.x < this.player.x + this.player.w && p.x + p.w > this.player.x);
    }

    // Piloto actual: una chapa pequeña y discreta en el mapa (no una fila de iconos permanente).
    // Tocarla / pulsar C abre el hangar, la pantalla de selección de verdad.
    drawPilotChip(ctx) {
        const x = 8, y = 44, w = 90, h = 16;
        this.pilotChipRect = { x, y, w, h };
        const cur = HEROES[this.player.character];
        ctx.save();
        ctx.fillStyle = 'rgba(11,6,32,0.75)';
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.fill(); } else ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = PALETTE.dim; ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 3); ctx.stroke(); }
        ctx.globalAlpha = 1;
        drawHeroPortrait(ctx, this.player.character, x + 2, y + 2, h - 4, h - 4, this.player.facing);
        ctx.fillStyle = PALETTE.ink; ctx.font = '8px "Rajdhani", sans-serif';
        ctx.fillText(cur.name.toUpperCase(), x + h, y + h / 2 + 3);
        ctx.fillStyle = PALETTE.accent; ctx.font = '9px "Rajdhani", sans-serif'; ctx.textAlign = 'right';
        ctx.fillText('▸', x + w - 5, y + h / 2 + 3);
        ctx.textAlign = 'left';
        ctx.restore();
    }
    openCharSelect() {
        if (HERO_ORDER.length <= 1) return;
        this.charSelectOpen = true;
        this.charSelectIndex = HERO_ORDER.indexOf(this.player.character);
        if (window.SFX) SFX.confirm();
    }
    closeCharSelect() {
        this.charSelectOpen = false;
        if (window.SFX) SFX.select();
    }
    confirmCharSelect() {
        const id = HERO_ORDER[this.charSelectIndex];
        if (!this.unlockedCharacters.has(id)) { if (window.SFX) SFX.select(); return; }
        this.player.character = id;
        this.charSelectOpen = false;
        if (window.SFX) SFX.confirm();
        // Scrap es el único piloto sin habilidad aérea (nada que "descubrir" saltando), así que
        // se explica aquí, al equiparlo por primera vez, en vez de esperar a que el jugador
        // tropiece solo con un bloque reforzado (que a propósito se ven casi iguales al suelo
        // normal — DESIGN.md §2.13).
        if (id === 'scrap') this.showHint('scrap-reinforced', 'Camina sobre los bloques con franjas de peligro (ámbar) para romperlos con Scrap y revelar lo que esconden.');
    }
    // Input del hangar mientras está abierto: se llama desde update() antes de pausar el resto.
    updateCharSelectScreen(keys) {
        if (keys.ArrowRight || keys.KeyD) {
            this.charSelectIndex = Math.min(HERO_ORDER.length - 1, this.charSelectIndex + 1);
            if (window.SFX) SFX.select();
            keys.ArrowRight = false; keys.KeyD = false;
        } else if (keys.ArrowLeft || keys.KeyA) {
            this.charSelectIndex = Math.max(0, this.charSelectIndex - 1);
            if (window.SFX) SFX.select();
            keys.ArrowLeft = false; keys.KeyA = false;
        } else if (keys.Space || keys.Enter) {
            this.confirmCharSelect(); keys.Space = false; keys.Enter = false;
        } else if (keys.Escape) {
            this.closeCharSelect(); keys.Escape = false;
        }
    }
    // Pantalla de selección de personaje ("hangar"): un roster grande al estilo clásico de
    // selección de personaje (una fila de retratos grandes + descripción del resaltado),
    // en vez de la fila de iconos diminutos de antes.
    drawHangarScreen(ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        grad.addColorStop(0, PALETTE.bg2); grad.addColorStop(1, PALETTE.bg1);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.textAlign = 'center';
        ctx.fillStyle = PALETTE.ink; ctx.font = 'bold 13px "Orbitron", sans-serif';
        ctx.fillText('HANGAR DE PILOTOS', GAME_WIDTH / 2, 16);
        ctx.fillStyle = PALETTE.dim; ctx.font = '8px "Rajdhani", sans-serif';
        ctx.fillText('Elige quién pilota', GAME_WIDTH / 2, 27);
        ctx.textAlign = 'left';

        const cardW = 62, cardH = 88, gap = 10;
        const startX = (GAME_WIDTH - (cardW * HERO_ORDER.length + gap * (HERO_ORDER.length - 1))) / 2;
        const cardY = 36;
        this.hangarCardRects = [];
        HERO_ORDER.forEach((id, i) => {
            const cx = startX + i * (cardW + gap);
            const unlocked = this.unlockedCharacters.has(id);
            const cursor = this.charSelectIndex === i;
            const current = this.player.character === id;
            this.hangarCardRects.push({ id, x: cx, y: cardY, w: cardW, h: cardH, unlocked });

            ctx.save();
            ctx.fillStyle = cursor ? 'rgba(124,245,255,0.1)' : 'rgba(28,17,64,0.6)';
            ctx.fillRect(cx, cardY, cardW, cardH);
            ctx.strokeStyle = cursor ? PALETTE.accent : (current ? PALETTE.dim : 'rgba(168,158,224,0.25)');
            ctx.lineWidth = cursor ? 1.6 : 1;
            ctx.strokeRect(cx + 0.5, cardY + 0.5, cardW - 1, cardH - 1);
            if (cursor) { ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 8; ctx.strokeRect(cx + 0.5, cardY + 0.5, cardW - 1, cardH - 1); ctx.shadowBlur = 0; }

            const portraitSize = 40, px = cx + (cardW - portraitSize) / 2, py = cardY + 8;
            if (unlocked) {
                drawHeroPortrait(ctx, id, px, py, portraitSize, portraitSize);
                ctx.fillStyle = PALETTE.ink; ctx.font = 'bold 9px "Orbitron", sans-serif'; ctx.textAlign = 'center';
                ctx.fillText(HEROES[id].name.toUpperCase(), cx + cardW / 2, cardY + 62);
                ctx.fillStyle = HEROES[id].color; ctx.font = '7px "Rajdhani", sans-serif';
                ctx.fillText(HEROES[id].ability, cx + cardW / 2, cardY + 73);
            } else {
                ctx.fillStyle = PALETTE.panelLight; ctx.fillRect(px, py, portraitSize, portraitSize);
                const lockCx = cx + cardW / 2, lockTop = cardY + 24, lockW = portraitSize * 0.4, lockH = portraitSize * 0.3;
                ctx.strokeStyle = PALETTE.dim; ctx.lineWidth = 1.6;
                ctx.beginPath(); ctx.arc(lockCx, lockTop, lockW * 0.42, Math.PI, 0); ctx.stroke();
                ctx.fillStyle = PALETTE.dim; ctx.fillRect(lockCx - lockW / 2, lockTop, lockW, lockH);
                ctx.font = 'bold 9px "Orbitron", sans-serif'; ctx.textAlign = 'center';
                ctx.fillText('???', cx + cardW / 2, cardY + 62);
            }
            if (current) { ctx.fillStyle = PALETTE.accent; ctx.font = '7px "Rajdhani", sans-serif'; ctx.fillText('ACTUAL', cx + cardW / 2, cardY + cardH - 5); }
            ctx.textAlign = 'left';
            ctx.restore();
        });

        const focusedId = HERO_ORDER[this.charSelectIndex];
        const focusedUnlocked = this.unlockedCharacters.has(focusedId);
        ctx.textAlign = 'center';
        if (focusedUnlocked) {
            ctx.fillStyle = PALETTE.dim; ctx.font = '8.5px "Rajdhani", sans-serif';
            wrapText(ctx, HEROES[focusedId].desc, GAME_WIDTH / 2, cardY + cardH + 16, 280, 11);
        } else {
            ctx.fillStyle = PALETTE.dim; ctx.font = 'italic 8.5px "Rajdhani", sans-serif';
            ctx.fillText('Todavía no lo has desbloqueado.', GAME_WIDTH / 2, cardY + cardH + 16);
        }
        ctx.fillStyle = PALETTE.accent; ctx.font = '8px "Rajdhani", sans-serif';
        ctx.fillText('← → elegir · ESPACIO confirmar · ESC salir', GAME_WIDTH / 2, GAME_HEIGHT - 8);
        ctx.textAlign = 'left';
    }

    // Cada jefe desbloquea al héroe asociado a su mundo (ver HEROES en entities.js).
    // Kes ya empieza desbloqueada, así que esto solo dispara para Bolt/Shade/Scrap.
    // Abre una pantalla propia (ver drawUnlockScreen) que pausa el juego hasta que se cierra,
    // en vez de un simple aviso de HUD — así da tiempo a leer para qué sirve la habilidad nueva.
    unlockCharacterForBoss(bossType) {
        const hero = HERO_ORDER.map(id => HEROES[id]).find(h => h.requiresBoss === bossType);
        if (!hero || this.unlockedCharacters.has(hero.id)) return;
        this.unlockedCharacters.add(hero.id);
        this.unlockScreen = hero.id;
        this.shake = 0; // si venías de golpear al jefe, no se queda temblando mientras se lee la pantalla
        if (window.SFX) SFX.levelUp();
    }
    dismissUnlockScreen() {
        if (!this.unlockScreen) return;
        this.unlockScreen = null;
        if (window.SFX) SFX.confirm();
    }
    drawUnlockScreen(ctx) {
        const hero = HEROES[this.unlockScreen];
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        grad.addColorStop(0, PALETTE.bg2); grad.addColorStop(1, PALETTE.bg1);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.textAlign = 'center';
        ctx.fillStyle = PALETTE.accent3; ctx.font = 'bold 11px "Orbitron", sans-serif';
        ctx.fillText('¡NUEVO PILOTO DESBLOQUEADO!', GAME_WIDTH / 2, 22);

        const size = 46, px = GAME_WIDTH / 2 - size / 2, py = 32;
        ctx.save();
        ctx.shadowColor = hero.color; ctx.shadowBlur = 14;
        drawHeroPortrait(ctx, hero.id, px, py, size, size);
        ctx.restore();

        ctx.fillStyle = PALETTE.ink; ctx.font = 'bold 16px "Orbitron", sans-serif';
        ctx.fillText(hero.name.toUpperCase(), GAME_WIDTH / 2, py + size + 18);
        ctx.fillStyle = hero.color; ctx.font = 'bold 10px "Rajdhani", sans-serif';
        ctx.fillText(hero.ability.toUpperCase(), GAME_WIDTH / 2, py + size + 32);

        ctx.fillStyle = PALETTE.dim; ctx.font = '9px "Rajdhani", sans-serif';
        wrapText(ctx, hero.desc, GAME_WIDTH / 2, py + size + 50, 260, 11);

        ctx.fillStyle = PALETTE.accent; ctx.font = '9px "Rajdhani", sans-serif';
        ctx.fillText(IS_TOUCH_DEVICE ? 'TOCA PARA CONTINUAR' : 'PULSA ESPACIO PARA CONTINUAR', GAME_WIDTH / 2, GAME_HEIGHT - 12);
        ctx.textAlign = 'left';
    }

    // Transición de encuentro estilo Pokémon: dos destellos blancos y un barrido circular a
    // negro que crece desde el punto de contacto con el enemigo, con el juego congelado detrás;
    // al completarse (ver el contador en update()) arranca el duelo real. El sonido de encuentro
    // y la música de combate entran YA, con el primer destello — como en Pokémon, el audio
    // anuncia el combate antes de que se vea la pantalla de duelo.
    startCombatTransition(enemy) {
        this.combatTransition = {
            t: 0, enemy,
            x: enemy.x - this.cameraX + enemy.w / 2,
            y: enemy.y + enemy.h / 2
        };
        if (window.SFX) { enemy.isBoss ? SFX.bossEncounter() : SFX.encounter(); SFX.music.playCombat(); }
    }
    // Overlay de la transición, dibujado encima del frame congelado del nivel (HUD incluido).
    // Fase 1 (28f): dos destellos blancos. Fase 2 (30f): círculo negro creciendo desde el punto
    // de contacto (easing cuadrático: acelera, como el barrido clásico). Fase 3 (12f): negro
    // sostenido hasta que entra el duelo. Con reduceEffects NO hay destellos — un parpadeo a
    // pantalla completa es justo lo que ese ajuste de accesibilidad promete evitar — solo un
    // fundido a negro progresivo, más corto.
    drawCombatTransition(ctx) {
        const tr = this.combatTransition;
        if (!tr) return;
        if (this.reduceEffects) {
            ctx.fillStyle = `rgba(5,2,15,${Math.min(1, tr.t / 35)})`;
            ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
            return;
        }
        const FLASH = 28, WIPE = 30;
        if (tr.t < FLASH) {
            const pulse = Math.abs(Math.sin(tr.t * Math.PI / 14)); // dos pulsos en 28 frames
            ctx.fillStyle = `rgba(245,243,255,${0.85 * pulse})`;
            ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        } else {
            const p = Math.min(1, (tr.t - FLASH) / WIPE);
            // radio final: hasta cubrir la esquina de pantalla más lejana al punto de contacto
            const maxR = Math.max(
                Math.hypot(tr.x, tr.y), Math.hypot(GAME_WIDTH - tr.x, tr.y),
                Math.hypot(tr.x, GAME_HEIGHT - tr.y), Math.hypot(GAME_WIDTH - tr.x, GAME_HEIGHT - tr.y)
            );
            ctx.fillStyle = '#05020f';
            ctx.beginPath(); ctx.arc(tr.x, tr.y, maxR * p * p, 0, Math.PI * 2); ctx.fill();
        }
    }

    exitLevel() {
        this.cancelLevelCompleteTransition();
        if (this.dailyMode) { this.abandonDailyChallenge(); return; }
        this.levelCompleting = false;
        this.inLevel = false; this.inWorldMap = true;
        this.player.hp = this.player.maxHp; this.player.energy = this.player.maxEnergy;
    }

    // Se pierde una vida al morir (caer a un precipicio, que te alcance el muro, o perder un combate).
    // Con vidas restantes: reaparece al inicio del nivel actual, con vida y energía llenas.
    // Sin vidas restantes: Game Over completo, se reinicia todo desde el principio.
    loseLife() {
        this.player.lives--;
        this.combat = null;
        this.particles.burst(this.player.x + this.player.w / 2, this.player.y, PALETTE.hpLow, 16, { speed: 2.2, life: 30, size: 3 });
        if (this.player.lives <= 0) {
            if (this.dailyMode) { this.dailyChallengeFailed(); return; }
            this.fullGameOver();
        } else {
            if (window.SFX) { SFX.loseLife(); SFX.music.playExplore(); }
            this.livesLostMessage = 110; this.extraLifeMessage = 0; this.extraEnergyMessage = 0;
            this.levelCompleting = false;
            this.loadLevel(this.currentLevel);
            this.player.hp = this.player.maxHp;
            this.player.energy = this.player.maxEnergy;
        }
    }

    fullGameOver() {
        if (window.SFX) { SFX.music.stop(); SFX.gameOver(); }
        this.gameStarted = false;
        // Captura el nivel/tiempo ANTES de resetear currentLevel (lo hace loadLevel(0) más abajo).
        const levelReached = LEVELS[this.currentLevel];
        const elapsed = performance.now() - this.runStartTime;
        const pilotName = HEROES[this.player.character].name; // antes del reset del jugador, unas líneas más abajo
        const shareText = `☠️ Caí en el sector ${this.currentLevel + 1}/${LEVELS.length} (${levelReached.name}) de ASTRO LEAP, pilotando a ${pilotName} — ${formatTime(elapsed)} de misión. ¿Llegas más lejos? 🚀`;
        this.unlockedCharacters = new Set(['kes']);
        this.player = new Player(20, 100, 'kes');
        this.worldMap = new WorldMap();
        this.collectedPickups = new Set();
        this.clearProgress(); // antes de construir el menú, para que no ofrezca "continuar" con nada que continuar
        startScreen.innerHTML = this.buildMenuScreen({
            title: 'GAME OVER',
            subtitle: 'Sin vidas restantes — vuelves a empezar.',
            resultHTML: `
                <p class="run-time">Llegaste hasta el sector ${this.currentLevel + 1}/${LEVELS.length} — ${levelReached.name}</p>
                <p class="run-time">Tiempo: ${formatTime(elapsed)}</p>
                ${this.buildShareHTML(shareText)}
            `
        });
        openMenuOverlay();
        this.loadLevel(0);
        this.inLevel = false; this.inWorldMap = false; this.combat = null;
    }

    setupInput() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            // Menú principal: ↑↓ mueve el foco entre botones (Enter/Espacio los activa solos,
            // es comportamiento nativo del <button> enfocado — no hace falta gestionarlo aquí).
            if (!this.gameStarted) {
                const active = document.activeElement;
                if (active && active.classList && active.classList.contains('menu-btn') && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
                    e.preventDefault();
                    // Recorre TODOS los .menu-btn visibles de #startScreen (no solo los hermanos de
                    // active): el botón de compartir vive fuera de #menuMain, junto al resumen de la partida.
                    const buttons = Array.from(startScreen.querySelectorAll('.menu-btn')).filter(b => b.offsetParent !== null);
                    const idx = buttons.indexOf(active);
                    const dir = e.code === 'ArrowDown' ? 1 : -1;
                    buttons[(idx + dir + buttons.length) % buttons.length].focus();
                    if (window.SFX) SFX.select();
                }
                return;
            }
            // Con un aviso contextual abierto (ver showHint()) no debe llegar nada más: ni el menú
            // de combate ni ESC/R. Se cierra aquí mismo, por EVENTO de pulsación — no comprobando
            // this.keys en update() cada frame, que se dispararía en el acto si la tecla de SALTO
            // (la que suele abrir el aviso) sigue mantenida en ese instante, sin dar tiempo a leerlo.
            if (this.hintScreen) {
                if (e.code === 'Space' || e.code === 'Enter') this.dismissHintScreen();
                return;
            }
            if (this.combat && this.combat.active) this.combat.handleInput(e.code);
            // Durante la transición de encuentro no se puede salir ni reiniciar — el combate ya
            // es inevitable (igual que en Pokémon: cuando la pantalla parpadea, ya estás dentro).
            if (e.code === 'Escape' && this.inLevel && !this.combat && !this.combatTransition) this.exitLevel();
            // Atajo de depuración: reiniciar el nivel actual al instante (útil ajustando niveles)
            if (e.code === 'KeyR' && this.inLevel && !this.combat && !this.combatTransition) {
                this.levelCompleting = false;
                this.loadLevel(this.currentLevel);
                this.player.hp = this.player.maxHp;
            }
        });
        document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    }

    setupTouchControls() {
        const bindHold = (el, code) => {
            if (!el) return;
            const press = (e) => {
                e.preventDefault();
                if (window.SFX) SFX.unlock();
                // Con el aviso contextual abierto, tocar cualquier control (incluido SALTO, el que
                // normalmente lo dispara) lo cierra en vez de quedar inerte — mismo gesto que tocar
                // el canvas directamente (ver mapTap).
                if (this.hintScreen) { this.dismissHintScreen(); return; }
                this.keys[code] = true;
            };
            const release = (e) => { e.preventDefault(); this.keys[code] = false; };
            el.addEventListener('touchstart', press, { passive: false });
            el.addEventListener('touchend', release, { passive: false });
            el.addEventListener('touchcancel', release, { passive: false });
            el.addEventListener('mousedown', press);
            el.addEventListener('mouseup', release);
            el.addEventListener('mouseleave', release);
        };
        bindHold(btnLeft, 'ArrowLeft');
        bindHold(btnRight, 'ArrowRight');
        bindHold(btnJump, 'Space');

        if (btnExit) {
            const exitTap = (e) => { e.preventDefault(); if (this.hintScreen) return; if (this.inLevel && !this.combat && !this.combatTransition) this.exitLevel(); };
            btnExit.addEventListener('touchstart', exitTap, { passive: false });
            btnExit.addEventListener('click', exitTap);
        }
        if (btnMusicToggle) {
            const toggleMusic = (e) => {
                e.preventDefault(); e.stopPropagation();
                if (window.SFX) SFX.unlock();
                this.musicOn = !this.musicOn;
                try { localStorage.setItem('astroLeapMusicOn', this.musicOn ? '1' : '0'); } catch (err) { /* noop */ }
                this.applyAudioPrefs();
            };
            btnMusicToggle.addEventListener('touchstart', toggleMusic, { passive: false });
            btnMusicToggle.addEventListener('click', toggleMusic);
        }
        if (btnSfxToggle) {
            const toggleSfx = (e) => {
                e.preventDefault(); e.stopPropagation();
                if (window.SFX) SFX.unlock();
                this.sfxOn = !this.sfxOn;
                try { localStorage.setItem('astroLeapSfxOn', this.sfxOn ? '1' : '0'); } catch (err) { /* noop */ }
                this.applyAudioPrefs();
                if (this.sfxOn && window.SFX) SFX.select();
            };
            btnSfxToggle.addEventListener('touchstart', toggleSfx, { passive: false });
            btnSfxToggle.addEventListener('click', toggleSfx);
        }
        if (btnReduceFxToggle) {
            const toggleReduceFx = (e) => {
                e.preventDefault(); e.stopPropagation();
                if (window.SFX) SFX.unlock();
                this.reduceEffects = !this.reduceEffects;
                try { localStorage.setItem('astroLeapReduceEffects', this.reduceEffects ? '1' : '0'); } catch (err) { /* noop */ }
                this.applyReduceEffectsPref();
                if (window.SFX) SFX.select();
            };
            btnReduceFxToggle.addEventListener('touchstart', toggleReduceFx, { passive: false });
            btnReduceFxToggle.addEventListener('click', toggleReduceFx);
        }
        if (combatButtonsEl) {
            combatButtonsEl.querySelectorAll('button[data-code]').forEach((btn) => {
                const code = btn.dataset.code;
                const tap = (e) => { e.preventDefault(); if (this.hintScreen) return; if (this.combat && this.combat.active) this.combat.handleInput(code); };
                btn.addEventListener('touchstart', tap, { passive: false });
                btn.addEventListener('click', tap);
            });
        }
        // Menú principal: delegado en startScreen (elemento estable) en vez de en los botones
        // sueltos, porque su HTML se reconstruye entero cada vez (arranque/Game Over/Victoria).
        startScreen.addEventListener('click', (e) => {
            const btn = e.target.closest('.menu-btn');
            if (btn) this.handleMenuAction(btn.dataset.action, btn);
        });

        // Tocar/clicar directamente un nodo del mapa estelar entra a ese nivel (si está desbloqueado)
        const mapTap = (e) => {
            if (this.unlockScreen) { e.preventDefault(); this.dismissUnlockScreen(); return; }
            if (this.hintScreen) { e.preventDefault(); this.dismissHintScreen(); return; }
            const rect = canvas.getBoundingClientRect();
            const point = e.changedTouches ? e.changedTouches[0] : e;
            const gx = (point.clientX - rect.left) / rect.width * GAME_WIDTH;
            const gy = (point.clientY - rect.top) / rect.height * GAME_HEIGHT;
            if (this.charSelectOpen) {
                e.preventDefault();
                const cardHit = (this.hangarCardRects || []).find(r => gx >= r.x && gx <= r.x + r.w && gy >= r.y && gy <= r.y + r.h);
                if (cardHit) {
                    this.charSelectIndex = HERO_ORDER.indexOf(cardHit.id);
                    this.confirmCharSelect();
                } else {
                    this.closeCharSelect();
                }
                return;
            }
            if (!this.inWorldMap) return;
            e.preventDefault();
            const chip = this.pilotChipRect;
            if (chip && gx >= chip.x && gx <= chip.x + chip.w && gy >= chip.y && gy <= chip.y + chip.h) {
                this.openCharSelect();
                return;
            }
            let closest = null, closestDist = Infinity;
            for (const node of this.worldMap.nodes) {
                const dist = Math.hypot(node.x - gx, node.y - gy);
                if (dist < closestDist) { closest = node; closestDist = dist; }
            }
            if (closest && closestDist <= closest.w) {
                if (!closest.unlocked) { if (window.SFX) SFX.select(); return; }
                this.worldMap.currentNodeIndex = closest.levelIndex;
                if (window.SFX) SFX.confirm();
                this.currentLevel = closest.levelIndex;
                this.loadLevel(closest.levelIndex);
                this.inWorldMap = false;
                this.inLevel = true;
            }
        };
        canvas.addEventListener('touchstart', mapTap, { passive: false });
        canvas.addEventListener('click', mapTap);
    }

    updateTouchUI() {
        const inCombat = !!(this.combat && this.combat.active);
        const paused = this.unlockScreen || this.charSelectOpen || this.hintScreen || this.combatTransition;
        if (moveControls) moveControls.classList.toggle('active', this.gameStarted && !inCombat && !paused);
        if (combatButtonsEl) combatButtonsEl.classList.toggle('active', inCombat && !paused);
        if (btnJump) btnJump.textContent = this.inWorldMap ? 'ENTRAR' : 'SALTO';
        if (btnExit) btnExit.classList.toggle('active', this.inLevel && !inCombat && !paused);
        // Botón táctil "2" del menú de combate: mismo nombre propio por piloto que el menú del
        // canvas (ver CombatSystem.actions), para que no diga "Habilidad" en un sitio y
        // "Sobrecarga"/"Zarpazo"/etc. en otro.
        if (combatAbilityBtnSpan) {
            const label = HEROES[this.player.character].combatName;
            if (combatAbilityBtnSpan.textContent !== label) combatAbilityBtnSpan.textContent = label;
        }
    }

    update() {
        if (!this.gameStarted) return;
        this.runElapsed = performance.now() - this.runStartTime; // reloj real, corre incluso en menús/pantallas de pausa
        if (this.unlockScreen) {
            if (this.shake > 0) this.shake *= 0.85; // por si acaso, aunque no se dibuje con temblor aquí
            if (this.keys.Space || this.keys.Enter) { this.dismissUnlockScreen(); this.keys.Space = false; this.keys.Enter = false; }
            return;
        }
        if (this.charSelectOpen) { this.updateCharSelectScreen(this.keys); return; }
        // Aviso contextual (ver showHint()): congela el resto del juego —igual que unlockScreen—
        // pero SIN sustituir el frame dibujado, para que se note oscurecido detrás en vez de
        // desaparecer del todo. El cierre NO se sondea aquí (a diferencia de unlockScreen) —
        // se dispara por el evento keydown de Space/Enter en setupInput(), o al tocar el canvas /
        // un botón táctil (ver mapTap y bindHold) — así una pulsación ya mantenida en el instante
        // en que aparece el aviso no lo cierra sola en el frame siguiente.
        if (this.hintScreen) {
            if (this.shake > 0) this.shake *= 0.85;
            return;
        }
        if (this.shake > 0) this.shake *= 0.85;

        if (this.inWorldMap) {
            if (this.keys.KeyC) { this.openCharSelect(); this.keys.KeyC = false; }
            const selected = this.worldMap.update(this.keys);
            if (selected !== null) {
                this.currentLevel = selected; this.loadLevel(selected);
                this.inWorldMap = false; this.inLevel = true;
            }
            return;
        }

        // Transición de encuentro (estilo Pokémon): mientras dura, el nivel queda congelado
        // detrás (este return se salta física, enemigos y colisiones) y solo avanza el contador.
        // Al completarse arranca el duelo de verdad. Duración fija en frames — también en el
        // Reto Diario suma lo mismo para todo el mundo, así que no ensucia la comparación.
        if (this.combatTransition) {
            this.combatTransition.t++;
            if (this.combatTransition.t >= (this.reduceEffects ? 45 : 70)) {
                this.combat = new CombatSystem(this.player, this.combatTransition.enemy);
                this.combatTransition = null;
            }
            return;
        }

        if (this.combat) {
            this.combat.update();
            this.shake = Math.max(this.shake, this.combat.shake || 0);
            if (!this.combat.active) {
                if (this.combat.result === 'win') {
                    const leveled = this.player.gainXP(this.combat.enemy.xpReward);
                    this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + ENERGY_PER_KILL);
                    if (this.combat.enemy.xpKey) this.collectedPickups.add(this.combat.enemy.xpKey);
                    this.levelUpMessage = leveled ? 100 : 0;
                    if (window.SFX) { SFX.battleWin(); if (leveled) SFX.levelUp(); SFX.music.playExplore(); }
                    this.particles.burst(this.player.x + this.player.w / 2, this.player.y, PALETTE.accent3, 14, { speed: 2, life: 30, size: 3 });
                    if (this.combat.enemy.isBoss) this.unlockCharacterForBoss(this.combat.enemy.type);
                    this.saveProgress();
                } else if (this.combat.result === 'lose') {
                    this.loseLife();
                    return;
                } else if (this.combat.result === 'flee') {
                    if (window.SFX) SFX.music.playExplore();
                    this.playerInvulnerable = 180;
                }
                this.combat = null;
            }
        } else {
            const level = LEVELS[this.currentLevel];
            let outcome = null;
            if (!this.levelCompleting) outcome = this.player.update(this.keys, this.platforms, this.particles);
            if (outcome === 'fell') { this.loseLife(); return; }
            if (this.player.hp <= 0) { this.loseLife(); return; }
            this.particles.update();
            // Plataformas con comportamiento: frágiles (cuenta atrás/reaparición), móviles
            // (senoide vertical) y cintas (fase de animación).
            for (const p of this.platforms) p.update();
            const CAMERA_END_MARGIN = 40; // deja la meta con aire a la derecha en vez de pegada al borde
            const maxScroll = level.goal + CAMERA_END_MARGIN - GAME_WIDTH;

            if (level.forcedScroll) {
                if (this.forcedScrollDelay > 0) {
                    this.forcedScrollDelay--;
                    if (this.forcedScrollDelay % 60 === 0 && window.SFX) {
                        this.forcedScrollDelay === 0 ? SFX.scrollStart() : SFX.countdownTick();
                    }
                    // Durante la cuenta atrás la cámara sigue al jugador como en un nivel
                    // normal: se puede salir corriendo desde el primer segundo, sin esperar
                    // (antes la cámara se quedaba clavada en x=0 y avanzar era salirse de la
                    // pantalla). autoScrollX se mantiene sincronizado para que, al terminar,
                    // el muro arranque desde donde esté la cámara — no desde el inicio del
                    // nivel. Y mientras dure, ni empuja ni daña: aún no hay muro.
                    this.cameraX = Math.max(0, Math.min(this.player.x - GAME_WIDTH / 2, maxScroll));
                    this.autoScrollX = this.cameraX;
                } else {
                    this.autoScrollX = Math.min(this.autoScrollX + level.forcedScroll.speed, maxScroll);
                    this.cameraX = Math.max(0, this.autoScrollX);
                    const leftEdge = this.cameraX + 2;
                    if (this.player.x < leftEdge) {
                        this.player.x = leftEdge;
                        if (this.playerInvulnerable === 0) {
                            this.player.takeDamage(3);
                            this.playerInvulnerable = 40;
                            this.shake = Math.max(this.shake, 4);
                            if (window.SFX) SFX.hitPlayer();
                            if (this.player.hp <= 0) { this.loseLife(); return; }
                        }
                    }
                }
            } else {
                this.cameraX = Math.max(0, Math.min(this.player.x - GAME_WIDTH / 2, maxScroll));
            }
            if (this.playerInvulnerable > 0) this.playerInvulnerable--;

            for (const enemy of this.enemies) {
                if (!enemy.alive) continue;
                enemy.update(this.platforms);
                if (this.player.collides(enemy) && this.playerInvulnerable === 0) {
                    if (this.player.collidesFromAbove(enemy) && enemy.level < this.player.level) {
                        enemy.alive = false; enemy.defeated = true;
                        const leveled = this.player.gainXP(enemy.xpReward);
                        this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + ENERGY_PER_KILL);
                        if (enemy.xpKey) this.collectedPickups.add(enemy.xpKey);
                        // El cartel de subida de nivel solo si de verdad subiste — antes se
                        // mostraba en CADA pisotón, hubiera nivel o no.
                        this.player.vy = -3; this.levelUpMessage = leveled ? 80 : 0;
                        if (window.SFX) SFX.stomp();
                        this.particles.burst(enemy.x + enemy.w / 2, enemy.y, enemy.color, 10, { speed: 1.8, life: 20, size: 2.5 });
                    } else {
                        this.startCombatTransition(enemy);
                    }
                }
            }

            // Efectos de ESTAR DE PIE sobre una plataforma: arrancar la cuenta atrás de una
            // frágil, el arrastre de una cinta, o romper un refuerzo (Scrap). No se puede
            // reutilizar player.collides() tal cual: al aterrizar encima, el jugador queda
            // pegado exactamente al borde superior (sin solape real), así que aquí basta con
            // estar de pie sobre él, sin exigir profundidad de solape.
            for (const p of this.platforms) {
                if (!p.solid) continue;
                const standingOn = this.player.onGround && this.player.x < p.x + p.w && this.player.x + this.player.w > p.x
                    && Math.abs((this.player.y + this.player.h) - p.y) < 2;
                if (!standingOn) continue;
                if (p.variant === 'fragile') p.touched();
                // Hielo: la física vive en Player.update() (inercia, ver ICE_* en entities.js);
                // aquí solo el aviso de una sola vez la primera vez que se pisa, como el de Scrap.
                else if (p.variant === 'ice') this.showHint('ice-slide', 'El hielo resbala: mantén la dirección para coger carrerilla y saltar más lejos — y cuidado al frenar.');
                else if (p.variant === 'beltL') this.player.x -= 0.45;
                else if (p.variant === 'beltR') this.player.x += 0.45;
                else if (p.variant === 'reinforced' && this.player.character === 'scrap') {
                    p.broken = true;
                    this.collectedPickups.add(p.reinforcedKey);
                    if (window.SFX) SFX.stomp();
                    this.particles.burst(p.x + p.w / 2, p.y + p.h / 2, PALETTE.accent3, 14, { speed: 2, life: 24, size: 3 });
                }
            }

            // Puertas de energía: dañan solo en su fase activa, con la misma tregua de
            // invulnerabilidad que el muro del Túnel (no es muerte instantánea). El empujón
            // saca al jugador de la columna — sin él, quedarse dentro re-golpea cada tregua.
            for (const beam of this.beams) {
                beam.update();
                if (this.playerInvulnerable === 0 && beam.collides(this.player)) {
                    this.player.takeDamage(4);
                    this.playerInvulnerable = 50;
                    this.player.x += this.player.x + this.player.w / 2 < beam.x ? -10 : 10;
                    this.player.vy = Math.min(this.player.vy, -1.5);
                    this.shake = Math.max(this.shake, 5);
                    this.particles.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, PALETTE.accent, 10, { speed: 1.8, life: 18, size: 2 });
                    if (window.SFX) SFX.zap();
                    if (this.player.hp <= 0) { this.loseLife(); return; }
                }
            }

            // Tormenta iónica: avanza el ciclo y, en plena descarga, golpea a quien esté al
            // raso — mismo patrón de golpe+tregua que las puertas de energía. El combate y los
            // diálogos congelan update() antes de llegar aquí, así que la tormenta no corre
            // mientras lees un aviso ni durante un duelo.
            if (level.ionStorm) {
                const prevPhase = this.stormPhase(level.ionStorm);
                this.stormT++;
                const phase = this.stormPhase(level.ionStorm);
                if (phase === 'warn' && prevPhase === 'calm') {
                    if (window.SFX) SFX.bossCharge();
                    this.showHint('ion-storm', 'La tormenta va a descargar: ponte a cubierto BAJO una plataforma antes de que caiga, o corre al siguiente refugio.');
                }
                if (phase === 'strike' && this.playerInvulnerable === 0 && !this.playerSheltered()) {
                    this.player.takeDamage(5);
                    this.playerInvulnerable = 45;
                    this.shake = Math.max(this.shake, 5);
                    this.particles.burst(this.player.x + this.player.w / 2, this.player.y, PALETTE.accent3, 12, { speed: 2, life: 20, size: 2.5 });
                    if (window.SFX) SFX.zap();
                    if (this.player.hp <= 0) { this.loseLife(); return; }
                }
            }

            for (const cap of this.capsules) {
                if (cap.collected) continue;
                cap.update();
                if (this.player.collides(cap)) {
                    cap.collected = true;
                    this.collectedPickups.add(`life-${this.currentLevel}`);
                    this.player.lives++;
                    this.extraLifeMessage = 110; this.livesLostMessage = 0; this.extraEnergyMessage = 0;
                    if (window.SFX) SFX.levelUp();
                    this.particles.burst(cap.x + cap.w / 2, cap.y, PALETTE.accent2, 16, { speed: 2, life: 32, size: 3 });
                }
            }

            for (const cell of this.energyCells) {
                if (cell.collected) continue;
                cell.update();
                if (this.player.collides(cell)) {
                    cell.collected = true;
                    this.collectedPickups.add(`energy-${this.currentLevel}`);
                    this.player.maxEnergy += 1;
                    this.player.energy = Math.min(this.player.energy + 1, this.player.maxEnergy);
                    this.extraEnergyMessage = 110; this.livesLostMessage = 0; this.extraLifeMessage = 0;
                    if (window.SFX) SFX.extraEnergy();
                    this.particles.burst(cell.x + cell.w / 2, cell.y, PALETTE.en, 16, { speed: 2, life: 32, size: 3 });
                }
            }

            if (this.player.x >= level.goal && !this.levelCompleting) {
                if (level.boss) {
                    const boss = this.enemies.find(e => e.isBoss);
                    if (boss && boss.alive) { this.player.x = level.goal - 5; this.player.vx = 0; return; }
                }
                this.levelCompleting = true;
                if (window.SFX) SFX.levelComplete();

                // Reto Diario: termina aquí, ANTES de tocar worldMap.completeLevel()/saveProgress()
                // — nunca debe escribir nada en el progreso guardado real (ver restoreAfterDaily()).
                if (this.dailyMode) {
                    this.levelCompleting = false; this.gameStarted = false;
                    const finalTime = performance.now() - this.runStartTime;
                    const isRecord = this.saveDailyRecord(this.dailyDate, finalTime, this.dailyHero);
                    if (window.SFX) { SFX.music.stop(); SFX.victory(); }
                    const heroName = HEROES[this.dailyHero].name;
                    const levelName = LEVELS[this.dailyLevelIdx].name;
                    const diffLabel = this.dailyDifficulty.label;
                    // Formato compacto en 3 líneas, estilo Wordle: cabecera con la fecha, el
                    // desafío de hoy de un vistazo, y el tiempo con el reto al receptor. Los
                    // saltos de línea sobreviven tanto a navigator.share como a los enlaces de
                    // respaldo de buildShareHTML (encodeURIComponent los convierte en %0A).
                    const shareText = [
                        `🛰️ ASTRO LEAP — Reto Diario ${this.dailyDate}`,
                        `📍 ${levelName} · ${this.dailyDifficulty.emoji} ${diffLabel} · 🧑‍🚀 ${heroName}`,
                        `⏱️ ${formatTime(finalTime)} — ¿lo superas?`
                    ].join('\n');
                    const bestToday = this.dailyRecord.time; // ya actualizado por saveDailyRecord()
                    this.restoreAfterDaily();
                    startScreen.innerHTML = this.buildDailyResultScreen({
                        title: '¡RETO SUPERADO!',
                        subtitle: `Reto del ${this.dailyDate} — ${levelName} · dificultad ${diffLabel} — piloto: ${heroName}`,
                        resultHTML: `
                            <p class="run-time">Tiempo: ${formatTime(finalTime)}</p>
                            <p class="run-time">${isRecord ? '¡Nuevo mejor tiempo de hoy!' : `Tu mejor tiempo de hoy: ${formatTime(bestToday)}`}</p>
                            ${this.buildShareHTML(shareText)}
                        `
                    });
                    openMenuOverlay();
                    this.inLevel = false; this.inWorldMap = false; this.combat = null;
                    return;
                }

                this.worldMap.completeLevel(this.currentLevel);
                this.levelCompleteMessage = 150;
                this.saveProgress();

                if (this.currentLevel === LEVELS.length - 1) {
                    this.levelCompleting = false; this.gameStarted = false;
                    const finalTime = performance.now() - this.runStartTime;
                    const isRecord = this.saveBestTime(finalTime);
                    if (window.SFX) { SFX.music.stop(); SFX.victory(); }
                    const shareText = `🏆 ASTRO LEAP completado: ${LEVELS.length}/${LEVELS.length} sectores en ${formatTime(finalTime)}${isRecord ? ' — ¡nuevo récord personal! ⏱️' : ''}. ¿Me bajas el tiempo? 🚀`;
                    this.unlockedCharacters = new Set(['kes']);
                    this.player = new Player(20, 100, 'kes');
                    this.worldMap = new WorldMap();
                    this.collectedPickups = new Set();
                    this.clearProgress(); // antes de construir el menú, para que no ofrezca "continuar" con nada que continuar
                    startScreen.innerHTML = this.buildMenuScreen({
                        title: '¡MISIÓN CUMPLIDA!',
                        subtitle: 'Derrotaste a Nodo Cero, reparaste la nave y escapaste del Sistema Ceniza.',
                        resultHTML: `
                            <p class="run-time">${isRecord ? '¡Nuevo récord! ' : ''}Completaste los ${LEVELS.length} sectores en ${formatTime(finalTime)}</p>
                            ${this.buildShareHTML(shareText)}
                        `
                    });
                    openMenuOverlay();
                    this.inLevel = false; this.inWorldMap = false;
                } else {
                    // Guardado en this.levelCompleteTimeout para poder cancelarlo si el jugador
                    // recarga el nivel (R) o sale (ESC) durante los 1.8s de celebración — si no,
                    // el temporizador pendiente disparaba igual y te sacaba al mapa a destiempo.
                    this.levelCompleteTimeout = setTimeout(() => {
                        this.levelCompleteTimeout = null;
                        this.levelCompleting = false; this.inLevel = false; this.inWorldMap = true;
                        this.worldMap.currentNodeIndex = Math.min(this.currentLevel + 1, LEVELS.length - 1);
                        this.player.hp = this.player.maxHp; this.player.energy = this.player.maxEnergy;
                    }, 1800);
                }
            }
            if (this.goalFlag) this.goalFlag.update();
            if (this.levelUpMessage > 0) this.levelUpMessage--;
            if (this.levelCompleteMessage > 0) this.levelCompleteMessage--;
            if (this.livesLostMessage > 0) this.livesLostMessage--;
            if (this.extraLifeMessage > 0) this.extraLifeMessage--;
            if (this.extraEnergyMessage > 0) this.extraEnergyMessage--;
        }
    }

    drawStars(stars, parallax) {
        stars.forEach(s => {
            const sx = s.x - this.cameraX * parallax;
            if (sx < -4 || sx > GAME_WIDTH + 4) return;
            const tw = 0.5 + Math.sin(s.tw + Date.now() * 0.002) * 0.5;
            ctx.globalAlpha = 0.4 + tw * 0.6;
            ctx.fillStyle = PALETTE.ink;
            ctx.fillRect(sx, s.y, s.size, s.size);
        });
        ctx.globalAlpha = 1;
    }

    draw() {
        fitCanvas();
        this.updateTouchUI();

        if (this.unlockScreen) {
            this.drawUnlockScreen(ctx);
            return;
        }
        if (this.charSelectOpen) {
            this.drawHangarScreen(ctx);
            return;
        }

        const shakeMag = this.reduceEffects ? 0 : this.shake;
        const shakeX = shakeMag ? (Math.random() - 0.5) * shakeMag : 0;
        const shakeY = shakeMag ? (Math.random() - 0.5) * shakeMag * 0.6 : 0;
        ctx.save();
        ctx.translate(shakeX, shakeY);

        if (this.inWorldMap) {
            this.drawStars(this.mapStars, 0);
            this.worldMap.draw(ctx);
            this.drawPilotChip(ctx);
            ctx.fillStyle = PALETTE.accent2; ctx.font = '10px "Rajdhani", sans-serif'; ctx.textAlign = 'right';
            ctx.fillText(`♥×${this.player.lives}`, 308, 16);
            ctx.fillStyle = PALETTE.dim; ctx.font = '8px "Rajdhani", sans-serif';
            ctx.fillText(formatTime(this.runElapsed), 308, 27);
            ctx.textAlign = 'left';
            // El aviso de Scrap (ver confirmCharSelect()) puede dispararse estando en el mapa, a
            // diferencia de los de salto/combate que solo pasan dentro de un nivel — sin esto, el
            // juego se quedaría congelado (ver el guard de hintScreen en update()) sin ningún
            // diálogo visible que lo explique.
            this.drawHintOverlay(ctx);
            ctx.restore();
            return;
        }

        const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        grad.addColorStop(0, PALETTE.bg2); grad.addColorStop(1, PALETTE.bg1);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        this.drawStars(this.levelStars, 0.35);

        if (this.combat) {
            this.combat.draw(ctx);
        } else {
            for (const p of this.platforms) p.draw(ctx, this.cameraX);
            for (const beam of this.beams) beam.draw(ctx, this.cameraX);
            if (this.goalFlag) this.goalFlag.draw(ctx, this.cameraX);
            for (const cap of this.capsules) cap.draw(ctx, this.cameraX);
            for (const cell of this.energyCells) cell.draw(ctx, this.cameraX);
            for (const e of this.enemies) e.draw(ctx, this.cameraX);
            this.particles.draw(ctx, this.cameraX);
            // Parpadeo de invulnerabilidad: con reduceEffects, en vez de destello on/off se dibuja
            // siempre pero semitransparente — se sigue notando que estás invulnerable sin el
            // destello rápido.
            if (this.reduceEffects) {
                if (this.playerInvulnerable > 0) { ctx.save(); ctx.globalAlpha = 0.55; this.player.draw(ctx, this.cameraX); ctx.restore(); }
                else this.player.draw(ctx, this.cameraX);
            } else if (this.playerInvulnerable === 0 || Math.floor(this.playerInvulnerable / 8) % 2 === 0) {
                this.player.draw(ctx, this.cameraX);
            }

            const level = LEVELS[this.currentLevel];
            if (level.forcedScroll) {
                // Con reduceEffects, un valor fijo en vez del pulso rojo oscilante junto al borde
                // izquierdo de la pantalla (la luz que más se acerca a un parpadeo real del juego).
                const pulse = this.reduceEffects ? 0.8 : (0.6 + Math.sin(Date.now() * 0.012) * 0.4);
                // El resplandor rojo del muro solo cuando el muro existe: durante la cuenta
                // atrás la cámara sigue al jugador y aún no hay nada persiguiendo.
                if (this.forcedScrollDelay === 0) {
                    const wallGrad = ctx.createLinearGradient(0, 0, 18, 0);
                    wallGrad.addColorStop(0, `rgba(255,70,70,${0.9 * pulse})`);
                    wallGrad.addColorStop(1, 'rgba(255,70,70,0)');
                    ctx.fillStyle = wallGrad;
                    ctx.fillRect(0, 20, 18, GAME_HEIGHT - 20);
                }
                if (this.forcedScrollDelay === 0) {
                    ctx.fillStyle = `rgba(255,100,100,${0.7 + pulse * 0.3})`;
                    ctx.font = 'bold 8px "Rajdhani", sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText('⚠ NÚCLEO', 90, 28);
                    ctx.textAlign = 'left';
                }
                if (this.forcedScrollDelay > 0) {
                    ctx.fillStyle = PALETTE.accent2; ctx.font = 'bold 22px "Orbitron", sans-serif'; ctx.textAlign = 'center';
                    const secs = Math.ceil(this.forcedScrollDelay / 60);
                    ctx.fillText(secs > 0 ? String(secs) : '¡CORRE!', GAME_WIDTH / 2, GAME_HEIGHT / 2);
                    ctx.font = '10px "Rajdhani", sans-serif'; ctx.fillStyle = PALETTE.dim;
                    ctx.fillText('EL NÚCLEO VA A COLAPSAR', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 18);
                    ctx.textAlign = 'left';
                }
            }

            // Tormenta iónica: capa visual del ciclo (la lógica de daño vive en update()).
            // Aviso: tinte ámbar pulsante + cartel. Descarga: tinte violeta + rayos verticales
            // (visual puro: Math.random, no RNG). En ambas fases, un resplandor cian bajo cada
            // plataforma elevada señala dónde hay techo — la regla de refugio, dibujada.
            // Con reduceEffects: tintes fijos, sin pulso ni rayos (nada que parpadee).
            if (level.ionStorm) {
                const phase = this.stormPhase(level.ionStorm);
                if (phase !== 'calm') {
                    for (const p of this.platforms) {
                        if (!p.solid || p.y >= 150) continue; // solo lo elevado da techo útil
                        const sx = p.x - this.cameraX;
                        if (sx > GAME_WIDTH || sx + p.w < 0) continue;
                        const shelterGrad = ctx.createLinearGradient(0, p.y + p.h, 0, p.y + p.h + 22);
                        shelterGrad.addColorStop(0, 'rgba(124,245,255,0.16)');
                        shelterGrad.addColorStop(1, 'rgba(124,245,255,0)');
                        ctx.fillStyle = shelterGrad;
                        ctx.fillRect(sx, p.y + p.h, p.w, 22);
                    }
                    const pulse = this.reduceEffects ? 0.7 : 0.55 + Math.sin(Date.now() * 0.02) * 0.45;
                    ctx.textAlign = 'center';
                    ctx.font = 'bold 8px "Rajdhani", sans-serif';
                    if (phase === 'warn') {
                        ctx.fillStyle = `rgba(255,210,63,${0.05 + 0.06 * pulse})`;
                        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
                        ctx.fillStyle = `rgba(255,210,63,${0.6 + pulse * 0.4})`;
                        ctx.fillText('⚠ TORMENTA INMINENTE', GAME_WIDTH / 2, 28);
                    } else {
                        ctx.fillStyle = `rgba(181,139,255,${this.reduceEffects ? 0.12 : 0.06 + 0.08 * pulse})`;
                        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
                        if (!this.reduceEffects) {
                            ctx.save();
                            ctx.strokeStyle = 'rgba(124,245,255,0.7)'; ctx.lineWidth = 1;
                            for (let i = 0; i < 3; i++) {
                                if (Math.random() < 0.3) {
                                    const bx = Math.random() * GAME_WIDTH;
                                    ctx.beginPath(); ctx.moveTo(bx, 20); ctx.lineTo(bx + (Math.random() - 0.5) * 10, 150); ctx.stroke();
                                }
                            }
                            ctx.restore();
                        }
                        ctx.fillStyle = 'rgba(200,170,255,0.95)';
                        ctx.fillText('⚡ DESCARGA — A CUBIERTO', GAME_WIDTH / 2, 28);
                    }
                    ctx.textAlign = 'left';
                }
            }

            ctx.fillStyle = 'rgba(11,6,32,0.75)'; ctx.fillRect(0, 0, GAME_WIDTH, 20);
            ctx.fillStyle = PALETTE.ink; ctx.font = '10px "Rajdhani", sans-serif';
            ctx.fillText(`Lv${this.player.level}`, 4, 14);
            ctx.fillStyle = PALETTE.hp; ctx.fillText(`HP:${this.player.hp}/${this.player.maxHp}`, 30, 14);
            ctx.fillStyle = PALETTE.en; ctx.fillText(`EN:${this.player.energy}/${this.player.maxEnergy}`, 108, 14);
            ctx.fillStyle = PALETTE.accent2; ctx.fillText(`♥${this.player.lives}`, 178, 14);
            ctx.fillStyle = PALETTE.panel; ctx.fillRect(256, 7, 56, 7);
            ctx.fillStyle = PALETTE.xp; ctx.fillRect(256, 7, 56 * Math.min(1, this.player.xp / this.player.xpToNextLevel), 7);
            ctx.fillStyle = PALETTE.dim; ctx.font = '8px "Rajdhani", sans-serif'; ctx.fillText('XP', 236, 13);
            ctx.fillStyle = PALETTE.dim; ctx.font = '9px "Rajdhani", sans-serif';
            ctx.fillText(`${LEVELS[this.currentLevel].name}`, 6, 32);
            // Arriba a la derecha, justo debajo de la franja del HUD: en el móvil la fila de
            // controles flotantes ahora tapa la esquina inferior, así que el cronómetro sube
            // arriba (fuera de esa zona) en vez de compartir sitio con el botón "Salir".
            ctx.fillStyle = 'rgba(11,6,32,0.7)'; ctx.fillRect(GAME_WIDTH - 42, 34, 42, 12);
            ctx.fillStyle = PALETTE.dim; ctx.font = '8px "Rajdhani", sans-serif'; ctx.textAlign = 'right';
            ctx.fillText(formatTime(this.runElapsed), GAME_WIDTH - 4, 43);
            ctx.textAlign = 'left';

            if (this.levelUpMessage > 0) {
                ctx.fillStyle = PALETTE.accent3; ctx.font = 'bold 14px "Orbitron", sans-serif';
                ctx.fillText('¡SUBISTE DE NIVEL!', 55, 70);
            }
            if (this.levelCompleteMessage > 0) {
                ctx.fillStyle = PALETTE.accent; ctx.font = 'bold 14px "Orbitron", sans-serif';
                ctx.fillText('SECTOR COMPLETADO', 55, 70);
            }
            if (this.livesLostMessage > 0) {
                ctx.textAlign = 'center';
                ctx.fillStyle = PALETTE.hpLow; ctx.font = 'bold 14px "Orbitron", sans-serif';
                ctx.fillText('¡PERDISTE UNA VIDA!', GAME_WIDTH / 2, 70);
                ctx.fillStyle = PALETTE.ink; ctx.font = '11px "Rajdhani", sans-serif';
                ctx.fillText(`Quedan ${this.player.lives}`, GAME_WIDTH / 2, 86);
                ctx.textAlign = 'left';
            }
            if (this.extraLifeMessage > 0) {
                ctx.textAlign = 'center';
                ctx.fillStyle = PALETTE.accent2; ctx.font = 'bold 14px "Orbitron", sans-serif';
                ctx.fillText('¡VIDA EXTRA!', GAME_WIDTH / 2, 70);
                ctx.fillStyle = PALETTE.ink; ctx.font = '11px "Rajdhani", sans-serif';
                ctx.fillText(`Ahora tienes ${this.player.lives}`, GAME_WIDTH / 2, 86);
                ctx.textAlign = 'left';
            }
            if (this.extraEnergyMessage > 0) {
                ctx.textAlign = 'center';
                ctx.fillStyle = PALETTE.en; ctx.font = 'bold 14px "Orbitron", sans-serif';
                ctx.fillText('¡ENERGÍA EXTRA!', GAME_WIDTH / 2, 70);
                ctx.fillStyle = PALETTE.ink; ctx.font = '11px "Rajdhani", sans-serif';
                ctx.fillText(`Máximo ahora: ${this.player.maxEnergy}`, GAME_WIDTH / 2, 86);
                ctx.textAlign = 'left';
            }
            // La última capa del nivel: la transición de encuentro tapa también el HUD
            this.drawCombatTransition(ctx);
        }
        this.drawHintOverlay(ctx);
        ctx.restore();
    }
}

const game = new Game();

// Empuja la barra de direcciones fuera de la vista en los móviles cuyo navegador la contrae al
// hacer scroll (no todos lo hacen ya, es "best effort" — el fullscreen nativo de requestMobileFullscreen()
// al pulsar JUGAR es el que de verdad la quita en los que lo soportan).
if (IS_TOUCH_DEVICE) window.addEventListener('load', () => setTimeout(() => window.scrollTo(0, 1), 50));

// ---- Modo depuración vía URL, sin tocar la consola ----
// ?level=N        -> entra directo al nivel N (1-12), con vida/energía llenas, saltándose el mapa.
// ?unlock=all     -> desbloquea todos los nodos del mapa para poder elegir cualquiera a mano.
// ?char=bolt|shade|scrap -> pilota ese héroe directamente (se da por desbloqueado).
// ?dailyDate=YYYY-MM-DD -> simula "hoy" para el Reto Diario (piloto, semilla y el registro
//   "¿ya jugaste hoy?" dependen de esta fecha en vez de la real) — para probar que rota de piloto
//   y que el mejor tiempo se resetea de un día a otro sin tener que esperar días de verdad.
// Combinables: ?level=1&char=scrap&unlock=all para entrar al nivel 1 pilotando a Scrap, por ejemplo.
(function setupDebugMode() {
    const params = new URLSearchParams(location.search);
    if (params.get('unlock') === 'all') {
        game.worldMap.nodes.forEach(n => { n.unlocked = true; });
    }
    // ?char=bolt|shade|scrap -> entra pilotando ese héroe directamente (se da por desbloqueado)
    const debugChar = params.get('char');
    if (debugChar && HEROES[debugChar]) {
        game.unlockedCharacters.add(debugChar);
        game.player.character = debugChar;
    }
    const debugDailyDate = params.get('dailyDate');
    if (debugDailyDate && /^\d{4}-\d{2}-\d{2}$/.test(debugDailyDate)) {
        todayDateString = () => debugDailyDate;
    }
    const debugLevel = params.get('level');
    if (debugLevel !== null) {
        const idx = parseInt(debugLevel, 10) - 1;
        if (idx >= 0 && idx < LEVELS.length) {
            game.worldMap.nodes[idx].unlocked = true;
            game.gameStarted = true;
            closeMenuOverlay();
            game.loadLevel(idx);
            game.inWorldMap = false;
            game.inLevel = true;
            game.player.hp = game.player.maxHp;
            game.player.energy = game.player.maxEnergy;
            game.player.lives = game.player.maxLives;
        }
    }
})();

// Paso de simulación fijo a 60Hz: requestAnimationFrame dispara a la tasa de refresco del
// monitor (120/144Hz en muchos equipos), pero update() debe correr un número de pasos
// proporcional al TIEMPO real transcurrido, no una vez por frame — si no, toda la física
// (calibrada en unidades/frame a 60fps) va más rápida cuanto mejor es la pantalla, y los
// tiempos del cronómetro y del Reto Diario dejan de ser comparables entre dispositivos.
const STEP_MS = 1000 / 60;
let lastFrameTime = performance.now();
let stepAccumulator = 0;
function gameLoop(now) {
    stepAccumulator += now - lastFrameTime;
    lastFrameTime = now;
    // Pestaña en segundo plano o parón largo del navegador: descartar el exceso en vez de
    // simular cientos de pasos de golpe al volver.
    if (stepAccumulator > 250) stepAccumulator = 250;
    while (stepAccumulator >= STEP_MS) { game.update(); stepAccumulator -= STEP_MS; }
    game.draw();
    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
