// Mouse interaction variables
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

// Basic camera controls
let isDraggingCamera = false;
let previousCameraPosition = { x: 0, y: 0 };
const cameraDistance = camera.position.length();

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
function handleMouseDown(event) {
    console.log("Mouse down handler called");
    
    // Don't interact if game is over or not started
    if (typeof canInteract === 'function' && !canInteract()) {
        console.log("Cannot interact - game state prevents interaction");
        return;
    }
    
    // Update mouse position
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    console.log("Mouse position:", mouse.x, mouse.y);
    
    raycaster.setFromCamera(mouse, camera);
    
    // Check for intersections with all chain links
    const allLinks = [];
    
    if (!chains || chains.length === 0) {
        console.error("No chains found!");
        return;
    }
    
    console.log("Number of chains:", chains.length);
    
    chains.forEach((chain, chainIndex) => {
        console.log(`Chain ${chainIndex} has ${chain.children.length} children`);
        
        chain.children.forEach(link => {
            // Only include actual links, not end caps
            if (link.userData && link.userData.linkIndex !== undefined) {
                allLinks.push(link);
            }
        });
    });
    
    console.log("Total links to check:", allLinks.length);
    
    const intersects = raycaster.intersectObjects(allLinks);
    console.log("Intersections found:", intersects.length);
    
    if (intersects.length > 0) {
        console.log("Intersection detected with link");
        isDraggingChain = true;
        draggedLink = intersects[0].object;
        originalMaterial = draggedLink.material;
        draggedLink.material = selectedMaterial;
        
        const chainIndex = draggedLink.userData.chainIndex;
        const linkIndex = draggedLink.userData.linkIndex;
        console.log("Dragging link from chain", chainIndex, "link index", linkIndex);
        
        draggedBody = chainBodies[chainIndex][linkIndex];
        
        // Convert intersection point to world coordinates
        const intersectionPoint = intersects[0].point;
        console.log("Intersection point:", intersectionPoint);
        
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
        console.log("Constraint added");
        
        // Remember the mouse position for dragging
        getMousePosition(event, previousMousePosition);
        
        // Update the mouse plane to face the camera
        mousePlane.normal.copy(camera.getWorldDirection(new THREE.Vector3()));
    } else {
        // Start camera rotation only if not clicking on a chain
        console.log("No intersection, starting camera rotation");
        isDraggingCamera = true;
        previousCameraPosition = { x: event.clientX, y: event.clientY };
    }
}

// Handle mouse move event
function handleMouseMove(event) {
    if (isDraggingChain && draggedBody && dragConstraint) {
        // Move joint body to new mouse position
        const mousePosition = getMousePosition(event, new THREE.Vector3());
        leftJointBody.position.copy(mousePosition);
        previousMousePosition.copy(mousePosition);
    } else if (isDraggingCamera) {
        // Handle camera rotation
        handleCameraRotation(event);
    }
}

// Handle mouse up event
function handleMouseUp(event) {
    console.log("Mouse up handler called");
    
    if (isDraggingChain) {
        console.log("Releasing dragged chain");
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
            console.log("Constraint removed");
        }
        
        isDraggingChain = false;
        draggedBody = null;
    }
    
    isDraggingCamera = false;
}

// Handle mouse wheel event
function handleMouseWheel(event) {
    const zoomSpeed = 0.1;
    const zoomFactor = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
    
    camera.position.multiplyScalar(zoomFactor);
    camera.lookAt(scene.position);
}

// Add direct mouse event listeners to the document
document.addEventListener('mousedown', handleMouseDown);
document.addEventListener('mousemove', handleMouseMove);
document.addEventListener('mouseup', handleMouseUp);
document.addEventListener('wheel', handleMouseWheel);

// Add direct event listeners to the renderer's DOM element as well
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM loaded, setting up additional mouse event listeners on canvas");
    
    const canvas = renderer.domElement;
    
    canvas.addEventListener('mousedown', (event) => {
        console.log("Canvas mousedown event triggered");
        handleMouseDown(event);
    });
    
    canvas.addEventListener('mousemove', (event) => {
        handleMouseMove(event);
    });
    
    canvas.addEventListener('mouseup', (event) => {
        console.log("Canvas mouseup event triggered");
        handleMouseUp(event);
    });
});

// Add a test function to check if the rope is clickable
function testRopeClickability() {
    console.log("Testing rope clickability");
    
    if (!chains || chains.length === 0) {
        console.error("No chains found!");
        return;
    }
    
    console.log("Number of chains:", chains.length);
    
    // Create a test ray from the center of the screen
    const testRay = new THREE.Raycaster();
    testRay.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    // Collect all links
    const allLinks = [];
    chains.forEach((chain, chainIndex) => {
        console.log(`Chain ${chainIndex} has ${chain.children.length} children`);
        
        chain.children.forEach(link => {
            // Only include actual links, not end caps
            if (link.userData && link.userData.linkIndex !== undefined) {
                allLinks.push(link);
            }
        });
    });
    
    console.log("Total links to check:", allLinks.length);
    
    // Test intersection
    const intersects = testRay.intersectObjects(allLinks);
    console.log("Test intersections found:", intersects.length);
    
    if (intersects.length > 0) {
        console.log("Test intersection detected with link");
        console.log("Link details:", intersects[0].object);
    } else {
        console.log("No test intersections found");
        
        // Try with a wider test
        for (let x = -0.5; x <= 0.5; x += 0.1) {
            for (let y = -0.5; y <= 0.5; y += 0.1) {
                testRay.setFromCamera(new THREE.Vector2(x, y), camera);
                const widerIntersects = testRay.intersectObjects(allLinks);
                if (widerIntersects.length > 0) {
                    console.log(`Found intersection at (${x}, ${y}):`, widerIntersects[0].object);
                    return;
                }
            }
        }
        
        console.log("No intersections found in wider test");
    }
}

// Run the test after a short delay
setTimeout(testRopeClickability, 2000); 