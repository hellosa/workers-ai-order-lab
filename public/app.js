const $ = id => document.getElementById(id);
const exampleOrder = '客户张敏的订单 CN-88412 于2026年10月9日送达。商品价格649元，运费20元，优惠50元。今天是2026年10月20日。客户反馈屏幕破裂、边角凹陷，希望退款。没有提供物流单号，也没有维修报价或产品能否正常使用的信息。';
const examplePolicy = '送达后30天内可以退款。仅在已确认维修费低于实付金额的60%，且损坏不影响正常使用时优先维修。30天内客户申请退款、又无证据满足优先维修条件时，选择退款。其他关键信息不足或政策未覆盖的情况，交人工审核。';
function example() { $('order').value = exampleOrder; $('policy').value = examplePolicy; }
example();
$('example').addEventListener('click', example);
const names = { refund: '退款', repair: '维修', manual_review: '人工审核', customer: '客户', order_id: '订单编号', delivered_on: '送达日期', total_paid: '实付金额 / CNY', days_since_delivery: '送达至今 / 天', damage: '损坏情况', tracking_number: '物流单号', repair_cost: '维修报价 / CNY', functionality: '使用情况' };
const percent = value => Number.isFinite(value) ? (value * 100).toFixed(2) + '%' : '—';
$('form').addEventListener('submit', async event => {
  event.preventDefault();
  $('run').disabled = true;
  $('run').textContent = '正在提取并决策…';
  $('status').textContent = '正在调用 Clairic → Clef，请稍候。';
  $('badge').textContent = '运行中';
  $('output').hidden = true;
  $('empty').hidden = false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('/api/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + $('password').value },
      body: JSON.stringify({ order: $('order').value, policy: $('policy').value }), signal: controller.signal
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '请求失败');
    const resolution = result.decision.answers.resolution;
    $('choice').textContent = names[resolution.choice] || resolution.choice;
    $('confidence').textContent = '模型 confidence：' + percent(resolution.confidence);
    $('probabilities').replaceChildren();
    for (const [key, probability] of Object.entries(resolution.probabilities)) {
      const row = document.createElement('div'); row.className = 'probability';
      const label = document.createElement('span'); label.textContent = names[key] || key;
      const meter = document.createElement('meter'); meter.min = 0; meter.max = 1; meter.value = probability; meter.setAttribute('aria-label', label.textContent);
      const value = document.createElement('strong'); value.textContent = percent(probability);
      row.append(label, meter, value); $('probabilities').append(row);
    }
    $('facts').replaceChildren();
    for (const [key, answer] of Object.entries(result.extraction.answers)) {
      const row = document.createElement('tr');
      const value = answer.value === null ? '未知 / 未提供' : Array.isArray(answer.value) ? answer.value.join('、') : String(answer.value);
      for (const text of [names[key] || key, value, percent(answer.confidence)]) {
        const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
      }
      $('facts').append(row);
    }
    const tokens = data => data.usage?.input_tokens ?? '未返回';
    $('usage').textContent = `服务端耗时 ${(result.timing.total_ms / 1000).toFixed(2)}s（提取 ${result.timing.extraction_ms}ms / 决策 ${result.timing.decision_ms}ms） · 输入 token：Clairic ${tokens(result.extraction)} / Clef ${tokens(result.decision)}。用量不代表已确认的账单扣费。`;
    $('raw').textContent = JSON.stringify(result, null, 2);
    $('empty').hidden = true; $('output').hidden = false;
    $('badge').textContent = '已完成'; $('status').textContent = '测试完成。可修改消息或规则后再次运行。';
  } catch (error) {
    $('badge').textContent = '未完成';
    $('status').textContent = error.name === 'AbortError' ? '等待超时。服务端调用可能仍在进行，请勿立即重复提交。' : error.message;
  } finally {
    clearTimeout(timeout); $('run').disabled = false; $('run').textContent = '运行提取与决策 →';
  }
});
