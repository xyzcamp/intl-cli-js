
const readline = require('readline');
const fse = require('fs-extra');
const unflatten = require('flat').unflatten
const flattenDeep = require('lodash').flattenDeep

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (question) => (
  new Promise((res) => {
    rl.question(question, answer => {
      res(answer);
    });
  })
);

(async function main() {
  const argvIndex = process.argv.findIndex(arg => arg === '--arguments');

  let inputFilename;
  let defaultLocale;
  let outputPath;

  if (argvIndex !== -1) {
    const langArgvs = process.argv.slice(argvIndex + 1, argvIndex + 1 + 3);
    if (langArgvs.length < 3) {
      throw new Error(`Too few arguments to --arguments, ${langArgvs.length} passed in`);
    }

    [inputFilename, defaultLocale, outputPath] = langArgvs;
  } else {
    // Get Input Messages Filename
    const inputInputFilename = await askQuestion('Enter your input message filename: (./output-messages.csv) ');
    inputFilename = inputInputFilename ? inputInputFilename : './output-messages.csv';

    // Get Default Locale
    const inputDefaultLocale = await askQuestion('Enter your default locale: (zh) ');
    defaultLocale = inputDefaultLocale ? inputDefaultLocale : 'zh';

    // Get Output Messages Dir Path
    const inputOuputPath = await askQuestion('Enter your output messages path: (./output-messages) ');
    outputPath = inputOuputPath ? inputOuputPath : './output-messages';
  }

  // Close Waiting Read Line
  rl.close();

  // Remove and Make Output Directory
  await fse.remove(outputPath);
  await fse.mkdir(outputPath);

  // Read Message File
  const data = await fse.readFile(inputFilename, 'utf8');

  // Parse CSV
  const rows = data.split('\n');
  const head = rows.shift();
  const headList = head.split(',');

  // Get All lang keys
  const [
    category,
    key,
    ...allLangKeys
  ] = headList;

  // Parse to Language Matrix
  const langMatrix = rows.map((row) => {
    const data = row.split(',').reduce((accumulator, currentData, currentIndex) => {
      const headKey = headList[currentIndex];
      accumulator[headKey] = currentData.length ? currentData : null;
      return accumulator;
    }, {});

    return data;
  });

  // Make Lang Dirs
  await Promise.all(allLangKeys.map((langKey) => {
    const langPath = `${outputPath}/${langKey}`;

    return fse.mkdir(langPath);
  }));

  // Get All Categories
  const allCategories = langMatrix.reduce((accumulator, currentData) => {
    if (accumulator.indexOf(currentData.category) === -1) {
      accumulator.push(currentData.category);
    }

    return accumulator;
  }, []);

  // Write all categories
  allLangKeys.forEach((langKey) => {
    const langPath = `${outputPath}/${langKey}`;

    allCategories.forEach(async (category) => {
      const langData = langMatrix
        .filter(lang => lang.category === category)
        .filter(lang => lang[langKey])
        .reduce((accumulator, currentLang)=> {
          accumulator[currentLang.key] = currentLang[langKey];

          return accumulator;
        }, {});

      const unflattenLangData = unflatten(langData);

      if (Object.keys(unflattenLangData).length > 0) {
        const unflattenMessages = (flattenMessages, depth = 1) => {
          return Object.keys(flattenMessages).reduce((accumulator, currentKey) => {

            if (typeof flattenMessages[currentKey] === 'object') {
              const tmpMessages = unflattenMessages(flattenMessages[currentKey], depth + 1);
              tmpMessages.unshift(`${'  '.repeat(depth)}${currentKey}: {`);
              tmpMessages.push(`${'  '.repeat(depth)}},`)
              accumulator.push(tmpMessages);
            } else {
              accumulator.push(`${'  '.repeat(depth)}${currentKey}: '${flattenMessages[currentKey]}',`);
            }

            return accumulator;
          }, []);
        }

        const outputArray = flattenDeep(unflattenMessages(unflattenLangData));
        outputArray.unshift('export default {');
        outputArray.push('};');
        const outputData = outputArray.join('\n');

        await fse.writeFile(`${langPath}/${category}.js`, outputData, 'utf8');
      }
    });
  });

  // Write index.js
  await Promise.all(allLangKeys.map(async (langKey) => {
    const langPath = `${outputPath}/${langKey}`;
    const langCategoryList = await fse.readdir(langPath);

    const categoryKeys = langCategoryList.map(langCategory => langCategory.split('.')[0])
      .filter(lang => lang);

    const outputArray = [];
    categoryKeys.forEach(key => {
      outputArray.push(`import ${key} from './${key}';`);
    });
    outputArray.push('');

    outputArray.push('export default {');
    categoryKeys.forEach(key => {
      outputArray.push(`  ${key},`);
    });
    outputArray.push('};');

    const ouputData = outputArray.join('\n');

    return fse.writeFile(`${langPath}/index.js`, ouputData, 'utf8');
  }));

  console.log('Success!');
})();
