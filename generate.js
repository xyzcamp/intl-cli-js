const readline = require('readline');
const fse = require('fs-extra');

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

const flattenMessages = (nestedMessages, prefix = '') => {
  return Object.keys(nestedMessages).reduce((messages, key) => {
    let value       = nestedMessages[key];
    let prefixedKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
        messages[prefixedKey] = value;
    } else {
        Object.assign(messages, flattenMessages(value, prefixedKey));
    }

    return messages;
  }, {});
}

(async function main() {
  const argvIndex = process.argv.findIndex(arg => arg === '--arguments');

  let path;
  let defaultLocale;
  let outputFilename;

  if (argvIndex !== -1) {
    const langArgvs = process.argv.slice(argvIndex + 1, argvIndex + 1 + 3);
    if (langArgvs.length < 3) {
      throw new Error(`Too few arguments to --arguments, ${langArgvs.length} passed in`);
    }
    [path, defaultLocale, outputFilename] = langArgvs;
  } else {
    // Get Messages Dir Path
    const inputPath = await askQuestion('Enter your messages directory path: (./messages) ');
    path = inputPath ? inputPath : './messages';

    // Get Default Locale
    const inputDefaultLocale = await askQuestion('Enter your default locale: (zh) ');
    defaultLocale = inputDefaultLocale ? inputDefaultLocale : 'zh';

    // Get Output Filename
    const inputOutputFilename = await askQuestion('Enter your output filename: (./output-messages.csv) ');
    outputFilename = inputOutputFilename ? inputOutputFilename : './output-messages.csv';
  }

  // Close Waiting Read Line
  rl.close();

  // Scan Languages List
  const langDirList = await fse.readdir(path);

  // Get All Languages Data
  const langs = langDirList
    .filter((lang) => lang.indexOf('.') === -1)
    .reduce((accumulator, currentLangDir) => {
      let messages;

      try {
        messages = require(`${path}/${currentLangDir}`).default;
      } catch (error) {
        throw new Error(`Unknown filename: ${path}/${currentLangDir}`);
      }

      return {
        ... accumulator,
        [currentLangDir]: flattenMessages(messages),
      };
    }, {});

  // Get All Keys
  const defaultLocaleKeys = Object.keys(langs.zh);
  const allKeys = Object.keys(langs).reduce((accumulator, currentLangKey) => {

    let lastIndex = 0;
    Object.keys(langs[currentLangKey]).forEach((langKey, index) => {
      const targetIndex = accumulator.indexOf(langKey);

      if (targetIndex === -1) {
        accumulator.splice(lastIndex, 0, langKey);
        lastIndex++;
      } else {
        lastIndex = targetIndex;
      }
    });

    return accumulator;
  }, defaultLocaleKeys);

  // Generate Languages Matrix
  const langMatrix = allKeys.map((key) => {
    const allLangsByKey = Object.keys(langs)
      .reduce((accumulator, currentLangKey) => {
        return {
          ...accumulator,
          [currentLangKey]: langs[currentLangKey][key],
        };
      }, {});

    const keyList = key.split('.');
    const categoryKey = keyList.shift();
    const messageKey = keyList.join('.');

    return {
      category: categoryKey,
      key: messageKey,
      ...allLangsByKey,
    };
  });

  // To CSV Format
  const headRow = Object.keys(langs).reduce((accumulator, currentLangKey) => {
    return `${accumulator},${currentLangKey}`;
  }, `category,key`);
  const allRows = langMatrix.map((langData) => {
    const {
      category,
      key,
      ...otherLangs,
    } = langData;

    return Object.keys(otherLangs).reduce((accumulator, currentValue) => {
      return `${accumulator},${otherLangs[currentValue] || ''}`;
    }, `${category},${key}`);
  });
  allRows.unshift(headRow);

  // Write to File
  const csvData = allRows.join('\n');
  await fse.writeFile(outputFilename, csvData, 'utf8');

  console.log('Success!');
})();
