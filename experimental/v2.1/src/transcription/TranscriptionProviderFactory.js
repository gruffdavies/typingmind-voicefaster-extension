import { WebSpeechTranscription } from './WebSpeechTranscription.js';
import { DeepGramTranscription } from './DeepGramTranscription.js';

class TranscriptionProviderFactory {
    static async createProvider(preferredType = null, config = {}) {
        // If preferred type is specified, try it first
        if (preferredType) {
            const provider = await this._createSpecificProvider(preferredType, config);
            if (provider) return provider;
        }

        // Try each provider in order of preference
        const providers = ['webspeech', 'deepgram'];

        for (const providerType of providers) {
            const provider = await this._createSpecificProvider(providerType, config);
            if (provider) return provider;
        }

        throw new Error('No transcription service available');
    }

    static async _createSpecificProvider(type, config) {
        try {
            let provider;

            switch (type.toLowerCase()) {
                case 'webspeech':
                    provider = new WebSpeechTranscription(config);
                    break;
                case 'deepgram':
                    provider = new DeepGramTranscription(config);
                    break;
                default:
                    throw new Error(`Unknown provider type: ${type}`);
            }

            // Check if the provider is available
            const available = await provider.isAvailable();
            if (available) {
                console.log(`🎯 Using ${type} provider`);
                return provider;
            }

            console.log(`⚠️ ${type} provider not available`);
            return null;

        } catch (error) {
            console.error(`Error creating ${type} provider:`, error);
            return null;
        }
    }
}

export { TranscriptionProviderFactory };
