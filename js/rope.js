// Variables for chains
const chains = [];
const chainBodies = [];
const linkRadius = 0.4;
const linkHeight = 0.8;
const numLinks = 150;
const chainDistance = .1;

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
        else if (intensity > 0.5) intensity = 0.8;
        else if (intensity > 0.25) intensity = 0.3;
        else intensity = 0.2;
        vec3 beigeColor = vec3(.65, 0.4, 1.0); // Beige color
        gl_FragColor = vec4(beigeColor * intensity, 1.0);
    }
`;

const selectedMaterial = new THREE.MeshStandardMaterial({
    color: 0x7e61ff ,
    roughness: 0.01,
    metalness: 1.99
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

// Function to create a chain
function createChain(position) {
    const chain = new THREE.Group();
    const bodies = [];
    
    const physicalMaterial = new CANNON.Material();
    
    // Create an anchor point in the air
    const anchorGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const anchorMaterial = new THREE.MeshStandardMaterial({
        color: 0x8B4513, // Brown color for the anchor
        roughness: 0.3,
        metalness: 0.9
    });
    const anchorHeight = 15; // Height of the anchor in the air
    const anchorMesh = new THREE.Mesh(anchorGeometry, anchorMaterial);
    anchorMesh.position.set(position.x, anchorHeight, position.z); // Position in the air
    anchorMesh.castShadow = true;
    anchorMesh.receiveShadow = true;
    scene.add(anchorMesh);
    
    // Create anchor body (fixed in the air)
    const anchorBody = new CANNON.Body({
        mass: 0, // Zero mass makes it immovable
        material: physicalMaterial
    });
    anchorBody.addShape(new CANNON.Sphere(0.5));
    anchorBody.position.set(position.x, anchorHeight, position.z);
    world.addBody(anchorBody);
    bodies.push(anchorBody);
    
    // Create the first link at the anchor position but slightly below
    const firstLinkGeometry = new THREE.CylinderGeometry(linkRadius, linkRadius, linkHeight, 16);
    const firstLink = new THREE.Mesh(firstLinkGeometry, chainMaterial.clone());
    firstLink.castShadow = true;
    firstLink.position.set(position.x, anchorHeight - 1.5, position.z); // Position below the anchor
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
    firstLinkBody.position.set(position.x, anchorHeight - 1.5, position.z);
    world.addBody(firstLinkBody);
    bodies.push(firstLinkBody);
    
    // Connect first link to anchor with a constraint
    const anchorConstraint = new CANNON.PointToPointConstraint(
        anchorBody,
        new CANNON.Vec3(0, -0.5, 0), // Bottom of anchor
        firstLinkBody,
        new CANNON.Vec3(0, linkHeight/2, 0), // Top of first link
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
        link.position.y = anchorHeight - 1.5 - i * chainDistance;
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
        
        linkBody.position.set(position.x, anchorHeight - 1.5 - i * chainDistance, position.z);
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
    
    const anchorHeight = 15; // Height of the anchor in the air (must match createChain)
    
    // Reset first chain position
    for (let i = 0; i < chainBodies[0].length; i++) {
        if (i === 0) {
            // Skip the anchor (first body)
            continue;
        } else if (i === 1) {
            // First link below the anchor
            chainBodies[0][i].position.set(0, anchorHeight - 1.5, 0);
        } else {
            // Rest of the chain
            chainBodies[0][i].position.set(0, anchorHeight - 1.5 - (i-1) * chainDistance, 0);
        }
        
        // Reset physics
        chainBodies[0][i].velocity.set(0, 0, 0);
        chainBodies[0][i].angularVelocity.set(0, 0, 0);
        chainBodies[0][i].quaternion.set(0, 0, 0, 1);
    }
    
    console.log("Rope reset complete");
}

// Update link positions based on physics bodies
function updateMeshPositions() {
    for (let i = 0; i < chains.length; i++) {
        const chain = chains[i];
        const bodies = chainBodies[i];
        
        for (let j = 0; j < Math.min(chain.children.length, bodies.length); j++) {
            const mesh = chain.children[j];
            const body = bodies[j];
            
            mesh.position.copy(body.position);
            mesh.quaternion.copy(body.quaternion);
        }
    }
}

// Add initial chain with debug logging
console.log("Creating initial chain");
const initialChain = createChain(new THREE.Vector3(0, CONFIG.floorDistance, 0));
console.log("Initial chain created:", initialChain);
console.log("Total chains:", chains.length);
console.log("Chain bodies:", chainBodies.length);
