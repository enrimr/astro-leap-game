# DESIGN.md — La mecánica y el juego

## 1. La mecánica base: "Platformer + JRPG por turnos"

Esta mecánica nace de **Monster Jump** (`enrimr/juego-rol-plataformas`) y combina dos géneros que casi nunca comparten pantalla:

- **Plataformas en tiempo real** para moverte por el nivel (correr, saltar, física de gravedad, colisión con plataformas).
- **Combate por turnos estilo JRPG** cuando tocas a un enemigo (menú de acciones, stats, daño, turnos alternos).

El resultado se siente como si **Super Mario Bros. y Pokémon** compartieran motor: exploras y saltas libremente, pero cada enemigo es una decisión táctica, no un reflejo.

### 1.1 Bucle de juego (loop completo)

```
MAPA DEL MUNDO ──(elegir nodo desbloqueado)──> NIVEL PLATAFORMA
      ↑                                              │
      │                                    ¿tocas un enemigo?
      │                                     │                │
      │                                  no  │                │ sí
      │                                     ▼                ▼
      │                              seguir saltando    ¿lo pisas por arriba
      │                                                  Y tu nivel > el suyo?
      │                                                     │           │
      │                                                    sí          no
      │                                                     │           │
      │                                                     ▼           ▼
      │                                            derrota instantánea  COMBATE POR TURNOS
      │                                              (+XP, sin combate)   │
      │                                                     │      ┌──────┴──────┐
      │                                                     │   ganas          pierdes
      │                                                     │      │              │
      │                                                     │     +XP      vuelves al
      │                                                     │      │      inicio del run
      │                                          ┌───────────┘      │
      │                                          ▼                  │
      │                              llegas a la meta (con          │
      │                              jefe derrotado si aplica)      │
      │                                          │                  │
      └──────────── nodo se marca completado ────┘                  │
                     siguiente nodo se desbloquea                    │
                                                                      ▼
                                                              GAME OVER → reinicio
```

Este ciclo es la columna vertebral: **explorar → decidir si arriesgas un salto de precisión sobre un enemigo o si lo tocas y negocias en un menú → progresar en el mapa**. La tensión viene de que el jugador *elige* el nivel de riesgo: saltar sobre la cabeza de un enemigo débil es gratis, pero fallar el salto te mete igual en combate.

### 1.2 Sub-sistemas, con las reglas exactas que copiamos

**A. Movimiento y física (nivel)**
- Aceleración horizontal simple (no inercia compleja): izquierda/derecha = velocidad constante, sin input = frenado instantáneo.
- Gravedad acumulativa (`vy += gravity` cada frame) + salto de impulso fijo (`vy = jumpPower` al pulsar, solo si `onGround`).
- Colisión AABB contra una lista de plataformas rectangulares; solo se resuelve colisión "desde arriba" (aterrizar), no hay paredes sólidas laterales ni techos — mantiene el control simple y perdona errores de precisión.
- Cámara: sigue al jugador en X, centrada, con límites en los bordes del nivel (0 y `levelWidth - viewportWidth`).
- Caída al vacío (`y > alturaMáxima`) = daño y respawn en Y=0, no muerte instantánea. Perdona el error sin frenar el ritmo.

**B. Mapa del mundo (progresión)**
- Nodos en un canvas separado, conectados por un camino serpenteante (estética "Super Mario World").
- Solo el nodo 0 empieza desbloqueado. Completar el nodo `i` desbloquea `i+1`. Es progresión **estrictamente lineal** — sin ramas — porque el objetivo es un demo corto y legible, no un metroidvania.
- Rejugar un nivel ya completado dan la mitad de XP por enemigo (evita el farmeo infinito sin prohibirlo).

**C. Trigger de encuentro**
- Colisión AABB jugador↔enemigo. Dos resultados posibles, decididos en el momento del contacto:
  1. **Pisotón** (`player.vy > 0` y el jugador golpea la mitad superior del enemigo) + `enemy.level < player.level` → el enemigo muere al instante, XP directa, sin abrir el menú de combate. Recompensa la habilidad de plataformas.
  2. Cualquier otro contacto → se abre el **combate por turnos**.
- Tras huir de un combate, el jugador es invulnerable ~3 segundos para no quedar atrapado en un bucle de reencuentro inmediato.

**D. Combate por turnos**
- Menú de 4 acciones fijas: **Atacar** (daño base), **Habilidad** (daño ×1.5, cuesta energía), **Defender** (reduce el daño entrante a la mitad ese turno), **Huir** (50% de probabilidad).
- Los turnos alternan estrictamente jugador→enemigo→jugador. El daño tiene variación aleatoria (±20%) para que no se sienta un cálculo determinista.
- La IA enemiga no tiene decisiones: siempre ataca. Toda la profundidad táctica vive en las 4 opciones del jugador.

**E. Progresión de personaje**
- Stats: HP, Energía (maná para Habilidad), Ataque, Defensa, Nivel, XP/XP-para-subir.
- Subir de nivel cura del todo y sube todas las stats — cada nivel se siente como un respiro, no solo un número.
- La progresión es **permanente dentro de la partida**: no resetea entre niveles, solo al perder (Game Over) o ganar (Victoria).

**F. Estructura de nivel y jefes**
- Cada nivel tiene una `meta` (posición X) que cierra el nivel al alcanzarla.
- Los niveles 3 y 6 (el último de cada mundo) tienen un jefe: no puedes cruzar la meta si el jefe sigue vivo — te empuja hacia atrás. Da a cada mundo un clímax reconocible.

---

## 2. El nuevo juego: **ASTRO LEAP**

Misma columna vertebral, pero **no es un reskin**: cambia el tema, el arte (vectorial/neón en vez de pixel-art Game Boy) y añade una mecánica nueva que conecta plataformas y combate de una forma que Monster Jump no exploraba.

### 2.1 Premisa

Eres un **cadete espacial** cuya nave se estrella al entrar en un sistema estelar desconocido. Para repararla y salir, debes cruzar dos lunas hostiles saltando entre restos flotantes y enfrentando la fauna alienígena local en duelos de energía.

### 2.2 La mecánica nueva: **Energía compartida entre salto y combate**

En Monster Jump, la Energía solo se gastaba en combate (Habilidad). Aquí la Energía es un **recurso único que alimenta tanto el doble salto en plataformas como la Habilidad en combate**:

- En el aire, pulsar salto una segunda vez consume 1 punto de Energía y ejecuta un **impulso de propulsor** (un segundo salto, más corto). Permite cruzar huecos que el salto simple no alcanza y esquivar enemigos en el aire.
- En combate, la Habilidad sigue costando 3 Energía.
- La Energía se regenera solo al derrotar enemigos o al inicio de cada nivel — **nunca con el tiempo**.

Esto crea una decisión constante que no existía en el original: *¿gasto energía ahora para cruzar este salto difícil, o la reservo por si el próximo encuentro se complica?* Convierte la exploración y el combate en el mismo presupuesto de recursos, en vez de dos sistemas aislados.

### 2.3 Identidad visual

- Vectorial plano con gradientes y *glow*, no pixel-art — paleta violeta/cian/magenta sobre negro espacial, estrellas en parallax.
- Partículas: rastro de propulsor al saltar, chispas al golpear, ráfaga de estrellas al subir de nivel.
- Sonido: sintetizado por código (Web Audio, sin archivos externos) — bleeps y pulsos tipo sci-fi retro, más dos loops de música de fondo (exploración/combate) generados igual, con un secuenciador de "lookahead" propio. Ver §2.10.
- Animación *squash & stretch* en el jugador al saltar/aterrizar, y *screen shake* leve en golpes fuertes.

### 2.4 Contenido (3 zonas × 3 niveles)

| Zona | Nivel | Nombre | Enfoque |
|---|---|---|---|
| 1 · Luna Cenizal | 1 | Cráter de Amerizaje | Tutorial de salto/energía |
| | 2 | Grietas de Hielo | Plataformas móviles, primeros huecos que exigen doble salto |
| | 3 | Nido de la Reina Larva | Jefe: Reina Larva |
| 2 · Luna Ferrosa | 4 | Chatarral Magnético | Enemigos voladores, plataformas más separadas |
| | 5 | Tormenta de Iones | Huecos largos, uso obligatorio del doble salto |
| | 6 | Núcleo del Centinela | Jefe: Centinela de Núcleo |
| 3 · Estación Colapsada | 7 | Muelle de Carga | Introduce la zona 3, enemigos mixtos |
| | 8 | Túnel de Escape | **Scroll forzado** — ver §2.6 |
| | 9 | Núcleo del Reactor | Jefe final: Overlord (IA del núcleo) |

La zona 3 tiene su propio gancho narrativo: al recuperar la pieza que falta para reparar la nave en el Muelle de Carga, el núcleo de la estación despierta y empieza a autodestruirse — de ahí que el nivel 8 sea distinto a todos los anteriores.

### 2.6 El nivel de scroll forzado (Túnel de Escape)

Hasta este punto la cámara siempre sigue al jugador — nunca hay prisa. El Túnel de Escape rompe esa regla a propósito, tomando prestado el recurso de *Super Mario World* donde ciertos niveles avanzan solos y el jugador debe mantener el ritmo del mapa en vez de explorarlo a placer:

- Al entrar, una cuenta atrás (`forcedScroll.startDelay`, en frames) da un respiro antes de que empiece el movimiento.
- Pasada la cuenta atrás, la cámara avanza sola a velocidad constante (`forcedScroll.speed`), **sin esperar al jugador** e ignorando su posición — es la variable, no el resultado, de la ecuación de cámara.
- El borde izquierdo de la pantalla es un muro real: si el jugador queda detrás de él, se le empuja hacia delante y recibe daño, con un pequeño margen de invulnerabilidad entre golpes para que no sea una muerte instantánea si te despistas un frame.
- La velocidad del muro (0.55) es deliberadamente bastante menor que la velocidad de carrera del jugador (1.55): un jugador que no se detenga saca ventaja de sobra y puede permitirse fallar algún salto sin ser alcanzado de inmediato, pero no puede quedarse parado mucho rato.
- La cuenta atrás inicial dura 5 segundos (`startDelay: 300` frames a 60fps) para dar tiempo de leer el aviso antes de que el muro empiece a moverse.
- Los huecos del nivel se diseñaron para ser cruzables con un único salto simple bien cronometrado (no exigen doble salto) — la dificultad añadida es la presión de tiempo, no la precisión de plataformas, para no acumular dos picos de dificultad distintos en el mismo tramo.

### 2.7 Vidas

Feedback de testers humanos: caer por un precipicio se sentía gratis (un poco de HP y a seguir), así que se añadió un sistema de vidas clásico, separado del HP:

- El jugador tiene `lives` (por defecto 3, `MAX_LIVES` en `entities.js`), visibles como `♥N` en el HUD del nivel, en el mapa estelar y en combate.
- **Cualquier muerte consume una vida**, no solo caer al vacío: perder un combate, o que el muro del Túnel de Escape te termine alcanzando (HP a 0). Antes cada una de estas fuentes tenía su propio final distinto (una reiniciaba el nivel, otra reiniciaba todo) — ahora todas pasan por el mismo sitio (`Game.loseLife()`), así que "vidas" significa lo mismo pase lo que pase.
- **Con vidas restantes**: reapareces al inicio del *nivel actual* (no del mundo) con HP y Energía llenos — perder una vida cuesta progreso dentro del nivel, no el nivel entero.
- **Con 0 vidas**: Game Over de verdad — stats del jugador, mapa estelar y progreso guardado se reinician por completo, vuelves al nivel 1 con vidas al máximo.
- El daño repetido del muro en el Túnel de Escape (§2.6) sigue siendo solo HP, no vidas directamente — sería demasiado punitivo perder una vida cada vez que el muro te toca dado que golpea varias veces si te quedas atrás. Solo cuenta como muerte si esa acumulación de HP llega a 0.

### 2.8 Cápsulas de soporte vital (conseguir vidas extra)

El sistema de vidas necesitaba una vía para *ganar* vidas, no solo perderlas — si no, cada muerte es puramente una cuenta atrás. La solución elegida es de **exploración**, no de progresión automática: una cápsula de vida extra escondida en un punto opcional de un nivel por cada mundo, no en el camino directo a la meta.

- `LevelNode`/nivel define un array `capsules: [[x, y], ...]` en `levels.js`; casi siempre uno por nivel elegido, no en todos.
- Colocación por mundo:
  - **Grietas de Hielo** (mundo 1): sobre una plataforma flotante que ya existía en el nivel pero nunca hacía falta pisar — solo exige un salto simple fuera de la ruta obvia.
  - **Tormenta de Iones** (mundo 2): sobre una plataforma nueva, añadida específicamente como secreto, a una altura que un salto simple no alcanza (el salto simple sube como mucho ~29 unidades; esta plataforma exige el doble salto que ya se entrena en este nivel).
  - **Muelle de Carga** (mundo 3): igual, plataforma secreta nueva, alcanzable con un salto simple bien cronometrado.
- No hace falta *aterrizar* en la plataforma secreta para recoger la cápsula — sólo tocarla en pleno arco del salto ya cuenta, así que fallar el aterrizaje perfecto no te deja con las manos vacías si pasaste cerca.
- **Anti-farmeo**: una vez recogida, la cápsula de ese nivel queda marcada en `Game.collectedPickups` (un `Set` con claves tipo `"life-<nivel>"`) y no vuelve a aparecer aunque salgas y reentres al nivel — si no, entrar y salir del mismo nivel una y otra vez daría vidas infinitas. Ese set se reinicia solo en un Game Over completo o al terminar el juego (mismo ciclo de vida que las propias vidas: no se guarda en `localStorage`, dura lo que dura la sesión).
- El mensaje en pantalla de "¡VIDA EXTRA!" y el de "¡PERDISTE UNA VIDA!" son mutuamente excluyentes (activar uno apaga el contador del otro) — si coincidieran en el mismo instante se dibujarían superpuestos e ilegibles.

### 2.9 Células de energía (conseguir más Energía máxima)

Mismo patrón que las cápsulas de vida (§2.8), pero para Energía: una célula escondida por mundo, en niveles *distintos* a los de las cápsulas de vida para repartir el aliciente de explorar entre más niveles del juego (Cráter de Amerizaje, Chatarral Magnético y Núcleo del Reactor, en vez de Grietas de Hielo/Tormenta de Iones/Muelle de Carga).

- A diferencia de las vidas, esto no es un recurso que se recupera al reiniciar nivel — sube `maxEnergy` (y `energy` actual) en +1 **para siempre**, un upgrade permanente de capacidad, no un recurso consumible.
- Usa la misma clave `Game.collectedPickups` que las cápsulas de vida, con prefijo `"energy-<nivel>"` en vez de `"life-<nivel>"` — mismo Set, misma protección anti-farmeo, mismo reinicio en Game Over/victoria.
- Colocación: Cráter de Amerizaje reutiliza una plataforma flotante ya existente (fácil, salto simple); Chatarral Magnético y Núcleo del Reactor usan plataformas secretas nuevas que exigen doble salto **bien cronometrado cerca del punto más alto del primer salto** — hacer el doble salto demasiado pronto (nada más despegar) da bastante menos altura que esperar al ápice del primer salto antes de encadenarlo, así que estas dos células premian entender bien el timing del doble salto, no solo saber que existe.
- Los tres mensajes en pantalla ("¡VIDA EXTRA!", "¡PERDISTE UNA VIDA!", "¡ENERGÍA EXTRA!") son mutuamente excluyentes entre sí.

### 2.10 Sonido: efectos y música de fondo

Todo sale del mismo motor sintetizado (`js/audio.js`, osciladores + ruido vía Web Audio, sin archivos externos ni librerías):

- **Efectos**: uno por acción relevante — saltar, doble salto, aterrizar, golpear/recibir golpe, pisotón, subir de nivel, completar sector, Game Over, perder/ganar una vida, recoger una célula de energía, entrar en combate (normal y de jefe, con un sonido distinto y más grave/dramático), ganar un combate (`battleWin`, suena *siempre* al ganar — antes solo sonaba si además subías de nivel, así que la mayoría de combates ganados no hacían ningún ruido), y la cuenta atrás/arranque del muro en el Túnel de Escape.
- **Música de fondo**: dos loops cortos generados con un secuenciador propio de "lookahead" (agenda las notas ~150ms por delante usando el reloj del `AudioContext`, no `setTimeout` a pelo, para no desincronizarse) — un pad ambiental disperso en La menor para explorar/mapa, y un bajo en pulso más rápido y en onda cuadrada para el combate. Cambia de uno a otro al entrar/salir de un combate.
- **Bug real encontrado al añadir todo esto**: `audio.js` exporta el motor como `const SFX = ...`, y absolutamente todas las llamadas por el resto del código usan el guard `if (window.SFX) SFX.xxx()`. En un script clásico, un `const` de nivel superior no cuelga de `window` — así que `window.SFX` era `undefined` **siempre**, y ese guard nunca fue verdadero. Resultado: ningún sonido sonó jamás durante todo el desarrollo previo del juego, a pesar de que el código de cada efecto ya existía y parecía correcto con solo mirarlo. Arreglado con una línea al final de `audio.js` (`window.SFX = SFX;`) — confirmado con espías sobre las funciones reales durante una partida simulada, no solo llamando a los sonidos sueltos desde la consola (que sí funcionaba, porque accedía a `SFX` como identificador de scope, no a `window.SFX`, y por eso el problema pasó desapercibido en pruebas anteriores).
- **Silenciar música y efectos por separado**: dos botones (🎵/🔊) fijos en la esquina superior izquierda del juego, visibles en cualquier pantalla (inicio, mapa, nivel, combate) — por eso van en `z-index` por encima de `#startScreen` en vez de por debajo, como sí hace `#btnExit`. La preferencia se guarda en `localStorage` (claves `astroLeapMusicOn`/`astroLeapSfxOn`, independientes de `astroLeapSave_v1`) y se aplica de inmediato al cargar la página, antes de cualquier interacción. Internamente `sfxEnabled`/`musicEnabled` viven dentro de `audio.js` (no en `Game`): `tone()`/`noise()` — usadas por *todos* los efectos — cortan en seco si `sfxEnabled` es falso, y `playMusic()` recuerda la última pista pedida (`lastRequestedMusic`) para poder retomarla exactamente donde estaba al reactivarla, en vez de reiniciar el loop desde el principio.

### 2.11 Lecciones aplicadas desde el primer día (no como parche después)

Todo el feedback que surgió iterando sobre Monster Jump se incorpora aquí desde el diseño inicial, no como añadido tardío:
- Controles táctiles + ratón + teclado desde el arranque, canvas responsive.
- Menús de combate navegables y clicables, no solo atajos de teclado.
- Sonido incluido.
- Progreso guardado en `localStorage`.
- Meta tags Open Graph + imagen de banner para que el link se vea bien al compartirlo.

### 2.12 Identidad de los jefes y animación (coherencia con LORE.md)

Tras escribir `LORE.md` y la hoja de personajes (`lore/character-bible.html`), los tres jefes se rediseñaron en `js/entities.js` para dejar de ser "el mismo bicho con otro color" y coincidir exactamente con su diseño de la biblia — misma paleta, misma silueta, mismo carácter:
- **Reina Larva** (`drawQueenLarva`): masa orgánica rosa/magenta (gradiente `#ffb3e6`→`#c93f96`) con bultos alrededor, ojos oscuros y una boca triste y neutra — no es la villana, es una víctima, y así debe leerse incluso en un sprite de 20px.
- **Centinela** (`drawSentinel`): bloque simétrico lavanda (`#c9c4e8`→`#6c63a8`) con visor cian y grietas de energía rosa superpuestas — dos arquitecturas (la suya original y la de la Red) en conflicto en el mismo cuerpo.
- **Overlord** (`drawOverlord`): fragmento facetado ámbar/rojo (`#fff3c4`→`#ff5c6c`) sin cara fija, con un núcleo pulsante en vez de ojos — literalmente la Red hablando por primera vez.

Cada jefe tiene su propia rutina de dibujo reutilizada tanto en el nivel (`Enemy.draw`, 20×20) como en el retrato de combate (`Enemy.drawPortrait`, 32×32) — mismo código, distinta escala, para que el jefe se vea igual en ambos sitios.

**Animación** (antes todo era completamente estático salvo el squash del salto del jugador):
- El jugador tiene ciclo de caminar (rebote vertical + pie adelantado marcando el paso), respiración en reposo y parpadeo — en `Player.update()`/`Player.draw()`, controlado por `animT`/`blinkTimer`.
- Los enemigos normales laten/parpadean en reposo (`animT`/`blinkTimer` en `Enemy`), y además tienen un detalle propio por tipo: el Erizo de Púas muestra su púa superior (lo que lo distingue del Dron del que evoluciona en el bestiario), el Reptante mueve las patas al andar, la Magnetita pulsa un anillo magnético, y los voladores (Hoverbot/Espectro Iónico) llevan un brillo de propulsión bajo el chasis.
- Los tres jefes respiran/pulsan/tiemblan de forma continua (blob que respira, visor que parpadea con grieta rosa intermitente, núcleo del Overlord latiendo y facetas rotando levemente).
- Como el combate por turnos no llama a `Player.update()`/`Enemy.update()` (el bucle normal de físicas se salta mientras `this.combat` está activo), `CombatSystem.update()` avanza `animT`/`blinkTimer` de ambos combatientes cada frame para que los retratos seguidos sigan vivos durante el duelo.

### 2.13 Héroes jugables desbloqueables, cada uno con una habilidad de traversal propia

Se elige personaje **antes de entrar a un nivel** (no se cambia a mitad de partida) — la variante barata frente a un cambio libre en pleno nivel, que hubiera exigido darle a los 4 un moveset/combate completo aparte. El elenco vive en `HEROES`/`HERO_ORDER` (`entities.js`): Kes empieza desbloqueada, y Bolt/Shade/Scrap se desbloquean al derrotar al jefe de cada mundo (`Game.unlockCharacterForBoss()`, enganchado al `result==='win'` de `CombatSystem`) — Reina Larva → Bolt, Centinela → Shade, Overlord → Scrap. El desbloqueo persiste en el save (`unlockedCharacters` en `localStorage`) y se resetea junto con el resto del progreso en un Game Over completo o al terminar la partida.

**Por qué "antes del nivel" y no en caliente**: los 4 comparten stats de combate/nivel/XP (es un único "jugador" con el cuerpo intercambiado, no 4 personajes con progreso separado) — cambiar de piloto en el mapa no resetea nada.

**Selección de personaje: el "Hangar de pilotos"**. La primera versión era una fila de 4 iconos diminutos siempre visibles encima del mapa — funcionaba, pero (a) delataba a simple vista el diseño de los 3 héroes aún bloqueados (se dibujaba su retrato real a baja opacidad) y (b) no se parecía a nada, ni daba ganas de mirarla. Se sustituyó por dos piezas, al estilo clásico de selección de personaje de un beat 'em up/plataformas (Streets of Rage, Mega Man X):
- En el mapa solo queda una chapa pequeña y discreta (`Game.drawPilotChip()`): retrato diminuto del piloto actual + nombre + `▸`. Tocarla, o pulsar `C`, abre el hangar.
- El hangar (`Game.drawHangarScreen()`) es una pantalla propia a pantalla completa — reutiliza el mismo mecanismo de pausa que la pantalla de desbloqueo (`this.charSelectOpen` corta `Game.update()` en seco, igual que `unlockScreen`) — con los 4 retratos en tarjetas grandes en fila, nombre + habilidad debajo de cada uno, la tarjeta con el cursor resaltada con brillo, y la descripción completa del piloto señalado debajo. Los bloqueados muestran la misma silueta+candado genéricos que antes (sin pistas de diseño), y el cursor SÍ puede pasar por encima para ver "Todavía no lo has desbloqueado" — pero `ESPACIO` no hace nada ahí, solo confirma sobre un piloto ya desbloqueado.
- Input: `←`/`→` mueve el cursor entre los 4 (incluidos los bloqueados, para que el hangar comunique "hay 4 huecos" sin revelar quién falta), `ESPACIO`/`Enter` confirma (si está desbloqueado) y cierra, `ESC` cierra sin cambiar nada. Tocar una tarjeta confirma directamente; tocar fuera de las tarjetas cierra sin cambiar.

**Las 4 habilidades, todas con el mismo botón de salto** (sin controles nuevos):
- **Kes — doble salto**: la mecánica original, sin cambios. Pulsar salto una vez en el aire da un impulso vertical (`doubleJumpPower`), cuesta 1 Energía.
- **Bolt — vuelo breve**: en vez de un impulso de un solo toque, *mantener* pulsado el salto en el aire fuerza `vy` a un valor fijo de ascenso (`-1.1`) cada frame — fijarlo en vez de restarlo de golpe es importante: si solo se resta una cantidad pequeña, la gravedad que se suma justo después en el mismo frame la cancela y nunca llega a subir (bug real que costó bastante encontrar). Gasta 1 Energía cada 22 frames mientras se mantiene (bajado desde 8: a ese ritmo un tanque de Energía entero apenas daba 1.3s de vuelo, insuficiente para completar tramos de nivel — con 22 da unos 3.7s).
- **Shade — impulso lateral (dash)**: mismo gatillo que el doble salto de Kes (un uso por salto, un toque), pero en vez de altura da 12 frames de velocidad horizontal fija (`dashSpeed`) en la dirección a la que mira. Cuesta 1 Energía.
- **Scrap — sin habilidad aérea**: no tiene doble salto ni vuelo ni dash — a cambio, al *pisar* una plataforma de variante `'reinforced'` (franjas de peligro ámbar) la rompe (`Platform.broken`, comprobado en `Game.update()`), revelando lo que hubiera debajo. Una vez rota queda rota para siempre en esa partida (mismo patrón que las cápsulas: se guarda en `collectedPickups` con clave `reinforced-{nivel}-{índice}`).

**Gotcha de colisión al pisar para romper**: no se puede reutilizar `player.collides(plataforma)` para detectar "Scrap está de pie encima" — al aterrizar, el motor de físicas deja al jugador pegado exactamente al borde superior de la plataforma (`y + h === p.y`), sin solape real, así que un test de solape estricto (`>`) siempre da `false` ahí. Hace falta un chequeo aparte basado en `onGround` + cercanía vertical (`Math.abs((y+h) - p.y) < 2`) en vez de solape.

**Tres secretos de ejemplo, uno por habilidad**, para que la mecánica se pueda probar de verdad y no se quede solo en el papel:
- *Cráter de Amerizaje*: un tramo de suelo reforzado (`reinforcedBlocks`) tapa una bóveda justo debajo con una cápsula de vida — cualquiera camina por encima sin notarlo, solo Scrap cae dentro.
- *Grietas de Hielo*: una plataforma flotante muy por encima de cualquier salto/doble salto normal, con una célula de energía — solo el vuelo sostenido de Bolt llega.
- *Nido de la Reina Larva*: un hueco horizontal más ancho que cualquier salto (con o sin doble salto), con una plataforma ancha y una red de seguridad debajo por si acaso — solo el impulso de Shade cruza del todo y coge la cápsula; si fallas, aterrizas sin perder nada. Ajustar la distancia exacta llevó su propia ronda de prueba y error con una simulación de física aparte (ver commit): el punto donde cada personaje "vuelve a la altura de despegue" cayendo se midió offline en vez de a ojo.

### 2.14 Cronómetro y mejores tiempos (speedrun por defecto)

El juego lleva cronómetro desde que arrancas hasta que terminas los 9 sectores, visible en una esquina durante la partida (nivel: abajo a la izquierda; mapa: bajo el contador de vidas — a propósito lejos del botón "Salir", que ya dio guerra de solape una vez). Se guardan los 5 mejores tiempos en `localStorage` (`astroLeapBestTimes_v1`), y se listan tanto en la pantalla de arranque normal como en la de "¡Misión cumplida!" (con "¡Nuevo récord!" si toca) — el Game Over normal también los enseña, a modo de recordatorio de la marca a batir, pero como no completas la partida ese intento no cuenta ni se guarda.

**Reloj real, no en frames**: `performance.now()` en vez de contar fotogramas — así el tiempo no depende de si el navegador va fino a 60fps o va renqueando, que es lo justo para poder comparar tiempos entre partidas.

**Por qué no se pausa en menús/combate**: es tiempo real de principio a fin (RTA), incluyendo mapa, hangar de pilotos y combates — igual que hacen la mayoría de speedruns caseros sin categorías separadas de IGT. Como ya se habló al plantear la idea: el combate por turnos tiene aleatoriedad real (daño variable, huir es 50/50) y los enemigos patrullan por temporizador, así que el tiempo nunca va a ser 100% reproducible solo con habilidad — es una función de "mejora tu marca personal", no un ranking competitivo entre jugadores (no hay servidor con el que comparar).
