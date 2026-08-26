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
- La Energía se regenera solo al derrotar enemigos (+2 por derrota, sea pisotón o duelo ganado — `ENERGY_PER_KILL` en `entities.js`, deliberadamente menor que el coste de la Habilidad para que gastarla siga siendo una decisión) o al inicio de cada nivel — **nunca con el tiempo**.

Esto crea una decisión constante que no existía en el original: *¿gasto energía ahora para cruzar este salto difícil, o la reservo por si el próximo encuentro se complica?* Convierte la exploración y el combate en el mismo presupuesto de recursos, en vez de dos sistemas aislados.

### 2.3 Identidad visual

- Vectorial plano con gradientes y *glow*, no pixel-art — paleta violeta/cian/magenta sobre negro espacial, estrellas en parallax.
- Partículas: rastro de propulsor al saltar, chispas al golpear, ráfaga de estrellas al subir de nivel.
- Sonido: sintetizado por código (Web Audio, sin archivos externos) — bleeps y pulsos tipo sci-fi retro, más dos loops de música de fondo (exploración/combate) generados igual, con un secuenciador de "lookahead" propio. Ver §2.10.
- Animación *squash & stretch* en el jugador al saltar/aterrizar, y *screen shake* leve en golpes fuertes.

### 2.4 Contenido (4 zonas × 3 niveles)

| Zona | Nivel | Nombre | Enfoque |
|---|---|---|---|
| 1 · Luna Cenizal | 1 | Cráter de Amerizaje | Tutorial de salto/energía |
| | 2 | Grietas de Hielo | **Hielo resbaladizo** (§2.20): inercia + set piece de salto con carrerilla; primeros huecos que premian el doble salto |
| | 3 | Nido de la Reina Larva | Jefe: Reina Larva |
| 2 · Luna Ferrosa | 4 | Chatarral Magnético | Enemigos voladores, plataformas más separadas |
| | 5 | Tormenta de Iones | Huecos largos, uso obligatorio del doble salto |
| | 6 | Núcleo del Centinela | Jefe: Centinela de Núcleo |
| 3 · Estación Colapsada | 7 | Muelle de Carga | Introduce la zona 3, enemigos mixtos |
| | 8 | Túnel de Escape | **Scroll forzado** — ver §2.6 |
| | 9 | Núcleo del Reactor | Jefe: Overlord (IA del núcleo) |
| 4 · Núcleo Expuesto | 10 | Bóveda Sellada | Solo accesible tras desbloquear a Scrap — ver más abajo |
| | 11 | Galería de Ecos | Huecos largos + segundo secreto de Scrap |
| | 12 | Nodo Cero | **Jefe final: Nodo Cero** (la Red misma) — ver §2.12 |

La zona 3 tiene su propio gancho narrativo: al recuperar la pieza que falta para reparar la nave en el Muelle de Carga, el núcleo de la estación despierta y empieza a autodestruirse — de ahí que el nivel 8 sea distinto a todos los anteriores.

La zona 4 existe por una razón mecánica, no solo narrativa: el Overlord no es la Red — es "un fragmento local, un nodo, un avatar" (`LORE.md` §2.2), y detrás del Núcleo del Reactor hay una bóveda sellada con refuerzos que ningún piloto anterior podía cruzar. Derrotar al Overlord desbloquea a Scrap (`Game.unlockCharacterForBoss()`, sin cambios — ya apuntaba a `overlord`), y es la habilidad de Scrap (romper refuerzos) la que abre físicamente el camino a la zona 4 en la ficción del juego. Por eso la zona 4 no se diseñó como "un mundo más": es, literalmente, el mundo que desbloquea tu último piloto — sin ella, Scrap se quedaba sin ningún nivel propio donde jugarlo tras la pantalla de desbloqueo, a diferencia de Bolt y Shade que sí tenían secretos dedicados en niveles ya existentes (§2.13).

### 2.6 El nivel de scroll forzado (Túnel de Escape)

Hasta este punto la cámara siempre sigue al jugador — nunca hay prisa. El Túnel de Escape rompe esa regla a propósito, tomando prestado el recurso de *Super Mario World* donde ciertos niveles avanzan solos y el jugador debe mantener el ritmo del mapa en vez de explorarlo a placer:

- Al entrar, una cuenta atrás (`forcedScroll.startDelay`, en frames) da un respiro antes de que empiece el movimiento. **Durante la cuenta atrás la cámara sigue al jugador como en un nivel normal** — se puede salir corriendo desde el primer segundo sin esperar (la primera versión dejaba la cámara clavada en x=0, y avanzar era salirse de la pantalla) — y el muro, al activarse, **arranca desde donde esté la cámara en ese momento**, no desde el inicio del nivel. Mientras dura la cuenta atrás no hay muro: ni empuja, ni daña, ni se dibuja su resplandor.
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
  - **Grietas de Hielo** (mundo 1): en el islote del set piece de hielo (§2.20), al otro lado de un hueco que solo cruza el salto con carrerilla — la cápsula ES la recompensa por dominar la mecánica del nivel. (Originalmente estaba sobre una plataforma flotante del arranque, a un salto simple trivial: no premiaba nada.)
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

Tras escribir `LORE.md` y la hoja de personajes (`lore/character-bible.html`), los jefes se rediseñaron en `js/entities.js` para dejar de ser "el mismo bicho con otro color" y coincidir exactamente con su diseño de la biblia — misma paleta, misma silueta, mismo carácter:
- **Reina Larva** (`drawQueenLarva`): masa orgánica rosa/magenta (gradiente `#ffb3e6`→`#c93f96`) con bultos alrededor, ojos oscuros y una boca triste y neutra — no es la villana, es una víctima, y así debe leerse incluso en un sprite de 20px.
- **Centinela** (`drawSentinel`): bloque simétrico lavanda (`#c9c4e8`→`#6c63a8`) con visor cian y grietas de energía rosa superpuestas — dos arquitecturas (la suya original y la de la Red) en conflicto en el mismo cuerpo.
- **Overlord** (`drawOverlord`): fragmento facetado ámbar/rojo (`#fff3c4`→`#ff5c6c`) sin cara fija, con un núcleo pulsante en vez de ojos — literalmente la Red hablando por primera vez.
- **Nodo Cero** (`drawNodoCero`), jefe final de la zona 4: no un cuerpo único como los otros tres, sino una red de 4 nodos orbitando un núcleo rojo (`#ff3366`) — tres de los nodos llevan el color exacto de un guardián anterior (magenta de la Reina Larva, lavanda del Centinela, ámbar del Overlord) y el cuarto es su propio color. Comunica visualmente, sin un solo texto, que esto absorbió a los tres jefes previos — coherente con que su patrón de combate (§1.D más abajo) literalmente combina los tres a la vez.

Cada jefe tiene su propia rutina de dibujo reutilizada tanto en el nivel (`Enemy.draw`, 20×20) como en el retrato de combate (`Enemy.drawPortrait`, 32×32) — mismo código, distinta escala, para que el jefe se vea igual en ambos sitios.

**Animación** (antes todo era completamente estático salvo el squash del salto del jugador):
- El jugador tiene ciclo de caminar (rebote vertical + pie adelantado marcando el paso), respiración en reposo y parpadeo — en `Player.update()`/`Player.draw()`, controlado por `animT`/`blinkTimer`.
- Los enemigos normales laten/parpadean en reposo (`animT`/`blinkTimer` en `Enemy`), y además tienen un detalle propio por tipo: el Erizo de Púas muestra su púa superior (lo que lo distingue del Dron del que evoluciona en el bestiario), el Reptante mueve las patas al andar, la Magnetita pulsa un anillo magnético, y los voladores (Hoverbot/Espectro Iónico) llevan un brillo de propulsión bajo el chasis.
- Los cuatro jefes respiran/pulsan/tiemblan de forma continua (blob que respira, visor que parpadea con grieta rosa intermitente, núcleo del Overlord latiendo y facetas rotando levemente, red de nodos de Nodo Cero orbitando sin silueta fija).
- **Patrones de combate por jefe** (`CombatSystem.resolveEnemyTurn()`, no solo el sprite): la Reina Larva se regenera cada 3 turnos en vez de atacar (no es agresiva por naturaleza); el Centinela carga un turno sin dañar y golpea el doble al siguiente (aviso real, ventana para Defender); el Overlord ignora Defender cada 3 turnos; Nodo Cero usa los tres patrones a la vez en un ciclo de 6 turnos (turno 3 regenera, turno 4 carga, turno 5 golpe reforzado, turno 6 ignora Defender) — el único jefe sin patrón propio nuevo, porque ya se quedó con los de los otros tres.
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

**Anatomía obligatoria de una bóveda de Scrap** (invariante fijada por test): (1) el suelo principal se parte en dos y el hueco lo tapa SOLO el refuerzo — si el suelo es continuo por debajo, romper el bloque no abre nada y la bóveda es inalcanzable (pasó de verdad en Bóveda Sellada y Galería de Ecos: el refuerzo se rompía sobre suelo intacto); y (2) la bóveda tiene suelo propio SÓLIDO a ≤24 por debajo (y=172), que cubra el agujero entero y del que se salga con un salto simple — sin él, Scrap rozaba el premio en plena caída y moría, y el agujero quedaba de pozo mortal permanente para cualquier piloto. Sólido de verdad, ni frágil ni cinta: Scrap no tiene habilidad aérea con la que recuperarse si la cámara del tesoro desaparece bajo sus pies.

**Identidad también en combate, no solo en plataformas**: la acción "Habilidad" del menú de duelo (`CombatSystem.actions[1]`) lleva el nombre propio de cada piloto en vez de un genérico "HABILIDAD" — mismo daño ×1.5 para los 4 (ver `HEROES.combatName` en `entities.js`), solo cambia cómo se llama y qué dice el mensaje al usarla: Kes → *Sobrecarga*, Bolt → *Pulso EMP* (encaja con ser un dron reprogramado), Shade → *Zarpazo* (es Vaelith, felino/insectoide — LORE.md §3.3), Scrap → *Puño Cibernético* (su brazo protésico — LORE.md §3.4). El botón táctil "2" se actualiza igual en `Game.updateTouchUI()`, para no decir una cosa en el canvas y otra en el botón de abajo.

**Tres secretos de ejemplo, uno por habilidad**, para que la mecánica se pueda probar de verdad y no se quede solo en el papel:
- *Cráter de Amerizaje*: un tramo de suelo reforzado (`reinforcedBlocks`) tapa una bóveda justo debajo con una cápsula de vida — cualquiera camina por encima sin notarlo, solo Scrap cae dentro.
- *Grietas de Hielo*: una plataforma flotante muy por encima de cualquier salto/doble salto normal, con una célula de energía — solo el vuelo sostenido de Bolt llega.
- *Nido de la Reina Larva*: un hueco horizontal más ancho que cualquier salto (con o sin doble salto), con una plataforma ancha y una red de seguridad debajo por si acaso — solo el impulso de Shade cruza del todo y coge la cápsula; si fallas, aterrizas sin perder nada. Ajustar la distancia exacta llevó su propia ronda de prueba y error con una simulación de física aparte (ver commit): el punto donde cada personaje "vuelve a la altura de despegue" cayendo se midió offline en vez de a ojo.

### 2.14 Cronómetro y mejores tiempos (speedrun por defecto)

El juego lleva cronómetro desde que arrancas hasta que terminas los 12 sectores, visible en una esquina durante la partida (nivel: abajo a la izquierda; mapa: bajo el contador de vidas — a propósito lejos del botón "Salir", que ya dio guerra de solape una vez). Se guardan los 5 mejores tiempos en `localStorage` (`astroLeapBestTimes_v1`), y se listan tanto en la pantalla de arranque normal como en la de "¡Misión cumplida!" (con "¡Nuevo récord!" si toca) — el Game Over normal también los enseña, a modo de recordatorio de la marca a batir, pero como no completas la partida ese intento no cuenta ni se guarda.

**Reloj real, no en frames**: `performance.now()` en vez de contar fotogramas — así el tiempo no depende de si el navegador va fino a 60fps o va renqueando, que es lo justo para poder comparar tiempos entre partidas.

**Paso de simulación fijo a 60Hz**: la otra mitad de esa moneda. `requestAnimationFrame` dispara a la tasa de refresco del monitor (120/144Hz en muchos equipos), y toda la física está calibrada en unidades/frame a 60fps — sin corregirlo, el juego entero corría el doble de rápido en un panel de 120Hz y los "mejores tiempos" (y el Reto Diario) no eran comparables entre dispositivos. El bucle (`gameLoop` en `game.js`) acumula el tiempo real transcurrido y ejecuta los pasos de `update()` que correspondan a 60Hz lógicos, dibujando una vez por frame; si la pestaña estuvo en segundo plano, el exceso acumulado se descarta (tope de 250ms) en vez de simular cientos de pasos de golpe al volver.

**Por qué no se pausa en menús/combate**: es tiempo real de principio a fin (RTA), incluyendo mapa, hangar de pilotos y combates — igual que hacen la mayoría de speedruns caseros sin categorías separadas de IGT. Como ya se habló al plantear la idea: el combate por turnos tiene aleatoriedad real (daño variable, huir es 50/50) y los enemigos patrullan por temporizador, así que el tiempo nunca va a ser 100% reproducible solo con habilidad — es una función de "mejora tu marca personal", no un ranking competitivo entre jugadores (no hay servidor con el que comparar).

### 2.15 Todos los niveles, completables con cualquier piloto (camino alto / camino bajo)

Hasta este cambio, varios niveles (sobre todo a partir del Mundo 2) asumían el doble salto de Kes como línea base — Scrap, que no tiene ninguna habilidad aérea, se quedaba literalmente atascado en el primer hueco de niveles como Chatarral Magnético. Auditar esto a ojo en 12 niveles no es fiable, así que se midió: se simula la física real de `Player.update()` (salto simple, sin doble pulsación) para saber exactamente cuánta distancia horizontal se cubre según el desnivel del salto, y con eso se construye un grafo de alcanzabilidad (BFS) por nivel — misma técnica que ya se usaba para verificar los patrones de jefe, aplicada esta vez al *level design* en vez de al combate.

**El principio, no el parche**: en vez de estrechar los huecos existentes (que habría borrado la recompensa de tener doble salto/vuelo/dash), cada hueco que un salto simple no cruza se resuelve añadiendo una **piedra de paso intermedia** a una altura MÁS BAJA que la ruta alta original — casi siempre cerca de y=150, formando un "camino bajo" continuo por debajo de las plataformas elevadas existentes. Las plataformas altas no se tocan. Resultado: cualquier piloto puede terminar cualquier nivel, pero:
- **Kes/Bolt/Shade** pueden saltar directo por la ruta alta (más rápida, menos paradas) usando su habilidad.
- **Scrap** (o cualquiera que prefiera ir sobre seguro) va escalón a escalón por el camino bajo — más lento, más paradas, sin necesitar nada especial.

Esto convierte la elección de piloto en algo que de verdad cambia cómo se juega un nivel, no solo qué secreto opcional coges — más rápido con un piloto aéreo, más largo pero seguro con Scrap. Coherente con el cronómetro de speedrun (§2.14): la ruta alta ya no es solo "más elegante", es objetivamente más rápida.

Dos niveles (Tormenta de Iones y Galería de Ecos) tienen huecos de 85-130 unidades en su ruta alta — muy por encima de lo que un salto simple cruza de un tirón — así que su camino bajo necesita varias piedras seguidas en vez de una sola. El propio Túnel de Escape (nivel de scroll forzado, documentado desde el principio como "no exige doble salto") tenía dos huecos que se quedaban cortos por muy poco al medirlos con precisión — un fallo real y preexistente, no introducido por este cambio, que salió a la luz precisamente por medir en vez de calcular a ojo.

**Test de regresión** (`__tests__/live.test.js`, "Diseño de niveles"): corre ese mismo BFS contra los 12 niveles reales cada vez que se ejecuta la suite. Si un cambio futuro a `levels.js` deja algún nivel solo alcanzable con doble salto/vuelo/dash, el test falla y lista qué nivel — así este problema no puede volver a colarse en silencio.

### 2.16 Reto Diario (crecimiento/viralidad)

Pensado como el gancho de "vuelve mañana" del juego, al estilo Wordle: mismo desafío para todo el mundo el mismo día, para que comparar tiempos con otra gente signifique algo. Entrada propia en el menú principal (`RETO DIARIO`), separada de "JUGAR"/"CONTINUAR" — no toca el progreso guardado normal en ningún momento, ni al ganar, ni al morir, ni si sales a media partida (ver más abajo).

**Qué cambia cada día, y por qué eso y no otra cosa:**
- **Nivel**: rota entre los sectores 1 y 2 (`DAILY_LEVEL_POOL = [0, 1]`, `dailyLevelFor()`), determinista según la fecha. El pool se limita a nivel sin jefe (los únicos dos aptos para cualquier visitante sin importar su progreso real): un jefe pensado para un jugador ya subido de nivel no sería justo para alguien que arranca desde cero. Ampliar el pool a más sectores es la extensión obvia, pero cada nuevo nivel sin jefe añadido a `levels.js` habría que sumarlo también aquí a mano.
- **Dificultad**: 4 niveles (`DAILY_DIFFICULTIES`: Suave ×0.85, Normal ×1, Intensa ×1.15, Brutal ×1.3), determinista según la fecha (`dailyDifficultyFor()`). El multiplicador escala `maxHp`/`hp`/`attack` de los enemigos del nivel al cargarlo, en `startDailyChallenge()` — la **defensa no se toca**, para que el multiplicador solo afecte a "cuánto dura el combate" y no a "si el ataque del jugador sirve de algo". No se escala al jugador (siempre arranca en nivel 1, stats base) porque el reto usa un piloto nuevo desde cero — solo cambia el enemigo.
- **Piloto**: rota entre los 4, determinista según la fecha (`dailyHeroFor()`). Es seguro porque los 4 comparten exactamente las mismas stats de combate (HP/ataque/defensa/Energía) — solo cambian la traversal y el nombre de la Habilidad (ver §2.13) — así que forzar cualquiera de los 4 en cualquier nivel del pool nunca desequilibra nada.
- **Física de combate**: variación de daño (±20%), probabilidad de Huir, y el timing de salto/vuelo de los enemigos se siembran con la fecha — ver `RNG` en `entities.js` y `mulberry32()`/`hashStringToSeed()` en `game.js`. Lo puramente visual (partículas, parpadeo, temblor de pantalla) sigue con `Math.random()` real a propósito: no aporta nada a la comparación y sembrarlo también solo complicaría el código sin beneficio.
- Nivel, dificultad y piloto se siembran cada uno con su propia sal (`fecha + ':level'`, `fecha + ':difficulty'`, la fecha sola para el piloto) para que no queden correlacionados entre sí — sin eso, por ejemplo, el mismo resto de un hash podría hacer que "Brutal" cayera siempre con el mismo nivel.

**RNG intercambiable, no una reescritura del motor**: en vez de enhebrar un generador sembrado por todas las llamadas del juego (cambio grande y arriesgado), `entities.js` expone un único `let RNG = Math.random;` a nivel de módulo, y las 5 llamadas que de verdad afectan al resultado lo usan en vez de `Math.random()` directamente. `Game.startDailyChallenge()` sustituye `RNG` por un generador sembrado (`mulberry32`, sin dependencias — sembrado con un hash simple de la fecha `YYYY-MM-DD`) y `restoreAfterDaily()` lo devuelve a `Math.random` real al salir, pase lo que pase.

**Aislamiento del progreso real** (la parte que más cuidado exigió): `startDailyChallenge()` guarda aparte las referencias reales (`this._realPlayer`, `this._realWorldMap`, etc.) y las sustituye por instancias nuevas — `WorldMap`/`Player` frescos, nunca los del jugador. El nivel completado, la muerte con 0 vidas, y salir con ESC/✕ pasan los tres por `restoreAfterDaily()`, que devuelve esas referencias reales tal cual estaban. En concreto:
- Ganar el reto **no** llama a `worldMap.completeLevel()` ni a `saveProgress()` — corta antes, con su propio `return`.
- Morir sin vidas **no** llama a `fullGameOver()` (que borra TODO el progreso real) — en su lugar, `dailyChallengeFailed()` solo permite reintentar el reto de hoy cuando se quiera.
- Salir a medias **no** abre el mapa estelar del reto (sería un mapa de un solo nodo sin sentido) — `exitLevel()` detecta `dailyMode` y aborta directo al menú.

**Un único registro, no un histórico**: `astroLeapDaily_v1` guarda `{ date, time, hero }` — solo el MEJOR intento del día de hoy, se pisa solo al cambiar de fecha. Guardar un histórico completo (calendario tipo GitHub, rachas de días seguidos) es la mejora obvia siguiente, pero es una función de análisis/retención aparte de la mecánica base — esto es la versión mínima que ya cumple el gancho de "vuelve mañana, compara tu tiempo".

**Por qué no hay marcador global**: comparar tiempos hoy en día depende de que dos personas se manden el resultado (compartir con `buildShareHTML()`, texto con fecha+piloto+tiempo). Un marcador de verdad entre desconocidos necesitaría un servidor — el proyecto entero es HTML/CSS/JS estático sin build ni backend (ver README), y añadir eso cambia esa naturaleza. Ver el punto pendiente en la lista de mejoras.

### 2.17 Anti-farmeo de XP al reentrar a un nivel

Rejugar un nivel ya *completado* siempre dio media XP (§1.2 B), pero había un agujero: salir de un nivel a medias con ESC y reentrar regeneraba a todos los enemigos con XP completa — farmeable infinito, y encima `exitLevel()` rellena HP/Energía gratis al volver al mapa. Ahora cada enemigo derrotado (pisotón o duelo) se apunta en `Game.collectedPickups` con la clave `xp-<nivel>-<índice>` — el mismo Set, la misma protección y el mismo ciclo de vida (se reinicia en Game Over completo o victoria) que cápsulas, células y refuerzos. Al recargar el nivel (por salir, o por perder una vida) el enemigo reaparece, pero con la mitad de XP: la misma regla "se puede repetir, pero rinde la mitad" que ya regía para los niveles completados, sin prohibir nada.

### 2.18 Transición de encuentro (estilo Pokémon)

Antes, tocar a un enemigo cortaba a la pantalla de duelo en el mismo frame — funcional, pero seco: no había ningún "momento" entre explorar y combatir. Ahora el contacto arranca una transición de encuentro clásica (`Game.startCombatTransition()`/`drawCombatTransition()`):

- **Fase 1 (28 frames)**: dos destellos blancos sobre el nivel, congelado en el instante del choque — `update()` corta en seco mientras `combatTransition` está activo, igual que hacen `unlockScreen`/`hintScreen`.
- **Fase 2 (30 frames)**: un círculo negro crece desde el punto exacto de contacto con el enemigo hasta cubrir la esquina más lejana de la pantalla, con easing cuadrático (acelera, como el barrido clásico).
- **Fase 3 (12 frames)**: negro sostenido, y entra el duelo.
- El sonido de encuentro (normal o de jefe) y la música de combate suenan **con el primer destello**, no al abrirse el duelo — el audio anuncia el combate antes de que se vea, como en el original.
- **Con `reduceEffects` activo no hay destellos** — un parpadeo a pantalla completa es exactamente lo que ese ajuste de accesibilidad promete evitar — solo un fundido a negro progresivo y más corto (45 frames en vez de 70).
- Durante la transición no funcionan ESC ni R (el combate ya es inevitable) y los controles táctiles se ocultan como en cualquier otra pausa. `loadLevel()` descarta cualquier transición pendiente, por si una muerte simultánea recarga el nivel.
- La duración es fija en frames, así que en el Reto Diario suma exactamente lo mismo al tiempo de todo el mundo — no ensucia la comparación.

### 2.19 Peligros del terreno: rampa de dificultad por mundos

Hasta aquí la dificultad crecía solo por stats de enemigos y anchura de huecos. Estos cuatro peligros hacen que el propio terreno escale: el Mundo 1 solo tiene el hielo del sector 2 (§2.20 — más herramienta que peligro, y sin reloj: el pool del Reto Diario, sectores 1-2, sigue determinista), el 2 introduce dos, el 3 otros dos, y el 4 los combina todos.

- **Plataformas frágiles** (5º elemento `'fragile'` en `platforms`): al pisarlas arranca una cuenta atrás de 50 frames (tiemblan; con `reduceEffects`, parpadean en alfa en vez de temblar) y desaparecen... pero **reaparecen a los 180 frames**. Reaparecer es la decisión clave: un nivel nunca queda bloqueado sin salida, así que pueden estar en el camino obligatorio y el test BFS puede contarlas como suelo.
- **Plataformas móviles** (`MovingPlatform`, array `movingPlatforms` aparte): senoide vertical sobre su Y base. El motor ya "lleva" al jugador gratis (gravedad + snap de aterrizaje cada frame), con la condición de que su velocidad vertical máxima (`amplitud × omega`) quede por debajo de la gravedad (0.32) o el snap lo pierde. Van en un array que el **BFS no cuenta a propósito**: son atajos/ruta alta, el camino obligatorio funciona sin ellas — nunca dependes de cazar una plataforma en movimiento.
- **Puertas de energía** (`EnergyBeam`, array `beams`: `[x, yTop, altura, desfase]`): el préstamo de las pirañas de Super Mario — un peligro periódico que convierte avanzar en una cuestión de timing. Columna VERTICAL entre dos emisores plantada en el suelo, ciclo fijo de 150 frames (90 apagada, 15 de aviso con chisporroteo, 45 activa), daño 4 + empujón hacia atrás, con la misma tregua de invulnerabilidad que el muro del Túnel. Con 40 de alto el salto simple (sube ~29) no la supera: o esperas el ciclo, o gastas Energía en la habilidad aérea, o la atraviesas pagando los 4 de daño — tres monedas distintas (tiempo, Energía, HP) para el mismo peaje, y un test fija que el salto simple nunca crezca hasta saltarla gratis. **La primera versión eran rayos horizontales tendidos sobre los huecos y fue un fracaso silencioso**: el arco del salto pasaba por encima, o cruzaba la franja cuando ya estaba fuera de su rango horizontal — en la práctica no tocaban nunca (el bot cruzó un nivel entero con la vida intacta). El test de integración no lo detectó porque teletransportaba al jugador dentro de la franja en vez de llegar saltando como un jugador real. Los emisores se ven siempre (el paso "se lee" peligroso también apagado) y el desfase alterna las puertas de un mismo nivel. Frames, no tiempo real: determinista en cualquier máquina.
- **Cintas magnéticas** (variantes `'beltL'`/`'beltR'`): arrastran al jugador 0.45/frame (~30% de su velocidad) mientras está de pie encima — siempre colocadas EN CONTRA, como peaje que ralentiza sin bloquear. Reutilizan el mismo chequeo de "de pie sobre la plataforma" que los refuerzos de Scrap (ahora un único bucle para frágiles/cintas/refuerzos).

### 2.20 Hielo resbaladizo: la estética que se volvió mecánica

Grietas de Hielo (sector 2) era "un nivel normal con estética helada": el variant `'ice'` solo cambiaba el color de las plataformas. La revisión lo convierte en mecánica de verdad — sobre suelo `'ice'` el movimiento tiene **inercia** (constantes `ICE_*` en `entities.js`):

- **Con dirección pulsada**: lerp hacia ±`ICE_MAX_SPEED` (2.6) a razón de `ICE_ACCEL` (0.07/frame) — la carrerilla supera la velocidad normal (1.55), y frenar/girar cuesta la misma inercia. **Sin dirección**: `vx` decae con `ICE_FRICTION` (0.94/frame, ~25u hasta pararse) — sigues deslizándote, que es donde el hielo castiga (frenar tarde junto a un borde o un enemigo).
- **El impulso se conserva al saltar**: en el aire, si llevas más velocidad que la base y no pulsas la dirección contraria, se mantiene (decaimiento suave 0.995/frame). Con eso un salto con carrerilla llega a ~68u en llano frente a ~42 del salto normal. El resto del control aéreo queda EXACTAMENTE como estaba (asignación directa) — decisión doble: no cambiar el game feel de los otros 11 niveles, y que la medición `maxReach` del test BFS (que simula el salto sin carrerilla) siga siendo fiel.
- El flag `iceMomentum` acota la conservación del impulso a saltos que salen DE hielo: sin él, el dash de Shade (vx 3.2 > base) también quedaría "flotando" tras sus 12 frames y le cambiaría el alcance en todo el juego (hay test de regresión).

**El set piece** (tramo final del sector 2): pista de despegue de 130 → hueco de 52 en llano → islote elevado con la cápsula ♥. Y de remate, **el salto final como bis**: la meseta posterior es una segunda pista que desemboca en un hueco de 58 (aún más ancho) hasta la plataforma de la BASE — la estructura clásica de enseñar-examinar: el primer hueco te da la mecánica con premio opcional en juego, el segundo te la pide un poco más grande ya sin nada que perder (misma red de seguridad debajo). Tres decisiones de diseño encadenadas:

1. El hueco (52) está entre el alcance del salto normal (~42) y el del salto con carrerilla (~68): la mecánica es *necesaria*, no decorativa. Un test fija esa relación (si algún día crece la física base, el set piece dejaría de serlo y el test avisa).
2. Regla de "completable con salto simple" (§2.15) intacta: el fondo de la grieta es una red de seguridad continua (y=172, como la del Nido de la Reina Larva) que desemboca en la meseta final con un salto simple — Scrap y el BFS pasan por abajo. Continua y no piedras sueltas A PROPÓSITO: al simular los arcos de caída, un salto normal fallado desde el borde de la pista aterrizaba justo en los huecos entre piedras — "fallar el set piece" habría sido muerte, no desvío. El islote queda a 42 por encima de la grieta, fuera del alcance de cualquier salto: la cápsula solo se gana deslizándose (o pagando Energía en habilidad aérea).
3. Fallar el salto no es muerte ni softlock: caes a la red, pierdes el premio del primer intento, y desde la meseta final (también hielo) se puede reintentar el islote con carrerilla hacia atrás — castigo de tiempo, no de vidas.

Es la primera vez que un "peligro" del terreno es a la vez la herramienta que abre un premio — el hielo enseña su propio dominio, igual que el nivel 5 entrena el doble salto que su cápsula exige. Aviso contextual de una sola vez (`showHint('ice-slide')`, mismo patrón que el de Scrap) al pisar hielo por primera vez, porque la inercia no se anuncia sola hasta que ya te ha tirado a un hueco.
