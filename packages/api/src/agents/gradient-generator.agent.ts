import Handlebars from "handlebars";
import type { EvaluationMetrics, SampleError } from "../types/evaluation";
import { AI_CONFIG } from "../config/constants";
import { services } from "../services";
import { logger } from "../utils/logger";

const GRADIENT_PROMPT_TEMPLATE = `
You are an expert at analyzing AI prompt performance and identifying
instruction-level weaknesses that affect output quality and consistency.

The system uses a persona-driven ranking prompt.
All business logic must live in the persona specification — not in the prompt.

Your job is to critique the PROMPT, not the persona.


## Current Prompt Performance

{{metricsSection}}

**Ranking System Context**
- Tier-based ranking (ties allowed)
- Lower rank = higher priority
- Importance tiers must be derived from the persona


## Sample Errors

{{errorsSection}}


## Current Prompt

{{currentPrompt}}


## Task

Analyze the prompt’s weaknesses based on the metrics and error examples.

Provide a concise critique (3–5 sentences) that:

1. Identifies observable failure patterns in the errors.
2. Explains why these failures occur at the instruction level
   (e.g. ambiguity, missing steps, weak constraints).
3. Suggests the direction of improvement by clarifying, strengthening,
   or removing instructions.


## Constraints

- Do NOT suggest adding heuristics or business logic.
- Do NOT compensate for persona ambiguity.
- Avoid overfitting to evaluation examples.
- Focus on instruction clarity, structure, and constraint strength.

Output only the critique.
`;

interface TemplateVariables {
  metricsSection: string;
  errorsSection: string;
  currentPrompt: string;
}

interface GenerateGradientParams {
  currentPrompt: string;
  metrics: EvaluationMetrics;
  sampleErrors: SampleError[];
}

interface CallGradientAIParams {
  prompt: string;
}

export class GradientGenerator {
  private static instance: GradientGenerator;

  private constructor() { }

  static getInstance(): GradientGenerator {
    if (!GradientGenerator.instance) {
      GradientGenerator.instance = new GradientGenerator();
    }
    return GradientGenerator.instance;
  }

  /** Generates natural language critique of prompt performance from metrics and errors */
  async generateGradient(params: GenerateGradientParams): Promise<string> {
    const { currentPrompt, metrics, sampleErrors } = params;

    logger.info("Gradient Generator", "Generating natural language gradient", {
      mae: metrics.mae.toFixed(2),
      kendallTau: metrics.kendallTau.toFixed(3),
      errorCount: sampleErrors.length,
    });

    const prompt = this.buildPrompt({ currentPrompt, metrics, sampleErrors });
    const result = await this.callGradientAI({ prompt });

    logger.info("Gradient Generator", "Generated gradient", {
      gradientLength: result.length,
    });

    return result;
  }

  /** Calls OpenAI to generate the gradient critique */
  private async callGradientAI({ prompt }: CallGradientAIParams): Promise<string> {
    return services.openai.generateText({
      model: AI_CONFIG.GRADIENT_MODEL,
      prompt,
      context: "Gradient Generator",
    });
  }

  /** Builds the gradient generation prompt with metrics and error examples */
  private buildPrompt(params: GenerateGradientParams): string {
    const { currentPrompt, metrics, sampleErrors } = params;

    const variables: TemplateVariables = {
      metricsSection: this.formatMetricsSection(metrics),
      errorsSection: this.formatSampleErrorsSection(sampleErrors),
      currentPrompt,
    };

    const template = Handlebars.compile(GRADIENT_PROMPT_TEMPLATE);
    return template(variables);
  }

  /** Formats evaluation metrics as readable bullet points */
  private formatMetricsSection(metrics: EvaluationMetrics): string {
    return `**Metrics:**
- Mean Absolute Error (MAE): ${metrics.mae.toFixed(2)} (lower is better, range 0-9 for 1-10 ranking scale)
- Root Mean Square Error (RMSE): ${metrics.rmse.toFixed(2)} (lower is better)
- Spearman Correlation: ${metrics.spearmanCorrelation.toFixed(3)} (higher is better, range -1 to 1)
- Kendall's Tau: ${metrics.kendallTau.toFixed(3)} (higher is better, handles ties better than Spearman)`;
  }

  /** Formats all sample errors as numbered list */
  private formatSampleErrorsSection(sampleErrors: SampleError[]): string {
    return sampleErrors.map((err, i) => this.formatErrorItem(err, i + 1)).join("\n");
  }

  /** Formats a single error with lead info, predictions, and AI reasoning */
  private formatErrorItem(error: SampleError, index: number): string {
    const rankError = Math.abs(error.predicted - error.groundTruth);
    return `
${index}. Lead: ${error.leadInfo}
   Predicted Rank: ${error.predicted} | Ground Truth Rank: ${error.groundTruth} | Error: ${rankError} ranks off
   AI Reasoning: ${error.reasoning}`;
  }
}

export const gradientGenerator = GradientGenerator.getInstance();
