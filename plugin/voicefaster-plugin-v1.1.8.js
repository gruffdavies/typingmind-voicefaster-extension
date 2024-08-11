async function VOICEFASTER_stream_voice_audio(params, userSettings) {
  const VOICEFASTER_VERSION = '1.1.8';
  console.log(`stream_voice_audio v${VOICEFASTER_VERSION} called with:`, params);

  try {
    const { text, voice_id = userSettings.defaultVoiceId || 'LKzEuRvwo37aJ6JFMnxk' } = params;
    const apiKey = userSettings.elevenLabsApiKey;

    if (!apiKey) {
      throw new Error("Eleven Labs API Key not provided in user settings");
    }

    const payload = {
      url: `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream`,
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "xi-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": { "stability": 0.5, "similarity_boost": 0.5 }
      })
    };

    console.log("Sending message to play audio...");

    // Send a message to the parent window and wait for a response
    return new Promise((resolve, reject) => {
      const messageChannel = new MessageChannel();
      messageChannel.port1.onmessage = (event) => {
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve({
            message: "Audio stream request processed successfully.",
            text: text,
            voiceId: voice_id,
            version: VOICEFASTER_VERSION
          });
        }
      };

      window.parent.postMessage({
        type: 'QUEUE_AUDIO_STREAM',
        payload: payload
      }, '*', [messageChannel.port2]);
    });

  } catch (error) {
    console.error("Error in VOICEFASTER_stream_voice_audio:", error);
    throw error; // Re-throw the error to be handled by the caller
  }
}
