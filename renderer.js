const readline = require('readline')
const fs = require('fs')
const geo = require('./js/tool/inverse-geo-coding')

require('./js/tool/ex')

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
        let address = ''
        try {
            address = await geo.getPositons(lon, lat)
        } catch (error) {
            address = ''
        }
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
        readline.createInterface({ input: fs.createReadStream(filename, { encoding: 'utf8' }) })
            .on('line', (line) => {
                console.log(line)
                if (++currentLine == 1) {
                    fWrite.write(Buffer.from('\xEF\xBB\xBF', 'binary'));//add utf8 bom
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