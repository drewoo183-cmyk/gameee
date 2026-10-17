// --- ИНИЦИАЛИЗАЦИЯ TELEGRAM ---
const tg = window.Telegram?.WebApp;
let telegramUser = "Герой";

if (tg) {
  tg.ready();
  tg.expand();
  if (tg.unlockOrientation) tg.unlockOrientation();
  if (tg.initDataUnsafe?.user?.first_name) {
    telegramUser = tg.initDataUnsafe.user.first_name;
  }
}

const heroNameEl = document.getElementById('hero-name-label');
if (heroNameEl) heroNameEl.innerText = telegramUser;
const combatPlayerEl = document.getElementById('combat-player-name');
if (combatPlayerEl) combatPlayerEl.innerText = telegramUser;

function triggerHaptic(type = 'impact', style = 'medium') {
  if (tg?.HapticFeedback) {
    if (type === 'impact') tg.HapticFeedback.impactOccurred(style);
    else if (type === 'notification') tg.HapticFeedback.notificationOccurred(style);
    else if (type === 'selection') tg.HapticFeedback.selectionChanged();
  } else if (navigator.vibrate) {
    navigator.vibrate(25);
  }
}

// Звуковой движок Web Audio
const Sound = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
  },
  play(type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    if (type === 'roll') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(350 + Math.random()*200, t);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.linearRampToValueAtTime(0.001, t + 0.04);
      osc.start(t); osc.stop(t + 0.04);
    } else if (type === 'hit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.15);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.linearRampToValueAtTime(0.01, t + 0.15);
      osc.start(t); osc.stop(t + 0.15);
    } else if (type === 'crit') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(450, t);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.linearRampToValueAtTime(0.01, t + 0.25);
      osc.start(t); osc.stop(t + 0.25);
    }
  }
};
window.addEventListener('touchstart', () => Sound.init(), { once: true });
window.addEventListener('click', () => Sound.init(), { once: true });

// --- ХОЛСТ МИРА ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const WORLD = { width: 1800, height: 1400 };
const camera = { x: 0, y: 0 };

// ПАРАМЕТРЫ ИГРОКА
const player = {
  x: 200,
  y: 450,
  r: 16,
  speed: 190,
  vx: 0,
  vy: 0,
  faceAngle: 0,
  hp: 100,
  maxHp: 100,
  mp: 100,
  maxMp: 100,
  gold: 0,
  weapon: null,
  skills: [
    { id: 'slash', name: "Удар клинком", baseDmg: 20, manaCost: 0 },
    { id: 'thrust', name: "Точный выпад", baseDmg: 32, manaCost: 25 }
  ]
};

// СУНДУК
const chest = {
  x: 520,
  y: 750,
  w: 32,
  h: 24,
  opened: false,
  item: "Меч Громовержца",
  bonusSkill: { id: 'thunder', name: "Громовой раскол ⚡", baseDmg: 55, manaCost: 45 }
};

// ВРАГИ
const enemies = [
  { id: 1, x: 650, y: 450, r: 18, name: "Разбойник", hp: 65, maxHp: 65, dmg: 14, icon: "🥷" },
  { id: 2, x: 950, y: 450, r: 20, name: "Орк-Страж", hp: 110, maxHp: 110, dmg: 20, icon: "👹" },
  { id: 3, x: 450, y: 1100, r: 18, name: "Болотный Бес", hp: 75, maxHp: 75, dmg: 16, icon: "👺" }
];

// NPC
const npcs = [
  { id: 'doc', x: 280, y: 320, r: 18, name: "Знахарь Лагеря" }
];

// ДОРОГИ
const roads = [
  { x: 80, y: 420, w: 1200, h: 60 },
  { x: 490, y: 480, w: 60, h: 400 },
  { x: 490, y: 880, w: 60, h: 350 }
];

// --- ДЖОЙСТИК ---
const joyBase = document.getElementById('joystick-base');
const joyStick = document.getElementById('joystick-stick');
let joyTouchId = null;
let joyCenter = { x: 0, y: 0 };
const maxJoyDist = 42;

joyBase.addEventListener('touchstart', e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  joyTouchId = t.identifier;
  const rect = joyBase.getBoundingClientRect();
  joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  handleJoyMove(t.clientX, t.clientY);
}, { passive: false });

window.addEventListener('touchmove', e => {
  if (joyTouchId === null) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === joyTouchId) {
      handleJoyMove(t.clientX, t.clientY);
      break;
    }
  }
}, { passive: false });

function resetJoy() {
  joyTouchId = null;
  joyStick.style.transform = `translate3d(0, 0, 0)`;
  player.vx = 0;
  player.vy = 0;
}
window.addEventListener('touchend', resetJoy);
window.addEventListener('touchcancel', resetJoy);

function handleJoyMove(cx, cy) {
  const dx = cx - joyCenter.x;
  const dy = cy - joyCenter.y;
  const dist = Math.hypot(dx, dy);
  const clamped = Math.min(dist, maxJoyDist);
  const angle = Math.atan2(dy, dx);

  joyStick.style.transform = `translate3d(${Math.cos(angle)*clamped}px, ${Math.sin(angle)*clamped}px, 0)`;
  
  if (dist > 5) {
    player.vx = Math.cos(angle);
    player.vy = Math.sin(angle);
    player.faceAngle = angle;
  } else {
    player.vx = 0;
    player.vy = 0;
  }
}

// --- БОЕВАЯ АРЕНА ---
const combatArena = document.getElementById('combat-arena');
const combatDiceBox = document.getElementById('combat-dice-box');
const combatLog = document.getElementById('combat-log');
const combatSkillsGrid = document.getElementById('combat-skills-grid');
const arenaPlayerHp = document.getElementById('arena-player-hp');
const arenaPlayerMp = document.getElementById('arena-player-mp');
const arenaEnemyHp = document.getElementById('arena-enemy-hp');
const arenaEnemyName = document.getElementById('arena-enemy-name');
const arenaEnemyAvatar = document.getElementById('arena-enemy-avatar');

let activeEnemy = null;
let isPlayerTurn = true;
let isRolling = false;

function startCombat(enemy) {
  activeEnemy = enemy;
  isPlayerTurn = true;
  isRolling = false;
  player.vx = 0;
  player.vy = 0;

  arenaEnemyName.innerText = enemy.name;
  arenaEnemyAvatar.innerText = enemy.icon;
  combatLog.innerText = `Бой начался! Выберите умение для атаки.`;
  combatDiceBox.innerText = "--";
  combatDiceBox.style.color = "#f59e0b";

  updateArenaBars();
  renderCombatSkills();
  combatArena.style.display = 'flex';
  triggerHaptic('notification', 'warning');
}

function updateArenaBars() {
  const pPct = Math.max(0, (player.hp / player.maxHp) * 100);
  const mpPct = Math.max(0, (player.mp / player.maxMp) * 100);
  const ePct = Math.max(0, (activeEnemy.hp / activeEnemy.maxHp) * 100);

  arenaPlayerHp.style.width = `${pPct}%`;
  arenaPlayerMp.style.width = `${mpPct}%`;
  arenaEnemyHp.style.width = `${ePct}%`;

  const pPhpText = document.getElementById('arena-player-hp-text');
  if (pPhpText) pPhpText.innerText = `${Math.max(0, Math.round(player.hp))} / ${player.maxHp} HP`;

  const pPmpText = document.getElementById('arena-player-mp-text');
  if (pPmpText) pPmpText.innerText = `${Math.max(0, Math.round(player.mp))} / ${player.maxMp} MP`;

  const eHpText = document.getElementById('arena-enemy-hp-text');
  if (eHpText) eHpText.innerText = `${Math.max(0, Math.round(activeEnemy.hp))} / ${activeEnemy.maxHp} HP`;

  const topHp = document.getElementById('hp-bar-fill');
  if (topHp) topHp.style.width = `${pPct}%`;
  const topMp = document.getElementById('mp-bar-fill');
  if (topMp) topMp.style.width = `${mpPct}%`;
}

function renderCombatSkills() {
  combatSkillsGrid.innerHTML = '';
  player.skills.forEach(skill => {
    const btn = document.createElement('button');
    const canUse = player.mp >= skill.manaCost;
    btn.className = `combat-skill-btn ${canUse ? '' : 'disabled'}`;

    btn.innerHTML = `
      <div class="skill-title">${skill.name}</div>
      <div class="skill-meta">
        Урон: ~${skill.baseDmg} (при 10) | <span>${skill.manaCost > 0 ? skill.manaCost + ' MP' : '0 MP'}</span>
      </div>
    `;

    const clickHandler = (e) => {
      e.preventDefault();
      if (!isPlayerTurn || isRolling || !canUse) return;
      executePlayerSkill(skill);
    };
    btn.addEventListener('touchstart', clickHandler, { passive: false });
    btn.addEventListener('click', clickHandler);
    combatSkillsGrid.appendChild(btn);
  });
}

function executePlayerSkill(skill) {
  isRolling = true;
  player.mp = Math.max(0, player.mp - skill.manaCost);
  updateArenaBars();
  renderCombatSkills();

  combatLog.innerText = `Бросок кубика для «${skill.name}»...`;

  let ticks = 0;
  const timer = setInterval(() => {
    combatDiceBox.innerText = Math.floor(Math.random() * 20) + 1;
    Sound.play('roll');
    triggerHaptic('impact', 'light');
    ticks++;

    if (ticks > 12) {
      clearInterval(timer);
      const roll = Math.floor(Math.random() * 20) + 1;
      combatDiceBox.innerText = roll;

      let multiplier = 1.0;
      let rollDesc = "Обычный урон";

      if (roll === 1) {
        multiplier = 0.2;
        rollDesc = "Крит. промах! Урон минимален";
        combatDiceBox.style.color = "#ef4444";
      } else if (roll <= 9) {
        multiplier = 0.65;
        rollDesc = "Слабый бросок (урон снижен)";
        combatDiceBox.style.color = "#f87171";
      } else if (roll <= 14) {
        multiplier = 1.0;
        rollDesc = "Базовый урон";
        combatDiceBox.style.color = "#f59e0b";
      } else if (roll <= 19) {
        multiplier = 1.4;
        rollDesc = "Сильный удар! (+40%)";
        combatDiceBox.style.color = "#22c55e";
      } else {
        multiplier = 2.0;
        rollDesc = "КРИТИЧЕСКИЙ УДАР! (x2)";
        combatDiceBox.style.color = "#a855f7";
        Sound.play('crit');
      }

      const totalDmg = Math.round(skill.baseDmg * multiplier);
      activeEnemy.hp -= totalDmg;
      updateArenaBars();
      Sound.play('hit');
      triggerHaptic('impact', multiplier >= 1.4 ? 'heavy' : 'medium');
      combatLog.innerText = `Выпало: ${roll} (${rollDesc}). Нанесено: ${totalDmg} урона!`;

      if (activeEnemy.hp <= 0) {
        setTimeout(winCombat, 1200);
      } else {
        isPlayerTurn = false;
        setTimeout(enemyTurn, 1500);
      }
    }
  }, 65);
}

function enemyTurn() {
  combatLog.innerText = `Ход противника: ${activeEnemy.name} атакует!`;
  combatDiceBox.style.color = "#ef4444";

  let ticks = 0;
  const timer = setInterval(() => {
    combatDiceBox.innerText = Math.floor(Math.random() * 20) + 1;
    Sound.play('roll');
    ticks++;
    if (ticks > 10) {
      clearInterval(timer);
      const eRoll = Math.floor(Math.random() * 20) + 1;
      combatDiceBox.innerText = eRoll;
      
      const eMult = eRoll >= 15 ? 1.3 : (eRoll <= 5 ? 0.6 : 1.0);
      const enemyDmg = Math.round(activeEnemy.dmg * eMult);
      
      player.hp -= enemyDmg;
      player.mp = Math.min(player.maxMp, player.mp + 10);

      updateArenaBars();
      Sound.play('hit');
      triggerHaptic('notification', 'error');
      combatLog.innerText = `${activeEnemy.name} выбросил ${eRoll} и нанес ${enemyDmg} урона! (+10 MP)`;

      if (player.hp <= 0) {
        setTimeout(loseCombat, 1200);
      } else {
        isPlayerTurn = true;
        isRolling = false;
        renderCombatSkills();
        setTimeout(() => {
          combatLog.innerText = `Ваш ход! Выберите умение.`;
          combatDiceBox.style.color = "#f59e0b";
        }, 1200);
      }
    }
  }, 65);
}

function winCombat() {
  combatArena.style.display = 'none';
  const idx = enemies.indexOf(activeEnemy);
  if (idx !== -1) enemies.splice(idx, 1);

  player.gold += 25;
  document.getElementById('gold-val').innerText = player.gold;
  triggerHaptic('notification', 'success');
  activeEnemy = null;
}

function loseCombat() {
  combatArena.style.display = 'none';
  player.hp = player.maxHp;
  player.mp = player.maxMp;
  player.x = 200;
  player.y = 450;
  updateArenaBars();
  activeEnemy = null;
  triggerHaptic('notification', 'error');
}

// --- ДИАЛОГИ И СУНДУКИ ---
const actionBtn = document.getElementById('action-btn');
const dialogModal = document.getElementById('dialog-modal');
const dialogName = document.getElementById('dialog-name');
const dialogText = document.getElementById('dialog-text');
const dialogOptions = document.getElementById('dialog-options');

let interactTarget = null;

const onActionClick = (e) => {
  e.preventDefault();
  triggerHaptic('selection');
  if (interactTarget?.type === 'chest') {
    openChest();
  } else if (interactTarget?.type === 'doc') {
    openDocDialog();
  }
};
actionBtn.addEventListener('touchstart', onActionClick, { passive: false });
actionBtn.addEventListener('click', onActionClick);

function openChest() {
  chest.opened = true;
  player.weapon = chest.item;
  player.skills.push(chest.bonusSkill);
  document.getElementById('inv-hud').innerHTML = `Оружие: <span>${player.weapon}</span>`;
  triggerHaptic('notification', 'success');

  dialogName.innerText = "Оружейный Сундук";
  dialogText.innerText = `Вы открыли кованый сундук и достали «${chest.item}»! Открыт 3-й навык: «${chest.bonusSkill.name}» (требует 45 MP).`;
  dialogOptions.innerHTML = `<button class="choice-btn" onclick="closeDialog()">[Взять в руку]</button>`;
  dialogModal.style.display = 'block';
  actionBtn.style.display = 'none';
}

function openDocDialog() {
  dialogName.innerText = "Знахарь Лагеря";
  dialogModal.style.display = 'block';
  actionBtn.style.display = 'none';
  dialogText.innerText = "«Привет, путник. Могу восстановить твоё здоровье и запас маны за 15 монет.»";
  dialogOptions.innerHTML = `
    <button class="choice-btn" onclick="healPlayer()">🌿 Исцелить HP и MP (15 монет)</button>
    <button class="choice-btn" onclick="closeDialog()">[Уйти]</button>
  `;
}

function healPlayer() {
  if (player.gold >= 15 && (player.hp < player.maxHp || player.mp < player.maxMp)) {
    player.gold -= 15;
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    document.getElementById('gold-val').innerText = player.gold;
    updateArenaBars();
    triggerHaptic('notification', 'success');
  }
  closeDialog();
}

function closeDialog() {
  dialogModal.style.display = 'none';
  actionBtn.style.display = 'none';
}

// --- МИНИКАРТА ---
const minimapCanvas = document.getElementById('minimap-canvas');
const mCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

function renderMinimap() {
  if (!mCtx) return;
  const mW = minimapCanvas.width;
  const mH = minimapCanvas.height;
  const scaleX = mW / WORLD.width;
  const scaleY = mH / WORLD.height;

  mCtx.clearRect(0, 0, mW, mH);
  mCtx.fillStyle = "#162b16";
  mCtx.fillRect(0, 0, mW, mH);

  // Дороги
  mCtx.fillStyle = "#5c4f39";
  roads.forEach(r => {
    mCtx.fillRect(r.x * scaleX, r.y * scaleY, r.w * scaleX, r.h * scaleY);
  });

  // Сундук
  if (!chest.opened) {
    mCtx.fillStyle = "#facc15";
    mCtx.fillRect(chest.x * scaleX - 2, chest.y * scaleY - 2, 5, 5);
  }

  // Враги
  mCtx.fillStyle = "#ef4444";
  enemies.forEach(e => {
    mCtx.beginPath();
    mCtx.arc(e.x * scaleX, e.y * scaleY, 2.5, 0, Math.PI * 2);
    mCtx.fill();
  });

  // Игрок
  mCtx.fillStyle = "#38bdf8";
  mCtx.beginPath();
  mCtx.arc(player.x * scaleX, player.y * scaleY, 3.5, 0, Math.PI * 2);
  mCtx.fill();
}

// --- ОСНОВНОЙ ЦИКЛ ОБНОВЛЕНИЯ И ОТРИСОВКИ ---
let lastTime = performance.now();

function update(dt) {
  if (combatArena.style.display === 'flex' || dialogModal.style.display === 'block') {
    return;
  }

  // Движение
  player.x += player.vx * player.speed * dt;
  player.y += player.vy * player.speed * dt;
  player.x = Math.max(30, Math.min(WORLD.width - 30, player.x));
  player.y = Math.max(30, Math.min(WORLD.height - 30, player.y));

  // Столкновение с врагами (старт боя)
  enemies.forEach(e => {
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    if (d < 48) {
      startCombat(e);
    }
  });

  // Камера
  camera.x = Math.max(0, Math.min(WORLD.width - canvas.width, player.x - canvas.width / 2));
  camera.y = Math.max(0, Math.min(WORLD.height - canvas.height, player.y - canvas.height / 2));

  // Взаимодействие
  const dChest = Math.hypot(player.x - (chest.x + 16), player.y - (chest.y + 12));
  const dDoc = Math.hypot(player.x - npcs[0].x, player.y - npcs[0].y);

  if (!chest.opened && dChest < 50) {
    interactTarget = { type: 'chest' };
    actionBtn.innerText = "СУНДУК";
    actionBtn.style.display = 'block';
  } else if (dDoc < 65) {
    interactTarget = { type: 'doc' };
    actionBtn.innerText = "ЛЕКАРЬ";
    actionBtn.style.display = 'block';
  } else {
    interactTarget = null;
    actionBtn.style.display = 'none';
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Трава
  ctx.fillStyle = "#1e391e";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  // Дороги
  ctx.fillStyle = "#6b5d43";
  roads.forEach(r => {
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = "#4e4330";
    ctx.lineWidth = 3;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  });

  // Сундук
  ctx.fillStyle = chest.opened ? "#451a03" : "#b45309";
  ctx.fillRect(chest.x, chest.y, chest.w, chest.h);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(chest.x, chest.y + 7, chest.w, 4);
  if (!chest.opened) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px sans-serif";
    ctx.fillText("ОРУЖИЕ", chest.x + 16, chest.y - 8);
  }

  // Знахарь NPC
  ctx.fillStyle = "#10b981";
  ctx.beginPath(); ctx.arc(npcs[0].x, npcs[0].y, npcs[0].r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center"; ctx.fillText(npcs[0].name, npcs[0].x, npcs[0].y - 24);

  // Враги
  enemies.forEach(e => {
    ctx.fillStyle = "#dc2626";
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(e.icon, e.x, e.y + 5);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText(e.name, e.x, e.y - 24);
  });

  // Игрок
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0,0);
  ctx.lineTo(Math.cos(player.faceAngle)*24, Math.sin(player.faceAngle)*24);
  ctx.stroke();

  ctx.fillStyle = "#2563eb";
  ctx.beginPath(); ctx.arc(0, 0, player.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  ctx.restore();

  // Отрисовка миникарты поверх всего
  renderMinimap();
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

// Запуск игры
resize();
requestAnimationFrame(loop);
