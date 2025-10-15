// =================================================================================
// --- Centralized Configuration & Strategies ---
// =================================================================================

// --- LOOP-BASED TIMINGS ---
const CONFIG_LOOP_PAUSE_MS = 20;
const CONFIG_stallLoops = 25;

// --- General Configuration ---
const CONFIG_maxSearchSpeed = 400;
const CONFIG_baseAttackSpeed = 1000;
const CONFIG_enemyDistanceCm = 50;
const CONFIG_hookPushDifferential = 150;
const CONFIG_baseGyroPGain = 2.5;
const CONFIG_gyroRateFailureThreshold = 30;

// --- Positional Awareness Config ---
const CONFIG_dangerThreshold = 4; // Yellow Ring

// --- Color, Enemy, and Attack Constants ---
const COLOR_BLUE = 2; const COLOR_GREEN = 3; const COLOR_YELLOW = 4;
const COLOR_RED = 5; const COLOR_WHITE = 6;
const ATTACK_STRAIGHT_PUSH = 'STRAIGHT_PUSH'; const ATTACK_HOOK_LEFT = 'HOOK_LEFT';
const ATTACK_HOOK_RIGHT = 'HOOK_RIGHT';


// =================================================================================
// --- Hardware & State Management ---
// =================================================================================
const leftMotor = ev3_motorB(); const rightMotor = ev3_motorC();
const eyes = ev3_ultrasonicSensor(); const gyro = ev3_gyroSensor();
const colorSensor = ev3_colorSensor();

ev3_motorSetStopAction(leftMotor, "brake");
ev3_motorSetStopAction(rightMotor, "brake");

let robotState_stance = 'INIT';
let robotState_previousStance = null;
let robotState_confidence = 10;
let robotState_currentAttack = null;
let robotState_stallStartLoopCount = 0;
let robotState_attackHeading = 0;
let robotState_dangerLevel = 0;


// =================================================================================
// --- Core Helper & Utility Functions ---
// =================================================================================

function isEnemyAhead() { return ev3_ultrasonicSensorDistance(eyes) < CONFIG_enemyDistanceCm; }

function updatePositionalAwareness() {
    const currentColor = ev3_colorSensorGetColor(colorSensor);
    if (currentColor === COLOR_WHITE) { robotState_dangerLevel = 6; }
    else if (currentColor === COLOR_RED) { robotState_dangerLevel = 5; }
    else if (currentColor === COLOR_YELLOW) { robotState_dangerLevel = 4; }
    else if (currentColor === COLOR_GREEN) { robotState_dangerLevel = 2; }
    else if (currentColor === COLOR_BLUE) { robotState_dangerLevel = 1; }
    else { robotState_dangerLevel = 0; }
}

function isInDangerZone() { return robotState_dangerLevel >= CONFIG_dangerThreshold; }

function isStalled(currentLoop) {
    if (robotState_stance === 'ENGAGED' && Math.abs(ev3_motorGetSpeed(leftMotor)) < 15) {
        if (robotState_stallStartLoopCount === 0) { robotState_stallStartLoopCount = currentLoop; }
        if (currentLoop - robotState_stallStartLoopCount >= CONFIG_stallLoops) { return true; }
    } else {
        robotState_stallStartLoopCount = 0;
    }
    return false;
}

// =================================================================================
// --- Driving Primitives & AI Behaviors ---
// =================================================================================

function driveStraight(speed) { ev3_motorSetSpeed(leftMotor, speed); ev3_motorSetSpeed(rightMotor, speed); ev3_motorStart(leftMotor); ev3_motorStart(rightMotor); }
function turnWithGyro(relativeAngle, turnSpeed) { const startAngle = ev3_gyroSensorAngle(gyro); const targetAngle = startAngle + relativeAngle; const turnDirection = (relativeAngle > 0) ? 1 : -1; ev3_motorSetSpeed(leftMotor, -turnSpeed * turnDirection); ev3_motorSetSpeed(rightMotor, turnSpeed * turnDirection); ev3_motorStart(leftMotor); ev3_motorStart(rightMotor); while (Math.abs(ev3_gyroSensorAngle(gyro) - startAngle) < Math.abs(relativeAngle)) { ev3_pause(10); } ev3_motorStop(leftMotor); ev3_motorStop(rightMotor); }
function driveHook(direction) { const fastSpeed = CONFIG_baseAttackSpeed; const slowSpeed = fastSpeed - CONFIG_hookPushDifferential; if (direction === 'left') { ev3_motorSetSpeed(leftMotor, slowSpeed); ev3_motorSetSpeed(rightMotor, fastSpeed); } else { ev3_motorSetSpeed(leftMotor, fastSpeed); ev3_motorSetSpeed(rightMotor, slowSpeed); } ev3_motorStart(leftMotor); ev3_motorStart(rightMotor); }

function escape() {
    driveStraight(-800);
    ev3_pause(500);
    const turnAngle = (robotState_dangerLevel >= 6) ? 150 : 120;
    turnWithGyro(turnAngle, 400);
    robotState_stance = 'SEARCHING';
}

function selectBestStrategy() { return ATTACK_STRAIGHT_PUSH; } // Simplified for clarity

// =================================================================================
// --- Stance Execution Logic ---
// =================================================================================

function executeEngagedStance(currentLoop) {
    if (!isEnemyAhead()) { ev3_motorStop(leftMotor); ev3_motorStop(rightMotor); ev3_pause(500); robotState_stance = 'SEARCHING'; return; }
    if (robotState_previousStance !== "ENGAGED") { robotState_currentAttack = selectBestStrategy(); robotState_attackHeading = ev3_gyroSensorAngle(gyro); }

    const isOverpowered = isStalled(currentLoop);
    const isLosingControl = Math.abs(ev3_gyroSensorRate(gyro)) > CONFIG_gyroRateFailureThreshold;
    if (isOverpowered || (robotState_currentAttack === ATTACK_STRAIGHT_PUSH && isLosingControl)) {
        robotState_confidence = Math.max(0, robotState_confidence - 5);
        robotState_stance = 'SEARCHING';
        return;
    }
    
    let dynamicSpeed = CONFIG_baseAttackSpeed;
    if (robotState_dangerLevel >= 5) { dynamicSpeed = CONFIG_baseAttackSpeed * 0.8; }
    else if (robotState_dangerLevel >= 3) { dynamicSpeed = CONFIG_baseAttackSpeed * 0.9; }
    else { dynamicSpeed = CONFIG_baseAttackSpeed * 1.1; }

    if (robotState_currentAttack === ATTACK_STRAIGHT_PUSH) {
        const currentAngle = ev3_gyroSensorAngle(gyro);
        let error = robotState_attackHeading - currentAngle;
        if (error > 180) { error = error - 360; } else if (error < -180) { error = error + 360; }
        const correction = error * (CONFIG_baseGyroPGain + (robotState_confidence / 10));
        ev3_motorSetSpeed(leftMotor, dynamicSpeed - correction);
        ev3_motorSetSpeed(rightMotor, dynamicSpeed + correction);
        ev3_motorStart(leftMotor); ev3_motorStart(rightMotor);
    } else {
        driveHook(robotState_currentAttack === ATTACK_HOOK_LEFT ? 'left' : 'right');
    }
}

function executeSearchingStance(currentLoop) {
    if (isInDangerZone()) { turnWithGyro(120, 400); }
    else { ev3_motorSetSpeed(leftMotor, CONFIG_maxSearchSpeed); ev3_motorSetSpeed(rightMotor, -CONFIG_maxSearchSpeed); ev3_motorStart(leftMotor); ev3_motorStart(rightMotor); }
}

function deduceStartingPosition() { ev3_pause(100); if (isEnemyAhead()) { robotState_stance = 'ENGAGED'; } else { turnWithGyro(90, 300); robotState_stance = 'SEARCHING'; } }

// =================================================================================
// --- Main Program Loop ---
// =================================================================================
ev3_waitForButtonPress();
let loopCounter = 0;

while (true) {
    updatePositionalAwareness();
    const inDanger = isInDangerZone();
    const enemyVisible = isEnemyAhead();
    const currentStance = robotState_stance;

    if (inDanger && currentStance !== 'ENGAGED') {
        escape();
    } else if (currentStance === 'ENGAGED' && !enemyVisible) {
        robotState_stance = 'SEARCHING';
    } else if (enemyVisible) {
        robotState_stance = 'ENGAGED';
    } else if (currentStance !== 'INIT') {
        robotState_stance = 'SEARCHING';
    }
    
    if (robotState_previousStance !== robotState_stance) {
        robotState_previousStance = robotState_stance;
        if (robotState_stance !== 'ENGAGED') {
            ev3_motorStop(leftMotor); ev3_motorStop(rightMotor);
        }
    }

    if (robotState_stance === 'ENGAGED') { executeEngagedStance(loopCounter); }
    else if (robotState_stance === 'SEARCHING') { executeSearchingStance(loopCounter); }
    else if (robotState_stance === 'INIT') { deduceStartingPosition(); }

    ev3_pause(CONFIG_LOOP_PAUSE_MS);
    loopCounter = loopCounter + 1;
}
