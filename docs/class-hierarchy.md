# Design Diagrams

## Overview
```mermaid
graph TB
    subgraph TypingMind["TypingMind Application"]
        AI[AI Assistant]
        Settings[Settings Manager]
        Runner[Plugin Runner]
    end

    subgraph Sandbox["Plugin Sandbox"]
        VFPlugin[VOICEFASTER_stream_voice_audio]
    end

    subgraph Extension["VoiceFaster Extension"]
        subgraph UI["UI Layer"]
            UIManager
            Visualizer[Queue Visualizer]
        end

        subgraph Core["Core"]
            Player[Audio Player]
            Queue[Audio Queue]
            StreamMgr[Stream Manager]
        end
    end

    subgraph External["External"]
        ElevenLabs[ElevenLabs API]
    end

    AI -->|"1. Request TTS"| Runner
    Settings -->|"2. Provide settings"| Runner
    Runner -->|"3. Call with params & settings"| VFPlugin
    VFPlugin -->|"4. postMessage"| UI
    UI -->|"5. Queue request"| Core
    Core -->|"6. Fetch audio"| ElevenLabs
    Core -->|"7. Update"| Visualizer

    classDef tm fill:#f9f,stroke:#333,stroke-width:2px;
    classDef sandbox fill:#fff,stroke:#333,stroke-width:2px,stroke-dasharray: 5 5;
    classDef ext fill:#9f9,stroke:#333,stroke-width:2px;
    classDef api fill:#fff,stroke:#333,stroke-width:2px;

    class AI,Settings,Runner,TypingMind tm;
    class VFPlugin,Sandbox sandbox;
    class UIManager,Visualizer,Player,Queue,StreamMgr,Extension,UI,Core ext;
    class ElevenLabs,External api;
```

## Data storage and Security architecture

```mermaid
graph TB
    subgraph TypingMind["TypingMind Origin (Sandbox)"]
        Plugin[VoiceFaster Plugin]
        subgraph Storage["Chrome LocalStorage"]
            Settings["userSettings:{<br/>elevenLabsApiKey: 'key',<br/>defaultVoiceId: 'id'<br/>}"]
        end
    end

    subgraph BrowserContext["Browser Main Context"]
        subgraph Extension["VoiceFaster Extension"]
            MessageHandler["Post Message Handler"]
            SecurityLayer["Security Layer:<br/>- Origin Check<br/>- Payload Validation"]
            AudioSystem["Audio System"]
        end
    end

    subgraph ExternalAPI["External Services"]
        ElevenLabs["ElevenLabs API"]
    end

    Plugin -->|"1. userSettings = JSON.parse(localStorage.getItem())"| Settings
    Plugin -->|"2. postMessage({<br/>type: 'QUEUE_AUDIO_STREAM',<br/>payload: {headers: {'xi-api-key': apiKey}}<br/>})"| MessageHandler
    MessageHandler -->|"3. Validate Origin"| SecurityLayer
    SecurityLayer -->|"4. Pass to"| AudioSystem
    AudioSystem -->|"5. Fetch with<br/>headers: {'xi-api-key': apiKey}"| ElevenLabs

    classDef sandbox fill:#ffe6e6,stroke:#333,stroke-width:2px;
    classDef extension fill:#e6ffe6,stroke:#333,stroke-width:2px;
    classDef storage fill:#e6e6ff,stroke:#333,stroke-width:2px;
    classDef external fill:#fff,stroke:#333,stroke-width:2px;

    class Plugin,TypingMind sandbox;
    class Extension,MessageHandler,SecurityLayer,AudioSystem extension;
    class Settings,Storage storage;
    class ElevenLabs,ExternalAPI external;
```


## security boundaries and data access

```mermaid
sequenceDiagram
    participant TM as TypingMind App
    participant Plugin as Plugin Function
    participant Window as Parent Window
    participant Ext as VoiceFaster Extension
    participant API as ElevenLabs API

    Note over TM,API: Function Invocation
    TM->>Plugin: Call VOICEFASTER_stream_voice_audio(<br/>params, userSettings)
    activate Plugin
    Note right of Plugin: userSettings contains:<br/>• elevenLabsApiKey<br/>• defaultVoiceId

    Plugin->>Plugin: Construct payload with:<br/>headers: {'xi-api-key': userSettings.elevenLabsApiKey}
    Plugin->>Window: postMessage('QUEUE_AUDIO_STREAM', payload)
    deactivate Plugin

    Window->>Ext: Message Event Listener
    activate Ext

    Note over Ext,API: Extension Processing
    Ext->>API: Authenticated Request
    API-->>Ext: Audio Stream

    Ext->>Ext: Process Audio
    deactivate Ext

    Note over TM,API: Security Context
    rect rgb(240, 240, 255)
        Note over TM,Plugin: TypingMind Sandbox Environment
    end
    rect rgb(230, 255, 230)
        Note over Ext: Extension Context
    end

```


## v1.3.1 Voice Faster Extension IIFE TTS)

```mermaid
classDiagram
    class UIManager {
        -AudioPlayer audioPlayer
        -AudioStreamQueueVisualizer visualizer
        +createPlayerAndControls()
        +createButton()
        +makeDraggable()
    }

    class AudioPlayer {
        -Audio audio
        -AudioStreamQueue queue
        -AudioStreamQueueVisualizer visualizer
        -Boolean isPlaying
        +queueAudioStream()
        +processNextInQueue()
        +play()
        +pause()
        +stop()
        +playNext()
        +playPrevious()
    }

    class AudioStreamQueue {
        -Array streams
        -Number maxSize
        -Number maxAge
        +addStream()
        +removeStream()
        +getNextQueuedStream()
        +getCurrentPlayingStream()
        +updateStreamState()
    }

    class AudioStream {
        -String id
        -String url
        -Object headers
        -String method
        -Object body
        -String state
        -Date startTime
        -Date endTime
        +updateState()
        +isStale()
        +refreshState()
    }

    class AudioStreamQueueVisualizer {
        -HTMLElement container
        -Number maxDisplayed
        +update()
        +render()
        -createStreamElement()
        +addStyles()
    }

    class StreamRequestResponse {
        -String url
        -String method
        -Object headers
        -Object body
        -initializeMembers()
    }

    UIManager --> AudioPlayer : manages
    UIManager --> AudioStreamQueueVisualizer : manages
    AudioPlayer --> AudioStreamQueue : manages
    AudioPlayer --> AudioStreamQueueVisualizer : updates
    AudioStreamQueue --> AudioStream : contains
    AudioStream --> StreamRequestResponse : uses data from
```

### PLugin and Extension Interaction Sequence Diagram

```mermaid
sequenceDiagram
    participant AI as AI Assistant
    participant Plugin as VoiceFaster Plugin
    participant Window as Parent Window
    participant Ext as VoiceFaster Extension
    participant Queue as AudioStreamQueue
    participant API as ElevenLabs API

    Note over AI,API: Voice Generation Flow
    AI->>Plugin: Call VOICEFASTER_stream_voice_audio
    activate Plugin
    Plugin->>Plugin: Construct payload with text & voice settings
    Plugin->>Window: postMessage('QUEUE_AUDIO_STREAM')
    deactivate Plugin

    Window->>Ext: Message Event Listener
    activate Ext
    Ext->>Queue: Create new AudioStream
    activate Queue
    Queue-->>Ext: Stream Added
    deactivate Queue

    Ext->>API: Fetch Stream Request
    activate API
    API-->>Ext: Audio Stream Response
    deactivate API

    Ext->>Ext: Create Blob URL
    Ext->>Queue: Update Stream State
    activate Queue
    Queue-->>Ext: State Updated
    deactivate Queue

    Ext->>Ext: Play Audio
    deactivate Ext

    Note over AI,API: State Management
    Ext->>Queue: Update Stream State (playing)
    activate Queue
    Queue->>Queue: Update Visualization
    deactivate Queue

    Note over AI,API: Completion
    Ext->>Queue: Update Stream State (completed)
    activate Queue
    Queue->>Queue: Update Visualization
    Queue-->>Ext: Process Next (if any)
    deactivate Queue
```

## detailed plugin structure

```mermaid
graph TB
    subgraph TypingMind["TypingMind Application"]
        Settings["User Settings"]
        Runner["Plugin Runner"]
    end

    subgraph Sandbox["Plugin Sandbox (iframe)"]
        Function["VOICEFASTER_stream_voice_audio"]
        subgraph Params["Parameters"]
            P1["params: {<br/>text: string,<br/>voice_id?: string<br/>}"]
            P2["userSettings: {<br/>elevenLabsApiKey: string,<br/>defaultVoiceId?: string<br/>}"]
        end
    end

    subgraph Extension["VoiceFaster Extension"]
        Handler["Message Handler"]
        Player["Audio Player System"]
    end

    Settings -->|"Passed to"| Runner
    Runner -->|"Invokes with settings"| Function
    Function -->|"postMessage"| Handler
    Handler -->|"Manages"| Player

    classDef app fill:#f9f,stroke:#333,stroke-width:2px;
    classDef sandbox fill:#fff,stroke:#333,stroke-width:2px,stroke-dasharray: 5 5;
    classDef ext fill:#9f9,stroke:#333,stroke-width:2px;

    class Settings,Runner app;
    class Function,Params,P1,P2,Sandbox sandbox;
    class Handler,Player,Extension ext;
```