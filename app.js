const piano = document.getElementById('piano');
const volumeInput = document.getElementById('volume');
const statusLine = document.getElementById('status');
const recordButton = document.getElementById('recordBtn');
const playButton = document.getElementById('playBtn');
const downloadMidiButton = document.getElementById('downloadMidiBtn');

const noteDefinitions = [];
for (let octave = 4; octave <= 5; octave += 1) {
  for (let semitone = 0; semitone < 12; semitone += 1) {
    const midi = (octave + 1) * 12 + semitone;
    noteDefinitions.push({
      midi,
      label: `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][semitone]}${octave}`,
      type: [1, 3, 6, 8, 10].includes(semitone) ? 'black' : 'white',
    });
  }
}

const noteIndexByMidi = new Map(noteDefinitions.map((note, index) => [note.midi, index]));
const activePressCounts = new Map();
const activePointers = new Map();
const keyElements = new Map();

let audioContext = null;
let workletNode = null;
let noteStateBuffer = new Uint8Array(noteDefinitions.length);
let sharedBuffer = null;
let isAudioReady = false;
let isRecording = false;
let recordingStartedAt = null;
let recordedEvents = [];
let isPlayingBack = false;
let playbackTimeoutIds = [];

function createKeyboardLayout() {
  piano.innerHTML = '';
  keyElements.clear();

  const whiteKeyWidth = Math.min(56, Math.max(32, piano.clientWidth / 14));
  const blackKeyWidth = Math.max(24, whiteKeyWidth * 0.62);
  const whiteCount = { value: 0 };

  noteDefinitions.forEach((note) => {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = `key key--${note.type}`;
    key.dataset.midi = String(note.midi);
    key.dataset.label = note.label;
    key.textContent = note.label;
    key.setAttribute('aria-label', note.label);

    if (note.type === 'white') {
      key.style.left = `${whiteCount.value * whiteKeyWidth}px`;
      key.style.width = `${whiteKeyWidth}px`;
      whiteCount.value += 1;
    } else {
      key.style.left = `${whiteCount.value * whiteKeyWidth - blackKeyWidth / 2}px`;
      key.style.width = `${blackKeyWidth}px`;
      key.style.height = `${Math.round(whiteKeyWidth * 1.65)}px`;
    }

    key.addEventListener('pointerdown', handlePointerDown);
    key.addEventListener('pointermove', handlePointerMove);
    key.addEventListener('pointerup', handlePointerEnd);
    key.addEventListener('pointercancel', handlePointerEnd);
    key.addEventListener('pointerleave', handlePointerLeave);

    piano.appendChild(key);
    keyElements.set(note.midi, key);
  });
}

async function initAudio() {
  if (isAudioReady) {
    return;
  }

  if (!window.AudioContext && !window.webkitAudioContext) {
    statusLine.textContent = 'This browser does not support Web Audio.';
    return;
  }

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await audioContext.resume();

    try {
      sharedBuffer = typeof SharedArrayBuffer !== 'undefined' ? new SharedArrayBuffer(noteDefinitions.length) : null;
      noteStateBuffer = sharedBuffer ? new Uint8Array(sharedBuffer) : new Uint8Array(noteDefinitions.length);
    } catch (error) {
      sharedBuffer = null;
      noteStateBuffer = new Uint8Array(noteDefinitions.length);
    }

    await audioContext.audioWorklet.addModule(new URL('./synth-processor.js', import.meta.url));
    workletNode = new AudioWorkletNode(audioContext, 'synth-processor');
    workletNode.connect(audioContext.destination);

    workletNode.port.postMessage({ type: 'init', noteCount: noteDefinitions.length, buffer: sharedBuffer });
    workletNode.port.postMessage({ type: 'volume', volume: Number(volumeInput.value) });

    isAudioReady = true;
    statusLine.textContent = 'Audio ready. Press or drag to play.';
  } catch (error) {
    console.error('Audio initialization failed', error);
    statusLine.textContent = 'Audio setup failed. Please reload and try again.';
  }
}

function setNoteState(noteMidi, active) {
  const index = noteIndexByMidi.get(noteMidi);
  if (index === undefined) {
    return;
  }

  const currentCount = activePressCounts.get(noteMidi) || 0;
  const wasActive = currentCount > 0;
  const nextCount = active ? currentCount + 1 : Math.max(0, currentCount - 1);
  activePressCounts.set(noteMidi, nextCount);

  const shouldBeActive = nextCount > 0;
  const key = keyElements.get(noteMidi);
  if (key) {
    key.classList.toggle('is-active', shouldBeActive);
  }

  if (shouldBeActive && !active) {
    return;
  }

  if (isRecording && !isPlayingBack && wasActive !== shouldBeActive) {
    if (recordingStartedAt === null) {
      if (!shouldBeActive) {
        return;
      }
      recordingStartedAt = performance.now();
      statusLine.textContent = 'Recording...';
    }

    recordedEvents.push({
      timeMs: Math.max(0, Math.round(performance.now() - recordingStartedAt)),
      midi: noteMidi,
      action: shouldBeActive ? 'on' : 'off',
    });
  }

  noteStateBuffer[index] = shouldBeActive ? 1 : 0;

  if (workletNode && !sharedBuffer) {
    workletNode.port.postMessage({ type: 'noteState', noteIndex: index, value: shouldBeActive ? 1 : 0 });
  }
}

function updateTransportButtons() {
  if (recordButton) {
    recordButton.textContent = isRecording ? 'Stop Rec' : 'Start Rec';
    recordButton.classList.toggle('is-recording', isRecording);
    recordButton.disabled = isPlayingBack;
  }

  if (playButton) {
    playButton.textContent = isPlayingBack ? 'Stop' : 'Play';
    playButton.disabled = isRecording || recordedEvents.length === 0;
  }

  if (downloadMidiButton) {
    downloadMidiButton.disabled = isRecording || isPlayingBack || recordedEvents.length === 0;
  }
}

function sendAllNotesOffToEngine() {
  noteStateBuffer.fill(0);
  noteDefinitions.forEach((note, index) => {
    activePressCounts.set(note.midi, 0);
    const key = keyElements.get(note.midi);
    if (key) {
      key.classList.remove('is-active');
    }

    if (workletNode && !sharedBuffer) {
      workletNode.port.postMessage({ type: 'noteState', noteIndex: index, value: 0 });
    }
  });
}

function stopPlayback() {
  playbackTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  playbackTimeoutIds = [];
  sendAllNotesOffToEngine();
  isPlayingBack = false;
  updateTransportButtons();
}

function buildNormalizedEventSequence() {
  const sequence = [...recordedEvents].sort((a, b) => a.timeMs - b.timeMs);
  const activeNotes = new Set();
  let lastTimeMs = 0;

  sequence.forEach((event) => {
    lastTimeMs = event.timeMs;
    if (event.action === 'on') {
      activeNotes.add(event.midi);
    } else {
      activeNotes.delete(event.midi);
    }
  });

  if (activeNotes.size > 0) {
    const releaseTimeMs = lastTimeMs + 120;
    activeNotes.forEach((midi) => {
      sequence.push({ timeMs: releaseTimeMs, midi, action: 'off' });
    });
  }

  return sequence.sort((a, b) => a.timeMs - b.timeMs);
}

function encodeVarLen(value) {
  let buffer = value & 0x7f;
  const bytes = [];

  while ((value >>= 7) > 0) {
    buffer <<= 8;
    buffer |= ((value & 0x7f) | 0x80);
  }

  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }

  return bytes;
}

function createMidiBytesFromEvents() {
  const sequence = buildNormalizedEventSequence();
  if (sequence.length === 0) {
    return null;
  }

  const ppqn = 480;
  const tempoMicroseconds = 500000;
  const ticksPerMillisecond = ppqn / (tempoMicroseconds / 1000);
  const trackData = [
    0x00, 0xff, 0x51, 0x03,
    (tempoMicroseconds >> 16) & 0xff,
    (tempoMicroseconds >> 8) & 0xff,
    tempoMicroseconds & 0xff,
  ];

  let previousTick = 0;
  sequence.forEach((event) => {
    const absoluteTick = Math.max(0, Math.round(event.timeMs * ticksPerMillisecond));
    const deltaTick = Math.max(0, absoluteTick - previousTick);
    previousTick = absoluteTick;

    trackData.push(...encodeVarLen(deltaTick));
    if (event.action === 'on') {
      trackData.push(0x90, event.midi & 0x7f, 96);
    } else {
      trackData.push(0x80, event.midi & 0x7f, 0);
    }
  });

  trackData.push(0x00, 0xff, 0x2f, 0x00);

  const trackLength = trackData.length;
  const fileBytes = [
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (ppqn >> 8) & 0xff, ppqn & 0xff,
    0x4d, 0x54, 0x72, 0x6b,
    (trackLength >> 24) & 0xff,
    (trackLength >> 16) & 0xff,
    (trackLength >> 8) & 0xff,
    trackLength & 0xff,
    ...trackData,
  ];

  return new Uint8Array(fileBytes);
}

function downloadMidi() {
  const midiBytes = createMidiBytesFromEvents();
  if (!midiBytes) {
    statusLine.textContent = 'No recorded notes to export.';
    return;
  }

  const blob = new Blob([midiBytes], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `browser-piano-${Date.now()}.mid`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  statusLine.textContent = 'MIDI downloaded.';
}

function startPlayback() {
  if (isPlayingBack || recordedEvents.length === 0) {
    return;
  }

  const sequence = buildNormalizedEventSequence();
  if (sequence.length === 0) {
    statusLine.textContent = 'No recorded notes to play.';
    updateTransportButtons();
    return;
  }

  sendAllNotesOffToEngine();
  isPlayingBack = true;
  updateTransportButtons();
  statusLine.textContent = 'Playing recording...';

  sequence.forEach((event) => {
    const timeoutId = window.setTimeout(() => {
      setNoteState(event.midi, event.action === 'on');
    }, event.timeMs);
    playbackTimeoutIds.push(timeoutId);
  });

  const endAtMs = sequence[sequence.length - 1].timeMs + 180;
  const endTimeoutId = window.setTimeout(() => {
    stopPlayback();
    statusLine.textContent = 'Playback finished.';
  }, endAtMs);
  playbackTimeoutIds.push(endTimeoutId);
}

function startRecording() {
  stopPlayback();
  isRecording = true;
  recordingStartedAt = null;
  recordedEvents = [];
  statusLine.textContent = 'Recording armed. First key press starts timing.';
  updateTransportButtons();
}

function stopRecording() {
  if (!isRecording) {
    return;
  }

  if (recordingStartedAt !== null) {
    const stopAtMs = Math.max(0, Math.round(performance.now() - recordingStartedAt));
    activePressCounts.forEach((count, midi) => {
      if (count > 0) {
        recordedEvents.push({ timeMs: stopAtMs, midi, action: 'off' });
      }
    });
  }

  isRecording = false;
  if (recordedEvents.length === 0) {
    statusLine.textContent = 'Recording stopped. No notes captured.';
  } else {
    const durationMs = recordedEvents[recordedEvents.length - 1].timeMs;
    statusLine.textContent = `Recording stopped. ${recordedEvents.length} events (${durationMs} ms).`;
  }
  updateTransportButtons();
}

function handlePointerDown(event) {
  event.preventDefault();
  const noteMidi = Number(event.currentTarget.dataset.midi);
  event.currentTarget.setPointerCapture(event.pointerId);
  void initAudio();
  setNoteState(noteMidi, true);
  activePointers.set(event.pointerId, { noteMidi, element: event.currentTarget });
}

function handlePointerMove(event) {
  const pointerState = activePointers.get(event.pointerId);
  if (!pointerState) {
    return;
  }

  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.key');
  if (!target) {
    return;
  }

  const nextMidi = Number(target.dataset.midi);
  if (nextMidi === pointerState.noteMidi) {
    return;
  }

  setNoteState(pointerState.noteMidi, false);
  setNoteState(nextMidi, true);
  activePointers.set(event.pointerId, { noteMidi: nextMidi, element: target });
}

function handlePointerEnd(event) {
  const pointerState = activePointers.get(event.pointerId);
  if (!pointerState) {
    return;
  }

  setNoteState(pointerState.noteMidi, false);
  activePointers.delete(event.pointerId);
}

function handlePointerLeave(event) {
  if (event.buttons === 0) {
    handlePointerEnd(event);
  }
}

volumeInput.addEventListener('input', (event) => {
  const volume = Number(event.target.value);
  if (workletNode) {
    workletNode.port.postMessage({ type: 'volume', volume });
  }
});

window.addEventListener('resize', createKeyboardLayout);
window.addEventListener('load', () => {
  createKeyboardLayout();
  updateTransportButtons();
});

if (recordButton) {
  recordButton.addEventListener('click', async () => {
    await initAudio();
    if (isRecording) {
      stopRecording();
      return;
    }
    startRecording();
  });
}

if (playButton) {
  playButton.addEventListener('click', async () => {
    await initAudio();
    if (isPlayingBack) {
      stopPlayback();
      statusLine.textContent = 'Playback stopped.';
      return;
    }
    startPlayback();
  });
}

if (downloadMidiButton) {
  downloadMidiButton.addEventListener('click', () => {
    downloadMidi();
  });
}
