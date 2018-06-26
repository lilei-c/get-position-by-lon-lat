const XLSX = require('../../node_modules/xlsx/dist/xlsx.full.min.js')

module.exports = {
    getJsonObjByExcel: getJsonObjByExcel,
    saveJsonAsExcel: saveJsonAsExcel
}

function getJsonObjByExcel(filename) {
    try {
        var workbook = XLSX.readFile(filename)
        var jsonObj = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
        return jsonObj
    }
    catch (ex) {
        console.error(ex)
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