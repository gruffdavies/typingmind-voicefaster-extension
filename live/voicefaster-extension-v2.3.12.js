(() => {

    const VOICEFASTER_VERSION = '2.3.12';

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
            defaultTranscriberProvider: 'deepgram',
            defaultVoiceId: 'LKzEuRvwo37aJ6JFMnxk',
            maxQueueSize: 100,
            maxQueueAge: 3600000,
            targetElement: null,
            transcribeToStagingArea: true,
            ...config
        };

        this.speakerComponent = null;
        this.transcriberComponent = null;
        this.deepgramApiKey = null;
        this.elevenLabsApiKey = null;
        this.uiComponent = null;

        this.initialize();
    }

    async initialize() {
        try {
            console.log("VoiceFasterController: Initializing...");
            this.getAPIKeys();
            await this.initializeTranscriber();
            await this.initializeSpeaker();
            await this.initializeUI();
            await this.initializeVisualizers();
            this.assignVisualizers();
            this.addObservers();

            console.log("VoiceFasterController: Initialization complete");
        } catch (error) {
            console.error("VoiceFasterController: Initialization failed:", error);
            this.handleError(error);
        }
    }

    getAPIKeys() {
        const pluginSettings = JSON.parse(window.localStorage.getItem("TM_useUserPluginSettings"));
        const deepFind = (obj, key) =>
            key in obj ? obj[key]
            : Object.values(obj).reduce((acc, val) =>
                acc !== undefined ? acc
                : typeof val === 'object' && val !== null ? deepFind(val, key)
                : undefined
            , undefined);

        this.deepgramApiKey = deepFind(pluginSettings, 'deepgramApiKey');
        this.elevenLabsApiKey = deepFind(pluginSettings, 'elevenLabsApiKey');
        console.log("VoiceFasterController: API keys retrieved", { deepgramApiKey: this.deepgramApiKey, elevenLabsApiKey: this.elevenLabsApiKey });

    }

    async initializeUI() {
        this.uiComponent = new UIComponent(this);
        await this.uiComponent.initialize();
    }

    // In VoiceFasterController.js
    async initializeVisualizers() {
        const iconXAxisPos = 0;
        const iconYAxisPos = 0.5;
        const iconsVizBarCount = 16;

        // Create Transcriber (mic) visualizer
        this.micVisualizer = new AudioVisualizer({
            className: "human-speech",
            color: "--vf-human",
            barCount: iconsVizBarCount,
            fftSize: 128,
            xAxisPos: iconXAxisPos,
            yAxisPos: iconYAxisPos,
            xOffset: 0
        });

        // Create Speaker visualizer
        this.voicerVisualizer = new AudioVisualizer({
            className: "agent-speech",
            color: "--vf-agent",
            barCount: iconsVizBarCount,
            fftSize: 2048,
            xAxisPos: iconXAxisPos,
            yAxisPos: iconYAxisPos,
            xOffset: 1 / iconsVizBarCount
        });

        // Mount visualizers after UI is initialized
        this.micVisualizer.mount(this.uiComponent.container.querySelector('#vf-mic-button'));
        this.voicerVisualizer.mount(this.uiComponent.container.querySelector('#vf-speaker-button'));
    }

    async initializeTranscriber() {
        this.transcriberComponent = new TranscriberComponent(this.deepgramApiKey);
        await this.transcriberComponent.initialize();
        this.setupTranscriberHandlers();
    }

    async initializeSpeaker() {
        this.speakerComponent = new SpeakerComponent(this.voicerVisualizer);
        this.setupSpeakerHandlers();
    }

    assignVisualizers() {
        this.transcriberComponent.visualizer = this.micVisualizer;
        this.speakerComponent.visualizer = this.voicerVisualizer;
    }

    addObservers() {
        this.speakerComponent.queue.addObserver(this.uiComponent.queueUIManager);
    }


    async switchTranscriberProvider() {
        const wasRecording = this.transcriberComponent.isListening;
        if (wasRecording) {
            await this.transcriberComponent.stop();
        }

        await this.transcriberComponent.switchProvider();
    }

    setupTranscriberHandlers() {
        this.transcriberComponent.setHandlers({
            onTranscript: (text, isFinal) => {
                console.debug("Transcript received:", { text, isFinal });  // Add logging
                this.handleTranscript(text, isFinal);
            },
            onStateChange: (state) => {
                console.debug("Transcriber state changed:", state);  // Add logging
                this.handleTranscriberStateChange(state);
            },
            onError: (error) => this.handleError(error)
        });
    }

    setupSpeakerHandlers() {
        this.speakerComponent.on('stateChange', state => {
            this.uiComponent.setSpeakerState(this.speakerComponent.isSpeaking ? 'speaking' : 'idle');
        });

        this.speakerComponent.on('error', error => this.handleError(error));
    }


    handleTranscript(text, isFinal) {
        console.debug("Handling transcript:", { text, isFinal });  // Add logging
        if (this.config.targetElement && isFinal) {
            const currentText = this.config.targetElement.value;
            const spacer = currentText && !currentText.endsWith(' ') ? ' ' : '';
            this.config.targetElement.value = currentText + spacer + text;
            this.config.targetElement.dispatchEvent(new Event('change'));
        }

        this.uiComponent.updateTranscript(text, isFinal);
    }

    handleTranscriberStateChange(state) {
        this.uiComponent.setMicState(state);
    }


    handleError(error) {
        this.state.hasError = true;
        this.state.errorMessage = error.message || 'Unknown error occurred';

        // Auto-clear error after 5 seconds
        setTimeout(() => {
            this.state.hasError = false;
            this.state.errorMessage = '';
        }, 5000);
    }


    // Public API methods
    async toggleRecording() {
        if (this.transcriberComponent.isListening) {
            console.debug("stopping transcribing because toggleRecording called and this.transcriber.isListening is", this.transcriberComponent.isListening);
            await this.transcriberComponent.stop();
            this.uiComponent.setMicState('idle');
        } else {
            console.debug("starting transcribing because toggleRecording called and this.transcriber.isListening is", this.transcriberComponent.isListening);
            await this.transcriberComponent.start();
            this.uiComponent.setMicState('listening');
        }
    }

    async queueText(text) {
        try {
            await this.speakerComponent.queueText(text);
        } catch (error) {
            this.handleError(error);
        }
    }

    cleanup() {
        this.transcriberComponent?.stop();
        this.speakerComponent?.cleanup();
        this.micVisualizer?.cleanup();
        this.voicerVisualizer?.cleanup();
        this.uiComponent?.cleanup();
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
        this.audioContext = null;
        this.mediaElementSource = null;

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
            if (this.mode !== 'idle' ) {
                this.updateVisualization();
            }
            this.animationFrame = requestAnimationFrame(animate);
        };
        animate();
    }

    getColor(varName) {
        return this.styles.getPropertyValue(varName).trim();
    }

    undrawBars() {
        const heights = new Array(this.config.barCount).fill(0);
        this.drawBars(heights);
    }


    async setMode(mode, stream = null) {
        if (mode === this.mode) { return; }
        console.log(`🔉AudioVizualizer Setting mode to ${mode}`);

        this.mode = mode;
        if (mode === 'idle') {
            this.undrawBars();
            return;
        }

        if (stream) {
            try {
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }

                if (this.audioContext.state === "suspended") {
                    await this.audioContext.resume();
                }

                this.analyser = this.analyser || this.audioContext.createAnalyser();
                this.analyser.fftSize = this.config.fftSize || 2048;
                this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

                if (stream instanceof HTMLMediaElement) {
                    // Reuse existing MediaElementSource if it exists
                    if (!this.mediaElementSource) {
                        this.mediaElementSource = this.audioContext.createMediaElementSource(stream);
                    }

                    // Disconnect any existing connections
                    try {
                        this.mediaElementSource.disconnect();
                    } catch (e) {
                        // Ignore disconnection errors
                    }

                    // Make new connections
                    this.mediaElementSource.connect(this.analyser);
                    this.mediaElementSource.connect(this.audioContext.destination);
                } else {
                    const source = this.audioContext.createMediaStreamSource(stream);
                    source.connect(this.analyser);
                }

                return true;
            } catch (err) {
                console.error('Error in setMode:', err);
                return false;
            }
        } else {
            if (this.analyser) {
                try {
                    this.analyser.disconnect();
                } catch (e) {
                    // Ignore disconnection errors
                }
            }
            this.dataArray = null;
        }
    }

    cleanup() {
        if (this.mediaElementSource) {
            try {
                this.mediaElementSource.disconnect();
            } catch (e) {
                // Ignore disconnection errors
            }
        }
        if (this.analyser) {
            try {
                this.analyser.disconnect();
            } catch (e) {
                // Ignore disconnection errors
            }
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        this.mediaElementSource = null;
        this.analyser = null;
        this.audioContext = null;
    }

}




// UIManager.js
class UIComponent {
    constructor(controller) {
        this.controller = controller;
        this.container = null;
        this.visualizerContainer = null;
        this.queueVisualizerContainer = null;
        this.queueUIManager = null;
    }

    async initialize() {
        this.createMainContainer();
        this.createHeader();
        this.createControls();
        this.createInfo();
        this.createBubbleTray();
        this.createTranscriptArea();
        this.createSettings();
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

    micIconHTML() {
        return `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path d="M5 3a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z"/>
                <path d="M3.5 6.5A.5.5 0 0 1 4 7v1a4 4 0 0 0 8 0V7a.5.5 0 0 1 1 0v1a5 5 0 0 1-4.5 4.975V15h3a.5.5 0 0 1 0 1h-7a.5.5 0 0 1 0-1h3v-2.025A5 5 0 0 1 3 8V7a.5.5 0 0 1 .5-.5"/>
            </svg>`;
    }

    speakerIconHTML(){
        return `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16">
                <path d="M11.536 14.01A8.47 8.47 0 0 0 14.026 8a8.47 8.47 0 0 0-2.49-6.01l-.708.707A7.48 7.48 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303z"/>
                <path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.48 5.48 0 0 1 11.025 8a5.48 5.48 0 0 1-1.61 3.89z"/>
                <path d="M8.707 11.182A4.5 4.5 0 0 0 10.025 8a4.5 4.5 0 0 0-1.318-3.182L8 5.525A3.5 3.5 0 0 1 9.025 8 3.5 3.5 0 0 1 8 10.475zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06"/>
            </svg>`
    }

    gearIconHTML(){
        return `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" class="bi bi-gear" viewBox="0 0 16 16">
                <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/>
                <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115z"/>
            </svg>`
    }

    createControls() {
        const controls = document.createElement('div');
        controls.className = 'vf-controls';

        // Mic control
        const micControl = document.createElement('div');
        micControl.className = 'vf-mic';
        const micButton = document.createElement('button');
        micButton.className = 'vf-button vf-button-mic';
        micButton.id = 'vf-mic-button';
        micButton.dataset.state = 'idle';
        micButton.innerHTML = this.micIconHTML();
        micButton.addEventListener('click', () => {
            console.log('Mic button clicked');
            this.controller.toggleRecording();
        });
        micControl.appendChild(micButton);

        // Settings button
        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'vf-settings-btn';
        settingsBtn.innerHTML = this.gearIconHTML();
        settingsBtn.addEventListener('click', () => this.toggleSettings());

        // Speaker control
        const SpeakerControl = document.createElement('div');
        SpeakerControl.className = 'vf-speaker';
        const SpeakerButton = document.createElement('button');
        SpeakerButton.className = 'vf-button vf-button-tts';
        SpeakerButton.id = 'vf-speaker-button';
        SpeakerButton.dataset.state = 'idle';
        SpeakerButton.innerHTML = this.speakerIconHTML();
        SpeakerControl.appendChild(SpeakerButton);

        controls.appendChild(micControl);
        controls.appendChild(settingsBtn);
        controls.appendChild(SpeakerControl);

        this.container.appendChild(controls);
    }


    createInfo() {
        const info = document.createElement('div');
        const version = VOICEFASTER_VERSION;
        info.className = 'vf-info';
        info.innerHTML = `<span>VoiceFaster</span><span>v${version}</span>`;
        this.container.appendChild(info);
    }

    createBubbleTray() {
        this.queueVisualizerContainer = document.createElement('div');
        this.queueVisualizerContainer.className = 'vf-bubble-tray';
        this.container.appendChild(this.queueVisualizerContainer);

        // Initialize QueueUIManager
        this.queueUIManager = new QueueUIManager(this.controller);
        this.queueUIManager.mount(this.queueVisualizerContainer);
    }


    // In UIManager.js, modify the createSettings method:
    async createSettings() {
        const settings = document.createElement('div');
        settings.className = 'vf-settings';
        settings.hidden = true;

        const header = this.createSettingsHeader();
        const transcriberSection = this.createTranscriberSection();
        const speakerSection = this.createSpeakerSection();

        settings.append(header, transcriberSection, speakerSection);
        this.container.appendChild(settings);
    }

    createSettingsHeader() {
        const header = document.createElement('div');
        header.className = 'vf-settings-header';
        header.innerHTML =         `<span>SETTINGS</span>
        <button class="vf-settings-close"><i class="bi bi-x"></i></button>`;

        const closeBtn = header.querySelector('.vf-settings-close');
        closeBtn.addEventListener('click', () => {
            const settings = this.container.querySelector('.vf-settings');
            settings.hidden = true;
        });
        return header;
    }

    createTranscriberSection() {
        const section = document.createElement('div');
        section.className = 'vf-settings-section';
        section.innerHTML = `<h3 class="vf-settings-title">Transcription Settings</h3>
                            <div class="vf-settings-controls">
                            <select class="vf-transcriber-provider-select">
                                <option value="deepgram">DeepGram</option>
                                <option value="webspeech">WebSpeech</option>
                            </select>
                            <label class="vf-settings-item">
                                <input type="checkbox" checked=""> TTS Staging Area
                            </label>
                            </div>`;

        const providerSelect = section.querySelector('.vf-transcriber-provider-select');

        providerSelect.addEventListener('change', async (e) => {
            try {
                await this.controller.switchTranscriberProvider();
                this.showNotification('Speech recognition provider switched successfully');
            } catch (error) {
                console.error('Failed to switch provider:', error);
                providerSelect.value = this.controller.transcriber.provider instanceof DeepGramTranscriber ? 'deepgram' : 'webspeech';
                this.showError('Failed to switch provider: ' + error.message);
            }
        });

        return section;
    }


  createSpeakerSection() {
        const section = document.createElement('div');
        section.className = 'vf-settings-section';
        section.innerHTML = `<h3 class="vf-settings-title">Agent Speech Settings</h3>
    <div class="vf-settings-controls">
      <select class="vf-speaker-provider-select">
        <option value="elevenlabs">ElevenLabs</option>
        <option value="webspeech">WebSpeech (Free)</option>
      </select>
      <label class="vf-settings-item">
        <input type="checkbox" checked=""> Show History Bubbles
      </label>
      <div class="vf-settings-item">
        <label>Bubble Lines: <input type="number" value="2" min="1" max="5"></label>
      </div>
      <div class="vf-settings-item">
        <label>Bubbles Per Line: <input type="number" value="9" min="1" max="20"></label>
      </div>
    </div>
                    ` ;

        const providerSelect = section.querySelector('.vf-speaker-provider-select');

        providerSelect.addEventListener('change', async (e) => {
            try {
                await this.controller.switchSpeakerProvider();
                this.showNotification('Text to speech provider switched successfully');
            } catch (error) {
                console.error('Failed to switch provider:', error);
                providerSelect.value = this.controller.speaker.provider instanceof ElevenLabsSpeaker ? 'elevenlabs' : 'webspeech';
                this.showError('Failed to switch provider: ' + error.message);
            }
        });


        return section;
    }
    // Add notification method
    showNotification(message) {
        console.log('Showing notification:', message);
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
        content.innerHTML = `<span class="vf-text--final"></span><span class="vf-text--interim"></span>`;

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
            if (this.controller.transcriber.isListening) {
                this.controller.toggleRecording();
            }
        });

        sendBtn.addEventListener('click', () => {
            console.debug('Send button clicked');
            // Handle send action
            const finalText = transcript.querySelector('.vf-text--final').textContent;
            if (finalText && this.controller.config.targetElement) {
                this.controller.config.targetElement.value += ' ' + finalText;
                transcript.hidden = true;
                if (this.controller.transcriber.isListening) {
                    this.controller.toggleRecording();
                }
            }
        });

        clearBtn.addEventListener('click', () => {
            transcript.querySelector('.vf-text--interim').textContent = '';
            transcript.querySelector('.vf-text--final').textContent = '';
            if (this.controller.transcriber.isListening) {
                this.controller.toggleRecording();
            }
        });
    }


    updateTranscript(text, isFinal) {
        const transcript = this.container.querySelector('.vf-transcript');
        if (!transcript) return;

        transcript.hidden = false;
        const contentArea = transcript.querySelector('.vf-transcript-content');
        const interimSpan = contentArea.querySelector('.vf-text--interim');
        const finalSpan = contentArea.querySelector('.vf-text--final');

        if (isFinal) {
            finalSpan.textContent += text + ' ';
            interimSpan.textContent = '';
        } else {
            interimSpan.textContent = text;
        }
    }

    setMicState(state) {
        console.log('Setting mic state:', state);
        const micButton = this.container.querySelector('#vf-mic-button');
        if (micButton) {
            micButton.dataset.state = state;
        } else{
            console.error('Mic button not found');
        }
    }

    setSpeakerState(state) {
        console.log('Setting speaker state:', state);
        const speakerButton = this.container.querySelector('#vf-speaker-button');
        if (speakerButton) {
            speakerButton.dataset.state = state.isSpeaking ? 'speaking' : 'idle';
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

            const deltaX = startX - clientX;
            const newRight = startRight + deltaX;
            const newY = clientY - startY;

            // Get transcript dimensions if visible
            const transcript = this.container.querySelector('.vf-transcript');
            const transcriptWidth = transcript && !transcript.hidden ?
                transcript.offsetWidth : this.container.offsetWidth;

            // Use the wider of the two widths for constraints
            const effectiveWidth = Math.max(this.container.offsetWidth, transcriptWidth);

            // Constrain to viewport considering the effective width
            const maxRight = window.innerWidth - effectiveWidth;
            const maxY = window.innerHeight - (this.container.offsetHeight +
                (transcript && !transcript.hidden ? transcript.offsetHeight + 8 : 0));

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

class QueueUIManager {
    constructor(controller) {
        this.controller = controller;
        this.container = null;
        this.maxItems = 12;
        this.bubbleClickHandlers = new Map(); // Store handlers to allow proper cleanup
    }

    mount(container) {
        if (!container) {
            console.error('QueueUIManager: No container provided for mounting');
            return;
        }
        this.container = container;
    }

    update(queue) {
        console.log("QueueUIManager updating, queue size:", queue.size);
        if (!this.container) return;

        // Clean up excess bubbles and their event listeners
        while (this.container.children.length > this.maxItems) {
            const bubble = this.container.firstChild;
            this.cleanupBubble(bubble);
            this.container.removeChild(bubble);
        }

        const items = Array.from(queue);

        // Remove bubbles for non-existent items
        Array.from(this.container.children).forEach((bubble, index) => {
            if (!items[index]) {
                this.cleanupBubble(bubble);
                this.container.removeChild(bubble);
            }
        });

        // Update existing bubbles and create new ones
        items.forEach((item, index) => {
            let bubble = this.container.children[index];

            if (bubble) {
                this.updateBubble(bubble, item);
            } else {
                bubble = this.createBubble(item);
                this.container.appendChild(bubble);
            }
        });
    }

    createBubble(item) {
        const bubble = document.createElement('div');
        bubble.className = 'vf-bubble';
        bubble.dataset.state = item.state;
        bubble.dataset.id = item.id;
        bubble.title = item.getDetailsString();

        // Create and store the click handler
        const clickHandler = this.createBubbleClickHandler(item);
        this.bubbleClickHandlers.set(bubble, clickHandler);
        bubble.addEventListener('click', clickHandler);

        return bubble;
    }

    createBubbleClickHandler(item) {
        return async () => {
            const current = this.controller.speaker.queue.getCurrentPlayingItem();

            try {
                switch (item.state) {
                    case 'queued':
                        if (!current) {
                            await this.controller.speaker.processNextInQueue();
                        }
                        break;

                    case 'playing':
                        await this.controller.speaker.pause();
                        break;

                    case 'completed':
                        console.error('QueueUIManager: Attempted to play completed item which is not yet implemented');
                        break;

                    case 'error':
                        console.warn('QueueUIManager: Attempted to play error item which is not yet implemented');
                        break;

                    default:
                        console.warn(`Unhandled item state: ${item.state}`);
                        break;
                }
            } catch (error) {
                console.error('Error handling bubble click:', error);
                // Optionally show error to user via controller's error handling
                if (this.controller.handleError) {
                    this.controller.handleError(error);
                }
            }
        };
    }

    updateBubble(bubble, item) {
        if (!bubble || !item) return;

        // Update state and tooltip
        bubble.dataset.state = item.state;
        bubble.title = item.getDetailsString();

        // Update ARIA attributes for accessibility
        bubble.setAttribute('aria-label', `Audio item ${item.id} - ${item.state}`);
        bubble.setAttribute('role', 'button');

        // Add appropriate cursor style based on state
        bubble.style.cursor = ['queued', 'playing', 'completed', 'error'].includes(item.state)
            ? 'pointer'
            : 'default';
    }

    cleanupBubble(bubble) {
        if (!bubble) return;

        // Remove event listener if it exists
        const handler = this.bubbleClickHandlers.get(bubble);
        if (handler) {
            bubble.removeEventListener('click', handler);
            this.bubbleClickHandlers.delete(bubble);
        }
    }

    cleanup() {
        if (!this.container) return;

        // Clean up all bubbles
        Array.from(this.container.children).forEach(bubble => {
            this.cleanupBubble(bubble);
        });

        // Clear the container
        this.container.innerHTML = '';

        // Clear the handler map
        this.bubbleClickHandlers.clear();

        // Remove container reference
        this.container = null;
    }
}


/* Speech Recognition and Transcription Classes */
const ConnectionState = {
    CLOSED: 'closed',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    FAILED: 'failed'
};

class TranscriberComponent {
    constructor(deepgramApiKey) {
        this.deepgramApiKey = deepgramApiKey;
        this.provider = null;
        this.handlers = null;
        this.visualizer = null;
    }

    async initialize(preferredType = "deepgram") {
        this.provider = await this.createProvider(preferredType);
        if (this.provider) {
            this.provider.setHandlers(this.handlers);
        }
    }

    async createProvider(preferredType) {
        try {
            if (preferredType === "deepgram") {
                const config = {deepgramApiKey: this.deepgramApiKey};
                console.log("🪄🧊 Creating DeepGram Transcriber with config:", config);
                const provider = new DeepGramTranscriber(config);
                if (await provider.isAvailable()) {
                    console.debug("Using DeepGram Transcriber");
                    return provider;
                }
                console.warn("DeepGram provider not available, falling back to WebSpeech");
            }

            const webSpeech = new WebSpeechTranscriber();
            if (await webSpeech.isAvailable()) {
                console.debug("Using WebSpeech Transcriber");
                return webSpeech;
            }

            throw new Error("No transcription service available");
        } catch (error) {
            console.error("Failed to create transcriber provider:", error);
            throw error;
        }
    }

    async switchProvider() {
        const wasRecording = this.provider.isListening;
        if (wasRecording) {
            await this.stop();
        }

        const newType = this.provider instanceof DeepGramTranscriber ?
            "webspeech" : "deepgram";

        this.provider = await this.createProvider(newType);
        this.provider.setHandlers(this.handlers);

        if (wasRecording) {
            await this.start();
        }

        return this.provider;
    }

    setHandlers(handlers) {
        this.handlers = handlers;
        if (this.provider) {
            this.provider.setHandlers(handlers);
        }
    }

    async start() {
        if (!this.provider) throw new Error("🚨No transcriber provider initialized");
        if (!this.visualizer) throw new Error("🚨No transcriber visualizer assigner");
        try {
            const stream = await this.provider.getAudioStream();
            this.visualizer.setMode('listening', stream);
            await this.provider.startTranscribing();
            console.debug("🚨TranscriberComponent started, isListening:", this.isListening);
        } catch (error) {
            throw error;
        }
    }


    async stop() {
        if (this.provider) {
            this.visualizer.setMode('idle');
            await this.provider.stopTranscribing();
            console.debug("🚨TranscriberComponent stopped, isListening:", this.isListening);
        }
    }

    get isListening() {
        if (!this.provider) {
            console.warn("TranscriberComponent.isListening queried but no provider is initialized");
            return false;
        }
        return this.provider.isListening;
    }

    set isListening(value) {
        if (!this.provider) {
            console.warn("TranscriberComponent.isListening set but no provider is initialized");
            return;
        }
        this.provider.isListening = value;
    }

    cleanup() {
        this.provider?.stop();
    }
}

class TranscriberProvider {
    async startTranscribing() {
        throw new Error("startTranscribing must be implemented");
    }

    async stopTranscribing() {
        throw new Error("stopTranscribing must be implemented");
    }

    async isAvailable() {
        throw new Error("Method 'isAvailable' must be implemented");
    }

    setHandlers(handlers) {
        throw new Error("Method 'setHandlers' must be implemented");
    }
}

// BaseTranscriberProvider.js
class BaseTranscriberProvider extends TranscriberProvider {
    constructor() {
        super();
        this._isListening = false;
        this.audioStream = null;
        this.handlers = null;
        this.finalTranscript = '';
    }

    get isListening() {
        return this._isListening;
    }

    set isListening(value) {
        if (this._isListening !== value) {
            const newState = value ? 'listening' : 'idle';
            this._isListening = value;
            this._handleStateChange(newState);
        }
    }

    async getAudioStream() {
        if (!this.audioStream) {
            this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        return this.audioStream;
    }

    // Abstract methods to be implemented by subclasses
    async startTranscribing() {
        throw new Error("startTranscribing must be implemented");
    }

    async stopTranscribing() {
        throw new Error("stopTranscribing must be implemented");
    }

    _processTranscript(text, isFinal) {
        if (isFinal) {
            this.finalTranscript += text + ' ';
        }
        this.handlers?.onTranscript?.(text, isFinal);
    }

    _handleStateChange(state) {
        this.handlers?.onStateChange?.(state);
    }

    _handleError(error) {
        console.error('Transcriber Error:', error);
        this.handlers?.onError?.(error);
    }

    setHandlers(handlers) {
        this.handlers = handlers;
    }
}


// WebSpeechTranscriber.js
class WebSpeechTranscriber extends BaseTranscriberProvider {
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
    get isListening() {
        return super.isListening;
    }

    set isListening(value) {
        super.isListening = value;
    }

    setupRecognitionHandlers() {
        this.recognition.onstart = () => {
            this.isListening = true;
        };

        this.recognition.onend = () => {
            this.isListening = false;
        };

        this.recognition.onresult = (event) => {
            let interimTranscript = '';

            if (typeof event.results === 'undefined') {
                this.recognition.onend = null;
                this.recognition.stop();
                return;
            }

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcript = event.results[i][0].transcript;
                    this._processTranscript(transcript, event.results[i].isFinal);
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
            this._handleError(new Error(errorMessage));
        };
    }

    async startTranscribing() {
        this.finalTranscript = '';
        this.recognition.start();
    }

    async stopTranscribing() {
        this.recognition.stop();
    }

    async isAvailable() {
        return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    }

    setHandlers(handlers) {
        this.handlers = handlers;
    }
}


// DeepGramTranscriber.js
class DeepGramTranscriber extends BaseTranscriberProvider {
    constructor(config = {}) {
        console.log('DeepGramTranscriber constructor called with config:', config);
        super();
        this.config = {
            model: 'nova-2',
            language: 'en-GB',
            smart_format: true,
            interim_results: true,
            vad_events: true,
            endpointing: 300,
            maxRetries: 3,
            connectionTimeout: 1000,
            maxBufferSize: 50,
            ...config
        };

        this.ws = null;
        this.audioBuffer = [];
        this.connectionAttempt = 0;
        this.connectionTimeout = null;
        this.reconnectTimeout = null;
        this.mediaRecorder = null;
        this.connectionState = ConnectionState.CLOSED;
        console.log('DeepGramTranscriber constructor finished. Config:', this.config);

    }

    async isAvailable() {
        try {
            return Boolean(this.config?.deepgramApiKey);
        } catch (e) {
            console.warn('DeepGram availability check failed:', e);
            return false;
        }
    }

    setHandlers(handlers) {
        this.handlers = handlers;
    }

    async startTranscribing() {
        if (this.isListening) {
            await this.stopTranscribing();
            return;
        }

        // Reset state
        try {
            // Get and setup audio stream
            const stream = await this.getAudioStream();
            this.setupMediaRecorder(stream);
            this.isListening = true;
        } catch (error) {
            this.isListening = false;
            this._handleError(error);
            throw error;
        }

        this.connectionAttempt = 0;
        this.connectionState = ConnectionState.CONNECTING;
        await this.setupWebSocket();


    }

    async stopTranscribing() {
        // Set state first to prevent new data being sent
        this.isListening = false;
        this.connectionState = ConnectionState.CLOSING;
        this.clearTimeouts();

        // Clean up MediaRecorder first
        if (this.mediaRecorder) {
            this.mediaRecorder.stop();
            this.mediaRecorder = null;
        }

        // Close WebSocket with proper await
        if (this.ws) {
            try {
                await this.closeWebSocket();
            } catch (error) {
                console.warn('Error during WebSocket closure:', error);
            }
        }

        // Final cleanup
        this.ws = null;
        this.connectionState = ConnectionState.CLOSED;
        this.audioBuffer = [];
    }

    closeWebSocket() {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                resolve();
                return;
            }

            const onClose = () => {
                this.ws.removeEventListener('close', onClose);
                resolve();
            };

            const onError = (error) => {
                this.ws.removeEventListener('error', onError);
                reject(error);
            };

            this.ws.addEventListener('close', onClose);
            this.ws.addEventListener('error', onError);

            // Initiate close
            try {
                this.ws.close();
            } catch (error) {
                reject(error);
            }
        });
    }

    setupWebSocket() {
        this.clearTimeouts();
        this.connectionState = ConnectionState.CONNECTING;
        this.connectionAttempt++;
        const deepgramBaseURL = "wss://api.deepgram.com/v1/listen";
        const deepgramOptions = {
            model: this.config.model,
            language: this.config.language,
            smart_format: this.config.smart_format,
            interim_results: this.config.interim_results,
            vad_events: this.config.vad_events,
            endpointing: this.config.endpointing
        };
        const keywords = ["keywords=KwizIQ:2"].join("&");
        const deepgramUrl = `${deepgramBaseURL}?${new URLSearchParams(deepgramOptions)}&${keywords}`;
        console.debug(`🚀 Connecting DeepGram WebSocket (attempt ${this.connectionAttempt}/${this.config.maxRetries}):`, deepgramUrl);
        try {
            this.ws = new WebSocket(deepgramUrl, ["token", this.config.deepgramApiKey]);
            this.connectionTimeout = setTimeout(() => {
                if (this.ws?.readyState !== WebSocket.OPEN) {
                    console.warn(`⌛ WebSocket connection timeout (attempt ${this.connectionAttempt})`);
                    this.handleConnectionFailure();
                }
            }, this.config.connectionTimeout);
            this.ws.onopen = () => {
                console.debug("🎯 DeepGram WebSocket opened");
                this.clearTimeouts();
                this.connectionAttempt = 0;
                this.connectionState = ConnectionState.CONNECTED; // <- this needed to be here
                this._handleStateChange('listening');
                this.processBufferedAudio();
            };
            this.ws.onclose = () => {
                console.debug("🧹 DeepGram WebSocket closed");
                this.connectionState = ConnectionState.CLOSED;
                this.handleConnectionFailure();
            };
            this.ws.onerror = (error) => {
                console.error("🚨 DeepGram WebSocket error:", error);
                this.handleConnectionFailure();
            };
            this.ws.onmessage = (event) => {
                try {
                    const response = JSON.parse(event.data);
                    if (response.type === 'Results') {
                        const transcript = response.channel.alternatives[0].transcript;
                        this._processTranscript(transcript, response.is_final);
                    }
                } catch (error) {
                    this._handleError(error);
                }
            };
        } catch (error) {
            console.error("🚨 Error creating WebSocket:", error);
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

    processBufferedAudio() {
        if (this.connectionState !== ConnectionState.CONNECTED)
            return;
        console.debug(`Processing buffered audio: ${this.audioBuffer.length} chunks`);
        while (this.audioBuffer.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
            const audioData = this.audioBuffer.shift();
            try {
                this.ws.send(audioData);
                console.debug("Buffered audio chunk sent, size:", audioData.byteLength);
            } catch (error) {
                console.error("Error sending buffered audio:", error);
                this.audioBuffer.unshift(audioData);
                break;
            }
        }
    }
    processAudioData(audioData) {
        console.debug(`DeepGram.processAudioData called, connection state: ${this.connectionState}`);
        if (this.connectionState === ConnectionState.CONNECTED && this.ws?.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(audioData);
                console.debug("Audio data sent to DeepGram, size:", audioData.byteLength);
            } catch (error) {
                console.error("Error sending audio to DeepGram:", error);
                if (this.connectionState === ConnectionState.CONNECTED) {
                    this.bufferAudioData(audioData);
                }
            }
        } else if (this.connectionState === ConnectionState.CONNECTING || this.connectionState === ConnectionState.RECONNECTING) {
            console.debug(`WebSocket connecting/reconnecting, buffering audio data. State: ${this.connectionState}`);
            this.bufferAudioData(audioData);
        } else {
            console.warn(` WebSocket in terminal state (${this.connectionState}), discarding audio data`);
        }
    }

    bufferAudioData(audioData) {
        if (this.audioBuffer.length < this.config.maxBufferSize) {
            this.audioBuffer.push(audioData);
            console.debug("🎯 Audio data buffered, buffer size:", this.audioBuffer.length);
        } else {
            console.warn("⚠️ Audio buffer full, dropping oldest chunk");
            this.audioBuffer.shift();
            this.audioBuffer.push(audioData);
        }
    }

    handleConnectionFailure() {
        if (!this.isListening) return;

        if (this.connectionAttempt < this.config.maxRetries) {
            this.connectionState = ConnectionState.RECONNECTING;
            console.debug(`🔄 Scheduling reconnection attempt ${this.connectionAttempt + 1}/${this.config.maxRetries}`);
            const backoffTime = Math.min(1000 * Math.pow(2, this.connectionAttempt - 1), 5000);

            this.reconnectTimeout = setTimeout(() => {
                if (this.isListening) {
                    this.setupWebSocket();
                }
            }, backoffTime);

            this._handleError(new Error(
                `Connection attempt ${this.connectionAttempt} failed, retrying in ${backoffTime / 1000} seconds...`
            ));
        } else {
            this.connectionState = ConnectionState.FAILED;
            this.isListening = false;
            this._handleError(new Error('Failed to establish connection after maximum attempts'));
            this._handleStateChange('idle');
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


// speechAPIRequest.js
class SpeechAPIRequest {
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

// SpeakerQueueItem.js
class SpeechQueueItem {
    constructor(speechAPIRequest) {
        this.id = new Date().getTime().toString();
        this.url = speechAPIRequest.url;
        this.headers = speechAPIRequest.headers;
        this.method = speechAPIRequest.method;
        this.body = speechAPIRequest.body;

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

// SpeakerAudioQueue.js
class SpeechQueue {
    #items;
    #maxSize;
    #maxAge;
    #observers;

    constructor(maxSize = 100, maxAge = 3600000) {
        this.#items = [];
        this.#maxSize = maxSize;
        this.#maxAge = maxAge;
        this.#observers = [];
    }

    append(item) {
        this.#items.push(item);
        this.notifyObservers();
    }

    removeItem(id) {
        const index = this.#items.findIndex((item) => item.id === id);
        if (index !== -1) {
            this.#items.splice(index, 1);
            this.notifyObservers();
            return true;
        }
        return false;
    }

    getNextQueuedItem() {
        return this.#items.find((item) => item.state === "queued") || null;
    }

    updateItemState(id, newState) {
        const item = this.#items.find((item) => item.id === id);
        if (item) {
            item.updateState(newState);
            this.notifyObservers();
        }
    }

    cleanup() {
        for (const item of this.#items) {
            item.refreshState(this.#maxAge);
            if (item.isStale(this.#maxAge)) {
                this.removeItem(item.id);
            }
        }
        this.notifyObservers();
    }

    removeOldest() {
        if (this.#items.length > 0) {
            this.#items.shift();
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

    getCurrentPlayingItem() {
        return this.#items.find((item) => item.state === "playing") || null;
    }

    [Symbol.iterator]() {
        return this.#items[Symbol.iterator]();
    }

    get size() {
        return this.#items.length;
    }
}

class SpeakerComponent extends EventEmitter {
    constructor(visualizer) {
        super();
        this.audio = new Audio();
        this.queue = new SpeechQueue();
        this.visualizer = null;
        this.isPlaying = false;

        this.setupAudioHandlers();
    }

    setupAudioHandlers() {
        this.audio.onended = async () => {
            this.isPlaying = false;
            this.emit('stateChange', 'stopped');
            if (this.visualizer) {
                await this.visualizer.setMode('idle');
            }

            const currentItem = this.queue.getCurrentPlayingItem();
            if (currentItem) {
                this.queue.updateItemState(currentItem.id, "completed");
                await this.processNextInQueue();
            }
        };

        this.audio.onplay = async () => {
            this.isPlaying = true;
            this.emit('stateChange', 'playing');
            if (this.visualizer) {
                await this.visualizer.setMode('playing', this.audio);
            }
        };

        this.audio.onpause = async () => {
            this.isPlaying = false;
            this.emit('stateChange', 'paused');
            if (this.visualizer) {
                await this.visualizer.setMode('idle');
            }
        };
    }


    async processNextInQueue() {
        const nextItem = this.queue.getNextQueuedItem();
        if (!nextItem) {
            this.isPlaying = false;
            this.emit('stateChange', 'stopped');
            if (this.visualizer) {
                await this.visualizer.setMode('idle');
            }
            return;
        }

        // Use queue's updateItemState method consistently
        this.isPlaying = true;
        this.queue.updateItemState(nextItem.id, "requesting");

        try {
            const response = await fetch(nextItem.url, {
                method: nextItem.method,
                headers: nextItem.headers,
                body: nextItem.body,
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);

            // Update state to playing through queue
            this.queue.updateItemState(nextItem.id, "playing");

            this.emit('stateChange', 'playing');

            this.audio.src = audioUrl;
            await this.audio.play();

        } catch (error) {
            console.error("Error in processNextInQueue:", error);
            this.queue.updateItemState(nextItem.id, "error");
            this.isPlaying = false;
            this.emit('stateChange', 'stopped');
            if (this.visualizer) {
                await this.visualizer.setMode('idle');
            }
            this.emit('error', error);
            await this.processNextInQueue();
        }
    }



    async queueAudioItem(speechAPIRequest) {
        console.log("Queueing audio item:", speechAPIRequest);
        const queueItem = new SpeechQueueItem(speechAPIRequest);
        this.queue.append(queueItem);

        if (!this.isPlaying) {
            await this.processNextInQueue();
        }

        return {
            message: "Audio item request queued",
            id: queueItem.id
        };
    }

    async queueText(text) {
        console.warn("queueText not implemented yet but called with text:", text);

    }

    pause() {
        this.audio.pause();
        this.emit('stateChange', 'paused');
    }

    stop() {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.emit('stateChange', 'stopped');
    }

    cleanup() {
        this.stop();
        this.queue = new SpeechQueue();
    }
}


    /* Bootstrapping Code */
    let voicefaster_css = `:root {
    /* Core Theme Colors */
    --vf-widget-neutral: #f5ede3;
    --vf-widget-primary: #40A9FF;

    --vf-widget: var(--vf-widget-primary);

    --vf-human: #78FF64;
    /* Human speech color */
    --vf-agent: #FF4040;
    /* Agent speech color */

    /* Widget Accent Colours */
    --vf-widget-bright: var(--vf-widget);
    --vf-widget-muted: color-mix(in srgb, var(--vf-widget) 60%, transparent);
    --vf-widget-subtle: color-mix(in srgb, var(--vf-widget) 40%, transparent);
    --vf-widget-ghost: color-mix(in srgb, var(--vf-widget) 20%, transparent);

    /* Surface Colors */
    --vf-surface: rgb(28 28 28 / 0.85);
    --vf-surface-raised: rgb(32 32 32 / 0.90);
    --vf-surface-deep: rgb(38 38 38 / 0.95);

    /* Button Surface Colors */
    --vf-button-surface: rgb(45 45 45 / 0.95);
    --vf-button-hover: rgb(55 55 55 / 0.95);
    --vf-button-active: rgb(65 65 65 / 0.95);

    /* Drag Bar specific */
    --vf-dragbar-bg: rgb(22 22 22 / 0.95);
    --vf-dragbar-handle: rgb(128 128 128 / 0.3);

    --vf-text: var(--vf-widget-neutral);
    --vf-text-muted: color-mix(in srgb, var(--vf-widget-neutral) 60%, transparent);
    --vf-text-dim: color-mix(in srgb, var(--vf-widget-neutral) 40%, transparent);

    /* Human Speech Colors */
    --vf-human-bright: var(--vf-human);
    --vf-human-muted: color-mix(in srgb, var(--vf-human) 60%, transparent);
    --vf-human-subtle: color-mix(in srgb, var(--vf-human) 40%, transparent);
    --vf-human-ghost: color-mix(in srgb, var(--vf-human) 20%, transparent);

    /* Agent Speech Colors */
    --vf-agent-bright: var(--vf-agent);
    --vf-agent-muted: color-mix(in srgb, var(--vf-agent) 60%, transparent);
    --vf-agent-subtle: color-mix(in srgb, var(--vf-agent) 40%, transparent);
    --vf-agent-ghost: color-mix(in srgb, var(--vf-agent) 20%, transparent);

    /* Button States */
    --vf-mic-idle: var(--vf-human-muted);
    --vf-mic-active: var(--vf-human-bright);
    --vf-tts-idle: var(--vf-agent-muted);
    --vf-tts-active: var(--vf-agent-bright);

    /* Bubble States */
    --vf-bubble-requesting: white;
    --vf-bubble-queued: yellow;
    --vf-bubble-playing: blue;
    --vf-bubble-completed: green;
    --vf-bubble-error: #ff0000;
    --vf-bubble-stale: #9e9e9e;

    /* --vf-bubble-requesting: white;
    --vf-bubble-queued: var(--vf-agent-muted);
    --vf-bubble-playing: var(--vf-widget-primary);
    --vf-bubble-completed: var(--vf-agent-subtle);
    --vf-bubble-error: var(--vf-agent);
    --vf-bubble-stale: var(--vf-text-dim); */

    /* Effects */
    --vf-blur: blur(12px);
    --vf-shadow: 0 4px 12px rgb(0 0 0 / 0.3);
    --vf-glow-mic: 0 0 12px var(--vf-human);
    --vf-glow-tts: 0 0 12px var(--vf-agent);
    --vf-border: 1px solid rgb(255 255 255 / 0.1);

    /* Timing */
    --vf-transition-fast: 150ms ease;
    --vf-transition-normal: 250ms ease;

    /* Layout */
    --vf-padding-xl: 12px;
    --vf-padding-l: 8px;
    --vf-padding-m: 4px;
    --vf-padding-s: 2px;
    --vf-padding-xs: 1px;
}



/* Main Widget */
.vf-widget {
    position: fixed;
    /* left: calc(100vw - 160px - 1rem);  /* St */
    right: 1rem;
    top: 5rem;
    width: 160px;
    background: var(--vf-surface);
    backdrop-filter: var(--vf-blur);
    border: var(--vf-border);
    border-radius: 8px;
    box-shadow: var(--vf-shadow);
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    z-index: 1000;
    overflow: visible;
    padding: var(--vf-padding-xs);
    min-width: 160px;
}

.vf-widget-container {
    position: relative;
    overflow: visible;
}

/* Drag Bar */
.vf-dragbar {
    background: var(--vf-dragbar-bg);
    width: 100%;
    height: 24px;
    cursor: grab;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 6px 6px 0 0;
    position: relative;
    /* For canvas positioning */
    overflow: hidden;
    /* Keep visualization inside border radius */
}

.vf-dragbar-viz {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    /* Allow drag events to pass through */
    opacity: 0.4;
    /* Make visualization subtle */
}

.vf-dragbar-handle {
    width: 32px;
    height: 2px;
    background: var(--vf-dragbar-handle);
    border-radius: 2px;
    position: relative;
    /* Keep handle above visualization */
    z-index: 2;
}


/* Controls */
.vf-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--vf-padding-l) var(--vf-padding-xl) 0;
    gap: 4px;
}

/* Buttons */
.vf-button {
    background: var(--vf-button-surface);
    width: 48px;
    height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all var(--vf-transition-fast);
    border-radius: 50%;
    border: none;
    color: var(--vf-text-muted);
    cursor: pointer;
    justify-content: center;
    position: relative;
    padding: 12px;
}

.vf-button-mic {
    color: var(--vf-mic-idle);
}

.vf-button-tts {
    color: var(--vf-tts-idle);
}

/* Add hover effects */
.vf-button:hover {
    background: var(--vf-button-hover);
}

.vf-button:active {
    transform: scale(0.95);
    background: var(--vf-button-active);
}

.vf-button:active {
    background: var(--vf-button-active);
}

/* Center icons better */
.vf-button i {
    font-size: 22px;
    line-height: 1;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2;
    /* Keep icon above canvas */
}

/* Listening Animation */
@keyframes listening-pulse {
    0% {
        box-shadow: 0 0 0 0 rgba(120, 255, 100, 0.4);
    }

    70% {
        box-shadow: 0 0 0 10px rgba(120, 255, 100, 0);
    }

    100% {
        box-shadow: 0 0 0 0 rgba(120, 255, 100, 0);
    }
}


/* Settings button specifically */
.vf-settings-btn {
    width: 28px;
    height: 28px;
    padding: 6px;
    background: var(--vf-surface);
    border-radius: 4px;
    color: var(--vf-text-muted);
    border: none;
    transition: all var(--vf-transition-fast);
}

.vf-settings-btn:hover {
    color: var(--vf-text);
    background: var(--vf-surface-deep);
}

/* Visualizers */
.vf-visualizer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
    /* Between button background and icon */
}

/* Button States */
.vf-mic .vf-button[data-state="listening"] {
    color: var(--vf-mic-active);
    animation: listening-pulse 2s infinite;
    box-shadow: var(--vf-glow-mic);
}

.vf-tts .vf-button[data-state="speaking"] {
    color: var(--vf-tts-active);
    box-shadow: var(--vf-glow-tts);
}

/* Info Bar */
.vf-info {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--vf-widget-muted);
    margin-left: 6px;
    margin-right: 6px;
    margin-top: 2px;
    margin-bottom: -2px;
}

/* Bubble Tray */
.vf-bubble-tray {
    display: flex;
    gap: 4px;
    padding: 4px;
    flex-wrap: wrap;
}

/* Missing TTS Playing Animation */
@keyframes playing-pulse {
    0% {
        box-shadow: 0 0 0 0 rgba(255, 64, 64, 0.4);
    }

    70% {
        box-shadow: 0 0 0 10px rgba(255, 64, 64, 0);
    }

    100% {
        box-shadow: 0 0 0 0 rgba(255, 64, 64, 0);
    }
}

.vf-bubble[data-state="playing"] {
    background: var(--vf-bubble-playing);
    box-shadow: var(--vf-glow-tts);
    animation: playing-pulse 2s infinite;
}


.vf-bubble {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    transition: all var(--vf-transition-normal);
}

/* Bubble States */
.vf-bubble[data-state="requesting"] {
    background: var(--vf-bubble-requesting);
}

.vf-bubble[data-state="queued"] {
    background: var(--vf-bubble-queued);
}

.vf-bubble[data-state="playing"] {
    background: var(--vf-bubble-playing);
    box-shadow: var(--vf-glow-tts);
}

.vf-bubble[data-state="completed"] {
    background: var(--vf-bubble-completed);
}

.vf-bubble[data-state="error"] {
    background: var(--vf-bubble-error);
}

.vf-bubble[data-state="stale"] {
    background: var(--vf-bubble-stale);
}



/* Transcript Area */


.vf-transcript {
    background: var(--vf-surface-deep);
    border-radius: 8px;
    border: var(--vf-border);
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    /* Align with right edge */
    width: 26rem;
    /* Fixed width */
    max-width: calc(100vw - 2rem);
    /* Prevent overflow */
    box-shadow: var(--vf-shadow);
    color: var(--vf-text);
    overflow: hidden;
}


.vf-transcript-header {
    padding: var(--vf-padding-m) var(--vf-padding-l);
    border-bottom: var(--vf-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.vf-transcript-content {
    padding: var(--vf-padding-l);
    min-height: 60px;
    max-height: 200px;
    overflow-y: auto;
}

.vf-text--interim {
    color: var(--vf-human-muted);
    font-style: italic;
}

.vf-text--final {
    color: var(--vf-human);
}

.vf-transcript-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--vf-padding-m);
    padding: var(--vf-padding-m) var(--vf-padding-l);
    border-top: var(--vf-border);
}

.vf-transcript[hidden] {
    display: none;
}

/* Add to vf-mock3.css */
.vf-transcript-actions button {
    background: var(--vf-button-surface);
    border: none;
    color: var(--vf-text);
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    transition: all var(--vf-transition-fast);
}

.vf-transcript-actions button:hover {
    background: var(--vf-button-hover);
}

.vf-transcript-close {
    background: transparent;
    border: none;
    color: var(--vf-text-muted);
    cursor: pointer;
    padding: 4px;
    transition: color var(--vf-transition-fast);
}

.vf-transcript-close:hover {
    color: var(--vf-text);
}

/* Make transcript content layout better */
.vf-transcript-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* Settings Panel */
.vf-settings {
    position: relative;
    right: 100%;
    /* bottom: 100%; */
    /* transform: translate(-50%, -50%); */
    background: var(--vf-surface-deep);
    border-radius: 8px;
    border: var(--vf-border);
    width: 280px;
    box-shadow: var(--vf-shadow);
    color: var(--vf-text);
    z-index: 1001;
}

/* Settings Header */
.vf-settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--vf-padding-l);
    border-bottom: var(--vf-border);
    font-size: 0.9rem;
    font-weight: 500;
}

.vf-settings-close {
    background: transparent;
    border: none;
    color: var(--vf-text-muted);
    cursor: pointer;
    padding: 4px;
    transition: color var(--vf-transition-fast);
    display: flex;
    align-items: center;
}

.vf-settings-close:hover {
    color: var(--vf-text);
}

/* Settings Sections */
.vf-settings-section {
    padding: var(--vf-padding-l);
    border-bottom: var(--vf-border);
}

.vf-settings-section:last-child {
    border-bottom: none;
}

.vf-settings-title {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--vf-text-muted);
    margin: 0 0 var(--vf-padding-l);
}

/* Settings Controls */
.vf-settings-controls {
    display: flex;
    flex-direction: column;
    gap: var(--vf-padding-l);
}

.vf-settings-item {
    display: flex;
    align-items: center;
    gap: var(--vf-padding-m);
    font-size: 0.85rem;
}

/* Dropdowns */
.vf-settings-item select {
    background: var(--vf-button-surface);
    border: var(--vf-border);
    color: var(--vf-text);
    padding: 6px var(--vf-padding-l);
    border-radius: 4px;
    width: 100%;
    cursor: pointer;
    transition: background var(--vf-transition-fast);
}

.vf-settings-item select:hover {
    background: var(--vf-button-hover);
}

/* Checkboxes */
.vf-settings-item input[type="checkbox"] {
    width: 16px;
    height: 16px;
    border: var(--vf-border);
    background: var(--vf-button-surface);
    border-radius: 3px;
    cursor: pointer;
    accent-color: var(--vf-widget);
}

/* Number Inputs */
.vf-settings-item input[type="number"] {
    background: var(--vf-button-surface);
    border: var(--vf-border);
    color: var(--vf-text);
    padding: 4px var(--vf-padding-m);
    border-radius: 4px;
    width: 60px;
    text-align: center;
}

.vf-settings-item input[type="number"]:hover {
    background: var(--vf-button-hover);
}

/* Hide spin buttons for number inputs */
.vf-settings-item input[type="number"]::-webkit-inner-spin-button,
.vf-settings-item input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

/* Labels */
.vf-settings-item label {
    display: flex;
    align-items: center;
    gap: var(--vf-padding-m);
    cursor: pointer;
    color: var(--vf-text);
}

/* Settings Panel Hidden State */
.vf-settings[hidden] {
    display: none;
}`;

    function injectStyles() {
        const styleElement = document.createElement('style')
        styleElement.setAttribute('data-voicefaster-version', VOICEFASTER_VERSION)
        styleElement.textContent = voicefaster_css
        document.head.appendChild(styleElement)
        console.log('VoiceFaster styles injected')
    }

    function createVoiceFaster() {
        injectStyles();
        try {
            // Look for existing text input
            const targetElement = document.querySelector('#chat-input-textbox');
            console.log('Target element:', targetElement);

            voiceFaster = new VoiceFasterController({
                targetElement,
                transcribeToStagingArea: true
            });

            // Export for both module and non-module environments
            if (typeof exports !== 'undefined') {
                exports.VoiceFasterController = VoiceFasterController;
            }
            window.voiceFaster = voiceFaster;
            console.log('VoiceFaster initialized:', voiceFaster);

        } catch (error) {
            console.error('VoiceFaster initialization failed:', error);
        }
    }

    let voiceFaster = null;


    createVoiceFaster();

    // add handler to for plugin to queue audio stream
    window.addEventListener("message", (event) => {
        console.log("Window received message:", event.data);
        if (event.data.type === "QUEUE_AUDIO_STREAM" && window.voiceFaster?.speakerComponent) {
            window.voiceFaster.speakerComponent.queueAudioItem(event.data.payload);
        }
    });



})();
