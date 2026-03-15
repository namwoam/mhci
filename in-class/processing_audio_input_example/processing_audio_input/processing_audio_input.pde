import processing.sound.*;
import oscP5.*;
import netP5.*;

AudioIn mic;
Amplitude amp;
FFT fft;

int bands = 1024; // Resolution of the FFT (higher = more accurate frequency, but slower)
float[] spectrum = new float[bands];
float sampleRate = 44100; // Standard audio sample rate

OscP5 oscP5;
String finalSpeech = "";
String partialSpeech = "";

void setup() {
  size(400, 400);

  
  // 1. Initialize the microphone input
  mic = new AudioIn(this, 0); 
  mic.start();
  
  // 2. Initialize the Amplitude (Volume) analyzer and attach it to the mic
  amp = new Amplitude(this);
  amp.input(mic);
  
  // 3. Initialize the FFT (Pitch) analyzer and attach it to the mic
  fft = new FFT(this, bands);
  fft.input(mic);
  
  // Start oscP5, listening for incoming messages on port 12000
  oscP5 = new OscP5(this, 12000);
}

void draw() {
  background(30);
  
  // --- ANALYZE VOLUME ---
  // analyze() returns a value between 0.0 and 1.0
  float volume = amp.analyze();
  
  // --- ANALYZE PITCH (FREQUENCY) ---
  fft.analyze(spectrum);
  
  // Loop through the frequency bands to find the one with the highest amplitude
  float maxAmp = 0;
  int maxIndex = 0;
  
  for (int i = 0; i < bands; i++) {
    if (spectrum[i] > maxAmp) {
      maxAmp = spectrum[i];
      maxIndex = i;
    }
  }
  
  // Convert the index of the highest band to a frequency in Hertz (Hz)
  // Formula: Index * (Nyquist Frequency) / Total Bands
  float dominantFreq = maxIndex * (sampleRate / 2.0f) / bands;  
  
  // --- DRAW GRAPHICS ---

  // TODO
  
}

// This function fires automatically whenever an OSC message arrives
void oscEvent(OscMessage msg) {
  
  // Check if the message was sent to the "/speech" address (completed sentences)
  if (msg.checkAddrPattern("/speech")) {
    if (msg.checkTypetag("s")) { // "s" means it expects a String argument
      finalSpeech = msg.get(0).stringValue();
      partialSpeech = ""; // Clear the partial text buffer
      println("Final:" + finalSpeech);
    }
  } 
  
  // Check if the message was sent to the "/partial" address (mid-sentence)
  else if (msg.checkAddrPattern("/partial")) {
    if (msg.checkTypetag("s")) {
      partialSpeech = msg.get(0).stringValue();
      println("Partial: " + partialSpeech);
      // TODO
    }
  }
}
