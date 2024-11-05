// src/visualization/TranscriptionVisualizer.js

export class TranscriptionVisualizer {
    constructor(container, config = {}) {
        this.config = {
            fftSize: config.fftSize || 256,
            canvasSize: config.canvasSize || 48,
            barCount: config.barCount || 20,
            ...config
        };

        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.mode = 'idle';
        this.styles = getComputedStyle(document.documentElement);

        // Audio analysis setup
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;

        this.setupCanvas();
        this.startAnimation();
    }

    setupCanvas() {
        const size = this.config.canvasSize;
        this.canvas.width = size;
        this.canvas.height = size;
        Object.assign(this.canvas.style, {
            borderRadius: '50%',
            backgroundColor: this.getColor('--surface-raised'),
            transition: 'all 0.3s ease'
        });
    }

    async setupAudioAnalysis(stream) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = this.config.fftSize;
                this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            }

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);

            return true;
        } catch (err) {
            console.error('Error setting up audio analysis:', err);
            return false;
        }
    }

    getColor(varName) {
        return this.styles.getPropertyValue(varName).trim();
    }

    drawIdle() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = this.canvas.width * 0.3;
        const time = Date.now() / 1000;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Outer ring with pulse
        this.ctx.beginPath();
        const pulseOpacity = 0.3 + 0.1 * Math.sin(time * 2);
        this.ctx.strokeStyle = this.getColor('--glow-outer');
        this.ctx.lineWidth = 2;
        this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        this.ctx.stroke();

        // Inner core with glow
        const gradient = this.ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, radius * 0.7
        );
        gradient.addColorStop(0, this.getColor('--glow-core'));
        gradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
    }

    drawListening() {
        if (this.canvas.width === this.config.canvasSize) {
            this.expandCanvas();
        }

        const centerY = this.canvas.height / 2;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.analyser) return;

        this.analyser.getByteFrequencyData(this.dataArray);

        const bars = this.config.barCount;
        const barWidth = 4;
        const spacing = 6;
        const maxHeight = this.canvas.height * 0.8;

        this.ctx.fillStyle = this.getColor('--vis-listening');

        for (let i = 0; i < bars; i++) {
            const dataIndex = Math.floor((i / bars) * this.analyser.frequencyBinCount);
            const value = this.dataArray[dataIndex];
            const height = (value / 255) * maxHeight;

            const x = (this.canvas.width - bars * (barWidth + spacing)) / 2 +
                     i * (barWidth + spacing);
            const y = centerY - height / 2;

            this.ctx.fillRect(x, y, barWidth, height);
        }
    }

    expandCanvas() {
        this.canvas.width = 200;
        this.canvas.height = 60;
        Object.assign(this.canvas.style, {
            borderRadius: '12px',
            transform: 'scale(1)'
        });
    }

    shrinkCanvas() {
        this.canvas.width = this.config.canvasSize;
        this.canvas.height = this.config.canvasSize;
        Object.assign(this.canvas.style, {
            borderRadius: '50%',
            transform: 'scale(1)'
        });
    }

    async setMode(mode, stream = null) {
        if (mode === this.mode) return;

        // Cleanup if switching from listening
        if (this.mode === 'listening') {
            if (this.audioContext) {
                await this.audioContext.close();
                this.audioContext = null;
                this.analyser = null;
            }
        }

        this.mode = mode;

        if (mode === 'idle') {
            this.shrinkCanvas();
        } else if (mode === 'listening' && stream) {
            await this.setupAudioAnalysis(stream);
            this.expandCanvas();
        }
    }

    startAnimation() {
        const animate = () => {
            if (this.mode === 'idle') {
                this.drawIdle();
            } else if (this.mode === 'listening') {
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
