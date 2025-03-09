// Timer Functionality
let timeLeft = 60; // Initial time in seconds
let score = 0;
let timerInterval;
let gameStarted = false;
let gameOver = false;
let lastKnotCheck = 0;
let knotCheckInterval = 500; // Check for knots every 500ms

// Difficulty settings
const difficulties = {
    easy: {
        time: 9999, // minutes
        label: "Easy",
        scoreThresholds: {
            poor: 5,
            average: 10,
            good: 15,
            excellent: 20
        },
        knotScoreMultiplier: 1.0 // Base multiplier for knot scores
    },
    medium: {
        time: 60, // 1 minute
        label: "Medium",
        scoreThresholds: {
            poor: 8,
            average: 15,
            good: 25,
            excellent: 35
        },
        knotScoreMultiplier: 1.5 // Higher multiplier for medium difficulty
    },
    hard: {
        time: 30, // 30 seconds
        label: "Hard",
        scoreThresholds: {
            poor: 5,
            average: 10,
            good: 15,
            excellent: 20
        },
        knotScoreMultiplier: 2.0 // Highest multiplier for hard difficulty
    }
};
let currentDifficulty = difficulties.medium; // Default to medium

// Knot measurement variables
let calibratedLength = null;
let isMeasuring = false;
let measurementTimeout = null;

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    document.getElementById('timer').textContent =
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function startGame() {
    if (gameStarted) return;

    // Hide difficulty selection
    document.getElementById('difficulty-container').style.display = 'none';

    gameStarted = true;
    gameOver = false;
    score = 0;
    document.getElementById('score').textContent = score;

    // Make UI elements visible
    document.getElementById('timer-container').style.opacity = 1;
    document.getElementById('score-container').style.opacity = 1;

    // Hide game over container if it was showing
    document.getElementById('game-over-container').style.display = 'none';

    // Update game prompt to show active instructions
    const gamePrompt = document.getElementById('game-prompt');
    gamePrompt.innerHTML = `<span class="highlight">Time to tie knots!</span> Current difficulty: ${currentDifficulty.label}`;

    // Restore normal voice indicator message
    const voiceIndicator = document.getElementById('voice-indicator');
    voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> or <span class="command">"menu"</span></span>';

    // Reset timer based on difficulty
    timeLeft = currentDifficulty.time;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();

        if (timeLeft <= 0) {
            endGame();
        }
    }, 1000);

    // Hide start button if visible
    const startBtn = document.getElementById('start-button');
    if (startBtn) {
        startBtn.style.display = 'none';
    }

    // Show restart button
    let restartBtn = document.getElementById('restart-button');
    if (!restartBtn) {
        restartBtn = document.createElement('button');
        restartBtn.id = 'restart-button';
        restartBtn.textContent = 'Restart Game';
        restartBtn.style.position = 'fixed';
        restartBtn.style.bottom = '10px';
        restartBtn.style.left = '50%';
        restartBtn.style.transform = 'translateX(-50%)';
        restartBtn.style.zIndex = '100';
        restartBtn.style.backgroundColor = '#8B4513';
        restartBtn.style.color = 'white';
        restartBtn.style.border = '2px solid #d2b48c';
        restartBtn.style.borderRadius = '5px';
        restartBtn.style.padding = '10px 20px';
        restartBtn.style.cursor = 'pointer';

        // Use a proper event listener that won't get overwritten
        restartBtn.addEventListener('click', function () {
            // First end the current game if it's running
            if (timerInterval) {
                clearInterval(timerInterval);
            }

            // Reset the game state
            gameStarted = false;
            gameOver = false;

            // Show difficulty selection again
            document.getElementById('difficulty-container').style.display = 'flex';

            // Hide game over container
            document.getElementById('game-over-container').style.display = 'none';

            // Hide this button
            restartBtn.style.display = 'none';

            // Reset the game prompt
            const gamePrompt = document.getElementById('game-prompt');
            gamePrompt.innerHTML = 'Please start the game and <span class="highlight">tie knots</span> in the rope to score points!';

            // Reset the rope
            resetRope();
        });

        document.body.appendChild(restartBtn);
    } else {
        restartBtn.style.display = 'block';
    }
}

function endGame() {
    if (!gameStarted || gameOver) return;

    // Stop the timer
    clearInterval(timerInterval);
    gameOver = true;

    // Measure the final knot before showing game over screen
    if (!isMeasuringKnot) {
        // Set a flag to indicate this is the final measurement
        const isFinalMeasurement = true;
        
        // Measure the knot and get the final score
        measureFinalKnot(() => {
            // This callback runs after the knot measurement is complete
            
            // Show game over container
            const gameOverContainer = document.getElementById('game-over-container');
            gameOverContainer.style.display = 'flex';
            
            // Update final score
            document.getElementById('final-score').textContent = score;
            
            // Determine performance message based on score and difficulty
            let performanceMessage = '';
            let performanceColor = '';
            
            const thresholds = currentDifficulty.scoreThresholds;
            
            if (score < thresholds.poor) {
                performanceMessage = "Keep practicing!";
                performanceColor = "#FF6347"; // Tomato red
            } else if (score < thresholds.average) {
                performanceMessage = "Not bad!";
                performanceColor = "#FFA500"; // Orange
            } else if (score < thresholds.good) {
                performanceMessage = "Good job!";
                performanceColor = "#4682B4"; // Steel blue
            } else if (score < thresholds.excellent) {
                performanceMessage = "Great work!";
                performanceColor = "#32CD32"; // Lime green
            } else {
                performanceMessage = "Excellent!";
                performanceColor = "#FFD700"; // Gold
            }
            
            // Add performance message to game over screen
            let performanceElement = document.getElementById('performance-message');
            if (!performanceElement) {
                performanceElement = document.createElement('p');
                performanceElement.id = 'performance-message';
                gameOverContainer.appendChild(performanceElement);
            }
            
            performanceElement.textContent = performanceMessage;
            performanceElement.style.color = performanceColor;
            performanceElement.style.fontWeight = 'bold';
            performanceElement.style.fontSize = '1.5em';
            
            // Add difficulty info
            let difficultyElement = document.getElementById('difficulty-info');
            if (!difficultyElement) {
                difficultyElement = document.createElement('p');
                difficultyElement.id = 'difficulty-info';
                gameOverContainer.appendChild(difficultyElement);
            }
            
            difficultyElement.textContent = `Difficulty: ${currentDifficulty.label}`;
            
            // Update game prompt
            const gamePrompt = document.getElementById('game-prompt');
            gamePrompt.innerHTML = 'Game over! <span class="highlight">Say "restart"</span> or click the restart button to play again.';
            
            // Update voice indicator to show only restart command is available
            const voiceIndicator = document.getElementById('voice-indicator');
            voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> to play again</span>';
            
            // Show restart button
            const restartButton = document.getElementById('restart-button');
            if (restartButton) {
                restartButton.style.display = 'block';
            }
        });
    } else {
        // If already measuring, just show the game over screen
        showGameOverScreen();
    }
}

// Function to measure the final knot and then run a callback
function measureFinalKnot(callback) {
    const chainIndex = 0;
    if (!chainBodies[chainIndex]) {
        // If no chain exists, just run the callback
        callback();
        return;
    }

    isMeasuringKnot = true;
    knotMeasurementStartTime = Date.now();

    // Store original state and physics properties
    const originalPositions = [];
    const originalVelocities = [];
    const originalAngularVelocities = [];
    const originalQuaternions = [];

    const bodies = chainBodies[chainIndex];
    for (let i = 0; i < bodies.length; i++) {
        originalPositions.push(bodies[i].position.clone());
        originalVelocities.push(bodies[i].velocity.clone());
        originalAngularVelocities.push(bodies[i].angularVelocity.clone());
        originalQuaternions.push(bodies[i].quaternion.clone());

        // Increase damping during measurement
        bodies[i].linearDamping = KNOT_MEASUREMENT_CONFIG.dampingDuringStretch;
        bodies[i].angularDamping = KNOT_MEASUREMENT_CONFIG.dampingDuringStretch;
    }

    // Store original gravity and physics properties
    const originalGravity = world.gravity.clone();
    world.gravity.set(0, 0, 0);

    // Set a timeout to calculate results and restore the chain
    setTimeout(() => {
        // Calculate knot metrics
        const knottiness = calculateKnotFactor(chainIndex);
        document.getElementById('knotRating').textContent = knottiness.toFixed(1) + '%';

        // Update the game score based on knot complexity
        if (typeof updateGameScore === 'function') {
            // Convert knottiness to a ratio (0-1) for the scoring system
            const lengthRatio = 1 - (knottiness / 100);
            updateGameScore(lengthRatio, 0);
        }

        // Begin restoration process
        setTimeout(() => {
            // Restore original physics properties
            world.gravity.copy(originalGravity);
            
            // Restore original chain state and properties
            for (let i = 0; i < bodies.length; i++) {
                bodies[i].position.copy(originalPositions[i]);
                bodies[i].velocity.copy(originalVelocities[i]);
                bodies[i].angularVelocity.copy(originalAngularVelocities[i]);
                bodies[i].quaternion.copy(originalQuaternions[i]);
                
                // Restore original damping
                bodies[i].linearDamping = CONFIG.damping;
                bodies[i].angularDamping = CONFIG.angularDamping;
            }

            isMeasuringKnot = false;
            
            // Run the callback after measurement is complete
            callback();
        }, KNOT_MEASUREMENT_CONFIG.recoveryTime / 2); // Use shorter recovery time for game end
    }, KNOT_MEASUREMENT_CONFIG.measurementDuration / 2); // Use shorter measurement time for game end
}

// Function to show the game over screen
function showGameOverScreen() {
    // Show game over container
    const gameOverContainer = document.getElementById('game-over-container');
    gameOverContainer.style.display = 'flex';
    
    // Update final score
    document.getElementById('final-score').textContent = score;
    
    // Determine performance message based on score and difficulty
    let performanceMessage = '';
    let performanceColor = '';
    
    const thresholds = currentDifficulty.scoreThresholds;
    
    if (score < thresholds.poor) {
        performanceMessage = "Keep practicing!";
        performanceColor = "#FF6347"; // Tomato red
    } else if (score < thresholds.average) {
        performanceMessage = "Not bad!";
        performanceColor = "#FFA500"; // Orange
    } else if (score < thresholds.good) {
        performanceMessage = "Good job!";
        performanceColor = "#4682B4"; // Steel blue
    } else if (score < thresholds.excellent) {
        performanceMessage = "Great work!";
        performanceColor = "#32CD32"; // Lime green
    } else {
        performanceMessage = "Excellent!";
        performanceColor = "#FFD700"; // Gold
    }
    
    // Add performance message to game over screen
    let performanceElement = document.getElementById('performance-message');
    if (!performanceElement) {
        performanceElement = document.createElement('p');
        performanceElement.id = 'performance-message';
        gameOverContainer.appendChild(performanceElement);
    }
    
    performanceElement.textContent = performanceMessage;
    performanceElement.style.color = performanceColor;
    performanceElement.style.fontWeight = 'bold';
    performanceElement.style.fontSize = '1.5em';
    
    // Add difficulty info
    let difficultyElement = document.getElementById('difficulty-info');
    if (!difficultyElement) {
        difficultyElement = document.createElement('p');
        difficultyElement.id = 'difficulty-info';
        gameOverContainer.appendChild(difficultyElement);
    }
    
    difficultyElement.textContent = `Difficulty: ${currentDifficulty.label}`;
    
    // Update game prompt
    const gamePrompt = document.getElementById('game-prompt');
    gamePrompt.innerHTML = 'Game over! <span class="highlight">Say "restart"</span> or click the restart button to play again.';
    
    // Update voice indicator to show only restart command is available
    const voiceIndicator = document.getElementById('voice-indicator');
    voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> to play again</span>';
    
    // Show restart button
    const restartButton = document.getElementById('restart-button');
    if (restartButton) {
        restartButton.style.display = 'block';
    }
}

// Function to check if interaction should be allowed
function canInteract() {
    return gameStarted && !gameOver;
}

// Score Functionality with visual feedback
function updateScore(points) {
    if (!gameStarted) return;

    // Apply difficulty multiplier to points
    const multiplier = currentDifficulty.knotScoreMultiplier;
    const adjustedPoints = Math.round(points * multiplier);

    score += adjustedPoints;
    const scoreElement = document.getElementById('score');
    scoreElement.textContent = score;

    // Add visual feedback
    scoreElement.style.fontSize = '2.5em';
    scoreElement.style.color = '#FFD700'; // Gold color

    // Show multiplier if applicable
    if (multiplier > 1.0) {
        // Create a floating multiplier text
        const multiplierText = document.createElement('div');
        multiplierText.textContent = `x${multiplier.toFixed(1)}`;
        multiplierText.style.position = 'absolute';
        multiplierText.style.color = '#FFD700';
        multiplierText.style.fontSize = '1.2em';
        multiplierText.style.fontWeight = 'bold';
        multiplierText.style.right = '20px';
        multiplierText.style.top = '90px';
        multiplierText.style.opacity = '1';
        multiplierText.style.transition = 'all 0.5s ease-out';
        document.body.appendChild(multiplierText);

        // Animate and remove
        setTimeout(() => {
            multiplierText.style.opacity = '0';
            multiplierText.style.top = '70px';
            setTimeout(() => {
                document.body.removeChild(multiplierText);
            }, 500);
        }, 300);
    }

    // Reset after a short delay
    setTimeout(() => {
        scoreElement.style.fontSize = '1em';
        scoreElement.style.color = 'white';
    }, 300);
}

// Function to update the game score based on knot complexity
function updateGameScore(lengthRatio, straightness) {
    if (!gameStarted || gameOver) return;
    
    // Calculate a score based on how knotted the rope is
    // Lower length ratio = more knotted = higher score
    let knotScore = 0;
    
    if (lengthRatio < 0.5) {
        // Very knotted - highest score
        knotScore = 100;
    } else if (lengthRatio < 0.7) {
        // Knotted - good score
        knotScore = 50;
    } else if (lengthRatio < 0.9) {
        // Slightly knotted - modest score
        knotScore = 25;
    } else {
        // Minimal knots - low score
        knotScore = 10;
    }
    
    // Add bonus points for complexity (more crossings)
    const complexityBonus = Math.floor(currentCrossings * 2);
    
    // Calculate final score
    const finalScore = knotScore + complexityBonus;
    
    // Update the score
    updateScore(finalScore);
}

// Expose the updateGameScore function to the window object
window.updateGameScore = updateGameScore;

// Set up difficulty buttons
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('easy-button').addEventListener('click', function () {
        currentDifficulty = difficulties.easy;
        startGame();
    });

    document.getElementById('medium-button').addEventListener('click', function () {
        currentDifficulty = difficulties.medium;
        startGame();
    });

    document.getElementById('hard-button').addEventListener('click', function () {
        currentDifficulty = difficulties.hard;
        startGame();
    });

    // Initially hide timer and score
    document.getElementById('timer-container').style.opacity = 0;
    document.getElementById('score-container').style.opacity = 0;

    // Hide the start button since we now have difficulty selection
    const startButton = document.getElementById('start-button');
    if (startButton) {
        startButton.style.display = 'none';
    }

    // Add event listener for measure button
    const measureButton = document.getElementById('measureKnot');
    if (measureButton) {
        measureButton.addEventListener('click', measureKnot);
    }
    
    // Show the measure knot button
    if (measureButton) {
        measureButton.style.display = 'block';
    }
});

// Function to measure the chain length
function measureChainLength() {
    const chainIndex = 0; // Use first chain
    if (!chainBodies[chainIndex]) return 0;

    const bodies = chainBodies[chainIndex];
    let totalLength = 0;

    // Measure distance between consecutive links
    for (let i = 1; i < bodies.length - 1; i++) {
        const pos1 = bodies[i].position;
        const pos2 = bodies[i + 1].position;
        totalLength += Math.sqrt(
            Math.pow(pos2.x - pos1.x, 2) +
            Math.pow(pos2.y - pos1.y, 2) +
            Math.pow(pos2.z - pos1.z, 2)
        );
    }

    return totalLength;
}

// Function to perform knot measurement
function measureKnot() {
    if (isMeasuring) return;
    isMeasuring = true;

    // Store original gravity
    const originalGravity = world.gravity.clone();
    
    // Apply upward force to stretch the chain
    world.gravity.set(0, 8, 0); // Strong upward force
    
    // Wait for chain to stabilize
    measurementTimeout = setTimeout(() => {
        const currentLength = measureChainLength();
        
        // If not calibrated yet, use this as calibration
        if (calibratedLength === null) {
            calibratedLength = currentLength;
            document.getElementById('calibratedLength').textContent = calibratedLength.toFixed(2);
            document.getElementById('currentLength').textContent = '-';
            document.getElementById('knottedness').textContent = 'Calibrated';
        } else {
            // Calculate knottedness ratio
            const ratio = currentLength / calibratedLength;
            document.getElementById('currentLength').textContent = currentLength.toFixed(2);
            
            // Determine knottedness level
            let knottedness;
            if (ratio > 0.95) knottedness = 'Not knotted';
            else if (ratio > 0.8) knottedness = 'Slightly knotted';
            else if (ratio > 0.6) knottedness = 'Moderately knotted';
            else knottedness = 'Heavily knotted';
            
            document.getElementById('knottedness').textContent = knottedness;
        }
        
        // Restore original gravity
        world.gravity.copy(originalGravity);
        isMeasuring = false;
    }, 17000); // Wait 2 seconds for chain to stabilize
} 