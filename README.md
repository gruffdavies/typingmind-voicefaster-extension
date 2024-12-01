# VoiceFaster Extension and Plugin for TypingMind

## Current Versions

Extension: 2.3.37
Plugin: 2.3

Last updated: 2024-Dec-01 13:00 (UTC)

## Overview

VoiceFaster is an agent and user voice interaction interface, originally designed for use with [TypingMind](https://docs.typingmind.com/), but can be used in any web app context. It provides enhanced voice capabilities:

- Fast Agent Text-to-Speech via ElevenLabs streaming API
- Real-time Speech-to-Text via DeepGram or Web Speech API
- Real-time audio visualization
- Queueing system for voice responses
- Drag-and-drop interface

Agent Speech is provided as a plugin tool for TypingMind. I.e. the agent is aware of the tool and can use it according to its context instructions or  the user's instructions.

This allows the agent to voice none, some or all of its text responses, or a summary of what is written on the screen.

User voice is transribed and sent to the agent chat window as text in real time using the browser Web Speech API, or for better results, DeepGram Cloud API.

## Components

### Extension

- Renders a floating UI widget with microphone and speaker controls
- Handles audio streaming and playback
- Manages speech recognition
- Provides visual feedback through audio visualizers
- Implements a queuing system for multiple voice responses

### Plugin

- Constructs API requests for ElevenLabs voice synthesis
- Communicates with the extension via window messaging
- Manages voice selection and settings
- Handles error cases and fallbacks

## Installation

1. Set the extension URL in TypingMind:
   - Navigate to Menu > Settings > Advanced Settings > Extensions
   - Add: `https://gruffdavies.github.io/typingmind-voicefaster-extension/live/voicefaster-extension-v2.3.37.js`

2. Configure API Keys in TypingMind settings:
   - ElevenLabs API key (required for TTS)
   - DeepGram API key (optional, enables enhanced STT)

## Features

- **Text-to-Speech**
  - Streaming audio playback
  - Multiple voice options
  - Queue management for responses
  - Visual feedback during playback

- **Speech-to-Text**
  - DeepGram integration (primary)
  - Web Speech API fallback
  - Real-time transcription
  - Visual feedback during recording

- **User Interface**
  - Draggable widget
  - Audio visualization
  - Queue status indicators
  - Settings panel
  - Transcript view

## Important Notes

⚠️ **Security Considerations**

- Live extensions are injected directly into the browser
- Review code before implementation
- Use at your own discretion
- Consider maintaining your own fork

## Development

The repository is structured with three main branches:

- `live/`: Production-ready versions
- `test/`: Testing versions
- `dev/`: Development versions

Access raw code via:
`https://gruffdavies.github.io/typingmind-voicefaster-extension/{branch}/voicefaster-extension-v{VERSION}.js`


## Version Compatibility

- Extension and plugin versions are now synchronized (2.3.x)
- Breaking changes are indicated by major version changes
- Minor versions may add features but maintain compatibility
- Patch versions fix bugs and maintain compatibility

## Support

This is an experimental project with no official support. Users are encouraged to:

- Review code before use
- Fork the repository for stability
- Report issues via GitHub
- Test thoroughly in their environment

## License

[Add appropriate license information]

---

For the latest code and documentation, visit:
[https://github.com/gruffdavies/typingmind-voicefaster-extension]
