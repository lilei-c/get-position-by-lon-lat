require('./ex.js')
require('./conf.js')

const readline = require('readline')
const fs = require('fs');
var redisClient;
window.XLSX = require('./node_modules/xlsx/dist/xlsx.full.min.js')

document.getElementById('lonlat-btn').onclick = start
async function start() {
    if (!redisClient) {
        redisClient = require('redis').createClient()
    }

    $('#lonlat-btn').onclick = '';

    console.log('start')
    //清空缓存
    if (!await flashRedis())
        return console.log('redis flush all err!')
    console.log('flush all')

    //获取所有文件名
    let files = loopDirGetFilename('原始数据/', [])

    //经纬度存入缓存,返回待解析经纬度总记录
    let lonlatCount = await filesToRedis(files)

    //解析经纬度
    await check(lonlatCount)

    setTimeout(function () {
        writeFiles(files)
    }, 5000);
    //详细地址写入文件

    console.log('end')
}

var lonlatCount_Copy = 0
async function filesToRedis(files) {
    let lonlatCount = 0
    for (let i = 0; i < files.length; i++) {
        let readFileName = files[i]
        lonlatCount = await fileToRedis(readFileName, lonlatCount)
    }
    return new Promise((resolve) => {
        let iii = setInterval(() => {
            if (lonlatCount_Copy == lonlatCount) {
                clearInterval(iii)
                console.log('所有经纬度写入redis')
                resolve(lonlatCount)
            }
        }, 20)
    })
}

function fileToRedis(readFileName, lonlatCount) {
    console.log('经纬度写入redis开始:' + readFileName)
    return new Promise((resolve, reject) => {
        let lastLonlat = ''
        readline.createInterface({ input: fs.createReadStream(readFileName) })
            .on('line', (line) => {
                var lonlat = /[\d.]*\s*,[\d.]*\s*$/.exec(line)//console.log(!!lonlat)
                if (!lonlat) return //console.log(line)

                lonlat = lonlat.toString().replace(/\s/g, '')
                if (lonlat == lastLonlat) return //console.log('cache hit')

                lastLonlat = lonlat
                redisClient.set(++lonlatCount, lonlat, () => { ++lonlatCount_Copy })
            })
            .on('close', () => {
                console.log(`经纬度写入redis结束:${readFileName}\n`)
                resolve(lonlatCount)
            })
    })
}

var getRequestCounter = 0
function detailAddressInRedis(tag) {
    redisClient.get(tag, function (err, lonlat) {
        if (err || !lonlat) {
            console.log(`严重错误! 从redis读取经纬度失败 tag:${tag}`)
            console.log(err)
            return
        }
        getRequestCounter++
        getPositons(lonlat)
    })
}

function check(lonlatCount) {
    console.log(`共${lonlatCount}条数据待解析`)
    return new Promise((resolve) => {
        let getRequestMax = 3
        let tag = 1
        var iii = setInterval(function () {
            if (tag > lonlatCount) {
                clearInterval(iii)
                console.log('read all lonlat from redis')
                resolve()
            }
            else if (getRequestCounter <= getRequestMax) {
                console.log(`${tag}/${lonlatCount} 并发请求数:${getRequestCounter} ${getSpeedAndNeedTime(lonlatCount - tag)}`)
                detailAddressInRedis(tag)
                tag++
            }
        }, 20)
    })
}

let arr = []
function getSpeedAndNeedTime(lonlatCount) {
    const divisor = 100
    let dateNow = Date.now()
    arr.push(dateNow)
    if (arr.length < divisor)
        return '剩余时间计算中...'
    let start = arr.shift()
    let speed = divisor / ((dateNow - start) / 1000)
    return `当前请求速度:${speed.toFixed(0)}条/s 剩余时间约:${getTimeBySecond((lonlatCount / speed).toFixed(0))}`
}

async function writeFiles(files) {
    for (let i = 0; i < files.length; i++) {
        let filename = files[i]
        await writeFile(filename)
    }
    console.log('所有文件写入完成!')
}

function writeFile(filename) {
    let writeFileName = filename.replace('原始数据/', '解析结果/')
    console.log('写文件开始:' + writeFileName)
    createDirByFilename(writeFileName)
    var fWrite = fs.createWriteStream(writeFileName);
    return new Promise((resolve, reject) => {
        var currentLine = 0
        readline.createInterface({ input: fs.createReadStream(filename) })
            .on('line', (line) => {
                if (++currentLine == 1) {
                    fWrite.write(new Buffer('\xEF\xBB\xBF', 'binary'));//add utf-8 bom
                    fWrite.write(line + ',程序解析详细地址')
                    return
                }
                var lonlat = /[\d.]*\s*,[\d.]*\s*$/.exec(line)
                if (!lonlat) return
                var key = 'key_' + lonlat.toString().replace(/\s/g, '')
                redisClient.get(key, function (err, value) {
                    if (err || (!value && value != ''))
                        console.log(`严重错误! 未从缓存读到数据 key:${key} readFileName:${filename} currentLine:${currentLine} line:${line} `)
                    else
                        fWrite.write(`\n${line},${value}`)
                })
            })
            .on('close', () => {
                setTimeout(function () {
                    fWrite.close(() => {
                        console.log('写文件结束:' + writeFileName)
                        resolve()
                    })
                }, 1000);
            })
    })
}

var request = require('request');
function getPositons(lonLats) {
    var url = `${conf.mapUrl}rgeocode/simple?resType=json&encode=utf-8&range=300&roadnum=3&crossnum=2&poinum=2&retvalue=1&key=55dc8b4eed5d8d2a32060fb80d26bf7310a6e4177224f997fc148baa0b7f81c1eda6fcc3fd003db0&sid=7001&region=${lonLats}&rid=967188`
    request(url, function (error, response, body) {
        if (error) {
            console.log(error)
            getPositons(lonLats)
        }
        else if (response && response.statusCode == 200) {
            getRequestCounter--
            redisClient.set('key_' + lonLats, getDetailAddressByOriginData(body))
        }
    })
}

function getDetailAddressByOriginData(originData) {
    if (!originData)
        return ''
    let mapData = originData.split("=")
    if (mapData.length < 2)
        return ''
    let jsonObj = JSON.parse(mapData[1])
    if (!jsonObj || !jsonObj.list)
        return ''
    var data = jsonObj.list
        .map(address => {
            var result = address.province.name + address.city.name + address.district.name
            if (address.poilist.length > 0) {
                result += address.poilist[0].name;
            }
            else if (address.roadlist.length > 0) {
                result += `${address.roadlist[0].name}${directionstr(address.roadlist[0].direction)}${address.roadlist[0].distance}m`;
            }
            return result
        })
    if (data && data.length > 0)
        return data[0]
    return ''
}

// var testOriginData = 'MMap.MAjaxResult[967188]={"time":"0.056","count":"2","status":"E0","list":[{"crosslist":[{"distance":"266.693","direction":"East","road1":{"id":"0731H49F0460402039","level":"42000","width":"12","name":"麓云路","ename":"Luyun Road"},"road2":{"id":"桐梓坡西路","level":"44000","width":"16","name":"桐梓坡西路","ename":"Tongzipo West Road"},"y":"28.22004806","x":"112.8815617"}],"poilist":[{"distance":"62.8539","typecode":"170200","pguid":"B02DB05L4H","address":"桐梓坡西路223号","direction":"North","tel":"","name":"长缆电缆附件有限公司","type":"公司企业;公司;公司","y":"28.220331","x":"112.878706"},{"distance":"260.528","typecode":"120302","pguid":"B02DB0TTOH","address":"中联重科斜对面","direction":"NorthWest","tel":"","name":"保利·麓谷林语","type":"商务住宅;住宅区;住宅小区","y":"28.22126","x":"112.876794"}],"province":{"name":"湖南省","ename":"Hunan Province","code":"430000"},"roadlist":[{"id":"桐梓坡西路","distance":"74.0351","level":"44000","direction":"North","width":"16","name":"桐梓坡西路","ename":"Tongzipo West Road","y":"28.2204","x":"112.879"},{"id":"麓云路","distance":"256.98","level":"42000","direction":"East","width":"12","name":"麓云路","ename":"Luyun Road","y":"28.2195","x":"112.881"}],"type":"list","district":{"name":"岳麓区","ename":"Yuelu District","code":"430104"},"near_districts":"","city":{"citycode":"0731","tel":"0731","name":"长沙市","ename":"Changsha City","code":"430100"}},{"crosslist":[{"distance":"266.693","direction":"East","road1":{"id":"0731H49F0460402039","level":"42000","width":"12","name":"麓云路","ename":"Luyun Road"},"road2":{"id":"桐梓坡西路","level":"44000","width":"16","name":"桐梓坡西路","ename":"Tongzipo West Road"},"y":"28.22004806","x":"112.8815617"}],"poilist":[{"distance":"62.8539","typecode":"170200","pguid":"B02DB05L4H","address":"桐梓坡西路223号","direction":"North","tel":"","name":"长缆电缆附件有限公司","type":"公司企业;公司;公司","y":"28.220331","x":"112.878706"},{"distance":"260.528","typecode":"120302","pguid":"B02DB0TTOH","address":"中联重科斜对面","direction":"NorthWest","tel":"","name":"保利·麓谷林语","type":"商务住宅;住宅区;住宅小区","y":"28.22126","x":"112.876794"}],"province":{"name":"湖南省","ename":"Hunan Province","code":"430000"},"roadlist":[{"id":"桐梓坡西路","distance":"74.0351","level":"44000","direction":"North","width":"16","name":"桐梓坡西路","ename":"Tongzipo West Road","y":"28.2204","x":"112.879"},{"id":"麓云路","distance":"256.98","level":"42000","direction":"East","width":"12","name":"麓云路","ename":"Luyun Road","y":"28.2195","x":"112.881"}],"type":"list","district":{"name":"岳麓区","ename":"Yuelu District","code":"430104"},"near_districts":"","city":{"citycode":"0731","tel":"0731","name":"长沙市","ename":"Changsha City","code":"430100"}}],"type":"list","version":"v2.0.0"}'
// console.log(getDetailAddressByOriginData(testOriginData))

function directionstr(oldstr) {
    switch (oldstr.toLowerCase()) {
        case "eastnorth": return "东北方"
        case "eastsouth": return "东南方"
        case "wstsouth": return "西南方"
        case "westnorth": return "西北方"
        case "northeast": return "东偏北"
        case "southeast": return "东偏南"
        case "southwest": return "西偏南"
        case "northwest": return "西偏北"
        case "north": return "正北方"
        case "east": return "正东方"
        case "south": return "正南方"
        case "west": return "正西方"
    }
    return ''
}

// 打印内存占用情况
function printMemoryUsage() {
    var info = process.memoryUsage()
    document.getElementById('memoryusage').innerHTML =
        `内存(MB) rss=${mb(info.rss)} heapTotal=${mb(info.heapTotal)} heapUsed=${mb(info.heapUsed)}`
}
function mb(v) {
    return (v / 1024 / 1024).toFixed(2);
}
setInterval(printMemoryUsage, 2000)

//-----------通用方法------------

function flashRedis() {
    return new Promise((resolve, reject) => {
        redisClient.flushall((err, result) => {
            if (!err && result == 'OK') {
                resolve(true)
            }
            else {
                resolve(false)
            }
        })
    })
}

function loopDirGetFilename(theDirPath, getfiles) {
    var files = fs.readdirSync(theDirPath)
    files.forEach(filename => {
        var stats = fs.statSync(theDirPath + filename)
        if (stats.isFile())
            getfiles.push(theDirPath + filename)
        if (stats.isDirectory())
            loopDirGetFilename(theDirPath + filename + '/', getfiles)
    })
    return getfiles
}

function createDirByFilename(filename, currentPath) {
    if (typeof filename != 'object') {
        filename = filename.split('/')
    } else {
        if (filename.length <= 1)
            return
    }
    currentPath = (currentPath || '') + filename.shift() + '/'
    if (!fs.existsSync(currentPath))
        fs.mkdirSync(currentPath)
    createDirByFilename(filename, currentPath)
}

function getTimeBySecond(ts) {
    var d = parseInt(ts / 86400)
    var h = parseInt((ts % 86400) / 3600)
    var m = parseInt((ts % 3600) / 60)
    var s = ts % 60;

    var result = '';
    if (d) result += d + '天';
    if (result || h) result += h + '时'
    if (result || m) result += m + '分'
    result += s + '秒'
    return result
}

//---------------excel todo-----------

function doTheJobByFilename(filename) {
    if (/.csv$/.test(filename)) {
        //
    } else if (/.xls[x]?$/.test(filename)) {
        var jsonArr = GetJsonObjByExcel(filename)
        //
    }
}

function GetJsonObjByExcel(filename) {
    try {
        var workbook = XLSX.readFile(filename)
        var jsonObj = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
        return jsonObj
    }
    catch (ex) {
        return null;
    }
}

function Workbook() {
    if (!(this instanceof Workbook)) return new Workbook();
    this.SheetNames = [];
    this.Sheets = {};
}

function saveJsonAsExcel(jsonObjs, excelName) {
    var wb = new Workbook()
    ws = XLSX.utils.json_to_sheet(jsonObjs);

    //计算列宽
    let colObj = {}
    jsonObjs.forEach(m => {
        for (let property in m) {
            if (!colObj[property] || !m[property].replace)
                colObj[property] = property.replace(/[\u0391-\uFFE5]/g, "aa").length
        }

        for (let property in m) {
            if (!m[property]) continue
            let charLength = m[property].toString().replace(/[\u0391-\uFFE5]/g, "aa").length
            if (charLength > colObj[property])
                colObj[property] = charLength
        }
    })
    let cols = []
    for (let i in colObj) {
        cols.push({ wpx: colObj[i] * 6.7 })
    }
    ws['!cols'] = cols;

    //sheet
    let ws_name = "SheetJS";
    wb.SheetNames.push(ws_name);
    wb.Sheets[ws_name] = ws;

    //路径
    //excelName = '轨迹解析' + excelName
    //createDirByFilenamecreateDirByFilename(excelName)

    //文件名
    var excelNameArr = excelName.split('.')
    excelNameArr[excelNameArr.length - 1] = 'xlsx'
    excelNameArr[excelNameArr.length - 2] += '_解析结果'
    excelName = excelNameArr.join('.')

    XLSX.writeFile(wb, excelName);
    return excelName
}

document.getElementById('trajectory-btn').onclick = trajectory_btn_click
async function trajectory_btn_click() {
    $('#trajectory-result').html('')
    let data = $('#trajectory-content').val().replace(/\s/g, '')
    if (!data || data.length < 40)
        return alert('原始数据长度小于40')
    let result = await zl_gprs_13_decode(data)
    if (!result)
        return alert('解析失败')

    let html = ''
    for (var i in result) {
        let valueColor = ''
        if (result[i] == '报警')
            valueColor = 'red'
        html += `<span style="color: blue;">${i}</span> 
        <span style="color: ${valueColor};">${result[i]}</span><br>`
    }
    $('#trajectory-result').html(html)
}

async function zl_gprs_13_decode(data) {
    let result = {}
    let cmdCode = data.substr(4, 2)
    if (!~['17', '18', '28'].indexOf(cmdCode)) {
        result['提示'] = '只解析 17,18,28 指令'
        return result
    }

    // 17 18 都带位置信息
    let dataContentLocation = ''
    if (cmdCode == '17')
        dataContentLocation = data.substr(36, 40)
    else if (cmdCode == '18')
        dataContentLocation = data.substr(34, 40)

    if (cmdCode == '17') {
        let cmd17Alarm = data.substr(35, 2).toInt(10).toString(2).padStart(8, '0')
        if (cmd17Alarm == '10101010') {//10101010=>AA AA是特殊情况 无所谓发生,解除
            result['报警标志'] = '终端连接心跳包'
        } else {
            result['报警标志'] = cmd17Alarm.substr(0, 1) == '1' ? '报警发生' : '报警解除'
            let alarmValue = ''
            console.log(cmd17Alarm)
            console.log(cmd17Alarm.substr(1, 7))
            console.log(cmd17Alarm.substr(1, 7).toInt(2))
            console.log(cmd17Alarm.substr(1, 7).toInt(2).toString(16))
            switch (cmd17Alarm.substr(1, 7).toInt(2).toString(16)) {
                case '1': alarmValue = 'GPS天线故障'; break
                case '4': alarmValue = '曾自动锁车标志'; break
                case '5': alarmValue = 'ACC/PLC上电'; break
                case 'd': alarmValue = 'SIM卡拔卡标志'; break
                case 'e': alarmValue = '开盖报警'; break
                case 'f': alarmValue = 'SIM卡更换报警'; break
                case '10': alarmValue = '总线故障报警'; break
                case '11': alarmValue = '主电源断电报警'; break
                case '12': alarmValue = '主电源欠压报警'; break
                case '13': alarmValue = '备用电池断电报警'; break
                case '14': alarmValue = '备用电源欠压报警'; break
                case '16': alarmValue = 'CAN波特率变化'; break
                case '17': alarmValue = '串口波特率变化'; break
            }
            result['报警值'] = alarmValue
        }
    } else if (cmdCode == '28') {
        let cmd28content = data.substr(34, 36)
        result['主电源电压'] = cmd28content.substr(0, 4).toInt(16).divide(10).toFixed(1) + 'V'
        result['备用电池电压'] = cmd28content.substr(4, 2).toInt(16).divide(10).toFixed(1) + 'V'
        result['终端内部温度'] = cmd28content.substr(6, 2).toInt(16) - 60 + '℃'
        result['主电休眠上报间隔'] = cmd28content.substr(8, 2).toInt(16) + 'h'
        result['备电休眠上报间隔'] = cmd28content.substr(10, 2).toInt(16) + 'h'
        result['ACC ON总累计时间'] = cmd28content.substr(12, 8).toInt(16) + 'm'
        result['GPS终端总通电时间'] = cmd28content.substr(20, 8).toInt(16) + 'm'
        result['开盖次数'] = cmd28content.substr(28, 2).toInt(16)
        result['拔GPS天线次数'] = cmd28content.substr(30, 2).toInt(16)
        result['拔SIM卡次数'] = cmd28content.substr(32, 2).toInt(16)
        result['GSM信号强度'] = cmd28content.substr(34, 2).toInt(16)
    }

    if (dataContentLocation) {
        let year = "20" + dataContentLocation.substr(0, 2).toInt(16).toString(2).substr(2, 6).toInt(2)
        let month = dataContentLocation.substr(2, 2).toInt(16)
        let day = dataContentLocation.substr(4, 2).toInt(16)
        let hour = dataContentLocation.substr(6, 2).toInt(16)
        let minute = dataContentLocation.substr(8, 2).toInt(16)
        let second = dataContentLocation.substr(10, 2).toInt(16)
        result['终端位置时间'] = formatDateTime(new Date(`${year}-${month}-${day} ${hour}:${minute}:${second}`).getTime() + 8 * 3600000)

        let num1 = dataContentLocation.substr(12, 2).toInt(16)
        let num2 = dataContentLocation.substr(14, 2).toInt(16)
        let num3 = dataContentLocation.substr(16, 2).toInt(16)
        let num4 = dataContentLocation.substr(18, 2).toInt(16)
        let num5 = dataContentLocation.substr(20, 2).toInt(16)
        let num6 = dataContentLocation.substr(22, 2).toInt(16)
        let num7 = dataContentLocation.substr(24, 2).toInt(16)
        let num8 = dataContentLocation.substr(26, 2).toInt(16)
        result['经度'] = num5 + ((num7 * 100 + num8) * 1.0 / 10000.0 + num6) / 60.0
        result['纬度'] = num1 + ((num3 * 100 + num4) * 1.0 / 10000.0 + num2) / 60.0
        let xxx = await getPositonsX(result['经度'], result['纬度'])
        result['详细位置'] = xxx

        let state1 = dataContentLocation.substr(32, 2).toInt(16).toString(2)
        result[''] = ''
        result['----------状态1----------'] = ''
        result['导航状态'] = state1.substr(0, 1) == '1' ? '导航' : '不导航'
        result['0.05Hz脉冲'] = state1.substr(1, 1) == '1' ? '关闭' : '开启'
        result['PLC上电'] = state1.substr(2, 1) == '1' ? '上电' : '不上电'
        result['曾自动锁车标志'] = state1.substr(3, 1) == '1' ? '曾锁车' : '正常'
        result['0.5Hz脉冲'] = state1.substr(4, 1) == '1' ? '关闭' : '启动'
        result['K继电器失电'] = state1.substr(5, 1) == '1' ? '不吸合' : '吸合'
        result['GPS天线故障'] = state1.substr(6, 1) == '1' ? '故障' : '正常'
        result['是否有总线定时输出'] = state1.substr(7, 1) == '1' ? '有' : '没有'

        let state2 = dataContentLocation.substr(34, 2).toInt(16).toString(2)
        result[' '] = ''
        result['----------状态2----------'] = ''
        result['SIM卡更换报警'] = state2.substr(0, 1) == '1' ? '报警' : '正常'
        result['开盖状态'] = state2.substr(0, 1) == '1' ? '报警' : '正常'
        result['SIM卡曾拔卡'] = state2.substr(0, 1) == '1' ? '曾拔卡' : '正常'

        let state3 = dataContentLocation.substr(36, 2).toInt(16).toString(2)
        result['  '] = ''
        result['----------状态3----------'] = ''
        result['串口波特率'] = state3.substr(0, 1) == '1' ? '其它' : '9600'
        result['CAN口波特率'] = state3.substr(1, 1) == '1' ? '其它' : '125K'
        result['备用电池欠压报警'] = state3.substr(3, 1) == '1' ? '报警' : '正常'
        result['备用电池断电报警'] = state3.substr(4, 1) == '1' ? '报警' : '正常'
        result['主电源欠压报警'] = state3.substr(5, 1) == '1' ? '报警' : '正常'
        result['主电源断电报警'] = state3.substr(6, 1) == '1' ? '报警' : '正常'
        result['总线故障报警'] = state3.substr(7, 1) == '1' ? '报警' : '正常'

        let state4 = dataContentLocation.substr(38, 2).toInt(16).toString(2)
        result['   '] = ''
        result['----------状态4----------'] = ''
        result['总线心跳状态'] = state4.substr(3, 1) == '1' ? '错误' : '正确'
        result['ACC2上电'] = state4.substr(4, 1) == '1' ? '上电' : '断电'
        result['休眠报警'] = state4.substr(5, 1) == '1' ? '休眠' : '未休眠'
    }
    return result
}

function formatDateTime(inputTime) {
    var date = new Date(inputTime);
    var y = date.getFullYear();
    var m = date.getMonth() + 1;
    m = m < 10 ? ('0' + m) : m;
    var d = date.getDate();
    d = d < 10 ? ('0' + d) : d;
    var h = date.getHours();
    h = h < 10 ? ('0' + h) : h;
    var minute = date.getMinutes();
    var second = date.getSeconds();
    minute = minute < 10 ? ('0' + minute) : minute;
    second = second < 10 ? ('0' + second) : second;
    return y + '-' + m + '-' + d + ' ' + h + ':' + minute + ':' + second;
}

async function getPositonsX(lon, lat) {
    return new Promise((resolve) => {
        var url = `${conf.mapUrl}rgeocode/simple?resType=json&encode=utf-8&range=300&roadnum=3&crossnum=2&poinum=2&retvalue=1&key=55dc8b4eed5d8d2a32060fb80d26bf7310a6e4177224f997fc148baa0b7f81c1eda6fcc3fd003db0&sid=7001&region=${lon},${lat}&rid=967188`
        require('request')(url, function (error, response, body) {
            if (error) {
                console.log(error)
            }
            else if (response && response.statusCode == 200) {
                resolve(getDetailAddressByOriginData(body))
            }
        })
    })
}


document.getElementById('trajectory-batch').ondrop = drop
function drop(ev) {
    document.getElementById('trajectory-batch').ondrop = dropFake
    ev.preventDefault();
    var fileObj = ev.dataTransfer.files[0];
    console.log(fileObj)

    //
    $('.trajectory-batch-rate').show()
    $('#trajectory-batch-rate-show1').attr('style', `width:0%`)
    $('#trajectory-batch-rate-show2').html('')
    //
    $('.trajectory-batch-result').hide()
    $('.trajectory-batch-result.path').html('')

    decodeOriginTraceDataFromXlsx(fileObj.path)
}
function dropFake(ev) {
    ev.preventDefault();
}

async function decodeOriginTraceDataFromXlsx(readFileName) {
    let allRecord = GetJsonObjByExcel(readFileName)
    if (!allRecord) {
        document.getElementById('trajectory-batch').ondrop = drop
        return alert('未读取到数据, 请检测文件格式/内容!')
    }
    let toBeDecode = allRecord
        .filter(m => {
            return (m['指令类型'] == '定时位置信息1.2版'
                && m['数据方向'] == 'GPRS上行'
                && m['内容'].length >= 40)
        })
        .map(m => {
            m['终端位置时间'] = ''
            m['导航状态'] = ''
            m['经度'] = ''
            m['纬度'] = ''
            m['详细位置'] = ''
            return m
        })
    console.log(allRecord)
    console.log(toBeDecode)
    console.log('待解析记录数:' + toBeDecode.length)
    if (toBeDecode.length <= 0) {
        document.getElementById('trajectory-batch').ondrop = drop
        return alert('未读取到数据, 请检测文件格式/内容!')
    }

    for (var i = 0; i < toBeDecode.length; i++) {
        let result = await zl_gprs_13_decode(toBeDecode[i]['内容'])
        if (result) {
            toBeDecode[i]['终端位置时间'] = result['终端位置时间']
            toBeDecode[i]['导航状态'] = result['导航状态']
            toBeDecode[i]['经度'] = result['经度']
            toBeDecode[i]['纬度'] = result['纬度']
            toBeDecode[i]['详细位置'] = result['详细位置']
        }
        console.log(toBeDecode[i])
        let rate = ((i + 1) / toBeDecode.length).toFixed(2) * 100
        $('#trajectory-batch-rate-show1').attr('style', `width:${rate}%`)
        $('#trajectory-batch-rate-show2').html(`${i + 1}/${toBeDecode.length}`)
    }
    let savePath = saveJsonAsExcel(toBeDecode, readFileName)
    $('.trajectory-batch-result').show()
    $('.trajectory-batch-result.path').html(savePath)
    document.getElementById('trajectory-batch').ondrop = drop
}