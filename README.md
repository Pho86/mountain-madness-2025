# 3D Knot Madness

An interactive 3D physics simulation that allows users to manipulate ropes using hand tracking and voice commands. The application uses Three.js for 3D rendering, Cannon.js for physics, and MediaPipe for hand tracking with hugging face and whisper to integrate voice commands.

## Features

- Real-time 3D rope physics simulation
- Dual hand tracking for natural interaction
- Voice commands for hands-free control
- Game mode with timer and scoring
- Multiple difficulty levels
- Tangle complexity metrics

## Project Structure

The project has been organized into a modular structure for better maintainability:

```
├── index.html           # Main HTML file: entry point for the web application, linking to CSS, JS files
├── backend/
│   ├── server.js        # Express server: contains the Express app setup and routes for handling HTTP requests
│   ├── vercel.json      # Vercel configuration file: used for deployment settings when deploying to Vercel, such as routes and environment variables
│   └── .env             # Environment variables for Express: stores sensitive data like API keys, database credentials, etc. (never commit to version control)
├── css/
│   └── main.css         # All styles for the application: contains styling rules for the page layout, elements, etc.
├── js/
│   ├── scene.js         # 3D scene setup and rendering: sets up the 3D environment, camera, and objects using a library like Three.js
│   ├── rope.js          # Rope physics and interaction: contains the logic for rope movement and physics simulation
│   ├── game.js          # Game logic, timer, and scoring: controls the gameplay, tracks time, and manages scores
│   ├── handtracking.js  # Hand tracking functionality: handles capturing and tracking hand movements, possibly using a library like TensorFlow.js
│   ├── voice.js         # Voice recognition system: implements voice commands and speech-to-text functionality
│   └── ui.js            # UI event handlers: manages user interface interactions, such as button clicks, form submissions, etc.
```

## Voice Commands

The application supports the following voice commands:
- **"restart"**: Restarts the game
- **"menu"**: Toggles the controls menu
- **"measure"** or **"knot"**: Measures the complexity of knots in the rope

## Keyboard Shortcuts

- **M**: Toggle the controls menu
- **D**: Toggle debug mode for voice recognition

## Knot Measurement System

The application includes an advanced knot measurement system that:
- Analyzes the complexity of knots tied in the rope
- Provides a rating from "Not knotted" to "Extreme knot"
- Applies difficulty multipliers to scores
- Visualizes the measurement process with interactive indicators

## How to Run

1. Clone the repository
2. Open the project in a live server
3. Access the application in a browser that supports WebGL and the Web Audio API

## Requirements

- Modern web browser with WebGL support
- Camera access for hand tracking
- Microphone access for voice commands
- Internet connection for the Hugging Face API (voice recognition)

## Dependencies

- Three.js (3D rendering)
- Cannon.js (Physics engine)
- MediaPipe (Hand tracking)
- Hugging Face API (Voice recognition)

## Notes

- The voice recognition system uses the Hugging Face Whisper API. You may need to replace the API key in `voice.js` with your own.
- For optimal performance, use a computer with a dedicated GPU.
- Hand tracking works best in well-lit environments with a clear view of your hands.