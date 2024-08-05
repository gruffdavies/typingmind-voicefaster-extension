// TypingMind Extension for handling audio streams

(function() {
  // Create a hidden audio element
  const audioPlayer = document.createElement('audio');
  audioPlayer.style.display = 'none';
  document.body.appendChild(audioPlayer);

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

  // Add audio controls to the UI
  function addAudioControls() {
    const sidebarFooter = document.querySelector('[data-element-id="sidebar-footer"]');
    if (sidebarFooter) {
      const controlsDiv = document.createElement('div');
      controlsDiv.innerHTML = `
        <button id="tm-audio-play-pause">Play/Pause</button>
        <button id="tm-audio-stop">Stop</button>
      `;
      sidebarFooter.appendChild(controlsDiv);

      document.getElementById('tm-audio-play-pause').onclick = () => {
        audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause();
      };
      document.getElementById('tm-audio-stop').onclick = () => {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
      };
    }
  }

  // Call this function when the extension loads
  addAudioControls();

  // Listen for new messages and automatically play audio if present
  document.addEventListener('tm-new-message', function(e) {
    if (e.detail && e.detail.audioStream) {
      playAudioStream(e.detail.audioStream);
    }
  });
})();
