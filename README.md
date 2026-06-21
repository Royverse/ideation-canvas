# milkyway.ai // NVIDIA NIM Developer Galaxy

> [!NOTE]
> **milkyway.ai** is an immersive, high-performance developer sandbox and interactive portfolio showcase for **NVIDIA NIM (NVIDIA Inference Microservices)**. It is built as a deep-space model galaxy where developers can explore, benchmark, and prototype applications across conversational, reasoning, coding, embedding, and vision models in real time.

---

## 🌌 Interactive Features

The application is structured as a premium developer console, containing five specialized labs connected by a central constellation interface:

### 1. 🛰️ Constellation Map
An interactive, physics-driven gravity map visualizing the available model catalog. Nodes are clustered dynamically by capability (Chat, Code, Reasoning, Vision, Embedding) and context window size. Drag to pan, scroll to zoom, and hover to inspect capabilities. Click any node to open the corresponding lab.

### 2. 💬 Chat Arena
A playground for conversational models featuring:
- **Telemetry HUD:** Real-time measuring of **time-to-first-token (TTFT)** latency, **tokens per second (TPS)** speed, and word counts.
- **Developer Deck:** Adjustable system prompts, temperature, and token limit controls.
- **Interface:** Styled with smooth transitions and formatted Markdown with code syntax highlighting.

### 3. 💻 Code Lab
A split-screen developer environment optimized for coding NIMs:
- **Custom Draggable Split Pane:** Smooth horizontal resizing on desktop and vertical resizing on mobile between the conversation deck and code workspace.
- **Interactive Workspace:** Dynamic tab controls to swap between instructions and generated code files. Includes copy-to-clipboard and direct file download options.

### 4. 🧠 Reasoning Engine
A custom interface designed for deep reasoning models (e.g., Llama-3.1-Reasoning, DeepSeek):
- **Waveform Visualizer:** Live canvas-drawn sinusoidal animation reflecting thought states.
- **Thinking Chain:** Renders expandable multi-step reasoning thoughts, letting you inspect the model's logical derivation before it renders the final response.

### 5. 🔍 Embedding Search (Semantic Space)
A visual vector database playground:
- **Interactive Map:** Encodes custom documents in real time and plots them as nodes on a 2D coordinate canvas.
- **Attractor Mechanics:** Querying pulls semantically matching documents toward the center of the canvas and pushes unrelated documents to the outer edges.
- **Match Legend:** Color-coded matches highlighting strong, moderate, and weak document relevance.

### 6. 👁️ Vision Lab
An advanced multi-modal inspection lab:
- **Interactive Scanner:** A hover-synchronized canvas spotlight scanning images on mouse move.
- **Regional Focus:** Crop-focus triggers visual description prompts for specific coordinates.

---

## 🛠️ Architecture & Tech Stack

- **Core:** React 18, Vite (fast HMR and building).
- **Styling:** Vanilla CSS design system with custom custom glassmorphism, claymorphism variables, and responsive sidebar animations.
- **API Engine:** Direct SSE (Server-Sent Events) streaming connection to `api.nvidia.com/v1` with automatic model categorization.
- **Security:** Built-in credentials isolation: supports local browser storage encryption or secure VITE environment variables (`VITE_NVIDIA_API_KEY`).

---

## 🚀 Local Setup

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/Royverse/milkyway.ai.git
   cd milkyway.ai
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   VITE_NVIDIA_API_KEY=your_nvidia_api_key_here
   ```

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```

5. **Build for Production:**
   ```bash
   npm run build
   ```

---

## 🌐 Production Deployment

This project is optimized to run serverless on **Netlify**:
- Environment keys are stored securely using Netlify's secret management (`VITE_NVIDIA_API_KEY`).
- Continuous integration is set up via GitHub: every push to `main` automatically triggers a production build.
