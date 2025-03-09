// Configuration parameters
const CONFIG = {
    floorDistance: -10,  // Distance of floor from origin
    wallDistance: 25,    // Distance of walls from center
    damping: 0.3,       // Physics damping factor
    angularDamping: 0.5  // Angular damping factor
};

// Cell shading setup
const cellShader = {
    uniforms: {
        lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() }
    },
    vertexShader: `
        varying vec3 vNormal;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 lightDirection;
        varying vec3 vNormal;
        void main() {
            float intensity = dot(vNormal, lightDirection);
            if (intensity > 0.95) intensity = 1.0;
            else if (intensity > 0.5) intensity = 0.6;
            else if (intensity > 0.25) intensity = 0.4;
            else intensity = 0.2;
            gl_FragColor = vec4(vec3(0.3, 0.5, 0.8) * intensity, 1.0);  // Blue color
        }
    `
};

const cellShadingMaterial = new THREE.ShaderMaterial({
    uniforms: cellShader.uniforms,
    vertexShader: cellShader.vertexShader,
    fragmentShader: cellShader.fragmentShader
});

// Initialize Three.js Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x282c34);

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// Position camera higher and angled down to better view the rope
camera.position.set(0, 25, 20);
camera.lookAt(0, 0, 0); // Look at the origin where the rope is anchored

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// Physics World
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0); // Earth gravity
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;
world.defaultContactMaterial.friction = 0.5;
world.defaultContactMaterial.restitution = 0.3;

// Add global damping
world.defaultContactMaterial.contactEquationStiffness = 1e6;
world.defaultContactMaterial.contactEquationRelaxation = 3;
world.defaultContactMaterial.frictionEquationStiffness = 1e6;
world.defaultContactMaterial.frictionEquationRegularizationTime = 3;

// Create walls
const wallShape = new CANNON.Box(new CANNON.Vec3(0.5, CONFIG.wallDistance, CONFIG.wallDistance));
const wallMaterial = new CANNON.Material();

// Left wall
const leftWallBody = new CANNON.Body({ mass: 0, material: wallMaterial });
leftWallBody.addShape(wallShape);
leftWallBody.position.set(-CONFIG.wallDistance, 0, 0);
world.addBody(leftWallBody);

// Right wall
const rightWallBody = new CANNON.Body({ mass: 0, material: wallMaterial });
rightWallBody.addShape(wallShape);
rightWallBody.position.set(CONFIG.wallDistance, 0, 0);
world.addBody(rightWallBody);

// Front wall
const frontWallShape = new CANNON.Box(new CANNON.Vec3(CONFIG.wallDistance, CONFIG.wallDistance, 0.5));
const frontWallBody = new CANNON.Body({ mass: 0, material: wallMaterial });
frontWallBody.addShape(frontWallShape);
frontWallBody.position.set(0, 0, CONFIG.wallDistance);
world.addBody(frontWallBody);

// Back wall
const backWallBody = new CANNON.Body({ mass: 0, material: wallMaterial });
backWallBody.addShape(frontWallShape);
backWallBody.position.set(0, 0, -CONFIG.wallDistance);
world.addBody(backWallBody);

// Create visual walls (semi-transparent)
const wallGeometry = new THREE.BoxGeometry(1, CONFIG.wallDistance * 2, CONFIG.wallDistance * 2);
const wallMaterialThree = new THREE.MeshStandardMaterial({ 
    color: 0x666666,
    transparent: true,
    opacity: 0.2
});

// Left wall visual
const leftWall = new THREE.Mesh(wallGeometry, wallMaterialThree);
leftWall.position.copy(leftWallBody.position);
scene.add(leftWall);

// Right wall visual
const rightWall = new THREE.Mesh(wallGeometry, wallMaterialThree);
rightWall.position.copy(rightWallBody.position);
scene.add(rightWall);

// Front and back wall geometry
const frontWallGeometry = new THREE.BoxGeometry(CONFIG.wallDistance * 2, CONFIG.wallDistance * 2, 1);

// Front wall visual
const frontWall = new THREE.Mesh(frontWallGeometry, wallMaterialThree);
frontWall.position.copy(frontWallBody.position);
scene.add(frontWall);

// Back wall visual
const backWall = new THREE.Mesh(frontWallGeometry, wallMaterialThree);
backWall.position.copy(backWallBody.position);
scene.add(backWall);

// Ground
const groundGeometry = new THREE.PlaneGeometry(50, 50);
const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x333333,
    roughness: 0.8,
    metalness: 0.2
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = CONFIG.floorDistance;
ground.receiveShadow = true;
scene.add(ground);

const groundBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane()
});
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
groundBody.position.set(0, CONFIG.floorDistance, 0);
world.addBody(groundBody);

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Animation loop
const timeStep = 1 / 60;
function animate() {
    requestAnimationFrame(animate);
    
    // Update frame counter
    frameCount++;
    
    // Process knot measurement if active
    if (KNOT_CONFIG && KNOT_CONFIG.isActive) {
        try {
            // Call the measurement step function for the first chain
            measureKnotStep(0, KNOT_CONFIG.originalGravity);
        } catch (error) {
            console.error("Error in knot measurement:", error);
            // End measurement on error
            if (typeof endKnotMeasurement === 'function') {
                endKnotMeasurement(false, KNOT_CONFIG.originalGravity);
            }
        }
    }
    
    // Update physics
    world.step(timeStep);
    
    // Update chain positions based on physics
    for (let i = 0; i < chains.length; i++) {
        for (let j = 0; j < chains[i].children.length; j++) {
            const link = chains[i].children[j];
            
            // Skip links without userData (like end caps)
            if (!link.userData || link.userData.linkIndex === undefined) {
                continue;
            }
            
            const body = chainBodies[i][link.userData.linkIndex];
            
            // Skip if body doesn't exist
            if (!body) {
                continue;
            }
            
            link.position.copy(body.position);
            link.quaternion.copy(body.quaternion);
        }
    }
    
    // Apply tangling forces
    applyTanglingForces();
    
    // Render scene
    renderer.render(scene, camera);
}

// Basic camera controls
let isDraggingCamera = false;
let previousCameraPosition = { x: 0, y: 0 };
const cameraDistance = camera.position.length();

// Handle camera rotation
function handleCameraRotation(event) {
    const deltaMove = {
        x: event.clientX - previousCameraPosition.x,
        y: event.clientY - previousCameraPosition.y
    };
    
    // Rotate camera horizontally around the scene center
    const rotationSpeed = 0.01;
    const horizontalRotation = deltaMove.x * rotationSpeed;
    
    // Get current camera position in spherical coordinates
    const radius = camera.position.length();
    let theta = Math.atan2(camera.position.x, camera.position.z);
    let phi = Math.acos(camera.position.y / radius);
    
    // Update theta (horizontal rotation)
    theta -= horizontalRotation;
    
    // Limit vertical rotation to maintain a downward angle
    phi = Math.max(Math.PI * 0.2, Math.min(Math.PI * 0.8, phi + deltaMove.y * rotationSpeed));
    
    // Convert back to Cartesian coordinates
    camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = radius * Math.cos(phi);
    camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
    
    // Look at the scene center
    camera.lookAt(0, 0, 0);
    
    previousCameraPosition = { x: event.clientX, y: event.clientY };
}

window.addEventListener('wheel', (event) => {
    const zoomSpeed = 0.1;
    const zoomFactor = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;

    camera.position.multiplyScalar(zoomFactor);
    camera.lookAt(scene.position);
});

// Tangling configuration
const TANGLE_CONFIG = {
    attractionRadius: 2.0,      // Radius within which links attract each other
    attractionForce: 0.5,       // Strength of the attraction force
    minDistance: 0.5,           // Minimum distance between links
    maxCrossings: 50,           // Maximum number of crossings for normalization
    updateInterval: 10          // Frames between tangle metric updates
};

let frameCount = 0;
let currentTangleComplexity = 0;
let currentCrossings = 0;

// Function to calculate distance between line segments
function segmentDistance(p1, p2, p3, p4) {
    const p13 = p1.clone().sub(p3);
    const p43 = p4.clone().sub(p3);
    const p21 = p2.clone().sub(p1);

    const d1343 = p13.x * p43.x + p13.y * p43.y + p13.z * p43.z;
    const d4321 = p43.x * p21.x + p43.y * p21.y + p43.z * p21.z;
    const d1321 = p13.x * p21.x + p13.y * p21.y + p13.z * p21.z;
    const d4343 = p43.x * p43.x + p43.y * p43.y + p43.z * p43.z;
    const d2121 = p21.x * p21.x + p21.y * p21.y + p21.z * p21.z;

    const denom = d2121 * d4343 - d4321 * d4321;
    if (Math.abs(denom) < 0.0001) return p13.length();

    const numer = d1343 * d4321 - d1321 * d4343;
    const mua = numer / denom;
    const mub = (d1343 + d4321 * mua) / d4343;

    if (mua < 0 || mua > 1 || mub < 0 || mub > 1) {
        return Math.min(
            Math.min(p1.distanceTo(p3), p1.distanceTo(p4)),
            Math.min(p2.distanceTo(p3), p2.distanceTo(p4))
        );
    }

    const pa = p1.clone().add(p21.multiplyScalar(mua));
    const pb = p3.clone().add(p43.multiplyScalar(mub));
    return pa.distanceTo(pb);
}

// Function to apply tangling forces
function applyTanglingForces() {
    let crossings = 0;
    let complexity = 0;

    for (let chainIndex = 0; chainIndex < chains.length; chainIndex++) {
        const chain = chains[chainIndex];
        const bodies = chainBodies[chainIndex];

        // Skip first and last few links to prevent extreme tangling
        for (let i = 2; i < bodies.length - 2; i++) {
            const body1 = bodies[i];
            const pos1 = body1.position;
            const nextPos1 = bodies[i + 1].position;

            // Check interaction with other links in the same chain
            for (let j = i + 2; j < bodies.length - 1; j++) {
                const body2 = bodies[j];
                const pos2 = body2.position;
                const nextPos2 = bodies[j + 1].position;

                // Calculate distance between segments
                const distance = segmentDistance(
                    new THREE.Vector3(pos1.x, pos1.y, pos1.z),
                    new THREE.Vector3(nextPos1.x, nextPos1.y, nextPos1.z),
                    new THREE.Vector3(pos2.x, pos2.y, pos2.z),
                    new THREE.Vector3(nextPos2.x, nextPos2.y, nextPos2.z)
                );

                // Count crossings and calculate complexity
                if (distance < TANGLE_CONFIG.attractionRadius) {
                    crossings++;
                    complexity += (TANGLE_CONFIG.attractionRadius - distance) / TANGLE_CONFIG.attractionRadius;

                    // Apply attraction force if not too close
                    if (distance > TANGLE_CONFIG.minDistance) {
                        const force = TANGLE_CONFIG.attractionForce * (1 - distance / TANGLE_CONFIG.attractionRadius);
                        const direction = new CANNON.Vec3();
                        direction.set(
                            pos2.x - pos1.x,
                            pos2.y - pos1.y,
                            pos2.z - pos1.z
                        );
                        direction.normalize();
                        direction.scale(force, direction);

                        body1.applyForce(direction, body1.position);
                        direction.scale(-1, direction);
                        body2.applyForce(direction, body2.position);
                    }
                }
            }
        }
    }

    // Update metrics display if it's time
    if (frameCount % TANGLE_CONFIG.updateInterval === 0) {
        currentTangleComplexity = Math.min(1, complexity / TANGLE_CONFIG.maxCrossings);
        currentCrossings = crossings;

        document.getElementById('tangleComplexity').textContent = 
            (currentTangleComplexity * 100).toFixed(1) + '%';
        document.getElementById('tangleCrossings').textContent = currentCrossings;
    }
    
    // Increment frame counter
    frameCount++;
}

// Function to reset camera to default position
function resetCamera() {
    camera.position.set(0, 25, 20);
    camera.lookAt(0, 0, 0);
}

// Add reset camera button to UI
document.addEventListener('DOMContentLoaded', () => {
    const controls = document.getElementById('controls');
    if (controls) {
        const resetCameraButton = document.createElement('button');
        resetCameraButton.id = 'resetCamera';
        resetCameraButton.textContent = 'Reset Camera';
        resetCameraButton.addEventListener('click', resetCamera);
        controls.appendChild(resetCameraButton);
    }
}); 