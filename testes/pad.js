// const login = "gustavo.felix@cbc.coc.com.br";
// const password = "Educar@2023";
// const moduloInicial = 73;
// const moduloFinal = 75;

// const exerciseTitle = await page.$eval('.qm-content-toolbar-title', e => {
//   e.getAttribute('title')

// });


/*
let text = 'FFVFV' // erradas: segunda e quinta F F V F V, certo seria F V V F F

const incorrects = [1, 4];

let chars = text.split('');

incorrects.forEach(e => {
  const char = chars[e];
  switch (char) {
    case 'V':
      chars[e] = 'F'
      break
    case 'F':
      chars[e] = 'V'
      break
  }
})

text = chars.join('');

console.log('Formatado:' + text);
*/
import * as puppeteer from "puppeteer";

(async () => {
  const browser = await puppeteer.launch({ headless: false, pipe: true })
  const page = await browser.newPage();

  await page.goto('http://localhost:5500/test.html')
  await page.waitForSelector('#blank1')

  let text = 'FFVFV'
  const incorrects = [];

  for (let i = 0; i < text.length; i++) {
    const selector = `#blank${i + 1}`;
    const state = await page.$eval(selector, e => {
      const style = e.getAttribute('style').toString()
      if (style.includes('#EF3A2A')) {
        return 'errada';
      }
    })

    if (state === 'errada') {
      incorrects.push(i)
    }
  }

  console.log(incorrects);
})();


const someAsyncTask = async () => {
  // Simulate a long-running task
  await new Promise((resolve) => {

    
  });
};

if (rl.input.isTTY) {
      rl.input.on('data', () => {
        clearTimeout(timeoutId); // Clear timeout on abort
      });
    }