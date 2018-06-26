const R = require('ramda')

const geo = require('./inverse-geo-coding')

require('./ex')

module.exports = {
    decode: async function (data) {
        data = data.toLowerCase()
        let result = {}
        let cmdCode = data.substr(4, 2)
        if (!R.contains(cmdCode)(['17', '18', '28'])) {
            result['提示'] = '只解析 17,18,28 指令.'
            return result
        }

        // 17 18 都带位置信息
        let dataContentLocation = ''
        if (cmdCode == '17')
            dataContentLocation = data.substr(36, 40)
        else if (cmdCode == '18')
            dataContentLocation = data.substr(34, 40)

        if (cmdCode == '17') {
            let cmd17Alarm = data.substr(34, 2).toInt(16).toString(2).padStartWithZero(8)
            if (cmd17Alarm == '10101010') {//10101010=>AA AA是特殊情况 无所谓发生,解除
                result['报警标志'] = '终端连接心跳包 (AA)'
            } else {
                console.log(cmd17Alarm)
                result['报警标志'] = cmd17Alarm.substr(0, 1) == '1' ? '报警发生' : '报警解除'
                let alarmValue = ''
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
            result['     '] = ''
        } else if (cmdCode == '28') {
            let cmd28content = data.substr(34, 36)
            result['主电源电压'] = cmd28content.substr(0, 4).toInt(16).divide(10).toFixed(1) + ' V'
            result['备用电池电压'] = cmd28content.substr(4, 2).toInt(16).divide(10).toFixed(1) + ' V'
            result['终端内部温度'] = cmd28content.substr(6, 2).toInt(16) - 60 + ' ℃'
            result['主电休眠上报间隔'] = cmd28content.substr(8, 2).toInt(16) + ' h'
            result['备电休眠上报间隔'] = cmd28content.substr(10, 2).toInt(16) + ' h'
            result['ACC ON总累计时间'] = cmd28content.substr(12, 8).toInt(16) + ' min'
            result['GPS终端总通电时间'] = cmd28content.substr(20, 8).toInt(16) + ' min'
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
            result['终端位置时间'] =
                (new Date(`${year}-${month}-${day} ${hour}:${minute}:${second}`).getTime() + 8 * 3600000)
                    .toDate()
                    .format()

            let num1 = dataContentLocation.substr(12, 2).toInt(16)
            let num2 = dataContentLocation.substr(14, 2).toInt(16)
            let num3 = dataContentLocation.substr(16, 2).toInt(16)
            let num4 = dataContentLocation.substr(18, 2).toInt(16)
            let num5 = dataContentLocation.substr(20, 2).toInt(16)
            let num6 = dataContentLocation.substr(22, 2).toInt(16)
            let num7 = dataContentLocation.substr(24, 2).toInt(16)
            let num8 = dataContentLocation.substr(26, 2).toInt(16)
            result['经度'] = (num5 + ((num7 * 100 + num8) * 1.0 / 10000.0 + num6) / 60.0).toFixed(7).replace(/[0]+$/, '')
            result['纬度'] = (num1 + ((num3 * 100 + num4) * 1.0 / 10000.0 + num2) / 60.0).toFixed(7).replace(/[0]+$/, '')

            let xxx = ''
            try {
                xxx = await geo.getPositons(result['经度'], result['纬度'], 2, 2000)
            } catch (error) {
                xxx = '获取位置失败...'
            }
            result['详细位置'] = xxx

            let state1 = dataContentLocation.substr(32, 2).toInt(16).toString(2).padStartWithZero(8)
            result[''] = ''
            result['----------状态1----------'] = ''
            result['bit(7) 导航'] = state1.substr(0, 1) == '1' ? '导航' : '不导航'
            result['bit(6) 0.05Hz脉冲'] = state1.substr(1, 1) == '1' ? '关闭' : '开启'
            result['bit(5) PLC上电'] = state1.substr(2, 1) == '1' ? '上电' : '不上电'
            result['bit(4) 曾自动锁车标志'] = state1.substr(3, 1) == '1' ? '曾锁车' : '正常'
            result['bit(3) 0.5Hz脉冲'] = state1.substr(4, 1) == '1' ? '关闭' : '启动'
            result['bit(2) K继电器失电'] = state1.substr(5, 1) == '1' ? '不吸合' : '吸合'
            result['bit(1) GPS天线故障'] = state1.substr(6, 1) == '1' ? '故障' : '正常'
            result['bit(0) 是否有总线定时输出'] = state1.substr(7, 1) == '1' ? '有' : '没有'

            let state2 = dataContentLocation.substr(34, 2).toInt(16).toString(2).padStartWithZero(8)
            result[' '] = ''
            result['----------状态2----------'] = ''
            result['bit(7) SIM卡更换报警'] = state2.substr(0, 1) == '1' ? '报警' : '正常'
            result['bit(6) 开盖状态'] = state2.substr(1, 1) == '1' ? '报警' : '正常'
            result['bit(5) SIM卡曾拔卡'] = state2.substr(2, 1) == '1' ? '曾拔卡' : '正常'
            result['bit(4) 曾通讯故障状态(删除)'] = state2.substr(3, 1) == '1' ? '报警' : '没有'
            result['bit(3) IC卡插入(暂不要求)'] = state2.substr(4, 1) == '1' ? '插卡' : '未插'
            result['bit(2) 进区报警(暂不要求)'] = state2.substr(5, 1) == '1' ? '报警' : '没有'
            result['bit(1) 越界报警(暂不要求)'] = state2.substr(6, 1) == '1' ? '报警' : '没有'
            result['bit(0) 超速报警(删除)'] = state2.substr(7, 1) == '1' ? '报警' : '没有'

            let state3 = dataContentLocation.substr(36, 2).toInt(16).toString(2).padStartWithZero(8)
            result['  '] = ''
            result['----------状态3----------'] = ''
            result['bit(7) 串口波特率'] = state3.substr(0, 1) == '1' ? '其它' : '9600'
            result['bit(6) CAN口波特率'] = state3.substr(1, 1) == '1' ? '其它' : '125K'
            result['bit(5) 曾开盖状态(删除)'] = state3.substr(2, 1) == '1' ? '曾开盖' : '正常'
            result['bit(4) 备用电池欠压报警'] = state3.substr(3, 1) == '1' ? '报警' : '正常'
            result['bit(3) 备用电池断电报警'] = state3.substr(4, 1) == '1' ? '报警' : '正常'
            result['bit(2) 主电源欠压报警'] = state3.substr(5, 1) == '1' ? '报警' : '正常'
            result['bit(1) 主电源断电报警'] = state3.substr(6, 1) == '1' ? '报警' : '正常'
            result['bit(0) 总线故障报警'] = state3.substr(7, 1) == '1' ? '报警' : '正常'

            let state4 = dataContentLocation.substr(38, 2).toInt(16).toString(2).padStartWithZero(8)
            result['   '] = ''
            result['----------状态4----------'] = ''
            result['bit(4) 总线心跳状态'] = state4.substr(3, 1) == '1' ? '错误' : '正确'
            result['bit(3) ACC2上电'] = state4.substr(4, 1) == '1' ? '上电' : '断电'
            result['bit(2) 休眠报警'] = state4.substr(5, 1) == '1' ? '休眠' : '未休眠'
        }
        return result
    }
}