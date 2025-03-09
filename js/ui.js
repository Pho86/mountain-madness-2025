// UI Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Add event listeners for UI controls
    document.getElementById('addChain').addEventListener('click', () => {
        const x = (Math.random() - 0.5) * 10;
        const z = (Math.random() - 0.5) * 10;
        createChain(new THREE.Vector3(x, 15, z));
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
        if (isMeasuringKnot) return;

        const chainIndex = 0;
        if (!chainBodies[chainIndex]) return;

        isMeasuringKnot = true;
        knotMeasurementStartTime = Date.now();

        // Store original state and physics properties
        const originalPositions = [];
        const originalVelocities = [];
        const originalAngularVelocities = [];
        const originalQuaternions = [];

        const bodies = chainBodies[chainIndex];
        for (let i = 0; i < bodies.length; i++) {
            originalPositions.push(bodies[i].position.clone());
            originalVelocities.push(bodies[i].velocity.clone());
            originalAngularVelocities.push(bodies[i].angularVelocity.clone());
            originalQuaternions.push(bodies[i].quaternion.clone());

            // Increase damping during measurement
            bodies[i].linearDamping = KNOT_MEASUREMENT_CONFIG.dampingDuringStretch;
            bodies[i].angularDamping = KNOT_MEASUREMENT_CONFIG.dampingDuringStretch;
        }

        // Store original gravity and physics properties
        const originalGravity = world.gravity.clone();
        world.gravity.set(0, 0, 0);

        const button = document.getElementById('measureKnot');
        button.textContent = "Measuring...";
        button.disabled = true;

        // Set a timeout to calculate results and restore the chain
        setTimeout(() => {
            // Calculate knot metrics
            const knottiness = calculateKnotFactor(chainIndex);
            document.getElementById('knotRating').textContent = knottiness.toFixed(1) + '%';

            // Update the game score based on knot complexity
            if (typeof updateGameScore === 'function') {
                // Convert knottiness to a ratio (0-1) for the scoring system
                const lengthRatio = 1 - (knottiness / 100);
                updateGameScore(lengthRatio, 0);
            }

            // Begin restoration process
            setTimeout(() => {
                // Restore original physics properties
                world.gravity.copy(originalGravity);
                
                // Restore original chain state and properties
                for (let i = 0; i < bodies.length; i++) {
                    bodies[i].position.copy(originalPositions[i]);
                    bodies[i].velocity.copy(originalVelocities[i]);
                    bodies[i].angularVelocity.copy(originalAngularVelocities[i]);
                    bodies[i].quaternion.copy(originalQuaternions[i]);
                    
                    // Restore original damping
                    bodies[i].linearDamping = CONFIG.damping;
                    bodies[i].angularDamping = CONFIG.angularDamping;
                }

                isMeasuringKnot = false;
                button.textContent = "Measure Knot";
                button.disabled = false;
            }, KNOT_MEASUREMENT_CONFIG.recoveryTime);
        }, KNOT_MEASUREMENT_CONFIG.measurementDuration);
    });

    // Add keyboard shortcut for toggling menu
    window.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'm') {
            // Don't toggle menu if game is over
            if (gameOver) {
                console.log("Menu toggle blocked: game is over");
                return;
            }
            toggleControlsMenu();
        } 
    });
    
    // Update tangle metrics display
    setInterval(() => {
        document.getElementById('tangleComplexity').textContent = 
            (currentTangleComplexity * 100).toFixed(1) + '%';
        document.getElementById('tangleCrossings').textContent = currentCrossings;
    }, 100);
}); 