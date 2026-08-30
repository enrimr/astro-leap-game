// Proceso principal de Electron: envuelve el juego web TAL CUAL (index.html cargado por
// file://) en una ventana de escritorio. El único puente con Node es el espejo de guardado
// (preload.js + los dos canales IPC de abajo) — el código del juego no cambia; su única rama
// de escritorio vive en js/game.js (IS_DESKTOP, que detecta el user agent de Electron:
// compartir apunta a la web y las métricas se apagan).
const { app, BrowserWindow, ipcMain, net, screen, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// La ventana se recuerda entre sesiones (tamaño, posición y pantalla completa) en
// window-state.json. Si el monitor de la última vez ya no está (portátil desconectado de la
// pantalla externa), las coordenadas se descartan y Electron centra la ventana con el tamaño
// recordado — una ventana que renace fuera de todo escritorio parece una app rota.
const windowStatePath = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
    try { return JSON.parse(fs.readFileSync(windowStatePath(), 'utf8')) || {}; } catch (e) { return {}; }
}
function saveWindowState(win) {
    try {
        // getNormalBounds: si se cierra en pantalla completa o maximizada, recordamos el
        // tamaño "de ventana" al que volvería con la tecla de restaurar, no el del monitor.
        const state = { fullscreen: win.isFullScreen(), ...win.getNormalBounds() };
        fs.writeFileSync(windowStatePath(), JSON.stringify(state));
    } catch (e) { /* noop: la próxima sesión abre con los valores por defecto */ }
}

// Guardado en fichero (ver desktop/preload.js, que hace de espejo del localStorage del juego):
// save.json en userData es la unidad que Steam Cloud podrá sincronizar. Escritura atómica
// (tmp + rename) para que un cierre a mitad de escritura nunca deje un save corrupto.
const savePath = () => path.join(app.getPath('userData'), 'save.json');

// "¿Te han retado?" con un enlace corto (s.enri.me): el juego no puede seguir la redirección
// desde el renderer (file:// + CORS), así que la sigue el main y devuelve la URL final — de la
// que el juego extrae el ?duelo=. GET y no HEAD (hay servidores que no contestan HEAD); el
// cuerpo ni se lee. Cualquier fallo devuelve '' y el juego muestra su mensaje de error.
ipcMain.handle('astro-resolve-url', async (e, url) => {
    try {
        if (!/^https?:\/\//i.test(String(url))) return '';
        const res = await net.fetch(String(url), { redirect: 'follow' });
        return res.url || '';
    } catch (err) { return ''; }
});

// Jugando solo con mando no hay "gesto de usuario" que desbloquee Web Audio (la Gamepad API no
// cuenta como activación para la política de autoplay de Chromium) — en la app propia, música
// y efectos arrancan sin exigir un clic previo.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

ipcMain.on('astro-save-load', (e) => {
    try { e.returnValue = JSON.parse(fs.readFileSync(savePath(), 'utf8')); }
    catch (err) { e.returnValue = null; } // sin fichero aún (primera ejecución): no pasa nada
});

ipcMain.on('astro-save-persist', (e, data) => {
    try {
        if (!data || typeof data !== 'object') return;
        const clean = {};
        for (const [k, v] of Object.entries(data)) {
            if (typeof k === 'string' && k.startsWith('astroLeap') && typeof v === 'string') clean[k] = v;
        }
        const tmp = savePath() + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(clean));
        fs.renameSync(tmp, savePath());
    } catch (err) { /* disco lleno o similar: el localStorage sigue siendo el respaldo vivo */ }
    e.returnValue = true; // el beforeunload usa sendSync y espera esta confirmación
});

function createWindow() {
    const saved = loadWindowState();
    const savedPosVisible = Number.isFinite(saved.x) && Number.isFinite(saved.y) &&
        screen.getAllDisplays().some(d => {
            const a = d.workArea;
            return saved.x < a.x + a.width && saved.x + (saved.width || 0) > a.x &&
                saved.y < a.y + a.height && saved.y + (saved.height || 0) > a.y;
        });
    const win = new BrowserWindow({
        width: Number.isFinite(saved.width) ? saved.width : 1280,
        height: Number.isFinite(saved.height) ? saved.height : 800,
        ...(savedPosVisible ? { x: saved.x, y: saved.y } : {}),
        fullscreen: saved.fullscreen === true,
        minWidth: 800,
        minHeight: 500,
        backgroundColor: '#0b0620', // el fondo del juego, para que no haya flash blanco al abrir
        autoHideMenuBar: true,
        title: 'ASTRO LEAP',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    win.on('close', () => saveWindowState(win));

    // Cualquier enlace externo (compartir en X/Facebook/WhatsApp, target=_blank) se abre en el
    // navegador del sistema; dentro de la app solo vive el juego. will-navigate cubre el caso
    // de un enlace sin target que intentara navegar la propia ventana.
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:/i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
        if (url.startsWith('file:')) return;
        e.preventDefault();
        if (/^https?:/i.test(url)) shell.openExternal(url);
    });

    // F11 alterna pantalla completa en cualquier SO (en macOS además está el botón verde nativo).
    win.webContents.on('before-input-event', (e, input) => {
        if (input.type === 'keyDown' && input.key === 'F11') {
            win.setFullScreen(!win.isFullScreen());
            e.preventDefault();
        }
    });

    // ASTRO_PADSIM=1 npm run desktop -> arranca con el simulador de mando por teclado
    // (?padsim, ver installPadSim en js/game.js) — para probar el soporte de mando sin hardware.
    win.loadFile(path.join(__dirname, '..', 'index.html'),
        process.env.ASTRO_PADSIM ? { query: { padsim: '1' } } : undefined);

    // TEMP: verificación i18n
    if (process.env.ASTRO_I18N_TEST) {
        const [lang, panel] = process.env.ASTRO_I18N_TEST.split(':');
        win.webContents.once('did-finish-load', () => {
            win.webContents.executeJavaScript(`setTimeout(() => {
                setLanguage('${lang}'); game.showMainMenu();
                ${panel ? `game.showMenuPanel('${panel}');` : ''}
            }, 500)`);
        });
    }

    // Herramienta de desarrollo: ASTRO_SHOT=/ruta.png captura la ventana a los 3s y cierra la
    // app — permite verificar la build de escritorio desde un script, sin interacción manual.
    if (process.env.ASTRO_SHOT) {
        win.webContents.once('did-finish-load', () => {
            setTimeout(async () => {
                const img = await win.webContents.capturePage();
                require('fs').writeFileSync(process.env.ASTRO_SHOT, img.toPNG());
                app.quit();
            }, 3000);
        });
    }
    return win;
}

app.whenReady().then(createWindow);

// Es un juego, no un editor: cerrar la ventana cierra la app, también en macOS.
app.on('window-all-closed', () => app.quit());
