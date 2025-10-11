#!/usr/bin/env node
var ev3 = require('./node_modules/ev3source/ev3.js');
var source = require('./node_modules/ev3source/source.js');

// =================================================================================
// --- Centralized Configuration & Strategies ---
// =================================================================================

// This object holds all tunable parameters for the robot's behavior.
// Centralizing them here makes it easy to fine-tune the robot without searching the code.
const config = {
    DEBUG: false,
    maxSearchSpeed: 400,
    baseAttackSpeed: 1000,
    escapeSpeed: -800,
    gyroPGain: 2.5,
    dangerThreshold: 5,
    enemyDistanceCm: 50,
    gyroTurnSpeed: 400,
    hookPushDifferential: 150,
    // --- TIME-BASED TIMINGS (in milliseconds) ---
    stallTimeMs: 500,               // Time until a stall is confirmed
    matchDurationMs: 60000,           // 60-second match length
    desperationModeStartTimeMs: 45000,  // When to enter desperation mode
    stateTimeoutMs: 8000,             // Time in a state before a reset is considered
    targetConfirmMs: 200,             // Time to confirm a target is real
    attackSuccessTimeMs: 1500,        // Time an attack must run to be a "success"
    riposteRiskThreshold: 10          // Risk score below which a riposte is attempted
};

// Defines available attack patterns and their effectiveness scores.
const attackStrategies = {
    'STRAIGHT_PUSH': { score: 15, name: 'STRAIGHT_PUSH' },
    'HOOK_LEFT':     { score: 10, name: 'HOOK_LEFT' },
    'HOOK_RIGHT':    { score: 10, name: 'HOOK_RIGHT' }
};

// =================================================================================
// --- Hardware & State Management ---
// =================================================================================
const leftMotor = ev3.motorB();
const rightMotor = ev3.motorC();
const eyes = ev3.ultrasonicSensor();
const gyro = ev3.gyroSensor();
const colorSensor = ev3.colorSensor();

// Use "brake" for precise stops.
ev3.motorSetStopAction(leftMotor, "brake");
ev3.motorSetStopAction(rightMotor, "brake");

// Reset gyro at startup for an accurate zero-point.
ev3.gyroSensorReset(gyro);
source.alert("Gyro calibrated.");
ev3.sleep(2000);

// Holds all dynamic variables for the robot's state and memory.
const robotState = {
    stance: 'INIT',                 // The robot's primary mode: INIT, SEARCHING, or ENGAGED.
    previousStance: null,
    targetLockTime: 0,              // Timestamp when an opponent was first seen.
    torqueConfidence: 10,           // Confidence in winning a head-on push.
    currentAttack: null,            // The currently executing attack strategy.
    lastAttackSuccessCheck: 0,
    stallStartTime: 0,
    stateEnterTime: 0,
    centerVector: 0,                // Gyro angle pointing towards the arena center.
    isPassivelyScanning: false,     // Flag for the initial 360-degree mapping turn.
    passiveScanStartAngle: 0
};

let powerMultiplier = 1.0; // Battery compensation factor.

// =================================================================================
// --- Helper & Utility Functions ---
// =================================================================================
// NOTE: All helper functions are assumed to be here, now using Date.now() for timing.
// This includes: getDynamicSpeed, driveStraight, isStalled (using Date.now()),
// getDangerLevel, inDangerZone, isEnemyAhead, turnWithGyro, driveHook,
// calculateRiskScore, escape, riposte, deduceStartingPosition, etc.

/**
 * Selects the best attack strategy based on the Juggernaut's confidence.
 * @returns {object} The strategy object to be executed.
 */
function selectBestStrategy() {
    // If torque confidence is high, always favor the dominant straight push.
    if (robotState.torqueConfidence > 5) {
        return attackStrategies.STRAIGHT_PUSH;
    }
    // If confidence is low, fall back to the highest-scoring hook maneuver.
    let bestStrategy = attackStrategies.HOOK_LEFT;
    if (attackStrategies.HOOK_RIGHT.score > attackStrategies.HOOK_LEFT.score) {
        bestStrategy = attackStrategies.HOOK_RIGHT;
    }
    return bestStrategy;
}

// =================================================================================
// --- Stance Execution Logic ---
// =================================================================================

/**
 * Handles all logic when the robot is actively engaged with an opponent.
 */
function executeEngagedStance() {
    // This runs once when the stance is first entered.
    if (robotState.previousStance !== "ENGAGED") {
        robotState.currentAttack = selectBestStrategy();
        source.alert("Engaged: " + robotState.currentAttack.name);
        robotState.stallStartTime = 0;
        robotState.lastAttackSuccessCheck = Date.now();
    }
    
    const isCurrentlyStalled = isStalled(); // isStalled() now uses Date.now()

    // If the current push is successful, increase our confidence.
    if (!isCurrentlyStalled) {
        if (Date.now() - robotState.lastAttackSuccessCheck > config.attackSuccessTimeMs) {
            if (robotState.currentAttack.name === 'STRAIGHT_PUSH') {
                 robotState.torqueConfidence = Math.min(20, robotState.torqueConfidence + 5);
            }
            robotState.lastAttackSuccessCheck = Date.now();
        }
    }
    
    // Execute the attack, steering the opponent out using the Pressure Vector.
    if (robotState.currentAttack.name === 'STRAIGHT_PUSH') {
        const pressureVector = (robotState.centerVector + 180) % 360;
        robotState.targetHeading = pressureVector;
        driveStraight(getDynamicSpeed(config.baseAttackSpeed));
    } else if (robotState.currentAttack.name === 'HOOK_LEFT') {
        driveHook('left');
    } else {
        driveHook('right');
    }
    
    // If we stall, confidence is broken. Flank and switch to searching.
    if (isCurrentlyStalled) {
        source.alert("Stalled! Confidence broken.");
        if (robotState.currentAttack.name === 'STRAIGHT_PUSH') robotState.torqueConfidence = 0;
        turnWithGyro(Math.random() < 0.5 ? 45 : -45);
        robotState.stance = 'SEARCHING';
    }
}

/**
 * Handles all logic when no opponent is visible.
 * It searches for a target while safely mapping the arena.
 */
function executeSearchingStance() {
    // This runs once when the stance is first entered.
    if (robotState.previousStance !== "SEARCHING") {
        source.alert("Stance: Searching");
        // Begin a 360-degree turn to passively map the arena.
        robotState.isPassivelyScanning = true;
        robotState.passiveScanStartAngle = ev3.gyroSensorAngle(gyro);
        ev3.run(leftMotor, -getDynamicSpeed(config.maxSearchSpeed));
        ev3.run(rightMotor, getDynamicSpeed(config.maxSearchSpeed));
    }

    // While turning, passively update the center vector if a safe color is seen.
    if (robotState.isPassivelyScanning) {
        const currentAngle = ev3.gyroSensorAngle(gyro);
        if (getDangerLevel() <= 2) {
            robotState.centerVector = currentAngle;
        }
        // End the passive scan after a full circle.
        if (Math.abs(currentAngle - robotState.passiveScanStartAngle) >= 350) {
            robotState.isPassivelyScanning = false;
            ev3.motorStop(leftMotor);
            ev3.motorStop(rightMotor);
        }
    } else {
        // After the initial scan, use a more methodical "Pulse Search".
        turnWithGyro(90);
        ev3.sleep(150);
    }
}

// =================================================================================
// --- Main Program Loop ---
// =================================================================================
source.alert("Ready! Press button.");
ev3.waitForButtonPress();
const matchStartTime = Date.now();

while (Date.now() - matchStartTime < config.matchDurationMs) {
    const enemyVisible = isEnemyAhead();
    const inDanger = inDangerZone();

    // --- Stance Transition Logic (The Robot's Brain) ---
    // PRIORITY 1: DANGER. Survival comes first.
    if (inDanger) {
        const riskScore = calculateRiskScore();
        if (riskScore < config.riposteRiskThreshold) {
            riposte();
        } else {
            escape();
        }
        robotState.stance = 'SEARCHING';
    
    // PRIORITY 2: ENEMY SIGHTED. Confirm and engage.
    } else if (enemyVisible) {
        if (robotState.targetLockTime === 0) robotState.targetLockTime = Date.now();
        if (Date.now() - robotState.targetLockTime >= config.targetConfirmMs) {
            robotState.stance = 'ENGAGED';
        }
    
    // PRIORITY 3: ALL CLEAR. Search for a target.
    } else {
        robotState.targetLockTime = 0;
        robotState.stance = 'SEARCHING';
    }
    
    // --- Stance Execution ---
    const currentStance = robotState.stance;
    // Detect when a stance changes to run setup code.
    if (robotState.previousStance !== currentStance) {
        robotState.stateEnterTime = Date.now();
        robotState.previousStance = currentStance;
        ev3.motorStop(leftMotor);
        ev3.motorStop(rightMotor);
    }

    if (currentStance === 'ENGAGED') {
        executeEngagedStance();
    } else if (currentStance === 'SEARCHING') {
        executeSearchingStance();
    } else if (currentStance === 'INIT') {
        // Runs only once at the start of the match.
        deduceStartingPosition();
    }

    // A minimal pause to prevent the loop from overwhelming the processor.
    ev3.sleep(20);
}

// Match timer has ended.
source.alert("MATCH OVER");
ev3.motorStop(leftMotor);
ev3.motorStop(rightMotor);
