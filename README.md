# AI-Chatbot

AI Chatbot using HTML, CSS, JavaScript and the Groq chat completions API.

Ask any question and get instant answers. The chatbot includes features like image upload, an emoji picker, and is powered by AI. It's also fully responsive so that you can use it on your phone.

> **Note**: The Groq API path supports text queries only; image uploads will return a friendly error.

## Local setup

- Install dependencies with `npm install`.
- Create a `.env` file and add your Groq API key as `GROQ_API_KEY=your-key` (optionally set `GROQ_MODEL` if you need something other than the default `llama-3.3-70b-versatile`).
- Start the proxy server with `npm run dev` and open `http://localhost:3000` in your browser.

## Why the proxy exists

- The frontend now calls `/api/chat`, so the API key stays on the server.
- Environment variables live only in `.env`, which is git-ignored to keep secrets off GitHub.
- Any other client (mobile app, web app, etc.) can reuse the same proxy without exposing credentials.
