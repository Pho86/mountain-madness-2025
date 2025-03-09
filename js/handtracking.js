/* --- MEDIAPIPE DUAL HAND TRACKING INTEGRATION --- */

// Global reset function to ensure all drag states are properly cleared
function resetAllDragStates() {
    console.log("Resetting all drag states");
    
    // Reset global dragging state
    window.isDraggingChain = false;
    window.activeHand = null;
    
    // If there's an active constraint, remove it
    if (window.dragConstraint) {
        world.removeConstraint(window.dragConstraint);
        window.dragConstraint = null;
    }
    
    // Reset materials if needed
    if (window.draggedLink && window.originalMaterial) {
        window.draggedLink.material = window.originalMaterial;
    }
    
    window.draggedLink = null;
    window.originalMaterial = null;
    window.draggedBody = null;
    
    // Reset hand states
    if (hands) {
        if (hands.left) {
            hands.left.isDragging = false;
            hands.left.wasPinching = false;
            hands.left.draggedLink = null;
            hands.left.draggedBody = null;
            hands.left.dragConstraint = null;
        }
        
        if (hands.right) {
            hands.right.isDragging = false;
            hands.right.wasPinching = false;
            hands.right.draggedLink = null;
            hands.right.draggedBody = null;
            hands.right.dragConstraint = null;
        }
    }
    
    // Clear any active timeouts
    if (dragTimeouts) {
        if (dragTimeouts.left) {
            clearTimeout(dragTimeouts.left);
            dragTimeouts.left = null;
        }
        if (dragTimeouts.right) {
            clearTimeout(dragTimeouts.right);
            dragTimeouts.right = null;
        }
    }
}

// Setup video and canvas elements
const video = document.getElementById('videoElement');
const handCanvas = document.getElementById('handCanvas');
handCanvas.width = 640;
handCanvas.height = 480;
const handCtx = handCanvas.getContext('2d');

// Hand tracking variables
let isHandTracking = false;
const statusElement = document.getElementById('status');

// Tracking for both hands
const hands = {
    left: {
        active: false,
        indexFingerTip: null,
        thumbTip: null,
        isDragging: false,
        draggedLink: null,
        draggedBody: null,
        originalMaterial: null,
        dragConstraint: null,
        landmarks: null,
        activeFingerIndex: -1,
        wasPinching: undefined
    },
    right: {
        active: false,
        indexFingerTip: null,
        thumbTip: null,
        isDragging: false,
        draggedLink: null,
        draggedBody: null,
        originalMaterial: null,
        dragConstraint: null,
        landmarks: null,
        activeFingerIndex: -1,
        wasPinching: undefined
    }
};

// Define pinch thresholds with hysteresis (different thresholds for start and end)
const PINCH_START_THRESHOLD = 0.9; // Even tighter threshold to start pinching
const PINCH_END_THRESHOLD = 1.2;   // Smaller threshold to end pinching
const MAX_DRAG_TIME = 1500;        // 1.5 seconds max for pinch to be active without renewal (reduced from 2s)

// Minimum confidence required for pinch detection
const MIN_HAND_CONFIDENCE = 0.7;   // Only detect pinches when hand tracking is confident
const MIN_PINCH_FRAMES = 2;        // Require consecutive frames of pinch detection before activating

// Add tracking for consecutive pinch frames
let consecutivePinchFrames = { left: 0, right: 0 };
let consecutiveNonPinchFrames = { left: 0, right: 0 };

// Visual representation of fingers in 3D scene
// Create hand models with multiple joints for better 3D representation
function createHandModel(color) {
    const handGroup = new THREE.Group();
    
    // Create finger joints
    const joints = [];
    const jointGeometry = new THREE.SphereGeometry(0.1, 16, 16);
    const jointMaterial = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.3,
        roughness: 0.3,
        metalness: 0.7
    });
    
    // Create larger geometries for finger tips to make them more visible
    const tipGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    
    // Create 21 joints (MediaPipe hand model has 21 landmarks)
    for (let i = 0; i < 21; i++) {
        // Use larger geometry for finger tips (4, 8, 12, 16, 20)
        const isFingerTip = [4, 8, 12, 16, 20].includes(i);
        const geometry = isFingerTip ? tipGeometry : jointGeometry;
        
        const joint = new THREE.Mesh(geometry, jointMaterial.clone());
        joint.castShadow = true;
        joint.visible = false;
        joint.userData.isFingerTip = isFingerTip;
        handGroup.add(joint);
        joints.push(joint);
    }
    
    // Create connections between joints (bones)
    const connections = [
        // Thumb
        [0, 1], [1, 2], [2, 3], [3, 4],
        // Index finger
        [0, 5], [5, 6], [6, 7], [7, 8],
        // Middle finger
        [0, 9], [9, 10], [10, 11], [11, 12],
        // Ring finger
        [0, 13], [13, 14], [14, 15], [15, 16],
        // Pinky
        [0, 17], [17, 18], [18, 19], [19, 20],
        // Palm
        [5, 9], [9, 13], [13, 17]
    ];
    
    const bones = [];
    const boneGeometry = new THREE.CylinderGeometry(0.03, 0.03, 1, 8);
    boneGeometry.rotateX(Math.PI / 2); // Align cylinder with Z-axis
    
    for (let i = 0; i < connections.length; i++) {
        const bone = new THREE.Mesh(boneGeometry, jointMaterial.clone());
        bone.castShadow = true;
        bone.visible = false;
        handGroup.add(bone);
        bones.push(bone);
    }
    
    scene.add(handGroup);
    
    return {
        group: handGroup,
        joints: joints,
        bones: bones,
        connections: connections,
        baseColor: color
    };
}

// Create hand models
const leftHandModel = createHandModel(0x0000ff); // Blue for left hand
const rightHandModel = createHandModel(0xff0000); // Red for right hand

// Keep the finger meshes for backward compatibility
const leftFingerGeometry = new THREE.SphereGeometry(0.2, 32, 32);
const leftFingerMaterial = new THREE.MeshStandardMaterial({
    color: 0x0000ff,  // Blue for left hand
    emissive: 0x0000ff,
    emissiveIntensity: 0.5
});
const leftFingerMesh = new THREE.Mesh(leftFingerGeometry, leftFingerMaterial);
leftFingerMesh.castShadow = true;
scene.add(leftFingerMesh);
leftFingerMesh.visible = false;

const rightFingerGeometry = new THREE.SphereGeometry(0.2, 32, 32);
const rightFingerMaterial = new THREE.MeshStandardMaterial({
    color: 0xff0000,  // Red for right hand
    emissive: 0xff0000,
    emissiveIntensity: 0.5
});
const rightFingerMesh = new THREE.Mesh(rightFingerGeometry, rightFingerMaterial);
rightFingerMesh.castShadow = true;
scene.add(rightFingerMesh);
rightFingerMesh.visible = false;

// Raycasters for finger interaction
const leftFingerRaycaster = new THREE.Raycaster();
const rightFingerRaycaster = new THREE.Raycaster();

// Set up MediaPipe Hands
const mpHands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

mpHands.setOptions({
    maxNumHands: 2,           // Track up to 2 hands
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

// Function to update hand model based on landmarks
function updateHandModel(handModel, landmarks, depthFactor, activeFingerIndex) {
    const joints = handModel.joints;
    const bones = handModel.bones;
    const connections = handModel.connections;
    const baseColor = handModel.baseColor;
    
    // Base depth for the hand in 3D space
    const baseDepth = 3 + ((1 - depthFactor) * 17);
    
    // Define finger tip indices
    const fingerTips = [4, 8, 12, 16, 20];
    
    // Highlight thumb (4) and index finger (8) as interactive fingers
    const interactiveJoints = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // Thumb and index finger joints
    
    // Update joint positions
    for (let i = 0; i < landmarks.length; i++) {
        const landmark = landmarks[i];
        const joint = joints[i];
        
        // Convert from normalized coordinates to 3D world coordinates
        // X: -1 to 1 (left to right)
        // Y: 1 to -1 (top to bottom)
        // Z: depth based on hand size and landmark z
        const x = ((landmark.x * 2) - 1) * -10; // Flip X for mirror effect
        const y = (((landmark.y * 2) - 1) * -1) * 6; // Y coordinate
        const z = baseDepth + (landmark.z * 6); // Z coordinate with depth scaling
        
        joint.position.set(x, y, z);
        
        // Determine if this is an interactive joint (thumb or index finger)
        const isInteractiveJoint = interactiveJoints.includes(i);
        
        // Highlight active finger
        if (activeFingerIndex >= 0) {
            const activeTip = fingerTips[activeFingerIndex];
            
            // Determine if this joint is part of the active finger
            let isActiveFingerJoint = false;
            
            if (i === activeTip) {
                // This is the active finger tip
                isActiveFingerJoint = true;
            } else if (activeFingerIndex === 0 && i >= 1 && i <= 4) {
                // Thumb joints
                isActiveFingerJoint = true;
            } else if (activeFingerIndex === 1 && i >= 5 && i <= 8) {
                // Index finger joints
                isActiveFingerJoint = true;
            } else if (activeFingerIndex === 2 && i >= 9 && i <= 12) {
                // Middle finger joints
                isActiveFingerJoint = true;
            } else if (activeFingerIndex === 3 && i >= 13 && i <= 16) {
                // Ring finger joints
                isActiveFingerJoint = true;
            } else if (activeFingerIndex === 4 && i >= 17 && i <= 20) {
                // Pinky joints
                isActiveFingerJoint = true;
            }
            
            if (isActiveFingerJoint) {
                // Highlight active finger with brighter color and emissive
                joint.material.emissive.set(0xffff00);
                joint.material.emissiveIntensity = 0.8;
                
                // Make active finger tips larger
                if (joint.userData.isFingerTip) {
                    joint.scale.set(1.5, 1.5, 1.5);
                }
            } else if (isInteractiveJoint) {
                // Interactive but not active fingers get a distinct highlight
                joint.material.emissive.set(0x00ffff);
                joint.material.emissiveIntensity = 0.6;
                joint.scale.set(1.2, 1.2, 1.2);
            } else {
                // Non-interactive joints get a dimmer appearance
                joint.material.emissive.set(baseColor);
                joint.material.emissiveIntensity = 0.2;
                joint.scale.set(0.8, 0.8, 0.8);
            }
        } else {
            // No active finger, just highlight interactive joints
            if (isInteractiveJoint) {
                // Thumb and index finger get highlighted
                joint.material.emissive.set(0x00ffff);
                joint.material.emissiveIntensity = 0.6;
                
                // Make thumb and index tips slightly larger
                if (i === 4 || i === 8) {
                    joint.scale.set(1.3, 1.3, 1.3);
                } else {
                    joint.scale.set(1.1, 1.1, 1.1);
                }
            } else {
                // Other fingers appear dimmer
                joint.material.emissive.set(baseColor);
                joint.material.emissiveIntensity = 0.2;
                joint.scale.set(0.8, 0.8, 0.8);
            }
        }
        
        joint.visible = true;
    }
    
    // Update bone positions and orientations
    for (let i = 0; i < connections.length; i++) {
        const [jointA, jointB] = connections[i];
        const bone = bones[i];
        
        const posA = joints[jointA].position;
        const posB = joints[jointB].position;
        
        // Position bone at midpoint between joints
        bone.position.copy(posA).add(posB).multiplyScalar(0.5);
        
        // Calculate bone length
        const length = posA.distanceTo(posB);
        bone.scale.set(1, 1, length);
        
        // Orient bone to point from jointA to jointB
        bone.lookAt(posB);
        
        // Check if this bone is part of thumb or index finger
        const isInteractiveBone = 
            (jointA <= 4 && jointB <= 4) || // Thumb bones
            (jointA >= 5 && jointA <= 8 && jointB >= 5 && jointB <= 8); // Index bones
        
        // Highlight active finger bones
        if (activeFingerIndex >= 0) {
            // Check if this bone is part of the active finger
            let isActiveFingerBone = false;
            
            if (activeFingerIndex === 0 && 
                ((jointA >= 0 && jointA <= 4) && (jointB >= 0 && jointB <= 4))) {
                // Thumb bones
                isActiveFingerBone = true;
            } else if (activeFingerIndex === 1 && 
                      ((jointA >= 5 && jointA <= 8) && (jointB >= 5 && jointB <= 8))) {
                // Index finger bones
                isActiveFingerBone = true;
            } else if (activeFingerIndex === 2 && 
                      ((jointA >= 9 && jointA <= 12) && (jointB >= 9 && jointB <= 12))) {
                // Middle finger bones
                isActiveFingerBone = true;
            } else if (activeFingerIndex === 3 && 
                      ((jointA >= 13 && jointA <= 16) && (jointB >= 13 && jointB <= 16))) {
                // Ring finger bones
                isActiveFingerBone = true;
            } else if (activeFingerIndex === 4 && 
                      ((jointA >= 17 && jointA <= 20) && (jointB >= 17 && jointB <= 20))) {
                // Pinky bones
                isActiveFingerBone = true;
            }
            
            if (isActiveFingerBone) {
                // Highlight active finger bones
                bone.material.emissive.set(0xffff00);
                bone.material.emissiveIntensity = 0.8;
                bone.scale.x = 1.5;
                bone.scale.z = 1.5;
            } else if (isInteractiveBone) {
                // Interactive but not active bones
                bone.material.emissive.set(0x00ffff);
                bone.material.emissiveIntensity = 0.6;
                bone.scale.x = 1.2;
                bone.scale.z = 1.2;
            } else {
                // Non-interactive bones
                bone.material.emissive.set(baseColor);
                bone.material.emissiveIntensity = 0.2;
                bone.scale.x = 0.7;
                bone.scale.z = 0.7;
            }
        } else {
            // No active finger, highlight interactive bones
            if (isInteractiveBone) {
                bone.material.emissive.set(0x00ffff);
                bone.material.emissiveIntensity = 0.6;
                bone.scale.x = 1.2;
                bone.scale.z = 1.2;
            } else {
                // Other bones appear dimmer
                bone.material.emissive.set(baseColor);
                bone.material.emissiveIntensity = 0.2;
                bone.scale.x = 0.7;
                bone.scale.z = 0.7;
            }
        }
        
        bone.visible = true;
    }
    
    handModel.group.visible = true;
    
    return {
        indexFingerTip: joints[8].position.clone(),
        thumbTip: joints[4].position.clone()
    };
}

// Initialize debug visualization objects
let debugSphere = null;
let debugText = null;

// Function to initialize debug visualization
function initDebugVisualization() {
    // Create debug sphere for interaction visualization
    const sphereGeometry = new THREE.SphereGeometry(0.8, 16, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3,
        wireframe: true
    });
    debugSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    debugSphere.visible = false;
    scene.add(debugSphere);
    
    // Create debug text for 3D feedback
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgba(0,0,0,0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '24px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.fillText('Hand Tracking Debug', canvas.width/2, canvas.height/2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });
    const geometry = new THREE.PlaneGeometry(4, 2);
    debugText = new THREE.Mesh(geometry, material);
    debugText.position.set(0, 10, 0);
    debugText.visible = false;
    scene.add(debugText);
    
    // Add debug toggle to UI
    // const controls = document.getElementById('controls');
    // const debugButton = document.createElement('button');
    // debugButton.id = 'toggleDebug';
    // debugButton.textContent = 'Toggle';
    // debugButton.addEventListener('click', toggleDebugView);
    // controls.appendChild(debugButton);
    
    // console.log('Debug visualization initialized');
}

// Toggle debug visualization
let debugViewEnabled = false;
function toggleDebugView() {
    debugViewEnabled = !debugViewEnabled;
    document.getElementById('toggleDebug').textContent = 
        debugViewEnabled ? 'Hide Debug View' : 'Show Debug View';
    
    if (!debugViewEnabled) {
        if (debugSphere) debugSphere.visible = false;
        if (debugText) debugText.visible = false;
    }
    
    console.log('Debug view ' + (debugViewEnabled ? 'enabled' : 'disabled'));
}

// Update debug text
function updateDebugText(text) {
    if (!debugText || !debugViewEnabled) return;
    
    const canvas = debugText.material.map.image;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(0,0,0,0.8)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '18px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    
    // Split text into lines
    const lines = text.split('\n');
    let y = 30;
    for (const line of lines) {
        context.fillText(line, canvas.width/2, y);
        y += 20;
    }
    
    debugText.material.map.needsUpdate = true;
    debugText.visible = true;
}

// Function to interact with the scene using finger position
function interactWithSceneUsingFinger(hand, x, y, z) {
    // This function is no longer used - we're using the mouse interaction functions instead
    console.log("interactWithSceneUsingFinger is deprecated - using mouse interaction functions instead");
}

// Function to add haptic feedback visual effect
function addHapticFeedback(position, duration = 0.3) {
    // Create a ripple effect at the position
    const rippleGeometry = new THREE.RingGeometry(0.1, 0.3, 16);
    const rippleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
    });
    
    const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial);
    ripple.position.copy(position);
    
    // Orient ripple to face camera
    ripple.lookAt(camera.position);
    
    scene.add(ripple);
    
    // Animate the ripple
    const startTime = Date.now();
    const animate = function() {
        const elapsed = (Date.now() - startTime) / 1000;
        const progress = elapsed / duration;
        
        if (progress < 1) {
            // Scale up and fade out
            const scale = 1 + progress * 2;
            ripple.scale.set(scale, scale, scale);
            rippleMaterial.opacity = 0.7 * (1 - progress);
            
            requestAnimationFrame(animate);
        } else {
            // Remove when animation is complete
            scene.remove(ripple);
        }
    };
    
    animate();
}

// Add our own versions of the mouse interaction functions
// These are simplified versions of the functions in mouse.js
function handleHandMouseDown(position) {
    // Don't interact if game is over or not started
    if (typeof canInteract === 'function' && !canInteract()) {
        console.log("Cannot interact - game state prevents interaction");
        return false;
    }
    
    console.log("Hand pinch detected at position:", position);
    
    // Check for intersections with all chain links
    const allLinks = [];
    
    if (!chains || chains.length === 0) {
        console.error("No chains found!");
        return false;
    }
    
    console.log("Number of chains:", chains.length);
    
    chains.forEach((chain, chainIndex) => {
        console.log(`Chain ${chainIndex} has ${chain.children.length} children`);
        
        chain.children.forEach(link => {
            // Only include actual links, not end caps
            if (link.userData && link.userData.linkIndex !== undefined) {
                link.userData.chainIndex = chainIndex; // Ensure chainIndex is set
                allLinks.push(link);
            }
        });
    });
    
    console.log("Total links to check:", allLinks.length);
    
    // Create a raycaster from the camera through the position
    const handRaycaster = new THREE.Raycaster();
    const screenPosition = position.clone().project(camera);
    handRaycaster.setFromCamera(new THREE.Vector2(screenPosition.x, screenPosition.y), camera);
    
    const intersects = handRaycaster.intersectObjects(allLinks);
    console.log("Intersections found:", intersects.length);
    
    if (intersects.length > 0) {
        console.log("Intersection detected with link");
        window.isDraggingChain = true;
        window.draggedLink = intersects[0].object;
        window.originalMaterial = window.draggedLink.material;
        window.draggedLink.material = selectedMaterial;
        
        const chainIndex = window.draggedLink.userData.chainIndex;
        const linkIndex = window.draggedLink.userData.linkIndex;
        console.log("Dragging link from chain", chainIndex, "link index", linkIndex);
        
        window.draggedBody = chainBodies[chainIndex][linkIndex];
        
        // Convert intersection point to world coordinates
        const intersectionPoint = intersects[0].point;
        console.log("Intersection point:", intersectionPoint);
        
        // Position joint body at the intersection point
        leftJointBody.position.copy(intersectionPoint);
        
        // Create a distance constraint between leftJointBody and draggedBody
        window.dragConstraint = new CANNON.PointToPointConstraint(
            window.draggedBody,
            new CANNON.Vec3().copy(window.draggedBody.position).vsub(intersectionPoint),
            leftJointBody,
            new CANNON.Vec3(0, 0, 0),
            20 // Force strength
        );
        
        world.addConstraint(window.dragConstraint);
        console.log("Constraint added");
        
        // Add haptic feedback visual effect
        addHapticFeedback(intersectionPoint, 0.5);
        
        // Update UI to show interaction
        if (document.getElementById('status')) {
            document.getElementById('status').textContent = `Grabbed link ${linkIndex} from chain ${chainIndex}`;
        }
        
        return true;
    }
    
    return false;
}

// Handle hand move
function handleHandMouseMove(position) {
    if (window.isDraggingChain && window.draggedBody && window.dragConstraint) {
        // Move joint body to new position
        leftJointBody.position.copy(position);
        return true;
    }
    return false;
}

// Handle hand release
function handleHandMouseUp() {
    console.log("Hand release detected");
    
    // Force immediate release of any constraints even if we're not sure which ones
    let constraintRemoved = false;
    
    if (window.isDraggingChain) {
        console.log("Releasing dragged chain");
        // Reset dragging state
        if (window.draggedLink) {
            window.draggedLink.material = window.originalMaterial;
            window.draggedLink = null;
            window.originalMaterial = null;
        }
        
        // Remove constraint
        if (window.dragConstraint) {
            try {
                world.removeConstraint(window.dragConstraint);
                constraintRemoved = true;
                console.log("Constraint removed");
            } catch (e) {
                console.error("Error removing constraint:", e);
            }
            window.dragConstraint = null;
        }
        
        window.isDraggingChain = false;
        window.draggedBody = null;
        window.activeHand = null;
        
        // Also ensure both hands are marked as not dragging
        if (hands.left) hands.left.isDragging = false;
        if (hands.right) hands.right.isDragging = false;
        
        // Check for knots and update score
        if (typeof calculateKnotFactor === 'function' && typeof updateScore === 'function') {
            try {
                // Calculate knot factor for the first chain
                const knotFactor = calculateKnotFactor(0);
                
                // Update the knot factor display
                document.getElementById('knotFactor').textContent = knotFactor.toFixed(1);
                
                // Update the score based on the knot factor
                // Only add points if the knot factor is significant
                if (knotFactor > 10) {
                    // Scale points based on knot complexity
                    const points = Math.floor(knotFactor / 2);
                    updateScore(points);
                    console.log(`Added ${points} points for knot with factor ${knotFactor}`);
                }
            } catch (error) {
                console.error("Error calculating knot factor:", error);
            }
        }
        
        return true;
    }
    
    return constraintRemoved;
}

// Add text-to-speech functionality
let speechSynthesisInitialized = false;
let bothHandsAnnounced = false;

function speakText(text) {
    // Check if the browser supports Speech Synthesis
    if ('speechSynthesis' in window) {
        // Create a new SpeechSynthesisUtterance
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Set properties (optional)
        utterance.volume = 1.0; // 0 to 1
        utterance.rate = 1.0;   // 0.1 to 10
        utterance.pitch = 1.0;  // 0 to 2
        
        // Speak the text
        window.speechSynthesis.speak(utterance);
        
        return true;
    } else {
        console.warn("Browser does not support Speech Synthesis");
        return false;
    }
}

// Initialize speech synthesis when the document is ready
document.addEventListener('DOMContentLoaded', function() {
    speechSynthesisInitialized = true;
    console.log("Speech synthesis initialized");
    
    // Reset all drag states on page load to ensure a clean state
    resetAllDragStates();
    
    // Add a key press handler for emergency release (ESC key)
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            console.log("Emergency release triggered by ESC key");
            resetAllDragStates();
        }
    });
    
    // Add a visibility change listener to reset states when tab becomes visible again
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            console.log("Page became visible again, resetting drag states");
            resetAllDragStates();
        }
    });
});

// Add a timeout for dragging to ensure it's released
let dragTimeouts = { left: null, right: null };

// Process results from hand tracking
mpHands.onResults(results => {
    handCtx.save();
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);

    // Draw the camera feed on the canvas
    handCtx.drawImage(results.image, 0, 0, handCanvas.width, handCanvas.height);
    
    // Global consistency check - if we have inconsistent state, reset everything
    if (window.isDraggingChain) {
        // Verify we have all the required objects for a valid dragging state
        if (!window.draggedLink || !window.dragConstraint || !window.draggedBody || !window.activeHand) {
            console.error("Inconsistent dragging state detected, resetting all drag states");
            resetAllDragStates();
        }
        
        // If dragging but neither hand is marked as dragging, we have an inconsistency
        if (!(hands.left.isDragging || hands.right.isDragging)) {
            console.error("isDraggingChain is true but no hand is marked as dragging, resetting all states");
            resetAllDragStates();
        }
    }
    
    // If any hand is marked as dragging but global isDraggingChain is false, reset
    if (!window.isDraggingChain && (hands.left.isDragging || hands.right.isDragging)) {
        console.error("Hand marked as dragging but global isDraggingChain is false, resetting");
        hands.left.isDragging = false;
        hands.right.isDragging = false;
    }

    // Reset hand visibility
    leftFingerMesh.visible = false;
    rightFingerMesh.visible = false;
    leftHandModel.group.visible = false;
    rightHandModel.group.visible = false;

    let statusText = "";
    
    // Keep track of which hands were active before this frame
    const wasLeftActive = hands.left.active;
    const wasRightActive = hands.right.active;
    
    // Reset hand active states for this frame
    hands.left.active = false;
    hands.right.active = false;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Draw instructions on the canvas once per frame
        // Process each detected hand
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label; // "Left" or "Right"

            // Draw hand landmarks on 2D canvas
            drawConnectors(handCtx, landmarks, HAND_CONNECTIONS, {
                color: handedness === 'Left' ? '#0000FF' : '#FF0000',
                lineWidth: 2
            });
            drawLandmarks(handCtx, landmarks, {
                color: handedness === 'Left' ? '#00FFFF' : '#FFFF00',
                lineWidth: 1
            });

            // Note: MediaPipe returns 'Left' for right hand and 'Right' for left hand when viewed in mirror mode
            // Since we're inverting the camera, we'll use the correct mapping (no switch)
            const hand = handedness === 'Right' ? 'right' : 'left';
            
            // Mark this hand as active
            hands[hand].active = true;

            // Store all landmarks for better 3D calculations
            hands[hand].landmarks = landmarks;
            
            // Calculate hand size for depth estimation
            const handSize = Math.sqrt(
                Math.pow(landmarks[0].x - landmarks[9].x, 2) +
                Math.pow(landmarks[0].y - landmarks[9].y, 2) +
                Math.pow(landmarks[0].z - landmarks[9].z, 2)
            );
            
            // Normalize hand size (smaller value = hand is further away)
            const normalizedHandSize = Math.max(0.05, Math.min(0.2, handSize));
            const depthFactor = (normalizedHandSize - 0.05) / 0.15; // 0 to 1 range
            
            try {
                // Update 3D hand model with active finger highlighting
                const handModel = hand === 'left' ? leftHandModel : rightHandModel;
                const handPositions = updateHandModel(handModel, landmarks, depthFactor, hands[hand].activeFingerIndex);
                
                // Record hand activity for tracking purposes
                window.lastHandActivityTime = Date.now();
                
                // Use index finger tip (landmark 8) and thumb tip (landmark 4) for interaction
                hands[hand].indexFingerTip = landmarks[8];
                hands[hand].thumbTip = landmarks[4];
                
                // Check for pinching between thumb and index finger
                const thumbTip = handModel.joints[4].position.clone();
                const indexTip = handModel.joints[8].position.clone();
                const pinchDistance = thumbTip.distanceTo(indexTip);
                
                // Check the confidence of this hand detection
                const handConfidence = results.multiHandedness[i].score;
                
                // Get 3D positions for interaction
                const pinchPosition = new THREE.Vector3().addVectors(thumbTip, indexTip).multiplyScalar(0.5);
                
                // Raw pinch detection based on thresholds and hysteresis
                let rawPinchDetected;
                if (!hands[hand].wasPinching) {
                    // Not currently pinching, use the tighter threshold to start pinching
                    rawPinchDetected = pinchDistance < PINCH_START_THRESHOLD;
                } else {
                    // Already pinching, use the more forgiving threshold to maintain pinch
                    rawPinchDetected = pinchDistance < PINCH_END_THRESHOLD;
                }
                
                // Update consecutive frame counters
                if (rawPinchDetected) {
                    consecutivePinchFrames[hand]++;
                    consecutiveNonPinchFrames[hand] = 0;
                } else {
                    consecutiveNonPinchFrames[hand]++;
                    consecutivePinchFrames[hand] = 0;
                }
                
                // Final pinch detection with confidence and consecutive frame requirements
                let isPinching = false;
                
                // To start pinching: need minimum consecutive pinch frames and good confidence
                if (!hands[hand].wasPinching && 
                    consecutivePinchFrames[hand] >= MIN_PINCH_FRAMES && 
                    handConfidence >= MIN_HAND_CONFIDENCE) {
                    isPinching = true;
                }
                // To maintain pinching: still seeing pinch or haven't seen enough non-pinch frames
                else if (hands[hand].wasPinching && 
                         (rawPinchDetected || consecutiveNonPinchFrames[hand] < MIN_PINCH_FRAMES)) {
                    isPinching = true;
                }
                // Otherwise, not pinching
                else {
                    isPinching = false;
                }
                
                // Log the pinch state and distance for debugging
                if (isPinching !== hands[hand].wasPinching) {
                    console.log(`${hand} pinch state changed to ${isPinching ? 'pinching' : 'not pinching'}, distance: ${pinchDistance.toFixed(2)}, confidence: ${handConfidence.toFixed(2)}`);
                }
                
                // Update status with 3D position information and clear instructions
                statusText += `${hand.charAt(0).toUpperCase() + hand.slice(1)} hand detected: (${pinchPosition.x.toFixed(2)}, ${pinchPosition.y.toFixed(2)}, ${pinchPosition.z.toFixed(2)})\n`;
                statusText += `Pinching: ${isPinching ? 'YES' : 'NO'} (${pinchDistance.toFixed(2)}, conf: ${handConfidence.toFixed(2)})\n`;
                statusText += `Use THUMB and INDEX finger to pinch objects\n`;
                
                // Store the previous pinch state if not defined
                if (hands[hand].wasPinching === undefined) {
                    hands[hand].wasPinching = false;
                }
                
                // Force an immediate release if no pinch is clearly detected
                if (!rawPinchDetected && hands[hand].isDragging) {
                    // If we're dragging but clearly not pinching, force a release
                    console.log(`Forced release for ${hand} - no pinch detected but was dragging`);
                    handleHandMouseUp();
                    hands[hand].isDragging = false;
                    hands[hand].wasPinching = false;
                    if (window.activeHand === hand) window.activeHand = null;
                    
                    // Clear any timeouts
                    if (dragTimeouts[hand]) {
                        clearTimeout(dragTimeouts[hand]);
                        dragTimeouts[hand] = null;
                    }
                }
                
                // Highlight pinching fingers
                if (isPinching) {
                    // Bright yellow highlight for detected pinch
                    handModel.joints[4].material.emissive.set(0xffff00);
                    handModel.joints[4].material.emissiveIntensity = 0.8;
                    handModel.joints[8].material.emissive.set(0xffff00);
                    handModel.joints[8].material.emissiveIntensity = 0.8;
                    
                    // Make pinch points larger for visual feedback
                    handModel.joints[4].scale.set(2, 2, 2);
                    handModel.joints[8].scale.set(2, 2, 2);
                    
                    // Draw a bright connecting line between thumb and index
                    const lineColor = new THREE.Color(0xffff00);
                    handCtx.beginPath();
                    handCtx.strokeStyle = `rgb(${Math.floor(lineColor.r * 255)}, ${Math.floor(lineColor.g * 255)}, ${Math.floor(lineColor.b * 255)})`;
                    handCtx.lineWidth = 6; // Thicker line
                    
                    // Convert 3D positions back to 2D for canvas drawing
                    const thumb2D = {
                        x: landmarks[4].x * handCanvas.width,
                        y: landmarks[4].y * handCanvas.height
                    };
                    const index2D = {
                        x: landmarks[8].x * handCanvas.width,
                        y: landmarks[8].y * handCanvas.height
                    };
                    
                    // Draw the main line
                    handCtx.moveTo(thumb2D.x, thumb2D.y);
                    handCtx.lineTo(index2D.x, index2D.y);
                    handCtx.stroke();
                    
                    // Draw circles at the pinch points
                    handCtx.fillStyle = 'rgba(255, 255, 0, 0.7)';
                    handCtx.beginPath();
                    handCtx.arc(thumb2D.x, thumb2D.y, 15, 0, Math.PI * 2);
                    handCtx.fill();
                    handCtx.beginPath();
                    handCtx.arc(index2D.x, index2D.y, 15, 0, Math.PI * 2);
                    handCtx.fill();
                    
                    // Add a "PINCHING" indicator near the pinch
                    const midX = (thumb2D.x + index2D.x) / 2;
                    const midY = (thumb2D.y + index2D.y) / 2 - 25;
                    
                    // Also add a 3D visual effect at the pinch point in the 3D scene
                    addHapticFeedback(pinchPosition, 0.3);
                    
                    // Track that we were pinching
                    hands[hand].wasPinching = true;
                    
                    // Handle pinch interaction
                    if (!hands[hand].isDragging) {
                        // Only trigger mousedown if not already dragging
                        const success = handleHandMouseDown(pinchPosition);
                        
                        if (success && window.isDraggingChain) {
                            hands[hand].isDragging = true;
                            window.activeHand = hand;
                            
                            // Set a timeout to automatically release the drag if it stays active too long
                            // (failsafe for tracking issues)
                            if (dragTimeouts[hand]) {
                                clearTimeout(dragTimeouts[hand]);
                            }
                            dragTimeouts[hand] = setTimeout(() => {
                                if (hands[hand].isDragging) {
                                    console.log("Failsafe: Releasing drag after timeout");
                                    handleHandMouseUp();
                                    hands[hand].isDragging = false;
                                    window.activeHand = null;
                                    hands[hand].wasPinching = false;
                                }
                            }, MAX_DRAG_TIME);
                        }
                    } else if (hands[hand].isDragging) {
                        // Update position while dragging
                        handleHandMouseMove(pinchPosition);
                        
                        // Renew the timeout as we're still actively dragging
                        if (dragTimeouts[hand]) {
                            clearTimeout(dragTimeouts[hand]);
                        }
                        dragTimeouts[hand] = setTimeout(() => {
                            if (hands[hand].isDragging) {
                                console.log("Failsafe: Releasing drag after timeout");
                                handleHandMouseUp();
                                hands[hand].isDragging = false;
                                window.activeHand = null;
                                hands[hand].wasPinching = false;
                            }
                        }, MAX_DRAG_TIME);
                    }
                } else {
                    // Reset pinch highlights with red color for clear visual feedback that pinch is NOT detected
                    handModel.joints[4].material.emissive.set(0xff0000);
                    handModel.joints[4].material.emissiveIntensity = 0.3;
                    handModel.joints[8].material.emissive.set(0xff0000);
                    handModel.joints[8].material.emissiveIntensity = 0.3;
                    handModel.joints[4].scale.set(1, 1, 1);
                    handModel.joints[8].scale.set(1, 1, 1);
                    
                    // Clear any drag timeouts
                    if (dragTimeouts[hand]) {
                        clearTimeout(dragTimeouts[hand]);
                        dragTimeouts[hand] = null;
                    }
                    
                    // If we were previously pinching but now we're not, release the drag
                    if (hands[hand].wasPinching && hands[hand].isDragging) {
                        console.log("Pinch released, ending drag");
                        handleHandMouseUp();
                        hands[hand].isDragging = false;
                        window.activeHand = null;
                    }
                    
                    // Update pinch tracking
                    hands[hand].wasPinching = false;
                }
            } catch (error) {
                console.error("Error processing hand:", error);
            }
        }

        isHandTracking = true;
        
        // Check if both hands are detected
        if (hands.left.active && hands.right.active && !bothHandsAnnounced && speechSynthesisInitialized) {
            // Only announce if the game hasn't started yet
            if (typeof gameStarted !== 'undefined' && !gameStarted) {
                console.log("Both hands detected - announcing via TTS");
                speakText("Both hands detected. Please say a difficulty.");
                bothHandsAnnounced = true;
                
                // Add a visual indicator for the announcement
                statusText += "VOICE COMMAND: Please say a difficulty level\n";
            }
        } else if (!(hands.left.active && hands.right.active)) {
            // Reset announcement flag when both hands are no longer detected
            bothHandsAnnounced = false;
        }
    } else {
        statusText = "No hands detected";
        isHandTracking = false;
        
        // Release any constraints if hands are no longer detected
        if (window.isDraggingChain && window.activeHand) {
            handleHandMouseUp();
            
            if (hands.left.isDragging) hands.left.isDragging = false;
            if (hands.right.isDragging) hands.right.isDragging = false;
            window.activeHand = null;
        }
        
        // Reset announcement state when no hands are detected
        bothHandsAnnounced = false;
    }
    
    // Check for hands that were active but now disappeared
    if (wasLeftActive && !hands.left.active && hands.left.isDragging) {
        console.log("Left hand was lost during dragging, releasing constraint");
        handleHandMouseUp();
        hands.left.isDragging = false;
        if (window.activeHand === 'left') window.activeHand = null;
        hands.left.wasPinching = false;
        
        // Clear any timeouts
        if (dragTimeouts.left) {
            clearTimeout(dragTimeouts.left);
            dragTimeouts.left = null;
        }
    }
    
    if (wasRightActive && !hands.right.active && hands.right.isDragging) {
        console.log("Right hand was lost during dragging, releasing constraint");
        handleHandMouseUp();
        hands.right.isDragging = false;
        if (window.activeHand === 'right') window.activeHand = null;
        hands.right.wasPinching = false;
        
        // Clear any timeouts
        if (dragTimeouts.right) {
            clearTimeout(dragTimeouts.right);
            dragTimeouts.right = null;
        }
    }

    statusElement.textContent = statusText;
    handCtx.restore();
});

// Function to release constraints for a specific hand
function releaseHandConstraints(hand) {
    if (hands[hand].isDragging) {
        handleHandMouseUp();
        hands[hand].isDragging = false;
        window.activeHand = null;
    }

    // Hide finger representation
    if (hand === 'left') {
        leftFingerMesh.visible = false;
    } else {
        rightFingerMesh.visible = false;
    }
}

// Set up camera
const camera2 = new Camera(video, {
    onFrame: async () => {
        await mpHands.send({ image: video });
    },
    width: 640,
    height: 480
});

camera2.start().then(() => {
    console.log("Camera started");
    statusElement.textContent = "Camera started, waiting for hand detection...";
    // Invert the camera display
    document.getElementById('videoElement').style.transform = 'scaleX(-1)';
    document.getElementById('handCanvas').style.transform = 'scaleX(-1)';
    
    // Initialize debug visualization
    initDebugVisualization();
    
    // Add a periodic reset check to catch any stuck state
    setInterval(() => {
        // If we think we're dragging but both hands are inactive for some time, reset
        if (window.isDraggingChain && 
            !hands.left.active && !hands.right.active) {
            console.log("Safety reset: Dragging with inactive hands");
            resetAllDragStates();
        }
        
        // If it's been more than 5 seconds since we detected any hand movement
        // and we're still in a dragging state, reset as a precaution
        const now = Date.now();
        if (window.isDraggingChain && 
            window.lastHandActivityTime && 
            (now - window.lastHandActivityTime > 5000)) {
            console.log("Safety reset: No hand activity for 5 seconds while dragging");
            resetAllDragStates();
        }
    }, 1000); // Run this check every second
    
}).catch(err => {
    console.error("Error starting camera: ", err);
    statusElement.textContent = "Error starting camera. Please check permissions.";
});

// Initialize last hand activity timestamp
window.lastHandActivityTime = Date.now(); 