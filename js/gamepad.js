// ============================== MANDO (Gamepad API) ==============================
// Soporte de mando para web y escritorio (y requisito de facto para Steam Deck). La capa NO
// añade un sistema de input nuevo: traduce el mando a los MISMOS KeyboardEvent (e.code) que ya
// entiende todo el juego — el keydown de setupInput() puebla this.keys, el combate decide por
// evento, los menús navegan por foco. Cero cambios en game.js/entities.js.
//
// Mapeo (layout estándar del W3C, índices fijos: https://w3c.github.io/gamepad/#remapping):
//   A (0) → Space (saltar / confirmar; MANTENER = propulsor de Bolt y acelerar turnos)
//   B (1) → Escape (salir del nivel / atrás)      Start (9) → Enter (confirmar)
//   X (2) → KeyC (hangar)                         Y (3)     → KeyT (árbol de mejoras)
//   D-pad (12-15) y stick izquierdo (ejes 0-1) → flechas
//
// Dos decisiones con porqué:
// - Flancos + autorepeat de software (como el del teclado, con e.repeat=true): así "mantener"
//   recorre menús pero JAMÁS decide en combate — handleInput ya descarta e.repeat, la regla
//   "pulsar decide, mantener acelera" (DESIGN §2.28) se hereda sin código nuevo.
// - En plataformas el eje vertical calla: stick arriba sería un salto accidental (ArrowUp
//   salta) que a Kes le quema un doble salto de Energía; abajo no hace nada. En combate, mapa,
//   hangar y árbol, el eje vertical navega.

const GAMEPAD_DEADZONE = 0.35;
const GAMEPAD_REPEAT_DELAY_MS = 400;
const GAMEPAD_REPEAT_INTERVAL_MS = 110;
const GAMEPAD_REPEAT_CODES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

// ¿Toca dejar pasar el eje vertical? Ver cabecera. Nota: en el mapa estelar (gameStarted sin
// inLevel) pasa aunque no navegue nada — inofensivo y una condición menos que mantener.
function gamepadVerticalOk() {
    return !(game.gameStarted && game.inLevel &&
        !(game.combat && game.combat.active) && !game.charSelectOpen && !game.skillTreeOpen);
}

// Estado lógico deseado de este frame, como Set de e.code.
function gamepadDesiredCodes(gp, verticalOk) {
    const codes = new Set();
    const btn = (i) => !!(gp.buttons && gp.buttons[i] && gp.buttons[i].pressed);
    const ax = (i) => (gp.axes && gp.axes[i]) || 0;
    if (btn(0)) codes.add('Space');
    if (btn(1)) codes.add('Escape');
    if (btn(2)) codes.add('KeyC');
    if (btn(3)) codes.add('KeyT');
    if (btn(9)) codes.add('Enter');
    if (btn(14) || ax(0) < -GAMEPAD_DEADZONE) codes.add('ArrowLeft');
    if (btn(15) || ax(0) > GAMEPAD_DEADZONE) codes.add('ArrowRight');
    if (verticalOk) {
        if (btn(12) || ax(1) < -GAMEPAD_DEADZONE) codes.add('ArrowUp');
        if (btn(13) || ax(1) > GAMEPAD_DEADZONE) codes.add('ArrowDown');
    }
    return codes;
}

function gamepadDispatch(type, code, repeat) {
    document.dispatchEvent(new KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true }));
}

// Los menús DOM navegan por foco y los eventos SINTÉTICOS no disparan la activación nativa del
// <button> enfocado (eso es privilegio de los eventos de confianza del navegador) — así que la
// activación se hace aquí con click(). Y si aún no hay ningún botón enfocado (con ratón/táctil
// nunca lo hay), el primer flanco se gasta en dar foco al primero: el jugador ve aparecer el
// resaltado, no un salto misterioso al segundo botón. Devuelve true si consumió el flanco.
function gamepadMenuFocus(code) {
    if (game.gameStarted) return false;
    if (code !== 'ArrowUp' && code !== 'ArrowDown' && code !== 'Space' && code !== 'Enter') return false;
    const buttons = Array.from(startScreen.querySelectorAll('.menu-btn')).filter(b => b.offsetParent !== null);
    if (!buttons.length) return false;
    const active = document.activeElement;
    if (buttons.includes(active)) {
        if (code === 'Space' || code === 'Enter') { active.click(); return true; }
        return false; // las flechas las mueve el keydown de setupInput(), como con teclado
    }
    buttons[0].focus();
    if (window.SFX) SFX.select();
    return true;
}

// code → { since, lastRepeat }: qué mantiene pulsado el mando ahora mismo (en códigos de tecla)
const gamepadHeld = new Map();

function gamepadStep(now) {
    const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) { if (p && p.connected !== false) { gp = p; break; } }
    const desired = gp ? gamepadDesiredCodes(gp, gamepadVerticalOk()) : new Set();

    // Sueltas primero: si el contexto cambió (p. ej. el eje vertical deja de valer al volver a
    // plataformas), la tecla equivalente se libera este mismo frame.
    for (const code of Array.from(gamepadHeld.keys())) {
        if (!desired.has(code)) { gamepadHeld.delete(code); gamepadDispatch('keyup', code, false); }
    }
    for (const code of desired) {
        const held = gamepadHeld.get(code);
        if (!held) {
            gamepadHeld.set(code, { since: now, lastRepeat: now });
            if (window.SFX) SFX.unlock(); // mismo gesto que los controles táctiles
            if (!gamepadMenuFocus(code)) gamepadDispatch('keydown', code, false);
        } else if (GAMEPAD_REPEAT_CODES.has(code) &&
            now - held.since >= GAMEPAD_REPEAT_DELAY_MS && now - held.lastRepeat >= GAMEPAD_REPEAT_INTERVAL_MS) {
            held.lastRepeat = now;
            gamepadDispatch('keydown', code, true);
        }
    }
}

// Bucle propio e independiente del gameLoop: sondear el mando es barato y así la capa no toca
// ni una línea del paso de simulación a 60Hz de game.js.
(function gamepadLoop(now) {
    try { gamepadStep(now || performance.now()); } catch (e) { /* un mando raro jamás rompe el juego */ }
    requestAnimationFrame(gamepadLoop);
})();
