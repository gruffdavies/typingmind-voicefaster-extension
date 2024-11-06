// src/ui/TranscriptionController.js

import { TranscriptionSpeechVisualizer } from "../visualization/TranscriptionSpeechVisualizer.js";
import { TranscriptionProviderFactory } from "../transcription/TranscriptionProviderFactory.js";

export class TranscriptionController {
    constructor(transcriptionProvider, options = {}) {
        this.provider = transcriptionProvider;
        this.visualizer = new TranscriptionSpeechVisualizer();
        this.isRecording = false;
        this.isMinimized = false;
        this.options = {
            targetElement: null,  // Optional element to write transcript to
            floatingPosition: { x: 'right', y: 'bottom' }, // or specific pixels
            transcribeToStagingArea: true,  // Whether to show and use own transcript area with send/clear buttons
            padding: 1.25, // in rem
            ...options
        };
        this.transcribeTarget = null;
        this.initialize();
    }

    remToPx(rem) {
        return rem * parseFloat(getComputedStyle(document.documentElement).fontSize);
    }

    pxToRem(px) {
        return px / parseFloat(getComputedStyle(document.documentElement).fontSize);
    }

    getViewportConstraints() {
        const rect = this.container.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const paddingPx = this.remToPx(this.options.padding);

        return {
            minX: paddingPx,
            maxX: viewportWidth - rect.width - paddingPx,
            minY: paddingPx,
            maxY: viewportHeight - rect.height - paddingPx,
            width: viewportWidth,
            height: viewportHeight,
            elementWidth: rect.width,
            elementHeight: rect.height,
            paddingPx
        };
    }

    constrainPosition(x, y) {
        const constraints = this.getViewportConstraints();
        return {
            x: Math.max(constraints.minX, Math.min(constraints.maxX, x)),
            y: Math.max(constraints.minY, Math.min(constraints.maxY, y))
        };
    }


    async initialize() {
        await this.initializeUI();
        this.setTranscribeTarget();
        this.setupProviderHandlers();
    }

    setTranscribeTarget() {
        if (this.options.targetElement && !this.options.transcribeToStagingArea) {
            this.transcribeTarget = this.options.targetElement;
        } else {
            this.transcribeTarget = this.stagingArea;
        }
        console.debug("Transcribe target set to:", this.transcribeTarget);
    }

    setupViewportContainment() {
        const checkBounds = () => {
            const rect = this.container.getBoundingClientRect();
            const currentLeft = parseInt(this.container.style.left) || 0;
            const currentTop = parseInt(this.container.style.top) || 0;

            const { x: newX, y: newY } = this.constrainPosition(currentLeft, currentTop);

            if (newX !== currentLeft || newY !== currentTop) {
                this.container.style.left = `${this.pxToRem(newX)}rem`;
                this.container.style.top = `${this.pxToRem(newY)}rem`;
                this.container.style.bottom = 'auto';
                this.container.style.right = 'auto';
            }
        };

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(checkBounds);
        });

        resizeObserver.observe(document.body);
        resizeObserver.observe(this.container);

        this.resizeObserver = resizeObserver;
        window.addEventListener('resize', checkBounds);
        checkBounds();

        this.cleanupViewportContainment = () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', checkBounds);
        };
    }

    // Simplified initializeUI()
    async initializeUI() {
        this.container = document.createElement('div');
        this.container.className = 'voicefaster';

        if (this.options.floatingPosition) {
            this.container.classList.add('voicefaster--floating');

            // Set initial position
            const paddingRem = 1.25; // default padding in rem
            const position = this.options.floatingPosition;

            if (position.x === 'right') {
                this.container.style.right = `${paddingRem}rem`;
                this.container.style.left = 'auto';
            } else {
                this.container.style.left = `${paddingRem}rem`;
                this.container.style.right = 'auto';
            }

            if (position.y === 'bottom') {
                this.container.style.bottom = `${paddingRem}rem`;
                this.container.style.top = 'auto';
            } else {
                this.container.style.top = `${paddingRem}rem`;
                this.container.style.bottom = 'auto';
            }

            // Setup draggable first
            this.setupDraggable();

            // Then setup viewport containment
            this.setupViewportContainment();
        }


        const header = document.createElement('div');
        header.className = 'voicefaster__header';

        const controls = document.createElement('div');
        controls.className = 'voicefaster__controls';

        const voiceButton = document.createElement('button');
        voiceButton.className = 'voicefaster__mic-button';
        voiceButton.innerHTML = '<i class="bi bi-mic-fill"></i>';
        voiceButton.addEventListener('click', () => this.toggleRecording());

        const select = document.createElement('select');
        select.className = 'voicefaster__select';
        select.id = 'voicefaster-provider-select';
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

        controls.appendChild(voiceButton);
        controls.appendChild(select);
        controls.appendChild(this.visualizer.container);
        header.appendChild(controls);

        // Create body section
        const body = document.createElement('div');
        body.className = 'voicefaster__body';

        // Add transcript area if needed
        if (this.options.transcribeToStagingArea) {
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
            body.appendChild(transcriptArea);
            this.stagingArea = transcriptContent;

        }

                // Add header and body to container
        this.container.appendChild(header);
        this.container.appendChild(body);

        document.body.appendChild(this.container);

        console.debug("initializeUI() this.stagingArea is set to:", this.stagingArea);

        // if (this.options.floatingPosition) {
        //     this.setupDraggable();
        // }
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
            e.preventDefault(); // We need this for drag functionality

            let clientX, clientY;
            if (e.type === "touchmove") {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            let newX = clientX - offsetX;
            let newY = clientY - offsetY;

            const { x: constrainedX, y: constrainedY } = this.constrainPosition(newX, newY);

            this.container.style.left = `${this.pxToRem(constrainedX)}rem`;
            this.container.style.top = `${this.pxToRem(constrainedY)}rem`;
            this.container.style.bottom = 'auto';
            this.container.style.right = 'auto';
        };

        const dragEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            this.container.classList.remove('voicefaster--dragging');
            this.container.style.transition = 'var(--transition-standard)';
        };

        // Mouse events
        this.container.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        // Touch events - note the passive option
        this.container.addEventListener('touchstart', dragStart, { passive: true });
        document.addEventListener('touchmove', drag, { passive: false }); // needs to be non-passive for preventDefault()
        document.addEventListener('touchend', dragEnd, { passive: true });

        // Cleanup function
        const cleanup = () => {
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', dragEnd);
            document.removeEventListener('touchmove', drag);
            document.removeEventListener('touchend', dragEnd);
            this.container.removeEventListener('mousedown', dragStart);
            this.container.removeEventListener('touchstart', dragStart);
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
            console.debug("🎯 StartRecording: Beginning recording process");
            console.debug("🎯 Provider type:", this.provider.constructor.name);
            console.debug("🎯 Provider requires audio:", this.provider.requiresAudioStream());

            await this.provider.start();
            console.debug("🎯 Provider.start() completed");

            this.isRecording = true;
            this.updateUI("listening");
            console.debug("🎯 UI updated to listening state");

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.debug("🎯 Got media stream:", stream.active ? "active" : "inactive");

            await this.visualizer.setMode("listening", stream);
            console.debug("🎯 Visualizer mode set to listening");

            // Set up MediaRecorder if provider requires audio stream
            if (this.provider.requiresAudioStream()) {
                console.debug("🎯 Setting up MediaRecorder for provider");
                const mediaRecorder = new MediaRecorder(stream);

                mediaRecorder.ondataavailable = (event) => {
                    // console.debug("🎯 MediaRecorder data available:", {
                    //     size: event.data.size,
                    //     type: event.data.type
                    // });

                    if (event.data.size > 0) {
                        event.data.arrayBuffer().then((buffer) => {
                            console.debug("🎯 Sending audio buffer to provider, size:", buffer.byteLength);
                            this.provider.processAudioData(buffer);
                        });
                    }
                };

                mediaRecorder.onerror = (error) => {
                    console.error("🔴 MediaRecorder error:", error);
                };

                mediaRecorder.onstart = () => {
                    console.debug("🎯 MediaRecorder started");
                };

                mediaRecorder.onstop = () => {
                    console.debug("🎯 MediaRecorder stopped");
                };

                mediaRecorder.start(250);
                this.mediaRecorder = mediaRecorder;
                console.debug("🎯 MediaRecorder setup complete");
            }

            const transcriptArea = this.container.querySelector('.transcript-area');
            if (transcriptArea) {
                transcriptArea.classList.add('active');
                console.debug("🎯 Transcript area activated");
            }
        } catch (error) {
            console.error("🔴 Failed to start recording:", error);
            this.handleError(error);
        }
    }





    async stopRecording() {
        try {
            await this.provider.stop();
            this.isRecording = false;
            this.updateUI("idle");

            if (this.mediaRecorder) {
                this.mediaRecorder.stop();
                this.mediaRecorder = null;
            }

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

    getTranscriptContentDiv() {
        return this.container.querySelector('#transcript-content');
    }


    handleTranscriptUpdate(data) {
        console.log("Transcript target:", this.transcribeTarget);
        if (!this.transcribeTarget) {
            console.error("Transcript target not set");
            return;
        }

        const content = this.transcribeTarget;
        if (content) {
            content.innerHTML = '';
            if (data.final) {
                const finalSpan = document.createElement('span');
                finalSpan.className = 'final';
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

    async sendTranscript() {
        const content = this.getTranscriptContentDiv();
        if (content && this.options.targetElement) {
            // Get the current value from the target, ensuring we handle null/undefined
            const currentValue = this.options.targetElement.value || '';

            // Add a space if there's existing content and it doesn't end with a space
            const spacer = currentValue && !currentValue.endsWith(' ') ? ' ' : '';

            // Append the new text to existing content
            this.options.targetElement.value = currentValue + spacer + content.textContent;
            // trigger it's change event
            this.options.targetElement.dispatchEvent(new Event('change'));

            // Use the modified clearTranscript which handles provider reset
            await this.clearTranscript();
        }
    }

    async clearTranscript() {
        const content = this.getTranscriptContentDiv();
        if (content) {
            console.debug("Clearing transcript content");
            content.innerHTML = '';
            // Stop and restart the provider if we're recording
            if (this.isRecording) {
                await this.stopRecording();
            }
        } else { console.error("Transcript content area not found"); }
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
        if (this.cleanupViewportContainment) {
            this.cleanupViewportContainment();
        }
        if (this.cleanupDraggable) {
            this.cleanupDraggable();
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        this.container.remove();
    }



}
