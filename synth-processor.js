class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.noteCount = 24;
    this.noteStates = new Uint8Array(this.noteCount);
    this.notePhases = new Float32Array(this.noteCount);
    this.noteEnvelopes = new Float32Array(this.noteCount);
    this.volume = 0.7;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'init') {
        this.noteCount = event.data.noteCount || this.noteCount;
        this.noteStates = event.data.buffer ? new Uint8Array(event.data.buffer) : new Uint8Array(this.noteCount);
        this.notePhases = new Float32Array(this.noteCount);
        this.noteEnvelopes = new Float32Array(this.noteCount);
      }

      if (event.data?.type === 'noteState') {
        if (this.noteStates[event.data.noteIndex] !== undefined) {
          this.noteStates[event.data.noteIndex] = event.data.value;
        }
      }

      if (event.data?.type === 'volume') {
        this.volume = Number(event.data.volume) || 0.7;
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];

    for (let sampleIndex = 0; sampleIndex < channel.length; sampleIndex += 1) {
      let sample = 0;

      for (let noteIndex = 0; noteIndex < this.noteCount; noteIndex += 1) {
        const isPressed = this.noteStates[noteIndex] === 1;
        if (!isPressed && this.noteEnvelopes[noteIndex] <= 0.0001) {
          continue;
        }

        const midi = 60 + noteIndex;
        const frequency = 440 * Math.pow(2, (midi - 69) / 12);
        const phase = this.notePhases[noteIndex];

        let envelope = this.noteEnvelopes[noteIndex];
        envelope = isPressed ? Math.min(1, envelope + 0.0045) : Math.max(0, envelope - 0.0028);
        this.noteEnvelopes[noteIndex] = envelope;

        const fundamental = Math.sin(phase * Math.PI * 2);
        const overtone = Math.sin(phase * Math.PI * 4) * 0.25;
        const noise = (Math.random() * 2 - 1) * 0.01;
        const tone = ((fundamental + overtone + noise) * envelope) * 0.16;

        sample += tone;
        this.notePhases[noteIndex] = (phase + frequency / sampleRate) % 1;
      }

      channel[sampleIndex] = Math.max(-1, Math.min(1, sample * this.volume));
    }

    return true;
  }
}

registerProcessor('synth-processor', SynthProcessor);
