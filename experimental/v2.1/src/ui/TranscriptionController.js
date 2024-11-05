// src/ui/TranscriptionController.js

import { TranscriptionVisualizer } from "../visualization/TranscriptionVisualizer.js";
import { TranscriptionProviderFactory } from "../transcription/TranscriptionProviderFactory.js";

export class TranscriptionController {
    constructor(transcriptionProvider) {
        this.provider = transcriptionProvider;
        this.visualizer = new TranscriptionVisualizer();
        this.isRecording = false;

        // Initialize when constructed
        this.initialize();
    }

    initialize() {
        // Initialize UI elements
        this.initializeUI();

        // Set up provider handlers
        this.setupProviderHandlers();

        // Add visualizer
        this.initializeVisualizer();
    }

    // async initializeUI() {
    //     const voiceButton = document.getElementById('voice-input-button');
    //     if (!voiceButton) {
    //         console.error('Voice input button not found');
    //         return;
    //     }
    //     voiceButton.addEventListener('click', () => this.toggleRecording());

    //     const controls = document.querySelector('.transcription-controls');
    //     if (!controls) {
    //         console.error('Controls container not found');
    //         return;
    //     }

    //     // Create provider selection container
    //     const providerContainer = document.createElement('div');
    //     providerContainer.className = 'provider-selection';

    //     // Create label
    //     const label = document.createElement('label');
    //     label.htmlFor = 'provider-select';
    //     label.textContent = 'Provider:';
    //     providerContainer.appendChild(label);

    //     // Create select element
    //     const select = document.createElement('select');
    //     select.id = 'provider-select';
    //     select.className = 'provider-select';

    //     // Populate providers
    //     await this.populateProviderSelect(select);

    //     // Add change event listener
    //     select.addEventListener('change', async (e) => {
    //         if (this.isRecording) {
    //             await this.stopRecording();
    //         }
    //         const newProvider = await TranscriptionProviderFactory.createProvider(e.target.value);
    //         if (newProvider) {
    //             this.provider = newProvider;
    //             this.setupProviderHandlers();
    //         }
    //     });

    //     providerContainer.appendChild(select);
    //     controls.insertBefore(providerContainer, controls.firstChild);
    // }

    async initializeUI() {
        const voiceButton = document.getElementById('voice-input-button');
        if (!voiceButton) {
            console.error('Voice input button not found');
            return;
        }

        const controls = document.querySelector('.transcription-controls');
        if (!controls) {
            console.error('Controls container not found');
            return;
        }

        // Create voice controls group
        const voiceControls = document.createElement('div');
        voiceControls.className = 'voice-controls';

        // Create provider selection
        const providerContainer = document.createElement('div');
        providerContainer.className = 'provider-selection';

        // Create select element
        const select = document.createElement('select');
        select.id = 'provider-select';
        select.className = 'provider-select';

        // Populate providers
        await this.populateProviderSelect(select);

        // Add change event listener
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

        providerContainer.appendChild(select);

        // Move voice button to voice controls
        voiceControls.appendChild(providerContainer);
        voiceControls.appendChild(voiceButton);

        // Add voice controls to the left side
        controls.insertBefore(voiceControls, controls.firstChild);

        // Add click handler
        voiceButton.addEventListener('click', () => this.toggleRecording());
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

    // initializeUI() {
    //     // Voice button setup
    //     const voiceButton = document.getElementById("voice-input-button");
    //     if (!voiceButton) {
    //         console.error("Voice input button not found");
    //         return;
    //     }
    //     voiceButton.addEventListener("click", () => this.toggleRecording());

    //     // Provider switch setup
    //     const controls = document.querySelector(".transcription-controls");
    //     if (!controls) {
    //         console.error("Controls container not found");
    //         return;
    //     }

    //     const switchButton = document.createElement("button");
    //     switchButton.id = "provider-switch";
    //     switchButton.className = "provider-switch";
    //     this.updateProviderSwitchUI(switchButton);

    //     switchButton.addEventListener("click", async () => {
    //         if (this.isRecording) {
    //             await this.stopRecording();
    //         }
    //         const newProvider = await TranscriptionProviderFactory.switchProvider(
    //             this.provider,
    //             this
    //         );
    //         this.updateProviderSwitchUI(switchButton);
    //     });

    //     controls.insertBefore(switchButton, controls.firstChild);
    // }

    // updateProviderSwitchUI(button) {
    //     const providerInfo = TranscriptionProviderFactory.getCurrentProviderInfo(this.provider);
    //     button.innerHTML = `<i class="bi bi-toggle-${providerInfo.toggleState}"></i>`;
    //     button.title = `Using: ${providerInfo.name}`;
    //     button.setAttribute("data-provider", providerInfo.id);
    // }

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
        const container = document.querySelector(".transcription-container");
        if (!container) {
            console.error("Transcription container not found");
            return;
        }

        container.insertBefore(this.visualizer.container, container.firstChild);
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

            // Get the audio stream for visualization
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await this.visualizer.setMode("listening", stream);
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
        const button = document.getElementById("voice-input-button");
        const status = document.getElementById("status-indicator");

        if (button) {
            button.innerHTML =
                state === "listening"
                    ? '<i class="bi bi-stop-fill"></i>'
                    : '<i class="bi bi-mic-fill"></i>';
            button.classList.toggle("active", state === "listening");
        }

        if (status) {
            status.textContent = `Status: ${state.charAt(0).toUpperCase() + state.slice(1)
                }`;
        }
    }

    handleTranscriptUpdate(data) {
        const content = document.getElementById("transcript-content");
        if (content) {
            // Clear existing content
            content.innerHTML = "";

            // Add final transcript
            if (data.final) {
                const finalSpan = document.createElement("span");
                finalSpan.textContent = data.final;
                content.appendChild(finalSpan);
            }

            // Add interim transcript
            if (data.interim) {
                const interimSpan = document.createElement("span");
                interimSpan.textContent = data.interim;
                interimSpan.className = "interim";
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

        const status = document.getElementById("status-indicator");
        if (status) {
            status.textContent = `Error: ${error.message || "Failed to transcribe"}`;
            status.style.color = "var(--state-active)";
        }
    }
}
