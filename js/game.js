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

// ---- Duelo a distancia: reta a un amigo con tu tiempo del Reto Diario. El token viaja en la
// URL (?duelo=...) y codifica versión|fecha|tiempo|nombre; quien lo abre juega EXACTAMENTE el
// mismo desafío (el reto ya es determinista por fecha: nivel, piloto, dificultad y azar
// sembrado) contra un fantasma de ritmo con ese tiempo. base64url para sobrevivir a las URLs,
// y checksum con el hashStringToSeed existente — no es criptografía, es integridad ante
// truncados/typos del enlace compartido.
function sanitizeDuelName(name) {
    return String(name || '').replace(/[^0-9A-Za-zÀ-öø-ÿÑñ _-]/g, '').trim().slice(0, 14);
}
// Ruta del fantasma (v2): posiciones (x,y) muestreadas cada 12 frames durante el reto,
// submuestreadas a ≤600 puntos y empaquetadas a 2 bytes por punto — x/4 en 9 bits (niveles de
// hasta 2047px) e y/4 en 6. Formato "<strideFrames>:<base64url>". La cuantización de 4px es
// invisible en un fantasma translúcido y deja el token en ~1.2K caracteres para una partida de
// minuto y medio. Grabar POSICIONES y no inputs es deliberado: reproducirlas no exige
// re-simular nada (ni duplicar el RNG global sembrado), y las pausas de combate del retador
// quedan registradas tal cual — su fantasma se queda clavado donde se quedó él.
function encodeDuelRoute(samples) {
    const n = Math.floor(samples.length / 3); // tripletas (x, y, ¿en combate?)
    if (n < 2) return '';
    const k = Math.max(1, Math.ceil(n / 600)); // submuestreo adaptativo: partidas largas, stride mayor
    let bin = '';
    for (let i = 0; i < n; i += k) {
        const x4 = Math.max(0, Math.min(511, Math.round(samples[3 * i] / 4)));
        const y4 = Math.max(0, Math.min(63, Math.round(samples[3 * i + 1] / 4)));
        // el bit alto del 2º byte va gratis: "estaba en combate" — así el fantasma puede
        // enseñar el ⚔ en vez de parecer bloqueado durante las pausas de duelo del retador
        const combat = samples[3 * i + 2] ? 0x80 : 0;
        bin += String.fromCharCode(x4 & 0xFF, (((x4 >> 8) & 1) | (y4 << 1) | combat) & 0xFF);
    }
    return (12 * k) + ':' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeDuelRoute(str) {
    try {
        const sep = String(str).indexOf(':');
        if (sep < 1) return null;
        const stride = parseInt(str.slice(0, sep), 10);
        if (!Number.isFinite(stride) || stride < 6 || stride > 600) return null;
        const bin = atob(str.slice(sep + 1).replace(/-/g, '+').replace(/_/g, '/'));
        const points = [];
        for (let i = 0; i + 1 < bin.length; i += 2) {
            const b0 = bin.charCodeAt(i), b1 = bin.charCodeAt(i + 1);
            points.push({ x: (((b1 & 1) << 8) | b0) * 4, y: ((b1 >> 1) & 63) * 4, c: !!(b1 & 0x80) });
        }
        return points.length >= 2 ? { stride, points } : null;
    } catch (e) { return null; }
}
function encodeDuelToken(dateStr, timeMs, name = '', route = '') {
    const payload = route
        ? `v2|${dateStr}|${Math.round(timeMs)}|${sanitizeDuelName(name)}|${route}`
        : `v1|${dateStr}|${Math.round(timeMs)}|${sanitizeDuelName(name)}`;
    const b64 = btoa(unescape(encodeURIComponent(payload))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const check = (hashStringToSeed(payload) >>> 0).toString(36);
    return `${b64}.${check}`;
}
function decodeDuelToken(token) {
    try {
        const [b64, check] = String(token).split('.');
        if (!b64 || !check) return null;
        const payload = decodeURIComponent(escape(atob(b64.replace(/-/g, '+').replace(/_/g, '/'))));
        if (((hashStringToSeed(payload) >>> 0).toString(36)) !== check) return null;
        const [v, date, timeRaw, name, routeRaw] = payload.split('|');
        // v1 (sin ruta, los enlaces ya compartidos) y v2 (con ruta) conviven: la ruta es un
        // extra — si falta o llega ilegible, el duelo cae al fantasma de ritmo de siempre.
        if ((v !== 'v1' && v !== 'v2') || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
        const time = parseInt(timeRaw, 10);
        // 5s–30min: fuera de ese rango, o el token llegó roto o alguien está trolleando
        if (!Number.isFinite(time) || time < 5000 || time > 30 * 60000) return null;
        return { date, time, name: sanitizeDuelName(name), route: (v === 'v2' && routeRaw) ? decodeDuelRoute(routeRaw) : null };
    } catch (e) { return null; }
}

// Objetivo secundario (Cristales de Señal ◆, ver SignalCrystal en entities.js): umbrales que
// destapan las puertas de las torres Extra en el mapa estelar. Hay 36 cristales (TRES por nivel
// del mapa — con uno por nivel la primera puerta no podía abrirse antes del sector 5) y los
// umbrales son 8 (≈ Mundo 1 explorado a fondo) y 20 (≈ mitad del juego), con margen de sobra
// para que no haga falta el pleno.
const SIGNAL_GATES = [
    { level: 12, count: 8, name: 'Torre de Vigía' },
    { level: 13, count: 20, name: 'Aguja Glacial' }
];
const TOTAL_CRYSTALS = LEVELS.reduce((n, l) => n + (l.crystals || []).length, 0);

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

// La nave del cadete — el objetivo de toda la historia, por fin en pantalla (finale del
// nivel 12, ver Game.startFinale). Vectorial a juego con el resto del arte: cápsula con
// ventana, aletas y llama de despegue.
function drawShip(ctx, x, groundY, thrusting, t) {
    const w = 20, h = 38;
    ctx.save();
    if (thrusting) {
        const flick = 6 + Math.random() * 8 + Math.min(16, t * 0.12);
        const flame = ctx.createLinearGradient(0, groundY, 0, groundY + flick);
        flame.addColorStop(0, '#ffd23f'); flame.addColorStop(1, 'rgba(255,92,108,0)');
        ctx.fillStyle = flame;
        ctx.beginPath();
        ctx.moveTo(x - 5, groundY); ctx.lineTo(x + 5, groundY); ctx.lineTo(x, groundY + flick);
        ctx.closePath(); ctx.fill();
    }
    ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 10;
    const body = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    body.addColorStop(0, '#9be8f5'); body.addColorStop(0.5, '#f5f3ff'); body.addColorStop(1, '#5fb8d9');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(x, groundY - h);
    ctx.quadraticCurveTo(x + w / 2, groundY - h + 14, x + w / 2, groundY - 8);
    ctx.lineTo(x + w / 2, groundY); ctx.lineTo(x - w / 2, groundY);
    ctx.lineTo(x - w / 2, groundY - 8);
    ctx.quadraticCurveTo(x - w / 2, groundY - h + 14, x, groundY - h);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.accent2;
    ctx.beginPath(); ctx.moveTo(x - w / 2, groundY - 10); ctx.lineTo(x - w / 2 - 6, groundY); ctx.lineTo(x - w / 2, groundY); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w / 2, groundY - 10); ctx.lineTo(x + w / 2 + 6, groundY); ctx.lineTo(x + w / 2, groundY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = PALETTE.bg1;
    ctx.beginPath(); ctx.arc(x, groundY - h + 16, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PALETTE.accent;
    ctx.beginPath(); ctx.arc(x, groundY - h + 16, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

class Game {
    constructor() {
        this.unlockedCharacters = new Set(['kes']);
        this.player = new Player(20, 100, 'kes');
        this.currentLevel = 0; this.platforms = []; this.enemies = []; this.goalFlag = null; this.capsules = []; this.energyCells = []; this.beams = [];
        this.crystals = []; // instancias de SignalCrystal del nivel actual
        this.signalCrystals = new Set(); // índices de nivel cuyo cristal ya se recogió — persiste con el guardado, se pierde en Game Over
        this.combat = null; this.combatTransition = null; this.keys = {}; this.cameraX = 0; this.gameStarted = false;
        this.combatTouchHold = false; // toque sostenido en pantalla durante un duelo = acelerar turnos
        this.finale = null; // máquina de estados del final del juego (colapso → nave → despegue)
        this.wallStarted = false; // muro con disparador (forcedScroll.triggerX) ya en marcha
        this.wallMessage = 0;
        this.levelUpMessage = 0; this.levelCompleteMessage = 0; this.livesLostMessage = 0; this.extraLifeMessage = 0; this.extraEnergyMessage = 0;
        this.crystalMessage = 0; this.signalUnlockMessage = 0; this.signalUnlockText = '';
        this.unlockScreen = null; // id de héroe mientras se muestra su pantalla de desbloqueo (pausa el juego)
        this.charSelectOpen = false; this.charSelectIndex = 0; // hangar de selección de personaje (pausa el juego)
        this.skillTreeOpen = false; this.skillCursor = { branch: 0, node: 0 }; // árbol de mejoras (pausa el juego, como el hangar)
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
        this.pendingDuel = null; // {date, time, name} decodificado de ?duelo= — el menú ofrece el duelo
        this.duelRival = null; this.duelGhost = null; // rival y su fantasma durante un duelo en marcha
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
                ${this.pendingDuel ? `
                <button class="menu-btn daily-btn" data-action="duel">⚔️ DUELO: ganar a ${this.pendingDuel.name || 'tu rival'} — ${formatTime(this.pendingDuel.time)}</button>
                <p class="daily-note">Reto del ${this.pendingDuel.date}: ${LEVELS[dailyLevelFor(this.pendingDuel.date)].name} · dificultad ${dailyDifficultyFor(this.pendingDuel.date).label} · piloto ${HEROES[dailyHeroFor(this.pendingDuel.date)].name} · ${this.pendingDuel.route ? 'fantasma con ruta real' : 'fantasma de ritmo'}</p>` : ''}
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
                    <b>Combate</b> — ↑↓ + ESPACIO, o las teclas 1-4. Mantén pulsado ESPACIO (o el dedo en pantalla) para acelerar los turnos<br>
                    <b>Pilotos</b> — Kes dobla salto, Bolt vuela, Shade da un impulso lateral, Scrap rompe refuerzos.
                    Se desbloquean derrotando al jefe de cada mundo; cámbialos desde la chapa del mapa o con la tecla C.<br>
                    <b>Mejoras</b> — cada subida de nivel da 1 punto para el árbol de mejoras (chapa MEJORAS del mapa, o tecla T)<br>
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
        else if (action === 'duel') this.startDailyChallenge(this.pendingDuel);
        else if (action === 'times') this.showMenuPanel('menuTimes');
        else if (action === 'help') this.showMenuPanel('menuHelp');
        else if (action === 'back') this.showMenuPanel('menuMain');
        else if (action === 'menu') this.showMainMenu();
        else if (action === 'share') this.shareRun(btn.dataset.shareText);
        else if (action === 'challenge') this.shareDuelChallenge(btn.dataset.date, parseFloat(btn.dataset.time));
    }
    // Comparte una URL de duelo con TU tiempo como fantasma a batir. El nombre se pide una vez
    // (prompt, opcional) y se recuerda — es lo que verá el rival en su menú y sobre el fantasma.
    shareDuelChallenge(dateStr, timeMs) {
        let name = '';
        try { name = localStorage.getItem('astroLeapDuelName') || ''; } catch (e) { /* noop */ }
        if (!name) {
            try {
                name = sanitizeDuelName(window.prompt('Tu nombre para el duelo (opcional):') || '');
                if (name) localStorage.setItem('astroLeapDuelName', name);
            } catch (e) { /* prompt bloqueado o sin almacenamiento: duelo anónimo */ }
        }
        // La ruta grabada viaja en el token SOLO si el botón corresponde al último run
        // completado (misma fecha y mismo tiempo) — si no, duelo v1 sin ruta.
        const run = this.lastDuelRun;
        const route = (run && run.date === dateStr && Math.round(run.time) === Math.round(timeMs)) ? run.route : '';
        const url = `${location.origin}${location.pathname}?duelo=${encodeDuelToken(dateStr, timeMs, name, route)}`;
        const text = `⚔️ Te reto en ASTRO LEAP: el Reto Diario del ${dateStr} en ${formatTime(timeMs)}. Mi fantasma te espera — ¿me ganas?`;
        if (navigator.share) {
            navigator.share({ title: 'Astro Leap — Duelo', text, url }).catch(() => { /* cancelado: no pasa nada */ });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(`${text} ${url}`).then(() => window.alert('Enlace del duelo copiado — pégaselo a tu rival.')).catch(() => window.prompt('Copia el enlace del duelo:', url));
        } else {
            window.prompt('Copia el enlace del duelo:', url);
        }
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
        this.signalCrystals = new Set();
        this.startGame();
    }

    // ---- Reto Diario: nivel, piloto, dificultad y física de combate, todo sembrado por la fecha
    // (ver dailyLevelFor()/dailyHeroFor()/dailyDifficultyFor()/RNG en entities.js) — misma
    // partida para todo el mundo ese día, así que los tiempos se pueden comparar de verdad. Corre
    // en instancias de player/worldMap APARTE de las reales (guardadas en this._real*), para que
    // nada de esto pueda tocar la partida guardada — ni al ganar, ni al morir, ni si el jugador
    // sale a media partida.
    // duel (opcional, {date, time, name} de decodeDuelToken): juega el reto DE ESA FECHA — no
    // el de hoy — contra el fantasma de ritmo del rival. Misma tubería determinista: la fecha
    // decide nivel/piloto/dificultad/semilla, se abra el enlace el día que se abra.
    startDailyChallenge(duel = null) {
        if (this.gameStarted) return;
        this._realPlayer = this.player;
        this._realWorldMap = this.worldMap;
        this._realUnlocked = this.unlockedCharacters;
        this._realPickups = this.collectedPickups;
        this._realSignals = this.signalCrystals; // los cristales del reto se descartan, como todo lo demás

        const dateStr = duel ? duel.date : todayDateString();
        const hero = dailyHeroFor(dateStr);
        const levelIdx = dailyLevelFor(dateStr);
        const difficulty = dailyDifficultyFor(dateStr);
        RNG = mulberry32(hashStringToSeed(dateStr));
        this.dailyMode = true; this.dailyDate = dateStr; this.dailyHero = hero;
        this.dailyLevelIdx = levelIdx; this.dailyDifficulty = difficulty;
        // Duelo: rival + su fantasma (una instancia de Player SOLO para dibujar — no consume
        // RNG ni toca físicas: la comparación de tiempos sigue siendo justa). Si el token trae
        // ruta grabada (v2), el fantasma la reproduce; si no, marca el ritmo lineal.
        this.duelRival = duel ? { time: duel.time, name: duel.name || 'RIVAL', route: duel.route || null } : null;
        this.duelGhost = duel ? new Player(20, 137, hero) : null;
        // Caja negra: TODO reto graba su ruta (ver update()), por si al acabar quieres retar.
        this.duelRec = []; this.duelRecFrame = 0; this.lastDuelRun = null;

        this.player = new Player(20, 100, hero);
        this.unlockedCharacters = new Set([hero]);
        this.worldMap = new WorldMap();
        this.collectedPickups = new Set();
        this.signalCrystals = new Set();

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
        this.duelRival = null; this.duelGhost = null; // pendingDuel se conserva: el duelo se puede reintentar desde el menú
        if (this._realPlayer) {
            this.player = this._realPlayer; this.worldMap = this._realWorldMap;
            this.unlockedCharacters = this._realUnlocked; this.collectedPickups = this._realPickups;
            this.signalCrystals = this._realSignals;
            this._realPlayer = null; this._realWorldMap = null; this._realUnlocked = null; this._realPickups = null; this._realSignals = null;
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
        const wasDuel = !!this.duelRival; // antes de restoreAfterDaily(), que lo anula
        this.restoreAfterDaily();
        startScreen.innerHTML = this.buildMenuScreen({
            title: wasDuel ? 'DUELO FALLIDO' : 'RETO FALLIDO',
            subtitle: wasDuel
                ? 'Sin vidas — el fantasma sigue esperando: el duelo se puede reintentar desde el menú.'
                : 'Sin vidas — el reto de hoy sigue disponible, inténtalo otra vez cuando quieras.'
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
                selectedCharacter: this.player.character,
                // Árbol de mejoras: fuera de data.player a propósito — loadProgress hace
                // Object.assign sobre el jugador y pisaría el Set con un Array crudo.
                skills: Array.from(this.player.skills),
                skillPoints: this.player.skillPoints,
                signalCrystals: Array.from(this.signalCrystals)
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
            // Los bonos instantáneos (blindaje/núcleo) NO se re-aplican al cargar: ya viven en
            // los maxHp/maxEnergy guardados dentro de data.player.
            if (Array.isArray(data.skills)) this.player.skills = new Set(data.skills);
            if (typeof data.skillPoints === 'number') this.player.skillPoints = data.skillPoints;
            if (Array.isArray(data.signalCrystals)) this.signalCrystals = new Set(data.signalCrystals);
            // Sincroniza las puertas de las torres con la cuenta cargada (también arregla saves
            // de antes de que las torres tuvieran nodo).
            this.applySignalUnlocks();
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
        // Un nivel Extra (Torre de Vigía) no tiene nodo en el mapa: sin nodo, se trata como
        // no-completado (XP entera la primera vez, como cualquier nivel nuevo).
        const mapNode = this.worldMap.nodes[lvl];
        const levelCompleted = mapNode ? mapNode.completed : false;
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
        // goalY opcional por nivel: en los niveles verticales (Torre de Vigía) la bandera debe
        // pisar el piso alto, no flotar a la altura del suelo de siempre.
        this.goalFlag = new GoalFlag(level.goal, level.goalY ?? 128);
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
        // Cristales de Señal: el set signalCrystals hace de anti-refarmeo Y de persistencia a
        // la vez (se guarda con la partida, a diferencia de collectedPickups que es de sesión —
        // los cristales abren contenido y no deben "des-recogerse" al recargar el navegador).
        this.crystals = (level.crystals || []).map(([cx, cy], i) => {
            const cry = new SignalCrystal(cx, cy);
            cry.key = `${lvl}-${i}`; // clave por cristal: ahora hay varios por nivel
            if (this.signalCrystals.has(cry.key)) cry.collected = true;
            return cry;
        });
        this.player.x = 20; this.player.y = 100; this.player.vx = 0; this.player.vy = 0;
        this.player.energy = this.player.maxEnergy; this.cameraX = 0;
        this.autoScrollX = 0;
        this.forcedScrollDelay = level.forcedScroll ? level.forcedScroll.startDelay : 0;
        // Tormenta iónica (ver ionStorm en levels.js): el reloj arranca en calma SIEMPRE —
        // también al reaparecer tras morir, para que nunca respawnees bajo una descarga.
        this.stormT = 0;
        // Sistema de emergencia (árbol de mejoras): se rearma con cada (re)carga de nivel.
        this.player.emergencyUsed = false;
        this.finale = null;
        this.wallStarted = false; this.wallMessage = 0;
        // Barrido del Centinela (ver sentinelWatch en levels.js): como la tormenta, el reloj
        // arranca en calma con cada (re)carga — nunca reapareces con la onda encima.
        this.watchT = 0;
    }

    // Fase del barrido del Centinela según this.watchT: calma (avanza) → apunta (súbete a una
    // cobertura) → onda (el suelo de su zona quema). Frames, determinista, como la tormenta.
    watchPhase(watch) {
        const c = this.watchT % (watch.calm + watch.warn + watch.fire);
        if (c < watch.calm) return 'calm';
        if (c < watch.calm + watch.warn) return 'warn';
        return 'fire';
    }

    // Destapa en el mapa las puertas de las torres cuyo umbral de cristales ya se cumple.
    // announce=true (al recoger un cristal): mensaje grande + fanfarria si alguna acaba de
    // aparecer. Sin announce (tras cargar partida): solo sincroniza el estado.
    applySignalUnlocks(announce = false) {
        for (const gate of SIGNAL_GATES) {
            const node = this.worldMap.nodes[gate.level];
            if (!node || node.unlocked || this.signalCrystals.size < gate.count) continue;
            node.unlocked = true;
            if (announce) {
                this.signalUnlockMessage = 200;
                this.signalUnlockText = gate.name;
                this.crystalMessage = 0;
                if (window.SFX) SFX.levelUp();
            }
        }
    }

    // Acelerador de turnos del duelo: mantener pulsado ESPACIO/Enter (o el dedo en pantalla,
    // ver setupTouchControls) hace correr las pausas de mensaje a 4x. Mantener ya no dispara
    // acciones (el autorepeat se filtra en setupInput con e.repeat): pulsar decide, mantener
    // acelera — dos gestos, dos significados.
    combatFastForward() {
        return !!(this.keys.Space || this.keys.Enter || this.combatTouchHold);
    }

    // Energía por derrota, con el nodo Reciclador del árbol (+1 sobre ENERGY_PER_KILL).
    energyPerKill() {
        return ENERGY_PER_KILL + (this.player.hasSkill('reciclador') ? 1 : 0);
    }
    // Daño de los peligros del terreno (puertas, tormenta, muro), con el nodo Aislante (mitad).
    hazardDamage(base) {
        return this.player.hasSkill('aislante') ? Math.ceil(base / 2) : base;
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

    // ---- Árbol de mejoras (SKILL_TREE en entities.js, DESIGN.md §2.22) ----
    // Desbloquea un nodo: exige un punto disponible y el nodo anterior de su rama. Los bonos
    // instantáneos (blindaje/núcleo) se aplican aquí UNA sola vez — como maxHp/maxEnergy se
    // guardan ya subidos, cargar la partida no los re-aplica.
    unlockSkill(id) {
        const p = this.player;
        if (p.skills.has(id) || p.skillPoints <= 0) return false;
        for (const branch of Object.values(SKILL_TREE)) {
            const idx = branch.nodes.findIndex(n => n.id === id);
            if (idx === -1) continue;
            if (idx > 0 && !p.skills.has(branch.nodes[idx - 1].id)) return false;
            p.skills.add(id);
            p.skillPoints--;
            if (id === 'blindaje') { p.maxHp += 6; p.hp += 6; }
            if (id === 'nucleo') { p.maxEnergy += 4; p.energy += 4; }
            if (window.SFX) SFX.levelUp();
            this.saveProgress();
            return true;
        }
        return false;
    }
    openSkillTree() {
        this.skillTreeOpen = true;
        this.skillCursor = { branch: 0, node: 0 };
        if (window.SFX) SFX.confirm();
    }
    closeSkillTree() {
        this.skillTreeOpen = false;
        if (window.SFX) SFX.select();
    }
    updateSkillTreeScreen(keys) {
        const branches = Object.values(SKILL_TREE);
        const c = this.skillCursor;
        if (keys.ArrowRight || keys.KeyD) {
            c.branch = Math.min(branches.length - 1, c.branch + 1);
            if (window.SFX) SFX.select();
            keys.ArrowRight = false; keys.KeyD = false;
        } else if (keys.ArrowLeft || keys.KeyA) {
            c.branch = Math.max(0, c.branch - 1);
            if (window.SFX) SFX.select();
            keys.ArrowLeft = false; keys.KeyA = false;
        } else if (keys.ArrowDown || keys.KeyS) {
            c.node = Math.min(branches[c.branch].nodes.length - 1, c.node + 1);
            if (window.SFX) SFX.select();
            keys.ArrowDown = false; keys.KeyS = false;
        } else if (keys.ArrowUp || keys.KeyW) {
            c.node = Math.max(0, c.node - 1);
            if (window.SFX) SFX.select();
            keys.ArrowUp = false; keys.KeyW = false;
        } else if (keys.Space || keys.Enter) {
            const node = branches[c.branch].nodes[c.node];
            if (!this.unlockSkill(node.id) && window.SFX) SFX.select(); // el fallo suena distinto que el desbloqueo
            keys.Space = false; keys.Enter = false;
        } else if (keys.Escape || keys.KeyT) {
            this.closeSkillTree();
            keys.Escape = false; keys.KeyT = false;
        }
    }
    // Pantalla del árbol: 3 columnas (ramas) × 3 nodos con línea de prerrequisito entre ellos.
    // Estados de nodo: desbloqueado (relleno del color de la rama), disponible (borde cian),
    // bloqueado por prerrequisito o sin puntos (atenuado). Mismo patrón modal que el hangar.
    drawSkillTreeScreen(ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
        grad.addColorStop(0, PALETTE.bg2); grad.addColorStop(1, PALETTE.bg1);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.textAlign = 'center';
        ctx.fillStyle = PALETTE.ink; ctx.font = 'bold 13px "Orbitron", sans-serif';
        ctx.fillText('ÁRBOL DE MEJORAS', GAME_WIDTH / 2, 16);
        const pts = this.player.skillPoints;
        ctx.fillStyle = pts > 0 ? PALETTE.accent3 : PALETTE.dim; ctx.font = '9px "Rajdhani", sans-serif';
        ctx.fillText(pts > 0 ? `Puntos disponibles: ${pts}` : 'Sin puntos — sube de nivel para ganar más', GAME_WIDTH / 2, 28);

        const branches = Object.values(SKILL_TREE);
        const colW = 96, gap = 8;
        const startX = (GAME_WIDTH - (colW * branches.length + gap * (branches.length - 1))) / 2;
        const nodeH = 22, nodeGap = 9, topY = 48;
        this.skillNodeRects = [];
        branches.forEach((branch, bi) => {
            const bx = startX + bi * (colW + gap);
            ctx.fillStyle = branch.color; ctx.font = 'bold 8px "Rajdhani", sans-serif';
            ctx.fillText(branch.name, bx + colW / 2, topY - 6);
            branch.nodes.forEach((node, ni) => {
                const ny = topY + ni * (nodeH + nodeGap);
                const unlocked = this.player.skills.has(node.id);
                const prereqOk = ni === 0 || this.player.skills.has(branch.nodes[ni - 1].id);
                const available = !unlocked && prereqOk && pts > 0;
                const focused = this.skillCursor.branch === bi && this.skillCursor.node === ni;
                this.skillNodeRects.push({ id: node.id, branch: bi, node: ni, x: bx, y: ny, w: colW, h: nodeH });
                // línea de prerrequisito hacia el nodo anterior
                if (ni > 0) {
                    ctx.strokeStyle = unlocked || prereqOk ? branch.color : PALETTE.panelLight;
                    ctx.globalAlpha = 0.6; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(bx + colW / 2, ny - nodeGap); ctx.lineTo(bx + colW / 2, ny); ctx.stroke();
                    ctx.globalAlpha = 1;
                }
                ctx.save();
                ctx.fillStyle = unlocked ? branch.color : (focused ? 'rgba(124,245,255,0.12)' : 'rgba(28,17,64,0.7)');
                if (unlocked) ctx.globalAlpha = 0.32;
                ctx.fillRect(bx, ny, colW, nodeH);
                ctx.restore();
                ctx.strokeStyle = focused ? PALETTE.accent : (unlocked ? branch.color : (available ? PALETTE.dim : 'rgba(168,158,224,0.25)'));
                ctx.lineWidth = focused ? 1.6 : 1;
                if (focused && available) { ctx.save(); ctx.shadowColor = PALETTE.accent; ctx.shadowBlur = 7; ctx.strokeRect(bx + 0.5, ny + 0.5, colW - 1, nodeH - 1); ctx.restore(); }
                ctx.strokeRect(bx + 0.5, ny + 0.5, colW - 1, nodeH - 1);
                ctx.fillStyle = unlocked ? PALETTE.ink : (prereqOk ? PALETTE.ink : PALETTE.dim);
                ctx.font = '8px "Rajdhani", sans-serif';
                ctx.fillText(node.name, bx + colW / 2, ny + 10);
                ctx.fillStyle = unlocked ? branch.color : PALETTE.dim; ctx.font = '7px "Rajdhani", sans-serif';
                ctx.fillText(unlocked ? '✓ desbloqueada' : (prereqOk ? (pts > 0 ? '1 punto' : 'sin puntos') : 'requiere la anterior'), bx + colW / 2, ny + 18);
            });
        });

        const focusedNode = branches[this.skillCursor.branch].nodes[this.skillCursor.node];
        ctx.fillStyle = PALETTE.dim; ctx.font = '8.5px "Rajdhani", sans-serif';
        wrapText(ctx, focusedNode.desc, GAME_WIDTH / 2, 148, 290, 10);
        ctx.fillStyle = PALETTE.accent; ctx.font = '8px "Rajdhani", sans-serif';
        ctx.fillText('← → ↑ ↓ elegir · ESPACIO desbloquear · ESC salir', GAME_WIDTH / 2, GAME_HEIGHT - 6);
        ctx.textAlign = 'left';
    }
    // Chapa del árbol en el mapa, debajo de la del piloto — brilla cuando hay puntos que gastar.
    drawSkillChip(ctx) {
        const x = 8, y = 64, w = 90, h = 16;
        this.skillChipRect = { x, y, w, h };
        const pts = this.player.skillPoints;
        ctx.save();
        ctx.fillStyle = 'rgba(11,6,32,0.75)';
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.fill(); } else ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = pts > 0 ? PALETTE.accent3 : PALETTE.dim; ctx.globalAlpha = pts > 0 ? 0.9 : 0.6; ctx.lineWidth = 1;
        if (pts > 0) { ctx.shadowColor = PALETTE.accent3; ctx.shadowBlur = 5; }
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 3); ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = PALETTE.ink; ctx.font = '8px "Rajdhani", sans-serif';
        ctx.fillText('MEJORAS', x + 5, y + h / 2 + 3);
        ctx.fillStyle = pts > 0 ? PALETTE.accent3 : PALETTE.dim; ctx.textAlign = 'right';
        ctx.fillText(pts > 0 ? `${pts} pts ▸` : '▸', x + w - 5, y + h / 2 + 3);
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

    // La pantalla de victoria y el reset de fin de partida. Método propio para que la finale
    // del nivel 12 (despegue de la nave) pueda dispararlo al terminar su animación — y para la
    // ruta defensiva de cruzar la meta final sin finale (p.ej. tests que matan al jefe a mano).
    finishGame() {
        this.levelCompleting = false; this.gameStarted = false;
        const finalTime = performance.now() - this.runStartTime;
        const isRecord = this.saveBestTime(finalTime);
        if (window.SFX) { SFX.music.stop(); SFX.victory(); }
        const sectors = this.worldMap.mainCount; // los 12 del recorrido — las torres Extra no cuentan en el marcador
        const shareText = `🏆 ASTRO LEAP completado: ${sectors}/${sectors} sectores en ${formatTime(finalTime)}${isRecord ? ' — ¡nuevo récord personal! ⏱️' : ''}. ¿Me bajas el tiempo? 🚀`;
        this.unlockedCharacters = new Set(['kes']);
        this.player = new Player(20, 100, 'kes');
        this.worldMap = new WorldMap();
        this.collectedPickups = new Set();
        this.signalCrystals = new Set();
        this.clearProgress(); // antes de construir el menú, para que no ofrezca "continuar" con nada que continuar
        startScreen.innerHTML = this.buildMenuScreen({
            title: '¡MISIÓN CUMPLIDA!',
            subtitle: 'Derrotaste a Nodo Cero, reparaste la nave y escapaste del Sistema Ceniza.',
            resultHTML: `
                <p class="run-time">${isRecord ? '¡Nuevo récord! ' : ''}Completaste los ${sectors} sectores en ${formatTime(finalTime)}</p>
                ${this.buildShareHTML(shareText)}
            `
        });
        openMenuOverlay();
        this.inLevel = false; this.inWorldMap = false;
    }

    // El final del juego, EN PANTALLA (nivel 12): al ganar el duelo contra Nodo Cero, la Red
    // se derrumba (colapso con los colores de los 4 guardianes y los esbirros cayendo en
    // cascada), todos los peligros se apagan — la calma tras la caída cuenta la historia sin
    // una línea de diálogo —, la NAVE aparece en la meta en lugar de la bandera, y despegas.
    startFinale(boss) {
        this.finale = { phase: 'collapse', t: 0, x: boss.x + boss.w / 2, y: boss.y + boss.h / 2, shipLift: 0 };
        this.enemies.forEach(e => {
            if (!e.isBoss && e.alive) {
                e.alive = false; e.defeated = true;
                this.particles.burst(e.x + e.w / 2, e.y + e.h / 2, e.color, 10, { speed: 1.8, life: 24, size: 2.5 });
            }
        });
        this.beams.forEach(b => { b.t = 0; }); // puertas a fase dormida (y update() ya no las avanza)
        this.shake = 10;
    }

    fullGameOver() {
        if (window.SFX) { SFX.music.stop(); SFX.gameOver(); }
        this.gameStarted = false;
        // Captura el nivel/tiempo ANTES de resetear currentLevel (lo hace loadLevel(0) más abajo).
        const levelReached = LEVELS[this.currentLevel];
        const elapsed = performance.now() - this.runStartTime;
        const pilotName = HEROES[this.player.character].name; // antes del reset del jugador, unas líneas más abajo
        // Sector N/12 contra los sectores del recorrido (los nodos extra no cuentan); si
        // caíste en una torre Extra, se nombra sin numerar — no es un sector del recorrido.
        const isExtra = !!levelReached.extra;
        const sectorLabel = isExtra ? `el nivel extra (${levelReached.name})` : `el sector ${this.currentLevel + 1}/${this.worldMap.mainCount} (${levelReached.name})`;
        const shareText = `☠️ Caí en ${sectorLabel} de ASTRO LEAP, pilotando a ${pilotName} — ${formatTime(elapsed)} de misión. ¿Llegas más lejos? 🚀`;
        this.unlockedCharacters = new Set(['kes']);
        this.player = new Player(20, 100, 'kes');
        this.worldMap = new WorldMap();
        this.collectedPickups = new Set();
        this.signalCrystals = new Set(); // los cristales son progresión: se pierden con todo lo demás
        this.clearProgress(); // antes de construir el menú, para que no ofrezca "continuar" con nada que continuar
        startScreen.innerHTML = this.buildMenuScreen({
            title: 'GAME OVER',
            subtitle: 'Sin vidas restantes — vuelves a empezar.',
            resultHTML: `
                <p class="run-time">Llegaste hasta ${isExtra ? `el nivel extra — ${levelReached.name}` : `el sector ${this.currentLevel + 1}/${this.worldMap.mainCount} — ${levelReached.name}`}</p>
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
            // e.repeat fuera: el autorepeat del navegador al MANTENER una tecla ya no dispara
            // acciones en cadena ni recorre el menú solo — mantener significa "acelerar los
            // turnos" (ver combatFastForward), pulsar significa "decidir".
            if (this.combat && this.combat.active && !e.repeat) this.combat.handleInput(e.code);
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

        // Acelerador táctil de turnos: mantener el dedo en pantalla durante un duelo (sobre el
        // canvas o sobre los botones de combate, da igual) equivale a mantener ESPACIO.
        const ffStart = () => { if (this.combat && this.combat.active) this.combatTouchHold = true; };
        const ffEnd = () => { this.combatTouchHold = false; };
        [canvas, combatButtonsEl].forEach(el => {
            if (!el) return;
            el.addEventListener('touchstart', ffStart, { passive: true });
            el.addEventListener('touchend', ffEnd);
            el.addEventListener('touchcancel', ffEnd);
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
            if (this.skillTreeOpen) {
                e.preventDefault();
                const nodeHit = (this.skillNodeRects || []).find(r => gx >= r.x && gx <= r.x + r.w && gy >= r.y && gy <= r.y + r.h);
                if (nodeHit) {
                    this.skillCursor = { branch: nodeHit.branch, node: nodeHit.node };
                    if (!this.unlockSkill(nodeHit.id) && window.SFX) SFX.select();
                } else {
                    this.closeSkillTree();
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
            const sChip = this.skillChipRect;
            if (sChip && gx >= sChip.x && gx <= sChip.x + sChip.w && gy >= sChip.y && gy <= sChip.y + sChip.h) {
                this.openSkillTree();
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
        const paused = this.unlockScreen || this.charSelectOpen || this.skillTreeOpen || this.hintScreen || this.combatTransition;
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
        // Caja negra del Reto Diario: muestrea la posición cada 12 frames para el fantasma de
        // los duelos. ANTES de los early-returns a propósito: durante un combate (o un aviso)
        // la posición no cambia pero se sigue grabando — la pausa del retador queda registrada
        // tal cual, que es la gracia. Tope de 3000 puntos (10 min).
        if (this.dailyMode && this.duelRec && this.duelRec.length < 9000) {
            this.duelRecFrame++;
            // tripleta (x, y, ¿en combate?): el flag viaja en el bit libre del empaquetado y
            // permite que el fantasma del rival muestre "en duelo" en vez de parecer colgado.
            if (this.duelRecFrame % 12 === 0) this.duelRec.push(this.player.x, this.player.y, (this.combat || this.combatTransition) ? 1 : 0);
        }
        if (this.unlockScreen) {
            if (this.shake > 0) this.shake *= 0.85; // por si acaso, aunque no se dibuje con temblor aquí
            if (this.keys.Space || this.keys.Enter) { this.dismissUnlockScreen(); this.keys.Space = false; this.keys.Enter = false; }
            return;
        }
        if (this.charSelectOpen) { this.updateCharSelectScreen(this.keys); return; }
        if (this.skillTreeOpen) { this.updateSkillTreeScreen(this.keys); return; }
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
            if (this.keys.KeyT) { this.openSkillTree(); this.keys.KeyT = false; }
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
            this.combat.update(this.combatFastForward());
            this.shake = Math.max(this.shake, this.combat.shake || 0);
            if (!this.combat.active) {
                if (this.combat.result === 'win') {
                    const leveled = this.player.gainXP(this.combat.enemy.xpReward);
                    this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + this.energyPerKill());
                    if (this.combat.enemy.xpKey) this.collectedPickups.add(this.combat.enemy.xpKey);
                    this.levelUpMessage = leveled ? 100 : 0;
                    if (leveled) this.showHint('skill-point', 'Has ganado un punto de mejora: gástalo en el ÁRBOL DE MEJORAS — chapa MEJORAS del mapa estelar, o tecla T.');
                    if (window.SFX) { SFX.battleWin(); if (leveled) SFX.levelUp(); SFX.music.playExplore(); }
                    this.particles.burst(this.player.x + this.player.w / 2, this.player.y, PALETTE.accent3, 14, { speed: 2, life: 30, size: 3 });
                    if (this.combat.enemy.isBoss) this.unlockCharacterForBoss(this.combat.enemy.type);
                    if (this.combat.enemy.type === 'nodo_cero') this.startFinale(this.combat.enemy);
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

            if (level.forcedScroll && !this.finale) {
                if (level.forcedScroll.triggerX && !this.wallStarted) {
                    // Muro con disparador por posición (nivel 12): cámara normal hasta que el
                    // jugador cruza triggerX — entonces la Red despierta y el muro arranca
                    // desde donde esté la cámara, sin cuenta atrás.
                    this.cameraX = Math.max(0, Math.min(this.player.x - GAME_WIDTH / 2, maxScroll));
                    this.autoScrollX = this.cameraX;
                    if (this.player.x >= level.forcedScroll.triggerX) {
                        this.wallStarted = true;
                        this.wallMessage = 130;
                        if (window.SFX) SFX.scrollStart();
                    }
                } else if (!level.forcedScroll.triggerX && this.forcedScrollDelay > 0) {
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
                            this.player.takeDamage(this.hazardDamage(3));
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
                        this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + this.energyPerKill());
                        if (enemy.xpKey) this.collectedPickups.add(enemy.xpKey);
                        // El cartel de subida de nivel solo si de verdad subiste — antes se
                        // mostraba en CADA pisotón, hubiera nivel o no.
                        this.player.vy = -3; this.levelUpMessage = leveled ? 80 : 0;
                        if (leveled) this.showHint('skill-point', 'Has ganado un punto de mejora: gástalo en el ÁRBOL DE MEJORAS — chapa MEJORAS del mapa estelar, o tecla T.');
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
            if (!this.finale) for (const beam of this.beams) {
                beam.update();
                if (this.playerInvulnerable === 0 && beam.collides(this.player)) {
                    this.player.takeDamage(this.hazardDamage(4));
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
            if (level.ionStorm && !this.finale) {
                const prevPhase = this.stormPhase(level.ionStorm);
                this.stormT++;
                const phase = this.stormPhase(level.ionStorm);
                if (phase === 'warn' && prevPhase === 'calm') {
                    if (window.SFX) SFX.bossCharge();
                    this.showHint('ion-storm', 'La tormenta va a descargar: ponte a cubierto BAJO una plataforma antes de que caiga, o corre al siguiente refugio.');
                }
                const inStormZone = !level.ionStorm.zone
                    || (this.player.x + this.player.w > level.ionStorm.zone[0] && this.player.x < level.ionStorm.zone[1]);
                if (phase === 'strike' && this.playerInvulnerable === 0 && inStormZone && !this.playerSheltered()) {
                    this.player.takeDamage(this.hazardDamage(5));
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

            // Barrido del Centinela: solo mientras el jefe viva. En plena onda, daña a quien
            // tenga los pies en la franja del suelo de su zona — a salvo sobre una cobertura
            // elevada o en el aire. Mismo patrón golpe+tregua que puertas y tormenta.
            const watch = level.sentinelWatch;
            if (watch) {
                const watchBoss = this.enemies.find(e => e.isBoss);
                if (watchBoss && watchBoss.alive) {
                    const prevWatch = this.watchPhase(watch);
                    this.watchT++;
                    const wPhase = this.watchPhase(watch);
                    if (wPhase === 'warn' && prevWatch === 'calm') {
                        if (window.SFX) SFX.bossCharge();
                        this.showHint('sentinel-watch', 'El Centinela barre su dominio a ras de suelo: cuando apunte, súbete a una cobertura elevada — un salto no dura lo que la onda.');
                    }
                    if (wPhase === 'fire' && this.playerInvulnerable === 0
                        && this.player.x + this.player.w > watch.zoneStart && this.player.x < watchBoss.x
                        && this.player.y + this.player.h > watch.band) {
                        this.player.takeDamage(this.hazardDamage(6));
                        this.playerInvulnerable = 40; // tregua corta a propósito: quedarse en el suelo la onda entera cuesta DOS golpes
                        this.shake = Math.max(this.shake, 6);
                        this.particles.burst(this.player.x + this.player.w / 2, this.player.y + this.player.h, '#ff5c6c', 12, { speed: 2, life: 20, size: 2.5 });
                        if (window.SFX) SFX.zap();
                        if (this.player.hp <= 0) { this.loseLife(); return; }
                    }
                }
            }

            for (const cry of this.crystals) {
                if (cry.collected) continue;
                cry.update();
                if (this.player.collides(cry)) {
                    cry.collected = true;
                    this.signalCrystals.add(cry.key);
                    this.crystalMessage = 110; this.livesLostMessage = 0; this.extraLifeMessage = 0; this.extraEnergyMessage = 0;
                    this.applySignalUnlocks(true); // si cruza un umbral, el cartel de triangulación pisa al de cristal
                    this.saveProgress();
                    if (window.SFX) SFX.extraEnergy();
                    this.particles.burst(cry.x + cry.w / 2, cry.y, PALETTE.accent3, 16, { speed: 2, life: 32, size: 3 });
                }
            }

            // La finale del nivel 12: colapso de la Red → la nave espera → despegue → victoria.
            if (this.finale) {
                const fin = this.finale;
                fin.t++;
                if (fin.phase === 'collapse') {
                    if (fin.t % 14 === 0) {
                        const guardianColors = ['#ff5ecb', '#8b83c2', '#ffd23f', '#ff3366'];
                        this.particles.burst(fin.x + (Math.random() - 0.5) * 44, fin.y + (Math.random() - 0.5) * 30,
                            guardianColors[(fin.t / 14) % 4 | 0], 14, { speed: 2.4, life: 30, size: 3 });
                        this.shake = Math.max(this.shake, 5);
                        if (window.SFX) SFX.zap();
                    }
                    if (fin.t >= 150) {
                        fin.phase = 'ship'; fin.t = 0;
                        if (window.SFX) SFX.levelComplete();
                    }
                } else if (fin.phase === 'takeoff') {
                    fin.shipLift = 0.002 * fin.t * fin.t; // despegue con aceleración
                    if (fin.t % 2 === 0) this.particles.burst(level.goal + 8, 150 - fin.shipLift, PALETTE.accent3, 3, { speed: 1.5, life: 18, size: 2.5 });
                    if (fin.t >= 200) { fin.phase = 'done'; this.finishGame(); return; }
                }
            }

            if (this.player.x >= level.goal && !this.levelCompleting) {
                if (level.boss) {
                    const boss = this.enemies.find(e => e.isBoss);
                    if (boss && boss.alive) { this.player.x = level.goal - 5; this.player.vx = 0; return; }
                }
                // Nivel final: la meta es la NAVE, no una bandera — el flujo sale por la finale.
                if (level.final) {
                    if (this.finale && this.finale.phase === 'collapse') {
                        // la Red aún se derrumba: mismo bloqueo que un jefe vivo
                        this.player.x = level.goal - 5; this.player.vx = 0; return;
                    }
                    if (this.finale && this.finale.phase === 'ship') {
                        // embarque: el jugador sube a bordo y la nave despega
                        this.finale.phase = 'takeoff'; this.finale.t = 0;
                        this.levelCompleting = true; // congela al piloto: va a bordo
                        if (window.SFX) SFX.scrollStart();
                        return;
                    }
                    if (this.finale) return; // despegue en marcha
                    // sin finale (jefe eliminado sin duelo, p.ej. en tests): victoria directa
                    this.levelCompleting = true;
                    if (window.SFX) SFX.levelComplete();
                    this.finishGame();
                    return;
                }
                this.levelCompleting = true;
                if (window.SFX) SFX.levelComplete();

                // Reto Diario: termina aquí, ANTES de tocar worldMap.completeLevel()/saveProgress()
                // — nunca debe escribir nada en el progreso guardado real (ver restoreAfterDaily()).
                if (this.dailyMode) {
                    this.levelCompleting = false; this.gameStarted = false;
                    const finalTime = performance.now() - this.runStartTime;
                    // Un duelo puede ser de OTRA fecha: solo el reto de HOY toca tu registro
                    // diario — el fantasma de un amigo no debe pisar tu mejor tiempo de hoy.
                    const isToday = this.dailyDate === todayDateString();
                    const isRecord = isToday ? this.saveDailyRecord(this.dailyDate, finalTime, this.dailyHero) : false;
                    // La ruta grabada de ESTE run, lista para el botón de retar/revancha.
                    this.lastDuelRun = { date: this.dailyDate, time: finalTime, route: encodeDuelRoute(this.duelRec || []) };
                    if (window.SFX) { SFX.music.stop(); SFX.victory(); }
                    const heroName = HEROES[this.dailyHero].name;
                    const levelName = LEVELS[this.dailyLevelIdx].name;
                    const diffLabel = this.dailyDifficulty.label;
                    const rival = this.duelRival; // capturado ANTES de restoreAfterDaily(), que lo anula
                    const duelDate = this.dailyDate;
                    // Veredicto del duelo, si lo hay: gana el tiempo menor.
                    let title = '¡RETO SUPERADO!';
                    let duelLine = '';
                    if (rival) {
                        const secs = (Math.abs(finalTime - rival.time) / 1000).toFixed(1);
                        const rname = rival.name || 'tu rival';
                        if (finalTime < rival.time) { title = '¡DUELO GANADO!'; duelLine = `<p class="run-time">⚔️ Ganaste a ${rname} por ${secs}s (su tiempo: ${formatTime(rival.time)})</p>`; }
                        else if (finalTime > rival.time) { title = 'DUELO PERDIDO'; duelLine = `<p class="run-time">⚔️ ${rname} te ganó por ${secs}s (su tiempo: ${formatTime(rival.time)})</p>`; }
                        else { title = 'EMPATE EXACTO'; duelLine = `<p class="run-time">⚔️ Empate al milisegundo con ${rname}: ${formatTime(rival.time)}</p>`; }
                    }
                    // Formato compacto en 3 líneas, estilo Wordle: cabecera con la fecha, el
                    // desafío de un vistazo, y el tiempo con el reto al receptor. Los saltos de
                    // línea sobreviven tanto a navigator.share como a los enlaces de respaldo
                    // de buildShareHTML (encodeURIComponent los convierte en %0A).
                    const shareText = [
                        `🛰️ ASTRO LEAP — Reto Diario ${duelDate}`,
                        `📍 ${levelName} · ${this.dailyDifficulty.emoji} ${diffLabel} · 🧑‍🚀 ${heroName}`,
                        `⏱️ ${formatTime(finalTime)} — ¿lo superas?`
                    ].join('\n');
                    const recordLine = isToday
                        ? `<p class="run-time">${isRecord ? '¡Nuevo mejor tiempo de hoy!' : `Tu mejor tiempo de hoy: ${formatTime(this.dailyRecord.time)}`}</p>`
                        : '';
                    this.restoreAfterDaily();
                    startScreen.innerHTML = this.buildDailyResultScreen({
                        title,
                        subtitle: `Reto del ${duelDate} — ${levelName} · dificultad ${diffLabel} — piloto: ${heroName}`,
                        resultHTML: `
                            <p class="run-time">Tiempo: ${formatTime(finalTime)}</p>
                            ${duelLine}
                            ${recordLine}
                            ${this.buildShareHTML(shareText)}
                            <button class="menu-btn share-btn" data-action="challenge" data-date="${duelDate}" data-time="${finalTime}">${rival ? '⚔️ Revancha: reta con tu tiempo' : '⚔️ Retar a un amigo con este tiempo'}</button>
                        `
                    });
                    openMenuOverlay();
                    this.inLevel = false; this.inWorldMap = false; this.combat = null;
                    return;
                }

                this.worldMap.completeLevel(this.currentLevel);
                this.levelCompleteMessage = 150;
                this.saveProgress();

                // La victoria la marca el nivel `final` (Nodo Cero), NO el último índice de
                // LEVELS: el nivel Extra vive detrás en el array y no debe terminar el juego.
                if (LEVELS[this.currentLevel].final) {
                    // El nivel final nunca llega aquí por el flujo normal (sale por la finale
                    // en el propio cruce de meta) — rama defensiva.
                    this.finishGame();
                } else {
                    // Guardado en this.levelCompleteTimeout para poder cancelarlo si el jugador
                    // recarga el nivel (R) o sale (ESC) durante los 1.8s de celebración — si no,
                    // el temporizador pendiente disparaba igual y te sacaba al mapa a destiempo.
                    this.levelCompleteTimeout = setTimeout(() => {
                        this.levelCompleteTimeout = null;
                        this.levelCompleting = false; this.inLevel = false; this.inWorldMap = true;
                        // El cursor del mapa va al siguiente nodo solo si existe Y está a la
                        // vista (los nodos extra pueden seguir ocultos) — si no, se queda en el
                        // nodo del nivel recién completado.
                        const nextNode = this.worldMap.nodes[this.currentLevel + 1];
                        this.worldMap.currentNodeIndex = nextNode && nextNode.unlocked ? this.currentLevel + 1 : this.currentLevel;
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
            if (this.crystalMessage > 0) this.crystalMessage--;
            if (this.signalUnlockMessage > 0) this.signalUnlockMessage--;
            if (this.wallMessage > 0) this.wallMessage--;
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
        if (this.skillTreeOpen) {
            this.drawSkillTreeScreen(ctx);
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
            this.drawSkillChip(ctx);
            // Progreso del objetivo secundario, bajo las chapas.
            ctx.fillStyle = PALETTE.accent3; ctx.font = '8px "Rajdhani", sans-serif';
            ctx.fillText(`◆ Señal: ${this.signalCrystals.size}/${TOTAL_CRYSTALS}`, 10, 92);
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
            if (this.goalFlag && !this.finale) this.goalFlag.draw(ctx, this.cameraX); // en la finale, la meta es la nave
            for (const cap of this.capsules) cap.draw(ctx, this.cameraX);
            for (const cell of this.energyCells) cell.draw(ctx, this.cameraX);
            for (const cry of this.crystals) cry.draw(ctx, this.cameraX);
            for (const e of this.enemies) e.draw(ctx, this.cameraX);
            this.particles.draw(ctx, this.cameraX);
            // Parpadeo de invulnerabilidad: con reduceEffects, en vez de destello on/off se dibuja
            // siempre pero semitransparente — se sigue notando que estás invulnerable sin el
            // destello rápido.
            const aboard = this.finale && (this.finale.phase === 'takeoff' || this.finale.phase === 'done'); // embarcado: viaja en la nave
            if (aboard) { /* el piloto va a bordo */ }
            else if (this.reduceEffects) {
                if (this.playerInvulnerable > 0) { ctx.save(); ctx.globalAlpha = 0.55; this.player.draw(ctx, this.cameraX); ctx.restore(); }
                else this.player.draw(ctx, this.cameraX);
            } else if (this.playerInvulnerable === 0 || Math.floor(this.playerInvulnerable / 8) % 2 === 0) {
                this.player.draw(ctx, this.cameraX);
            }

            const level = LEVELS[this.currentLevel];
            // ¿El muro está en marcha? (modo disparador o modo cuenta atrás) — y con la Red
            // caída (finale), apagado.
            const wallActive = level.forcedScroll && !this.finale
                && (level.forcedScroll.triggerX ? this.wallStarted : this.forcedScrollDelay === 0);

            // Fantasma de ritmo del duelo: recorre el nivel a la velocidad exacta para llegar a
            // la meta EN el tiempo del rival (ignora el terreno — marca ritmo, no ruta). El
            // delta bajo el cronómetro compara tu posición con el tiempo al que él pasó por ahí.
            if (this.dailyMode && this.duelRival && this.duelGhost) {
                const route = this.duelRival.route;
                let trailAt = -1, ghostInCombat = false;
                if (route) {
                    // Ruta REAL grabada por el retador: interpola entre muestras (la simulación
                    // corre a 60Hz fijos, así que tiempo↔frames están amarrados). Se ven sus
                    // saltos, sus caídas... y sus pausas de combate, clavado donde se quedó él.
                    const idx = this.runElapsed / (route.stride * STEP_MS);
                    const i0 = Math.max(0, Math.min(route.points.length - 1, Math.floor(idx)));
                    const i1 = Math.min(route.points.length - 1, i0 + 1);
                    const t = Math.max(0, Math.min(1, idx - i0));
                    const p0 = route.points[i0], p1 = route.points[i1];
                    this.duelGhost.x = p0.x + (p1.x - p0.x) * t;
                    this.duelGhost.y = p0.y + (p1.y - p0.y) * t;
                    this.duelGhost.facing = p1.x >= p0.x ? 1 : -1;
                    trailAt = i0;
                    ghostInCombat = !!(p0.c && p1.c); // ambos extremos del tramo: duelo de verdad, no un roce
                } else {
                    // Token v1 (sin ruta): fantasma de ritmo — avance lineal que pisa la meta
                    // exactamente en su tiempo.
                    const progress = Math.min(1, this.runElapsed / this.duelRival.time);
                    this.duelGhost.x = 20 + progress * (level.goal - 20);
                    this.duelGhost.y = 137;
                    this.duelGhost.facing = 1;
                }
                this.duelGhost.animT += ghostInCombat ? 0.06 : 0.35; // en duelo respira quieto; si no, camina incansable
                // Estela: el tramo recién recorrido de la ruta, desvaneciéndose tras el fantasma.
                if (trailAt > 0) {
                    ctx.save();
                    ctx.strokeStyle = PALETTE.accent2; ctx.lineWidth = 1;
                    const trailStart = Math.max(0, trailAt - 10);
                    for (let j = trailStart; j < trailAt; j++) {
                        const a = route.points[j], b = route.points[j + 1];
                        ctx.globalAlpha = 0.06 + 0.24 * ((j - trailStart) / 10);
                        ctx.beginPath();
                        ctx.moveTo(a.x - this.cameraX + 4, a.y + 7);
                        ctx.lineTo(b.x - this.cameraX + 4, b.y + 7);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
                ctx.save();
                ctx.globalAlpha = 0.35;
                this.duelGhost.draw(ctx, this.cameraX);
                ctx.restore();
                const gx = this.duelGhost.x - this.cameraX;
                if (gx > -40 && gx < GAME_WIDTH + 40) {
                    ctx.save();
                    ctx.globalAlpha = 0.75; ctx.fillStyle = PALETTE.dim; ctx.font = '7px "Rajdhani", sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText(ghostInCombat ? `${this.duelRival.name} · en duelo` : this.duelRival.name, gx + 4, this.duelGhost.y - 4);
                    // El retador estaba PELEANDO en este punto de su partida: sin la señal, el
                    // fantasma parado parece un bug. El ⚔ pulsa sobre su cabeza mientras dure.
                    if (ghostInCombat) {
                        const swordPulse = this.reduceEffects ? 0.8 : 0.55 + Math.sin(Date.now() * 0.008) * 0.35;
                        ctx.globalAlpha = swordPulse; ctx.fillStyle = PALETTE.accent3; ctx.font = '10px sans-serif';
                        ctx.fillText('⚔', gx + 4, this.duelGhost.y - 13);
                    }
                    ctx.textAlign = 'left';
                    ctx.restore();
                }
                const rivalTimeAtMyX = (Math.max(0, this.player.x - 20) / Math.max(1, level.goal - 20)) * this.duelRival.time;
                const delta = (this.runElapsed - rivalTimeAtMyX) / 1000;
                ctx.fillStyle = 'rgba(11,6,32,0.7)'; ctx.fillRect(GAME_WIDTH - 42, 62, 42, 12);
                ctx.fillStyle = delta <= 0 ? PALETTE.hp : PALETTE.hpLow;
                ctx.font = '8px "Rajdhani", sans-serif'; ctx.textAlign = 'right';
                ctx.fillText(`${delta <= 0 ? '' : '+'}${delta.toFixed(1)}s`, GAME_WIDTH - 4, 71);
                ctx.textAlign = 'left';
            }

            if (level.forcedScroll) {
                // Con reduceEffects, un valor fijo en vez del pulso rojo oscilante junto al borde
                // izquierdo de la pantalla (la luz que más se acerca a un parpadeo real del juego).
                const pulse = this.reduceEffects ? 0.8 : (0.6 + Math.sin(Date.now() * 0.012) * 0.4);
                // El resplandor rojo del muro solo cuando el muro existe (cuenta atrás agotada,
                // o disparador ya cruzado) — y nunca con la Red caída.
                if (wallActive) {
                    const wallGrad = ctx.createLinearGradient(0, 0, 18, 0);
                    wallGrad.addColorStop(0, `rgba(255,70,70,${0.9 * pulse})`);
                    wallGrad.addColorStop(1, 'rgba(255,70,70,0)');
                    ctx.fillStyle = wallGrad;
                    ctx.fillRect(0, 20, 18, GAME_HEIGHT - 20);
                    ctx.fillStyle = `rgba(255,100,100,${0.7 + pulse * 0.3})`;
                    ctx.font = 'bold 8px "Rajdhani", sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText(`⚠ ${level.forcedScroll.label || 'NÚCLEO'}`, 90, 28);
                    ctx.textAlign = 'left';
                }
                if (this.wallMessage > 0) {
                    ctx.fillStyle = '#ff3366'; ctx.font = 'bold 14px "Orbitron", sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText('¡LA RED DESPIERTA!', GAME_WIDTH / 2, 70);
                    ctx.fillStyle = PALETTE.ink; ctx.font = '11px "Rajdhani", sans-serif';
                    ctx.fillText('¡CORRE!', GAME_WIDTH / 2, 86);
                    ctx.textAlign = 'left';
                }
                if (!level.forcedScroll.triggerX && this.forcedScrollDelay > 0) {
                    ctx.fillStyle = PALETTE.accent2; ctx.font = 'bold 22px "Orbitron", sans-serif'; ctx.textAlign = 'center';
                    const secs = Math.ceil(this.forcedScrollDelay / 60);
                    ctx.fillText(secs > 0 ? String(secs) : '¡CORRE!', GAME_WIDTH / 2, GAME_HEIGHT / 2);
                    ctx.font = '10px "Rajdhani", sans-serif'; ctx.fillStyle = PALETTE.dim;
                    ctx.fillText('EL NÚCLEO VA A COLAPSAR', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 18);
                    ctx.textAlign = 'left';
                }
            }

            // Barrido del Centinela: capa visual (la lógica de daño vive en update()). Apuntar
            // = resplandor rojo creciente en la franja del suelo de la zona; onda = franja roja
            // encendida con parpadeo. El brillo cian sobre cada cobertura señala dónde subirse
            // (la misma idea que el resplandor de refugios de la tormenta). Con reduceEffects,
            // valores fijos sin pulso.
            if (level.sentinelWatch) {
                const watchBoss = this.enemies.find(e => e.isBoss);
                if (watchBoss && watchBoss.alive) {
                    const w = level.sentinelWatch;
                    const wPhase = this.watchPhase(w);
                    if (wPhase !== 'calm') {
                        const zx = Math.max(w.zoneStart - this.cameraX, 0);
                        const zw = Math.min(watchBoss.x - this.cameraX, GAME_WIDTH) - zx;
                        if (zw > 0) {
                            if (wPhase === 'warn') {
                                const c = this.watchT % (w.calm + w.warn + w.fire);
                                const charge = this.reduceEffects ? 0.5 : (c - w.calm) / w.warn; // crece hacia la onda
                                ctx.fillStyle = `rgba(255,92,108,${0.08 + 0.14 * charge})`;
                                ctx.fillRect(zx, w.band, zw, 150 - w.band + 8);
                            } else {
                                const flick = this.reduceEffects ? 1 : 0.8 + Math.random() * 0.2;
                                ctx.save();
                                ctx.shadowColor = '#ff5c6c'; ctx.shadowBlur = 8;
                                ctx.fillStyle = `rgba(255,92,108,${0.5 * flick})`;
                                ctx.fillRect(zx, w.band, zw, 150 - w.band + 8);
                                ctx.fillStyle = `rgba(255,235,235,${0.55 * flick})`;
                                ctx.fillRect(zx, w.band, zw, 3);
                                ctx.restore();
                            }
                            // brillo sobre las coberturas: dónde subirse
                            for (const p of this.platforms) {
                                if (!p.solid || p.y > w.band || p.h > 10 || p.y < 100) continue;
                                const sx = p.x - this.cameraX;
                                if (sx > GAME_WIDTH || sx + p.w < 0) continue;
                                const coverGrad = ctx.createLinearGradient(0, p.y - 14, 0, p.y);
                                coverGrad.addColorStop(0, 'rgba(124,245,255,0)');
                                coverGrad.addColorStop(1, 'rgba(124,245,255,0.2)');
                                ctx.fillStyle = coverGrad;
                                ctx.fillRect(sx, p.y - 14, p.w, 14);
                            }
                            ctx.fillStyle = wPhase === 'warn' ? 'rgba(255,92,108,0.9)' : 'rgba(255,235,235,0.95)';
                            ctx.font = 'bold 8px "Rajdhani", sans-serif'; ctx.textAlign = 'center';
                            ctx.fillText(wPhase === 'warn' ? '⚠ EL CENTINELA APUNTA' : '⚡ ONDA DE BARRIDO — A CUBIERTO', GAME_WIDTH / 2, 28);
                            ctx.textAlign = 'left';
                        }
                    }
                }
            }

            // La finale: colapso de la Red, la nave esperando en la meta, y el despegue.
            if (this.finale) {
                const fin = this.finale;
                if (fin.phase !== 'collapse') {
                    drawShip(ctx, level.goal + 8 - this.cameraX, 150 - (fin.shipLift || 0), fin.phase === 'takeoff', fin.t);
                }
                ctx.textAlign = 'center';
                if (fin.phase === 'collapse') {
                    if (!this.reduceEffects && fin.t % 28 < 4) {
                        ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
                    }
                    ctx.fillStyle = '#ff3366'; ctx.font = 'bold 14px "Orbitron", sans-serif';
                    ctx.fillText('¡LA RED SE DERRUMBA!', GAME_WIDTH / 2, 70);
                } else if (fin.phase === 'ship') {
                    ctx.fillStyle = PALETTE.accent3; ctx.font = 'bold 12px "Orbitron", sans-serif';
                    ctx.fillText('¡A LA NAVE!', GAME_WIDTH / 2, 70);
                } else if (fin.phase === 'takeoff' && fin.t > 120) {
                    // fundido a blanco del despegue (también con reduceEffects: es un fundido, no un parpadeo)
                    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (fin.t - 120) / 70)})`;
                    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
                }
                ctx.textAlign = 'left';
            }

            // Tormenta iónica: capa visual del ciclo (la lógica de daño vive en update()).
            // Aviso: tinte ámbar pulsante + cartel. Descarga: tinte violeta + rayos verticales
            // (visual puro: Math.random, no RNG). En ambas fases, un resplandor cian bajo cada
            // plataforma elevada señala dónde hay techo — la regla de refugio, dibujada.
            // Con reduceEffects: tintes fijos, sin pulso ni rayos (nada que parpadee).
            if (level.ionStorm && !this.finale) {
                const phase = this.stormPhase(level.ionStorm);
                if (phase !== 'calm') {
                    for (const p of this.platforms) {
                        if (!p.solid || p.y >= 150) continue; // solo lo elevado da techo útil
                        // con tormenta zonal, el resplandor de refugio solo dentro de su dominio
                        if (level.ionStorm.zone && (p.x + p.w < level.ionStorm.zone[0] || p.x > level.ionStorm.zone[1])) continue;
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
            // Contador del objetivo secundario, bajo el cronómetro.
            ctx.fillStyle = 'rgba(11,6,32,0.7)'; ctx.fillRect(GAME_WIDTH - 42, 48, 42, 12);
            ctx.fillStyle = PALETTE.accent3;
            ctx.fillText(`◆ ${this.signalCrystals.size}/${TOTAL_CRYSTALS}`, GAME_WIDTH - 4, 57);
            ctx.textAlign = 'left';

            if (this.levelUpMessage > 0) {
                ctx.fillStyle = PALETTE.accent3; ctx.font = 'bold 14px "Orbitron", sans-serif';
                ctx.fillText('¡SUBISTE DE NIVEL!', 55, 70);
                ctx.fillStyle = PALETTE.accent; ctx.font = '10px "Rajdhani", sans-serif';
                ctx.fillText('+1 punto de mejora (árbol en el mapa · tecla T)', 55, 84);
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
            if (this.crystalMessage > 0) {
                ctx.textAlign = 'center';
                ctx.fillStyle = PALETTE.accent3; ctx.font = 'bold 14px "Orbitron", sans-serif';
                ctx.fillText('◆ CRISTAL DE SEÑAL', GAME_WIDTH / 2, 70);
                ctx.fillStyle = PALETTE.ink; ctx.font = '11px "Rajdhani", sans-serif';
                ctx.fillText(`Señal reunida: ${this.signalCrystals.size}/${TOTAL_CRYSTALS}`, GAME_WIDTH / 2, 86);
                ctx.textAlign = 'left';
            }
            if (this.signalUnlockMessage > 0) {
                ctx.textAlign = 'center';
                ctx.fillStyle = PALETTE.accent3; ctx.font = 'bold 14px "Orbitron", sans-serif';
                ctx.fillText('¡SEÑAL TRIANGULADA!', GAME_WIDTH / 2, 70);
                ctx.fillStyle = PALETTE.ink; ctx.font = '11px "Rajdhani", sans-serif';
                ctx.fillText(`Nueva puerta en el mapa estelar: ${this.signalUnlockText}`, GAME_WIDTH / 2, 86);
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
// ?level=N        -> entra directo al nivel N (1-14; 13 y 14 son los Extra), con vida/energía llenas, saltándose el mapa.
// ?unlock=all     -> desbloquea todos los nodos del mapa para poder elegir cualquiera a mano.
// ?char=bolt|shade|scrap -> pilota ese héroe directamente (se da por desbloqueado).
// ?dailyDate=YYYY-MM-DD -> simula "hoy" para el Reto Diario (piloto, semilla y el registro
//   "¿ya jugaste hoy?" dependen de esta fecha en vez de la real) — para probar que rota de piloto
//   y que el mejor tiempo se resetea de un día a otro sin tener que esperar días de verdad.
// Combinables: ?level=1&char=scrap&unlock=all para entrar al nivel 1 pilotando a Scrap, por ejemplo.
(function setupDebugMode() {
    const params = new URLSearchParams(location.search);
    // ?duelo=TOKEN -> duelo a distancia: el menú ofrece jugar el reto de la fecha del token
    // contra el fantasma del rival. Token inválido (corrupto/troll) → se ignora en silencio.
    const duelToken = params.get('duelo');
    if (duelToken) {
        const duel = decodeDuelToken(duelToken);
        if (duel) {
            game.pendingDuel = duel;
            game.showMainMenu(); // reconstruye el menú, ya con el botón del duelo delante
        }
    }
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
            // El nivel Extra (?level=13) no tiene nodo en el mapa — nada que desbloquear.
            if (game.worldMap.nodes[idx]) game.worldMap.nodes[idx].unlocked = true;
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
