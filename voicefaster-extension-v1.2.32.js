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
  const VOICEFASTER_EXTENSION_VERSION = "1.2.32";

  function generate_uuid(type) {
    // const timestamp = new Date().toISOString().replace(/[-:\.]/g, '');
    const timestamp = new Date().getTime().toString(); // toISOString();
    return `${timestamp}`;
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

  /**
   * @class AudioStream
   * @description Represents an audio stream with its current state and timing information.
   *
   * ## SOLID Principles
   * - **S**ingle Responsibility: Handles audio stream state and metadata.
   * - **O**pen/Closed: Extensible for additional stream properties.
   * - **L**iskov Substitution: Can be used wherever an audio stream is expected.
   * - **I**nterface Segregation: Focuses solely on audio stream data.
   * - **D**ependency Inversion: Depends on StreamRequestResponse abstraction.
   *
   * ## DRY Principle
   * - Reuses StreamRequestResponse for request/response data.
   *
   * ## Clean Code Practices
   * - Clear, descriptive naming and concise logic.
   */
  class AudioStream {
    /*
     * @param {StreamRequestResponse} [streamRequestResponse] - The stream data.
     */
    constructor(streamRequestResponse) {
      this.id = generate_uuid();
      this.url = streamRequestResponse.url;
      this.headers = streamRequestResponse.headers;
      this.method = streamRequestResponse.method;
      this.body = streamRequestResponse.body;

      this.state = "queued";
      this.startTime = null;
      this.endTime = null;
    }

    // figure out if the stream is stale according to maxAge
    isStale(maxAge) {
      const currentTime = new Date();
      const timeSinceStart = currentTime - this.startTime;
      return timeSinceStart > maxAge;
    }

    refreshState(maxAge) {
      if (this.isStale(maxAge)) {
        this.updateState("stale");
      }
    }

    updateState(newState) {
      this.state = newState;
      if (newState === "playing") this.startTime = new Date();
      if (
        newState === "completed" ||
        newState === "error" ||
        newState === "stale"
      ) {
        this.endTime = new Date();
      }
    }
  }

  /**
   * @class AudioStreamQueue
   * @description Manages a queue of audio streams with automatic cleanup.
   *
   * ## SOLID Principles
   * - **S**ingle Responsibility: Manages audio stream queue and its limits.
   * - **O**pen/Closed: Extensible for additional queue management features.
   * - **L**iskov Substitution: Can be used wherever a queue is expected.
   * - **I**nterface Segregation: Focuses on queue operations and limit management.
   * - **D**ependency Inversion: Depends on AudioStream abstraction.
   *
   * ## DRY Principle
   * - Centralizes queue management logic.
   *
   * ## Clean Code Practices
   * - Clear method names and focused responsibilities.
   */
  class AudioStreamQueue {
    #streams;

    #maxSize;
    #maxAge;
    #observers;

    constructor(maxSize = 100, maxAge = 3600000) {
      this.#streams = [];
      this.#maxSize = maxSize;
      this.#maxAge = maxAge;
      this.#observers = [];
    }

    addStream(stream) {
      console.log(`Adding stream: ${stream.id} to queue of current size: ${this.#streams.length}`);
      this.#streams.push(stream);
      console.log(`After current size: ${this.#streams.length}`);
      console.log("Notifying observers. Final size:", this.#streams.length);
      this.notifyObservers();
    }

    removeStream(id) {
      const index = this.#streams.findIndex((stream) => stream.id === id);
      if (index !== -1) {
        this.#streams.splice(index, 1);
        this.notifyObservers();
        return true;
      }
      return false;
    }

    getNextQueuedStream() {
      console.log(
        "getNextQueuedStream: Stream states:",
        this.#streams.map((stream) => `${stream.id}: ${stream.state}`)
      );
      return this.#streams.find((stream) => stream.state === "queued") || null;
    }

    updateStreamState(id, newState) {
      const stream = this.#streams.find((stream) => stream.id === id);
      if (stream) {
        stream.updateState(newState);
        this.notifyObservers();
      }
    }

    cleanup() {
      // iterate over the streams calling refreshState(this.maxAge)
      // if stale, remove using the removeStream method
      // using console log to track what is happening
      console.log("Cleaning up streams. Current size:", this.#streams.length);
      for (const stream of this.#streams) {
        stream.refreshState(this.#maxAge);
        if (stream.isStale(this.#maxAge)) {
          console.log("Removing stale stream:", stream.id);
          this.removeStream(stream.id);
        }
      }
      this.notifyObservers();
    }

    removeOldest() {
      if (this.#streams.length > 0) {
        this.#streams.shift();
        this.notifyObservers();
      }
    }

    addObserver(observer) {
      this.#observers.push(observer);
    }

    notifyObservers() {
      for (const observer of this.#observers) {
        observer.update(this);
      }
    }

    getCurrentPlayingStream() {
      return this.#streams.find((stream) => stream.state === "playing") || null;
    }

    [Symbol.iterator]() {
      return this.#streams[Symbol.iterator]();
    }

    get size() {
      return this.#streams.length;
    }
  }

  /**
   * @class AudioStreamQueueVisualizer
   * @description Visualizes the AudioStreamQueue with limits on displayed items.
   *
   * ## SOLID Principles
   * - **S**ingle Responsibility: Handles visualization of AudioStreamQueue.
   * - **O**pen/Closed: Extensible for additional visualization features.
   * - **L**iskov Substitution: Can be used wherever a queue visualizer is expected.
   * - **I**nterface Segregation: Focuses on visualization operations.
   * - **D**ependency Inversion: Depends on AudioStreamQueue abstraction.
   *
   * ## DRY Principle
   * - Centralizes visualization logic.
   *
   * ## Clean Code Practices
   * - Clear method names and focused responsibilities.
   */
  class AudioStreamQueueVisualizer {
    constructor(container, maxDisplayed = 10) {
      this.container = container;
      this.maxDisplayed = maxDisplayed;
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
        .queue-item.stale { background-color: #808080; }
      `;
      document.head.appendChild(style);
    }

    update(queue) {
      if (queue) {
        // for (const stream of queue) {
        //   let element = this.container.querySelector(
        //     `#stream-${stream.id.replace(/[:]/g, "_")}`
        //   );
        //   element.id = `stream-${stream.id.replace(/[:]/g, "_")}`;

        //   if (!element) {
        //     element = this.#createStreamElement(stream);
        //     this.container.appendChild(element);
        //   } else {
        //     element.className = `queue-item ${stream.state}`;
        //     element.title = `Stream ${stream.id}: ${stream.state}`;
        //   }
        // }
      }
    }

    render(queue) {
      this.container.innerHTML = "";
      if (queue) {
        for (const stream of queue) {
          const element = this.#createStreamElement(stream);
          this.container.appendChild(element);
        }
      }
    }

    #createStreamElement(stream) {
      const element = document.createElement("span");
      element.id = `stream-${stream.id.replace(/[:]/g, "_")}`;
      element.className = `queue-item ${stream.state}`;
      element.title = `Stream ${stream.id}: ${stream.state}`;
      return element;
    }
  }

  /**
   * @class AudioPlayer
   * @description Manages audio playback and queue with automatic cleanup.
   *
   * ## SOLID Principles
   * - **S**ingle Responsibility: Handles audio playback of queued audio streams
   * - **O**pen/Closed: Extensible for additional audio features.
   * - **L**iskov Substitution: Can be used wherever an audio player is expected.
   * - **I**nterface Segregation: Focuses on audio playback and queue operations.
   * - **D**ependency Inversion: Depends on AudioStream, StreamRequestResponse, and AudioStreamQueue abstractions.
   *
   * ## DRY Principle
   * - Reuses logic for stream creation and queue management.
   *
   * ## Clean Code Practices
   * - Clear method names and focused responsibilities.
   * - Utilizes efficient Map-based queue and native JavaScript features.
   */
  class AudioPlayer {
    constructor(version, visualizer) {
      this.version = version;
      this.audio = new Audio();
      this.queue = new AudioStreamQueue();
      this.visualizer = visualizer;
      this.isPlaying = false;

      this.audio.onended = () => {
        console.log("Debug: Audio onended event triggered");
        this.isPlaying = false;
        const currentStream = this.queue.getCurrentPlayingStream();
        console.log(`Debug: Current stream ID: ${currentStream?.id}`);
        if (currentStream) {
          console.log(`Debug: Updating stream state to completed for stream ID: ${currentStream.id}`);
          this.queue.updateStreamState(currentStream.id, "completed");
          console.log("Debug: Updating visualizer");
          this.visualizer.update(this.queue);
        } else {
          console.log("Debug: No current stream to update");
        }
        console.info("Audio playback ended. Calling processNextInQueue()...");
        console.log("Debug: Calling processNextInQueue");
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
        console.info(
          "Enqueue: Audio Player is not currently playing. Calling processNextInQueue()..."
        );
        this.processNextInQueue();
      } else {
        console.info(
          "Enqueue: Audio Player is already playing something. Skipping processNextInQueue()."
        );
      }
    }

    async processNextInQueue() {
      console.log("Starting processNextInQueue");
      const nextStream = this.queue.getNextQueuedStream();
      if (nextStream) {
        console.log("Next stream found:", nextStream);
        this.isPlaying = true;
        nextStream.state = "requesting";
        try {
          console.log("Fetching stream from URL:", nextStream.url);
          const response = await fetch(nextStream.url, {
            method: nextStream.method,
            headers: nextStream.headers,
            body: nextStream.body,
          });
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          console.log("Fetch successful, creating blob");
          const blob = await response.blob();
          const audioUrl = URL.createObjectURL(blob);

          console.log("Updating stream state to playing");
          nextStream.state = "playing";
          // this.queue.updateStreamState(nextStream.id, "playing");
          this.visualizer.update(this.queue);

          console.log("Setting audio source and playing");
          this.audio.src = audioUrl;
          await this.audio.play();
        } catch (error) {
          console.error("Error in processNextInQueue:", error);
          console.log("Updating stream state to error");
          nextStream.state = "error";
          this.visualizer.update(this.queue);
          this.isPlaying = false;
          console.log("Error so Recursively calling processNextInQueue");
          this.processNextInQueue();
        }
      } else {
        console.log("No next stream in queue");
        this.visualizer.update(this.queue);
      }
    }

    clearQueue() {
      this.queue.clearQueue();
      this.visualizer.update(this.queue);
    }

    play() {
      if (!this.isPlaying) {
        this.audio.play();
        this.isPlaying = true;
      }
    }

    pause() {
      this.audio.pause();
      this.isPlaying = false;
    }

    stop() {
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
  const queueVisualizer = new AudioStreamQueueVisualizer();
  const audioPlayer = new AudioPlayer(
    VOICEFASTER_EXTENSION_VERSION,
    queueVisualizer
  );
  const uiManager = new UIManager(audioPlayer, queueVisualizer);

  // Add message listener to be able to play audio streams from the plugin script
  window.addEventListener("message", (event) => {
    if (event.data.type === "QUEUE_AUDIO_STREAM") {
      audioPlayer.queueAudioStream(event.data.payload);
    }
  });
})();
