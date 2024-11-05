import { WebSpeechTranscription } from './WebSpeechTranscription.js';
import { DeepGramTranscription } from './DeepGramTranscription.js';

export class TranscriptionProviderFactory {
    // In TranscriptionProviderFactory.js

    static providerTypes = {
        deepgram: {
            id: 'deepgram',
            name: 'DeepGram',
            description: 'Cloud-based speech recognition'
        },
        webspeech: {
            id: 'webspeech',
            name: 'Web Speech',
            description: 'Browser-based speech recognition'
        }
    };

    // Add new method to get available providers
    static async getAvailableProviders() {
        const available = [];
        for (const [key, info] of Object.entries(this.providerTypes)) {
            try {
                const provider = await this._createSpecificProvider(key);
                if (provider) {
                    available.push({
                        ...info,
                        available: true
                    });
                }
            } catch (error) {
                console.warn(`Provider ${key} not available:`, error);
            }
        }
        return available;
    }
    static getCurrentProviderInfo(provider) {
        // Get provider type from instance constructor name
        const type = provider.constructor.name
            .toLowerCase()
            .replace('transcription', '');

        // Return provider info or default to webspeech if not found
        return this.providerTypes[type] || this.providerTypes.webspeech;
    }

    static getNextProviderType(currentProvider) {
        const currentType = this.getCurrentProviderInfo(currentProvider).id;
        return currentType === 'deepgram' ? 'webspeech' : 'deepgram';
    }
    static async createProvider(preferredType = 'deepgram', config = {}) {
        // Try preferred provider first
        const provider = await this._createSpecificProvider(preferredType, config);
        if (provider) return provider;

        // Fallback logic
        const fallbackType = preferredType === 'deepgram' ? 'webspeech' : 'deepgram';
        const fallbackProvider = await this._createSpecificProvider(fallbackType, config);
        if (fallbackProvider) return fallbackProvider;

        throw new Error("No transcription service available");
    }

    static async switchProvider(currentProvider, controller) {
        const newType = currentProvider instanceof DeepGramTranscription ? 'webspeech' : 'deepgram';
        const wasRecording = currentProvider.isRecognizing;

        // Stop current provider
        if (wasRecording) {
            await currentProvider.stop();
        }

        // Create and initialize new provider
        const newProvider = await this.createProvider(newType);
        controller.provider = newProvider;
        controller.provider.handlers = {
            transcriptUpdate: (data) => controller.handleTranscriptUpdate(data),
            stateChange: (state) => controller.handleStateChange(state),
            error: (error) => controller.handleError(error)
        };

        // Resume recording if it was active
        if (wasRecording) {
            await controller.startRecording();
        }

        return newProvider;
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
