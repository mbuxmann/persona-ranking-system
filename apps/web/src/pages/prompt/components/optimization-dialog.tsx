import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, TrendingUp } from "lucide-react";

interface OptimizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (params: {
    maxIterations: number;
    variantsPerIteration: number;
    beamWidth: number;
  }) => void;
  isOptimizing: boolean;
  isStarting: boolean;
  disabled: boolean;
}

export function OptimizationDialog({
  open,
  onOpenChange,
  onStart,
  isOptimizing,
  isStarting,
  disabled,
}: OptimizationDialogProps) {
  const [maxIterations, setMaxIterations] = useState(5);
  const [variantsPerIteration, setVariantsPerIteration] = useState(8);
  const [beamWidth, setBeamWidth] = useState(3);

  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const isInRange = (value: number, min: number, max: number) =>
    value >= min && value <= max;

  const isValid =
    isInRange(maxIterations, 1, 10) &&
    isInRange(variantsPerIteration, 4, 16) &&
    isInRange(beamWidth, 2, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={isOptimizing}>
          {isOptimizing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Optimizing...
            </>
          ) : (
            <>
              <TrendingUp className="mr-2 h-4 w-4" />
              Start Optimization
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Prompt Optimization</DialogTitle>
          <DialogDescription>
            Configure the optimization parameters. This will generate and
            evaluate multiple prompt variants using beam search.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="maxIterations">Max Iterations</Label>
            <Input
              id="maxIterations"
              type="number"
              min={1}
              max={10}
              value={maxIterations}
              onChange={(e) => setMaxIterations(Number(e.target.value))}
              onBlur={() => setMaxIterations(clamp(maxIterations, 1, 10))}
            />
            <p className="text-xs text-muted-foreground">
              Number of optimization rounds (1-10)
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="variantsPerIteration">Variants per Iteration</Label>
            <Input
              id="variantsPerIteration"
              type="number"
              min={4}
              max={16}
              value={variantsPerIteration}
              onChange={(e) => setVariantsPerIteration(Number(e.target.value))}
              onBlur={() => setVariantsPerIteration(clamp(variantsPerIteration, 4, 16))}
            />
            <p className="text-xs text-muted-foreground">
              Number of prompt variants to generate each round (4-16)
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="beamWidth">Beam Width</Label>
            <Input
              id="beamWidth"
              type="number"
              min={2}
              max={5}
              value={beamWidth}
              onChange={(e) => setBeamWidth(Number(e.target.value))}
              onBlur={() => setBeamWidth(clamp(beamWidth, 2, 5))}
            />
            <p className="text-xs text-muted-foreground">
              Number of top candidates to keep (2-5)
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() =>
              onStart({ maxIterations, variantsPerIteration, beamWidth })
            }
            disabled={disabled || isStarting || !isValid}
          >
            {isStarting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              "Start Optimization"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
