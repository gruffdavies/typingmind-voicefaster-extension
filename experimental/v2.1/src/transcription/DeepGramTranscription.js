import { BaseTranscriptionProvider } from "./BaseTranscriptionProvider.js";
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
            ...config
        };
        this.finalTranscript = "";
        this.isRecognizing = false;
        this.handlers = {};
    }

    requiresAudioStream() {
        console.log("🎯 DeepGram.requiresAudioStream called");
        return true;  // DeepGram needs the audio stream
    }

    async isAvailable() {
        try {
            // Just check if we have an API key
            return Boolean(secrets?.deepgramApiKey);
        } catch (e) {
            console.warn("DeepGram availability check failed:", e);
            return false;
        }
    }

    start() {
        if (this.isRecognizing) {
            this.stop();
            return;
        }

        this.finalTranscript = "";
        this.setupWebSocket();
        this.isRecognizing = true;
    }

    stop() {
        if (this.ws) {
            this.ws.close();
        }
        this.isRecognizing = false;
    }

    emit(eventName, data) {
        if (this.handlers && this.handlers[eventName]) {
            this.handlers[eventName](data);
        }
    }

    setupWebSocket() {
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
        console.log("🌐 Connecting DeepGram WebSocket:", deepgramUrl);

        this.ws = new WebSocket(deepgramUrl, ["token", secrets.deepgramApiKey]);

        this.ws.onopen = () => {
            console.log("🎯 DeepGram WebSocket opened");
            this.emit("stateChange", "listening");
        };

        this.ws.onclose = () => {
            console.log("🎯 DeepGram WebSocket closed");
            this.isRecognizing = false;
            this.emit("stateChange", "stopped");
        };

        this.ws.onerror = (error) => {
            console.error("🔴 DeepGram WebSocket error:", error);
            this.emit("error", error);
        };

        this.ws.onmessage = (event) => {
            const response = JSON.parse(event.data);
            console.log("🎯 DeepGram message received:", response);

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
        };
    }

    // Method to receive audio data from the controller
    processAudioData(audioData) {
        console.log("🎯 DeepGram.processAudioData called, ws state:", this.ws?.readyState);
        if (this.ws?.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(audioData);
                console.log("🎯 Audio data sent to DeepGram, size:", audioData.byteLength);
            } catch (error) {
                console.error("🔴 Error sending audio to DeepGram:", error);
            }
        } else {
            console.warn("⚠️ WebSocket not ready, state:", this.ws?.readyState);
        }
    }

}
