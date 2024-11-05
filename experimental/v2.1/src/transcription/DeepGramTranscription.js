import { BaseTranscriptionProvider } from "./BaseTranscriptionProvider.js";

// Connection states enum
const ConnectionState = {
    CLOSED: 'closed',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    FAILED: 'failed'
};

export class DeepGramTranscription extends BaseTranscriptionProvider {
    constructor(config = {}) {
        super();
        this.config = {
            model: "nova-2",
            language: "en-GB",
            smart_format: true,
            interim_results: true,
            vad_events: true,
            endpointing: 300,
            maxRetries: 3,
            connectionTimeout: 5000,
            maxBufferSize: 50,
            ...config
        };
        this.finalTranscript = "";
        this.isRecognizing = false;
        this.handlers = {};
        this.connectionState = ConnectionState.CLOSED;
        this.audioBuffer = [];
        this.connectionAttempt = 0;
        this.connectionTimeout = null;
        this.reconnectTimeout = null;
    }

    requiresAudioStream() {
        console.debug("🎯 DeepGram.requiresAudioStream called");
        return true;
    }

    async isAvailable() {
        try {
            return Boolean(secrets?.deepgramApiKey);
        } catch (e) {
            console.warn("⚠️ DeepGram availability check failed:", e);
            return false;
        }
    }

    start() {
        if (this.isRecognizing) {
            this.stop();
            return;
        }

        this.finalTranscript = "";
        this.connectionAttempt = 0;
        this.setupWebSocket();
        this.isRecognizing = true;
    }

    stop() {
        this.isRecognizing = false;
        this.clearTimeouts();

        if (this.ws) {
            try {
                this.ws.close();
            } catch (error) {
                console.warn("⚠️ Error closing WebSocket:", error);
            }
            this.ws = null;
        }

        this.connectionState = ConnectionState.CLOSED;
        this.audioBuffer = [];
    }

    emit(eventName, data) {
        if (this.handlers && this.handlers[eventName]) {
            this.handlers[eventName](data);
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

        console.debug(`🌐 Connecting DeepGram WebSocket (attempt ${this.connectionAttempt}/${this.config.maxRetries}):`, deepgramUrl);

        try {
            this.ws = new WebSocket(deepgramUrl, ["token", secrets.deepgramApiKey]);

            // Set connection timeout
            this.connectionTimeout = setTimeout(() => {
                if (this.ws?.readyState !== WebSocket.OPEN) {
                    console.warn(`⚠️ WebSocket connection timeout (attempt ${this.connectionAttempt})`);
                    this.handleConnectionFailure();
                }
            }, this.config.connectionTimeout);

            this.ws.onopen = () => {
                console.debug("🎯 DeepGram WebSocket opened");
                this.clearTimeouts();
                this.connectionState = ConnectionState.CONNECTED;
                this.connectionAttempt = 0;
                this.emit("stateChange", "listening");
                this.processBufferedAudio();
            };

            this.ws.onclose = () => {
                console.debug("🎯 DeepGram WebSocket closed");
                this.connectionState = ConnectionState.CLOSED;
                this.handleConnectionFailure();
            };

            this.ws.onerror = (error) => {
                console.error("🔴 DeepGram WebSocket error:", error);
                this.emit("error", error);
                this.handleConnectionFailure();
            };

            this.ws.onmessage = (event) => {
                try {
                    const response = JSON.parse(event.data);
                    console.debug("🎯 DeepGram message received:", response);

                    if (response.type === "Results") {
                        const transcript = response.channel.alternatives[0].transcript;
                        if (response.is_final) {
                            this.finalTranscript += transcript + " ";
                        }

                        this.emit("transcriptUpdate", {
                            final: this.finalTranscript,
                            interim: response.is_final ? "" : transcript,
                            isFinal: response.is_final
                        });
                    }
                } catch (error) {
                    console.error("🔴 Error processing DeepGram message:", error);
                }
            };

        } catch (error) {
            console.error("🔴 Error creating WebSocket:", error);
            this.handleConnectionFailure();
        }
    }

    handleConnectionFailure() {
        if (!this.isRecognizing) return;

        if (this.connectionAttempt < this.config.maxRetries) {
            this.connectionState = ConnectionState.RECONNECTING;
            console.debug(`🔄 Scheduling reconnection attempt ${this.connectionAttempt + 1}/${this.config.maxRetries}`);

            // Exponential backoff with max of 5 seconds
            const backoffTime = Math.min(1000 * Math.pow(2, this.connectionAttempt - 1), 5000);

            this.reconnectTimeout = setTimeout(() => {
                if (this.isRecognizing) {
                    this.setupWebSocket();
                }
            }, backoffTime);

            this.emit("error", {
                message: `Connection attempt ${this.connectionAttempt} failed, retrying in ${backoffTime/1000} seconds...`
            });
        } else {
            this.connectionState = ConnectionState.FAILED;
            this.isRecognizing = false;
            this.emit("error", {
                message: "Failed to establish connection after maximum attempts"
            });
            this.emit("stateChange", "stopped");
        }
    }

    processBufferedAudio() {
        if (this.connectionState !== ConnectionState.CONNECTED) return;

        console.debug(`🎯 Processing buffered audio: ${this.audioBuffer.length} chunks`);
        while (this.audioBuffer.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
            const audioData = this.audioBuffer.shift();
            try {
                this.ws.send(audioData);
                console.debug("🎯 Buffered audio chunk sent, size:", audioData.byteLength);
            } catch (error) {
                console.error("🔴 Error sending buffered audio:", error);
                this.audioBuffer.unshift(audioData); // Put it back at the start
                break;
            }
        }
    }

    processAudioData(audioData) {
        console.debug(`🎯 DeepGram.processAudioData called, connection state: ${this.connectionState}`);

        if (this.connectionState === ConnectionState.CONNECTED && this.ws?.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(audioData);
                console.debug("🎯 Audio data sent to DeepGram, size:", audioData.byteLength);
            } catch (error) {
                console.error("🔴 Error sending audio to DeepGram:", error);
                // Only buffer on temporary errors if we're still in a valid state
                if (this.connectionState === ConnectionState.CONNECTED) {
                    this.bufferAudioData(audioData);
                }
            }
        } else if (
            // Only buffer if we're in a state where connection can be restored
            this.connectionState === ConnectionState.CONNECTING ||
            this.connectionState === ConnectionState.RECONNECTING
        ) {
            console.debug(`🎯 WebSocket connecting/reconnecting, buffering audio data. State: ${this.connectionState}`);
            this.bufferAudioData(audioData);
        } else {
            // Log and discard audio data for terminal states
            console.warn(`⚠️ WebSocket in terminal state (${this.connectionState}), discarding audio data`);
        }
    }


    bufferAudioData(audioData) {
        if (this.audioBuffer.length < this.config.maxBufferSize) {
            this.audioBuffer.push(audioData);
            console.debug("🎯 Audio data buffered, buffer size:", this.audioBuffer.length);
        } else {
            console.warn("⚠️ Audio buffer full, dropping oldest chunk");
            this.audioBuffer.shift(); // Remove oldest
            this.audioBuffer.push(audioData); // Add new
        }
    }
}
