// src/visualization/TranscriptionVisualizer.js

export class TranscriptionSpeechVisualizer {
    constructor(config = {}) {
        this.config = {
            fftSize: config.fftSize || 256,
            barCount: config.barCount || 20,
            ...config,
        };

        this.container = this.createContainer();
        this.canvas = this.createCanvas();
        this.ctx = this.canvas.getContext("2d");
        this.container.appendChild(this.canvas);

        this.mode = "idle";
        this.styles = getComputedStyle(document.documentElement);
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;

        this.initializeCanvas();
        this.idleBarHeights = this.calculateIdleBarHeights();
        this.startAnimation();
    }

    createContainer() {
        const container = document.createElement("div");
        container.className = "visualization";
        return container;
    }

    createCanvas() {
        const canvas = document.createElement("canvas");
        canvas.className = "visualization__canvas";
        return canvas;
    }

    initializeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const baseWidth = 200;
        const baseHeight = 56;

        this.canvas.width = baseWidth * dpr;
        this.canvas.height = baseHeight * dpr;
        this.ctx.scale(dpr, dpr);
        this.canvasWidth = baseWidth;
        this.canvasHeight = baseHeight;
    }


    async setupAudioAnalysis(stream) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
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

    calculateIdleBarHeights() {
        const heights = [];
        for (let i = 0; i < this.config.barCount; i++) {
            const normalizedI = i / (this.config.barCount - 1);
            var decay = (this.config.barCount - i)/this.config.barCount;
            const amplitude = 0.3 + decay*0.75*Math.pow(Math.sin(normalizedI * Math.PI * 2), 2);
            heights.push(amplitude);
        }
        return heights;
    }

    drawBars(heights, color) {
        const centerY = this.canvasHeight / 2;
        const barWidth = 4;
        const spacing = 6;
        const maxHeight = this.canvasHeight * 0.8;
        const startX = 4;

        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.ctx.fillStyle = this.getColor(color);

        heights.forEach((height, i) => {
            const barHeight = maxHeight * height;
            const x = startX + i * (barWidth + spacing);
            const y = centerY - barHeight / 2;
            this.ctx.fillRect(x, y, barWidth, barHeight);
        });
    }

    drawIdle() {
        this.drawBars(this.idleBarHeights, "--primary-ghost");
    }

    drawListening() {
        if (!this.analyser) return;

        this.analyser.getByteFrequencyData(this.dataArray);
        const heights = Array.from(this.dataArray)
            .slice(0, this.config.barCount)
            .map(value => value / 255);

        this.drawBars(heights, "--vis-listening");
    }

    async setMode(mode, stream = null) {
        if (mode === this.mode) return;

        if (this.mode === "listening" && this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
            this.analyser = null;
        }

        this.mode = mode;
        this.container.classList.toggle("visualization--expanded", mode === "listening");

        if (mode === "listening" && stream) {
            await this.setupAudioAnalysis(stream);
        }
    }

    getColor(varName) {
        return this.styles.getPropertyValue(varName).trim();
    }

    startAnimation() {
        const animate = () => {
            this.mode === "idle" ? this.drawIdle() : this.drawListening();
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
