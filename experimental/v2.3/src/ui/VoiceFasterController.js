class VoiceFasterController {
    constructor() {
        // Event handling through composition
        this.events = new EventEmitter();

        // Component composition
        this.synthesizedSpeechPlayer = new SynthesizedSpeechPlayer();
        this.transcriber = new SpeechTranscriber();
        this.visualizer = new SpeechAudioVisualizer();
        this.uiManager = new VoiceFasterUIManager(this);

        this.state = {
            mode: 'idle',
            transcribing: false,
            playing: false,
            error: null
        };

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Subscribe to component events
        this.transcriber.events.on('stateChange', state => {
            this.updateState({ transcribing: state === 'listening' });
        });

        this.synthesizedSpeechPlayer.events.on('stateChange', state => {
            this.updateState({ playing: state === 'playing' });
        });
    }

    // Expose event methods through delegation
    on(event, handler) {
        this.events.on(event, handler);
    }

    emit(event, data) {
        this.events.emit(event, data);
    }

    updateState(newState) {
        this.state = { ...this.state, ...newState };
        this.updateMode();
        this.events.emit('stateChange', this.state);
    }

    updateMode() {
        const { transcribing, playing } = this.state;

        // Determine new mode based on state
        if (transcribing && playing) {
            this.state.mode = 'both_active';
        } else if (transcribing) {
            this.state.mode = 'human_speaking';
        } else if (playing) {
            this.state.mode = 'synth_playing';
        } else {
            this.state.mode = 'idle';
        }

        // Update visualizer and notify subscribers
        this.visualizer.setMode(this.state.mode);
        this.events.emit('modeChange', this.state.mode);
    }
}
