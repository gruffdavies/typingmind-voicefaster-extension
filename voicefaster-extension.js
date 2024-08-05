// TypingMind Extension for handling audio streams
const VOICEFASTER_EXTENSION_VERSION = '1.1.1';

(function() {
  console.log(`VoiceFaster Extension v${VOICEFASTER_EXTENSION_VERSION} loading...`);

  // Add metadata to the document
  const metaVersion = document.createElement('meta');
  metaVersion.name = 'voicefaster-extension-version';
  metaVersion.content = VOICEFASTER_EXTENSION_VERSION;
  document.head.appendChild(metaVersion);

  // Create a visible audio element and controls
  function createAudioPlayerAndControls() {
    console.log('Creating audio player and controls');
    const audioPlayerContainer = document.createElement('div');
    audioPlayerContainer.id = 'tm-audio-player-container';
    audioPlayerContainer.style.cssText = 'position: fixed; bottom: 70px; right: 20px; z-index: 1000; background-color: rgba(30, 41, 59, 0.8); padding: 10px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);';

    const audioPlayer = document.createElement('audio');
    audioPlayer.id = 'tm-audio-player';
    audioPlayer.controls = true;
    audioPlayer.style.cssText = 'width: 250px; max-width: 100%; margin-bottom: 10px;';

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; justify-content: space-between;';

    const playPauseButton = document.createElement('button');
    playPauseButton.id = 'tm-audio-play-pause';
    playPauseButton.textContent = 'Play/Pause';
    playPauseButton.style.cssText = 'padding: 5px 10px; background-color: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; flex: 1; margin-right: 5px;';

    const stopButton = document.createElement('button');
    stopButton.id = 'tm-audio-stop';
    stopButton.textContent = 'Stop';
    stopButton.style.cssText = 'padding: 5px 10px; background-color: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; flex: 1; margin-left: 5px;';

    buttonContainer.appendChild(playPauseButton);
    buttonContainer.appendChild(stopButton);

    // Add version display
    const versionDisplay = document.createElement('div');
    versionDisplay.textContent = `v${VOICEFASTER_EXTENSION_VERSION}`;
    versionDisplay.style.cssText = 'font-size: 8px; color: #888; text-align: right; margin-top: 5px;';

    audioPlayerContainer.appendChild(audioPlayer);
    audioPlayerContainer.appendChild(buttonContainer);
    audioPlayerContainer.appendChild(versionDisplay);

    document.body.appendChild(audioPlayerContainer);

    console.log('Audio player and controls created');
    return audioPlayer;
  }

  const audioPlayer = createAudioPlayerAndControls();

  // Function to play audio from a streaming URL
  async function playAudioStream(streamInfo) {
    console.log('playAudioStream called with:', JSON.stringify(streamInfo));
    const { url, method, headers, body } = streamInfo;
    
    try {
      console.log('Fetching audio stream...');
      const response = await fetch(url, { method, headers, body });
      console.log('Fetch response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      console.log('Audio blob created');
      const audioUrl = URL.createObjectURL(blob);
      console.log('Audio URL created:', audioUrl);
      
      audioPlayer.src = audioUrl;
      console.log('Audio player source set');
      
      audioPlayer.play().then(() => {
        console.log('Audio playback started');
      }).catch(error => {
        console.error('Error starting audio playback:', error);
      });
    } catch (error) {
      console.error('Error in playAudioStream:', error);
    }
  }

  // Expose the function to the global scope
  window.playAudioStream = playAudioStream;

  // Set up audio controls
  document.getElementById('tm-audio-play-pause').onclick = () => {
    console.log('Play/Pause button clicked');
    audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause();
  };
  document.getElementById('tm-audio-stop').onclick = () => {
    console.log('Stop button clicked');
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  };

  console.log(`VoiceFaster Extension v${VOICEFASTER_EXTENSION_VERSION} initialized successfully`);
})();
