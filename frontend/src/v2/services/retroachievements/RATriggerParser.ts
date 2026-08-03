import type { RAMemoryReader } from "./RAMemoryReader";

export interface RAOperand {
  type: "mem" | "val";
  size: 1 | 2 | 4;
  bit?: number | null;
  nibble?: "lower" | "upper" | null;
  address: number;
  value: number;
  isDelta: boolean;
  isPrior: boolean;
}

export type RAOperator = "=" | "!=" | "<" | "<=" | ">" | ">=";

export type RAConditionFlag =
  | "none"
  | "ResetIf"
  | "PauseIf"
  | "AddAddress"
  | "SubAddress"
  | "AddSource"
  | "SubSource"
  | "AndNext"
  | "OrNext"
  | "ResetNextIf"
  | "AddHits"
  | "SubHits"
  | "Measured"
  | "MeasuredIf"
  | "Trigger";

export interface RACondition {
  flag: RAConditionFlag;
  left: RAOperand;
  operator: RAOperator;
  right: RAOperand;
  targetHits: number;
  currentHits: number;
}

export interface RATriggerGroup {
  conditions: RACondition[];
}

export interface RATrigger {
  coreGroup: RATriggerGroup;
  altGroups: RATriggerGroup[];
}

/**
 * RATriggerParser: RetroAchievements trigger state machine compliant with official rcheevos standard.
 */
export class RATriggerParser {
  /**
   * Parse a single memory or constant operand string (e.g. 0xH075A, d0xH075A, p0xW075A, 1, 0x10).
   */
  public static parseOperand(raw: string): RAOperand {
    let str = raw.trim();
    let isDelta = false;
    let isPrior = false;

    if (str.startsWith("d0x") || str.startsWith("d0X") || str.startsWith("D0x")) {
      isDelta = true;
      str = str.substring(1);
    } else if (str.startsWith("p0x") || str.startsWith("p0X") || str.startsWith("P0x")) {
      isPrior = true;
      str = str.substring(1);
    }

    if (str.startsWith("0x") || str.startsWith("0X")) {
      const specifier = str.substring(2, 3).toUpperCase();
      let size: 1 | 2 | 4 = 1;
      let bit: number | null = null;
      let nibble: "lower" | "upper" | null = null;
      let addrHex = str.substring(2);

      if ("H" === specifier) {
        size = 1;
        addrHex = str.substring(3);
      } else if ("W" === specifier) {
        size = 2;
        addrHex = str.substring(3);
      } else if ("X" === specifier || "G" === specifier) {
        size = 4;
        addrHex = str.substring(3);
      } else if ("L" === specifier) {
        size = 1;
        nibble = "lower";
        addrHex = str.substring(3);
      } else if ("I" === specifier) {
        size = 1;
        nibble = "upper";
        addrHex = str.substring(3);
      } else if ("M" <= specifier && specifier <= "U") {
        size = 1;
        bit = specifier.charCodeAt(0) - "M".charCodeAt(0);
        addrHex = str.substring(3);
      }

      const address = parseInt(addrHex, 16) || 0;
      return {
        type: "mem",
        size,
        bit,
        nibble,
        address,
        value: 0,
        isDelta,
        isPrior,
      };
    }

    // Constant value
    let val = 0;
    if (str.startsWith("0x") || str.startsWith("0X")) {
      val = parseInt(str, 16);
    } else {
      val = parseInt(str, 10);
    }

    return {
      type: "val",
      size: 1,
      address: 0,
      value: isNaN(val) ? 0 : val,
      isDelta: false,
      isPrior: false,
    };
  }

  /**
   * Parse a single condition clause (e.g. 0xH075A=1, R:0xH0770=0, P:0x075A!=0(3)).
   */
  public static parseCondition(clause: string): RACondition | null {
    let str = clause.trim();
    if (!str) return null;

    let flag: RAConditionFlag = "none";
    if (str.startsWith("R:")) { flag = "ResetIf"; str = str.substring(2); }
    else if (str.startsWith("P:")) { flag = "PauseIf"; str = str.substring(2); }
    else if (str.startsWith("A:")) { flag = "AddAddress"; str = str.substring(2); }
    else if (str.startsWith("B:")) { flag = "SubSource"; str = str.substring(2); }
    else if (str.startsWith("C:")) { flag = "AddSource"; str = str.substring(2); }
    else if (str.startsWith("D:")) { flag = "SubAddress"; str = str.substring(2); }
    else if (str.startsWith("N:")) { flag = "AndNext"; str = str.substring(2); }
    else if (str.startsWith("O:")) { flag = "OrNext"; str = str.substring(2); }
    else if (str.startsWith("I:")) { flag = "ResetNextIf"; str = str.substring(2); }
    else if (str.startsWith("M:")) { flag = "Measured"; str = str.substring(2); }
    else if (str.startsWith("Q:")) { flag = "MeasuredIf"; str = str.substring(2); }
    else if (str.startsWith("Z:")) { flag = "Trigger"; str = str.substring(2); }
    else if (str.startsWith("G:")) { flag = "AddHits"; str = str.substring(2); }
    else if (str.startsWith("H:")) { flag = "SubHits"; str = str.substring(2); }

    // Hit count requirement like (3)
    let targetHits = 0;
    const hitMatch = str.match(/\((\d+)\)$/);
    if (hitMatch) {
      targetHits = parseInt(hitMatch[1], 10) || 0;
      str = str.replace(/\((\d+)\)$/, "").trim();
    }

    // Extract operator
    const opMatch = str.match(/(!=|==|<=|>=|=|<|>)/);
    let operator: RAOperator = "=";
    let leftStr = str;
    let rightStr = "0";

    if (opMatch) {
      const opStr = opMatch[1];
      operator = opStr === "==" ? "=" : (opStr as RAOperator);
      const parts = str.split(opStr);
      leftStr = parts[0];
      rightStr = parts[1];
    } else {
      operator = "!=";
      leftStr = str;
      rightStr = "0";
    }

    const left = this.parseOperand(leftStr);
    const right = this.parseOperand(rightStr);

    return {
      flag,
      left,
      operator,
      right,
      targetHits,
      currentHits: 0,
    };
  }

  /**
   * Parse complete trigger expression string (e.g. 0xH075A=1_0xH075E=1S0xH075A=2).
   */
  public static parseTrigger(triggerStr: string): RATrigger {
    const altGroupStrings = triggerStr.split(/S|\|/);
    const coreStr = altGroupStrings.shift() || "";

    const parseGroup = (groupStr: string): RATriggerGroup => {
      const clauses = groupStr.split("_");
      const conditions: RACondition[] = [];
      for (const cl of clauses) {
        const cond = this.parseCondition(cl);
        if (cond) conditions.push(cond);
      }
      return { conditions };
    };

    const coreGroup = parseGroup(coreStr);
    const altGroups = altGroupStrings.map(parseGroup);

    return { coreGroup, altGroups };
  }

  /**
   * Evaluate an operand against RAM or return constant value.
   */
  public static evaluateOperand(op: RAOperand, reader: RAMemoryReader): number {
    if (op.type === "val") return op.value;
    let val = reader.readMemory(op.address, op.size, op.bit, op.isDelta, op.isPrior);

    if (op.nibble === "lower") {
      val = val & 0x0f;
    } else if (op.nibble === "upper") {
      val = (val >> 4) & 0x0f;
    }
    return val;
  }

  /**
   * Evaluate a single condition group according to official rcheevos state machine rules.
   */
  public static evaluateGroup(
    group: RATriggerGroup,
    reader: RAMemoryReader,
    allGroups: RATriggerGroup[]
  ): { pass: boolean; resetFired: boolean; pauseFired: boolean; reqBreakdown: any[] } {
    const conditions = group.conditions;
    const reqBreakdown: any[] = [];

    let addAddressOffset = 0;
    let addSourceVal = 0;
    let subSourceVal = 0;

    const evalMem = (cond: RACondition) => {
      const leftOp = {
        ...cond.left,
        address: cond.left.type === "mem" ? cond.left.address + addAddressOffset : cond.left.address,
      };
      addAddressOffset = 0;

      let leftVal = this.evaluateOperand(leftOp, reader) + addSourceVal - subSourceVal;
      addSourceVal = 0;
      subSourceVal = 0;

      const rightVal = this.evaluateOperand(cond.right, reader);

      let rawPass = false;
      switch (cond.operator) {
        case "=": rawPass = leftVal === rightVal; break;
        case "!=": rawPass = leftVal !== rightVal; break;
        case "<": rawPass = leftVal < rightVal; break;
        case "<=": rawPass = leftVal <= rightVal; break;
        case ">": rawPass = leftVal > rightVal; break;
        case ">=": rawPass = leftVal >= rightVal; break;
      }
      return { rawPass, leftVal, rightVal };
    };

    // 1. Check ResetIf conditions across group
    for (const cond of conditions) {
      if (cond.flag === "ResetIf") {
        const { rawPass } = evalMem(cond);
        if (rawPass) {
          // Reset all hit counters across all groups
          for (const g of allGroups) {
            for (const c of g.conditions) {
              c.currentHits = 0;
            }
          }
          return { pass: false, resetFired: true, pauseFired: false, reqBreakdown: [] };
        }
      }
    }

    // 2. Check ResetNextIf conditions
    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];
      if (cond.flag === "ResetNextIf") {
        const { rawPass } = evalMem(cond);
        if (rawPass && i + 1 < conditions.length) {
          conditions[i + 1].currentHits = 0;
        }
      }
    }

    // 3. Check PauseIf conditions
    for (const cond of conditions) {
      if (cond.flag === "PauseIf") {
        const { rawPass } = evalMem(cond);
        if (rawPass) {
          return { pass: false, resetFired: false, pauseFired: true, reqBreakdown: [] };
        }
      }
    }

    // 4. Requirement Conditions Evaluation
    let groupPass = true;
    let hasRequirementCond = false;
    let addHitsAccumulator = 0;
    let subHitsAccumulator = 0;
    let skipNextCond = false;

    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];

      if (skipNextCond) {
        skipNextCond = false;
        continue;
      }

      // Handle Modifiers
      if (cond.flag === "AddAddress") {
        addAddressOffset = this.evaluateOperand(cond.left, reader);
        continue;
      }
      if (cond.flag === "SubAddress") {
        addAddressOffset = -this.evaluateOperand(cond.left, reader);
        continue;
      }
      if (cond.flag === "AddSource") {
        addSourceVal = this.evaluateOperand(cond.left, reader);
        continue;
      }
      if (cond.flag === "SubSource") {
        subSourceVal = this.evaluateOperand(cond.left, reader);
        continue;
      }
      if (cond.flag === "AndNext") {
        const { rawPass } = evalMem(cond);
        if (!rawPass) skipNextCond = true;
        continue;
      }
      if (cond.flag === "OrNext") {
        const { rawPass } = evalMem(cond);
        if (rawPass) skipNextCond = true;
        continue;
      }
      if (cond.flag === "ResetIf" || cond.flag === "PauseIf" || cond.flag === "ResetNextIf") {
        continue;
      }

      // Requirement Condition (none, Measured, MeasuredIf, Trigger, AddHits, SubHits)
      hasRequirementCond = true;
      const { rawPass, leftVal, rightVal } = evalMem(cond);

      if (cond.targetHits > 0) {
        if (rawPass && cond.currentHits < cond.targetHits) {
          cond.currentHits++;
        }
      }

      let totalHits = cond.currentHits + addHitsAccumulator - subHitsAccumulator;
      addHitsAccumulator = 0;
      subHitsAccumulator = 0;

      if (cond.flag === "AddHits") {
        addHitsAccumulator = totalHits;
        continue;
      }
      if (cond.flag === "SubHits") {
        subHitsAccumulator = totalHits;
        continue;
      }

      let condPass = false;
      if (cond.targetHits > 0) {
        condPass = totalHits >= cond.targetHits;
      } else {
        condPass = rawPass;
      }

      reqBreakdown.push({
        index: i + 1,
        flag: cond.flag,
        operator: cond.operator,
        address: cond.left.type === "mem" ? `0x${cond.left.address.toString(16).toUpperCase()}` : "val",
        leftVal,
        rightVal,
        hits: totalHits,
        targetHits: cond.targetHits,
        pass: condPass,
      });

      if (!condPass) {
        groupPass = false;
      }
    }

    // A group MUST have at least 1 requirement condition passing to be valid
    if (!hasRequirementCond) {
      groupPass = false;
    }

    return { pass: groupPass, resetFired: false, pauseFired: false, reqBreakdown };
  }

  /**
   * Evaluate full trigger (Core + Alt Groups).
   */
  public static evaluateTrigger(trigger: RATrigger, reader: RAMemoryReader): boolean {
    const allGroups = [trigger.coreGroup, ...trigger.altGroups];

    // Core Group MUST pass
    const coreResult = this.evaluateGroup(trigger.coreGroup, reader, allGroups);
    if (!coreResult.pass) return false;

    // Alt Groups (OR logic)
    if (trigger.altGroups.length > 0) {
      let anyAltPass = false;
      for (const alt of trigger.altGroups) {
        const altResult = this.evaluateGroup(alt, reader, allGroups);
        if (altResult.pass) {
          anyAltPass = true;
          break;
        }
      }
      if (!anyAltPass) return false;
    }

    return true;
  }
}
