// Motor de sonido 100% sintetizado (Web Audio API) — sin archivos externos.
const SFX = (() => {
    let ctx = null;

    function ensureCtx() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            ctx = new AC();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    let sfxEnabled = true;
    let musicEnabled = true;
    let lastRequestedMusic = null; // {name, pattern} — lo último pedido, para reanudar al reactivar

    function tone(freq, duration, { type = 'square', volume = 0.15, freqEnd = null, delay = 0 } = {}) {
        if (!sfxEnabled) return;
        const c = ensureCtx();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        const t0 = c.currentTime + delay;
        osc.frequency.setValueAtTime(freq, t0);
        if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
        gain.gain.setValueAtTime(volume, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
        osc.connect(gain).connect(c.destination);
        osc.start(t0);
        osc.stop(t0 + duration + 0.02);
    }

    function noise(duration, { volume = 0.12 } = {}) {
        if (!sfxEnabled) return;
        const c = ensureCtx();
        const bufferSize = c.sampleRate * duration;
        const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const src = c.createBufferSource();
        src.buffer = buffer;
        const gain = c.createGain();
        gain.gain.setValueAtTime(volume, c.currentTime);
        src.connect(gain).connect(c.destination);
        src.start();
    }

    // ---- Música de fondo: un secuenciador sencillo con "lookahead" para que no se desincronice ----
    let musicGainNode = null;
    let musicTimerID = null;
    let musicPattern = null;
    let musicStepIndex = 0;
    let musicNextStepTime = 0;
    let currentMusicName = null;

    function musicGain() {
        const c = ensureCtx();
        if (!musicGainNode) {
            musicGainNode = c.createGain();
            musicGainNode.gain.value = 1;
            musicGainNode.connect(c.destination);
        }
        return musicGainNode;
    }

    function scheduleMusicNote(freq, time, dur, type, vol) {
        const c = ensureCtx();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        osc.connect(gain).connect(musicGain());
        osc.start(time);
        osc.stop(time + dur + 0.02);
    }

    function musicScheduler() {
        const c = ensureCtx();
        while (musicNextStepTime < c.currentTime + 0.15) {
            const step = musicPattern.steps[musicStepIndex % musicPattern.steps.length];
            step.forEach(n => scheduleMusicNote(n.f, musicNextStepTime, n.d, n.type || 'triangle', n.v));
            musicNextStepTime += musicPattern.stepDuration;
            musicStepIndex++;
        }
    }

    function playMusic(name, pattern) {
        lastRequestedMusic = { name, pattern }; // recordar siempre lo pedido, aunque esté silenciada
        if (!musicEnabled) return;
        if (currentMusicName === name) return; // ya sonando, no reiniciar el loop
        stopMusic();
        currentMusicName = name;
        musicPattern = pattern;
        musicStepIndex = 0;
        musicNextStepTime = ensureCtx().currentTime + 0.05;
        musicScheduler();
        musicTimerID = setInterval(musicScheduler, 60);
    }

    function stopMusic() {
        if (musicTimerID) { clearInterval(musicTimerID); musicTimerID = null; }
        currentMusicName = null;
    }

    function applySfxEnabled(on) { sfxEnabled = on; }
    function applyMusicEnabled(on) {
        musicEnabled = on;
        if (!on) stopMusic();
        else if (lastRequestedMusic) playMusic(lastRequestedMusic.name, lastRequestedMusic.pattern);
    }

    // Escala espaciosa/ambiental (La menor) para explorar, arpegio disperso y lento.
    const EXPLORE_PATTERN = {
        stepDuration: 0.42,
        steps: [
            [{ f: 110.00, d: 1.5, type: 'sine', v: 0.05 }],
            [],
            [{ f: 220.00, d: 0.35, v: 0.035 }],
            [],
            [{ f: 261.63, d: 0.35, v: 0.03 }],
            [],
            [{ f: 196.00, d: 0.35, v: 0.03 }],
            [],
            [{ f: 110.00, d: 1.5, type: 'sine', v: 0.045 }],
            [],
            [{ f: 246.94, d: 0.35, v: 0.032 }],
            [],
            [{ f: 220.00, d: 0.35, v: 0.03 }],
            [],
            [{ f: 174.61, d: 0.35, v: 0.03 }],
            []
        ]
    };
    // Bajo en pulso, más rápido y en cuadrada, para el combate — mismo motivo, más tenso.
    const COMBAT_PATTERN = {
        stepDuration: 0.2,
        steps: [
            [{ f: 82.41, d: 0.17, type: 'square', v: 0.06 }],
            [{ f: 82.41, d: 0.12, type: 'square', v: 0.035 }],
            [{ f: 98.00, d: 0.17, type: 'square', v: 0.055 }],
            [{ f: 82.41, d: 0.12, type: 'square', v: 0.035 }],
            [{ f: 73.42, d: 0.17, type: 'square', v: 0.06 }],
            [{ f: 82.41, d: 0.12, type: 'square', v: 0.035 }],
            [{ f: 98.00, d: 0.17, type: 'square', v: 0.055 }],
            [{ f: 110.00, d: 0.12, type: 'square', v: 0.04 }]
        ]
    };

    return {
        unlock() { ensureCtx(); },
        jump() { tone(420, 0.12, { type: 'square', freqEnd: 640, volume: 0.12 }); },
        doubleJump() { tone(300, 0.16, { type: 'sawtooth', freqEnd: 760, volume: 0.14 }); },
        land() { tone(140, 0.08, { type: 'sine', freqEnd: 80, volume: 0.08 }); },
        hitEnemy() { tone(180, 0.1, { type: 'square', freqEnd: 60, volume: 0.15 }); noise(0.05, { volume: 0.06 }); },
        hitPlayer() { tone(120, 0.18, { type: 'sawtooth', freqEnd: 50, volume: 0.16 }); },
        stomp() { tone(500, 0.14, { type: 'square', freqEnd: 900, volume: 0.14 }); },
        select() { tone(500, 0.06, { type: 'square', volume: 0.08 }); },
        confirm() { tone(650, 0.09, { type: 'square', freqEnd: 900, volume: 0.12 }); },
        flee() { tone(400, 0.2, { type: 'sine', freqEnd: 200, volume: 0.1 }); },
        levelUp() {
            tone(523, 0.1, { volume: 0.14 }); tone(659, 0.1, { volume: 0.14, delay: 0.1 });
            tone(784, 0.18, { volume: 0.16, delay: 0.2 });
        },
        levelComplete() {
            tone(440, 0.1, { volume: 0.14 }); tone(554, 0.1, { volume: 0.14, delay: 0.1 });
            tone(659, 0.1, { volume: 0.14, delay: 0.2 }); tone(880, 0.25, { volume: 0.16, delay: 0.3 });
        },
        victory() {
            [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { volume: 0.16, delay: i * 0.14 }));
        },
        gameOver() { tone(300, 0.3, { type: 'sawtooth', freqEnd: 80, volume: 0.16 }); },
        loseLife() { tone(380, 0.14, { type: 'square', freqEnd: 150, volume: 0.15 }); tone(280, 0.16, { type: 'square', freqEnd: 100, volume: 0.13, delay: 0.1 }); },
        extraEnergy() { tone(700, 0.08, { type: 'sawtooth', freqEnd: 1100, volume: 0.13 }); tone(1100, 0.12, { type: 'sawtooth', freqEnd: 1400, volume: 0.14, delay: 0.07 }); },
        boot() { tone(220, 0.08, { volume: 0.1 }); tone(330, 0.08, { volume: 0.1, delay: 0.08 }); },
        // Encuentro: se toca al ENTRAR en combate (antes no sonaba nada al chocar con un enemigo).
        encounter() { tone(180, 0.07, { type: 'square', freqEnd: 320, volume: 0.09 }); },
        bossEncounter() {
            tone(110, 0.22, { type: 'sawtooth', freqEnd: 70, volume: 0.17 });
            tone(165, 0.22, { type: 'sawtooth', freqEnd: 110, volume: 0.14, delay: 0.08 });
            noise(0.12, { volume: 0.05 });
        },
        // Victoria de combate: suena SIEMPRE al ganar, a diferencia de levelUp() que solo suena si además subes de nivel.
        battleWin() { tone(587, 0.09, { type: 'square', volume: 0.12 }); tone(880, 0.14, { type: 'square', volume: 0.14, delay: 0.09 }); },
        countdownTick() { tone(600, 0.06, { type: 'square', volume: 0.09 }); },
        // Descarga de un rayo eléctrico: zumbido agudo que cae en picado, distinto de hitPlayer()
        zap() { tone(1300, 0.09, { type: 'sawtooth', freqEnd: 280, volume: 0.13 }); noise(0.05, { volume: 0.05 }); },
        // Turno de carga de un jefe (aviso de que el próximo golpe viene reforzado): tono ascendente
        // que NO resuelve en un golpe, para que se distinga claramente de hitPlayer().
        bossCharge() { tone(260, 0.35, { type: 'sawtooth', freqEnd: 520, volume: 0.13 }); noise(0.2, { volume: 0.04 }); },
        // Un jefe se regenera en vez de atacar: dos tonos ascendentes suaves, en las antípodas
        // tímbricas de hitPlayer() (que baja de frecuencia) para que se lea como algo bueno... para él.
        bossHeal() { tone(392, 0.12, { type: 'sine', freqEnd: 523, volume: 0.1 }); tone(523, 0.14, { type: 'sine', freqEnd: 659, volume: 0.11, delay: 0.08 }); },
        scrollStart() {
            tone(220, 0.3, { type: 'sawtooth', freqEnd: 440, volume: 0.15 });
            tone(330, 0.3, { type: 'sawtooth', freqEnd: 660, volume: 0.12, delay: 0.05 });
        },
        setSfxEnabled(on) { applySfxEnabled(on); },
        isSfxEnabled() { return sfxEnabled; },
        music: {
            playExplore() { playMusic('explore', EXPLORE_PATTERN); },
            playCombat() { playMusic('combat', COMBAT_PATTERN); },
            stop() { stopMusic(); },
            setEnabled(on) { applyMusicEnabled(on); },
            isEnabled() { return musicEnabled; },
            setVolume(v) { musicGain().gain.value = Math.max(0, Math.min(1, v)); }
        }
    };
})();

// `const` de nivel superior no cuelga de `window` en scripts clásicos, pero todo el código
// comprueba `if (window.SFX) ...` antes de reproducir cualquier sonido — sin esta línea,
// esa comprobación es siempre falsa y ningún sonido llega a sonar nunca.
window.SFX = SFX;
