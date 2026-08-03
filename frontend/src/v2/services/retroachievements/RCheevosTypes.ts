/**
 * RCheevosTypes: 1-to-1 TypeScript types matching official RetroAchievements rcheevos C headers
 * (rc_runtime_types.h & rc_internal.h).
 */

export enum RCMemSize {
  RC_MEMSIZE_8_BITS = 0,
  RC_MEMSIZE_16_BITS = 1,
  RC_MEMSIZE_24_BITS = 2,
  RC_MEMSIZE_32_BITS = 3,
  RC_MEMSIZE_LOW = 4,
  RC_MEMSIZE_HIGH = 5,
  RC_MEMSIZE_BIT_0 = 6,
  RC_MEMSIZE_BIT_1 = 7,
  RC_MEMSIZE_BIT_2 = 8,
  RC_MEMSIZE_BIT_3 = 9,
  RC_MEMSIZE_BIT_4 = 10,
  RC_MEMSIZE_BIT_5 = 11,
  RC_MEMSIZE_BIT_6 = 12,
  RC_MEMSIZE_BIT_7 = 13,
  RC_MEMSIZE_BITCOUNT = 14,
  RC_MEMSIZE_16_BITS_BE = 15,
  RC_MEMSIZE_24_BITS_BE = 16,
  RC_MEMSIZE_32_BITS_BE = 17,
  RC_MEMSIZE_FLOAT = 18,
  RC_MEMSIZE_MBF32 = 19,
  RC_MEMSIZE_MBF32_LE = 20,
  RC_MEMSIZE_FLOAT_BE = 21,
  RC_MEMSIZE_DOUBLE32 = 22,
  RC_MEMSIZE_DOUBLE32_BE = 23,
  RC_MEMSIZE_VARIABLE = 24,
}

export enum RCOperandType {
  RC_OPERAND_ADDRESS = 0,
  RC_OPERAND_DELTA = 1,
  RC_OPERAND_CONST = 2,
  RC_OPERAND_FP = 3,
  RC_OPERAND_FUNC = 4,
  RC_OPERAND_PRIOR = 5,
  RC_OPERAND_BCD = 6,
  RC_OPERAND_INVERTED = 7,
  RC_OPERAND_RECALL = 8,
}

export enum RCConditionType {
  RC_CONDITION_STANDARD = 0,
  RC_CONDITION_PAUSE_IF = 1,
  RC_CONDITION_RESET_IF = 2,
  RC_CONDITION_MEASURED_IF = 3,
  RC_CONDITION_TRIGGER = 4,
  RC_CONDITION_MEASURED = 5,
  RC_CONDITION_ADD_SOURCE = 6,
  RC_CONDITION_SUB_SOURCE = 7,
  RC_CONDITION_ADD_ADDRESS = 8,
  RC_CONDITION_REMEMBER = 9,
  RC_CONDITION_ADD_HITS = 10,
  RC_CONDITION_SUB_HITS = 11,
  RC_CONDITION_RESET_NEXT_IF = 12,
  RC_CONDITION_AND_NEXT = 13,
  RC_CONDITION_OR_NEXT = 14,
}

export enum RCOperator {
  RC_OPERATOR_EQ = 0,
  RC_OPERATOR_LT = 1,
  RC_OPERATOR_LE = 2,
  RC_OPERATOR_GT = 3,
  RC_OPERATOR_GE = 4,
  RC_OPERATOR_NE = 5,
  RC_OPERATOR_NONE = 6,
  RC_OPERATOR_MULT = 7,
  RC_OPERATOR_DIV = 8,
  RC_OPERATOR_AND = 9,
  RC_OPERATOR_XOR = 10,
  RC_OPERATOR_MOD = 11,
  RC_OPERATOR_ADD = 12,
  RC_OPERATOR_SUB = 13,
}

export enum RCTriggerState {
  RC_TRIGGER_STATE_INACTIVE = 0,
  RC_TRIGGER_STATE_WAITING = 1,
  RC_TRIGGER_STATE_ACTIVE = 2,
  RC_TRIGGER_STATE_PAUSED = 3,
  RC_TRIGGER_STATE_RESET = 4,
  RC_TRIGGER_STATE_TRIGGERED = 5,
  RC_TRIGGER_STATE_PRIMED = 6,
  RC_TRIGGER_STATE_DISABLED = 7,
}

export enum RCConditionClassification {
  RC_CONDITION_CLASSIFICATION_COMBINING = 0,
  RC_CONDITION_CLASSIFICATION_PAUSE = 1,
  RC_CONDITION_CLASSIFICATION_RESET = 2,
  RC_CONDITION_CLASSIFICATION_HITTARGET = 3,
  RC_CONDITION_CLASSIFICATION_MEASURED = 4,
  RC_CONDITION_CLASSIFICATION_OTHER = 5,
  RC_CONDITION_CLASSIFICATION_INDIRECT = 6,
}

export interface RCMemRefValue {
  value: number;
  prior: number;
  size: RCMemSize;
  changed: boolean;
}

export interface RCMemRef {
  address: number;
  value: RCMemRefValue;
}

export interface RCOperand {
  type: RCOperandType;
  size: RCMemSize;
  value: {
    memref?: RCMemRef;
    num: number;
    dbl?: number;
  };
  memrefAccessType?: number;
  isCombining?: boolean;
}

export interface RCCondition {
  operand1: RCOperand;
  operand2: RCOperand;
  requiredHits: number;
  currentHits: number;
  type: RCConditionType;
  operator: RCOperator;
  isTrue: number;
}

export interface RCCondSet {
  conditions: RCCondition[];
  numPauseConditions: number;
  numResetConditions: number;
  numHittargetConditions: number;
  numMeasuredConditions: number;
  numOtherConditions: number;
  numIndirectConditions: number;
  isPaused: boolean;
}

export interface RCTrigger {
  requirement: RCCondSet | null;
  alternative: RCCondSet[] | null;
  measuredValue: number;
  measuredTarget: number;
  state: RCTriggerState;
  hasHits: boolean;
  measuredAsPercent: boolean;
  memrefs: Map<number, RCMemRef>;
}

export interface RCEvalState {
  isTrue: boolean;
  isPrimed: boolean;
  isPaused: boolean;
  wasReset: boolean;
  wasCondReset: boolean;
  canMeasure: boolean;
  measuredFromHits: boolean;
  addHits: number;
  andNext: boolean;
  orNext: boolean;
  resetNext: boolean;
  stopProcessing: boolean;
  canShortCircuit: boolean;
  measuredValue: {
    type: string;
    value: number;
  };
}

