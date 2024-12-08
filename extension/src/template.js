(() => {

    const VOICEFASTER_VERSION = '{{voicefaster-version}}';

    {{voicefaster-classes.js}}


    /* Bootstrapping Code */
    let voicefaster_css = `{{voicefaster.css}}`;

    function injectStyles() {
        const styleElement = document.createElement('style')
        styleElement.setAttribute('data-voicefaster-version', VOICEFASTER_VERSION)
        styleElement.textContent = voicefaster_css
        document.head.appendChild(styleElement)
        console.log('VoiceFaster styles injected')
    }

    function createVoiceFaster() {
        injectStyles();
        try {
            const targetElementId = 'chat-input-textbox';
            voiceFaster = new VoiceFasterController({
                targetElementId,
                transcribeToStagingArea: true
            });

            // Export for both module and non-module environments
            if (typeof exports !== 'undefined') {
                exports.VoiceFasterController = VoiceFasterController;
            }
            window.voiceFaster = voiceFaster;
            console.log('VoiceFaster initialized:', voiceFaster);

        } catch (error) {
            console.error('VoiceFaster initialization failed:', error);
        }
    }

    let voiceFaster = null;


    createVoiceFaster();

    // add handler to for plugin to queue audio stream
    window.addEventListener("message", (event) => {
        console.log("Window received message:", event.data);
        if (event.data.type === "QUEUE_AUDIO_STREAM" && window.voiceFaster?.speakerComponent) {
            window.voiceFaster.speakerComponent.queueAudioItem(event.data.payload);
        }
    });



})();
