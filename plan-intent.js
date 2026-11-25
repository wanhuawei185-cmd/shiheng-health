(function (root) {
  function rejectsProteinFocus(text) {
    return /(?:不需要|不要|不想(?:要|吃)?|避免|少吃|无需|不用)(?:[^。；，,]{0,8})(?:高蛋白|蛋白质|蛋白)/.test(text);
  }

  function rejectsVegetarian(text) {
    return /(?:不是|并非|不算|不属于)(?:[^。；，,]{0,3})?素食|(?:不想|不要|不吃|不需要|无需)(?:吃)?素食?|(?:吃荤|荤食|荤菜|想吃肉)/.test(text);
  }

  function extractIntentLocally(text) {
    const minutesMatch = text.match(/(\d{1,3})\s*(?:分钟|min)/i);
    const budgetMatch = text.match(/(?:预算|不超过|以内|控制在|约)?\s*(\d{1,3})\s*(?:元|块)/);
    let scene = 'none';
    if (/便利店/.test(text)) scene = 'convenience';
    else if (/超市|自选/.test(text)) scene = 'market';
    else if (/食堂|校内/.test(text)) scene = 'campus';
    let trainingFocus = 'none';
    if (/跑步|跑走|跑步机/.test(text)) trainingFocus = 'running';
    else if (/练胸|胸肌|胸部/.test(text)) trainingFocus = 'chest';
    else if (/练背|背部|背肌|背阔/.test(text)) trainingFocus = 'back';
    else if (/练肩|肩部|三角肌/.test(text)) trainingFocus = 'shoulders';
    else if (/练臀|臀部|臀肌/.test(text)) trainingFocus = 'glutes';
    else if (/练腿|腿部|大腿|臀腿/.test(text)) trainingFocus = 'legs';
    else if (/健身房|器械训练/.test(text)) trainingFocus = 'gym';
    else if (/上肢|练手臂/.test(text)) trainingFocus = 'upper';
    else if (/核心|腹部/.test(text)) trainingFocus = 'core';
    else if (/有氧/.test(text)) trainingFocus = 'cardio';
    else if (/全身/.test(text)) trainingFocus = 'full';
    const proteinNegative = rejectsProteinFocus(text);
    const vegetarianNegative = rejectsVegetarian(text);
    const proteinPositive = /高蛋白|增加蛋白|补充蛋白|多吃蛋白|蛋白质优先|想要蛋白|想吃蛋白/.test(text);
    const vegetarianPositive = /素食|吃素|不吃肉|纯素/.test(text);
    return {
      duration_min: minutesMatch ? Number(minutesMatch[1]) : 0,
      budget_max: budgetMatch ? Number(budgetMatch[1]) : 0,
      scene,
      training_focus: trainingFocus,
      protein_focus: proteinPositive && !proteinNegative,
      vegetarian_only: vegetarianPositive && !vegetarianNegative,
      recovery: /累|疲劳|没状态|不舒服|疼痛|头晕|胸闷|受伤|生病/.test(text)
    };
  }

  function validateClientIntent(value = {}) {
    const numeric = (raw, low, high) => Number.isInteger(Number(raw)) && Number(raw) >= low && Number(raw) <= high ? Number(raw) : 0;
    const scenes = ['campus', 'convenience', 'market', 'none'];
    const focuses = ['full', 'lower', 'upper', 'chest', 'back', 'shoulders', 'legs', 'glutes', 'core', 'cardio', 'running', 'gym', 'recovery', 'none'];
    return {
      duration_min: numeric(value.duration_min, 8, 120),
      budget_max: numeric(value.budget_max, 8, 100),
      scene: scenes.includes(value.scene) ? value.scene : 'none',
      training_focus: focuses.includes(value.training_focus) ? value.training_focus : 'none',
      protein_focus: value.protein_focus === true,
      vegetarian_only: value.vegetarian_only === true,
      recovery: value.recovery === true
    };
  }

  function mergeIntents(local, model, originalText = '') {
    const checked = validateClientIntent(model);
    const proteinNegative = rejectsProteinFocus(originalText);
    const vegetarianNegative = rejectsVegetarian(originalText);
    return {
      duration_min: checked.duration_min || local.duration_min,
      budget_max: checked.budget_max || local.budget_max,
      scene: checked.scene !== 'none' ? checked.scene : local.scene,
      training_focus: checked.training_focus !== 'none' ? checked.training_focus : local.training_focus,
      protein_focus: !proteinNegative && (checked.protein_focus || local.protein_focus),
      vegetarian_only: !vegetarianNegative && (checked.vegetarian_only || local.vegetarian_only),
      recovery: checked.recovery || local.recovery
    };
  }

  async function parsePlanResponse(response) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      const message = response.status === 404
        ? '当前服务尚未加载计划助手接口，请重启本地服务。'
        : '计划服务返回了无法读取的响应。';
      throw new Error(message);
    }
    if (!response.ok || !payload || payload.tool !== 'apply_daily_plan') {
      throw new Error(typeof payload?.error === 'string' ? payload.error : '计划服务暂不可用。');
    }
    return {
      intent: validateClientIntent(payload.intent),
      mode: payload.mode === 'chat_json_compat' ? 'chat_json' : 'function_call',
      reply: typeof payload.reply === 'string' ? payload.reply.slice(0, 240) : '',
      provider: typeof payload.provider === 'string' ? payload.provider : ''
    };
  }

  const api = Object.freeze({ extractIntentLocally, validateClientIntent, mergeIntents, parsePlanResponse });
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ShiHengPlanIntent = api;
})(typeof window !== 'undefined' ? window : globalThis);
