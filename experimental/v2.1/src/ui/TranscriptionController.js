// src/ui/TranscriptionController.js

import { TranscriptionVisualizer } from "../visualization/TranscriptionVisualizer.js";
import { TranscriptionProviderFactory } from "../transcription/TranscriptionProviderFactory.js";

export class TranscriptionController {
    constructor(transcriptionProvider, options = {}) {
        this.provider = transcriptionProvider;
        this.visualizer = new TranscriptionVisualizer();
        this.isRecording = false;
        this.isMinimized = false;
        this.options = {
            targetElement: null,  // Optional element to write transcript to
            floatingPosition: { x: 'right', y: 'bottom' }, // or specific pixels
            showTranscriptArea: true,  // Whether to show own transcript area
            ...options
        };
        this.initialize();
    }

    initialize() {
        this.initializeUI();
        this.setupProviderHandlers();
        this.initializeVisualizer();
    }

    async initializeUI() {
        // Create main container with BEM class naming
        this.container = document.createElement('div');
        this.container.className = 'voicefaster';

        // Set position via class instead of inline styles
        if (this.options.floatingPosition) {
            this.container.classList.add('voicefaster--floating');
            this.container.dataset.posX = this.options.floatingPosition.x;
            this.container.dataset.posY = this.options.floatingPosition.y;
        }

        // Create header
        const header = document.createElement('div');
        header.className = 'voicefaster__header';

        // Create controls
        const controls = document.createElement('div');
        controls.className = 'voicefaster__controls';

        // Create mic button
        const voiceButton = document.createElement('button');
        voiceButton.className = 'voicefaster__mic-button';
        voiceButton.innerHTML = '<i class="bi bi-mic-fill"></i>';
        voiceButton.addEventListener('click', () => this.toggleRecording());

        // Create provider selection
        const providerBlock = document.createElement('div');
        providerBlock.className = 'voicefaster__provider';

        const select = document.createElement('select');
        select.className = 'voicefaster__select';
        await this.populateProviderSelect(select);

        select.addEventListener('change', async (e) => {
            if (this.isRecording) {
                await this.stopRecording();
            }
            const newProvider = await TranscriptionProviderFactory.createProvider(e.target.value);
            if (newProvider) {
                this.provider = newProvider;
                this.setupProviderHandlers();
            }
        });

        providerBlock.appendChild(select);
        controls.appendChild(voiceButton);
        controls.appendChild(providerBlock);
        header.appendChild(controls);

        this.container.appendChild(header);

        // Create transcript area if needed
        if (this.options.showTranscriptArea && !this.options.targetElement) {
            const transcriptArea = document.createElement('div');
            transcriptArea.className = 'transcript-area';

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'content-wrapper';

            const transcriptContent = document.createElement('div');
            transcriptContent.id = 'transcript-content';
            transcriptContent.className = 'transcript-content';

            const transcriptControls = document.createElement('div');
            transcriptControls.className = 'transcript-controls';

            const sendButton = document.createElement('button');
            sendButton.innerHTML = '<i class="bi bi-arrow-right-circle"></i> Send';
            sendButton.onclick = () => this.sendTranscript();

            const clearButton = document.createElement('button');
            clearButton.innerHTML = '<i class="bi bi-trash"></i> Clear';
            clearButton.onclick = () => this.clearTranscript();

            transcriptControls.appendChild(sendButton);
            transcriptControls.appendChild(clearButton);

            contentWrapper.appendChild(transcriptContent);
            contentWrapper.appendChild(transcriptControls);
            transcriptArea.appendChild(contentWrapper);
            this.container.appendChild(transcriptArea);
        }

        document.body.appendChild(this.container);

        if (this.options.floatingPosition) {
            this.setupDraggable();
        }
    }

    async populateProviderSelect(select) {
        const availableProviders = await TranscriptionProviderFactory.getAvailableProviders();
        const currentProviderId = TranscriptionProviderFactory.getCurrentProviderInfo(this.provider).id;

        select.innerHTML = availableProviders
            .map(provider => `
                <option
                    value="${provider.id}"
                    ${provider.id === currentProviderId ? 'selected' : ''}
                    ${!provider.available ? 'disabled' : ''}
                >
                    ${provider.name}${!provider.available ? ' (Unavailable)' : ''}
                </option>
            `)
            .join('');
    }

    setupProviderHandlers() {
        if (!this.provider) {
            console.error("No provider available");
            return;
        }

        this.provider.handlers = {
            transcriptUpdate: (data) => this.handleTranscriptUpdate(data),
            stateChange: (state) => this.handleStateChange(state),
            error: (error) => this.handleError(error),
        };
    }

    initializeVisualizer() {
        // Add visualizer to the header section
        const header = this.container.querySelector('.player-header');
        if (header) {
            this.visualizer.container.className = 'visualization';
            this.visualizer.canvas.className = 'visualization__canvas';
            header.insertBefore(this.visualizer.container, header.firstChild);
        }
    }

    setupDraggable() {
        let isDragging = false;
        let startX, startY;
        let offsetX, offsetY;

        const dragStart = (e) => {
            // Check for the new class name
            const header = e.target.closest('.voicefaster__header');
            if (!header) return;

            isDragging = true;
            this.container.classList.add('voicefaster--dragging');

            // Calculate the offset from the mouse position to the container's top-left corner
            const rect = this.container.getBoundingClientRect();
            if (e.type === "touchstart") {
                offsetX = e.touches[0].clientX - rect.left;
                offsetY = e.touches[0].clientY - rect.top;
            } else {
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
            }
        };

        const drag = (e) => {
            if (!isDragging) return;
            e.preventDefault();

            // Get current cursor/touch position
            let clientX, clientY;
            if (e.type === "touchmove") {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            // Calculate new position
            let newX = clientX - offsetX;
            let newY = clientY - offsetY;

            // Get viewport and element dimensions
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const rect = this.container.getBoundingClientRect();

            // Constrain to viewport bounds with padding
            const padding = 10;
            newX = Math.max(padding, Math.min(viewportWidth - rect.width - padding, newX));
            newY = Math.max(padding, Math.min(viewportHeight - rect.height - padding, newY));

            // Apply new position
            this.container.style.left = `${newX}px`;
            this.container.style.top = `${newY}px`;

            // Remove any bottom/right positioning that might interfere
            this.container.style.bottom = 'auto';
            this.container.style.right = 'auto';
        };

        const dragEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            this.container.classList.remove('voicefaster--dragging');

            // Re-enable transitions
            this.container.style.transition = 'var(--transition-standard)';
        };

        // Mouse events
        this.container.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        // Touch events
        this.container.addEventListener('touchstart', dragStart);
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', dragEnd);

        // Cleanup function
        const cleanup = () => {
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', dragEnd);
            document.removeEventListener('touchmove', drag);
            document.removeEventListener('touchend', dragEnd);
        };

        this.cleanupDraggable = cleanup;
    }



    async toggleRecording() {
        try {
            if (this.isRecording) {
                await this.stopRecording();
            } else {
                await this.startRecording();
            }
        } catch (error) {
            console.error("Error toggling recording:", error);
            this.handleError(error);
        }
    }

    async startRecording() {
        try {
            await this.provider.start();
            this.isRecording = true;
            this.updateUI("listening");

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await this.visualizer.setMode("listening", stream);

            // Show transcript area if we have one
            const transcriptArea = this.container.querySelector('.transcript-area');
            if (transcriptArea) {
                transcriptArea.classList.add('active');
            }
        } catch (error) {
            console.error("Failed to start recording:", error);
            this.handleError(error);
        }
    }

    async stopRecording() {
        try {
            await this.provider.stop();
            this.isRecording = false;
            this.updateUI("idle");
            await this.visualizer.setMode("idle");
        } catch (error) {
            console.error("Failed to stop recording:", error);
            this.handleError(error);
        }
    }

    updateUI(state) {
        // Update states via classes instead of inline styles
        this.container.classList.toggle('voicefaster--listening', state === "listening");
        this.container.classList.toggle('voicefaster--idle', state === "idle");

        const button = this.container.querySelector('.voicefaster__mic-button');
        if (button) {
            button.innerHTML = state === "listening"
                ? '<i class="bi bi-stop-fill"></i>'
                : '<i class="bi bi-mic-fill"></i>';
        }
    }


    handleTranscriptUpdate(data) {
        if (this.options.targetElement) {
            // Write to supplied element
            this.options.targetElement.value = data.final +
                (data.interim ? ' ' + data.interim : '');
        } else {
            // Write to our transcript area
            const content = this.container.querySelector('#transcript-content');
            if (content) {
                content.innerHTML = '';
                if (data.final) {
                    const finalSpan = document.createElement('span');
                    finalSpan.textContent = data.final;
                    content.appendChild(finalSpan);
                }
                if (data.interim) {
                    const interimSpan = document.createElement('span');
                    interimSpan.className = 'interim';
                    interimSpan.textContent = data.interim;
                    content.appendChild(interimSpan);
                }
            }
        }
    }

    handleStateChange(state) {
        this.updateUI(state);
    }

    handleError(error) {
        console.error("Transcription error:", error);
        this.updateUI("idle");
        this.isRecording = false;

        const errorMessage = document.createElement('div');
        errorMessage.className = 'voicefaster__error';
        errorMessage.textContent = `Error: ${error.message || "Failed to transcribe"}`;

        const header = this.container.querySelector('.voicefaster__header');
        if (header) {
            const existingError = header.querySelector('.voicefaster__error');
            if (existingError) {
                existingError.replaceWith(errorMessage);
            } else {
                header.appendChild(errorMessage);
            }
        }
    }

    sendTranscript() {
        const content = this.container.querySelector('#transcript-content');
        if (content && this.options.targetElement) {
            this.options.targetElement.value = content.textContent;
            this.clearTranscript();
        }
    }

    clearTranscript() {
        const content = this.container.querySelector('#transcript-content');
        if (content) {
            content.innerHTML = '';
        }
    }

    minimize() {
        this.isMinimized = true;
        this.container.classList.add('voicefaster--minimized');
    }

    maximize() {
        this.isMinimized = false;
        this.container.classList.remove('voicefaster--minimized');
    }

    toggleMinimize() {
        if (this.isMinimized) {
            this.maximize();
        } else {
            this.minimize();
        }
    }

    cleanup() {
        this.visualizer.cleanup();
        if (this.provider) {
            this.provider.stop();
        }
        this.container.remove();
    }
}
