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

export interface RCheevosCondDebug {
  index: number;
  type: string;
  op: string;
  leftAddr: string;
  leftVal: number;
  rightVal: number;
  hitsBefore: number;
  hitsAfter: number;
  requiredHits: number;
  rawPass: boolean;
  finalPass: boolean;
}

export interface RCheevosGroupDebug {
  groupName: string;
  isPaused: boolean;
  wasReset: boolean;
  passed: boolean;
  conditions: RCheevosCondDebug[];
}

export interface RCheevosFrameDebug {
  triggerStateBefore: string;
  triggerStateAfter: string;
  groups: RCheevosGroupDebug[];
}

/**
 * RCheevosEngine: Exact TypeScript port of official RetroAchievements rcheevos C evaluation engine
 * (operand.c, condition.c, condset.c, trigger.c, memref.c).
 */
export class RCheevosEngine {
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

  public static parseCondition(
    clause: string,
    memrefs: Map<number, RCMemRef>
  ): RCCondition | null {
    let str = clause.trim();
    if (!str) return null;

    let type: RCConditionType = RCConditionType.RC_CONDITION_STANDARD;
    if (str.length >= 2 && str.charAt(1) === ":") {
      const prefix = str.charAt(0).toUpperCase();
      switch (prefix) {
        case "P": type = RCConditionType.RC_CONDITION_PAUSE_IF; break;
        case "R": type = RCConditionType.RC_CONDITION_RESET_IF; break;
        case "A": type = RCConditionType.RC_CONDITION_ADD_SOURCE; break;
        case "B": type = RCConditionType.RC_CONDITION_SUB_SOURCE; break;
        case "C": type = RCConditionType.RC_CONDITION_ADD_HITS; break;
        case "D": type = RCConditionType.RC_CONDITION_SUB_HITS; break;
        case "N": type = RCConditionType.RC_CONDITION_AND_NEXT; break;
        case "O": type = RCConditionType.RC_CONDITION_OR_NEXT; break;
        case "M": type = RCConditionType.RC_CONDITION_MEASURED; break;
        case "Q": type = RCConditionType.RC_CONDITION_MEASURED_IF; break;
        case "I": type = RCConditionType.RC_CONDITION_ADD_ADDRESS; break;
        case "T": type = RCConditionType.RC_CONDITION_TRIGGER; break;
        case "K": type = RCConditionType.RC_CONDITION_REMEMBER; break;
        case "Z": type = RCConditionType.RC_CONDITION_RESET_NEXT_IF; break;
        case "G": type = RCConditionType.RC_CONDITION_MEASURED; break;
      }
      str = str.substring(2);
    }

    let requiredHits = 0;
    const parenHitMatch = str.match(/\((\d+)\)$/);
    const dotHitMatch = str.match(/\.(\d+)\.$/);

    if (parenHitMatch) {
      requiredHits = parseInt(parenHitMatch[1], 10) || 0;
      str = str.replace(/\((\d+)\)$/, "").trim();
    } else if (dotHitMatch) {
      requiredHits = parseInt(dotHitMatch[1], 10) || 0;
      str = str.replace(/\.(\d+)\.$/, "").trim();
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

  public static testCondSet(
    condset: RCCondSet,
    evalState: RCEvalState,
    allCondSets: RCCondSet[],
    groupName: string = "Core"
  ): { pass: boolean; debug: RCheevosGroupDebug } {
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

    const condDebugs: RCheevosCondDebug[] = [];

    // 1. Evaluate PauseIf conditions
    for (let i = 0; i < condset.conditions.length; i++) {
      const cond = condset.conditions[i];
      if (cond.type === RCConditionType.RC_CONDITION_PAUSE_IF) {
        const hitsBefore = cond.currentHits;
        const condPass = this.testCondition(cond);
        condDebugs.push({
          index: i + 1,
          type: "PauseIf",
          op: RCOperator[cond.operator],
          leftAddr: cond.operand1.type === RCOperandType.RC_OPERAND_CONST ? "const" : `0x${cond.operand1.value.num.toString(16).toUpperCase()}`,
          leftVal: this.evaluateOperand(cond.operand1),
          rightVal: this.evaluateOperand(cond.operand2),
          hitsBefore,
          hitsAfter: cond.currentHits,
          requiredHits: cond.requiredHits,
          rawPass: condPass,
          finalPass: false,
        });

        if (condPass) {
          evalState.isPaused = true;
          evalState.isTrue = false;
          evalState.isPrimed = false;
          condset.isPaused = true;
          return {
            pass: false,
            debug: {
              groupName,
              isPaused: true,
              wasReset: false,
              passed: false,
              conditions: condDebugs,
            },
          };
        }
      }
    }

    // 2. Evaluate ResetIf conditions
    for (let i = 0; i < condset.conditions.length; i++) {
      const cond = condset.conditions[i];
      if (cond.type === RCConditionType.RC_CONDITION_RESET_IF) {
        const hitsBefore = cond.currentHits;
        const condPass = this.testCondition(cond);
        condDebugs.push({
          index: i + 1,
          type: "ResetIf",
          op: RCOperator[cond.operator],
          leftAddr: cond.operand1.type === RCOperandType.RC_OPERAND_CONST ? "const" : `0x${cond.operand1.value.num.toString(16).toUpperCase()}`,
          leftVal: this.evaluateOperand(cond.operand1),
          rightVal: this.evaluateOperand(cond.operand2),
          hitsBefore,
          hitsAfter: cond.currentHits,
          requiredHits: cond.requiredHits,
          rawPass: condPass,
          finalPass: false,
        });

        if (condPass) {
          cond.isTrue |= 0x02;
          evalState.isTrue = false;
          evalState.isPrimed = false;
          evalState.wasReset = true;

          for (const cs of allCondSets) {
            for (const c of cs.conditions) {
              c.currentHits = 0;
            }
          }
          return {
            pass: false,
            debug: {
              groupName,
              isPaused: false,
              wasReset: true,
              passed: false,
              conditions: condDebugs,
            },
          };
        }
      }
    }

    // 3. Evaluate Requirement Conditions
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
      const hitsBefore = cond.currentHits;
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

      condDebugs.push({
        index: i + 1,
        type: RCConditionType[cond.type],
        op: RCOperator[cond.operator],
        leftAddr: cond.operand1.type === RCOperandType.RC_OPERAND_CONST ? "const" : `0x${cond.operand1.value.num.toString(16).toUpperCase()}`,
        leftVal: this.evaluateOperand(cond.operand1),
        rightVal: this.evaluateOperand(cond.operand2),
        hitsBefore,
        hitsAfter: cond.currentHits,
        requiredHits: cond.requiredHits,
        rawPass,
        finalPass: condPass,
      });

      if (!condPass) {
        evalState.isTrue = false;
        evalState.isPrimed = false;
      }
    }

    if (!hasRequirementCond) {
      evalState.isTrue = false;
    }

    return {
      pass: evalState.isTrue,
      debug: {
        groupName,
        isPaused: false,
        wasReset: false,
        passed: evalState.isTrue,
        conditions: condDebugs,
      },
    };
  }

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

  public static evaluateTriggerWithDebug(
    trigger: RCTrigger,
    reader: RAMemoryReader
  ): { state: RCTriggerState; frameDebug: RCheevosFrameDebug } {
    const stateBefore = RCTriggerState[trigger.state];

    if (
      trigger.state === RCTriggerState.RC_TRIGGER_STATE_TRIGGERED ||
      trigger.state === RCTriggerState.RC_TRIGGER_STATE_DISABLED
    ) {
      return {
        state: RCTriggerState.RC_TRIGGER_STATE_INACTIVE,
        frameDebug: {
          triggerStateBefore: stateBefore,
          triggerStateAfter: "RC_TRIGGER_STATE_INACTIVE",
          groups: [],
        },
      };
    }

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

    const groupsDebug: RCheevosGroupDebug[] = [];
    let ret = 1;

    if (trigger.requirement) {
      const coreRes = this.testCondSet(trigger.requirement, evalState, allCondSets, "Core");
      groupsDebug.push(coreRes.debug);
      ret = coreRes.pass ? 1 : 0;
    }

    if (trigger.alternative && trigger.alternative.length > 0) {
      let sub = 0;
      let idx = 1;
      for (const alt of trigger.alternative) {
        const altRes = this.testCondSet(alt, evalState, allCondSets, `Alt #${idx}`);
        groupsDebug.push(altRes.debug);
        sub |= altRes.pass ? 1 : 0;
        idx++;
      }
      ret &= sub;
    }

    if (evalState.wasReset) {
      for (const cs of allCondSets) {
        for (const c of cs.conditions) {
          c.currentHits = 0;
        }
      }
      if (trigger.hasHits) {
        trigger.hasHits = false;
        return {
          state: RCTriggerState.RC_TRIGGER_STATE_RESET,
          frameDebug: {
            triggerStateBefore: stateBefore,
            triggerStateAfter: "RC_TRIGGER_STATE_RESET",
            groups: groupsDebug,
          },
        };
      }
      return {
        state: RCTriggerState.RC_TRIGGER_STATE_ACTIVE,
        frameDebug: {
          triggerStateBefore: stateBefore,
          triggerStateAfter: "RC_TRIGGER_STATE_ACTIVE",
          groups: groupsDebug,
        },
      };
    }

    if (ret) {
      if (trigger.state === RCTriggerState.RC_TRIGGER_STATE_WAITING) {
        this.resetTrigger(trigger);
        return {
          state: RCTriggerState.RC_TRIGGER_STATE_WAITING,
          frameDebug: {
            triggerStateBefore: stateBefore,
            triggerStateAfter: "RC_TRIGGER_STATE_WAITING",
            groups: groupsDebug,
          },
        };
      }

      trigger.state = RCTriggerState.RC_TRIGGER_STATE_TRIGGERED;
      return {
        state: RCTriggerState.RC_TRIGGER_STATE_TRIGGERED,
        frameDebug: {
          triggerStateBefore: stateBefore,
          triggerStateAfter: "RC_TRIGGER_STATE_TRIGGERED",
          groups: groupsDebug,
        },
      };
    }

    if (evalState.isPaused) {
      trigger.state = RCTriggerState.RC_TRIGGER_STATE_PAUSED;
    } else {
      trigger.state = RCTriggerState.RC_TRIGGER_STATE_ACTIVE;
    }

    return {
      state: trigger.state,
      frameDebug: {
        triggerStateBefore: stateBefore,
        triggerStateAfter: RCTriggerState[trigger.state],
        groups: groupsDebug,
      },
    };
  }

  public static evaluateTrigger(
    trigger: RCTrigger,
    reader: RAMemoryReader
  ): RCTriggerState {
    return this.evaluateTriggerWithDebug(trigger, reader).state;
  }

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
