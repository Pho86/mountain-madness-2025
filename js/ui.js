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
    
    document.getElementById('resetRope').addEventListener('click', () => {
        console.log("Resetting rope from UI button...");
        
        // Update UI
        document.getElementById('resetRope').textContent = "Resetting...";
        setTimeout(() => {
            document.getElementById('resetRope').textContent = "Reset Rope";
        }, 500);

        // Reset first chain position
        resetRope();
    });
    
    // Hide the measure knot button since functionality has been removed
    const measureKnotButton = document.getElementById('measureKnot');
    if (measureKnotButton) {
        measureKnotButton.style.display = 'none';
    }
    
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