const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');

// Microphone Variables
let analyser;
let micStream;
let dataArray;
let bufferLength;
let isMicActive = false;
let lastActionTime = 0;
const ACTION_COOLDOWN = 300; // ms

// Sound
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playJumpSound() {
    if (audioCtx.state !== 'running') return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
}

function playDuckSound() {
    if (audioCtx.state !== 'running') return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(400, audioCtx.currentTime); 
    oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
}

function playDeathSound() {
    if (audioCtx.state !== 'running') return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.3);
}

function playScoreSound() {
    if (audioCtx.state !== 'running') return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(2000, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime); 
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
}

function playSonarPing(type, xPosition) {
    if (audioCtx.state !== 'running') return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    // Stereo Panner for spatial audio
    let panner;
    try {
        panner = audioCtx.createStereoPanner();
    } catch(e) {
        // Fallback or ignore if not supported
    }

    // Map xPosition (0..800) to Pan (-1..1)
    // 0 -> -1 (Left), 400 -> 0 (Center), 800 -> 1 (Right)
    let panVal = (xPosition - 400) / 400;
    if (panVal > 1) panVal = 1;
    if (panVal < -1) panVal = -1;

    // Volume based on distance (closer = louder)
    // x=50 (player) -> dist=0
    let dist = Math.max(0, xPosition - 50);
    // dist 750 -> vol 0.05, dist 0 -> vol 0.3
    let vol = 0.3 - (dist / 750) * 0.25;
    if (vol < 0.05) vol = 0.05;

    if (type === 'blue') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    } else {
        // Red
        oscillator.type = 'sine'; 
        oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
    }

    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    if (panner) {
        panner.pan.value = panVal;
        oscillator.connect(panner);
        panner.connect(gainNode);
    } else {
        oscillator.connect(gainNode);
    }
    
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
}

function playLandSound() {
    if (audioCtx.state !== 'running') return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    // Low "Thud"
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(100, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
}

// Game Variables
let gameSpeed = 5;
let score = 0;
let gameOver = false;
let animationId;

// Dino
const dino = {
    x: 50,
    y: 150,
    width: 30,
    height: 30,
    originalHeight: 30,
    duckHeight: 15, // Reduced height for ducking
    isDucking: false,
    dy: 0,
    jumpStrength: 12,
    grounded: false,
    color: '#000000', // Black dino
    draw: function() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    },
    update: function() {
        // Duck Logic
        if (keys['ArrowDown'] || keys['KeyS']) {
            if (!this.isDucking) {
                this.height = this.duckHeight;
                this.y += (this.originalHeight - this.duckHeight);
                this.isDucking = true;
                playDuckSound();
            }
        } else {
            if (this.isDucking) {
                this.height = this.originalHeight;
                this.y -= (this.originalHeight - this.duckHeight);
                this.isDucking = false;
            }
        }

        // Jump Logic
        if (keys['Space'] || keys['ArrowUp']) {
            this.jump();
        }

        this.y += this.dy;

        // Gravity
        if (this.y + this.height < canvas.height) {
            // Apply extra gravity if ducking to fall faster
            if (this.isDucking) {
                this.dy += 2.0; 
            } else {
                this.dy += 0.6; // Normal gravity
            }
            this.grounded = false;
        } else {
            if (!this.grounded) {
                playLandSound();
            }
            this.dy = 0;
            this.grounded = true;
            this.y = canvas.height - this.height; // Snap to ground
        }
        
        this.draw();
    },
    jump: function() {
        if (this.grounded) {
            this.dy = -this.jumpStrength;
            this.grounded = false;
            playJumpSound();
        }
    }
};

// Input Handling
const keys = {};
// window.addEventListener('keydown', function(e) {
//     keys[e.code] = true;
// });
// window.addEventListener('keyup', function(e) {
//     keys[e.code] = false;
// });

// Obstacles
const obstacles = [];
let spawnTimer = 0;
let initialSpawnTimer = 200;
let spawnRate = initialSpawnTimer; 

class Obstacle {
    constructor(x, y, w, h, color) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.color = color;
        this.markedForDeletion = false;
        this.lastPingTime = 0;
    }
    
    update() {
        this.x -= gameSpeed;
        if (this.x + this.w < 0) {
            this.markedForDeletion = true;
            score++;
            scoreElement.innerText = "Score: " + score;
            playScoreSound();
        }

        // Sonar Logic
        // Only ping if in front of player (x > 50) and on-screen (x < 800)
        let dist = this.x - 50;
        if (dist > 0 && dist < canvas.width) {
            // Map distance to interval: 
            // 750px -> 0.6s
            // 0px -> 0.05s (very fast ping when close)
            // Linear map: interval = min + (dist/max) * (max-min)
            let interval = 0.05 + (dist / 750) * 0.55;

            if (audioCtx.currentTime - this.lastPingTime > interval) {
                playSonarPing(this.color === '#0033CC' ? 'blue' : 'red', this.x);
                this.lastPingTime = audioCtx.currentTime;
            }
        }

        this.draw();
    }
    
    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.w, this.h);
    }
}

function spawnObstacle() {
    spawnTimer++;
    if (spawnTimer >= spawnRate) {
        let obstacle;
        // 30% chance of flying obstacle, only after score 5
        if (Math.random() > 0.7 && score > 5) {
            // Large obstacle from top (y=0) to y=175. 
            // Dino Grounded Head = 170 (Collision). Dino Ducking Head = 185 (Clear).
            // Impossible to jump over.
            obstacle = new Obstacle(
                canvas.width, 
                0, 
                40 + Math.random() * 10, 
                175,
                '#0033CC' // Blue Wall
            );
        } else {
            let height = 20 + Math.random() * 30; // Random height between 20 and 50
            obstacle = new Obstacle(
                canvas.width, 
                canvas.height - height, 
                20 + Math.random() * 20, // Width 20-40 
                height,
                '#FF0000' // Red Cactus
            );
        }

        obstacles.push(obstacle);
        spawnTimer = 0;
        
        // Dynamic spawn rate based on distance instead of time
        // This ensures multiple obstacles can be on screen as speed increases
        
        // Minimum distance between obstacles (pixels)
        let minDistance = 400;
        // Maximum distance
        let maxDistance = 900;

        // Reduce distance as score increases to make it harder
        if (score > 10) {
            minDistance = 350;
            maxDistance = 800;
        }
        if (score > 20) {
             minDistance = 300;
             maxDistance = 600;
        }

        let distance = minDistance + Math.random() * (maxDistance - minDistance);
        spawnRate = Math.round(distance / gameSpeed);
        
        if (spawnRate < 20) spawnRate = 20; // Absolute minimum frames
    }
}

function checkCollision(rect1, rect2) {
    return (
        rect1.x < rect2.x + rect2.w &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.h &&
        rect1.y + rect1.height > rect2.y
    );
}

// Game Loop
function update() {
    if (gameOver) {
        ctx.fillStyle = "black";
        ctx.font = "30px Arial";
        ctx.fillText("Game Over!", canvas.width / 2 - 70, canvas.height / 2);
        ctx.font = "20px Arial";
        ctx.fillText("Say 'Start' to Restart", canvas.width / 2 - 100, canvas.height / 2 + 30);
        return; 
    }

    requestAnimationFrame(update);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isMicActive) {
        handleAudioInput();
    }

    // Increase game speed
    gameSpeed += 0.003;
    if (gameSpeed > 20) {
        gameSpeed = 20; // Maximum speed
    }

    spawnObstacle();

    // Update and draw obstacles
    obstacles.forEach((obstacle, index) => {
        obstacle.update();
        if (checkCollision(dino, obstacle)) {
            gameOver = true;
            playDeathSound();
            
            // Start listening for "start" command
            if (recognition) {
                try {
                    recognition.start();
                    console.log("Listening for 'start'...");
                } catch (e) {
                    console.error("Speech recognition start failed:", e);
                }
            }
        }
    });

    // Remove off-screen obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        if (obstacles[i].markedForDeletion) {
            obstacles.splice(i, 1);
        }
    }

    dino.update();
}

function resetGame() {
    if (recognition) {
        try {
            recognition.stop();
        } catch(e) {
            // Already stopped?
        }
    }

    gameOver = false;
    score = 0;
    scoreElement.innerText = "Score: " + score;
    obstacles.length = 0;
    gameSpeed = 5;
    spawnTimer = 0;
    spawnRate = initialSpawnTimer;
    dino.y = canvas.height - dino.height;
    dino.dy = 0;
    update();
}

// Start Game
update();

// Restart Listener
// window.addEventListener('keydown', function(e) {
//     if (gameOver && e.code === 'Enter') {
//         resetGame();
//     }
// });

// Speech Recognition for Restart
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
        const last = event.results.length - 1;
        const command = event.results[last][0].transcript.trim().toLowerCase();
        console.log('Voice Command:', command);
        
        if (gameOver && (command.includes('start') || command.includes('restart'))) {
            resetGame();
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
    };
    
    recognition.onend = () => {
        // Restart listening if game is still over (handles timeout)
        if (gameOver) {
            try {
                recognition.start();
            } catch(e) {
                // Ignore if already started
            }
        }
    }
} else {
    console.warn("Speech Recognition API not supported in this browser.");
}

// Handle Microphone Activation
async function startMicrophone() {
    const micStatus = document.getElementById('micStatus');
    
    if (window.location.protocol === 'file:') {
        alert('Microphone access is not supported when opening files directly. Please use a local server (e.g., python3 -m http.server).');
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (micStatus) micStatus.innerText = 'Microphone Not Supported';
        alert('Your browser does not support microphone access or the context is insecure (requires HTTPS or localhost).');
        return;
    }
    
    try {
        // Ensure context is running. If suspended, resume it.
        // This must be called from a user gesture handler.
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        if (!isMicActive) {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Connecting the stream source might fail if context is not running
            const source = audioCtx.createMediaStreamSource(micStream);
            
            if (!analyser) {
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 2048;
                bufferLength = analyser.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);
                source.connect(analyser); 
            } else {
                source.connect(analyser);
            }
            
            isMicActive = true;
            if (micStatus) {
                micStatus.innerText = "Microphone Active";
                micStatus.style.color = "green";
            }
            console.log("Microphone activated.");
        }

    } catch (err) {
        console.error('Error starting microphone:', err);
        if (micStatus && !isMicActive) micStatus.innerText = "Click to Activate Mic";
    }
}

// Remove automatic start to prevent AudioContext errors
// startMicrophone(); 

// Ensure audio context runs on any interaction
window.addEventListener('click', async () => {
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
    if (!isMicActive) {
        startMicrophone(); 
    }
});

function handleAudioInput() {
    if (!isMicActive || !analyser) return;

    analyser.getByteFrequencyData(dataArray);

    // Analyze frequency bands
    // 0-200 Hz (Index 0-10) - Bass/Thud
    let bassSum = 0;
    // 44100 / 2048 = 21.5 Hz per bin
    // 0-10 bins -> 0-215 Hz.
    for (let i = 0; i < 10; i++) {
        bassSum += dataArray[i];
    }
    let bassAvg = bassSum / 10;

    // 2000-5000 Hz (Index 93-232) - Treble/Clap
    let trebleSum = 0;
    let trebleCount = 0;
    for (let i = 93; i < 232; i++) {
        trebleSum += dataArray[i];
        trebleCount++;
    }
    let trebleAvg = trebleSum / trebleCount;

    // Thresholds
    // Clap is usually very loud and sharp
    const CLAP_THRESHOLD = 60; 
    const SLAP_THRESHOLD = 100;

    const now = Date.now();
    if (now - lastActionTime < ACTION_COOLDOWN) return;

    // Heuristics
    // Clap: High frequencies are dominant
    if (trebleAvg > CLAP_THRESHOLD && trebleAvg > bassAvg * 1.2) {
        triggerAction('jump');
        lastActionTime = now;
    } 
    // Slap: Low frequencies are very strong (thud)
    else if (bassAvg > SLAP_THRESHOLD) {
        triggerAction('duck');
        lastActionTime = now;
    }
}

function triggerAction(action) {
    if (action === 'jump') {
        // Simulate Jump
        if (!dino.isDucking && dino.grounded) { // Only jump if not ducking
            keys['Space'] = true;
            setTimeout(() => { keys['Space'] = false; }, 100); 
            console.log("Audio Detected: Jump (Clap)");
        }
    } else if (action === 'duck') {
        // Simulate Duck
        keys['ArrowDown'] = true;
        setTimeout(() => { keys['ArrowDown'] = false; }, 400); // Hold duck
        console.log("Audio Detected: Duck (Slap)");
    }
}
