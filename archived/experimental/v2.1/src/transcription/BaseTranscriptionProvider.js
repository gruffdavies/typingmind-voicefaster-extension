export class BaseTranscriptionProvider {
    requiresAudioStream() {
        return false;
    }

    processAudioData(audioData) {
        // Default implementation does nothing
    }
}
