import { createFileRoute } from "@tanstack/react-router";
import { PromptsPage } from "@/pages/prompt";

export const Route = createFileRoute("/prompts/")({
  component: PromptsPage,
});
