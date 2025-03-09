// Voice Recognition Setup
let isListening = false;
let mediaRecorder;
let audioChunks = [];
let recordingInterval;
let debugMode = false; // Debug mode flag
let sessionCount = 0; // Count recording sessions
let lastCommand = ""; // Track the last recognized command
let lastCommandTime = 0; // Track when the last command was executed
const commandCooldown = 3000; // Cooldown period in milliseconds

// Replace with your Hugging Face API key
// Function to start continuous voice recognition with overlapping sessions
async function startContinuousVoiceRecognition() {
    const indicator = document.getElementById('voice-indicator');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('Microphone access not supported in this browser');
        indicator.innerHTML = '<span style="color: #FF6347;">Voice commands unavailable</span>';
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create a shared stream that can be used by multiple recorders
        window.sharedAudioStream = stream;
        
        // Start the first recording session
        startNewRecordingSession();
        isListening = true;

        // Update UI
        updateVoiceIndicator();
        
        // Add CSS for continuous listening indicator
        const style = document.createElement('style');
        style.textContent = `
            #voice-indicator.listening #voice-indicator-icon {
                animation: pulse 1.5s infinite;
            }
            #voice-indicator.listening {
                border-color: #90EE90;
            }
            #voice-indicator:hover {
                cursor: pointer;
                transition: transform 0.2s ease;
            }
        `;
        document.head.appendChild(style);
        
        // Make voice indicator clickable to toggle listening
        indicator.addEventListener('click', toggleVoiceRecognition);
        
    } catch (error) {
        console.error("Error accessing microphone:", error);
        indicator.innerHTML = '<span style="color: #FF6347;">Microphone access denied</span>';
    }
    
    return indicator; // Return the indicator for method chaining
}

// Function to start a new recording session
function startNewRecordingSession() {
    if (!window.sharedAudioStream) return;
    
    try {
        // Create a new recorder for this session
        const sessionRecorder = new MediaRecorder(window.sharedAudioStream, { mimeType: 'audio/webm' });
        const sessionChunks = [];
        
        sessionRecorder.ondataavailable = (event) => {
            sessionChunks.push(event.data);
        };
        
        sessionRecorder.onstop = async () => {
            // Process this recording session
            processRecordingSession(sessionChunks);
        };
        
        // Start recording
        sessionRecorder.start();
        
        // Schedule the end of this recording session
        setTimeout(() => {
            if (sessionRecorder && sessionRecorder.state === 'recording') {
                try {
                    sessionRecorder.stop();
                } catch (e) {
                    console.error("Error stopping session recorder:", e);
                }
            }
        }, 3000); // 3 seconds per session
        
        // Start the next recording session before this one ends
        // This creates overlapping sessions to ensure continuous listening
        setTimeout(() => {
            if (isListening) {
                startNewRecordingSession();
            }
        }, 1500); // Start a new session halfway through the current one
        
    } catch (e) {
        console.error("Error starting recording session:", e);
        
        // Try to recover by restarting the whole process
        setTimeout(() => {
            if (isListening) {
                stopContinuousVoiceRecognition();
                startContinuousVoiceRecognition();
            }
        }, 2000);
    }
}

// Process a completed recording session
async function processRecordingSession(chunks) {
    const indicator = document.getElementById('voice-indicator');
    sessionCount++;
    const sessionId = sessionCount;
    
    if (chunks.length === 0) {
        if (debugMode) console.log(`Session ${sessionId}: Empty chunks, skipping`);
        return;
    }
    
    const audioBlob = new Blob(chunks, { type: 'audio/webm' });
    if (audioBlob.size < 1000) {
        if (debugMode) console.log(`Session ${sessionId}: Audio too small (${audioBlob.size} bytes), skipping transcription`);
        return;
    }
    
    if (debugMode) console.log(`Session ${sessionId}: Processing audio (${audioBlob.size} bytes)`);
    
    // Show processing indicator with just a color change (no text change)
    const originalBackgroundColor = indicator.style.backgroundColor;
    indicator.classList.add('processing');
    
    try {
        // Send the audio to Hugging Face Whisper API
        const transcription = await transcribeAudio(audioBlob);
        
        if (debugMode) {
            console.log(`Session ${sessionId}: Transcription result: "${transcription}"`);
        } else {
            console.log("Transcription:", transcription);
        }
        
        // Process the transcription
        await processTranscription(transcription);
    } catch (error) {
        console.error(`Session ${sessionId}: Transcription error:`, error);
    } finally {
        // Remove processing indicator
        indicator.classList.remove('processing');
    }
}

// Toggle voice recognition on/off
function toggleVoiceRecognition() {
    const indicator = document.getElementById('voice-indicator');
    
    if (isListening) {
        // Stop listening
        stopContinuousVoiceRecognition();
    } else {
        // Start listening
        indicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Starting voice recognition...</span>';
        startContinuousVoiceRecognition();
        
        // Update after a short delay
        setTimeout(() => {
            if (isListening) {
                updateVoiceIndicator();
            }
        }, 1000);
    }
    
    return indicator; // Return the indicator for method chaining
}

// Start recording audio
function startRecording() {
    console.log("Legacy startRecording called - using new recording system instead");
    if (!isListening && window.sharedAudioStream) {
        isListening = true;
        updateVoiceIndicator();
        startNewRecordingSession();
    }
}

// Stop continuous voice recognition
function stopContinuousVoiceRecognition() {
    isListening = false;
    updateVoiceIndicator();
    
    // Stop the shared audio stream if it exists
    if (window.sharedAudioStream) {
        window.sharedAudioStream.getTracks().forEach(track => track.stop());
        window.sharedAudioStream = null;
    }
} async function transcribeAudio(audioBlob) {
    try {
        // Convert blob to base64
        const base64Data = await blobToBase64(audioBlob);

        const response = await fetch("https://mountain-backend.vercel.app/transcribe", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                audioBase64: base64Data
            }),
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        if (data && data.text) {
            return data.text;
        } else {
            console.warn("Unexpected API response format:", data);
            return "";
        }
    } catch (error) {
        console.error("Transcription API error:", error);
        throw error;
    }
}


// Function to convert Blob to Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Update the voice indicator UI
function updateVoiceIndicator() {
    const indicator = document.getElementById('voice-indicator');
    
    if (isListening) {
        indicator.classList.add('listening');
        
        // Update the voice indicator text based on game state
        if (!gameStarted) {
            // Show difficulty commands when game not started
            indicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"easy mode"</span>, <span class="command">"medium mode"</span>, or <span class="command">"hard mode"</span></span>';
        } else if (!gameOver) {
            // After game starts, emphasize restart command
            indicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> to restart the game</span>';
        } else {
            // Only restart command during game over
            indicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> to play again</span>';
        }
    } else {
        indicator.classList.remove('listening');
        indicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Voice commands paused</span>';
    }
    
    return indicator; // Return the indicator for method chaining
}

// Visual feedback when command is recognized
function flashVoiceIndicator(commandText) {
    const indicator = document.getElementById('voice-indicator');
    
    // Save original classes
    const wasListening = indicator.classList.contains('listening');
    const wasProcessing = indicator.classList.contains('processing');
    
    // Remove all state classes
    indicator.classList.remove('listening');
    indicator.classList.remove('processing');
    
    // Add recognized class
    indicator.classList.add('recognized');
    
    // Flash with gold color
    indicator.style.backgroundColor = 'rgba(255, 215, 0, 0.8)'; // Gold flash
    
    // If a command text was provided, show it briefly
    if (commandText) {
        indicator.innerHTML = `<div id="voice-indicator-icon"></div><span>${commandText}</span>`;
        
        // Reset content after a moment
        setTimeout(() => {
            // Update voice indicator based on current game state
            updateVoiceIndicator();
        }, 1500);
    }
    
    // Reset after a moment
    setTimeout(() => {
        // Remove recognized class
        indicator.classList.remove('recognized');
        
        // Restore original state
        if (wasListening) indicator.classList.add('listening');
        if (wasProcessing) indicator.classList.add('processing');
        
        // Reset background color
        indicator.style.backgroundColor = wasListening ? 
            'rgba(144, 238, 144, 0.7)' : 'rgba(139, 69, 19, 0.7)';
    }, 1500);
    
    return indicator; // Return the indicator for method chaining
}

// Function to restart the game via voice command
function restartGame() {
    // If a game is in progress, end it
    if (gameStarted && !gameOver) {
        if (timerInterval) {
            clearInterval(timerInterval);
        }
        gameOver = true;
    }

    // Reset game state
    gameStarted = false;
    gameOver = false;

    // Show difficulty selection
    document.getElementById('difficulty-container').style.display = 'flex';

    // Hide game over container
    document.getElementById('game-over-container').style.display = 'none';

    // Hide restart button if visible
    const restartButton = document.getElementById('restart-button');
    if (restartButton) {
        restartButton.style.display = 'none';
    }

    // Reset the game prompt
    const gamePrompt = document.getElementById('game-prompt');
    gamePrompt.innerHTML = 'Please start the game and <span class="highlight">tie knots</span> in the rope to score points!';

    // Update voice indicator
    updateVoiceIndicator();

    // Reset the rope
    resetRope();

    // Provide feedback
    flashVoiceIndicator("Game restarted");
}

// Function to toggle the controls menu visibility with animation
function toggleControlsMenu() {
    // Don't allow toggling the menu if the game is over
    if (gameOver) {
        console.log("Menu toggle blocked: game is over");
        flashVoiceIndicator("Menu unavailable during game over");
        return;
    }

    const controls = document.getElementById('controls');

    // Add transition styles if not already added
    if (!controls.style.transition) {
        controls.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    }

    // Check if the controls are visible or not
    // We need to check computed style since the inline style might not be set initially
    const isVisible = window.getComputedStyle(controls).display !== 'none' &&
        window.getComputedStyle(controls).opacity !== '0';

    if (!isVisible) {
        // First make it visible but transparent
        controls.style.display = 'block';
        controls.style.opacity = '0';
        controls.style.transform = 'translateX(-20px)';

        // Force a reflow to ensure the transition works
        controls.offsetHeight;

        // Then fade it in
        controls.style.opacity = '1';
        controls.style.transform = 'translateX(0)';
        console.log("Menu shown via command");
    } else {
        // Fade it out
        controls.style.opacity = '0';
        controls.style.transform = 'translateX(-20px)';

        // Hide it after the transition completes
        setTimeout(() => {
            controls.style.display = 'none';
        }, 300);
        console.log("Menu hidden via command");
    }
}

// Initialize continuous voice recognition when the page loads
window.addEventListener('load', () => {
    // Start with a slight delay to ensure page is fully loaded
    setTimeout(() => {
        startContinuousVoiceRecognition();
    }, 1000);
});

// Add keyboard shortcut for debug mode
window.addEventListener('keydown', (event) => {
    // Debug mode toggle with 'D' key
    if (event.key.toLowerCase() === 'd') {
        const indicator = document.getElementById('voice-indicator');
        debugMode = !debugMode;
        console.log(`Voice recognition debug mode: ${debugMode ? 'ON' : 'OFF'}`);
        
        if (debugMode) {
            // Add debug info to voice indicator
            const originalContent = indicator.innerHTML;
            indicator.innerHTML = originalContent + ' <small style="opacity: 0.7;">[Debug ON]</small>';
        } else {
            // Remove debug info
            updateVoiceIndicator();
        }
    }
});

// Process the transcription result
async function processTranscription(text) {
    if (!text) return;
    
    // Convert to lowercase for easier matching
    const lowerText = text.toLowerCase();
    
    // Check for cooldown
    const now = Date.now();
    if (now - lastCommandTime < commandCooldown) {
        console.log("Command cooldown active, ignoring:", lowerText);
        return;
    }
    
    // Check for difficulty selection commands
    if ((lowerText.includes("easy") && lowerText.includes("mode")) || lowerText.includes("easy difficulty")) {
        lastCommand = "easy";
        lastCommandTime = now;
        flashVoiceIndicator("Starting Easy Mode");
        startGameWithDifficulty('easy');
        return;
    }
    
    if ((lowerText.includes("medium") && lowerText.includes("mode")) || lowerText.includes("medium difficulty")) {
        lastCommand = "medium";
        lastCommandTime = now;
        flashVoiceIndicator("Starting Medium Mode");
        startGameWithDifficulty('medium');
        return;
    }
    
    if ((lowerText.includes("hard") && lowerText.includes("mode")) || lowerText.includes("hard difficulty")) {
        lastCommand = "hard";
        lastCommandTime = now;
        flashVoiceIndicator("Starting Hard Mode");
        startGameWithDifficulty('hard');
        return;
    }
    
    // Check for other commands
    if (lowerText.includes("restart")) {
        lastCommand = "restart";
        lastCommandTime = now;
        flashVoiceIndicator("Command: Restart");
        restartGame();
    } else if (lowerText.includes("menu")) {
        // Don't process menu command if game is over
        if (gameOver) {
            console.log("Menu command ignored: game is over");
            flashVoiceIndicator("Menu unavailable during game over");
            return;
        }
        
        lastCommand = "menu";
        lastCommandTime = now;
        flashVoiceIndicator("Command: Toggle Menu");
        toggleControlsMenu();
    } else if (lowerText.includes("measure") || lowerText.includes("knot")) {
        lastCommand = "measure";
        lastCommandTime = now;
        flashVoiceIndicator("Command: Measure Knot");
        measureKnotVoiceCommand();
    }
}

// Function to start the game with a specific difficulty
function startGameWithDifficulty(difficultyLevel) {
    // Don't start if game is already in progress
    if (gameStarted && !gameOver) {
        console.log(`Game already in progress, ignoring ${difficultyLevel} mode command`);
        return;
    }
    
    // Set the difficulty
    switch (difficultyLevel) {
        case 'easy':
            currentDifficulty = difficulties.easy;
            break;
        case 'medium':
            currentDifficulty = difficulties.medium;
            break;
        case 'hard':
            currentDifficulty = difficulties.hard;
            break;
        default:
            console.error("Unknown difficulty level:", difficultyLevel);
            return;
    }
    
    // Start the game
    startGame();
}

// Function to handle the measure knot voice command
function measureKnotVoiceCommand() {
    if (KNOT_CONFIG.isActive) {
        // If already measuring, cancel it
        endKnotMeasurement(false);
        return;
    }
    
    // Start the measurement process
    startKnotMeasurement();
} 

