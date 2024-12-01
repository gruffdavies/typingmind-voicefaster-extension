const REQUEST_TO_QUEUED_DELAY = 500;
const QUEUED_TO_PLAYING_DELAY = 500;
const PLAYING_TO_COMPLETED_DELAY = 8000;
const COMPLETED_TO_STALE_DELAY = 60000;

function transitionBubbleToStateAfterDelay(bubble, newState, delay) {
    return setTimeout(() => {
        bubble.dataset.state = newState;
    }, delay);
}

// Add at the top of mock.js
const AudioManager = {
    context: null,
    sources: new Map(),

    getContext() {
        if (!this.context) {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.context;
    },

    async getSource(stream) {
        if (!this.context) {
            this.context = this.getContext();
        }

        if (stream instanceof HTMLMediaElement) {
            let source = this.sources.get(stream);
            if (!source) {
                source = this.context.createMediaElementSource(stream);
                this.sources.set(stream, source);
            }
            return source;
        } else if (stream instanceof MediaStream) {
            return this.context.createMediaStreamSource(stream);
        }
        return null;
    }
};

class MockVisualizer {
    constructor(config = {}) {
        this.config = {
            fftSize: config.fftSize || 256,
            barCount: config.barCount || 64,
            className: config.className || '',
            color: config.color || '--vf-accent',
            xAxisPos: config.xAxisPos,
            xOffset: config.xOffset,
            yAxisPos: config.yAxisPos,
            heightScale: config.heightScale || 1,
            ...config
        };

        // check for null - validate mandatory without defaults
        if (this.config.xAxisPos == null || this.config.yAxisPos == null || this.config.xOffset === null) {
            throw new Error(`xAxisPos (${this.config.xAxisPos}), yAxisPos (${this.config.yAxisPos}), and xOffset (${this.config.xOffset}) are mandatory`);
        }

        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.mode = 'idle';
        this.styles = getComputedStyle(document.documentElement);
        this.analyser = null;
        this.dataArray = null;
        this.animationFrame = null;
        this.isInitialized = false;

        // Add visualization parameters
        this.vizParams = null;
    }

    createCanvas() {
        const canvas = document.createElement("canvas");
        canvas.className = `vf-canvas ${this.config.className === 'human-speech' ? 'vf-canvas--human' : 'vf-canvas--agent'}`;
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



    async setMode(mode, stream = null) {
        if (mode === this.mode && !stream) return;

        this.mode = mode;

        if (stream) {
            try {
                const context = AudioManager.getContext();

                if (context.state === "suspended") {
                    await context.resume();
                }

                // Create and configure analyser
                this.analyser = context.createAnalyser();
                this.analyser.fftSize = this.config.fftSize || 2048;
                this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

                // Get shared source
                const source = await AudioManager.getSource(stream);

                // Connect to analyser
                source.connect(this.analyser);

                // Connect to destination only for media elements
                if (stream instanceof HTMLMediaElement) {
                    source.connect(context.destination);
                }

                return true;
            } catch (err) {
                console.error('Error in setMode:', err);
                return false;
            }
        } else {
            // Clear analyser when stopping
            if (this.analyser) {
                this.analyser.disconnect();
                this.analyser = null;
            }
            this.dataArray = null;
        }
    }

    cleanup() {
        if (this.analyser) {
            this.analyser.disconnect();
            this.analyser = null;
        }
        this.dataArray = null;
    }



    // Private method to compute visualization parameters
    #computeVizParams() {
        if (!this.ctx || !this.canvasWidth || !this.canvasHeight) return null;

        const barCount = this.config.barCount;
        const barWidth = this.canvasWidth / barCount;
        const xBarOffset = barWidth * this.config.xOffset;
        const maxHeight = this.canvasHeight * this.config.heightScale;

        return {
            barWidth,
            xBarOffset,
            xStart: (this.canvasWidth * this.config.xAxisPos) + xBarOffset,
            yAxisPos: this.config.yAxisPos, // Store the raw config value
            maxHeight,
        };
    }

    initializeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.container.getBoundingClientRect();

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);

        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;

        // show all above values to console
        console.log(`Initialized ${this.config.className} canvas with dims:`, this.canvasWidth, this.canvasHeight);

        // Recompute visualization parameters after canvas resize
        this.vizParams = this.#computeVizParams();
        console.log(`Initialized ${this.config.className} canvas with vizParams:`, this.vizParams);
    }
    drawBars(heights) {
        if (!this.ctx) return;

        // Recompute parameters if needed
        if (!this.vizParams) {
            this.vizParams = this.#computeVizParams();
            if (!this.vizParams) return;
        }

        const { barWidth, xStart, yAxisPos, maxHeight } = this.vizParams;

        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.ctx.fillStyle = this.getColor(this.config.color);

        heights.forEach((height, i) => {
            const barHeight = height * maxHeight;
            const x = xStart + 2 * i * barWidth;

            // yAxisPos as anchor point:
            // 1.0 = bottom of canvas (bars grow up)
            // 0.0 = top of canvas (bars grow down)
            // 0.5 = middle of canvas (bars grow from center)
            let y;
            if (yAxisPos === 1.0) {
                // Bottom aligned - bars grow up
                y = this.canvasHeight - barHeight;
            } else if (yAxisPos === 0.0) {
                // Top aligned - bars grow down
                y = 0;
            } else {
                // Center aligned at yAxisPos
                y = (yAxisPos * this.canvasHeight) - (barHeight / 2);
            }

            this.ctx.beginPath();
            this.ctx.roundRect(x, y, barWidth, barHeight, 2);
            this.ctx.fill();
        });
    }



    handleResize() {
        if (!this.isInitialized) return;
        this.initializeCanvas();
        // vizParams will be recomputed on next draw
        this.vizParams = null;
    }

    updateVisualization() {
        if (!this.analyser || !this.dataArray) return;

        const frequencyBins = 32; // More bars for drag bar width
        const binSize = Math.floor(this.analyser.frequencyBinCount / frequencyBins);
        const heights = new Array(frequencyBins).fill(0);

        this.analyser.getByteFrequencyData(this.dataArray);

        for (let i = 0; i < frequencyBins; i++) {
            let sum = 0;
            for (let j = 0; j < binSize; j++) {
                sum += this.dataArray[i * binSize + j];
            }
            // Smooth and scale the visualization
            heights[i] = (sum / binSize / 255) * 0.5; // Reduced amplitude
        }

        this.drawBars(heights);
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



    drawIdle() {
        // this.drawBars(this.calculateIdleBarHeights());
    }
}

class MockTTS {
    constructor(visualizer) {  // Accept visualizer as parameter
        this.visualizer = visualizer;  // Use passed visualizer
        this.queue = [];
        this.bubbles = [];
        this.agentAudio = new Audio('mockaudio/agent1.mp3');
        this.agentText = '';
        this.stateTransitionTimers = [];
        this.bubbleContainer = document.querySelector('.vf-bubble-tray');  // Fixed: wrong selector
        this.items = [];
    }

    createBubble() {
        const bubble = document.createElement('div');
        bubble.className = 'vf-tts-bubble';
        this.bubbleContainer.appendChild(bubble);
        return bubble;
    }
    clearStateTimers() {
        this.stateTransitionTimers.forEach(timer => clearTimeout(timer));
        this.stateTransitionTimers = [];
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
class MockSTT {
    constructor(buttonViz, dragBarViz) {
        this.buttonVisualizer = buttonViz;
        this.dragBarVisualizer = dragBarViz;
        this.isRecording = false;

        this.micButton = document.getElementById('vf-mic-button');
        this.widget = document.querySelector('.vf-widget');

        this.humanAudio = new Audio('mockaudio/human1.mp3');
        this.transcriptText = '';
        this.transcriptIndex = 0;
        this.transcriptInterval = null;

        // Keep these
        this.transcript = document.querySelector('.vf-transcript');
        this.transcriptInterim = document.querySelector('.vf-text--interim');
        this.transcriptFinal = document.querySelector('.vf-text--final');

        // Setup transcript controls
        this.setupTranscriptControls();

        // Add mic button click handler
        this.micButton.addEventListener('click', () => this.toggleRecording());
    }

    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    setupTranscriptControls() {
        // Close button
        document.querySelector('.vf-transcript-close').addEventListener('click', () => {
            this.transcript.hidden = true;
        });

        // Send button
        document.querySelector('.vf-button--send').addEventListener('click', () => {
            this.sendTranscript();
        });

        // Clear button
        document.querySelector('.vf-button--clear').addEventListener('click', () => {
            this.clearTranscript();
        });
    }
    simulateInterimResults() {
        const quality = document.querySelector('.vf-stt-provider-select').value;
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
                this.transcriptInterim.textContent = phrases[quality][index];
                index++;
            } else {
                clearInterval(this.transcriptInterval);
                // Move last interim result to final
                this.transcriptFinal.textContent = this.transcriptInterim.textContent;
                this.transcriptInterim.textContent = '';
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
        this.widget.dataset.state = 'recording';
        this.micButton.dataset.state = 'recording';  // Update mic button state

        this.humanAudio.currentTime = 0;
        await this.humanAudio.play();
        await this.buttonVisualizer.setMode('listening', this.humanAudio);
        await this.dragBarVisualizer.setMode('listening', this.humanAudio);

        this.transcriptIndex = 0;
        this.simulateTranscription();
    }

    simulateTranscription() {
        if (this.transcriptInterval) {
            clearInterval(this.transcriptInterval);
        }

        const words = this.transcriptText.split(' ');
        const CHUNK_SIZE = 3; // Number of words to finalize at once

        // Show transcript area immediately when starting
        this.transcript.hidden = false;

        // Clear any previous content
        this.transcriptInterim.textContent = '';
        this.transcriptFinal.textContent = '';

        this.transcriptInterval = setInterval(() => {
            if (this.transcriptIndex < words.length) {
                // Calculate the chunk boundary
                const chunkBoundary = Math.floor(this.transcriptIndex / CHUNK_SIZE) * CHUNK_SIZE;

                // Words that should be final (complete chunks)
                const finalWords = words.slice(0, chunkBoundary);
                // Words that should be interim (current incomplete chunk plus new word)
                const interimWords = words.slice(chunkBoundary, this.transcriptIndex + 1);

                // Update the display
                this.transcriptFinal.textContent = finalWords.join(' ');
                this.transcriptInterim.textContent = interimWords.join(' ');

                this.transcriptIndex++;
            } else {
                clearInterval(this.transcriptInterval);
                // Finalize all remaining text
                this.transcriptFinal.textContent = words.join(' ');
                this.transcriptInterim.textContent = '';
                // Show send/clear buttons
                document.querySelector('.vf-transcript-actions').classList.add('active');
            }
        }, 400);
    }



    clearTranscript() {
        this.transcriptInterim.textContent = '';
        this.transcriptFinal.textContent = '';
        this.transcriptIndex = 0;
    }

    sendTranscript() {
        // For mock, just clear after sending
        this.clearTranscript();
        this.transcript.hidden = true;
    }

    async stopRecording() {
        this.isRecording = false;
        this.widget.dataset.state = 'idle';
        this.micButton.dataset.state = 'idle';  // Update mic button state

        this.humanAudio.pause();
        this.humanAudio.currentTime = 0;
        if (this.transcriptInterval) {
            clearInterval(this.transcriptInterval);
        }

        await this.buttonVisualizer.setMode('idle');
        await this.dragBarVisualizer.setMode('idle');
        if (this.transcriptFinal) {
            document.querySelector('.vf-transcript-actions')?.classList.add('active');
        }
        // this.clearTranscript();
        // this.transcript.hidden = true;
    }
}




function addTestControls() {
    const panel = document.createElement('div');
    panel.className = 'vf-test-panel';
    panel.innerHTML = `
        <h3>Test Controls</h3>
        <div class="vf-test-section">
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

// Add to the script section or a separate JS file
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Initialize visualizers inside the buttons
        const micVisualizer = new MockVisualizer({
            className: 'human-speech',
            color: '--vf-human',
            barCount: iconsVizBarCount,
            fftSize: 128,
            xAxisPos: iconXAxisPos,
            yAxisPos: iconYAxisPos,
            xOffset: 0
        }).mount(document.querySelector('#vf-mic-button'));

        const ttsVisualizer = new MockVisualizer({
            className: 'agent-speech',
            color: '--vf-agent',
            barCount: iconsVizBarCount,
            fftSize: 2048,
            xAxisPos: iconXAxisPos,
            yAxisPos: iconYAxisPos,
            xOffset: (1/iconsVizBarCount)
        }).mount(document.querySelector('#vf-tts-button'));

        // Initialize drag bar visualizer
        const dragBarVisualizer = new MockVisualizer({
            className: 'dragbar-viz',
            color: '--vf-widget',
            barCount: handleBarVizBarCount,
            fftSize: 2048,
            xAxisPos: 0,
            yAxisPos: 1,
            xOffset: 0
        }).mount(document.querySelector('.vf-dragbar'));

        // Initialize mockSTT and mockTTS ONCE with correct parameters
        window.mockSTT = new MockSTT(micVisualizer, dragBarVisualizer);
        window.mockTTS = new MockTTS(ttsVisualizer);

        // Make widget draggable
        makeDraggable(document.querySelector('.vf-widget'), '.vf-dragbar');

        // Add settings toggle
        const settingsBtn = document.querySelector('.vf-settings-btn');
        const settingsPanel = document.querySelector('.vf-settings');
        settingsBtn.addEventListener('click', () => {
            settingsPanel.hidden = !settingsPanel.hidden;
        });

        addTestControls();
    } catch (err) {
        console.error('Error initializing VoiceFaster:', err);
    }
});

