import readline from 'readline';
import fse from 'fs-extra';
import csvStringify from 'csv-stringify';
import XLSX from 'xlsx';

process.on('unhandledRejection', error => {
  // Will print "unhandledRejection err is not defined"
  console.log('unhandledRejection', error.message);
});

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

const formatToCSV = (input) => (
  new Promise((resolve) => {
    csvStringify(input, (_, output) => resolve(output))
  })
)

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

async function mainFunction() {
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
    const inputOutputFilename = await askQuestion('Enter your output filename: (./output-messages.xlsx) ');
    outputFilename = inputOutputFilename ? inputOutputFilename : './output-messages.xlsx';
  }

  // Append current work directory
  path = `${process.cwd()}/${path}`;
  outputFilename = `${process.cwd()}/${outputFilename}`;

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

      accumulator[currentLangDir] = flattenMessages(messages);
      return accumulator;
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
        accumulator[currentLangKey] = langs[currentLangKey][key];
        return accumulator;
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

  // Transform
  const headRow = Object.keys(langs).reduce((accumulator, currentLangKey) => {
    accumulator.push(currentLangKey);
    return accumulator;
  }, ['category', 'key']);
  const allRows = langMatrix.map((langData) => {
    return Object.keys(langData).reduce((accumulator, currentValue) => {
      accumulator.push(langData[currentValue]);
      return accumulator;
    }, []);
  });
  allRows.unshift(headRow);

  // Get File Type
  const outputFilenames = outputFilename.split('.');
  const fileType = outputFilenames[outputFilenames.length - 1];

  if (fileType === 'csv') {
    // Format To CSV and Save
    const csvString = await formatToCSV(allRows);
    await fse.writeFile(outputFilename, csvString, 'utf8');
  } else if (fileType === 'xlsx') {
    // Format to xlsx and Save
    const worksheet = XLSX.utils.aoa_to_sheet(allRows);
    const workbook = {
      SheetNames: ['sheet1'],
      Sheets: {
        'sheet1': worksheet,
      },
    };
    XLSX.writeFile(workbook, outputFilename);
  } else {
    throw new Error(`Unknown File type: ${outputFilename}`);
  }

  console.log('Success!');
};

mainFunction();
