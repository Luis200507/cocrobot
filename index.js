import * as puppeteer from "puppeteer";
import * as inquirer from "@inquirer/prompts";
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/files";
import * as fs from "fs";
import * as path from "path";
import * as url from "url"


// Variáveis do app

const siteUrl = "https://portal.coc.com.br/login/";
const login = await inquirer.input({
  message: 'Insira seu email de login:'
});
const password = await inquirer.input({
  message: 'Agora, insira sua senha:'
});

const materia = await inquirer.select({
    message: 'Qual matéria você deseja?',
    choices: [
      { name: 'Matemática', value: '11B' },
      { name: 'IF Matemática', value: '11I' },
      { name: 'Português', value: '31B' },
      { name: 'IF Português', value: '31I' },
      { name: 'Geografia', value: '42B'},
      { name: 'IF Geografia', value: '42I' },
      { name: 'Biologia', value: '23B'},
      { name: 'IF Biologia', value: '23I'},
      { name: 'Filosofia', value: '43B'},
      { name: 'IF Filosofia', value: '43I'},
    ]
});
console.log(`Você escolheu ${materia}.\n`);

const moduloInicial = await inquirer.number({
  message: 'Em qual módulo deseja iniciar? (apenas números)'
});
const moduloFinal = await inquirer.number({
  message: 'Até qual?'
});


let numeroDeAtividades;
const regex = /\d+/g;

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

async function asleep(t) {
  return new Promise(resolve => setTimeout(resolve, t * 1000))
};

async function navegarEResponderModulos(page) {
  const modulosCards = await page.$$('.qm-qplano__subsection');

  for (let moduloAtual = moduloInicial; moduloAtual <= moduloFinal; moduloAtual++) {
    console.log(`Entrando no módulo: ${moduloAtual}\n`);

    // Entra no módulo atual
    await entrarNoModulo(moduloAtual.toString(), modulosCards, page);

    await responderExers(page)

    await asleep(5);

    // Volta para a página anterior (página de módulos)
    await page.goBack();

    console.log(`Voltando para a página de módulos. Próximo módulo: ${moduloAtual + 1}\n`);
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

          console.log(`Número de atividades encontradas: ${numeroDeAtividades}\n`);

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
        mathConcate = ' Caso perceba que seja uma questão de matematica ou outra materia parecida, que esteja usando o katex math, simplifique e traduza os simbolos, me retornando uma resposta simples para escrever no livro';
      }
      
      if (tipo === 'Objetiva') {
        promptQuestion = `Interprete a imagens repassada nesse pedido aqui atual, e junte com a interpretação da ultima imagem e responda a questão. Me traga somente a letra da alternativa correta, sem explicações, e símbolos ou cabeçalhos antes da alternativa. Desejo somente a letra correspondente.${mathConcate}: alternativas = ${JSON.stringify(alternativas)}, conteudo = ${conteudoDaQuestao.texto}`
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
  await page.waitForSelector('.emg-exercise-feedback-correct, .emg-exercise-box-padding, .emg-discursive-answer-view-mode, .emg-discursive-answer-edit-mode', { visible: true });
  const isAnsweredObjective = await page.$('.emg-exercise-feedback-correct') // todos os modos exceto as serem corrigidas pelo prof
  const isAnsweredSubjective = await page.$('.emg-discursive-answer-view-mode:not(.revision-slot)')

  if (isAnsweredObjective || isAnsweredSubjective) {
    console.log('Questao já respondida.\n')
  } else {
    try {
      await page.waitForSelector('.emg-discursive-answer, .emg-exercise-multiple-choice-answers-wrapper, #blank1', { visible: true, timeout: 500 });
    } catch {
    }
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

    console.log(`Tipo de questão: ${typeOfQuestion}\n`);

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

    // console.log('Conteúdo da questão:', conteudoDaQuestao.texto); // Log do conteúdo da questão

    if (typeOfQuestion === 'Objetiva') {
      const optionsElement = await page.$$('.emg-exercise-multiple-choice-answer-item');
      let alternativas = [];
      let resposta;
      let tentativa = 0;
      let maxTentativas = 3; // Número máximo de tentativas

      while (tentativa < maxTentativas) {
        for (let element of optionsElement) {
          const letra = await element.$eval('.emg-exercise-multiple-choice-letter', span => span.innerText.trim());
          const texto = await element.$eval('.emg-exercise-multiple-choice-answer', label => label.innerText.trim());

          alternativas.push({
            letra: letra,
            texto: texto,
            elemento: element
          });
        }; // pegar alternativas

        let prompt;
        if (tentativa === 0) {
          if (conteudoDaQuestao.containsImage) {
            resposta = await verificarImagens(page, typeOfQuestion, conteudoDaQuestao, alternativas);
          } else {
            prompt = `resolva a seguinte questao, e me traga somente a letra da alternativa correta, sem explicações, ou simbolos antes da alternativa, quero apenas um caractere: ${conteudoDaQuestao.texto}, ${JSON.stringify(alternativas)}`;
            resposta = await chatSession.sendMessageStream(prompt)
          }
        } else {
          prompt = `resposta errada, por favor tente novamente, procure o possivel erro que vc cometeu, e tente outra alternativa diferente das já tentadas: ${conteudoDaQuestao.texto}, ${JSON.stringify(alternativas)}`;
          resposta = await chatSession.sendMessageStream(prompt)
        }

        const response = await resposta.response;
        const letraCorreta = response.text().trim().toUpperCase();
        console.log(`Alternativa correta: ${letraCorreta}\n`);
        const alternativaCorreta = alternativas.find(alt => alt.letra === letraCorreta);
        await alternativaCorreta.elemento.click();
        const submitAnswer = await page.$('.emg-exercise-box-padding > button');
        await submitAnswer.click();
        await asleep(16);

        const isIncorrect = await page.$('.emg-exercise-feedback-incorrect');

        if (!isIncorrect) {
          console.log('Resposta correta!\n');
          break; // Sai do loop se a resposta estiver correta
        } else {
          console.log('Resposta incorreta, tentando novamente...\n');
          tentativa++;
        }
      }

      if (tentativa === maxTentativas) {
        console.log('Número máximo de tentativas atingido.\n');
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
      await asleep(16);
    } else if (typeOfQuestion === 'Blanks') {
      let resposta;

      if (conteudoDaQuestao.containsImage) {
        resposta = await verificarImagens(page, typeOfQuestion, conteudoDaQuestao, []);
      } else {
        resposta = await chatSession.sendMessageStream(`resolva a seguinte questão, e considere o formato sendo questoes de preencher parenteses. Me retorne apenas uma cadeia de caracteres, exemplo "VVVVV" ou "FFFFF", dependendo do tanto de perguntas que a questao tiver e o que ela pedir (V ou F; T ou F, e qualquer outros): ${conteudoDaQuestao.texto}`);
      }
    
      const response = await resposta.response;
      const text = response.text().trim();
      console.log(text.length)
      console.log(`Resposta correta: ${text}\n`);
      for (let i = 0; i < text.length; i++) {
        console.log(i + 1)
        const selector = `#blank${i + 1}`;
        const inputHandle = await page.$(selector);
        await inputHandle.type(text[i]);
        await asleep(1)
      }
      const submitAnswer = await page.$('.emg-exercise-box-padding > button');
      await submitAnswer.click();
      await asleep(16)
    } else {
      let resposta;

      if (conteudoDaQuestao.containsImage) {
        resposta = await verificarImagens(page, typeOfQuestion, conteudoDaQuestao, []);
      } else {
        resposta = await chatSession.sendMessageStream(`faça a somatoria e me retorne apenas o numero do resultado, apenas isso.: ${conteudoDaQuestao.texto}`);
      }
    
      const response = await resposta.response;
      const text = response.text();
      console.log(`Resposta correta: ${text}\n`);

      const promiseInput = await page.$$('.form-control')
      const input = promiseInput[5];;
      await input.type(text);
      // const submitAnswer = await page.$('.emg-exercise-box-padding > button');
      // await submitAnswer.click();
      await asleep(16)
    }
  };
};

async function responderExers(page) {
  for (let atividadeAtual = 1; atividadeAtual <= numeroDeAtividades; atividadeAtual++) {
    console.log(atividadeAtual + '\n');
    await page.waitForSelector('.emg-exerciselist-navigator-list-item')
    const exerciseList = await page.$$('.emg-exerciselist-navigator-list-item');
    const numeroDeQuestoes = exerciseList.length;
    console.log(`Número de Questões: ${numeroDeQuestoes}\n`);
    let questoes = [];
    let conclusionCard;

    for (let element of exerciseList) {
      const numero = await element.$eval('.emg-btn-question', button => button.innerText.trim());

      questoes.push({
        numero: numero,
        elemento: element
      });
    };

    for (let questao of questoes) {
      
      // Clique na questão atual para exibi-la
      await questao.elemento.click();
      console.log(`Respondendo à questão ${questao.numero}\n`);

      // Chama a função para responder a questão
      await responderQuestao(page, questao);

      conclusionCard = await page.$('.exerciselist-card-partial');
      
      if (conclusionCard) {

        const isVisible = await page.evaluate(element => {
          return element.classList.contains('visible');
        }, conclusionCard);
  
        if (isVisible) {
          await page.click('.exerciselist-card-close-btn');
          console.log('Fechou');
          break
        }

      }
    }

    console.log('Todas as questões foram respondidas.\n');
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

  await page.waitForSelector(".hkKGjB");

  await page.type(".hkKGjB", login);
  await page.type(".hVUGKM", password);
  await Promise.all([
    page.waitForNavigation(),
    page.click(".cHpGAw")
  ]);

  await page.waitForSelector(".hOLIpx");
  const qmagicLink = await page.$('.hOLIpx > a');
  const href = await qmagicLink.getProperty('href');
  const hrefValue = await href.jsonValue();
  await page.goto(hrefValue);

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

})();
