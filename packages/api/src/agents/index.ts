import { gradientGenerator } from "./gradient-generator.agent";
import { qualificationAgent } from "./qualification.agent";
import { rankingAgent } from "./ranking.agent";
import { variantGenerator } from "./variant-generator.agent";

export const agents = {
  gradient: gradientGenerator,
  qualification: qualificationAgent,
  ranking: rankingAgent,
  variant: variantGenerator,
};

export {
  gradientGenerator,
  qualificationAgent,
  rankingAgent,
  variantGenerator,
};
