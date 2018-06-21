module.exports = {
    getPositons: async function (lon, lat) {
        return new Promise(async function (resolve) {
            let rst = ''
            for (let i = 0; i < 3; i++) {
                console.log('i:' + i)
                try {
                    rst = await getPositonsX(lon, lat)
                    if (rst) {
                        console.log(rst)
                        resolve(rst)
                        return
                    }
                } catch (error) {
                    console.error(error)
                }
            }
            resolve('')
        })
    }
}

async function getPositonsX(lon, lat) {
    return new Promise((resolve, reject) => {
        var url = `${conf.mapUrl}rgeocode/simple?resType=json&encode=utf-8&range=300&roadnum=3&crossnum=2&poinum=2&retvalue=1&key=55dc8b4eed5d8d2a32060fb80d26bf7310a6e4177224f997fc148baa0b7f81c1eda6fcc3fd003db0&sid=7001&region=${lon},${lat}&rid=967188`
        require('request')(url, function (error, response, body) {
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

// var testOriginData = 'MMap.MAjaxResult[967188]={"time":"0.056","count":"2","status":"E0","list":[{"crosslist":[{"distance":"266.693","direction":"East","road1":{"id":"0731H49F0460402039","level":"42000","width":"12","name":"麓云路","ename":"Luyun Road"},"road2":{"id":"桐梓坡西路","level":"44000","width":"16","name":"桐梓坡西路","ename":"Tongzipo West Road"},"y":"28.22004806","x":"112.8815617"}],"poilist":[{"distance":"62.8539","typecode":"170200","pguid":"B02DB05L4H","address":"桐梓坡西路223号","direction":"North","tel":"","name":"长缆电缆附件有限公司","type":"公司企业;公司;公司","y":"28.220331","x":"112.878706"},{"distance":"260.528","typecode":"120302","pguid":"B02DB0TTOH","address":"中联重科斜对面","direction":"NorthWest","tel":"","name":"保利·麓谷林语","type":"商务住宅;住宅区;住宅小区","y":"28.22126","x":"112.876794"}],"province":{"name":"湖南省","ename":"Hunan Province","code":"430000"},"roadlist":[{"id":"桐梓坡西路","distance":"74.0351","level":"44000","direction":"North","width":"16","name":"桐梓坡西路","ename":"Tongzipo West Road","y":"28.2204","x":"112.879"},{"id":"麓云路","distance":"256.98","level":"42000","direction":"East","width":"12","name":"麓云路","ename":"Luyun Road","y":"28.2195","x":"112.881"}],"type":"list","district":{"name":"岳麓区","ename":"Yuelu District","code":"430104"},"near_districts":"","city":{"citycode":"0731","tel":"0731","name":"长沙市","ename":"Changsha City","code":"430100"}},{"crosslist":[{"distance":"266.693","direction":"East","road1":{"id":"0731H49F0460402039","level":"42000","width":"12","name":"麓云路","ename":"Luyun Road"},"road2":{"id":"桐梓坡西路","level":"44000","width":"16","name":"桐梓坡西路","ename":"Tongzipo West Road"},"y":"28.22004806","x":"112.8815617"}],"poilist":[{"distance":"62.8539","typecode":"170200","pguid":"B02DB05L4H","address":"桐梓坡西路223号","direction":"North","tel":"","name":"长缆电缆附件有限公司","type":"公司企业;公司;公司","y":"28.220331","x":"112.878706"},{"distance":"260.528","typecode":"120302","pguid":"B02DB0TTOH","address":"中联重科斜对面","direction":"NorthWest","tel":"","name":"保利·麓谷林语","type":"商务住宅;住宅区;住宅小区","y":"28.22126","x":"112.876794"}],"province":{"name":"湖南省","ename":"Hunan Province","code":"430000"},"roadlist":[{"id":"桐梓坡西路","distance":"74.0351","level":"44000","direction":"North","width":"16","name":"桐梓坡西路","ename":"Tongzipo West Road","y":"28.2204","x":"112.879"},{"id":"麓云路","distance":"256.98","level":"42000","direction":"East","width":"12","name":"麓云路","ename":"Luyun Road","y":"28.2195","x":"112.881"}],"type":"list","district":{"name":"岳麓区","ename":"Yuelu District","code":"430104"},"near_districts":"","city":{"citycode":"0731","tel":"0731","name":"长沙市","ename":"Changsha City","code":"430100"}}],"type":"list","version":"v2.0.0"}'
// console.log(getDetailAddressByOriginData(testOriginData))
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