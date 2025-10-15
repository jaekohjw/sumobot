
// =================================================================================
// --- Centralized Configuration ---
// =================================================================================

const maxSpeed = 1000;
const spinSpeed = 1000;
// FIX: Reduced the threshold to a realistic range for the EV3 sensor.
const eyesThreshold = 500; // Max distance in cm to detect an enemy

// --- Color Constant ---
const COLOR_WHITE = 6;

// =================================================================================
// --- Hardware Initialization ---
// =================================================================================

const leftMotor = ev3_motorB();
const rightMotor = ev3_motorC();
const colorSensor = ev3_colorSensor();
const eyes = ev3_ultrasonicSensor();

// =================================================================================
// --- State Management Variables ---
// =================================================================================

let nextState = null;
let lastSearchDirection = "left";
let dashTimer = 0;

// =================================================================================
// --- Helper & Utility Functions ---
// =================================================================================

function startDrivingForward(speed) {
    ev3_motorSetSpeed(leftMotor, speed);
    ev3_motorSetSpeed(rightMotor, speed);
    ev3_motorStart(leftMotor);
    ev3_motorStart(rightMotor);
}

function startSpinning(direction, speed) {
    if (direction === "left") {
        ev3_motorSetSpeed(leftMotor, -speed);
        ev3_motorSetSpeed(rightMotor, speed);
    } else {
        ev3_motorSetSpeed(leftMotor, speed);
        ev3_motorSetSpeed(rightMotor, -speed);
    }
    ev3_motorStart(leftMotor);
    ev3_motorStart(rightMotor);
}

function onBoundary() {
    return ev3_colorSensorGetColor(colorSensor) === COLOR_WHITE;
}

function enemyAhead() {
    return ev3_ultrasonicSensorDistance(eyes) <= eyesThreshold;
}

// =================================================================================
// --- State Machine Logic ---
// =================================================================================

// STATE 1: A non-blocking dash that allows for sensor checks.
function initialStraightDash() {
    const dashDuration = 1500; // 1.5 seconds
    const loopTime = 20;

    startDrivingForward(maxSpeed);
    dashTimer = dashTimer + loopTime;

    // The boundary check is active during the initial dash.
    if (onBoundary()) {
        nextState = escape;
    } else if (enemyAhead()) {
        nextState = attack;
    } else if (dashTimer >= dashDuration) {
        ev3_motorStop(leftMotor);
        ev3_motorStop(rightMotor);
        ev3_pause(100);
        nextState = spinAndSearch;
    }
}

// STATE 2: The robot spins to search for targets or the boundary.
function spinAndSearch() {
    startSpinning(lastSearchDirection, spinSpeed);

    if (onBoundary()) {
        nextState = escape;
    } else if (enemyAhead()) {
        nextState = attack;
    }
}

// STATE 3: Charges forward when an enemy is detected.
function attack() {
    startDrivingForward(maxSpeed);

    // The boundary check is also active during an attack.
    if (onBoundary()) {
        nextState = escape;
    } else if (!enemyAhead()) {
        lastSearchDirection = (lastSearchDirection === "left" ? "right" : "left");
        nextState = spinAndSearch;
    }
}

// REACTIVE STATE: A sequence to move away from the boundary.
function escape() {
    ev3_motorSetStopAction(leftMotor, "hold");
    ev3_motorSetStopAction(rightMotor, "hold");
    ev3_motorStop(leftMotor);
    ev3_motorStop(rightMotor);
    ev3_pause(100);

    ev3_runForTime(leftMotor, 1500, -maxSpeed);
    ev3_runForTime(rightMotor, 1500, -maxSpeed);
    ev3_pause(1500);

    ev3_motorStop(leftMotor);
    ev3_motorStop(rightMotor);
    ev3_pause(100);

    nextState = spinAndSearch;
}

// STATE: Initialize robot settings.
function init_state() {
    ev3_motorSetStopAction(leftMotor, "hold");
    ev3_motorSetStopAction(rightMotor, "hold");
    nextState = initialStraightDash;
}

// =================================================================================
// --- Main Program Execution ---
// =================================================================================

init_state();

while (true) {
    nextState();
    ev3_pause(20);
}
