String.prototype.toInt = function (radix) {
    return parseInt(this, radix)
}

String.prototype.padStartWithZero = function (n) {
    return this.padStart(n, '0')
}

Number.prototype.divide = function (divisor) {
    return this / divisor
}

Number.prototype.toDate = function () {
    return new Date(this)
}

Number.prototype.secondToCountDown = function () {
    let ts = this
    let d = parseInt(ts / 86400)
    let h = parseInt((ts % 86400) / 3600)
    let m = parseInt((ts % 3600) / 60)
    let s = ts % 60
    let result = ''
    if (d) result += d + '天';
    if (result || h) result += h + '小时'
    if (result || m) result += m + '分'
    result += s + '秒'
    return result
}

Date.prototype.format = function (formater = 'yyyy-MM-dd hh:mm:ss') {
    let y = this.getFullYear()
    let M = this.getMonth() + 1; if (M < 10) M = '0' + M
    let d = this.getDate(); if (d < 10) d = '0' + d
    let h = this.getHours(); if (h < 10) h = '0' + h
    let m = this.getMinutes(); if (m < 10) m = '0' + m
    let s = this.getSeconds(); if (s < 10) s = '0' + s
    return formater
        .replace('yyyy', y)
        .replace('MM', M)
        .replace('dd', d)
        .replace('hh', h)
        .replace('mm', m)
        .replace('ss', s)
}