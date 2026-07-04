const piano = document.getElementById('piano');
const volumeInput = document.getElementById('volume');
const statusLine = document.getElementById('status');

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

  noteStateBuffer[index] = shouldBeActive ? 1 : 0;

  if (workletNode && !sharedBuffer) {
    workletNode.port.postMessage({ type: 'noteState', noteIndex: index, value: shouldBeActive ? 1 : 0 });
  }
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
});
