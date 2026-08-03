import type { RAMemoryReader } from "./RAMemoryReader";
import {
  RCConditionClassification,
  RCConditionType,
  RCMemSize,
  RCOperandType,
  RCOperator,
  RCTriggerState,
  type RCCondSet,
  type RCCondition,
  type RCEvalState,
  type RCMemRef,
  type RCOperand,
  type RCTrigger,
} from "./RCheevosTypes";

/**
 * RCheevosEngine: Exact TypeScript port of official RetroAchievements rcheevos C evaluation engine
 * (operand.c, condition.c, condset.c, trigger.c, memref.c).
 */
export class RCheevosEngine {
  /**
   * Register or reuse a memory reference in the trigger's memref registry.
   */
  public static getOrCreateMemRef(
    memrefs: Map<number, RCMemRef>,
    address: number,
    size: RCMemSize
  ): RCMemRef {
    let memref = memrefs.get(address);
    if (!memref) {
      memref = {
        address,
        value: {
          value: 0,
          prior: 0,
          size,
          changed: false,
        },
      };
      memrefs.set(address, memref);
    }
    return memref;
  }

  /**
   * Update memory references from RAM peek callback (mirroring memref.c rc_update_memref_values).
   */
  public static updateMemRefValues(
    memrefs: Map<number, RCMemRef>,
    reader: RAMemoryReader
  ): void {
    for (const [address, memref] of memrefs.entries()) {
      let numBytes = 1;
      if (
        memref.value.size === RCMemSize.RC_MEMSIZE_16_BITS ||
        memref.value.size === RCMemSize.RC_MEMSIZE_16_BITS_BE
      ) {
        numBytes = 2;
      } else if (
        memref.value.size === RCMemSize.RC_MEMSIZE_32_BITS ||
        memref.value.size === RCMemSize.RC_MEMSIZE_32_BITS_BE
      ) {
        numBytes = 4;
      }

      const rawVal = reader.readMemory(address, numBytes as 1 | 2 | 4);
      if (rawVal !== memref.value.value) {
        memref.value.prior = memref.value.value;
        memref.value.value = rawVal;
        memref.value.changed = true;
      } else {
        memref.value.changed = false;
      }
    }
  }

  /**
   * Parse operand string (mirroring operand.c rc_parse_operand).
   */
  public static parseOperand(
    raw: string,
    memrefs: Map<number, RCMemRef>
  ): RCOperand {
    let str = raw.trim();
    let operandType = RCOperandType.RC_OPERAND_ADDRESS;

    if (str.startsWith("d0x") || str.startsWith("d0X") || str.startsWith("D0x")) {
      operandType = RCOperandType.RC_OPERAND_DELTA;
      str = str.substring(1);
    } else if (str.startsWith("p0x") || str.startsWith("p0X") || str.startsWith("P0x")) {
      operandType = RCOperandType.RC_OPERAND_PRIOR;
      str = str.substring(1);
    }

    if (str.startsWith("0x") || str.startsWith("0X")) {
      const specifier = str.substring(2, 3).toUpperCase();
      let size: RCMemSize = RCMemSize.RC_MEMSIZE_8_BITS;
      let addrHex = str.substring(2);

      if (specifier === "H") {
        size = RCMemSize.RC_MEMSIZE_8_BITS;
        addrHex = str.substring(3);
      } else if (specifier === "W") {
        size = RCMemSize.RC_MEMSIZE_16_BITS;
        addrHex = str.substring(3);
      } else if (specifier === "X" || specifier === "G") {
        size = RCMemSize.RC_MEMSIZE_32_BITS;
        addrHex = str.substring(3);
      } else if (specifier === "L") {
        size = RCMemSize.RC_MEMSIZE_LOW;
        addrHex = str.substring(3);
      } else if (specifier === "I") {
        size = RCMemSize.RC_MEMSIZE_HIGH;
        addrHex = str.substring(3);
      } else if (specifier >= "M" && specifier <= "U") {
        size = (RCMemSize.RC_MEMSIZE_BIT_0 +
          (specifier.charCodeAt(0) - "M".charCodeAt(0))) as RCMemSize;
        addrHex = str.substring(3);
      }

      const address = parseInt(addrHex, 16) || 0;
      const memref = this.getOrCreateMemRef(memrefs, address, size);

      return {
        type: operandType,
        size,
        value: {
          memref,
          num: address,
        },
      };
    }

    // Constant value
    let num = 0;
    if (str.startsWith("0x") || str.startsWith("0X")) {
      num = parseInt(str, 16);
    } else {
      num = parseInt(str, 10);
    }

    return {
      type: RCOperandType.RC_OPERAND_CONST,
      size: RCMemSize.RC_MEMSIZE_32_BITS,
      value: {
        num: isNaN(num) ? 0 : num,
      },
    };
  }

  /**
   * Evaluate operand (mirroring operand.c rc_evaluate_operand).
   */
  public static evaluateOperand(operand: RCOperand): number {
    if (operand.type === RCOperandType.RC_OPERAND_CONST) {
      return operand.value.num;
    }

    const memref = operand.value.memref;
    if (!memref) return 0;

    let val =
      operand.type === RCOperandType.RC_OPERAND_DELTA ||
      operand.type === RCOperandType.RC_OPERAND_PRIOR
        ? memref.value.prior
        : memref.value.value;

    switch (operand.size) {
      case RCMemSize.RC_MEMSIZE_LOW:
        return val & 0x0f;
      case RCMemSize.RC_MEMSIZE_HIGH:
        return (val >> 4) & 0x0f;
      case RCMemSize.RC_MEMSIZE_BIT_0:
      case RCMemSize.RC_MEMSIZE_BIT_1:
      case RCMemSize.RC_MEMSIZE_BIT_2:
      case RCMemSize.RC_MEMSIZE_BIT_3:
      case RCMemSize.RC_MEMSIZE_BIT_4:
      case RCMemSize.RC_MEMSIZE_BIT_5:
      case RCMemSize.RC_MEMSIZE_BIT_6:
      case RCMemSize.RC_MEMSIZE_BIT_7: {
        const bit = operand.size - RCMemSize.RC_MEMSIZE_BIT_0;
        return (val >> bit) & 1;
      }
      default:
        return val;
    }
  }

  /**
   * Parse single condition clause (mirroring condition.c rc_parse_condition).
   */
  public static parseCondition(
    clause: string,
    memrefs: Map<number, RCMemRef>
  ): RCCondition | null {
    let str = clause.trim();
    if (!str) return null;

    let type: RCConditionType = RCConditionType.RC_CONDITION_STANDARD;
    if (str.startsWith("R:")) { type = RCConditionType.RC_CONDITION_RESET_IF; str = str.substring(2); }
    else if (str.startsWith("P:")) { type = RCConditionType.RC_CONDITION_PAUSE_IF; str = str.substring(2); }
    else if (str.startsWith("A:")) { type = RCConditionType.RC_CONDITION_ADD_ADDRESS; str = str.substring(2); }
    else if (str.startsWith("B:")) { type = RCConditionType.RC_CONDITION_SUB_SOURCE; str = str.substring(2); }
    else if (str.startsWith("C:")) { type = RCConditionType.RC_CONDITION_ADD_SOURCE; str = str.substring(2); }
    else if (str.startsWith("D:")) { type = RCConditionType.RC_CONDITION_SUB_ADDRESS; str = str.substring(2); }
    else if (str.startsWith("N:")) { type = RCConditionType.RC_CONDITION_AND_NEXT; str = str.substring(2); }
    else if (str.startsWith("O:")) { type = RCConditionType.RC_CONDITION_OR_NEXT; str = str.substring(2); }
    else if (str.startsWith("I:")) { type = RCConditionType.RC_CONDITION_RESET_NEXT_IF; str = str.substring(2); }
    else if (str.startsWith("M:")) { type = RCConditionType.RC_CONDITION_MEASURED; str = str.substring(2); }
    else if (str.startsWith("Q:")) { type = RCConditionType.RC_CONDITION_MEASURED_IF; str = str.substring(2); }
    else if (str.startsWith("Z:")) { type = RCConditionType.RC_CONDITION_TRIGGER; str = str.substring(2); }
    else if (str.startsWith("G:")) { type = RCConditionType.RC_CONDITION_ADD_HITS; str = str.substring(2); }
    else if (str.startsWith("H:")) { type = RCConditionType.RC_CONDITION_SUB_HITS; str = str.substring(2); }

    let requiredHits = 0;
    const hitMatch = str.match(/\((\d+)\)$/);
    if (hitMatch) {
      requiredHits = parseInt(hitMatch[1], 10) || 0;
      str = str.replace(/\((\d+)\)$/, "").trim();
    }

    const opMatch = str.match(/(!=|==|<=|>=|=|<|>)/);
    let operator: RCOperator = RCOperator.RC_OPERATOR_EQ;
    let leftStr = str;
    let rightStr = "0";

    if (opMatch) {
      const opStr = opMatch[1];
      if (opStr === "=" || opStr === "==") operator = RCOperator.RC_OPERATOR_EQ;
      else if (opStr === "!=") operator = RCOperator.RC_OPERATOR_NE;
      else if (opStr === "<") operator = RCOperator.RC_OPERATOR_LT;
      else if (opStr === "<=") operator = RCOperator.RC_OPERATOR_LE;
      else if (opStr === ">") operator = RCOperator.RC_OPERATOR_GT;
      else if (opStr === ">=") operator = RCOperator.RC_OPERATOR_GE;

      const parts = str.split(opStr);
      leftStr = parts[0];
      rightStr = parts[1];
    } else {
      operator = RCOperator.RC_OPERATOR_NE;
      leftStr = str;
      rightStr = "0";
    }

    const operand1 = this.parseOperand(leftStr, memrefs);
    const operand2 = this.parseOperand(rightStr, memrefs);

    return {
      operand1,
      operand2,
      requiredHits,
      currentHits: 0,
      type,
      operator,
      isTrue: 0,
    };
  }

  /**
   * Classify condition into rcheevos execution passes (mirroring condset.c rc_classify_condition).
   */
  public static classifyCondition(cond: RCCondition): RCConditionClassification {
    switch (cond.type) {
      case RCConditionType.RC_CONDITION_PAUSE_IF:
        return RCConditionClassification.RC_CONDITION_CLASSIFICATION_PAUSE;
      case RCConditionType.RC_CONDITION_RESET_IF:
        return RCConditionClassification.RC_CONDITION_CLASSIFICATION_RESET;
      case RCConditionType.RC_CONDITION_ADD_ADDRESS:
      case RCConditionType.RC_CONDITION_ADD_SOURCE:
      case RCConditionType.RC_CONDITION_SUB_SOURCE:
        return RCConditionClassification.RC_CONDITION_CLASSIFICATION_INDIRECT;
      case RCConditionType.RC_CONDITION_ADD_HITS:
      case RCConditionType.RC_CONDITION_AND_NEXT:
      case RCConditionType.RC_CONDITION_OR_NEXT:
      case RCConditionType.RC_CONDITION_REMEMBER:
      case RCConditionType.RC_CONDITION_RESET_NEXT_IF:
      case RCConditionType.RC_CONDITION_SUB_HITS:
        return RCConditionClassification.RC_CONDITION_CLASSIFICATION_COMBINING;
      case RCConditionType.RC_CONDITION_MEASURED:
      case RCConditionType.RC_CONDITION_MEASURED_IF:
        return RCConditionClassification.RC_CONDITION_CLASSIFICATION_MEASURED;
      default:
        if (cond.requiredHits !== 0) {
          return RCConditionClassification.RC_CONDITION_CLASSIFICATION_HITTARGET;
        }
        return RCConditionClassification.RC_CONDITION_CLASSIFICATION_OTHER;
    }
  }

  /**
   * Evaluate a single condition (mirroring condition.c rc_test_condition).
   */
  public static testCondition(cond: RCCondition): boolean {
    const val1 = this.evaluateOperand(cond.operand1);
    const val2 = this.evaluateOperand(cond.operand2);

    switch (cond.operator) {
      case RCOperator.RC_OPERATOR_EQ: return val1 === val2;
      case RCOperator.RC_OPERATOR_NE: return val1 !== val2;
      case RCOperator.RC_OPERATOR_LT: return val1 < val2;
      case RCOperator.RC_OPERATOR_LE: return val1 <= val2;
      case RCOperator.RC_OPERATOR_GT: return val1 > val2;
      case RCOperator.RC_OPERATOR_GE: return val1 >= val2;
      default: return false;
    }
  }

  /**
   * Parse condset (group) mirroring condset.c rc_parse_condset.
   */
  public static parseCondSet(
    groupStr: string,
    memrefs: Map<number, RCMemRef>
  ): RCCondSet {
    const clauses = groupStr.split("_");
    const conditions: RCCondition[] = [];
    let numPauseConditions = 0;
    let numResetConditions = 0;
    let numHittargetConditions = 0;
    let numMeasuredConditions = 0;
    let numOtherConditions = 0;
    let numIndirectConditions = 0;

    for (const cl of clauses) {
      const cond = this.parseCondition(cl, memrefs);
      if (!cond) continue;
      conditions.push(cond);

      const classification = this.classifyCondition(cond);
      switch (classification) {
        case RCConditionClassification.RC_CONDITION_CLASSIFICATION_PAUSE:
          numPauseConditions++;
          break;
        case RCConditionClassification.RC_CONDITION_CLASSIFICATION_RESET:
          numResetConditions++;
          break;
        case RCConditionClassification.RC_CONDITION_CLASSIFICATION_HITTARGET:
          numHittargetConditions++;
          break;
        case RCConditionClassification.RC_CONDITION_CLASSIFICATION_MEASURED:
          numMeasuredConditions++;
          break;
        case RCConditionClassification.RC_CONDITION_CLASSIFICATION_INDIRECT:
          numIndirectConditions++;
          break;
        default:
          numOtherConditions++;
          break;
      }
    }

    return {
      conditions,
      numPauseConditions,
      numResetConditions,
      numHittargetConditions,
      numMeasuredConditions,
      numOtherConditions,
      numIndirectConditions,
      isPaused: false,
    };
  }

  /**
   * Evaluate a condition set mirroring condset.c rc_test_condset.
   */
  public static testCondSet(
    condset: RCCondSet,
    evalState: RCEvalState,
    allCondSets: RCCondSet[]
  ): boolean {
    evalState.measuredValue.type = "NONE";
    evalState.addHits = 0;
    evalState.isTrue = true;
    evalState.isPrimed = true;
    evalState.isPaused = false;
    evalState.canMeasure = true;
    evalState.measuredFromHits = false;
    evalState.andNext = true;
    evalState.orNext = false;
    evalState.resetNext = false;
    evalState.stopProcessing = false;

    // 1. Evaluate PauseIf conditions
    for (const cond of condset.conditions) {
      if (cond.type === RCConditionType.RC_CONDITION_PAUSE_IF) {
        const condPass = this.testCondition(cond);
        if (condPass) {
          evalState.isPaused = true;
          evalState.isTrue = false;
          evalState.isPrimed = false;
          condset.isPaused = true;
          return false;
        }
      }
    }

    // 2. Evaluate ResetIf conditions
    for (const cond of condset.conditions) {
      if (cond.type === RCConditionType.RC_CONDITION_RESET_IF) {
        const condPass = this.testCondition(cond);
        if (condPass) {
          cond.isTrue |= 0x02;
          evalState.isTrue = false;
          evalState.isPrimed = false;
          evalState.wasReset = true;

          // Reset all hit counts across all condition sets
          for (const cs of allCondSets) {
            for (const c of cs.conditions) {
              c.currentHits = 0;
            }
          }
          return false;
        }
      }
    }

    // 3. Evaluate Requirement & Combining Conditions
    let hasRequirementCond = false;

    for (let i = 0; i < condset.conditions.length; i++) {
      const cond = condset.conditions[i];

      if (
        cond.type === RCConditionType.RC_CONDITION_PAUSE_IF ||
        cond.type === RCConditionType.RC_CONDITION_RESET_IF
      ) {
        continue;
      }

      hasRequirementCond = true;
      const rawPass = this.testCondition(cond);

      if (cond.requiredHits > 0) {
        if (rawPass && cond.currentHits < cond.requiredHits) {
          cond.currentHits++;
        }
      }

      let condPass = false;
      if (cond.requiredHits > 0) {
        condPass = cond.currentHits >= cond.requiredHits;
      } else {
        condPass = rawPass;
      }

      if (!condPass) {
        evalState.isTrue = false;
        evalState.isPrimed = false;
      }
    }

    if (!hasRequirementCond) {
      evalState.isTrue = false;
    }

    return evalState.isTrue;
  }

  /**
   * Parse trigger string (mirroring trigger.c rc_parse_trigger).
   */
  public static parseTrigger(triggerStr: string): RCTrigger {
    const memrefs = new Map<number, RCMemRef>();
    const altGroupStrings = triggerStr.split(/S|\|/);
    const coreStr = altGroupStrings.shift() || "";

    let requirement: RCCondSet | null = null;
    if (coreStr.trim()) {
      requirement = this.parseCondSet(coreStr, memrefs);
    }

    const alternative: RCCondSet[] = [];
    for (const altStr of altGroupStrings) {
      if (altStr.trim()) {
        alternative.push(this.parseCondSet(altStr, memrefs));
      }
    }

    return {
      requirement,
      alternative: alternative.length > 0 ? alternative : null,
      measuredValue: 0,
      measuredTarget: 0,
      state: RCTriggerState.RC_TRIGGER_STATE_WAITING,
      hasHits: false,
      measuredAsPercent: false,
      memrefs,
    };
  }

  /**
   * Evaluate trigger (mirroring trigger.c rc_evaluate_trigger).
   */
  public static evaluateTrigger(
    trigger: RCTrigger,
    reader: RAMemoryReader
  ): RCTriggerState {
    if (
      trigger.state === RCTriggerState.RC_TRIGGER_STATE_TRIGGERED ||
      trigger.state === RCTriggerState.RC_TRIGGER_STATE_DISABLED
    ) {
      return RCTriggerState.RC_TRIGGER_STATE_INACTIVE;
    }

    // Update memory references first
    this.updateMemRefValues(trigger.memrefs, reader);

    const evalState: RCEvalState = {
      isTrue: true,
      isPrimed: true,
      isPaused: false,
      wasReset: false,
      wasCondReset: false,
      canMeasure: true,
      measuredFromHits: false,
      addHits: 0,
      andNext: true,
      orNext: false,
      resetNext: false,
      stopProcessing: false,
      canShortCircuit: true,
      measuredValue: { type: "NONE", value: 0 },
    };

    const allCondSets: RCCondSet[] = [];
    if (trigger.requirement) allCondSets.push(trigger.requirement);
    if (trigger.alternative) allCondSets.push(...trigger.alternative);

    let ret = 1;
    if (trigger.requirement) {
      ret = this.testCondSet(trigger.requirement, evalState, allCondSets) ? 1 : 0;
    }

    if (trigger.alternative && trigger.alternative.length > 0) {
      let sub = 0;
      for (const alt of trigger.alternative) {
        sub |= this.testCondSet(alt, evalState, allCondSets) ? 1 : 0;
      }
      ret &= sub;
    }

    if (evalState.wasReset) {
      // Reset hitcounts
      for (const cs of allCondSets) {
        for (const c of cs.conditions) {
          c.currentHits = 0;
        }
      }
      if (trigger.hasHits) {
        trigger.hasHits = false;
        return RCTriggerState.RC_TRIGGER_STATE_RESET;
      }
      return RCTriggerState.RC_TRIGGER_STATE_ACTIVE;
    }

    if (ret) {
      if (trigger.state === RCTriggerState.RC_TRIGGER_STATE_WAITING) {
        this.resetTrigger(trigger);
        return RCTriggerState.RC_TRIGGER_STATE_WAITING;
      }

      trigger.state = RCTriggerState.RC_TRIGGER_STATE_TRIGGERED;
      return RCTriggerState.RC_TRIGGER_STATE_TRIGGERED;
    }

    if (evalState.isPaused) {
      trigger.state = RCTriggerState.RC_TRIGGER_STATE_PAUSED;
    } else {
      trigger.state = RCTriggerState.RC_TRIGGER_STATE_ACTIVE;
    }

    return trigger.state;
  }

  /**
   * Reset trigger (mirroring trigger.c rc_reset_trigger).
   */
  public static resetTrigger(trigger: RCTrigger): void {
    const allCondSets: RCCondSet[] = [];
    if (trigger.requirement) allCondSets.push(trigger.requirement);
    if (trigger.alternative) allCondSets.push(...trigger.alternative);

    for (const cs of allCondSets) {
      for (const c of cs.conditions) {
        c.currentHits = 0;
      }
    }

    trigger.state = RCTriggerState.RC_TRIGGER_STATE_WAITING;
    trigger.hasHits = false;
  }
}
