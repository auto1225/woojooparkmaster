function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allowedOrigins = (Deno.env.get('PARKMASTER_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigin = allowedOrigins.length === 0
    ? origin || '*'
    : allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

const systemPrompts: Record<string, string> = {
  classify_complaint: `당신은 공영주차장 민원 분류 전문가입니다.
민원 내용을 분석하여 다음을 JSON으로 반환하세요:
{
  "category": "fee|facility|operation|enforcement_appeal|noise|safety|cleanliness|guidance|suggestion|other",
  "sub_category": "세부 분류",
  "priority": "low|normal|high|urgent",
  "assigned_team": "operations|facilities",
  "summary": "민원 요약 1문장",
  "keywords": ["키워드1", "키워드2"],
  "confidence": 0.0
}
confidence는 입력에서 직접 확인 가능한 근거의 충분성을 0~1로 평가하세요.
반드시 유효한 JSON만 반환하세요.`,

  draft_response: `당신은 공영주차장 민원 회신 담당 공무원입니다.
정중하고 공식적인 어조로 민원 회신을 작성하세요.
- 민원인의 불편에 공감 표현
- 조치 내용 또는 계획 설명
- 추가 문의 안내
200자 내외로 작성하고 다음 JSON으로 반환하세요:
{"result":"회신 초안", "confidence":0.0}
확인되지 않은 조치 완료나 사실을 만들어내지 마세요. 반드시 유효한 JSON만 반환하세요.`,

  summarize_report: `당신은 공영주차장 운영 분석 전문가입니다.
제공된 데이터를 분석하여 보고서 총평을 작성하세요.
- 주요 성과 3가지
- 개선 필요 사항 2가지
- 향후 제언 2가지
400자 내외의 간결한 보고서 형태로 작성하고 다음 JSON으로 반환하세요:
{"result":"총평", "confidence":0.0}
입력 요약에 없는 수치나 원인을 만들지 마세요. 반드시 유효한 JSON만 반환하세요.`,

  predict_demand: `당신은 주차 수요 분석 전문가입니다.
제공된 과거 이용 데이터를 분석하여 향후 예측을 JSON으로 반환하세요:
{
  "prediction": [{"hour": 0, "expected_occupancy": 30}, ...],
  "peak_hours": [9, 10, 14, 15],
  "low_hours": [2, 3, 4, 5],
  "trend": "increasing|stable|decreasing",
  "summary": "분석 요약"
}
반드시 유효한 JSON만 반환하세요.`,

  analyze_revenue: `당신은 공영주차장 수입 분석 전문가입니다.
제공된 수입 데이터를 분석하여 인사이트를 JSON으로 반환하세요:
{
  "trend": "increasing|stable|decreasing",
  "anomalies": [{"date": "...", "reason": "..."}],
  "recommendations": ["제언1", "제언2"],
  "summary": "분석 요약"
}
반드시 유효한 JSON만 반환하세요.`
};

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (Deno.env.get('AI_ENABLED') !== 'true') {
      return new Response(JSON.stringify({ error: 'AI integration is disabled' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawBody = await req.text();
    if (rawBody.length > 131072) {
      return new Response(JSON.stringify({ error: 'AI request is too large' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { task, input, context } = JSON.parse(rawBody);

    const gatewayValue = Deno.env.get('AI_GATEWAY_URL') || '';
    const model = Deno.env.get('AI_MODEL') || '';
    const allowedHosts = (Deno.env.get('AI_ALLOWED_HOSTS') || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    let gatewayUrl: URL;
    try {
      gatewayUrl = new URL(gatewayValue);
    } catch {
      return new Response(JSON.stringify({ error: 'AI gateway is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!allowedHosts.includes(gatewayUrl.hostname.toLowerCase()) || !model) {
      return new Response(JSON.stringify({ error: 'AI gateway is not approved' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = systemPrompts[task] || '당신은 공영주차장 관리 전문가입니다.';
    const userContent = context
      ? `맥락:\n${context}\n\n입력:\n${JSON.stringify(input, null, 2)}`
      : JSON.stringify(input, null, 2);

    const apiKey = Deno.env.get('AI_API_KEY') || '';
    const response = await fetch(gatewayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error(`AI Gateway error: ${response.status}`);
      return new Response(JSON.stringify({ error: 'AI 호출 실패' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await response.json();
    const resultText = aiData.choices?.[0]?.message?.content || '';

    // Try JSON parsing
    let parsed;
    try {
      const cleaned = resultText.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { result: resultText };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
