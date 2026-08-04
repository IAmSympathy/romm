import { describe, it, expect } from "vitest";
import { RCheevosEngine } from "./RCheevosEngine";
import { RCMemSize, RCOperandType, RCOperator, RCConditionType } from "./RCheevosTypes";

describe("RCheevosEngine Faithful rcheevos Parser", () => {
  it("parses simple NES triggers correctly", () => {
    const triggerStr = "0xH0012=1_0x0014=5";
    const trigger = RCheevosEngine.parseTrigger(triggerStr);

    expect(trigger.requirement).not.toBeNull();
    expect(trigger.requirement?.conditions).toHaveLength(2);

    const cond1 = trigger.requirement!.conditions[0];
    expect(cond1.operand1.size).toBe(RCMemSize.RC_MEMSIZE_8_BITS);
    expect(cond1.operand1.value.num).toBe(0x0012);
    expect(cond1.operator).toBe(RCOperator.RC_OPERATOR_EQ);
    expect(cond1.operand2.value.num).toBe(1);

    const cond2 = trigger.requirement!.conditions[1];
    expect(cond2.operand1.size).toBe(RCMemSize.RC_MEMSIZE_16_BITS);
    expect(cond2.operand1.value.num).toBe(0x0014);
    expect(cond2.operator).toBe(RCOperator.RC_OPERATOR_EQ);
    expect(cond2.operand2.value.num).toBe(5);
  });

  it("parses multi-platform memory size prefixes (0xW 24-bit, 0xI 16-bit BE, 0xG 32-bit BE)", () => {
    const triggerStr = "0xW001200=10000_0xI001202=500_0xG001204=1000000";
    const trigger = RCheevosEngine.parseTrigger(triggerStr);

    expect(trigger.requirement?.conditions).toHaveLength(3);

    const condW = trigger.requirement!.conditions[0];
    expect(condW.operand1.size).toBe(RCMemSize.RC_MEMSIZE_24_BITS);
    expect(condW.operand1.value.num).toBe(0x001200);

    const condI = trigger.requirement!.conditions[1];
    expect(condI.operand1.size).toBe(RCMemSize.RC_MEMSIZE_16_BITS_BE);
    expect(condI.operand1.value.num).toBe(0x001202);

    const condG = trigger.requirement!.conditions[2];
    expect(condG.operand1.size).toBe(RCMemSize.RC_MEMSIZE_32_BITS_BE);
    expect(condG.operand1.value.num).toBe(0x001204);
  });

  it("parses operand types (delta d0x, prior p0x, BCD b0x, inverted ~0x)", () => {
    const triggerStr = "d0xH0010=0_p0xH0010=1_b0xH0020=25_~0xH0030=255";
    const trigger = RCheevosEngine.parseTrigger(triggerStr);

    expect(trigger.requirement?.conditions).toHaveLength(4);

    expect(trigger.requirement!.conditions[0].operand1.type).toBe(RCOperandType.RC_OPERAND_DELTA);
    expect(trigger.requirement!.conditions[1].operand1.type).toBe(RCOperandType.RC_OPERAND_PRIOR);
    expect(trigger.requirement!.conditions[2].operand1.type).toBe(RCOperandType.RC_OPERAND_BCD);
    expect(trigger.requirement!.conditions[3].operand1.type).toBe(RCOperandType.RC_OPERAND_INVERTED);
  });

  it("parses condition prefix flags (P: PauseIf, R: ResetIf, A: AddSource, I: AddAddress)", () => {
    const triggerStr = "P:0xH0001=1_R:0xH0002=1_A:0xH0003=10_I:0xW001000";
    const trigger = RCheevosEngine.parseTrigger(triggerStr);

    expect(trigger.requirement?.conditions).toHaveLength(4);

    expect(trigger.requirement!.conditions[0].type).toBe(RCConditionType.RC_CONDITION_PAUSE_IF);
    expect(trigger.requirement!.conditions[1].type).toBe(RCConditionType.RC_CONDITION_RESET_IF);
    expect(trigger.requirement!.conditions[2].type).toBe(RCConditionType.RC_CONDITION_ADD_SOURCE);
    expect(trigger.requirement!.conditions[3].type).toBe(RCConditionType.RC_CONDITION_ADD_ADDRESS);
  });

  it("parses hit targets (n) and .n.", () => {
    const triggerStr = "0xH0010=1(5)_0xH0020=2.10.";
    const trigger = RCheevosEngine.parseTrigger(triggerStr);

    expect(trigger.requirement?.conditions).toHaveLength(2);
    expect(trigger.requirement!.conditions[0].requiredHits).toBe(5);
    expect(trigger.requirement!.conditions[1].requiredHits).toBe(10);
  });

  it("parses alternative condition groups separated by S", () => {
    const triggerStr = "0xH0010=1S0xH0020=2S0xH0030=3";
    const trigger = RCheevosEngine.parseTrigger(triggerStr);

    expect(trigger.requirement?.conditions).toHaveLength(1);
    expect(trigger.alternative).toHaveLength(2);
    expect(trigger.alternative![0].conditions[0].operand1.value.num).toBe(0x0020);
    expect(trigger.alternative![1].conditions[0].operand1.value.num).toBe(0x0030);
  });

  it("snes9x must not match nes core branch", () => {
    const snesCore = "snes9x";
    const isSnes = snesCore.includes("snes") || snesCore.includes("bsnes");
    const isNes = (snesCore.includes("nes") && !snesCore.includes("snes")) || snesCore.includes("fceumm") || snesCore.includes("nestopia") || snesCore.includes("mesen");

    expect(isSnes).toBe(true);
    expect(isNes).toBe(false);
  });
});
