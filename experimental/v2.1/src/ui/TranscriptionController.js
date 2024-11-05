// src/ui/TranscriptionController.js

import { TranscriptionVisualizer } from '../visualization/TranscriptionVisualizer.js';

export class TranscriptionController {
    constructor(transcriptionProvider) {
        this.provider = transcriptionProvider;
        this.visualizer = new TranscriptionVisualizer();
        this.isRecording = false;

        // Initialize when constructed
        this.initialize();
    }

    initialize() {
        // Set up button handler
        const voiceButton = document.getElementById('voice-input-button');
        if (voiceButton) {
            voiceButton.addEventListener('click', () => this.toggleRecording());
        }

        // Set up provider handlers
        this.provider.handlers = {
            transcriptUpdate: (data) => this.handleTranscriptUpdate(data),
            stateChange: (state) => this.handleStateChange(state),
            error: (error) => this.handleError(error)
        };

        // Add visualizer to the page
        const container = document.querySelector('.transcription-container');
        if (container) {
            container.insertBefore(this.visualizer.canvas, container.firstChild);
        }
    }

    async toggleRecording() {
        try {
            if (this.isRecording) {
                await this.stopRecording();
            } else {
                await this.startRecording();
            }
        } catch (error) {
            console.error('Error toggling recording:', error);
            this.handleError(error);
        }
    }

    async startRecording() {
        try {
            await this.provider.start();
            this.isRecording = true;
            this.updateUI('listening');

            // Get the audio stream for visualization
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await this.visualizer.setMode('listening', stream);
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.handleError(error);
        }
    }

    async stopRecording() {
        try {
            await this.provider.stop();
            this.isRecording = false;
            this.updateUI('idle');
            await this.visualizer.setMode('idle');
        } catch (error) {
            console.error('Failed to stop recording:', error);
            this.handleError(error);
        }
    }

    updateUI(state) {
        const button = document.getElementById('voice-input-button');
        const status = document.getElementById('status-indicator');

        if (button) {
            button.innerHTML = state === 'listening' ?
                '<i class="bi bi-stop-fill"></i>' :
                '<i class="bi bi-mic-fill"></i>';
            button.classList.toggle('active', state === 'listening');
        }

        if (status) {
            status.textContent = `Status: ${state.charAt(0).toUpperCase() + state.slice(1)}`;
        }
    }

    handleTranscriptUpdate(data) {
        const content = document.getElementById('transcript-content');
        if (content) {
            // Clear existing content
            content.innerHTML = '';

            // Add final transcript
            if (data.final) {
                const finalSpan = document.createElement('span');
                finalSpan.textContent = data.final;
                content.appendChild(finalSpan);
            }

            // Add interim transcript
            if (data.interim) {
                const interimSpan = document.createElement('span');
                interimSpan.textContent = data.interim;
                interimSpan.className = 'interim';
                content.appendChild(interimSpan);
            }
        }
    }

    handleStateChange(state) {
        this.updateUI(state);
    }

    handleError(error) {
        console.error('Transcription error:', error);
        this.updateUI('idle');
        this.isRecording = false;

        const status = document.getElementById('status-indicator');
        if (status) {
            status.textContent = `Error: ${error.message || 'Failed to transcribe'}`;
            status.style.color = 'var(--state-active)';
        }
    }
}
