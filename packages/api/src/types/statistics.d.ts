declare module "statistics.js" {
  export function spearmansRho(x: number[], y: number[]): number;
  export function kendallsTau(x: number[], y: number[]): {
    a: number;
    b: number;
    c: number;
  };
}
