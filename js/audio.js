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

    function tone(freq, duration, { type = 'square', volume = 0.15, freqEnd = null, delay = 0 } = {}) {
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
        boot() { tone(220, 0.08, { volume: 0.1 }); tone(330, 0.08, { volume: 0.1, delay: 0.08 }); }
    };
})();
