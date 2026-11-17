
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MITHO AI TRADER</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#08111f;color:#fff;font-family:Arial,sans-serif;padding:20px}
.card{max-width:480px;margin:25px auto;background:#142238;padding:22px;border-radius:18px}
h1{text-align:center;color:#35d6a0;font-size:27px}
.sub{text-align:center;color:#aab8ca;margin-bottom:25px}
label{display:block;margin:15px 0 7px;color:#c8d5e5}
select,button{width:100%;padding:14px;border-radius:9px;border:0;font-size:16px}
select{background:#24364e;color:white}
button{background:#16b987;color:#061b16;font-weight:bold;margin-top:22px}
#result{margin-top:22px;padding:18px;background:#0b1728;border-radius:12px;display:none}
#signal{text-align:center;font-size:30px;font-weight:bold;margin:8px}
.data{margin:10px 0;color:#d5e1ef}
.note{font-size:12px;color:#9aabc0;line-height:1.5;margin-top:20px}
</style>
</head>
<body>
<div class="card">
<h1>MITHO AI TRADER</h1>
<div class="sub">Technical Trading Signal Dashboard</div>

<label>Currency Pair</label>
<select id="pair">
<option>EUR/USD</option>
<option>GBP/USD</option>
<option>USD/JPY</option>
<option>GBP/JPY</option>
<option>EUR/JPY</option>
<option>XAU/USD</option>
</select>

<label>Timeframe</label>
<select id="timeframe">
<option value="1min">1 Minute</option>
<option value="5min">5 Minutes</option>
<option value="15min">15 Minutes</option>
</select>

<button id="analyze" onclick="analyze()">ANALYZE MARKET</button>

<div id="result">
<div id="signal">WAIT</div>
<div class="data" id="price"></div>
<div class="data" id="rsi"></div>
<div class="data" id="candle"></div>
<div class="data" id="reason"></div>
</div>

<div class="note">
Signals are based on technical indicators (EMA 9, EMA 21 and RSI 14). They are not guaranteed predictions. Always verify market conditions and manage your risk.
</div>
</div>

<script>
async function analyze(){
 const btn=document.getElementById("analyze");
 const result=document.getElementById("result");
 const signal=document.getElementById("signal");
 btn.disabled=true;
 btn.textContent="ANALYZING...";
 result.style.display="block";
 signal.textContent="Loading...";
 try{
  const pair=document.getElementById("pair").value;
  const timeframe=document.getElementById("timeframe").value;
  const response=await fetch("/analyze?pair="+encodeURIComponent(pair)+"&timeframe="+encodeURIComponent(timeframe));
  const data=await response.json();
  if(!response.ok) throw new Error(data.error||"Market data unavailable");
  signal.textContent=data.signal;
  signal.style.color=data.signal==="BUY"?"#35d6a0":data.signal==="SELL"?"#ff647c":"#ffd166";
  document.getElementById("price").textContent="Price: "+data.price;
  document.getElementById("rsi").textContent="RSI: "+data.rsi;
  document.getElementById("candle").textContent="Candle time: "+data.candle_time;
  document.getElementById("reason").textContent="Analysis: "+data.reason;
 }catch(error){
  signal.textContent="ERROR";
  signal.style.color="#ff647c";
  document.getElementById("reason").textContent=error.message;
  document.getElementById("price").textContent="";
  document.getElementById("rsi").textContent="";
  document.getElementById("candle").textContent="";
 }finally{
  btn.disabled=false;
  btn.textContent="ANALYZE MARKET";
 }
}
</script>
</body>
</html>`;
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ service: "MITHO AI TRADER", status: "Backend ready" });
    }

    if (url.pathname === "/analyze") {
      const pair = url.searchParams.get("pair") || "EUR/USD";
      const timeframe = url.searchParams.get("timeframe") || "1min";

      const allowedPairs = ["EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY", "EUR/JPY", "XAU/USD"];
      const allowedTimeframes = ["1min", "5min", "15min"];

      if (!allowedPairs.includes(pair) || !allowedTimeframes.includes(timeframe)) {
        return Response.json({ error: "Invalid pair or timeframe" }, { status: 400 });
      }

      if (!env.TWELVE_DATA_API_KEY) {
        return Response.json({ error: "API key missing in Worker settings" }, { status: 500 });
      }

      try {
        const api = new URL("https://api.twelvedata.com/time_series");
        api.searchParams.set("symbol", pair);
        api.searchParams.set("interval", timeframe);
        api.searchParams.set("outputsize", "100");
        api.searchParams.set("apikey", env.TWELVE_DATA_API_KEY);

        const response = await fetch(api);
        const data = await response.json();

        if (!data.values || data.values.length < 30) {
          return Response.json({
            error: data.message || "Market data unavailable"
          }, { status: 502 });
        }

        const candles = data.values.slice().reverse();
        const prices = candles.map(c => Number(c.close));

        const ema = (values, period) => {
          const k = 2 / (period + 1);
          let result = values[0];
          for (const price of values.slice(1)) {
            result = price * k + result * (1 - k);
          }
          return result;
        };

        const changes = prices.slice(1).map((v, i) => v - prices[i]);
        const recent = changes.slice(-14);
        const gains = recent.reduce((s, v) => s + Math.max(v, 0), 0) / 14;
        const losses = recent.reduce((s, v) => s + Math.max(-v, 0), 0) / 14;
        const rsi = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);

        const ema9 = ema(prices.slice(-30), 9);
        const ema21 = ema(prices.slice(-30), 21);
        const last = prices[prices.length - 1];

        let signal = "WAIT";
        if (last > ema9 && ema9 > ema21 && rsi > 50 && rsi < 70) signal = "BUY";
        if (last < ema9 && ema9 < ema21 && rsi < 50 && rsi > 30) signal = "SELL";

        return Response.json({
          pair,
          timeframe,
          signal,
          price: last,
          rsi: Number(rsi.toFixed(2)),
          candle_time: candles[candles.length - 1].datetime,
          reason: "EMA 9, EMA 21 and RSI technical analysis. No guaranteed results."
        });
      } catch {
        return Response.json({ error: "Market data request failed" }, { status: 502 });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  }
};
