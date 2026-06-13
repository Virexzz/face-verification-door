const { SerialPort } = require('serialport');

const ARDUINO_PORT = 'COM5'; 
const BAUDRATE = 9600;

let port = null;

try {
    port = new SerialPort({
        path: ARDUINO_PORT,
        baudRate: BAUDRATE,
        autoOpen: true
    });

    port.on('open', () => {
        console.log(`Serial connection established on ${ARDUINO_PORT} at ${BAUDRATE} baud.`);
    });

    port.on('error', (err) => {
        console.error('Serial Port Error: ', err.message);
    });
} catch (error) {
    console.error(' Could not initialize Serial Port:', error.message);
}

function triggerDoorOpen() {
    if (!port || !port.isOpen) {
        console.error("Cannot unlock door: Serial port is not open.");
        return false;
    }

    console.log("Sending unlock signal 'O' to Arduino...");
    
    // Send a character ('O' for Open) over the serial pipeline
    port.write('O', (err) => {
        if (err) {
            console.error('Error writing to serial port:', err.message);
            return false;
        }
        
        setTimeout(() => {
            if (port.isOpen) {
                console.log("Sending relock signal 'C' to Arduino...");
                port.write('C');
            }
        }, 5000); 
    });

    return true;
}

module.exports = { triggerDoorOpen };