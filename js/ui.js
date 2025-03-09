// UI Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Add event listeners for UI controls
    document.getElementById('addChain').addEventListener('click', () => {
        const x = (Math.random() - 0.5) * 10;
        const z = (Math.random() - 0.5) * 10;
        createChain(new THREE.Vector3(x, 10, z));
    });

    document.getElementById('toggleGravity').addEventListener('click', () => {
        if (world.gravity.y === 0) {
            world.gravity.set(0, -9.82, 0);
        } else {
            world.gravity.set(0, 0, 0);
        }
    });

    document.getElementById('reset').addEventListener('click', () => {
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

        // Reset first chain position
        resetRope();
    });
    
    // Add event listener for the measure knot button
    document.getElementById('measureKnot').addEventListener('click', () => {
        if (KNOT_CONFIG.isActive) {
            // If already measuring, cancel it
            endKnotMeasurement(false);
            return;
        }
        
        // Start the measurement process
        startKnotMeasurement();
    });

    // Add keyboard shortcut for toggling menu
    window.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'm') {
            toggleControlsMenu();
        } else if (event.key.toLowerCase() === 'd') {
            // Toggle debug mode for voice recognition
            debugMode = !debugMode;
            console.log(`Debug mode ${debugMode ? 'enabled' : 'disabled'}`);
        }
    });
    
    // Update tangle metrics display
    setInterval(() => {
        document.getElementById('tangleComplexity').textContent = 
            (currentTangleComplexity * 100).toFixed(1) + '%';
        document.getElementById('tangleCrossings').textContent = currentCrossings;
    }, 100);
}); 