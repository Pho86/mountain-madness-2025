/* --- MEDIAPIPE DUAL HAND TRACKING INTEGRATION --- */

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
        activeFingerIndex: -1
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
        activeFingerIndex: -1
    }
};

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
            } else {
                // Reset other joints
                joint.material.emissive.set(baseColor);
                joint.material.emissiveIntensity = 0.3;
                joint.scale.set(1, 1, 1);
            }
        } else {
            // No active finger, reset all joints
            joint.material.emissive.set(baseColor);
            joint.material.emissiveIntensity = 0.3;
            joint.scale.set(1, 1, 1);
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
            } else {
                // Reset other bones
                bone.material.emissive.set(baseColor);
                bone.material.emissiveIntensity = 0.3;
                bone.scale.x = 1;
                bone.scale.z = 1;
            }
        } else {
            // No active finger, reset all bones
            bone.material.emissive.set(baseColor);
            bone.material.emissiveIntensity = 0.3;
            bone.scale.x = 1;
            bone.scale.z = 1;
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
    context.fillText('Hand Tracking Debug', canvas.width / 2, canvas.height / 2);

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
        context.fillText(line, canvas.width / 2, y);
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
    const animate = function () {
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
            world.removeConstraint(window.dragConstraint);
            window.dragConstraint = null;
            console.log("Constraint removed");
        }

        window.isDraggingChain = false;
        window.draggedBody = null;

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

    return false;
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
document.addEventListener('DOMContentLoaded', function () {
    speechSynthesisInitialized = true;
    console.log("Speech synthesis initialized");
});

// Process results from hand tracking
mpHands.onResults(results => {
    handCtx.save();
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);

    // Draw the camera feed on the canvas
    handCtx.drawImage(results.image, 0, 0, handCanvas.width, handCanvas.height);

    // Reset hand visibility
    leftFingerMesh.visible = false;
    rightFingerMesh.visible = false;
    leftHandModel.group.visible = false;
    rightHandModel.group.visible = false;

    let statusText = "";

    // Reset hand active states for this frame
    hands.left.active = false;
    hands.right.active = false;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
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

                // Use index finger tip (landmark 8) and thumb tip (landmark 4) for interaction
                hands[hand].indexFingerTip = landmarks[8];
                hands[hand].thumbTip = landmarks[4];

                // Check for pinching between thumb and index finger
                const thumbTip = handModel.joints[4].position.clone();
                const indexTip = handModel.joints[8].position.clone();
                const pinchDistance = thumbTip.distanceTo(indexTip);
                const isPinching = pinchDistance < 1.2; // Pinch threshold

                // Get 3D positions for interaction
                const pinchPosition = new THREE.Vector3().addVectors(thumbTip, indexTip).multiplyScalar(0.5);

                // Update status with 3D position information
                statusText += `${hand.charAt(0).toUpperCase() + hand.slice(1)} hand detected: (${pinchPosition.x.toFixed(2)}, ${pinchPosition.y.toFixed(2)}, ${pinchPosition.z.toFixed(2)})\n`;
                statusText += `Pinching: ${isPinching ? 'YES' : 'NO'}\n`;

                // Highlight pinching fingers
                if (isPinching) {
                    handModel.joints[4].material.emissive.set(0xffff00);
                    handModel.joints[4].material.emissiveIntensity = 0.8;
                    handModel.joints[8].material.emissive.set(0xffff00);
                    handModel.joints[8].material.emissiveIntensity = 0.8;

                    // Handle pinch interaction
                    if (!hands[hand].isDragging) {
                        // Only trigger mousedown if not already dragging
                        const success = handleHandMouseDown(pinchPosition);

                        if (success && window.isDraggingChain) {
                            hands[hand].isDragging = true;
                            window.activeHand = hand;
                        }
                    } else if (hands[hand].isDragging) {
                        // Update position while dragging
                        handleHandMouseMove(pinchPosition);
                    }
                } else if (hands[hand].isDragging) {
                    // Release if no longer pinching
                    handleHandMouseUp();
                    hands[hand].isDragging = false;
                    window.activeHand = null;
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
}).catch(err => {
    console.error("Error starting camera: ", err);
    statusElement.textContent = "Error starting camera. Please check permissions.";
}); 