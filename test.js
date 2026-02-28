try {
  Zabbix.Log(4, '[SHZL FastGPT Webhook] 开始处理告警数据');

  var params = JSON.parse(value);
  Zabbix.Log(4, '[SHZL FastGPT Webhook] 接收到的参数: ' + JSON.stringify(params));

  // 安全地获取参数值，避免访问未定义的属性
  var hostName = params.host || params.hostname || '未知主机';
  var triggerName = params.trigger || params.trigger_name || '未知触发器';
  var severity = params.severity || params.trigger_severity || '未知级别';
  var triggerValue = params.value || params.trigger_value || '未知值';
  var itemName = params.item_name || params.item || '未知监控项';
  var itemValue = params.item_value || params.item_lastvalue || '未知值';
  var eventDate = params.event_date || params.date || new Date().toISOString().split('T')[0];
  var eventTime = params.event_time || params.time || new Date().toTimeString().split(' ')[0];
  var eventId = params.event_id || params.eventid || '未知事件ID';
  var triggerDescription = params.trigger_description || params.description || '无描述';
  var zabbixUrl = params.zabbix_url || params.zabbixurl || 'http://localhost';
  var triggerId = params.trigger_id || params.triggerid || '未知触发器ID';
  var itemId = params.item_id || params.itemid || '未知监控项ID';

  Zabbix.Log(4, '[SHZL FastGPT Webhook] 解析后的数据: host=' + hostName + ', trigger=' + triggerName);

  var request = new HttpRequest();
  request.addHeader('Content-Type: application/json');

  // 构建发送到 FastGPT 的数据
  var alertData = {
    host_name: hostName,
    trigger_name: triggerName,
    trigger_severity: severity,
    trigger_value: triggerValue,
    item_name: itemName,
    item_value: itemValue,
    trigger_time: eventDate + ' ' + eventTime,
    trigger_description: triggerDescription,
    event_id: eventId,
    zabbix_url: zabbixUrl,
    trigger_id: triggerId,
    item_id: itemId
  };
  var alertDataString = JSON.stringify(alertData);
  Zabbix.Log(4, '[SHZL FastGPT Webhook] 原始告警数据: ' + alertDataString);

  function generateUniqueId() {
    // 尽量生成一个接近唯一的 ID
    var timestamp = new Date().getTime();
    var randomPart = Math.floor(Math.random() * 1000000);
    return 'chat-' + timestamp + '-' + randomPart;
  }

  var uniqueChatId = generateUniqueId();
  Zabbix.Log(4, '[SHZL FastGPT Webhook] 生成的 Chat ID: ' + uniqueChatId);

  // . 构建符合 FastGPT API 要求的新的请求体 (Payload)
  var fastGPTPayload = {
    chatId: uniqueChatId,
    stream: false,
    detail: false,
    messages: [
      {
        // 将原始的 alertData 字符串作为 content 字段的值
        content: alertDataString,
        role: "user"
      }
    ]
  };

  Zabbix.Log(4, '[SHZL FastGPT Webhook] 发送数据到FastGPT: ' + JSON.stringify(alertData));

  // 定义请求头
  var headers = {
    'Authorization': 'Bearer api-rpeG5Czizlmw83F09eOvhpG0LmLxJvO8Wn5h4KpOoZNMLxPm3YtXqjtqoe',
    'Content-Type': 'application/json'
  };

  // 发送到 FastGPT Webhook 端点
  var apiUrl = 'http://172.81.125.75:3000/api/v1/chat/asyncCompetions';
  var response = request.post(apiUrl, fastGPTPayloadString, headers);

  Zabbix.Log(4, '[SHZL FastGPT Webhook] 原始响应: ' + JSON.stringify(response));
  Zabbix.Log(4, '[SHZL FastGPT Webhook] 响应类型: ' + typeof response);

  // 处理不同Onevision版本的响应格式
  var responseStatus, responseBody;

  if (typeof response === 'string') {
    // 某些Zabbix版本直接返回响应内容字符串
    try {
      var parsedResponse = JSON.parse(response);
      responseStatus = 200; // 假设成功，因为得到了有效的JSON响应
      responseBody = response;
      Zabbix.Log(4, '[SHZL FastGPT Webhook] 响应是字符串格式，解析为JSON');
    } catch (e) {
      // 如果不是JSON，可能是错误消息
      responseStatus = 500;
      responseBody = response;
      Zabbix.Log(4, '[SHZL FastGPT Webhook] 响应是字符串格式，但不是JSON');
    }
  } else if (typeof response === 'object') {
    // 标准HTTP响应对象
    if (response.status !== undefined) {
      responseStatus = response.status;
      // 尝试不同的响应体获取方法
      if (response.getBody !== undefined && typeof response.getBody === 'function') {
        responseBody = response.getBody();
      } else if (response.body !== undefined) {
        responseBody = response.body;
      } else if (response.data !== undefined) {
        responseBody = response.data;
      } else {
        responseBody = JSON.stringify(response);
      }
    } else {
      // 没有status属性，可能是直接的成功响应
      responseStatus = 200;
      responseBody = JSON.stringify(response);
    }
  } else {
    // 其他情况，假设成功
    responseStatus = 200;
    responseBody = String(response);
  }

  Zabbix.Log(4, '[SHZL FastGPT Webhook] 处理后的响应状态: ' + responseStatus);
  Zabbix.Log(4, '[SHZL FastGPT Webhook] 处理后的响应内容: ' + responseBody);

  // 检查响应状态
  if (responseStatus < 200 || responseStatus >= 300) {
    throw 'HTTP错误: ' + responseStatus + ' - ' + responseBody;
  }

  Zabbix.Log(4, '[SHZL FastGPT Webhook] 告警处理成功');
  return 'OK';

} catch (error) {
  Zabbix.Log(3, '[SHZL FastGPT Webhook] 处理失败: ' + error.toString());
  Zabbix.Log(3, '[SHZL FastGPT Webhook] 错误堆栈: ' + (error.stack || '无堆栈信息'));
  throw 'FastGPT Webhook 处理失败: ' + error.toString();
}



设备名称: {HOST.NAME}
当前状态: {TRIGGER.STATUS}
故障等级: {TRIGGER.SEVERITY}
恢复时间: {EVENT.RECOVERY.DATE} {EVENT.RECOVERY.TIME}
故障时长: {EVENT.DURATION}
监控项号: {ITEM.ID}
系统类别: {TRIGGER.HOSTGROUP.NAME}
告警描述: {TRIGGER.DESCRIPTION}