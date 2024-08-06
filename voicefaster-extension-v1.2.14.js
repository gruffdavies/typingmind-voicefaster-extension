// TypingMind Extension for handling audio streams
const VOICEFASTER_EXTENSION_VERSION = '1.2.14';

(function () {
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
    audioPlayerContainer.style.cssText = 'position: fixed; top: 20px; left: calc(100% - 140px); z-index: 1000; background-color: rgba(30, 41, 59, 0.8); padding: 5px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); cursor: move;';
    audioPlayerContainer.style.cssText += 'user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none;';

    const audioPlayer = document.createElement('audio');
    audioPlayer.id = 'tm-audio-player';
    audioPlayer.style.display = 'none';  // Hide the default audio controls
    const buttonContainer = document.createElement('div')
    buttonContainer.style.cssText = 'display: flex; align-items: center;'

    // Title element
    const title = document.createElement('span');
    title.textContent = `Rocket's Voice Player`;
    title.style.cssText = 'font-size: 14px; color: #fff; font-weight: bold; text-align: center; width: 100%; display: block; margin-bottom: 5px;';

    const playButton = document.createElement('button')
    playButton.id = 'tm-audio-play'
    playButton.innerHTML = '▶️';  // Play emoji
    playButton.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; margin-right: 5px;'

    const pauseButton = document.createElement('button')
    pauseButton.id = 'tm-audio-pause'
    pauseButton.innerHTML = '⏸️';  // Pause emoji
    pauseButton.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; margin-right: 5px; display: none;'

    const stopButton = document.createElement('button')
    stopButton.id = 'tm-audio-stop'
    stopButton.innerHTML = '⏹️';  // Stop emoji
    stopButton.style.cssText = 'background: none; border: none; font-size: 24px; cursor: pointer; margin-right: 5px;'

    const dragHandle = document.createElement('span')
    dragHandle.innerHTML = '↔️';  // Move emoji
    dragHandle.style.cssText = 'font-size: 18px; cursor: move;'

    // Version display
    const versionDisplay = document.createElement('span')
    versionDisplay.textContent = `v${VOICEFASTER_EXTENSION_VERSION}`
    versionDisplay.style.cssText = 'font-size: 10px; color: #888; margin-left: 5px;'

    buttonContainer.appendChild(pauseButton)
    buttonContainer.appendChild(stopButton)
    buttonContainer.appendChild(dragHandle)
    buttonContainer.appendChild(versionDisplay)

    audioPlayerContainer.appendChild(title); // Add the title here    buttonContainer.appendChild(playButton)
    audioPlayerContainer.appendChild(audioPlayer)
    audioPlayerContainer.appendChild(buttonContainer)

    document.body.appendChild(audioPlayerContainer)

    makeDraggable(audioPlayerContainer)

    console.log('Audio player and controls created')
    return { audioPlayer, playButton, pauseButton, stopButton }
  }

  function updateUIState(isPlaying) {
    const playButton = document.getElementById('tm-audio-play');
    const pauseButton = document.getElementById('tm-audio-pause');
    playButton.style.display = isPlaying ? 'none' : 'inline-block';
    pauseButton.style.display = isPlaying ? 'inline-block' : 'none';
  }

  // const audioPlayer = createAudioPlayerAndControls();
  const { audioPlayer, playButton, pauseButton, stopButton } = createAudioPlayerAndControls();

  audioPlayer.addEventListener('play', () => updateUIState(true));
  audioPlayer.addEventListener('pause', () => updateUIState(false));
  audioPlayer.addEventListener('ended', () => updateUIState(false));

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
  window.addEventListener('message', function (event) {
    if (event.data.type === 'PLAY_AUDIO_STREAM') {
      console.log('Received PLAY_AUDIO_STREAM message');
      playAudioStream(event.data.payload);
    }
  }, false);

  // Expose the function to the global scope
  window.playAudioStream = playAudioStream;

  // Set up audio controls
  document.getElementById('tm-audio-play').onclick = () => {
    console.log('Play button clicked');
    audioPlayer.play();
  };

  document.getElementById('tm-audio-pause').onclick = () => {
    console.log('Pause button clicked');
    audioPlayer.pause();
  };

  document.getElementById('tm-audio-stop').onclick = () => {
    console.log('Stop button clicked');
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  };

  console.log(`VoiceFaster Extension v${VOICEFASTER_EXTENSION_VERSION} initialized successfully`);
})();

function makeDraggable(element) {
  let isDragging = false;
  let startX, startY, initialX, initialY;

  element.addEventListener('mousedown', startDragging);
  element.addEventListener('touchstart', startDragging, { passive: true });
  document.addEventListener('mousemove', drag);
  document.addEventListener('touchmove', drag);
  document.addEventListener('mouseup', stopDragging);
  document.addEventListener('touchend', stopDragging);

  function startDragging(e) {
    e.preventDefault(); // Prevent text selection or dragging of other elements
    isDragging = true;
    startX = e.clientX || e.touches[0].clientX;
    startY = e.clientY || e.touches[0].clientY;

    // Get initial position of the element
    const rect = element.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;
  }

  function drag(e) {
    if (!isDragging) return;

    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;

    // Calculate distance moved
    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    // Apply translation
    element.style.left = `${initialX + deltaX}px`;
    element.style.top = `${initialY + deltaY}px`;
  }

  function stopDragging() {
    if (!isDragging) return;
    isDragging = false;
    const rect = element.getBoundingClientRect();

    // Set position to absolute after dragging
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.transform = 'none'; // Clear any transform applied during drag
  }
}
