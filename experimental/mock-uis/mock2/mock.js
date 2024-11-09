const REQUEST_TO_QUEUED_DELAY = 500;
const QUEUED_TO_PLAYING_DELAY = 500;
const PLAYING_TO_COMPLETED_DELAY = 8000;
const COMPLETED_TO_STALE_DELAY = 60000;

function transitionBubbleToStateAfterDelay(bubble, newState, delay) {
    return setTimeout(() => {
        bubble.dataset.state = newState;
    }, delay);
}

class MockVisualizer {
    constructor(config = {}) {
        this.config = {
            fftSize: config.fftSize || 256,
            barCount: config.barCount || 64,
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
            const amplitude = 0.01; // + decay * 0.005 * Math.pow(Math.sin(normalizedI * Math.PI * 2), 2);
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
        this.queue = [];
        this.bubbles = [];
        this.agentAudio = new Audio('mockaudio/agent1.mp3');
        this.agentText = '';

        // Mount the visualizer
        const container = document.querySelector('.visualizer');
        this.visualizer.mount(container);

        this.stateTransitionTimers = [];
        this.bubbleContainer = document.querySelector('.speech-bubbles');
        this.items = []; // Track items and their states
    }
    clearStateTimers() {
        this.stateTransitionTimers.forEach(timer => clearTimeout(timer));
        this.stateTransitionTimers = [];
    }

    createBubble() {
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        this.bubbleContainer.appendChild(bubble);
        return bubble;
    }
    async queueNormal() {
        const bubble = this.createBubble();
        bubble.dataset.state = 'requesting';

        // Requesting -> Queued
        this.stateTransitionTimers.push(
            transitionBubbleToStateAfterDelay(bubble, 'queued', REQUEST_TO_QUEUED_DELAY)
        );

        // Add to queue for processing
        this.queue.push(bubble);

        // Start processing queue if not already running
        setTimeout(() => this.processQueue(), QUEUED_TO_PLAYING_DELAY);
    }

    async processQueue() {
        if (this.isPlaying || this.queue.length === 0) return;

        const bubble = this.queue[0];
        this.isPlaying = true;

        // Transition to playing state
        bubble.dataset.state = 'playing';

        // Play the audio
        this.agentAudio.currentTime = 0;
        await this.visualizer.setMode('playing', this.agentAudio);
        await this.agentAudio.play();

        // Wait for audio to complete
        await new Promise(resolve => {
            this.agentAudio.onended = resolve;
        });

        // Transition to completed state
        bubble.dataset.state = 'completed';
        await this.visualizer.setMode('idle');

        // Remove from queue
        this.queue.shift();
        this.isPlaying = false;

        // Process next item if any
        if (this.queue.length > 0) {
            setTimeout(() => this.processQueue(), QUEUED_TO_PLAYING_DELAY);
        }
    }

    queueFail() {
        const bubble = this.createBubble();
        bubble.dataset.state = 'requesting';

        // Requesting -> Error
        this.stateTransitionTimers.push(
            transitionBubbleToStateAfterDelay(bubble, 'error', REQUEST_TO_QUEUED_DELAY)
        );
    }


    cleanup() {
        this.clearStateTimers();
        // Remove all bubbles
        while (this.bubbleContainer.firstChild) {
            this.bubbleContainer.removeChild(this.bubbleContainer.firstChild);
        }
        this.items = [];
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

    // Helper function to make state transitions clearer


    async processQueue() {
        // If something is playing, don't process
        if (this.isPlaying) return;

        // Find the next queued item
        const nextBubble = Array.from(this.bubbleContainer.children)
            .find(bubble => bubble.dataset.state === 'queued');

        if (!nextBubble) return; // No queued items to process

        this.isPlaying = true;

        // Start playing
        nextBubble.dataset.state = 'playing';
        this.agentAudio.currentTime = 0;
        await this.visualizer.setMode('playing', this.agentAudio);
        await this.agentAudio.play();

        // Schedule transition to completed
        this.stateTransitionTimers.push(
            transitionBubbleToStateAfterDelay(nextBubble, 'completed', PLAYING_TO_COMPLETED_DELAY)
        );

        // After audio finishes
        await new Promise(resolve => {
            this.agentAudio.onended = () => {
                this.isPlaying = false;
                this.visualizer.setMode('idle');
                // Try to process next item
                this.processQueue();
                resolve();
            };
        });
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
        </div>
        <div class="test-section">
            <h4>Text-to-Speech Simulation</h4>
            <button onclick="mockTTS.queueNormal()">Queue Normal</button>
            <button onclick="mockTTS.queueFail()">Queue Fail</button>
        </div>
    `;
    document.body.appendChild(panel);
}

async function testBothStreams() {
    await mockSTT.startRecording();
    setTimeout(() => mockTTS.queueSpeech(true),
        mockSTT.humanAudio.duration * 500);
}
