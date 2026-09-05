const DEFAULT_ALLOWED_ORIGINS = [
  'https://yewenxuan1025.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

const PROVIDER_ENV_KEYS = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  volcengine: 'VOLCENGINE_API_KEY',
};

const SYSTEM_PROMPT = `You are a rigorous trading performance analyst. Analyze only the supplied trading records and clearly distinguish evidence from inference.
Return the report in Chinese using concise Markdown. Cover: execution overview, realized performance, position sizing and concentration, timing and repeated behavior, option-specific observations, mistakes or process gaps, and a short actionable review checklist.
When market or news context is unavailable, say so instead of inventing facts. Never promise returns or give personalized buy/sell instructions. This is a retrospective process review, not investment advice.`;

const jsonResponse = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  },
});

const getAllowedOrigins = env => {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
};

const isAllowedOrigin = (origin, env) => !origin || getAllowedOrigins(env).includes(origin);

const safeEqual = (left, right) => {
  const leftValue = String(left || '');
  const rightValue = String(right || '');
  if (leftValue.length !== rightValue.length) return false;
  let difference = 0;
  for (let index = 0; index < leftValue.length; index += 1) {
    difference |= leftValue.charCodeAt(index) ^ rightValue.charCodeAt(index);
  }
  return difference === 0;
};

const getErrorMessage = async response => {
  const data = await response.json().catch(() => ({}));
  return data?.error?.message || data?.message || `Provider request failed (${response.status}).`;
};

const extractResponsesText = data => {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const texts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') texts.push(content.text);
    }
  }
  if (texts.length > 0) return texts.join('\n').trim();
  const choiceText = data?.choices?.[0]?.message?.content;
  return typeof choiceText === 'string' ? choiceText.trim() : '';
};

const collectSources = data => {
  const sources = [];
  const seen = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.url === 'string' && /^https?:\/\//i.test(value.url) && !seen.has(value.url)) {
      seen.add(value.url);
      sources.push({ title: typeof value.title === 'string' ? value.title : undefined, url: value.url });
    }
    if (Array.isArray(value)) value.forEach(visit);
    else Object.values(value).forEach(visit);
  };
  visit(data?.output);
  visit(data?.content);
  return sources.slice(0, 20);
};

const buildUserPrompt = body => {
  const contextNotes = [
    body.includeMarketContext
      ? 'The payload includes uploaded market/valuation context. Treat its as-of date explicitly and, when web search is available, check relevant market conditions around the execution dates.'
      : 'Do not use market valuation context beyond the execution records.',
    body.includeNews
      ? 'Use provider web search when available. Relate dated news only to trades in the selected period and cite sources.'
      : 'Do not introduce external news.',
  ];
  if (body.analysisFocus) contextNotes.push(`User-requested focus: ${String(body.analysisFocus).slice(0, 1000)}`);
  return `${contextNotes.join('\n')}\n\nTrading dataset:\n${JSON.stringify(body.payload)}`;
};

const callOpenAI = async (body, apiKey) => {
  const requestBody = {
    model: body.model,
    instructions: SYSTEM_PROMPT,
    input: buildUserPrompt(body),
    max_output_tokens: 3200,
    store: false,
  };
  if (body.includeNews || body.includeMarketContext) {
    requestBody.tools = [{ type: 'web_search_preview', search_context_size: 'medium' }];
    requestBody.include = ['web_search_call.action.sources'];
  }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  const data = await response.json();
  return { report: extractResponsesText(data), sources: collectSources(data) };
};

const callAnthropic = async (body, apiKey) => {
  const requestBody = {
    model: body.model,
    max_tokens: 3200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(body) }],
  };
  if (body.includeNews || body.includeMarketContext) {
    requestBody.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  const data = await response.json();
  const report = (data.content || [])
    .filter(item => item?.type === 'text' && typeof item.text === 'string')
    .map(item => item.text)
    .join('\n')
    .trim();
  return { report, sources: collectSources(data) };
};

const callVolcanoEngine = async (body, apiKey) => {
  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: body.model,
      input: `${SYSTEM_PROMPT}\n\n${buildUserPrompt(body)}`,
      max_output_tokens: 3200,
    }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response));
  const data = await response.json();
  return {
    report: extractResponsesText(data),
    sources: collectSources(data),
    warning: body.includeNews || body.includeMarketContext
      ? 'This Volcano Engine gateway does not add a separate historical-market or news feed. The report can use uploaded market data, but external context depends on the selected model endpoint.'
      : undefined,
  };
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!isAllowedOrigin(origin, env)) return jsonResponse({ error: 'Origin is not allowed.' }, 403, origin);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin || 'null',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      });
    }
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, origin);

    try {
      const body = await request.json();
      if (!body || typeof body !== 'object') return jsonResponse({ error: 'Invalid JSON body.' }, 400, origin);
      if (!['openai', 'anthropic', 'volcengine'].includes(body.provider)) {
        return jsonResponse({ error: 'Unsupported AI provider.' }, 400, origin);
      }
      if (!body.model || typeof body.model !== 'string') return jsonResponse({ error: 'Model is required.' }, 400, origin);
      if (!body.payload || typeof body.payload !== 'object') return jsonResponse({ error: 'Trading analysis payload is required.' }, 400, origin);

      const requiredAccessToken = String(env.AI_ACCESS_TOKEN || '').trim();
      if (requiredAccessToken && !safeEqual(body.gatewayAccessToken, requiredAccessToken)) {
        return jsonResponse({ error: 'Invalid shared gateway access code.' }, 401, origin);
      }

      const sharedKeyName = PROVIDER_ENV_KEYS[body.provider];
      const apiKey = body.credentialMode === 'personal'
        ? String(body.apiKey || '').trim()
        : String(env[sharedKeyName] || '').trim();
      if (!apiKey) {
        const message = body.credentialMode === 'personal'
          ? 'A personal API key is required.'
          : `${sharedKeyName} is not configured on the AI gateway.`;
        return jsonResponse({ error: message }, 400, origin);
      }

      let result;
      if (body.provider === 'openai') result = await callOpenAI(body, apiKey);
      else if (body.provider === 'anthropic') result = await callAnthropic(body, apiKey);
      else result = await callVolcanoEngine(body, apiKey);

      if (!result.report) throw new Error('The selected provider returned an empty report.');
      return jsonResponse({
        report: result.report,
        sources: result.sources,
        warning: result.warning,
        provider: body.provider,
        model: body.model,
      }, 200, origin);
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : 'AI gateway request failed.' }, 500, origin);
    }
  },
};
