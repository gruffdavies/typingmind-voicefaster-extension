class VoiceFasterUIManager {
    constructor(controller) {
        this.controller = controller;
        this.container = this.createContainer();
        this.transcriptionControls = this.createTranscriptionControls();
        this.synthControls = this.createSynthControls();
        this.visualizerContainer = this.createVisualizerContainer();

        this.setupStateHandlers();
        this.makeDraggable(this.container);
    }

    createContainer() {
        const container = document.createElement('div');
        container.id = 'voicefaster-widget';
        container.className = 'voicefaster voicefaster--floating';
        return container;
    }

    createTranscriptionControls() {
        const controls = document.createElement('div');
        controls.className = 'voicefaster__controls voicefaster__controls--transcription';
        // Add mic button and provider select
        return controls;
    }

    createSynthControls() {
        const controls = document.createElement('div');
        controls.className = 'voicefaster__controls voicefaster__controls--synthesis';
        // Add playback controls
        return controls;
    }

    updateState(state) {
        this.container.dataset.mode = state.mode;
        this.container.classList.toggle('voicefaster--transcribing', state.transcribing);
        this.container.classList.toggle('voicefaster--playing', state.playing);

        // Update control visibility and state
        this.updateControlsVisibility(state);
    }
}
