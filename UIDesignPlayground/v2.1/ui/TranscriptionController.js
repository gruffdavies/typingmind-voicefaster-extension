// ui/TranscriptionController.js

export class TranscriptionController {
    constructor(transcriptionProvider, visualizer) {
        this.provider = transcriptionProvider;
        this.visualizer = visualizer;
        this.isRecording = false;

        // Bind methods
        this.toggleRecording = this.toggleRecording.bind(this);
        this.handleTranscriptUpdate = this.handleTranscriptUpdate.bind(this);
        this.handleStateChange = this.handleStateChange.bind(this);
        this.handleError = this.handleError.bind(this);

        // Set up provider handlers
        this.setupProviderHandlers();
    }

    setupProviderHandlers() {
        this.provider.handlers = {
            transcriptUpdate: this.handleTranscriptUpdate,
            stateChange: this.handleStateChange,
            error: this.handleError
        };
    }

    initializeUI() {
        // Set up button handlers
        const voiceButton = document.getElementById('voice-input-button');
        voiceButton.addEventListener('click', this.toggleRecording);

        // Demo control buttons
        document.getElementById('idle-button').addEventListener('click',
            () => this.visualizer.setMode('idle'));
        document.getElementById('listening-button').addEventListener('click',
            () => this.visualizer.setMode('listening'));
        document.getElementById('speaking-button').addEventListener('click',
            () => this.visualizer.setMode('speaking'));
    }

    async toggleRecording() {
        if (this.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            await this.provider.start();
            this.isRecording = true;
            this.visualizer.setMode('listening');
            this.updateMicrophoneButton(true);
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.handleError(error);
        }
    }

    async stopRecording() {
        try {
            await this.provider.stop();
            this.isRecording = false;
            this.visualizer.setMode('idle');
            this.updateMicrophoneButton(false);
        } catch (error) {
            console.error('Failed to stop recording:', error);
            this.handleError(error);
        }
    }

    updateMicrophoneButton(isRecording) {
        const button = document.getElementById('voice-input-button');
        button.textContent = isRecording ? '⏹' : '🎤';
        button.classList.toggle('recording', isRecording);
    }

    handleTranscriptUpdate(transcriptData) {
        const textbox = document.getElementById('chat-input-textbox');
        textbox.value = transcriptData.final + (transcriptData.interim ? ' ' + transcriptData.interim : '');
    }

    handleStateChange(state) {
        console.log('Transcription state changed:', state);
        // Update UI based on state
        switch (state) {
            case 'listening':
                this.visualizer.setMode('listening');
                break;
            case 'idle':
            case 'disconnected':
                this.visualizer.setMode('idle');
                break;
            // Add other states as needed
        }
    }

    handleError(error) {
        console.error('Transcription error:', error);
        // Show error in UI
        this.visualizer.setMode('idle');
        this.isRecording = false;
        this.updateMicrophoneButton(false);
        // Could add toast notification or other error UI here
    }
}
