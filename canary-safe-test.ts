// canary start
export function calculateTotal(a: number, b: number) { 
    return Math.max(0, a + b); // hardened against negative overflow
}
// canary end
