

Table table;

void setup(){
  size(800, 600);
  table = new Table();
  table.addColumn("idx");
  table.addColumn("target_size");
  table.addColumn("target_distance");
  table.addColumn("reaction_time");
}

float target_x = 200;
float target_y = 300;
float target_size = 20.0;
int idx = 0;

long start_time;
float target_distance;

void draw(){
  background(255);
  fill(255, 0, 0);
  noStroke();
  ellipse(target_x, target_y, target_size, target_size);
}

void spawn_target(){
  idx += 1;
  target_size = random(10, 60);
  target_x = random(target_size, width - target_size);
  target_y = random(target_size, height - target_size);
  start_time = millis();
  target_distance = dist(mouseX, mouseY, target_x, target_y);
}

void keyPressed(){
  if (key == ' '){
    spawn_target();
  }
  
}

void mousePressed(){
  float d = dist(mouseX, mouseY, target_x, target_y);
  if (d <= (target_size / 2) ){
    float reaction_time = millis() - start_time;
    TableRow r = table.addRow();
    r.setInt("idx", idx);
    r.setFloat("target_size", target_size);
    r.setFloat("target_distance", target_distance);
    r.setFloat("reaction_time", reaction_time);
    saveTable(table, "fitts_study_exp.csv");
    spawn_target();
  }
}
