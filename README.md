# TAMIL AI FORGE

> **From Words to Cinema.**  
> A personal-use offline AI filmmaking and video editing platform designed for cinematic storytelling, script-to-screen production, multi-track timeline editing, and master delivery.

---

## 1. Overview & Architecture

TAMIL AI FORGE enables directors and creators to produce cinematic content from script to final screening. By default, the application operates in a **local mock/demo workflow** using built-in mock providers and local FFmpeg processing, requiring zero external generative AI subscriptions or cloud credentials.

### Architectural Core Principles
- **Offline Mock AI Pipeline**: All generative media processes utilize [`MockVideoProvider`](backend/app/providers/mock_video.py) and [`MockMediaTransformProvider`](backend/app/providers/mock_media_transform.py).
- **Native FFmpeg / FFprobe Engine**: All video transcoding, audio waveform extraction, multi-track timeline rendering, color grading (LUTs), and technical metadata probing are executed locally via FFmpeg binaries.
- **Default Local Isolation**: In default mode, all generative processes use local mock providers with zero external network requests to third-party generative APIs. Optional remote integrations require network access and configured provider credentials.
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

## 4. Complete Filmmaking Workflow & Editorial Toolset

TAMIL AI FORGE follows a unified workflow from narrative concept to final master screening:

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
[11. Timeline & NLE] → Desktop NLE timeline: ripple, roll, slip, slide, razor, 3-point/4-point, audio studio
       ↓
[12. Render]         → Master render job with procedural drawtext title burn-in, progress tracking
       ↓
[13. Theater & Dist] → Cinema screening player, technical spec probes (FFprobe), stem audio solo/mute
```

### Professional NLE Editorial Capabilities (Implemented & Supported)
- **Multi-Track Timeline**: Unlimited audio/video tracks, track locking, muting, soloing, and track destination patching.
- **Precision Trimming & Cutting**: Razor blade tool (all tracks), head/tail clip trimming, clip splitting at playhead, duplicate/copy/paste.
- **Advanced Trimming Tools**: Multi-track ripple editing, ripple delete with automatic gap closure, rolling edit tool across junctions, and slip & slide editing.
- **Dual-Monitor Workspace**: Side-by-side Source Monitor and Program Monitor with In/Out marking, three-point editing, four-point editing (fit-to-fill / dynamic speed adjustment), and match frame navigation.
- **Audio Studio & Automation**: Integrated multi-channel audio mixer, track-level volume and pan keyframe automation, dynamic VU/peak metering, and Web Audio API preview engine.
- **Visual Keyframing & Transitions**: Transform keyframing (scale, position, opacity), freeze frame, frame hold, and transition picker (crossfades, wipes, dissolves).
- **Timeline Navigation**: Interactive bird's-eye timeline mini-map, SMPTE timecode jump modal, zoom controls, and frame snapping.
- **Master Native Rendering**: 1080p Full HD master export at 30 fps (Rec.709 H.264/AAC) with hardware/software encoding and real-time progress events.

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

TAMIL AI FORGE includes verification suites across backend and frontend layers. The commands below can be run in their respective directories (historical figures reflect previously reported test runs and are not freshly executed during documentation review):

### Backend Pytest Suite (Previously Reported: 1,043 Passed)
```bash
cd backend
pytest -q
```
*Previously reported baseline: 1,043 passed tests covering core endpoints and Phase 20–50 modules (audio studio, ripple editing, razor cuts, 3-point/4-point, match frame, navigation). Historical record; not freshly re-run during documentation review.*

### TypeScript Static Typecheck (Previously Reported: 0 Errors)
```bash
cd frontend
npx tsc -b
```
*Previously reported baseline: 0 diagnostic errors.*

### Frontend Production Build (Previously Reported: 1,986 Modules Transformed)
```bash
cd frontend
npm run build
```
*Previously reported baseline: 1,986 modules transformed to static bundle.*

### Real Native Render Verification (Internal Validation Script)
```bash
python scripts/verify_real_render_validation.py
```
*Internal repository validation script (must be present in the working repository; untracked in release packages). Exercises local multi-track 1080p H.264/AAC rendering and FFprobe compliance.*

---

## 7. Operational Boundaries, AI Status & Offline Guarantees

### Default Local Offline Operation
- **No External Cloud Accounts Required for Default Workflow**: The core platform runs locally out-of-the-box. Generating narrative outlines, performing 3D cartoon conversions, producing Tamil dubs, or overlaying cinematic titles operates locally via mock synthesis and local FFmpeg compositing without requiring external accounts or network access.
- **Transparency Badging**: Video and audio assets generated within the mock pipeline explicitly indicate offline demonstration status (`OFFLINE DEMO` / `NOT REAL-PROVIDER-VERIFIED`) to maintain complete production honesty.

### Remote AI Video Generation Status
> [!IMPORTANT]
> **Remote AI video generation is currently unverified and blocked by remote GPU availability. The previous Hugging Face ZeroGPU request failed with "No GPU was available after 60s". No real video artifact was returned from that attempt.**
>
> During empirical testing against the Hugging Face ZeroGPU Space (`FrameAI4687/Omni-Video-Factory`), the request timed out in the remote queue with the error message above. The remote provider did not return a video file, and no real video artifact was created or added to the project.

### Operational Separation
1. **Source-Code Implementation**: Multi-track timeline editing, audio controls, dual-monitor playback, keyframing, and local FFmpeg rendering workflows are implemented in the codebase.
2. **Recorded Verification History**: Previously reported test suites (such as backend pytest runs and frontend builds) represent historical test records; they are not freshly re-verified during every documentation review.
3. **Offline Demo AI Pipeline**: Default local mock providers simulate media generation workflows for local demonstration without external cloud subscriptions.
4. **Real External Cloud AI Generation**: Unverified and currently blocked by remote GPU availability.

