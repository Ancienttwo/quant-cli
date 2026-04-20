import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { publishFactor } from "../../src/services/registry.js";
import { exportTopFactorsAsSkills, formatSkillMarkdown } from "../../src/services/skill-export.js";
import { makeFactor } from "../helpers/factor-fixtures.js";

const INDEX_PATH = join(process.env.HOME ?? "/tmp", ".tonquant", "registry", "factors.json");
const EVENT_LOG_PATH = join(
  process.env.HOME ?? "/tmp",
  ".tonquant",
  "test-skill-export-events.jsonl",
);
const EVENT_LOG_LOCK_PATH = `${EVENT_LOG_PATH}.lock`;

describe("skill export service", () => {
  beforeEach(() => {
    if (existsSync(INDEX_PATH)) rmSync(INDEX_PATH);
    if (existsSync(EVENT_LOG_PATH)) rmSync(EVENT_LOG_PATH);
    if (existsSync(EVENT_LOG_LOCK_PATH)) rmSync(EVENT_LOG_LOCK_PATH);
    process.env.TONQUANT_EVENT_LOG_PATH = EVENT_LOG_PATH;
    for (let index = 0; index < 6; index += 1) {
      publishFactor(
        makeFactor(`skill_factor_${index}`, {
          metrics: {
            ...makeFactor(`skill_factor_${index}`).metrics,
            factorQuality: {
              ...makeFactor(`skill_factor_${index}`).metrics.factorQuality,
              rankIcOosIcir: 2 - index * 0.2,
              rankIcOosMean: 0.05 - index * 0.005,
            },
          },
        }),
      );
    }
  });

  afterEach(() => {
    if (existsSync(EVENT_LOG_PATH)) rmSync(EVENT_LOG_PATH);
    if (existsSync(EVENT_LOG_LOCK_PATH)) rmSync(EVENT_LOG_LOCK_PATH);
    delete process.env.TONQUANT_EVENT_LOG_PATH;
  });

  it("exports top factors as skill definitions", () => {
    const skills = exportTopFactorsAsSkills(5);
    expect(skills.length).toBe(5);
    // Should be sorted by ICIR (descending)
    for (let i = 1; i < skills.length; i++) {
      const previousSkill = skills[i - 1];
      const currentSkill = skills[i];
      if (!previousSkill || !currentSkill) {
        throw new Error("expected sorted factor skills to contain adjacent entries");
      }
      expect(previousSkill.rankIcOosIcir).toBeGreaterThanOrEqual(currentSkill.rankIcOosIcir);
    }
  });

  it("skill has all required fields", () => {
    const skills = exportTopFactorsAsSkills(1);
    const skill = skills[0];
    if (!skill) {
      throw new Error("expected one exported skill");
    }
    expect(skill.name).toBeTruthy();
    expect(skill.factorId).toBeTruthy();
    expect(skill.category).toBeTruthy();
    expect(skill.usage).toContain("tonquant factor pull");
    expect(skill.assets.length).toBeGreaterThan(0);
  });

  it("defaults to 10 skills", () => {
    const skills = exportTopFactorsAsSkills();
    expect(skills.length).toBe(6);
  });

  it("formats skills as markdown", () => {
    const skills = exportTopFactorsAsSkills(3);
    const md = formatSkillMarkdown(skills);
    expect(md).toContain("# TonQuant Factor Skills");
    expect(md).toContain("**Factor ID:**");
    expect(md).toContain("tonquant factor subscribe");
    expect(md).toContain("tonquant factor pull");
    expect(md).toContain("Recommended Companion Skills");
    expect(md).toContain("opennews");
    // Each skill should appear
    for (const skill of skills) {
      expect(md).toContain(skill.factorId);
    }
  });

  it("returns empty array when no factors", () => {
    if (existsSync(INDEX_PATH)) rmSync(INDEX_PATH);
    const skills = exportTopFactorsAsSkills();
    expect(skills.length).toBe(0);
  });
});
