const fs = require("fs");
const inquirerTablePrompt = require("inquirer-table-prompt");
const mkdirp = require("mkdirp");
const path = require("path");
const pkg = require("./package.json");
const slugify = require("@sindresorhus/slugify");
const { getSetupForData, getSetupForPage } = require("./lib/setup");
const {
  writeFrontmatterMarkdown,
  writeJSON,
  writeYAML
} = require("./lib/file-writers");

const FILE_WRITERS = {
  "frontmatter-md": writeFrontmatterMarkdown,
  json: writeJSON,
  yml: writeYAML
};

let fileCache = [];

module.exports.name = pkg.name;

module.exports.transform = ({ data, log, options }) => {
  if (typeof options.writeFile !== "function") {
    return data;
  }

  const utils = {
    slugify
  };
  const files = {};

  data.objects.forEach(object => {
    const writer = options.writeFile(object, utils);

    if (!writer || !writer.path || !FILE_WRITERS[writer.format]) {
      return;
    }

    const fullPath = path.resolve(process.cwd(), writer.path);

    // If `append: true`, we'll append the content of the new writer to any
    // existing content at this path. If not, we'll overwrite it.
    if (files[fullPath] && writer.append) {
      // Ensuring the existing content for this path is an array.
      files[fullPath].content = Array.isArray(files[fullPath].content)
        ? files[fullPath].content
        : [files[fullPath].content];
      files[fullPath].content.push(writer.content);
    } else {
      files[fullPath] = writer;
    }
  });

  // We start by deleting any files that were previously created by this plugin
  // but that are not part of the site after the update.
  fileCache.forEach(filePath => {
    if (!files[filePath]) {
      try {
        fs.unlinkSync(filePath);

        log(`Deleted file: ${filePath}`);
      } catch (_) {
        log(`Could not delete file: ${filePath}`);
      }
    }
  });

  fileCache = Object.keys(files);

  // Now we write all the files that need to be created.
  Object.keys(files).forEach(filePath => {
    const file = files[filePath];
    const writerFunction = FILE_WRITERS[file.format];

    // Ensuring the directory exists.
    mkdirp.sync(path.dirname(filePath));

    try {
      writerFunction(filePath, file.content);

      log(`Created file: ${filePath}`);
    } catch (_) {
      log(`Could not create file: ${filePath}`);
    }
  });
};

module.exports.getOptionsFromSetup = ({ answers }) => {
  const { data: dataObjects = [], pages = [] } = answers;
  const conditions = [];

  pages.forEach(page => {
    const { modelName, projectId, source } = page.__model;

    let location = "";

    if (page.location.fileName) {
      location = `'${page.location.fileName}'`;
    } else {
      const { directory, fileNameField, useDate } = page.location;
      const locationParts = [];

      if (directory) {
        locationParts.push(`'${directory}/'`);
      }

      if (useDate) {
        locationParts.push(`createdAt.substring(0, 10) + '-'`);
      }

      locationParts.push(`utils.slugify(fields['${fileNameField}']) + '.md'`);
      location = locationParts.join(" + ");
    }

    const contentField = page.contentField
      ? `fields['${page.contentField}']`
      : "{}";
    const layout =
      page.layoutSource === "static"
        ? `'${page.layout}'`
        : `fields['${page.layout}']`;
    const extractedProperties = [
      "__metadata",
      page.contentField ? `'${page.contentField}': content` : null,
      page.layoutSource ? "layout" : null,
      "...frontmatterFields"
    ];

    conditions.push(
      `if (modelName === '${modelName}' && projectId === '${projectId}' && source === '${source}') {`,
      `  const { ${extractedProperties.filter(Boolean).join(", ")} } = entry;`,
      ``,
      `  return {`,
      `    content: {`,
      `      body: ${contentField},`,
      `      frontmatter: ${
        page.layoutSource
          ? `{ ...frontmatterFields, layout: ${layout} }`
          : "frontmatterFields"
      },`,
      `    },`,
      `    format: 'frontmatter-md',`,
      `    path: ${location}`,
      `  };`,
      `}\n`
    );
  });

  dataObjects.forEach(dataObject => {
    const { modelName, projectId, source } = dataObject.__model;
    const { format, isMultiple } = dataObject;
    const location = dataObject.location.fileName
      ? `'${dataObject.location.fileName}'`
      : `fields['${dataObject.location.fileNameField}']`;

    conditions.push(
      `if (modelName === '${modelName}' && projectId === '${projectId}' && source === '${source}') {`,
      `  const { __metadata, ...fields } = entry;`,
      ``,
      `  return {`,
      `    append: ${isMultiple},`,
      `    content: fields,`,
      `    format: '${format}',`,
      `    path: ${location}`,
      `  };`,
      `}\n`
    );
  });

  const functionBody = `
// This function is invoked for each entry and its return value determines
// whether the entry will be written to a file. When an object with \`content\`,
// \`format\` and \`path\` properties is returned, a file will be written with
// those parameters. If a falsy value is returned, no file will be created.
const { __metadata: meta, ...fields } = entry;

if (!meta) return;

const { createdAt = '', modelName, projectId, source } = meta;

${conditions.join("\n")}
  `.trim();

  return {
    writeFile: new Function("entry", "utils", functionBody)
  };
};

module.exports.getSetup = ({ chalk, data, inquirer }) => {
  inquirer.registerPrompt("table", inquirerTablePrompt);

  return async () => {
    const { models: modelTypes } = await inquirer.prompt([
      {
        type: "table",
        name: "models",
        message: "Choose a type for each of the following models:",
        rows: data.models.map((model, index) => ({
          name: `${model.modelLabel || model.modelName} ${chalk.green(
            `(${model.source} / ${model.projectId})`
          )}`,
          value: index
        })),
        columns: [
          {
            name: "Page",
            value: "page"
          },
          {
            name: "Data",
            value: "data"
          },
          {
            name: "Skip",
            value: undefined
          }
        ]
      }
    ]);
    const dataModels = [];
    const pageModels = [];

    modelTypes.forEach((type, index) => {
      if (type === "data") {
        dataModels.push(data.models[index]);
      } else if (type === "page") {
        pageModels.push(data.models[index]);
      }
    });

    let queue = Promise.resolve({ data: [], pages: [] });

    pageModels.forEach((model, index) => {
      queue = queue.then(async setupData => {
        console.log(
          `\nConfiguring page: ${chalk.bold(
            model.modelLabel || model.modelName
          )} ${chalk.reset.italic.green(
            `(${index + 1} of ${pageModels.length}`
          )})`
        );

        return getSetupForPage({ chalk, data, inquirer, model, setupData });
      });
    });

    dataModels.forEach((model, index) => {
      queue = queue.then(async setupData => {
        console.log(
          `\nConfiguring data object: ${chalk.bold(
            model.modelLabel || model.modelName
          )} ${chalk.reset.italic.green(
            `(${index + 1} of ${dataModels.length}`
          )})`
        );

        return getSetupForData({ chalk, data, inquirer, model, setupData });
      });
    });

    return queue;
  };
};
