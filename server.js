import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const groqApiKey = process.env.GROQ_API_KEY;
const groqModel = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

if (!groqApiKey) {
  console.warn(
    "Warning: GROQ_API_KEY is not set. Set it in your .env file before starting the server."
  );
}

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

app.post("/api/chat", async (req, res) => {
  const { message, file } = req.body || {};
  const trimmedMessage = (message || "").trim();

  if (!trimmedMessage) {
    return res.status(400).json({ error: { message: "Message is required." } });
  }

  if (!groqApiKey) {
    return res.status(500).json({
      error: { message: "Server is not configured with an API key." },
    });
  }

  if (file) {
    return res.status(400).json({
      error: {
        message:
          "File attachments are not supported with the Groq chat completions API.",
      },
    });
  }

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [{ role: "user", content: trimmedMessage }],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const errorMessage =
        data?.error?.message || "Upstream API request failed.";
      return res.status(response.status).json({
        error: { message: errorMessage },
      });
    }

    return res.json(data);
  } catch (error) {
    console.error("Error contacting Groq API", error);
    return res
      .status(500)
      .json({ error: { message: "Failed to contact the Groq API." } });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
