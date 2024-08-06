(() => {
  // TypingMind Extension for handling audio streams
  const VOICEFASTER_EXTENSION_VERSION = '1.2.21';

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
    constructor(containerId) {
      this.containerId = containerId;
      this.container = null;
      this.ensureContainer();
      this.addStyles();
    }

    addStyles() {
      const style = document.createElement('style');
      style.textContent = `
        .queue-item {
          display: inline-block;
          width: 20px;
          height: 20px;
          margin: 0 5px;
          border-radius: 50%;
        }
        .queue-item.queued { background-color: yellow; }
        .queue-item.playing { background-color: green; }
        .queue-item.completed { background-color: blue; }
        .queue-item.error { background-color: red; }
      `;
      document.head.appendChild(style);
    }

    ensureContainer() {
      this.container = document.getElementById(this.containerId);
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = this.containerId;
        this.container.style.cssText = 'position: fixed; bottom: 10px; left: 10px; z-index: 1000;';
        document.body.appendChild(this.container);
      }
    }

    render(queue) {
      this.ensureContainer();
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

  // File: audioPlayer.js
  class AudioPlayer {
    constructor() {
      this.audio = new Audio();
      this.queue = new AudioStreamQueue();
      this.visualizer = new QueueVisualizer('tm-queue-visualizer');
    }

    async playStream(streamInfo) {
      const { url, method, headers, body } = streamInfo;
      if (!url || typeof url !== 'string') {
        console.error('Invalid URL format');
        return;
      }

      const streamId = Date.now().toString();
      const audioStream = new AudioStream(streamId, url);
      this.queue.addStream(audioStream);
      this.visualizer.render(this.queue);

      try {
        const response = await fetch(url, { method, headers, body });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);

        this.queue.updateStreamState(streamId, 'playing');
        this.visualizer.updateStreamVisual(audioStream);

        this.audio.src = audioUrl;
        await this.audio.play();

        this.audio.onended = () => {
          this.queue.updateStreamState(streamId, 'completed');
          this.visualizer.updateStreamVisual(audioStream);
          this.playNext();
        };
      } catch (error) {
        console.error('Error in playStream:', error);
        this.queue.updateStreamState(streamId, 'error');
        this.visualizer.updateStreamVisual(audioStream);
      }
    }

    playNext() {
      const nextStream = this.queue.getNextStream();
      if (nextStream) {
        this.playStream({ url: nextStream.url });
      }
    }

    play() {
      this.audio.play();
    }

    pause() {
      this.audio.pause();
    }

    stop() {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }

  // File: uiManager.js
  class UIManager {
    constructor(audioPlayer) {
      this.audioPlayer = audioPlayer;
      this.createPlayerAndControls();
    }

    createPlayerAndControls() {
      const container = document.createElement('div');
      container.id = 'tm-audio-player-container';
      container.style.cssText = 'position: fixed; top: 20px; left: calc(100% - 140px); z-index: 1000; background-color: rgba(30, 41, 59, 0.8); padding: 5px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); cursor: move; user-select: none;';

      const title = document.createElement('span');
      title.textContent = `Rocket's Voice Player`;
      title.style.cssText = 'font-size: 14px; color: #fff; font-weight: bold; text-align: center; width: 100%; display: block; margin-bottom: 5px;';

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; align-items: center;';

      const playButton = this.createButton('▶️', 'tm-audio-play');
      const pauseButton = this.createButton('⏸️', 'tm-audio-pause', 'none');
      const stopButton = this.createButton('⏹️', 'tm-audio-stop', 'none');

      const dragHandle = document.createElement('span');
      dragHandle.innerHTML = '↔️';
      dragHandle.style.cssText = 'font-size: 18px; cursor: move;';

      const versionDisplay = document.createElement('span');
      versionDisplay.textContent = `v${VOICEFASTER_EXTENSION_VERSION}`;
      versionDisplay.style.cssText = 'font-size: 10px; color: #888; margin-left: 5px;';

      buttonContainer.append(playButton, pauseButton, stopButton, dragHandle, versionDisplay);
      container.append(title, buttonContainer);
      document.body.appendChild(container);

      this.makeDraggable(container);
      this.setupEventListeners(playButton, pauseButton, stopButton);
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
        this.audioPlayer.play();
        this.updateUIState(true);
      };

      pauseButton.onclick = () => {
        this.audioPlayer.pause();
        this.updateUIState(false);
      };

      stopButton.onclick = () => {
        this.audioPlayer.stop();
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
  const uiManager = new UIManager(audioPlayer);

})();
