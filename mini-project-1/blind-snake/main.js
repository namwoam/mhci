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
const GAME_FRAME_RATE = 2;

// Timing settings
const GAME_OVER_DELAY_MS = 2000;


// =========================
// Game state
// =========================

let gameover = false;
let gameoverAtMillis = -1;
let hasPlayedTutorial = false;
let isTutorialPlaying = false;

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

// Initialize Audio Context on user interaction
function initAudio() {
    if (audioCtx) return; // Already init
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    soundEnabled = true;

    setupAppleSound();
    setupWindSound();

    // Start continuous sounds (muted by default via gain)
    appleOsc.start();
    windNode.start();
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

function playStepSound() {
    if (!audioCtx || !soundEnabled) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const panner = audioCtx.createStereoPanner();

    osc.type = 'square';

    // Default Mid Freq
    let freq = 440;
    let pan = 0;

    // Directional Logic
    if (snakeDirection.y === -1) { // Up
        freq = 880; // High Pitch
        pan = 0;
    } else if (snakeDirection.y === 1) { // Down
        freq = 220; // Low Pitch
        pan = 0;
    } else if (snakeDirection.x === -1) { // Left
        freq = 440;
        pan = -0.8; // Left
    } else if (snakeDirection.x === 1) { // Right
        freq = 440;
        pan = 0.8; // Right
    }

    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, audioCtx.currentTime + 0.05); // Short decay

    panner.pan.value = pan;

    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

    // Connect: Osc -> Gain -> Panner -> Dest
    osc.connect(gain).connect(panner).connect(audioCtx.destination);

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
    const maxDist = Math.sqrt(WINDOW_WIDTH * WINDOW_WIDTH + WINDOW_HEIGHT * WINDOW_HEIGHT);
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


// =========================
// Elements
// =========================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const snakePosEl = document.getElementById('snakePos');
const snakeDirEl = document.getElementById('snakeDir');
const applePosEl = document.getElementById('applePos');
const voiceStatusEl = document.getElementById('voiceStatus');

const gameOverOverlay = document.getElementById('gameOverOverlay');
const startOverlay = document.getElementById('startOverlay');


// =========================
// Setup & Loop
// =========================
let gameInterval = null;
let isPlaying = false;

let recognition = null;
let speechReady = false;
let speechInstalling = false;
let pendingDirections = [];

function queueDirection(newDir) {
    const lastDir = pendingDirections.length > 0 ? pendingDirections[pendingDirections.length - 1] : snakeDirection;

    // Check if opposite direction (sum of x's is 0 and sum of y's is 0 implies opposite if magnitude is same, 
    // but here we deal with unit vectors or 0.
    // 1 + (-1) = 0.
    // So if x + x = 0 AND y + y = 0, it is 180 turn.
    if ((newDir.x + lastDir.x === 0) && (newDir.y + lastDir.y === 0)) {
        return;
    }

    // Also ignore duplicate consecutive directions?
    // Actually no, pressing "UP" when going "UP" does nothing but it's not a reversal.
    // But if we queue "UP" then "UP", it just keeps going up.
    // To be safe against spamming filling the buffer:
    if (newDir.x === lastDir.x && newDir.y === lastDir.y) {
        return;
    }

    if (pendingDirections.length < 3) {
        pendingDirections.push(newDir);
    }
}

async function setupSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        console.warn("SpeechRecognition is not supported in this browser.");
        if (voiceStatusEl) voiceStatusEl.textContent = "Browser does not support Speech API.";
        if (voiceStatusEl) voiceStatusEl.style.color = "red";
        return false;
    }

    if (voiceStatusEl) voiceStatusEl.textContent = "Initializing Speech...";

    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = "en-US";

    // Prefer on-device recognition when the browser supports it.
    // This must be set before start().
    try {
        if ("processLocally" in recognition) {
            recognition.processLocally = true;
        }
    } catch (e) {
        console.warn("Unable to enable processLocally:", e);
    }

    // Install on-device language pack when supported.
    // MDN recommends checking available() first, then install() if needed.
    try {
        if (typeof SR.available === "function" && typeof SR.install === "function") {
            const availability = await SR.available({
                langs: [recognition.lang],
                processLocally: true,
            });

            if (availability === "available") {
                speechReady = true;
            } else if (availability === "downloadable" || availability === "downloading") {
                speechInstalling = true;
                console.log(`Installing speech pack for ${recognition.lang}...`);

                const installed = await SR.install({
                    langs: [recognition.lang],
                });

                speechInstalling = false;
                speechReady = !!installed;

                if (!speechReady) {
                    console.warn(`Language pack install failed for ${recognition.lang}. Falling back to remote if possible.`);
                    if ("processLocally" in recognition) {
                        recognition.processLocally = false;
                    }
                    speechReady = true;
                }
            } else {
                console.warn(`${recognition.lang} is unavailable for on-device speech. Falling back to remote if possible.`);
                if ("processLocally" in recognition) {
                    recognition.processLocally = false;
                }
                speechReady = true;
            }
        } else {
            // Browser does not expose on-device install APIs.
            // Fall back to normal speech recognition.
            if ("processLocally" in recognition) {
                recognition.processLocally = false;
            }
            speechReady = true;
        }
    } catch (err) {
        console.warn("Speech pack setup failed, falling back to non-local recognition:", err);
        try {
            if ("processLocally" in recognition) {
                recognition.processLocally = false;
            }
        } catch (_) { }
        speechReady = true;
    }

    let lastCommand = "";
    let lastCommandTime = 0;
    const COMMAND_COOLDOWN_MS = 120;

    recognition.onstart = () => {
        console.log("Speech recognition started");
        if (voiceStatusEl) {
            voiceStatusEl.textContent = "Listening...";
            voiceStatusEl.style.color = "#0f0";
        }
    };

    recognition.onend = () => {
        console.log("Speech recognition ended");
        if (voiceStatusEl) {
            voiceStatusEl.textContent = "Standby";
            voiceStatusEl.style.color = "#888";
        }

        if (isPlaying && !gameover && speechReady && !speechInstalling) {
            setTimeout(() => {
                try {
                    recognition.start();
                } catch (e) { }
            }, 0);
        }
    };

    recognition.onresult = (event) => {
        const i = event.resultIndex;
        const result = event.results[i];
        if (!result || !result[0]) return;

        const transcript = result[0].transcript.trim().toLowerCase();

        // Update UI
        if (voiceStatusEl) {
            voiceStatusEl.textContent = `Heard: "${transcript}"`;
            voiceStatusEl.style.color = "#aaf";
        }

        console.log("Recognized:", transcript);

        let command = null;
        if (/\bup\b/.test(transcript)) command = "up";
        else if (/\bdown\b/.test(transcript)) command = "down";
        else if (/\bleft\b/.test(transcript)) command = "left";
        else if (/\bright\b/.test(transcript)) command = "right";

        if (!command) return;

        const now = performance.now();
        if (command === lastCommand && now - lastCommandTime < COMMAND_COOLDOWN_MS) {
            return;
        }

        lastCommand = command;
        lastCommandTime = now;

        // Queue direction for next tick instead of mutating immediately.
        // This feels more stable for Snake.
        if (command === "up") {
            queueDirection({ x: 0, y: -1 });
        } else if (command === "down") {
            queueDirection({ x: 0, y: 1 });
        } else if (command === "left") {
            queueDirection({ x: -1, y: 0 });
        } else if (command === "right") {
            queueDirection({ x: 1, y: 0 });
        }
    };

    recognition.onerror = async (event) => {
        console.error("Speech recognition error:", event.error);
        if (voiceStatusEl) {
            voiceStatusEl.textContent = `Error: ${event.error}`;
            voiceStatusEl.style.color = "#f55";
        }

        // Retry installation path if local recognition says language isn't ready.
        if (event.error === "language-not-supported") {
            try {
                if (typeof SR.available === "function" && typeof SR.install === "function") {
                    const availability = await SR.available({
                        langs: [recognition.lang],
                        processLocally: true,
                    });

                    if (availability === "downloadable" || availability === "downloading") {
                        speechInstalling = true;
                        const installed = await SR.install({ langs: [recognition.lang] });
                        speechInstalling = false;

                        if (installed) {
                            speechReady = true;
                            console.log(`Installed ${recognition.lang} language pack.`);
                            return;
                        }
                    }
                }

                // Fallback if local install isn't possible
                if ("processLocally" in recognition) {
                    recognition.processLocally = false;
                }
                speechReady = true;
            } catch (e) {
                console.warn("Could not recover from language-not-supported:", e);
            }
        }
    };



    return true;
}

async function setup() {
    // Show start overlay
    startOverlay.classList.remove('hidden');
    gameOverOverlay.classList.add('hidden');

    // Begin preparing speech recognition early
    try {
        await setupSpeech();
    } catch (err) {
        console.warn("Speech setup failed:", err);
    }

    // Ensure listeners are not attached multiple times
    startOverlay.onclick = startGame;
    gameOverOverlay.onclick = startGame;
}

function startGame() {
    if (isTutorialPlaying || isPlaying) return;

    console.log("Start Game Clicked");
    initAudio(); // Initialize audio context on first click
    restoreAudio();

    if (!hasPlayedTutorial) {
        hasPlayedTutorial = true;
        isTutorialPlaying = true;
        playTutorial().then(() => {
            isTutorialPlaying = false;
            runGame();
        });
    } else {
        runGame();
    }
}

async function playTutorial() {
    // Ensure game loop is not running
    if (gameInterval) clearInterval(gameInterval);

    // Set up dummy state for sounds
    snakePositions = [{ x: 200, y: 200 }];
    objPosition = { x: 0, y: 0 };
    snakeDirection = { x: 1, y: 0 };
    gameover = true; // Start silenced (stops apple ticking)

    // Helper to wait
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const speak = (text) => new Promise(resolve => {
        // Cancel any pending speech
        window.speechSynthesis.cancel();

        const u = new SpeechSynthesisUtterance(text);
        u.onend = resolve;
        u.onerror = resolve; // Continue on error
        window.speechSynthesis.speak(u);
    });

    console.log("Starting Tutorial");

    // Introduction
    await speak("Welcome to Blind Snake. The game where you rely on your ears.");
    await speak("Control the snake by saying Up, Down, Left, or Right.");

    // Direction Demo
    await speak("Every step makes a sound. The pitch and direction tell you where you are going.");

    // Up - High Pitch
    snakeDirection = { x: 0, y: -1 }; // Up
    await speak("High pitch means Up.");
    playStepSound();
    await wait(600);
    playStepSound();
    await wait(800);

    // Down - Low Pitch
    snakeDirection = { x: 0, y: 1 }; // Down
    await speak("Low pitch means Down.");
    playStepSound();
    await wait(600);
    playStepSound();
    await wait(800);

    // Left - Left Pan
    snakeDirection = { x: -1, y: 0 }; // Left
    await speak("Sound to your left means Left.");
    playStepSound();
    await wait(600);
    playStepSound();
    await wait(800);

    // Right - Right Pan
    snakeDirection = { x: 1, y: 0 }; // Right
    await speak("Sound to your right means Right.");
    playStepSound();
    await wait(600);
    playStepSound();
    await wait(1000);

    // Apple Demo
    gameover = false; // Enable sounds for Apple Demo
    await speak("Your goal is to find the apple. Listen to the ticking sound.");

    // Panning - Left
    snakePositions = [{ x: 200, y: 200 }]; // Center head
    objPosition = { x: 50, y: 200 }; // Apple Left
    updateAppleAudio(snakePositions[0]);
    await speak("If the apple is on the left, you hear it on the left.");
    await wait(2000);

    // Panning - Right
    objPosition = { x: 350, y: 200 }; // Apple Right
    updateAppleAudio(snakePositions[0]);
    await speak("If on the right, you hear it on the right.");
    await wait(2000);

    // Pitch - Up (High Pitch)
    objPosition = { x: 200, y: 50 }; // Apple Above
    updateAppleAudio(snakePositions[0]);
    await speak("A higher pitch means the apple is at the top of the screen.");
    await wait(2000);

    // Pitch - Down (Low Pitch)
    objPosition = { x: 200, y: 350 }; // Apple Below
    updateAppleAudio(snakePositions[0]);
    await speak("A lower pitch means the apple is at the bottom of the screen.");
    await wait(2000);

    // Distance - Far
    await speak("Finally, the ticking speed indicates distance.");

    objPosition = { x: 0, y: 0 };
    snakePositions = [{ x: 300, y: 300 }];
    updateAppleAudio(snakePositions[0]);
    await speak("Slow means far away.");
    await wait(2500);

    // Distance - Close
    await speak("Fast means you are close.");

    snakePositions = [{ x: 20, y: 20 }]; // Very close
    objPosition = { x: 0, y: 0 };
    updateAppleAudio(snakePositions[0]);
    await wait(2500);

    // Mute apple
    if (appleGain) appleGain.gain.setValueAtTime(0, audioCtx.currentTime);

    await speak("So to find the apple, listen to where the sound is coming from, how high or low it is, and how fast it's ticking.");

    gameover = true; // Silence for next demo

    // Eat Sound Demo
    await speak("When you get a point, you will hear this.");
    playEatSound();
    await wait(1500);

    // Wall Demo
    await speak("You will hear a wind sound when you cross the edge of the world");


    // directly play wind sound to demonstrate
    if (windGain) {
        windGain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        setTimeout(() => {
            if (windGain) windGain.gain.setValueAtTime(0, audioCtx.currentTime);
        }, 2000);
    }
    await wait(2500);

    // Mute wind
    if (windGain) windGain.gain.setValueAtTime(0, audioCtx.currentTime);

    await speak("Good luck. Game starting now, the first apple is to the right.");
    gameover = false; // Enable game sounds
}

function runGame() {
    // Start Voice
    if (recognition) {
        try { recognition.start(); } catch (e) { }
    }

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
    if (recognition) recognition.stop();
}

function stopAllAudio() {
    if (appleGain) appleGain.gain.setValueAtTime(0, audioCtx.currentTime);
    if (windGain) windGain.gain.setValueAtTime(0, audioCtx.currentTime);
    if (bodyHumGain) bodyHumGain.gain.setValueAtTime(0, audioCtx.currentTime);
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
    if (pendingDirections.length > 0) {
        snakeDirection = pendingDirections.shift();
    }

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

    pendingDirections = [];
    snakePositions = [];
    snakePositions.push(getCenteredStartPosition());

    snakeDirection = { x: START_DIRECTION_X, y: START_DIRECTION_Y };

    // First apple always to the right to guarantee a point
    // Center is ~200. +100px = 300px.
    objPosition.x = snakePositions[0].x + (GRID_SIZE * 10);
    objPosition.y = snakePositions[0].y;

    // Ensure bounds
    if (objPosition.x >= WINDOW_WIDTH) objPosition.x = WINDOW_WIDTH - GRID_SIZE;

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






// Setup Initial State (Waiting for Click)
setup();
