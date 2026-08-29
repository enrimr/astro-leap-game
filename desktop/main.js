// Proceso principal de Electron: envuelve el juego web TAL CUAL (index.html cargado por
// file://) en una ventana de escritorio. El único puente con Node es el espejo de guardado
// (preload.js + los dos canales IPC de abajo) — el código del juego no cambia; su única rama
// de escritorio vive en js/game.js (IS_DESKTOP, que detecta el user agent de Electron:
// compartir apunta a la web y las métricas se apagan).
const { app, BrowserWindow, ipcMain, net, shell } = require('electron');
const fs = require('fs');
const path = require('path');

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
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
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

    win.loadFile(path.join(__dirname, '..', 'index.html'));

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
