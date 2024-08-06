// The extension is loaded in the browser and must be able to handle
// streams send from the plugin code below which is in a sandboxed iframe.
// PLUGIN CODE:
// async function VOICEFASTER_stream_voice_audio(params, userSettings) {
//   const VOICEFASTER_VERSION = '1.1.7';
//   console.log(`stream_voice_audio v${VOICEFASTER_VERSION} called with:`, params);

//   const { text, voice_id = userSettings.defaultVoiceId || 'LKzEuRvwo37aJ6JFMnxk' } = params;
//   const apiKey = userSettings.elevenLabsApiKey;

//   if (!apiKey) {
//     throw new Error("Eleven Labs API Key not provided in user settings");
//   }

//   const payload = {
//     url: `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream`,
//     method: "POST",
//     headers: {
//       "Accept": "audio/mpeg",
//       "xi-api-key": apiKey,
//       "Content-Type": "application/json"
//     },
//     body: JSON.stringify({
//       "text": text,
//       "model_id": "eleven_monolingual_v1",
//       "voice_settings": { "stability": 0.5, "similarity_boost": 0.5 }
//     })
//   };

//   console.log("Sending message to play audio...");

//   // Send a message to the parent window
//   window.parent.postMessage({
//     type: 'QUEUE_AUDIO_STREAM',
//     payload: payload
//   }, '*');

//   return {
//     message: "Audio stream request sent. Check console for detailed logs.",
//     text: text,
//     voiceId: voice_id,
//     version: VOICEFASTER_VERSION
//   };
// }

(() => {
  // TypingMind Extension for handling audio streams
  const VOICEFASTER_EXTENSION_VERSION = '1.2.25';

  class AudioStream {
    constructor(id, url) {
      this.id = id;
      this.url = url;
      this.state = 'queued';
      this.startTime = null;
      this.endTime = null;
    }

    updateState(newState) {
      this.state = newState;
      if (newState === 'playing') this.startTime = new Date();
      if (newState === 'completed' || newState === 'error') this.endTime = new Date();
    }
  }

  class AudioStreamQueue {
    constructor() {
      this.streams = [];
    }

    addStream(stream) {
      this.streams.push(stream);
    }

    updateStreamState(id, newState) {
      const stream = this.streams.find(s => s.id === id);
      if (stream) {
        stream.updateState(newState);
      }
    }

    getNextStream() {
      return this.streams.find(s => s.state === 'queued');
    }
  }

  // File: queueVisualizer.js
  class QueueVisualizer {
    constructor(container) {
      this.container = container;
      this.addStyles();
    }

    addStyles() {
      const style = document.createElement('style');
      style.textContent = `
        .queue-item {
          display: inline-block;
          width: 10px;
          height: 10px;
          margin: 0 2px;
          border-radius: 50%;
        }
        .queue-item.queued { background-color: #FFD700; }
        .queue-item.playing { background-color: #32CD32; }
        .queue-item.completed { background-color: #4169E1; }
        .queue-item.error { background-color: #DC143C; }
      `;
      document.head.appendChild(style);
    }

    render(queue) {
      this.container.innerHTML = '';
      queue.streams.forEach(stream => {
        const element = document.createElement('span');
        element.id = `stream-${stream.id}`;
        element.className = `queue-item ${stream.state}`;
        element.title = `Stream ${stream.id}: ${stream.state}`;
        this.container.appendChild(element);
      });
    }

    updateStreamVisual(stream) {
      const element = document.getElementById(`stream-${stream.id}`);
      if (element) {
        element.className = `queue-item ${stream.state}`;
        element.title = `Stream ${stream.id}: ${stream.state}`;
      }
    }
  }


  class AudioPlayer {
    constructor() {
      this.audio = new Audio();
      this.queue = new AudioStreamQueue();
      this.visualizer = new QueueVisualizer('tm-queue-visualizer');
      this.isPlaying = false;

      this.audio.onended = () => {
        this.isPlaying = false;
        this.processNextInQueue();
      };
    }

    async queueAudioStream(streamInfo) {
      const { url, method, headers, body } = streamInfo;
      if (!url || typeof url !== 'string') {
        console.error('Invalid URL format');
        return;
      }

      const streamId = Date.now().toString();
      const audioStream = new AudioStream(streamId, url);
      this.queue.addStream(audioStream);
      this.visualizer.render(this.queue);

      if (!this.isPlaying) {
        this.processNextInQueue();
      }
    }

    async processNextInQueue() {
      const nextStream = this.queue.getNextStream();
      if (nextStream) {
        this.isPlaying = true;
        try {
          const response = await fetch(nextStream.url, {
            method: nextStream.method,
            headers: nextStream.headers,
            body: nextStream.body
          });
          if (!response.ok) {
            throw new Error(```HTTP error! status: ${response.status}```);
          }

          const blob = await response.blob();
          const audioUrl = URL.createObjectURL(blob);

          this.queue.updateStreamState(nextStream.id, 'playing');
          this.visualizer.updateStreamVisual(nextStream);

          this.audio.src = audioUrl;
          await this.audio.play();
        } catch (error) {
          console.error('Error in processNextInQueue:', error);
          this.queue.updateStreamState(nextStream.id, 'error');
          this.visualizer.updateStreamVisual(nextStream);
          this.isPlaying = false;
          this.processNextInQueue();
        }
      }
    }

    resumePlayback() {
      if (!this.isPlaying) {
        this.audio.play();
        this.isPlaying = true;
      }
    }

    pausePlayback() {
      this.audio.pause();
      this.isPlaying = false;
    }

    stopPlayback() {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.isPlaying = false;
    }
  }


  class UIManager {
    constructor(audioPlayer, QueueVisualizer) {
      this.audioPlayer = audioPlayer;
      this.createPlayerAndControls(QueueVisualizer);
    }


    createPlayerAndControls(QueueVisualizer) {
      const container = document.createElement('div');
      container.id = 'tm-audio-player';
      container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background-color: #333; color: #fff; padding: 10px; border-radius: 5px; font-family: Arial, sans-serif; z-index: 10000; width: 300px;';

      const title = document.createElement('div');
      title.textContent = 'VoiceFaster Audio Player';
      title.style.cssText = 'font-weight: bold; margin-bottom: 10px; cursor: move;';

      // Make the container draggable
      title.addEventListener('mousedown', (e) => {
        let isDragging = true;
        let startX = e.clientX - container.offsetLeft;
        let startY = e.clientY - container.offsetTop;

        const onMouseMove = (e) => {
          if (isDragging) {
            container.style.left = (e.clientX - startX) + 'px';
            container.style.top = (e.clientY - startY) + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
          }
        };

        const onMouseUp = () => {
          isDragging = false;
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 10px;';

      const playPauseButton = document.createElement('button');
      playPauseButton.textContent = 'Play';
      playPauseButton.onclick = () => this.audioPlayer.togglePlayPause();

      const stopButton = document.createElement('button');
      stopButton.textContent = 'Stop';
      stopButton.onclick = () => this.audioPlayer.stop();

      const skipButton = document.createElement('button');
      skipButton.textContent = 'Skip';
      skipButton.onclick = () => this.audioPlayer.skip();

      const clearQueueButton = document.createElement('button');
      clearQueueButton.textContent = 'Clear Queue';
      clearQueueButton.onclick = () => this.audioPlayer.clearQueue();

      buttonContainer.append(playPauseButton, stopButton, skipButton, clearQueueButton);

      // Create a container for the queue visualizer
      const queueVisualizerContainer = document.createElement('div');
      queueVisualizerContainer.id = 'tm-queue-visualizer';
      queueVisualizerContainer.style.cssText = 'margin-top: 10px; text-align: right; height: 20px;';

      const versionDisplay = document.createElement('div');
      versionDisplay.style.cssText = 'font-size: 10px; text-align: right; margin-top: 5px;';
      versionDisplay.textContent = `Version: ${this.audioPlayer.version}`;

      // Create the QueueVisualizer instance
      this.queueVisualizer = new QueueVisualizer(queueVisualizerContainer);

      container.append(title, buttonContainer, queueVisualizerContainer, versionDisplay);
      document.body.appendChild(container);

      // Update UI elements when audio player state changes
      this.audioPlayer.onStateChange((state) => {
        playPauseButton.textContent = state.isPlaying ? 'Pause' : 'Play';
      });

      // Update UI elements when queue changes
      this.audioPlayer.onQueueChange((queue) => {
        this.queueVisualizer.render(queue);
      });
    }


    // File: uiManager.js (continued)
    createButton(text, id, display = 'inline-block') {
      const button = document.createElement('button');
      button.id = id;
      button.innerHTML = text;
      button.style.cssText = `background: none; border: none; font-size: 24px; cursor: pointer; margin-right: 5px; display: ${display};`;
      return button;
    }

    setupEventListeners(playButton, pauseButton, stopButton) {
      playButton.onclick = () => {
        this.audioPlayer.resumePlayback();  // Changed from play() to resumePlayback()
        this.updateUIState(true);
      };

      pauseButton.onclick = () => {
        this.audioPlayer.pausePlayback();  // Already correct
        this.updateUIState(false);
      };

      stopButton.onclick = () => {
        this.audioPlayer.stopPlayback();  // Already correct
        this.updateUIState(false);
      };

      this.audioPlayer.audio.addEventListener('play', () => this.updateUIState(true));
      this.audioPlayer.audio.addEventListener('pause', () => this.updateUIState(false));
      this.audioPlayer.audio.addEventListener('ended', () => this.updateUIState(false));
    }

    updateUIState(isPlaying) {
      const playButton = document.getElementById('tm-audio-play');
      const pauseButton = document.getElementById('tm-audio-pause');
      const stopButton = document.getElementById('tm-audio-stop');
      if (playButton && pauseButton && stopButton) {
        playButton.style.display = isPlaying ? 'none' : 'inline-block';
        pauseButton.style.display = isPlaying ? 'inline-block' : 'none';
        stopButton.style.display = isPlaying ? 'inline-block' : 'none';
      }
    }

    makeDraggable(element) {
      let isDragging = false;
      let startX, startY, initialX, initialY;

      element.addEventListener('mousedown', startDragging);
      element.addEventListener('touchstart', startDragging, { passive: true });
      document.addEventListener('mousemove', drag);
      document.addEventListener('touchmove', drag);
      document.addEventListener('mouseup', stopDragging);
      document.addEventListener('touchend', stopDragging);

      function startDragging(e) {
        e.preventDefault();
        isDragging = true;
        startX = e.clientX || e.touches[0].clientX;
        startY = e.clientY || e.touches[0].clientY;
        const rect = element.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
      }

      function drag(e) {
        if (!isDragging) return;
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;
        element.style.left = `${initialX + deltaX}px`;
        element.style.top = `${initialY + deltaY}px`;
      }

      function stopDragging() {
        if (!isDragging) return;
        isDragging = false;
        const rect = element.getBoundingClientRect();
        element.style.left = `${rect.left}px`;
        element.style.top = `${rect.top}px`;
        element.style.transform = 'none';
      }
    }
  }

  // Instantiate the AudioPlayer and UIManager
  const audioPlayer = new AudioPlayer();
  const uiManager = new UIManager(audioPlayer, QueueVisualizer);

  // Set the visualizer for the audio player
  audioPlayer.setVisualizer(uiManager.queueVisualizer);

  // Add message listener to be able to play audio streams from the plugin script
  // in comments at the top (called elsewhere)
  window.addEventListener('message', (event) => {
    if (event.data.type === 'QUEUE_AUDIO_STREAM') {
      audioPlayer.queueAudioStream(event.data.payload);
    }
  });

})();
