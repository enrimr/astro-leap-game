const LEVELS = [
    // ===== MUNDO 1: LUNA CENIZAL =====
    {
        name: 'Cráter de Amerizaje', world: 1, variant: 'normal',
        platforms: [
            [0, 150, 130, 15], [160, 150, 150, 15], [330, 150, 240, 15],
            [70, 120, 35, 6], [230, 110, 40, 6], [320, 95, 40, 6], [420, 115, 45, 6],
            // bóveda oculta bajo el refuerzo [310,150,20,8]: solo se ve/alcanza si Scrap lo rompe
            [305, 172, 30, 6],
            // Tramo final añadido al alargar el nivel: huecos ≤30 en llano (salto simple),
            // con una plataforma elevada opcional para la ruta alta.
            [595, 150, 55, 15], [680, 150, 80, 15], [620, 118, 35, 6]
        ],
        // Parche reforzado que tapa la bóveda de abajo — cualquiera camina por encima sin notarlo
        // (mismo nivel de suelo y=150 que sus vecinos, solo más fino), solo Scrap puede romperlo
        // (ver Game.update()) y caer a por la cápsula.
        reinforcedBlocks: [[310, 150, 20, 8]],
        enemies: [[100, 138, 'drone'], [260, 98, 'drone'], [360, 83, 'crawler'], [610, 138, 'drone'], [630, 106, 'crawler']],
        // Célula de energía sobre la plataforma flotante más alta [320,95,40,6], puramente decorativa/opcional
        energyCells: [[335, 85]],
        capsules: [[312, 162]],
        // Cristales de Señal (3 por nivel, objetivo secundario): sobre las flotantes del
        // arranque y del tramo final — el del guardián (reptante al lado) es el 3º.
        crystals: [[75, 105], [240, 95], [630, 98]],
        goal: 730
    },
    {
        name: 'Grietas de Hielo', world: 1, variant: 'ice',
        // TODO el suelo de este nivel es hielo (variant 'ice'): el movimiento tiene inercia — la
        // carrerilla supera la velocidad normal y el impulso se conserva al saltar (ver ICE_* en
        // entities.js). El tramo final es el set piece que lo enseña: pista de despegue → hueco
        // de 52 que SOLO se cruza deslizándose (el salto normal llega a ~42 en llano).
        platforms: [
            [0, 150, 100, 15], [130, 150, 60, 15],
            [70, 118, 30, 6], [250, 140, 70, 15], [355, 125, 40, 6],
            [430, 105, 40, 6], [510, 130, 60, 15],
            // plataforma secreta muy alta sobre [430,105,40,6]: fuera del alcance de un doble salto
            // normal, solo se llega manteniendo pulsado el salto de Bolt (vuelo)
            [440, 40, 24, 6],
            // Camino bajo: piedras de paso alcanzables con un salto SIMPLE, para que Scrap (sin
            // habilidad aérea) también pueda cruzar los huecos de arriba, que exigen doble salto.
            // Cualquier piloto puede usarlas, pero solo Scrap las NECESITA — para los demás son un
            // desvío más lento que saltar directo.
            [215, 150, 20, 6], [348, 150, 20, 6], [423, 135, 20, 6],
            // Set piece del deslizamiento: pista de despegue larga (130 — de sobra para llegar
            // a velocidad máxima de carrerilla) y, tras un hueco de 52 en llano, el islote con
            // la cápsula a media altura (y=130): con carrerilla se aterriza en él de lleno; sin
            // ella el salto se queda corto y caes a la grieta de abajo.
            [600, 150, 130, 15], [782, 130, 40, 6],
            // Fondo de la grieta bajo el hueco: red de seguridad CONTINUA (como la del Nido de
            // la Reina Larva) — cualquier salto fallado desde la pista cae aquí, sin perder nada
            // más que el premio, y sale a la meseta con un salto simple. Continua a propósito:
            // con piedras sueltas, el arco de un salto normal fallado desde el borde caía justo
            // en los huecos entre piedras y "fallar el set piece" se convertía en muerte.
            // Desde el fondo, el islote (42 más arriba) queda fuera de alcance de cualquier
            // salto: la cápsula es el premio del salto con carrerilla, no de la ruta lenta.
            [742, 172, 110, 6],
            // Meseta: pista de despegue del SALTO FINAL — el bis del set piece, esta vez sin
            // premio que ganar sino la propia meta: hueco de 58 en llano (aún más ancho que el
            // del islote) hasta la plataforma de la BASE. Misma regla que el primero: red de
            // seguridad debajo que saca con salto simple — fallar cuesta tiempo, no vidas.
            [862, 150, 90, 15],
            [962, 172, 40, 6],
            [1010, 150, 80, 15]
        ],
        // El erizo vive en la red de la grieta, bajo el islote: peaje de la ruta lenta (quien
        // cruza deslizándose ni lo ve). Rango acotado (20) porque salta y NO gira en los bordes.
        // El reptante de la plataforma de la BASE también lleva rango corto para no patrullar
        // la zona donde aterriza el salto final.
        enemies: [[80, 106, 'drone'], [260, 128, 'spiker'], [440, 93, 'crawler'], [530, 118, 'spiker'], [790, 161, 'spiker', 20], [1045, 138, 'crawler', 20]],
        // Cápsula en el islote del set piece [782,130,40,6]: solo se alcanza con el salto con
        // carrerilla desde la pista (o gastando Energía en habilidad aérea) — antes estaba sobre
        // la flotante del arranque [70,118,30,6], un salto simple trivial que no premiaba nada.
        capsules: [[794, 118]],
        energyCells: [[447, 27]],
        // Cristales de Señal: flotante del tramo medio, la grieta del set piece (bucear a
        // por él) y la meseta del salto final.
        crystals: [[360, 110], [790, 155], [880, 132]],
        goal: 1055
    },
    {
        name: 'Nido de la Reina Larva', world: 1, variant: 'normal',
        platforms: [
            [0, 150, 90, 15], [120, 150, 70, 15], [220, 140, 50, 6],
            [310, 150, 60, 15], [400, 135, 45, 6],
            // Antesala añadida al alargar el nivel: la arena de la Reina (la plataforma ancha
            // final) se desplaza a la derecha y estos dos tramos rellenan el camino.
            [470, 150, 55, 15], [550, 150, 60, 15], [640, 150, 220, 15],
            // hueco ancho a propósito: un salto normal no llega al otro lado (aterriza en la red
            // de seguridad de abajo, sin perder nada); solo el impulso lateral de Shade cruza del
            // todo hasta la plataforma ancha con la cápsula.
            [330, 108, 18, 6], [390, 100, 70, 8], [330, 160, 150, 6]
        ],
        enemies: [[135, 138, 'drone'], [230, 128, 'crawler'], [485, 138, 'crawler'], [720, 130, 'queen_larva']],
        capsules: [[420, 86]],
        // Cristales de Señal: dos flotantes del camino y la antesala de la arena.
        crystals: [[230, 122], [410, 118], [485, 125]],
        goal: 810, boss: 'queen_larva'
    },

    // ===== MUNDO 2: LUNA FERROSA =====
    {
        name: 'Chatarral Magnético', world: 2, variant: 'metal',
        // Mundo 2: debutan las plataformas FRÁGILES (5º elemento 'fragile': se desmoronan al
        // pisarlas y reaparecen a los 3s) y las plataformas MÓVILES (array movingPlatforms:
        // [x, y, w, h, amplitud, omega] — el test BFS no las cuenta, son atajos opcionales).
        platforms: [
            [0, 150, 80, 15], [140, 150, 55, 15], [235, 130, 45, 6, 'fragile'],
            [325, 150, 55, 15], [420, 115, 45, 6], [510, 150, 55, 15],
            [605, 130, 45, 6, 'fragile'], [695, 150, 130, 15],
            [335, 110, 25, 6], // plataforma secreta: exige doble salto desde [325,150,55,15]
            // Camino bajo con salto simple (ver Grietas de Hielo) — sin él, todo este nivel exige
            // doble salto/dash/vuelo de un extremo a otro y Scrap se quedaría atascado en el primer hueco.
            [105, 150, 20, 6], [220, 150, 20, 6], [308, 140, 20, 6],
            [388, 120, 20, 6], [590, 150, 20, 6], [678, 140, 20, 6],
            // Tramo final añadido al alargar el nivel (huecos ≤25 en llano, salto simple).
            [850, 150, 55, 15], [930, 150, 70, 15], [880, 115, 40, 6]
        ],
        movingPlatforms: [[460, 92, 40, 6, 14, 0.02]],
        enemies: [[150, 138, 'magnetite'], [250, 118, 'hoverbot', 55], [340, 138, 'crawler'], [435, 103, 'hoverbot', 60], [615, 118, 'magnetite'], [860, 138, 'crawler'], [890, 103, 'hoverbot', 50]],
        energyCells: [[345, 100]],
        // Cristales de Señal: uno de bienvenida sobre el suelo de salida, el del punto ALTO
        // de la móvil (súbete y salta) y uno sobre la flotante del tramo final.
        crystals: [[40, 132], [478, 68], [890, 98]],
        goal: 965
    },
    {
        name: 'Tormenta de Iones', world: 2, variant: 'metal',
        // La tormenta es MECÁNICA, no ambientación: ciclo global de frames (calma 5s → aviso
        // 1,5s → descarga 2s, ver la lógica en Game.update) — durante la descarga, estar al
        // raso duele; estar BAJO cualquier plataforma sólida te protege. El nivel se estructura
        // alrededor de ese reloj: 5 refugios (isla + techo) separados por carreras abiertas que
        // se cruzan dentro de una ventana de calma. Primer nivel con presión temporal del juego.
        ionStorm: { calm: 300, warn: 90, strike: 120 },
        platforms: [
            // Refugio A (salida). El techo empieza en x=34 a propósito: el spawn (x=20) cae al
            // suelo del refugio, no encima del techo — y el test BFS encuentra el suelo como
            // plataforma de salida, no el techo.
            [0, 150, 80, 15], [34, 112, 42, 8],
            // Carrera 1 (80→330): piedras de paso llanas (huecos ≤25, salto simple) + ruta alta.
            [105, 150, 20, 6], [150, 150, 20, 6], [195, 150, 20, 6], [240, 150, 20, 6], [285, 150, 20, 6],
            [140, 122, 45, 6], [240, 110, 45, 6],
            // Refugio B.
            [330, 150, 70, 15], [336, 112, 58, 8],
            // Carrera 2 (400→640).
            [425, 150, 20, 6], [470, 150, 20, 6], [515, 150, 20, 6], [560, 150, 20, 6], [605, 150, 15, 6],
            [450, 118, 45, 6, 'fragile'], [550, 104, 45, 6],
            // Refugio C.
            [640, 150, 70, 15], [646, 110, 58, 8],
            // Carrera 3 (710→950), la del secreto: la plataforma altísima [875,64] con la ♥
            // exige doble salto cronometrado DOS veces (flotante → frágil → secreta). A y=64 y
            // no 72 a propósito: a 72, el salto simple desde la frágil (ápice ~79) llegaba por
            // la ventana de aterrizaje y el "secreto" se abría sin habilidad aérea.
            [735, 150, 20, 6], [780, 150, 20, 6], [825, 150, 20, 6], [870, 150, 20, 6], [915, 150, 15, 6],
            [760, 120, 45, 6], [860, 108, 45, 6, 'fragile'],
            [875, 64, 28, 6],
            // Refugio D.
            [950, 150, 80, 15], [958, 112, 64, 8],
            // Carrera 4 (1030→1240).
            [1055, 150, 20, 6], [1100, 150, 20, 6], [1145, 150, 20, 6], [1190, 150, 20, 6],
            [1080, 120, 45, 6], [1170, 110, 45, 6],
            // Refugio E: la isla de la meta.
            [1240, 150, 90, 15], [1248, 112, 58, 8]
        ],
        // La móvil, en la carrera 4 y LEJOS del secreto a propósito: colocada en la carrera 3
        // (su primera versión, x=815) hacía de escalera involuntaria — flotante → móvil →
        // frágil → secreta, todo con salto simple — y el secreto dejaba de serlo.
        movingPlatforms: [[1085, 90, 36, 6, 12, 0.025]],
        // Espectros iónicos patrullando las carreras (la fauna de la tormenta), reptante en las
        // piedras, hoverbot en la carrera del secreto y erizo con rango corto guardando la meta.
        enemies: [[150, 132, 'ionwisp', 60], [480, 130, 'ionwisp', 65], [565, 139, 'crawler'], [790, 130, 'hoverbot', 55], [880, 96, 'ionwisp', 50], [1110, 130, 'ionwisp', 65], [1270, 138, 'spiker', 20]],
        capsules: [[885, 52]],
        // Cristales de Señal: dos sobre flotantes de las carreras (a la intemperie) y el
        // del TECHO del refugio D — subirse exige habilidad aérea y te expone a la tormenta.
        crystals: [[160, 105], [570, 88], [975, 95]],
        goal: 1300
    },
    {
        name: 'Núcleo del Centinela', world: 2, variant: 'metal',
        // El Centinela DOMINA su zona: mientras viva, barre el suelo con ondas de energía en
        // ciclo determinista (calma 3s → apunta 1s → onda 1s; lógica en Game.update). La
        // onda daña a quien tenga los pies en la franja del suelo entre zoneStart y el jefe:
        // te salvas subiéndote a una COBERTURA elevada (y=122, algunas frágiles...) o
        // aguantando en el aire — y una onda (60f) dura más que un salto simple (27f), así que
        // saltar sin cobertura no basta. Es el inverso de la tormenta del N5: allí te escondes
        // DEBAJO; aquí te subes ENCIMA. Al ganar el duelo, la zona se apaga.
        sentinelWatch: { zoneStart: 140, calm: 180, warn: 60, fire: 60, band: 132 },
        platforms: [
            // Intro segura (antes de zoneStart) y suelo casi continuo: correr es la fase de
            // avance; los huecos de 25 son el único peligro del suelo fuera de las ondas.
            [0, 150, 140, 15],
            [165, 150, 180, 15], [370, 150, 160, 15], [555, 150, 170, 15], [750, 150, 90, 15],
            [850, 150, 290, 15],
            // Coberturas (subida 28: salto simple), repartidas para que desde cualquier punto
            // de la zona haya una a ≤93 — lo andable durante el aviso de 60 frames. Dos son
            // FRÁGILES: tu cobertura puede desmoronarse bajo los pies en plena onda.
            [200, 122, 40, 8], [295, 122, 35, 8, 'fragile'],
            [420, 122, 40, 8], [495, 122, 30, 8, 'fragile'],
            [600, 122, 40, 8], [680, 122, 35, 8],
            [775, 122, 40, 8],
            [890, 122, 35, 8] // la de la arena: la última antes del duelo
        ],
        movingPlatforms: [[540, 95, 40, 6, 14, 0.02]],
        enemies: [[180, 138, 'magnetite'], [390, 138, 'ionwisp', 50], [575, 138, 'hoverbot', 45], [690, 138, 'magnetite'], [905, 138, 'ionwisp', 40], [970, 130, 'sentinel']],
        // Cristales de Señal: sobre la 1ª cobertura, el punto alto de la móvil y la cobertura
        // de la antesala.
        crystals: [[215, 102], [560, 72], [805, 102]],
        goal: 1090, boss: 'sentinel'
    },

    // ===== MUNDO 3: ESTACIÓN COLAPSADA =====
    // Una estación abandonada donde encuentras la pieza que falta para reparar la nave.
    // Al tomarla, el núcleo despierta y empieza la cuenta atrás de autodestrucción.
    {
        name: 'Muelle de Carga', world: 3, variant: 'metal',
        platforms: [
            [0, 150, 80, 15], [140, 150, 55, 15], [230, 130, 45, 6],
            [320, 150, 55, 15], [410, 115, 45, 6], [500, 150, 55, 15],
            [590, 130, 45, 6], [680, 150, 150, 15],
            [245, 104, 25, 6], // plataforma secreta: un salto simple por encima de [230,130,45,6]
            // Camino bajo con salto simple (ver Grietas de Hielo).
            [105, 150, 20, 6], [220, 150, 20, 6], [298, 114, 20, 6],
            [400, 150, 20, 6], [580, 150, 20, 6], [663, 140, 20, 6],
            // Tramo final añadido al alargar el nivel (huecos ≤25 en llano, salto simple).
            [855, 150, 55, 15], [935, 150, 65, 15], [890, 118, 40, 6]
        ],
        // Mundo 3: debutan las PUERTAS DE ENERGÍA ([x, yTop, altura, desfase]): columna vertical
        // entre dos emisores clavada en el suelo, ciclo fijo de 2.5s (1.5 apagada, 0.25 aviso,
        // 0.75 activa). Con 40 de alto el salto simple no la supera: esperas el ciclo o gastas
        // Energía en la habilidad aérea. Colocadas en tramos SIN enemigos patrullando encima.
        beams: [[525, 110, 40, 0], [740, 110, 40, 75]],
        enemies: [[150, 138, 'crawler'], [240, 118, 'hoverbot', 50], [330, 138, 'spiker'], [420, 103, 'ionwisp', 55], [600, 118, 'magnetite'], [865, 138, 'spiker'], [900, 106, 'hoverbot', 45]],
        capsules: [[254, 94]],
        // Cristales de Señal: flotante del arranque, el del ápice sobre [590,130] (se roza
        // en lo alto del salto) y el suelo largo del tramo final.
        crystals: [[240, 112], [600, 88], [700, 132]],
        goal: 965
    },
    {
        name: 'Túnel de Escape', world: 3, variant: 'metal',
        // Nivel de scroll forzado: la pared de energía del núcleo avanza sola.
        // Quedarte atrás del borde izquierdo de la cámara duele — hay que mantener el ritmo.
        forcedScroll: { speed: 0.55, startDelay: 300 },
        platforms: [
            [0, 150, 60, 15], [90, 150, 50, 15], [170, 140, 45, 6],
            [240, 150, 55, 15], [325, 135, 45, 6, 'fragile'], [400, 150, 60, 15],
            [490, 125, 45, 6], [565, 150, 55, 15], [650, 140, 45, 6, 'fragile'],
            [725, 150, 60, 15], [815, 125, 45, 6, 'fragile'], [890, 150, 170, 15],
            // Dos huecos de este nivel (los de subir 25u con 30u de hueco) se quedaban CORTOS por
            // muy poco para un salto simple, pese a que el diseño original decía que este nivel no
            // exige doble salto — dos piedras mínimas para que sea cierto también con Scrap.
            [465, 124, 16, 6], [790, 124, 16, 6],
            // Tramo final añadido al alargar el nivel — mismas reglas que el resto del Túnel:
            // cruzable con salto simple (huecos ≤25, subida de 10 como el patrón ya existente).
            [1085, 150, 55, 15], [1165, 140, 45, 6], [1235, 150, 60, 15]
        ],
        enemies: [[100, 138, 'spiker'], [250, 138, 'magnetite'], [410, 138, 'crawler'], [575, 138, 'hoverbot', 40], [735, 138, 'spiker'], [900, 138, 'ionwisp', 50], [1095, 138, 'crawler'], [1180, 128, 'spiker']],
        // Cristales de Señal: repartidos por el túnel — el de la frágil [650,140] se coge
        // con el muro pisándote los talones.
        crystals: [[185, 122], [660, 118], [1180, 122]],
        goal: 1260
    },
    {
        name: 'Núcleo del Reactor', world: 3, variant: 'metal',
        platforms: [
            [0, 150, 70, 15], [130, 150, 55, 15], [235, 130, 45, 6],
            [330, 150, 55, 15], [420, 110, 45, 6, 'fragile'], [510, 150, 55, 15],
            [600, 125, 45, 6], [690, 150, 55, 15],
            // Antesala añadida al alargar el nivel: la arena del Overlord se desplaza a la
            // derecha y estos dos tramos rellenan el camino. La antesala es una CINTA que
            // arrastra hacia atrás ('beltL') — debut de las cintas magnéticas, justo antes del jefe.
            [770, 150, 55, 15], [850, 150, 70, 15, 'beltL'], [950, 150, 320, 15],
            [140, 115, 25, 6], // plataforma secreta: exige doble salto desde [130,150,55,15], antes del jefe
            // Camino bajo con salto simple (ver Grietas de Hielo) — incluso el nivel del jefe final
            // de la zona 3 debe poder cruzarse sin doble salto.
            [95, 150, 20, 6], [193, 125, 20, 6], [308, 140, 20, 6],
            // La piedra [455,150,28] tapa un agujero REAL del camino bajo: entre [410,150,20] y
            // [510,150,55] había 80 de hueco y solo la frágil a y=110 (subida de 40 — imposible
            // sin habilidad aérea). El BFS antiguo lo daba por bueno por un bug (solape
            // horizontal con altura inalcanzable contaba como salto) y Scrap se atascaba aquí.
            [410, 150, 20, 6], [455, 150, 28, 6], [590, 150, 20, 6], [673, 135, 20, 6]
        ],
        beams: [[795, 110, 40, 0], [1000, 110, 40, 75]],
        enemies: [[145, 138, 'magnetite'], [250, 118, 'ionwisp', 40], [340, 138, 'spiker'], [430, 98, 'hoverbot', 45], [520, 138, 'crawler'], [615, 113, 'ionwisp', 50], [785, 138, 'magnetite'], [860, 120, 'ionwisp', 45], [1070, 130, 'overlord']],
        energyCells: [[149, 105]],
        // Cristales de Señal: dos flotantes del camino y el de la cinta magnética — saltar
        // mientras te arrastra.
        crystals: [[250, 112], [615, 107], [875, 128]],
        goal: 1220, boss: 'overlord'
    },

    // ===== MUNDO 4: NÚCLEO EXPUESTO =====
    // El Overlord no era la Red — era un fragmento local, un nodo, un avatar (LORE.md §2.2).
    // Ganar esa pelea no acaba la amenaza: la deja al descubierto. Detrás del Núcleo del Reactor
    // había una bóveda sellada con refuerzos que ningún piloto anterior podía cruzar — hasta ahora,
    // que Scrap (desbloqueado justo al vencer al Overlord) puede romperlos. Por eso esta zona
    // existe solo a partir de aquí, no antes: es literalmente el mundo que tu piloto nuevo abre.
    {
        name: 'Bóveda Sellada', world: 4, variant: 'metal',
        platforms: [
            [0, 150, 80, 15], [140, 150, 55, 15], [230, 130, 45, 6],
            [320, 150, 55, 15], [410, 115, 45, 6, 'fragile'], [500, 150, 55, 15],
            // El suelo largo se parte en dos a propósito: el hueco 700-720 lo tapa el refuerzo
            // (reinforcedBlocks) — si fuera continuo, romperlo no abriría nada y la bóveda de
            // abajo sería inalcanzable (pasaba de verdad: el suelo seguía ahí debajo).
            [590, 130, 45, 6], [680, 150, 20, 15], [720, 150, 140, 15],
            // Camino bajo con salto simple (ver Grietas de Hielo, nivel 2) — el mundo que Scrap
            // abre debe poder cruzarse con Scrap, no solo con los otros tres pilotos.
            [105, 150, 20, 6], [220, 150, 20, 6], [303, 140, 20, 6],
            [400, 150, 20, 6], [580, 150, 20, 6], [663, 140, 20, 6],
            // Tramo final añadido al alargar el nivel (huecos ≤25 en llano, salto simple).
            [885, 150, 55, 15, 'beltL'], [965, 150, 65, 15], [915, 118, 40, 6],
            // Suelo de la bóveda bajo el refuerzo [700,150,20,8] — como en Cráter de Amerizaje:
            // sin él, Scrap rozaba la cápsula en plena caída y moría (premio y castigo se
            // anulaban), y el agujero quedaba como pozo mortal para cualquier piloto después.
            [695, 172, 30, 6],
            // EL PASILLO SELLADO (debut del techo macizo, variant 'roof'): cubre el corredor de
            // la doble puerta — su cara inferior queda en y=100, así que el salto simple (cabeza
            // a ~109 desde el suelo) pasa limpio, pero el doble salto/vuelo que hasta ahora
            // saltaba las puertas por arriba se estampa: aquí las puertas SE CRONOMETRAN.
            [706, 92, 158, 8, 'roof']
        ],
        // Pasillo de doble puerta desfasada justo tras la bóveda del refuerzo: el set piece del nivel.
        beams: [[720, 110, 40, 0], [800, 110, 40, 75]],
        // Parche reforzado que tapa una bóveda justo debajo, al ras del suelo — igual que el
        // primer secreto de Scrap en Cráter de Amerizaje (nivel 1): cualquiera camina encima sin
        // notarlo, solo Scrap puede romperlo y bajar a por la cápsula.
        reinforcedBlocks: [[700, 150, 20, 8]],
        enemies: [[150, 138, 'magnetite'], [240, 118, 'hoverbot', 50], [330, 138, 'spiker'], [420, 103, 'ionwisp', 55], [510, 138, 'magnetite'], [600, 118, 'hoverbot', 45], [895, 138, 'spiker'], [925, 106, 'hoverbot', 45]],
        capsules: [[707, 162]],
        // Cristales de Señal: dos flotantes del camino y la plataforma alta del tramo final.
        crystals: [[245, 112], [605, 112], [913, 96]],
        goal: 995
    },
    {
        name: 'Galería de Ecos', world: 4, variant: 'metal',
        platforms: [
            [0, 150, 70, 15], [190, 145, 45, 6], [320, 125, 45, 6],
            [450, 105, 45, 6], [580, 125, 45, 6], [710, 145, 45, 6],
            // Suelo partido en dos: el hueco 945-965 lo tapa el refuerzo (ver Bóveda Sellada).
            [840, 150, 55, 15], [930, 150, 15, 15], [965, 150, 115, 15],
            // Camino bajo con salto simple — como Tormenta de Iones (nivel 5), del mismo estilo
            // "doble salto obligatorio" en la ruta alta, necesita varias piedras seguidas.
            [95, 150, 20, 6], [140, 150, 20, 6],
            [261, 150, 20, 6], [306, 150, 20, 6],
            [393, 135, 20, 6], [441, 145, 20, 6],
            // [485,135,20] tapa el mismo tipo de agujero real que en Núcleo del Reactor/Nodo
            // Cero: de [441,145,20] a la frágil [523,115] había 62 de hueco — incruzable con
            // salto simple, y el camino bajo de este nivel existe justo para eso.
            [485, 135, 20, 6],
            [523, 115, 20, 6, 'fragile'], [653, 135, 20, 6],
            [781, 150, 20, 6], [826, 150, 14, 6],
            // Tramo final añadido al alargar el nivel (huecos ≤25, subida suave de 5).
            [1105, 150, 55, 15], [1185, 145, 45, 6, 'fragile'], [1255, 150, 70, 15],
            // Suelo de la bóveda bajo el refuerzo [945,150,20,8] (ver Bóveda Sellada).
            [940, 172, 30, 6],
            // Techo macizo sobre la puerta del tramo final (ver el pasillo sellado de Bóveda
            // Sellada): cara inferior en y=100 — el salto simple pasa, saltarse la puerta con
            // habilidad aérea ya no.
            [1015, 92, 80, 8, 'roof']
        ],
        movingPlatforms: [[368, 95, 36, 6, 16, 0.02], [698, 95, 36, 6, 16, 0.025]],
        beams: [[1040, 110, 40, 0]],
        reinforcedBlocks: [[945, 150, 20, 8]],
        enemies: [[200, 133, 'ionwisp', 60], [330, 113, 'spiker'], [460, 93, 'ionwisp', 65], [590, 113, 'hoverbot', 55], [720, 133, 'magnetite'], [850, 138, 'spiker'], [1120, 138, 'magnetite'], [1195, 133, 'spiker']],
        energyCells: [[952, 162]],
        // Cristales de Señal: dos flotantes de la galería y el punto alto de la 2ª móvil.
        crystals: [[205, 127], [465, 87], [712, 69]],
        goal: 1290
    },
    {
        name: 'Nodo Cero', world: 4, variant: 'metal',
        // LA PRUEBA FINAL, en tres actos cortos y legibles (no "el nivel más difícil" a secas):
        //   ACTO 1 · PRECISIÓN (0→470): piedras estrechas a alturas alternas, frágiles
        //     encadenadas y una puerta — puro examen de salto, con huecos al límite del
        //     estándar (≤26) pero nunca por encima.
        //   ACTO 2 · LOS DOMINIOS ABSORBIDOS (470→980): la Red combina lo aprendido de cada
        //     mundo (el eco mecánico de su lore): tormenta iónica ZONAL con refugios, cinta en
        //     contra con puerta encima y un tramo de hielo.
        //   ACTO 3 · LA HUIDA (980→arena): al cruzar x=980 la Red despierta — muro de energía
        //     con disparador por posición (triggerX) persiguiéndote hasta la arena, donde el
        //     tope de cámara lo deja PARADO en el borde: no hay vuelta atrás durante el duelo.
        // El final no es cruzar una bandera: ganar el duelo derrumba la Red en pantalla y
        // escapas EN LA NAVE (la finale scriptada vive en Game.startFinale/finishGame).
        ionStorm: { calm: 240, warn: 60, strike: 110, zone: [470, 985] },
        forcedScroll: { speed: 0.6, startDelay: 0, triggerX: 980, label: 'LA RED' },
        platforms: [
            // ACTO 1 — precisión: piedras w16 a alturas alternas y frágiles sobre el vacío.
            [0, 150, 80, 15],
            [104, 150, 16, 6], [144, 138, 16, 6], [186, 150, 16, 6], [228, 132, 16, 6], [270, 144, 16, 6],
            [312, 132, 26, 6, 'fragile'], [360, 142, 26, 6, 'fragile'],
            [408, 150, 62, 15],
            // ACTO 2 — refugios de tormenta (isla+techo), techo-flotante de emergencia, cinta
            // en contra con puerta encima (peaje triple con la tormenta) y tramo de hielo.
            [494, 150, 70, 15], [500, 112, 58, 8],
            [588, 150, 20, 6], [610, 118, 40, 6], [634, 150, 20, 6],
            [678, 150, 80, 15, 'beltL'],
            [782, 150, 64, 15], [788, 112, 52, 8],
            [870, 150, 56, 15, 'ice'], [900, 115, 40, 6], [950, 150, 16, 6],
            // ACTO 3 — el gauntlet de la huida y la arena final.
            [980, 150, 70, 15], [1076, 150, 20, 6], [1122, 136, 24, 6, 'fragile'],
            [1170, 150, 260, 15]
        ],
        movingPlatforms: [[1330, 95, 40, 6, 16, 0.02]],
        beams: [[436, 110, 40, 0], [716, 110, 40, 75], [1210, 110, 40, 0], [1258, 110, 40, 75]],
        // Acto 1 casi sin fauna (el examen es el salto); el 2 con los esbirros de todos los
        // mundos — dos magnetitas okupan los propios refugios: cobijarse tiene peaje.
        enemies: [[430, 138, 'spiker', 12], [530, 138, 'magnetite'], [620, 105, 'ionwisp', 40], [710, 138, 'hoverbot', 35], [800, 138, 'magnetite'], [885, 139, 'crawler'], [1005, 138, 'spiker', 15], [1195, 138, 'magnetite'], [1235, 120, 'ionwisp', 35], [1290, 130, 'nodo_cero']],
        // Cristales de Señal: acto 1 (sobre la piedra alta), acto 2 (sobre el techo-flotante)
        // y la móvil de la arena.
        crystals: [[230, 114], [620, 100], [1345, 61]],
        // final: completar ESTE nivel termina el juego (ver Game.finishGame — con la Red viva
        // no se cruza, y con la Red caída la meta es la nave, no la bandera).
        goal: 1370, boss: 'nodo_cero', final: true
    },

    // ===== NIVEL EXTRA (sin nodo en el mapa todavía — se entra con ?level=13) =====
    {
        name: 'Torre de Vigía', world: 5, variant: 'normal', extra: true,
        // El primer nivel VERTICAL: tres pisos (y=150, y=92, y=34 — separación 58, que no la sube
        // NI el doble salto: su ápice + ventana de aterrizaje llega a ~56; solo el vuelo de
        // Bolt se salta las escaleras) recorridos en serpentín: → por el suelo, escalera al fondo
        // derecho, ← por el piso 2, escalera al fondo izquierdo, → por el piso 3 hasta la BASE.
        // La meta sigue siendo una X (player.x >= goal), así que el serpentín se fuerza por
        // geometría: NINGÚN piso salvo el 3º se acerca a goal ni en pleno salto (extremo + ~42).
        // Caerse de un piso castiga con tiempo, no con vidas: cada hueco de los pisos 2-3 tiene
        // suelo debajo (incluido el suelo de recogida bajo la escalera derecha) — los únicos
        // huecos letales son los dos del piso 1.
        goalY: 12, // la bandera pisa el piso 3 (y=34), no el suelo
        platforms: [
            // Piso 1 (izquierda → derecha). El tramo central es largo a propósito: queda justo
            // bajo la frágil del piso 2 — quien caiga cuando se desmorone aterriza en suelo
            // firme, no en un hueco.
            [0, 150, 120, 15], [145, 150, 170, 15], [340, 150, 120, 15],
            // Suelo de recogida bajo la escalera derecha: recoge cualquier caída del extremo
            // derecho del piso 2. Termina en 590 (590+42 < 640): ni en pleno salto alcanza la meta.
            [462, 150, 128, 15],
            // Escalera derecha (piso 1 → piso 2): peldaño a media altura (subidas de 29, al
            // límite cómodo del salto simple).
            [472, 121, 24, 6],
            // Piso 2 (derecha → izquierda). El tramo derecho acaba en 505 a propósito
            // (505+42 < goal). El del medio son DOS frágiles cortas, no una larga: con una sola
            // de 85, cruzarla andando (47-49 frames) rozaba su cuenta atrás de 50 y el margen
            // real era de 1-3 frames — injugable. Dos de 38 con temporizador propio se cruzan
            // con margen de sobra... si no te paras en ninguna.
            // Pisos 2 y 3 con TECHO MACIZO ('roof') salvo dos aterrizajes: [440,92] (donde
            // desemboca la escalera derecha, saltando A TRAVÉS desde el peldaño) y [26,34]
            // (ídem con la izquierda) — y las frágiles, que ya tienen su propio drama. Sella
            // el atajo de Bolt (volar a través de los suelos) sin tocar la ruta de nadie: el
            // serpentín por las escaleras es LA ruta. Ojo con el margen vertical: desde un
            // piso (y=92) el salto simple deja la cabeza a ~51, y la cara inferior del techo
            // de arriba queda en 42 — pasa limpio; el doble salto ahí se estampa (a propósito).
            [440, 92, 65, 8], [330, 92, 80, 8, 'roof'],
            [215, 92, 38, 8, 'fragile'], [262, 92, 38, 8, 'fragile'],
            [95, 92, 90, 8, 'roof'], [30, 92, 40, 8, 'roof'],
            // Escalera izquierda (piso 2 → piso 3), en zigzag: arranca en x=34 y no en el borde
            // para no pisar el x=20 del spawn (el BFS de los tests elige como salida la
            // plataforma MÁS ALTA que cubre x=20 — si el peldaño lo cubriera, validaría un
            // camino que el jugador real no tiene).
            [34, 63, 24, 6],
            // Piso 3 (izquierda → derecha), con la meta al final. Sus huecos caen siempre sobre
            // tramo sólido del piso 2 (o del suelo de recogida), nunca sobre un pozo encadenado.
            [26, 34, 80, 8], [130, 34, 85, 8, 'roof'], [240, 34, 105, 8, 'roof'], [370, 34, 85, 8, 'roof'], [480, 34, 65, 8, 'roof'], [568, 34, 150, 8, 'roof']
        ],
        beams: [[310, 110, 40, 0]],
        enemies: [[180, 138, 'crawler'], [400, 138, 'spiker', 20], [355, 80, 'magnetite'], [130, 77, 'hoverbot', 40], [270, 27, 'ionwisp', 45], [600, 22, 'spiker', 25]],
        // Cápsula flotando entre pisos, bajo la frágil: un salto deliberado desde el corredor
        // del piso 1 la roza en el ápice.
        capsules: [[250, 118]],
        // 650 y no 640: el suelo de recogida acaba en 590 y un salto desde su borde plantaba al
        // jugador en x≈630 en el aire — a 12 de la meta. Con 650 el margen sube a ~20.
        goal: 650
    },
    {
        name: 'Aguja Glacial', world: 5, variant: 'metal', extra: true,
        // Nivel Extra 2, la torre "difícil de verdad": mismo serpentín de tres pisos que la
        // Torre de Vigía, pero con HIELO por tramos (el 5º elemento 'ice' pisa el variant del
        // nivel — resbalar junto a huecos letales, y un salto con carrerilla como examen final
        // en la cumbre) y ASCENSORES en vez de peldaños: dos móviles verticales de amplitud 22
        // (un piso entero por viaje, velocidad máx 0.264 < gravedad — el snap no pierde al
        // pasajero) que hay que esperar y abordar. Es la excepción consciente a la regla "las
        // móviles nunca son obligatorias": vale SOLO en niveles extra, y el BFS de los tests
        // las modela aquí como nodos abordables por sus extremos.
        goalY: 38,
        platforms: [
            // Piso 1 (→), todo hielo, con dos puertas desfasadas: frenar sobre hielo ante una
            // puerta es el plato fuerte del piso. Huecos de 23-25, aquí sí letales.
            [0, 150, 110, 15, 'ice'], [135, 150, 110, 15, 'ice'], [270, 150, 80, 15, 'ice'], [373, 150, 90, 15, 'ice'],
            // Bolsillo de recogida bajo el hueco del ascensor 1: fallar el abordaje no mata —
            // caes, esperas a que baje (o saltas de vuelta al piso 1) y reintentas. Acaba en 507
            // (507+42 < goal): ni de un salto desde el bolsillo se alcanza la meta.
            [463, 172, 44, 6],
            // Piso 2 (←), mixto. El tramo derecho es metal A PROPÓSITO: de hielo, un deslizón
            // desde su borde (extremo + ~70 de vuelo con carrerilla) alcanzaría la meta en el
            // aire sin pisar la cumbre. Después, hielo y dos frágiles cortas.
            [415, 105, 70, 8], [305, 105, 80, 8, 'ice'],
            [237, 105, 40, 8, 'fragile'], [163, 105, 44, 8, 'fragile'],
            [60, 105, 78, 8, 'ice'],
            // Piso 3 (→): la cumbre helada. Pista de 130 → hueco de 50 SOLO-carrerilla (el
            // salto normal llega a ~42) → tramo de la BASE. Fallar el salto cae al tramo metal
            // del piso 2: castigo de re-subida, no de vidas.
            [40, 60, 120, 8, 'ice'], [185, 60, 90, 8, 'ice'],
            [303, 60, 130, 8, 'ice'],
            [483, 60, 90, 8, 'ice']
        ],
        // Los ascensores: baseY a medio camino entre pisos, amplitud 22 = recorrido 44 (un piso).
        // El 2º arranca en x=22 y no en el borde para no pisar el x=20 del spawn (que el BFS de
        // los tests usa para elegir la plataforma de salida). Debajo de cada hueco de ascensor
        // hay suelo (bolsillo / piso 1): fallar el abordaje cuesta tiempo.
        movingPlatforms: [[473, 128, 34, 6, 22, 0.012], [22, 83, 34, 6, 22, 0.012]],
        beams: [[200, 110, 40, 0], [300, 110, 40, 75]],
        // Fauna alta (mundos 3-4), 8 unidades — incluido un espectro patrullando EL AIRE del
        // hueco final: esquivarlo en pleno salto con carrerilla es el último examen.
        enemies: [[60, 138, 'spiker', 20], [320, 138, 'magnetite'], [340, 93, 'ionwisp', 40], [100, 93, 'hoverbot', 35], [90, 48, 'magnetite'], [220, 48, 'ionwisp', 35], [450, 40, 'ionwisp', 30], [520, 48, 'spiker', 18]],
        // Cápsula flotando en el hueco del ascensor 1: se recoge durante el viaje.
        capsules: [[482, 88]],
        goal: 560
    }
];
