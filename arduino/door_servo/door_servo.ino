#include <Servo.h>

Servo doorServo;

const int SERVO_PIN = 9;       


const int LOCKED_POS = 120;     
const int UNLOCKED_POS = 180;   
const unsigned long DELAY_INTERVAL = 5000; 

void setup() {
  
  Serial.begin(9600);          
  
  doorServo.attach(SERVO_PIN);
  doorServo.write(LOCKED_POS); 
}

void loop() {
  
  if (Serial.available() > 0) {
    char command = Serial.read(); 
    
    
    if (command == 'O') {
      doorServo.write(UNLOCKED_POS); 
      
      
      delay(DELAY_INTERVAL);         
      
      doorServo.write(LOCKED_POS);   
    }
  }
}