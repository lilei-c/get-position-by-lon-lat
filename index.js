const R = require('ramda')
const readline = require('readline')
const fs = require('fs')

require('./ex.js')
require('./conf.js')

const geo = require('./inverse-geo-coding.js')
const zl_gprs_13 = require('./zl-gprs-13.js')

window.XLSX = require('./node_modules/xlsx/dist/xlsx.full.min.js')

//单个解析
document.getElementById('trajectory-btn').onclick = trajectory_btn_click
async function trajectory_btn_click() {
    $('#trajectory-result').html('<img src="./js_css/loading.gif"/>')
    let data = $('#trajectory-content').val().replace(/\s/g, '')
    if (!data || data.length < 38)
        return alert('数据无效')
    let result = await zl_gprs_13.decode(data)
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

//批量解析
document.getElementById('trajectory-batch').ondrop = drop
function drop(ev) {
    document.getElementById('trajectory-batch').ondrop = (ev) => { ev.preventDefault(); }
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

async function decodeOriginTraceDataFromXlsx(readFileName) {
    let allRecord = GetJsonObjByExcel(readFileName)
    if (!allRecord) {
        document.getElementById('trajectory-batch').ondrop = drop
        return alert('未读取到数据, 请检测文件格式/内容!')
    }
    let toBeDecode = allRecord
        .filter(m => {
            return (/^5A4C(17|18)/.test(m['内容']) && m['数据方向'] == 'GPRS上行')
        })
        .map(m => {
            m['终端位置时间'] = ''
            m['导航'] = ''
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
        let result = await zl_gprs_13.decode(toBeDecode[i]['内容'])
        if (result) {
            toBeDecode[i]['终端位置时间'] = result['终端位置时间']
            toBeDecode[i]['导航'] = result['bit(7) 导航']
            toBeDecode[i]['经度'] = result['经度']
            toBeDecode[i]['纬度'] = result['纬度']
            toBeDecode[i]['详细位置'] = result['详细位置']
        }
        console.log(toBeDecode[i])
        let rate = ((i + 1) / toBeDecode.length).toFixed(2) * 100
        $('#trajectory-batch-rate-show1').attr('style', `width:${rate}%`)
        $('#trajectory-batch-rate-show2').html(`${i + 1}/${toBeDecode.length}`)
    }

    //保存文件名
    let excelNameArr = readFileName.split('.')
    excelNameArr[excelNameArr.length - 1] = 'xlsx'
    excelNameArr[excelNameArr.length - 2] += '_解析结果'
    let savePath = excelNameArr.join('.')
    console.log(toBeDecode)
    saveJsonAsExcel(toBeDecode, savePath)
    $('.trajectory-batch-result').show()
    $('.trajectory-batch-result.path').html(savePath)
    document.getElementById('trajectory-batch').ondrop = drop
}

let redisClient;
document.getElementById('lonlat-btn').onclick = async function () {
    if (!redisClient) {
        redisClient = require('redis').createClient()
    }

    $('#lonlat-btn').onclick = '';

    console.log('开始')
    if (!await flushRedis())
        return console.log('redis flush all err!')
    console.log('1.初始化数据库')

    //获取所有文件名
    let files = loopDirGetFilename('原始数据/', [])

    let lonlatCount = await filesToRedis(files)
    console.log(`2.所有经纬度存入数据库, 共${lonlatCount}条`)

    //解析经纬度
    await check(lonlatCount)

    //详细地址写入文件
    await writeFiles(files)

    console.log('结束')
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

async function detailAddressInRedis(tag) {
    return new Promise(async function (resolve) {
        let lonlat = await getValueFromRedis(tag)
        let lon = lonlat.split(',')[0]
        let lat = lonlat.split(',')[1]
        let address = await geo.getPositons(lon, lat)
        redisClient.set('key_' + lonlat, address, () => {
            resolve()
        })
    })
}

async function getValueFromRedis(key) {
    return new Promise(resolve => {
        redisClient.get(key, function (err, lonlat) {
            if (err || !lonlat) {
                reject(`严重错误! 从redis读取经纬度失败 key:${key}`)
            } else {
                resolve(lonlat)
            }
        })
    })
}

function check(lonlatCount) {
    console.log(`共${lonlatCount}条数据待解析`)
    return new Promise(async function (resolve) {
        for (let i = 1; i <= lonlatCount; i++) {
            await detailAddressInRedis(i)
            console.log(`${i}/${lonlatCount}  ${getSpeedAndNeedTime(lonlatCount - i)}`)
        }
        resolve()
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
    return `当前请求速度:${speed.toFixed(0)}条/s 剩余时间约:${(lonlatCount / speed).toFixed(0).toInt().secondToCountDown()}`
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
                console.log(line)
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
                        console.error(`严重错误! 未从缓存读到数据 key:${key} readFileName:${filename} currentLine:${currentLine} line:${line} `)
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

//-----------通用方法------------

function flushRedis() {
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
    let ws = XLSX.utils.json_to_sheet(jsonObjs);
    //计算列宽
    let ks = Object.keys(jsonObjs[0])
    let colsLen = []
    //初始化全0
    for (let i = 0; i < ks.length; i++) {
        colsLen.push(0)
    }
    //比较值
    jsonObjs.forEach(m => {
        for (let i = 0; i < ks.length; i++) {
            let len = (m[ks[i]] + '').replace(/[\u0391-\uFFE5]/g, "cn").length
            if (len > colsLen[i])
                colsLen[i] = len
        }
    })
    //比较属性名
    for (let i = 0; i < ks.length; i++) {
        let len = ks[i].replace(/[\u0391-\uFFE5]/g, "cn").length
        if (len > colsLen[i])
            colsLen[i] = len
    }
    colsLen = colsLen.map(m => {
        m = m < 60 ? m : 10 //太长的列
        return { wpx: m * 6.7 }
    })

    ws['!cols'] = colsLen;

    //sheet
    let wb = new Workbook()
    wb.SheetNames.push('Sheet1');
    wb.Sheets['Sheet1'] = ws;

    XLSX.writeFile(wb, excelName);
}