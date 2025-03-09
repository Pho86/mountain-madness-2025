// Variables for chains
const chains = [];
const chainBodies = [];
const linkRadius = 0.3;
const linkHeight = 0.5;
const numLinks = 100;
const chainDistance = 1.5;

// Knot measurement configuration
const KNOT_CONFIG = {
    launchDuration: 60,         // Duration of the launch phase in frames
    launchForce: 30,            // Force to launch the rope upward (increased for more height)
    measurementDelay: 120,      // Delay before measuring after launch (to let the rope settle)
    measureDuration: 60,        // Duration of the measurement phase
    isActive: false,            // Whether knot measurement is currently active
    currentStep: 0,             // Current step in the measurement process
    originalPositions: [],      // Original positions before measurement
    originalGravity: null,      // Original gravity
    startEndDistance: 0,        // Distance between start and end points
    pathLength: 0,              // Total path length
    knotFactor: 0               // Calculated knot factor
};

// Create visual indicators for the measurement process
let measurementIndicators = [];
let originalGravity = new CANNON.Vec3(0, -9.82, 0);

// Use cell shading material for the chain
const chainMaterial = cellShadingMaterial.clone();
// Change the color to beige
chainMaterial.uniforms.lightDirection = { value: new THREE.Vector3(1, 1, 1).normalize() };
chainMaterial.fragmentShader = `
    uniform vec3 lightDirection;
    varying vec3 vNormal;
    void main() {
        float intensity = dot(vNormal, lightDirection);
        if (intensity > 0.95) intensity = 1.0;
        else if (intensity > 0.5) intensity = 0.6;
        else if (intensity > 0.25) intensity = 0.4;
        else intensity = 0.2;
        vec3 beigeColor = vec3(0.96, 0.87, 0.7); // Beige color
        gl_FragColor = vec4(beigeColor * intensity, 1.0);
    }
`;

const selectedMaterial = new THREE.MeshStandardMaterial({
    color: 0xff5555,
    roughness: 0.4,
    metalness: 0.8
});

// Create joint bodies for dragging (one for each hand)
const leftJointBody = new CANNON.Body({ mass: 0 });
leftJointBody.addShape(new CANNON.Sphere(0.1));
leftJointBody.collisionFilterGroup = 0;
leftJointBody.collisionFilterMask = 0;
world.addBody(leftJointBody);

const rightJointBody = new CANNON.Body({ mass: 0 });
rightJointBody.addShape(new CANNON.Sphere(0.1));
rightJointBody.collisionFilterGroup = 0;
rightJointBody.collisionFilterMask = 0;
world.addBody(rightJointBody);

// Knot measurement variables
let isMeasuringKnot = false;
let knotMeasurementStartTime = 0;
let stretchDirection = new CANNON.Vec3(0, -1, 0);

const KNOT_MEASUREMENT_CONFIG = {
    measurementDuration: 8000,    // 8 seconds total measurement time
    stretchForce: 5,             // Reduced stretching force
    restoreForce: 10,            // Force to restore the chain to original state
    maxStretchImpulse: 20,       // Maximum impulse to apply to any link
    stretchIncrement: 0.02,      // Reduced stretch force increment per frame
    idealLengthPerLink: 1.5,     // The expected straight length per link
    recoveryTime: 3000,          // Time to recover after measurement
    dampingDuringStretch: 0.8,   // Additional damping during stretch
    minStretchDistance: 0.5,     // Minimum distance between links during stretch
    maxStretchAngle: Math.PI / 6 // Maximum angle between consecutive links
};

// Function to create a chain
function createChain(position) {
    const chain = new THREE.Group();
    const bodies = [];
    
    const physicalMaterial = new CANNON.Material();
    
    // Create an anchor point at the bottom
    const anchorGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const anchorMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513, // Brown color for the anchor
        roughness: 0.7,
        metalness: 0.3
    });
    const anchorMesh = new THREE.Mesh(anchorGeometry, anchorMaterial);
    anchorMesh.position.set(position.x, CONFIG.floorDistance + 0.5, position.z); // Position at floor level
    anchorMesh.castShadow = true;
    anchorMesh.receiveShadow = true;
    scene.add(anchorMesh);
    
    // Create anchor body (fixed to ground)
    const anchorBody = new CANNON.Body({
        mass: 0, // Zero mass makes it immovable
        material: physicalMaterial
    });
    anchorBody.addShape(new CANNON.Sphere(0.5));
    anchorBody.position.set(position.x, CONFIG.floorDistance + 0.5, position.z);
    world.addBody(anchorBody);
    bodies.push(anchorBody);
    
    // Create the first link at the anchor position but slightly above
    const firstLinkGeometry = new THREE.CylinderGeometry(linkRadius, linkRadius, linkHeight, 16);
    const firstLink = new THREE.Mesh(firstLinkGeometry, chainMaterial.clone());
    firstLink.castShadow = true;
    firstLink.position.set(position.x, CONFIG.floorDistance + 1.5, position.z); // Position above the anchor
    firstLink.userData.chainIndex = chains.length;
    firstLink.userData.linkIndex = 0;
    chain.add(firstLink);
    
    // First link body
    const firstLinkBody = new CANNON.Body({
        mass: 0.5, // Lighter mass for the first link
        material: physicalMaterial,
        linearDamping: CONFIG.damping,
        angularDamping: CONFIG.angularDamping
    });
    firstLinkBody.addShape(new CANNON.Cylinder(linkRadius, linkRadius, linkHeight, 16));
    firstLinkBody.position.set(position.x, CONFIG.floorDistance + 1.5, position.z);
    world.addBody(firstLinkBody);
    bodies.push(firstLinkBody);
    
    // Connect first link to anchor with a constraint
    const anchorConstraint = new CANNON.PointToPointConstraint(
        anchorBody,
        new CANNON.Vec3(0, 0.5, 0), // Top of anchor
        firstLinkBody,
        new CANNON.Vec3(0, -linkHeight/2, 0), // Bottom of first link
        100 // Strong constraint
    );
    world.addConstraint(anchorConstraint);
    
    // Create the rest of the chain
    for (let i = 1; i < numLinks; i++) {
        // Three.js geometry
        const linkGeometry = new THREE.CylinderGeometry(linkRadius, linkRadius, linkHeight, 16);
        
        if (i % 2 === 1) {
            linkGeometry.rotateZ(Math.PI / 2);
        }
        
        const link = new THREE.Mesh(linkGeometry, chainMaterial.clone());
        link.castShadow = true;
        link.position.y = CONFIG.floorDistance + 1.5 + i * chainDistance;
        link.userData.chainIndex = chains.length;
        link.userData.linkIndex = i;
        chain.add(link);
        
        // CANNON.js body
        const linkShape = new CANNON.Cylinder(linkRadius, linkRadius, linkHeight, 16);
        const linkBody = new CANNON.Body({
            mass: 1,
            material: physicalMaterial,
            linearDamping: CONFIG.damping,
            angularDamping: CONFIG.angularDamping
        });
        
        if (i % 2 === 1) {
            linkBody.addShape(linkShape, new CANNON.Vec3(), new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2));
        } else {
            linkBody.addShape(linkShape);
        }
        
        linkBody.position.set(position.x, CONFIG.floorDistance + 1.5 + i * chainDistance, position.z);
        world.addBody(linkBody);
        bodies.push(linkBody);
        
        // Constraints to connect links
        const constraint = new CANNON.ConeTwistConstraint(bodies[i], bodies[i-1], {
            pivotA: new CANNON.Vec3(0, -linkHeight / 2, 0),
            pivotB: new CANNON.Vec3(0, linkHeight / 2, 0),
            axisA: new CANNON.Vec3(0, 1, 0),
            axisB: new CANNON.Vec3(0, 1, 0),
            angle: Math.PI / 8,
            twistAngle: Math.PI / 4
        });
        world.addConstraint(constraint);
    }
    
    scene.add(chain);
    chains.push(chain);
    chainBodies.push(bodies);
    
    return { chain, bodies };
}

// Function to add rope ends
function addRopeEnds(chain, bodies) {
    // Add a cap at the start of the rope
    const startCapGeometry = new THREE.SphereGeometry(linkRadius * 1.2, 16, 16);
    const endCapGeometry = new THREE.SphereGeometry(linkRadius * 1.2, 16, 16);
    
    const capMaterial = cellShadingMaterial.clone();
    
    const startCap = new THREE.Mesh(startCapGeometry, capMaterial);
    startCap.castShadow = true;
    startCap.position.copy(chain.children[0].position);
    startCap.position.y += linkHeight / 2;
    chain.add(startCap);
    
    const endCap = new THREE.Mesh(endCapGeometry, capMaterial);
    endCap.castShadow = true;
    endCap.position.copy(chain.children[numLinks - 1].position);
    endCap.position.y -= linkHeight / 2;
    chain.add(endCap);
}

// Function to reset the rope
function resetRope() {
    console.log("Resetting rope...");
    
    // Remove all chains except the first one
    for (let i = chains.length - 1; i > 0; i--) {
        scene.remove(chains[i]);
        
        // Remove bodies and constraints
        for (const body of chainBodies[i]) {
            world.remove(body);
        }
        
        chains.splice(i, 1);
        chainBodies.splice(i, 1);
    }
    
    // If there's no chain, create one
    if (chains.length === 0) {
        createChain(new THREE.Vector3(0, CONFIG.floorDistance, 0));
        return;
    }
    
    // Reset first chain position
    for (let i = 0; i < chainBodies[0].length; i++) {
        if (i === 0) {
            // Skip the anchor (first body)
            continue;
        } else if (i === 1) {
            // First link above the anchor
            chainBodies[0][i].position.set(0, CONFIG.floorDistance + 1.5, 0);
        } else {
            // Rest of the chain
            chainBodies[0][i].position.set(0, CONFIG.floorDistance + 1.5 + (i-1) * chainDistance, 0);
        }
        
        // Reset physics
        chainBodies[0][i].velocity.set(0, 0, 0);
        chainBodies[0][i].angularVelocity.set(0, 0, 0);
        chainBodies[0][i].quaternion.set(0, 0, 0, 1);
    }
    
    console.log("Rope reset complete");
}

// Mouse interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
const intersection = new THREE.Vector3();
let isDraggingChain = false;
let draggedLink = null;
let draggedBody = null;
let originalMaterial = null;
let dragConstraint = null;
let previousMousePosition = new THREE.Vector3();

// Get mouse position in 3D space
function getMousePosition(event, target) {
    // Calculate mouse position
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Update the picking ray with the camera and mouse position
    raycaster.setFromCamera(mouse, camera);
    
    // Calculate the 3D position
    raycaster.ray.intersectPlane(mousePlane, target);
    
    return target;
}

// Handle mouse down for drag interaction
window.addEventListener('mousedown', (event) => {
    // Don't interact if game is over or not started
    if (!canInteract()) return;
    
    // Update mouse position
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    
    // Check for intersections with all chain links
    const allLinks = [];
    chains.forEach(chain => {
        chain.children.forEach(link => {
            // Only include actual links, not end caps
            if (link.userData.linkIndex !== undefined) {
                allLinks.push(link);
            }
        });
    });
    
    const intersects = raycaster.intersectObjects(allLinks);
    
    if (intersects.length > 0) {
        isDraggingChain = true;
        draggedLink = intersects[0].object;
        originalMaterial = draggedLink.material;
        draggedLink.material = selectedMaterial;
        
        const chainIndex = draggedLink.userData.chainIndex;
        const linkIndex = draggedLink.userData.linkIndex;
        draggedBody = chainBodies[chainIndex][linkIndex];
        
        // Convert intersection point to world coordinates
        const intersectionPoint = intersects[0].point;
        
        // Position joint body at the intersection point
        leftJointBody.position.copy(intersectionPoint);
        
        // Create a distance constraint between leftJointBody and draggedBody
        dragConstraint = new CANNON.PointToPointConstraint(
            draggedBody,
            new CANNON.Vec3().copy(draggedBody.position).vsub(intersectionPoint),
            leftJointBody,
            new CANNON.Vec3(0, 0, 0),
            20 // Force strength
        );
        
        world.addConstraint(dragConstraint);
        
        // Remember the mouse position for dragging
        getMousePosition(event, previousMousePosition);
        
        // Update the mouse plane to face the camera
        mousePlane.normal.copy(camera.getWorldDirection(new THREE.Vector3()));
    } else {
        // Start camera rotation only if not clicking on a chain
        isDraggingCamera = true;
        previousCameraPosition = { x: event.clientX, y: event.clientY };
    }
});

window.addEventListener('mousemove', (event) => {
    // Don't interact if game is over or not started
    if (!canInteract() && isDraggingChain) {
        // Release the chain if we can't interact anymore
        if (draggedLink) {
            draggedLink.material = originalMaterial;
            draggedLink = null;
            originalMaterial = null;
        }
        
        // Remove constraint
        if (dragConstraint) {
            world.removeConstraint(dragConstraint);
            dragConstraint = null;
        }
        
        isDraggingChain = false;
        draggedBody = null;
        return;
    }
    
    if (isDraggingChain && draggedBody && dragConstraint) {
        // Move joint body to new mouse position
        const mousePosition = getMousePosition(event, new THREE.Vector3());
        leftJointBody.position.copy(mousePosition);
        previousMousePosition.copy(mousePosition);
    } else if (isDraggingCamera) {
        // Handle camera rotation
        handleCameraRotation(event);
    }
});

window.addEventListener('mouseup', (event) => {
    if (isDraggingChain) {
        // Reset dragging state
        if (draggedLink) {
            draggedLink.material = originalMaterial;
            draggedLink = null;
            originalMaterial = null;
        }
        
        // Remove constraint
        if (dragConstraint) {
            world.removeConstraint(dragConstraint);
            dragConstraint = null;
        }
        
        isDraggingChain = false;
        draggedBody = null;
    }
    
    isDraggingCamera = false;
});

// Improved knot detection for rope physics
function detectKnots() {
    if (!gameStarted) return false;
    
    // Only check periodically to avoid performance issues
    const now = Date.now();
    if (now - lastKnotCheck < knotCheckInterval) return false;
    lastKnotCheck = now;
    
    let knotFound = false;
    
    // Check each rope for knots
    for (let c = 0; c < chains.length; c++) {
        const chain = chains[c];
        
        // Skip if the chain doesn't have enough links
        if (chain.children.length < numLinks) continue;
        
        const links = chain.children;
        const knotThreshold = linkRadius * 2; // Distance threshold for detecting knots
        
        // Check for crossings between non-adjacent links
        // Only check a subset of links for performance with the longer rope
        const checkStep = 3; // Check every 3rd link
        for (let i = 0; i < numLinks; i += checkStep) {
            // Start checking from links that are at least 10 links away
            for (let j = i + 10; j < numLinks; j += checkStep) {
                // Skip links that are too close in the chain
                if (j - i <= 10) continue;
                
                // Calculate distance between non-adjacent links
                const distance = links[i].position.distanceTo(links[j].position);
                
                // If distance is less than threshold, we found a potential knot
                if (distance < knotThreshold) {
                    console.log(`Knot detected between links ${i} and ${j} in chain ${c}`);
                    
                    // Check if the links are actually crossing (not just close)
                    // This uses the tangling complexity as an additional check
                    if (currentTangleComplexity > 0.1) {
                        knotFound = true;
                        
                        // Update score based on complexity
                        const scoreValue = Math.max(1, Math.floor(currentTangleComplexity * 10));
                        updateScore(scoreValue);
                        
                        // Add visual feedback at the knot location
                        const knotPosition = new THREE.Vector3().addVectors(
                            links[i].position,
                            links[j].position
                        ).multiplyScalar(0.5);
                        
                        // Create a temporary visual effect at the knot location
                        const knotEffect = new THREE.Mesh(
                            new THREE.SphereGeometry(linkRadius * 1.5, 16, 16),
                            new THREE.MeshBasicMaterial({
                                color: 0xFFD700,
                                transparent: true,
                                opacity: 0.7
                            })
                        );
                        knotEffect.position.copy(knotPosition);
                        scene.add(knotEffect);
                        
                        // Remove the effect after a short time
                        setTimeout(() => {
                            scene.remove(knotEffect);
                        }, 500);
                        
                        // Only count one knot per check to avoid multiple scores for the same knot
                        return true;
                    }
                }
            }
        }
    }
    
    return knotFound;
}

// Function to start knot measurement
function startKnotMeasurement() {
    if (KNOT_CONFIG.isActive) {
        console.log("Knot measurement already in progress");
        return;
    }
    
    console.log("Starting knot measurement");
    
    // Store original gravity
    KNOT_CONFIG.originalGravity = world.gravity.clone();
    
    // Store original positions for the first chain
    storeChainState(0);
    
    // Create visual indicator for measurement
    createMeasurementIndicator();
    
    // Reset measurement values
    KNOT_CONFIG.isActive = true;
    KNOT_CONFIG.currentStep = 0;
    KNOT_CONFIG.startEndDistance = 0;
    KNOT_CONFIG.pathLength = 0;
    KNOT_CONFIG.knotFactor = 0;
    
    // Update UI
    document.getElementById('measureKnot').textContent = "Measuring...";
    document.getElementById('measureKnot').disabled = true;
    
    // Add visual effect for measurement start
    addMeasurementStartEffect();
}

// Function to add visual effect for measurement start
function addMeasurementStartEffect() {
    // Create a pulse effect around the rope
    const pulseGeometry = new THREE.SphereGeometry(1, 32, 32);
    const pulseMaterial = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.5
    });
    
    const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
    
    // Position at the middle of the rope
    const middleIndex = Math.floor(chainBodies[0].length / 2);
    const middlePosition = chainBodies[0][middleIndex].position.clone();
    pulse.position.copy(middlePosition);
    
    scene.add(pulse);
    
    // Animate the pulse
    const startTime = Date.now();
    const duration = 1000; // 1 second
    
    const animatePulse = function() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;
        
        if (progress < 1) {
            // Scale up and fade out
            const scale = 1 + progress * 10;
            pulse.scale.set(scale, scale, scale);
            pulseMaterial.opacity = 0.5 * (1 - progress);
            
            requestAnimationFrame(animatePulse);
        } else {
            // Remove when animation is complete
            scene.remove(pulse);
        }
    };
    
    animatePulse();
}

// Function to process a step in the knot measurement
function measureKnotStep(chainIndex, originalGravity) {
    const bodies = chainBodies[chainIndex];
    
    // Skip if no bodies
    if (!bodies || bodies.length === 0) {
        console.error("No bodies found for chain", chainIndex);
        endKnotMeasurement(false, originalGravity);
        return;
    }
    
    // Increment step counter
    KNOT_CONFIG.currentStep++;
    
    // Launch phase - apply upward force to all bodies
    if (KNOT_CONFIG.currentStep <= KNOT_CONFIG.launchDuration) {
        // Calculate progress through launch phase (0 to 1)
        const launchProgress = KNOT_CONFIG.currentStep / KNOT_CONFIG.launchDuration;
        
        // Apply upward force with a bell curve pattern (strongest in the middle)
        const forceFactor = Math.sin(launchProgress * Math.PI);
        const launchForce = KNOT_CONFIG.launchForce * forceFactor;
        
        // Apply to all bodies except anchor
        for (let i = 1; i < bodies.length; i++) {
            const body = bodies[i];
            
            // Apply upward force
            const force = new CANNON.Vec3(0, launchForce, 0);
            
            // Add some random horizontal force for more interesting movement
            force.x += (Math.random() - 0.5) * 2;
            force.z += (Math.random() - 0.5) * 2;
            
            body.applyForce(force, body.position);
        }
        
        // Update visual indicator
        updateMeasurementIndicator(launchProgress, "Launching");
        return;
    }
    
    // Waiting phase - let the rope settle in the air
    if (KNOT_CONFIG.currentStep <= KNOT_CONFIG.launchDuration + KNOT_CONFIG.measurementDelay) {
        // Calculate progress through waiting phase
        const waitProgress = (KNOT_CONFIG.currentStep - KNOT_CONFIG.launchDuration) / KNOT_CONFIG.measurementDelay;
        
        // Update visual indicator
        updateMeasurementIndicator(waitProgress, "Analyzing");
        return;
    }
    
    // Measurement phase - calculate knot metrics
    const measureStep = KNOT_CONFIG.currentStep - KNOT_CONFIG.launchDuration - KNOT_CONFIG.measurementDelay;
    
    if (measureStep <= KNOT_CONFIG.measureDuration) {
        // Calculate progress through measurement phase
        const measureProgress = measureStep / KNOT_CONFIG.measureDuration;
        
        // On first step of measurement, calculate the metrics
        if (measureStep === 1) {
            // Calculate distance between start and end points
            const startPoint = bodies[1].position; // First link after anchor
            const endPoint = bodies[bodies.length - 1].position; // Last link
            
            KNOT_CONFIG.startEndDistance = startPoint.distanceTo(endPoint);
            
            // Calculate total path length
            KNOT_CONFIG.pathLength = 0;
            for (let i = 1; i < bodies.length - 1; i++) {
                KNOT_CONFIG.pathLength += bodies[i].position.distanceTo(bodies[i + 1].position);
            }
            
            // Calculate knot factor
            // A straight rope would have startEndDistance ≈ pathLength
            // A knotted rope would have startEndDistance < pathLength
            const ratio = KNOT_CONFIG.startEndDistance / KNOT_CONFIG.pathLength;
            
            // Invert and scale to get a 0-100 score (0 = straight, 100 = very knotted)
            KNOT_CONFIG.knotFactor = Math.max(0, Math.min(100, (1 - ratio) * 150));
            
            console.log("Knot measurement results:");
            console.log("- Start-End Distance:", KNOT_CONFIG.startEndDistance.toFixed(2));
            console.log("- Path Length:", KNOT_CONFIG.pathLength.toFixed(2));
            console.log("- Ratio:", ratio.toFixed(2));
            console.log("- Knot Factor:", KNOT_CONFIG.knotFactor.toFixed(2));
            
            // Update UI
            document.getElementById('knotFactor').textContent = KNOT_CONFIG.knotFactor.toFixed(1);
            
            // Update game score if available
            if (typeof updateGameScore === 'function') {
                updateGameScore(ratio, 1 - ratio);
            }
        }
        
        // Update visual indicator
        updateMeasurementIndicator(measureProgress, "Measuring");
        return;
    }
    
    // Measurement complete
    endKnotMeasurement(true, originalGravity);
}

// Function to create a visual indicator for the measurement process
function createMeasurementIndicator() {
    // Clear any existing indicators
    measurementIndicators.forEach(indicator => {
        scene.remove(indicator);
    });
    measurementIndicators = [];
    
    // Create a progress bar above the rope
    const barGeometry = new THREE.BoxGeometry(5, 0.2, 0.2);
    const barMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const bar = new THREE.Mesh(barGeometry, barMaterial);
    
    // Position above the rope
    bar.position.set(0, 15, 0);
    
    // Create progress indicator
    const progressGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.3);
    const progressMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const progress = new THREE.Mesh(progressGeometry, progressMaterial);
    
    // Position at the start of the bar
    progress.position.set(-2.5, 15, 0);
    
    // Create text for the current phase
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = 'white';
    context.font = 'Bold 24px Arial';
    context.textAlign = 'center';
    context.fillText('Preparing...', 128, 40);
    
    const texture = new THREE.CanvasTexture(canvas);
    const textMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });
    const textGeometry = new THREE.PlaneGeometry(4, 1);
    const text = new THREE.Mesh(textGeometry, textMaterial);
    
    // Position above the bar
    text.position.set(0, 16, 0);
    
    // Add to scene and store references
    scene.add(bar);
    scene.add(progress);
    scene.add(text);
    
    measurementIndicators.push(bar, progress, text);
}

// Function to update the measurement indicator
function updateMeasurementIndicator(progressValue, phase) {
    if (measurementIndicators.length < 3) return;
    
    // Update progress bar position
    const progress = measurementIndicators[1];
    progress.position.x = -2.5 + (progressValue * 5);
    
    // Update color based on phase
    if (phase === "Launching") {
        progress.material.color.set(0xff9900); // Orange
    } else if (phase === "Analyzing") {
        progress.material.color.set(0x0099ff); // Blue
    } else if (phase === "Measuring") {
        progress.material.color.set(0x00ff00); // Green
    }
    
    // Update text
    const text = measurementIndicators[2];
    const canvas = text.material.map.image;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'white';
    context.font = 'Bold 24px Arial';
    context.textAlign = 'center';
    context.fillText(phase + '...', 128, 40);
    text.material.map.needsUpdate = true;
}

// Function to end the knot measurement
function endKnotMeasurement(calculateResults, originalGravity = null) {
    if (!KNOT_CONFIG.isActive) return;
    
    console.log("Ending knot measurement");
    
    // Add completion effect if we have results
    if (calculateResults && KNOT_CONFIG.knotFactor > 0) {
        addMeasurementCompleteEffect(KNOT_CONFIG.knotFactor);
    }
    
    // Restore original gravity
    if (originalGravity) {
        world.gravity.copy(originalGravity);
    } else if (KNOT_CONFIG.originalGravity) {
        world.gravity.copy(KNOT_CONFIG.originalGravity);
    }
    
    // Restore original chain state
    restoreChainState(0);
    
    // Remove visual indicators
    measurementIndicators.forEach(indicator => {
        scene.remove(indicator);
    });
    measurementIndicators = [];
    
    // Reset configuration
    KNOT_CONFIG.isActive = false;
    KNOT_CONFIG.currentStep = 0;
    
    // Update UI
    document.getElementById('measureKnot').textContent = "Measure Knot";
    document.getElementById('measureKnot').disabled = false;
}

// Function to add visual effect for measurement completion
function addMeasurementCompleteEffect(knotFactor) {
    // Create particles based on knot factor
    const particleCount = Math.min(500, Math.floor(knotFactor * 5));
    const particleGeometry = new THREE.BufferGeometry();
    const particleMaterial = new THREE.PointsMaterial({
        color: 0xffff00,
        size: 0.2,
        transparent: true,
        blending: THREE.AdditiveBlending
    });
    
    // Create particle positions
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    
    // Get the center of the rope
    const middleIndex = Math.floor(chainBodies[0].length / 2);
    const center = chainBodies[0][middleIndex].position.clone();
    
    // Initialize particles around the center
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        positions[i3] = center.x + (Math.random() - 0.5) * 2;
        positions[i3 + 1] = center.y + (Math.random() - 0.5) * 2;
        positions[i3 + 2] = center.z + (Math.random() - 0.5) * 2;
        
        // Random velocity
        velocities.push(
            (Math.random() - 0.5) * 0.2,
            Math.random() * 0.2,
            (Math.random() - 0.5) * 0.2
        );
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);
    
    // Animate particles
    const startTime = Date.now();
    const duration = 2000; // 2 seconds
    
    const animateParticles = function() {
        const elapsed = Date.now() - startTime;
        const progress = elapsed / duration;
        
        if (progress < 1) {
            // Update particle positions
            const positions = particleGeometry.attributes.position.array;
            
            for (let i = 0; i < particleCount; i++) {
                const i3 = i * 3;
                const v3 = i * 3;
                
                positions[i3] += velocities[v3];
                positions[i3 + 1] += velocities[v3 + 1];
                positions[i3 + 2] += velocities[v3 + 2];
                
                // Add gravity effect
                velocities[v3 + 1] -= 0.01;
            }
            
            particleGeometry.attributes.position.needsUpdate = true;
            
            // Fade out
            particleMaterial.opacity = 1 - progress;
            
            requestAnimationFrame(animateParticles);
        } else {
            // Remove when animation is complete
            scene.remove(particles);
        }
    };
    
    animateParticles();
}

// Function to store the current state of a chain
function storeChainState(chainIndex) {
    const bodies = chainBodies[chainIndex];
    
    // Skip if no bodies
    if (!bodies || bodies.length === 0) {
        console.error("No bodies found for chain", chainIndex);
        return;
    }
    
    // Clear previous stored state
    KNOT_CONFIG.originalPositions = [];
    
    // Store positions, velocities, and quaternions for each body
    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        
        // Skip the anchor (first body)
        if (i === 0) {
            KNOT_CONFIG.originalPositions.push({
                position: null,
                velocity: null,
                angularVelocity: null,
                quaternion: null
            });
            continue;
        }
        
        KNOT_CONFIG.originalPositions.push({
            position: body.position.clone(),
            velocity: body.velocity.clone(),
            angularVelocity: body.angularVelocity.clone(),
            quaternion: body.quaternion.clone()
        });
    }
}

// Function to restore the original state of a chain
function restoreChainState(chainIndex) {
    const bodies = chainBodies[chainIndex];
    
    // Skip if no bodies or no stored positions
    if (!bodies || bodies.length === 0 || !KNOT_CONFIG.originalPositions || KNOT_CONFIG.originalPositions.length === 0) {
        console.error("Cannot restore chain state - missing data");
        return;
    }
    
    // Restore positions, velocities, and quaternions for each body
    for (let i = 0; i < bodies.length && i < KNOT_CONFIG.originalPositions.length; i++) {
        const body = bodies[i];
        const originalState = KNOT_CONFIG.originalPositions[i];
        
        // Skip the anchor (first body) or if no stored state
        if (i === 0 || !originalState.position) {
            continue;
        }
        
        body.position.copy(originalState.position);
        body.velocity.copy(originalState.velocity);
        body.angularVelocity.copy(originalState.angularVelocity);
        body.quaternion.copy(originalState.quaternion);
    }
}

// Calculate the current length of the chain
function calculateCurrentChainLength(chainIndex) {
    const bodies = chainBodies[chainIndex];
    let totalLength = 0;
    
    // Measure the distance between each link
    for (let i = 0; i < bodies.length - 1; i++) {
        const pos1 = bodies[i].position;
        const pos2 = bodies[i + 1].position;
        const distance = new CANNON.Vec3().copy(pos2).vsub(pos1).length();
        totalLength += distance;
    }
    
    return totalLength;
}

// Calculate the straightness of the chain (vertical alignment)
function calculateChainStraightness(chainIndex) {
    const bodies = chainBodies[chainIndex];
    let totalDeviation = 0;
    let maxDeviation = 0;
    
    // Get the first and last link to define the main axis
    const firstPos = bodies[0].position;
    const lastPos = bodies[bodies.length - 1].position;
    
    // Calculate the main axis direction
    const mainAxis = new CANNON.Vec3().copy(lastPos).vsub(firstPos).unit();
    const totalLength = new CANNON.Vec3().copy(lastPos).vsub(firstPos).length();
    
    // Measure deviation from the straight line for each link
    for (let i = 1; i < bodies.length - 1; i++) {
        const pos = bodies[i].position;
        
        // Calculate expected position along the main axis
        const t = i / (bodies.length - 1); // Normalized position (0 to 1)
        const expectedX = firstPos.x + t * (lastPos.x - firstPos.x);
        const expectedY = firstPos.y + t * (lastPos.y - firstPos.y);
        const expectedZ = firstPos.z + t * (lastPos.z - firstPos.z);
        
        // Calculate distance from expected position
        const deviation = Math.sqrt(
            Math.pow(pos.x - expectedX, 2) +
            Math.pow(pos.y - expectedY, 2) +
            Math.pow(pos.z - expectedZ, 2)
        );
        
        // Track maximum deviation
        maxDeviation = Math.max(maxDeviation, deviation);
        totalDeviation += deviation;
    }
    
    // Calculate average deviation normalized by total length
    const avgDeviation = totalDeviation / (bodies.length - 2);
    const normalizedDeviation = avgDeviation / totalLength;
    
    // Higher value means less straight (more tangled)
    // Scale to reasonable range for the visualization (0-2 range)
    return normalizedDeviation * 10;
}

// Function to apply stretching force during measurement
function applyStretchingForce() {
    // This function is no longer used with the new measurement system
    console.log("applyStretchingForce is deprecated");
}

// Calculate theoretical ideal length of an unknotted chain
function calculateTheoreticalLength() {
    // Each link is linkHeight plus the distance between links
    // But we need to account for the constraint pivots
    return numLinks * (linkHeight * 0.7 + chainDistance);
}

// Add initial chain with debug logging
console.log("Creating initial chain");
const initialChain = createChain(new THREE.Vector3(0, CONFIG.floorDistance, 0));
console.log("Initial chain created:", initialChain);
console.log("Total chains:", chains.length);
console.log("Chain bodies:", chainBodies.length);

// Function to detect knots
function detectKnots() {
    // This function is called every frame to detect knots in real-time
    // We'll use the crossing count and complexity from applyTanglingForces
    
    // Only update the UI occasionally to avoid performance issues
    if (frameCount % 30 === 0) {
        // Update the tangle metrics display
        document.getElementById('tangleComplexity').textContent = 
            (currentTangleComplexity * 100).toFixed(1) + '%';
        document.getElementById('tangleCrossings').textContent = currentCrossings;
    }
}
