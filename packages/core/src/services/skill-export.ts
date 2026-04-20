import type { FactorMetaPublic } from "../types/factor-registry.js";
import { getFactorLeaderboard } from "./registry.js";

// ── Types ──────────────────────────────────────────────────

export interface SkillDefinition {
  readonly name: string;
  readonly description: string;
  readonly factorId: string;
  readonly category: string;
  readonly rankIcOosMean: number;
  readonly rankIcOosIcir: number;
  readonly quantileSpreadQ5Q1: number;
  readonly turnoverTwoWay: number;
  readonly assets: readonly string[];
  readonly timeframe: string;
  readonly usage: string;
}

// ── Public API ─────────────────────────────────────────────

function factorToSkill(factor: FactorMetaPublic): SkillDefinition {
  return {
    name: factor.name,
    description: factor.description,
    factorId: factor.id,
    category: factor.category,
    rankIcOosMean: factor.metrics.factorQuality.rankIcOosMean,
    rankIcOosIcir: factor.metrics.factorQuality.rankIcOosIcir,
    quantileSpreadQ5Q1: factor.metrics.factorQuality.quantileSpreadQ5Q1,
    turnoverTwoWay: factor.metrics.implementationProfile.turnoverTwoWay,
    assets: factor.definition.universe.assets,
    timeframe: factor.definition.timeframe,
    usage: `tonquant factor pull ${factor.id} --output-dir ./artifacts --json`,
  };
}

/**
 * Export top-ranked factors as agent-consumable skill definitions.
 */
export function exportTopFactorsAsSkills(limit = 10): SkillDefinition[] {
  const top = getFactorLeaderboard({ limit });
  return top.map(factorToSkill);
}

/**
 * Format skill definitions as Markdown for SKILL.md or stdout.
 */
export function formatSkillMarkdown(skills: ReadonlyArray<SkillDefinition>): string {
  const lines: string[] = [
    "# TonQuant Factor Skills",
    "",
    `> Auto-generated from top ${skills.length} factors by factor-native ranking.`,
    "> Use these skills to give any compatible agent access to quantitative factors.",
    "",
  ];

  for (const skill of skills) {
    lines.push(
      `## ${skill.name}`,
      "",
      `- **Factor ID:** \`${skill.factorId}\``,
      `- **Category:** ${skill.category}`,
      `- **Rank IC (OOS):** ${skill.rankIcOosMean.toFixed(4)}`,
      `- **ICIR (OOS):** ${skill.rankIcOosIcir.toFixed(4)}`,
      `- **Q5-Q1 Spread:** ${skill.quantileSpreadQ5Q1.toFixed(4)}`,
      `- **Two-Way Turnover:** ${skill.turnoverTwoWay.toFixed(4)}`,
      `- **Assets:** ${skill.assets.join(", ")}`,
      `- **Timeframe:** ${skill.timeframe}`,
      "",
      skill.description,
      "",
      "```bash",
      `# Subscribe to local registry updates for this factor`,
      `tonquant factor subscribe ${skill.factorId} --json`,
      "",
      `# Buy and pull the paid artifact bundle`,
      skill.usage,
      "",
      `# Set a quality alert`,
      `tonquant factor alert-set ${skill.factorId} --metric rankIcOosIcir --condition above --threshold ${skill.rankIcOosIcir.toFixed(2)} --json`,
      "```",
      "",
      "---",
      "",
    );
  }

  lines.push(
    "## Recommended Companion Skills",
    "",
    "- **opennews**: Use `search_news_by_coin` to contextualize strategy performance.",
    "  Before promoting autoresearch candidates, check recent news for the traded token.",
    "  Before executing swaps, verify no high-impact negative news (aiRating > 80, signal = bearish).",
    "",
    "```bash",
    "npx skills add https://github.com/6551Team/opennews-mcp --skill opennews",
    "```",
    "",
  );

  return lines.join("\n");
}
