
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return Response.json({
        name: "MITHO AI TRADER",
        status: "Backend ready"
      });
    }

    if (url.pathname === "/analyze") {
      const pair = url.searchParams.get("pair") || "EUR/USD";
      const timeframe = url.searchParams.get("timeframe") || "1min";

      const allowed = ["EUR/USD", "GBP/USD", "USD/JPY", "GBP/JPY", "EUR/JPY", "XAU/USD"];
      if (!allowed.includes(pair)) {
        return Response.json({ error: "Invalid pair" }, { status: 400 });
      }

      if (!env.TWELVE_DATA_API_KEY) {
        return Response.json({ error: "API key missing" }, { status: 500 });
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
