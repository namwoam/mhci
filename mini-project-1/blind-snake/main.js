// =========================
// Tunable settings
// =========================

// Window settings
const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 400; // Removed HUD space
const BACKGROUND_COLOR = "#000000"; 
const MAIN_COLOR = "#FFFFFF";       

// Snake settings
const GRID_SIZE = 20;
const START_DIRECTION_X = 1;
const START_DIRECTION_Y = 0;
const GAME_FRAME_RATE = 10;

// Timing settings
const GAME_OVER_DELAY_MS = 2000;


// =========================
// Game state
// =========================

let gameover = false;
let gameoverAtMillis = -1;

// snakePositions[0] is the head
let snakePositions = []; 

// direction
let snakeDirection = { x: START_DIRECTION_X, y: START_DIRECTION_Y };

// objective (food)
let objPosition = { x: 0, y: 0 };


// =========================
// Audio State & Logic
// =========================

let audioCtx = null;
let soundEnabled = false;

// Audio Nodes
let appleOsc = null;
let appleGain = null;
let applePanner = null;

let windNode = null;
let windGain = null;
let windPanner = null;

let bodyHumNode = null;
let bodyHumGain = null;

// Initialize Audio Context on user interaction
function initAudio() {
    if (audioCtx) return; // Already init
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    soundEnabled = true;

    setupAppleSound();
    setupWindSound();
    setupBodyHumSound();
    
    // Start continuous sounds (muted by default via gain)
    appleOsc.start();
    windNode.start();
    bodyHumNode.start();
}

function setupAppleSound() {
    appleOsc = audioCtx.createOscillator();
    appleOsc.type = 'sine';
    
    appleGain = audioCtx.createGain();
    appleGain.gain.setValueAtTime(0, audioCtx.currentTime);
    
    // Use StereoPanner for Left/Right
    applePanner = audioCtx.createStereoPanner();
    
    appleOsc.connect(appleGain).connect(applePanner).connect(audioCtx.destination);
    
    // Start pulsing loop
    setInterval(pulsingApple, 100);
}

// Create a buffer of noise for wind/static
function createNoiseBuffer() {
    const bufferSize = audioCtx.sampleRate * 2; // 2 seconds
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

function setupWindSound() {
    const noiseBuffer = createNoiseBuffer();
    windNode = audioCtx.createBufferSource();
    windNode.buffer = noiseBuffer;
    windNode.loop = true;
    
    // Filter to make it sound like wind
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    
    windGain = audioCtx.createGain();
    windGain.gain.setValueAtTime(0, audioCtx.currentTime);
    
    windNode.connect(filter).connect(windGain).connect(audioCtx.destination);
}

function setupBodyHumSound() {
    bodyHumNode = audioCtx.createOscillator();
    bodyHumNode.type = 'sawtooth';
    bodyHumNode.frequency.value = 60; // Low frequency hum
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;

    bodyHumGain = audioCtx.createGain();
    bodyHumGain.gain.setValueAtTime(0, audioCtx.currentTime);

    bodyHumNode.connect(filter).connect(bodyHumGain).connect(audioCtx.destination);
}

function playStepSound() {
    if (!audioCtx || !soundEnabled) return;
    
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.05);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

function playEatSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.1);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
    
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

function playCrashSound() {
     if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.3);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

// 1. Apple Feedback
function updateAppleAudio(head) {
    if (!audioCtx || gameover) {
        if (appleGain) appleGain.gain.setValueAtTime(0, audioCtx.currentTime);
        return;
    }
    
    // Panning (Left/Right)
    // Map -200..200 (relative x) to -1..1
    const dx = objPosition.x - head.x;
    const pan = Math.max(-1, Math.min(1, dx / (WINDOW_WIDTH / 2)));
    applePanner.pan.setTargetAtTime(pan, audioCtx.currentTime, 0.1);
    
    // Pitch (Up/Down) - Map Height to Freq (High Y = Low Freq? No, usually High Y = Down = Low Pitch)
    // Low Y (0) = High Pitch
    const dy = objPosition.y - head.y; // Relative Y
    // Absolute Y mapping might be clearer? Let's use relative for "egocentric" feel? 
    // Actually, "Apple is Above" means apple.y < head.y. 
    // Let's map screen position directly to pitch like a map.
    // Top of screen (0) -> 800Hz. Bottom (400) -> 200Hz.
    const pitch = 800 - (objPosition.y / WINDOW_HEIGHT) * 600;
    appleOsc.frequency.setTargetAtTime(pitch, audioCtx.currentTime, 0.1);
}

let lastApplePulse = 0;
function pulsingApple() {
    if (!audioCtx || gameover || snakePositions.length === 0) return;
    
    const head = snakePositions[0];
    // Distance Metric
    const dist = Math.sqrt(Math.pow(head.x - objPosition.x, 2) + Math.pow(head.y - objPosition.y, 2));
    const maxDist = Math.sqrt(WINDOW_WIDTH*WINDOW_WIDTH + WINDOW_HEIGHT*WINDOW_HEIGHT);
    const normalizedDist = dist / maxDist; // 0..1
    
    // Pulse Rate: Closer = Faster. 
    // Delay maps to: 100ms (close) to 1000ms (far)
    const interval = 100 + normalizedDist * 800;
    
    const now = Date.now();
    if (now - lastApplePulse > interval) {
        lastApplePulse = now;
        // Ping
        const time = audioCtx.currentTime;
        appleGain.gain.cancelScheduledValues(time);
        appleGain.gain.setValueAtTime(0.05, time);
        appleGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    }
}

// 2. Wall Warning (Wind)
function updateWallAudio(head) {
    if (!audioCtx || gameover) {
        if (windGain) windGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        return;
    }
    
    // Distance to nearest wall in current direction
    let distToWall = 0;
    if (snakeDirection.x === 1) distToWall = WINDOW_WIDTH - head.x;
    else if (snakeDirection.x === -1) distToWall = head.x;
    else if (snakeDirection.y === 1) distToWall = WINDOW_HEIGHT - head.y;
    else if (snakeDirection.y === -1) distToWall = head.y;
    
    // If closer than 3 grids (60px), fade in wind
    const threshold = GRID_SIZE * 4;
    let volume = 0;
    
    if (distToWall < threshold) {
        volume = 1 - (distToWall / threshold); // 0..1
        volume = volume * 0.15; // Max vol
    }
    
    windGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.1);
}

// 3. Body Warning (Hum)
function updateBodyAudio(head) {
    if (!audioCtx || gameover) {
        if (bodyHumGain) bodyHumGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        return;
    }
    
    // Find closest body part
    let minDist = Infinity;
    for (let i = 1; i < snakePositions.length; i++) {
        const part = snakePositions[i];
        const d = Math.abs(head.x - part.x) + Math.abs(head.y - part.y); // Manhattan distance
        if (d < minDist) minDist = d;
    }
    
    // If very close (adjacent or 1 gap), hum
    // Dist 20 = adjacent. Dist 0 = crash.
    const threshold = GRID_SIZE * 3;
    let volume = 0;
    if (minDist < threshold && minDist > 0) {
        volume = 1 - (minDist / threshold);
        volume = volume * 0.1; 
    }
    
    bodyHumGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.1);
}


// =========================
// Elements
// =========================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const snakePosEl = document.getElementById('snakePos');
const snakeDirEl = document.getElementById('snakeDir');
const applePosEl = document.getElementById('applePos');

const gameOverOverlay = document.getElementById('gameOverOverlay');
const startOverlay = document.getElementById('startOverlay');


// =========================
// Setup & Loop
// =========================

let gameInterval = null;
let isPlaying = false;

function setup() {
    // Show start overlay
    startOverlay.classList.remove('hidden');
    gameOverOverlay.classList.add('hidden');
    
    // Wait for click to start
    startOverlay.addEventListener('click', startGame);
    gameOverOverlay.addEventListener('click', startGame);
}

function startGame() {
    console.log("Start Game Clicked");
    initAudio(); // Initialize audio context on first click
    restoreAudio();

    if (gameInterval) clearInterval(gameInterval);
    
    resetGame();
    isPlaying = true;
    startOverlay.classList.add('hidden');
    gameOverOverlay.classList.add('hidden');
    
    gameInterval = setInterval(draw, 1000 / GAME_FRAME_RATE);
}

function stopGame() {
    isPlaying = false;
    clearInterval(gameInterval);
    stopAllAudio();
}

function stopAllAudio() {
    if(appleGain) appleGain.gain.setValueAtTime(0, audioCtx.currentTime);
    if(windGain) windGain.gain.setValueAtTime(0, audioCtx.currentTime);
    if(bodyHumGain) bodyHumGain.gain.setValueAtTime(0, audioCtx.currentTime);
}

function restoreAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function draw() {
    // Canvas clearing
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);

    if (gameover) {
        // Stop audio
        stopAllAudio();
        
        // Show gameover screen
        gameOverOverlay.classList.remove('hidden');
        
        // Stop Loop
        clearInterval(gameInterval);
        return;
    }

    updateSnake();
    updateHud(); 
    
    drawFood();
    drawSnake();
    
    // Audio Updates
    if (snakePositions.length > 0) {
        const head = snakePositions[0];
        updateAppleAudio(head);
        updateWallAudio(head);
        updateBodyAudio(head);
    }
}


// =========================
// Drawing helpers
// =========================

function updateHud() {
    if (snakePositions.length === 0) return;
    
    const head = snakePositions[0];
    scoreEl.textContent = "Score: " + getScore();
    snakePosEl.textContent = `Snake Position: [${head.x}, ${head.y}]`;
    snakeDirEl.textContent = `Snake Direction: [${snakeDirection.x}, ${snakeDirection.y}]`;
    applePosEl.textContent = `Apple Position: [${objPosition.x}, ${objPosition.y}]`;
}

function drawFood() {
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.strokeStyle = MAIN_COLOR;
    
    ctx.fillRect(objPosition.x, objPosition.y, GRID_SIZE, GRID_SIZE);
    ctx.strokeRect(objPosition.x, objPosition.y, GRID_SIZE, GRID_SIZE);
}

function drawSnake() {
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.strokeStyle = MAIN_COLOR;

    for (let i = 0; i < snakePositions.length; i++) {
        let segment = snakePositions[i];
        ctx.fillRect(segment.x, segment.y, GRID_SIZE, GRID_SIZE);
        ctx.strokeRect(segment.x, segment.y, GRID_SIZE, GRID_SIZE);
    }
}


// =========================
// Update helpers
// =========================

function updateSnake() {
    let newHead = getNextHeadPosition();
    // Replaced wrapping with Wall Collision for Audio Consistency?
    // The original processing code had wrapHeadPosition().
    // If I keep wrapping, the wall wind effect makes less sense (because you teleport).
    // Usually "blind" games use hard walls.
    // BUT, the original code had wrapHeadPosition logic (see Prompt 1 context).
    // Let's keep Wrapping but maybe add a sound when warping?
    // OR better: To make "Wall Wind" useful, walls should be deadly or at least barriers.
    // However, faithfully porting the original code means keeping wrapping.
    // If wrapping is ON, "Wind" suggests approaching a warp point.
    
    const warped = wrapHeadPosition(newHead);
    if (warped) {
       // Maybe play a warp sound?
    }

    if (hitsSelf(newHead)) {
        playCrashSound();
        endGame();
        return;
    }

    let ateFood = overlaps(newHead, objPosition);
    let lastTailBeforeMove = getLastTailCopy();

    moveSnakeBody(newHead);
    playStepSound();

    if (ateFood) {
        playEatSound();
        growSnake(lastTailBeforeMove);
        randomizeObjOnGrid();
    }
}

function getNextHeadPosition() {
    let head = snakePositions[0];
    return {
        x: head.x + snakeDirection.x * GRID_SIZE,
        y: head.y + snakeDirection.y * GRID_SIZE
    };
}

// Modified to return true if warped
function wrapHeadPosition(head) {
    let warped = false;
    if (head.x < 0) {
        head.x = WINDOW_WIDTH - GRID_SIZE;
        warped = true;
    } else if (head.x > WINDOW_WIDTH - GRID_SIZE) {
        head.x = 0;
         warped = true;
    }

    if (head.y < 0) {
        head.y = WINDOW_HEIGHT - GRID_SIZE;
         warped = true;
    } else if (head.y > WINDOW_HEIGHT - GRID_SIZE) {
        head.y = 0;
         warped = true;
    }
    return warped;
}

function moveSnakeBody(newHead) {
    for (let i = snakePositions.length - 1; i >= 1; i--) {
        let current = snakePositions[i];
        let previous = snakePositions[i - 1];
        current.x = previous.x;
        current.y = previous.y;
    }

    let head = snakePositions[0];
    head.x = newHead.x;
    head.y = newHead.y;
}

function growSnake(tailPosition) {
    snakePositions.push(tailPosition);
}

function updateGameOverTimer() {
    // Handled in audio/click logic now
}


// =========================
// Game state helpers
// =========================

function resetGame() {
    gameover = false;
    gameoverAtMillis = -1;

    snakePositions = [];
    snakePositions.push(getCenteredStartPosition());

    snakeDirection = { x: START_DIRECTION_X, y: START_DIRECTION_Y };
    randomizeObjOnGrid();
    
    updateHud();
}

function endGame() {
    gameover = true;
    gameoverAtMillis = Date.now();
    
    // Stop loop immediately so wind sound stops update
    // But draw() handles audio stop
}

function getScore() {
    return snakePositions.length - 1;
}

function getCenteredStartPosition() {
    let centeredX = Math.floor((WINDOW_WIDTH / 2) / GRID_SIZE) * GRID_SIZE;
    let centeredY = Math.floor((WINDOW_HEIGHT / 2) / GRID_SIZE) * GRID_SIZE;
    return { x: centeredX, y: centeredY };
}

function getLastTailCopy() {
    let lastTail = snakePositions[snakePositions.length - 1];
    return { x: lastTail.x, y: lastTail.y };
}

function randomizeObjOnGrid() {
    let cols = Math.floor((WINDOW_WIDTH) / GRID_SIZE);
    let rows = Math.floor((WINDOW_HEIGHT) / GRID_SIZE);

    let rCol = Math.floor(Math.random() * cols);
    let rRow = Math.floor(Math.random() * rows);

    objPosition.x = rCol * GRID_SIZE;
    objPosition.y = rRow * GRID_SIZE;
}

function hitsSelf(head) {
    for (let i = 1; i < snakePositions.length; i++) {
        if (overlaps(head, snakePositions[i])) {
            return true;
        }
    }
    return false;
}

function overlaps(p1, p2) {
    return Math.abs(p1.x - p2.x) < 0.1 && Math.abs(p1.y - p2.y) < 0.1;
}


// =========================
// Input
// =========================

document.addEventListener('keydown', (event) => {
    const key = event.key;
    const code = event.code; 
    
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].indexOf(code) > -1) {
        event.preventDefault();
    }

    if ((key === 'a' || code === 'ArrowLeft') && snakeDirection.x !== 1) {
        snakeDirection = { x: -1, y: 0 };
    } else if ((key === 'd' || code === 'ArrowRight') && snakeDirection.x !== -1) {
        snakeDirection = { x: 1, y: 0 };
    } else if ((key === 's' || code === 'ArrowDown') && snakeDirection.y !== -1) {
        snakeDirection = { x: 0, y: 1 };
    } else if ((key === 'w' || code === 'ArrowUp') && snakeDirection.y !== 1) {
        snakeDirection = { x: 0, y: -1 };
    }
});

// Setup Initial State (Waiting for Click)
setup();
