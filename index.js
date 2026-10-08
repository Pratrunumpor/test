const express = require('express');
const app = express();
app.use(express.json());

let latestCommand = "OFF";

// ตั้งค่า Channel Access Token ของ LINE Bot และ WeatherAPI Key ของคุณ
const CHANNEL_ACCESS_TOKEN = "EEaMRFWfkwXaZVIa4DSiIVj+B3FMoAjgJBXa7YP+QQPbSDuKBkVVd4ScIczJcal1sQq1OsOyFlR8VmcWA4GLHCmM8xhkbcvcFXljzpzBOAqbYcVdM9jIJ0x4lHvojlUTvlRDb05JjG5l3Inl1GZ+ewdB04t89/1O/w1cDnyilFU=";
const WEATHER_API_KEY = "151f50fc23134b6fa2c170835260710"; // ใส่ API Key ของ WeatherAPI ที่นี่

// ฟังก์ชันสร้างวันที่และปี พ.ศ. แบบไทย (แม่นยำและไม่พึ่งพา Locale ของระบบ)
function getThaiDateString() {
  try {
    const now = new Date();
    // ปรับเวลาให้เป็นโซนเวลาประเทศไทย (UTC+7)
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

// ฟังก์ชันช่วยแปลงเวลาจาก AM/PM เป็นรูปแบบ 24 ชั่วโมง
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

// ชุดข้อความคู่มือการใช้งาน (สำหรับต่อท้ายข้อความเสมอ)
function getGuideFooter() {
  return `\n-----------------------------------\n` +
         `📖 คู่มือคำสั่งการใช้งาน:\n` +
         `• เปิด1-4 / ปิด1-4 / กระพริบ1-4\n` +
         `• เปิดทั้งหมด / ปิดทั้งหมด\n` +
         `• กระพริบทั้งหมด / หยุดกระพริบ\n` +
         `• สภาพอากาศ (เขาค้อ)\n` +
         `• อากาศวาริน / วารินชำราบ (อุบลฯ)\n` +
         `• check เพื่อตรวจสอบสถานะอุปกรณ์`;
}

// ฟังก์ชันดึงสภาพอากาศ (รองรับระบุพิกัดและชื่อสถานที่)
async function getWeatherInfo(lat, lon, locationName) {
  try {
    const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${lat},${lon}&days=1&aqi=yes`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error("WeatherAPI Error:", data.error.message);
      return `⚠️ ข้อผิดพลาด: ${data.error.message}`;
    }

    const thaiDateStr = getThaiDateString();

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

    let report = `📅 ${thaiDateStr}\n`;
    report += `-----------------------------------\n`;
    report += `🌤 สภาพอากาศ (${locationName}):\n`;
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
    return `⚠️ Error: ${error.message}`;
  }
}

async function replyLineMessage(replyToken, textMessage) {
  try {
    const finalMessage = textMessage + getGuideFooter();

    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
