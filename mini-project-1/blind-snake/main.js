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
// Elements
// =========================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const snakePosEl = document.getElementById('snakePos');
const snakeDirEl = document.getElementById('snakeDir');
const applePosEl = document.getElementById('applePos');
const gameOverOverlay = document.getElementById('gameOverOverlay');


// =========================
// Setup & Loop
// =========================

function setup() {
    resetGame();
    setInterval(draw, 1000 / GAME_FRAME_RATE);
}

function draw() {
    // Canvas clearing
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, WINDOW_WIDTH, WINDOW_HEIGHT);

    if (gameover) {
        gameOverOverlay.classList.remove('hidden');
        updateGameOverTimer();
        return;
    } else {
        gameOverOverlay.classList.add('hidden');
    }

    updateSnake();
    updateHud(); // Update DOM
    drawFood();
    drawSnake();
}


// =========================
// Drawing helpers
// =========================

function updateHud() {
    // Check if snakePositions is populated to avoid errors on init
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
    wrapHeadPosition(newHead);

    if (hitsSelf(newHead)) {
        endGame();
        return;
    }

    let ateFood = overlaps(newHead, objPosition);
    let lastTailBeforeMove = getLastTailCopy();

    moveSnakeBody(newHead);

    if (ateFood) {
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

function wrapHeadPosition(head) {
    if (head.x < 0) {
        head.x = WINDOW_WIDTH - GRID_SIZE;
    } else if (head.x > WINDOW_WIDTH - GRID_SIZE) {
        head.x = 0;
    }

    if (head.y < 0) {
        head.y = WINDOW_HEIGHT - GRID_SIZE;
    } else if (head.y > WINDOW_HEIGHT - GRID_SIZE) {
        head.y = 0;
    }
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
    if (Date.now() - gameoverAtMillis >= GAME_OVER_DELAY_MS) {
        resetGame();
    }
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
    
    // Initial HUD update
    updateHud();
}

function endGame() {
    gameover = true;
    gameoverAtMillis = Date.now();
    gameOverOverlay.classList.remove('hidden');
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

// Start
setup();
