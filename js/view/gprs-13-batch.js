//const zl_gprs_13 = require('../../js/tool/zl-gprs-13')
const iexcel = require('./js/tool/excelHelper')

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
    let allRecord = iexcel.getJsonObjByExcel(readFileName)
    if (!allRecord) {
        g
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
            m['详细地址'] = ''
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
        console.log(result)
        if (result) {
            toBeDecode[i]['终端位置时间'] = result.data['位置信息']['终端位置时间']
            toBeDecode[i]['导航'] = result.data['状态1']['bit(7) 导航']
            toBeDecode[i]['经度'] = result.data['位置信息']['经度']
            toBeDecode[i]['纬度'] = result.data['位置信息']['纬度']
            toBeDecode[i]['详细地址'] = result.data['位置信息']['详细地址']
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
    iexcel.saveJsonAsExcel(toBeDecode, savePath)
    $('.trajectory-batch-result').show()
    $('.trajectory-batch-result.path').html(savePath)
    document.getElementById('trajectory-batch').ondrop = drop
}