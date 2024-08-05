const VOICEFASTER_EXTENSION_VERSION = '1.2.0';

(function() {
  console.log(`VoiceFaster Extension v${VOICEFASTER_EXTENSION_VERSION} loading...`);

  function createAudioPlayerAndControls() {
    // ... (keep the existing createAudioPlayerAndControls function)
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
    if (audioPlayer.paused) {
      audioPlayer.play();
      document.getElementById('tm-audio-play-pause').innerHTML = '⏸️'; // Pause emoji
    } else {
      audioPlayer.pause();
      document.getElementById('tm-audio-play-pause').innerHTML = '▶️'; // Play emoji
    }
  };
  document.getElementById('tm-audio-stop').onclick = () => {
    console.log('Stop button clicked');
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    document.getElementById('tm-audio-play-pause').innerHTML = '▶️'; // Play emoji
  };

  console.log(`VoiceFaster Extension v${VOICEFASTER_EXTENSION_VERSION} initialized successfully`);
})();

// Add this function at the end of your file
function makeDraggable(element) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  element.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}
