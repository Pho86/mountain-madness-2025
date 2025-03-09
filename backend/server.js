import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increase limit for audio data

app.post("/transcribe", async (req, res) => {
    try {
        const { audioBase64 } = req.body;

        if (!audioBase64) {
            return res.status(400).json({ error: "No audio data provided" });
        }

        // Call Hugging Face API
        const response = await fetch(
            "https://api-inference.huggingface.co/models/openai/whisper-large-v3",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.HF_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    inputs: audioBase64.split(",")[1], // Remove the data URL prefix
                }),
            }
        );

        if (!response.ok) {
            throw new Error(`Hugging Face API error: ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Transcription error:", error);
        res.status(500).json({ error: "Failed to transcribe audio" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));