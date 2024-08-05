// TypingMind Extension for handling audio streams

(function() {
  // Wait for the TypingMind app to be ready
  document.addEventListener('tm-app-ready', function() {
    try {
      console.log('VoiceFaster Extension loaded successfully');

      // Create a visible audio element and controls
      function createAudioPlayerAndControls() {
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

        audioPlayerContainer.appendChild(audioPlayer);
        audioPlayerContainer.appendChild(buttonContainer);

        document.body.appendChild(audioPlayerContainer);

        return audioPlayer;
      }

      const audioPlayer = createAudioPlayerAndControls();

      // Function to play audio from a streaming URL
      async function playAudioStream(streamInfo) {
        const { url, method, headers, body } = streamInfo;
        
        try {
          const response = await fetch(url, { method, headers, body });
          const blob = await response.blob();
          const audioUrl = URL.createObjectURL(blob);
          audioPlayer.src = audioUrl;
          audioPlayer.play();
        } catch (error) {
          console.error('Error playing audio stream:', error);
        }
      }

      // Expose the function to the global scope
      window.playAudioStream = playAudioStream;

      // Set up audio controls
      document.getElementById('tm-audio-play-pause').onclick = () => {
        audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause();
      };
      document.getElementById('tm-audio-stop').onclick = () => {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
      };

      // Listen for new messages and automatically play audio if present
      document.addEventListener('tm-new-message', function(e) {
        if (e.detail && e.detail.audioStream) {
          playAudioStream(e.detail.audioStream);
        }
      });

      console.log('VoiceFaster Extension initialized successfully');
    } catch (error) {
      console.error('VoiceFaster Extension Error:', error);
    }
  });
})();
