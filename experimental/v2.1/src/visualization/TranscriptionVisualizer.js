export class TranscriptionVisualizer {
  constructor(container, config = {}) {
    this.config = {
      fftSize: config.fftSize || 256,
      idleSize: config.idleSize || 48,
      expandedWidth: config.expandedWidth || 200,
      expandedHeight: config.expandedHeight || 60,
      barCount: config.barCount || 20,
      ...config,
    };

    // Create container
    this.container = document.createElement("div");
    this.container.className = "visualization-container";

    // Create canvas
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");

    // Add canvas to container
    this.container.appendChild(this.canvas);

    this.mode = "idle";
    this.styles = getComputedStyle(document.documentElement);

    // Audio analysis setup
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;

    this.setupCanvas();
    this.startAnimation();
  }

  setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const size = this.config.idleSize;

    // Set actual canvas dimensions
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;

    // Scale the context to ensure correct drawing operations
    this.ctx.scale(dpr, dpr);

    // Set display size
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;

    // Store the logical size for drawing calculations
    this.canvasWidth = size;
    this.canvasHeight = size;
  }
  async setupAudioAnalysis(stream) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = this.config.fftSize;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      }

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);

      return true;
    } catch (err) {
      console.error("Error setting up audio analysis:", err);
      return false;
    }
  }

  getColor(varName) {
    return this.styles.getPropertyValue(varName).trim();
  }

  drawIdle() {
    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;
    const radius = this.canvasWidth * 0.3;
    const time = Date.now() / 1000;

    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    // Outer ring with pulse
    this.ctx.beginPath();
    const pulseOpacity = 0.3 + 0.1 * Math.sin(time * 2);
    this.ctx.strokeStyle = this.getColor("--glow-outer");
    this.ctx.lineWidth = 2;
    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.ctx.stroke();

    // Inner core with glow
    const gradient = this.ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      radius * 0.7
    );
    gradient.addColorStop(0, this.getColor("--glow-core"));
    gradient.addColorStop(1, "transparent");
    this.ctx.fillStyle = gradient;
    this.ctx.fill();
  }

  drawListening() {
    const centerY = this.canvasHeight / 2;
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    if (!this.analyser) return;

    this.analyser.getByteFrequencyData(this.dataArray);

    const bars = this.config.barCount;
    const barWidth = 4;
    const spacing = 6;
    const maxHeight = this.canvasHeight * 0.8;

    this.ctx.fillStyle = this.getColor("--vis-listening");

    for (let i = 0; i < bars; i++) {
      const dataIndex = Math.floor(
        (i / bars) * this.analyser.frequencyBinCount
      );
      const value = this.dataArray[dataIndex];
      const height = (value / 255) * maxHeight;

      const x =
        (this.canvasWidth - bars * (barWidth + spacing)) / 2 +
        i * (barWidth + spacing);
      const y = centerY - height / 2;

      this.ctx.fillRect(x, y, barWidth, height);
    }
  }

  expandCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const { expandedWidth, expandedHeight } = this.config;

    // Set actual canvas dimensions
    this.canvas.width = expandedWidth * dpr;
    this.canvas.height = expandedHeight * dpr;

    // Scale the context to ensure correct drawing operations
    this.ctx.scale(dpr, dpr);

    // Set display size
    this.canvas.style.width = `${expandedWidth}px`;
    this.canvas.style.height = `${expandedHeight}px`;

    // Store the logical size for drawing calculations
    this.canvasWidth = expandedWidth;
    this.canvasHeight = expandedHeight;

    this.container.classList.add("expanded");
  }

  shrinkCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const size = this.config.idleSize;

    // Set actual canvas dimensions
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;

    // Scale the context to ensure correct drawing operations
    this.ctx.scale(dpr, dpr);

    // Set display size
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;

    // Store the logical size for drawing calculations
    this.canvasWidth = size;
    this.canvasHeight = size;

    this.container.classList.remove("expanded");
  }

  async setMode(mode, stream = null) {
    if (mode === this.mode) return;

    // Cleanup if switching from listening
    if (this.mode === "listening") {
      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
        this.analyser = null;
      }
    }

    this.mode = mode;

    if (mode === "idle") {
      this.shrinkCanvas();
    } else if (mode === "listening" && stream) {
      await this.setupAudioAnalysis(stream);
      this.expandCanvas();
    }
  }

  startAnimation() {
    const animate = () => {
      if (this.mode === "idle") {
        this.drawIdle();
      } else if (this.mode === "listening") {
        this.drawListening();
      }
      requestAnimationFrame(animate);
    };
    animate();
  }

  cleanup() {
    if (this.audioContext) {
      this.audioContext.close();
    }
  }
}
