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
  const VOICEFASTER_EXTENSION_VERSION = "1.2.30";

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
    #id;
    #streamInfo;
    #state;
    #startTime;
    #endTime;
    #addedTime;

    constructor(streamRequestResponse) {
      this.#id = generate_uuid();
      this.#streamInfo = streamRequestResponse;
      this.#state = "queued";
      this.#startTime = null;
      this.#endTime = null;
      this.#addedTime = Date.now();
    }

    get id() {
      return this.#id;
    }
    get state() {
      return this.#state;
    }
    get addedTime() {
      return this.#addedTime;
    }
    get streamInfo() {
      return this.#streamInfo;
    }

    // Add a getter for audioUrl
    get audioUrl() {
      return this.#streamInfo.url;
    }

    updateState(newState) {
      this.#state = newState;
      if (newState === "playing") this.#startTime = new Date();
      if (newState === "completed" || newState === "error")
        this.#endTime = new Date();
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
    #order;
    #maxSize;
    #maxAge;
    #observers;

    constructor(maxSize = 100, maxAge = 3600000) {
      this.#streams = new Map();
      this.#order = [];
      this.#maxSize = maxSize;
      this.#maxAge = maxAge;
      this.#observers = [];
    }

    addStream(stream) {
      this.cleanup();
      if (this.#streams.size >= this.#maxSize) {
        this.removeOldest();
      }
      this.#streams.set(stream.id, stream);
      this.#order.push(stream.id);
      this.notifyObservers();
    }

    removeStream(id) {
      if (this.#streams.delete(id)) {
        this.#order = this.#order.filter((streamId) => streamId !== id);
        this.notifyObservers();
        return true;
      }
      return false;
    }

    getNextStream() {
      this.cleanup();
      if (this.#order.length > 0) {
        const nextId = this.#order[0];
        return this.#streams.get(nextId);
      }
      return null;
    }

    updateStreamState(id, newState) {
      const stream = this.#streams.get(id);
      if (stream) {
        stream.updateState(newState);
        this.notifyObservers();
      }
    }

    cleanup() {
      const now = Date.now();
      for (const [id, stream] of this.#streams) {
        if (stream.state === "completed" || stream.state === "error") {
          if (now - stream.addedTime > this.#maxAge) {
            this.removeStream(id);
          }
        } else if (now - stream.addedTime > this.#maxAge) {
          this.removeStream(id);
        }
      }
    }

    removeOldest() {
      if (this.#order.length > 0) {
        const oldestId = this.#order[0];
        this.removeStream(oldestId);
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

    [Symbol.iterator]() {
      return this.#streams.values();
    }

    get size() {
      return this.#streams.size;
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
    constructor(containerId, maxDisplayed = 10) {
      this.container = document.getElementById(containerId);
      this.maxDisplayed = maxDisplayed;
    }

    update(queue) {
      this.render(queue);
    }

    render(queue) {
      this.container.innerHTML = "";
      let count = 0;
      for (const stream of queue) {
        if (count >= this.maxDisplayed) break;
        const streamElement = this.createStreamElement(stream);
        this.container.appendChild(streamElement);
        count++;
      }
    }

    createStreamElement(stream) {
      const element = document.createElement("div");
      element.className = `stream-item ${stream.state}`;
      element.textContent = `Stream ${stream.id}: ${stream.state}`;
      return element;
    }

    updateStreamVisual(stream) {
      const streamElement = this.container.querySelector(
        `[data-stream-id="${stream.id}"]`
      );
      if (streamElement) {
        streamElement.className = `stream-item ${stream.state}`;
        streamElement.textContent = `Stream ${stream.id}: ${stream.state}`;
      }
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
    #queue;
    #audioElement;
    #currentStream;
    #urlToRevoke;

    /**
     * @constructor
     * @param {AudioStreamQueue} queue - The audio stream queue to manage
     */
    constructor(queue) {
      this.#queue = queue;
      this.#audioElement = new Audio();
      this.#currentStream = null;
      this.#urlToRevoke = null;

      this.#audioElement.addEventListener("ended", () => this.#onEnded());
      this.#audioElement.addEventListener("error", (e) => this.#onError(e));
    }

    /**
     * @description Attempts to play the next audio stream in the queue
     * @returns {Promise<void>}
     */
    async play() {
      if (this.#currentStream) return;

      const stream = this.#queue.getNextStream();
      if (!stream) return;

      this.#currentStream = stream;
      this.#queue.updateStreamState(stream.id, "playing");

      try {
        const response = await fetch(stream.audioUrl);
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        const blob = await response.blob();

        if (this.#urlToRevoke) {
          URL.revokeObjectURL(this.#urlToRevoke);
        }

        const url = URL.createObjectURL(blob);
        this.#urlToRevoke = url;
        this.#audioElement.src = url;
        await this.#audioElement.play();
      } catch (error) {
        console.error("Error playing audio:", error);
        this.#queue.updateStreamState(stream.id, "error");
        this.#currentStream = null;
        this.play(); // Try to play the next stream
      }
    }

    /**
     * @private
     * @description Handles the 'ended' event of the audio element
     */
    #onEnded() {
      if (this.#currentStream) {
        this.#queue.updateStreamState(this.#currentStream.id, "completed");
        this.#queue.removeStream(this.#currentStream.id);
        this.#currentStream = null;
      }
      this.play(); // Play the next stream
    }

    /**
     * @private
     * @description Handles the 'error' event of the audio element
     * @param {Event} error - The error event
     */
    #onError(error) {
      console.error("Audio playback error:", error);
      if (this.#currentStream) {
        this.#queue.updateStreamState(this.#currentStream.id, "error");
        this.#queue.removeStream(this.#currentStream.id);
        this.#currentStream = null;
      }
      this.play(); // Try to play the next stream
    }

    /**
     * @description Queues a new audio stream from the provided payload
     * @param {Object} payload - The payload containing audio stream information
     */
    queueAudioStream(payload) {
      const streamRequestResponse = new StreamRequestResponse(payload);
      const audioStream = new AudioStream(streamRequestResponse);
      this.#queue.addStream(audioStream);
      this.play(); // Attempt to play if not already playing
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
    #container;
    #audioPlayer;
    #queue;
    #visualizer;

    constructor(audioPlayer, queue) {
      this.#audioPlayer = audioPlayer;
      this.#queue = queue;
      this.#createContainer();
      this.#createVisualizer();
      this.#makeDraggable();
    }

    #createContainer() {
      try {
        this.#container = document.createElement("div");
        this.#container.id = "voicefaster-container";
        this.#container.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 300px;
          height: 200px;
          background-color: white;
          border: 1px solid #ccc;
          border-radius: 5px;
          padding: 10px;
          z-index: 1000;
        `;
        document.body.appendChild(this.#container);
      } catch (error) {
        console.error("Error creating container:", error);
      }
    }

    #createVisualizer() {
      try {
        const visualizerContainer = document.createElement("div");
        visualizerContainer.id = "voicefaster-visualizer";
        this.#container.appendChild(visualizerContainer);
        this.#visualizer = new AudioStreamQueueVisualizer(visualizerContainer);
        this.#queue.addObserver(this.#visualizer);
      } catch (error) {
        console.error("Error creating visualizer:", error);
      }
    }

    #makeDraggable() {
      try {
        let isDragging = false;
        let startX, startY;

        this.#container.addEventListener("mousedown", (e) => {
          isDragging = true;
          startX = e.clientX - this.#container.offsetLeft;
          startY = e.clientY - this.#container.offsetTop;
        });

        document.addEventListener("mousemove", (e) => {
          if (!isDragging) return;
          const newX = e.clientX - startX;
          const newY = e.clientY - startY;
          this.#container.style.left = `${newX}px`;
          this.#container.style.top = `${newY}px`;
        });

        document.addEventListener("mouseup", () => {
          isDragging = false;
        });
      } catch (error) {
        console.error("Error making container draggable:", error);
      }
    }
  }

  // Instantiate the AudioStreamQueue, AudioPlayer, and UIManager
  const audioStreamQueue = new AudioStreamQueue();
  const audioPlayer = new AudioPlayer(audioStreamQueue);
  const uiManager = new UIManager(audioPlayer, audioStreamQueue);

  // Add message listener to be able to play audio streams from the plugin script
  window.addEventListener("message", (event) => {
    if (event.data.type === "QUEUE_AUDIO_STREAM") {
      audioPlayer.queueAudioStream(event.data.payload);
    }
  });

})();
