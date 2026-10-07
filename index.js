const express = require('express');
const app = express();
app.use(express.json());

let latestCommand = "OFF";

const CHANNEL_ACCESS_TOKEN = "EEaMRFWfkwXaZVIa4DSiIVj+B3FMoAjgJBXa7YP+QQPbSDuKBkVVd4ScIczJcal1sQq1OsOyFlR8VmcWA4GLHCmM8xhkbcvcFXljzpzBOAqbYcVdM9jIJ0x4lHvojlUTvlRDb05JjG5l3Inl1GZ+ewdB04t89/1O/w1cDnyilFU=";
const WEATHER_API_KEY = "151f50fc23134b6fa2c170835260710";

function convertTo24Hour(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return timeStr;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return timeStr;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const modifier = match[3].toUpperCase();
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

async function getWeatherInfo() {
  try {
    const lat = "16.419";
    const lon = "101.1606";
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${lat},${lon}&days=1&aqi=yes`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      return `⚠️ ข้อผิดพลาด: ${data.error.message}`;
    }

    const now = new Date();
    const thaiDateStr = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      calendar: 'buddhist'
    }).format(now);

    const current = data.current;
    const astro = data.forecast.forecastday[0].astro;
    const day = data.forecast.forecastday[0].day;

    const temp = current.temp_c;
    const feelsLike = current.feelslike_c;
    const humidity = current.humidity;
    const condition = current.condition.text;
    const rain = current.precip_mm;
    const cloud = current.cloud;
    const windSpeed = current.wind_kph;
    const windDir = current.wind_dir;
    const dewPoint = current.dewpoint_c;
    const visibility = current.vis_km;
    const uvIndex = current.uv;
    const pm25 = current.air_quality?.pm2_5 ? current.air_quality.pm2_5.toFixed(1) : 'N/A';
    const aqi = current.air_quality?.['us-epa-index'] ?? 'N/A';

    const cloudBaseMeters = (dewPoint !== undefined && temp !== undefined) 
      ? Math.round((temp - dewPoint) * 125) : 'N/A';

    const condLower = condition.toLowerCase();
    let thunderstormStatus = "ปกติ";
    if (condLower.includes('thunder') || condLower.includes('storm')) {
      thunderstormStatus = "⚠️ มีโอกาสเกิดพายุฝนฟ้าคะนอง";
    } else if (day.daily_chance_of_rain > 70 && cloud > 80) {
      thunderstormStatus = "ค่อนข้างสูง (เฝ้าระวังฝนฟ้าคะนอง)";
    }

    const sunrise = convertTo24Hour(astro.sunrise);
    const sunset = convertTo24Hour(astro.sunset);
    const moonrise = convertTo24Hour(astro.moonrise);
    const moonset = convertTo24Hour(astro.moonset);
    const moonPhase = astro.moon_phase;
    const moonIllumination = astro.moon_illumination;
    const precipChance = day.daily_chance_of_rain;

    let fogPercent = Math.min(Math.round(((humidity - 50) / 50) * 100), 100);
    if (fogPercent < 0) fogPercent = 0;
    if (cloud > 80 && humidity > 85) fogPercent = Math.min(fogPercent + 20, 99);

    let report = `📅 ${thaiDateStr}\n`;
    report += `-----------------------------------\n`;
    report += `🌤 สภาพอากาศ (เขาค้อ-ภูทับเบิก จ.เพชรบูรณ์):\n`;
    report += `🌡 อุณหภูมิ: ${temp} °C (รู้สึกจริง ${feelsLike} °C)\n`;
    report += `💬 สภาพอากาศ: ${condition}\n`;
    report += `💧 ความชื้น: ${humidity} % | จุดน้ำค้าง: ${dewPoint} °C\n`;
    report += `🌧 ปริมาณฝน: ${rain} มม. (โอกาสฝนตก: ${precipChance}%)\n`;
    report += `⚡ พายุฝนฟ้าคะนอง: ${thunderstormStatus}\n`;
    report += `☁️ เมฆปกคลุม: ${cloud} % | ฐานเมฆ: ${cloudBaseMeters} ม.\n`;
    report += `💨 ลม: ${windSpeed} กม./ชม. (ทิศทาง: ${windDir})\n`;
    report += `👀 ระยะมองเห็น: ${visibility} กม. | UV Index: ${uvIndex}\n`;
    report += `😷 PM2.5: ${pm25} µg/m³ (AQI: ${aqi})\n`;
    report += `🌫 โอกาสเกิดหมอก: ${fogPercent} %\n`;
    report += `\n🌙 ข้อมูลดาราศาสตร์:\n`;
    report += `☀️ พระอาทิตย์ขึ้น: ${sunrise} น. | ตก: ${sunset} น.\n`;
    report += `🌙 พระจันทร์ขึ้น: ${moonrise} น. | ตก: ${moonset} น.\n`;
    report += `🌕 ข้างขึ้นข้างแรม: ${moonPhase}\n`;
    report += `✨ ความสว่างดวงจันทร์: ${moonIllumination} %`;

    return report;
  } catch (error) {
    console.error("Fetch Error:", error);
    return "⚠️ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์สภาพอากาศได้ในขณะนี้";
  }
}

async function replyLineMessage(replyToken, textMessage) {
  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: [{ type: 'text', text: textMessage }]
      })
    });
  } catch (error) {
    console.error("Error replying to LINE:", error);
  }
}

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (events && events.length > 0) {
    const event = events[0];
    const userMessage = event.message.text.trim();
    const replyToken = event.replyToken;

    if (userMessage === "check" || userMessage === "เช็ค") {
      latestCommand = "check";
      await replyLineMessage(replyToken, "🔄 กำลังเรียกข้อมูลจาก NodeMCU...");
    } 
    else if (userMessage === "weather" || userMessage === "สภาพอากาศ" || userMessage === "เช็คสภาพอากาศ") {
      const weatherInfo = await getWeatherInfo();
      await replyLineMessage(replyToken, weatherInfo);
    }
  }
  res.sendStatus(200);
});

app.get('/command', (req, res) => {
  res.send(latestCommand);
  if (latestCommand === "check") {
    latestCommand = "OFF"; 
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
