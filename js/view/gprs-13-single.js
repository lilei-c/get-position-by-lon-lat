//单个解析
console.log(__dirname)
const zl_gprs_13 = require('../../js/tool/zl-gprs-13')

document.getElementById('trajectory-btn').onclick = trajectory_btn_click
async function trajectory_btn_click() {
    $('#trajectory-result').html('<img src="./static/loading.gif"/>')
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
        html += `<span style="color: #337ab7;">${i}</span> 
        <span style="color: ${valueColor};">${result[i]}</span><br>`
    }
    $('#trajectory-result').html(html)
}