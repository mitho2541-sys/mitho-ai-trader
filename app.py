
import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

API_KEY = os.getenv("TWELVE_DATA_API_KEY")

TIMEFRAMES = {
    "1 Minute": "1min",
    "5 Minutes": "5min",
    "15 Minutes": "15min"
}

PAIRS = [
    "EUR/USD", "GBP/USD", "USD/JPY",
    "GBP/JPY", "EUR/JPY", "XAU/USD"
]


def ema(values, period):
    multiplier = 2 / (period + 1)
    result = values[0]
    for price in values[1:]:
        result = (price * multiplier) + (result * (1 - multiplier))
    return result


def calculate_rsi(values, period=14):
    changes = [values[i] - values[i - 1]
               for i in range(1, len(values))]
    gains = [max(change, 0) for change in changes[-period:]]
    losses = [max(-change, 0) for change in changes[-period:]]

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    if avg_loss == 0:
        return 100 if avg_gain > 0 else 50

    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


@app.route("/")
def home():
    return jsonify({
        "service": "MITHO AI TRADER",
        "status": "Backend is running"
    })


@app.route("/analyze")
def analyze():
    pair = request.args.get("pair", "EUR/USD")
    timeframe = request.args.get("timeframe", "1 Minute")

    if pair not in PAIRS or timeframe not in TIMEFRAMES:
        return jsonify({"error": "Invalid pair or timeframe"}), 400

    if not API_KEY:
        return jsonify({"error": "Market API key is not configured"}), 500

    try:
        response = requests.get(
            "https://api.twelvedata.com/time_series",
            params={
                "symbol": pair,
                "interval": TIMEFRAMES[timeframe],
                "outputsize": 100,
                "apikey": API_KEY
            },
            timeout=20
        )
        data = response.json()

        if "values" not in data:
            return jsonify({
                "error": data.get("message", "Market data unavailable")
            }), 502

        candles = list(reversed(data["values"]))
        closes = [float(candle["close"]) for candle in candles]

        if len(closes) < 30:
            return jsonify({"error": "Not enough market candles"}), 502

        last_price = closes[-1]
        ema9 = ema(closes[-30:], 9)
        ema21 = ema(closes[-30:], 21)
        rsi = calculate_rsi(closes)

        signal = "WAIT"
        reason = "Indicators do not show a clear direction."

        if last_price > ema9 > ema21 and 50 < rsi < 70:
            signal = "BUY"
            reason = "Price is above both EMAs and RSI shows upward momentum."
        elif last_price < ema9 < ema21 and 30 < rsi < 50:
            signal = "SELL"
            reason = "Price is below both EMAs and RSI shows downward momentum."

        return jsonify({
            "pair": pair,
            "timeframe": timeframe,
            "signal": signal,
            "price": last_price,
            "rsi": round(rsi, 2),
            "ema9": round(ema9, 6),
            "ema21": round(ema21, 6),
            "candle_time": candles[-1]["datetime"],
            "reason": reason,
            "note": "Technical analysis only. No guaranteed results."
        })

    except requests.RequestException:
        return jsonify({"error": "Could not connect to market data provider"}), 502
    except (ValueError, KeyError, TypeError):
        return jsonify({"error": "Could not process market data"}), 502


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 10000)))
