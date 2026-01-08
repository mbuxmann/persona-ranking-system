import { z } from "zod";
import Handlebars from "handlebars";
import { AI_CONFIG } from "../config/constants";
import { services } from "../services";
import type { PromptCandidate } from "../types/optimization";
import { logger } from "../utils/logger";

export type { PromptCandidate };

const VARIANT_PROMPT_TEMPLATE = `
You are an expert prompt engineer optimizing a persona-driven,
tier-based ranking prompt.

All business logic must be derived from the persona specification.
The prompt may only define how persona rules are applied, not what the rules are.


## Optimization Goal

Improve the ranking prompt to:
- Minimize MAE (Mean Absolute Error)
- Maximize Kendall’s Tau

Against expert-ranked ground truth (1–10 scale for evaluation,
ties allowed in production).


## Performance Critique (Natural Language Gradient)

{{gradient}}


## Optimization Trajectory (Recent Attempts)

{{trajectorySection}}


## Current Best Prompt

{{currentBestSection}}

{{currentPrompt}}


## Task

Generate {{numVariants}} improved prompt variants that address the critique.

Each variant MUST:

1. Address weaknesses identified in the gradient by improving
   instruction clarity, ordering, or constraints.
2. Preserve effective elements from high-performing prior attempts.
3. Be meaningfully distinct from previous variants
   (structure, phrasing, emphasis — not logic).
4. Remain concise and similar in length to the current prompt.
5. Preserve the overall structure
   (instructions, persona spec, requirements, I/O sections).
6. STRICTLY preserve all template variables exactly as written:

{{templateVarsDoc}}


## Constraints

- Do NOT introduce new heuristics or role assumptions.
- Do NOT encode persona-specific logic into the prompt.
- Do NOT optimize by overfitting to evaluation examples.
- Focus only on how persona rules are applied.


## Output Format

Return exactly {{numVariants}} prompt variants as JSON:

{
  "variants": [
    "<prompt_variant_1>",
    "<prompt_variant_2>"
  ]
}

Return ONLY the JSON object.
`;

interface MetaPromptVariables {
  gradient: string;
  trajectorySection: string;
  currentBestSection: string;
  currentPrompt: string;
  numVariants: number;
  templateVarsDoc: string;
}

const REQUIRED_PROMPT_PLACEHOLDERS = [
  "{{PERSONA_SPEC}}",
  "{{QUALIFIED_LEADS_LIST}}",
  "{{QUALIFIED_LEADS_COUNT}}",
  "{{COMPANY_NAME}}",
  "{{COMPANY_DOMAIN}}",
  "{{EMPLOYEE_RANGE}}",
  "{{INDUSTRY}}",
] as const;

const PROMPT_PREVIEW_LENGTH = 300;
const TRAJECTORY_DISPLAY_LIMIT = 5;

const variantsResponseSchema = z.object({
  variants: z.array(z.string()),
});

interface GenerateVariantsParams {
  currentPrompt: string;
  gradient: string;
  trajectory: PromptCandidate[];
  numVariants?: number;
}

interface BuildMetaPromptParams {
  currentPrompt: string;
  gradient: string;
  sortedTrajectory: PromptCandidate[];
  numVariants: number;
}

interface CallVariantAIParams {
  prompt: string;
}

interface PlaceholderValidation {
  isValid: boolean;
  missingPlaceholders: string[];
}

export class VariantGenerator {
  private static instance: VariantGenerator;

  private constructor() { }

  static getInstance(): VariantGenerator {
    if (!VariantGenerator.instance) {
      VariantGenerator.instance = new VariantGenerator();
    }
    return VariantGenerator.instance;
  }

  /** Generates improved prompt variants using gradient feedback and optimization trajectory */
  async generateVariants({
    currentPrompt,
    gradient,
    trajectory,
    numVariants = 8,
  }: GenerateVariantsParams): Promise<string[]> {
    logger.info("Variant Generator", "Generating prompt variants", {
      numVariants,
      trajectorySize: trajectory.length,
      gradientLength: gradient.length,
    });

    const sortedTrajectory = this.sortCandidatesByPerformance(trajectory);
    const prompt = this.buildMetaPrompt({ currentPrompt, gradient, sortedTrajectory, numVariants });

    const rawVariants = await this.callVariantGenerationAI({ prompt });
    const validVariants = this.filterValidVariants(rawVariants);

    this.logGenerationResults({ numVariants, rawVariants, validVariants });

    return validVariants.slice(0, numVariants);
  }

  /** Calls OpenAI to generate variant prompts using structured output */
  private async callVariantGenerationAI({ prompt }: CallVariantAIParams): Promise<string[]> {
    const result = await services.openai.generateObject({
      model: AI_CONFIG.VARIANT_MODEL,
      schema: variantsResponseSchema,
      prompt,
      context: "Variant Generator",
    });

    return result.variants;
  }

  /** Sorts candidates by Kendall > Spearman > MAE for trajectory display */
  private sortCandidatesByPerformance(trajectory: PromptCandidate[]): PromptCandidate[] {
    return [...trajectory].sort(
      (a, b) =>
        b.kendallTau - a.kendallTau ||
        b.spearmanCorrelation - a.spearmanCorrelation ||
        a.mae - b.mae
    );
  }

  /** Builds the meta-prompt for variant generation with gradient and trajectory */
  private buildMetaPrompt({
    currentPrompt,
    gradient,
    sortedTrajectory,
    numVariants,
  }: BuildMetaPromptParams): string {
    const variables: MetaPromptVariables = {
      gradient,
      trajectorySection: this.formatTrajectorySection(sortedTrajectory),
      currentBestSection: this.formatCurrentBestSection(sortedTrajectory),
      currentPrompt,
      numVariants,
      templateVarsDoc: this.buildTemplateVariablesDocumentation(),
    };

    const template = Handlebars.compile(VARIANT_PROMPT_TEMPLATE);
    return template(variables);
  }

  /** Formats recent trajectory attempts with metrics for the meta-prompt */
  private formatTrajectorySection(sortedTrajectory: PromptCandidate[]): string {
    return sortedTrajectory
      .slice(-TRAJECTORY_DISPLAY_LIMIT)
      .map((candidate, i) => this.formatCandidateForTrajectory(candidate, i + 1))
      .join("\n");
  }

  /** Formats a single candidate with metrics and truncated prompt preview */
  private formatCandidateForTrajectory(candidate: PromptCandidate, attemptNumber: number): string {
    const metrics = this.formatCandidateMetrics(candidate);
    const promptPreview = this.truncatePromptForDisplay(candidate.promptText);

    return `
**Attempt ${attemptNumber}** (${metrics}):
\`\`\`
${promptPreview}...
\`\`\`
`;
  }

  /** Formats candidate metrics as readable string */
  private formatCandidateMetrics(candidate: PromptCandidate): string {
    return `MAE: ${candidate.mae.toFixed(2)}, Kendall: ${candidate.kendallTau.toFixed(3)}, Spearman: ${candidate.spearmanCorrelation.toFixed(3)}`;
  }

  /** Formats the current best prompt's performance metrics */
  private formatCurrentBestSection(sortedTrajectory: PromptCandidate[]): string {
    const currentBest = sortedTrajectory.at(-1);
    if (!currentBest) {
      return "**Performance**: N/A";
    }
    return `**Performance**: MAE ${currentBest.mae.toFixed(2)}, Kendall ${currentBest.kendallTau.toFixed(3)}, Spearman ${currentBest.spearmanCorrelation.toFixed(3)}`;
  }

  /** Truncates prompt text for display in trajectory section */
  private truncatePromptForDisplay(prompt: string): string {
    return prompt.slice(0, PROMPT_PREVIEW_LENGTH);
  }

  /** Builds documentation list of template placeholders that must be preserved */
  private buildTemplateVariablesDocumentation(): string {
    const allPlaceholders = [
      "{{PERSONA_SPEC}}",
      "{{QUALIFIED_LEADS_COUNT}}",
      "{{COMPANY_NAME}}",
      "{{COMPANY_DOMAIN}}",
      "{{EMPLOYEE_RANGE}}",
      "{{INDUSTRY}}",
      "{{QUALIFIED_LEADS_LIST}}",
    ];
    return allPlaceholders.map((p) => `   - ${p}`).join("\n");
  }

  /** Filters out variants missing required template placeholders */
  private filterValidVariants(variants: string[]): string[] {
    return variants.filter((variant) => {
      const validation = this.validateVariantPlaceholders(variant);
      if (!validation.isValid) {
        this.logInvalidVariant(variant, validation.missingPlaceholders);
      }
      return validation.isValid;
    });
  }

  /** Checks if variant contains all required placeholders */
  private validateVariantPlaceholders(variant: string): PlaceholderValidation {
    const missingPlaceholders = this.findMissingPlaceholders(variant);
    return {
      isValid: missingPlaceholders.length === 0,
      missingPlaceholders,
    };
  }

  /** Returns list of required placeholders not found in variant */
  private findMissingPlaceholders(variant: string): string[] {
    return REQUIRED_PROMPT_PLACEHOLDERS.filter((placeholder) => !variant.includes(placeholder));
  }

  /** Logs warning for invalid variant with missing placeholders */
  private logInvalidVariant(variant: string, missingPlaceholders: string[]): void {
    logger.warn("Variant Generator", "Variant missing required placeholders, skipping", {
      missingPlaceholders,
      variantPreview: variant.slice(0, 100),
    });
  }

  /** Logs summary of variant generation results */
  private logGenerationResults({
    numVariants,
    rawVariants,
    validVariants,
  }: {
    numVariants: number;
    rawVariants: string[];
    validVariants: string[];
  }): void {
    logger.info("Variant Generator", "Generated variants", {
      requestedVariants: numVariants,
      rawVariants: rawVariants.length,
      validVariants: validVariants.length,
      skippedDueToMissingPlaceholders: rawVariants.length - validVariants.length,
    });
  }
}

export const variantGenerator = VariantGenerator.getInstance();
