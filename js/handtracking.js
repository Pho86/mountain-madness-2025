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
        dragConstraint: null
    },
    right: {
        active: false,
        indexFingerTip: null,
        thumbTip: null,
        isDragging: false,
        draggedLink: null,
        draggedBody: null,
        originalMaterial: null,
        dragConstraint: null
    }
};

// Visual representation of fingers in 3D scene
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

// Process results from hand tracking
mpHands.onResults(results => {
    handCtx.save();
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);

    // Draw the camera feed on the canvas
    handCtx.drawImage(results.image, 0, 0, handCanvas.width, handCanvas.height);

    // Reset hand visibility
    leftFingerMesh.visible = false;
    rightFingerMesh.visible = false;

    let statusText = "";

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Process each detected hand
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label; // "Left" or "Right"

            // Draw hand landmarks
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

            // Use index finger tip (landmark 8) and thumb tip (landmark 4) for interaction
            hands[hand].indexFingerTip = landmarks[8];
            hands[hand].thumbTip = landmarks[4];

            // Convert to normalized device coordinates (-1 to 1 for both x and y)
            // Do not flip the x-coordinate (we want non-mirrored view)
            const x = (hands[hand].indexFingerTip.x * 2) - 1; // Convert from [0,1] to [-1,1] without flipping
            const y = -((hands[hand].indexFingerTip.y * 2) - 1); // Convert and invert Y

            // Update status
            statusText += `${hand.charAt(0).toUpperCase() + hand.slice(1)} hand detected: (${x.toFixed(2)}, ${y.toFixed(2)}, ${hands[hand].indexFingerTip.z.toFixed(2)})\n`;

            // Check if finger is "active" (pointing forward)
            // Use Z coordinate of index finger tip vs index finger PIP joint (landmark 6)
            const fingerExtended = hands[hand].indexFingerTip.z < landmarks[6].z - 0.05;
            hands[hand].active = fingerExtended;

            if (hands[hand].active && canInteract()) {
                // Interact with 3D scene using finger position
                interactWithSceneUsingFinger(hand, x, y, hands[hand].indexFingerTip.z);
            } else {
                // If not active or can't interact, release any constraints for this hand
                releaseHandConstraints(hand);
            }
        }

        isHandTracking = true;
    } else {
        statusText = "No hands detected";
        isHandTracking = false;

        // Release any constraints
        releaseHandConstraints('left');
        releaseHandConstraints('right');
    }

    statusElement.textContent = statusText;
    handCtx.restore();
});

// Function to release constraints for a specific hand
function releaseHandConstraints(hand) {
    if (hands[hand].dragConstraint) {
        world.removeConstraint(hands[hand].dragConstraint);
        hands[hand].dragConstraint = null;

        if (hands[hand].draggedLink) {
            hands[hand].draggedLink.material = hands[hand].originalMaterial;
            hands[hand].draggedLink = null;
            hands[hand].originalMaterial = null;
        }

        hands[hand].isDragging = false;
        hands[hand].draggedBody = null;
    }

    // Hide finger representation
    if (hand === 'left') {
        leftFingerMesh.visible = false;
    } else {
        rightFingerMesh.visible = false;
    }
}

// Function to interact with the scene using finger position
function interactWithSceneUsingFinger(hand, x, y, z) {
    // Don't interact if game is over or not started
    if (!canInteract()) {
        // Still show the finger representation
        const fingerMesh = hand === 'left' ? leftFingerMesh : rightFingerMesh;
        fingerMesh.visible = true;
        
        // Create a ray from the camera through the finger position
        const fingerRaycaster = hand === 'left' ? leftFingerRaycaster : rightFingerRaycaster;
        const invertedX = -x;
        fingerRaycaster.setFromCamera(new THREE.Vector2(invertedX, y), camera);
        
        // Calculate 3D position along the ray
        const fingerPosition = new THREE.Vector3();
        fingerRaycaster.ray.at(10, fingerPosition); // Fixed distance when not interacting
        
        // Update the visual representation of the finger
        fingerMesh.position.copy(fingerPosition);
        
        return;
    }
    
    // Get the appropriate objects for this hand
    const fingerMesh = hand === 'left' ? leftFingerMesh : rightFingerMesh;
    const jointBody = hand === 'left' ? leftJointBody : rightJointBody;
    const fingerRaycaster = hand === 'left' ? leftFingerRaycaster : rightFingerRaycaster;

    // Make the finger visible
    fingerMesh.visible = true;

    // Invert the x value to fix the movement direction
    const invertedX = -x;

    // Create a ray from the camera through the finger position
    fingerRaycaster.setFromCamera(new THREE.Vector2(invertedX, y), camera);

    // Get distance factor from z value (further = more distance)
    // Map z from roughly [-0.1, 0.1] to distance of [5, 15]
    const distance = -((z + 0.3) / 0.6) * 20 + 5;

    // Calculate 3D position along the ray
    const fingerPosition = new THREE.Vector3();
    fingerRaycaster.ray.at(distance, fingerPosition);

    // Update the visual representation of the finger
    fingerMesh.position.copy(fingerPosition);

    // Check for pinching
    const thumbTip = hands[hand].thumbTip;
    const indexFingerTip = hands[hand].indexFingerTip;

    // Calculate the distance between the thumb tip and index finger tip
    const pinchDistance = Math.sqrt(
        Math.pow(thumbTip.x - indexFingerTip.x, 2) +
        Math.pow(thumbTip.y - indexFingerTip.y, 2) +
        Math.pow(thumbTip.z - indexFingerTip.z, 2)
    );

    // Define a threshold for pinching (adjust as needed)
    const pinchThreshold = 0.15; // Example threshold

    // Check if pinching is detected
    const isPinching = pinchDistance < pinchThreshold;

    // Check for intersections with chain links
    const allLinks = [];
    chains.forEach(chain => {
        chain.children.forEach(link => {
            // Only include actual links, not end caps
            if (link.userData.linkIndex !== undefined) {
                allLinks.push(link);
            }
        });
    });

    const intersects = fingerRaycaster.intersectObjects(allLinks);

    if (isPinching) {
        if (intersects.length > 0 && !hands[hand].isDragging) {
            // Start dragging the chain
            hands[hand].isDragging = true;
            hands[hand].draggedLink = intersects[0].object;
            hands[hand].originalMaterial = hands[hand].draggedLink.material;
            hands[hand].draggedLink.material = selectedMaterial;

            const chainIndex = hands[hand].draggedLink.userData.chainIndex;
            const linkIndex = hands[hand].draggedLink.userData.linkIndex;
            hands[hand].draggedBody = chainBodies[chainIndex][linkIndex];

            // Position joint body at the finger position
            jointBody.position.copy(fingerPosition);

            // Create constraint
            hands[hand].dragConstraint = new CANNON.PointToPointConstraint(
                hands[hand].draggedBody,
                new CANNON.Vec3().copy(hands[hand].draggedBody.position).vsub(fingerPosition),
                jointBody,
                new CANNON.Vec3(0, 0, 0),
                20 // Force strength
            );

            world.addConstraint(hands[hand].dragConstraint);
        } else if (hands[hand].isDragging && hands[hand].dragConstraint) {
            // Update the joint body position to follow the finger
            jointBody.position.copy(fingerPosition);
        }
    } else {
        // Release the chain if not pinching
        releaseHandConstraints(hand);
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
}).catch(err => {
    console.error("Error starting camera: ", err);
    statusElement.textContent = "Error starting camera. Please check permissions.";
}); 