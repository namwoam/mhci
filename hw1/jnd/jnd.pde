import processing.sound.*;
import java.util.ArrayList;

SinOsc sinOsc;

float base_volume = 0.1;
float diff = 0;
float step = 0.05;

int reversal_count = 0;

ArrayList<Float> arr;

char last_response = ' ';

void setup() {
  size(400, 300);
  background(255);
  sinOsc = new SinOsc(this);
  sinOsc.freq(1000);
  sinOsc.amp(0.5);
  arr = new ArrayList<>();
}


void draw() {
  fill(0);
  textSize(25);
  text("ADT study", 30, 30);
}

void keyPressed(){
  if (key == ' '){
    println("trial starts");

    
    
    if (reversal_count > 2){
      step = step / 2;
      reversal_count = 0;
      if (step < 0.0001){
        println("end");
        println("the last 3 elements: ");
        int size = arr.size();
        if (size >= 3) {
            println(arr.get(size - 3));
            println(arr.get(size - 2));
            println(arr.get(size - 1));
        }
      }
    }
    
    
    if (last_response == 'n'){
      diff += step;
    }
    else if (last_response == 'y'){
      diff -= step;
    }
    delay(int(random(1000, 3000)));
    println("current_diff: "+str(diff)); 
    
    sinOsc.amp(base_volume);
    sinOsc.play();
    delay(400 + int(random(100)));
    sinOsc.amp(base_volume + diff);
    delay(400 + int(random(100)));
    sinOsc.stop();
  }
  
  else if (key == 'y'){
    println("yes");
    if (last_response == 'n'){
      reversal_count += 1;
      add_to_array(diff);
    }
    last_response = 'y';
  }
  else if (key == 'n'){
    println("no");
    if (last_response == 'y'){
      reversal_count += 1;
      add_to_array(diff);
    }
    last_response = 'n';
  }
}

void add_to_array(float f){
  arr.add(new Float(f));
}
