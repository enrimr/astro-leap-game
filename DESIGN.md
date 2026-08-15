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
- Sonido: sintetizado por código (Web Audio, sin archivos externos) — bleeps y pulsos tipo sci-fi retro.
- Animación *squash & stretch* en el jugador al saltar/aterrizar, y *screen shake* leve en golpes fuertes.

### 2.4 Contenido (2 mundos × 3 niveles, igual que el original)

| Mundo | Nivel | Nombre | Enfoque |
|---|---|---|---|
| 1 · Luna Cenizal | 1 | Cráter de Amerizaje | Tutorial de salto/energía |
| | 2 | Grietas de Hielo | Plataformas móviles, primeros huecos que exigen doble salto |
| | 3 | Nido de la Reina Larva | Jefe: Reina Larva |
| 2 · Luna Ferrosa | 4 | Chatarral Magnético | Enemigos voladores, plataformas más separadas |
| | 5 | Tormenta de Iones | Huecos largos, uso obligatorio del doble salto |
| | 6 | Núcleo del Centinela | Jefe final: Centinela de Núcleo |

### 2.5 Lecciones aplicadas desde el primer día (no como parche después)

Todo el feedback que surgió iterando sobre Monster Jump se incorpora aquí desde el diseño inicial, no como añadido tardío:
- Controles táctiles + ratón + teclado desde el arranque, canvas responsive.
- Menús de combate navegables y clicables, no solo atajos de teclado.
- Sonido incluido.
- Progreso guardado en `localStorage`.
- Meta tags Open Graph + imagen de banner para que el link se vea bien al compartirlo.
