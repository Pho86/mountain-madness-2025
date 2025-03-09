// Variables for chains
const chains = [];
const chainBodies = [];
const linkRadius = 0.3; // Thicker for better visibility
const linkHeight = 0.5; // Slightly taller segments
const numLinks = 20;    // Number of links in each chain
const chainDistance = 1.0; // Distance between links

// Knot measurement configuration
const KNOT_CONFIG = {
    measureDuration: 100,       // Number of frames for stretching process
    maxStretchForce: 15,        // Maximum force to apply during stretching
    stretchIncrement: 0.2,      // How much to increase force each frame
    safeStretchDistance: 2.0,   // Safe distance between chain links during stretching
    maxTotalForce: 1500,        // Force threshold to prevent breaking knots
    idealLength: null,          // Will be calculated based on chain parameters
    currentStep: 0,             // Current step in the measurement process
    isActive: false,            // Whether knot measurement is currently active
    originalPositions: [],      // Original positions before measurement
    referenceLength: 0,         // Length of an unknotted chain (calculated)
    stretchedLength: 0          // Measured stretched length
};

// Create visual indicators for the measurement process
let measurementIndicators = [];

// Materials
const chainMaterial = new THREE.MeshStandardMaterial({
    color: 0xd2b48c, // Tan/beige color like rope
    roughness: 0.9,  // More rough texture for rope
    metalness: 0.1   // Less metallic, more fabric-like
});

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

// Function to create a chain
function createChain(position) {
    const chain = new THREE.Group();
    const bodies = [];
    
    const physicalMaterial = new CANNON.Material();
    physicalMaterial.friction = 0.5;  // More friction for rope
    
    for (let i = 0; i < numLinks; i++) {
        // Three.js geometry - use cylinder with more segments for smoother rope
        const linkGeometry = new THREE.CylinderGeometry(linkRadius, linkRadius, linkHeight, 16);
        
        // Add slight random rotation to each link for a more natural rope look
        linkGeometry.rotateX(Math.random() * 0.1);
        
        if (i % 2 === 1) {
            linkGeometry.rotateZ(Math.PI / 2);
        }
        
        const link = new THREE.Mesh(linkGeometry, chainMaterial.clone());
        link.castShadow = true;
        link.position.y = -i * chainDistance;
        link.userData.chainIndex = chains.length;
        link.userData.linkIndex = i;
        chain.add(link);
        
        // CANNON.js body - lighter mass for rope-like behavior
        const linkShape = new CANNON.Cylinder(linkRadius, linkRadius, linkHeight, 16);
        const linkBody = new CANNON.Body({
            mass: i === 0 ? 0 : 1, // First link is fixed
            material: physicalMaterial
        });
        
        if (i % 2 === 1) {
            linkBody.addShape(linkShape, new CANNON.Vec3(), new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2));
        } else {
            linkBody.addShape(linkShape);
        }
        
        // Add more damping for rope-like movement
        linkBody.linearDamping = CONFIG.damping;
        linkBody.angularDamping = CONFIG.angularDamping;
        
        linkBody.position.set(position.x, position.y - i * chainDistance, position.z);
        world.addBody(linkBody);
        bodies.push(linkBody);
        
        // Constraints to connect links - more flexible for rope
        if (i > 0) {
            const constraint = new CANNON.ConeTwistConstraint(bodies[i-1], linkBody, {
                pivotA: new CANNON.Vec3(0, -linkHeight / 2, 0),
                pivotB: new CANNON.Vec3(0, linkHeight / 2, 0),
                axisA: new CANNON.Vec3(0, 1, 0),
                axisB: new CANNON.Vec3(0, 1, 0),
                angle: Math.PI / 8,     // More flexible angle
                twistAngle: Math.PI / 4 // More twist allowed
            });
            world.addConstraint(constraint);
        }
    }
    
    // Add rope ends (caps)
    addRopeEnds(chain, bodies);
    
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
    
    const capMaterial = new THREE.MeshStandardMaterial({
        color: 0xd2b48c, // Match rope color
        roughness: 0.7,
        metalness: 0.3
    });
    
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
    // Reset first chain position
    for (let i = 0; i < chainBodies[0].length; i++) {
        chainBodies[0][i].position.set(0, 10 - i * chainDistance, 0);
        chainBodies[0][i].velocity.set(0, 0, 0);
        chainBodies[0][i].angularVelocity.set(0, 0, 0);
        chainBodies[0][i].quaternion.set(0, 0, 0, 1);
    }
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
        for (let i = 0; i < numLinks; i++) {
            for (let j = i + 3; j < numLinks; j++) {
                // Skip links that are too close in the chain
                if (j - i <= 3) continue;
                
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

// Function to start the knot measurement process
function startKnotMeasurement() {
    if (chains.length === 0 || chainBodies.length === 0) return;
    
    // Calculate reference length if not already done
    if (KNOT_CONFIG.referenceLength === 0) {
        KNOT_CONFIG.referenceLength = calculateReferenceLength();
    }
    
    const chainIndex = 0; // Measure the first chain
    const bodies = chainBodies[chainIndex];
    
    // Save the original positions to restore later
    KNOT_CONFIG.originalPositions = bodies.map(body => ({
        position: new CANNON.Vec3(body.position.x, body.position.y, body.position.z),
        velocity: new CANNON.Vec3(body.velocity.x, body.velocity.y, body.velocity.z),
        angularVelocity: new CANNON.Vec3(body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z),
        quaternion: new CANNON.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
    }));
    
    // Make sure we disable gravity temporarily to get a fair measurement
    const originalGravity = new CANNON.Vec3(world.gravity.x, world.gravity.y, world.gravity.z);
    world.gravity.set(0, 0, 0);
    
    // Reset measurement parameters
    KNOT_CONFIG.currentStep = 0;
    KNOT_CONFIG.isActive = true;
    KNOT_CONFIG.stretchedLength = 0;
    
    // Create visual indicators for the stretching process
    createMeasurementIndicators(bodies[0].position, bodies[bodies.length - 1].position);
    
    document.getElementById('knotRating').textContent = "Measuring...";
    document.getElementById('measureKnot').textContent = "Cancel Measurement";
    
    // Start the measurement process
    measureKnotStep(chainIndex, originalGravity);
}

// Create visual indicators for the measurement process
function createMeasurementIndicators(startPos, endPos) {
    // Remove any existing indicators
    removeMeasurementIndicators();
    
    // Create start indicator (blue sphere)
    const startGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    const startMaterial = new THREE.MeshBasicMaterial({ color: 0x0088ff });
    const startIndicator = new THREE.Mesh(startGeometry, startMaterial);
    startIndicator.position.copy(startPos);
    scene.add(startIndicator);
    measurementIndicators.push(startIndicator);
    
    // Create end indicator (red sphere)
    const endGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    const endMaterial = new THREE.MeshBasicMaterial({ color: 0xff5555 });
    const endIndicator = new THREE.Mesh(endGeometry, endMaterial);
    endIndicator.position.copy(endPos);
    scene.add(endIndicator);
    measurementIndicators.push(endIndicator);
    
    // Create a line between them
    const points = [new THREE.Vector3(startPos.x, startPos.y, startPos.z), 
                   new THREE.Vector3(endPos.x, endPos.y, endPos.z)];
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(line);
    measurementIndicators.push(line);
}

// Update the indicators during measurement
function updateMeasurementIndicators(startPos, endPos) {
    if (measurementIndicators.length < 3) return;
    
    // Update positions of indicators
    measurementIndicators[0].position.copy(startPos);
    measurementIndicators[1].position.copy(endPos);
    
    // Update line
    const points = [
        new THREE.Vector3(startPos.x, startPos.y, startPos.z),
        new THREE.Vector3(endPos.x, endPos.y, endPos.z)
    ];
    
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    measurementIndicators[2].geometry.dispose();
    measurementIndicators[2].geometry = lineGeometry;
}

// Remove measurement indicators
function removeMeasurementIndicators() {
    for (const indicator of measurementIndicators) {
        scene.remove(indicator);
        if (indicator.geometry) indicator.geometry.dispose();
        if (indicator.material) indicator.material.dispose();
    }
    measurementIndicators = [];
}

// Function to perform each step of the measurement
function measureKnotStep(chainIndex, originalGravity) {
    if (!KNOT_CONFIG.isActive) {
        // Restore original gravity and exit if measurement was cancelled
        world.gravity.copy(originalGravity);
        return;
    }
    
    const bodies = chainBodies[chainIndex];
    
    // If we've reached the end of the measurement duration
    if (KNOT_CONFIG.currentStep >= KNOT_CONFIG.measureDuration) {
        // Calculate final stretched length
        const firstBody = bodies[0];
        const lastBody = bodies[bodies.length - 1];
        KNOT_CONFIG.stretchedLength = calculateDistance(firstBody.position, lastBody.position);
        
        // End the measurement
        endKnotMeasurement(true, originalGravity);
        return;
    }
    
    // Apply stretching force
    const firstBody = bodies[0];
    const lastBody = bodies[bodies.length - 1];
    
    // Update measurement indicators
    updateMeasurementIndicators(firstBody.position, lastBody.position);
    
    // Use the current step to calculate a gradually increasing force
    const progress = KNOT_CONFIG.currentStep / KNOT_CONFIG.measureDuration;
    const currentForce = Math.min(
        KNOT_CONFIG.maxStretchForce * progress, 
        KNOT_CONFIG.maxStretchForce
    );
    
    // Apply force in opposite directions to the first and last links
    const direction = new CANNON.Vec3();
    direction.set(
        lastBody.position.x - firstBody.position.x,
        lastBody.position.y - firstBody.position.y,
        lastBody.position.z - firstBody.position.z
    );
    direction.normalize();
    direction.scale(currentForce, direction);
    
    // Apply opposite forces to stretch
    lastBody.applyForce(direction, lastBody.position);
    direction.scale(-1, direction);
    firstBody.applyForce(direction, firstBody.position);
    
    // Check if we're stretching too much (which might break a knot)
    let maxLinkDistance = 0;
    for (let i = 0; i < bodies.length - 1; i++) {
        const distance = calculateDistance(bodies[i].position, bodies[i + 1].position);
        maxLinkDistance = Math.max(maxLinkDistance, distance);
    }
    
    // If links are being stretched too far, stop the measurement
    if (maxLinkDistance > KNOT_CONFIG.safeStretchDistance) {
        console.log("Stopping measurement - links stretched too far:", maxLinkDistance);
        endKnotMeasurement(true, originalGravity);
        return;
    }
    
    // Increment step and continue
    KNOT_CONFIG.currentStep++;
    
    // Use requestAnimationFrame to continue the process
    requestAnimationFrame(() => measureKnotStep(chainIndex, originalGravity));
}

// Function to end the knot measurement
function endKnotMeasurement(calculateResults, originalGravity = null) {
    KNOT_CONFIG.isActive = false;
    document.getElementById('measureKnot').textContent = "Measure Knot";
    
    // Restore original gravity if provided
    if (originalGravity) {
        world.gravity.copy(originalGravity);
    }
    
    if (calculateResults) {
        const knotRating = calculateKnotRating();
        document.getElementById('knotRating').textContent = knotRating.rating;
        
        // Update the color of the measurement line based on knot complexity
        if (measurementIndicators.length >= 3) {
            let lineColor;
            switch (knotRating.category) {
                case 'none':
                    lineColor = 0x00ff00; // Green for no knot
                    break;
                case 'simple':
                    lineColor = 0xffaa00; // Orange for simple tangle
                    break;
                case 'moderate':
                    lineColor = 0xff5500; // Orange-red for moderate knot
                    break;
                case 'complex':
                case 'extreme':
                    lineColor = 0xff0000; // Red for complex/extreme knot
                    break;
                default:
                    lineColor = 0xffffff; // White default
            }
            
            // Update line color
            measurementIndicators[2].material.color.set(lineColor);
        }
        
        console.log("Knot Measurement:", knotRating);
        
        // Award points based on knot complexity if game is active
        if (gameStarted && !gameOver) {
            let points = 0;
            switch (knotRating.category) {
                case 'none':
                    points = 0;
                    break;
                case 'simple':
                    points = 1;
                    break;
                case 'moderate':
                    points = 3;
                    break;
                case 'complex':
                    points = 5;
                    break;
                case 'extreme':
                    points = 10;
                    break;
            }
            
            if (points > 0) {
                updateScore(points);
            }
        }
    } else {
        document.getElementById('knotRating').textContent = "Cancelled";
        
        // Remove indicators if cancelled
        removeMeasurementIndicators();
    }
}

// Function to restore the chain to its original position
function restoreOriginalPositions() {
    if (KNOT_CONFIG.originalPositions.length === 0) return;
    
    const bodies = chainBodies[0];
    for (let i = 0; i < bodies.length && i < KNOT_CONFIG.originalPositions.length; i++) {
        const original = KNOT_CONFIG.originalPositions[i];
        bodies[i].position.copy(original.position);
        bodies[i].velocity.copy(original.velocity);
        bodies[i].angularVelocity.copy(original.angularVelocity);
        bodies[i].quaternion.copy(original.quaternion);
    }
}

// Function to calculate the reference length of an unknotted chain
function calculateReferenceLength() {
    // For an unknotted chain, the stretched length should be approximately:
    // (number of links - 1) * average distance between links when stretched a bit
    // We'll estimate this based on the chain parameters
    const linkCount = numLinks;
    const straightLineDistance = (linkCount - 1) * chainDistance * 1.05; // Slight margin
    return straightLineDistance;
}

// Helper function to calculate distance between two points
function calculateDistance(point1, point2) {
    return Math.sqrt(
        Math.pow(point2.x - point1.x, 2) +
        Math.pow(point2.y - point1.y, 2) +
        Math.pow(point2.z - point1.z, 2)
    );
}

// Function to calculate the knot rating based on the stretched length
function calculateKnotRating() {
    const referenceLength = KNOT_CONFIG.referenceLength;
    const stretchedLength = KNOT_CONFIG.stretchedLength;
    
    // The ratio of the measured stretched length to the theoretical length
    // A lower ratio indicates a more complex knot
    const ratio = stretchedLength / referenceLength;
    
    let rating, category;
    
    if (ratio >= 0.95) {
        rating = "Not knotted (100%)";
        category = "none";
    } else if (ratio >= 0.75) {
        rating = "Simple tangle (" + (ratio * 100).toFixed(1) + "%)";
        category = "simple";
    } else if (ratio >= 0.5) {
        rating = "Moderate knot (" + (ratio * 100).toFixed(1) + "%)";
        category = "moderate";
    } else if (ratio >= 0.25) {
        rating = "Complex knot (" + (ratio * 100).toFixed(1) + "%)";
        category = "complex";
    } else {
        rating = "Extreme knot (" + (ratio * 100).toFixed(1) + "%)";
        category = "extreme";
    }
    
    return {
        ratio: ratio,
        rating: rating,
        category: category,
        stretchedLength: stretchedLength,
        referenceLength: referenceLength
    };
}

// Add initial chain
createChain(new THREE.Vector3(0, 10, 0)); 