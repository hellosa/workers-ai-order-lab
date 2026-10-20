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
  $('run').textContent = '正在提取并对比…';
  $('status').textContent = '正在调用 Clairic，再并行比较 Clef 与 Jev，请稍候。';
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
    $('comparison').replaceChildren();
    const successful = Object.values(result.decisions).filter(item => item.response);
    $('agreement').textContent = successful.length < 2 ? '部分或全部决策模型未完成，请查看各模型状态。' :
      successful[0].response.answers.resolution.choice === successful[1].response.answers.resolution.choice ? '本次两模型结论一致。单次耗时仅供观察，不代表稳定性能。' : '本次两模型结论不同，请结合规则人工核对。';
    for (const [key, item] of Object.entries(result.decisions)) {
      const card = document.createElement('section'); card.className = 'model-card';
      const heading = document.createElement('h3'); heading.textContent = key === 'clef' ? 'Clef' : 'Jev'; card.append(heading);
      const model = document.createElement('p'); model.className = 'model-id'; model.textContent = item.response?.model || (key === 'clef' ? '@cf/cloudflare/clef' : 'typesafe/jev'); card.append(model);
      if (item.error) {
        const error = document.createElement('p'); error.textContent = item.error; card.append(error);
      } else {
        const resolution = item.response.answers.resolution;
        const choice = document.createElement('p'); choice.className = 'model-choice'; choice.textContent = names[resolution.choice] || resolution.choice; card.append(choice);
        const confidence = document.createElement('p'); confidence.className = 'hint'; confidence.textContent = 'confidence：' + percent(resolution.confidence); card.append(confidence);
        for (const [option, probability] of Object.entries(resolution.probabilities)) {
          const row = document.createElement('div'); row.className = 'probability';
          const label = document.createElement('span'); label.textContent = names[option] || option;
          const meter = document.createElement('meter'); meter.min = 0; meter.max = 1; meter.value = probability; meter.setAttribute('aria-label', heading.textContent + ' ' + label.textContent);
          const value = document.createElement('strong'); value.textContent = percent(probability);
          row.append(label, meter, value); card.append(row);
        }
      }
      const metrics = document.createElement('p'); metrics.className = 'model-metrics';
      metrics.textContent = `${item.error ? '失败请求耗时' : '调用耗时'} ${item.elapsed_ms} ms · 输入 ${item.response?.usage?.input_tokens ?? '未返回'} / 输出 ${item.response?.usage?.output_tokens ?? '未返回'} token`;
      card.append(metrics); $('comparison').append(card);
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
    $('usage').textContent = `本次总耗时 ${(result.timing.total_ms / 1000).toFixed(2)}s。共享 Clairic 提取：${result.timing.extraction_ms}ms，输入 ${result.extraction.usage?.input_tokens ?? '未返回'} / 输出 ${result.extraction.usage?.output_tokens ?? '未返回'} token（仅调用一次）。决策并行运行，耗时不可直接相加；各模型分词方式可能不同，用量不代表账单扣费。`;
    $('raw').textContent = JSON.stringify(result, null, 2);
    $('empty').hidden = true; $('output').hidden = false;
    $('badge').textContent = successful.length === 2 ? '已完成' : '对比未完成'; $('status').textContent = successful.length === 2 ? '对比完成。可修改消息或规则后再次运行。' : '部分或全部模型调用失败；已保留可用结果。';
  } catch (error) {
    $('badge').textContent = '未完成';
    $('status').textContent = error.name === 'AbortError' ? '等待超时。服务端调用可能仍在进行，请勿立即重复提交。' : error.message;
  } finally {
    clearTimeout(timeout); $('run').disabled = false; $('run').textContent = '运行模型对比 →';
  }
});
