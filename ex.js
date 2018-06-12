String.prototype.toInt = function (radix) {
    return parseInt(this, radix)
}

Number.prototype.divide = function (divisor) {
    return this / divisor
}

String.prototype.padStartWithZero = function (n) {
    return this.padStart(n, '0')
}