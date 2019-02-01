const conf = require('../../js/tool/conf')

module.exports = {
    getPositons: async function (lon, lat, tryTimes = 3, timeout = 3000) {
        return new Promise(async function (resolve, reject) {
            let rst = ''
            for (let i = 0; i < tryTimes; i++) {
                console.log('i:' + i)
                try {
                    rst = await getPositonsX(lon, lat, timeout)
                    if (rst) {
                        console.log(rst)
                        resolve(rst)
                        return
                    }
                } catch (error) {
                    console.error(error)
                }
            }
            reject('get position fail')
        })
    }
}

async function getPositonsX(lon, lat, timeout) {
    return new Promise((resolve, reject) => {
        var url = `${conf.mapUrl}/v3/geocode/regeo?key=${conf.mapKey}&location=${lon},${lat}`
        require('request')(url, { timeout: timeout, json: true }, function (error, response, body) {
            if (response && response.statusCode == 200) {
                resolve(getDetailAddressByOriginData(body))
            }
            else if (error) {
                reject(error)
            }
            else {
                reject('error on getPositons')
            }
        })
    })
}

function getDetailAddressByOriginData(originData) {
    if (!originData || originData.status != 1)
        return ''
    return originData.regeocode.formatted_address
}

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