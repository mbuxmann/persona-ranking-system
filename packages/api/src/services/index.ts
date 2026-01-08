import { csvService } from "./csv.service";
import { evaluationService } from "./evaluation.service";
import { importService } from "./import.service";
import { leadsService } from "./leads.service";
import { openaiService } from "./openai.service";
import { promptOptimizationService } from "./prompt-optimization.service";
import { qualificationService } from "./qualification.service";
import { rankingService } from "./ranking.service";

export const services = {
  csv: csvService,
  evaluation: evaluationService,
  import: importService,
  leads: leadsService,
  openai: openaiService,
  promptOptimization: promptOptimizationService,
  qualification: qualificationService,
  ranking: rankingService,
};
