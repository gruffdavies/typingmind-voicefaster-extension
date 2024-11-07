class VoiceFasterPrototype {
    constructor() {
        this.widget = document.querySelector('.voicefaster');
        this.header = this.widget.querySelector('.voicefaster__header');
        this.micButton = this.widget.querySelector('.voicefaster__mic-button');
        this.isDragging = false;
        this.currentX = 0;
        this.currentY = 0;
        this.initialX = 0;
        this.initialY = 0;
        this.xOffset = 0;
        this.yOffset = 0;

        this.initializeDragging();
        this.initializeMicButton();
        this.initializeMockInterface();
    }

    initializeDragging() {
        this.header.addEventListener('mousedown', e => this.dragStart(e));
        document.addEventListener('mousemove', e => this.drag(e));
        document.addEventListener('mouseup', () => this.dragEnd());
    }

    dragStart(e) {
        if (!e.target.closest('.voicefaster__header')) return;

        this.initialX = e.clientX - this.xOffset;
        this.initialY = e.clientY - this.yOffset;
        this.isDragging = true;
        this.widget.classList.add('voicefaster--dragging');
    }

    drag(e) {
        if (!this.isDragging) return;

        e.preventDefault();
        this.currentX = e.clientX - this.initialX;
        this.currentY = e.clientY - this.initialY;

        this.xOffset = this.currentX;
        this.yOffset = this.currentY;

        this.setTranslate(this.currentX, this.currentY, this.widget);
    }

    dragEnd() {
        this.isDragging = false;
        this.widget.classList.remove('voicefaster--dragging');
    }

    setTranslate(xPos, yPos, el) {
        el.style.transform = `translate(${xPos}px, ${yPos}px)`;
    }

    initializeMicButton() {
        this.micButton?.addEventListener('click', () => {
            this.widget.classList.toggle('voicefaster--listening');
            this.micButton.style.background = this.widget.classList.contains('voicefaster--listening')
                ? 'var(--state-listening)'
                : 'var(--state-idle)';
        });
    }

    createQueueBubble(text) {
        const bubble = document.createElement('div');
        bubble.className = 'queue-item requesting';
        bubble.title = text;

        const states = ['requesting', 'queued', 'playing', 'completed', 'error', 'stale'];
        let currentStateIndex = 0;

        bubble.addEventListener('click', () => {
            currentStateIndex = (currentStateIndex + 1) % states.length;
            bubble.className = `queue-item ${states[currentStateIndex]}`;
        });

        const info = document.createElement('div');
        info.className = 'bubble-info';

        bubble.addEventListener('mouseenter', () => {
            info.textContent = `${states[currentStateIndex]}: ${text}`;
            info.style.opacity = '1';
        });

        bubble.addEventListener('mouseleave', () => {
            info.style.opacity = '0';
        });

        bubble.appendChild(info);
        return bubble;
    }

    initializeMockInterface() {
        const mockChat = document.createElement('div');
        mockChat.innerHTML = `
            <div style="position: fixed; left: 20px; bottom: 20px; background: var(--surface-floating); padding: 1rem; border-radius: var(--border-radius-standard); color: var(--text-primary);">
                <div style="margin-bottom: 1rem;">Mock Messages:</div>
                <button id="mockMessage1">Send "Hello, how are you?"</button><br><br>
                <button id="mockMessage2">Send "Testing the transcription..."</button>
            </div>
        `;
        document.body.appendChild(mockChat);

        // Since we don't have a queue tray in the new structure yet, let's add one
        const queueTray = document.createElement('div');
        queueTray.className = 'queue-bubble-tray';
        this.widget.querySelector('.voicefaster__controls').appendChild(queueTray);
        this.queueTray = queueTray;

        document.getElementById('mockMessage1')?.addEventListener('click', () => {
            const bubble = this.createQueueBubble("Hello, how are you?");
            this.queueTray.appendChild(bubble);
        });

        document.getElementById('mockMessage2')?.addEventListener('click', () => {
            const bubble = this.createQueueBubble("Testing the transcription...");
            this.queueTray.appendChild(bubble);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VoiceFasterPrototype();
});
