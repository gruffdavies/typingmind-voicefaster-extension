// TypingMind Extension for handling audio streams
const VOICEFASTER_EXTENSION_VERSION = '1.2.3.1';

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
    audioPlayerContainer.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 1000; background-color: rgba(30, 41, 59, 0.8); padding: 5px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); cursor: move;';

    const audioPlayer = document.createElement('audio');
    audioPlayer.id = 'tm-audio-player';
    audioPlayer.style.display = 'none';  // Hide the default audio controls

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; align-items: center;';

    const playPauseButton = document.createElement('button');
    playPauseButton.id = 'tm-audio-play-pause';
    playPauseButton.innerHTML = '▶️';  // Play emoji
    playPauseButton.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; margin-right: 5px;';

    const stopButton = document.createElement('button');
    stopButton.id = 'tm-audio-stop';
    stopButton.innerHTML = '⏹️';  // Stop emoji
    stopButton.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; margin-right: 5px;';

    const dragHandle = document.createElement('span');
    dragHandle.innerHTML = '↔️';  // Move emoji
    dragHandle.style.cssText = 'font-size: 18px; cursor: move;';

    // Version display
    const versionDisplay = document.createElement('span');
    versionDisplay.textContent = `v${VOICEFASTER_EXTENSION_VERSION}`;
    versionDisplay.style.cssText = 'font-size: 10px; color: #888; margin-left: 5px;';

    buttonContainer.appendChild(playPauseButton);
    buttonContainer.appendChild(stopButton);
    buttonContainer.appendChild(dragHandle);
    buttonContainer.appendChild(versionDisplay);

    audioPlayerContainer.appendChild(audioPlayer);
    audioPlayerContainer.appendChild(buttonContainer);

    document.body.appendChild(audioPlayerContainer);

    makeDraggable(audioPlayerContainer);

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
        document.getElementById('tm-audio-play-pause').innerHTML = '⏸️'; // Pause emoji
      }).catch(error => {
        console.error('Error starting audio playback:', error);
      });
    } catch (error) {
      console.error('Error in playAudioStream:', error);
    }
  }

    // Add this back into the extension code
  window.addEventListener('message', function(event) {
    if (event.data.type === 'PLAY_AUDIO_STREAM') {
      console.log('Received PLAY_AUDIO_STREAM message');
      playAudioStream(event.data.payload);
    }
  }, false);

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

    // Update background div size
    var backgroundDiv = document.getElementById('voicefaster-background');
    backgroundDiv.style.height = (element.offsetTop + element.offsetHeight) + "px";
    backgroundDiv.style.width = (element.offsetLeft + element.offsetWidth) + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }

}
