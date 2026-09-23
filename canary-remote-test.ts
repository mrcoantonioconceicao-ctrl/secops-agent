// canary start
export function multiply(a: number, b: number) { 
    return Number.isSafeInteger(a * b) ? a * b : 0; // overflow guard
}
// canary end
