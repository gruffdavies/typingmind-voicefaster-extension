// voicefaster-2.3.2.js
(() => {
    const VOICEFASTER_VERSION = '2.3.2';

    class EventEmitter {
        constructor() {
            this.events = new Map();
        }

        on(eventName, callback) {
            if (!this.events.has(eventName)) {
                this.events.set(eventName, []);
            }
            this.events.get(eventName).push(callback);
            return this; // For method chaining
        }

        off(eventName, callback) {
            if (!this.events.has(eventName)) return this;
            if (!callback) {
                this.events.delete(eventName);
                return this;
            }
            const callbacks = this.events.get(eventName);
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
                if (callbacks.length === 0) {
                    this.events.delete(eventName);
                }
            }
            return this;
        }

        emit(eventName, ...args) {
            if (!this.events.has(eventName)) return;
            for (const callback of this.events.get(eventName)) {
                callback(...args);
            }
            return this;
        }

        once(eventName, callback) {
            const onceWrapper = (...args) => {
                callback(...args);
                this.off(eventName, onceWrapper);
            };
            return this.on(eventName, onceWrapper);
        }
    }


    // VoiceFasterController.js
    class VoiceFasterController {
        constructor(config = {}) {
            this.config = {
                defaultSTTProvider: 'deepgram',
                defaultVoiceId: 'LKzEuRvwo37aJ6JFMnxk',
                maxQueueSize: 100,
                maxQueueAge: 3600000,
                targetElement: null,
                transcribeToStagingArea: true,
                ...config
            };

            this.ttsPlayer = null;
            this.sttProvider = null;
            this.visualizer = null;
            this.ui = null;
            this.state = {
                isListening: false,
                isSpeaking: false,
                hasError: false,
                errorMessage: ''
            };

            this.initialize();
        }

        async initialize() {
            try {
                console.debug("VoiceFasterController: Initializing...");
                await this.initializeUI();
                await this.initializeVisualizers();
                await this.initializeSTT();
                await this.initializeTTS();
                this.coordinateState();
                console.debug("VoiceFasterController: Initialization complete");
            } catch (error) {
                console.error("VoiceFasterController: Initialization failed:", error);
                this.handleError(error);
            }
        }
        async initializeUI() {
            this.ui = new UIManager(this);
            await this.ui.initialize();
        }

        // In VoiceFasterController.js
        async initializeVisualizers() {
            const iconXAxisPos = 0;
            const iconYAxisPos = 0.5;
            const iconsVizBarCount = 16;

            // Create STT (mic) visualizer
            this.micVisualizer = new AudioVisualizer({
                className: "human-speech",
                color: "--vf-human",
                barCount: iconsVizBarCount,
                fftSize: 128,
                xAxisPos: iconXAxisPos,
                yAxisPos: iconYAxisPos,
                xOffset: 0
            });

            // Create TTS visualizer
            this.ttsVisualizer = new AudioVisualizer({
                className: "agent-speech",
                color: "--vf-agent",
                barCount: iconsVizBarCount,
                fftSize: 2048,
                xAxisPos: iconXAxisPos,
                yAxisPos: iconYAxisPos,
                xOffset: 1 / iconsVizBarCount
            });

            // Mount visualizers after UI is initialized
            this.micVisualizer.mount(this.ui.container.querySelector('#vf-mic-button'));
            this.ttsVisualizer.mount(this.ui.container.querySelector('#vf-tts-button'));
        }

        // Update the provider initializations to use the correct visualizers
        async initializeSTT() {
            try {
                this.sttProvider = await STTProviderManager.createProvider(
                    this.config.defaultSTTProvider
                );
                this.setupSTTHandlers();
                // Pass the mic visualizer to the STT provider
                if (this.sttProvider.setVisualizer) {
                    this.sttProvider.setVisualizer(this.micVisualizer);
                }
            } catch (error) {
                console.error("Failed to initialize STT provider:", error);
                throw error;
            }
        }

        async initializeTTS() {
            // Pass the TTS visualizer to the TTS player
            this.ttsPlayer = new TTSPlayer(this.ttsVisualizer);
            this.setupTTSHandlers();
        }

        // Update the state coordination to handle both visualizers
        coordinateState() {
            if (this.state.isListening) {
                this.micVisualizer?.setMode('listening');
            } else {
                this.micVisualizer?.setMode('idle');
            }

            if (this.state.isSpeaking) {
                this.ttsVisualizer?.setMode('playing');
            } else {
                this.ttsVisualizer?.setMode('idle');
            }

            this.ui?.updateState(this.state);
        }


        async switchSTTProvider() {
            const wasRecording = this.sttProvider.isListening;
            if (wasRecording) {
                await this.sttProvider.stop();
            }

            try {
                const newProvider = await STTProviderManager.switchProvider(this.sttProvider);
                this.sttProvider = newProvider;
                this.setupSTTHandlers();

                if (wasRecording) {
                    await this.sttProvider.start();
                }
            } catch (error) {
                console.error("Failed to switch STT provider:", error);
                throw error;
            }
        }

        setupSTTHandlers() {
            this.sttProvider.setHandlers({
                onTranscript: (text, isFinal) => this.handleTranscript(text, isFinal),
                onStateChange: (state) => this.handleSTTStateChange(state),
                onError: (error) => this.handleError(error)
            });
        }

        setupTTSHandlers() {
            this.ttsPlayer.on('stateChange', state => this.handleTTSStateChange(state));
            this.ttsPlayer.on('error', error => this.handleError(error));
        }

        handleTranscript(text, isFinal) {
            if (this.config.targetElement && isFinal) {
                const currentText = this.config.targetElement.value;
                const spacer = currentText && !currentText.endsWith(' ') ? ' ' : '';
                this.config.targetElement.value = currentText + spacer + text;
                this.config.targetElement.dispatchEvent(new Event('change'));
            }

            this.ui.updateTranscript(text, isFinal);
        }

        handleSTTStateChange(state) {
            this.state.isListening = state === 'listening';
            this.coordinateState();
        }

        handleTTSStateChange(state) {
            this.state.isSpeaking = state === 'speaking';
            this.coordinateState();
        }

        handleError(error) {
            this.state.hasError = true;
            this.state.errorMessage = error.message || 'Unknown error occurred';
            this.coordinateState();

            // Auto-clear error after 5 seconds
            setTimeout(() => {
                this.state.hasError = false;
                this.state.errorMessage = '';
                this.coordinateState();
            }, 5000);
        }

        coordinateState() {
            if (this.state.isListening) {
                this.micVisualizer?.setMode('listening');
            } else {
                this.micVisualizer?.setMode('idle');
            }

            if (this.state.isSpeaking) {
                this.ttsVisualizer?.setMode('playing');
            } else {
                this.ttsVisualizer?.setMode('idle');
            }

            this.ui?.updateState(this.state);
        }


        // Public API methods
        async toggleRecording() {
            try {
                if (this.state.isListening) {
                    await this.sttProvider.stop();
                } else {
                    await this.sttProvider.start();
                }
            } catch (error) {
                this.handleError(error);
            }
        }

        async queueText(text) {
            try {
                await this.ttsPlayer.queueText(text);
            } catch (error) {
                this.handleError(error);
            }
        }

        cleanup() {
            this.sttProvider?.stop();
            this.ttsPlayer?.cleanup();
            this.micVisualizer?.cleanup();
            this.ttsVisualizer?.cleanup();
            this.ui?.cleanup();
        }

    }

    // AudioVisualizer.js
    class AudioVisualizer {
        constructor(config = {}) {
            this.config = {
                fftSize: config.fftSize || 256,
                barCount: config.barCount || 64,
                className: config.className || '',
                color: config.color || '--vf-accent',
                xAxisPos: config.xAxisPos || 0,
                xOffset: config.xOffset || 0,
                yAxisPos: config.yAxisPos || 0.5,
                heightScale: config.heightScale || 1,
                ...config
            };

            if (this.config.xAxisPos == null || this.config.yAxisPos == null || this.config.xOffset === null) {
                throw new Error('xAxisPos, yAxisPos, and xOffset are mandatory');
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

        mount(container) {
            if (!container) {
                throw new Error('Container element must be provided to mount visualizer');
            }

            if (this.isInitialized) {
                this.unmount();
            }

            this.container = container;
            this.container.style.position = 'relative';

            this.canvas = this.createCanvas();
            this.ctx = this.canvas.getContext('2d', { alpha: true });
            this.container.appendChild(this.canvas);

            this.initializeCanvas();
            this.startAnimation();
            this.isInitialized = true;

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
                    const context = new (window.AudioContext || window.webkitAudioContext)();

                    if (context.state === "suspended") {
                        await context.resume();
                    }

                    this.analyser = context.createAnalyser();
                    this.analyser.fftSize = this.config.fftSize || 2048;
                    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

                    const source = stream instanceof HTMLMediaElement ?
                        context.createMediaElementSource(stream) :
                        context.createMediaStreamSource(stream);

                    source.connect(this.analyser);

                    if (stream instanceof HTMLMediaElement) {
                        source.connect(context.destination);
                    }

                    return true;
                } catch (err) {
                    console.error('Error in setMode:', err);
                    return false;
                }
            } else {
                if (this.analyser) {
                    this.analyser.disconnect();
                    this.analyser = null;
                }
                this.dataArray = null;
            }
        }

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
                yAxisPos: this.config.yAxisPos,
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

            this.vizParams = this.#computeVizParams();
        }

        drawBars(heights) {
            if (!this.ctx) return;

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

                let y;
                if (yAxisPos === 1.0) {
                    y = this.canvasHeight - barHeight;
                } else if (yAxisPos === 0.0) {
                    y = 0;
                } else {
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
            this.vizParams = null;
        }

        updateVisualization() {
            if (!this.analyser || !this.dataArray) return;

            const frequencyBins = 32;
            const binSize = Math.floor(this.analyser.frequencyBinCount / frequencyBins);
            const heights = new Array(frequencyBins).fill(0);

            this.analyser.getByteFrequencyData(this.dataArray);

            for (let i = 0; i < frequencyBins; i++) {
                let sum = 0;
                for (let j = 0; j < binSize; j++) {
                    sum += this.dataArray[i * binSize + j];
                }
                heights[i] = (sum / binSize / 255) * 0.5;
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

        getColor(varName) {
            return this.styles.getPropertyValue(varName).trim();
        }

        drawIdle() {
            const heights = new Array(this.config.barCount).fill(0.1);
            this.drawBars(heights);
        }

        cleanup() {
            this.sttProvider?.stop();
            this.ttsPlayer?.cleanup();
            this.micVisualizer?.cleanup();
            this.ttsVisualizer?.cleanup();
            this.ui?.cleanup();
        }

    }

    // UIManager.js
    class UIManager {
        constructor(controller) {
            this.controller = controller;
            this.container = null;
            this.visualizerContainer = null;
            this.queueVisualizerContainer = null;
        }

        async initialize() {
            this.createMainContainer();
            this.createHeader();
            this.createControls();
            this.createVisualizerContainer();
            this.createQueueVisualizer();
            this.createTranscriptArea();
            this.makeDraggable();

            document.body.appendChild(this.container);
        }

        createMainContainer() {
            this.container = document.createElement('div');
            this.container.className = 'vf-widget';
            this.container.dataset.state = 'idle';
        }

        createHeader() {
            const header = document.createElement('div');
            header.className = 'vf-dragbar';

            const handle = document.createElement('div');
            handle.className = 'vf-dragbar-handle';

            header.appendChild(handle);
            this.container.appendChild(header);
        }

        createControls() {
            const controls = document.createElement('div');
            controls.className = 'vf-controls';

            // Mic control
            const micControl = document.createElement('div');
            micControl.className = 'vf-mic';
            const micButton = document.createElement('button');
            micButton.className = 'vf-button';
            micButton.id = 'vf-mic-button';
            micButton.dataset.state = 'idle';
            micButton.innerHTML = '<i class="bi bi-mic-fill"></i>';
            micButton.addEventListener('click', () => this.controller.toggleRecording());
            micControl.appendChild(micButton);

            // Settings button
            const settingsBtn = document.createElement('button');
            settingsBtn.className = 'vf-settings-btn';
            settingsBtn.innerHTML = '<i class="bi bi-gear"></i>';
            settingsBtn.addEventListener('click', () => this.toggleSettings());

            // TTS control
            const ttsControl = document.createElement('div');
            ttsControl.className = 'vf-tts';
            const ttsButton = document.createElement('button');
            ttsButton.className = 'vf-button';
            ttsButton.id = 'vf-tts-button';
            ttsButton.dataset.state = 'idle';
            ttsButton.innerHTML = '<i class="bi bi-volume-up-fill"></i>';
            ttsControl.appendChild(ttsButton);

            controls.appendChild(micControl);
            controls.appendChild(settingsBtn);
            controls.appendChild(ttsControl);

            this.container.appendChild(controls);
        }

        createVisualizerContainer() {
            this.visualizerContainer = document.createElement('div');
            this.visualizerContainer.className = 'vf-visualizer-container';
            this.container.appendChild(this.visualizerContainer);
        }

        createQueueVisualizer() {
            this.queueVisualizerContainer = document.createElement('div');
            this.queueVisualizerContainer.className = 'vf-bubble-tray';
            this.container.appendChild(this.queueVisualizerContainer);
        }

        // In UIManager.js, modify the createSettings method:
        async createSettings() {
            const settings = document.createElement('div');
            settings.className = 'vf-settings';
            settings.hidden = true;

            const header = document.createElement('div');
            header.className = 'vf-settings-header';
            header.innerHTML = `
        <span>SETTINGS</span>
        <button class="vf-settings-close"><i class="bi bi-x"></i></button>
    `;

            const sttSection = document.createElement('div');
            sttSection.className = 'vf-settings-section';
            sttSection.innerHTML = `
        <h3 class="vf-settings-title">Speech Recognition</h3>
        <div class="vf-settings-controls">
            <select class="vf-stt-provider-select">
                <option value="deepgram">DeepGram</option>
                <option value="webspeech">Web Speech</option>
            </select>
        </div>
    `;

            // Add provider switching logic
            const providerSelect = sttSection.querySelector('.vf-stt-provider-select');
            providerSelect.value = this.controller.sttProvider instanceof DeepGramSTT ? 'deepgram' : 'webspeech';

            providerSelect.addEventListener('change', async (e) => {
                try {
                    await this.controller.switchSTTProvider();
                    this.showNotification('Speech recognition provider switched successfully');
                } catch (error) {
                    console.error('Failed to switch provider:', error);
                    // Revert select value
                    providerSelect.value = this.controller.sttProvider instanceof DeepGramSTT ? 'deepgram' : 'webspeech';
                    this.showError('Failed to switch provider: ' + error.message);
                }
            });

            settings.append(header, sttSection);
            this.container.appendChild(settings);
        }

        // Add notification method
        showNotification(message) {
            const notification = document.createElement('div');
            notification.className = 'vf-notification';
            notification.textContent = message;
            this.container.appendChild(notification);
            setTimeout(() => notification.remove(), 3000);
        }


        createTranscriptArea() {
            const transcript = document.createElement('div');
            transcript.className = 'vf-transcript';
            transcript.hidden = true;

            const header = document.createElement('div');
            header.className = 'vf-transcript-header';
            header.innerHTML = `
            <span>Transcript</span>
            <button class="vf-transcript-close"><i class="bi bi-x"></i></button>
        `;

            const content = document.createElement('div');
            content.className = 'vf-transcript-content';
            content.innerHTML = `
            <span class="vf-text--interim"></span>
            <span class="vf-text--final"></span>
        `;

            const actions = document.createElement('div');
            actions.className = 'vf-transcript-actions';
            actions.innerHTML = `
            <button class="vf-button--send">Send</button>
            <button class="vf-button--clear">Clear</button>
        `;

            transcript.appendChild(header);
            transcript.appendChild(content);
            transcript.appendChild(actions);

            this.container.appendChild(transcript);
            this.setupTranscriptHandlers(transcript);
        }

        setupTranscriptHandlers(transcript) {
            const closeBtn = transcript.querySelector('.vf-transcript-close');
            const sendBtn = transcript.querySelector('.vf-button--send');
            const clearBtn = transcript.querySelector('.vf-button--clear');

            closeBtn.addEventListener('click', () => {
                transcript.hidden = true;
            });

            sendBtn.addEventListener('click', () => {
                // Handle send action
                const finalText = transcript.querySelector('.vf-text--final').textContent;
                if (finalText && this.controller.config.targetElement) {
                    this.controller.config.targetElement.value += ' ' + finalText;
                    transcript.hidden = true;
                }
            });

            clearBtn.addEventListener('click', () => {
                transcript.querySelector('.vf-text--interim').textContent = '';
                transcript.querySelector('.vf-text--final').textContent = '';
            });
        }

        updateTranscript(text, isFinal) {
            const transcript = this.container.querySelector('.vf-transcript');
            if (!transcript) return;

            transcript.hidden = false;

            if (isFinal) {
                const finalSpan = transcript.querySelector('.vf-text--final');
                finalSpan.textContent = text;
                transcript.querySelector('.vf-text--interim').textContent = '';
            } else {
                transcript.querySelector('.vf-text--interim').textContent = text;
            }
        }

        updateState(state) {
            this.container.dataset.state = state.isListening ? 'listening' : 'idle';

            const micButton = this.container.querySelector('#vf-mic-button');
            if (micButton) {
                micButton.dataset.state = state.isListening ? 'recording' : 'idle';
            }

            const ttsButton = this.container.querySelector('#vf-tts-button');
            if (ttsButton) {
                ttsButton.dataset.state = state.isSpeaking ? 'speaking' : 'idle';
            }

            if (state.hasError) {
                this.showError(state.errorMessage);
            }
        }

        showError(message) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'vf-error';
            errorDiv.textContent = message;

            const existingError = this.container.querySelector('.vf-error');
            if (existingError) {
                existingError.remove();
            }

            this.container.appendChild(errorDiv);
            setTimeout(() => errorDiv.remove(), 5000);
        }

        makeDraggable() {
            const dragHandle = this.container.querySelector('.vf-dragbar');
            let isDragging = false;
            let startX, startY;
            let startRight; // Track distance from right edge

            const dragStart = (e) => {
                if (e.target === dragHandle || dragHandle.contains(e.target)) {
                    isDragging = true;
                    e.preventDefault();

                    const rect = this.container.getBoundingClientRect();
                    // Calculate distance from right edge of viewport
                    startRight = window.innerWidth - (rect.right);
                    startX = (e.type === "mousedown" ? e.clientX : e.touches[0].clientX);
                    startY = (e.type === "mousedown" ? e.clientY : e.touches[0].clientY) - rect.top;
                }
            };

            const drag = (e) => {
                if (!isDragging) return;
                e.preventDefault();

                const clientX = e.type === "mousemove" ? e.clientX : e.touches[0].clientX;
                const clientY = e.type === "mousemove" ? e.clientY : e.touches[0].clientY;

                // Calculate new position from right edge
                const deltaX = startX - clientX;
                const newRight = startRight + deltaX;
                const newY = clientY - startY;

                // Constrain to viewport
                const maxRight = window.innerWidth - this.container.offsetWidth;
                const maxY = window.innerHeight - this.container.offsetHeight;

                // Apply new position
                this.container.style.right = `${Math.max(0, Math.min(maxRight, newRight))}px`;
                this.container.style.top = `${Math.max(0, Math.min(maxY, newY))}px`;
            };

            const keepInView = () => {
                const rect = this.container.getBoundingClientRect();
                const rightDistance = window.innerWidth - rect.right;
                const maxRight = window.innerWidth - rect.width;

                if (rightDistance < 0) {
                    this.container.style.right = '0px';
                } else if (rightDistance > maxRight) {
                    this.container.style.right = `${maxRight}px`;
                }

                if (rect.top < 0) {
                    this.container.style.top = '0px';
                } else if (rect.bottom > window.innerHeight) {
                    this.container.style.top = `${window.innerHeight - rect.height}px`;
                }
            };

            const dragEnd = () => {
                isDragging = false;
            };

            // Add resize observer for continuous size monitoring
            const resizeObserver = new ResizeObserver(() => {
                if (!isDragging) keepInView();
            });
            resizeObserver.observe(document.body);

            // Add window resize listener with debounce
            let resizeTimeout;
            window.addEventListener('resize', () => {
                if (resizeTimeout) clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    if (!isDragging) keepInView();
                }, 100);
            });

            // Add event listeners
            dragHandle.addEventListener("mousedown", dragStart, { passive: false });
            dragHandle.addEventListener("touchstart", dragStart, { passive: false });
            document.addEventListener("mousemove", drag);
            document.addEventListener("touchmove", drag, { passive: false });
            document.addEventListener("mouseup", dragEnd);
            document.addEventListener("touchend", dragEnd);
        }




        toggleSettings() {
            const settings = this.container.querySelector('.vf-settings');
            if (settings) {
                settings.hidden = !settings.hidden;
            }
        }

        getVisualizerContainer() {
            return this.visualizerContainer;
        }

        getQueueVisualizerContainer() {
            return this.queueVisualizerContainer;
        }

        cleanup() {
            // Remove all event listeners
            const clone = this.container.cloneNode(true);
            this.container.parentNode.replaceChild(clone, this.container);
            this.container = null;
        }
    }


    /* Speech Recognition and Transcription Classes */

    // STTProviderManager.js
    class STTProviderManager {
        static async createProvider(preferredType = "deepgram") {
            try {
                // Try preferred provider first
                if (preferredType === "deepgram") {
                    const provider = new DeepGramSTT();
                    if (await provider.isAvailable()) {
                        return provider;
                    }
                }

                // Fallback to WebSpeech
                const webSpeech = new WebSpeechSTT();
                if (await webSpeech.isAvailable()) {
                    return webSpeech;
                }

                throw new Error("No speech recognition service available");
            } catch (error) {
                console.error("Failed to create STT provider:", error);
                throw error;
            }
        }

        static async switchProvider(currentProvider) {
            const newType = currentProvider instanceof DeepGramSTT ? "webspeech" : "deepgram";
            return this.createProvider(newType);
        }
    }


    class STTProvider {
        async start() {
            throw new Error("Method 'start' must be implemented");
        }

        async stop() {
            throw new Error("Method 'stop' must be implemented");
        }

        async isAvailable() {
            throw new Error("Method 'isAvailable' must be implemented");
        }

        setHandlers(handlers) {
            throw new Error("Method 'setHandlers' must be implemented");
        }
    }

    // BaseSTTProvider.js
    class BaseSTTProvider extends STTProvider {
        constructor() {
            super();
            this.visualizer = null;
            this.isListening = false;
            this.audioStream = null;
        }

        setVisualizer(visualizer) {
            this.visualizer = visualizer;
        }

        async getAudioStream() {
            if (!this.audioStream) {
                this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            return this.audioStream;
        }

        async startVisualization() {
            if (this.visualizer) {
                const stream = await this.getAudioStream();
                await this.visualizer.setMode('listening', stream);
            }
        }

        async stopVisualization() {
            if (this.visualizer) {
                await this.visualizer.setMode('idle');
            }
            if (this.audioStream) {
                this.audioStream.getTracks().forEach(track => track.stop());
                this.audioStream = null;
            }
        }

        // Template method pattern for start/stop
        async start() {
            if (this.isListening) {
                await this.stop();
            }

            try {
                await this.startVisualization();
                await this.startRecognition();
                this.isListening = true;
            } catch (error) {
                await this.stopVisualization();
                throw error;
            }
        }

        async stop() {
            if (this.isListening) {
                await this.stopRecognition();
                await this.stopVisualization();
                this.isListening = false;
            }
        }

        // Abstract methods to be implemented by subclasses
        async startRecognition() {
            throw new Error("startRecognition must be implemented");
        }

        async stopRecognition() {
            throw new Error("stopRecognition must be implemented");
        }
    }

    // WebSpeechSTT.js
    class WebSpeechSTT extends BaseSTTProvider {
        constructor() {
            super();
            if (!('webkitSpeechRecognition' in window)) {
                throw new Error('Web Speech API not supported');
            }

            this.recognition = new webkitSpeechRecognition();
            this.handlers = null;
            this.finalTranscript = '';

            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-GB';

            this.setupRecognitionHandlers();
        }

        setupRecognitionHandlers() {
            this.recognition.onstart = () => {
                this.handlers?.onStateChange?.('listening');
            };

            this.recognition.onend = () => {
                this.handlers?.onStateChange?.('idle');
            };

            this.recognition.onresult = (event) => {
                let interimTranscript = '';

                if (typeof event.results === 'undefined') {
                    this.recognition.onend = null;
                    this.recognition.stop();
                    return;
                }

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        this.finalTranscript += transcript;
                        this.handlers?.onTranscript?.(transcript, true);
                    } else {
                        interimTranscript += transcript;
                        this.handlers?.onTranscript?.(transcript, false);
                    }
                }
            };

            this.recognition.onerror = (event) => {
                let errorMessage = '';
                switch (event.error) {
                    case 'no-speech':
                        errorMessage = 'No speech detected';
                        break;
                    case 'audio-capture':
                        errorMessage = 'No microphone detected';
                        break;
                    case 'not-allowed':
                        errorMessage = event.timeStamp < 100 ?
                            'Microphone blocked' :
                            'Microphone permission denied';
                        break;
                    default:
                        errorMessage = `Speech recognition error: ${event.error}`;
                }
                this.handlers?.onError?.(new Error(errorMessage));
            };
        }

        async startRecognition() {
            this.finalTranscript = '';
            this.recognition.start();
        }

        async stopRecognition() {
            this.recognition.stop();
        }

        async isAvailable() {
            return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
        }

        setHandlers(handlers) {
            this.handlers = handlers;
        }
    }


    // DeepGramSTT.js



    class DeepGramSTT extends BaseSTTProvider {
        constructor(config = {}) {
            super();
            this.config = {
                model: 'nova-2',
                language: 'en-GB',
                smart_format: true,
                interim_results: true,
                vad_events: true,
                endpointing: 300,
                maxRetries: 3,
                connectionTimeout: 5000,
                maxBufferSize: 50,
                ...config
            };

            this.handlers = null;
            this.ws = null;
            this.audioBuffer = [];
            this.connectionAttempt = 0;
            this.connectionTimeout = null;
            this.reconnectTimeout = null;
            this.mediaRecorder = null;
        }

        async startRecognition() {
            try {
                this.setupWebSocket();
                const stream = await this.getAudioStream();
                this.setupMediaRecorder(stream);
            } catch (error) {
                this.handlers?.onError?.(error);
                throw error;
            }
        }

        async stopRecognition() {
            this.clearTimeouts();

            if (this.mediaRecorder) {
                this.mediaRecorder.stop();
                this.mediaRecorder = null;
            }

            if (this.ws) {
                try {
                    this.ws.close();
                } catch (error) {
                    console.warn('Error closing WebSocket:', error);
                }
                this.ws = null;
            }

            this.audioBuffer = [];
        }

        async isAvailable() {
            try {
                return Boolean(window.secrets?.deepgramApiKey);
            } catch (e) {
                console.warn('DeepGram availability check failed:', e);
                return false;
            }
        }

        setHandlers(handlers) {
            this.handlers = handlers;
        }

        setupWebSocket() {
            this.clearTimeouts();
            this.connectionAttempt++;

            const deepgramBaseURL = 'wss://api.deepgram.com/v1/listen';
            const deepgramOptions = {
                model: this.config.model,
                language: this.config.language,
                smart_format: this.config.smart_format,
                interim_results: this.config.interim_results,
                vad_events: this.config.vad_events,
                endpointing: this.config.endpointing
            };

            const keywords = ['keywords=KwizIQ:2'].join('&');
            const deepgramUrl = `${deepgramBaseURL}?${new URLSearchParams(deepgramOptions)}&${keywords}`;

            try {
                this.ws = new WebSocket(deepgramUrl, ['token', window.secrets.deepgramApiKey]);

                this.connectionTimeout = setTimeout(() => {
                    if (this.ws?.readyState !== WebSocket.OPEN) {
                        this.handleConnectionFailure();
                    }
                }, this.config.connectionTimeout);

                this.ws.onopen = () => {
                    this.clearTimeouts();
                    this.connectionAttempt = 0;
                    this.handlers?.onStateChange?.('listening');
                    this.processBufferedAudio();
                };

                this.ws.onclose = () => {
                    this.handleConnectionFailure();
                };

                this.ws.onerror = (error) => {
                    this.handlers?.onError?.(error);
                    this.handleConnectionFailure();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const response = JSON.parse(event.data);
                        if (response.type === 'Results') {
                            const transcript = response.channel.alternatives[0].transcript;
                            this.handlers?.onTranscript?.(
                                transcript,
                                response.is_final
                            );
                        }
                    } catch (error) {
                        console.error('Error processing DeepGram message:', error);
                    }
                };
            } catch (error) {
                this.handlers?.onError?.(error);
                this.handleConnectionFailure();
            }
        }

        setupMediaRecorder(stream) {
            this.mediaRecorder = new MediaRecorder(stream);

            this.mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0) {
                    const buffer = await event.data.arrayBuffer();
                    this.processAudioData(buffer);
                }
            };

            this.mediaRecorder.start(250);
        }

        processAudioData(audioData) {
            if (this.ws?.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(audioData);
                } catch (error) {
                    this.bufferAudioData(audioData);
                }
            } else {
                this.bufferAudioData(audioData);
            }
        }

        bufferAudioData(audioData) {
            if (this.audioBuffer.length < this.config.maxBufferSize) {
                this.audioBuffer.push(audioData);
            } else {
                this.audioBuffer.shift();
                this.audioBuffer.push(audioData);
            }
        }

        processBufferedAudio() {
            while (this.audioBuffer.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
                const audioData = this.audioBuffer.shift();
                try {
                    this.ws.send(audioData);
                } catch (error) {
                    this.audioBuffer.unshift(audioData);
                    break;
                }
            }
        }

        handleConnectionFailure() {
            if (!this.isListening) return;

            if (this.connectionAttempt < this.config.maxRetries) {
                const backoffTime = Math.min(1000 * Math.pow(2, this.connectionAttempt - 1), 5000);
                this.reconnectTimeout = setTimeout(() => {
                    if (this.isListening) {
                        this.setupWebSocket();
                    }
                }, backoffTime);

                this.handlers?.onError?.(new Error(
                    `Connection attempt ${this.connectionAttempt} failed, retrying in ${backoffTime / 1000} seconds...`
                ));
            } else {
                this.isListening = false;
                this.handlers?.onError?.(new Error(
                    'Failed to establish connection after maximum attempts'
                ));
                this.handlers?.onStateChange?.('idle');
            }
        }

        clearTimeouts() {
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }
        }
    }


    /* Text to Speech Classes */


    // StreamRequestResponse.js
    class StreamRequestResponse {
        #initializeMembers({ url, method, headers, body }) {
            this.url = url;
            this.method = method || "GET";
            this.headers = headers || {};
            this.body = body || null;
        }

        constructor(obj_or_url, method, headers, body) {
            if (typeof obj_or_url === "object") {
                this.#initializeMembers(obj_or_url);
            } else {
                this.#initializeMembers({ url: obj_or_url, method, headers, body });
            }
        }
    }

    // TTSQueueItem.js
    class TTSQueueItem {
        constructor(streamRequestResponse) {
            this.id = new Date().getTime().toString();
            this.url = streamRequestResponse.url;
            this.headers = streamRequestResponse.headers;
            this.method = streamRequestResponse.method;
            this.body = streamRequestResponse.body;

            try {
                this.text = JSON.parse(this.body).text || "No text available";
            } catch (e) {
                this.text = "Text parsing error";
                console.error("Error parsing body for text:", e);
            }

            this.state = "queued";
            this.startTime = new Date();
            this.endTime = null;
            this.duration = null;
            this.stateHistory = [{
                state: "queued",
                timestamp: this.startTime
            }];
            this.errors = [];
        }

        isStale(maxAge) {
            if (!this.startTime) return false;
            const timeSinceStart = new Date() - this.startTime;
            return timeSinceStart > maxAge;
        }

        refreshState(maxAge) {
            if (this.isStale(maxAge)) {
                this.updateState("stale");
            }
        }

        updateState(newState, errorMessage = null) {
            const now = new Date();
            const oldState = this.state;
            this.state = newState;

            this.stateHistory.push({
                state: newState,
                timestamp: now,
                previousState: oldState
            });

            switch (newState) {
                case "playing":
                    this.startTime = this.startTime || now;
                    break;
                case "completed":
                case "error":
                case "stale":
                    this.endTime = now;
                    if (this.startTime) {
                        this.duration = this.endTime - this.startTime;
                    }
                    break;
            }

            if (newState === "error" && errorMessage) {
                this.errors.push({
                    timestamp: now,
                    message: errorMessage
                });
            }
        }

        getDurationString() {
            if (!this.duration) return 'N/A';
            const seconds = Math.floor(this.duration / 1000);
            return `${seconds}s`;
        }

        getStateHistoryString() {
            return this.stateHistory
                .map(({ state, timestamp }) =>
                    `${state} at ${timestamp.toLocaleTimeString()}`
                )
                .join('\n');
        }

        getDetailsString() {
            const details = [
                `ID: ${this.id}`,
                `State: ${this.state}`,
                `Created: ${this.startTime.toLocaleTimeString()}`,
                `Duration: ${this.getDurationString()}`,
                `Text: "${this.text}"`,
                '\nState History:',
                this.getStateHistoryString()
            ];

            if (this.errors.length > 0) {
                details.push('\nErrors:');
                details.push(...this.errors.map(err =>
                    `${err.timestamp.toLocaleTimeString()}: ${err.message}`
                ));
            }

            return details.join('\n');
        }
    }

    // TTSAudioQueue.js
    class TTSAudioQueue {
        #streams;
        #maxSize;
        #maxAge;
        #observers;

        constructor(maxSize = 100, maxAge = 3600000) {
            this.#streams = [];
            this.#maxSize = maxSize;
            this.#maxAge = maxAge;
            this.#observers = [];
        }

        addStream(stream) {
            this.#streams.push(stream);
            this.notifyObservers();
        }

        removeStream(id) {
            const index = this.#streams.findIndex((stream) => stream.id === id);
            if (index !== -1) {
                this.#streams.splice(index, 1);
                this.notifyObservers();
                return true;
            }
            return false;
        }

        getNextQueuedStream() {
            return this.#streams.find((stream) => stream.state === "queued") || null;
        }

        updateStreamState(id, newState) {
            const stream = this.#streams.find((stream) => stream.id === id);
            if (stream) {
                stream.updateState(newState);
                this.notifyObservers();
            }
        }

        cleanup() {
            for (const stream of this.#streams) {
                stream.refreshState(this.#maxAge);
                if (stream.isStale(this.#maxAge)) {
                    this.removeStream(stream.id);
                }
            }
            this.notifyObservers();
        }

        removeOldest() {
            if (this.#streams.length > 0) {
                this.#streams.shift();
                this.notifyObservers();
            }
        }

        addObserver(observer) {
            this.#observers.push(observer);
        }

        notifyObservers() {
            for (const observer of this.#observers) {
                observer.update(this);
            }
        }

        getCurrentPlayingStream() {
            return this.#streams.find((stream) => stream.state === "playing") || null;
        }

        [Symbol.iterator]() {
            return this.#streams[Symbol.iterator]();
        }

        get size() {
            return this.#streams.length;
        }
    }

    // TTSPlayer.js
    class TTSPlayer extends EventEmitter {
        constructor(visualizer) {
            super();
            this.audio = new Audio();
            this.queue = new TTSAudioQueue();
            this.visualizer = visualizer;
            this.isPlaying = false;

            this.setupAudioHandlers();
        }

        setupAudioHandlers() {
            this.audio.onended = async () => {
                this.isPlaying = false;
                const currentStream = this.queue.getCurrentPlayingStream();

                if (currentStream) {
                    this.queue.updateStreamState(currentStream.id, "completed");

                    const streams = Array.from(this.queue);
                    const currentIndex = streams.indexOf(currentStream);
                    const nextStream = streams[currentIndex + 1];

                    if (nextStream) {
                        this.queue.updateStreamState(nextStream.id, "queued");
                        await this.processNextInQueue();
                    } else {
                        this.stop();
                    }
                }
            };
        }

        async processNextInQueue() {
            const nextStream = this.queue.getNextQueuedStream();
            if (!nextStream) {
                this.isPlaying = false;
                return;
            }

            const currentPlaying = this.queue.getCurrentPlayingStream();
            if (currentPlaying && currentPlaying.id !== nextStream.id) {
                this.queue.updateStreamState(currentPlaying.id, "completed");
            }

            this.isPlaying = true;
            nextStream.state = "requesting";

            try {
                const response = await fetch(nextStream.url, {
                    method: nextStream.method,
                    headers: nextStream.headers,
                    body: nextStream.body,
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const blob = await response.blob();
                const audioUrl = URL.createObjectURL(blob);

                nextStream.state = "playing";
                this.audio.src = audioUrl;
                await this.audio.play();

                this.emit('stateChange', 'playing');
            } catch (error) {
                console.error("Error in processNextInQueue:", error);
                nextStream.state = "error";
                this.isPlaying = false;
                this.emit('error', error);
                await this.processNextInQueue();
            }
        }

        async queueText(text) {
            const streamInfo = new StreamRequestResponse({
                url: `https://api.elevenlabs.io/v1/text-to-speech/${this.config.defaultVoiceId}/stream`,
                method: "POST",
                headers: {
                    "Accept": "audio/mpeg",
                    "xi-api-key": window.secrets.elevenLabsApiKey,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    text: text,
                    model_id: "eleven_monolingual_v1",
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.5
                    }
                })
            });

            const queueItem = new TTSQueueItem(streamInfo);
            this.queue.addStream(queueItem);

            if (!this.isPlaying) {
                await this.processNextInQueue();
            }

            return {
                message: "Audio stream request queued",
                text: text,
                id: queueItem.id
            };
        }

        async play() {
            if (!this.isPlaying) {
                if (this.audio.src) {
                    await this.audio.play();
                    this.isPlaying = true;
                    const currentStream = this.queue.getCurrentPlayingStream();
                    if (currentStream) {
                        this.queue.updateStreamState(currentStream.id, "playing");
                    }
                } else {
                    await this.processNextInQueue();
                }
            }
        }

        pause() {
            this.audio.pause();
            this.isPlaying = false;
            this.emit('stateChange', 'paused');
        }

        stop() {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.isPlaying = false;
            this.emit('stateChange', 'stopped');
        }

        cleanup() {
            this.stop();
            this.queue = new TTSAudioQueue();
        }
    }

    /* Bootstrapping Code */

    // Create global instance
    let voiceFaster = null;

    // Initialize on DOM load
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            // Look for existing text input
            const targetElement = document.querySelector('textarea, input[type="text"]');

            voiceFaster = new VoiceFasterController({
                targetElement,
                transcribeToStagingArea: true
            });

            // Export for both module and non-module environments
            if (typeof exports !== 'undefined') {
                exports.VoiceFasterController = VoiceFasterController;
            }
            window.voiceFaster = voiceFaster;

        } catch (error) {
            console.error('VoiceFaster initialization failed:', error);
        }
    });

    // Plugin interface for TTS
    window.VOICEFASTER_stream_voice_audio = async (params, userSettings) => {
        if (!window.voiceFaster) {
            throw new Error("VoiceFaster not initialized");
        }
        return window.voiceFaster.ttsPlayer.queueText(params.text);
    };


})();
