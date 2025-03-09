// Voice Recognition Setup
const voiceIndicator = document.getElementById('voice-indicator');
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
const HF_API_KEY = '';

// Function to start continuous voice recognition with overlapping sessions
async function startContinuousVoiceRecognition() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn('Microphone access not supported in this browser');
        voiceIndicator.innerHTML = '<span style="color: #FF6347;">Voice commands unavailable</span>';
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
        voiceIndicator.addEventListener('click', toggleVoiceRecognition);
        
    } catch (error) {
        console.error("Error accessing microphone:", error);
        voiceIndicator.innerHTML = '<span style="color: #FF6347;">Microphone access denied</span>';
    }
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
    
    // Show processing indicator (but keep listening)
    const currentContent = voiceIndicator.innerHTML;
    voiceIndicator.classList.add('processing');
    voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Processing <span class="processing-dot"></span></span>';
    
    try {
        // Send the audio to Hugging Face Whisper API
        const transcription = await transcribeAudio(audioBlob);
        
        if (debugMode) {
            console.log(`Session ${sessionId}: Transcription result: "${transcription}"`);
        } else {
            console.log("Transcription:", transcription);
        }
        
        const transcriptionLower = transcription.toLowerCase();
        const now = Date.now();
        
        // Check for restart command
        if (transcriptionLower.includes('restart')) {
            // Check if this is a duplicate command (within cooldown period)
            if (lastCommand === "restart" && now - lastCommandTime < commandCooldown) {
                if (debugMode) console.log(`Session ${sessionId}: Ignoring duplicate 'restart' command (cooldown)`);
                
                // Show cooldown message
                voiceIndicator.classList.remove('processing');
                voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Command recognized but on cooldown</span>';
                
                // Reset UI after a moment
                setTimeout(() => {
                    if (isListening) {
                        voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> or <span class="command">"menu"</span></span>';
                    }
                }, 1500);
                return;
            }
            
            // Update command tracking
            lastCommand = "restart";
            lastCommandTime = now;
            
            // Visual feedback
            flashVoiceIndicator();
            voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Command: <span class="command">Restart!</span></span>';
            voiceIndicator.classList.remove('processing');
            
            // Restart the game
            restartGame();
            
            // Reset UI after a moment
            setTimeout(() => {
                if (isListening) {
                    voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> or <span class="command">"menu"</span></span>';
                }
            }, 2000);
            return;
        }
        
        // Check for menu command
        if (transcriptionLower.includes('menu')) {
            // Check if this is a duplicate command (within cooldown period)
            if (lastCommand === "menu" && now - lastCommandTime < commandCooldown) {
                if (debugMode) console.log(`Session ${sessionId}: Ignoring duplicate 'menu' command (cooldown)`);
                
                // Show cooldown message
                voiceIndicator.classList.remove('processing');
                voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Command recognized but on cooldown</span>';
                
                // Reset UI after a moment
                setTimeout(() => {
                    if (isListening) {
                        voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> or <span class="command">"menu"</span></span>';
                    }
                }, 1500);
                return;
            }
            
            // Update command tracking
            lastCommand = "menu";
            lastCommandTime = now;
            
            // Visual feedback
            flashVoiceIndicator();
            voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Command: <span class="command">Menu!</span></span>';
            voiceIndicator.classList.remove('processing');
            
            // Toggle menu visibility
            toggleControlsMenu();
            
            // Reset UI after a moment
            setTimeout(() => {
                if (isListening) {
                    voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> or <span class="command">"menu"</span></span>';
                }
            }, 2000);
            return;
        }
        
        // If no command was recognized, restore the original indicator
        voiceIndicator.classList.remove('processing');
        voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> or <span class="command">"menu"</span></span>';
        
    } catch (error) {
        console.error("Transcription error:", error);
        // Restore the indicator even if there was an error
        voiceIndicator.classList.remove('processing');
        voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> or <span class="command">"menu"</span></span>';
    }
}

// Toggle voice recognition on/off
function toggleVoiceRecognition() {
    if (isListening) {
        // Stop listening
        stopContinuousVoiceRecognition();
    } else {
        // Start listening
        voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Starting voice recognition...</span>';
        startContinuousVoiceRecognition();
        
        // Update after a short delay
        setTimeout(() => {
            if (isListening) {
                voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> or <span class="command">"menu"</span></span>';
            }
        }, 1000);
    }
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
    
    voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Voice commands paused</span>';
}

// Function to transcribe audio using Hugging Face Whisper API
async function transcribeAudio(audioBlob) {
    try {
        const audioBase64 = await blobToBase64(audioBlob);

        const response = await fetch(
            'https://api-inference.huggingface.co/models/openai/whisper-large-v3',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${HF_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: audioBase64.split(',')[1], // Remove the data URL prefix
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        if (data && data.text) {
            return data.text;
        } else if (data && Array.isArray(data) && data[0] && data[0].generated_text) {
            return data[0].generated_text;
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
    if (isListening) {
        voiceIndicator.classList.add('listening');
    } else {
        voiceIndicator.classList.remove('listening');
    }
}

// Visual feedback when command is recognized
function flashVoiceIndicator() {
    voiceIndicator.style.backgroundColor = 'rgba(255, 215, 0, 0.7)'; // Gold flash

    setTimeout(() => {
        voiceIndicator.style.backgroundColor = isListening ?
            'rgba(144, 238, 144, 0.7)' : 'rgba(139, 69, 19, 0.7)';
    }, 1000);
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

    // Reset the rope
    resetRope();

    // Provide feedback
    flashVoiceIndicator("Game restarted");
}

// Function to toggle the controls menu visibility with animation
function toggleControlsMenu() {
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
        debugMode = !debugMode;
        console.log(`Voice recognition debug mode: ${debugMode ? 'ON' : 'OFF'}`);
        
        if (debugMode) {
            // Add debug info to voice indicator
            const originalContent = voiceIndicator.innerHTML;
            voiceIndicator.innerHTML = originalContent + ' <small style="opacity: 0.7;">[Debug ON]</small>';
        } else {
            // Remove debug info
            voiceIndicator.innerHTML = '<div id="voice-indicator-icon"></div><span>Say <span class="command">"restart"</span> or <span class="command">"menu"</span></span>';
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
    
    // Check for commands
    if (lowerText.includes("restart")) {
        lastCommand = "restart";
        lastCommandTime = now;
        flashVoiceIndicator("Restarting game");
        restartGame();
    } else if (lowerText.includes("menu")) {
        lastCommand = "menu";
        lastCommandTime = now;
        flashVoiceIndicator("Toggling menu");
        toggleControlsMenu();
    } else if (lowerText.includes("measure") || lowerText.includes("knot")) {
        lastCommand = "measure";
        lastCommandTime = now;
        flashVoiceIndicator("Measuring knot");
        measureKnotVoiceCommand();
    }
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