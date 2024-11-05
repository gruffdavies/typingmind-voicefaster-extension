class DeepGramTranscription {
    constructor(config = {}) {
        this.config = {
            model: "nova-2",
            language: "en-GB",
            smart_format: true,
            interim_results: true,
            vad_events: true,
            endpointing: 300,
            ...config
        };

        this.ws = null;
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.isRecognizing = false;
        this.handlers = {};
    }

    async isAvailable() {
        try {
            // Check internet connectivity and DeepGram service
            const response = await fetch('https://api.deepgram.com/v1/ping');
            return response.ok;
        } catch (e) {
            return false;
        }
    }

    connect() {
        console.log('🌐 Connecting DeepGram WebSocket...');
        const deepgramBaseURL = "wss://api.deepgram.com/v1/listen";
        const keywords = ["keywords=KwizIQ:2"].join('&');
        const deepgramUrl = `${deepgramBaseURL}?${new URLSearchParams(this.config)}&${keywords}`;

        this.ws = new WebSocket(deepgramUrl, ["token", secrets.deepgramApiKey]);

        this.ws.onopen = () => {
            console.log('🌐 WebSocket State: Connected');
            this.ws.send(JSON.stringify({
                type: "Authorization",
                token: secrets.deepgramApiKey
            }));
            this.emit('stateChange', 'connected');
        };

        this.ws.onclose = (event) => {
            console.log('🌐 WebSocket State: Closed', {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean
            });
            this.isRecognizing = false;
            this.emit('stateChange', 'disconnected');
        };

        this.ws.onerror = (error) => {
            console.error('🌐 WebSocket Error:', error);
            this.emit('error', error);
        };

        this.ws.onmessage = this._handleMessage.bind(this);
    }

    _handleMessage(event) {
        const response = JSON.parse(event.data);
        console.log('📝 Deepgram Response:', response);

        if (response.type === "Results") {
            const transcript = response.channel.alternatives[0].transcript;

            if (response.is_final) {
                this.finalTranscript += transcript + ' ';
                this.interimTranscript = '';
            } else {
                this.interimTranscript = transcript;
            }

            this.emit('transcriptUpdate', {
                final: this.finalTranscript,
                interim: this.interimTranscript,
                isFinal: response.is_final,
                confidence: response.channel.alternatives[0].confidence
            });
        }
    }

    start() {
        if (this.isRecognizing) {
            this.stop();
            return;
        }
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.isRecognizing = true;
        this.connect();
    }

    stop() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        this.isRecognizing = false;
    }

    emit(eventName, data) {
        if (this.handlers && this.handlers[eventName]) {
            this.handlers[eventName](data);
        }
    }
}

export { DeepGramTranscription };
