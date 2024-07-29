import * as puppeteer from "puppeteer";
import * as inquirer from "@inquirer/prompts";
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import * as fs from "fs";
import * as path from "path";
import * as url from "url"
import chalk from "chalk";


// Variáveis do app

const siteUrl = "https://passaporte.coc.com.br/giul/api/oauth2/authorize?client_id=eduqo&response_type=code&access_token=1a7e737b-508d-4a52-9924-d94d60ad3c70";
const login = 'gustavo.felix@cbc.coc.com.br'
const password = 'Educar@2023'
const regex = /\d+/g;
let numeroDeAtividades;
let exerciseAtual;
let questaoAtual;
let moduloAtual;
let materia;

// Terminal prompts 

// const login = await inquirer.input({
//   message: 'Insira seu email de login:'
// });

// const password = await inquirer.input({
//   message: 'Agora, insira sua senha:'
// });

const fgbOrIt = await inquirer.select({
  message: 'Escolha um tipo:',
  choices: [
    { name: 'FGB', value: 'FGB' },
    { name: 'Itinerário', value: 'IF'}
  ]
})

if (fgbOrIt == 'FGB') {

  materia = await inquirer.select({
    message: 'Qual matéria você deseja? (Use as setas do teclado)',
    choices: [
      new inquirer.Separator(chalk.bgBlue('-- Exatas --')),
      { name: 'FGB Matemática 11B', value: '11B' },
      { name: 'FGB Matemática 12B', value: '12B' },
      { name: 'FGB Física', value: '21B'},
      { name: 'FGB Química', value: '22B'},
      { name: 'FGB Biologia', value: '23B'},
      new inquirer.Separator(chalk.bgBlue('-- Linguagens --')),
      { name: 'FGB Gramática', value: '31B' },
      { name: 'FGB Literatura', value: '32B'},
      { name: 'FGB Prática Textual', value: '33B'},
      { name: 'FGB Inglês', value: '34B', disabled: '(com problema no momento...)'},
      new inquirer.Separator(chalk.bgBlue('-- Humanas --')),
      { name: 'FGB História', value: '41B'},
      { name: 'FGB Geografia', value: '42B'},
      { name: 'FGB Filosofia', value: '43B'},
      { name: 'FGB Sociologia', value: '44B'},
      { name: 'FGB Estudos da Contemporaneidade', value: '45B'},
      { name: 'FGB Arte', value: '35B'},
      { name: 'FGB Ed. Física', value: '36B'},
    ],
    pageSize: 20
  });

} else {

  materia = await inquirer.select({
    message: 'Qual matéria você deseja? (Use as setas do teclado)',
    choices: [
      new inquirer.Separator(chalk.bgBlue('-- Exatas --')),
      { name: 'IF Matemática 11I', value: '11I' },
      { name: 'IF Matemática 12I', value: '12I' },
      { name: 'IF Física', value: '21I'},
      { name: 'IF Química', value: '22I'},
      { name: 'IF Biologia', value: '23I'},
      new inquirer.Separator(chalk.bgBlue('-- Linguagens --')),
      { name: 'IF Gramática', value: '31I' },
      { name: 'IF Literatura', value: '32I'},
      { name: 'IF Prática Textual', value: '33I'},
      { name: 'IF Inglês', value: '34I', disabled: '(com problema no momento...)'},
      new inquirer.Separator(chalk.bgBlue('-- Humanas --')),
      { name: 'IF História', value: '41I'},
      { name: 'IF Geografia', value: '42I'},
      { name: 'IF Filosofia', value: '43I'},
      { name: 'IF Sociologia', value: '44I'},
      { name: 'IF Estudos da Contemporaneidade', value: '45I'},
      { name: 'IF Arte', value: '35I'},
      { name: 'IF Ed. Física', value: '36I'},
    ],
    pageSize: 20
  });

}

const moduloInicial = await inquirer.number({
  message: 'Em qual módulo deseja iniciar? (apenas números)'
});
const moduloFinal = await inquirer.number({
  message: 'Até qual?'
});

console.clear();

// Reports

const finalReport = {
  incorrectCount: 0,
  incorrectQuestions: []
};
const notasFinais = {};

// Configuração da API

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
];
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro", safetySettings });
const generationConfig = { temperature: 0, maxOutputTokens: 8192, responseMimeType: "text/plain" };
const chatSession = model.startChat({ generationConfig });
const fileManager = new GoogleAIFileManager(process.env.API_KEY);

// Funções
async function asleep(t) {
  return new Promise(resolve => setTimeout(resolve, t * 1000))
};

async function navegarEResponderModulos(page) {
  const modulosCards = await page.$$('.qm-qplano__subsection');

  for (moduloAtual = moduloInicial; moduloAtual <= moduloFinal; moduloAtual++) {
    console.log(`Entrando no módulo: ${moduloAtual}\n`);

    // Entra no módulo atual
    await entrarNoModulo(moduloAtual.toString(), modulosCards, page);
    notasFinais[moduloAtual] = []
    await responderExers(page)

    await asleep(5);

    // Volta para a página anterior (página de módulos)
    await page.goBack();
  }

  console.log('Todos os módulos foram processados.\n');
};

async function entrarNoModulo(modulo, modulosCards, page) {
  for (const moduloCard of modulosCards) {
    let moduloId = await (await moduloCard.getProperty('id')).jsonValue();

    // Remove tudo antes dos dois travessões
    const partes = moduloId.split('--');
    if (partes.length > 1) {
      moduloId = partes[1];

      const numerosEncontrados = moduloId.match(regex);

      if (numerosEncontrados) {
        const numeroModulo = numerosEncontrados.join('');

        if (numeroModulo.includes(modulo)) {
          let proximoElemento = (await page.evaluateHandle(el => el.nextElementSibling, moduloCard)).asElement();
          numeroDeAtividades = 0;
          // Contar atividades até encontrar "Para" ou "Módulo"
          while (proximoElemento) {
            const proximoElementoTitle = await page.evaluate(el => {
              const link = el.querySelector('div > div > div > a');
              return link ? link.getAttribute('title') : null;
            }, proximoElemento);

            if (proximoElementoTitle && (proximoElementoTitle.startsWith('Para') || proximoElementoTitle.startsWith('Módulo'))) {
              break;
            }

            if (proximoElementoTitle && proximoElementoTitle.startsWith('Exer')) {
              numeroDeAtividades++;
            }

            const nextHandle = await page.evaluateHandle(el => el.nextElementSibling, proximoElemento);
            await proximoElemento.dispose(); // Dispose the current handle to avoid memory leaks
            proximoElemento = nextHandle.asElement();
          }

          // Continuar com o loop para encontrar e clicar no exercício correto
          proximoElemento = (await page.evaluateHandle(el => el.nextElementSibling, moduloCard)).asElement()
          while (proximoElemento) {
            const proximoElementoTitle = await page.evaluate(el => {
              const link = el.querySelector('div > div > div > a');
              return link ? link.getAttribute('title') : null;
            }, proximoElemento);

            if (proximoElementoTitle.startsWith('Exer')) {
              break;
            }

            const nextHandle = await page.evaluateHandle(el => el.nextElementSibling, proximoElemento);
            await proximoElemento.dispose();  // Dispose the current handle to avoid memory leaks
            proximoElemento = nextHandle.asElement();
          }

          if (proximoElemento) {
            const moduloLinkHandle = await proximoElemento.$('div > div > div > a');

            // clica no exercicio para entrar
            if (moduloLinkHandle) {
              await page.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }), moduloLinkHandle);
              await page.waitForSelector('div > div > div > a', { visible: true });
              try {
                await moduloLinkHandle.evaluate(el => el.click());
                return;
              } catch (error) {
                console.error('Erro ao clicar no link <a>', error);
              }
            }

            await proximoElemento.dispose();
          } else {
            console.log('Nenhum elemento encontrado com o título que começa com "exer"\n');
          }
        }
      }
    }
  }
};

async function verificarImagens(page, tipo, conteudoDaQuestao, alternativas) {
  await asleep(3);

  const allImages = []; // data images para usar na api
  
  for (let imageUrl of conteudoDaQuestao.imageUrls) {
    const filePath = path.basename(url.parse(imageUrl).pathname);

    const imageElement = await page.waitForSelector(`img[src="${imageUrl}"]`);

    await imageElement.screenshot({
      path: filePath
    });

    allImages.push({
      filePath,
      mimeType: "image/jpeg",
      displayName: "Image Question"
    });
  }

  const respostas = [];
  let respostaFinal;

  for (let i = 0; i < allImages.length; i++) {
    const imagem = allImages[i];
    const uploadResult = await fileManager.uploadFile(imagem.filePath, {
      mimeType: imagem.mimeType,
      displayName: imagem.displayName
    });

    fs.unlinkSync(imagem.filePath)
    const getResult = await fileManager.getFile(uploadResult.file.name);


    if (i < allImages.length - 1) {
      const respostaIntermediaria = await chatSession.sendMessageStream([
        {
          fileData: {
            mimeType: getResult.mimeType,
            fileUri: getResult.uri
          }
        },
        {
          text: `Interprete a imagem repassada e aguarde a próxima imagem, até que nao haja mais arquivos enviados.`
        }
      ]);
      respostas.push((await respostaIntermediaria.response).text())
    } else {
      let promptQuestion;
      let mathConcate = '';
      if (conteudoDaQuestao.math) {
        // mathConcate = ' Caso perceba que seja uma questão de matematica ou outra materia parecida, que esteja usando o katex math, simplifique e traduza os simbolos, me retornando uma resposta simples para escrever no livro';
        mathConcate = ' Caso perceba que seja uma questão que esteja usando o katex math, traduza os simbolos html para caracteres normais, me retornando uma resposta simples para escrever no livro';
      }
      
      if (tipo === 'Objetiva') {
        promptQuestion = `Interprete as imagens repassadas e resolva a questão. Me retorne somente a letra correta, quero APENAS um caractere na sua resposta, sem me explicar.${mathConcate}: alternativas (em json, interprete-as.) = ${JSON.stringify(alternativas)}, conteudo = ${conteudoDaQuestao.texto}`
      } else if (tipo === 'Subjetiva') {
        promptQuestion = `Interprete as imagens repassadas e responda a questão, considere que é uma questao subjetiva. E considere que é para escrever em um livro didático, entao seja simples e nao muito longo, tambem nao use tantos simbolos e divisão de topicos.${mathConcate}: conteudo = ${conteudoDaQuestao.texto}`
      } else if (tipo === 'Blanks') {
        promptQuestion = `resolva a seguinte questão, e considere o formato sendo questoes de preencher parenteses. Me retorne apenas uma cadeia de caracteres, exemplo "VVVVV" ou "FFFFF", dependendo do tanto de perguntas que a questao tiver e o que ela pedir (V ou F; T ou F, e qualquer outros).${mathConcate}: conteudo = ${conteudoDaQuestao.texto}`
      } else {
        promptQuestion = `faça a somatoria e me traga apenas o numero do resultado, apenas isso.${mathConcate} conteudo = ${conteudoDaQuestao.texto}`
      }
      respostaFinal = await chatSession.sendMessageStream([
        {
          fileData: {
            mimeType: getResult.mimeType,
            fileUri: getResult.uri
          }
        },
        {
          text: promptQuestion
        }
      ]);
    }
  }

  return respostaFinal;
}

async function responderQuestao(page) {

  try {
    await page.waitForSelector('.emg-exercise-feedback-correct, .emg-exercise-box-padding, .emg-discursive-answer-view-mode, .emg-discursive-answer-edit-mode', { visible: true, timeout: 500 });
  } catch {
    console.log('Questão com gabarito visualizado, pulando...')
    return;
  }
  
  const isAnsweredObjective = await page.$('.emg-exercise-feedback-correct') // todos os modos exceto as serem corrigidas pelo prof
  const isAnsweredSubjective = await page.$('.emg-discursive-answer-view-mode:not(.revision-slot)')

  if (isAnsweredObjective || isAnsweredSubjective) {
    console.log(chalk.bgRed.bold('Questao já respondida.\n'))
    return;
  }

  try {
    await page.waitForSelector('.emg-discursive-answer, .emg-exercise-multiple-choice-answers-wrapper, #blank1', { visible: true, timeout: 500 });
  } catch {}

  const discursiveAnswer = await page.$('.emg-discursive-answer');
  const multipleChoiceAnswer = await page.$('.emg-exercise-multiple-choice-answers-wrapper');
  const blankFillAnswer = await page.$('#blank1')
  let typeOfQuestion;

  if (discursiveAnswer) {
    typeOfQuestion = 'Subjetiva';
  } else if (multipleChoiceAnswer) {
    typeOfQuestion = 'Objetiva';
  } else if (blankFillAnswer) {
    typeOfQuestion = 'Blanks';
  } else {
    typeOfQuestion = 'Form';
  }

  const conteudoDaQuestao = await page.$eval('.emg-exercise-title', element => {
    const paragrafos = element.querySelectorAll('p');
    let textoCompleto = '';
    let containsImage = false;
    let imageUrls = [];
    let math;

    paragrafos.forEach(p => {
      const img = p.querySelector('span img');
      if (img) {
        containsImage = true;
        imageUrls.push(img.src);
      }
      const formula = document.querySelector('.ql-formula');
      if (formula) {
        math = true;
      }
      textoCompleto += p.innerText + ' ';
    });

    return {
      texto: textoCompleto.trim(), // Remove o espaço extra no final
      containsImage,
      imageUrls,
      math
    };
  });
  
  if (typeOfQuestion === 'Objetiva') {
    await page.$eval('.emg-exercise-multiple-choice-answer-item', e => {
      const img = e.querySelector('img');
      console.log(img)
      if (img) {
        console.log('Questão contém imagem nas alternativas, não suportado. (atualização futura...)')
        return;
      }
    })
    

    const optionsElement = await page.$$('.emg-exercise-multiple-choice-answer-item');
    let alternativas = [];
    for (let element of optionsElement) {
      const letra = await element.$eval('.emg-exercise-multiple-choice-letter', span => span.innerText.trim());
      const texto = await element.$eval('.emg-exercise-multiple-choice-answer', label => label.innerText.trim());

      alternativas.push({
        letra: letra,
        texto: texto,
        elemento: element
      });
    }; // pegar alternativas

    let resposta;
    let tentativa = 0;
    let maxTentativas = 3; // Número máximo de tentativas

    while (tentativa < maxTentativas) {
      
      let prompt;
      if (tentativa === 0) {
        if (conteudoDaQuestao.containsImage) {
          resposta = await verificarImagens(page, typeOfQuestion, conteudoDaQuestao, alternativas);
        } else {
          prompt = `resolva a seguinte questao, faça a sua resolução em segundo plano, leve o tempo que precisar para resolver. Entretanto, após isso me retorne somente a letra da alternativa correta, sem mais nada, quero apenas um caractere na resposta: ${conteudoDaQuestao.texto}, ${JSON.stringify(alternativas)}`;
          resposta = await chatSession.sendMessageStream(prompt)
        }
      } else {
        prompt = `resposta errada, por favor tente novamente, procure o possivel erro que vc cometeu, e tente outra alternativa diferente das já tentadas, e lembre-se: traga somente a letra da alternativa e nada mais, sem explicar. ${conteudoDaQuestao.texto}, ${JSON.stringify(alternativas)}`;
        resposta = await chatSession.sendMessageStream(prompt)
      }

      const response = await resposta.response;
      const letraCorreta = response.text().trim().toUpperCase();
      console.log(`Alternativa correta: ${letraCorreta}\n`);
      const alternativaCorreta = alternativas.find(alt => alt.letra === letraCorreta);
      await alternativaCorreta.elemento.click();
      const submitAnswer = await page.$('.emg-exercise-box-padding > button');
      await submitAnswer.click();

      let isIncorrect;
      try {
        await page.waitForSelector('.emg-exercise-feedback')
        isIncorrect = await page.$('.emg-exercise-feedback-incorrect');
      } catch {}  
      

      if (!isIncorrect) {
        console.log(chalk.bgGreen('Resposta correta!\n'));
        await asleep(16);
        break; // Sai do loop se a resposta estiver correta
      } else {
        console.log(chalk.bgRed('Resposta incorreta, tentando novamente...\n'));

        await asleep(0.3)
        const exerciseCard = await page.$('.exerciselist-card-partial')
        if (exerciseCard) {
          const isPartialCardVisible = await page.evaluate(element => {
            return element.classList.contains('visible');
          }, exerciseCard);
  
          if (isPartialCardVisible) {
            await page.click('.exerciselist-card-close-btn');
          }
        }
        
        tentativa++;
      }
      await asleep(16);

    }

    if (tentativa === maxTentativas) {
      console.log('Número máximo de tentativas atingido.\n');
      finalReport.incorrectCount++
      finalReport.incorrectQuestions.push({
        number: questaoAtual,
        modulo: moduloAtual,
        exercise: exerciseAtual,
      })

    }
  } else if (typeOfQuestion === 'Subjetiva') {
    let resposta;

    if (conteudoDaQuestao.containsImage) {
      resposta = await verificarImagens(page, typeOfQuestion, conteudoDaQuestao, []);
    } else {
      
      resposta = await chatSession.sendMessageStream(`resolva a seguinte questão e explique de maneira simples e breve. Caso esteja usando o katex math, simplifique e converta os simbolos, de forma que eu possa escrever no livro. Caso seja matematica ou química, mce retorne uma resposta sem muitas explicações, foque apenas nos calculos e utilize formulas comuns relacionadas ao assunto na resolução: ${conteudoDaQuestao.texto}`);
    }
  
    const response = await resposta.response;
    const text = response.text();
    // console.log(`Resposta correta: ${text}`);
    const container = await page.$('.ql-container')
    await container.click() // evitar rapidez excessiva, cortando o inicio do texto

    const isBlank = await page.$('.ql-editor.ql-blank')

    if (!isBlank) {
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
    }
  
    await container.type(text);
    const submitAnswer = await page.$('.emg-exercise-box-padding > button');
    await submitAnswer.click();

    console.log(chalk.bgGreen('Resposta enviada com sucesso. (questão subjetiva)'))
    await asleep(16);
  } else if (typeOfQuestion === 'Blanks') {
    let tentativa = 0;
    let maxTentativas = 1;
    let resposta;
    let text;
    let incorrects = [];

    while (tentativa <= maxTentativas) {
      if (tentativa === 0) {
        if (conteudoDaQuestao.containsImage) {
          resposta = await verificarImagens(page, typeOfQuestion, conteudoDaQuestao, []);
          const response = await resposta.response;
          text = response.text().trim();
        } else {
          resposta = await chatSession.sendMessageStream(`resolva a seguinte questão, e considere o formato sendo questoes de preencher parenteses. Me retorne apenas uma cadeia de caracteres, exemplo "VVVVV" ou "FFFFF", dependendo do tanto de perguntas que a questao tiver e o que ela pedir (V ou F; T ou F, e qualquer outros): ${conteudoDaQuestao.texto}`);
          const response = await resposta.response;
          text = response.text().trim();
        }
      } else {
        // pega o index das incorretas
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

        // inverte as afirmações
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
      }
      
      console.log(`Resposta correta: ${text}\n`);
      for (let i = 0; i < text.length; i++) {
        const selector = `#blank${i + 1}`;
        const inputHandle = await page.$(selector);
        await page.evaluate(e => e.value = '', inputHandle) // limpar antes de escrever
        await inputHandle.type(text[i]);
        await asleep(1)
      }
      const submitAnswer = await page.$('.emg-exercise-box-padding > button');
      await submitAnswer.click();

      let isIncorrect;
      try {
        await page.waitForSelector('.emg-exercise-feedback')
        isIncorrect = await page.$('.emg-exercise-feedback-incorrect');
      } catch {}
      

      if (!isIncorrect) {
        console.log(chalk.bgGreen('Resposta correta!\n'));
        await asleep(16)
        break;
      } else {
        console.log(`Resposta errada, corrigindo afirmações...`)
        
        await asleep(0.3)
        const exerciseCard = await page.$('.exerciselist-card-partial')
        if (exerciseCard) {
          const isPartialCardVisible = await page.evaluate(element => {
            return element.classList.contains('visible');
          }, exerciseCard);
    
          if (isPartialCardVisible) {
            await page.click('.exerciselist-card-close-btn');
          }
        }
        
        tentativa++
      }
      await asleep(16)
    }

    if (tentativa === maxTentativas) {
      console.log('Número máximo de tentativas atingido.\n');
      finalReport.incorrectCount++
      finalReport.incorrectQuestions.push({
        number: questaoAtual,
        modulo: moduloAtual,
        exercise: exerciseAtual,
      })

    }
  } else {
    let resposta;

    let tentativa = 0;
    let maxTentativas = 3;

    while (tentativa < maxTentativas) {

      let prompt;
      if (tentativa === 0) {
        if (conteudoDaQuestao.containsImage) {
          resposta = await verificarImagens(page, typeOfQuestion, conteudoDaQuestao, []);
        } else {
          prompt = 'faça a somatoria e me retorne apenas o numero do resultado, apenas isso.:'
          resposta = await chatSession.sendMessageStream(`${prompt} ${conteudoDaQuestao.texto}`);
        }
      } else {
        prompt = `resposta errada, por favor tente novamente, procure o possivel erro que vc cometeu, e tente outra soma diferente. ${conteudoDaQuestao.texto}`;
        resposta = await chatSession.sendMessageStream(prompt)
      }
      
  
      const response = await resposta.response;
      const text = response.text();
      console.log(`Resposta correta: ${text}\n`);

      const form = await page.$$('.form-control')
      const input = form[5]; // index do input de answer
      await input.type(text);
      const submitAnswer = await page.$('.emg-exercise-box-padding > button');
      await submitAnswer.click();

      let isIncorrect;
      try {
        await page.waitForSelector('.emg-exercise-feedback');
        isIncorrect = await page.$('.emg-exercise-feedback-incorrect');
      } catch {}

      if (!isIncorrect) {
        console.log(chalk.bgGreen('Resposta correta!\n'));
        await asleep(16);
        break; // Sai do loop se a resposta estiver correta
      } else {
        console.log(chalk.bgRed('Resposta incorreta, tentando novamente...\n'));

        await asleep(0.3)
        const exerciseCard = await page.$('.exerciselist-card-partial')
        if (exerciseCard) {
          const isPartialCardVisible = await page.evaluate(element => {
            return element.classList.contains('visible');
          }, exerciseCard);
  
          if (isPartialCardVisible) {
            await page.click('.exerciselist-card-close-btn');
          }
        }
        
        tentativa++;
      }
      await asleep(16)
    }
    if (tentativa === maxTentativas) {
      console.log('Número máximo de tentativas atingido.\n');
      finalReport.incorrectCount++
      finalReport.incorrectQuestions.push({
        number: questaoAtual,
        modulo: moduloAtual,
        exercise: exerciseAtual,
      })

    }
  }
};

async function responderExers(page) {
  for (let atividadeAtual = 1; atividadeAtual <= numeroDeAtividades; atividadeAtual++) {
    await page.waitForSelector('.qm-content-toolbar-title');
    exerciseAtual = await page.$eval('.qm-content-toolbar-title', e => {
      return e.getAttribute('title')
    });
    console.log(`Respondendo atividade número ${atividadeAtual}: ${chalk.red(exerciseAtual)}`);

    await page.waitForSelector('.emg-exerciselist-navigator-list-item')
    const exerciseList = await page.$$('.emg-exerciselist-navigator-list-item');
    const numeroDeQuestoes = exerciseList.length;
    console.log(chalk.blue(`Número de Questões: ${numeroDeQuestoes}\n`));
    let questoes = [];

    // pega todas as questões pelo indíce
    for (let element of exerciseList) {
      const numero = await element.$eval('.emg-btn-question', button => button.innerText.trim());

      questoes.push({
        numero: numero,
        elemento: element
      });
    };
    
    // responde e passa para a proxima questão do modulo
    for (let questao of questoes) {
      questaoAtual = questao.numero;
      // Clique na questão atual para exibi-la
      await questao.elemento.click();
      console.log(`Respondendo à questão ${questao.numero}\n`);

      // Chama a função para responder a questão
      const maxTentativas = 3 // tentativa de chamar api
      let tentativas = 0
      let success = false

      while (!success && tentativas < maxTentativas) {
        try {
          tentativas++
          await responderQuestao(page, questao);
          success = true
        } catch (err) {
          console.error(chalk.bgRed(`Falha ao responder a questão ${questao.numero}:`), err.statusText);
          await asleep(7);
          if (tentativas >= maxTentativas) {
            console.error(`Número máximo de tentativas alcançado para a questão, erro de api ${questao.numero}. Pausa na aplicação de 15 segundos para liberar a IA...`);
            await asleep(15)
            break;
          }
        }
      }

      const exerciseCard = await page.$('.exerciselist-card')
      if (exerciseCard) {
        const isConclusionCardVisible = await page.evaluate(element => {
          return element.classList.contains('visible');
        }, exerciseCard);
  
        if (isConclusionCardVisible) {
          await page.click('.exerciselist-card-close-btn');
          break
        }
      }   
    }

    console.log('Todas as questões foram respondidas.\n');
    try {
      await page.waitForSelector('.exerciselist-card-score, .exerciselist-card-partial', { timeout: 10000})
    } catch (err) {
      // partial note, to be analyzed
    }
    
    let nota;
    const score = await page.evaluate(el => el.textContent.trim(), await page.$('.exerciselist-card-score'));
    const partial = await page.$('.exerciselist-card-partial');

    if (score != '') {
      nota = (await page.evaluate(el => el.innerText , score)).replace(/[^0-9,]/g, '');
    } else if (partial) {
      nota = 'Aguardando correção do professor'
    } else {
      nota = 'Exercício já havia sido respondido anteriormente'
    }

    notasFinais[moduloAtual].push({
      exercise: exerciseAtual,
      nota: nota,
    })
    await asleep(2)
    console.clear();

    await Promise.all([
      page.waitForNavigation(),
      page.click('[title="Próxima atividade"]')
    ])
  };
};

(async () => {
  const browser = await puppeteer.launch({ headless: false, pipe: true, timeout: 0 });
  const page = await browser.newPage();

  await page.goto(siteUrl);

  // await page.waitForSelector(".hkKGjB");

  // await page.type(".hkKGjB", login);
  // await page.type(".hVUGKM", password);
  // await Promise.all([
  //   page.waitForNavigation(),
  //   page.click(".cHpGAw")
  // ]);

  // await page.waitForSelector(".hOLIpx");
  // const qmagicLink = await page.$('.hOLIpx > a');
  // const href = await qmagicLink.getProperty('href');
  // const hrefValue = await href.jsonValue();
  // await page.goto(hrefValue);

  await page.waitForSelector('.course-display-card__info');
  const cadernos = await page.$$eval('.course-display-card__info > a', elements => {
    return elements.map(element => ({
      texto: element.innerText,
      href: element.getAttribute('href')
    }));
  });

  // itera os livros, e clica no desejado
  for (const caderno of cadernos) {
    if (caderno.texto.includes(`${materia}`)) {
      const linkSelector = `.course-display-card__info > a[href="${caderno.href}"]`;
      await Promise.all([
        page.waitForNavigation(),
        page.click(linkSelector)
      ]);
    }
  }

  // Espera os módulos carregarem e os busca
  await page.waitForSelector('.qm-qplano__subsection');
  await navegarEResponderModulos(page);

  // Mostrar questões erradas pelo app
  if (finalReport.incorrectCount > 0) {
    console.log(chalk.bgYellow(`Aviso: Algumas questões não conseguiram ser respondidas, considere finalizá-las manualmente.\n`))
    finalReport.incorrectQuestions.forEach(qst => {
      console.log(`Questão errada número ${qst.number}, módulo ${qst.modulo}, em: ${qst.exercise}`)
    })
  } else {
    console.log(chalk.green('Todas as questões respondidas corretamente!'))
  }

  // Ver notas finais
  const verNotas = await inquirer.confirm({
    message: 'Ver notas adquiridas?'
  })

  if (verNotas) {
    console.clear()
    console.log(chalk.yellow('------ Notas Finais ------\n'))
    for (const modulo in notasFinais) {
      if (notasFinais.hasOwnProperty(modulo)) {
        console.log(`Modulo ${modulo}:`);
        notasFinais[modulo].forEach(exercicio => {
          console.log(` ${exercicio.exercise}: ${exercicio.nota}`);
        });
        console.log('\n')
      }
    }
  }
  
  await browser.close();
})();
