// Espejo de guardado a fichero — TODO vive aquí, el juego no sabe que existe. El juego guarda
// en localStorage (claves astroLeap*); esto lo replica a save.json en userData, que es lo que
// Steam Cloud sabrá sincronizar (una carpeta con ficheros, no el perfil de Chromium). El
// preload corre ANTES que los scripts de la página, así que la siembra llega a tiempo.
const { contextBridge, ipcRenderer } = require('electron');

// Puente mínimo hacia el juego: resolver un enlace corto de duelo (s.enri.me) siguiendo su
// redirección. Lo hace el main porque el renderer corre en file:// y el CORS no le deja leer
// adónde fue a parar un fetch cross-origin. Es la ÚNICA capacidad expuesta — nada de fs ni ipc
// genérico al alcance de la página.
contextBridge.exposeInMainWorld('astroDesktop', {
    resolveUrl: (url) => ipcRenderer.invoke('astro-resolve-url', String(url || ''))
});

const PREFIX = 'astroLeap';

// Siembra: el fichero manda. Si no hay fichero (primera vez, o instalación anterior a este
// espejo), se respeta el localStorage existente — el vigilante lo volcará al fichero enseguida.
const saved = ipcRenderer.sendSync('astro-save-load');
if (saved && typeof saved === 'object') {
    try {
        for (const [k, v] of Object.entries(saved)) {
            if (k.startsWith(PREFIX) && typeof v === 'string') localStorage.setItem(k, v);
        }
    } catch (e) { /* sin almacenamiento: el juego ya funciona sin él */ }
}

function snapshot() {
    const out = {};
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(PREFIX)) out[k] = localStorage.getItem(k);
        }
    } catch (e) { /* noop */ }
    return out;
}

// Vigilante: localStorage no emite eventos en la propia pestaña que escribe, así que se
// muestrea. El snapshot completo viaja entero y el fichero se reemplaza — los removeItem
// (p. ej. "Nueva partida" borra el save) quedan reflejados sin caso especial.
let last = JSON.stringify(snapshot());
setInterval(() => {
    const snap = snapshot();
    const now = JSON.stringify(snap);
    if (now !== last) { last = now; ipcRenderer.send('astro-save-persist', snap); }
}, 2000);

// Al cerrar, versión síncrona: bloquea hasta que el main confirma la escritura — sin ella se
// perderían los últimos ≤2s de progreso al salir justo tras completar un nivel.
window.addEventListener('beforeunload', () => {
    try { ipcRenderer.sendSync('astro-save-persist', snapshot()); } catch (e) { /* noop */ }
});
