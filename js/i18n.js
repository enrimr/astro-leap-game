// ============================== IDIOMAS (i18n) ==============================
// Todo el texto visible del juego vive aquí, una clave por string y los 7 idiomas juntos por
// línea — así una clave nueva se traduce en el momento (y el test de completitud vigila que
// ningún idioma se quede cojo). El español es la lengua fuente: si a una entrada le falta un
// idioma, t() cae a 'es' antes que enseñar la clave. Los textos se piden SIEMPRE en el momento
// de pintar (canvas se repinta cada frame, los menús se reconstruyen al abrirse), así que
// cambiar de idioma surte efecto al instante sin recargar.
//
// Interpolación: {param} con t(clave, { param: valor }). Los emojis y símbolos (⚔️ ♥ ◆ ▸)
// viajan dentro del string traducido: su posición puede variar según el idioma.
//
// Fuera del alcance (deliberado): GUIA.md/README (documentación en español), los meta/OG de
// index.html (SEO de la web en su idioma original) y los textos de los scripts de desarrollo.

const LANGS = [
    ['es', 'Español'], ['en', 'English'], ['it', 'Italiano'], ['fr', 'Français'],
    ['de', 'Deutsch'], ['ja', '日本語'], ['zh', '中文']
];

let LANG = (() => {
    try {
        const saved = localStorage.getItem('astroLeapLang');
        if (saved && LANGS.some(([c]) => c === saved)) return saved;
    } catch (e) { /* sin almacenamiento: se detecta y ya */ }
    const nav = (typeof navigator !== 'undefined' && (navigator.language || '')).toLowerCase();
    const hit = LANGS.find(([c]) => nav.startsWith(c));
    return hit ? hit[0] : 'en';
})();

function setLanguage(code) {
    if (!LANGS.some(([c]) => c === code)) return;
    LANG = code;
    try { localStorage.setItem('astroLeapLang', code); } catch (e) { /* noop */ }
    try { document.documentElement.lang = code; } catch (e) { /* noop */ }
}

function t(key, params) {
    const entry = STRINGS[key];
    let s = entry ? (entry[LANG] !== undefined ? entry[LANG] : entry.es) : key;
    if (params) for (const k of Object.keys(params)) s = s.split('{' + k + '}').join(String(params[k]));
    return s;
}

const STRINGS = {
    // ---- Menú principal ----
    'menu.subtitle': { es: '4 zonas · 12 sectores · duelos de energía', en: '4 zones · 12 sectors · energy duels', it: '4 zone · 12 settori · duelli di energia', fr: '4 zones · 12 secteurs · duels d’énergie', de: '4 Zonen · 12 Sektoren · Energieduelle', ja: '4ゾーン・12セクター・エナジーデュエル', zh: '4大区域 · 12个扇区 · 能量对决' },
    'menu.play': { es: 'JUGAR', en: 'PLAY', it: 'GIOCA', fr: 'JOUER', de: 'SPIELEN', ja: 'プレイ', zh: '开始游戏' },
    'menu.continue': { es: 'CONTINUAR PARTIDA', en: 'CONTINUE', it: 'CONTINUA PARTITA', fr: 'CONTINUER LA PARTIE', de: 'SPIEL FORTSETZEN', ja: 'つづきから', zh: '继续游戏' },
    'menu.newgame': { es: 'NUEVA PARTIDA', en: 'NEW GAME', it: 'NUOVA PARTITA', fr: 'NOUVELLE PARTIE', de: 'NEUES SPIEL', ja: 'はじめから', zh: '新游戏' },
    'menu.daily': { es: 'RETO DIARIO', en: 'DAILY CHALLENGE', it: 'SFIDA DEL GIORNO', fr: 'DÉFI DU JOUR', de: 'TAGES-HERAUSFORDERUNG', ja: 'デイリーチャレンジ', zh: '每日挑战' },
    'menu.times': { es: 'Mejores tiempos', en: 'Best times', it: 'Tempi migliori', fr: 'Meilleurs temps', de: 'Bestzeiten', ja: 'ベストタイム', zh: '最佳成绩' },
    'menu.help': { es: 'Ayuda', en: 'Help', it: 'Aiuto', fr: 'Aide', de: 'Hilfe', ja: 'ヘルプ', zh: '帮助' },
    'menu.challenged': { es: '¿Te han retado?', en: 'Got challenged?', it: 'Ti hanno sfidato?', fr: 'On t’a défié ?', de: 'Herausgefordert?', ja: '挑戦状が届いた？', zh: '收到挑战了？' },
    'menu.quit': { es: 'Salir del juego', en: 'Quit game', it: 'Esci dal gioco', fr: 'Quitter le jeu', de: 'Spiel beenden', ja: 'ゲームを終了', zh: '退出游戏' },
    'menu.lang': { es: 'Idioma', en: 'Language', it: 'Lingua', fr: 'Langue', de: 'Sprache', ja: '言語', zh: '语言' },
    'menu.back': { es: '◂ VOLVER', en: '◂ BACK', it: '◂ INDIETRO', fr: '◂ RETOUR', de: '◂ ZURÜCK', ja: '◂ もどる', zh: '◂ 返回' },
    'menu.tomenu': { es: '◂ VOLVER AL MENÚ', en: '◂ BACK TO MENU', it: '◂ TORNA AL MENU', fr: '◂ RETOUR AU MENU', de: '◂ ZUM MENÜ', ja: '◂ メニューへ', zh: '◂ 回到主菜单' },
    'menu.bestTimesTitle': { es: 'MEJORES TIEMPOS', en: 'BEST TIMES', it: 'TEMPI MIGLIORI', fr: 'MEILLEURS TEMPS', de: 'BESTZEITEN', ja: 'ベストタイム', zh: '最佳成绩' },
    'menu.noRuns': { es: 'Todavía no has completado ninguna partida.', en: 'You haven’t finished a run yet.', it: 'Non hai ancora completato nessuna partita.', fr: 'Tu n’as encore terminé aucune partie.', de: 'Du hast noch keinen Durchlauf abgeschlossen.', ja: 'まだクリアした記録がありません。', zh: '你还没有通关记录。' },
    'menu.dailyNote.played': { es: 'Hoy: {time} con {hero} ({level})', en: 'Today: {time} with {hero} ({level})', it: 'Oggi: {time} con {hero} ({level})', fr: 'Aujourd’hui : {time} avec {hero} ({level})', de: 'Heute: {time} mit {hero} ({level})', ja: '今日：{hero}で{time}（{level}）', zh: '今日：{hero} 用时 {time}（{level}）' },
    'menu.dailyNote.pending': { es: 'Hoy: {level} · dificultad {diff} · piloto {hero}', en: 'Today: {level} · difficulty {diff} · pilot {hero}', it: 'Oggi: {level} · difficoltà {diff} · pilota {hero}', fr: 'Aujourd’hui : {level} · difficulté {diff} · pilote {hero}', de: 'Heute: {level} · Schwierigkeit {diff} · Pilot {hero}', ja: '今日：{level}・難易度{diff}・パイロット{hero}', zh: '今日：{level} · 难度 {diff} · 飞行员 {hero}' },
    'menu.duelCard': { es: '⚔️ DUELO: ganar a {name} — {time}', en: '⚔️ DUEL: beat {name} — {time}', it: '⚔️ DUELLO: batti {name} — {time}', fr: '⚔️ DUEL : bats {name} — {time}', de: '⚔️ DUELL: Schlag {name} — {time}', ja: '⚔️ デュエル：{name}に勝て — {time}', zh: '⚔️ 对决：击败 {name} — {time}' },
    'menu.duelNote': { es: 'Reto del {date}: {level} · dificultad {diff} · piloto {hero} · {ghost}', en: 'Challenge of {date}: {level} · difficulty {diff} · pilot {hero} · {ghost}', it: 'Sfida del {date}: {level} · difficoltà {diff} · pilota {hero} · {ghost}', fr: 'Défi du {date} : {level} · difficulté {diff} · pilote {hero} · {ghost}', de: 'Herausforderung vom {date}: {level} · Schwierigkeit {diff} · Pilot {hero} · {ghost}', ja: '{date}のチャレンジ：{level}・難易度{diff}・{hero}・{ghost}', zh: '{date} 的挑战：{level} · 难度 {diff} · 飞行员 {hero} · {ghost}' },
    'menu.ghostRoute': { es: 'fantasma con ruta real', en: 'ghost with real route', it: 'fantasma con percorso reale', fr: 'fantôme avec trajet réel', de: 'Geist mit echter Route', ja: '実走ルートのゴースト', zh: '真实路线幽灵' },
    'menu.ghostPace': { es: 'fantasma de ritmo', en: 'pace ghost', it: 'fantasma di ritmo', fr: 'fantôme de rythme', de: 'Tempo-Geist', ja: 'ペースゴースト', zh: '配速幽灵' },
    'menu.rival': { es: 'tu rival', en: 'your rival', it: 'il tuo rivale', fr: 'ton rival', de: 'dein Rivale', ja: 'ライバル', zh: '你的对手' },

    // ---- Panel "¿Te han retado?" ----
    'duel.paste.instructions': { es: 'Pega el enlace del duelo que te han mandado — vale el corto (s.enri.me/...), la URL completa o el propio token:', en: 'Paste the duel link you received — the short one (s.enri.me/...), the full URL or the raw token all work:', it: 'Incolla il link del duello che ti hanno mandato — va bene quello corto (s.enri.me/...), l’URL completo o il token stesso:', fr: 'Colle le lien du duel qu’on t’a envoyé — le lien court (s.enri.me/...), l’URL complète ou le jeton brut, tout fonctionne :', de: 'Füge den erhaltenen Duell-Link ein — der Kurzlink (s.enri.me/...), die vollständige URL oder der Token selbst funktionieren alle:', ja: '届いたデュエルのリンクを貼り付けてください — 短縮リンク（s.enri.me/...）、完全なURL、トークンのいずれでもOK：', zh: '粘贴收到的对决链接 — 短链接（s.enri.me/...）、完整网址或令牌均可：' },
    'duel.accept': { es: '⚔️ ACEPTAR EL DUELO', en: '⚔️ ACCEPT THE DUEL', it: '⚔️ ACCETTA IL DUELLO', fr: '⚔️ ACCEPTER LE DUEL', de: '⚔️ DUELL ANNEHMEN', ja: '⚔️ デュエルを受ける', zh: '⚔️ 接受对决' },
    'duel.err.notlink': { es: 'Eso no parece un enlace de duelo.', en: 'That doesn’t look like a duel link.', it: 'Non sembra un link di duello.', fr: 'Ça ne ressemble pas à un lien de duel.', de: 'Das sieht nicht nach einem Duell-Link aus.', ja: 'デュエルのリンクではないようです。', zh: '这看起来不像对决链接。' },
    'duel.err.noduel': { es: 'Ese enlace no lleva a ningún duelo (¿se cortó al copiarlo?).', en: 'That link doesn’t lead to a duel (did it get cut off when copying?).', it: 'Quel link non porta a nessun duello (si è troncato durante la copia?).', fr: 'Ce lien ne mène à aucun duel (il a été coupé lors de la copie ?).', de: 'Dieser Link führt zu keinem Duell (wurde er beim Kopieren abgeschnitten?).', ja: 'このリンクの先にデュエルがありません（コピー時に切れた？）。', zh: '该链接没有指向任何对决（复制时被截断了？）。' },
    'duel.err.bad': { es: 'El duelo llegó ilegible (¿se cortó el enlace al copiarlo?).', en: 'The duel arrived unreadable (did the link get cut off when copying?).', it: 'Il duello è arrivato illeggibile (il link si è troncato durante la copia?).', fr: 'Le duel est arrivé illisible (le lien a été coupé lors de la copie ?).', de: 'Das Duell kam unlesbar an (wurde der Link beim Kopieren abgeschnitten?).', ja: 'デュエルのデータが読めません（リンクが途中で切れた？）。', zh: '对决数据无法读取（链接复制时被截断了？）。' },
    'duel.namePrompt': { es: 'Tu nombre para el duelo (opcional):', en: 'Your name for the duel (optional):', it: 'Il tuo nome per il duello (facoltativo):', fr: 'Ton nom pour le duel (facultatif) :', de: 'Dein Name für das Duell (optional):', ja: 'デュエルでの名前（任意）：', zh: '对决中显示的名字（可选）：' },
    'duel.copied': { es: 'Enlace del duelo copiado — pégaselo a tu rival.', en: 'Duel link copied — paste it to your rival.', it: 'Link del duello copiato — mandalo al tuo rivale.', fr: 'Lien du duel copié — envoie-le à ton rival.', de: 'Duell-Link kopiert — schick ihn deinem Rivalen.', ja: 'デュエルのリンクをコピーしました — 相手に送りましょう。', zh: '对决链接已复制 — 发给你的对手吧。' },
    'duel.copyPrompt': { es: 'Copia el enlace del duelo:', en: 'Copy the duel link:', it: 'Copia il link del duello:', fr: 'Copie le lien du duel :', de: 'Kopiere den Duell-Link:', ja: 'デュエルのリンクをコピー：', zh: '复制对决链接：' },
    'duel.shareText': { es: '⚔️ Te reto en ASTRO LEAP: el Reto Diario del {date} en {time}. Mi fantasma te espera — ¿me ganas?', en: '⚔️ I challenge you in ASTRO LEAP: the {date} Daily Challenge in {time}. My ghost is waiting — can you beat me?', it: '⚔️ Ti sfido su ASTRO LEAP: la Sfida del {date} in {time}. Il mio fantasma ti aspetta — mi batti?', fr: '⚔️ Je te défie sur ASTRO LEAP : le Défi du {date} en {time}. Mon fantôme t’attend — tu me bats ?', de: '⚔️ Ich fordere dich in ASTRO LEAP heraus: die Tages-Herausforderung vom {date} in {time}. Mein Geist wartet — schlägst du mich?', ja: '⚔️ ASTRO LEAPで勝負！{date}のデイリーチャレンジ、記録は{time}。ゴーストが待ってるよ — 勝てる？', zh: '⚔️ 我在 ASTRO LEAP 向你发起挑战：{date} 的每日挑战，用时 {time}。我的幽灵在等你 — 敢来吗？' },

    // ---- Ayuda ----
    'help.move.t': { es: 'Moverte', en: 'Move', it: 'Movimento', fr: 'Se déplacer', de: 'Bewegen', ja: '移動', zh: '移动' },
    'help.move.d': { es: '← → para andar · ESPACIO salta — y la segunda pulsación en el aire es la habilidad del piloto (doble salto, vuelo, impulso...)', en: '← → to walk · SPACE jumps — and a second press in the air is your pilot’s ability (double jump, flight, dash...)', it: '← → per camminare · SPAZIO salta — e la seconda pressione in aria è l’abilità del pilota (doppio salto, volo, scatto...)', fr: '← → pour marcher · ESPACE saute — et une seconde pression en l’air déclenche l’aptitude du pilote (double saut, vol, ruée...)', de: '← → zum Laufen · LEERTASTE springt — ein zweiter Tastendruck in der Luft löst die Pilotenfähigkeit aus (Doppelsprung, Flug, Dash...)', ja: '← →で移動・スペースでジャンプ — 空中でもう一度押すとパイロットの能力（二段ジャンプ・飛行・ダッシュなど）', zh: '← → 移动 · 空格跳跃 — 空中再按一次触发飞行员能力（二段跳、飞行、冲刺……）' },
    'help.combat.t': { es: 'Combate', en: 'Combat', it: 'Combattimento', fr: 'Combat', de: 'Kampf', ja: '戦闘', zh: '战斗' },
    'help.combat.d': { es: '↑↓ + ESPACIO, o las teclas 1-4. Mantén pulsado ESPACIO (o el dedo en pantalla) para acelerar los turnos', en: '↑↓ + SPACE, or keys 1-4. Hold SPACE (or your finger on the screen) to fast-forward turns', it: '↑↓ + SPAZIO, o i tasti 1-4. Tieni premuto SPAZIO (o il dito sullo schermo) per accelerare i turni', fr: '↑↓ + ESPACE, ou les touches 1-4. Maintiens ESPACE (ou le doigt sur l’écran) pour accélérer les tours', de: '↑↓ + LEERTASTE oder die Tasten 1-4. Halte die LEERTASTE gedrückt (oder den Finger auf dem Bildschirm), um die Züge zu beschleunigen', ja: '↑↓＋スペース、または1〜4キー。スペース（または画面）を長押しでターンを早送り', zh: '↑↓ + 空格，或按 1-4 键。长按空格（或按住屏幕）可加速回合' },
    'help.pad.t': { es: 'Mando', en: 'Gamepad', it: 'Controller', fr: 'Manette', de: 'Controller', ja: 'コントローラー', zh: '手柄' },
    'help.pad.d': { es: 'A salta y confirma (mantenlo: propulsor / turnos rápidos) · B atrás · X hangar · Y mejoras', en: 'A jumps and confirms (hold it: thruster / fast turns) · B back · X hangar · Y upgrades', it: 'A salta e conferma (tienilo premuto: propulsore / turni rapidi) · B indietro · X hangar · Y potenziamenti', fr: 'A saute et confirme (maintiens : propulseur / tours rapides) · B retour · X hangar · Y améliorations', de: 'A springt und bestätigt (halten: Schub / schnelle Züge) · B zurück · X Hangar · Y Upgrades', ja: 'Aでジャンプ／決定（長押し：スラスター／ターン早送り）・Bで戻る・Xで格納庫・Yで強化', zh: 'A 跳跃/确认（长按：推进器/快速回合）· B 返回 · X 机库 · Y 强化' },
    'help.pilots.t': { es: 'Pilotos', en: 'Pilots', it: 'Piloti', fr: 'Pilotes', de: 'Piloten', ja: 'パイロット', zh: '飞行员' },
    'help.pilots.d': { es: 'Kes dobla el salto, Bolt vuela, Shade da un impulso lateral, Scrap rompe refuerzos. Se desbloquean derrotando al jefe de cada mundo; cámbialos desde la chapa del mapa o con la tecla C', en: 'Kes double-jumps, Bolt flies, Shade dashes sideways, Scrap breaks reinforced blocks. Unlock them by beating each world’s boss; switch from the map badge or with the C key', it: 'Kes ha il doppio salto, Bolt vola, Shade scatta di lato, Scrap rompe i blocchi rinforzati. Si sbloccano battendo il boss di ogni mondo; cambiali dal badge della mappa o col tasto C', fr: 'Kes a le double saut, Bolt vole, Shade fait une ruée latérale, Scrap brise les blocs renforcés. Débloque-les en battant le boss de chaque monde ; change de pilote depuis le badge de la carte ou avec la touche C', de: 'Kes springt doppelt, Bolt fliegt, Shade dasht seitwärts, Scrap zerbricht verstärkte Blöcke. Freischalten durch Besiegen der Weltbosse; wechseln über das Abzeichen auf der Karte oder Taste C', ja: 'Kesは二段ジャンプ、Boltは飛行、Shadeは横ダッシュ、Scrapは強化ブロック破壊。各ワールドのボスを倒すと解放。マップのバッジかCキーで交代', zh: 'Kes 二段跳、Bolt 飞行、Shade 横向冲刺、Scrap 可击碎加固平台。击败各世界首领解锁；通过地图上的徽章或按 C 键切换' },
    'help.skills.t': { es: 'Mejoras', en: 'Upgrades', it: 'Potenziamenti', fr: 'Améliorations', de: 'Upgrades', ja: '強化', zh: '强化' },
    'help.skills.d': { es: 'Cada subida de nivel da 1 punto para el árbol de mejoras (chapa MEJORAS del mapa, o tecla T)', en: 'Each level-up grants 1 point for the upgrade tree (UPGRADES badge on the map, or the T key)', it: 'Ogni passaggio di livello dà 1 punto per l’albero dei potenziamenti (badge POTENZIAMENTI sulla mappa, o tasto T)', fr: 'Chaque montée de niveau donne 1 point pour l’arbre d’améliorations (badge AMÉLIORATIONS sur la carte, ou touche T)', de: 'Jeder Stufenaufstieg gibt 1 Punkt für den Upgrade-Baum (UPGRADES-Abzeichen auf der Karte oder Taste T)', ja: 'レベルアップごとに強化ツリーのポイントを1獲得（マップの強化バッジ、またはTキー）', zh: '每次升级获得 1 点强化树点数（地图上的强化徽章，或按 T 键）' },
    'help.pause.t': { es: 'Pausa', en: 'Pause', it: 'Pausa', fr: 'Pause', de: 'Pause', ja: 'ポーズ', zh: '暂停' },
    'help.pause.d': { es: 'ESC o el botón ✕ dentro de un nivel — reanudar, reiniciar o salir (el reloj sigue corriendo)', en: 'ESC or the ✕ button inside a level — resume, restart or exit (the clock keeps running)', it: 'ESC o il pulsante ✕ dentro un livello — riprendi, ricomincia o esci (il cronometro continua)', fr: 'ÉCHAP ou le bouton ✕ dans un niveau — reprendre, recommencer ou quitter (le chrono continue)', de: 'ESC oder der ✕-Button im Level — fortsetzen, neu starten oder verlassen (die Uhr läuft weiter)', ja: 'レベル内でESCか✕ボタン — 再開・リスタート・退出（タイマーは止まらない）', zh: '关卡内按 ESC 或 ✕ 按钮 — 继续、重来或退出（计时不会暂停）' },
    'help.access.t': { es: 'Accesibilidad', en: 'Accessibility', it: 'Accessibilità', fr: 'Accessibilité', de: 'Barrierefreiheit', ja: 'アクセシビリティ', zh: '辅助功能' },
    'help.access.d': { es: 'El tercer botón de la esquina (junto a música/sonido) reduce el temblor de pantalla y los parpadeos', en: 'The third corner button (next to music/sound) reduces screen shake and flashing', it: 'Il terzo pulsante nell’angolo (accanto a musica/suoni) riduce lo scuotimento dello schermo e i lampeggi', fr: 'Le troisième bouton du coin (à côté de musique/son) réduit les secousses d’écran et les clignotements', de: 'Der dritte Button in der Ecke (neben Musik/Sound) reduziert Bildschirmwackeln und Blinken', ja: '隅の3つ目のボタン（音楽／効果音の隣）で画面の揺れと点滅を軽減', zh: '角落第三个按钮（音乐/音效旁）可减少屏幕震动和闪烁' },

    // ---- Pausa ----
    'pause.title': { es: 'PAUSA', en: 'PAUSED', it: 'PAUSA', fr: 'PAUSE', de: 'PAUSE', ja: 'ポーズ', zh: '暂停' },
    'pause.resume': { es: 'REANUDAR', en: 'RESUME', it: 'RIPRENDI', fr: 'REPRENDRE', de: 'FORTSETZEN', ja: 'つづける', zh: '继续' },
    'pause.restart': { es: 'REINICIAR NIVEL', en: 'RESTART LEVEL', it: 'RICOMINCIA LIVELLO', fr: 'RECOMMENCER LE NIVEAU', de: 'LEVEL NEU STARTEN', ja: 'レベルをやり直す', zh: '重玩本关' },
    'pause.exit': { es: 'SALIR DEL NIVEL', en: 'EXIT LEVEL', it: 'ESCI DAL LIVELLO', fr: 'QUITTER LE NIVEAU', de: 'LEVEL VERLASSEN', ja: 'レベルを出る', zh: '退出本关' },
    'pause.quit': { es: 'SALIR DEL JUEGO', en: 'QUIT GAME', it: 'ESCI DAL GIOCO', fr: 'QUITTER LE JEU', de: 'SPIEL BEENDEN', ja: 'ゲームを終了', zh: '退出游戏' },
    'pause.footer': { es: '↑ ↓ elegir · {confirm} confirmar · {back} reanudar', en: '↑ ↓ choose · {confirm} confirm · {back} resume', it: '↑ ↓ scegli · {confirm} conferma · {back} riprendi', fr: '↑ ↓ choisir · {confirm} confirmer · {back} reprendre', de: '↑ ↓ wählen · {confirm} bestätigen · {back} fortsetzen', ja: '↑↓ 選択・{confirm} 決定・{back} 再開', zh: '↑ ↓ 选择 · {confirm} 确认 · {back} 继续' },

    // ---- Botones flotantes ----
    'btn.exit': { es: '✕ Salir', en: '✕ Exit', it: '✕ Esci', fr: '✕ Quitter', de: '✕ Beenden', ja: '✕ 退出', zh: '✕ 退出' },
    'btn.menu': { es: '✕ Menú', en: '✕ Menu', it: '✕ Menu', fr: '✕ Menu', de: '✕ Menü', ja: '✕ メニュー', zh: '✕ 菜单' },
    'btn.jump': { es: 'SALTO', en: 'JUMP', it: 'SALTO', fr: 'SAUT', de: 'SPRUNG', ja: 'ジャンプ', zh: '跳跃' },
    'btn.enter': { es: 'ENTRAR', en: 'ENTER', it: 'ENTRA', fr: 'ENTRER', de: 'BETRETEN', ja: '入る', zh: '进入' },

    // ---- Mapa estelar ----
    'map.title': { es: 'MAPA ESTELAR', en: 'STAR MAP', it: 'MAPPA STELLARE', fr: 'CARTE STELLAIRE', de: 'STERNENKARTE', ja: 'スターマップ', zh: '星图' },
    'map.nav': { es: '← →: Navegar', en: '← →: Navigate', it: '← →: Naviga', fr: '← → : Naviguer', de: '← →: Navigieren', ja: '← →：移動', zh: '← →：选择' },
    'map.enter': { es: '{key}: Entrar', en: '{key}: Enter', it: '{key}: Entra', fr: '{key} : Entrer', de: '{key}: Betreten', ja: '{key}：入る', zh: '{key}：进入' },
    'map.levelLabel': { es: 'Nivel {n}: {name}', en: 'Level {n}: {name}', it: 'Livello {n}: {name}', fr: 'Niveau {n} : {name}', de: 'Level {n}: {name}', ja: 'レベル{n}：{name}', zh: '第 {n} 关：{name}' },
    'map.upgrades': { es: 'MEJORAS', en: 'UPGRADES', it: 'POTENZIAMENTI', fr: 'AMÉLIORATIONS', de: 'UPGRADES', ja: '強化', zh: '强化' },
    'map.signal': { es: '◆ Señal: {n}/{total}', en: '◆ Signal: {n}/{total}', it: '◆ Segnale: {n}/{total}', fr: '◆ Signal : {n}/{total}', de: '◆ Signal: {n}/{total}', ja: '◆ シグナル：{n}/{total}', zh: '◆ 信号：{n}/{total}' },

    // ---- Hangar ----
    'hangar.title': { es: 'HANGAR DE PILOTOS', en: 'PILOT HANGAR', it: 'HANGAR DEI PILOTI', fr: 'HANGAR DES PILOTES', de: 'PILOTENHANGAR', ja: 'パイロット格納庫', zh: '飞行员机库' },
    'hangar.sub': { es: 'Elige quién pilota', en: 'Choose who flies', it: 'Scegli chi pilota', fr: 'Choisis qui pilote', de: 'Wähle, wer fliegt', ja: '操縦するパイロットを選ぼう', zh: '选择你的飞行员' },
    'hangar.current': { es: 'ACTUAL', en: 'CURRENT', it: 'ATTUALE', fr: 'ACTUEL', de: 'AKTUELL', ja: '選択中', zh: '当前' },
    'hangar.lockedNote': { es: 'Todavía no lo has desbloqueado.', en: 'You haven’t unlocked this one yet.', it: 'Non l’hai ancora sbloccato.', fr: 'Tu ne l’as pas encore débloqué.', de: 'Noch nicht freigeschaltet.', ja: 'まだ解放されていません。', zh: '尚未解锁。' },
    'hangar.footer': { es: '← → elegir · {confirm} confirmar · {back} salir', en: '← → choose · {confirm} confirm · {back} exit', it: '← → scegli · {confirm} conferma · {back} esci', fr: '← → choisir · {confirm} confirmer · {back} quitter', de: '← → wählen · {confirm} bestätigen · {back} zurück', ja: '← → 選択・{confirm} 決定・{back} 戻る', zh: '← → 选择 · {confirm} 确认 · {back} 退出' },
    'unlock.title': { es: '¡NUEVO PILOTO DESBLOQUEADO!', en: 'NEW PILOT UNLOCKED!', it: 'NUOVO PILOTA SBLOCCATO!', fr: 'NOUVEAU PILOTE DÉBLOQUÉ !', de: 'NEUER PILOT FREIGESCHALTET!', ja: '新パイロット解放！', zh: '解锁新飞行员！' },

    // ---- Árbol de mejoras ----
    'tree.title': { es: 'ÁRBOL DE MEJORAS', en: 'UPGRADE TREE', it: 'ALBERO DEI POTENZIAMENTI', fr: 'ARBRE D’AMÉLIORATIONS', de: 'UPGRADE-BAUM', ja: '強化ツリー', zh: '强化树' },
    'tree.pts': { es: 'Puntos disponibles: {n}', en: 'Points available: {n}', it: 'Punti disponibili: {n}', fr: 'Points disponibles : {n}', de: 'Verfügbare Punkte: {n}', ja: '使用可能ポイント：{n}', zh: '可用点数：{n}' },
    'tree.nopts': { es: 'Sin puntos — sube de nivel para ganar más', en: 'No points — level up to earn more', it: 'Niente punti — sali di livello per guadagnarne altri', fr: 'Aucun point — monte de niveau pour en gagner', de: 'Keine Punkte — steig eine Stufe auf, um mehr zu verdienen', ja: 'ポイントなし — レベルアップで獲得', zh: '没有点数 — 升级可获得更多' },
    'tree.unlocked': { es: '✓ desbloqueada', en: '✓ unlocked', it: '✓ sbloccato', fr: '✓ débloquée', de: '✓ freigeschaltet', ja: '✓ 解放済み', zh: '✓ 已解锁' },
    'tree.cost1': { es: '1 punto', en: '1 point', it: '1 punto', fr: '1 point', de: '1 Punkt', ja: '1ポイント', zh: '1 点' },
    'tree.nopoints': { es: 'sin puntos', en: 'no points', it: 'niente punti', fr: 'aucun point', de: 'keine Punkte', ja: 'ポイント不足', zh: '点数不足' },
    'tree.prereq': { es: 'requiere la anterior', en: 'requires the previous one', it: 'richiede il precedente', fr: 'nécessite la précédente', de: 'benötigt das vorherige', ja: '前の強化が必要', zh: '需要前置强化' },
    'tree.footer': { es: '← → ↑ ↓ elegir · {confirm} desbloquear · {back} salir', en: '← → ↑ ↓ choose · {confirm} unlock · {back} exit', it: '← → ↑ ↓ scegli · {confirm} sblocca · {back} esci', fr: '← → ↑ ↓ choisir · {confirm} débloquer · {back} quitter', de: '← → ↑ ↓ wählen · {confirm} freischalten · {back} zurück', ja: '← → ↑ ↓ 選択・{confirm} 解放・{back} 戻る', zh: '← → ↑ ↓ 选择 · {confirm} 解锁 · {back} 退出' },
    'tree.badgePts': { es: '{n} pts ▸', en: '{n} pts ▸', it: '{n} pt ▸', fr: '{n} pts ▸', de: '{n} Pkt. ▸', ja: '{n}pt ▸', zh: '{n} 点 ▸' },
    'skillbranch.combate': { es: 'COMBATE', en: 'COMBAT', it: 'COMBATTIMENTO', fr: 'COMBAT', de: 'KAMPF', ja: '戦闘', zh: '战斗' },
    'skillbranch.energia': { es: 'ENERGÍA', en: 'ENERGY', it: 'ENERGIA', fr: 'ÉNERGIE', de: 'ENERGIE', ja: 'エナジー', zh: '能量' },
    'skillbranch.supervivencia': { es: 'SUPERVIVENCIA', en: 'SURVIVAL', it: 'SOPRAVVIVENZA', fr: 'SURVIE', de: 'ÜBERLEBEN', ja: 'サバイバル', zh: '生存' },
    'skill.crit.name': { es: 'Punto débil', en: 'Weak Spot', it: 'Punto debole', fr: 'Point faible', de: 'Schwachstelle', ja: 'ウィークポイント', zh: '弱点打击' },
    'skill.crit.desc': { es: 'Atacar tiene un 25% de probabilidad de crítico: daño ×1.5.', en: 'Attack has a 25% chance to crit: ×1.5 damage.', it: 'Attaccare ha il 25% di probabilità di critico: danno ×1,5.', fr: 'Attaquer a 25 % de chances de critique : dégâts ×1,5.', de: 'Angriff hat 25 % Krit-Chance: ×1,5 Schaden.', ja: '攻撃が25%でクリティカル：ダメージ×1.5。', zh: '攻击有 25% 几率暴击：伤害 ×1.5。' },
    'skill.guardia.name': { es: 'Guardia férrea', en: 'Iron Guard', it: 'Guardia ferrea', fr: 'Garde de fer', de: 'Eiserne Verteidigung', ja: 'アイアンガード', zh: '钢铁防御' },
    'skill.guardia.desc': { es: 'Defender reduce el golpe al 35% en vez de al 50%.', en: 'Defend reduces the hit to 35% instead of 50%.', it: 'Difendere riduce il colpo al 35% invece che al 50%.', fr: 'Défendre réduit le coup à 35 % au lieu de 50 %.', de: 'Verteidigen reduziert den Schaden auf 35 % statt 50 %.', ja: 'ぼうぎょのダメージ軽減が50%→35%に。', zh: '防御将伤害降至 35%（原为 50%）。' },
    'skill.ejecutor.name': { es: 'Ejecutor', en: 'Executioner', it: 'Esecutore', fr: 'Exécuteur', de: 'Vollstrecker', ja: 'エクセキューショナー', zh: '处决者' },
    'skill.ejecutor.desc': { es: 'La Habilidad de tu piloto hace daño ×2 en vez de ×1.5.', en: 'Your pilot’s Skill deals ×2 damage instead of ×1.5.', it: 'L’Abilità del tuo pilota infligge danno ×2 invece di ×1,5.', fr: 'L’Aptitude de ton pilote inflige ×2 dégâts au lieu de ×1,5.', de: 'Die Fähigkeit deines Piloten macht ×2 statt ×1,5 Schaden.', ja: 'パイロットのスキルのダメージが×1.5→×2に。', zh: '飞行员技能伤害 ×2（原为 ×1.5）。' },
    'skill.reciclador.name': { es: 'Reciclador', en: 'Recycler', it: 'Riciclatore', fr: 'Recycleur', de: 'Recycler', ja: 'リサイクラー', zh: '回收者' },
    'skill.reciclador.desc': { es: 'Cada enemigo derrotado da +3 de Energía en vez de +2.', en: 'Each defeated enemy grants +3 Energy instead of +2.', it: 'Ogni nemico sconfitto dà +3 Energia invece di +2.', fr: 'Chaque ennemi vaincu donne +3 Énergie au lieu de +2.', de: 'Jeder besiegte Gegner gibt +3 Energie statt +2.', ja: '敵を倒すと得るエナジーが+2→+3に。', zh: '击败敌人获得 +3 能量（原为 +2）。' },
    'skill.eficiente.name': { es: 'Habilidad eficiente', en: 'Efficient Skill', it: 'Abilità efficiente', fr: 'Aptitude efficace', de: 'Effiziente Fähigkeit', ja: '省エネスキル', zh: '高效技能' },
    'skill.eficiente.desc': { es: 'La Habilidad en combate cuesta 2 de Energía en vez de 3.', en: 'Your combat Skill costs 2 Energy instead of 3.', it: 'L’Abilità in combattimento costa 2 Energia invece di 3.', fr: 'L’Aptitude en combat coûte 2 Énergie au lieu de 3.', de: 'Die Kampf-Fähigkeit kostet 2 Energie statt 3.', ja: '戦闘スキルの消費エナジーが3→2に。', zh: '战斗技能消耗 2 能量（原为 3）。' },
    'skill.nucleo.name': { es: 'Núcleo amplio', en: 'Expanded Core', it: 'Nucleo ampliato', fr: 'Cœur étendu', de: 'Erweiterter Kern', ja: 'コア拡張', zh: '核心扩容' },
    'skill.nucleo.desc': { es: '+4 de Energía máxima, al instante y para siempre.', en: '+4 max Energy, instantly and forever.', it: '+4 Energia massima, subito e per sempre.', fr: '+4 Énergie max, immédiatement et pour toujours.', de: '+4 maximale Energie, sofort und dauerhaft.', ja: '最大エナジー+4。即時かつ永続。', zh: '最大能量 +4，立即永久生效。' },
    'skill.blindaje.name': { es: 'Blindaje', en: 'Plating', it: 'Corazza', fr: 'Blindage', de: 'Panzerung', ja: 'アーマー', zh: '装甲' },
    'skill.blindaje.desc': { es: '+6 de HP máximo, al instante y para siempre.', en: '+6 max HP, instantly and forever.', it: '+6 HP massimi, subito e per sempre.', fr: '+6 PV max, immédiatement et pour toujours.', de: '+6 maximale HP, sofort und dauerhaft.', ja: '最大HP+6。即時かつ永続。', zh: '最大生命 +6，立即永久生效。' },
    'skill.aislante.name': { es: 'Aislante', en: 'Insulation', it: 'Isolante', fr: 'Isolant', de: 'Isolierung', ja: 'インシュレーター', zh: '绝缘层' },
    'skill.aislante.desc': { es: 'Los peligros del terreno (puertas, tormenta, muro) hacen la mitad de daño.', en: 'Terrain hazards (gates, storm, wall) deal half damage.', it: 'I pericoli del terreno (porte, tempesta, muro) infliggono metà danno.', fr: 'Les dangers du terrain (portes, tempête, mur) infligent moitié moins de dégâts.', de: 'Umgebungsgefahren (Tore, Sturm, Mauer) verursachen nur halben Schaden.', ja: '地形ダメージ（ゲート・嵐・壁）が半減。', zh: '地形危险（能量门、风暴、追击墙）造成的伤害减半。' },
    'skill.emergencia.name': { es: 'Sistema de emergencia', en: 'Emergency System', it: 'Sistema d’emergenza', fr: 'Système d’urgence', de: 'Notfallsystem', ja: '緊急システム', zh: '应急系统' },
    'skill.emergencia.desc': { es: 'Una vez por nivel, un golpe letal te deja a 1 HP en vez de matarte.', en: 'Once per level, a lethal hit leaves you at 1 HP instead of killing you.', it: 'Una volta per livello, un colpo letale ti lascia a 1 HP invece di ucciderti.', fr: 'Une fois par niveau, un coup fatal te laisse à 1 PV au lieu de te tuer.', de: 'Einmal pro Level lässt dich ein tödlicher Treffer mit 1 HP zurück, statt dich zu töten.', ja: 'レベルごとに1回、致死ダメージを受けてもHP1で生存。', zh: '每关一次，致命一击会让你保留 1 点生命。' },

    // ---- Pilotos (los nombres propios no se traducen) ----
    'hero.kes.ability': { es: 'Doble salto', en: 'Double jump', it: 'Doppio salto', fr: 'Double saut', de: 'Doppelsprung', ja: '二段ジャンプ', zh: '二段跳' },
    'hero.kes.combat': { es: 'Sobrecarga', en: 'Overcharge', it: 'Sovraccarico', fr: 'Surcharge', de: 'Überladung', ja: 'オーバーチャージ', zh: '过载' },
    'hero.kes.desc': { es: 'Un segundo impulso en el aire para ganar altura extra. Cuesta 1 de Energía.', en: 'A second boost in mid-air for extra height. Costs 1 Energy.', it: 'Una seconda spinta a mezz’aria per guadagnare quota. Costa 1 Energia.', fr: 'Une seconde impulsion en l’air pour gagner de la hauteur. Coûte 1 Énergie.', de: 'Ein zweiter Schub in der Luft für extra Höhe. Kostet 1 Energie.', ja: '空中でもう一度跳んで高度を稼ぐ。エナジー1消費。', zh: '空中二次起跳获得额外高度。消耗 1 能量。' },
    'hero.bolt.ability': { es: 'Vuelo breve', en: 'Brief flight', it: 'Volo breve', fr: 'Vol bref', de: 'Kurzflug', ja: '短時間飛行', zh: '短暂飞行' },
    'hero.bolt.combat': { es: 'Pulso EMP', en: 'EMP Pulse', it: 'Impulso EMP', fr: 'Impulsion EMP', de: 'EMP-Impuls', ja: 'EMPパルス', zh: 'EMP脉冲' },
    'hero.bolt.desc': { es: 'Mantén pulsado el salto en el aire para ascender despacio mientras te dure la Energía.', en: 'Hold jump in mid-air to rise slowly while your Energy lasts.', it: 'Tieni premuto il salto a mezz’aria per salire lentamente finché dura l’Energia.', fr: 'Maintiens le saut en l’air pour monter lentement tant qu’il te reste de l’Énergie.', de: 'Halte Sprung in der Luft gedrückt, um langsam zu steigen, solange die Energie reicht.', ja: '空中でジャンプ長押し：エナジーが続く限りゆっくり上昇。', zh: '空中长按跳跃键缓慢上升，直到能量耗尽。' },
    'hero.shade.ability': { es: 'Impulso lateral', en: 'Side dash', it: 'Scatto laterale', fr: 'Ruée latérale', de: 'Seiten-Dash', ja: '横ダッシュ', zh: '横向冲刺' },
    'hero.shade.combat': { es: 'Zarpazo', en: 'Claw Strike', it: 'Zampata', fr: 'Coup de griffe', de: 'Prankenhieb', ja: 'クロー・ストライク', zh: '利爪突袭' },
    'hero.shade.desc': { es: 'Pulsa salto una vez en el aire para lanzarte hacia delante y cruzar huecos anchos.', en: 'Press jump once in mid-air to lunge forward and clear wide gaps.', it: 'Premi salto una volta a mezz’aria per lanciarti in avanti e superare vuoti ampi.', fr: 'Appuie une fois sur saut en l’air pour foncer en avant et franchir de larges trous.', de: 'Drücke Sprung einmal in der Luft, um nach vorn zu schnellen und breite Lücken zu überqueren.', ja: '空中でジャンプを1回押すと前方に突進、広い谷を越えられる。', zh: '空中按一次跳跃向前冲刺，跨越宽阔沟壑。' },
    'hero.scrap.ability': { es: 'Rompe refuerzos', en: 'Breaks reinforced', it: 'Spacca-rinforzi', fr: 'Brise-renforts', de: 'Blockbrecher', ja: '強化ブロック破壊', zh: '破坏加固' },
    'hero.scrap.combat': { es: 'Puño Cibernético', en: 'Cyber Fist', it: 'Pugno Cibernetico', fr: 'Poing Cybernétique', de: 'Cyberfaust', ja: 'サイバーフィスト', zh: '赛博铁拳' },
    'hero.scrap.desc': { es: 'Sin salto extra, pero camina sobre plataformas de franjas ámbar para romperlas y colarse.', en: 'No extra jump, but walk on amber-striped platforms to break through them.', it: 'Nessun salto extra, ma cammina sulle piattaforme a strisce ambra per sfondarle.', fr: 'Pas de saut en plus, mais marche sur les plateformes à rayures ambre pour les briser et passer au travers.', de: 'Kein Extrasprung, aber lauf über bernsteingestreifte Plattformen, um sie zu durchbrechen.', ja: '追加ジャンプはないが、琥珀色の縞の足場の上を歩くと破壊して通れる。', zh: '没有额外跳跃，但走上琥珀色条纹平台可将其踩碎，落入下方。' },

    // ---- Combate ----
    'cbt.title': { es: 'DUELO DE ENERGÍA', en: 'ENERGY DUEL', it: 'DUELLO DI ENERGIA', fr: 'DUEL D’ÉNERGIE', de: 'ENERGIEDUELL', ja: 'エナジーデュエル', zh: '能量对决' },
    'cbt.you': { es: 'TÚ', en: 'YOU', it: 'TU', fr: 'TOI', de: 'DU', ja: 'あなた', zh: '你' },
    'cbt.turn': { es: 'Tu turno. Elige acción:', en: 'Your turn. Choose an action:', it: 'Tocca a te. Scegli un’azione:', fr: 'À toi. Choisis une action :', de: 'Du bist dran. Wähle eine Aktion:', ja: 'あなたのターン。行動を選択：', zh: '你的回合。选择行动：' },
    'cbt.attack': { es: 'ATACAR', en: 'ATTACK', it: 'ATTACCA', fr: 'ATTAQUER', de: 'ANGREIFEN', ja: 'こうげき', zh: '攻击' },
    'cbt.defend': { es: 'DEFENDER', en: 'DEFEND', it: 'DIFENDI', fr: 'DÉFENDRE', de: 'VERTEIDIGEN', ja: 'ぼうぎょ', zh: '防御' },
    'cbt.flee': { es: 'HUIR', en: 'FLEE', it: 'FUGGI', fr: 'FUIR', de: 'FLIEHEN', ja: 'にげる', zh: '逃跑' },
    'cbt.crit': { es: '¡CRÍTICO! Daño: {n}', en: 'CRITICAL! Damage: {n}', it: 'CRITICO! Danno: {n}', fr: 'CRITIQUE ! Dégâts : {n}', de: 'KRITISCH! Schaden: {n}', ja: 'クリティカル！ダメージ：{n}', zh: '暴击！伤害：{n}' },
    'cbt.shot': { es: 'Disparaste! Daño: {n}', en: 'You fired! Damage: {n}', it: 'Hai sparato! Danno: {n}', fr: 'Tu as tiré ! Dégâts : {n}', de: 'Getroffen! Schaden: {n}', ja: 'ショットを放った！ダメージ：{n}', zh: '你开火了！伤害：{n}' },
    'cbt.skillhit': { es: '¡{name}! Daño: {n}', en: '{name}! Damage: {n}', it: '{name}! Danno: {n}', fr: '{name} ! Dégâts : {n}', de: '{name}! Schaden: {n}', ja: '{name}！ダメージ：{n}', zh: '{name}！伤害：{n}' },
    'cbt.noenergy': { es: 'Energía insuficiente!', en: 'Not enough Energy!', it: 'Energia insufficiente!', fr: 'Énergie insuffisante !', de: 'Nicht genug Energie!', ja: 'エナジーが足りない！', zh: '能量不足！' },
    'cbt.shields': { es: 'Escudos arriba...', en: 'Shields up...', it: 'Scudi alzati...', fr: 'Boucliers levés...', de: 'Schilde hoch...', ja: 'シールド展開…', zh: '护盾开启……' },
    'cbt.escaped': { es: 'Escapaste!', en: 'You escaped!', it: 'Sei fuggito!', fr: 'Tu prends la fuite !', de: 'Entkommen!', ja: 'にげきれた！', zh: '成功逃脱！' },
    'cbt.noescape': { es: 'No pudiste escapar!', en: 'You couldn’t escape!', it: 'Non sei riuscito a fuggire!', fr: 'Impossible de fuir !', de: 'Flucht fehlgeschlagen!', ja: 'にげられなかった！', zh: '逃跑失败！' },
    'cbt.strikes': { es: '¡{name} ataca! Daño: {n}', en: '{name} attacks! Damage: {n}', it: '{name} attacca! Danno: {n}', fr: '{name} attaque ! Dégâts : {n}', de: '{name} greift an! Schaden: {n}', ja: '{name}の攻撃！ダメージ：{n}', zh: '{name}发动攻击！伤害：{n}' },
    'cbt.charges': { es: '{name} carga una descarga...', en: '{name} is charging a blast...', it: '{name} sta caricando una scarica...', fr: '{name} prépare une décharge...', de: '{name} lädt einen Energiestoß auf...', ja: '{name}は力をためている…', zh: '{name}正在蓄力……' },
    'cbt.heals': { es: '{name} se regenera... +{n} HP', en: '{name} regenerates... +{n} HP', it: '{name} si rigenera... +{n} HP', fr: '{name} se régénère... +{n} PV', de: '{name} regeneriert sich... +{n} HP', ja: '{name}は再生している… HP+{n}', zh: '{name}正在再生…… +{n} 生命' },
    'cbt.discharge': { es: '¡Descarga corrupta!', en: 'Corrupted discharge!', it: 'Scarica corrotta!', fr: 'Décharge corrompue !', de: 'Korrumpierte Entladung!', ja: '汚染された放電！', zh: '腐化放电！' },
    'cbt.overlordIgnore': { es: 'El Overlord ignora tus defensas!', en: 'The Overlord ignores your defenses!', it: 'L’Overlord ignora le tue difese!', fr: 'L’Overlord ignore tes défenses !', de: 'Der Overlord ignoriert deine Verteidigung!', ja: 'オーバーロードは防御を無視した！', zh: '霸主无视了你的防御！' },
    'cbt.netIgnore': { es: 'La Red ignora tus defensas!', en: 'The Network ignores your defenses!', it: 'La Rete ignora le tue difese!', fr: 'Le Réseau ignore tes défenses !', de: 'Das Netz ignoriert deine Verteidigung!', ja: 'ネットワークは防御を無視した！', zh: '网络无视了你的防御！' },
    'cbt.netOvercharge': { es: '¡Sobrecarga de la Red!', en: 'Network overcharge!', it: 'Sovraccarico della Rete!', fr: 'Surcharge du Réseau !', de: 'Überladung des Netzes!', ja: 'ネットワークのオーバーチャージ！', zh: '网络过载！' },
    'cbt.destab': { es: '¡El núcleo se desestabiliza!', en: 'The core is destabilizing!', it: 'Il nucleo si destabilizza!', fr: 'Le cœur se déstabilise !', de: 'Der Kern destabilisiert sich!', ja: 'コアが不安定化している！', zh: '核心正在失控！' },
    'cbt.fastfwd': { es: '≫ mantén pulsado para acelerar', en: '≫ hold to fast-forward', it: '≫ tieni premuto per accelerare', fr: '≫ maintiens pour accélérer', de: '≫ halten zum Beschleunigen', ja: '≫ 長押しで早送り', zh: '≫ 长按加速' },
    'cbt.boss': { es: 'JEFE', en: 'BOSS', it: 'BOSS', fr: 'BOSS', de: 'BOSS', ja: 'ボス', zh: '首领' },
    'cbt.base': { es: 'BASE', en: 'BASE', it: 'BASE', fr: 'BASE', de: 'BASIS', ja: '基地', zh: '基地' },
    'hud.duelghost': { es: '{name} · en duelo', en: '{name} · in a duel', it: '{name} · in duello', fr: '{name} · en duel', de: '{name} · im Duell', ja: '{name}・デュエル中', zh: '{name} · 对决中' },

    // ---- Enemigos ----
    'enemy.drone': { es: 'Dron', en: 'Drone', it: 'Drone', fr: 'Drone', de: 'Drohne', ja: 'ドローン', zh: '无人机' },
    'enemy.crawler': { es: 'Reptante', en: 'Crawler', it: 'Strisciante', fr: 'Rampant', de: 'Kriecher', ja: 'クローラー', zh: '爬行者' },
    'enemy.spiker': { es: 'Erizo de Púas', en: 'Spike Urchin', it: 'Riccio Spinato', fr: 'Hérisson à Piques', de: 'Stacheligel', ja: 'トゲウニ', zh: '尖刺刺猬' },
    'enemy.hoverbot': { es: 'Hoverbot', en: 'Hoverbot', it: 'Hoverbot', fr: 'Hoverbot', de: 'Hoverbot', ja: 'ホバーボット', zh: '悬浮机器人' },
    'enemy.magnetite': { es: 'Magnetita', en: 'Magnetite', it: 'Magnetite', fr: 'Magnétite', de: 'Magnetit', ja: 'マグネタイト', zh: '磁石怪' },
    'enemy.ionwisp': { es: 'Espectro Iónico', en: 'Ion Wisp', it: 'Spettro Ionico', fr: 'Spectre Ionique', de: 'Ionenschemen', ja: 'イオンウィスプ', zh: '离子鬼火' },
    'enemy.queen_larva': { es: 'Reina Larva', en: 'Larva Queen', it: 'Regina Larva', fr: 'Reine Larve', de: 'Larvenkönigin', ja: 'ラーバクイーン', zh: '幼虫女王' },
    'enemy.sentinel': { es: 'Centinela', en: 'Sentinel', it: 'Sentinella', fr: 'Sentinelle', de: 'Wächter', ja: 'センチネル', zh: '哨兵' },
    'enemy.overlord': { es: 'Overlord', en: 'Overlord', it: 'Overlord', fr: 'Overlord', de: 'Overlord', ja: 'オーバーロード', zh: '霸主' },
    'enemy.nodo_cero': { es: 'Nodo Cero', en: 'Node Zero', it: 'Nodo Zero', fr: 'Nœud Zéro', de: 'Knoten Null', ja: 'ノード・ゼロ', zh: '零号节点' },

    // ---- Avisos contextuales ----
    'hint.scrap-reinforced': { es: 'Camina sobre los bloques con franjas de peligro (ámbar) para romperlos con Scrap y revelar lo que esconden.', en: 'Walk over the hazard-striped (amber) blocks to break them with Scrap and reveal what they hide.', it: 'Cammina sui blocchi con strisce di pericolo (ambra) per romperli con Scrap e scoprire cosa nascondono.', fr: 'Marche sur les blocs à rayures de danger (ambre) pour les briser avec Scrap et révéler ce qu’ils cachent.', de: 'Lauf über die Blöcke mit bernsteinfarbenen Warnstreifen, um sie mit Scrap zu zerbrechen und zu enthüllen, was sie verbergen.', ja: 'Scrapで危険縞（琥珀色）のブロックの上を歩くと踏み砕けて、隠されたものが現れる。', zh: '用 Scrap 走过带琥珀色警示条纹的平台可将其击碎，看看下面藏着什么。' },
    'hint.skill-point': { es: 'Has ganado un punto de mejora: gástalo en el ÁRBOL DE MEJORAS — chapa MEJORAS del mapa estelar, o pulsa {key}.', en: 'You earned an upgrade point: spend it in the UPGRADE TREE — the UPGRADES badge on the star map, or press {key}.', it: 'Hai guadagnato un punto potenziamento: spendilo nell’ALBERO DEI POTENZIAMENTI — badge POTENZIAMENTI sulla mappa stellare, o premi {key}.', fr: 'Tu as gagné un point d’amélioration : dépense-le dans l’ARBRE D’AMÉLIORATIONS — badge AMÉLIORATIONS sur la carte stellaire, ou appuie sur {key}.', de: 'Du hast einen Upgrade-Punkt verdient: Gib ihn im UPGRADE-BAUM aus — das UPGRADES-Abzeichen auf der Sternenkarte, oder drücke {key}.', ja: '強化ポイントを獲得！スターマップの強化バッジ、または{key}キーで強化ツリーへ。', zh: '获得强化点数：在强化树中使用 — 星图上的强化徽章，或按 {key} 键。' },
    'hint.roof-bonk': { es: 'Ese techo es macizo: no se atraviesa saltando desde abajo. Rodéalo — busca por dónde quiere el nivel que subas.', en: 'That ceiling is solid: you can’t jump through it from below. Go around — find where the level wants you to climb.', it: 'Quel soffitto è massiccio: non si attraversa saltando da sotto. Aggiralo — trova da dove il livello vuole farti salire.', fr: 'Ce plafond est massif : on ne le traverse pas en sautant par en dessous. Contourne-le — cherche par où le niveau veut te faire monter.', de: 'Diese Decke ist massiv: Von unten springst du nicht hindurch. Geh außen herum — such den Weg, den das Level für dich vorsieht.', ja: 'その天井は硬く、下からジャンプしても抜けられない。回り道して、登るルートを探そう。', zh: '这个天花板是实心的：无法从下方跳穿。绕过去 — 找找关卡设计的上行路线。' },
    'hint.spiker-prick': { es: 'Las púas del Erizo no se pisan: pinchan y quitan vida. Para vencerlo, éntrale por un lado y gana el duelo.', en: 'The Urchin’s spikes can’t be stomped: they prick and cost you HP. To beat it, approach from the side and win the duel.', it: 'Le spine del Riccio non si calpestano: pungono e ti tolgono HP. Per batterlo, avvicinati di lato e vinci il duello.', fr: 'Les piques du Hérisson ne s’écrasent pas : elles piquent et coûtent des PV. Pour le vaincre, aborde-le de côté et gagne le duel.', de: 'Auf die Stacheln des Igels springst du besser nicht: Sie stechen und kosten HP. Besieg ihn, indem du von der Seite kommst und das Duell gewinnst.', ja: 'トゲウニは踏めない。刺さってHPが減る。倒すには横から接触してデュエルで勝とう。', zh: '刺猬的尖刺不能踩：会被刺伤扣血。要打败它，从侧面接触并赢下对决。' },
    'hint.magnet-repel': { es: 'El campo de la Magnetita se descarga al pisarla: te repele en diagonal. El empujón se corrige pulsando la dirección contraria.', en: 'The Magnetite’s field discharges when stomped: it repels you diagonally. Counter the push by pressing the opposite direction.', it: 'Il campo della Magnetite si scarica quando la calpesti: ti respinge in diagonale. Correggi la spinta premendo la direzione opposta.', fr: 'Le champ de la Magnétite se décharge quand tu l’écrases : il te repousse en diagonale. Corrige la poussée en appuyant dans la direction opposée.', de: 'Das Feld des Magnetits entlädt sich, wenn du darauf landest: Es stößt dich diagonal weg. Gleiche den Schub aus, indem du in die Gegenrichtung drückst.', ja: 'マグネタイトを踏むと磁場が放電し、斜めに弾き飛ばされる。逆方向を押して立て直そう。', zh: '踩踏磁石怪时磁场会放电：将你斜向弹开。按相反方向可以修正被弹的轨迹。' },
    'hint.ice-slide': { es: 'El hielo resbala: mantén la dirección para coger carrerilla y saltar más lejos — y cuidado al frenar.', en: 'Ice is slippery: hold a direction to build momentum and jump farther — and careful when braking.', it: 'Il ghiaccio è scivoloso: tieni premuta la direzione per prendere slancio e saltare più lontano — e attento quando freni.', fr: 'La glace glisse : maintiens la direction pour prendre de l’élan et sauter plus loin — et prudence au freinage.', de: 'Eis ist rutschig: Halte die Richtung gedrückt, um Anlauf zu nehmen und weiter zu springen — und Vorsicht beim Bremsen.', ja: '氷の上は滑る。方向キーを押し続けて助走をつければ遠くまで跳べる — 止まるときは注意。', zh: '冰面很滑：按住方向键助跑蓄力，能跳得更远 — 刹车时要小心。' },
    'hint.ion-storm': { es: 'La tormenta va a descargar: ponte a cubierto BAJO una plataforma antes de que caiga, o corre al siguiente refugio.', en: 'The storm is about to strike: take cover UNDER a platform before it hits, or run to the next shelter.', it: 'La tempesta sta per scaricarsi: mettiti al riparo SOTTO una piattaforma prima che colpisca, o corri al prossimo rifugio.', fr: 'La tempête va frapper : mets-toi à l’abri SOUS une plateforme avant l’impact, ou cours au prochain refuge.', de: 'Der Sturm entlädt sich gleich: Geh UNTER einer Plattform in Deckung, bevor er einschlägt, oder renn zum nächsten Unterschlupf.', ja: '嵐が来るぞ。落ちる前に足場の下に隠れるか、次のシェルターへ走ろう。', zh: '风暴即将来袭：趁雷击落下前躲到平台下方，或跑向下一处掩体。' },
    'hint.sentinel-watch': { es: 'El Centinela barre su dominio a ras de suelo: cuando apunte, súbete a una cobertura elevada — un salto no dura lo que la onda.', en: 'The Sentinel sweeps its domain at ground level: when it takes aim, climb onto raised cover — a jump won’t outlast the wave.', it: 'La Sentinella spazza il suo dominio raso terra: quando prende la mira, sali su una copertura rialzata — un salto non dura quanto l’onda.', fr: 'La Sentinelle balaie son domaine au ras du sol : quand elle vise, monte sur un abri surélevé — un saut ne dure pas aussi longtemps que l’onde.', de: 'Der Wächter fegt in Bodenhöhe durch sein Revier: Wenn er zielt, klettere auf eine erhöhte Deckung — ein Sprung überdauert die Welle nicht.', ja: 'センチネルは地面すれすれを薙ぎ払う。狙いを定めたら高い足場へ — ジャンプでは波をかわしきれない。', zh: '哨兵会贴地横扫领地：当它瞄准时，爬上高处掩体 — 跳跃撑不过冲击波。' },

    // ---- HUD y carteles dentro del nivel ----
    'ban.levelup': { es: '¡SUBISTE DE NIVEL!', en: 'LEVEL UP!', it: 'LEVEL UP!', fr: 'NIVEAU SUPÉRIEUR !', de: 'STUFENAUFSTIEG!', ja: 'レベルアップ！', zh: '升级了！' },
    'ban.skillpoint': { es: '+1 punto de mejora (árbol en el mapa · tecla {key})', en: '+1 upgrade point (tree on the map · {key} key)', it: '+1 punto potenziamento (albero sulla mappa · tasto {key})', fr: '+1 point d’amélioration (arbre sur la carte · touche {key})', de: '+1 Upgrade-Punkt (Baum auf der Karte · Taste {key})', ja: '強化ポイント+1（マップのツリー・{key}キー）', zh: '+1 强化点（地图上的强化树 · {key} 键）' },
    'ban.sector': { es: 'SECTOR COMPLETADO', en: 'SECTOR CLEARED', it: 'SETTORE COMPLETATO', fr: 'SECTEUR TERMINÉ', de: 'SEKTOR ABGESCHLOSSEN', ja: 'セクタークリア', zh: '扇区完成' },
    'ban.lifelost': { es: '¡PERDISTE UNA VIDA!', en: 'YOU LOST A LIFE!', it: 'HAI PERSO UNA VITA!', fr: 'TU AS PERDU UNE VIE !', de: 'LEBEN VERLOREN!', ja: 'ライフを失った！', zh: '失去一条命！' },
    'ban.remaining': { es: 'Quedan {n}', en: '{n} left', it: 'Ne restano {n}', fr: 'Il t’en reste {n}', de: 'Noch {n}', ja: 'のこり{n}', zh: '剩余 {n}' },
    'ban.extralife': { es: '¡VIDA EXTRA!', en: 'EXTRA LIFE!', it: 'VITA EXTRA!', fr: 'VIE SUPPLÉMENTAIRE !', de: 'EXTRALEBEN!', ja: '1UP！', zh: '额外生命！' },
    'ban.nowlives': { es: 'Ahora tienes {n}', en: 'You now have {n}', it: 'Ora ne hai {n}', fr: 'Tu en as maintenant {n}', de: 'Du hast jetzt {n}', ja: 'ライフが{n}になった', zh: '现在有 {n} 条命' },
    'ban.extraenergy': { es: '¡ENERGÍA EXTRA!', en: 'EXTRA ENERGY!', it: 'ENERGIA EXTRA!', fr: 'ÉNERGIE SUPPLÉMENTAIRE !', de: 'EXTRAENERGIE!', ja: 'エナジーアップ！', zh: '额外能量！' },
    'ban.maxnow': { es: 'Máximo ahora: {n}', en: 'Max is now: {n}', it: 'Nuovo massimo: {n}', fr: 'Nouveau maximum : {n}', de: 'Maximum jetzt: {n}', ja: '最大値：{n}', zh: '上限提升至 {n}' },
    'ban.crystal': { es: '◆ CRISTAL DE SEÑAL', en: '◆ SIGNAL CRYSTAL', it: '◆ CRISTALLO DI SEGNALE', fr: '◆ CRISTAL DE SIGNAL', de: '◆ SIGNALKRISTALL', ja: '◆ シグナルクリスタル', zh: '◆ 信号水晶' },
    'ban.signal': { es: 'Señal reunida: {n}/{total}', en: 'Signal gathered: {n}/{total}', it: 'Segnale raccolto: {n}/{total}', fr: 'Signal réuni : {n}/{total}', de: 'Signal gesammelt: {n}/{total}', ja: 'シグナル：{n}/{total}', zh: '已收集信号：{n}/{total}' },
    'ban.triangulated': { es: '¡SEÑAL TRIANGULADA!', en: 'SIGNAL TRIANGULATED!', it: 'SEGNALE TRIANGOLATO!', fr: 'SIGNAL TRIANGULÉ !', de: 'SIGNAL TRIANGULIERT!', ja: 'シグナル三角測量完了！', zh: '信号三角定位完成！' },
    'ban.newgate': { es: 'Nueva puerta en el mapa estelar: {name}', en: 'New gate on the star map: {name}', it: 'Nuovo portale sulla mappa stellare: {name}', fr: 'Nouvelle porte sur la carte stellaire : {name}', de: 'Neues Tor auf der Sternenkarte: {name}', ja: 'スターマップに新たなゲート：{name}', zh: '星图上出现新的传送门：{name}' },
    'ban.awake': { es: '¡LA RED DESPIERTA!', en: 'THE NETWORK AWAKENS!', it: 'LA RETE SI RISVEGLIA!', fr: 'LE RÉSEAU S’ÉVEILLE !', de: 'DAS NETZ ERWACHT!', ja: 'ネットワークが目覚めた！', zh: '网络苏醒了！' },
    'ban.run': { es: '¡CORRE!', en: 'RUN!', it: 'CORRI!', fr: 'COURS !', de: 'LAUF!', ja: '走れ！', zh: '快跑！' },
    'ban.collapse': { es: 'EL NÚCLEO VA A COLAPSAR', en: 'THE CORE IS ABOUT TO COLLAPSE', it: 'IL NUCLEO STA PER COLLASSARE', fr: 'LE CŒUR VA S’EFFONDRER', de: 'DER KERN KOLLABIERT GLEICH', ja: 'コアが崩壊する', zh: '核心即将坍塌' },
    'ban.sentaim': { es: '⚠ EL CENTINELA APUNTA', en: '⚠ THE SENTINEL TAKES AIM', it: '⚠ LA SENTINELLA PRENDE LA MIRA', fr: '⚠ LA SENTINELLE VISE', de: '⚠ DER WÄCHTER ZIELT', ja: '⚠ センチネルが狙っている', zh: '⚠ 哨兵正在瞄准' },
    'ban.sweep': { es: '⚡ ONDA DE BARRIDO — A CUBIERTO', en: '⚡ SWEEP WAVE — TAKE COVER', it: '⚡ ONDA RADENTE — AL RIPARO', fr: '⚡ ONDE DE BALAYAGE — À COUVERT', de: '⚡ SCHOCKWELLE — IN DECKUNG', ja: '⚡ 薙ぎ払いの波 — 隠れろ', zh: '⚡ 横扫冲击波 — 快找掩护' },
    'ban.netfall': { es: '¡LA RED SE DERRUMBA!', en: 'THE NETWORK IS COLLAPSING!', it: 'LA RETE STA CROLLANDO!', fr: 'LE RÉSEAU S’EFFONDRE !', de: 'DAS NETZ BRICHT ZUSAMMEN!', ja: 'ネットワークが崩壊していく！', zh: '网络正在崩塌！' },
    'ban.toship': { es: '¡A LA NAVE!', en: 'TO THE SHIP!', it: 'ALLA NAVE!', fr: 'AU VAISSEAU !', de: 'ZUM SCHIFF!', ja: '船へ急げ！', zh: '快回飞船！' },
    'ban.storm': { es: '⚠ TORMENTA INMINENTE', en: '⚠ STORM INCOMING', it: '⚠ TEMPESTA IMMINENTE', fr: '⚠ TEMPÊTE IMMINENTE', de: '⚠ STURM ZIEHT AUF', ja: '⚠ 嵐が来る', zh: '⚠ 风暴将至' },
    'ban.discharge': { es: '⚡ DESCARGA — A CUBIERTO', en: '⚡ DISCHARGE — TAKE COVER', it: '⚡ SCARICA — AL RIPARO', fr: '⚡ DÉCHARGE — À COUVERT', de: '⚡ ENTLADUNG — IN DECKUNG', ja: '⚡ 放電 — 隠れろ', zh: '⚡ 放电 — 快找掩护' },
    'scroll.core': { es: 'NÚCLEO', en: 'CORE', it: 'NUCLEO', fr: 'CŒUR', de: 'KERN', ja: 'コア', zh: '核心' },
    'scroll.lared': { es: 'LA RED', en: 'THE NETWORK', it: 'LA RETE', fr: 'LE RÉSEAU', de: 'DAS NETZ', ja: 'ネットワーク', zh: '网络' },
    'prompt.touch': { es: 'TOCA PARA CONTINUAR', en: 'TAP TO CONTINUE', it: 'TOCCA PER CONTINUARE', fr: 'TOUCHE POUR CONTINUER', de: 'TIPPEN ZUM FORTFAHREN', ja: 'タップしてつづける', zh: '点击继续' },
    'prompt.key': { es: 'PULSA {key} PARA CONTINUAR', en: 'PRESS {key} TO CONTINUE', it: 'PREMI {key} PER CONTINUARE', fr: 'APPUIE SUR {key} POUR CONTINUER', de: '{key} DRÜCKEN ZUM FORTFAHREN', ja: '{key}を押してつづける', zh: '按 {key} 继续' },

    // ---- Dificultades del Reto Diario ----
    'diff.suave': { es: 'Suave', en: 'Gentle', it: 'Leggera', fr: 'Douce', de: 'Locker', ja: 'やさしい', zh: '轻松' },
    'diff.normal': { es: 'Normal', en: 'Normal', it: 'Normale', fr: 'Normale', de: 'Normal', ja: 'ふつう', zh: '普通' },
    'diff.intensa': { es: 'Intensa', en: 'Intense', it: 'Intensa', fr: 'Intense', de: 'Intensiv', ja: 'はげしい', zh: '激烈' },
    'diff.brutal': { es: 'Brutal', en: 'Brutal', it: 'Brutale', fr: 'Brutale', de: 'Brutal', ja: 'ブルータル', zh: '残酷' },

    // ---- Niveles ----
    'level.0': { es: 'Cráter de Amerizaje', en: 'Splashdown Crater', it: 'Cratere dell’Ammaraggio', fr: 'Cratère d’Amerrissage', de: 'Absturzkrater', ja: '不時着クレーター', zh: '迫降陨石坑' },
    'level.1': { es: 'Grietas de Hielo', en: 'Ice Rifts', it: 'Crepacci di Ghiaccio', fr: 'Crevasses de Glace', de: 'Eisspalten', ja: '氷の裂け目', zh: '冰之裂隙' },
    'level.2': { es: 'Nido de la Reina Larva', en: 'Larva Queen’s Nest', it: 'Nido della Regina Larva', fr: 'Nid de la Reine Larve', de: 'Nest der Larvenkönigin', ja: 'ラーバクイーンの巣', zh: '幼虫女王的巢穴' },
    'level.3': { es: 'Chatarral Magnético', en: 'Magnetic Scrapyard', it: 'Sfasciacarrozze Magnetico', fr: 'Casse Magnétique', de: 'Magnetischer Schrottplatz', ja: '磁気スクラップ場', zh: '磁力废料场' },
    'level.4': { es: 'Tormenta de Iones', en: 'Ion Storm', it: 'Tempesta di Ioni', fr: 'Tempête d’Ions', de: 'Ionensturm', ja: 'イオンストーム', zh: '离子风暴' },
    'level.5': { es: 'Núcleo del Centinela', en: 'Sentinel Core', it: 'Nucleo della Sentinella', fr: 'Cœur de la Sentinelle', de: 'Kern des Wächters', ja: 'センチネルコア', zh: '哨兵核心' },
    'level.6': { es: 'Muelle de Carga', en: 'Cargo Dock', it: 'Baia di Carico', fr: 'Quai de Chargement', de: 'Ladedock', ja: '貨物ドック', zh: '货运码头' },
    'level.7': { es: 'Túnel de Escape', en: 'Escape Tunnel', it: 'Tunnel di Fuga', fr: 'Tunnel d’Évasion', de: 'Fluchttunnel', ja: '脱出トンネル', zh: '逃生隧道' },
    'level.8': { es: 'Núcleo del Reactor', en: 'Reactor Core', it: 'Nucleo del Reattore', fr: 'Cœur du Réacteur', de: 'Reaktorkern', ja: 'リアクターコア', zh: '反应堆核心' },
    'level.9': { es: 'Bóveda Sellada', en: 'Sealed Vault', it: 'Caveau Sigillato', fr: 'Caveau Scellé', de: 'Versiegelte Kammer', ja: '封印された宝物庫', zh: '密封宝库' },
    'level.10': { es: 'Galería de Ecos', en: 'Echo Gallery', it: 'Galleria degli Echi', fr: 'Galerie des Échos', de: 'Echogalerie', ja: 'エコーギャラリー', zh: '回声长廊' },
    'level.11': { es: 'Nodo Cero', en: 'Node Zero', it: 'Nodo Zero', fr: 'Nœud Zéro', de: 'Knoten Null', ja: 'ノード・ゼロ', zh: '零号节点' },
    'level.12': { es: 'Torre de Vigía', en: 'Watchtower', it: 'Torre di Vedetta', fr: 'Tour de Guet', de: 'Wachturm', ja: '見張りの塔', zh: '瞭望塔' },
    'level.13': { es: 'Aguja Glacial', en: 'Glacial Spire', it: 'Guglia Glaciale', fr: 'Aiguille Glaciaire', de: 'Gletschernadel', ja: '氷河の尖塔', zh: '冰川尖塔' },

    // ---- Finales de partida ----
    'end.victory.title': { es: '¡MISIÓN CUMPLIDA!', en: 'MISSION ACCOMPLISHED!', it: 'MISSIONE COMPIUTA!', fr: 'MISSION ACCOMPLIE !', de: 'MISSION ERFÜLLT!', ja: 'ミッションコンプリート！', zh: '任务完成！' },
    'end.victory.sub': { es: 'Derrotaste a Nodo Cero, reparaste la nave y escapaste del Sistema Ceniza.', en: 'You defeated Node Zero, repaired the ship and escaped the Ash System.', it: 'Hai sconfitto Nodo Zero, riparato la nave e sei fuggito dal Sistema Cenere.', fr: 'Tu as vaincu Nœud Zéro, réparé le vaisseau et fui le Système Cendre.', de: 'Du hast Knoten Null besiegt, das Schiff repariert und bist dem Aschesystem entkommen.', ja: 'ノード・ゼロを倒し、船を修理してアッシュ星系から脱出した。', zh: '你击败了零号节点，修好飞船，逃离了灰烬星系。' },
    'end.victory.result': { es: '{record}Completaste los {n} sectores en {time}', en: '{record}You cleared all {n} sectors in {time}', it: '{record}Hai completato i {n} settori in {time}', fr: '{record}Tu as terminé les {n} secteurs en {time}', de: '{record}Du hast alle {n} Sektoren in {time} geschafft', ja: '{record}全{n}セクターを{time}でクリア', zh: '{record}你用 {time} 通关了全部 {n} 个扇区' },
    'end.newRecord': { es: '¡Nuevo récord! ', en: 'New record! ', it: 'Nuovo record! ', fr: 'Nouveau record ! ', de: 'Neuer Rekord! ', ja: '新記録！', zh: '新纪录！' },
    'end.victory.share1': { es: '🏆 ¡MISIÓN CUMPLIDA! ASTRO LEAP completado 🚀', en: '🏆 MISSION ACCOMPLISHED! ASTRO LEAP completed 🚀', it: '🏆 MISSIONE COMPIUTA! ASTRO LEAP completato 🚀', fr: '🏆 MISSION ACCOMPLIE ! ASTRO LEAP terminé 🚀', de: '🏆 MISSION ERFÜLLT! ASTRO LEAP durchgespielt 🚀', ja: '🏆 ミッションコンプリート！ASTRO LEAP 全クリア 🚀', zh: '🏆 任务完成！通关 ASTRO LEAP 🚀' },
    'end.victory.share2': { es: '🛰️ Nodo Cero derrotado, nave reparada: escapé del Sistema Ceniza', en: '🛰️ Node Zero defeated, ship repaired: I escaped the Ash System', it: '🛰️ Nodo Zero sconfitto, nave riparata: sono fuggito dal Sistema Cenere', fr: '🛰️ Nœud Zéro vaincu, vaisseau réparé : j’ai fui le Système Cendre', de: '🛰️ Knoten Null besiegt, Schiff repariert: dem Aschesystem entkommen', ja: '🛰️ ノード・ゼロを撃破、船を修理してアッシュ星系から脱出', zh: '🛰️ 击败零号节点，修好飞船，逃离灰烬星系' },
    'end.victory.share3': { es: '⏱️ Los {n} sectores en {time}{record}', en: '⏱️ All {n} sectors in {time}{record}', it: '⏱️ I {n} settori in {time}{record}', fr: '⏱️ Les {n} secteurs en {time}{record}', de: '⏱️ Alle {n} Sektoren in {time}{record}', ja: '⏱️ 全{n}セクターを{time}でクリア{record}', zh: '⏱️ 全部 {n} 个扇区用时 {time}{record}' },
    'end.victory.shareRecord': { es: ' — ¡nuevo récord personal!', en: ' — new personal best!', it: ' — nuovo record personale!', fr: ' — nouveau record personnel !', de: ' — neue persönliche Bestzeit!', ja: ' — 自己ベスト更新！', zh: ' — 个人新纪录！' },
    'end.gameover.title': { es: 'GAME OVER', en: 'GAME OVER', it: 'GAME OVER', fr: 'GAME OVER', de: 'GAME OVER', ja: 'ゲームオーバー', zh: '游戏结束' },
    'end.gameover.sub': { es: 'Sin vidas restantes — vuelves a empezar.', en: 'No lives left — you start over.', it: 'Niente più vite — si ricomincia.', fr: 'Plus de vies — tu recommences.', de: 'Keine Leben mehr — du fängst von vorn an.', ja: 'ライフがなくなった — 最初からやり直し。', zh: '生命耗尽 — 从头再来。' },
    'end.gameover.reach': { es: 'Llegaste hasta {place}', en: 'You made it to {place}', it: 'Sei arrivato fino al {place}', fr: 'Tu as atteint {place}', de: 'Du kamst bis {place}', ja: '{place}まで到達', zh: '你抵达了{place}' },
    'end.gameover.time': { es: 'Tiempo: {time}', en: 'Time: {time}', it: 'Tempo: {time}', fr: 'Temps : {time}', de: 'Zeit: {time}', ja: 'タイム：{time}', zh: '用时：{time}' },
    'end.sector': { es: 'el sector {n}/{total} — {name}', en: 'sector {n}/{total} — {name}', it: 'settore {n}/{total} — {name}', fr: 'le secteur {n}/{total} — {name}', de: 'Sektor {n}/{total} — {name}', ja: 'セクター{n}/{total}「{name}」', zh: '第 {n}/{total} 扇区 — {name}' },
    'end.extra': { es: 'el nivel extra — {name}', en: 'the extra level — {name}', it: 'livello extra — {name}', fr: 'le niveau bonus — {name}', de: 'zum Extralevel — {name}', ja: 'エクストラレベル「{name}」', zh: '额外关卡 — {name}' },
    'end.sectorShare': { es: 'el sector {n}/{total} ({name})', en: 'sector {n}/{total} ({name})', it: 'settore {n}/{total} ({name})', fr: 'le secteur {n}/{total} ({name})', de: 'Sektor {n}/{total} ({name})', ja: 'セクター{n}/{total}（{name}）', zh: '第 {n}/{total} 扇区（{name}）' },
    'end.extraShare': { es: 'el nivel extra ({name})', en: 'the extra level ({name})', it: 'livello extra ({name})', fr: 'le niveau bonus ({name})', de: 'Extralevel ({name})', ja: 'エクストラレベル（{name}）', zh: '额外关卡（{name}）' },
    'end.gameover.share1': { es: '☠️ ASTRO LEAP — misión perdida en {place}', en: '☠️ ASTRO LEAP — mission lost at {place}', it: '☠️ ASTRO LEAP — missione persa nel {place}', fr: '☠️ ASTRO LEAP — mission perdue dans {place}', de: '☠️ ASTRO LEAP — Mission gescheitert bei {place}', ja: '☠️ ASTRO LEAP — {place}でミッション失敗', zh: '☠️ ASTRO LEAP — 任务失败于{place}' },
    'end.gameover.share2': { es: '🧑‍🚀 {hero} resistió {time} en el Sistema Ceniza', en: '🧑‍🚀 {hero} lasted {time} in the Ash System', it: '🧑‍🚀 {hero} ha resistito {time} nel Sistema Cenere', fr: '🧑‍🚀 {hero} a tenu {time} dans le Système Cendre', de: '🧑‍🚀 {hero} hielt {time} im Aschesystem durch', ja: '🧑‍🚀 {hero}はアッシュ星系で{time}生き延びた', zh: '🧑‍🚀 {hero} 在灰烬星系坚持了 {time}' },
    'end.gameover.share3': { es: '🎮 ¿Llegas más lejos?', en: '🎮 Can you get further?', it: '🎮 Riesci ad arrivare più lontano?', fr: '🎮 Tu iras plus loin ?', de: '🎮 Kommst du weiter?', ja: '🎮 君はもっと先へ行ける？', zh: '🎮 你能走得更远吗？' },
    'share.button': { es: '↗ Compartir', en: '↗ Share', it: '↗ Condividi', fr: '↗ Partager', de: '↗ Teilen', ja: '↗ シェア', zh: '↗ 分享' },

    // ---- Resultado del Reto Diario ----
    'dr.success': { es: '¡RETO SUPERADO!', en: 'CHALLENGE CLEARED!', it: 'SFIDA SUPERATA!', fr: 'DÉFI RÉUSSI !', de: 'HERAUSFORDERUNG GESCHAFFT!', ja: 'チャレンジクリア！', zh: '挑战成功！' },
    'dr.duelwon': { es: '¡DUELO GANADO!', en: 'DUEL WON!', it: 'DUELLO VINTO!', fr: 'DUEL GAGNÉ !', de: 'DUELL GEWONNEN!', ja: 'デュエル勝利！', zh: '对决获胜！' },
    'dr.duellost': { es: 'DUELO PERDIDO', en: 'DUEL LOST', it: 'DUELLO PERSO', fr: 'DUEL PERDU', de: 'DUELL VERLOREN', ja: 'デュエル敗北', zh: '对决落败' },
    'dr.tie': { es: 'EMPATE EXACTO', en: 'EXACT TIE', it: 'PAREGGIO PERFETTO', fr: 'ÉGALITÉ PARFAITE', de: 'EXAKTES UNENTSCHIEDEN', ja: '完全同着', zh: '完全平局' },
    'dr.failduel': { es: 'DUELO FALLIDO', en: 'DUEL FAILED', it: 'DUELLO FALLITO', fr: 'DUEL ÉCHOUÉ', de: 'DUELL GESCHEITERT', ja: 'デュエル失敗', zh: '对决失败' },
    'dr.fail': { es: 'RETO FALLIDO', en: 'CHALLENGE FAILED', it: 'SFIDA FALLITA', fr: 'DÉFI ÉCHOUÉ', de: 'HERAUSFORDERUNG GESCHEITERT', ja: 'チャレンジ失敗', zh: '挑战失败' },
    'dr.failduel.sub': { es: 'Sin vidas — el fantasma sigue esperando: el duelo se puede reintentar desde el menú.', en: 'No lives left — the ghost is still waiting: you can retry the duel from the menu.', it: 'Niente più vite — il fantasma aspetta ancora: puoi ritentare il duello dal menu.', fr: 'Plus de vies — le fantôme attend toujours : tu peux retenter le duel depuis le menu.', de: 'Keine Leben mehr — der Geist wartet noch: Du kannst das Duell im Menü erneut versuchen.', ja: 'ライフ切れ — ゴーストはまだ待っている。メニューからデュエルに再挑戦しよう。', zh: '生命耗尽 — 幽灵仍在等待：可从菜单重新挑战对决。' },
    'dr.fail.sub': { es: 'Sin vidas — el reto de hoy sigue disponible, inténtalo otra vez cuando quieras.', en: 'No lives left — today’s challenge is still available, try again whenever you like.', it: 'Niente più vite — la sfida di oggi è ancora disponibile, riprova quando vuoi.', fr: 'Plus de vies — le défi du jour reste disponible, réessaie quand tu veux.', de: 'Keine Leben mehr — die heutige Herausforderung bleibt verfügbar, versuch’s jederzeit wieder.', ja: 'ライフ切れ — 今日のチャレンジはまだ挑戦可能。いつでもどうぞ。', zh: '生命耗尽 — 今日挑战仍然开放，随时再试。' },
    'dr.sub': { es: 'Reto del {date} — {level} · dificultad {diff} — piloto: {hero}', en: 'Challenge of {date} — {level} · difficulty {diff} — pilot: {hero}', it: 'Sfida del {date} — {level} · difficoltà {diff} — pilota: {hero}', fr: 'Défi du {date} — {level} · difficulté {diff} — pilote : {hero}', de: 'Herausforderung vom {date} — {level} · Schwierigkeit {diff} — Pilot: {hero}', ja: '{date}のチャレンジ — {level}・難易度{diff}・{hero}', zh: '{date} 的挑战 — {level} · 难度 {diff} — 飞行员：{hero}' },
    'dr.time': { es: 'Tiempo: {time}', en: 'Time: {time}', it: 'Tempo: {time}', fr: 'Temps : {time}', de: 'Zeit: {time}', ja: 'タイム：{time}', zh: '用时：{time}' },
    'dr.wonLine': { es: '⚔️ Ganaste a {name} por {s}s (su tiempo: {time})', en: '⚔️ You beat {name} by {s}s (their time: {time})', it: '⚔️ Hai battuto {name} di {s}s (il suo tempo: {time})', fr: '⚔️ Tu as battu {name} de {s}s (son temps : {time})', de: '⚔️ Du hast {name} um {s}s geschlagen (Zeit von {name}: {time})', ja: '⚔️ {name}に{s}秒差で勝利（相手のタイム：{time}）', zh: '⚔️ 你以 {s} 秒优势击败了 {name}（对方用时：{time}）' },
    'dr.lostLine': { es: '⚔️ {name} te ganó por {s}s (su tiempo: {time})', en: '⚔️ {name} beat you by {s}s (their time: {time})', it: '⚔️ {name} ti ha battuto di {s}s (il suo tempo: {time})', fr: '⚔️ {name} t’a battu de {s}s (son temps : {time})', de: '⚔️ {name} hat dich um {s}s geschlagen (Zeit von {name}: {time})', ja: '⚔️ {name}に{s}秒差で敗北（相手のタイム：{time}）', zh: '⚔️ {name} 以 {s} 秒优势击败了你（对方用时：{time}）' },
    'dr.tieLine': { es: '⚔️ Empate al milisegundo con {name}: {time}', en: '⚔️ Tied to the millisecond with {name}: {time}', it: '⚔️ Pareggio al millisecondo con {name}: {time}', fr: '⚔️ Égalité à la milliseconde avec {name} : {time}', de: '⚔️ Auf die Millisekunde gleichauf mit {name}: {time}', ja: '⚔️ {name}とミリ秒まで同着：{time}', zh: '⚔️ 与 {name} 打成毫秒不差的平局：{time}' },
    'dr.shareWon': { es: '⚔️ Duelo ganado a {name} por {s}s', en: '⚔️ Duel won against {name} by {s}s', it: '⚔️ Duello vinto contro {name} di {s}s', fr: '⚔️ Duel gagné contre {name} de {s}s', de: '⚔️ Duell gegen {name} um {s}s gewonnen', ja: '⚔️ {name}とのデュエルに{s}秒差で勝利', zh: '⚔️ 对决击败 {name}，领先 {s} 秒' },
    'dr.shareLost': { es: '⚔️ Duelo perdido contra {name} por {s}s — quiero la revancha', en: '⚔️ Duel lost to {name} by {s}s — I want a rematch', it: '⚔️ Duello perso contro {name} di {s}s — voglio la rivincita', fr: '⚔️ Duel perdu contre {name} de {s}s — je veux ma revanche', de: '⚔️ Duell gegen {name} um {s}s verloren — ich will Revanche', ja: '⚔️ {name}とのデュエルに{s}秒差で敗北 — リベンジしたい', zh: '⚔️ 对决输给 {name} {s} 秒 — 我要复仇' },
    'dr.shareTie': { es: '⚔️ Empate exacto con {name}', en: '⚔️ Exact tie with {name}', it: '⚔️ Pareggio perfetto con {name}', fr: '⚔️ Égalité parfaite avec {name}', de: '⚔️ Exaktes Unentschieden mit {name}', ja: '⚔️ {name}と完全同着', zh: '⚔️ 与 {name} 完全平局' },
    'dr.newbest': { es: '¡Nuevo mejor tiempo de hoy!', en: 'New best time for today!', it: 'Nuovo miglior tempo di oggi!', fr: 'Nouveau meilleur temps du jour !', de: 'Neue Tagesbestzeit!', ja: '本日のベストタイム更新！', zh: '刷新今日最佳成绩！' },
    'dr.best': { es: 'Tu mejor tiempo de hoy: {time}', en: 'Your best time today: {time}', it: 'Il tuo miglior tempo di oggi: {time}', fr: 'Ton meilleur temps du jour : {time}', de: 'Deine Tagesbestzeit: {time}', ja: '本日のベストタイム：{time}', zh: '你今天的最佳成绩：{time}' },
    'dr.share1': { es: '🛰️ ASTRO LEAP — Reto Diario {date}', en: '🛰️ ASTRO LEAP — Daily Challenge {date}', it: '🛰️ ASTRO LEAP — Sfida del giorno {date}', fr: '🛰️ ASTRO LEAP — Défi du jour {date}', de: '🛰️ ASTRO LEAP — Tages-Herausforderung {date}', ja: '🛰️ ASTRO LEAP — デイリーチャレンジ {date}', zh: '🛰️ ASTRO LEAP — 每日挑战 {date}' },
    'dr.share2': { es: '📍 {level} · {emoji} {diff} · 🧑‍🚀 {hero}', en: '📍 {level} · {emoji} {diff} · 🧑‍🚀 {hero}', it: '📍 {level} · {emoji} {diff} · 🧑‍🚀 {hero}', fr: '📍 {level} · {emoji} {diff} · 🧑‍🚀 {hero}', de: '📍 {level} · {emoji} {diff} · 🧑‍🚀 {hero}', ja: '📍 {level}・{emoji} {diff}・🧑‍🚀 {hero}', zh: '📍 {level} · {emoji} {diff} · 🧑‍🚀 {hero}' },
    'dr.share4': { es: '⏱️ {time} — ¿lo superas?', en: '⏱️ {time} — can you beat it?', it: '⏱️ {time} — lo batti?', fr: '⏱️ {time} — tu fais mieux ?', de: '⏱️ {time} — schaffst du’s schneller?', ja: '⏱️ {time} — 超えられる？', zh: '⏱️ {time} — 你能超越吗？' },
    'dr.rematch': { es: '⚔️ Revancha: reta con tu tiempo', en: '⚔️ Rematch: challenge back with your time', it: '⚔️ Rivincita: sfida col tuo tempo', fr: '⚔️ Revanche : renvoie un défi avec ton temps', de: '⚔️ Revanche mit deiner Zeit', ja: '⚔️ リベンジ：自分のタイムで挑戦状を送る', zh: '⚔️ 复仇：用你的成绩发起挑战' },
    'dr.challenge': { es: '⚔️ Retar a un amigo con este tiempo', en: '⚔️ Challenge a friend with this time', it: '⚔️ Sfida un amico con questo tempo', fr: '⚔️ Défie un ami avec ce temps', de: '⚔️ Fordere einen Freund mit dieser Zeit heraus', ja: '⚔️ このタイムで友達に挑戦状を送る', zh: '⚔️ 用这个成绩挑战朋友' }
};

// Nombre de nivel traducido con la clave 'level.N'; si no existe (nivel futuro sin traducir),
// cae al nombre canónico en español de levels.js. LEVELS se resuelve en el MOMENTO de la
// llamada: i18n.js carga antes que levels.js a propósito (es la primera pieza del juego).
function levelName(i) {
    const key = 'level.' + i;
    if (STRINGS[key]) return t(key);
    return (typeof LEVELS !== 'undefined' && LEVELS[i]) ? LEVELS[i].name : '';
}
