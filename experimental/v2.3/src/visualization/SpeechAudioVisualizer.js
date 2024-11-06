export class SpeechAudioVisualizer {
    constructor(config = {}) {
        this.config = {
            fftSize: config.fftSize || 256,
            barCount: config.barCount || 20,
            ...config
        };

        // Create container and canvas (existing code)
        this.container = this.createContainer();
        this.canvas = this.createCanvas();
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);

        // Enhanced mode support
        this.mode = 'idle';  // idle, listening, playing, both
        this.styles = getComputedStyle(document.documentElement);

        // Audio context setup
        this.audioContext = null;
        this.analyser = null;
        this.synthAnalyser = null;  // New analyzer for synthesized speech
        this.dataArray = null;
        this.synthDataArray = null;  // New data array for synthesized speech

        this.initializeCanvas();
        this.idleBarHeights = this.calculateIdleBarHeights();
        this.startAnimation();
    }

    // Modified to handle both input and output streams
    async setupAudioAnalysis(stream, type = 'input') {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = this.config.fftSize;

            if (type === 'input') {
                const source = this.audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
                this.analyser = analyser;
                this.dataArray = new Uint8Array(analyser.frequencyBinCount);
            } else {
                const source = this.audioContext.createMediaElementSource(stream);
                source.connect(analyser);
                analyser.connect(this.audioContext.destination);
                this.synthAnalyser = analyser;
                this.synthDataArray = new Uint8Array(analyser.frequencyBinCount);
            }

            return true;
        } catch (err) {
            console.error('Error setting up audio analysis:', err);
            return false;
        }
    }

    // Modified draw methods to support both visualizations
    drawBars(heights, color, offset = 0) {
        const centerY = this.canvasHeight / 2;
        const barWidth = 4;
        const spacing = 6;
        const maxHeight = this.canvasHeight * 0.8;
        const startX = 4 + offset;

        this.ctx.fillStyle = this.getColor(color);
        heights.forEach((height, i) => {
            const barHeight = maxHeight * height;
            const x = startX + i * (barWidth + spacing);
            const y = centerY - barHeight / 2;
            this.ctx.fillRect(x, y, barWidth, barHeight);
        });
    }

    drawIdle() {
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.drawBars(this.idleBarHeights, '--primary-ghost');
    }

    drawListening() {
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        if (this.analyser) {
            this.analyser.getByteFrequencyData(this.dataArray);
            const heights = Array.from(this.dataArray)
                .slice(0, this.config.barCount)
                .map(value => value / 255);
            this.drawBars(heights, '--vis-listening');
        }
    }

    drawPlaying() {
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        if (this.synthAnalyser) {
            this.synthAnalyser.getByteFrequencyData(this.synthDataArray);
            const heights = Array.from(this.synthDataArray)
                .slice(0, this.config.barCount)
                .map(value => value / 255);
            this.drawBars(heights, '--primary-bright');
        }
    }

    drawBoth() {
        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

        // Draw input visualization
        if (this.analyser) {
            this.analyser.getByteFrequencyData(this.dataArray);
            const inputHeights = Array.from(this.dataArray)
                .slice(0, this.config.barCount)
                .map(value => value / 255);
            this.drawBars(inputHeights, '--vis-listening', 0);
        }

        // Draw output visualization
        if (this.synthAnalyser) {
            this.synthAnalyser.getByteFrequencyData(this.synthDataArray);
            const outputHeights = Array.from(this.synthDataArray)
                .slice(0, this.config.barCount)
                .map(value => value / 255);
            this.drawBars(outputHeights, '--primary-bright', this.canvasWidth / 2);
        }
    }

    async setMode(mode, stream = null) {
        if (mode === this.mode && !stream) return;

        this.mode = mode;
        this.container.classList.toggle('visualization--expanded',
            mode === 'listening' || mode === 'playing' || mode === 'both');

        if (stream) {
            if (mode === 'listening' || mode === 'both') {
                await this.setupAudioAnalysis(stream, 'input');
            }
            if (mode === 'playing' || mode === 'both') {
                await this.setupAudioAnalysis(stream, 'output');
            }
        }
    }

    startAnimation() {
        const animate = () => {
            switch (this.mode) {
                case 'idle':
                    this.drawIdle();
                    break;
                case 'listening':
                    this.drawListening();
                    break;
                case 'playing':
                    this.drawPlaying();
                    break;
                case 'both':
                    this.drawBoth();
                    break;
            }
            requestAnimationFrame(animate);
        };
        animate();
    }
}
