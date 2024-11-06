export class EventEmitter {
    constructor() {
        this.events = new Map();
    }

    on(eventName, callback) {
        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }
        this.events.get(eventName).push(callback);
        return this; // For method chaining
    }

    off(eventName, callback) {
        if (!this.events.has(eventName)) return this;
        if (!callback) {
            this.events.delete(eventName);
            return this;
        }
        const callbacks = this.events.get(eventName);
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
            callbacks.splice(index, 1);
            if (callbacks.length === 0) {
                this.events.delete(eventName);
            }
        }
        return this;
    }

    emit(eventName, ...args) {
        if (!this.events.has(eventName)) return;
        for (const callback of this.events.get(eventName)) {
            callback(...args);
        }
        return this;
    }

    once(eventName, callback) {
        const onceWrapper = (...args) => {
            callback(...args);
            this.off(eventName, onceWrapper);
        };
        return this.on(eventName, onceWrapper);
    }
}
