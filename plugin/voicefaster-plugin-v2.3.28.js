// this function constructs the payload for the request but doesn't call it
// instead it sends the request to the parent window
// and the VoiceFaster extension makes the call and handles the response
async function VOICEFASTER_stream_voice_audio(params, userSettings) {
  // 
  const VOICEFASTER_VERSION = '2.3.28';
  console.log(`stream_voice_audio v${VOICEFASTER_VERSION} called with:`, params);

  // extract the params
  const { text, voice_id = userSettings.defaultVoiceId || '8OkbbOnqTSHzyXrhSToC' } = params;
  const apiKey = userSettings.elevenLabsApiKey;

  if (!apiKey) {
    throw new Error("Eleven Labs API Key not provided in user settings");
  }

  const payload_body = JSON.stringify({
    "text": text,
    "model_id": "eleven_turbo_v2_5",
    "voice_settings": { "stability": 0.5, "similarity_boost": 0.5 }
  });

  const payload = {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream`,
    method: "POST",
    headers: {
      "Accept": "audio/mpeg",
      "xi-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: payload_body
  };

  console.log("Sending message to play audio...");

  // Send a message to the parent window so the Voicefaster extension
  // can process it and play the audio stream (or handle any errors).
  try {
    window.parent.postMessage({
      type: 'QUEUE_AUDIO_STREAM',
      payload: payload
    }, '*');
  } catch (error) {
    console.error("Error sending message to parent window:", error);
    throw new Error("Error sending message to parent window", { cause: error });
  }
  //
  return {
    message: "QUEUE_AUDIO_STREAM message request response sent using payload_body for Voicefaster extension to process. Check console for detailed logs if error.",
    text: text,
    voiceId: voice_id,
    version: VOICEFASTER_VERSION
  };
}
