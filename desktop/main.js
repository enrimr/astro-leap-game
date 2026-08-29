// Proceso principal de Electron: envuelve el juego web TAL CUAL (index.html cargado por
// file://) en una ventana de escritorio. Sin preload ni IPC a propósito — el juego no necesita
// nada de Node; la única diferencia de comportamiento vive en js/game.js (IS_DESKTOP, que
// detecta el user agent de Electron: compartir apunta a la web y las métricas se apagan).
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

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
            nodeIntegration: false
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
    return win;
}

app.whenReady().then(createWindow);

// Es un juego, no un editor: cerrar la ventana cierra la app, también en macOS.
app.on('window-all-closed', () => app.quit());
