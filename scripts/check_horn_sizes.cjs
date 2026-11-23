const fs = require('fs');

const horns = [
  'long_car_signal_beep.mp3',
  'car_signal_beep.mp3',
  '239031_3146873-lq.mp3',
  '239030_3146873-lq.mp3',
  'vintage_horn_beep.mp3',
  '125520_2273305-lq.mp3',
  'bus_horn_2.mp3',
  'truck_horn_single.mp3'
];

horns.forEach(h => {
  const p = `public/sound-samples/${h}`;
  if (fs.existsSync(p)) {
    console.log(h, fs.statSync(p).size, 'bytes');
  }
});
