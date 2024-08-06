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

// This IIFE is injected into TypingMind web app (chrome) as an extension
// to handle audio streams. The extension is designed to work with the
// VOICEFASTER_stream_voice_audio function, which is expected to be called
// from the plugin script.
(() => {
  // TypingMind Extension for handling audio streams
  const VOICEFASTER_EXTENSION_VERSION = "1.2.29";

  function generate_uuid(type) {
    return new Date().toISOString();
  }

  function log_object_stringify(message, object) {
    console.log(message, JSON.stringify(object, null, 2));
  }

  /**
   * @class StreamRequestResponse
   * @description Represents a stream request and response with flexible initialization.
   *
   * ## SOLID Principles
   * - **S**ingle Responsibility: Handles stream request/response data storage.
   * - **O**pen/Closed: Extensible for additional properties without modifying existing code.
   * - **L**iskov Substitution: Can be used as a base class for more specific request types.
   * - **I**nterface Segregation: Focuses solely on request/response data.
   * - **D**ependency Inversion: Doesn't depend on concrete implementations.
   *
   * ## DRY Principle
   * - Uses a single method for member initialization to avoid code duplication.
   *
   * ## Clean Code Practices
   * - Clear, descriptive naming and concise logic.
   */
  class StreamRequestResponse {
    /**
     * @description Constructs a StreamRequestResponse instance.
     * @param {Object|string} obj_or_url - Either an object with request details or the URL string.
     * @param {string} [method] - The HTTP method (GET, POST, etc.).
     * @param {Object} [headers] - The request headers.
     * @param {string|Object} [body] - The request body.
     */
    constructor(obj_or_url, method, headers, body) {
      if (typeof obj_or_url === "object") {
        this.#initializeMembers(obj_or_url);
      } else {
        this.#initializeMembers({ url: obj_or_url, method, headers, body });
      }
    }

    /**
     * @private
     * @description Initializes class members from an object.
     * @param {Object} params - Object containing the parameters.
     */
    #initializeMembers({ url, method, headers, body }) {
      this.url = url;
      this.method = method || "GET"; // Default to GET if not provided
      this.headers = headers || {}; // Default to empty object if not provided
      this.body = body || null; // Default to null if not provided
    }
  }

  // Example usage:

  // Passing a structured object
  const request1 = new StreamRequestResponse({
    url: "https://api.example.com",
    method: "GET",
    headers: { "Content-Type": "application/json" },
    body: null,
  });

  console.log(request1);
  // Output: StreamRequestResponse {
  //   url: 'https://api.example.com',
  //   method: 'GET',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: null
  // }

  // Passing individual parameters
  const request2 = new StreamRequestResponse(
    "https://api.example.com",
    "POST",
    { "Content-Type": "application/json" },
    { key: "value" }
  );

  console.log(request2);
  // Output: StreamRequestResponse {
  //   url: 'https://api.example.com',
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: { key: 'value' }
  // }

  class AudioStream {
    constructor(streamRequestResponse) {
      this.id = generate_uuid();
      this.url = url;
      this.state = "queued";
      this.startTime = null;
      this.endTime = null;
    }

    updateState(newState) {
      this.state = newState;
      if (newState === "playing") this.startTime = new Date();
      if (newState === "completed" || newState === "error")
        this.endTime = new Date();
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
      const stream = this.streams.find((s) => s.id === id);
      if (stream) {
        stream.updateState(newState);
      }
    }

    getNextStream() {
      return this.streams.find((s) => s.state === "queued");
    }
  }

  // File: queueVisualizer.js
  class QueueVisualizer {
    constructor(container) {
      this.container = container;
      this.addStyles();
    }

    addStyles() {
      const style = document.createElement("style");
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
      this.container.innerHTML = "";
      queue.streams.forEach((stream) => {
        const element = document.createElement("span");
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
    constructor(version, visualizer) {
      this.version = version;
      this.audio = new Audio();
      this.queue = new AudioStreamQueue();
      this.visualizer = visualizer;
      this.isPlaying = false;

      this.audio.onended = () => {
        this.isPlaying = false;
        this.processNextInQueue();
      };
    }

    async queueAudioStream(streamRequestResponseInfo) {
      log_object_stringify(
        "queueAudioStream called with streamRequestResponseInfo:",
        streamRequestResponseInfo
      );
      const streamInfo = new StreamRequestResponse(streamRequestResponseInfo);
      log_object_stringify("streamInfo object created:", streamInfo);

      if (!streamInfo.url || typeof streamInfo.url !== "string") {
        console.error("Invalid URL format");
        return;
      }

      // const requestedDate = Date.now().toString();
      const audioStream = new AudioStream(streamInfo);
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
            body: nextStream.body,
          });
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const blob = await response.blob();
          const audioUrl = URL.createObjectURL(blob);

          this.queue.updateStreamState(nextStream.id, "playing");
          this.visualizer.updateStreamVisual(nextStream);

          this.audio.src = audioUrl;
          await this.audio.play();
        } catch (error) {
          console.error("Error in processNextInQueue:", error);
          this.queue.updateStreamState(nextStream.id, "error");
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

  /**
   * @class UIManager
   * @description Manages the user interface for the audio player
   * @param {AudioPlayer} audioPlayer - The audio player instance
   * @param {QueueVisualizer} queueVisualizer - The queue visualizer instance
   *
   * ## SOLID Principles
   * - **S**ingle Responsibility: Handles UI creation and management
   * - **O**pen/Closed: Extendable for additional UI features
   * - **L**iskov Substitution: N/A (not inherited)
   * - **I**nterface Segregation: Focuses solely on UI-related methods
   * - **D**ependency Inversion: Depends on AudioPlayer and QueueVisualizer abstractions
   *
   * ## DRY Principle
   * - Reuse styles and element creation logic where possible
   *
   * ## Clean Code Practices
   * - Use descriptive method names and keep methods focused on single tasks
   */
  class UIManager {
    constructor(audioPlayer, queueVisualizer) {
      this.audioPlayer = audioPlayer;
      this.queueVisualizer = queueVisualizer;
      this.container = null;
      this.createPlayerAndControls();
    }

    createPlayerAndControls() {
      this.container = document.createElement("div");
      this.container.id = "voicefaster-player";
      this.applyContainerStyles();

      const title = this.createTitle();
      const buttonContainer = this.createButtonContainer();
      const versionDisplay = this.createVersionDisplay();
      const queueContainer = this.createQueueContainer();

      this.container.append(
        title,
        buttonContainer,
        queueContainer,
        versionDisplay
      );
      document.body.appendChild(this.container);

      this.makeDraggable(this.container);
    }

    applyContainerStyles() {
      Object.assign(this.container.style, {
        position: "fixed",
        right: "20px",
        bottom: "20px",
        width: "300px",
        backgroundColor: "#333",
        color: "white",
        padding: "10px",
        borderRadius: "5px",
        fontFamily: "Arial, sans-serif",
        zIndex: "1000",
        boxShadow: "0 0 10px rgba(0,0,0,0.5)",
      });
    }

    createTitle() {
      const title = document.createElement("h3");
      title.textContent = "VoiceFaster Audio Player";
      title.style.margin = "0 0 10px 0";
      return title;
    }

    createButtonContainer() {
      const buttonContainer = document.createElement("div");
      buttonContainer.style.display = "flex";
      buttonContainer.style.justifyContent = "space-between";

      const buttonData = [
        { text: "Play", emoji: "▶️", action: () => this.audioPlayer.play() },
        { text: "Pause", emoji: "⏸️", action: () => this.audioPlayer.pause() },
        { text: "Stop", emoji: "⏹️", action: () => this.audioPlayer.stop() },
        {
          text: "Clear Queue",
          emoji: "🗑️",
          action: () => this.audioPlayer.clearQueue(),
        },
      ];

      buttonData.forEach(({ text, emoji, action }) => {
        const button = this.createButton(text, emoji, action);
        buttonContainer.appendChild(button);
      });

      return buttonContainer;
    }

    createButton(text, emoji, action) {
      const button = document.createElement("button");
      button.innerHTML = `${emoji} ${text}`;
      Object.assign(button.style, {
        backgroundColor: "#4CAF50",
        border: "none",
        color: "white",
        padding: "5px 10px",
        textAlign: "center",
        textDecoration: "none",
        display: "inline-block",
        fontSize: "14px",
        margin: "2px",
        cursor: "pointer",
        borderRadius: "3px",
      });
      if (typeof action === "function") {
        button.addEventListener("click", action);
      } else {
        console.error(`${text} button's action is not a function:`, action);
      }
      return button;
    }

    createVersionDisplay() {
      const versionDisplay = document.createElement("div");
      Object.assign(versionDisplay.style, {
        fontSize: "10px",
        textAlign: "right",
        marginTop: "5px",
      });
      versionDisplay.textContent = `Version: ${
        this.audioPlayer.version || "undefined"
      }`;
      return versionDisplay;
    }

    createQueueContainer() {
      const queueContainer = document.createElement("div");
      queueContainer.id = "queue-visualizer";
      Object.assign(queueContainer.style, {
        marginTop: "10px",
        textAlign: "center",
      });
      this.queueVisualizer.container = queueContainer;
      return queueContainer;
    }

    updateUIState(isPlaying) {
      const playButton = document.getElementById("tm-audio-play");
      const pauseButton = document.getElementById("tm-audio-pause");
      const stopButton = document.getElementById("tm-audio-stop");
      if (playButton && pauseButton && stopButton) {
        playButton.style.display = isPlaying ? "none" : "inline-block";
        pauseButton.style.display = isPlaying ? "inline-block" : "none";
        stopButton.style.display = isPlaying ? "inline-block" : "none";
      }
    }

    makeDraggable(element) {
      let isDragging = false;
      let startX, startY, initialX, initialY;

      element.addEventListener("mousedown", startDragging);
      element.addEventListener("touchstart", startDragging, { passive: true });
      document.addEventListener("mousemove", drag);
      document.addEventListener("touchmove", drag);
      document.addEventListener("mouseup", stopDragging);
      document.addEventListener("touchend", stopDragging);

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
        element.style.transform = "none";
      }
    }
  }

  // Instantiate the AudioPlayer and UIManager
  const queueVisualizer = new QueueVisualizer();
  const audioPlayer = new AudioPlayer(
    VOICEFASTER_EXTENSION_VERSION,
    queueVisualizer
  );
  const uiManager = new UIManager(audioPlayer, queueVisualizer);

  // Add message listener to be able to play audio streams from the plugin script
  // in comments at the top (called elsewhere)
  window.addEventListener("message", (event) => {
    if (event.data.type === "QUEUE_AUDIO_STREAM") {
      audioPlayer.queueAudioStream(event.data.payload);
    }
  });
})();
