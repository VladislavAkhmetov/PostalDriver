import { spawn } from 'node:child_process';

async function check() {
  try {
    const res = await fetch('http://localhost:3000/');
    console.log('HTTP 3000 Status:', res.status);
    const text = await res.text();
    console.log('Contains selskaya-pochta title:', text.includes('Сельская почта') || text.includes('html'));
  } catch(e) {
    console.log('Error reaching localhost:3000:', e.message);
  }
}
check();
