const geo = require('../tool/inverse-geo-coding')
const iexcel = require('../tool/excelHelper')

document.getElementById('position-by-lonlat-batch').ondrop = drop
function drop(ev) {
    document.getElementById('position-by-lonlat-batch').ondrop = (ev) => { ev.preventDefault(); }
    ev.preventDefault();
    var fileObj = ev.dataTransfer.files[0];
    console.log(fileObj)
    decodeData(fileObj.path)
}

async function decodeData(readFileName) {
    let allRecord = iexcel.getJsonObjByExcel(readFileName)
    if (!allRecord) {
        document.getElementById('position-by-lonlat-batch').ondrop = drop
        return alert('未读取到数据, 请检测文件格式/内容!')
    }
    for (let i = 0; i < allRecord.length; i++) {
        let m = allRecord[i]
        let position = ''
        try {
            position = await geo.getPositons(m['经度'], m['纬度'])
        } catch (error) {
            console.error(error)
            position = ''
        }
        m['程序解析详细位置'] = position
    }

    console.log(allRecord)
    //保存文件名
    let excelNameArr = readFileName.split('.')
    excelNameArr[excelNameArr.length - 1] = 'xlsx'
    excelNameArr[excelNameArr.length - 2] += '_解析结果'
    let savePath = excelNameArr.join('.')

    iexcel.saveJsonAsExcel(allRecord, savePath)
    // $('.position-by-lonlat-batch-result').show()
    // $('.position-by-lonlat-batch-result.path').html(savePath)
    document.getElementById('position-by-lonlat-batch').ondrop = drop
}