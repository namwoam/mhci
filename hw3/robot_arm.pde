import processing.serial.*;

Serial myPort;
String val;
String portName = "COM4"; // CHANGE to your specific port (e.g., "/dev/tty.usbmodem...")

void setup() {
  size(400, 200);
  printArray(Serial.list());
  myPort = new Serial(this, portName, 9600);
  myPort.bufferUntil('\n');
}

void draw() {
  background(255);
  fill(0);
  text("Press arrow keys to test move fuctions", 20, 50);
  text("Press Z X C to rotate end effector", 20, 80);
  text("Press 1-5 to draw emoji patterns", 20, 110);
}

void keyPressed() {

  if (key == CODED) {
    // predefined positions, feel free to change
    if (keyCode == UP) {
      sendMoveCommand(0, 100, 80);
    } else if (keyCode == DOWN) {
      sendMoveCommand(0, 100, 10);
    } else if (keyCode == LEFT) {
      sendMoveCommand(-50, 80, 50);
    } else if (keyCode == RIGHT) {
      sendMoveCommand(50, 80, 50);
    }
  } else {
    // home position
    if (key == 'h') {
      sendMoveCommand(0, 100, 50);
    // rotate the cube
    } else if (key == 'z') {
      sendClawCommand(0);
    } else if (key == 'x') {
      sendClawCommand(90);
    } else if (key == 'c') {
      sendClawCommand(180);
    } else if (key == '1') {
      robotDrawSmile();
    } else if (key == '2') {
      robotDrawWink();
    } else if (key == '3') {
      robotDrawSurprised();
    } else if (key == '4') {
      robotDrawSad();
    } else if (key == '5') {
      robotDrawHeartEyes();
    }
  }
}

void robotMoveAndPause(float x, float y, float z, int ms) {
  sendMoveCommand(x, y, z);
  delay(ms);
}

void robotDrawCircle(float cx, float cy, float z, float radius, int segments) {
  for (int i = 0; i <= segments; i++) {
    float t = TWO_PI * i / segments;
    float x = cx + cos(t) * radius;
    float y = cy + sin(t) * radius;
    robotMoveAndPause(x, y, z, 120);
  }
}

void robotDrawArc(float cx, float cy, float z, float radius, float startA, float endA, int segments) {
  for (int i = 0; i <= segments; i++) {
    float t = map(i, 0, segments, startA, endA);
    float x = cx + cos(t) * radius;
    float y = cy + sin(t) * radius;
    robotMoveAndPause(x, y, z, 120);
  }
}

void robotDrawLine(float x1, float y1, float z, float x2, float y2, int segments) {
  for (int i = 0; i <= segments; i++) {
    float x = lerp(x1, x2, i / float(segments));
    float y = lerp(y1, y2, i / float(segments));
    robotMoveAndPause(x, y, z, 100);
  }
}

void robotDrawFaceOutline() {
  robotMoveAndPause(0, 100, 55, 250);
  robotDrawCircle(0, 100, 35, 35, 24);
}

void robotDrawSmile() {
  robotDrawFaceOutline();
  robotDrawCircle(-12, 112, 35, 4, 10);
  robotDrawCircle(12, 112, 35, 4, 10);
  robotDrawArc(0, 92, 35, 15, 0.2, PI - 0.2, 14);
  robotMoveAndPause(0, 100, 50, 250);
}

void robotDrawWink() {
  robotDrawFaceOutline();
  robotDrawCircle(-12, 112, 35, 4, 10);
  robotDrawLine(8, 112, 35, 16, 112, 4);
  robotDrawArc(0, 92, 35, 13, 0.4, PI - 0.4, 10);
  robotMoveAndPause(0, 100, 50, 250);
}

void robotDrawSurprised() {
  robotDrawFaceOutline();
  robotDrawCircle(-12, 112, 35, 4, 10);
  robotDrawCircle(12, 112, 35, 4, 10);
  robotDrawCircle(0, 92, 35, 7, 14);
  robotMoveAndPause(0, 100, 50, 250);
}

void robotDrawSad() {
  robotDrawFaceOutline();
  robotDrawCircle(-12, 112, 35, 4, 10);
  robotDrawCircle(12, 112, 35, 4, 10);
  robotDrawArc(0, 84, 35, 14, PI + 0.35, TWO_PI - 0.35, 12);
  robotMoveAndPause(0, 100, 50, 250);
}

void robotDrawHeartEyes() {
  robotDrawFaceOutline();

  // Left heart eye
  robotDrawArc(-14, 114, 35, 3.5, PI, TWO_PI, 8);
  robotDrawArc(-10, 114, 35, 3.5, PI, TWO_PI, 8);
  robotDrawLine(-17.5, 114, 35, -12, 106, 6);
  robotDrawLine(-6.5, 114, 35, -12, 106, 6);

  // Right heart eye
  robotDrawArc(10, 114, 35, 3.5, PI, TWO_PI, 8);
  robotDrawArc(14, 114, 35, 3.5, PI, TWO_PI, 8);
  robotDrawLine(6.5, 114, 35, 12, 106, 6);
  robotDrawLine(17.5, 114, 35, 12, 106, 6);

  robotDrawArc(0, 91, 35, 14, 0.25, PI - 0.25, 12);
  robotMoveAndPause(0, 100, 50, 250);
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
