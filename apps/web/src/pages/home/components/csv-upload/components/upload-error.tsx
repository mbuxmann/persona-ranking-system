import { AlertCircle, XCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface UploadErrorProps {
  error: string;
  validationErrors?: Array<{
    rowNumber: number;
    field: string;
    message: string;
    value?: string;
  }>;
  type?: "validation" | "import" | "network" | "unknown";
  onRetry?: () => void;
  retryDisabled?: boolean;
}

const ERROR_SUGGESTIONS: Record<
  NonNullable<UploadErrorProps["type"]>,
  string
> = {
  validation:
    "Please fix the validation errors in your CSV file and try again.",
  import:
    "There was an issue importing your data. This might be due to duplicate entries or database constraints.",
  network:
    "Network connection failed. Please check your internet connection and try again.",
  unknown:
    "An unexpected error occurred. Please try again or contact support if the issue persists.",
};

export function UploadError({
  error,
  validationErrors,
  type = "unknown",
  onRetry,
  retryDisabled = false,
}: UploadErrorProps) {
  const groupedErrors = validationErrors?.reduce(
    (acc, err) => {
      if (!acc[err.rowNumber]) {
        acc[err.rowNumber] = [];
      }
      acc[err.rowNumber]!.push(err);
      return acc;
    },
    {} as Record<number, typeof validationErrors>
  );

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader>
        <div className="flex items-start gap-3">
          <XCircle className="h-6 w-6 text-destructive mt-0.5" />
          <div className="flex-1">
            <CardTitle className="text-destructive">Upload Failed</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Suggestion</AlertTitle>
          <AlertDescription>{ERROR_SUGGESTIONS[type]}</AlertDescription>
        </Alert>

        {groupedErrors && Object.keys(groupedErrors).length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Validation Errors:</h4>
            <div className="rounded-md border bg-muted/30 p-4 max-h-64 overflow-y-auto">
              <div className="space-y-3">
                {Object.entries(groupedErrors).map(([rowNum, errors]) => (
                  <div key={rowNum} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        Row {rowNum}
                      </Badge>
                    </div>
                    <ul className="ml-4 space-y-1 text-sm">
                      {errors.map((err, idx) => (
                        <li key={idx} className="text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {err.field}
                          </span>
                          : {err.message}
                          {err.value && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (value: "{err.value}")
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Showing {Object.keys(groupedErrors).length} row(s) with errors
            </p>
          </div>
        )}

        {onRetry && (
          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={onRetry}
              disabled={retryDisabled}
              variant="default"
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
            <p className="text-xs text-muted-foreground">
              {type === "validation"
                ? "Fix your CSV file first, then retry"
                : "This will retry the upload with the same file"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
