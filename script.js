// ==========================================
// ROAD FIGHTER CLASSIC - GAME ENGINE
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Virtual Resolution for consistent scaling across devices
const VIRTUAL_WIDTH = 480;
const VIRTUAL_HEIGHT = 720;

canvas.width = VIRTUAL_WIDTH;
canvas.height = VIRTUAL_HEIGHT;

// Game States
const STATE = {
    START: 'START',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAMEOVER: 'GAMEOVER'
};
let gameState = STATE.START;

// DOM Elements
const startScreen = document.getElementById('startScreen');
const pauseScreen = document.getElementById('pauseScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const hud = document.getElementById('hud');
const touchControls = document.getElementById('touch-controls');

const startBtn = document.getElementById('startBtn');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');
const restartGameBtn = document.getElementById('restartGameBtn');
const pauseBtn = document.getElementById('pauseBtn');
const muteBtn = document.getElementById('muteBtn');

const scoreValElem = document.getElementById('scoreVal');
const distValElem = document.getElementById('distVal');
const speedValElem = document.getElementById('speedVal');
const finalScoreElem = document.getElementById('finalScore');
const finalDistElem = document.getElementById('finalDist');
const bestScoreElem = document.getElementById('bestScore');

const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');

// Audio Context (Web Audio API)
let audioCtx = null;
let isMuted = false;

function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.warn('Web Audio API not supported');
    }
}

function playSound(type) {
    if (isMuted || !audioCtx) return;
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'pass') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'crash') {
        const bufferSize = audioCtx.sampleRate * 0.5;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.linearRampToValueAtTime(50, now + 0.5);

        noise.connect(filter);
        filter.connect(gain);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        noise.start(now);
        noise.stop(now + 0.5);
    } else if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    }
}

// Game Variables (Adjusted speed & gradual acceleration)
let score = 0;
let distance = 0;
let speed = 0;
let maxSpeed = 140; // Max speed reduced to a realistic 140 KM/H
let acceleration = 0.2; // Slower, gradual acceleration rate
let roadScroll = 0;
let highScore = localStorage.getItem('roadFighterHighScore') || 0;

// Road parameters
const roadLeft = 60;
const roadRight = VIRTUAL_WIDTH - 60;
const roadWidth = roadRight - roadLeft;
const numLanes = 4;
const laneWidth = roadWidth / numLanes;

// Player Car
const player = {
    x: roadLeft + laneWidth * 1.5,
    y: VIRTUAL_HEIGHT - 140,
    width: 40,
    height: 75,
    targetLane: 1.5, // 0 to 3
    color: '#ff2222',
    roofColor: '#ffffff',
    steerSpeed: 0.25
};

// Entities
let enemies = [];
let particles = [];
let scenery = [];

// Input States
const input = {
    left: false,
    right: false,
    touchStartX: 0
};

// Initialize Scenery
function initScenery() {
    scenery = [];
    for (let i = 0; i < 15; i++) {
        scenery.push({
            y: Math.random() * VIRTUAL_HEIGHT,
            side: Math.random() > 0.5 ? 'left' : 'right',
            type: Math.random() > 0.5 ? 'tree' : 'rock',
            offset: Math.random() * 30 + 10
        });
    }
}

// Screen Shake variables
let screenShakeTimer = 0;
let screenShakeIntensity = 0;

function triggerShake(duration, intensity) {
    screenShakeTimer = duration;
    screenShakeIntensity = intensity;
}

// Lane Shift Helper for snappy button/tap response
function shiftLane(direction) {
    if (gameState !== STATE.PLAYING) return;
    let currentLane = Math.round(player.targetLane);
    if (direction === 'left') {
        player.targetLane = Math.max(0, currentLane - 1);
    } else if (direction === 'right') {
        player.targetLane = Math.min(numLanes - 1, currentLane + 1);
    }
}

// Event Listeners for Controls
function setupInputs() {
    // Keyboard
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') shiftLane('left');
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') shiftLane('right');
        if (e.key === 'p' || e.key === 'P') togglePause();
    });

    // Touch Buttons pointer events (Instant lane change on tap/click)
    const bindButton = (elem, direction) => {
        elem.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            shiftLane(direction);
            elem.classList.add('pressed');
        });
        elem.addEventListener('pointerup', (e) => {
            e.preventDefault();
            elem.classList.remove('pressed');
        });
        elem.addEventListener('pointercancel', (e) => {
            e.preventDefault();
            elem.classList.remove('pressed');
        });
        elem.addEventListener('pointerleave', (e) => {
            e.preventDefault();
            elem.classList.remove('pressed');
        });
    };

    bindButton(btnLeft, 'left');
    bindButton(btnRight, 'right');

    // Swipe Gestures on Canvas
    canvas.addEventListener('pointerdown', (e) => {
        input.touchStartX = e.clientX;
    });

    canvas.addEventListener('pointerup', (e) => {
        if (gameState !== STATE.PLAYING) return;
        const diff = e.clientX - input.touchStartX;
        if (Math.abs(diff) > 35) {
            if (diff > 0) {
                shiftLane('right');
            } else {
                shiftLane('left');
            }
        }
    });
}

// UI Buttons Actions
startBtn.addEventListener('click', () => {
    initAudio();
    playSound('click');
    startGame();
});

resumeBtn.addEventListener('click', () => {
    playSound('click');
    togglePause();
});

restartBtn.addEventListener('click', () => {
    playSound('click');
    startGame();
});

restartGameBtn.addEventListener('click', () => {
    playSound('click');
    startGame();
});

pauseBtn.addEventListener('click', () => {
    if (gameState === STATE.PLAYING || gameState === STATE.PAUSED) {
        playSound('click');
        togglePause();
    }
});

muteBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
    playSound('click');
});

function togglePause() {
    if (gameState === STATE.PLAYING) {
        gameState = STATE.PAUSED;
        pauseScreen.classList.remove('hidden');
    } else if (gameState === STATE.PAUSED) {
        gameState = STATE.PLAYING;
        pauseScreen.classList.add('hidden');
    }
}

function startGame() {
    score = 0;
    distance = 0;
    speed = 0;
    maxSpeed = 140;
    enemies = [];
    particles = [];
    player.targetLane = 1.5;
    player.x = roadLeft + laneWidth * player.targetLane;
    initScenery();

    startScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    touchControls.classList.remove('hidden');

    gameState = STATE.PLAYING;
}

function gameOver() {
    gameState = STATE.GAMEOVER;
    playSound('crash');
    triggerShake(40, 10);

    if (score > highScore) {
        highScore = Math.floor(score);
        localStorage.setItem('roadFighterHighScore', highScore);
    }

    finalScoreElem.textContent = Math.floor(score);
    finalDistElem.textContent = Math.floor(distance);
    bestScoreElem.textContent = highScore;

    hud.classList.add('hidden');
    touchControls.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
}

// Spawning Enemies
let spawnTimer = 0;
function updateEnemies(dt) {
    spawnTimer += speed * dt;
    if (spawnTimer > 200) {
        spawnTimer = 0;
        const lane = Math.floor(Math.random() * numLanes);
        const enemyX = roadLeft + lane * laneWidth + (laneWidth - player.width) / 2;
        const colors = ['#33ccff', '#ffcc00', '#33ff33', '#cc33ff', '#ff9900'];
        const enemyColor = colors[Math.floor(Math.random() * colors.length)];
        
        enemies.push({
            x: enemyX,
            y: -100,
            width: player.width,
            height: player.height,
            speed: (Math.random() * 1.0 + 1.8) * (speed / 100 + 0.4),
            color: enemyColor,
            passed: false
        });
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        let en = enemies[i];
        en.y += (speed - en.speed) * dt * 2.5;

        // Check if player passed enemy
        if (!en.passed && en.y > player.y + player.height) {
            en.passed = true;
            score += 100;
            playSound('pass');
        }

        // Remove off-screen enemies
        if (en.y > VIRTUAL_HEIGHT + 100) {
            enemies.splice(i, 1);
            continue;
        }

        // Collision Detection
        const margin = 6;
        if (
            player.x + margin < en.x + en.width - margin &&
            player.x + player.width - margin > en.x + margin &&
            player.y + margin < en.y + en.height - margin &&
            player.y + player.height - margin > en.y + margin
        ) {
            createExplosion(player.x + player.width / 2, player.y + player.height / 2);
            gameOver();
        }
    }
}

function createExplosion(x, y) {
    for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speedVal = Math.random() * 6 + 2;
        particles.push({
            x: x,
            y: y,
            vx: Math.cos(angle) * speedVal,
            vy: Math.sin(angle) * speedVal,
            radius: Math.random() * 4 + 2,
            color: Math.random() > 0.5 ? '#ff3333' : '#ffcc00',
            life: 1.0,
            decay: Math.random() * 0.03 + 0.01
        });
    }
}

// Game Update Loop
let lastTime = performance.now();
function gameLoop(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    if (gameState === STATE.PLAYING) {
        // Smoothly slide to target lane
        const targetX = roadLeft + player.targetLane * laneWidth + (laneWidth - player.width) / 2;
        player.x += (targetX - player.x) * 0.3;

        // Gradual Acceleration
        if (speed < maxSpeed) {
            speed += acceleration;
        }

        roadScroll += speed * dt * 2.0;
        distance += speed * dt * 0.05;
        score += speed * dt * 0.1;

        // Very gradual difficulty progression
        maxSpeed = 160 + Math.min(60, Math.floor(score / 3000) * 10);

        updateEnemies(dt);

        // Update particles
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }

        // Update HUD
        scoreValElem.textContent = Math.floor(score);
        distValElem.textContent = Math.floor(distance);
        speedValElem.textContent = Math.floor(speed);
    }

    render();
    requestAnimationFrame(gameLoop);
}

// Rendering Engine
function render() {
    ctx.save();

    // Screen Shake effect
    if (screenShakeTimer > 0) {
        screenShakeTimer--;
        const offsetX = (Math.random() - 0.5) * screenShakeIntensity;
        const offsetY = (Math.random() - 0.5) * screenShakeIntensity;
        ctx.translate(offsetX, offsetY);
    }

    // Clear background (Grass)
    ctx.fillStyle = '#228833';
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    // Draw Road Asphalt
    ctx.fillStyle = '#444444';
    ctx.fillRect(roadLeft, 0, roadWidth, VIRTUAL_HEIGHT);

    // Draw Road Borders (Red & White curbs)
    const curbWidth = 10;
    const stripeHeight = 40;
    const stripeOffset = roadScroll % (stripeHeight * 2);

    for (let y = -stripeHeight + stripeOffset; y < VIRTUAL_HEIGHT; y += stripeHeight) {
        ctx.fillStyle = (Math.floor((y - stripeOffset) / stripeHeight) % 2 === 0) ? '#ffffff' : '#ff2222';
        ctx.fillRect(roadLeft - curbWidth, y, curbWidth, stripeHeight);
        ctx.fillRect(roadRight, y, curbWidth, stripeHeight);
    }

    // Draw Dashed Lane Markings
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([30, 30]);
    ctx.lineDashOffset = -roadScroll;

    for (let i = 1; i < numLanes; i++) {
        let laneX = roadLeft + i * laneWidth;
        ctx.beginPath();
        ctx.moveTo(laneX, 0);
        ctx.lineTo(laneX, VIRTUAL_HEIGHT);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw Scenery (Trees / Rocks)
    scenery.forEach(sc => {
        sc.y += speed * 0.04;
        if (sc.y > VIRTUAL_HEIGHT + 50) {
            sc.y = -50;
            sc.side = Math.random() > 0.5 ? 'left' : 'right';
        }
        let sx = sc.side === 'left' ? roadLeft - sc.offset - 20 : roadRight + sc.offset;
        
        if (sc.type === 'tree') {
            ctx.fillStyle = '#115511';
            ctx.beginPath();
            ctx.arc(sx, sc.y, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#227722';
            ctx.beginPath();
            ctx.arc(sx - 3, sc.y - 3, 12, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = '#777777';
            ctx.fillRect(sx - 10, sc.y - 8, 20, 16);
            ctx.fillStyle = '#999999';
            ctx.fillRect(sx - 6, sc.y - 5, 12, 10);
        }
    });

    // Draw Enemy Cars
    enemies.forEach(en => {
        drawCar(en.x, en.y, en.width, en.height, en.color, '#222');
    });

    // Draw Player Car
    if (gameState === STATE.PLAYING || gameState === STATE.PAUSED) {
        drawCar(player.x, player.y, player.width, player.height, player.color, player.roofColor);
        ctx.fillStyle = 'rgba(255, 255, 200, 0.4)';
        ctx.fillRect(player.x + 4, player.y - 10, 8, 10);
        ctx.fillRect(player.x + player.width - 12, player.y - 10, 8, 10);
    }

    // Draw Particles
    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    ctx.restore();
}

// Retro Car Drawing Helper
function drawCar(x, y, w, h, bodyColor, accentColor) {
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 5, y + 10, 6, 16);
    ctx.fillRect(x + w - 1, y + 10, 6, 16);
    ctx.fillRect(x - 5, y + h - 22, 6, 16);
    ctx.fillRect(x + w - 1, y + h - 22, 6, 16);

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [10, 10, 8, 8]);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = accentColor;
    ctx.fillRect(x + 6, y + 20, w - 12, 22);

    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(x + 4, y, 6, 4);
    ctx.fillRect(x + w - 10, y, 6, 4);
}

// Window Visibility Handler (Auto Pause)
document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === STATE.PLAYING) {
        togglePause();
    }
});

// Initialize on Load
window.addEventListener('load', () => {
    setupInputs();
    requestAnimationFrame(gameLoop);
});