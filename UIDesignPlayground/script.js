
// Font Awesome classes
const ICONS = {
    mic: 'fas fa-microphone',
    micMuted: 'fas fa-microphone-slash',
    settings: 'fas fa-cog'
};

class AudioStream {
    constructor(streamRequestResponse) {
        this.id = generate_uuid();
        this.url = streamRequestResponse.url;
        this.headers = streamRequestResponse.headers;
        this.method = streamRequestResponse.method;
        this.body = streamRequestResponse.body;

        // Parse the text from the body
        try {
            const bodyJson = JSON.parse(this.body);
            this.text = bodyJson.text || '';
        } catch (e) {
            this.text = '';
        }

        this.state = "queued";
        this.startTime = null;
        this.endTime = null;
        this.progress = 0; // Add progress tracking
    }
}

class QueueManager {
    constructor(audioPlayer, visualizer) {
        this.audioPlayer = audioPlayer;
        this.visualizer = visualizer;
        this.expanded = false;
    }

    toggleExpansion() {
        this.expanded = !this.expanded;
        if (this.expanded) {
            this.visualizer.expandWithQueue();
        } else {
            this.visualizer.shrink();
        }
    }

    jumpToItem(id) {
        const stream = this.audioPlayer.queue.find(stream => stream.id === id);
        if (stream) {
            this.audioPlayer.stop();
            this.audioPlayer.playStream(stream);
        }
    }

    updateProgress(id, progress) {
        const stream = this.audioPlayer.queue.find(stream => stream.id === id);
        if (stream) {
            stream.progress = progress;
            this.visualizer.updateProgress(id, progress);
        }
    }
}
class AudioVisualizer {
    constructor(container, config = {}) {
        this.finalTranscript = '';
        this.interimTranscript = '';
        this.events = new Map();
        this.config = {
            fftSize: config.fftSize || 256,
            canvasSize: config.canvasSize || 48,
            barCount: config.barCount || 20,
            ...config // spread operator to merge default and user-defined configs
        };
        this.container = container;
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");
        this.mode = "idle";
        this.transcriptActive = false;
        this.styles = getComputedStyle(document.documentElement);
        this.setupCanvas();
        this.startAnimation();

        // Audio analysis setup
        this.audioContext = null;
        this.analyser = null;
        this.bufferLength = null;
        this.dataArray = null;

        // For speaking mode
        this.playbackAnalyser = null;
        this.playbackDataArray = null;

        this.isMuted = false;

        const DEEPGRAM_API_KEY = secrets.deepgramApiKey;
        console.log("DEEPGRAM_API_KEY", DEEPGRAM_API_KEY);

        const deepgramBaseURL = "wss://api.deepgram.com/v1/listen";
        const deepgramOptions = {
            model: "nova-2",
            language: "en-GB",
            smart_format: true,
            interim_results: true,
            vad_events: true,
            endpointing: 300
        };
        const keywords = ["keywords=KwizIQ:2"].join('&');

        const deepgramUrl = `${deepgramBaseURL}?${new URLSearchParams(deepgramOptions)}&${keywords}`;
        console.log("deepgramUrl", deepgramUrl);

        this.ws = new WebSocket(deepgramUrl, [
            "token",
            secrets.deepgramApiKey
        ]);
        this.ws.onopen = () => {
            this.ws.send(JSON.stringify({
                type: "Authorization",
                token: secrets.deepgramApiKey
            }));
        };

        // Add WebSocket handlers
        this.ws.onmessage = (event) => {
            const response = JSON.parse(event.data);
            if (response.type === "Results") {
                console.log("Received results:", response);
                const transcript = response.channel.alternatives[0].transcript;
                if (response.is_final) {
                    this.finalTranscript += transcript + ' ';
                    this.interimTranscript = '';
                } else {
                    this.interimTranscript = transcript;
                }
                this.updateTranscript(this.finalTranscript + this.interimTranscript);
            }
        };
    }

    // Add to AudioVisualizer class
    cleanup() {
        if (this.ws) {
            this.ws.close();
        }
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
        }
    }


    async setupRecording() {
        try {
            // Initialize audio context only when needed
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 256;
                this.bufferLength = this.analyser.frequencyBinCount;
                this.dataArray = new Uint8Array(this.bufferLength);
            }

            // Now we can safely check the state
            if (this.audioContext && this.audioContext.state === "suspended") {
                await this.audioContext.resume();
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.currentStream = stream;
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(this.analyser);

            // Add Deepgram streaming
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && this.ws.readyState === 1) {
                    event.data.arrayBuffer().then(buffer => {
                        this.ws.send(buffer);
                    });
                }
            };
            mediaRecorder.start(250);

            return stream;
        } catch (err) {
            console.error("Error accessing microphone:", err);
            return null;
        }
    }

    on(event, callback) {
        this.events.set(event, callback);
    }

    emit(event, data) {
        const callback = this.events.get(event);
        if (callback) callback(data);
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.currentStream) {
            this.currentStream.getAudioTracks().forEach((track) => {
                track.enabled = !this.isMuted;
            });
        }
        return this.isMuted;
    }



    // For playback (speaking mode)
    setupPlayback(audioElement) {
        const source = this.audioContext.createMediaElementSource(audioElement);
        this.playbackAnalyser = this.audioContext.createAnalyser();
        this.playbackAnalyser.fftSize = 256;
        this.playbackDataArray = new Uint8Array(
            this.playbackAnalyser.frequencyBinCount
        );

        source.connect(this.playbackAnalyser);
        this.playbackAnalyser.connect(this.audioContext.destination);
    }

    getColor(varName) {
        return this.styles.getPropertyValue(varName).trim();
    }

    setupCanvas() {
        const size = 48;
        this.canvas.width = size;
        this.canvas.height = size;
        Object.assign(this.canvas.style, {
            borderRadius: "50%",
            backgroundColor: this.getColor("--surface-raised"),
            transition: "var(--transition-standard);"
        });
    }

    drawRocketIdle() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = this.canvas.width * 0.3;
        const time = Date.now() / 1000;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Outer ring with subtle pulse
        this.ctx.beginPath();
        const pulseOpacity = 0.3 + 0.1 * Math.sin(time * 2);
        this.ctx.strokeStyle = this.getColor("--glow-outer");
        this.ctx.lineWidth = 2;
        this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        this.ctx.stroke();

        // Inner "core" with gentle glow
        const gradient = this.ctx.createRadialGradient(
            centerX,
            centerY,
            0,
            centerX,
            centerY,
            radius * 0.7
        );
        gradient.addColorStop(0, this.getColor("--glow-core"));
        gradient.addColorStop(1, "transparent");
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
    }

    drawRocketListening() {
        if (this.canvas.width === 48) {
            this.expandCanvas(200, 60);
        }

        const centerY = this.canvas.height / 2;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Safety check for analyser
        if (!this.analyser) return;

        this.analyser.getByteFrequencyData(this.dataArray);

        const bars = 20;
        const barWidth = 4;
        const spacing = 6;
        const maxHeight = this.canvas.height * 0.8;

        this.ctx.fillStyle = this.getColor("--vis-listening");

        // Use actual frequency data for bar heights
        for (let i = 0; i < bars; i++) {
            // Map our 20 bars to the frequency data (which is this.bufferLength long)
            const dataIndex = Math.floor((i / bars) * this.bufferLength);
            const value = this.dataArray[dataIndex];

            // Normalize height (frequency data is 0-255)
            const height = (value / 255) * maxHeight;

            const x =
                (this.canvas.width - bars * (barWidth + spacing)) / 2 +
                i * (barWidth + spacing);
            const y = centerY - height / 2;

            this.ctx.fillRect(x, y, barWidth, height);
        }
    }

    drawRocketSpeaking() {
        if (this.canvas.width === 48) {
            this.expandCanvas(200, 60);
        }

        const centerY = this.canvas.height / 2;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Get playback audio data
        if (this.playbackAnalyser) {
            this.playbackAnalyser.getByteTimeDomainData(this.playbackDataArray);
        }

        const points = [];
        const segments = 50;

        // Use actual waveform data if available
        for (let i = 0; i <= segments; i++) {
            const x = (i / segments) * this.canvas.width;
            let y;

            if (this.playbackAnalyser) {
                // Map our segments to the waveform data
                const dataIndex = Math.floor(
                    (i / segments) * this.playbackDataArray.length
                );
                const value = this.playbackDataArray[dataIndex];
                // Convert 0-255 to actual waveform (-1 to 1)
                const normalizedValue = (value - 128) / 128;
                y = centerY + normalizedValue * this.canvas.height * 0.3;
            } else {
                // Fallback to animation if no audio data
                const time = Date.now() / 1000;
                y =
                    centerY +
                    Math.sin(i * 0.2 + time * 2) * 10 +
                    Math.sin(i * 0.1 + time * 3) * 5;
            }

            points.push({ x, y });
        }

        // Draw the waveform
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length - 2; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            this.ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }

        this.ctx.strokeStyle = this.getColor("--vis-speaking");
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
    }

    expandCanvas(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        Object.assign(this.canvas.style, {
            borderRadius: "12px",
            transform: "scale(1)",
            transition: "all 0.3s ease"
        });
    }

    shrinkCanvas() {
        const size = 48;
        this.canvas.width = size;
        this.canvas.height = size;
        Object.assign(this.canvas.style, {
            borderRadius: "50%",
            transform: "scale(1)"
        });
    }

    // Method to handle mode changes with audio setup
    async setMode(mode) {
        if (this.audioContext && mode === 'idle') {
            await this.audioContext.close();
            this.audioContext = null;
        }

        if (mode === this.mode) return;

        // Cleanup previous mode
        if (this.currentStream) {
            this.currentStream.getTracks().forEach((track) => track.stop());
            this.currentStream = null;
        }

        this.mode = mode;
        if (mode === "idle") {
            this.ws.close();
            this.shrinkCanvas();
            this.hideTranscript();
        } else if (mode === "listening") {
            this.expandCanvas(200, 60);
            this.showTranscript();
            // Setup microphone input
            this.currentStream = await this.setupRecording();
        } else if (mode === "speaking") {
            this.expandCanvas(200, 60);
            // Setup audio playback analysis if not already done
            if (!this.playbackAnalyser && this.audioElement) {
                this.setupPlayback(this.audioElement);
            }
        }
    }

    showTranscript() {
        const transcriptArea = document.getElementById("transcript-area");
        if (transcriptArea) {
            transcriptArea.classList.add("active");
            this.transcriptActive = true;
        }
    }

    hideTranscript() {
        const transcriptArea = document.getElementById("transcript-area");
        if (transcriptArea) {
            transcriptArea.classList.remove("active");
            this.transcriptActive = false;
        }
    }

    updateTranscript(text) {
        const transcriptArea = document.getElementById("transcript-content");
        if (transcriptArea) {
            // Clear existing content
            transcriptArea.innerHTML = '';

            // Add final transcript with default color
            const finalSpan = document.createElement('span');
            finalSpan.textContent = this.finalTranscript;
            transcriptArea.appendChild(finalSpan);

            // Add interim transcript with different color
            if (this.interimTranscript) {
                const interimSpan = document.createElement('span');
                interimSpan.textContent = this.interimTranscript;
                interimSpan.style.color = getComputedStyle(document.documentElement)
                    .getPropertyValue('--text-transcript-interim').trim();
                transcriptArea.appendChild(interimSpan);
            }

            transcriptArea.scrollTop = transcriptArea.scrollHeight;
        }
    }


    startAnimation() {
        let animationFrameId;
        const animate = () => {
            switch (this.mode) {
                case "idle":
                    this.drawRocketIdle();
                    break;
                case "listening":
                    this.drawRocketListening();
                    break;
                case "speaking":
                    this.drawRocketSpeaking();
                    break;
            }
            animationFrameId = requestAnimationFrame(animate);
        };
        animate();
        // cleanup
        this.stopAnimation = () => {
            cancelAnimationFrame(animationFrameId);
        };
    }

    updateStatus(message) {
        const statusIndicator = document.getElementById("status-indicator");
        if (statusIndicator) {
            statusIndicator.textContent = message;
        }
    }
}

function createIconElement(iconClass) {
    const icon = document.createElement('i');
    icon.className = iconClass;
    return icon;
}

function setButtonIcon(button, iconClass) {
    button.innerHTML = ''; // Clear existing content
    button.appendChild(createIconElement(iconClass));
}

function initializeUI() {
    // Create container
    container = document.createElement("div");
    container.id = "voicefaster-player";

    // Create header section
    const header = document.createElement("div");
    header.className = "player-header";

    // Create visualizer and make it globally accessible
    window.visualizer = new AudioVisualizer(container);
    header.appendChild(visualizer.canvas);

    // Add controls
    const controls = document.createElement("div");
    controls.className = "controls";













    // Create mic button
    const micButton = document.createElement("button");
    micButton.id = "mic-button";
    setButtonIcon(micButton, 'bi-mic-fill');
    micButton.addEventListener("click", async function (e) {
        // Resume AudioContext on user interaction
        if (visualizer.audioContext.state === "suspended") {
            await visualizer.audioContext.resume();
        }

        if (e.shiftKey || visualizer.mode === "idle") {
            toggleRecording();
        } else {
            toggleMute(e);
        }
    });
    micButton.title = "Click to mute/unmute, Shift+Click to stop recording";

    // Create settings button
    const settingsButton = document.createElement("button");
    settingsButton.id = "settings-button";
    setButtonIcon(settingsButton, 'bi-gear-fill');
    settingsButton.title = "Settings";
    settingsButton.addEventListener("click", () => console.log("Settings clicked"));

    // Add buttons to controls
    controls.appendChild(micButton);
    controls.appendChild(settingsButton);
    header.appendChild(controls);

    // Add status indicator
    const status = document.createElement("div");
    status.id = "status-indicator";
    status.textContent = "Idle";
    header.appendChild(status);

    // Create transcript area
    const transcriptArea = document.createElement("div");
    transcriptArea.id = "transcript-area";
    transcriptArea.className = "transcript-area";
    transcriptArea.innerHTML = `
<div id="transcript-content"></div>
<div class="transcript-controls">
    <button id="send-transcript">Send</button>
    <button id="clear-transcript">Clear</button>
</div>
`;

    // Add everything to container
    container.appendChild(header);
    container.appendChild(transcriptArea);
    document.body.appendChild(container);

    // Add event listeners for transcript buttons only
    document.getElementById("send-transcript").addEventListener("click", sendTranscript);
    document.getElementById("clear-transcript").addEventListener("click", clearTranscript);

    // Initialize drag functionality
    initializeDrag(container);
}


function initializeDrag(element) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    function dragStart(e) {
        // Ignore if target is a button
        if (e.target.tagName.toLowerCase() === "button") {
            return;
        }

        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

        if (
            e.target === element ||
            e.target.parentNode === element ||
            e.target.parentNode.parentNode === element
        ) {
            isDragging = true;
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            setTranslate(currentX, currentY, element);
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }

    // Add the event listeners
    element.addEventListener("mousedown", dragStart, false);
    document.addEventListener("mousemove", drag, false);
    document.addEventListener("mouseup", dragEnd, false);
}

function toggleRecording() {
    const isListening = visualizer.mode === "listening";
    const newMode = isListening ? "idle" : "listening";
    visualizer.setMode(newMode);

    const status = document.getElementById("status-indicator");
    const micButton = document.getElementById("mic-button");

    if (isListening) {
        // Switching to idle
        status.textContent = "Idle";
        setButtonIcon(micButton, 'bi-mic-fill');
        micButton.classList.remove("active");
    } else {
        // Switching to listening
        status.textContent = visualizer.isMuted ? "Muted" : "Listening...";
        setButtonIcon(micButton, visualizer.isMuted ? 'bi-mic-mute-fill' : 'bi-mic-fill');
        micButton.classList.add("active");
    }
}

function toggleMute(event) {
    event.stopPropagation();

    if (visualizer.mode !== "listening") return;

    const isMuted = visualizer.toggleMute();
    const status = document.getElementById("status-indicator");
    const micButton = document.getElementById("mic-button");

    status.textContent = isMuted ? "Muted" : "Listening...";
    setButtonIcon(micButton, isMuted ? 'bi-mic-mute-fill' : 'bi-mic-fill');
}

function sendTranscript() {
    const content = document.getElementById("transcript-content").textContent;
    console.log("Sending transcript:", content);
    // Here you would integrate with TypingMind's input mechanism
    clearTranscript();
    visualizer.setMode("idle");
}

function clearTranscript() {
    document.getElementById("transcript-content").textContent = "";
}

// For demo purposes, add some sample transcript updates
//        function simulateTranscript() {
//            if (visualizer.mode === "listening") {
//                const words = [
//                    "Hello",
//                    "this",
//                    "is",
//                    "a",
//                    "test",
//                    "transcript",
//                    "being",
//                    "generated",
//                    "in",
//                    "real",
//                    "time"
//                ];
//                const currentContent = document.getElementById("transcript-content")
//                    .textContent;
//                const newWord = words[Math.floor(Math.random() * words.length)];
//                visualizer.updateTranscript(currentContent + " " + newWord);
//            }
//        }
//
//        // Simulate transcript updates every second when in listening mode
//        setInterval(simulateTranscript, 1000);
//
// Initialize everything when the document is loaded
document.addEventListener("DOMContentLoaded", initializeUI);
// populate demo-version div with the version from  secrets.version
document.getElementById("demo-version").textContent = "v" + version.version;

