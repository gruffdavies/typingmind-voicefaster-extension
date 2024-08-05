const VOICEFASTER_EXTENSION_VERSION = '1.2.0';

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
