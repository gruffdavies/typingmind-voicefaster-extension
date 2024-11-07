class MockVisualizer {
    constructor(config = {}) {
        this.config = {
            fftSize: config.fftSize || 256,
            barCount: config.barCount || 32,
            className: config.className || '',
            color: config.color || '--vf-primary',
            xOffset: config.xOffset || 0, // Add x-offset to config
            ...config
        };

        // Initialize properties but don't create DOM elements yet
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.mode = 'idle';
        this.styles = getComputedStyle(document.documentElement);

        // Audio context setup
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;

        // Animation state
        this.animationFrame = null;
        this.isInitialized = false;
        this.connectedSources = new Map();
    }

    createCanvas() {
        const canvas = document.createElement("canvas");
        canvas.className = `visualization__canvas ${this.config.className}`;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        return canvas;
    }

    getColor(varName) {
        return this.styles.getPropertyValue(varName).trim();
    }

    async setupAudioAnalysis(stream) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            if (this.audioContext.state === "suspended") {
                await this.audioContext.resume();
            }

            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = this.config.fftSize;

            if (stream instanceof MediaStream) {
                const source = this.audioContext.createMediaStreamSource(stream);
                source.connect(analyser);
            } else if (stream instanceof HTMLMediaElement) {
                let source = this.connectedSources.get(stream);
                if (!source) {
                    source = this.audioContext.createMediaElementSource(stream);
                    this.connectedSources.set(stream, source);
                }
                source.connect(analyser);
                source.connect(this.audioContext.destination);
            }

            this.analyser = analyser;
            this.dataArray = new Uint8Array(analyser.frequencyBinCount);
            return true;
        } catch (err) {
            console.error('Error setting up audio analysis:', err);
            return false;
        }
    }

    mount(container) {
        if (!container) {
            throw new Error('Container element must be provided to mount visualizer');
        }

        // Cleanup if already mounted
        if (this.isInitialized) {
            this.unmount();
        }

        this.container = container;
        this.container.style.position = 'relative';

        // Create and mount canvas
        this.canvas = this.createCanvas();
        this.ctx = this.canvas.getContext('2d', { alpha: true });
        this.container.appendChild(this.canvas);

        this.initializeCanvas();
        this.startAnimation();
        this.isInitialized = true;

        // Add resize observer
        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(this.container);

        return this;
    }

    unmount() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        this.cleanup();
        this.isInitialized = false;
    }

    cleanup() {
        this.connectedSources.forEach((source) => {
            source.disconnect();
        });
        this.connectedSources.clear();

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
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

    handleResize() {
        if (!this.isInitialized) return;
        this.initializeCanvas();
    }

    async setMode(mode, stream = null) {
        if (mode === this.mode && !stream) return;

        this.mode = mode;
        this.container.classList.toggle('visualization--expanded',
            mode === 'listening' || mode === 'playing');

        if (stream) {
            await this.setupAudioAnalysis(stream);
        }
    }

    drawBars(heights) {
        const centerY = this.canvasHeight / 2;
        const maxHeight = this.canvasHeight * 0.8;

        // Calculate bar width and spacing to fit all bars
        const totalBars = this.config.barCount;
        const minSpacing = 2;
        const desiredBarToSpaceRatio = 0.7;

        // Calculate total width available for bars and spacing
        const usableWidth = this.canvasWidth - 8; // 4px padding on each side

        // Calculate width of one bar+space unit
        const unitWidth = usableWidth / totalBars;

        // Calculate bar width and spacing
        const barWidth = Math.max(1, Math.floor(unitWidth * desiredBarToSpaceRatio));
        const spacing = Math.max(minSpacing, (usableWidth - (barWidth * totalBars)) / (totalBars - 1));

        // Calculate offset in terms of bar units
        const barUnitWidth = barWidth + spacing;
        const offsetPixels = barUnitWidth * this.config.xOffset;
        const startX = 4 + offsetPixels;

        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.ctx.fillStyle = this.getColor(this.config.color);

        heights.forEach((height, i) => {
            const barHeight = maxHeight * height;
            const x = startX + i * barUnitWidth;
            const y = centerY - barHeight / 2;
            this.ctx.fillRect(x, y, barWidth, barHeight);
        });
    }



    calculateIdleBarHeights() {
        const heights = [];
        for (let i = 0; i < this.config.barCount; i++) {
            const normalizedI = i / (this.config.barCount - 1);
            var decay = (this.config.barCount - i) / this.config.barCount;
            const amplitude = 0.01 + decay * 0.05 * Math.pow(Math.sin(normalizedI * Math.PI * 2), 2);
            heights.push(amplitude * 0.5); // Reduced amplitude for idle state
        }
        return heights;
    }

    startAnimation() {
        const animate = () => {
            if (this.mode === 'listening' || this.mode === 'playing') {
                this.updateVisualization();
            } else {
                this.drawIdle();
            }
            this.animationFrame = requestAnimationFrame(animate);
        };
        animate();
    }

    updateVisualization() {
        if (!this.analyser || !this.dataArray) return;
        this.analyser.getByteFrequencyData(this.dataArray);
        const heights = Array.from(this.dataArray)
            .slice(0, this.config.barCount)
            .map(value => value / 255);
        this.drawBars(heights);
    }

    drawIdle() {
        this.drawBars(this.calculateIdleBarHeights());
    }
}

class MockSTT {
    constructor() {
        this.visualizer = new MockVisualizer({
            className: 'human-speech',
            color: '--vf-primary',
            xOffset: 0
        });
        this.isRecording = false;
        this.transcriptArea = document.querySelector('.transcript-content');
        this.micButton = document.querySelector('.mic-button');
        this.voiceFaster = document.querySelector('.voice-faster');

        // Audio and text content
        this.humanAudio = new Audio('mockaudio/human1.mp3');
        this.transcriptText = '';
        this.transcriptIndex = 0;
        this.transcriptInterval = null;

        // Mount the visualizer
        const container = document.querySelector('.visualizer');
        this.visualizer.mount(container);
    }

    simulateInterimResults() {
        const quality = document.getElementById('sttQuality').value;
        const phrases = {
            good: ["Testing one two three", "Testing one two three four"],
            medium: ["Testing won too three", "Testing one too three four"],
            poor: ["Tasting when to free", "Tasting when to three four"]
        };

        let index = 0;
        if (this.transcriptInterval) {
            clearInterval(this.transcriptInterval);
        }

        this.transcriptInterval = setInterval(() => {
            if (index < phrases[quality].length) {
                this.transcriptArea.textContent = phrases[quality][index];
                index++;
            } else {
                clearInterval(this.transcriptInterval);
            }
        }, 1000);
    }

    async loadTranscriptText() {
        try {
            const response = await fetch('mockaudio/human1.txt');
            this.transcriptText = await response.text();
        } catch (err) {
            console.error('Error loading transcript:', err);
            this.transcriptText = "Error loading transcript";
        }
    }

    async startRecording() {
        await this.loadTranscriptText();
        this.isRecording = true;
        this.voiceFaster.dataset.state = 'recording';
        this.micButton.classList.add('active');
        this.transcriptArea.parentElement.classList.add('active');

        this.humanAudio.currentTime = 0;
        await this.humanAudio.play();
        await this.visualizer.setMode('listening', this.humanAudio);

        this.transcriptIndex = 0;
        this.simulateTranscription();
    }

    simulateTranscription() {
        if (this.transcriptInterval) {
            clearInterval(this.transcriptInterval);
        }

        const words = this.transcriptText.split(' ');

        this.transcriptInterval = setInterval(() => {
            if (this.transcriptIndex < words.length) {
                const currentText = words.slice(0, this.transcriptIndex + 1).join(' ');
                this.transcriptArea.textContent = currentText;
                this.transcriptIndex++;
            } else {
                clearInterval(this.transcriptInterval);
            }
        }, 400);
    }

    async stopRecording() {
        this.isRecording = false;
        this.voiceFaster.dataset.state = 'idle';
        this.micButton.classList.remove('active');

        this.humanAudio.pause();
        this.humanAudio.currentTime = 0;
        if (this.transcriptInterval) {
            clearInterval(this.transcriptInterval);
        }

        await this.visualizer.setMode('idle');

        document.querySelector('.actions').classList.add('active');
    }
}

class MockTTS {
    constructor() {
        this.visualizer = new MockVisualizer({
            className: 'agent-speech',
            color: '--vf-secondary',
            xOffset: 0.5
        });
        this.bubbles = document.querySelectorAll('.bubble');
        this.queue = [];
        this.agentAudio = new Audio('mockaudio/agent1.mp3');
        this.agentText = '';

        // Mount the visualizer
        const container = document.querySelector('.visualizer');
        this.visualizer.mount(container);
    }

    async loadAgentText() {
        try {
            const response = await fetch('mockaudio/agent1.txt');
            this.agentText = await response.text();
        } catch (err) {
            console.error('Error loading agent text:', err);
            this.agentText = "Error loading agent response";
        }
    }

    async queueSpeech(text) {
        if (typeof text === 'string') {
            this.queue.push(text);
        } else {
            await this.loadAgentText();
            this.queue.push(this.agentText);
        }

        this.updateBubbleStates();
        setTimeout(() => this.processQueue(), 500);
    }

    async processQueue() {
        if (this.queue.length > 0) {
            const text = this.queue[0];
            this.updateBubbleStates('playing');

            this.agentAudio.currentTime = 0;
            await this.agentAudio.play();
            await this.visualizer.setMode('playing', this.agentAudio);

            await new Promise(resolve => {
                this.agentAudio.onended = resolve;
            });

            this.queue.shift();
            this.updateBubbleStates();
            await this.visualizer.setMode('idle');
        }
    }

    simulateError() {
        const errorBubble = this.bubbles[Math.floor(Math.random() * this.bubbles.length)];
        errorBubble.dataset.state = 'error';
        setTimeout(() => this.updateBubbleStates(), 2000);
    }

    updateBubbleStates(state = null) {
        this.bubbles.forEach((bubble, index) => {
            if (state === 'playing' && index === 0) {
                bubble.dataset.state = 'playing';
            } else if (index < this.queue.length) {
                bubble.dataset.state = 'queued';
            } else {
                bubble.dataset.state = 'completed';
            }
        });
    }
}

function addTestControls() {
    const panel = document.createElement('div');
    panel.className = 'test-panel';
    panel.innerHTML = `
        <h3>Test Controls</h3>
        <div class="test-section">
            <h4>Speech-to-Text Simulation</h4>
            <button onclick="mockSTT.startRecording()">Start Recording</button>
            <button onclick="mockSTT.stopRecording()">Stop Recording</button>
            <button onclick="mockSTT.simulateInterimResults()">Simulate Interim Results</button>
            <select id="sttQuality">
                <option value="good">Good Recognition</option>
                <option value="medium">Medium Quality</option>
                <option value="poor">Poor Recognition</option>
            </select>
        </div>
        <div class="test-section">
            <h4>Text-to-Speech Simulation</h4>
            <button onclick="mockTTS.queueSpeech('Short test message')">Queue Short Message</button>
            <button onclick="mockTTS.queueSpeech('This is a longer message that will take more time to process and play through the system.')">Queue Long Message</button>
            <button onclick="mockTTS.simulateError()">Simulate TTS Error</button>
        </div>
    `;
    document.body.appendChild(panel);
}

async function testBothStreams() {
    await mockSTT.startRecording();
    setTimeout(() => mockTTS.queueSpeech(true),
        mockSTT.humanAudio.duration * 500);
}
