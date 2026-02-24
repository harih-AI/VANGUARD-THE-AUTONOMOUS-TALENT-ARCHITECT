# 🛡️ Vanguard: The Autonomous Talent Architect

> **The state-of-the-art multi-agent evaluation engine that eliminates hiring bias and identifies true technical excellence.**

Vanguard is a high-precision, AI-driven recruitment platform designed to autonomously evaluate hackathon submissions and technical assessments. Unlike standard systems that rely on keyword matching, Vanguard employs a sophisticated orchestration of specialized AI agents to perform deep-code analysis, verify project alignment, and detect repurposed boilerplate.

---

## 🚀 Key Features

*   **🕵️ Real-time Project Auditor**: Automatically detects "repurposed boilerplate" and generic templates (Lovable, Vite, etc.), ensuring only original work is rewarded.
*   **🧠 Lead Evaluator Synthesis**: A core orchestration layer that synthesizes feedback from multiple technical agents into a professional, cohesive 3-sentence executive summary.
*   **🔍 Deep-Logic Code Sampling**: Analyzes up to 10 files and 30,000+ characters of source code, prioritizing actual implementation logic (`/src`, `/lib`) over configuration files.
*   **📊 Multi-Dimensional Scoring**: Evaluates submissions across 6 critical dimensions:
    *   **Code Quality** (TypeScript Best Practices, Modularity)
    *   **Technical Implementation** (Architectural Depth, Advanced Patterns)
    *   **Problem Alignment** (Hackathon Requirement Verification)
    *   **Innovation** (Technical Creativity, "Wow" Factor)
    *   **Project Structure** (DevOps, Repository Organization)
    *   **Documentation Clarity** (README Completeness)
*   **🤖 Pure AI Engine**: Zero heuristic fallbacks. Every decision is driven by cutting-edge LLMs (Gemini 2.0 Flash) for maximum intelligence and fairness.

---

## 🏗️ The Agentic Architecture

Vanguard utilizes a **Shared Context Object (SCO)** protocol to coordinate specialized agents:

1.  **The Scout (Extractor)**: Intelligently parses resumes and extracts structured talent profiles.
2.  **The Architect (Event Manager)**: Manages hackathons, invitations, and candidate flow.
3.  **The Auditor (Judge)**: Scrutinizes GitHub repositories for technical debt and problem alignment.
4.  **The Analyst (Code Quality)**: Performs static analysis of source files to identify best practices.
5.  **The Final Orchestrator**: Synthesizes all agent reports into a human-readable hiring recommendation.

---

## 🛠️ Technology Stack

*   **Backend**: Node.js, Express, TypeScript (TSX)
*   **Intelligence**: Google Gemini 2.0 Flash (via OpenRouter)
*   **Database**: SQLite (Highly efficient local storage)
*   **Integration**: SimpleGit, GitHub API, Winston Logger
*   **Automation**: Agentic Evaluation Pipeline

---

## 🚥 Getting Started

### Prerequisites
- Node.js (v18+)
- OpenRouter API Key (for LLM access)

### Installation
1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd autonomous
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Create a `.env` file from the provided template:
   ```env
   PORT=3000
   OPENROUTER_API_KEY=your_key_here
   AI_MODEL=google/gemini-2.0-flash-001
   ```

### Execution
Start the server in development mode:
```bash
npm run dev
```
The Admin Panel will be available at `http://localhost:3000/admin`.

---

## 🌐 Deploying to the Cloud

Vanguard can be deployed easily using Docker or cloud platforms. Since it uses SQLite, ensure your deployment platform supports **Persistent Volumes**.

### Option 1: Railway (Recommended for SQLite)
1.  Connect your GitHub repository to [Railway.app](https://railway.app).
2.  Add a **Volume** and mount it to `/app/data` to persist the SQLite database.
3.  Set the following **Environment Variables**:
    *   `OPENROUTER_API_KEY`: Your API key.
    *   `PORT`: 3000
    *   `DB_PATH`: `/app/data/hackathon.db`
4.  Railway will automatically detect the `Dockerfile` and deploy.

### Option 2: Netlify (Serverless)
**⚠️ IMPORTANT:** Netlify is a serverless platform. Because it does not have a persistent filesystem, your local SQLite database will be **DELETED** every time the function sleeps or you re-deploy.

*   **Best Use Case**: Use Netlify only for the frontend if you move the backend to Railway/Render.
*   **To Deploy Anyway**:
    1.  Ensure you have a `netlify.toml` in your root.
    2.  Connected your GitHub repo to Netlify.
    3.  Set `OPENROUTER_API_KEY` in Netlify Environment Variables.
    4.  **Recommended**: Switch to a cloud database like **Turso** (SQLite compatible) or **Supabase** for persistence.

### Option 2: Docker
You can run the entire stack locally or on a VPS using Docker:
```bash
# Build the image
docker build -t vanguard-ai .

# Run the container with a persistent volume
docker run -d \
  -p 3000:3000 \
  -v vanguard_data:/app/data \
  -e OPENROUTER_API_KEY=your_key_here \
  --name vanguard-instance \
  vanguard-ai
```

---

## ⚖️ Compliance & Fairness
Vanguard is built on **MindFleet principles**, ensuring that all evaluations are deterministic, structured, and free from human bias. Every score is backed by specific evidence cited directly from the candidate's submission.

---
*Created by the Advanced Engineering team for the next generation of technical hiring.*
