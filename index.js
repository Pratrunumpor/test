const express = require('express');
const app = express();
app.use(express.json());

let latestCommand = "OFF";

const CHANNEL_ACCESS_TOKEN = "EEaMRFWfkwXaZVIa4DSiIVj+B3FMoAjgJBXa7YP+QQPbSDuKBkVVd4ScIczJcal1sQq1OsOyFlR8VmcWA4GLHCmM8xhkbcvcFXljzpzBOAqbYcVdM9jIJ0x4lHvojlUTvlRDb05JjG5l3Inl1GZ+ewdB04t89/1O/w1cDnyilFU=";
const WEATHER_API_KEY = "151f50fc23134b6fa2c170835260710";

let savedUserId = null;
let lastAlertDate = { "เขาค้อ-ภูทับเบิก จ.เพชรบูรณ์": "", "อ.วารินชำราบ จ.อุบลราชธานี": "" };

function getThaiDateString() {
  try {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thTime = new Date(utc + (3600000 * 7));

    const thaiDays = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
    const thaiMonths = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    const dayName = thaiDays[thTime.getDay()];
    const dayNum = thTime.getDate();
    const monthName = thaiMonths[thTime.getMonth()];
    const thaiYear = thTime.getFullYear() + 543;

    return `${dayName}ที่ ${dayNum} ${monthName} พ.ศ. ${thaiYear}`;
  } catch (e) {
    return "รายงานสภาพอากาศประจำวัน";
  }
}

function convertTo24Hour(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return timeStr;
  
  if (timeStr.includes('-') && timeStr.includes(':')) {
    const parts = timeStr.split(' ');
    if (parts.length === 2) {
      return parts[1];
    }
  }

  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return timeStr;
  
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const modifier = match[3].toUpperCase();
  
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

function getUvAdvice(uv) {
  if (uv === undefined || uv === null || isNaN(uv)) return { level: "N/A", advice: "ไม่มีข้อมูล" };
  
  if (uv <= 2) {
    return { level: "ต่ำ (Low)", advice: "ปลอดภัย สามารถทำกิจกรรมกลางแจ้งได้ปกติ" };
  } else if (uv <= 5) {
    return { level: "ปานกลาง (Moderate)", advice: "ควรสวมแว่นกันแดดและทาครีมกันแดดหากอยู่กลางแจ้งนานๆ" };
  } else if (uv <= 7) {
    return { level: "สูง (High)", advice: "⚠️ ควรหลีกเลี่ยงแดดช่วงเวลา 10:00 - 16:00 น. ควรสวมหมวก ร่ม และครีมกันแดด SPF 30+" };
  } else if (uv <= 10) {
    return { level: "สูงมาก (Very High)", advice: "⚠️⚠️ อันตราย! ควรงดกิจกรรมกลางแจ้งช่วง 10:00 - 16:00 น. หากจำเป็นต้องออกแดดควรสวมเสื้อผ้าแขนยาวและป้องกันตัวอย่างเข้มงวด" };
  } else {
    return { level: "รุนแรงที่สุด (Extreme)", advice: "🚨🚨 อันตรายขั้นสุด! หลีกเลี่ยงการโดนแดดโดยเด็ดขาดในช่วงกลางวัน ผิวหนังอาจไหม้เกรียมได้ภายในไม่กี่นาที" };
  }
}

// เพิ่มข้อความอธิบายการแชร์โลเคชั่นต่อท้ายรายงาน
function getGuideFooter() {
  return `\n-----------------------------------\n` +
         `📍 แชร์โลเคชั่นเพื่อดูสภาพอากาศพื้นที่อื่นได้\n\n` +
         `📖 คู่มือคำสั่งการใช้งาน:\n` +
         `• เปิด1-4 / ปิด1-4 / กระพริบ1-4\n` +
         `• เปิดทั้งหมด / ปิดทั้งหมด\n` +
         `• กระพริบทั้งหมด / หยุดกระพริบ\n` +
         `• weather / สภาพอากาศ (รายงาน 2 พื้นที่หลัก)\n` +
         `• check เพื่อตรวจสอบสถานะอุปกรณ์`;
}

async function getWeatherInfo(lat, lon, locationName) {
  try {
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${lat},${lon}&days=1&aqi=yes`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      return { text: `⚠️ ข้อผิดพลาด (${locationName}): ${data.error.message}`, chanceOfRain: 0, condition: "" };
    }

    const thaiDateStr = getThaiDateString();
    const current = data.current;
    const forecastDay = data.forecast.forecastday[0];
    const astro = forecastDay.astro;
    const day = forecastDay.day;

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

    let maxTempTime = 'N/A';
    let minTempTime = 'N/A';
    if (forecastDay.hour && forecastDay.hour.length > 0) {
      let maxObj = forecastDay.hour[0];
      let minObj = forecastDay.hour[0];
      
      for (let h of forecastDay.hour) {
        if (h.temp_c > maxObj.temp_c) maxObj = h;
        if (h.temp_c < minObj.temp_c) minObj = h;
      }
      
      maxTempTime = convertTo24Hour(maxObj.time);
      minTempTime = convertTo24Hour(minObj.time);
    }

    const cloudBaseMeters = (dewPoint !== undefined && temp !== undefined) 
      ? Math.round((temp - dewPoint) * 125) 
      : 'N/A';

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
    if (cloud > 80 && humidity > 85) {
      fogPercent = Math.min(fogPercent + 20, 99);
    }

    const uvAnalysis = getUvAdvice(uvIndex);

    let report = `📅 ${thaiDateStr}\n`;
    report += `-----------------------------------\n`;
    report += `🌤 สภาพอากาศ (${locationName}):\n`;
    report += `🌡 อุณหภูมิปัจจุบัน: ${temp} °C (รู้สึกจริง ${feelsLike} °C)\n`;
    report += `📈 อุณหภูมิสูงสุด: ${day.maxtemp_c} °C (เวลา ${maxTempTime} น.)\n`;
    report += `📉 อุณหภูมิต่ำสุด: ${day.mintemp_c} °C (เวลา ${minTempTime} น.)\n`;
    report += `💬 สภาพอากาศ: ${condition}\n`;
    report += `💧 ความชื้น: ${humidity} % | จุดน้ำค้าง: ${dewPoint} °C\n`;
    report += `🌧 ปริมาณฝน: ${rain} มม. (โอกาสฝนตก: ${precipChance}%)\n`;
    report += `⚡ พายุฝนฟ้าคะนอง: ${thunderstormStatus}\n`;
    report += `☁️ เมฆปกคลุม: ${cloud} % | ฐานเมฆ: ${cloudBaseMeters} ม.\n`;
    report += `💨 ลม: ${windSpeed} กม./ชม. (ทิศทาง: ${windDir})\n`;
    report += `👀 ระยะมองเห็น: ${visibility} กม.\n`;
    report += `☀️ UV Index: ${uvIndex} [${uvAnalysis.level}]\n`;
    report += `💡 คำแนะนำแดด: ${uvAnalysis.advice}\n`;
    report += `😷 PM2.5: ${pm25} µg/m³ (AQI: ${aqi})\n`;
    report += `🌫 โอกาสเกิดหมอก: ${fogPercent} %\n`;
    report += `\n🌙 ข้อมูลดาราศาสตร์:\n`;
    report += `☀️ พระอาทิตย์ขึ้น: ${sunrise} น. | ตก: ${sunset} น.\n`;
    report += `🌙 พระจันทร์ขึ้น: ${moonrise} น. | ตก: ${moonset} น.\n`;
    report += `🌕 ข้างขึ้นข้างแรม: ${moonPhase}\n`;
    report += `✨ ความสว่างดวงจันทร์: ${moonIllumination} %`;

    return { text: report, chanceOfRain: precipChance, condition: condition };
  } catch (error) {
    console.error("Fetch Error:", error);
    return { text: `⚠️ Error (${locationName}): ${error.message}`, chanceOfRain: 0, condition: "" };
  }
}

async function sendPushMessage(userId, textMessage) {
  try {
    await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text: textMessage }]
      })
    });
  } catch (error) {
    console.error("Error pushing message to LINE:", error);
  }
}

async function replyLineMessages(replyToken, messagesArray) {
  try {
    if (messagesArray.length > 0) {
      messagesArray[messagesArray.length - 1] += getGuideFooter();
    }

    const formattedMessages = messagesArray.map(text => ({ type: 'text', text: text }));

    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: formattedMessages
      })
    });
  } catch (error) {
    console.error("Error replying to LINE:", error);
  }
}

// ตรวจสอบสภาพอากาศอัตโนมัติทุก 1 ชั่วโมง
setInterval(async () => {
  if (!savedUserId) return;

  const locations = [
    { lat: "16.419", lon: "101.1606", name: "เขาค้อ-ภูทับเบิก จ.เพชรบูรณ์" },
    { lat: "15.195", lon: "104.872", name: "อ.วารินชำราบ จ.อุบลราชธานี" }
  ];

  const todayStr = new Date().toDateString();

  for (let loc of locations) {
    const result = await getWeatherInfo(loc.lat, loc.lon, loc.name);
    const condLower = result.condition.toLowerCase();
    const isRainy = result.chanceOfRain > 60 || condLower.includes('rain') || condLower.includes('thunder') || condLower.includes('storm');

    if (isRainy && lastAlertDate[loc.name] !== todayStr) {
      lastAlertDate[loc.name] = todayStr;

      let alertMsg = `🚨 **แจ้งเตือนสภาพอากาศ (${loc.name})** 🚨\n`;
      alertMsg += `⚠️ ตรวจพบแนวโน้มฝนตก / พายุฝนฟ้าคะนอง!\n`;
      alertMsg += `🌧 โอกาสฝนตก: ${result.chanceOfRain}%\n`;
      alertMsg += `💬 ลักษณะอากาศ: ${result.condition}\n`;
      alertMsg += `💡 แนะนำ: ควรเก็บผ้าหรือเตรียมตัวรับมือฝนตกในเร็วๆ นี้ครับ`;

      await sendPushMessage(savedUserId, alertMsg);
    }
  }
}, 60 * 60 * 1000);

app.post('/webhook', async (req, res) => {
  const events = req.body.events;
  if (events && events.length > 0) {
    const event = events[0];
    
    if (event.source && event.source.userId) {
      savedUserId = event.source.userId;
    }

    const replyToken = event.replyToken;

    // 1. กรณีผู้ใช้แชร์ตำแหน่งที่ตั้ง (Location Pin) มาทาง LINE
    if (event.message && event.message.type === 'location') {
      const lat = event.message.latitude;
      const lon = event.message.longitude;
      const locationName = event.message.address || event.message.title || "ตำแหน่งที่คุณปักหมุด";

      console.log(`Receive Location from LINE -> Lat: ${lat}, Lon: ${lon}, Name: ${locationName}`);

      const weatherResult = await getWeatherInfo(lat, lon, locationName);
      await replyLineMessages(replyToken, [weatherResult.text]);
      return res.sendStatus(200);
    }

    // 2. กรณีผู้ใช้พิมพ์ข้อความปกติ
    const userMessage = event.message && event.message.text ? event.message.text.trim().normalize('NFC') : "";
    console.log("Receive from LINE: " + userMessage);

    if (userMessage === "check" || userMessage === "เช็ค") {
      latestCommand = "check";
      await replyLineMessages(replyToken, ["🔄 กำลังเรียกข้อมูลจาก NodeMCU..."]);
    } 
    else if (userMessage === "weather" || userMessage === "สภาพอากาศ" || userMessage === "เช็คสภาพอากาศ") {
      const khaoKho = await getWeatherInfo("16.419", "101.1606", "เขาค้อ-ภูทับเบิก จ.เพชรบูรณ์");
      const varin = await getWeatherInfo("15.195", "104.872", "อ.วารินชำราบ จ.อุบลราชธานี");

      await replyLineMessages(replyToken, [khaoKho.text, varin.text]);
    }
    else if (
      userMessage === "เปิด1" || userMessage === "ปิด1" || userMessage === "กระพริบ1" ||
      userMessage === "เปิด2" || userMessage === "ปิด2" || userMessage === "กระพริบ2" ||
      userMessage === "เปิด3" || userMessage === "ปิด3" || userMessage === "กระพริบ3" ||
      userMessage === "เปิด4" || userMessage === "ปิด4" || userMessage === "กระพริบ4" ||
      userMessage === "เปิดทั้งหมด" || userMessage === "ปิดทั้งหมด" || 
      userMessage === "กระพริบทั้งหมด" || userMessage === "หยุดกระพริบ"
    ) {
      latestCommand = userMessage;
      let statusReport = `⚙️ ส่งคำสั่ง [${userMessage}] ไปยังอุปกรณ์แล้ว`;
      await replyLineMessages(replyToken, [statusReport]);
    }
    else {
      await replyLineMessages(replyToken, [`❓ ไม่พบคำสั่ง [${userMessage}] ในระบบ`]);
    }
  }
  res.sendStatus(200);
});

app.get('/command', (req, res) => {
  res.send(latestCommand);
  if (latestCommand === "check" || latestCommand.startsWith("เปิด") || latestCommand.startsWith("ปิด") || latestCommand.startsWith("กระพริบ") || latestCommand === "หยุดกระพริบ") {
    latestCommand = "OFF"; 
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
