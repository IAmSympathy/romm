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

export interface ParseCursor {
  str: string;
  pos: number;
}

/**
 * RCheevosEngine: Faithful TypeScript port of official RetroAchievements rcheevos C evaluation engine
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
      let numBytes: 1 | 2 | 4 = 1;
      let endian: "little" | "big" = "little";

      switch (memref.value.size) {
        case RCMemSize.RC_MEMSIZE_16_BITS:
          numBytes = 2;
          endian = "little";
          break;
        case RCMemSize.RC_MEMSIZE_16_BITS_BE:
          numBytes = 2;
          endian = "big";
          break;
        case RCMemSize.RC_MEMSIZE_24_BITS:
          numBytes = 4;
          endian = "little";
          break;
        case RCMemSize.RC_MEMSIZE_24_BITS_BE:
          numBytes = 4;
          endian = "big";
          break;
        case RCMemSize.RC_MEMSIZE_32_BITS:
        case RCMemSize.RC_MEMSIZE_FLOAT:
        case RCMemSize.RC_MEMSIZE_DOUBLE32:
        case RCMemSize.RC_MEMSIZE_MBF32:
        case RCMemSize.RC_MEMSIZE_MBF32_LE:
          numBytes = 4;
          endian = "little";
          break;
        case RCMemSize.RC_MEMSIZE_32_BITS_BE:
        case RCMemSize.RC_MEMSIZE_FLOAT_BE:
        case RCMemSize.RC_MEMSIZE_DOUBLE32_BE:
          numBytes = 4;
          endian = "big";
          break;
        default:
          numBytes = 1;
          break;
      }

      const rawVal = reader.readMemory(address, numBytes, null, false, false, endian);
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
   * Parse memory reference matching official rcheevos `memref.c` (rc_parse_memref).
   */
  public static parseMemRef(
    cursor: ParseCursor,
    memrefs: Map<number, RCMemRef>
  ): { size: RCMemSize; address: number; memref: RCMemRef } | null {
    const { str } = cursor;
    let size: RCMemSize = RCMemSize.RC_MEMSIZE_16_BITS;

    if (cursor.pos >= str.length) return null;

    const char0 = str[cursor.pos];

    if (char0 === "0") {
      if (cursor.pos + 1 >= str.length) return null;
      const char1 = str[cursor.pos + 1];
      if (char1 !== "x" && char1 !== "X") return null;

      cursor.pos += 2; // Skip '0x'
      if (cursor.pos >= str.length) return null;

      const specifier = str[cursor.pos];

      switch (specifier) {
        case "h": case "H": size = RCMemSize.RC_MEMSIZE_8_BITS; cursor.pos++; break;
        case " ":           size = RCMemSize.RC_MEMSIZE_16_BITS; cursor.pos++; break;
        case "x": case "X": size = RCMemSize.RC_MEMSIZE_32_BITS; cursor.pos++; break;
        case "m": case "M": size = RCMemSize.RC_MEMSIZE_BIT_0; cursor.pos++; break;
        case "n": case "N": size = RCMemSize.RC_MEMSIZE_BIT_1; cursor.pos++; break;
        case "o": case "O": size = RCMemSize.RC_MEMSIZE_BIT_2; cursor.pos++; break;
        case "p": case "P": size = RCMemSize.RC_MEMSIZE_BIT_3; cursor.pos++; break;
        case "q": case "Q": size = RCMemSize.RC_MEMSIZE_BIT_4; cursor.pos++; break;
        case "r": case "R": size = RCMemSize.RC_MEMSIZE_BIT_5; cursor.pos++; break;
        case "s": case "S": size = RCMemSize.RC_MEMSIZE_BIT_6; cursor.pos++; break;
        case "t": case "T": size = RCMemSize.RC_MEMSIZE_BIT_7; cursor.pos++; break;
        case "l": case "L": size = RCMemSize.RC_MEMSIZE_LOW; cursor.pos++; break;
        case "u": case "U": size = RCMemSize.RC_MEMSIZE_HIGH; cursor.pos++; break;
        case "k": case "K": size = RCMemSize.RC_MEMSIZE_BITCOUNT; cursor.pos++; break;
        case "w": case "W": size = RCMemSize.RC_MEMSIZE_24_BITS; cursor.pos++; break;
        case "g": case "G": size = RCMemSize.RC_MEMSIZE_32_BITS_BE; cursor.pos++; break;
        case "i": case "I": size = RCMemSize.RC_MEMSIZE_16_BITS_BE; cursor.pos++; break;
        case "j": case "J": size = RCMemSize.RC_MEMSIZE_24_BITS_BE; cursor.pos++; break;
        default:
          if (/^[0-9a-fA-F]$/.test(specifier)) {
            size = RCMemSize.RC_MEMSIZE_16_BITS;
          } else {
            console.warn(`[rcheevos] Rejected invalid memory size prefix: "${specifier}" at pos ${cursor.pos} in "${str}"`);
            return null;
          }
          break;
      }
    } else if (char0 === "f" || char0 === "F") {
      cursor.pos++;
      if (cursor.pos >= str.length) return null;
      const specifier = str[cursor.pos];
      switch (specifier) {
        case "f": case "F": size = RCMemSize.RC_MEMSIZE_FLOAT; cursor.pos++; break;
        case "b": case "B": size = RCMemSize.RC_MEMSIZE_FLOAT_BE; cursor.pos++; break;
        case "h": case "H": size = RCMemSize.RC_MEMSIZE_DOUBLE32; cursor.pos++; break;
        case "i": case "I": size = RCMemSize.RC_MEMSIZE_DOUBLE32_BE; cursor.pos++; break;
        case "m": case "M": size = RCMemSize.RC_MEMSIZE_MBF32; cursor.pos++; break;
        case "l": case "L": size = RCMemSize.RC_MEMSIZE_MBF32_LE; cursor.pos++; break;
        default:
          console.warn(`[rcheevos] Rejected invalid float memory size prefix: "${specifier}" at pos ${cursor.pos} in "${str}"`);
          return null;
      }
    } else {
      return null;
    }

    const rest = str.substring(cursor.pos);
    const hexMatch = rest.match(/^[0-9a-fA-F]+/);
    if (!hexMatch) {
      console.warn(`[rcheevos] Failed to parse hex address at pos ${cursor.pos} in "${str}"`);
      return null;
    }

    const hexStr = hexMatch[0];
    const address = parseInt(hexStr, 16);
    cursor.pos += hexStr.length;

    const memref = this.getOrCreateMemRef(memrefs, address, size);
    return { size, address, memref };
  }

  /**
   * Parse operand matching official rcheevos `operand.c` (rc_parse_operand).
   */
  public static parseOperand(
    cursor: ParseCursor,
    memrefs: Map<number, RCMemRef>
  ): RCOperand {
    const { str } = cursor;
    let operandType = RCOperandType.RC_OPERAND_ADDRESS;

    if (cursor.pos >= str.length) {
      return {
        type: RCOperandType.RC_OPERAND_CONST,
        size: RCMemSize.RC_MEMSIZE_32_BITS,
        value: { num: 0 },
      };
    }

    const ch = str[cursor.pos];

    switch (ch) {
      case "h": case "H": {
        cursor.pos++;
        const rest = str.substring(cursor.pos);
        const match = rest.match(/^[0-9a-fA-F]+/);
        if (match) {
          const val = parseInt(match[0], 16);
          cursor.pos += match[0].length;
          return {
            type: RCOperandType.RC_OPERAND_CONST,
            size: RCMemSize.RC_MEMSIZE_32_BITS,
            value: { num: isNaN(val) ? 0 : val },
          };
        }
        break;
      }

      case "f": case "F": {
        if (cursor.pos + 1 < str.length && /^[a-zA-Z]$/.test(str[cursor.pos + 1])) {
          const mem = this.parseMemRef(cursor, memrefs);
          if (mem) {
            return {
              type: RCOperandType.RC_OPERAND_ADDRESS,
              size: mem.size,
              value: { memref: mem.memref, num: mem.address },
            };
          }
        }
        cursor.pos++;
        const rest = str.substring(cursor.pos);
        const fpMatch = rest.match(/^[-+]?[0-9]*\.?[0-9]+/);
        if (fpMatch) {
          const dbl = parseFloat(fpMatch[0]);
          cursor.pos += fpMatch[0].length;
          return {
            type: RCOperandType.RC_OPERAND_FP,
            size: RCMemSize.RC_MEMSIZE_FLOAT,
            value: { num: Math.floor(dbl) || 0, dbl: isNaN(dbl) ? 0 : dbl },
          };
        }
        break;
      }

      case "v": case "V": case "+": case "-": {
        if (ch === "v" || ch === "V") cursor.pos++;
        const rest = str.substring(cursor.pos);
        const numMatch = rest.match(/^[-+]?[0-9]+/);
        if (numMatch) {
          const val = parseInt(numMatch[0], 10);
          cursor.pos += numMatch[0].length;
          return {
            type: RCOperandType.RC_OPERAND_CONST,
            size: RCMemSize.RC_MEMSIZE_32_BITS,
            value: { num: isNaN(val) ? 0 : (val >>> 0) },
          };
        }
        break;
      }

      case "{": {
        cursor.pos++;
        const endBrace = str.indexOf("}", cursor.pos);
        if (endBrace !== -1) {
          cursor.pos = endBrace + 1;
          return {
            type: RCOperandType.RC_OPERAND_RECALL,
            size: RCMemSize.RC_MEMSIZE_32_BITS,
            value: { num: 0 },
          };
        }
        break;
      }

      case "d": case "D":
        operandType = RCOperandType.RC_OPERAND_DELTA;
        cursor.pos++;
        break;

      case "p": case "P":
        operandType = RCOperandType.RC_OPERAND_PRIOR;
        cursor.pos++;
        break;

      case "b": case "B":
        operandType = RCOperandType.RC_OPERAND_BCD;
        cursor.pos++;
        break;

      case "~":
        operandType = RCOperandType.RC_OPERAND_INVERTED;
        cursor.pos++;
        break;

      case "0":
        if (cursor.pos + 1 < str.length && (str[cursor.pos + 1] === "x" || str[cursor.pos + 1] === "X")) {
          operandType = RCOperandType.RC_OPERAND_ADDRESS;
        } else {
          const rest = str.substring(cursor.pos);
          const match = rest.match(/^[0-9]+/);
          if (match) {
            const val = parseInt(match[0], 10);
            cursor.pos += match[0].length;
            return {
              type: RCOperandType.RC_OPERAND_CONST,
              size: RCMemSize.RC_MEMSIZE_32_BITS,
              value: { num: isNaN(val) ? 0 : val },
            };
          }
        }
        break;

      case "1": case "2": case "3": case "4": case "5":
      case "6": case "7": case "8": case "9": {
        const rest = str.substring(cursor.pos);
        const match = rest.match(/^[0-9]+/);
        if (match) {
          const val = parseInt(match[0], 10);
          cursor.pos += match[0].length;
          return {
            type: RCOperandType.RC_OPERAND_CONST,
            size: RCMemSize.RC_MEMSIZE_32_BITS,
            value: { num: isNaN(val) ? 0 : val },
          };
        }
        break;
      }

      case "@": {
        cursor.pos++;
        while (cursor.pos < str.length && /[a-zA-Z0-9_]/.test(str[cursor.pos])) {
          cursor.pos++;
        }
        return {
          type: RCOperandType.RC_OPERAND_FUNC,
          size: RCMemSize.RC_MEMSIZE_32_BITS,
          value: { num: 0 },
        };
      }

      default:
        operandType = RCOperandType.RC_OPERAND_ADDRESS;
        break;
    }

    const startPos = cursor.pos;
    const mem = this.parseMemRef(cursor, memrefs);
    if (mem) {
      return {
        type: operandType,
        size: mem.size,
        value: {
          memref: mem.memref,
          num: mem.address,
        },
      };
    }

    cursor.pos = startPos;
    const rest = str.substring(cursor.pos);
    const constMatch = rest.match(/^[0-9]+/);
    if (constMatch) {
      const val = parseInt(constMatch[0], 10);
      cursor.pos += constMatch[0].length;
      return {
        type: RCOperandType.RC_OPERAND_CONST,
        size: RCMemSize.RC_MEMSIZE_32_BITS,
        value: { num: isNaN(val) ? 0 : val },
      };
    }

    return {
      type: RCOperandType.RC_OPERAND_CONST,
      size: RCMemSize.RC_MEMSIZE_32_BITS,
      value: { num: 0 },
    };
  }

  public static evaluateOperand(operand: RCOperand): number {
    if (operand.type === RCOperandType.RC_OPERAND_CONST) {
      return operand.value.num;
    }
    if (operand.type === RCOperandType.RC_OPERAND_FP) {
      return operand.value.dbl ?? operand.value.num;
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
        val = val & 0x0f;
        break;
      case RCMemSize.RC_MEMSIZE_HIGH:
        val = (val >> 4) & 0x0f;
        break;
      case RCMemSize.RC_MEMSIZE_BIT_0:
      case RCMemSize.RC_MEMSIZE_BIT_1:
      case RCMemSize.RC_MEMSIZE_BIT_2:
      case RCMemSize.RC_MEMSIZE_BIT_3:
      case RCMemSize.RC_MEMSIZE_BIT_4:
      case RCMemSize.RC_MEMSIZE_BIT_5:
      case RCMemSize.RC_MEMSIZE_BIT_6:
      case RCMemSize.RC_MEMSIZE_BIT_7: {
        const bit = operand.size - RCMemSize.RC_MEMSIZE_BIT_0;
        val = (val >> bit) & 1;
        break;
      }
      case RCMemSize.RC_MEMSIZE_BITCOUNT: {
        const b = val & 0xff;
        let cnt = 0;
        for (let i = 0; i < 8; i++) {
          if ((b >> i) & 1) cnt++;
        }
        val = cnt;
        break;
      }
      case RCMemSize.RC_MEMSIZE_8_BITS:
        val = val & 0xff;
        break;
      case RCMemSize.RC_MEMSIZE_16_BITS:
        val = val & 0xffff;
        break;
      case RCMemSize.RC_MEMSIZE_16_BITS_BE:
        val = ((val & 0xff00) >> 8) | ((val & 0x00ff) << 8);
        break;
      case RCMemSize.RC_MEMSIZE_24_BITS:
        val = val & 0xffffff;
        break;
      case RCMemSize.RC_MEMSIZE_24_BITS_BE:
        val = ((val & 0xff0000) >> 16) | (val & 0x00ff00) | ((val & 0x0000ff) << 16);
        break;
      case RCMemSize.RC_MEMSIZE_32_BITS:
        val = val >>> 0;
        break;
      case RCMemSize.RC_MEMSIZE_32_BITS_BE:
        val =
          ((val & 0xff000000) >>> 24) |
          ((val & 0x00ff0000) >>> 8) |
          ((val & 0x0000ff00) << 8) |
          ((val & 0x000000ff) << 24);
        break;
      default:
        break;
    }

    if (operand.type === RCOperandType.RC_OPERAND_BCD) {
      val = ((val >> 4) & 0x0f) * 10 + (val & 0x0f);
    } else if (operand.type === RCOperandType.RC_OPERAND_INVERTED) {
      val = val ^ 0xffffffff;
    }

    return val;
  }

  public static parseOperator(cursor: ParseCursor): RCOperator {
    const { str } = cursor;
    if (cursor.pos >= str.length) return RCOperator.RC_OPERATOR_NONE;

    const opChar = str[cursor.pos];

    switch (opChar) {
      case "=":
        cursor.pos++;
        if (cursor.pos < str.length && str[cursor.pos] === "=") cursor.pos++;
        return RCOperator.RC_OPERATOR_EQ;

      case "!":
        if (cursor.pos + 1 < str.length && str[cursor.pos + 1] === "=") {
          cursor.pos += 2;
          return RCOperator.RC_OPERATOR_NE;
        }
        return RCOperator.RC_OPERATOR_NONE;

      case "<":
        if (cursor.pos + 1 < str.length && str[cursor.pos + 1] === "=") {
          cursor.pos += 2;
          return RCOperator.RC_OPERATOR_LE;
        }
        cursor.pos++;
        return RCOperator.RC_OPERATOR_LT;

      case ">":
        if (cursor.pos + 1 < str.length && str[cursor.pos + 1] === "=") {
          cursor.pos += 2;
          return RCOperator.RC_OPERATOR_GE;
        }
        cursor.pos++;
        return RCOperator.RC_OPERATOR_GT;

      case "*": cursor.pos++; return RCOperator.RC_OPERATOR_MULT;
      case "/": cursor.pos++; return RCOperator.RC_OPERATOR_DIV;
      case "&": cursor.pos++; return RCOperator.RC_OPERATOR_AND;
      case "^": cursor.pos++; return RCOperator.RC_OPERATOR_XOR;
      case "%": cursor.pos++; return RCOperator.RC_OPERATOR_MOD;
      case "+": cursor.pos++; return RCOperator.RC_OPERATOR_ADD;
      case "-": cursor.pos++; return RCOperator.RC_OPERATOR_SUB;

      case "\0": case "_": case "S": case ")": case "$":
        return RCOperator.RC_OPERATOR_NONE;

      default:
        return RCOperator.RC_OPERATOR_NONE;
    }
  }

  public static parseCondition(
    cursor: ParseCursor,
    memrefs: Map<number, RCMemRef>
  ): RCCondition | null {
    const { str } = cursor;
    if (cursor.pos >= str.length) return null;

    let type: RCConditionType = RCConditionType.RC_CONDITION_STANDARD;

    if (cursor.pos + 1 < str.length && str[cursor.pos + 1] === ":") {
      const prefix = str[cursor.pos].toUpperCase();
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
        default:
          console.warn(`[rcheevos] Unknown condition prefix: "${prefix}" at pos ${cursor.pos} in "${str}"`);
          break;
      }
      cursor.pos += 2;
    }

    const operand1 = this.parseOperand(cursor, memrefs);
    const operator = this.parseOperator(cursor);

    let operand2: RCOperand = {
      type: RCOperandType.RC_OPERAND_CONST,
      size: RCMemSize.RC_MEMSIZE_32_BITS,
      value: { num: 1 },
    };

    if (operator !== RCOperator.RC_OPERATOR_NONE) {
      operand2 = this.parseOperand(cursor, memrefs);
    }

    let requiredHits = 0;
    if (cursor.pos < str.length) {
      if (str[cursor.pos] === "(") {
        cursor.pos++;
        const rest = str.substring(cursor.pos);
        const match = rest.match(/^([0-9]+)\)/);
        if (match) {
          requiredHits = parseInt(match[1], 10) || 0;
          cursor.pos += match[0].length;
        }
      } else if (str[cursor.pos] === ".") {
        cursor.pos++;
        const rest = str.substring(cursor.pos);
        const match = rest.match(/^([0-9]+)\./);
        if (match) {
          requiredHits = parseInt(match[1], 10) || 0;
          cursor.pos += match[0].length;
        }
      }
    }

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
    cursor: ParseCursor,
    memrefs: Map<number, RCMemRef>
  ): RCCondSet {
    const conditions: RCCondition[] = [];
    let numPauseConditions = 0;
    let numResetConditions = 0;
    let numHittargetConditions = 0;
    let numMeasuredConditions = 0;
    let numOtherConditions = 0;
    let numIndirectConditions = 0;

    while (cursor.pos < cursor.str.length && cursor.str[cursor.pos] !== "S") {
      if (cursor.str[cursor.pos] === "_") {
        cursor.pos++;
        continue;
      }

      const cond = this.parseCondition(cursor, memrefs);
      if (!cond) break;
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
    console.group("%c[RA rcheevos Parse Trigger]", "color: #3b82f6; font-weight: bold; font-size: 13px;");
    console.log("%cRaw Trigger String:", "font-weight: bold; color: #a855f7;", triggerStr);

    const memrefs = new Map<number, RCMemRef>();
    const cursor: ParseCursor = { str: triggerStr.trim(), pos: 0 };

    const requirement = this.parseCondSet(cursor, memrefs);
    const alternative: RCCondSet[] = [];

    while (cursor.pos < cursor.str.length && cursor.str[cursor.pos] === "S") {
      cursor.pos++; // Skip 'S'
      const altSet = this.parseCondSet(cursor, memrefs);
      if (altSet.conditions.length > 0) {
        alternative.push(altSet);
      }
    }

    console.log("%cParsing Result:", "font-weight: bold; color: #22c55e;", {
      requirementConditions: requirement.conditions.length,
      altGroupCount: alternative.length,
      totalMemRefs: memrefs.size,
      parsedLength: cursor.pos,
      totalLength: cursor.str.length,
    });

    const memSummary: string[] = [];
    for (const [addr, memref] of memrefs.entries()) {
      memSummary.push(`0x${addr.toString(16).toUpperCase()} (${RCMemSize[memref.value.size]})`);
    }
    console.log("%cMemrefs Registered:", "font-weight: bold;", memSummary);
    console.groupEnd();

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
