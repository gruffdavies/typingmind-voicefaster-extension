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
            xOffset: config.xOffset || 0,
            ...config
        };

        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.mode = 'idle';
        this.styles = getComputedStyle(document.documentElement);
        this.analyser = null;
        this.dataArray = null;
        this.animationFrame = null;
        this.isInitialized = false;
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






    handleResize() {
        if (!this.isInitialized) return;
        this.initializeCanvas();
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



    // drawWaveform(heights) {
    //     if (!this.ctx) return;

    //     const centerX = this.canvasWidth / 2;
    //     const centerY = this.canvasHeight / 2;
    //     const minRadius = (Math.min(this.canvasWidth, this.canvasHeight) / 2) * 0.3; // Base circle
    //     const maxRadius = (Math.min(this.canvasWidth, this.canvasHeight) / 2) * 0.8; // Max extension

    //     this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    //     // Draw base circle
    //     this.ctx.beginPath();
    //     this.ctx.strokeStyle = this.getColor(this.config.color);
    //     this.ctx.lineWidth = 2;
    //     this.ctx.arc(centerX, centerY, minRadius, 0, Math.PI * 2);
    //     this.ctx.stroke();

    //     // Draw audio waves
    //     this.ctx.beginPath();
    //     heights.forEach((height, i) => {
    //         const angle = (i / heights.length) * Math.PI * 2;
    //         const radiusOffset = height * (maxRadius - minRadius);
    //         const r = minRadius + radiusOffset;

    //         const x = centerX + Math.cos(angle) * r;
    //         const y = centerY + Math.sin(angle) * r;

    //         if (i === 0) {
    //             this.ctx.moveTo(x, y);
    //         } else {
    //             // Use quadratic curves for smoother lines
    //             const prevAngle = ((i - 1) / heights.length) * Math.PI * 2;
    //             const prevHeight = heights[i - 1];
    //             const prevRadiusOffset = prevHeight * (maxRadius - minRadius);
    //             const prevRadius = minRadius + prevRadiusOffset;

    //             const cx = centerX + Math.cos((angle + prevAngle) / 2) *
    //                       ((r + prevRadius) / 2);
    //             const cy = centerY + Math.sin((angle + prevAngle) / 2) *
    //                       ((r + prevRadius) / 2);

    //             this.ctx.quadraticCurveTo(cx, cy, x, y);
    //         }
    //     });

    //     // Connect back to start for smooth circle
    //     const firstX = centerX + Math.cos(0) * (minRadius + heights[0] * (maxRadius - minRadius));
    //     const firstY = centerY + Math.sin(0) * (minRadius + heights[0] * (maxRadius - minRadius));
    //     this.ctx.quadraticCurveTo(
    //         centerX + Math.cos(Math.PI * 1.75) * maxRadius,
    //         centerY + Math.sin(Math.PI * 1.75) * maxRadius,
    //         firstX,
    //         firstY
    //     );

    //     this.ctx.stroke();
    // }


    initializeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.container.getBoundingClientRect();

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);

        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;
    }

    drawBars(heights) {
        if (!this.ctx) return;

        const barCount = heights.length;
        const barWidth = this.canvasWidth / barCount;
        const maxHeight = this.canvasHeight * 1.8; // 80% of height

        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.ctx.fillStyle = this.getColor(this.config.color);

        heights.forEach((height, i) => {
            const barHeight = height * maxHeight;
            const x = 1 + 2 * i * barWidth;
            const y = (this.canvasHeight - barHeight) / 2; // Center vertically

            // Draw with rounded corners for subtle effect
            this.ctx.beginPath();
            this.ctx.roundRect(x, y, barWidth * 0.8, barHeight, 2);
            this.ctx.fill();
        });
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

class MockSTT {
    constructor(buttonViz, dragBarViz) {
        this.buttonVisualizer = buttonViz;
        this.dragBarVisualizer = dragBarViz;
        this.isRecording = false;
        this.transcriptInterim = document.querySelector('.vf-text--interim');
        this.transcriptFinal = document.querySelector('.vf-text--final');
        this.micButton = document.getElementById('vf-mic-button');
        this.widget = document.querySelector('.vf-widget');

        this.humanAudio = new Audio('mockaudio/human1.mp3');
        this.transcriptText = '';
        this.transcriptIndex = 0;
        this.transcriptInterval = null;
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

        this.transcriptInterval = setInterval(() => {
            if (this.transcriptIndex < words.length) {
                const currentText = words.slice(0, this.transcriptIndex + 1).join(' ');
                this.transcriptInterim.textContent = currentText;
                this.transcriptIndex++;
            } else {
                clearInterval(this.transcriptInterval);
                // Move completed transcription to final
                this.transcriptFinal.textContent = this.transcriptInterim.textContent;
                this.transcriptInterim.textContent = '';
            }
        }, 400);
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

function addTestControls() {
    const panel = document.createElement('div');
    panel.className = 'vf-test-panel';
    panel.innerHTML = `
        <h3>Test Controls</h3>
        <div class="vf-test-section">
            <h4>Speech-to-Text Simulation</h4>
            <button onclick="mockSTT.startRecording()">Start Recording</button>
            <button onclick="mockSTT.stopRecording()">Stop Recording</button>
        </div>
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
    const micButton = document.getElementById('vf-mic-button');

    micButton.addEventListener('click', () => {
        const currentState = micButton.dataset.state;
        if (currentState === 'idle') {
            micButton.dataset.state = 'recording';
            // Start recording/visualization
            mockSTT.startRecording();
        } else {
            micButton.dataset.state = 'idle';
            // Stop recording/visualization
            mockSTT.stopRecording();
        }
    });
});
