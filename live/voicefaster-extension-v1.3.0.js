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
    const VOICEFASTER_EXTENSION_VERSION = "1.3.0";

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
        /**
         * @param {StreamRequestResponse} streamRequestResponse - The stream data
         */
        constructor(streamRequestResponse) {
            this.id = generate_uuid();
            this.url = streamRequestResponse.url;
            this.headers = streamRequestResponse.headers;
            this.method = streamRequestResponse.method;
            this.body = streamRequestResponse.body;

            // Extract and store the text from the body
            try {
                this.text = JSON.parse(this.body).text || "No text available";
            } catch (e) {
                this.text = "Text parsing error";
                console.error("Error parsing body for text:", e);
            }

            // Initialize state and timing
            this.state = "queued";
            this.startTime = new Date();  // Set creation time
            this.endTime = null;
            this.duration = null;

            // Track state history
            this.stateHistory = [{
                state: "queued",
                timestamp: this.startTime
            }];

            // Error tracking
            this.errors = [];
        }

        /**
         * Check if the stream is stale based on maxAge
         * @param {number} maxAge - Maximum age in milliseconds
         * @returns {boolean}
         */
        isStale(maxAge) {
            if (!this.startTime) return false;
            const currentTime = new Date();
            const timeSinceStart = currentTime - this.startTime;
            return timeSinceStart > maxAge;
        }

        /**
         * Update state if stream is stale
         * @param {number} maxAge - Maximum age in milliseconds
         */
        refreshState(maxAge) {
            if (this.isStale(maxAge)) {
                this.updateState("stale");
            }
        }

        /**
         * Update the stream's state
         * @param {string} newState - New state to set
         * @param {string} [errorMessage] - Optional error message
         */
        updateState(newState, errorMessage = null) {
            const now = new Date();
            const oldState = this.state;
            this.state = newState;

            // Track state history
            this.stateHistory.push({
                state: newState,
                timestamp: now,
                previousState: oldState
            });

            // Handle state-specific timing
            switch (newState) {
                case "playing":
                    this.startTime = this.startTime || now;
                    break;
                case "completed":
                case "error":
                case "stale":
                    this.endTime = now;
                    if (this.startTime) {
                        this.duration = this.endTime - this.startTime;
                    }
                    break;
            }

            // Track errors if any
            if (newState === "error" && errorMessage) {
                this.errors.push({
                    timestamp: now,
                    message: errorMessage
                });
            }

            // Log state change
            console.log(`Stream ${this.id} state changed: ${oldState} -> ${newState}${errorMessage ? ` (Error: ${errorMessage})` : ''
                }`);
        }

        /**
         * Get formatted duration of the stream
         * @returns {string}
         */
        getDurationString() {
            if (!this.duration) return 'N/A';
            const seconds = Math.floor(this.duration / 1000);
            return `${seconds}s`;
        }

        /**
         * Get state history as formatted string
         * @returns {string}
         */
        getStateHistoryString() {
            return this.stateHistory
                .map(({ state, timestamp }) =>
                    `${state} at ${timestamp.toLocaleTimeString()}`
                )
                .join('\n');
        }

        /**
         * Get stream details as formatted string
         * @returns {string}
         */
        getDetailsString() {
            const details = [
                `ID: ${this.id}`,
                `State: ${this.state}`,
                `Created: ${this.startTime.toLocaleTimeString()}`,
                `Duration: ${this.getDurationString()}`,
                `Text: "${this.text}"`,
                '\nState History:',
                this.getStateHistoryString()
            ];

            if (this.errors.length > 0) {
                details.push('\nErrors:');
                details.push(...this.errors.map(err =>
                    `${err.timestamp.toLocaleTimeString()}: ${err.message}`
                ));
            }

            return details.join('\n');
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
            console.log(
                `Adding stream: ${stream.id} to queue of current size: ${this.#streams.length
                }`
            );
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
        :root {
          /* Core colors and brand identity */
          --primary: rgba(64, 169, 255, 1);
          --primary-bright: rgba(64, 169, 255, 1);
          --primary-muted: rgba(64, 169, 255, 0.8);
          --primary-subtle: rgba(64, 169, 255, 0.5);
          --primary-faint: rgba(64, 169, 255, 0.3);
          --primary-ghost: rgba(64, 169, 255, 0.2);

          /* Interface surfaces */
          --surface-floating: rgba(0, 0, 0, 0.3);
          --surface-raised: rgba(0, 0, 0, 0.4);
          --surface-deep: rgba(0, 0, 0, 0.5);

          /* Glows and shadows */
          --glow-core: var(--primary-subtle);
          --glow-outer: var(--primary-faint);
          --background-gradient: linear-gradient(135deg, rgba(64, 169, 255, 0.1), rgba(0, 0, 0, 0.2));
          --shadow-standard: 0 4px 12px rgba(0, 0, 0, 0.4);
          --glow-inner: inset 0 0 20px rgba(64, 169, 255, 0.2);
          --glow-outer-bright: 0 0 15px rgba(64, 169, 255, 0.3);

          /* States */
          --state-active: rgba(255, 64, 64, 0.3);
          --state-idle: var(--primary-ghost);
          --state-listening: var(--state-active);

          /* Text colors */
          --text-primary: var(--primary-bright);
          --text-secondary: var(--primary-muted);

          /* Layout */
          --border-radius-standard: 1rem;
          --padding-standard: 1rem;
          --gap-standard: 1rem;
          --transition-standard: all 0.3s ease;
          --backdrop-blur: blur(0.3rem);

          /* Combined effects */
          --box-shadow-combined:
              var(--shadow-standard),
              var(--glow-inner),
              var(--glow-outer-bright);
        }

       .queue-item {
      display: inline-block;
      width: 0.5rem;
      height: 0.5rem;
      margin: 0 0.125rem;
      border-radius: 50%;
      transition: var(--transition-standard);
      border: 1px solid var(--primary-muted);
      cursor: help;
    }

    .queue-item.requesting {
      background-color: var(--primary-ghost);
      border-color: var(--primary);
      animation: pulse 1s infinite;
    }

    .queue-item.queued {
      background-color: var(--primary-ghost);
      border-color: var(--primary);
    }

    .queue-item.playing {
      background-color: var(--primary-bright);
      box-shadow: 0 0 8px var(--primary-bright);
      border-color: #fff;
      animation: playingGlow 1.5s infinite;
      width: 0.625rem;  /* Slightly larger */
      height: 0.625rem;
      transform: translateY(-1px);  /* Slight lift effect */
    }

    .queue-item.completed {
      background-color: var(--primary-bright);
      border-color: var(--primary-faint);
      opacity: 0.7;
    }

    .queue-item.error {
      background-color: var(--state-active);
      border-color: var(--state-active);
    }

    .queue-item.stale {
      background-color: var(--surface-deep);
      border-color: var(--primary-faint);
      opacity: 0.5;
    }

    @keyframes pulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.8; }
      100% { transform: scale(1); opacity: 1; }
    }

    @keyframes playingGlow {
      0% {
        box-shadow: 0 0 5px var(--primary-bright);
        border-color: #fff;
      }
      50% {
        box-shadow: 0 0 12px var(--primary-bright), 0 0 20px var(--primary);
        border-color: var(--primary-bright);
      }
      100% {
        box-shadow: 0 0 5px var(--primary-bright);
        border-color: #fff;
      }
    }

        #voicefaster-player {
          position: fixed;
          right: var(--padding-standard);
          top: var(--padding-standard);
          min-width: 180px;
          height: auto;
          background: var(--surface-floating);
          backdrop-filter: var(--backdrop-blur);
          border-radius: var(--border-radius-standard);
          padding: 0.25rem;
          color: var(--text-primary);
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          z-index: 1000;
          box-shadow: var(--box-shadow-combined);
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          user-select: none;
          cursor: move;
        }

        #voicefaster-player .voicefaster__header {
          padding: 0.25rem;
          font-size: 0.75rem;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--surface-deep);
          cursor: grab;
        }

        #voicefaster-player button {
          background: var(--state-idle);
          border: none;
          color: var(--text-primary);
          padding: 0.375rem;
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.875rem;
          margin: 0;
          cursor: pointer;
          border-radius: 0.375rem;
          transition: var(--transition-standard);
        }

        #voicefaster-player button:hover {
          background: var(--primary-faint);
        }

        #queue-visualizer {
          padding: 0.25rem;
          display: flex;
          justify-content: center;
          gap: 0.125rem;
        }

        .version-display {
          font-size: 0.625rem;
          color: var(--text-secondary);
          text-align: right;
          padding: 0.25rem;
          opacity: 0.7;
        }
      `;
            document.head.appendChild(style);
        }


        update(queue) {
            console.log("Updating visualizer with queue:", queue);
            this.render(queue); // Always use render to ensure complete refresh
        }

        render(queue) {
            console.log("Rendering queue visualization");
            this.container.innerHTML = '';
            if (queue) {
                Array.from(queue).forEach((stream, index) => {
                    const element = this.#createStreamElement(stream, index);
                    this.container.appendChild(element);
                });
            }
        }

        #createStreamElement(stream, index) {
            const element = document.createElement("span");
            element.id = `stream-${stream.id.replace(/[:]/g, "_")}`;
            element.className = `queue-item ${stream.state}`;
            element.title = stream.getDetailsString();
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

            this.audio.onended = async () => {
                console.log("Debug: Audio onended event triggered");
                this.isPlaying = false;
                const currentStream = this.queue.getCurrentPlayingStream();
                console.log(`Debug: Current stream ID: ${currentStream?.id}`);

                if (currentStream) {
                    console.log(`Debug: Updating stream state to completed for stream ID: ${currentStream.id}`);
                    this.queue.updateStreamState(currentStream.id, "completed");
                    this.visualizer.update(this.queue);

                    // Find next queued stream
                    const streams = Array.from(this.queue);
                    const currentIndex = streams.indexOf(currentStream);
                    const nextStream = streams[currentIndex + 1];

                    if (nextStream) {
                        console.log(`Debug: Found next stream ${nextStream.id}, setting to queued`);
                        this.queue.updateStreamState(nextStream.id, "queued");
                        this.visualizer.update(this.queue);
                        await this.processNextInQueue();
                    } else {
                        console.log("Debug: No more streams to play");
                        this.stop();
                    }
                } else {
                    console.log("Debug: No current stream to update");
                }
            };
        }

        async processNextInQueue() {
            console.log("Starting processNextInQueue");
            const nextStream = this.queue.getNextQueuedStream();
            if (nextStream) {
                console.log("Next stream found:", nextStream);
                // Clear any previous playing states
                const currentPlaying = this.queue.getCurrentPlayingStream();
                if (currentPlaying && currentPlaying.id !== nextStream.id) {
                    this.queue.updateStreamState(currentPlaying.id, "completed");
                }

                this.isPlaying = true;
                nextStream.state = "requesting";
                this.visualizer.update(this.queue);

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
                    await this.processNextInQueue();
                }
            } else {
                console.log("No next stream in queue");
                this.isPlaying = false;
                this.visualizer.update(this.queue);
            }
        }


        async queueAudioStream(streamRequestResponseInfo) {
            log_object_stringify("queueAudioStream called with streamRequestResponseInfo:", streamRequestResponseInfo);
            const streamInfo = new StreamRequestResponse(streamRequestResponseInfo);
            log_object_stringify("streamInfo object created:", streamInfo);

            if (!streamInfo.url || typeof streamInfo.url !== "string") {
                console.error("Invalid URL format");
                return;
            }

            const audioStream = new AudioStream(streamInfo);
            this.queue.addStream(audioStream);
            this.visualizer.render(this.queue);

            if (!this.isPlaying) {
                console.info("Enqueue: Audio Player is not currently playing. Calling processNextInQueue()...");
                this.processNextInQueue();
            } else {
                console.info("Enqueue: Audio Player is already playing something. Skipping processNextInQueue().");
            }
        }

        async playNext() {
            console.log("PlayNext called");
            const currentStream = this.queue.getCurrentPlayingStream();

            if (currentStream) {
                console.log(`Completing current stream: ${currentStream.id}`);
                this.queue.updateStreamState(currentStream.id, "completed");
                this.stop();
            }

            // Get the next stream after the current one, regardless of its state
            const streams = Array.from(this.queue);
            const currentIndex = currentStream ? streams.indexOf(currentStream) : -1;
            const nextStream = streams[currentIndex + 1];

            if (nextStream) {
                console.log(`Found next stream: ${nextStream.id}, setting to queued`);
                this.queue.updateStreamState(nextStream.id, "queued");
                this.visualizer.update(this.queue);
                await this.processNextInQueue();
            } else {
                console.log("No next stream available");
                this.visualizer.update(this.queue);
            }
        }

        async playPrevious() {
            console.log("PlayPrevious called");
            const currentStream = this.queue.getCurrentPlayingStream();

            // If we're more than 3 seconds in, restart current track
            if (currentStream && this.audio.currentTime > 3) {
                console.log("Restarting current track");
                this.audio.currentTime = 0;
                if (!this.isPlaying) {
                    this.play();
                }
                return;
            }

            // Find the previous completed track
            const streams = Array.from(this.queue);
            const currentIndex = currentStream ? streams.indexOf(currentStream) : streams.length;

            // Stop current playback if any
            if (currentStream) {
                this.queue.updateStreamState(currentStream.id, "completed");
                this.stop();
            }

            // Find the last track before current that we can play
            for (let i = currentIndex - 1; i >= 0; i--) {
                const prevStream = streams[i];
                console.log(`Checking stream at index ${i}, state: ${prevStream.state}`);

                // We can play this stream
                console.log(`Setting stream ${prevStream.id} to queued for playback`);
                this.queue.updateStreamState(prevStream.id, "queued");
                this.visualizer.update(this.queue);
                await this.processNextInQueue();
                return;
            }

            // If we get here, no previous track was found
            console.log("No previous track found, restarting current if exists");
            if (currentStream) {
                this.queue.updateStreamState(currentStream.id, "queued");
                this.visualizer.update(this.queue);
                await this.processNextInQueue();
            }
        }


        async play() {
            console.log("Play called");
            if (!this.isPlaying) {
                if (this.audio.src) {
                    await this.audio.play();
                    this.isPlaying = true;
                    // Make sure visualization reflects current state
                    const currentStream = this.queue.getCurrentPlayingStream();
                    if (currentStream) {
                        this.queue.updateStreamState(currentStream.id, "playing");
                        this.visualizer.update(this.queue);
                    }
                } else {
                    // If nothing is loaded, try to process next in queue
                    await this.processNextInQueue();
                }
            }
        }




        pause() {
            console.log("Pause called");
            this.audio.pause();
            this.isPlaying = false;
        }

        stop() {
            console.log("Stop called");
            this.audio.pause();
            this.audio.currentTime = 0;
            this.isPlaying = false;
        }

        clearQueue() {
            console.log("Clear queue called");
            this.stop();
            this.queue = new AudioStreamQueue();
            this.visualizer.update(this.queue);
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
        //   container.style.cssText = `
        //   position: absolute;  /* Change to absolute for flexible movement */
        //   top: 20px;
        //   left: calc(100% - 140px);
        //   z-index: 1000;
        //   background-color: rgba(30, 41, 59, 0.8);
        //   padding: 5px;
        //   border-radius: 8px;
        //   box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        //   cursor: move;
        //   user-select: none;
        //   width: 150px;  /* Set a fixed width */
        //   height: 100px; /* Set a fixed height */
        //   transition: width 0s, height 0s;  /* Prevent resizing transitions */
        // `;
        applyContainerStyles() {
            Object.assign(this.container.style, {
                position: "fixed",
                right: "20px",  // Changed from left calc
                top: "20px",
                width: "auto",  // Changed from fixed width
                minWidth: "180px", // Minimum width to maintain usability
                height: "auto", // Changed from fixed height
                cursor: "move",
                userSelect: "none",
                transition: "var(--transition-standard)",
                background: "var(--surface-floating)",
                backdropFilter: "var(--backdrop-blur)",
                borderRadius: "var(--border-radius-standard)",
                padding: "0.25rem",
                color: "var(--text-primary)",
                fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                zIndex: "1000",
                boxShadow: "var(--box-shadow-combined)",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem"
            });
        }


        createTitle() {
            const title = document.createElement("div");
            title.className = "voicefaster__header";
            Object.assign(title.style, {
                padding: "0.25rem",
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                borderBottom: "1px solid var(--surface-deep)",
                cursor: "grab"
            });
            title.textContent = "VoiceFaster";
            return title;
        }


        createButtonContainer() {
            const buttonContainer = document.createElement("div");
            Object.assign(buttonContainer.style, {
                display: "flex",
                gap: "0.25rem",
                justifyContent: "flex-start",
                padding: "0.25rem"
            });

            const buttonData = [
                { text: "Previous", emoji: "⏮️", action: () => this.audioPlayer.playPrevious() },
                { text: "Play", emoji: "▶️", action: () => this.audioPlayer.play() },
                { text: "Pause", emoji: "⏸️", action: () => this.audioPlayer.pause() },
                { text: "Stop", emoji: "⏹️", action: () => this.audioPlayer.stop() },
                { text: "Next", emoji: "⏭️", action: () => this.audioPlayer.playNext() },
                { text: "Clear", emoji: "🗑️", action: () => this.audioPlayer.clearQueue() }
            ];

            buttonData.forEach(({ text, emoji, action }) => {
                const button = this.createButton(text, emoji, action);
                buttonContainer.appendChild(button);
            });

            return buttonContainer;
        }


        createButton(text, emoji, action) {
            const button = document.createElement("button");
            button.innerHTML = emoji; // Only show emoji, no text
            button.title = text; // Show text as tooltip
            Object.assign(button.style, {
                background: "var(--state-idle)",
                border: "none",
                color: "var(--text-primary)",
                padding: "0.375rem",
                width: "2rem",
                height: "2rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.875rem",
                margin: "0",
                cursor: "pointer",
                borderRadius: "0.375rem",
                transition: "var(--transition-standard)"
            });

            button.addEventListener("mouseenter", () => {
                button.style.background = "var(--primary-faint)";
            });

            button.addEventListener("mouseleave", () => {
                button.style.background = "var(--state-idle)";
            });

            if (typeof action === "function") {
                button.addEventListener("click", action);
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
            versionDisplay.textContent = `Version: ${this.audioPlayer.version || "undefined"
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
                if (e.target.tagName.toLowerCase() === 'button') return; // Don't drag when clicking buttons

                isDragging = true;
                element.classList.add('voicefaster--dragging'); // Add dragging class for visual feedback

                // Get initial positions
                startX = e.clientX || e.touches[0].clientX;
                startY = e.clientY || e.touches[0].clientY;
                const rect = element.getBoundingClientRect();
                initialX = rect.left;
                initialY = rect.top;

                if (e.preventDefault) e.preventDefault();
            }

            function drag(e) {
                if (!isDragging) return;

                const clientX = e.clientX || e.touches[0].clientX;
                const clientY = e.clientY || e.touches[0].clientY;
                const deltaX = clientX - startX;
                const deltaY = clientY - startY;

                // Only update left and top positions
                const newX = initialX + deltaX;
                const newY = initialY + deltaY;

                // Ensure the element stays within viewport bounds
                const rect = element.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width;
                const maxY = window.innerHeight - rect.height;

                element.style.left = `${Math.min(Math.max(0, newX), maxX)}px`;
                element.style.top = `${Math.min(Math.max(0, newY), maxY)}px`;

                // Remove right positioning when dragging
                element.style.right = 'auto';
            }

            function stopDragging() {
                if (!isDragging) return;
                isDragging = false;
                element.classList.remove('voicefaster--dragging');
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
