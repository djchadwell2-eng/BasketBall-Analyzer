# Basketball Film Analyzer

Upload a basketball video clip and get instant AI-powered tactical analysis powered by OpenAI Vision (GPT-4o).

**Pipeline:** Upload → ffmpeg extracts 5 frames → GPT-4o analyzes them → tactical summary displayed

---

## Prerequisites

### 1. Node.js
Download from https://nodejs.org (LTS version recommended).

### 2. ffmpeg
ffmpeg must be installed and available on your system PATH.

**Windows (via winget):**
```powershell
winget install Gyan.FFmpeg
```
Then restart your terminal and verify:
```powershell
ffmpeg -version
ffprobe -version
```

**Mac (via Homebrew):**
```bash
brew install ffmpeg
```

### 3. OpenAI API Key
Get a key at https://platform.openai.com/api-keys.
The app uses `gpt-4o` with vision — ensure your account has access.

---

## Setup

```powershell
# 1. Install dependencies
npm install

# 2. Create your environment file
copy .env.local.example .env.local

# 3. Add your OpenAI API key to .env.local
#    OPENAI_API_KEY=sk-...

# 4. Start the dev server
npm run dev
```

Open http://localhost:3000

---

## Usage

1. Click the upload area and select a video (MP4, MOV, AVI, or WebM)
2. Click **Analyze Video**
3. Wait ~30–60 seconds for frame extraction and AI analysis
4. Review the 5 extracted frames and the tactical summary below them

---

## Project Structure

```
app/
  page.tsx                  Homepage — upload form, loading states, results
  api/analyze/route.ts      POST endpoint: receives video, runs pipeline
lib/
  extractFrames.ts          ffmpeg wrapper — extracts 5 evenly-spaced frames
  analyzeFrames.ts          OpenAI Vision wrapper — returns tactical analysis
components/
  VideoUpload.tsx            File picker UI
  FrameGrid.tsx              5-frame display grid
  AnalysisSummary.tsx        AI analysis output
```

---

## Notes

- Videos up to 200MB are supported
- Frame extraction seeks to 10%, 30%, 50%, 70%, and 90% of the video duration
- `detail: high` is used for OpenAI image analysis for best tactical accuracy
- Temp files (uploaded video + extracted frames) are deleted after each analysis
