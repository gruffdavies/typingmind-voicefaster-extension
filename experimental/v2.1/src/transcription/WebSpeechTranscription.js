class WebSpeechTranscription {
    constructor() {
        if (!('webkitSpeechRecognition' in window)) {
            throw new Error('Web Speech API not supported');
        }

        this.recognition = new webkitSpeechRecognition();
        this.finalTranscript = '';
        this.isRecognizing = false;

        // Core configuration
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-GB'; // Can be made configurable

        this.setupHandlers();
    }

    async isAvailable() {
        // Check if the Web Speech API is available
        return 'webkitSpeechRecognition' in window ||
               'SpeechRecognition' in window;
    }

    setupHandlers() {
        this.recognition.onstart = () => {
            this.isRecognizing = true;
            this.emit('stateChange', 'listening');
        };

        this.recognition.onresult = (event) => {
            let interimTranscript = '';

            // Handle undefined results (older browsers)
            if (typeof(event.results) === 'undefined') {
                this.recognition.onend = null;
                this.recognition.stop();
                return;
            }

            // Process results
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    this.finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            // Emit update event
            this.emit('transcriptUpdate', {
                final: this.finalTranscript,
                interim: interimTranscript,
                isFinal: true
            });
        };

        this.recognition.onerror = (event) => {
            let errorType = '';
            switch (event.error) {
                case 'no-speech':
                    errorType = 'No speech detected';
                    break;
                case 'audio-capture':
                    errorType = 'No microphone detected';
                    break;
                case 'not-allowed':
                    errorType = event.timeStamp < 100 ?
                        'Microphone blocked' :
                        'Microphone permission denied';
                    break;
            }
            this.emit('error', errorType);
        };

        this.recognition.onend = () => {
            this.isRecognizing = false;
            this.emit('stateChange', 'stopped');
        };
    }

    start() {
        if (this.isRecognizing) {
            this.recognition.stop();
            return;
        }
        this.finalTranscript = '';
        this.recognition.start();
    }

    stop() {
        if (this.isRecognizing) {
            this.recognition.stop();
        }
    }

    // Simple event emitter implementation
    emit(eventName, data) {
        if (this.handlers && this.handlers[eventName]) {
            this.handlers[eventName](data);
        }
    }
}
export { WebSpeechTranscription };