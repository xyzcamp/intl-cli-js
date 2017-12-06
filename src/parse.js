
import readline from 'readline';
import fse from 'fs-extra';
import { flattenDeep } from 'lodash';
import csvParse from 'csv-parse';
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

const parseToCSV = (input) => (
  new Promise((resolve) => {
    csvParse(input, {}, (_, output) => resolve(output))
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
    const inputInputFilename = await askQuestion('Enter your input message filename: (./output-messages.xlsx) ');
    inputFilename = inputInputFilename ? inputInputFilename : './output-messages.xlsx';

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

  // Get File Type
  const inputFilenames = inputFilename.split('.');
  const fileType = inputFilenames[inputFilenames.length - 1];

  // Read Message File
  let allLangKeys;
  let langMatrix;
  if (fileType === 'csv') {
    // Parse CSV
    const data = await fse.readFile(inputFilename, 'utf8');
    const rows = await parseToCSV(data);
    const headList = rows.shift();

    // Get All lang keys
    const [
      category,
      key,
      ...allKeys
    ] = headList;
    allLangKeys = allKeys;

    // Parse to Language Matrix
    langMatrix = rows.map((row) => {
      const data = row.reduce((accumulator, currentData, currentIndex) => {
        const headKey = headList[currentIndex];
        accumulator[headKey] = currentData.length ? currentData : null;
        return accumulator;
      }, {});

      return data;
    });
  } else if (fileType === 'xlsx') {
    const workbook = XLSX.readFile(inputFilename);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    allLangKeys = Object.keys(worksheet)
      .filter(key => {
        const matches = key.match(/[A-Z]+(\d+)/);

        if (matches) {
          return matches[1] === '1';
        }

        return false;
      })
      .map(key => worksheet[key].v)
      .filter(langKey => (langKey !== 'category' && langKey !== 'key'));

    langMatrix = XLSX.utils.sheet_to_json(worksheet);
  } else {
    throw new Error(`Unknown File type: ${inputFilename}`);
  }

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
        }, {})

      if (Object.keys(langData).length > 0) {
        const unflattenLangData = Object.keys(langData).reduce((accumulator, currentKey) => {
          const value = langData[currentKey];
          const keys = currentKey.split('.');
          const lastKeyIndex = keys.length - 1;

          const appendKeyValue = (carry, keys, index) => {
            const key = keys[index];
            if (index === lastKeyIndex) {
              if (carry[key]) {
                throw new Error(`Conflict Key Error: ${currentKey} in ${category}`);
              }

              carry[key] = value;
            } else if (!carry[key]) {
              carry[key] = appendKeyValue({}, keys, index + 1);
            } else {
              carry[key] = appendKeyValue(carry[key], keys, index + 1);
            }

            return carry;
          }

          return appendKeyValue(accumulator, keys, 0);
        }, {});

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

    const existCategoryKeys = allCategories.filter(categoryKey => categoryKeys.indexOf(categoryKey) !== -1);

    const outputArray = [];
    existCategoryKeys.forEach(key => {
      outputArray.push(`import ${key} from './${key}';`);
    });
    outputArray.push('');

    outputArray.push('export default {');
    existCategoryKeys.forEach(key => {
      outputArray.push(`  ${key},`);
    });
    outputArray.push('};');

    const ouputData = outputArray.join('\n');

    return fse.writeFile(`${langPath}/index.js`, ouputData, 'utf8');
  }));

  console.log('Success!');
})();
