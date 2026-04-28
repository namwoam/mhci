/* * 觸覺 Emoji 辨識實驗 - Arduino 接收端
 * 需安裝 MeArm-Robot-Arm 函式庫並完成 controlClaw 修正
 */
#include "meArm.h"
#include <Servo.h>

// 定義馬達腳位 [cite: 7]
int basePin = 9;
int shoulderPin = 7;
int elbowPin = 8;
int clawPin = 6;

MeArm arm;

void setup() {
  Serial.begin(9600);
  // 初始化手臂 [cite: 9]
  arm.begin(basePin, shoulderPin, elbowPin, clawPin);
  arm.controlClaw(70 * PI / 180.0); 
  // 移動到初始待命位置 (x, y, z)
  arm.snapToXYZ(0, 100, 50); 
}

void loop() {
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd.startsWith("move")) {
      // 解析 "move x y z" [cite: 26]
      int firstSpace = cmd.indexOf(' ');
      int secondSpace = cmd.indexOf(' ', firstSpace + 1);
      int thirdSpace = cmd.indexOf(' ', secondSpace + 1);
      
      float x = cmd.substring(firstSpace + 1, secondSpace).toFloat();
      float y = cmd.substring(secondSpace + 1, thirdSpace).toFloat();
      float z = cmd.substring(thirdSpace + 1).toFloat();
      
      arm.snapToXYZ(x, y, z); 
    } 
    else if (cmd.startsWith("rotate")) {
      // 解析 "rotate theta" [cite: 27]
      int firstSpace = cmd.indexOf(' ');
      int angle = cmd.substring(firstSpace + 1).toInt();
      // 使用講義修改後的自定義函式
      arm.controlClaw(float(angle) * PI / 180.0); 
    }
  }
}