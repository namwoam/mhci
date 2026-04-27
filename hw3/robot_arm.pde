import processing.serial.*;

Serial myPort;
String val;
String portName = "COM4"; // CHANGE to your specific port (e.g., "/dev/tty.usbmodem...")
float EMOJI_SCALE = 0.7;
float HOVER_Z = 55;
float STROKE_SPEED = 12.0; // units per second (lower is slower)
int MIN_MOVE_DELAY_MS = 80;
int MAX_MOVE_DELAY_MS = 450;

boolean hasLastPose = false;
float lastX = 0;
float lastY = 100;
float lastZ = 50;

String[] EMOJI_NAMES = {"smile", "wink", "surprised", "sad", "embarrassed"};

int[] experimentSequence;
int trialIndex = -1;
boolean experimentRunning = false;
boolean waitingPrediction = false;
int currentEmojiId = -1;

IntList resultSeq = new IntList();
IntList resultGroundTruth = new IntList();
IntList resultPredicted = new IntList();

void setup() {
  size(400, 200);
  printArray(Serial.list());
  myPort = new Serial(this, portName, 9600);
  myPort.bufferUntil('\n');
}

void draw() {
  background(255);
  fill(0);
  text("Emoji Experiment Instructions", 20, 40);
  text("1) Press E to start (5 training + 15 testing)", 20, 70);
  text("2) Watch the robot draw an emoji", 20, 100);
  text("3) Enter your guess: 1-5", 20, 130);
  text("   1 smile  2 wink  3 surprised  4 sad  5 embarrassed", 20, 155);

  if (!experimentRunning) {
    text("Status: idle", 20, 190);
  } else {
    String phase = trialIndex < 5 ? "training" : "testing";
    String status = waitingPrediction ? "waiting prediction (press 1-5)" : "drawing";
    text("Status: " + phase + " trial " + (trialIndex + 1) + "/20", 20, 190);
    text("State: " + status, 20, 215);
    if (trialIndex < 5 && currentEmojiId != -1) {
      text("Training emoji: " + emojiName(currentEmojiId), 20, 240);
    }
  }
}

void keyPressed() {

  if (!experimentRunning && (key == 'e' || key == 'E')) {
    startExperiment();
    return;
  }

  if (experimentRunning && waitingPrediction && key >= '1' && key <= '5') {
    int predictedEmoji = (key - '0');
    storePredictionAndAdvance(predictedEmoji);
    return;
  }
}

void startExperiment() {
  resultSeq.clear();
  resultGroundTruth.clear();
  resultPredicted.clear();

  int[] training = buildShuffledRepSequence(1);
  int[] testing = buildShuffledRepSequence(3);
  experimentSequence = concat(training, testing);

  trialIndex = 0;
  experimentRunning = true;
  waitingPrediction = false;

  println("Experiment started: 5 training + 15 testing trials");
  runCurrentTrial();
}

int[] buildShuffledRepSequence(int repetitionsPerEmoji) {
  int total = EMOJI_NAMES.length * repetitionsPerEmoji;
  int[] seq = new int[total];
  int idx = 0;

  for (int rep = 0; rep < repetitionsPerEmoji; rep++) {
    for (int emojiId = 1; emojiId <= EMOJI_NAMES.length; emojiId++) {
      seq[idx++] = emojiId;
    }
  }

  for (int i = total - 1; i > 0; i--) {
    int j = int(random(i + 1));
    int tmp = seq[i];
    seq[i] = seq[j];
    seq[j] = tmp;
  }

  return seq;
}

void runCurrentTrial() {
  if (!experimentRunning || trialIndex < 0 || trialIndex >= experimentSequence.length) {
    return;
  }

  int gt = experimentSequence[trialIndex];
  currentEmojiId = gt;
  println("Trial " + (trialIndex + 1) + ": draw " + emojiName(gt));
  drawEmojiById(gt);
  waitingPrediction = true;
}

void storePredictionAndAdvance(int predictedEmoji) {
  int gt = experimentSequence[trialIndex];
  int seqNo = trialIndex + 1;

  resultSeq.append(seqNo);
  resultGroundTruth.append(gt);
  resultPredicted.append(predictedEmoji);

  println(
    "Recorded trial " + seqNo +
    " gt=" + emojiName(gt) +
    " predicted=" + emojiName(predictedEmoji)
  );

  waitingPrediction = false;
  trialIndex++;

  if (trialIndex >= experimentSequence.length) {
    finishExperimentAndSave();
  } else {
    runCurrentTrial();
  }
}

void finishExperimentAndSave() {
  experimentRunning = false;
  waitingPrediction = false;
  currentEmojiId = -1;

  String timestamp =
    nf(year(), 4) +
    nf(month(), 2) +
    nf(day(), 2) + "_" +
    nf(hour(), 2) +
    nf(minute(), 2) +
    nf(second(), 2);
  String filename = "exp_result_" + timestamp + ".csv";

  PrintWriter writer = createWriter(filename);
  writer.println("seq,ground_truth,predicted");
  for (int i = 0; i < resultSeq.size(); i++) {
    int gt = resultGroundTruth.get(i);
    int pred = resultPredicted.get(i);
    writer.println(resultSeq.get(i) + "," + emojiName(gt) + "," + emojiName(pred));
  }
  writer.flush();
  writer.close();

  println("Experiment complete. Saved: " + filename);
}

void drawEmojiById(int emojiId) {
  if (emojiId == 1) {
    robotDrawSmile();
  } else if (emojiId == 2) {
    robotDrawWink();
  } else if (emojiId == 3) {
    robotDrawSurprised();
  } else if (emojiId == 4) {
    robotDrawSad();
  } else if (emojiId == 5) {
    robotDrawEmbarrassed();
  }
}

String emojiName(int emojiId) {
  if (emojiId >= 1 && emojiId <= EMOJI_NAMES.length) {
    return EMOJI_NAMES[emojiId - 1];
  }
  return "unknown";
}

void robotMoveAndPause(float x, float y, float z, int ms) {
  sendMoveCommand(x, y, z);
  delay(ms);
  lastX = x;
  lastY = y;
  lastZ = z;
  hasLastPose = true;
}

int getMoveDelayMs(float x, float y, float z, float speed) {
  if (!hasLastPose) {
    return 200;
  }

  float speedSafe = max(0.1, speed);
  float d = dist(lastX, lastY, lastZ, x, y, z);
  int ms = int((d / speedSafe) * 1000.0);
  return constrain(ms, MIN_MOVE_DELAY_MS, MAX_MOVE_DELAY_MS);
}

void robotMoveAtConfiguredSpeed(float x, float y, float z) {
  int moveDelayMs = getMoveDelayMs(x, y, z, STROKE_SPEED);
  robotMoveAndPause(x, y, z, moveDelayMs);
}

void robotHoverMove(float x, float y, int ms) {
  robotMoveAtConfiguredSpeed(x, y, HOVER_Z);
}

void robotDrawCircle(float cx, float cy, float z, float radius, int segments) {
  float startX = cx + radius;
  float startY = cy;
  robotHoverMove(startX, startY, 120);

  for (int i = 0; i <= segments; i++) {
    float t = TWO_PI * i / segments;
    float x = cx + cos(t) * radius;
    float y = cy + sin(t) * radius;
    robotMoveAtConfiguredSpeed(x, y, z);
  }

  robotHoverMove(startX, startY, 120);
}

void robotDrawArc(float cx, float cy, float z, float radius, float startA, float endA, int segments) {
  float startX = cx + cos(startA) * radius;
  float startY = cy + sin(startA) * radius;
  float endX = cx + cos(endA) * radius;
  float endY = cy + sin(endA) * radius;
  robotHoverMove(startX, startY, 120);

  for (int i = 0; i <= segments; i++) {
    float t = map(i, 0, segments, startA, endA);
    float x = cx + cos(t) * radius;
    float y = cy + sin(t) * radius;
    robotMoveAtConfiguredSpeed(x, y, z);
  }

  robotHoverMove(endX, endY, 120);
}

void robotDrawLine(float x1, float y1, float z, float x2, float y2, int segments) {
  robotHoverMove(x1, y1, 100);

  for (int i = 0; i <= segments; i++) {
    float x = lerp(x1, x2, i / float(segments));
    float y = lerp(y1, y2, i / float(segments));
    robotMoveAtConfiguredSpeed(x, y, z);
  }

  robotHoverMove(x2, y2, 100);
}

float sx(float x) {
  return x * EMOJI_SCALE;
}

float sy(float y) {
  return 100 + (y - 100) * EMOJI_SCALE;
}

float sr(float radius) {
  return radius * EMOJI_SCALE;
}

void robotDrawFaceOutline() {
  robotMoveAndPause(0, 100, 55, 250);
  robotDrawCircle(sx(0), sy(100), 35, sr(35), 24);
}

void robotDrawSmile() {
  robotDrawFaceOutline();
  robotDrawCircle(sx(-12), sy(112), 35, sr(8), 12);
  robotDrawCircle(sx(12), sy(112), 35, sr(8), 12);
  robotDrawArc(sx(0), sy(92), 35, sr(15), 0.2, PI - 0.2, 14);
  robotMoveAndPause(0, 100, 50, 250);
}

void robotDrawWink() {
  robotDrawFaceOutline();
  robotDrawCircle(sx(-12), sy(112), 35, sr(8), 12);
  robotDrawLine(sx(4), sy(112), 35, sx(20), sy(112), 6);
  robotDrawArc(sx(0), sy(92), 35, sr(13), 0.4, PI - 0.4, 10);
  robotMoveAndPause(0, 100, 50, 250);
}

void robotDrawSurprised() {
  robotDrawFaceOutline();
  robotDrawCircle(sx(-12), sy(112), 35, sr(8), 12);
  robotDrawCircle(sx(12), sy(112), 35, sr(8), 12);
  robotDrawCircle(sx(0), sy(92), 35, sr(7), 14);
  robotMoveAndPause(0, 100, 50, 250);
}

void robotDrawSad() {
  robotDrawFaceOutline();
  robotDrawCircle(sx(-12), sy(112), 35, sr(8), 12);
  robotDrawCircle(sx(12), sy(112), 35, sr(8), 12);
  robotDrawArc(sx(0), sy(84), 35, sr(14), PI + 0.35, TWO_PI - 0.35, 12);
  robotMoveAndPause(0, 100, 50, 250);
}

void robotDrawEmbarrassed() {
  robotDrawFaceOutline();

  // Left eye: >
  robotDrawLine(sx(-29), sy(124), 35, sx(-9), sy(112), 10);
  robotDrawLine(sx(-29), sy(100), 35, sx(-9), sy(112), 10);

  // Right eye: <
  robotDrawLine(sx(29), sy(124), 35, sx(9), sy(112), 10);
  robotDrawLine(sx(29), sy(100), 35, sx(9), sy(112), 10);

  // Blush marks
  robotDrawLine(sx(-22), sy(100), 35, sx(-17), sy(98), 4);
  robotDrawLine(sx(-22), sy(96), 35, sx(-17), sy(94), 4);
  robotDrawLine(sx(22), sy(100), 35, sx(17), sy(98), 4);
  robotDrawLine(sx(22), sy(96), 35, sx(17), sy(94), 4);

  robotDrawArc(sx(0), sy(92), 35, sr(8), 0.45, PI - 0.45, 10);
  robotMoveAndPause(0, 100, 50, 250);
}

void robotDrawHeartEyes() {
  robotDrawEmbarrassed();
}

void sendMoveCommand(float x, float y, float z) {
  String cmd = "move " + x + " " + y + " " + z + "\n";
  myPort.write(cmd);
  println("Sent: " + cmd.trim());
}

void sendClawCommand(int theta) {
  String cmd = "rotate " + theta + "\n";
  myPort.write(cmd);
  println("Sent: " + cmd.trim());
}

void serialEvent(Serial myPort) {
  val = myPort.readStringUntil('\n');
  if (val != null) {
    val = trim(val);
    println("Arduino says: " + val);
  }
}
