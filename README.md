# TAMIL AI FORGE

> **From Words to Cinema.**  
> A personal-use offline AI filmmaking and video editing platform designed for cinematic storytelling, script-to-screen production, multi-track timeline editing, and master delivery.

---

## 1. Overview & Architecture

TAMIL AI FORGE enables directors and creators to produce cinematic content from script to final screening. The application is built for **100% offline local operation**, requiring zero external generative AI subscriptions or cloud credentials.

### Architectural Core Principles
- **Offline Mock AI Pipeline**: All generative media processes utilize [`MockVideoProvider`](backend/app/providers/mock_video.py) and [`MockMediaTransformProvider`](backend/app/services/ai_media_transform.py).
- **Native FFmpeg / FFprobe Engine**: All video transcoding, audio waveform extraction, multi-track timeline rendering, color grading (LUTs), and technical metadata probing are executed locally via FFmpeg binaries.
- **Zero External AI Calls**: Strict isolation from external cloud services. Zero network requests to Omni, Hugging Face ZeroGPU, Runway, Luma, Kling, ElevenLabs, OpenAI, or other third-party generative APIs.
- **Mock Transparency**: All synthetic generation cards and interfaces carry clear `OFFLINE DEMO` and `NOT REAL-PROVIDER-VERIFIED` transparency badges.
- **Dual-Tier Storage & Persistence**: Local SQLite database with Write-Ahead Logging (`WAL` mode) and local filesystem storage with path traversal protection.

---

## 2. Prerequisites

Ensure the following tools are installed on your workstation:

| Prerequisite | Minimum Version | Recommended | Notes |
| :--- | :---: | :---: | :--- |
| **Python** | 3.10+ | 3.12 | For FastAPI backend and asynchronous tasks |
| **Node.js** | 18.0+ | 20.x or 22.x | For Vite, React 19, and Tailwind CSS |
| **FFmpeg & FFprobe** | 5.0+ | 6.x or 7.x | Must be available in system `PATH` or bundled via `imageio-ffmpeg` |

---

## 3. Quick Start & Setup

### Step 1: Clone / Navigate to Repository
```bash
git clone <repository-url> tamil-ai-forge
cd tamil-ai-forge
```

### Step 2: Backend Setup
Create and activate a Python virtual environment inside the `backend` directory:

```bash
cd backend
python -m venv .venv

# On Windows (PowerShell):
.venv\Scripts\Activate.ps1

# On Windows (cmd.exe):
.venv\Scripts\activate.bat

# On Linux / macOS:
source .venv/bin/activate

# Install backend dependencies:
pip install -r requirements.txt
```

### Step 3: Frontend Setup
In a separate terminal, install the frontend dependencies:

```bash
cd frontend
npm install
```

### Step 4: Storage & Database Initialization
Database initialization is **fully automated**. 
When the FastAPI application boots up, its lifespan handler automatically:
1. Initializes the SQLite schema (`tamil_ai_forge.db` with WAL mode).
2. Applies necessary table migrations and schema updates.
3. Seeds default music genre folders and sound libraries.
4. Generates a starter demonstration project (*Ponniyin Selvan - Cinematic Reimagining*).

*(Optional)* To manually initialize all asset directories upfront:
```bash
python scripts/init_folders.py
```

### Step 5: Start the Development Servers

**Terminal 1 — Backend API Server:**
```bash
cd backend
uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 --reload
```
*Backend health check:* `http://127.0.0.1:8000/health`

**Terminal 2 — Frontend Dev Server:**
```bash
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```
*Frontend workspace:* `http://127.0.0.1:5173`

---

## 4. Complete Filmmaking Workflow

TAMIL AI FORGE follows a unified 13-stage workflow from narrative concept to final master screening:

```
[1. Project]        → Create/duplicate projects, configure 1920x1080 30fps Rec.709 settings
       ↓
[2. Story / Script] → Logline, synopsis, theme, and 5-beat scene breakdowns in Tamil & English
       ↓
[3. Characters]     → Visual style, age, gender, appearance, voice ID, reference portrait gallery
       ↓
[4. Scenes]         → Camera shot type, static/dynamic movement, lighting, dialogue, shot strategies
       ↓
[5. Audio / Dub]    → Multi-character Tamil dialogue synthesis, pitch/speed adjustment, voice assignment
       ↓
[6. Music]          → Genre/mood selection (melody, mass, sad, folk, devotional, ambient), stem volume
       ↓
[7. Captions]       → Auto-captioning, bilingual Tamil/English subtitles, SRT/VTT import/export
       ↓
[8. Assets]         → Global media library, waveform peak extraction, drag-and-drop to timeline
       ↓
[9. Transform]      → Image/Video-to-3D Cartoon, Character Replacement, Character Style Transfer
       ↓
[10. Graphics & Titles] → Cinematic Titles & Motion Graphics Studio (6 Presets, Tamil Typography, Lower Thirds)
       ↓
[11. Timeline]       → Multi-track NLE with Graphics track, snapping, split/duplicate, revisions
       ↓
[12. Render]         → Master render job with procedural drawtext title burn-in, progress tracking
       ↓
[13. Theater & Dist] → Cinema screening player, technical spec probes (FFprobe), stem audio solo/mute
```

---

## 5. Production Build & Deployment

### Building the Frontend for Production
```bash
cd frontend
npm run build
```
The optimized static production assets will be generated in `frontend/dist/`. These can be served directly via Nginx, Caddy, or mounted to FastAPI static files.

### Running Backend in Production Mode
```bash
cd backend
uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --workers 4
```

---

## 6. Testing & Quality Verification

TAMIL AI FORGE includes rigorous verification suites across both backend and frontend layers:

- **Backend Pytest Suite** (277 tests):
  ```bash
  cd backend
  pytest tests/test_backend.py -q
  ```
- **Phase 18 Targeted Pytest Suite**:
  ```bash
  cd backend
  pytest tests/test_backend.py -k "phase18" -v
  ```
- **TypeScript Static Verification**:
  ```bash
  cd frontend
  npx tsc --noEmit
  ```
- **Production Bundle Test**:
  ```bash
  cd frontend
  npm run build
  ```
- **Dependency Syntax Verification**:
  ```bash
  pip install --dry-run -r backend/requirements.txt
  ```
- **Phase 18 Graphics Studio Verification**:
  ```bash
  node scripts/verify_phase18_graphics.cjs
  ```
- **Puppeteer End-to-End Responsive Suites** (8 Viewports: 1920x1080 down to 375x812):
  ```bash
  node scripts/verify_phase16_puppeteer.cjs
  node scripts/verify_phase15_puppeteer.cjs
  node scripts/verify_phase14_puppeteer.cjs
  ```

---

## 7. Known Boundaries & Offline Guarantees

- **No External Cloud Accounts Required**: The platform is self-contained. Generating shots, performing 3D cartoon conversions, producing Tamil dubs, or overlaying cinematic titles operates locally via mock synthesis and local FFmpeg compositing.
- **Transparency Badging**: Video and audio assets generated within the mock pipeline explicitly indicate offline demonstration status to maintain production honesty.
- **Phase 18 Complete**: Cinematic Titles & Motion Graphics Studio is fully implemented, tested, and verified.

